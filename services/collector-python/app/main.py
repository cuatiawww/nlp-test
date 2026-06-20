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
