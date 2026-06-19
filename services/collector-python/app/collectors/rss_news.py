import datetime
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
            published = _parse_date(entry.get("published", ""))

            text = f"{title}\n\n{summary}" if title else summary
            if not text.strip():
                continue

            body = text.encode("utf-8")
            obj_path = f"rss/{self.source['id']}/{published}.html"
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
            })
            result.records_ingested += 1

        return result
