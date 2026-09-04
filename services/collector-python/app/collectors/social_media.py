import hashlib

import feedparser
import requests

from .base import BaseCollector, CollectResult
from .. import rabbitmq
from ..minio_client import upload_file

SOCIAL_RSS_MAX_ENTRIES = 100


class SocialMediaCollector(BaseCollector):
    def collect(self) -> CollectResult:
        result = CollectResult()
        platform = self.config.get("platform", "twitter")
        keywords = self.config.get("keywords", [])
        # SourceForm and older database rows store the feed as `url`, while
        # the original social-media collector expected `rss_url`. Accept both
        # shapes so a Social Media source created from the UI actually runs.
        rss_url = self.config.get("rss_url") or self.config.get("url", "")

        # RSS-based mode (no API key required)
        if platform == "twitter_rss" or rss_url:
            return self._collect_rss(result, rss_url)

        # API key mode
        api_key = self.config.get("api_key", "")
        if not api_key:
            result.error_message = "No API key or RSS URL configured"
            return result

        if platform == "twitter":
            try:
                import tweepy
                client = tweepy.Client(bearer_token=api_key)
                query = " OR ".join(keywords) + " -is:retweet lang:id"
                tweets = client.search_recent_tweets(query=query, max_results=10)
                if tweets.data:
                    for tweet in tweets.data:
                        result.records_found += 1
                        text = tweet.text
                        obj_path = f"social/{self.source['id']}/{tweet.id}.json"
                        upload_file(obj_path, text.encode("utf-8"), "application/json")
                        rabbitmq.publish({
                            "source_type": "social_media",
                            "source_name": self.source.get("name", ""),
                            "published_at": "",
                            "text": text,
                            "url": f"https://x.com/i/web/status/{tweet.id}",
                            "object_path": obj_path,
                            "collector_run_id": "",
                            "collector_source_id": str(self.source["id"]),
                        })
                        result.records_ingested += 1
                else:
                    result.records_found = 0
            except ImportError:
                result.error_message = "tweepy not installed"
            except Exception as e:
                result.error_message = f"Twitter API error: {e}"
        else:
            result.error_message = f"Unsupported platform: {platform}"

        return result

    def _collect_rss(self, result: CollectResult, rss_url: str) -> CollectResult:
        """Collect from social media RSS feeds (Nitter, Instagram bridges, etc.)"""
        try:
            feed = feedparser.parse(rss_url)
            if feed.bozo and not feed.entries:
                result.error_message = f"RSS parse error: {feed.bozo_exception}"
                return result

            max_entries = SOCIAL_RSS_MAX_ENTRIES

            for entry in feed.entries[:max_entries]:
                result.records_found += 1
                title = entry.get("title", "")
                summary = entry.get("summary", "")
                link = entry.get("link", "")
                published = entry.get("published", "")

                text = f"{title}\n\n{summary}" if title else summary
                if not text.strip():
                    continue

                from .. import config as app_config
                try:
                    from dateutil.parser import parse as parse_date
                    published = parse_date(published).strftime("%Y-%m-%d")
                except Exception:
                    published = ""

                # Python's built-in hash() is randomized per process. A
                # stable digest keeps the object path deterministic after a
                # restart and avoids overwriting unrelated entries.
                entry_key = link or f"{title}\n{published}\n{summary}"
                entry_hash = hashlib.sha256(entry_key.encode("utf-8")).hexdigest()[:32]
                obj_path = f"social/rss/{self.source['id']}/{entry_hash}.json"
                upload_file(obj_path, text.encode("utf-8"), "application/json")

                rabbitmq.publish({
                    "source_type": "social_media",
                    "source_name": self.source.get("name", ""),
                    "published_at": published,
                    "text": text,
                    "url": link,
                    "object_path": obj_path,
                    "collector_run_id": "",
                    "collector_source_id": str(self.source["id"]),
                })
                result.records_ingested += 1

        except Exception as e:
            result.error_message = f"RSS social media error: {e}"

        return result
