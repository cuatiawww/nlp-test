import psycopg
import json
import hashlib
import logging
import threading
from psycopg.rows import dict_row
from . import config
from .crawler_identity import content_fingerprint, normalize_url, url_hash

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
               WHERE (url = %s OR normalized_url = %s OR canonical_url = %s OR url_hash = %s)
                 AND processing_status IN ('PROCESSED', 'NON_HEALTH')
               LIMIT 1""",
            (candidate, normalized, normalized, candidate_hash),
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
        conn = psycopg.connect(conninfo, row_factory=dict_row)
        _connection_state.conn = conn
    return conn


def backfill_document_identities(batch_size: int = 500, max_batches: int = 100) -> int:
    """Safely backfill identity columns without deleting or merging old RAW."""
    total = 0
    for _ in range(max_batches):
        conn = get_conn()
        rows = conn.execute(
            """SELECT id, url, original_text
               FROM raw_reports
               WHERE content_hash IS NULL
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
            digest = None
            if row.get("url"):
                try:
                    normalized = normalize_url(row["url"])
                    digest = url_hash(normalized)
                except ValueError:
                    logger.warning("Historical RAW has an invalid URL: raw_id=%s", row["id"])
            updates.append((normalized, digest, content_fingerprint(row.get("original_text") or ""), row["id"]))
        with conn.cursor() as cursor:
            cursor.executemany(
                """UPDATE raw_reports
                   SET normalized_url=COALESCE(normalized_url,%s),
                       url_hash=COALESCE(url_hash,%s),
                       content_hash=COALESCE(content_hash,%s)
                   WHERE id=%s""",
                updates,
            )
        conn.commit()
        total += len(rows)
        logger.info("Crawler identity backfill progress: updated=%d", total)
        if len(rows) < batch_size:
            break
    return total


def fetch_sources(source_type=None, enabled_only=True):
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
