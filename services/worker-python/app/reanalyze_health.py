"""Re-run the current NLP pipeline for already stored health events.

This command never fetches source URLs again. It reads the text already stored
in ``disease_events`` and writes the latest WHO/location/outbreak result back
to the same event row. A failed row is rolled back and the remaining rows can
continue, which makes the command safe to resume.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import os
import sys
import time

import psycopg
import requests
from psycopg.rows import dict_row


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("reanalyze-health")

DATABASE_URL = os.getenv("DATABASE_URL", "postgres://postgres:root@host.docker.internal:9898/disease_ai")
NLP_SERVICE_URL = os.getenv("NLP_SERVICE_URL", "http://localhost:8000").rstrip("/")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Maksimum jumlah event; 0 berarti semua event health.",
    )
    parser.add_argument(
        "--offset",
        type=int,
        default=0,
        help="Lewati N event pertama berdasarkan created_at/id.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=int(os.getenv("REANALYZE_BATCH_SIZE", "100")),
        help="Jumlah event yang diambil per batch.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Analisis dan tampilkan perubahan tanpa UPDATE database.",
    )
    parser.add_argument(
        "--stop-on-error",
        action="store_true",
        help="Hentikan proses pada event pertama yang gagal.",
    )
    parser.add_argument(
        "--skip-who-sync", action="store_true",
        help="Lewati resolusi UNKNOWN ke WHO ICD-11 sebelum re-analysis.",
    )
    parser.add_argument(
        "--who-limit", type=int, default=500,
        help="Maksimum report UNKNOWN yang dicoba resolusi ke WHO.",
    )
    return parser.parse_args()


def iso_date(value: dt.date | None) -> str:
    return value.isoformat() if value else ""


def call_nlp(row: dict) -> dict:
    response = requests.post(
        f"{NLP_SERVICE_URL}/nlp/analyze",
        json={
            "text": row["original_text"] or "",
            "source_type": row["source_type"] or "web",
            "source_name": row["source_name"] or "",
            "published_at": iso_date(row["published_at"]),
            "source_language": row["language"] or "",
            # Full re-analysis is intentional, including historical rows.
            "historical_fast": False,
        },
        timeout=180,
    )
    response.raise_for_status()
    return response.json()


def wait_for_nlp(max_seconds: int = 180) -> None:
    """Do not race the NLP container during a cold model startup."""
    deadline = time.monotonic() + max_seconds
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            response = requests.get(f"{NLP_SERVICE_URL}/health", timeout=5)
            if response.ok:
                return
        except requests.RequestException as exc:
            last_error = exc
        time.sleep(2)
    raise RuntimeError(f"NLP service belum siap setelah {max_seconds} detik: {last_error}")


def update_event(conn: psycopg.Connection, row: dict, result: dict) -> None:
    conn.execute(
        """
        UPDATE disease_events
        SET language = %s,
            location_name = %s,
            geom = CASE WHEN %s::float8 IS NULL OR %s::float8 IS NULL THEN NULL
                        ELSE ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                   END,
            symptoms = %s::jsonb,
            disease_extracted = %s::jsonb,
            disease_classification = %s,
            case_count = %s,
            death_count = %s,
            confidence = %s,
            outbreak_alert = %s,
            sentiment = %s,
            needs_review = %s,
            event_type = %s,
            event_confidence = %s,
            relevance_score = %s,
            relevance_confidence = %s,
            source_credibility = %s,
            source_credibility_label = %s,
            is_health_related = %s
        WHERE id = %s
        """,
        (
            result.get("language") or row["language"] or "unknown",
            result.get("location_name"),
            result.get("longitude"),
            result.get("latitude"),
            result.get("longitude"),
            result.get("latitude"),
            json.dumps(result.get("symptoms", []), ensure_ascii=False),
            json.dumps(result.get("disease_extracted", []), ensure_ascii=False),
            result.get("disease_classification") or "UNKNOWN",
            result.get("case_count", 0),
            result.get("death_count", 0),
            result.get("confidence", 0.0),
            result.get("outbreak_alert", False),
            result.get("sentiment"),
            result.get("needs_review", False),
            result.get("event_type"),
            result.get("event_confidence", 0.0),
            result.get("relevance_score"),
            result.get("relevance_confidence", 0.0),
            result.get("source_credibility", 0.50),
            result.get("source_credibility_label") or row["source_type"] or "web",
            result.get("is_health_related", False),
            row["id"],
        ),
    )
    conn.execute(
        "UPDATE raw_reports SET processing_status = %s WHERE id = %s",
        ("PROCESSED" if result.get("is_health_related", False) else "NON_HEALTH", row["raw_report_id"]),
    )


def main() -> int:
    args = parse_args()
    if args.limit < 0 or args.offset < 0 or args.batch_size < 1 or args.who_limit < 0:
        raise SystemExit("--limit/--offset/--who-limit harus >= 0 dan --batch-size harus >= 1")

    total = processed = failed = 0
    last_created_at = None
    last_id = None

    wait_for_nlp()
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        if not args.skip_who_sync:
            try:
                from .sync_who_unknowns import sync_unknown_concepts
                resolved = sync_unknown_concepts(
                    conn,
                    limit=args.who_limit,
                    include_health=True,
                    dry_run=args.dry_run,
                )
                if resolved and not args.dry_run:
                    reload_response = requests.post(f"{NLP_SERVICE_URL}/reload", timeout=30)
                    reload_response.raise_for_status()
                    logger.info("Reloaded NLP runtime after WHO sync (%d concepts)", resolved)
            except Exception as exc:
                logger.warning("WHO sync before re-analysis skipped: %s", exc)
                if args.stop_on_error:
                    return 1
        count_row = conn.execute(
            "SELECT COUNT(*) AS count FROM disease_events WHERE is_health_related IS TRUE"
        ).fetchone()
        eligible = int(count_row["count"])
        logger.info("Eligible health events: %d", eligible)

        skipped = args.offset
        while True:
            query = """
                SELECT id, raw_report_id, original_text, language,
                       source_type, source_name, published_at, created_at
                FROM disease_events
                WHERE is_health_related IS TRUE
            """
            params: list[object] = []
            if last_created_at is not None:
                query += " AND (created_at, id) > (%s, %s)"
                params.extend([last_created_at, last_id])
            query += " ORDER BY created_at, id LIMIT %s"
            params.append(args.batch_size)
            rows = conn.execute(query, params).fetchall()
            if not rows:
                break

            for row in rows:
                last_created_at = row["created_at"]
                last_id = row["id"]
                if skipped:
                    skipped -= 1
                    continue
                if args.limit and total >= args.limit:
                    break
                total += 1
                try:
                    result = call_nlp(row)
                    if args.dry_run:
                        logger.info(
                            "DRY id=%s disease=%s cases=%s alert=%s health=%s",
                            row["id"], result.get("disease_classification"),
                            result.get("case_count"), result.get("outbreak_alert"),
                            result.get("is_health_related"),
                        )
                    else:
                        with conn.transaction():
                            update_event(conn, row, result)
                    processed += 1
                    if processed % 25 == 0:
                        logger.info("Progress: %d/%d", processed, eligible)
                except Exception as exc:
                    failed += 1
                    logger.exception("Failed event id=%s: %s", row["id"], exc)
                    if args.stop_on_error:
                        return 1

            if args.limit and total >= args.limit:
                break

    logger.info(
        "Re-analysis complete: processed=%d failed=%d dry_run=%s",
        processed, failed, args.dry_run,
    )
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
