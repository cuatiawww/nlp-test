import datetime
import hashlib
import os
import feedparser
from .base import BaseCollector, CollectResult
from .. import rabbitmq
from ..minio_client import upload_file


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
    def collect(self) -> CollectResult:
        result = CollectResult()
        url = self.config.get("url", "")
        if not url:
            result.error_message = "No RSS URL configured"
            return result

        feed = feedparser.parse(url)
        if feed.bozo and not feed.entries:
            result.error_message = f"Failed to parse feed: {feed.bozo_exception}"
            return result

        for entry in feed.entries:
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

            body = text.encode("utf-8")
            # A feed usually contains many entries with the same publication
            # date. Using only the date made MinIO overwrite the previous
            # article on every run.
            entry_key = link or f"{title}\n{published}\n{summary}"
            entry_hash = hashlib.sha256(entry_key.encode("utf-8")).hexdigest()[:32]
            obj_path = f"rss/{self.source['id']}/{entry_hash}.html"
            upload_file(obj_path, body, "text/html; charset=utf-8")

            rabbitmq.publish({
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
            })
            result.records_ingested += 1

        return result
