import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.extractors import is_content_too_short_or_noisy


class ContentQualityTest(unittest.TestCase):
    def test_nav_only_content_rejected(self):
        nav_text = "Disease Reports\nAbout\nResources\nBlog\nErrata\nContact Us\nSubscribe"
        self.assertTrue(is_content_too_short_or_noisy(nav_text, has_health_indicators=False))

    def test_normal_health_article_accepted(self):
        article = (
            "Kementerian Kesehatan melaporkan adanya peningkatan kasus demam berdarah dengue "
            "di beberapa wilayah Jawa Tengah selama musim hujan. Masyarakat diimbau melakukan 3M plus."
        )
        self.assertFalse(is_content_too_short_or_noisy(article, has_health_indicators=True))

    def test_short_valid_alert_with_health_indicator_accepted(self):
        alert = "5 confirmed cholera cases reported in Morowali."
        self.assertFalse(is_content_too_short_or_noisy(alert, has_health_indicators=True))

    def test_empty_or_whitespace_rejected(self):
        self.assertTrue(is_content_too_short_or_noisy("", has_health_indicators=False))
        self.assertTrue(is_content_too_short_or_noisy("   \n\t  ", has_health_indicators=False))

    def test_pure_html_feed_snippet_without_health_rejected(self):
        feed_snippet = '<ol><li><a href="https://news.google.com/rss/articles/123">Fire Spread in Building</a></li></ol>'
        self.assertTrue(is_content_too_short_or_noisy(feed_snippet, has_health_indicators=False))


if __name__ == "__main__":
    unittest.main()
