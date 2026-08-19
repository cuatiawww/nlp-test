"""One-shot collector for an isolated historical backfill queue.

Run with CURRENT_YEAR_ONLY=false and a non-production RABBITMQ_QUEUE. This
does not alter the production collector schedule.
"""

import asyncio
import logging

from . import db
from .scheduler import run_source_async


async def main() -> None:
    sources = db.fetch_sources()
    logging.getLogger(__name__).info("Historical backfill sources=%d", len(sources))
    for source in sources:
        try:
            await run_source_async(str(source["id"]))
        except Exception:
            logging.getLogger(__name__).exception("Historical source failed: %s", source.get("name"))


if __name__ == "__main__":
    asyncio.run(main())
