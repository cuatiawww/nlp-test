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
    timeout_ms: int = 60_000
    max_retries: int = 2


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
    url = payload.url.strip()
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(status_code=400, detail="URL harus menggunakan http atau https")
    if payload.fetch_mode not in {"auto", "http", "stealth"}:
        raise HTTPException(status_code=400, detail="fetch_mode tidak valid")

    collector = WebScraperCollector({
        "id": "interactive-analyzer",
        "name": "URL Analyzer",
        "config": {
            "fetch_mode": payload.fetch_mode,
            "timeout_ms": min(max(payload.timeout_ms, 1_000), 120_000),
            "max_retries": 0,
            "solve_cloudflare": False,
            "max_pages": 1,
        },
    })
    try:
        async with _get_extract_semaphore():
            data = await collector.extract_url(url)
        if not data.get("content") and not data.get("title"):
            raise HTTPException(
                status_code=404,
                detail="Halaman tidak memiliki teks artikel atau tidak ditemukan (404 Not Found)."
            )
        return {"success": True, "data": data}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Interactive extraction failed for %s", url)
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


@app.post("/collect/{source_id}")
async def collect_one(source_id: str):
    try:
        await run_source_async(source_id)
        return {"success": True}
    except Exception as e:
        logger.exception("Collect failed for %s", source_id)
        return {"success": False, "error": str(e)}
