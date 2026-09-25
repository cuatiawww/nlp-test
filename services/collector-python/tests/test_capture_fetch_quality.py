"""Regression fixtures for ASEAN capture / fetch quality (mocked, no live fetch)."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.collectors.publisher_selectors import (
    is_slow_publisher,
    resolve_body_selectors,
)
from app.collectors.web_scraper import (
    _assess_extract_quality,
    _preserve_paragraphs,
)


ASEAN_FETCH_QUALITY_FIXTURES = [
    {
        "url": "https://www.pekanbaru.go.id/p/news/slow-or-empty-article-shell",
        "expected": "fetch_timeout_or_empty",
        "notes": "pekanbaru-like gov CMS; historically timed out or returned chrome-only HTML",
    },
    {
        "url": "https://diskes.example.go.id/berita/dengue-update",
        "expected": "empty_or_nav_only",
        "notes": "*.go.id CMS with nav chrome and thin body",
    },
    {
        "url": "https://www.tribunnews.com/regional/2024/01/01/cloudflare-challenge-shell",
        "expected": "source_challenge",
        "notes": "challenge residual must set quality flag / escalate, not feed NLP",
    },
    {
        "url": "https://www.newswav.com/article/short-teaser-only",
        "expected": "too_short",
        "notes": "aggregator teaser masquerading as full article",
    },
    {
        "url": "https://www.beritaharian.sg/dunia/ok-article-with-table",
        "expected": "quality_ok",
        "notes": "control: paragraphs + table text preserved",
    },
]


class PublisherSelectorTests(unittest.TestCase):
    def test_go_id_and_named_publishers_resolve(self):
        sels = resolve_body_selectors("https://www.pekanbaru.go.id/p/news/x")
        self.assertTrue(sels)
        self.assertIn("article", sels)
        self.assertTrue(is_slow_publisher("https://pekanbaru.go.id/x"))
        self.assertTrue(is_slow_publisher("https://www.tribunnews.com/a"))
        self.assertFalse(is_slow_publisher("https://example.org/a"))


class ParagraphAndQualityTests(unittest.TestCase):
    def test_preserve_paragraphs_keeps_newlines(self):
        raw = "First paragraph.\n\nSecond paragraph.\n\n\nThird."
        out = _preserve_paragraphs(raw)
        self.assertIn("\n\n", out)
        self.assertNotIn("\n\n\n", out)
        self.assertIn("First paragraph.", out)
        self.assertIn("Second paragraph.", out)

    def test_quality_gate_flags_nav_only_and_challenge(self):
        nav = "Home About Contact Privacy Terms Login Subscribe Newsletter"
        q = _assess_extract_quality(nav)
        self.assertFalse(q["quality_ok"])
        self.assertTrue(set(q["quality_flags"]) & {"nav_only", "too_short"})

        challenge = "Just a moment... Checking your browser before you access the site. " * 3
        q2 = _assess_extract_quality(challenge, html="<html>cf-browser-verification</html>")
        self.assertIn("challenge_residual", q2["quality_flags"])

    def test_fixture_table_covers_historical_classes(self):
        classes = {row["expected"] for row in ASEAN_FETCH_QUALITY_FIXTURES}
        self.assertIn("source_challenge", classes)
        self.assertIn("fetch_timeout_or_empty", classes)
        self.assertIn("quality_ok", classes)


class RssTeaserLogicTests(unittest.TestCase):
    def test_short_html_teaser_helper(self):
        # Import helper without loading feedparser by reading source and execing just the helpers.
        import importlib.util
        path = Path(__file__).resolve().parents[1] / "app" / "collectors" / "rss_news.py"
        src = path.read_text(encoding="utf-8")
        # Pull only the helper functions via regex-free exec of a minimal stub module.
        stub = {}
        # Execute just the helper defs by isolating them.
        start = src.find("def _plain_teaser")
        end = src.find("\nclass ")
        if start < 0 or end < 0:
            self.skipTest("rss helpers not found")
        code = "import re\n" + src[start:end]
        exec(code, stub)
        self.assertTrue(stub["_teaser_needs_full_article"]("Dengue", "<p>Short blurb</p>"))
        self.assertTrue(stub["_teaser_needs_full_article"]("Dengue", "Tiny"))
        long_plain = ("Health officials reported dengue cases across the province. " * 20)
        self.assertFalse(stub["_teaser_needs_full_article"]("Dengue surge", long_plain))


if __name__ == "__main__":
    unittest.main()
