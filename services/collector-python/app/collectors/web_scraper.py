import asyncio
import html as html_lib
import json
import logging
import re
import time
from contextlib import AsyncExitStack
from dataclasses import dataclass
from typing import Any, Optional
from urllib.parse import urljoin, urlparse

from .. import config as app_config
from ..crawler_identity import (
    RETRYABLE_HTTP_STATUSES,
    content_fingerprint,
    extract_document_metadata,
    normalize_url,
    retry_delay,
    url_hash,
    validate_public_url,
    wait_for_domain,
)

from .base import BaseCollector, CollectResult

logger = logging.getLogger(__name__)
BLOCKED_STATUSES = {403, 429, 503}
CHALLENGE_MARKERS = (
    "just a moment", "checking your browser", "cf-browser-verification",
    "cf-chl-", "cloudflare ray id", "challenge-platform", "cf-turnstile",
    "challenges.cloudflare.com", "checking if the site connection is secure",
    "verifying you are human", "enable javascript and cookies to continue",
    "attention required", "un instant...", "un momento...", "window._cf_chl_opt",
    "__cf_chl_rt_tk", 'id="cf-challenge', 'id="challenge-running', 'id="challenge-form',
    'id="turnstile-wrapper', 'class="cf-browser-verification', 'class="cf-alert',
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
    """Return the country targeted by an article URL, never its publisher country.

    Country context is deliberately limited to explicit path/host tokens.  A
    ``.au`` host or a mention of an organisation such as CDC must not turn an
    article about Laos into an Australian/US event.
    """
    parsed = urlparse(url)
    aliases = {
        "brunei": "Brunei", "cambodia": "Cambodia", "indonesia": "Indonesia",
        "laos": "Laos", "lao": "Laos", "lao-pdr": "Laos", "malaysia": "Malaysia",
        "myanmar": "Myanmar", "burma": "Myanmar", "philippines": "Philippines",
        "singapore": "Singapore", "thailand": "Thailand", "timor-leste": "Timor-Leste",
        "east-timor": "Timor-Leste", "vietnam": "Vietnam", "viet-nam": "Vietnam",
        "south-sudan": "South Sudan", "sudan": "Sudan",
    }
    segments = [segment.strip().lower() for segment in parsed.path.split("/") if segment.strip()]
    for index, segment in enumerate(segments[:-1]):
        if segment == "report":
            return aliases.get(segments[index + 1], "")

    # Prefer an explicit country token anywhere in the path.  This covers
    # /countries/laos.html, /destinations/asia/laos and article slugs ending
    # in -laos, while avoiding generic publisher TLDs.
    for segment in segments:
        clean = re.sub(r"\.(?:html?|php)$", "", segment)
        for token in re.split(r"[^a-z]+", clean):
            if token in aliases:
                return aliases[token]
            # Article slugs often use a possessive, e.g. malaysias-dengue-cases.
            possessive = token[:-1] if token.endswith("s") and len(token) > 4 else ""
            if possessive in aliases:
                return aliases[possessive]

    # Some country offices use a country subdomain, e.g. laos.embassy.gov.au.
    host_parts = [part for part in (parsed.hostname or "").lower().split(".") if part]
    for part in host_parts:
        if part in aliases:
            return aliases[part]

    # ASEAN national ccTLD mapping (e.g. kpl.gov.la, kemkes.go.id, moh.gov.sg)
    tld_map = {
        "la": "Laos",
        "id": "Indonesia",
        "my": "Malaysia",
        "th": "Thailand",
        "vn": "Vietnam",
        "ph": "Philippines",
        "sg": "Singapore",
        "kh": "Cambodia",
        "mm": "Myanmar",
        "bn": "Brunei",
        "tl": "Timor-Leste",
    }
    if host_parts and host_parts[-1] in tld_map:
        return tld_map[host_parts[-1]]

    return ""


@dataclass
class FetchOutcome:
    page: Any
    html: str
    status: int
    mode: str
    final_url: str = ""


def _repair_mojibake(text: str) -> str:
    """Repair UTF-8 HTML accidentally decoded as Latin-1/Windows-1252."""
    if not text:
        return text
    markers = ("Ã", "Â", "Ä", "Æ", "á»", "áº", "â", "ð")
    before = sum(text.count(marker) for marker in markers)
    if before == 0:
        return text
    try:
        candidate = text.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text
    after = sum(candidate.count(marker) for marker in markers)
    return candidate if after < before else text


def _repair_mojibake(text: str) -> str:
    """Repair UTF-8 text decoded with a legacy single-byte charset."""
    if not text:
        return text
    markers = (
        "Ã", "Â", "Ä", "Å", "ð", "â\x80", "à¸", "à¹", "àº", "à»",
        "á»", "áº", "á€", "á", "�",
    )

    def score(value: str) -> int:
        return sum(value.count(marker) for marker in markers)

    if score(text) == 0:
        return text
    candidates = [text]
    for encoding in ("latin-1", "cp1252"):
        try:
            candidates.append(text.encode(encoding).decode("utf-8"))
        except (UnicodeEncodeError, UnicodeDecodeError):
            continue
    return min(candidates, key=score)


def _decode_html_bytes(
    data: bytes,
    content_type: str = "",
    response_encoding: str = "",
) -> str:
    """Decode HTML robustly when servers omit or misreport charset."""
    if not data:
        return ""
    header = str(content_type or "")
    head = data[:8192].decode("ascii", errors="ignore")
    charset_match = re.search(r"charset\s*=\s*[\"']?\s*([A-Za-z0-9._-]+)", header, re.I)
    if not charset_match:
        charset_match = re.search(r"<meta[^>]+charset\s*=\s*[\"']?\s*([A-Za-z0-9._-]+)", head, re.I)
    encodings: list[str] = []
    if charset_match:
        encodings.append(charset_match.group(1))
    encodings.extend(["utf-8", response_encoding or "", "cp1252", "latin-1"])
    candidates: list[str] = []
    seen: set[str] = set()
    for encoding in encodings:
        normalized = encoding.strip().lower()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        try:
            candidates.append(data.decode(normalized, errors="strict"))
        except (LookupError, UnicodeDecodeError):
            continue
    if not candidates:
        candidates.append(data.decode("utf-8", errors="replace"))
    return _repair_mojibake(min(candidates, key=lambda value: sum(
        value.count(marker) for marker in ("Ã", "Â", "â\x80", "à¸", "à¹", "àº", "à»", "á€", "á", "�")
    )))


def _response_html(page: Any) -> str:
    html = getattr(page, "html_content", "")
    if html:
        return _repair_mojibake(str(html))
    body = getattr(page, "body", b"")
    if isinstance(body, bytes):
        return _decode_html_bytes(body)
    return _repair_mojibake(str(body or ""))


def _normalize_url(url: str) -> str:
    """Backward-compatible alias for the shared crawler URL normalizer."""
    return normalize_url(url)


def _identity_payload(requested_url: str, outcome: FetchOutcome, content: str) -> dict[str, str]:
    final_url = outcome.final_url or requested_url
    metadata = extract_document_metadata(outcome.html, final_url)
    normalized = normalize_url(requested_url)
    canonical = metadata.get("canonical_url") or normalize_url(final_url)
    return {
        "normalized_url": normalized,
        "canonical_url": canonical,
        "url_hash": url_hash(canonical or normalized),
        "content_hash": content_fingerprint(content),
        "final_url": normalize_url(final_url),
        "author": metadata.get("author", ""),
    }


def _is_spa_shell(html: str) -> bool:
    """Detect if an HTML document is an unrendered Single Page Application shell."""
    if not html or len(html) < 200:
        return False
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "lxml")
    for tag in soup.select("script, style, noscript, svg, nav, footer, header, aside"):
        tag.decompose()
    visible = soup.get_text(" ", strip=True)
    visible_words = visible.split()
    if len(html) > 3000 and len(visible_words) < 50:
        return True
    root_el = soup.select_one('#root, #app, #__next, [data-reactroot]')
    if root_el and len(root_el.get_text(strip=True).split()) < 30:
        return True
    return False


def _extract_next_rsc_article(html: str) -> tuple[str, str]:
    """Extract article text from a Next.js React Server Components payload.

    Some publishers return a valid article only in ``self.__next_f.push``
    streams while the visible HTML is an empty ``#__next`` shell. This parser
    accepts content only when a decoded payload contains a substantial HTML
    article fragment; it never treats the shell, title, or description alone
    as article content.
    """
    if not html or "__next_f.push" not in html:
        return "", ""
    from bs4 import BeautifulSoup

    payload_pattern = re.compile(
        r"self\.__next_f\.push\(\[1,(\"(?:\\.|[^\"\\])*\")\]\)",
        re.DOTALL,
    )
    fragments: list[str] = []
    for match in payload_pattern.finditer(html):
        try:
            payload = json.loads(match.group(1))
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
        if not isinstance(payload, str):
            continue
        for marker in ("<article", "<strong", "<p>"):
            start = payload.find(marker)
            if start < 0:
                continue
            fragment = html_lib.unescape(payload[start:])
            soup = BeautifulSoup(fragment, "html.parser")
            for node in soup.select("script, style, noscript, svg, nav, footer, header, aside"):
                node.decompose()
            text = soup.get_text("\n", strip=True)
            text = "\n".join(line.strip() for line in text.splitlines() if line.strip())
            if len(text) >= 200 and len(text.split()) >= 30:
                fragments.append(text)
            break

    if not fragments:
        return "", ""
    title_soup = BeautifulSoup(html, "html.parser")
    title = title_soup.title.get_text(" ", strip=True) if title_soup.title else ""
    return title, max(fragments, key=len)


def _is_challenge(status: int, html: str) -> bool:
    if status in BLOCKED_STATUSES:
        return True
    if not html:
        return False
    sample = html[:50_000].lower()
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

    soup_probe = BeautifulSoup(html, "lxml")
    media_noise_selectors = (
        "script, style, noscript, svg, template, nav, footer, header, aside, "
        ".advertisement, .ads, .social-share, .related, .recommended, .social, .share, .tags, .author, "
        "[class*='baca-juga'], [class*='bacajuga'], [class*='read-also'], [class*='read__also'], "
        "[class*='related'], [class*='terkait'], [class*='berita-pilihan'], [class*='pilihan-editor'], "
        "[class*='paging'], [class*='paging__item'], [class*='list-berita'], [class*='latest__list'], "
        "[class*='box-baca-juga'], [class*='article-tag'], .baca-juga, .read-also, .berita-terkait"
    )
    for node in soup_probe.select(media_noise_selectors):
        node.decompose()

    primary_article_node = soup_probe.select_one(
        "article.news-content, .news-content, .article__body, .cms-body, .article-body, .detail__content, .detail-content, .entry-content, .post-content, .article-content, #article-content, article"
    )
    if primary_article_node and len(primary_article_node.get_text(" ", strip=True)) >= 120:
        for rel_node in primary_article_node.select(media_noise_selectors):
            rel_node.decompose()
        content = primary_article_node.get_text("\n", strip=True)
    else:
        content = extract(
            html,
            output_format="txt",
            include_comments=False,
            include_tables=False,
            favor_precision=True,
            deduplicate=True,
        )
    metadata = extract_metadata(html)
    og_title = (metadata.title or "").strip() if metadata else ""

    soup = BeautifulSoup(html, "lxml")
    h1_node = soup.select_one("h1.post-title, h1.entry-title, h1.article-title, h1")
    h1_title = h1_node.get_text(" ", strip=True) if h1_node else ""

    tag_title = ""
    title_node = soup.select_one("title")
    if title_node:
        raw_tag = title_node.get_text(" ", strip=True)
        if " | " in raw_tag:
            tag_title = raw_tag.split(" | ")[0].strip()
        elif " - " in raw_tag:
            tag_title = raw_tag.split(" - ")[0].strip()
        else:
            tag_title = raw_tag

    # Prioritize most complete title (avoid truncated og:title)
    title = h1_title or og_title or tag_title
    if h1_title and len(h1_title) > len(og_title):
        title = h1_title
    elif tag_title and len(tag_title) > len(title) and not title.endswith("..."):
        title = tag_title

    for node in soup.select(media_noise_selectors):
        node.decompose()
    if title_selector:
        sel_node = soup.select_one(title_selector)
        if sel_node:
            title = sel_node.get_text(" ", strip=True)

    if not content:
        main_node = (
            soup.select_one("article")
            or soup.select_one("main")
            or soup.select_one('[role="main"]')
            or soup.select_one('.MuiCardContent-root, .MuiPaper-root, .post-content, .entry-content, .article-content, .content, .body, #content, #main-content')
        )
        content = main_node.get_text(" ", strip=True) if main_node else ""

    if not content or len(content) < 80:
        p_texts = [
            p.get_text(" ", strip=True)
            for p in soup.select("h1, h2, h3, h4, p, .teaser, .headline, .summary, .description, li")
            if len(p.get_text(" ", strip=True)) > 15
        ]
        if p_texts:
            content = " ".join(p_texts)

    if not content or len(content) < 50:
        for node in soup.select("nav, footer, header, aside, script, style, noscript, svg"):
            node.decompose()
        content = soup.get_text("\n", strip=True)

    if content:
        content = re.sub(
            r"(?im)^\s*(?:baca\s+juga|baca\s+artikel\s+terkait|simak\s+juga|tonton\s+juga|lihat\s+juga)\s*:?.*$",
            "",
            content,
        )
        content_parts = re.split(
            r"(?im)(?:^|\n|\s{2,})\s*(?:berita\s+pilihan|pilihan\s+editor|artikel\s+terkait|topik\s+terkait|pilihan\s+untuk\s+anda|you\s+may\s+also\s+like|you\s+may\s+like|related\s+(?:articles?|topics?)|recommended\s+(?:for\s+you|stories?)|latest\s+news)\b",
            content,
        )
        if content_parts and len(content_parts[0].strip()) >= 200:
            content = content_parts[0].strip()

    content = " ".join((content or "").split())
    lower_title = (title or "").lower()
    lower_content = (content or "").lower()
    if "error page" in lower_title or "page not found" in lower_title or lower_content.startswith("error page page not found"):
        raise ValueError("Halaman tidak ditemukan (404 Page Not Found) di website sumber")
    if not content or len(content) < 15:
        raise ValueError("No sufficiently long main content found on page")
    return title, content


MONTH_MAP = {
    # Indonesian / Malay
    "januari": 1, "februari": 2, "maret": 3, "mac": 3, "april": 4, "mei": 5,
    "juni": 6, "julai": 7, "juli": 7, "agustus": 8, "ogos": 8, "september": 9,
    "oktober": 10, "november": 11, "nopember": 11, "desember": 12, "disember": 12,
    # English
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
    # Short
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def _normalize_published_date(value: Any) -> str:
    """Normalize common publisher date formats to the DB DATE format."""
    if not value:
        return ""
    raw = str(value).strip()
    if not raw:
        return ""
    # ISO/RFC dates are the common case. Keep this deliberately strict so a
    # page's update time or an arbitrary number is not stored as publication.
    match = re.search(r"(20\d{2}-\d{2}-\d{2})", raw)
    if match:
        return match.group(1)
    try:
        from dateutil.parser import parse
        return parse(raw, fuzzy=False).date().isoformat()
    except (TypeError, ValueError, OverflowError):
        return ""


def _extract_date_from_url(url: str) -> str:
    if not url:
        return ""
    # /2026/08/27/ or /2026-08-27-
    m = re.search(r'/(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])[/-]', url)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    # /27-08-2026/ or /07-05-2026-
    m = re.search(r'/(0?[1-9]|[12]\d|3[01])[-/](0?[1-9]|1[0-2])[-/](20\d{2})[/-]', url)
    if m:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    # /20260827/
    m = re.search(r'[-/](20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[-/]', url)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    return ""


def _extract_date_from_text(text: str) -> str:
    if not text:
        return ""
    sample = text[:1000]
    # ISO date: 2026-08-27 or 2026/08/27
    m = re.search(r'\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b', sample)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    # Day Month Year (supports hyphens, slashes, spaces): e.g. "26-May-2025", "27 Agustus 2026"
    m = re.search(r'\b(0?[1-9]|[12]\d|3[01])[-/\s]+([A-Za-z]{3,12})[-/\s]+(20\d{2})\b', sample)
    if m:
        month_str = m.group(2).lower()
        if month_str in MONTH_MAP:
            return f"{m.group(3)}-{MONTH_MAP[month_str]:02d}-{int(m.group(1)):02d}"
    # Month Day, Year: e.g. "May 26, 2025", "August 27, 2026"
    m = re.search(r'\b([A-Za-z]{3,12})[-/\s]+(0?[1-9]|[12]\d|3[01]),?[-/\s]+(20\d{2})\b', sample)
    if m:
        month_str = m.group(1).lower()
        if month_str in MONTH_MAP:
            return f"{m.group(3)}-{MONTH_MAP[month_str]:02d}-{int(m.group(2)):02d}"
    return ""


def _extract_published_at(html: str, url: str = "", text: str = "") -> str:
    """Read publication time from metadata, falling back to URL slug and dateline."""
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

    # Also inspect post-meta / publish date containers in HTML
    for selector in (
        '.post-meta', '.entry-meta', '.article-meta', '.article-date',
        '.post-date', '[class*="post-meta"]', '[class*="publish-date"]',
        'time',
    ):
        for node in soup.select(selector):
            node_text = node.get_text(" ", strip=True)
            d = _extract_date_from_text(node_text)
            if d:
                candidates.append(d)
                break

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

    # Fallback 1: Extract date from URL path
    url_date = _extract_date_from_url(url)
    if url_date:
        return url_date

    # Fallback 2: Extract date from text dateline
    text_date = _extract_date_from_text(text)
    if text_date:
        return text_date

    return ""


def _article_http_client():
    """Return a session, retry exceptions, and extra headers for article fetches.

    python-requests keeps an OpenSSL fingerprint that CloudFront answers with
    403 from some networks, while a browser-shaped client receives the article.
    Changing the User-Agent does not fix that: an allowed edge still returns
    200 with an empty User-Agent. curl_cffi already comes with
    scrapling[fetchers]; its Chrome profile keeps the TLS and HTTP/2
    fingerprint consistent with the headers it sends.
    """
    try:
        from curl_cffi import requests as cffi_requests
        from curl_cffi.requests.exceptions import ConnectionError as CffiConnectionError
        from curl_cffi.requests.exceptions import Timeout as CffiTimeout

        session = cffi_requests.Session(impersonate="chrome")
        session.trust_env = False
        # Impersonation supplies a coherent User-Agent, Accept, Accept-Language,
        # and Accept-Encoding. Overriding them makes the fingerprint inconsistent.
        return session, (CffiTimeout, CffiConnectionError), {}
    except ImportError:
        import requests

        session = requests.Session()
        session.trust_env = False
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/150.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate",
            "Upgrade-Insecure-Requests": "1",
        }
        return session, (requests.Timeout, requests.ConnectionError), headers


class WebScraperCollector(BaseCollector):
    @staticmethod
    def _verify_tls(url: str) -> bool:
        """Keep TLS verification on except for explicitly allowlisted hosts."""

        if not app_config.CRAWLER_TLS_VERIFY:
            return False
        host = (urlparse(url).hostname or "").casefold()
        if host in app_config.CRAWLER_INSECURE_TLS_HOSTS:
            logger.warning("TLS verification disabled for explicitly allowlisted crawler host: %s", host)
            return False
        return True

    def _interactive_timeout_seconds(self) -> int:
        configured_ms = int(self.config.get("timeout_ms", app_config.INTERACTIVE_HTML_TIMEOUT_SECONDS * 1000))
        return max(1, min(configured_ms // 1000, 45))

    async def _fetch_direct_http(self, url: str, timeout_seconds: int = 12) -> FetchOutcome:
        """Fast bounded HTTP fetch with redirect SSRF checks and finite retries."""
        from scrapling.parser import Adaptor

        session, retry_errors, headers = _article_http_client()

        def _get():
            current_url = validate_public_url(url)
            max_retries = max(0, min(5, int(self.config.get("max_retries", app_config.CRAWLER_MAX_RETRIES))))
            max_bytes = app_config.CRAWLER_MAX_HTML_MB * 1024 * 1024
            redirects = 0
            attempt = 0
            while True:
                wait_for_domain(current_url, app_config.CRAWLER_DOMAIN_MIN_INTERVAL_SECONDS)
                try:
                    request_kwargs = {
                        "timeout": (min(10, timeout_seconds), timeout_seconds),
                        "allow_redirects": False,
                        "verify": self._verify_tls(current_url),
                        "stream": True,
                    }
                    if headers:
                        request_kwargs["headers"] = headers
                    response = session.get(current_url, **request_kwargs)
                except retry_errors:
                    if attempt >= max_retries:
                        raise
                    time.sleep(retry_delay(
                        attempt,
                        base_seconds=app_config.CRAWLER_BACKOFF_BASE_SECONDS,
                        maximum_seconds=app_config.CRAWLER_BACKOFF_MAX_SECONDS,
                    ))
                    attempt += 1
                    continue

                if response.status_code in {301, 302, 303, 307, 308}:
                    location = response.headers.get("Location")
                    response.close()
                    if not location or redirects >= app_config.CRAWLER_MAX_REDIRECTS:
                        raise RuntimeError("HTTP redirect limit exceeded")
                    current_url = validate_public_url(urljoin(current_url, location))
                    redirects += 1
                    continue

                data = bytearray()
                for chunk in response.iter_content(65536):
                    if not chunk:
                        continue
                    data.extend(chunk)
                    if len(data) > max_bytes:
                        response.close()
                        raise ValueError(f"HTML response exceeds {app_config.CRAWLER_MAX_HTML_MB} MB limit")
                html = _decode_html_bytes(
                    bytes(data),
                    content_type=response.headers.get("Content-Type", ""),
                    response_encoding=response.encoding or "",
                )
                status = int(response.status_code)
                retry_after = response.headers.get("Retry-After")
                response.close()
                if status in RETRYABLE_HTTP_STATUSES and attempt < max_retries:
                    time.sleep(retry_delay(
                        attempt,
                        retry_after=retry_after,
                        base_seconds=app_config.CRAWLER_BACKOFF_BASE_SECONDS,
                        maximum_seconds=app_config.CRAWLER_BACKOFF_MAX_SECONDS,
                    ))
                    attempt += 1
                    continue
                return html, status, current_url

        html, status, final_url = await asyncio.to_thread(_get)
        page = Adaptor(html)
        return FetchOutcome(page, html, status, "direct_http", final_url)

    async def extract_url(self, url: str) -> dict:
        """Fetch one URL for interactive analysis without publishing it."""
        url = await asyncio.to_thread(validate_public_url, url)
        if "news.google.com" in url.lower():
            try:
                from googlenewsdecoder import gnewsdecoder
                decoded = await asyncio.to_thread(gnewsdecoder, url, 0.1)
                if decoded.get("status") and decoded.get("decoded_url"):
                    logger.info("Decoded Google News URL %s -> %s", url, decoded["decoded_url"])
                    url = decoded["decoded_url"]
            except Exception as exc:
                logger.warning("Failed to decode Google News URL %s: %s", url, exc)
        from .pdf_document import try_pdf
        # Do not download every HTML article once as a PDF probe and then a
        # second time as HTML. Explicit PDF URLs retain the full PDF pipeline.
        pdf = await asyncio.to_thread(try_pdf, url) if urlparse(url).path.lower().endswith(".pdf") else None
        if pdf is not None:
            pdf["source_country"] = _country_hint_from_url(url)
            canonical = normalize_url(pdf.get("url") or url)
            pdf.update({
                "normalized_url": normalize_url(url),
                "canonical_url": canonical,
                "url_hash": url_hash(canonical),
                "content_hash": content_fingerprint(pdf.get("content", "")),
                "final_url": canonical,
                "author": "",
            })
            return pdf
        fetch_mode = str(self.config.get("fetch_mode", "auto")).lower()
        if fetch_mode not in {"auto", "http", "stealth"}:
            raise ValueError(f"Invalid fetch_mode: {fetch_mode}")

        outcome = None
        timeout_seconds = self._interactive_timeout_seconds()
        skip_stealth = fetch_mode != "stealth" and bool(self.config.get("skip_stealth", False))

        if fetch_mode == "http" or skip_stealth:
            try:
                outcome = await self._fetch_direct_http(url, timeout_seconds=timeout_seconds)
            except Exception as direct_exc:
                logger.warning("Direct HTTP failed for %s (%s), trying Scrapling HTTP", url, direct_exc)
                outcome = await self._fetch_http(url)
        else:
            async with AsyncExitStack() as stack:
                try:
                    outcome, _ = await asyncio.wait_for(
                        self._fetch(url, fetch_mode, "body", None, stack),
                        timeout=timeout_seconds + 1,
                    )
                except Exception as exc:
                    logger.warning("Primary fetch failed for %s (%s), trying fast direct http fallback", url, exc)
                    try:
                        outcome = await self._fetch_direct_http(url, timeout_seconds=timeout_seconds)
                    except Exception as fallback_exc:
                        logger.error("Direct HTTP fallback also failed for %s: %s", url, fallback_exc)
                        if outcome is None:
                            raise

        # If primary returned empty or error status, try direct HTTP before giving up
        if outcome is None or not outcome.html or len(outcome.html) < 200 or outcome.status != 200:
            try:
                logger.info("Attempting direct HTTP fallback for %s", url)
                direct_outcome = await self._fetch_direct_http(url, timeout_seconds=timeout_seconds)
                if direct_outcome.status == 200 and len(direct_outcome.html) > 200:
                    outcome = direct_outcome
            except Exception as e:
                logger.debug("Direct HTTP secondary fallback failed: %s", e)

        if outcome is None:
            raise RuntimeError(f"Gagal mengambil konten dari URL: {url}")

        # Direct HTTP is also used as a fallback, so the challenge check must
        # happen here as well as inside the stealth fetcher.  Otherwise a
        # Cloudflare shell can be passed to trafilatura/BeautifulSoup and
        # stored as if it were an article.
        if _is_challenge(outcome.status, outcome.html):
            raise RuntimeError(f"source returned a browser challenge status={outcome.status}")
        if outcome.status != 200:
            raise RuntimeError(f"source returned HTTP status={outcome.status}")
        shell_title = ""
        shell_content = ""
        if _is_spa_shell(outcome.html):
            shell_title, shell_content = _extract_next_rsc_article(outcome.html)
            if not shell_content:
                raise RuntimeError("source returned an unrendered application shell")

        # Safety check: if response is actually a binary PDF
        if outcome.html.startswith("%PDF-") or (len(outcome.html) > 10 and "%PDF-" in outcome.html[:30]):
            from .pdf_document import extract_pdf
            from ..minio_client import upload_file
            pdf_bytes = outcome.html.encode("utf-8", "surrogateescape")
            pdf_data = await asyncio.to_thread(extract_pdf, pdf_bytes, url, upload_file)
            pdf_data["source_country"] = _country_hint_from_url(url)
            return pdf_data

        if shell_content:
            title, content = shell_title, shell_content
        else:
            try:
                title, content = _extract_main_content(outcome.html)
            except Exception as exc:
                logger.warning("Main content extraction failed for %s: %s, falling back to clean text", url, exc)
                title, content = "", ""
        if not content and outcome.html:
            try:
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(outcome.html, "lxml")
                for node in soup.select("script, style, noscript, svg, nav, footer, header"):
                    node.decompose()
                content = soup.get_text(" ", strip=True)[:10000]
            except Exception as bs_exc:
                logger.warning("BeautifulSoup lxml parsing failed for %s: %s, trying html.parser", url, bs_exc)
                try:
                    from bs4 import BeautifulSoup
                    soup = BeautifulSoup(outcome.html, "html.parser")
                    for node in soup.select("script, style, noscript, svg, nav, footer, header"):
                        node.decompose()
                    content = soup.get_text(" ", strip=True)[:10000]
                except Exception:
                    content = ""

        combined_check = f"{title}\n{content}".lower()
        if any(marker in combined_check for marker in ("just a moment", "checking your browser", "cloudflare ray id", "enable javascript and cookies", "un instant...", "attention required", "turnstile")):
            raise RuntimeError(f"source returned a browser challenge: {title or 'Cloudflare'}")
        short_article = len(content.split()) < 15 and not shell_content
        has_health_signal = bool(re.search(
            r"\b(?:dengue|malaria|measles|mpox|outbreak|cases?|wabah|penyakit|health)\b",
            combined_check,
            re.IGNORECASE,
        ))
        if short_article and not (len(content.split()) >= 8 and has_health_signal):
            raise RuntimeError("source returned an empty or unextractable article shell")

        return {
            "url": url,
            "title": title,
            "content": content,
            "fetch_mode": outcome.mode,
            "http_status": outcome.status,
            "source_country": _country_hint_from_url(url),
            "published_at": _extract_published_at(outcome.html, url=url, text=content),
            **_identity_payload(url, outcome, content),
        }

    async def collect(self) -> CollectResult:
        from .. import db

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
        published_urls = set()
        async with AsyncExitStack() as stack:
            stealth_session = None
            for url in urls:
                if not url:
                    continue
                result.records_found += 1
                try:
                    normalized_candidate = normalize_url(url)
                except ValueError:
                    normalized_candidate = url
                if normalized_candidate in published_urls or db.is_url_already_processed(normalized_candidate):
                    logger.info("Skipping already processed web URL: %s", url)
                    continue
                try:
                    url = await asyncio.to_thread(validate_public_url, url)
                    normalized_candidate = normalize_url(url)
                    from .pdf_document import try_pdf
                    pdf = await asyncio.to_thread(try_pdf, url) if urlparse(url).path.lower().endswith(".pdf") else None
                    if pdf is not None:
                        from .. import rabbitmq
                        if not pdf["content"].strip():
                            raise ValueError("Table-only PDF retained; structured table review required")
                        pdf_identity = {
                            "canonical_url": normalize_url(pdf.get("url") or url),
                            "final_url": normalize_url(pdf.get("url") or url),
                        }
                        if (
                            db.is_url_already_processed(pdf_identity["canonical_url"])
                            or db.is_url_already_processed(pdf_identity["final_url"])
                        ):
                            logger.info("Skipping already processed PDF URL: %s", url)
                            continue
                        await asyncio.to_thread(rabbitmq.publish, {
                            **pdf, "text": pdf["content"], "source_type": "web",
                            "source_name": self.source.get("name", ""),
                            "collector_source_id": str(self.source["id"]),
                            "source_country": self.config.get("country") or _country_hint_from_url(url),
                            "normalized_url": normalize_url(url),
                            "canonical_url": normalize_url(pdf.get("url") or url),
                            "url_hash": url_hash(pdf.get("url") or url),
                            "content_hash": content_fingerprint(pdf.get("content", "")),
                            "final_url": normalize_url(pdf.get("url") or url),
                            "author": "",
                        })
                        published_urls.add(normalized_candidate)
                        result.records_ingested += 1
                        continue
                    outcome, stealth_session = await self._fetch(
                        url, fetch_mode, body_selector, stealth_session, stack
                    )
                    title, body_text = _extract_main_content(
                        outcome.html, title_selector=title_selector
                    )
                    published_at = _extract_published_at(outcome.html, url=url, text=body_text)
                    text = f"{title}\n\n{body_text}" if title else body_text
                    identity = _identity_payload(url, outcome, body_text)
                    if (
                        db.is_url_already_processed(identity.get("canonical_url", ""))
                        or db.is_url_already_processed(identity.get("final_url", ""))
                    ):
                        logger.info("Skipping already processed canonical URL: %s", url)
                        continue
                    obj_path = f"web/{self.source['id']}/{identity['url_hash']}.html"
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
                        **identity,
                    })
                    published_urls.add(normalized_candidate)
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
        normalized_url = _normalize_url(url)
        if fetch_mode != "stealth":
            outcome = await self._fetch_http(normalized_url)
            blocked = _is_challenge(outcome.status, outcome.html)
            is_spa = _is_spa_shell(outcome.html)
            selector_missing = not _selected_text(outcome.page, body_selector)
            # If status 200, valid HTML with real content, and not blocked or unrendered SPA
            if outcome.status == 200 and len(outcome.html) > 500 and not blocked and not is_spa:
                return outcome, stealth_session
            if fetch_mode == "http" or (not blocked and not selector_missing and not is_spa):
                if blocked:
                    raise RuntimeError(f"blocked response status={outcome.status} and fetch_mode=http")
                return outcome, stealth_session
            logger.info(
                "Falling back to stealth for %s status=%d challenge=%s is_spa=%s",
                normalized_url, outcome.status, blocked, is_spa,
            )
        if stealth_session is None:
            stealth_session = await stack.enter_async_context(self._new_stealth_session())
        return await self._fetch_stealth(normalized_url, stealth_session), stealth_session

    async def _fetch_http(self, url: str) -> FetchOutcome:
        from scrapling.fetchers import AsyncFetcher
        url = await asyncio.to_thread(validate_public_url, url)
        await asyncio.to_thread(wait_for_domain, url, app_config.CRAWLER_DOMAIN_MIN_INTERVAL_SECONDS)
        timeout_seconds = self._interactive_timeout_seconds()
        kwargs = {
            "timeout": timeout_seconds,
            "retries": int(self.config.get("max_retries", app_config.CRAWLER_MAX_RETRIES)),
            "stealthy_headers": True,
            "impersonate": self.config.get("impersonate", "chrome"),
        }
        if self.config.get("proxy"):
            kwargs["proxy"] = self.config["proxy"]
        page = await asyncio.wait_for(AsyncFetcher.get(url, **kwargs), timeout=timeout_seconds + 1)
        final_url = str(getattr(page, "url", "") or url)
        final_url = await asyncio.to_thread(validate_public_url, final_url)
        html = _response_html(page)
        if len(html.encode("utf-8", errors="ignore")) > app_config.CRAWLER_MAX_HTML_MB * 1024 * 1024:
            raise ValueError(f"HTML response exceeds {app_config.CRAWLER_MAX_HTML_MB} MB limit")
        return FetchOutcome(page, html, int(getattr(page, "status", 0) or 0), "http", final_url)

    def _new_stealth_session(self):
        from scrapling.fetchers import AsyncStealthySession
        kwargs = {
            "headless": True,
            "solve_cloudflare": bool(self.config.get("solve_cloudflare", False)),
            "block_webrtc": True,
            "disable_resources": False,
            "timeout": int(self.config.get("timeout_ms", 15_000)),
            "max_pages": max(1, int(self.config.get("max_pages", 2))),
        }
        if self.config.get("proxy"):
            kwargs["proxy"] = self.config["proxy"]
        return AsyncStealthySession(**kwargs)

    async def _fetch_stealth(self, url: str, session: Any) -> FetchOutcome:
        url = await asyncio.to_thread(validate_public_url, url)
        await asyncio.to_thread(wait_for_domain, url, app_config.CRAWLER_DOMAIN_MIN_INTERVAL_SECONDS)
        timeout_seconds = self._interactive_timeout_seconds()
        kwargs = {
            "retries": int(self.config.get("max_retries", app_config.CRAWLER_MAX_RETRIES)),
            "wait": int(self.config.get("wait_ms", 5000)),
        }
        if self.config.get("wait_selector"):
            kwargs["wait_selector"] = self.config["wait_selector"]
        if self.config.get("network_idle"):
            kwargs["network_idle"] = True
        page = await asyncio.wait_for(session.fetch(url, **kwargs), timeout=timeout_seconds + 1)
        html = _response_html(page)
        status = int(getattr(page, "status", 0) or 0)
        if _is_challenge(status, html):
            raise RuntimeError(f"challenge still present after stealth fetch status={status}")
        final_url = str(getattr(page, "url", "") or url)
        final_url = await asyncio.to_thread(validate_public_url, final_url)
        if len(html.encode("utf-8", errors="ignore")) > app_config.CRAWLER_MAX_HTML_MB * 1024 * 1024:
            raise ValueError(f"HTML response exceeds {app_config.CRAWLER_MAX_HTML_MB} MB limit")
        return FetchOutcome(page, html, status, "stealth", final_url)
