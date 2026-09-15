import os
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from zoneinfo import ZoneInfo
from . import db
from . import config as app_config
from .collectors.rss_news import RSSNewsCollector
from .collectors.web_scraper import WebScraperCollector
from .collectors.csv_ingest import CSVIngestCollector
from .collectors.social_media import SocialMediaCollector
from .collectors.social_csv_ingest import SocialCSVIngestCollector

logger = logging.getLogger(__name__)
_source_run_semaphore = None
_source_job_signatures = {}

CSV_WATCHER_INTERVAL_MINUTES = 5
CRAWLER_MAX_INTERVAL_MINUTES = 180

COLLECTOR_MAP = {
    "rss": RSSNewsCollector,
    "web": WebScraperCollector,
    "csv": CSVIngestCollector,
    "social_media": SocialMediaCollector,
    "api": SocialMediaCollector,
}

DEFAULT_SOURCE_INTERVAL_MINUTES = 60
DISPATCHER_INTERVAL_MINUTES = 2
DISPATCHER_BATCH_SIZE = 5
MAX_BACKOFF_MINUTES = 360


def run_source(source_id: str):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(run_source_async(source_id))
    finally:
        loop.close()


async def run_source_async(source_id: str):
    global _source_run_semaphore
    if _source_run_semaphore is None:
        _source_run_semaphore = asyncio.Semaphore(app_config.COLLECTOR_MAX_CONCURRENT_RUNS)
    async with _source_run_semaphore:
        return await _run_source_bounded(source_id)


async def _run_source_bounded(source_id: str):
    source = db.fetch_source(source_id)
    if not source:
        logger.warning("Source %s not found", source_id)
        return

    if source.get("source_type") == "skdr_api":
        logger.info("SKDR source %s is detached; skipping run", source_id)
        return

    if db.source_in_backoff(source_id):
        logger.info("Source %s is in failure backoff; skipping", source_id)
        return

    collector_cls = COLLECTOR_MAP.get(source["source_type"])
    if not collector_cls:
        logger.warning("No collector for type %s", source["source_type"])
        return

    run_id = db.create_run(str(source["id"]))
    collector = collector_cls(source)
    try:
        if asyncio.iscoroutinefunction(collector.collect):
            result = await collector.collect()
        else:
            result = await asyncio.to_thread(collector.collect)
    except Exception as exc:
        # Always close the run when a collector raises before returning its
        # CollectResult. Otherwise a restart leaves a permanent RUNNING row
        # and the live dashboard falsely reports an active crawler.
        message = str(exc).replace("\n", " ")[:1000] or type(exc).__name__
        db.finish_run(run_id, "FAILED", error_message=message)
        logger.exception("Collector %s failed: %s", source["name"], message)
        return None

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
    logger.info("SKDR startup sync disabled; skipping %s", source_id)
    return


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
    _register_source_jobs(scheduler, _load_sources() or [])
    scheduler.add_job(
        refresh_scheduled_source_jobs,
        "interval",
        minutes=1,
        next_run_time=datetime.now(timezone.utc) + timedelta(minutes=1),
        id="job_refresh_source_schedules",
        args=[scheduler],
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        run_due_sources,
        "interval",
        minutes=DISPATCHER_INTERVAL_MINUTES,
        next_run_time=datetime.now(timezone.utc) + timedelta(seconds=20),
        id="job_due_source_dispatcher",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=120,
    )
    logger.info("Scheduled source registry refresh: every 1 min")
    logger.info(
        "Scheduled due-source dispatcher: every %d min (batch=%d, default interval=%d)",
        DISPATCHER_INTERVAL_MINUTES,
        DISPATCHER_BATCH_SIZE,
        DEFAULT_SOURCE_INTERVAL_MINUTES,
    )


def _load_sources():
    """Load enabled sources without stopping the scheduler on a DB hiccup."""
    try:
        return db.fetch_sources()
    except Exception as exc:
        logger.exception("Could not load scheduled sources; continuing with CSV watcher: %s", exc)
        return None


async def refresh_scheduled_source_jobs(scheduler: AsyncIOScheduler):
    """Pick up source/schedule changes made by the admin without a restart."""
    sources = await asyncio.to_thread(_load_sources)
    if sources is None:
        # Keep the existing jobs if PostgreSQL is temporarily unavailable.
        return
    _register_source_jobs(scheduler, sources)


def _register_source_jobs(scheduler: AsyncIOScheduler, sources):
    desired_job_ids = set()
    for idx, source in enumerate(sources):
        if source.get("source_type") == "skdr_api":
            logger.info("SKDR source %s is disabled; skipping schedule", source.get("name"))
            continue
        raw_schedule = source.get("schedule")
        # Empty schedules are worked by the due-source dispatcher so we do not
        # stampede every enabled feed as its own APScheduler job.
        if not raw_schedule or not str(raw_schedule).strip():
            continue
        schedule = str(raw_schedule).strip()
        source_id = str(source["id"])
        job_id = f"source_{source_id}"
        desired_job_ids.add(job_id)
        signature = f"{source.get('source_type')}|{schedule}"
        if scheduler.get_job(job_id) is not None and _source_job_signatures.get(job_id) == signature:
            continue
        if scheduler.get_job(job_id) is not None:
            scheduler.remove_job(job_id)
        _source_job_signatures[job_id] = signature
        if schedule.startswith("daily:"):
            hour, minute = _parse_daily(schedule)
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
                id=job_id,
                args=[source_id],
                replace_existing=True,
                max_instances=1,
                coalesce=True,
            )
            logger.info("Scheduled %s: daily at %02d:%02d %s", source["name"], hour, minute, timezone_name)
            continue
        start_time = datetime.now(timezone.utc) + timedelta(seconds=idx * 2)
        interval_minutes = _parse_interval(schedule)
        scheduler.add_job(
            run_source_async,
            "interval",
            minutes=interval_minutes,
            next_run_time=start_time,
            id=job_id,
            args=[source_id],
            replace_existing=True,
            max_instances=1,
            coalesce=True,
            misfire_grace_time=3600,
        )
        logger.info("Scheduled %s: every %d min (first run in %ds)", source["name"], interval_minutes, idx * 2)

    # Remove jobs for sources disabled or deleted in the admin registry.
    for job_id in list(_source_job_signatures):
        if job_id in desired_job_ids:
            continue
        if scheduler.get_job(job_id) is not None:
            scheduler.remove_job(job_id)
        _source_job_signatures.pop(job_id, None)


async def run_due_sources():
    """Keep enabled sources working even when a per-source cron job is idle."""
    try:
        await asyncio.to_thread(db.finalize_stale_runs)
        due_ids = await asyncio.to_thread(
            db.fetch_due_source_ids,
            DISPATCHER_BATCH_SIZE,
            DEFAULT_SOURCE_INTERVAL_MINUTES,
        )
    except Exception as exc:
        logger.exception("Due-source dispatcher could not load sources: %s", exc)
        return
    if not due_ids:
        return
    logger.info("Due-source dispatcher running %d source(s)", len(due_ids))
    for source_id in due_ids:
        try:
            await run_source_async(source_id)
        except Exception:
            logger.exception("Due-source dispatcher failed for %s", source_id)


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
