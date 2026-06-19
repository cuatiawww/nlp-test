from .base import BaseCollector, CollectResult
from .. import rabbitmq
from ..minio_client import upload_file


class SocialMediaCollector(BaseCollector):
    def collect(self) -> CollectResult:
        result = CollectResult()
        platform = self.config.get("platform", "twitter")
        keywords = self.config.get("keywords", [])
        api_key = self.config.get("api_key", "")

        if not keywords:
            result.error_message = "No keywords configured"
            return result

        if platform == "twitter" and not api_key:
            result.error_message = "No Twitter API key configured — skipping"
            return result

        if platform == "twitter" and api_key:
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
                            "url": f"https://twitter.com/i/web/status/{tweet.id}",
                            "object_path": obj_path,
                            "collector_run_id": "",
                            "collector_source_id": str(self.source["id"]),
                        })
                        result.records_ingested += 1
                else:
                    result.records_found = 0
            except ImportError:
                result.error_message = "tweepy not installed — social media collector is a placeholder"
            except Exception as e:
                result.error_message = f"Twitter API error: {e}"
        else:
            result.error_message = f"Unsupported platform: {platform}"

        return result
