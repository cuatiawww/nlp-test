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
from requests.adapters import HTTPAdapter
from urllib3.util import Retry

from .kpi import mark_kpi_snapshots_stale


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
        help="Kompatibilitas CLI lama; tidak ada sinkronisasi katalog eksternal.",
    )
    parser.add_argument(
        "--who-limit", type=int, default=500,
        help="Maksimum report UNKNOWN yang dicoba resolusi ke WHO.",
    )
    parser.add_argument(
        "--run-id",
        default="",
        help="ID reanalysis_runs dari maintenance start; membatasi pekerjaan pada snapshot.",
    )
    return parser.parse_args()


def iso_date(value: dt.date | None) -> str:
    return value.isoformat() if value else ""


def get_nlp_session() -> requests.Session:
    session = requests.Session()
    retries = Retry(
        total=5,
        backoff_factor=1.5,
        status_forcelist=[500, 502, 503, 504],
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retries, pool_connections=10, pool_maxsize=20)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session

NLP_SESSION = get_nlp_session()


def wait_for_nlp(max_seconds: int = 180) -> None:
    """Do not race the NLP container during a cold model startup."""
    deadline = time.monotonic() + max_seconds
    last_error: Exception | None = None
    logger.info("Memeriksa kesiapan NLP service di %s...", NLP_SERVICE_URL)
    while time.monotonic() < deadline:
        try:
            response = requests.get(f"{NLP_SERVICE_URL}/health", timeout=5)
            if response.ok:
                logger.info("NLP service siap dan aktif.")
                return
        except requests.RequestException as exc:
            last_error = exc
        time.sleep(3)
    raise RuntimeError(
        f"NLP service belum siap setelah {max_seconds} detik di '{NLP_SERVICE_URL}'. "
        f"Periksa status container: docker ps / docker logs --tail 50 disease-nlp-python. "
        f"Error: {last_error}"
    )


def call_nlp(row: dict, max_recovery_attempts: int = 2) -> dict:
    for attempt in range(max_recovery_attempts + 1):
        try:
            response = NLP_SESSION.post(
                f"{NLP_SERVICE_URL}/nlp/analyze/raw",
                json={
                    "text": row["original_text"] or "",
                    "source_type": row["source_type"] or "web",
                    "source_name": row["source_name"] or "",
                    "published_at": iso_date(row["published_at"]),
                    "source_language": row["language"] or "",
                    "source_country": row.get("source_country") or "",
                    # Full re-analysis is intentional, including historical rows.
                    "historical_fast": False,
                },
                timeout=180,
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as exc:
            err_detail = ""
            try:
                err_json = response.json()
                err_detail = err_json.get("detail", response.text[:300])
            except Exception:
                err_detail = response.text[:300]
            logger.error("NLP service HTTP %s on event id=%s: %s", response.status_code, row.get("id"), err_detail)
            raise RuntimeError(f"NLP service HTTP {response.status_code} on event {row.get('id')}: {err_detail}") from exc
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as exc:
            if attempt < max_recovery_attempts:
                logger.warning(
                    "Koneksi ke NLP terputus (%s). Menunggu service NLP bangkit kembali (attempt %d/%d)...",
                    exc, attempt + 1, max_recovery_attempts
                )
                wait_for_nlp(max_seconds=120)
                continue
            raise RuntimeError(
                f"Gagal menghubungi service NLP di '{NLP_SERVICE_URL}'. "
                f"Pastikan container 'disease-nlp-python' aktif (docker ps / docker logs disease-nlp-python). Error: {exc}"
            ) from exc


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
            disease_mentions = %s::jsonb,
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
            is_health_related = %s,
            source_country = %s,
            country_iso3 = %s,
            admin1_name = %s,
            admin2_name = %s,
            nlp_pipeline_version = %s,
            count_period_type = %s,
            event_date_start = %s,
            event_date_end = %s,
            epistemic_status = %s,
            validation_flags = %s::jsonb
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
            json.dumps(result.get("disease_mentions", []), ensure_ascii=False),
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
            result.get("country") or row.get("source_country"),
            result.get("country_iso3"),
            result.get("admin1_name") or result.get("province"),
            result.get("admin2_name") or result.get("city"),
            result.get("nlp_pipeline_version"),
            result.get("count_period_type"),
            result.get("event_date_start"),
            result.get("event_date_end"),
            result.get("epistemic_status"),
            json.dumps(result.get("validation_flags", []), ensure_ascii=False),
            row["id"],
        ),
    )
    # Partial unique indexes on raw_reports (088) exclude DUPLICATE rows.
    # Flipping DUPLICATE -> PROCESSED/NON_HEALTH (or colliding live siblings)
    # raises uq_raw_reports_*_identity. Keep disease_events update; skip status.
    if not row.get("raw_report_id"):
        return
    new_status = "PROCESSED" if result.get("is_health_related", False) else "NON_HEALTH"
    from psycopg.errors import UniqueViolation
    try:
        with conn.transaction():
            conn.execute(
                """
                UPDATE raw_reports rr
                SET processing_status = %s
                WHERE rr.id = %s
                  AND rr.processing_status IS DISTINCT FROM 'DUPLICATE'
                  AND NOT EXISTS (
                    SELECT 1
                    FROM raw_reports other
                    WHERE other.id IS DISTINCT FROM rr.id
                      AND other.processing_status IS DISTINCT FROM 'DUPLICATE'
                      AND (
                        (NULLIF(BTRIM(other.url), '') IS NOT NULL
                         AND other.url IS NOT DISTINCT FROM rr.url)
                        OR (NULLIF(BTRIM(other.normalized_url), '') IS NOT NULL
                         AND other.normalized_url IS NOT DISTINCT FROM rr.normalized_url)
                        OR (NULLIF(BTRIM(other.canonical_url), '') IS NOT NULL
                         AND other.canonical_url IS NOT DISTINCT FROM rr.canonical_url)
                        OR (NULLIF(BTRIM(other.final_url), '') IS NOT NULL
                         AND other.final_url IS NOT DISTINCT FROM rr.final_url)
                        OR (NULLIF(BTRIM(other.url_hash), '') IS NOT NULL
                         AND other.url_hash IS NOT DISTINCT FROM rr.url_hash)
                        OR (NULLIF(BTRIM(other.content_hash), '') IS NOT NULL
                         AND other.content_hash IS NOT DISTINCT FROM rr.content_hash)
                      )
                  )
                """,
                (new_status, row["raw_report_id"]),
            )
    except UniqueViolation:
        logger.warning(
            "Skip raw_reports status update for raw_id=%s (identity collision)",
            row["raw_report_id"],
        )


def update_run_progress(conn, run_id, row, *, processed=0, failed=0, error=None):
    if not run_id:
        return
    conn.execute(
        """
        UPDATE reanalysis_runs
           SET processed_items=processed_items+%s,
               failed_items=failed_items+%s,
               last_created_at=%s,
               last_event_id=%s,
               error=COALESCE(%s, error),
               updated_at=NOW()
         WHERE id=%s
        """,
        (processed, failed, row.get("created_at"), row.get("id"), error, run_id),
    )


def main() -> int:
    args = parse_args()
    if args.limit < 0 or args.offset < 0 or args.batch_size < 1:
        raise SystemExit("--limit/--offset harus >= 0 dan --batch-size harus >= 1")

    total = processed = failed = 0
    last_created_at = None
    last_id = None

    wait_for_nlp()
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        snapshot_at = None
        if args.run_id:
            run = conn.execute(
                "SELECT snapshot_at, status FROM reanalysis_runs WHERE id=%s",
                (args.run_id,),
            ).fetchone()
            if not run:
                raise SystemExit(f"Unknown reanalysis run: {args.run_id}")
            if run["status"] not in {"created", "running"}:
                raise SystemExit(f"Reanalysis run is not runnable: {run['status']}")
            state = conn.execute(
                "SELECT mode FROM pipeline_control WHERE id=1"
            ).fetchone()
            if not state or str(state["mode"]).upper() != "REANALYZING":
                raise SystemExit("Pipeline must remain in REANALYZING mode during the run")
            snapshot_at = run["snapshot_at"]
            conn.execute(
                "UPDATE reanalysis_runs SET status='running', started_at=COALESCE(started_at,NOW()), updated_at=NOW() WHERE id=%s",
                (args.run_id,),
            )
            conn.commit()
        count_row = conn.execute(
            "SELECT COUNT(*) AS count FROM disease_events WHERE is_health_related IS TRUE"
            + (" AND created_at <= %s" if snapshot_at is not None else ""),
            (snapshot_at.replace(tzinfo=None) if snapshot_at and snapshot_at.tzinfo else snapshot_at,)
            if snapshot_at is not None else (),
        ).fetchone()
        eligible = int(count_row["count"])
        logger.info("Eligible health events: %d", eligible)

        skipped = args.offset
        while True:
            query = """
                SELECT id, raw_report_id, original_text, language,
                       source_type, source_name, published_at, created_at, source_country
                FROM disease_events
                WHERE is_health_related IS TRUE
            """
            params: list[object] = []
            if snapshot_at is not None:
                query += " AND created_at <= %s"
                params.append(snapshot_at.replace(tzinfo=None) if snapshot_at.tzinfo else snapshot_at)
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
                            mark_kpi_snapshots_stale(conn)
                            update_run_progress(conn, args.run_id, row, processed=1)
                    processed += 1
                    logger.info(
                        "Progress [%d/%d] id=%s -> %s (cases=%s, alert=%s)",
                        processed, eligible, row["id"],
                        result.get("disease_classification"),
                        result.get("case_count"),
                        result.get("outbreak_alert"),
                    )
                except Exception as exc:
                    failed += 1
                    logger.exception("Failed event id=%s: %s", row["id"], exc)
                    update_run_progress(conn, args.run_id, row, failed=1, error=str(exc)[:500])
                    conn.commit()
                    if args.stop_on_error:
                        if args.run_id:
                            conn.execute(
                                "UPDATE reanalysis_runs SET status='failed', finished_at=NOW(), updated_at=NOW() WHERE id=%s",
                                (args.run_id,),
                            )
                            conn.commit()
                        return 1

            if args.limit and total >= args.limit:
                break

    if args.run_id:
        with psycopg.connect(DATABASE_URL, row_factory=dict_row) as final_conn:
            final_status = "completed" if failed == 0 else "failed"
            final_conn.execute(
                "UPDATE reanalysis_runs SET status=%s, finished_at=NOW(), updated_at=NOW() WHERE id=%s",
                (final_status, args.run_id),
            )
            final_conn.commit()
    logger.info(
        "Re-analysis complete: processed=%d failed=%d dry_run=%s",
        processed, failed, args.dry_run,
    )
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
