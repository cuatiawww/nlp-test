#!/usr/bin/env python3
"""Stream labelled examples from PostgreSQL into a bounded JSONL dataset.

The exporter scans millions of rows while keeping only a configurable
reservoir per label, making it suitable for Colab Pro and monthly retraining.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
from collections import defaultdict
from pathlib import Path

import psycopg
from psycopg.rows import dict_row


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", default=os.getenv("TRAINING_DATA_DIR", "training/export"))
    parser.add_argument("--max-per-label", type=int, default=int(os.getenv("TRAINING_MAX_PER_LABEL", "100000")))
    parser.add_argument("--min-confidence", type=float, default=float(os.getenv("TRAINING_MIN_CONFIDENCE", "0.90")))
    parser.add_argument("--test-ratio", type=float, default=0.10)
    parser.add_argument("--seed", type=int, default=20260819)
    parser.add_argument("--include-unknown", action="store_true")
    parser.add_argument("--all-years", action="store_true", help="Export every available publication year (default)")
    parser.add_argument("--year", type=int, default=None, help="Optional publication year filter; omit for all years")
    parser.add_argument("--database-url", default=os.getenv("TRAINING_DATABASE_URL") or os.getenv("DATABASE_URL"))
    return parser.parse_args()


def reservoir_add(bucket: list[dict], row: dict, seen: int, limit: int, rng: random.Random) -> None:
    if len(bucket) < limit:
        bucket.append(row)
        return
    index = rng.randrange(seen)
    if index < limit:
        bucket[index] = row


def load_rows(args: argparse.Namespace) -> tuple[dict[str, list[dict]], str]:
    if not args.database_url:
        raise SystemExit("DATABASE_URL atau TRAINING_DATABASE_URL wajib diisi")

    conn = psycopg.connect(args.database_url, row_factory=dict_row)
    try:
        source = "nlp_training_examples"
        buckets: dict[str, list[dict]] = defaultdict(list)
        seen: defaultdict[str, int] = defaultdict(int)
        rng = random.Random(args.seed)

        def consume(cursor) -> None:
            for row in cursor:
                label = (row.get("disease") or "").strip()
                if not label or (not args.include_unknown and label.upper() in {"UNKNOWN", "NEGATIVE"}):
                    continue
                text = " ".join((row.get("original_text") or "").split())
                if len(text) <= 30:
                    continue
                item = {
                    "text": text[:4000],
                    "disease": label,
                    "language": row.get("language") or "unknown",
                    "event_type": row.get("event_type") or "unknown",
                    "relevance_score": row.get("relevance_score") or "low",
                    "is_health_related": row.get("is_health_related"),
                    "confidence": float(row.get("confidence") or 0),
                    "published_at": str(row.get("published_at") or ""),
                }
                if row.get("source") == "human_corrected" or float(row.get("confidence") or 0.0) >= 0.999:
                    # Always preserve human corrections in training set!
                    buckets[label].append(item)
                else:
                    seen[label] += 1
                    reservoir_add(buckets[label], item, seen[label], args.max_per_label, rng)

        year_clause = "" if args.year is None else " AND EXTRACT(YEAR FROM r.published_at) = %s\n"
        query = f"""
            SELECT text AS original_text, disease_label AS disease,
                   language, event_type, relevance_score, is_health_related,
                   confidence, r.published_at
            FROM nlp_training_examples
            LEFT JOIN raw_reports r ON r.id = nlp_training_examples.raw_report_id
            WHERE text IS NOT NULL AND LENGTH(text) > 30
              AND COALESCE(confidence, 0) >= %s
            {year_clause}
            ORDER BY nlp_training_examples.created_at DESC
        """
        params = (args.min_confidence,) if args.year is None else (args.min_confidence, args.year)
        try:
            cursor = conn.cursor(name="training_export", row_factory=dict_row)
            cursor.execute(query, params)
        except psycopg.errors.UndefinedTable:
            conn.rollback()
            source = "disease_events"
            cursor = conn.cursor(name="event_export", row_factory=dict_row)
            event_query = """
                SELECT r.original_text, COALESCE(e.disease_classification, 'UNKNOWN') AS disease,
                       e.language, e.event_type, e.relevance_score, e.is_health_related,
                       COALESCE(e.confidence, 0) AS confidence, r.published_at
                FROM raw_reports r
                JOIN disease_events e ON e.raw_report_id = r.id
                WHERE r.original_text IS NOT NULL AND LENGTH(r.original_text) > 30
                  AND COALESCE(e.confidence, 0) >= %s
                  {year_clause}
                ORDER BY r.created_at DESC
                """
            cursor.execute(event_query, params)

        consume(cursor)
        cursor.close()
        if not buckets and source == "nlp_training_examples":
            # Migration 021 may exist before its backfill has run. Start from
            # already processed events rather than silently reporting no data.
            source = "disease_events_fallback"
            cursor = conn.cursor(name="event_export_fallback", row_factory=dict_row)
            event_query = """
                SELECT r.original_text, COALESCE(e.disease_classification, 'UNKNOWN') AS disease,
                       e.language, e.event_type, e.relevance_score, e.is_health_related,
                       COALESCE(e.confidence, 0) AS confidence, r.published_at
                FROM raw_reports r
                JOIN disease_events e ON e.raw_report_id = r.id
                WHERE r.original_text IS NOT NULL AND LENGTH(r.original_text) > 30
                  AND COALESCE(e.confidence, 0) >= %s
                  {year_clause}
                ORDER BY r.created_at DESC
                """
            cursor.execute(event_query, params)
            consume(cursor)
            cursor.close()
        return buckets, source
    finally:
        conn.close()


def stable_test_split(item: dict, ratio: float) -> bool:
    key = "|".join([item["text"], item["language"], item["disease"]])
    value = int(hashlib.sha256(key.encode("utf-8")).hexdigest()[:8], 16) / 0xFFFFFFFF
    return value < ratio


def save_jsonl(rows: list[dict], path: Path) -> None:
    with path.open("w", encoding="utf-8") as output:
        for row in rows:
            output.write(json.dumps(row, ensure_ascii=False) + "\n")


def main() -> None:
    args = arguments()
    if args.max_per_label < 1:
        raise SystemExit("--max-per-label harus >= 1")
    if args.all_years and args.year is not None:
        raise SystemExit("Gunakan --all-years atau --year, bukan keduanya")
    buckets, source = load_rows(args)
    selected = [row for label in sorted(buckets) for row in buckets[label]]
    if not selected:
        raise SystemExit("Tidak ada data berlabel dengan confidence yang memenuhi filter")

    train = [row for row in selected if not stable_test_split(row, args.test_ratio)]
    test = [row for row in selected if stable_test_split(row, args.test_ratio)]
    if not test:
        test = train[-1:]
        train = train[:-1]

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    save_jsonl(train, output_dir / "train.jsonl")
    save_jsonl(test, output_dir / "test.jsonl")

    distribution = {label: len(rows) for label, rows in sorted(buckets.items())}
    manifest = {
        "source": source,
        "min_confidence": args.min_confidence,
        "max_per_label": args.max_per_label,
        "year_filter": args.year if args.year is not None else "all",
        "train_samples": len(train),
        "eval_samples": len(test),
        "labels": distribution,
        "published_years": sorted({row["published_at"][:4] for row in selected if row.get("published_at")}),
    }
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    print(json.dumps(manifest, indent=2, ensure_ascii=False))
    print(f"Train: {output_dir / 'train.jsonl'}")
    print(f"Eval:  {output_dir / 'test.jsonl'}")


if __name__ == "__main__":
    main()
