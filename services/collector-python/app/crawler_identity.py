"""Shared crawler identity, safety, and request-policy helpers.

The functions in this module deliberately use only the Python standard
library.  Every discovery/fetch path can therefore share the same URL
identity and SSRF policy without introducing another crawler dependency.
"""

from __future__ import annotations

import hashlib
import ipaddress
import json
import posixpath
import socket
import threading
import time
import unicodedata
from email.utils import parsedate_to_datetime
from typing import Callable, Iterable
from urllib.parse import parse_qsl, quote, unquote, urlencode, urljoin, urlsplit, urlunsplit


TRACKING_PARAMETERS = {
    "fbclid",
    "gclid",
    "dclid",
    "msclkid",
    "mc_cid",
    "mc_eid",
    "igshid",
    "yclid",
    "_ga",
    "_gl",
}
RETRYABLE_HTTP_STATUSES = {408, 425, 429, 500, 502, 503, 504}
PERMANENT_HTTP_STATUSES = {400, 401, 404, 405, 410, 422}

_rate_lock = threading.Lock()
_last_domain_request: dict[str, float] = {}


class UnsafeUrlError(ValueError):
    """Raised when an externally supplied URL may reach a private service."""


def _is_tracking_parameter(name: str) -> bool:
    lowered = name.lower()
    return lowered.startswith("utm_") or lowered in TRACKING_PARAMETERS


def normalize_url(url: str) -> str:
    """Return a deterministic HTTP(S) URL while preserving resource meaning."""
    candidate = (url or "").strip()
    if not candidate:
        return ""
    parsed = urlsplit(candidate)
    scheme = parsed.scheme.lower()
    if scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("URL must use http or https and include a host")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("URLs containing credentials are not allowed")

    host = parsed.hostname.rstrip(".").encode("idna").decode("ascii").lower()
    try:
        port = parsed.port
    except ValueError as exc:
        raise ValueError("URL contains an invalid port") from exc
    default_port = (scheme == "http" and port == 80) or (scheme == "https" and port == 443)
    display_host = f"[{host}]" if ":" in host else host
    netloc = display_host if port is None or default_port else f"{display_host}:{port}"

    # Resolve dot segments without changing a meaningful trailing slash.  The
    # historic /path/?query behaviour is retained for backward compatibility.
    raw_path = parsed.path or "/"
    decoded_path = unquote(raw_path, errors="replace")
    normalized_path = posixpath.normpath(decoded_path)
    if raw_path.startswith("/") and not normalized_path.startswith("/"):
        normalized_path = "/" + normalized_path
    if raw_path.endswith("/") and not normalized_path.endswith("/") and normalized_path != "/":
        normalized_path += "/"
    if parsed.query and normalized_path.endswith("/") and normalized_path != "/":
        normalized_path = normalized_path.rstrip("/")
    path = quote(normalized_path, safe="/%:@!$&'()*+,;=-._~")

    query_pairs = [
        (key, value)
        for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        if not _is_tracking_parameter(key)
    ]
    query_pairs.sort(key=lambda item: (item[0].lower(), item[0], item[1]))
    query = urlencode(query_pairs, doseq=True)
    return urlunsplit((scheme, netloc, path, query, ""))


def url_hash(url: str) -> str:
    normalized = normalize_url(url)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest() if normalized else ""


def normalize_content(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text or "")
    return " ".join(normalized.split()).strip()


def content_fingerprint(text: str) -> str:
    normalized = normalize_content(text)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest() if normalized else ""


def identity_fields(url: str, text: str, canonical_url: str = "", final_url: str = "") -> dict[str, str]:
    """Build the common identity payload used by collector queue messages."""
    normalized = normalize_url(url) if url else ""
    canonical = normalize_url(canonical_url) if canonical_url else normalized
    final = normalize_url(final_url) if final_url else canonical
    return {
        "normalized_url": normalized,
        "canonical_url": canonical,
        "url_hash": url_hash(canonical or normalized) if canonical or normalized else "",
        "content_hash": content_fingerprint(text),
        "final_url": final,
    }


def extract_document_metadata(html: str, response_url: str) -> dict[str, str]:
    """Extract canonical URL and author from existing HTML metadata."""
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html or "", "lxml")
    canonical = ""
    node = soup.select_one('link[rel~="canonical"][href]')
    if node:
        canonical = str(node.get("href") or "").strip()
    if not canonical:
        node = soup.select_one('meta[property="og:url"][content]')
        if node:
            canonical = str(node.get("content") or "").strip()

    json_ld_authors: list[str] = []

    def inspect_json_ld(value) -> None:
        nonlocal canonical
        if isinstance(value, list):
            for item in value:
                inspect_json_ld(item)
            return
        if not isinstance(value, dict):
            return
        if not canonical:
            candidate = value.get("url")
            main_entity = value.get("mainEntityOfPage")
            if isinstance(main_entity, dict):
                candidate = main_entity.get("@id") or main_entity.get("url") or candidate
            if isinstance(candidate, str):
                canonical = candidate.strip()
        raw_author = value.get("author")
        authors = raw_author if isinstance(raw_author, list) else [raw_author]
        for item in authors:
            if isinstance(item, dict) and item.get("name"):
                json_ld_authors.append(str(item["name"]).strip())
            elif isinstance(item, str):
                json_ld_authors.append(item.strip())
        if "@graph" in value:
            inspect_json_ld(value["@graph"])

    for script in soup.select('script[type="application/ld+json"]'):
        try:
            inspect_json_ld(json.loads(script.string or script.get_text() or "{}"))
        except (TypeError, ValueError, json.JSONDecodeError):
            continue

    canonical_url = ""
    if canonical:
        try:
            canonical_url = normalize_url(urljoin(response_url, canonical))
        except ValueError:
            canonical_url = ""
    if not canonical_url:
        canonical_url = normalize_url(response_url)

    author = ""
    for selector, attribute in (
        ('meta[name="author"]', "content"),
        ('meta[property="article:author"]', "content"),
        ('[rel="author"]', None),
        ('[itemprop="author"]', None),
    ):
        author_node = soup.select_one(selector)
        if author_node:
            author = str(author_node.get(attribute) if attribute else author_node.get_text(" ", strip=True) or "").strip()
            if author:
                break
    if not author and json_ld_authors:
        author = ", ".join(dict.fromkeys(name for name in json_ld_authors if name))
    return {"canonical_url": canonical_url, "author": author}


def _resolved_addresses(hostname: str, resolver: Callable = socket.getaddrinfo) -> Iterable[str]:
    try:
        return {str(info[4][0]).split("%", 1)[0] for info in resolver(hostname, None)}
    except socket.gaierror as exc:
        raise ValueError(f"URL host could not be resolved: {hostname}") from exc


def validate_public_url(url: str, resolver: Callable = socket.getaddrinfo) -> str:
    """Validate an article URL and reject local/private/metadata destinations."""
    normalized = normalize_url(url)
    parsed = urlsplit(normalized)
    hostname = (parsed.hostname or "").lower()
    if hostname == "localhost" or hostname.endswith((".localhost", ".local", ".internal")):
        raise UnsafeUrlError("Local or internal hosts are not allowed")

    addresses = list(_resolved_addresses(hostname, resolver))
    if not addresses:
        raise ValueError(f"URL host has no address: {hostname}")
    for address in addresses:
        try:
            ip = ipaddress.ip_address(address)
        except ValueError as exc:
            raise UnsafeUrlError("URL resolved to an invalid address") from exc
        if not ip.is_global:
            raise UnsafeUrlError("Private, local, reserved, and metadata addresses are not allowed")
    return normalized


def wait_for_domain(url: str, minimum_interval_seconds: float) -> None:
    """Apply a small process-local delay between requests to the same host."""
    interval = max(0.0, float(minimum_interval_seconds))
    if interval <= 0:
        return
    hostname = (urlsplit(url).hostname or "").lower()
    if not hostname:
        return
    with _rate_lock:
        now = time.monotonic()
        delay = interval - (now - _last_domain_request.get(hostname, 0.0))
        if delay > 0:
            time.sleep(delay)
        _last_domain_request[hostname] = time.monotonic()


def classify_http_failure(status: int | None = None, error: BaseException | None = None) -> str:
    """Classify failure for retry/logging decisions."""
    if status in RETRYABLE_HTTP_STATUSES:
        return "retryable"
    if status in PERMANENT_HTTP_STATUSES or (status is not None and 400 <= status < 500):
        return "permanent"
    if status is not None and status >= 500:
        return "retryable"
    if isinstance(error, (TimeoutError, ConnectionError, socket.timeout)):
        return "retryable"
    return "unknown"


def retry_delay(attempt: int, retry_after: str | None = None, base_seconds: float = 1.0,
                maximum_seconds: float = 30.0) -> float:
    """Return bounded exponential backoff, honoring a safe Retry-After value."""
    if retry_after:
        try:
            return min(maximum_seconds, max(0.0, float(retry_after)))
        except ValueError:
            try:
                delta = parsedate_to_datetime(retry_after).timestamp() - time.time()
                return min(maximum_seconds, max(0.0, delta))
            except (TypeError, ValueError, OverflowError):
                pass
    return min(maximum_seconds, max(0.0, base_seconds) * (2 ** max(0, attempt)))
