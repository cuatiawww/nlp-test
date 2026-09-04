import asyncio
import logging
import os
from datetime import datetime, timezone, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from . import db
from .collectors.rss_news import RSSNewsCollector
from .collectors.web_scraper import WebScraperCollector
from .collectors.csv_ingest import CSVIngestCollector
from .collectors.social_media import SocialMediaCollector
from .collectors.social_csv_ingest import SocialCSVIngestCollector

logger = logging.getLogger(__name__)

COLLECTOR_MAP = {
    "rss": RSSNewsCollector,
    "web": WebScraperCollector,
    "csv": CSVIngestCollector,
    "social_media": SocialMediaCollector,
    "api": SocialMediaCollector,
}


def run_source(source_id: str):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(run_source_async(source_id))
    finally:
        loop.close()


async def run_source_async(source_id: str):
    source = db.fetch_source(source_id)
    if not source:
        logger.warning("Source %s not found", source_id)
        return

    collector_cls = COLLECTOR_MAP.get(source["source_type"])
    if not collector_cls:
        logger.warning("No collector for type %s", source["source_type"])
        return

    run_id = db.create_run(str(source["id"]))
    collector = collector_cls(source)
    if asyncio.iscoroutinefunction(collector.collect):
        result = await collector.collect()
    else:
        result = await asyncio.to_thread(collector.collect)

    db.finish_run(
        run_id,
        "SUCCESS" if not result.error_message else "FAILED",
        result.records_found,
        result.records_ingested,
        result.error_message,
    )
    logger.info(
        "Collected %s — found=%d ingested=%d error=%s",
        source["name"],
        result.records_found,
        result.records_ingested,
        result.error_message,
    )


async def run_social_media_csv_job():
    """Periodic job scanning and ingesting social media CSV directory."""
    collector = SocialCSVIngestCollector()
    result = await asyncio.to_thread(collector.collect)
    logger.info("Social CSV Watcher completed: %s", result)


def register_scheduled_jobs(scheduler: AsyncIOScheduler):
    # Register the file watcher first. It does not need the source registry or
    # the database and must remain available during a DB restart.
    try:
        csv_interval = max(1, int(os.getenv("SOCIAL_MEDIA_CSV_INTERVAL_MINUTES", "5")))
    except ValueError:
        csv_interval = 5
    social_start = datetime.now(timezone.utc) + timedelta(seconds=15)
    scheduler.add_job(
        run_social_media_csv_job,
        "interval",
        minutes=csv_interval,
        next_run_time=social_start,
        id="job_social_media_csv",
        replace_existing=True,
    )
    logger.info("Scheduled Social Media CSV Watcher: every %d min", csv_interval)

    # CSV social ingestion is independent from the configured DB sources.
    # Keep it alive when the source registry is temporarily unavailable; the
    # old behavior aborted collector startup before the CSV job was registered.
    try:
        sources = db.fetch_sources()
    except Exception as exc:
        logger.exception("Could not load scheduled sources; continuing with CSV watcher: %s", exc)
        sources = []
    for idx, source in enumerate(sources):
        schedule = source.get("schedule")
        if not schedule:
            continue
        source_id = str(source["id"])
        start_time = datetime.now(timezone.utc) + timedelta(seconds=idx * 2)
        interval_minutes = _parse_interval(schedule)
        scheduler.add_job(
            run_source_async,
            "interval",
            minutes=interval_minutes,
            next_run_time=start_time,
            id=f"source_{source_id}",
            args=[source_id],
            replace_existing=True,
        )
        logger.info("Scheduled %s: every %d min (first run in %ds)", source["name"], interval_minutes, idx * 2)

def _parse_interval(schedule: str) -> int:
    max_interval = int(os.getenv("CRAWLER_MAX_INTERVAL_MINUTES", "10"))
    min_interval = int(os.getenv("CRAWLER_MIN_INTERVAL_MINUTES", "3"))
    if schedule.startswith("interval:"):
        try:
            val = int(schedule.replace("interval:", ""))
            return max(min_interval, min(val, max_interval))
        except ValueError:
            pass
    return max_interval
