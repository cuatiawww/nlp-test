"""Domain-aware CSS selector profiles for ASEAN surveillance publishers."""

from __future__ import annotations

from urllib.parse import urlparse

# Host suffix (longest match wins) -> preferred article body CSS selectors.
# Keep lists short; scrape still falls back to generic article/main/trafilatura.
PUBLISHER_BODY_SELECTORS: dict[str, tuple[str, ...]] = {
    # Indonesia gov CMS / portals
    ".go.id": (
        ".news-content",
        ".detail__content",
        ".detail-content",
        ".page-content",
        ".entry-content",
        "article",
        "#content",
    ),
    "kemkes.go.id": (
        ".detail-artikel",
        ".article-content",
        ".entry-content",
        "article",
    ),
    "pekanbaru.go.id": (
        ".detail-content",
        ".berita-detail",
        ".post-content",
        "article",
    ),
    # Tribun / regional ID news
    "tribunnews.com": (
        ".side-article.txt-article",
        ".txt-article",
        "#article_box",
        "article",
    ),
    "kompas.com": (
        ".read__content",
        ".article__body",
        "#articleContent",
        "article",
    ),
    "detik.com": (
        ".detail__body-text",
        ".itp_bodycontent",
        "article",
    ),
    "antaranews.com": (
        ".wrap__article-detail-content",
        ".post-content",
        "article",
    ),
    # Malaysia / SG aggregator + press
    "beritaharian.sg": (
        ".article-content",
        ".story-body",
        ".content-body",
        "article",
    ),
    "newswav.com": (
        ".article-body",
        ".post-content",
        '[data-testid="article-body"]',
        "article",
    ),
    "thestar.com.my": (
        ".story-content",
        "#story-body",
        "article",
    ),
    "nst.com.my": (
        ".article-content",
        ".field-body",
        "article",
    ),
    # Thailand / PH / VN common CMS
    "bangkokpost.com": (
        ".article-content",
        ".article-body",
        "article",
    ),
    "inquirer.net": (
        ".article-content",
        "#article_content",
        "article",
    ),
    "vnexpress.net": (
        ".fck_detail",
        ".Normal",
        "article",
    ),
    "channelnewsasia.com": (
        ".content-detail",
        ".text-long",
        "article",
    ),
    "straitstimes.com": (
        ".article-content-rawhtml",
        ".story-content",
        "article",
    ),
}

PUBLISHER_TITLE_SELECTORS: dict[str, tuple[str, ...]] = {
    ".go.id": ("h1.detail-title", "h1.entry-title", "h1"),
    "tribunnews.com": ("h1#article_title", "h1.f16", "h1"),
    "kompas.com": ("h1.read__title", "h1"),
    "detik.com": ("h1.detail__title", "h1"),
    "beritaharian.sg": ("h1.article-title", "h1"),
    "newswav.com": ("h1",),
}

# Hosts that routinely need a longer fetch window (gov CMS, heavy SPA shells).
SLOW_PUBLISHER_HOST_SUFFIXES: tuple[str, ...] = (
    ".go.id",
    "pekanbaru.go.id",
    "kemkes.go.id",
    "tribunnews.com",
    "kompas.com",
    "newswav.com",
    "beritaharian.sg",
    "bangkokpost.com",
    "vnexpress.net",
)


def _host_candidates(host: str) -> list[str]:
    host = (host or "").lower().removeprefix("www.")
    if not host:
        return []
    parts = host.split(".")
    candidates = [host]
    for i in range(1, len(parts)):
        candidates.append(".".join(parts[i:]))
    seen: set[str] = set()
    out: list[str] = []
    for item in candidates:
        if item and item not in seen:
            seen.add(item)
            out.append(item)
    return out


def _lookup(table: dict[str, tuple[str, ...]], host: str) -> tuple[str, ...]:
    for candidate in _host_candidates(host):
        if candidate in table:
            return table[candidate]
    for key, selectors in table.items():
        if key.startswith(".") and host.endswith(key[1:]):
            return selectors
    return ()


def resolve_body_selectors(url: str) -> tuple[str, ...]:
    host = (urlparse(url).hostname or "").lower()
    return _lookup(PUBLISHER_BODY_SELECTORS, host)


def resolve_title_selectors(url: str) -> tuple[str, ...]:
    host = (urlparse(url).hostname or "").lower()
    return _lookup(PUBLISHER_TITLE_SELECTORS, host)


def is_slow_publisher(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower().removeprefix("www.")
    for suffix in SLOW_PUBLISHER_HOST_SUFFIXES:
        needle = suffix[1:] if suffix.startswith(".") else suffix
        if host == needle or host.endswith("." + needle):
            return True
    return False
