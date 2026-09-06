"""PDF-only branch. HTML extraction remains in WebScraperCollector."""
import hashlib
import io
import json
import os
from urllib.parse import urlparse

class PDFExtractionError(ValueError):
    def __init__(self, message, object_path):
        super().__init__(message + "; original retained at " + object_path)
        self.object_path = object_path

def is_pdf(url, content_type, prefix):
    return (content_type.lower().split(";")[0].strip() == "application/pdf"
            or urlparse(url).path.lower().endswith(".pdf")
            or prefix.lstrip().startswith(b"%PDF-"))

def extract_pdf(data, url, upload):
    import pdfplumber
    key = "pdf/" + hashlib.sha256(data).hexdigest() + ".pdf"
    upload(key, data, "application/pdf")
    try:
        texts, tables = [], []
        with pdfplumber.open(io.BytesIO(data)) as document:
            if len(document.pages) > 50:
                raise ValueError("PDF exceeds 50-page interactive limit")
            title = str((document.metadata or {}).get("Title") or urlparse(url).path.rsplit("/",1)[-1])
            for number, page in enumerate(document.pages, 1):
                found = page.find_tables()
                boxes = [table.bbox for table in found]
                def outside(obj):
                    return not any(
                        obj.get("x0", -1) >= box[0] and obj.get("x1", -1) <= box[2]
                        and obj.get("top", -1) >= box[1] and obj.get("bottom", -1) <= box[3]
                        for box in boxes)
                narrative = page.filter(outside).extract_text() or ""
                texts.append(narrative)
                for table in found:
                    tables.append({"page": number, "bbox": list(table.bbox), "rows": table.extract()})
        if not any(text.strip() for text in texts) and not tables:
            raise ValueError("No PDF text found; OCR review required")
        upload(key + ".tables.json", json.dumps(tables,ensure_ascii=False).encode(), "application/json")
        return {"url":url,"title":title,"content":"\n\n".join(texts),
                "document_type":"pdf","object_path":key,"pdf_tables":tables,
                "fetch_mode":"pdf","http_status":200,"published_at":None}
    except Exception as exc:
        raise PDFExtractionError("PDF extraction failed: " + str(exc),key) from exc

def try_pdf(url, enabled=None):
    if enabled is None:
        enabled = os.getenv("PDF_ROUTING_ENABLED","false").lower() == "true"
    if not enabled:
        return None
    import requests
    from ..minio_client import upload_file
    with requests.get(url,stream=True,timeout=(3,10)) as response:
        response.raise_for_status()
        chunks = response.iter_content(8192)
        prefix = next(chunks,b"")
        if not is_pdf(response.url, response.headers.get("Content-Type",""),prefix):
            return None
        data = bytearray(prefix)
        for chunk in chunks:
            data.extend(chunk)
            if len(data) > 15 * 1024 * 1024:
                raise ValueError("PDF exceeds 15 MB limit")
        return extract_pdf(bytes(data),response.url,upload_file)
