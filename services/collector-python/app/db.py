import psycopg
import json
import hashlib
import logging
import threading
from datetime import datetime, timedelta, timezone
from psycopg.rows import dict_row
from . import config
from .crawler_identity import content_fingerprint, normalize_url, url_hash
from .schedule_interval import source_interval_minutes

_connection_state = threading.local()
logger = logging.getLogger(__name__)


def is_url_already_processed(url: str) -> bool:
    """Check whether the URL already has a completed NLP record.

    Failed records remain retryable. The worker still performs the final
    deduplication check after a message is published.
    """
    candidate = (url or "").strip()
    if not candidate:
        return False
    try:
        normalized = normalize_url(candidate)
        candidate_hash = url_hash(normalized)
    except ValueError:
        return False

    conn = None
    try:
        conn = get_conn()
        row = conn.execute(
            """SELECT 1 FROM raw_reports
               WHERE processing_status IN ('PROCESSED', 'NON_HEALTH')
                 AND (url = %s OR normalized_url = %s OR canonical_url = %s
                      OR final_url = %s OR url_hash = %s)
               LIMIT 1""",
            (candidate, normalized, normalized, normalized, candidate_hash),
        ).fetchone()
        conn.commit()
        return row is not None
    except Exception:
        # Do not drop a new item because the pre-check had a transient error;
        # the worker remains the authoritative deduplication guard.
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        logger.warning("Could not check processed URL: %s", candidate, exc_info=True)
        return False


def get_conn():
    conn = getattr(_connection_state, "conn", None)
    if conn is None or conn.closed:
        # Avoid blocking collector startup indefinitely when Postgres is
        # restarting or temporarily unreachable. The CSV watcher can still
        # operate without the source registry connection.
        separator = "&" if "?" in config.DATABASE_URL else "?"
        conninfo = f"{config.DATABASE_URL}{separator}connect_timeout=5"
        conn = psycopg.connect(conninfo, row_factory=dict_row, autocommit=True)
        _connection_state.conn = conn
    return conn


def backfill_document_identities(batch_size: int = 500, max_batches: int = 100) -> int:
    """Safely backfill identity columns without deleting or merging old RAW."""
    total = 0
    for _ in range(max_batches):
        conn = get_conn()
        rows = conn.execute(
            """SELECT id, url, original_text, canonical_url, final_url
               FROM raw_reports
               WHERE processing_status IS DISTINCT FROM 'DUPLICATE'
                 AND (content_hash IS NULL OR normalized_url IS NULL OR canonical_url IS NULL
                      OR final_url IS NULL OR url_hash IS NULL)
               ORDER BY created_at, id
               LIMIT %s""",
            (batch_size,),
        ).fetchall()
        # Release the read transaction before computing hashes and issuing the
        # next schema operation. Keeping this SELECT open can hold an
        # ACCESS SHARE lock on raw_reports long enough to block migrations.
        conn.commit()
        if not rows:
            break
        updates = []
        for row in rows:
            normalized = None
            canonical = None
            final = None
            digest = None
            if row.get("url"):
                try:
                    normalized = normalize_url(row["url"])
                    canonical = normalize_url(row.get("canonical_url") or normalized)
                    final = normalize_url(row.get("final_url") or canonical)
                    digest = url_hash(canonical or normalized)
                except ValueError:
                    logger.warning("Historical RAW has an invalid URL: raw_id=%s", row["id"])
            updates.append((
                normalized, canonical, final, digest,
                content_fingerprint(row.get("original_text") or ""), row["id"],
            ))
        for normalized, canonical, final, digest, content, raw_id in updates:
            try:
                conn.execute(
                    """UPDATE raw_reports
                       SET normalized_url=COALESCE(normalized_url,%s),
                           canonical_url=COALESCE(canonical_url,%s),
                           final_url=COALESCE(final_url,%s),
                           url_hash=COALESCE(url_hash,%s),
                           content_hash=COALESCE(content_hash,%s)
                       WHERE id=%s""",
                    (normalized, canonical, final, digest, content, raw_id),
                )
            except psycopg.errors.UniqueViolation:
                conn.rollback()
                conflict = conn.execute(
                    """SELECT id FROM raw_reports
                       WHERE id <> %s
                         AND processing_status IS DISTINCT FROM 'DUPLICATE'
                         AND (
                              (%s::text IS NOT NULL AND normalized_url=%s)
                           OR (%s::text IS NOT NULL AND canonical_url=%s)
                           OR (%s::text IS NOT NULL AND final_url=%s)
                           OR (%s::text IS NOT NULL AND url_hash=%s)
                           OR (%s::text IS NOT NULL AND content_hash=%s)
                         )
                       ORDER BY CASE UPPER(COALESCE(processing_status, ''))
                                  WHEN 'PROCESSED' THEN 0
                                  WHEN 'NON_HEALTH' THEN 1
                                  WHEN 'PROCESSING' THEN 2
                                  WHEN 'NEW' THEN 3
                                  WHEN 'FAILED' THEN 4
                                  ELSE 5
                                END,
                                created_at ASC, id ASC
                       LIMIT 1""",
                    (
                        raw_id, normalized, normalized, canonical, canonical,
                        final, final, digest, digest, content, content,
                    ),
                ).fetchone()
                if conflict:
                    conn.execute(
                        """UPDATE raw_reports
                           SET processing_status='DUPLICATE', duplicate_of_raw_report_id=%s
                         WHERE id=%s""",
                        (conflict["id"], raw_id),
                    )
        conn.commit()
        total += len(rows)
        logger.info("Crawler identity backfill progress: updated=%d", total)
        if len(rows) < batch_size:
            break
    return total


def fetch_sources(source_type=None, enabled_only=True):
    """Load collector_sources.

    Scheduler and ``/collect/all`` keep ``enabled_only=True`` so ABVC catalog
    rows stay off the interval crawler. Manual ``/discover-urls`` passes
    ``enabled_only=False`` to use the stored catalog without flipping enabled.
    """
    conn = get_conn()
    enabled_clause = "WHERE enabled = TRUE"
    if not enabled_only:
        enabled_clause = "WHERE TRUE"
    if source_type:
        cur = conn.execute(
            f"SELECT * FROM collector_sources {enabled_clause} AND source_type = %s ORDER BY name",
            (source_type,),
        )
    else:
        cur = conn.execute(f"SELECT * FROM collector_sources {enabled_clause} ORDER BY name")
    return cur.fetchall()


def fetch_source(source_id: str):
    conn = get_conn()
    cur = conn.execute("SELECT * FROM collector_sources WHERE id = %s", (source_id,))
    return cur.fetchone()


def create_run(source_id: str) -> str:
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO collector_runs (source_id) VALUES (%s) RETURNING id", (source_id,)
    )
    row = cur.fetchone()
    conn.commit()
    return str(row["id"])


def finish_run(run_id: str, status: str, records_found=0, records_ingested=0, error_message=None):
    conn = get_conn()
    conn.execute(
        "UPDATE collector_runs SET status = %s, records_found = %s, records_ingested = %s, "
        "error_message = %s, finished_at = NOW() WHERE id = %s",
        (status, records_found, records_ingested, error_message, run_id),
    )
    conn.commit()


def finalize_stale_runs(max_age_minutes: int = 30) -> int:
    """Close collector runs left open by a process/container restart.

    A collector run is expected to finish well before the next scheduled
    interval. Keeping an old RUNNING row forever makes the live dashboard
    report a false active crawler and inflates active-run statistics.
    """
    conn = get_conn()
    cursor = conn.execute(
        """UPDATE collector_runs
           SET status='FAILED',
               error_message=COALESCE(error_message, 'Collector run closed after stale lease or restart'),
               finished_at=COALESCE(finished_at, NOW())
         WHERE status='RUNNING'
           AND started_at < NOW() - (%s * INTERVAL '1 minute')
         RETURNING id""",
        (max(1, int(max_age_minutes)),),
    )
    closed = len(cursor.fetchall())
    conn.commit()
    if closed:
        logger.warning("Closed %d stale collector runs", closed)
    return closed


def source_in_backoff(source_id: str, max_backoff_minutes: int = 360) -> bool:
    """Skip a source while exponential backoff after consecutive failures is active."""
    conn = get_conn()
    rows = conn.execute(
        """SELECT status, finished_at
           FROM collector_runs
           WHERE source_id = %s AND status IN ('SUCCESS', 'FAILED')
           ORDER BY started_at DESC
           LIMIT 6""",
        (source_id,),
    ).fetchall()
    streak = 0
    last_failed_at = None
    for row in rows:
        if row["status"] != "FAILED":
            break
        streak += 1
        if last_failed_at is None:
            last_failed_at = row["finished_at"]
    if streak <= 0 or last_failed_at is None:
        return False
    delay_minutes = min(max_backoff_minutes, 15 * (2 ** min(streak - 1, 5)))
    return last_failed_at + timedelta(minutes=delay_minutes) > datetime.now(timezone.utc)


def fetch_due_source_ids(limit: int = 3, default_interval_minutes: int = 60) -> list[str]:
    """Enabled non-SKDR sources whose last finished run is older than their interval.

    Covers every ACTIVE ``rss``/``web``/``csv``/``social_media``/``api`` row,
    including explicit ``interval:120`` schedules. APScheduler still fires those
    jobs; this dispatcher is the backup so missed ticks do not stall the catalog.
    Stale RUNNING rows must be closed first (see ``finalize_stale_runs``).
    """
    conn = get_conn()
    rows = conn.execute(
        """SELECT s.id::text AS id,
                  s.schedule,
                  lr.finished_at,
                  lr.status
           FROM collector_sources s
           LEFT JOIN LATERAL (
               SELECT status, finished_at
               FROM collector_runs
               WHERE source_id = s.id
               ORDER BY started_at DESC
               LIMIT 1
           ) lr ON TRUE
           WHERE s.enabled = TRUE
             AND LOWER(COALESCE(s.source_type, '')) <> 'skdr_api'
             AND LOWER(COALESCE(s.source_type, '')) IN ('rss', 'web', 'csv', 'social_media', 'api')
             AND NOT EXISTS (
                 SELECT 1 FROM collector_runs r
                 WHERE r.source_id = s.id
                   AND r.status = 'RUNNING'
                   AND r.finished_at IS NULL
                   AND r.started_at >= NOW() - INTERVAL '30 minutes'
             )
           ORDER BY lr.finished_at NULLS FIRST, s.updated_at DESC
           LIMIT 200""",
        (),
    ).fetchall()
    due = []
    for row in rows:
        interval = source_interval_minutes(row["schedule"], default_interval_minutes)
        finished = row["finished_at"]
        if finished is None or finished <= datetime.now(timezone.utc) - timedelta(minutes=interval):
            due.append(row["id"])
        if len(due) >= max(1, int(limit)):
            break
    return due


def upsert_skdr_report(record: dict) -> dict:
    """Persist one SKDR logical record and return whether NLP should receive it.

    The unique dedupe_key is global across SKDR EBS and Alert sources. A
    stable API id is preferred; records without one use a semantic fingerprint
    generated by the collector.
    """
    conn = get_conn()
    payload = json.dumps(record["payload"], ensure_ascii=False, sort_keys=True)
    payload_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    with conn.transaction():
        existing = conn.execute(
            """SELECT id, raw_report_id, payload_hash, last_enqueued_at
               FROM skdr_reports
               WHERE dedupe_key=%s
               FOR UPDATE""",
            (record["dedupe_key"],),
        ).fetchone()
        if existing:
            changed = existing["payload_hash"] != payload_hash
            conn.execute(
                """UPDATE skdr_reports
                   SET endpoint_name=%s, external_key=%s, report_date=%s,
                       epidemiological_week=%s, page_number=%s, payload=%s::jsonb,
                       normalized_text=%s, payload_hash=%s, fetched_at=NOW(),
                       updated_at=NOW()
                   WHERE id=%s""",
                (
                    record["endpoint_name"], record.get("external_key"),
                    record.get("report_date"), record.get("epidemiological_week"),
                    record.get("page_number"), payload, record["normalized_text"],
                    payload_hash, existing["id"],
                ),
            )
            return {
                "id": str(existing["id"]),
                "raw_report_id": str(existing["raw_report_id"]) if existing["raw_report_id"] else None,
                "should_enqueue": changed or existing["last_enqueued_at"] is None,
                "duplicate": not (changed or existing["last_enqueued_at"] is None),
            }

        row = conn.execute(
            """INSERT INTO skdr_reports
                 (source_id, endpoint_name, external_key, report_year,
                  epidemiological_week, report_date, page_number, payload,
                  normalized_text, payload_hash, dedupe_key)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s)
               RETURNING id""",
            (
                record["source_id"], record["endpoint_name"], record.get("external_key"),
                record["report_year"], record.get("epidemiological_week"),
                record.get("report_date"), record.get("page_number"), payload,
                record["normalized_text"], payload_hash, record["dedupe_key"],
            ),
        ).fetchone()
        return {
            "id": str(row["id"]),
            "raw_report_id": None,
            "should_enqueue": True,
            "duplicate": False,
        }


def mark_skdr_enqueued(skdr_report_id: str):
    conn = get_conn()
    conn.execute(
        "UPDATE skdr_reports SET last_enqueued_at=NOW(), updated_at=NOW() WHERE id=%s",
        (skdr_report_id,),
    )
    conn.commit()


def skdr_has_records(source_id: str, report_year: int, endpoint_name: str) -> bool:
    conn = get_conn()
    row = conn.execute(
        """SELECT 1 FROM skdr_reports
           WHERE source_id=%s AND report_year=%s AND endpoint_name=%s
           LIMIT 1""",
        (source_id, report_year, endpoint_name),
    ).fetchone()
    conn.commit()
    return row is not None
