"""Bounded multi-source URL discovery for manual surveillance crawls."""

from __future__ import annotations

import datetime as dt
import html
import json
import logging
import re
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from urllib.parse import parse_qsl, quote_plus, urlencode, urljoin, urlparse, urlsplit, urlunsplit

import requests

from . import config
from .crawler_identity import (
    RETRYABLE_HTTP_STATUSES,
    normalize_url,
    retry_delay,
    validate_public_url,
    wait_for_domain,
)

logger = logging.getLogger(__name__)
MAX_DISCOVERY_BYTES = 8 * 1024 * 1024
MAX_SITEMAP_DEPTH = 2
MAX_NESTED_SITEMAPS = 10
MAX_PAGINATION_PAGES = 10
MAX_RECURSIVE_DEPTH = 2
MAX_CATALOG_SOURCES_PER_DISCOVERY = 80
CATALOG_PAGE_TIMEOUT_SECONDS = 8

ASEAN_COUNTRIES = {
    "brunei", "cambodia", "indonesia", "laos", "malaysia", "myanmar",
    "philippines", "singapore", "thailand", "timor-leste", "vietnam",
}
INTERNATIONAL_COUNTRIES = {
    "international", "global", "world", "asean", "asean / asia", "asia",
}
DISEASE_SYNONYMS = {
    "dengue": (
        "dengue", "dbd", "demam berdarah", "dengue fever",
        "dengue haemorrhagic fever", "dengue hemorrhagic fever",
    ),
    "measles": ("measles", "campak"),
    "cholera": ("cholera", "kolera"),
    "malaria": ("malaria",),
    "mpox": ("mpox", "monkeypox"),
    "covid-19": ("covid-19", "covid", "coronavirus"),
    "influenza": ("influenza", "flu"),
    "avian influenza": ("avian influenza", "h5n1", "bird flu", "flu burung"),
    "hantavirus infection": ("hantavirus", "hantavirus infection"),
}


def _fetch_bytes(url: str, timeout: int = 20) -> tuple[bytes, str, str]:
    """Fetch a bounded discovery document with safe redirects and retries."""
    session = requests.Session()
    session.trust_env = False
    current = validate_public_url(url)
    redirects = 0
    attempt = 0
    while True:
        wait_for_domain(current, config.CRAWLER_DOMAIN_MIN_INTERVAL_SECONDS)
        try:
            response = session.get(
                current,
                timeout=(5, timeout),
                stream=True,
                allow_redirects=False,
                verify=config.CRAWLER_TLS_VERIFY,
                headers={"User-Agent": "DiseaseSurveillanceCrawler/1.0", "Accept": "application/rss+xml, application/xml, text/html;q=0.9"},
            )
        except (requests.Timeout, requests.ConnectionError):
            if attempt >= config.CRAWLER_MAX_RETRIES:
                raise
            time.sleep(retry_delay(attempt, base_seconds=config.CRAWLER_BACKOFF_BASE_SECONDS,
                                   maximum_seconds=config.CRAWLER_BACKOFF_MAX_SECONDS))
            attempt += 1
            continue
        if response.is_redirect or response.is_permanent_redirect:
            location = response.headers.get("Location")
            response.close()
            if not location or redirects >= config.CRAWLER_MAX_REDIRECTS:
                raise RuntimeError("Discovery redirect limit exceeded")
            current = validate_public_url(urljoin(current, location))
            redirects += 1
            continue
        if response.status_code in RETRYABLE_HTTP_STATUSES and attempt < config.CRAWLER_MAX_RETRIES:
            retry_after = response.headers.get("Retry-After")
            response.close()
            time.sleep(retry_delay(attempt, retry_after=retry_after,
                                   base_seconds=config.CRAWLER_BACKOFF_BASE_SECONDS,
                                   maximum_seconds=config.CRAWLER_BACKOFF_MAX_SECONDS))
            attempt += 1
            continue
        response.raise_for_status()
        data = bytearray()
        for chunk in response.iter_content(65536):
            if chunk:
                data.extend(chunk)
            if len(data) > MAX_DISCOVERY_BYTES:
                response.close()
                raise ValueError("Discovery response exceeded 8 MB")
        content_type = response.headers.get("Content-Type", "")
        response.close()
        return bytes(data), current, content_type


def _parse_date(value: str) -> str | None:
    if not value:
        return None
    match = re.search(r"20\d{2}-\d{2}-\d{2}", value)
    if match:
        return match.group(0)
    try:
        from dateutil.parser import parse
        return parse(value).date().isoformat()
    except Exception:
        return None


_ANCHOR_TAG = re.compile(r"</?a\b[^>]*>", re.IGNORECASE)
_UNCLOSED_ANCHOR = re.compile(
    r"<a\s+href\s*=\s*(?:\"[^\"]{0,500}?\"|'[^']{0,500}?'|https?://[^\s\"'<>]+)",
    re.IGNORECASE,
)


def _strip_feed_markup(value: str) -> str:
    """Remove tags, including an unclosed ``<a href=`` left in a Google News title."""
    text = html.unescape(value or "")
    text = _ANCHOR_TAG.sub(" ", text)
    text = _UNCLOSED_ANCHOR.sub(" ", text)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def parse_feed(payload: bytes, source_url: str) -> list[dict]:
    root = ET.fromstring(payload)
    items = root.findall(".//item") or root.findall(".//{*}entry")
    results = []
    for item in items:
        link = (item.findtext("link") or "").strip()
        if not link:
            link_node = item.find("{*}link")
            link = str(link_node.get("href") or "").strip() if link_node is not None else ""
        if not link:
            continue
        title = item.findtext("title") or item.findtext("{*}title") or ""
        summary = item.findtext("description") or item.findtext("{*}summary") or item.findtext("{*}content") or ""
        published = item.findtext("pubDate") or item.findtext("{*}published") or item.findtext("{*}updated") or ""
        results.append({
            "url": urljoin(source_url, html.unescape(link)),
            "title": _strip_feed_markup(title),
            "summary": _strip_feed_markup(summary),
            "published_at": _parse_date(published),
        })
    return results


def parse_sitemap(payload: bytes) -> tuple[str, list[dict]]:
    root = ET.fromstring(payload)
    root_name = root.tag.rsplit("}", 1)[-1].lower()
    entries = []
    if root_name == "sitemapindex":
        for node in root.findall(".//{*}sitemap"):
            location = (node.findtext("{*}loc") or "").strip()
            if location:
                entries.append({"url": location, "published_at": _parse_date(node.findtext("{*}lastmod") or "")})
        return "index", entries
    for node in root.findall(".//{*}url"):
        location = (node.findtext("{*}loc") or "").strip()
        if location:
            entries.append({"url": location, "published_at": _parse_date(node.findtext("{*}lastmod") or "")})
    return "urlset", entries


def parse_html_links(payload: bytes, page_url: str) -> list[dict]:
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(payload, "lxml")
    results = []
    for anchor in soup.select("a[href]"):
        href = str(anchor.get("href") or "").strip()
        if not href:
            continue
        results.append({"url": urljoin(page_url, href), "title": anchor.get_text(" ", strip=True), "published_at": None})
    return results


def expand_disease_terms(names: list[str] | tuple[str, ...] | set[str]) -> list[str]:
    """Expand local-master aliases so campak matches Measles and DBD matches Dengue."""
    terms: list[str] = []
    seen: set[str] = set()
    for name in names:
        folded = str(name or "").strip().casefold()
        if not folded or folded in seen:
            continue
        seen.add(folded)
        terms.append(folded)
        extras: list[str] = []
        for canonical, aliases in DISEASE_SYNONYMS.items():
            alias_list = list(aliases) if not isinstance(aliases, str) else [aliases]
            if folded == canonical or folded in alias_list:
                extras.extend([canonical, *alias_list])
        for extra in extras:
            if extra not in seen:
                seen.add(extra)
                terms.append(extra)
    return terms


def _term_in_text(term: str, haystack: str) -> bool:
    if not term:
        return False
    if len(term) <= 3:
        return re.search(rf"\b{re.escape(term)}\b", haystack) is not None
    return term in haystack


def parse_source_config(source: dict) -> dict:
    raw_config = source.get("config") or {}
    if isinstance(raw_config, str):
        try:
            raw_config = json.loads(raw_config)
        except json.JSONDecodeError:
            return {}
    return raw_config if isinstance(raw_config, dict) else {}


def source_country_value(source: dict) -> str:
    config = parse_source_config(source)
    return str(source.get("country") or config.get("country") or "").strip()


def source_matches_geography(
    source: dict,
    country: str | None,
    region: str | None,
    member_countries: list[str] | None = None,
) -> bool:
    """Keep catalog rows that belong to the manual-crawl country/region filter."""
    source_country = source_country_value(source).casefold()
    target = (country or "").strip().casefold()
    if target:
        if not source_country:
            return False
        if target in source_country or source_country in target:
            return True
        return source_country in INTERNATIONAL_COUNTRIES
    members = {str(name).strip().casefold() for name in (member_countries or []) if str(name).strip()}
    if members:
        if not source_country:
            return False
        return source_country in members or source_country in INTERNATIONAL_COUNTRIES
    if region and region.casefold() == "asean":
        if not source_country:
            return False
        return source_country in ASEAN_COUNTRIES or source_country in INTERNATIONAL_COUNTRIES
    return True


def source_rank(source: dict, country: str | None = None) -> tuple:
    """Prefer the requested country, then Official / Main catalog rows."""
    config = parse_source_config(source)
    validity = str(config.get("validity_status") or "").casefold()
    origin = str(config.get("source_origin") or "").casefold()
    from_engine = str(config.get("from_engine") or "").casefold()
    source_country = source_country_value(source).casefold()
    target = (country or "").strip().casefold()
    country_match = 0
    if target:
        country_match = 0 if target in source_country or source_country in target else 1
    official = 0 if validity == "official" else 1
    main = 0 if origin == "main source" or from_engine == "no" else 1
    enabled = 0 if source.get("enabled") else 1
    return (country_match, official, main, enabled, str(source.get("name") or "").casefold())


def select_manual_crawl_sources(
    sources: list[dict],
    country: str | None,
    region: str | None,
    member_countries: list[str] | None = None,
) -> list[dict]:
    """Use the stored catalog for manual crawl, including disabled scheduler rows."""
    matched = [
        dict(row) for row in sources
        if source_matches_geography(row, country, region, member_countries)
    ]
    matched.sort(key=lambda row: source_rank(row, country))
    return matched


def pagination_urls(start_url: str, max_pages: int, template: str = "", style: str = "query") -> list[str]:
    """Build bounded common pagination forms without guessing indefinitely."""
    limit = min(MAX_PAGINATION_PAGES, max(1, int(max_pages)))
    if template:
        return [template.format(page=page) for page in range(2, limit + 1)]
    parsed = urlsplit(start_url)
    if style == "path":
        base_path = parsed.path.rstrip("/")
        return [urlunsplit((parsed.scheme, parsed.netloc, f"{base_path}/page/{page}", parsed.query, "")) for page in range(2, limit + 1)]
    base_query = [(key, value) for key, value in parse_qsl(parsed.query, keep_blank_values=True) if key.casefold() != "page"]
    return [
        urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode([*base_query, ("page", str(page))]), ""))
        for page in range(2, limit + 1)
    ]


@dataclass
class DiscoveryEngine:
    diseases: list[str]
    country: str | None
    region: str | None
    date_from: str | None
    date_to: str | None
    max_urls: int
    results: list[dict] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    seen: set[str] = field(default_factory=set)
    disease_terms: list[str] = field(init=False, default_factory=list)

    def __post_init__(self) -> None:
        self.disease_terms = expand_disease_terms(self.diseases)

    def _matches(self, candidate: dict, trusted_query: bool = False) -> bool:
        published = candidate.get("published_at")
        if published and self.date_from and published < self.date_from:
            return False
        if published and self.date_to and published > self.date_to:
            return False
        if trusted_query:
            return True
        haystack = " ".join((
            candidate.get("title") or "",
            candidate.get("summary") or "",
            candidate.get("url") or "",
        )).casefold()
        disease_match = any(_term_in_text(term, haystack) for term in self.disease_terms)
        if not disease_match:
            return False
        geography = (self.country or "").casefold()
        if not geography:
            return True
        if geography in haystack:
            return True
        source_country = str(candidate.get("source_country") or "").casefold()
        return bool(source_country) and (geography in source_country or source_country in geography)

    def add(self, candidate: dict, source: str, trusted_query: bool = False,
            source_country: str | None = None) -> None:
        payload = dict(candidate)
        if source_country and not payload.get("source_country"):
            payload["source_country"] = source_country
        if len(self.results) >= self.max_urls or not self._matches(payload, trusted_query):
            return
        try:
            normalized = normalize_url(payload.get("url") or "")
        except ValueError:
            return
        if normalized in self.seen:
            return
        self.seen.add(normalized)
        self.results.append({
            "url": normalized,
            "title": payload.get("title") or "",
            "published_at": payload.get("published_at"),
            "source_name": payload.get("source_name") or (urlparse(normalized).hostname or source).removeprefix("www."),
            "discovery_source": source,
            "source_country": payload.get("source_country") or "",
        })

    def feed(self, feed_url: str, source: str, trusted_query: bool = False,
             entry_limit: int | None = None, source_country: str | None = None) -> None:
        try:
            payload, final_url, _ = _fetch_bytes(feed_url)
            added = 0
            for candidate in parse_feed(payload, final_url):
                before = len(self.results)
                self.add(candidate, source, trusted_query=trusted_query, source_country=source_country)
                if len(self.results) > before:
                    added += 1
                if len(self.results) >= self.max_urls or (entry_limit is not None and added >= entry_limit):
                    break
        except Exception as exc:
            self.warnings.append(f"{source}: {str(exc)[:180]}")
            logger.warning("Discovery feed failed source=%s url=%s error=%s", source, feed_url, exc)

    def sitemap(self, sitemap_url: str, source: str, source_country: str | None = None) -> None:
        pending = [(sitemap_url, 0)]
        visited = set()
        while pending and len(visited) < MAX_NESTED_SITEMAPS and len(self.results) < self.max_urls:
            current, depth = pending.pop(0)
            try:
                normalized = normalize_url(current)
                if normalized in visited:
                    continue
                visited.add(normalized)
                payload, final_url, _ = _fetch_bytes(normalized)
                kind, entries = parse_sitemap(payload)
                if kind == "index" and depth < MAX_SITEMAP_DEPTH:
                    pending.extend((urljoin(final_url, item["url"]), depth + 1) for item in entries)
                elif kind == "urlset":
                    for candidate in entries:
                        self.add(candidate, source, source_country=source_country)
                        if len(self.results) >= self.max_urls:
                            break
            except Exception as exc:
                self.warnings.append(f"{source} sitemap: {str(exc)[:180]}")
                logger.warning("Sitemap discovery failed source=%s url=%s error=%s", source, current, exc)

    def pages(self, start_url: str, source: str, source_config: dict,
              source_country: str | None = None) -> None:
        pagination = source_config.get("pagination") if isinstance(source_config.get("pagination"), dict) else {}
        recursive = source_config.get("recursive") if isinstance(source_config.get("recursive"), dict) else {}
        max_pages = min(MAX_PAGINATION_PAGES, max(1, int(
            pagination.get("max_pages", source_config.get("max_discovery_pages", 3))
        )))
        max_depth = min(MAX_RECURSIVE_DEPTH, max(0, int(
            recursive.get("max_depth", source_config.get("recursive_depth", 0))
        )))
        template = str(pagination.get("template") or source_config.get("pagination_template") or "").strip()
        pagination_enabled = bool(pagination.get("enabled") or template)
        queue = [(start_url, 0)]
        if pagination_enabled:
            queue.extend(
                (url, 0)
                for url in pagination_urls(
                    start_url, max_pages, template=template,
                    style=str(pagination.get("style") or "query").lower(),
                )
            )
        visited_pages = set()
        allowed_host = (urlparse(start_url).hostname or "").lower()
        timeout = int(source_config.get("discovery_timeout") or CATALOG_PAGE_TIMEOUT_SECONDS)
        while queue and len(visited_pages) < max_pages and len(self.results) < self.max_urls:
            page_url, depth = queue.pop(0)
            try:
                normalized = normalize_url(page_url)
                if normalized in visited_pages or (urlparse(normalized).hostname or "").lower() != allowed_host:
                    continue
                visited_pages.add(normalized)
                payload, final_url, _ = _fetch_bytes(normalized, timeout=timeout)
                links = parse_html_links(payload, final_url)
                for candidate in links:
                    if (urlparse(candidate["url"]).hostname or "").lower() != allowed_host:
                        continue
                    self.add(candidate, source, source_country=source_country)
                    if depth < max_depth and candidate["url"] not in visited_pages:
                        queue.append((candidate["url"], depth + 1))
            except Exception as exc:
                self.warnings.append(f"{source} page: {str(exc)[:180]}")
                logger.warning("Page discovery failed source=%s url=%s error=%s", source, page_url, exc)


def discover_urls(diseases: list[str], country: str | None, region: str | None,
                  date_from: str | None, date_to: str | None, max_urls: int,
                  sources: list[dict], region_countries: list[str] | None = None,
                  province_city: str | None = None) -> tuple[list[dict], list[str]]:
    engine = DiscoveryEngine(diseases, country, region, date_from, date_to, min(500, max(1, max_urls)))
    query_terms = [f'"{name}"' if " " in name else name for name in diseases if name]
    query = f"({' OR '.join(query_terms[:5])})"
    geography = (country or "").strip()
    members = [str(name).strip() for name in (region_countries or []) if str(name).strip()]
    if not geography and members:
        geography = "(" + " OR ".join(members[:15]) + ")"
    elif not geography and region and region.casefold() == "asean":
        geography = "(Indonesia OR Malaysia OR Vietnam OR Thailand OR Philippines OR Singapore OR Cambodia OR Myanmar OR Laos OR Brunei)"
    elif not geography and region and region.casefold() not in {"asean", "global"}:
        geography = region.strip()
    place = (province_city or "").strip()
    if place:
        geography = f'"{place}" {geography}'.strip()
    if geography:
        query += f" {geography}"
    google_url = "https://news.google.com/rss/search?q=" + quote_plus(query) + "&hl=en&gl=US&ceid=US:en"
    catalog_sources = select_manual_crawl_sources(sources, country, region, members)
    # Leave room for catalog sites. Google News used to consume max_urls first,
    # so disabled ABVC homepage sources never ran even when they were loaded.
    if catalog_sources and engine.max_urls > 1:
        google_budget = max(1, min(engine.max_urls // 2, engine.max_urls - 1))
    else:
        google_budget = engine.max_urls
    engine.feed(google_url, "Google News", trusted_query=True, entry_limit=google_budget)

    visited = 0
    for source in catalog_sources:
        if len(engine.results) >= engine.max_urls:
            break
        if visited >= MAX_CATALOG_SOURCES_PER_DISCOVERY:
            remaining = len(catalog_sources) - visited
            engine.warnings.append(
                f"Catalog discovery stopped after {visited} matching sources; "
                f"{remaining} additional catalog rows were not fetched in this job."
            )
            break
        raw_config = parse_source_config(source)
        source_label = str(source.get("name") or source.get("source_type") or "configured source")
        source_type = str(source.get("source_type") or "").lower()
        source_url = str(raw_config.get("rss_url") or raw_config.get("url") or "").strip()
        source_country = source_country_value(source)
        visited += 1
        if source_type in {"rss", "social_media"} and source_url:
            engine.feed(source_url, source_label, source_country=source_country)
        sitemap_url = str(raw_config.get("sitemap_url") or "").strip()
        if sitemap_url:
            engine.sitemap(sitemap_url, source_label, source_country=source_country)
        if source_type == "web" and source_url:
            page_config = dict(raw_config)
            page_config.setdefault("max_discovery_pages", 1)
            page_config.setdefault("recursive_depth", 0)
            engine.pages(source_url, source_label, page_config, source_country=source_country)
    return engine.results, engine.warnings
