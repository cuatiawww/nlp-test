"""PDF-only branch. HTML extraction remains in WebScraperCollector."""
import hashlib
import io
import json
import os
import re
from urllib.parse import urlparse

class PDFExtractionError(ValueError):
    def __init__(self, message, object_path):
        super().__init__(message + "; original retained at " + object_path)
        self.object_path = object_path

def is_pdf(url, content_type, prefix):
    return (content_type.lower().split(";")[0].strip() == "application/pdf"
            or urlparse(url).path.lower().endswith(".pdf")
            or prefix.lstrip().startswith(b"%PDF-"))

def _clean_title(raw_title, url):
    if raw_title and str(raw_title).strip() and not str(raw_title).strip().lower().endswith((".docx", ".doc", ".pdf", ".tmp")):
        return str(raw_title).strip()
    filename = urlparse(url).path.rsplit("/", 1)[-1]
    name_no_ext = filename.rsplit(".", 1)[0]
    cleaned = re.sub(r"[-_]+", " ", name_no_ext).strip()
    return cleaned.title() if cleaned else "Dokumen PDF"

def extract_pdf(data, url, upload):
    import pdfplumber
    key = "pdf/" + hashlib.sha256(data).hexdigest() + ".pdf"
    upload(key, data, "application/pdf")
    try:
        texts, tables = [], []
        with pdfplumber.open(io.BytesIO(data)) as document:
            if len(document.pages) > 50:
                raise ValueError("PDF melebihi batas interaktif 50 halaman")
            title = _clean_title((document.metadata or {}).get("Title"), url)
            for number, page in enumerate(document.pages, 1):
                found = page.find_tables()
                if found:
                    boxes = [table.bbox for table in found]
                    def outside(obj):
                        return not any(
                            obj.get("x0", -1) >= box[0] and obj.get("x1", -1) <= box[2]
                            and obj.get("top", -1) >= box[1] and obj.get("bottom", -1) <= box[3]
                            for box in boxes)
                    narrative = page.filter(outside).extract_text() or ""
                    for table in found:
                        tables.append({"page": number, "bbox": list(table.bbox), "rows": table.extract()})
                else:
                    narrative = page.extract_text() or ""
                texts.append(narrative)
        if not any(text.strip() for text in texts) and not tables:
            raise ValueError("Tidak ditemukan teks digital pada PDF; kemungkinan dokumen hasil scan (memerlukan OCR review)")
        upload(key + ".tables.json", json.dumps(tables, ensure_ascii=False).encode(), "application/json")
        return {
            "url": url,
            "title": title,
            "content": "\n\n".join(texts),
            "document_type": "pdf",
            "object_path": key,
            "pdf_tables": tables,
            "fetch_mode": "pdf",
            "http_status": 200,
            "published_at": None,
        }
    except Exception as exc:
        raise PDFExtractionError("PDF extraction failed: " + str(exc), key) from exc

def try_pdf(url, enabled=None):
    if enabled is None:
        enabled = os.getenv("PDF_ROUTING_ENABLED", "true").lower() in ("true", "1", "yes", "on")
    is_pdf_url = urlparse(url).path.lower().endswith(".pdf")
    if not enabled and not is_pdf_url:
        return None
    import requests
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    from ..minio_client import upload_file

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/125.0.0.0 Safari/537.36"
        ),
        "Accept": "application/pdf,application/xhtml+xml,text/html;q=0.9,*/*;q=0.8",
    }
    with requests.get(url, stream=True, headers=headers, timeout=(5, 20), verify=False) as response:
        response.raise_for_status()
        chunks = response.iter_content(8192)
        prefix = next(chunks, b"")
        if not is_pdf(response.url, response.headers.get("Content-Type", ""), prefix):
            return None
        data = bytearray(prefix)
        for chunk in chunks:
            data.extend(chunk)
            if len(data) > 15 * 1024 * 1024:
                raise ValueError("Ukuran file PDF melebihi batas 15 MB")
        return extract_pdf(bytes(data), response.url, upload_file)
