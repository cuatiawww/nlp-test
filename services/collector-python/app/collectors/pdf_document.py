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


_SECTION_HEADING_PATTERN = re.compile(
    r'^(?:'
    r'[0-9]+[.)]\s+[A-Z][\w\s/()\-]{2,80}'
    r'|[A-Z][.)]\s+[A-Z][\w\s/()\-]{2,80}'
    r'|Bab\s+[IVXLCDM]+[\s:.\-]+[^\r\n]{2,80}'
    r'|(?:Situasi|Laporan|Perkembangan|Distribusi|Surveilans|Ringkasan)\s+(?:Global|Regional|Nasional|Provinsi|Kabupaten|Kota|Wabah|KLB|Kasus|Penyakit|Terkini|Mingguan)[\w\s/()\-]{0,50}'
    r')(?:[:])?$',
    re.IGNORECASE
)

def _detect_sections(page_texts: list[str]) -> list[dict]:
    """Detect logical sections across extracted pages."""
    sections = []
    current_title = "Overview"
    current_page = 1
    current_lines = []

    for page_num, text in enumerate(page_texts, 1):
        if not text:
            continue
        lines = text.split("\n")
        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue
            match = _SECTION_HEADING_PATTERN.match(stripped)
            if match and len(stripped) <= 100:
                if current_lines:
                    sections.append({
                        "title": current_title,
                        "page": current_page,
                        "content": "\n".join(current_lines).strip()
                    })
                    current_lines = []
                current_title = stripped
                current_page = page_num
            else:
                current_lines.append(stripped)

    if current_lines:
        sections.append({
            "title": current_title,
            "page": current_page,
            "content": "\n".join(current_lines).strip()
        })

    return sections

def extract_pdf(data, url, upload):
    import pdfplumber
    key = "pdf/" + hashlib.sha256(data).hexdigest() + ".pdf"
    upload(key, data, "application/pdf")
    try:
        texts, tables = [], []
        with pdfplumber.open(io.BytesIO(data)) as document:
            max_pages = int(os.getenv("PDF_MAX_PAGES", "200"))
            pages_to_process = document.pages[:max_pages]
            title = _clean_title((document.metadata or {}).get("Title"), url)
            max_table_pages = int(os.getenv("PDF_MAX_TABLE_PAGES", "30"))
            for number, page in enumerate(pages_to_process, 1):
                if number <= max_table_pages and len(tables) < 50:
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
                else:
                    narrative = page.extract_text() or ""
                texts.append(narrative)
        if not any(text.strip() for text in texts) and not tables:
            raise ValueError("Tidak ditemukan teks digital pada PDF; kemungkinan dokumen hasil scan (memerlukan OCR review)")
        upload(key + ".tables.json", json.dumps(tables, ensure_ascii=False).encode(), "application/json")
        sections = _detect_sections(texts)
        return {
            "url": url,
            "title": title,
            "content": "\n\n".join(texts),
            "sections": sections,
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
        "Accept-Encoding": "gzip, deflate",
        "Connection": "keep-alive",
    }
    # This is the socket/download budget only; PDF parsing has its own outer
    # interactive extraction budget in collector/main.py.
    download_timeout = int(os.getenv("PDF_DOWNLOAD_TIMEOUT", "90"))
    with requests.get(url, stream=True, headers=headers, timeout=(10, download_timeout), verify=False) as response:
        response.raise_for_status()
        chunks = response.iter_content(65536)
        prefix = next(chunks, b"")
        if not is_pdf(response.url, response.headers.get("Content-Type", ""), prefix):
            return None
        data = bytearray(prefix)
        max_mb = int(os.getenv("PDF_MAX_MB", "35"))
        max_bytes = max_mb * 1024 * 1024
        for chunk in chunks:
            data.extend(chunk)
            if len(data) > max_bytes:
                raise ValueError(f"Ukuran file PDF melebihi batas {max_mb} MB")
        return extract_pdf(bytes(data), response.url, upload_file)
