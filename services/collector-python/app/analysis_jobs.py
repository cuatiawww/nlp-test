"""Optional URL job API. No extraction is performed in the submission request."""
import os
import uuid
import logging
from urllib.parse import urlparse
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from . import config
from .crawler_identity import UnsafeUrlError, normalize_url, url_hash, validate_public_url

router = APIRouter()
logger = logging.getLogger(__name__)

class SubmitJob(BaseModel):
    url: str
    force_refresh: bool = False

def connection():
    import psycopg
    from psycopg.rows import dict_row
    return psycopg.connect(config.DATABASE_URL, row_factory=dict_row, connect_timeout=3,
                           options="-c statement_timeout=3000")

@router.post("/analysis-jobs")
def submit(payload: SubmitJob):
    url = payload.url.strip()
    parsed = urlparse(url)
    if parsed.scheme not in {"https", "http"} or not parsed.hostname or parsed.username:
        raise HTTPException(400, "A valid HTTP(S) article URL is required")
    try:
        normalized_url = validate_public_url(url)
    except (UnsafeUrlError, ValueError) as exc:
        raise HTTPException(400, str(exc)) from exc
    url_digest = url_hash(normalized_url)
    with connection() as conn:
        # Serialize submissions for the same URL. This prevents two clicks or
        # two clients arriving together from creating duplicate live crawls.
        conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (normalized_url,))
        row = None
        cache_hit = False
        if not payload.force_refresh:
            row = conn.execute(
                """SELECT id, status FROM analysis_jobs
                   WHERE (normalized_url=%s OR url_hash=%s OR url=%s)
                     AND status IN ('completed', 'partial')
                   ORDER BY updated_at DESC, created_at DESC
                   LIMIT 1""",
                (normalized_url, url_digest, url),
            ).fetchone()
            cache_hit = row is not None
        if row is None:
            row = conn.execute(
                """SELECT id, status FROM analysis_jobs
                   WHERE (normalized_url=%s OR url_hash=%s OR url=%s)
                     AND status IN ('queued', 'processing')
                   ORDER BY created_at ASC
                   LIMIT 1""",
                (normalized_url, url_digest, url),
            ).fetchone()
        if row is None:
            row = conn.execute(
                """INSERT INTO analysis_jobs(url, normalized_url, url_hash, force_refresh)
                   VALUES (%s, %s, %s, %s) RETURNING id, status""",
                (url, normalized_url, url_digest, payload.force_refresh),
            ).fetchone()
            cache_hit = False
    # The table is also an outbox: the worker dispatches queued rows to RabbitMQ.
    # Publish immediately so the dedicated analysis-url consumer wakes without
    # waiting for the outbox poll. Broker downtime is not fatal; the worker retries.
    if not cache_hit:
        try:
            from .rabbitmq import publish_to_queue
            from . import config as collector_config
            published = publish_to_queue(
                collector_config.RABBITMQ_ANALYSIS_URL_QUEUE,
                {"job_id": str(row["id"])},
            )
            if not published:
                logger.warning("RabbitMQ publish skipped for analysis job %s; outbox will retry", row["id"])
        except Exception:
            logger.warning("RabbitMQ publish skipped for analysis job %s; outbox will retry", row["id"])
    else:
        logger.info("URL %s already has completed analysis job %s; queue publish skipped", normalized_url, row["id"])
    return {"success": True, "data": {"job_id": str(row["id"]), "status": row["status"], "cached": cache_hit}}

@router.get("/analysis-jobs/{job_id}")
def status(job_id: uuid.UUID):
    with connection() as conn:
        row = conn.execute(
            "SELECT id AS job_id,status,stage,result,warnings,error,created_at,updated_at FROM analysis_jobs WHERE id=%s",
            (job_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Analysis job not found")
    return {"success": True, "data": row}
