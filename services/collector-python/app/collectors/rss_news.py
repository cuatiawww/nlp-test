import datetime
import asyncio
import hashlib
import logging
import os
import feedparser
from .. import db
from .base import BaseCollector, CollectResult
from .. import rabbitmq
from ..minio_client import upload_file
from ..crawler_identity import identity_fields, normalize_url
from ..discovery import _fetch_bytes
from .web_scraper import WebScraperCollector

logger = logging.getLogger(__name__)


def _as_bool(value, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _parse_date(raw: str) -> str:
    if not raw:
        return ""
    try:
        import dateutil.parser
        return dateutil.parser.parse(raw).strftime("%Y-%m-%d")
    except Exception:
        return raw[:10] if len(raw) >= 10 else raw


def _is_current_year(published: str) -> bool:
    if os.getenv("CURRENT_YEAR_ONLY", "true").lower() not in {"1", "true", "yes", "on"}:
        return True
    if not published or len(published) < 4 or not published[:4].isdigit():
        return False
    raw_year = os.getenv("CURRENT_YEAR", "").strip()
    try:
        target_year = int(raw_year)
        if not 1900 <= target_year <= 2200:
            raise ValueError("year outside supported range")
    except ValueError:
        target_year = datetime.date.today().year
    return int(published[:4]) == target_year


class RSSNewsCollector(BaseCollector):
    async def collect(self) -> CollectResult:
        result = CollectResult()
        url = self.config.get("url", "")
        if not url:
            result.error_message = "No RSS URL configured"
            return result

        try:
            feed_payload, _, _ = await asyncio.to_thread(_fetch_bytes, url)
            feed = feedparser.parse(feed_payload)
        except Exception as exc:
            result.error_message = f"Failed to fetch feed: {exc}"
            return result
        if feed.bozo and not feed.entries:
            result.error_message = f"Failed to parse feed: {feed.bozo_exception}"
            return result

        published_urls = set()
        max_entries = min(100, max(1, int(self.config.get("max_entries", 100))))
        # Full article extraction uses the same universal fetch engine, but it
        # is opt-in per source. Enabling browser work for every feed at startup
        # would create an avoidable burst across dozens of scheduled sources.
        fetch_full_article = _as_bool(self.config.get("fetch_full_article"), False)
        full_article_limit = min(max_entries, max(0, int(self.config.get("full_article_limit", 20))))
        full_article_attempts = 0
        article_collector = WebScraperCollector({
            "id": self.source["id"],
            "name": self.source.get("name", "RSS article"),
            "config": {
                "fetch_mode": self.config.get("fetch_mode", "auto"),
                "timeout_ms": min(30_000, max(5_000, int(self.config.get("timeout_ms", 15_000)))),
                "max_retries": min(3, max(0, int(self.config.get("max_retries", 2)))),
                "solve_cloudflare": False,
                "max_pages": 1,
            },
        })
        for entry in feed.entries[:max_entries]:
            result.records_found += 1
            title = entry.get("title", "")
            summary = entry.get("summary", entry.get("description", ""))
            link = entry.get("link", "")
            published = _parse_date(entry.get("published", entry.get("updated", "")))

            # Monitoring must not mix old archive articles with the current
            # outbreak signal. Entries without a trustworthy publication year
            # are excluded when current-year mode is enabled.
            if not _is_current_year(published):
                continue

            text = f"{title}\n\n{summary}" if title else summary
            if not text.strip():
                continue

            normalized_link = normalize_url(link) if link else ""
            if normalized_link and (normalized_link in published_urls or db.is_url_already_processed(normalized_link)):
                logger.info("Skipping already processed RSS URL: %s", link)
                continue

            extracted = None
            if fetch_full_article and normalized_link and full_article_attempts < full_article_limit:
                full_article_attempts += 1
                try:
                    extracted = await article_collector.extract_url(normalized_link)
                    article_content = str(extracted.get("content") or "").strip()
                    if article_content:
                        title = str(extracted.get("title") or title).strip()
                        text = f"{title}\n\n{article_content}" if title else article_content
                        published = extracted.get("published_at") or published
                        logger.info("RSS full article extracted: %s", normalized_link)
                except Exception as exc:
                    logger.warning("RSS full article extraction failed; retaining feed text url=%s error=%s", normalized_link, exc)

            body = text.encode("utf-8")
            # A feed usually contains many entries with the same publication
            # date. Using only the date made MinIO overwrite the previous
            # article on every run.
            entry_key = link or f"{title}\n{published}\n{summary}"
            entry_hash = hashlib.sha256(entry_key.encode("utf-8")).hexdigest()[:32]
            obj_path = f"rss/{self.source['id']}/{entry_hash}.html"
            await asyncio.to_thread(upload_file, obj_path, body, "text/html; charset=utf-8")

            message = {
                "source_type": self.source.get("source_type", "rss"),
                "source_name": self.source.get("name", ""),
                "published_at": published,
                "text": text,
                "url": link,
                "object_path": obj_path,
                "collector_run_id": "",
                "collector_source_id": str(self.source["id"]),
                "source_language": self.config.get("language", ""),
                "source_country": self.config.get("country", ""),
                **identity_fields(link, text),
            }
            if extracted:
                for field in ("normalized_url", "canonical_url", "url_hash", "content_hash", "final_url", "author", "fetch_mode", "http_status"):
                    if extracted.get(field) not in (None, ""):
                        message[field] = extracted[field]
            await asyncio.to_thread(rabbitmq.publish, message)
            if normalized_link:
                published_urls.add(normalized_link)
            result.records_ingested += 1

        return result
