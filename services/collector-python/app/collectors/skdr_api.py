import datetime as dt
import hashlib
import json
import logging
import random
import re
import time
from typing import Any

import requests

from .. import config, db, rabbitmq
from .base import BaseCollector, CollectResult

logger = logging.getLogger(__name__)


def _key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def _first(record: dict, names: tuple[str, ...], default=None):
    normalized = {_key(str(k)): v for k, v in record.items()}
    for name in names:
        value = normalized.get(_key(name))
        if value not in (None, ""):
            return value
    return default


def _as_date(value: Any) -> str | None:
    if not value:
        return None
    if isinstance(value, (dt.date, dt.datetime)):
        return value.strftime("%Y-%m-%d")
    raw = str(value).strip()
    try:
        from dateutil.parser import parse
        return parse(raw).strftime("%Y-%m-%d")
    except Exception:
        match = re.search(r"(\d{4})[-/]?(\d{2})[-/]?(\d{2})", raw)
        return "-".join(match.groups()) if match else None


def _as_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    match = re.search(r"-?\d+", str(value).replace(".", ""))
    try:
        return int(match.group(0)) if match else None
    except ValueError:
        return None


def _find_list(value: Any) -> list[dict]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if not isinstance(value, dict):
        return []
    preferred = ("data", "items", "results", "rows", "records", "list", "result")
    for name in preferred:
        for key, child in value.items():
            if _key(str(key)) == _key(name):
                found = _find_list(child)
                if found or isinstance(child, list):
                    return found
    for child in value.values():
        found = _find_list(child)
        if found:
            return found
    return []


def _meta_int(value: Any, names: tuple[str, ...]) -> int | None:
    if not isinstance(value, dict):
        return None
    for name in names:
        raw = _first(value, (name,))
        parsed = _as_int(raw)
        if parsed is not None:
            return parsed
    return None


class SKDRCollector(BaseCollector):
    """Collector for SKDR EBS and Alert multipart APIs."""

    def __init__(self, source: dict):
        super().__init__(source)
        self.session = requests.Session()
        self.requests_made = 0

    @property
    def api_endpoint(self) -> str:
        return str(self.config.get("endpoint", "ebs")).lower().strip("/")

    @property
    def endpoint_name(self) -> str:
        # IBS is the application/database label for the technical /api/Alert
        # endpoint. Keep api_endpoint separate so the URL remains unchanged.
        return "ibs" if self.api_endpoint == "alert" else self.api_endpoint

    def _year(self) -> int:
        configured = str(self.config.get("year", "current")).strip().lower()
        if configured in {"", "current", "latest"}:
            return dt.date.today().year
        return int(configured)

    def _request(self, endpoint: str, fields: dict[str, Any]) -> Any:
        if not config.SKDR_USER_KEY:
            raise RuntimeError("SKDR_USER_KEY belum dikonfigurasi di environment collector")
        if self.requests_made >= config.SKDR_MAX_REQUESTS_PER_RUN:
            raise RuntimeError("SKDR request budget tercapai; jalankan ulang untuk melanjutkan")

        url = f"{config.SKDR_API_URL.rstrip('/')}/{endpoint.lstrip('/')}"
        # requests files= is intentional: the supplied curl uses --form,
        # which sends multipart/form-data rather than JSON or urlencoded data.
        multipart = {name: (None, str(value)) for name, value in fields.items()}
        retryable = {408, 425, 429, 500, 502, 503, 504}
        for attempt in range(config.SKDR_MAX_RETRIES + 1):
            try:
                response = self.session.post(
                    url,
                    headers={"User-Key": config.SKDR_USER_KEY},
                    files=multipart,
                    timeout=config.SKDR_REQUEST_TIMEOUT_SECONDS,
                )
                self.requests_made += 1
                if response.status_code == 429:
                    retry_after = response.headers.get("Retry-After")
                    delay = float(retry_after) if retry_after and retry_after.isdigit() else None
                    if delay is None:
                        delay = min(config.SKDR_BACKOFF_MAX_SECONDS,
                                    config.SKDR_BACKOFF_BASE_SECONDS * (2 ** attempt))
                    if attempt >= config.SKDR_MAX_RETRIES:
                        response.raise_for_status()
                    logger.warning("SKDR rate limited; retry %d/%d after %.1fs", attempt + 1, config.SKDR_MAX_RETRIES, delay)
                    time.sleep(delay)
                    continue
                if response.status_code in {401, 403}:
                    raise RuntimeError(f"SKDR authentication rejected ({response.status_code})")
                if response.status_code in retryable and attempt < config.SKDR_MAX_RETRIES:
                    delay = min(config.SKDR_BACKOFF_MAX_SECONDS,
                                config.SKDR_BACKOFF_BASE_SECONDS * (2 ** attempt))
                    logger.warning("SKDR HTTP %d; retry %d/%d after %.1fs", response.status_code, attempt + 1, config.SKDR_MAX_RETRIES, delay)
                    time.sleep(delay)
                    continue
                response.raise_for_status()
                return response.json()
            except (requests.Timeout, requests.ConnectionError) as exc:
                if attempt >= config.SKDR_MAX_RETRIES:
                    raise RuntimeError(f"SKDR connection failed: {exc}") from exc
                delay = min(config.SKDR_BACKOFF_MAX_SECONDS,
                            config.SKDR_BACKOFF_BASE_SECONDS * (2 ** attempt))
                logger.warning("SKDR connection error; retry %d/%d after %.1fs", attempt + 1, config.SKDR_MAX_RETRIES, delay)
                time.sleep(delay)
        raise RuntimeError("SKDR request failed")

    def _throttle(self):
        delay = config.SKDR_REQUEST_DELAY_SECONDS
        if config.SKDR_REQUEST_JITTER_SECONDS:
            delay += random.uniform(0, config.SKDR_REQUEST_JITTER_SECONDS)
        if delay:
            time.sleep(delay)

    def _page_records(self, endpoint: str, year: int, page: int, week: int | None, limit: int):
        fields = {"tahun": year, "limit": limit, "page": page}
        if week is not None:
            fields["minggu"] = week
        payload = self._request(endpoint, fields)
        records = _find_list(payload)
        return payload, records

    def _normalize_record(self, record: dict, year: int, week: int | None, page: int) -> dict:
        external_id = _first(record, ("id", "id_ebs", "id_alert", "id_event", "uuid", "kode", "code", "nomor"))
        disease = _first(record, ("penyakit", "nama_penyakit", "disease", "disease_name", "jenis"), "")
        location = _first(record, ("lokasi", "wilayah", "provinsi", "kabupaten", "kota", "location", "region"), "")
        cases = _first(record, ("kasus", "jumlah_kasus", "case_count", "cases", "jumlah"), "")
        deaths = _first(record, ("kematian", "jumlah_kematian", "death_count", "deaths", "meninggal"), "")
        report_date = _as_date(_first(record, ("tanggal", "tanggal_laporan", "date", "report_date", "created_at", "updated_at")))
        semantic = "|".join(str(value or "").strip().lower() for value in (year, week, disease, location, cases, deaths, report_date))
        dedupe_key = hashlib.sha256(
            (f"id|{year}|{external_id}" if external_id else f"semantic|{semantic}").encode("utf-8")
        ).hexdigest()
        normalized_text = (
            f"SKDR {self.endpoint_name.upper()}\n"
            f"Penyakit: {disease}\nLokasi: {location}\n"
            f"Kasus: {cases}\nKematian: {deaths}\n"
            f"Tahun: {year}\nMinggu epidemiologi: {week or ''}\n"
            f"Tanggal laporan: {report_date or ''}\n"
            f"Data SKDR: {json.dumps(record, ensure_ascii=False, sort_keys=True)}"
        )
        return {
            "source_id": self.source["id"],
            "endpoint_name": self.endpoint_name,
            "external_key": str(external_id) if external_id is not None else None,
            "report_year": year,
            "epidemiological_week": week,
            "report_date": report_date,
            "page_number": page,
            "payload": record,
            "normalized_text": normalized_text,
            "dedupe_key": dedupe_key,
        }

    def _ingest_page(self, endpoint: str, year: int, page: int, week: int | None, limit: int, result: CollectResult) -> bool:
        payload, records = self._page_records(endpoint, year, page, week, limit)
        result.records_found += len(records)
        for raw_record in records:
            item = self._normalize_record(raw_record, year, week, page)
            if self.config.get("dry_run"):
                continue
            saved = db.upsert_skdr_report(item)
            if not saved["should_enqueue"]:
                continue
            rabbitmq.publish({
                "source_type": "skdr_api",
                "source_name": self.source.get("name", "SKDR"),
                "published_at": item["report_date"] or f"{year}-01-01",
                "text": item["normalized_text"],
                "url": None,
                "object_path": None,
                "collector_source_id": str(self.source["id"]),
                "skdr_report_id": saved["id"],
                "source_language": "id",
                "source_country": "Indonesia",
            })
            db.mark_skdr_enqueued(saved["id"])
            result.records_ingested += 1
        if records:
            self._throttle()
        total_pages = _meta_int(payload, ("total_pages", "last_page", "pages"))
        has_more = _first(payload, ("has_more", "hasNext", "next_page")) if isinstance(payload, dict) else None
        if isinstance(has_more, bool):
            return has_more
        if total_pages is not None:
            return page < total_pages
        return len(records) >= limit

    def collect(self) -> CollectResult:
        result = CollectResult()
        if self.api_endpoint not in {"ebs", "alert"}:
            result.error_message = "SKDR endpoint harus ebs atau alert"
            return result
        year = self._year()
        limit = int(self.config.get("limit") or (config.SKDR_ALERT_LIMIT if self.api_endpoint == "alert" else config.SKDR_EBS_LIMIT))
        # Keep the API's documented casing for Alert; some deployments may
        # route this path case-sensitively.
        endpoint = {"ebs": "api/ebs", "alert": "api/Alert"}[self.api_endpoint]
        try:
            if self.api_endpoint == "alert":
                mode = str(self.config.get("mode", "daily")).lower()
                if self.config.get("startup_sync") and not db.skdr_has_records(
                    str(self.source["id"]), year, self.endpoint_name
                ):
                    # The first startup performs a one-time historical fill.
                    # Later restarts fall back to the normal recent-week sync.
                    mode = "backfill"
                current_week = int(self.config.get("to_week", 0) or dt.date.today().isocalendar().week)
                start_week = int(self.config.get("from_week", 0) or max(1, current_week - config.SKDR_ALERT_LOOKBACK_WEEKS + 1))
                if mode == "backfill":
                    start_week = int(self.config.get("from_week", 1))
                for week in range(start_week, current_week + 1):
                    page = 1
                    while self._ingest_page(endpoint, year, page, week, limit, result):
                        page += 1
            else:
                page = 1
                while self._ingest_page(endpoint, year, page, None, limit, result):
                    page += 1
        except Exception as exc:
            logger.exception("SKDR %s collection failed", self.endpoint_name)
            result.error_message = str(exc)
        return result
