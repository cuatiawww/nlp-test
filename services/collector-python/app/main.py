import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from . import db, minio_client, scheduler
from .scheduler import run_source_async
from apscheduler.schedulers.asyncio import AsyncIOScheduler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_scheduler = AsyncIOScheduler()


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


@app.post("/collect/all")
async def collect_all():
    sources = db.fetch_sources()
    results = []
    for src in sources:
        source_id = str(src["id"])
        try:
            await run_source_async(source_id)
            results.append({"source_id": source_id, "status": "triggered"})
        except Exception as e:
            results.append({"source_id": source_id, "status": "error", "error": str(e)})
    return {"success": True, "results": results}


@app.post("/collect/{source_id}")
async def collect_one(source_id: str):
    try:
        await run_source_async(source_id)
        return {"success": True}
    except Exception as e:
        logger.exception("Collect failed for %s", source_id)
        return {"success": False, "error": str(e)}
