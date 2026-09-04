"""Manual SKDR synchronizer.

Examples:
  python -m app.skdr_sync --endpoint all --year 2026
  python -m app.skdr_sync --endpoint alert --year 2026 --from-week 1 --to-week latest
"""

import argparse
import asyncio
import datetime as dt
import logging
import sys

from . import config, db
from .collectors.skdr_api import SKDRCollector

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("skdr_sync")


def parse_args():
    parser = argparse.ArgumentParser(description="Fetch SKDR EBS and Alert data")
    parser.add_argument("--endpoint", choices=("ebs", "alert", "ibs", "all"), default="all")
    parser.add_argument("--year", type=int, default=dt.date.today().year)
    parser.add_argument("--week", type=int)
    parser.add_argument("--from-week", type=int)
    parser.add_argument("--to-week", default="latest")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--delay", type=float)
    parser.add_argument("--max-requests", type=int)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


async def run_source(source: dict, args) -> bool:
    source_config = dict(source.get("config") or {})
    source_config["year"] = args.year
    if args.limit:
        source_config["limit"] = args.limit
    if args.dry_run:
        source_config["dry_run"] = True
    if source_config.get("endpoint") == "alert":
        if args.week is not None:
            source_config["from_week"] = args.week
            source_config["to_week"] = args.week
        elif args.from_week is not None:
            source_config["from_week"] = args.from_week
            source_config["mode"] = "backfill"
            if args.to_week != "latest":
                source_config["to_week"] = int(args.to_week)
    source = dict(source)
    source["config"] = source_config
    run_id = db.create_run(str(source["id"]))
    collector = SKDRCollector(source)
    result = await asyncio.to_thread(collector.collect)
    db.finish_run(
        run_id,
        "SUCCESS" if not result.error_message else "FAILED",
        result.records_found,
        result.records_ingested,
        result.error_message,
    )
    logger.info(
        "SKDR %s: found=%d ingested=%d requests=%d error=%s",
        source_config.get("endpoint"), result.records_found, result.records_ingested,
        collector.requests_made, result.error_message,
    )
    return not result.error_message


async def main_async(args) -> int:
    if args.delay is not None:
        config.SKDR_REQUEST_DELAY_SECONDS = max(0.0, args.delay)
    if args.max_requests is not None:
        config.SKDR_MAX_REQUESTS_PER_RUN = max(1, args.max_requests)
    requested_endpoint = "alert" if args.endpoint == "ibs" else args.endpoint
    requested = {requested_endpoint} if requested_endpoint != "all" else {"ebs", "alert"}
    sources = db.fetch_sources("skdr_api", enabled_only=False)
    sources = [s for s in sources if (s.get("config") or {}).get("endpoint") in requested]
    missing = requested - {(s.get("config") or {}).get("endpoint") for s in sources}
    if missing:
        logger.error("SKDR source belum tersedia di database: %s", ", ".join(sorted(missing)))
        return 2
    success = True
    for source in sorted(sources, key=lambda item: (item.get("config") or {}).get("endpoint", "")):
        success = await run_source(source, args) and success
    return 0 if success else 1


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main_async(parse_args())))
    except KeyboardInterrupt:
        raise SystemExit(130)
