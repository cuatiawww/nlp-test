import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.collectors.web_scraper import (
    _extract_main_content,
    _extract_published_at,
    _country_hint_from_url,
    _is_challenge,
    _is_spa_shell,
    _normalize_url,
    _response_html,
    _selected_text,
)


class FakeElement:
    def __init__(self, text):
        self.text = text

    def get_all_text(self, separator=" ", strip=False):
        return self.text.strip() if strip else self.text


class FakeMatches(list):
    @property
    def first(self):
        return self[0] if self else None


class FakePage:
    status = 200

    def __init__(self, html="", selectors=None, body=b""):
        self.html_content = html
        self.body = body
        self.selectors = selectors or {}

    def css(self, selector):
        value = self.selectors.get(selector)
        return FakeMatches([] if value is None else [FakeElement(value)])


class WebScraperHelpersTest(unittest.TestCase):
    def test_country_hint_from_reliefweb_url(self):
        self.assertEqual(
            _country_hint_from_url(
                "https://reliefweb.int/report/south-sudan/unicef-south-sudan-humanitarian-situation-report"
            ),
            "South Sudan",
        )

    def test_country_hint_is_empty_for_unrecognised_path(self):
        self.assertEqual(_country_hint_from_url("https://example.org/news/article"), "")

    def test_country_hint_uses_article_path_not_publisher_tld(self):
        self.assertEqual(
            _country_hint_from_url("https://www.cdc.gov/global-health/countries/laos.html"),
            "Laos",
        )
        self.assertEqual(
            _country_hint_from_url("https://laos.embassy.gov.au/vtan/article.html"),
            "Laos",
        )
        self.assertEqual(
            _country_hint_from_url("https://www.smartraveller.gov.au/destinations/asia/laos"),
            "Laos",
        )
        self.assertEqual(
            _country_hint_from_url(
                "https://asianews.network/malaysias-dengue-cases-surge-66-deaths-nearly-double/"
            ),
            "Malaysia",
        )

    def test_detects_blocked_statuses(self):
        for status in (403, 429, 503):
            self.assertTrue(_is_challenge(status, ""))

    def test_detects_cloudflare_challenge_body(self):
        self.assertTrue(_is_challenge(200, "<title>Just a moment...</title>"))
        self.assertFalse(_is_challenge(200, "<article>Health news</article>"))

    def test_response_html_falls_back_to_bytes_body(self):
        page = FakePage(body="berita kesehatan".encode())
        self.assertEqual(_response_html(page), "berita kesehatan")

    def test_selected_text_requires_matching_selector(self):
        page = FakePage(selectors={"article": "  outbreak update  "})
        self.assertEqual(_selected_text(page, "article"), "outbreak update")
        self.assertEqual(_selected_text(page, ".missing"), "")

    def test_normalize_url_removes_trailing_slash_before_query(self):
        self.assertEqual(
            _normalize_url("https://beaconbio.org/en/event/?eventId=123&locations=456"),
            "https://beaconbio.org/en/event?eventId=123&locations=456",
        )
        self.assertEqual(
            _normalize_url("https://example.com/news/123/"),
            "https://example.com/news/123/",
        )

    def test_spa_shell_detection(self):
        spa_html = """
        <html><head><title>App</title><script src="chunk1.js"></script><script src="chunk2.js"></script></head>
        <body>
          <nav>Home About Contact</nav>
          <div id="root"></div>
        </body></html>
        """ + ("<!-- padding -->" * 400)
        self.assertTrue(_is_spa_shell(spa_html))

        normal_html = """
        <html><head><title>Article</title></head><body>
          <article>
            <h1>Dengue Fever Outbreak</h1>
            <p>Health officials confirmed over 50 cases of dengue fever in the province this week.</p>
            <p>Vector control measures are underway across all districts.</p>
          </article>
        </body></html>
        """
        self.assertFalse(_is_spa_shell(normal_html))

    def test_main_content_excludes_navigation_and_footer(self):
        html = """
        <html><head><title>Outbreak Update</title></head><body>
          <nav>Home Products Login Subscribe About Contact</nav>
          <article><h1>Dengue cases increase</h1>
            <p>Health officials reported one hundred dengue cases in the province.</p>
            <p>Hospitals have increased surveillance and treatment capacity.</p>
          </article>
          <footer>Privacy Terms Newsletter Copyright</footer>
        </body></html>
        """
        title, content = _extract_main_content(html)
        self.assertIn(title, {"Outbreak Update", "Dengue cases increase"})
        self.assertIn("Health officials", content)
        self.assertNotIn("Subscribe", content)
        self.assertNotIn("Privacy Terms", content)

    def test_published_date_prefers_article_metadata(self):
        html = """
        <html><head>
          <meta property="article:published_time" content="2026-08-19T11:05:00+07:00">
        </head><body><article>Long enough article content.</article></body></html>
        """
        self.assertEqual(_extract_published_at(html), "2026-08-19")


class InteractiveExtractTimeoutTests(unittest.IsolatedAsyncioTestCase):
    async def test_auto_mode_skips_stealth_for_url_analysis(self):
        from unittest.mock import AsyncMock, patch
        from app.collectors.web_scraper import FetchOutcome, WebScraperCollector

        html = (
            "<html><body><article><h1>Dengue outbreak</h1>"
            "<p>Health officials reported fifty dengue cases in the province this week.</p>"
            "</article></body></html>"
        )
        outcome = FetchOutcome(
            page=None,
            html=html,
            status=200,
            mode="direct_http",
            final_url="https://example.org/news",
        )
        collector = WebScraperCollector({
            "id": "interactive-analyzer",
            "name": "URL Analyzer",
            "config": {
                "fetch_mode": "auto",
                "timeout_ms": 5000,
                "max_retries": 0,
                "skip_stealth": True,
            },
        })
        with patch.object(collector, "_fetch_direct_http", AsyncMock(return_value=outcome)) as direct, \
             patch.object(collector, "_fetch_stealth", AsyncMock()) as stealth, \
             patch("app.collectors.web_scraper.validate_public_url", side_effect=lambda value: value), \
             patch("app.collectors.web_scraper._extract_main_content", return_value=(
                 "Dengue outbreak",
                 "Health officials reported fifty dengue cases in the province this week.",
             )), \
             patch("app.collectors.web_scraper._extract_published_at", return_value="2026-09-01"), \
             patch("app.collectors.web_scraper._identity_payload", return_value={
                 "normalized_url": "https://example.org/news",
                 "canonical_url": "https://example.org/news",
                 "url_hash": "abc",
                 "content_hash": "def",
                 "final_url": "https://example.org/news",
                 "author": "",
             }):
            data = await collector.extract_url("https://example.org/news")
        stealth.assert_not_called()
        direct.assert_called()
        self.assertIn("dengue", data["content"].lower())

    def test_interactive_timeout_is_capped_at_forty_five_seconds(self):
        from app.collectors.web_scraper import WebScraperCollector

        collector = WebScraperCollector({
            "id": "interactive-analyzer",
            "name": "URL Analyzer",
            "config": {"timeout_ms": 120_000},
        })
        self.assertEqual(collector._interactive_timeout_seconds(), 45)


if __name__ == "__main__":
    unittest.main()
