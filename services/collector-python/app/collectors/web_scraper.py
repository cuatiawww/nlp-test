import requests
from bs4 import BeautifulSoup
from .base import BaseCollector, CollectResult
from .. import rabbitmq
from ..minio_client import upload_file


class WebScraperCollector(BaseCollector):
    def collect(self) -> CollectResult:
        result = CollectResult()
        urls = self.config.get("urls", [self.config.get("url", "")])
        title_sel = self.config.get("title_selector", "h1")
        body_sel = self.config.get("body_selector", "article")
        headers = {"User-Agent": "Mozilla/5.0 (compatible; DiseaseCollector/1.0)"}

        for url in urls:
            if not url:
                continue
            result.records_found += 1
            try:
                resp = requests.get(url, headers=headers, timeout=30)
                resp.raise_for_status()
                soup = BeautifulSoup(resp.text, "lxml")
                title_el = soup.select_one(title_sel)
                title = title_el.get_text(strip=True) if title_el else ""
                body_el = soup.select_one(body_sel)
                body_text = body_el.get_text(strip=True) if body_el else resp.text[:5000]

                text = f"{title}\n\n{body_text}" if title else body_text
                if not text.strip():
                    continue

                obj_path = f"web/{self.source['id']}/{hash(url)}.html"
                upload_file(obj_path, resp.text.encode("utf-8"), "text/html; charset=utf-8")

                rabbitmq.publish({
                    "source_type": "web",
                    "source_name": self.source.get("name", ""),
                    "published_at": "",
                    "text": text,
                    "url": url,
                    "object_path": obj_path,
                    "collector_run_id": "",
                    "collector_source_id": str(self.source["id"]),
                })
                result.records_ingested += 1
            except Exception as e:
                result.error_message = f"Failed to scrape {url}: {e}"

        return result
