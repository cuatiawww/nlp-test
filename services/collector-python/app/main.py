import logging
from urllib.parse import urlparse
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from . import db, minio_client, scheduler
from . import config
from .collectors.web_scraper import WebScraperCollector
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


def _get_extract_semaphore():
    global _extract_semaphore
    if _extract_semaphore is None:
        import asyncio
        _extract_semaphore = asyncio.Semaphore(config.COLLECTOR_MAX_CONCURRENT_RUNS)
    return _extract_semaphore


@asynccontextmanager
async def lifespan(app: FastAPI):
    minio_client.ensure_bucket()
    scheduler.register_scheduled_jobs(_scheduler)
    _scheduler.start()
    logger.info("Collector service started")
    yield
    _scheduler.shutdown()


app = FastAPI(title="Disease Collector Service", lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok", "service": "collector-python"}


@app.post("/extract-url")
async def extract_url(payload: ExtractUrlRequest):
    import asyncio
    url = payload.url.strip()
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(status_code=400, detail="URL harus menggunakan http atau https")
    if payload.fetch_mode not in {"auto", "http", "stealth"}:
        raise HTTPException(status_code=400, detail="fetch_mode tidak valid")

    timeout_ms = min(max(payload.timeout_ms, 1_000), 20_000)
    collector = WebScraperCollector({
        "id": "interactive-analyzer",
        "name": "URL Analyzer",
        "config": {
            "fetch_mode": payload.fetch_mode,
            "timeout_ms": timeout_ms,
            "max_retries": 0,
            "solve_cloudflare": False,
            "max_pages": 1,
        },
    })
    try:
        async with _get_extract_semaphore():
            # Hard timeout on extraction so interactive analysis never exceeds 20s
            data = await asyncio.wait_for(collector.extract_url(url), timeout=(timeout_ms / 1000.0) + 2.0)
        if not data.get("content") and not data.get("title"):
            raise HTTPException(
                status_code=404,
                detail="Halaman tidak memiliki teks artikel atau tidak ditemukan (404 Not Found)."
            )
        return {"success": True, "data": data}
    except asyncio.TimeoutError:
        logger.warning("Interactive extraction timed out for %s", url)
        raise HTTPException(
            status_code=408,
            detail="Waktu ekstraksi URL habis (timeout). Website sumber artikel lambat atau memblokir akses crawler."
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Interactive extraction failed for %s", url)
        err_msg = str(exc)
        if "timed out" in err_msg.lower() or "timeout" in err_msg.lower():
            raise HTTPException(
                status_code=408,
                detail="Waktu ekstraksi URL habis (timeout). Website sumber artikel lambat atau memblokir akses crawler."
            )
        raise HTTPException(
            status_code=422,
            detail=f"Tidak dapat mengekstrak teks artikel dari URL ({exc})"
        ) from exc


@app.post("/collect/all")
async def collect_all():
    import asyncio
    sources = db.fetch_sources()
    total = len(sources)

    async def run_all():
        for src in sources:
            source_id = str(src["id"])
            try:
                await run_source_async(source_id)
            except Exception:
                pass

    asyncio.create_task(run_all())
    return {"success": True, "status": "triggered_all", "total": total}


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

