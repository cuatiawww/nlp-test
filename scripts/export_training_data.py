#!/usr/bin/env python3
"""Export a read-only, deduplicated disease dataset from PostgreSQL.

The exporter prefers the curated ``nlp_training_examples`` table and falls
back to validated ``disease_events`` joined to ``raw_reports`` when the
training table is unavailable or empty.  The output is bounded per label and
is compatible with ``scripts/train_classifier.py``.

This command never INSERTs, UPDATEs, or DELETEs database rows.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import psycopg
from psycopg.rows import dict_row


TRACKING_QUERY_KEYS = {
    "fbclid",
    "gclid",
    "mc_cid",
    "mc_eid",
    "oc",
    "ref",
    "ref_src",
    "utm_campaign",
    "utm_content",
    "utm_medium",
    "utm_name",
    "utm_source",
    "utm_term",
}


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        default=os.getenv("TRAINING_DATA_DIR", "training/export"),
        help="Directory for train.jsonl, test.jsonl, and manifest.json",
    )
    parser.add_argument(
        "--max-per-label",
        type=int,
        default=int(os.getenv("TRAINING_MAX_PER_LABEL", "100000")),
    )
    parser.add_argument(
        "--min-confidence",
        type=float,
        default=float(os.getenv("TRAINING_MIN_CONFIDENCE", "0.90")),
    )
    parser.add_argument(
        "--test-ratio",
        type=float,
        default=0.10,
        help="Deterministic test split ratio; default: 0.10",
    )
    parser.add_argument("--seed", type=int, default=20260819)
    parser.add_argument(
        "--include-unknown",
        action="store_true",
        help="Include UNKNOWN/NEGATIVE labels; normally they are excluded.",
    )
    parser.add_argument(
        "--all-years",
        action="store_true",
        help="Export every available publication year (also the default when --year is omitted).",
    )
    parser.add_argument(
        "--year",
        type=int,
        default=None,
        help="Optional publication year filter; omit it to export all years.",
    )
    parser.add_argument(
        "--database-url",
        default=os.getenv("TRAINING_DATABASE_URL") or os.getenv("DATABASE_URL"),
    )
    return parser.parse_args()


def normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalize_url(value: Any) -> str:
    """Normalize safe URL noise without removing meaningful query parameters."""

    raw = str(value or "").strip()
    if not raw:
        return ""
    try:
        parsed = urlsplit(raw)
        if not parsed.scheme or not parsed.netloc:
            return raw.split("#", 1)[0].rstrip("/")
        hostname = (parsed.hostname or "").lower()
        if not hostname:
            return ""
        port = parsed.port
        default_port = (parsed.scheme.lower() == "http" and port == 80) or (
            parsed.scheme.lower() == "https" and port == 443
        )
        netloc = hostname
        if parsed.username or parsed.password:
            # Credentials should never be part of a training identity.
            netloc = hostname
        elif port and not default_port:
            netloc = f"{hostname}:{port}"
        query_pairs = [
            (key, value)
            for key, value in parse_qsl(parsed.query, keep_blank_values=True)
            if key.lower() not in TRACKING_QUERY_KEYS
            and not key.lower().startswith("utm_")
        ]
        query_pairs.sort()
        path = parsed.path or "/"
        if path != "/":
            path = path.rstrip("/")
        return urlunsplit(
            (parsed.scheme.lower(), netloc, path, urlencode(query_pairs, doseq=True), "")
        )
    except ValueError:
        return raw.split("#", 1)[0].rstrip("/")


def article_key(row: dict[str, Any]) -> str:
    """Return one identity per article, preferring durable database identities."""

    raw_report_id = normalize_text(row.get("raw_report_id"))
    if raw_report_id:
        return f"raw:{raw_report_id}"
    for field in ("canonical_url", "normalized_url", "final_url", "url"):
        value = normalize_url(row.get(field))
        if value:
            return f"url:{value}"
    text = normalize_text(row.get("original_text"))
    if text:
        digest = hashlib.sha256(text.casefold().encode("utf-8")).hexdigest()
        return f"text:{digest}"
    example_hash = normalize_text(row.get("example_hash"))
    return f"example:{example_hash}" if example_hash else ""


def year_clause(year: int | None) -> tuple[str, tuple[Any, ...]]:
    if year is None:
        return "", ()
    return " AND EXTRACT(YEAR FROM published_at) = %s", (year,)


def is_allowed_label(label: str, include_unknown: bool) -> bool:
    if not label:
        return False
    if include_unknown:
        return True
    return label.upper() not in {"UNKNOWN", "NEGATIVE"}


def make_item(row: dict[str, Any], label: str, source: str) -> dict[str, Any]:
    published_at = row.get("published_at")
    return {
        # These two fields are the train_classifier.py contract.
        "text": normalize_text(row.get("original_text"))[:4000],
        "disease": label,
        # The remaining fields are retained for dataset auditability and are
        # ignored by train_classifier.py.
        "language": normalize_text(row.get("language")) or "unknown",
        "event_type": normalize_text(row.get("event_type")) or "unknown",
        "relevance_score": normalize_text(row.get("relevance_score")) or "low",
        "is_health_related": row.get("is_health_related"),
        "confidence": float(row.get("confidence") or 0.0),
        "published_at": str(published_at or ""),
        "url": normalize_url(row.get("canonical_url") or row.get("normalized_url") or row.get("url")),
        "source_name": normalize_text(row.get("source_name")),
        "label_source": normalize_text(row.get("label_source")) or source,
        "raw_report_id": normalize_text(row.get("raw_report_id")),
        "article_key": article_key(row),
    }


def consume_rows(
    rows: Iterable[dict[str, Any]],
    *,
    args: argparse.Namespace,
    source: str,
) -> tuple[dict[str, list[dict[str, Any]]], dict[str, int]]:
    """Filter, deduplicate, and cap labels in deterministic source order."""

    buckets: dict[str, list[dict[str, Any]]] = defaultdict(list)
    seen_articles: set[str] = set()
    stats = {
        "candidate_rows": 0,
        "filtered_rows": 0,
        "duplicate_rows": 0,
        "capped_rows": 0,
        "selected_rows": 0,
    }

    for row in rows:
        label = normalize_text(row.get("disease"))
        text = normalize_text(row.get("original_text"))
        confidence = float(row.get("confidence") or 0.0)
        if not text or not label or not is_allowed_label(label, args.include_unknown):
            stats["filtered_rows"] += 1
            continue
        if len(text) <= 30 or confidence < args.min_confidence:
            stats["filtered_rows"] += 1
            continue

        stats["candidate_rows"] += 1
        key = article_key(row)
        if not key:
            stats["filtered_rows"] += 1
            continue
        if key in seen_articles:
            stats["duplicate_rows"] += 1
            continue
        seen_articles.add(key)

        if len(buckets[label]) >= args.max_per_label:
            stats["capped_rows"] += 1
            continue
        buckets[label].append(make_item(row, label, source))
        stats["selected_rows"] += 1

    return buckets, stats


def load_rows(args: argparse.Namespace) -> tuple[dict[str, list[dict[str, Any]]], str, dict[str, int]]:
    if not args.database_url:
        raise SystemExit("DATABASE_URL atau TRAINING_DATABASE_URL wajib diisi")

    conn = psycopg.connect(args.database_url, row_factory=dict_row)
    try:
        # Protect production even if a future edit accidentally adds a write.
        conn.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")
        suffix, year_params = year_clause(args.year)

        training_query = f"""
            SELECT e.raw_report_id,
                   e.content_hash AS example_hash,
                   e.text AS original_text,
                   e.disease_label AS disease,
                   e.language,
                   e.event_type,
                   e.relevance_score,
                   e.is_health_related,
                   e.confidence,
                   e.source AS label_source,
                   e.created_at,
                   e.updated_at,
                   r.published_at,
                   r.url,
                   r.normalized_url,
                   r.canonical_url,
                   r.final_url,
                   r.source_name
            FROM nlp_training_examples e
            LEFT JOIN raw_reports r ON r.id = e.raw_report_id
            WHERE e.text IS NOT NULL
              AND LENGTH(BTRIM(e.text)) > 30
              AND NULLIF(BTRIM(e.disease_label), '') IS NOT NULL
              AND COALESCE(e.confidence, 0) >= %s
              AND (
                    e.source = 'human_corrected'
                    OR NOT EXISTS (
                        SELECT 1
                        FROM disease_events reviewed
                        WHERE reviewed.raw_report_id = e.raw_report_id
                          AND reviewed.needs_review IS TRUE
                    )
                  )
              {suffix}
            ORDER BY CASE WHEN e.source = 'human_corrected' THEN 0 ELSE 1 END,
                     e.confidence DESC,
                     e.updated_at DESC NULLS LAST,
                     e.id
        """
        params = (args.min_confidence, *year_params)
        try:
            cursor = conn.cursor(name="training_export", row_factory=dict_row)
            cursor.execute(training_query, params)
            buckets, stats = consume_rows(cursor, args=args, source="nlp_training_examples")
            cursor.close()
            if buckets:
                return buckets, "nlp_training_examples", stats
        except psycopg.errors.UndefinedTable:
            conn.rollback()
            # Re-apply the guard after rollback before opening the fallback
            # cursor. This keeps both query paths read-only.
            conn.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")

        fallback_query = f"""
            SELECT e.id AS event_id,
                   e.raw_report_id,
                   r.original_text,
                   COALESCE(e.disease_classification, 'UNKNOWN') AS disease,
                   e.language,
                   e.event_type,
                   e.relevance_score,
                   e.is_health_related,
                   COALESCE(e.confidence, 0) AS confidence,
                   'auto_event' AS label_source,
                   e.created_at,
                   e.created_at AS updated_at,
                   r.published_at,
                   r.url,
                   r.normalized_url,
                   r.canonical_url,
                   r.final_url,
                   r.source_name
            FROM disease_events e
            JOIN raw_reports r ON r.id = e.raw_report_id
            WHERE e.is_health_related IS TRUE
              AND e.needs_review IS NOT TRUE
              AND r.original_text IS NOT NULL
              AND LENGTH(BTRIM(r.original_text)) > 30
              AND NULLIF(BTRIM(COALESCE(e.disease_classification, '')), '') IS NOT NULL
              AND COALESCE(e.confidence, 0) >= %s
              {suffix}
            ORDER BY e.confidence DESC,
                     e.created_at DESC,
                     e.id
        """
        cursor = conn.cursor(name="event_export", row_factory=dict_row)
        cursor.execute(fallback_query, params)
        buckets, stats = consume_rows(cursor, args=args, source="disease_events")
        cursor.close()
        return buckets, "disease_events", stats
    finally:
        conn.close()


def stable_test_split(item: dict[str, Any], ratio: float) -> bool:
    key = "|".join([item["article_key"], item["language"], item["disease"]])
    value = int(hashlib.sha256(key.encode("utf-8")).hexdigest()[:8], 16) / 0xFFFFFFFF
    return value < ratio


def save_jsonl(rows: list[dict[str, Any]], path: Path) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as output:
        for row in rows:
            output.write(json.dumps(row, ensure_ascii=False) + "\n")


def main() -> None:
    args = arguments()
    if args.max_per_label < 1:
        raise SystemExit("--max-per-label harus >= 1")
    if not 0 <= args.min_confidence <= 1:
        raise SystemExit("--min-confidence harus berada di antara 0 dan 1")
    if not 0 < args.test_ratio < 1:
        raise SystemExit("--test-ratio harus berada di antara 0 dan 1")
    if args.all_years and args.year is not None:
        raise SystemExit("Gunakan --all-years atau --year, bukan keduanya")

    buckets, source, stats = load_rows(args)
    selected = [row for label in sorted(buckets) for row in buckets[label]]
    if not selected:
        raise SystemExit("Tidak ada data berlabel dengan confidence yang memenuhi filter")

    train = [row for row in selected if not stable_test_split(row, args.test_ratio)]
    test = [row for row in selected if stable_test_split(row, args.test_ratio)]
    if not test:
        test = train[-1:]
        train = train[:-1]
    if not train and len(test) > 1:
        train = test[:-1]
        test = test[-1:]
    if not train:
        raise SystemExit("Dataset terlalu kecil untuk membuat train.jsonl dan test.jsonl")

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    save_jsonl(train, output_dir / "train.jsonl")
    save_jsonl(test, output_dir / "test.jsonl")

    distribution = {label: len(rows) for label, rows in sorted(buckets.items())}
    published_years = sorted(
        {
            str(row["published_at"])[:4]
            for row in selected
            if str(row.get("published_at") or "")[:4].isdigit()
        }
    )
    manifest = {
        "source": source,
        "read_only": True,
        "label_field": "disease",
        "min_confidence": args.min_confidence,
        "max_per_label": args.max_per_label,
        "year_filter": args.year if args.year is not None else "all",
        "all_years": args.year is None,
        "deduplication": ["raw_report_id", "canonical_url", "normalized_url", "final_url", "url", "content_fingerprint"],
        "approved_policy": "human_corrected or disease_events with needs_review=false",
        "train_samples": len(train),
        "eval_samples": len(test),
        "labels": distribution,
        "published_years": published_years,
        **stats,
    }
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    print(json.dumps(manifest, indent=2, ensure_ascii=False))
    print(f"Train: {output_dir / 'train.jsonl'}")
    print(f"Test:  {output_dir / 'test.jsonl'}")
    print("Database mode: READ ONLY")


if __name__ == "__main__":
    main()
