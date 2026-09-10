import socket
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.crawler_identity import (
    UnsafeUrlError,
    classify_http_failure,
    content_fingerprint,
    extract_document_metadata,
    normalize_url,
    retry_delay,
    url_hash,
    validate_public_url,
)


class CrawlerIdentityTests(unittest.TestCase):
    def test_url_normalization_removes_tracking_and_sorts_query(self):
        self.assertEqual(
            normalize_url("HTTPS://Example.COM:443/news/../news/item/?utm_source=x&b=2&a=1#part"),
            "https://example.com/news/item?a=1&b=2",
        )

    def test_url_hash_is_stable_across_tracking_variants(self):
        first = url_hash("https://example.org/report?id=7&utm_medium=email")
        second = url_hash("https://EXAMPLE.org:443/report?utm_source=rss&id=7#top")
        self.assertEqual(first, second)

    def test_content_fingerprint_normalizes_unicode_and_whitespace(self):
        self.assertEqual(content_fingerprint("COVID-19\n  cases"), content_fingerprint("COVID-19 cases"))

    def test_extracts_relative_canonical_and_author(self):
        metadata = extract_document_metadata(
            '<link rel="canonical" href="/article/1?utm_source=rss"><meta name="author" content="WHO">',
            "https://example.org/news?id=1",
        )
        self.assertEqual(metadata["canonical_url"], "https://example.org/article/1")
        self.assertEqual(metadata["author"], "WHO")

    def test_extracts_json_ld_canonical_and_author(self):
        metadata = extract_document_metadata(
            '<script type="application/ld+json">{"@type":"NewsArticle","mainEntityOfPage":{"@id":"https://example.org/story/7?utm_source=x"},"author":{"name":"Health Desk"}}</script>',
            "https://example.org/redirect/7",
        )
        self.assertEqual(metadata["canonical_url"], "https://example.org/story/7")
        self.assertEqual(metadata["author"], "Health Desk")

    def test_ssrf_guard_rejects_private_address(self):
        resolver = lambda *_: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 0))]
        with self.assertRaises(UnsafeUrlError):
            validate_public_url("http://example.org/news", resolver=resolver)

    def test_ssrf_guard_accepts_public_address(self):
        resolver = lambda *_: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))]
        self.assertEqual(
            validate_public_url("https://example.org/news?utm_source=x", resolver=resolver),
            "https://example.org/news",
        )

    def test_retry_classification_and_backoff(self):
        self.assertEqual(classify_http_failure(429), "retryable")
        self.assertEqual(classify_http_failure(404), "permanent")
        self.assertEqual(retry_delay(2, base_seconds=1, maximum_seconds=30), 4)
        self.assertEqual(retry_delay(2, retry_after="9", maximum_seconds=30), 9)


if __name__ == "__main__":
    unittest.main()
