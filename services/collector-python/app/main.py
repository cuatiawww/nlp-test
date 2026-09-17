import logging
from urllib.parse import urlparse
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from . import db, minio_client, scheduler
from . import config
from .collectors.web_scraper import WebScraperCollector
from .crawler_identity import UnsafeUrlError, validate_public_url
from .scheduler import run_source_async
from apscheduler.schedulers.asyncio import AsyncIOScheduler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_scheduler = AsyncIOScheduler()
_extract_semaphore = None


class ExtractUrlRequest(BaseModel):
    url: str
    fetch_mode: str = "auto"
    timeout_ms: int = 15_000
    max_retries: int = 0


class DiscoverUrlsRequest(BaseModel):
    disease_names: list[str] = Field(min_length=1, max_length=20)
    country: str | None = None
    region: str | None = None
    date_from: str | None = None
    date_to: str | None = None
    max_urls: int = Field(default=20, ge=1, le=500)


def _get_extract_semaphore():
    global _extract_semaphore
    if _extract_semaphore is None:
        import asyncio
        _extract_semaphore = asyncio.Semaphore(config.COLLECTOR_MAX_CONCURRENT_RUNS)
    return _extract_semaphore


@asynccontextmanager
async def lifespan(app: FastAPI):
    minio_client.ensure_bucket()
    import asyncio
    try:
        await asyncio.to_thread(db.finalize_stale_runs)
        updated = await asyncio.to_thread(db.backfill_document_identities)
        logger.info("Crawler identity backfill completed: updated=%d", updated)
    except Exception:
        # Collection must remain available if an older deployment has not yet
        # applied migration 060. The warning identifies the exact rollout step.
        logger.exception("Crawler identity backfill skipped; ensure migration 060 is applied")
    scheduler.register_scheduled_jobs(_scheduler)
    _scheduler.start()
    logger.info("Collector service started")
    yield
    _scheduler.shutdown()


app = FastAPI(title="Disease Collector Service", lifespan=lifespan)
from .analysis_jobs import router as analysis_jobs_router
app.include_router(analysis_jobs_router)
from .crawl_jobs import router as crawl_jobs_router
app.include_router(crawl_jobs_router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "collector-python"}


@app.post("/extract-url")
async def extract_url(payload: ExtractUrlRequest):
    import asyncio
    url = payload.url.strip()
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(status_code=400, detail="URL must use HTTP or HTTPS")
    if payload.fetch_mode not in {"auto", "http", "stealth"}:
        raise HTTPException(status_code=400, detail="Invalid fetch mode")
    try:
        url = await asyncio.to_thread(validate_public_url, url)
    except UnsafeUrlError as exc:
        logger.warning("Blocked unsafe interactive URL host: %s", parsed.hostname)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    is_pdf_target = urlparse(url).path.lower().endswith(".pdf")
    # Surveillance PDFs can require both download time and pdfplumber table
    # extraction time. Keep HTML requests bounded separately, but allow a
    # larger explicit budget for a valid PDF document.
    max_bound = 150_000 if is_pdf_target else config.INTERACTIVE_HTML_MAX_BOUND_MS
    timeout_ms = min(max(payload.timeout_ms, 1_000), max_bound)
    html_retries = 1
    collector = WebScraperCollector({
        "id": "interactive-analyzer",
        "name": "URL Analyzer",
        "config": {
            "fetch_mode": payload.fetch_mode,
            "timeout_ms": timeout_ms,
            "max_retries": max(0, min(payload.max_retries, config.CRAWLER_MAX_RETRIES if is_pdf_target else html_retries)),
            "solve_cloudflare": False,
            "max_pages": 1,
            "skip_stealth": config.INTERACTIVE_SKIP_STEALTH and not is_pdf_target,
            "wait_ms": 1500,
        },
    })
    try:
        async with _get_extract_semaphore():
            # Generous timeout buffer for large documents and multi-page surveillance PDFs
            wait_buffer = 20.0 if is_pdf_target else 5.0
            data = await asyncio.wait_for(collector.extract_url(url), timeout=(timeout_ms / 1000.0) + wait_buffer)
        if not data.get("content") and not data.get("title"):
            raise HTTPException(
                status_code=404,
                detail="The page has no article text or was not found (404)."
            )
        return {"success": True, "data": data}
    except asyncio.TimeoutError:
        logger.warning("Interactive extraction timed out for %s", url)
        raise HTTPException(
            status_code=408,
            detail="URL extraction timed out. The source website is slow or blocking crawler access."
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Interactive extraction failed for %s", url)
        err_msg = str(exc)
        if "timed out" in err_msg.lower() or "timeout" in err_msg.lower():
            raise HTTPException(
                status_code=408,
                detail="URL extraction timed out. The source website is slow or blocking crawler access."
            )
        if "ocr" in err_msg.lower():
            raise HTTPException(
                status_code=422,
                detail="This PDF contains no digital text and requires OCR review."
            )
        raise HTTPException(
            status_code=422,
            detail=f"Could not extract article text from URL ({exc})"
        ) from exc


@app.post("/discover-urls")
async def discover_article_urls(payload: DiscoverUrlsRequest):
    """Discover bounded candidates from Google News and the stored source catalog.

    Manual crawl loads catalog rows even when they are disabled. The scheduler
    still uses ``fetch_sources(enabled_only=True)`` so ABVC homepage sources
    stay off the interval crawler until an administrator enables them.
    """
    import asyncio
    from .discovery import discover_urls

    sources = db.fetch_sources(enabled_only=False)
    results, warnings = await asyncio.to_thread(
        discover_urls,
        [name.strip() for name in payload.disease_names if name.strip()],
        payload.country,
        payload.region,
        payload.date_from,
        payload.date_to,
        payload.max_urls,
        sources,
    )
    logger.info("URL discovery completed: found=%d warnings=%d", len(results), len(warnings))
    return {"success": True, "data": results, "warnings": warnings}


@app.post("/collect/all")
async def collect_all():
    import asyncio
    from .scheduler import DISPATCHER_BATCH_SIZE, run_due_sources

    asyncio.create_task(run_due_sources())
    return {
        "success": True,
        "status": "dispatcher_batch",
        "batch_size": DISPATCHER_BATCH_SIZE,
        "note": "Enabled sources keep running via the due-source dispatcher; this trigger runs one rate-limited batch instead of every source at once.",
    }


@app.post("/collect/social-media-csv")
async def collect_social_media_csv():
    import asyncio
    from .collectors.social_csv_ingest import SocialCSVIngestCollector
    collector = SocialCSVIngestCollector()
    result = await asyncio.to_thread(collector.collect)
    return result


@app.post("/collect/{source_id}")
async def collect_one(source_id: str):
    try:
        await run_source_async(source_id)
        return {"success": True}
    except Exception as e:
        logger.exception("Collect failed for %s", source_id)
        return {"success": False, "error": str(e)}


class UploadAssetRequest(BaseModel):
    filename: str
    content_base64: str
    content_type: str = "image/png"


@app.post("/upload-asset")
async def upload_asset(req: UploadAssetRequest):
    import base64
    import uuid
    import re
    try:
        # Strip data:image/...;base64, prefix if present
        b64_str = re.sub(r"^data:[^;]+;base64,", "", req.content_base64)
        raw_bytes = base64.b64decode(b64_str)

        # Clean filename
        clean_fn = re.sub(r"[^a-zA-Z0-9._-]", "_", req.filename)
        safe_name = f"branding/{uuid.uuid4().hex[:8]}_{clean_fn}"

        minio_client.upload_file(safe_name, raw_bytes, req.content_type)
        logger.info(f"Uploaded asset {safe_name} to MinIO bucket {config.MINIO_BUCKET}")
        return {
            "success": True,
            "url": f"/nlp/api/v1/assets/{safe_name}",
            "object_name": safe_name,
            "size": len(raw_bytes)
        }
    except Exception as e:
        logger.exception("Failed to upload asset to MinIO")
        raise HTTPException(status_code=500, detail=f"MinIO upload error: {str(e)}")


@app.get("/assets/{object_path:path}")
async def get_asset(object_path: str):
    from fastapi.responses import Response
    client = minio_client._get_client()
    try:
        data = client.get_object(config.MINIO_BUCKET, object_path)
        content_type = data.headers.get("Content-Type") or data.headers.get("content-type") or "image/png"
        body = data.read()
        return Response(
            content=body,
            media_type=content_type,
            headers={
                "Cache-Control": "public, max-age=86400",
                "Content-Type": content_type
            }
        )
    except Exception as e:
        logger.warning(f"Asset not found in MinIO: {object_path} ({e})")
        raise HTTPException(status_code=404, detail="Asset not found")

