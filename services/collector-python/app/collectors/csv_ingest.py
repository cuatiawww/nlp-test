import csv
import io
import requests
from .base import BaseCollector, CollectResult
from .. import rabbitmq
from ..minio_client import upload_file


class CSVIngestCollector(BaseCollector):
    def collect(self) -> CollectResult:
        result = CollectResult()
        url = self.config.get("url", "")
        column_mapping = self.config.get("column_mapping", {})
        delimiter = self.config.get("delimiter", ",")
        encoding = self.config.get("encoding", "utf-8")

        if not url:
            result.error_message = "No CSV URL configured"
            return result

        try:
            resp = requests.get(url, timeout=30)
            resp.raise_for_status()
            content = resp.content.decode(encoding, errors="replace")
            reader = csv.DictReader(io.StringIO(content), delimiter=delimiter)

            for row in reader:
                result.records_found += 1
                text = row.get(column_mapping.get("text", "text"), "")
                title = row.get(column_mapping.get("title", "title"), "")
                source = row.get(column_mapping.get("source", "source"), "")
                date = row.get(column_mapping.get("date", "date"), "")
                url_field = row.get(column_mapping.get("url", "url"), "")

                full_text = f"{title}\n\n{text}" if title else text
                if not full_text.strip():
                    continue

                obj_path = f"csv/{self.source['id']}/{hash(url)}_{hash(full_text)}.csv"
                upload_file(obj_path, content.encode("utf-8"), "text/csv")

                rabbitmq.publish({
                    "source_type": "csv",
                    "source_name": source or self.source.get("name", ""),
                    "published_at": date[:10] if date else "",
                    "text": full_text,
                    "url": url_field or url or "",
                    "object_path": obj_path,
                    "collector_run_id": "",
                    "collector_source_id": str(self.source["id"]),
                })
                result.records_ingested += 1

        except Exception as e:
            result.error_message = f"CSV ingest error: {e}"

        return result
