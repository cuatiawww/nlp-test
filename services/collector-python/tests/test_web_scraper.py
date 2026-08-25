import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.collectors.web_scraper import (
    _extract_main_content,
    _is_challenge,
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


if __name__ == "__main__":
    unittest.main()
