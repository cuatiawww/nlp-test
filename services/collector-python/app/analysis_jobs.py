"""Optional URL job API. No extraction is performed in the submission request."""
import os
import uuid
import logging
from urllib.parse import urlparse
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from . import config

router = APIRouter()
logger = logging.getLogger(__name__)

class SubmitJob(BaseModel):
    url: str

def connection():
    import psycopg
    from psycopg.rows import dict_row
    return psycopg.connect(config.DATABASE_URL, row_factory=dict_row, connect_timeout=3,
                           options="-c statement_timeout=3000")

@router.post("/analysis-jobs")
def submit(payload: SubmitJob):
    parsed = urlparse(payload.url.strip())
    if parsed.scheme not in {"https", "http"} or not parsed.hostname or parsed.username:
        raise HTTPException(400, "A valid HTTP(S) article URL is required")
    with connection() as conn:
        row = conn.execute("INSERT INTO analysis_jobs(url) VALUES (%s) RETURNING id",
                           (payload.url.strip(),)).fetchone()
    # The table is also an outbox: the worker dispatches queued rows to RabbitMQ.
    # DB commit before queue publication means jobs survive broker downtime.
    return {"success": True, "data": {"job_id": str(row["id"]), "status": "queued"}}

@router.get("/analysis-jobs/{job_id}")
def status(job_id: uuid.UUID):
    with connection() as conn:
        row = conn.execute(
            "SELECT id AS job_id,status,stage,result,warnings,error,created_at,updated_at FROM analysis_jobs WHERE id=%s",
            (job_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Analysis job not found")
    return {"success": True, "data": row}
