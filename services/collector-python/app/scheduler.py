import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from . import db
from .collectors.rss_news import RSSNewsCollector
from .collectors.web_scraper import WebScraperCollector
from .collectors.csv_ingest import CSVIngestCollector
from .collectors.social_media import SocialMediaCollector

logger = logging.getLogger(__name__)

COLLECTOR_MAP = {
    "rss": RSSNewsCollector,
    "web": WebScraperCollector,
    "csv": CSVIngestCollector,
    "social_media": SocialMediaCollector,
    "api": SocialMediaCollector,
}


def run_source(source_id: str):
    import asyncio
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(run_source_async(source_id))
    finally:
        loop.close()


async def run_source_async(source_id: str):
    import asyncio

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
    # Collectors use synchronous HTTP/feed parsers. Run them outside the
    # asyncio event loop so one slow source cannot make every scheduled job
    # miss its interval.
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


def register_scheduled_jobs(scheduler: AsyncIOScheduler):
    sources = db.fetch_sources()
    for source in sources:
        schedule = source.get("schedule")
        if not schedule:
            continue
        source_id = str(source["id"])
        scheduler.add_job(
            run_source_async,
            "interval",
            minutes=_parse_interval(schedule),
            id=f"source_{source_id}",
            args=[source_id],
            replace_existing=True,
        )
        logger.info("Scheduled %s: every %s", source["name"], schedule)


def _parse_interval(schedule: str) -> int:
    if schedule.startswith("interval:"):
        return int(schedule.replace("interval:", ""))
    return 60
