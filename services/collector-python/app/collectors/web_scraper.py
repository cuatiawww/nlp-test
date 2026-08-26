import asyncio
import hashlib
import json
import logging
import re
from contextlib import AsyncExitStack
from dataclasses import dataclass
from typing import Any, Optional
from urllib.parse import urlparse

from .base import BaseCollector, CollectResult

logger = logging.getLogger(__name__)
BLOCKED_STATUSES = {403, 429, 503}
CHALLENGE_MARKERS = (
    "just a moment", "checking your browser", "cf-browser-verification",
    "cf-chl-", "cloudflare ray id", "challenge-platform",
)

# ReliefWeb report URLs carry the affected country in a stable path segment,
# e.g. /report/south-sudan/....  Use this as geographic context, never as a
# coordinate source.  Coordinates still come only from the NLP gazetteer.
URL_COUNTRY_SLUGS = {
    "brunei": "Brunei",
    "cambodia": "Cambodia",
    "indonesia": "Indonesia",
    "laos": "Laos",
    "malaysia": "Malaysia",
    "myanmar": "Myanmar",
    "philippines": "Philippines",
    "singapore": "Singapore",
    "thailand": "Thailand",
    "timor-leste": "Timor-Leste",
    "vietnam": "Vietnam",
    "south-sudan": "South Sudan",
    "sudan": "Sudan",
}


def _country_hint_from_url(url: str) -> str:
    parsed = urlparse(url)
    segments = [segment.strip().lower() for segment in parsed.path.split("/") if segment.strip()]
    for index, segment in enumerate(segments[:-1]):
        if segment == "report":
            return URL_COUNTRY_SLUGS.get(segments[index + 1], "")
    return ""


@dataclass
class FetchOutcome:
    page: Any
    html: str
    status: int
    mode: str


def _response_html(page: Any) -> str:
    html = getattr(page, "html_content", "")
    if html:
        return str(html)
    body = getattr(page, "body", b"")
    if isinstance(body, bytes):
        return body.decode("utf-8", errors="replace")
    return str(body or "")


def _is_challenge(status: int, html: str) -> bool:
    if status in BLOCKED_STATUSES:
        return True
    sample = html[:100_000].lower()
    return any(marker in sample for marker in CHALLENGE_MARKERS)


def _selected_text(page: Any, selector: str) -> str:
    if not selector:
        return ""
    matches = page.css(selector)
    element = getattr(matches, "first", None)
    if element is None and matches:
        element = matches[0]
    if element is None:
        return ""
    return str(element.get_all_text(separator=" ", strip=True)).strip()


def _extract_main_content(html: str, title_selector: str = "") -> tuple[str, str]:
    """Return title and boilerplate-free main content; never fall back to full body."""
    from bs4 import BeautifulSoup
    from trafilatura import extract, extract_metadata

    content = extract(
        html,
        output_format="txt",
        include_comments=False,
        include_tables=False,
        favor_precision=True,
        deduplicate=True,
    )
    metadata = extract_metadata(html)
    title = (metadata.title or "").strip() if metadata else ""

    soup = BeautifulSoup(html, "lxml")
    for node in soup.select(
        "script, style, noscript, svg, template, nav, footer, header, aside, "
        ".advertisement, .ads, .social-share, .related, .recommended"
    ):
        node.decompose()
    if title_selector:
        title_node = soup.select_one(title_selector)
        if title_node:
            title = title_node.get_text(" ", strip=True)
    if not title:
        title_node = soup.select_one("h1") or soup.select_one("title")
        title = title_node.get_text(" ", strip=True) if title_node else ""

    if not content:
        main_node = (
            soup.select_one("article")
            or soup.select_one("main")
            or soup.select_one('[role="main"]')
        )
        content = main_node.get_text(" ", strip=True) if main_node else ""
    content = " ".join((content or "").split())
    if len(content) < 80:
        raise ValueError("No sufficiently long main content found on page")
    return title, content


def _normalize_published_date(value: Any) -> str:
    """Normalize common publisher date formats to the DB DATE format."""
    if not value:
        return ""
    raw = str(value).strip()
    if not raw:
        return ""
    # ISO/RFC dates are the common case.  Keep this deliberately strict so a
    # page's update time or an arbitrary number is not stored as publication.
    match = re.search(r"(20\d{2}-\d{2}-\d{2})", raw)
    if match:
        return match.group(1)
    try:
        from dateutil.parser import parse
        return parse(raw, fuzzy=False).date().isoformat()
    except (TypeError, ValueError, OverflowError):
        return ""


def _extract_published_at(html: str) -> str:
    """Read publication time from metadata, not from article prose."""
    from bs4 import BeautifulSoup
    from trafilatura import extract_metadata

    soup = BeautifulSoup(html, "lxml")
    candidates: list[Any] = []
    for selector in (
        'meta[property="article:published_time"]',
        'meta[property="og:published_time"]',
        'meta[name="pubdate"]',
        'meta[name="publishdate"]',
        'meta[name="date"]',
        'time[datetime]',
    ):
        node = soup.select_one(selector)
        if node:
            candidates.append(node.get("content") or node.get("datetime"))

    # JSON-LD is often the only reliable source on news sites.
    for node in soup.select('script[type="application/ld+json"]'):
        try:
            payload = json.loads(node.string or node.get_text())
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
        objects = payload if isinstance(payload, list) else [payload]
        for item in objects:
            if isinstance(item, dict):
                candidates.extend((item.get("datePublished"), item.get("dateCreated")))

    metadata = extract_metadata(html)
    if metadata:
        candidates.append(getattr(metadata, "date", None))

    for candidate in candidates:
        normalized = _normalize_published_date(candidate)
        if normalized:
            return normalized
    return ""


class WebScraperCollector(BaseCollector):
    async def extract_url(self, url: str) -> dict:
        """Fetch one URL for interactive analysis without publishing it."""
        fetch_mode = str(self.config.get("fetch_mode", "auto")).lower()
        if fetch_mode not in {"auto", "http", "stealth"}:
            raise ValueError(f"Invalid fetch_mode: {fetch_mode}")

        async with AsyncExitStack() as stack:
            outcome, _ = await self._fetch(url, fetch_mode, "body", None, stack)

        title, content = _extract_main_content(outcome.html)
        return {
            "url": url,
            "title": title,
            "content": content,
            "fetch_mode": outcome.mode,
            "http_status": outcome.status,
            "source_country": _country_hint_from_url(url),
            "published_at": _extract_published_at(outcome.html),
        }

    async def collect(self) -> CollectResult:
        result = CollectResult()
        urls = self.config.get("urls", [self.config.get("url", "")])
        if isinstance(urls, str):
            urls = [urls]
        fetch_mode = str(self.config.get("fetch_mode", "auto")).lower()
        if fetch_mode not in {"auto", "http", "stealth"}:
            result.error_message = f"Invalid fetch_mode: {fetch_mode}"
            return result

        title_selector = self.config.get("title_selector", "h1")
        body_selector = self.config.get("body_selector", "article")
        failures = []
        async with AsyncExitStack() as stack:
            stealth_session = None
            for url in urls:
                if not url:
                    continue
                result.records_found += 1
                try:
                    outcome, stealth_session = await self._fetch(
                        url, fetch_mode, body_selector, stealth_session, stack
                    )
                    title, body_text = _extract_main_content(
                        outcome.html, title_selector=title_selector
                    )
                    published_at = _extract_published_at(outcome.html)
                    text = f"{title}\n\n{body_text}" if title else body_text
                    url_hash = hashlib.sha256(url.encode("utf-8")).hexdigest()
                    obj_path = f"web/{self.source['id']}/{url_hash}.html"
                    from .. import rabbitmq
                    from ..minio_client import upload_file

                    await asyncio.to_thread(
                        upload_file, obj_path, outcome.html.encode("utf-8"),
                        "text/html; charset=utf-8",
                    )
                    await asyncio.to_thread(rabbitmq.publish, {
                        "source_type": "web",
                        "source_name": self.source.get("name", ""),
                        "published_at": published_at,
                        "text": text,
                        "url": url,
                        "object_path": obj_path,
                        "collector_run_id": "",
                        "collector_source_id": str(self.source["id"]),
                        "fetch_mode": outcome.mode,
                        "http_status": outcome.status,
                        "source_country": self.config.get("country") or _country_hint_from_url(url),
                    })
                    result.records_ingested += 1
                    logger.info("Scraped %s mode=%s status=%d", url, outcome.mode, outcome.status)
                except Exception as exc:
                    logger.exception("Failed to scrape %s", url)
                    failures.append(f"{url}: {exc}")
        if failures:
            result.error_message = "; ".join(failures)[:4000]
        return result

    async def _fetch(self, url: str, fetch_mode: str, body_selector: str,
                     stealth_session: Optional[Any], stack: AsyncExitStack):
        if fetch_mode != "stealth":
            outcome = await self._fetch_http(url)
            selector_missing = not _selected_text(outcome.page, body_selector)
            blocked = _is_challenge(outcome.status, outcome.html)
            if fetch_mode == "http" or (not blocked and not selector_missing):
                if blocked:
                    raise RuntimeError(f"blocked response status={outcome.status} and fetch_mode=http")
                return outcome, stealth_session
            logger.warning(
                "Falling back to stealth for %s status=%d challenge=%s selector_missing=%s",
                url, outcome.status, blocked, selector_missing,
            )
        if stealth_session is None:
            stealth_session = await stack.enter_async_context(self._new_stealth_session())
        return await self._fetch_stealth(url, stealth_session), stealth_session

    async def _fetch_http(self, url: str) -> FetchOutcome:
        from scrapling.fetchers import AsyncFetcher
        timeout_seconds = max(1, int(self.config.get("timeout_ms", 30_000)) // 1000)
        kwargs = {
            "timeout": timeout_seconds,
            "retries": int(self.config.get("max_retries", 2)),
            "stealthy_headers": True,
            "impersonate": self.config.get("impersonate", "chrome"),
        }
        if self.config.get("proxy"):
            kwargs["proxy"] = self.config["proxy"]
        page = await AsyncFetcher.get(url, **kwargs)
        return FetchOutcome(page, _response_html(page), int(getattr(page, "status", 0) or 0), "http")

    def _new_stealth_session(self):
        from scrapling.fetchers import AsyncStealthySession
        kwargs = {
            "headless": True,
            "solve_cloudflare": bool(self.config.get("solve_cloudflare", True)),
            "block_webrtc": True,
            "disable_resources": bool(self.config.get("disable_resources", True)),
            "timeout": int(self.config.get("timeout_ms", 60_000)),
            "max_pages": max(1, int(self.config.get("max_pages", 2))),
        }
        if self.config.get("proxy"):
            kwargs["proxy"] = self.config["proxy"]
        return AsyncStealthySession(**kwargs)

    async def _fetch_stealth(self, url: str, session: Any) -> FetchOutcome:
        kwargs = {
            "network_idle": bool(self.config.get("network_idle", False)),
            "retries": int(self.config.get("max_retries", 2)),
        }
        if self.config.get("wait_selector"):
            kwargs["wait_selector"] = self.config["wait_selector"]
        page = await session.fetch(url, **kwargs)
        html = _response_html(page)
        status = int(getattr(page, "status", 0) or 0)
        if _is_challenge(status, html):
            raise RuntimeError(f"challenge still present after stealth fetch status={status}")
        return FetchOutcome(page, html, status, "stealth")
