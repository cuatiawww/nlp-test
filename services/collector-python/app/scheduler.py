import os
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from zoneinfo import ZoneInfo
from . import db
from .collectors.rss_news import RSSNewsCollector
from .collectors.web_scraper import WebScraperCollector
from .collectors.csv_ingest import CSVIngestCollector
from .collectors.social_media import SocialMediaCollector
from .collectors.social_csv_ingest import SocialCSVIngestCollector
from .collectors.skdr_api import SKDRCollector

logger = logging.getLogger(__name__)

CSV_WATCHER_INTERVAL_MINUTES = 5
CRAWLER_MAX_INTERVAL_MINUTES = 180

COLLECTOR_MAP = {
    "rss": RSSNewsCollector,
    "web": WebScraperCollector,
    "csv": CSVIngestCollector,
    "social_media": SocialMediaCollector,
    "api": SocialMediaCollector,
    "skdr_api": SKDRCollector,
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
    return result


async def run_skdr_startup(source_id: str):
    source = db.fetch_source(source_id)
    if not source or source.get("source_type") != "skdr_api":
        return
    source = dict(source)
    source["config"] = dict(source.get("config") or {})
    source["config"]["startup_sync"] = True
    # Keep the same run accounting as the normal scheduled path.
    collector_cls = COLLECTOR_MAP["skdr_api"]
    run_id = db.create_run(str(source["id"]))
    collector = collector_cls(source)
    result = await asyncio.to_thread(collector.collect)
    db.finish_run(
        run_id,
        "SUCCESS" if not result.error_message else "FAILED",
        result.records_found,
        result.records_ingested,
        result.error_message,
    )
    logger.info(
        "Startup SKDR %s — found=%d ingested=%d error=%s",
        source["name"], result.records_found, result.records_ingested, result.error_message,
    )


async def run_social_media_csv_job():
    """Periodic job scanning and ingesting social media CSV directory."""
    collector = SocialCSVIngestCollector()
    result = await asyncio.to_thread(collector.collect)
    logger.info("Social CSV Watcher completed: %s", result)


def register_scheduled_jobs(scheduler: AsyncIOScheduler):
    # Register the file watcher first. It does not need the source registry or
    # the database and must remain available during a DB restart.
    csv_interval = CSV_WATCHER_INTERVAL_MINUTES
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
        if schedule.startswith("daily:"):
            schedule_value = schedule
            if source.get("source_type") == "skdr_api":
                schedule_value = f"daily:{os.getenv('SKDR_FETCH_TIME', '00:00')}"
            hour, minute = _parse_daily(schedule_value)
            timezone_name = os.getenv("COLLECTOR_TIMEZONE", "Asia/Jakarta")
            try:
                schedule_timezone = ZoneInfo(timezone_name)
            except Exception:
                logger.warning("Invalid COLLECTOR_TIMEZONE=%s; using Asia/Jakarta", timezone_name)
                schedule_timezone = ZoneInfo("Asia/Jakarta")
            scheduler.add_job(
                run_source_async,
                "cron",
                hour=hour,
                minute=minute,
                timezone=schedule_timezone,
                id=f"source_{source_id}",
                args=[source_id],
                replace_existing=True,
                max_instances=1,
                coalesce=True,
            )
            logger.info("Scheduled %s: daily at %02d:%02d %s", source["name"], hour, minute, timezone_name)
            if source.get("source_type") == "skdr_api" and _env_bool("SKDR_RUN_ON_START", True):
                startup_delay = max(1, int(os.getenv("SKDR_STARTUP_DELAY_SECONDS", "10")))
                scheduler.add_job(
                    run_skdr_startup,
                    "date",
                    run_date=datetime.now(schedule_timezone) + timedelta(seconds=startup_delay + idx),
                    id=f"startup_{source_id}",
                    args=[source_id],
                    replace_existing=True,
                )
                logger.info("Scheduled startup sync for %s in %ds", source["name"], startup_delay + idx)
            continue
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
    # Seeded feeds use intervals between 60 and 180 minutes. A 10-minute
    # default silently ignored those values and caused unnecessary load and
    # repeated RSS deliveries.
    max_interval = CRAWLER_MAX_INTERVAL_MINUTES
    min_interval = 3
    if schedule.startswith("interval:"):
        try:
            val = int(schedule.replace("interval:", ""))
            return max(min_interval, min(val, max_interval))
        except ValueError:
            pass
    return max_interval


def _parse_daily(schedule: str) -> tuple[int, int]:
    try:
        raw = schedule.split(":", 1)[1]
        hour, minute = (int(part) for part in raw.split(":", 1))
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            raise ValueError
        return hour, minute
    except (ValueError, IndexError):
        logger.warning("Invalid daily schedule %r; falling back to 00:00", schedule)
        return 0, 0


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.lower() in {"1", "true", "yes", "on"}
