import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.discovery import DiscoveryEngine, pagination_urls, parse_feed, parse_sitemap


class DiscoveryTests(unittest.TestCase):
    def test_parses_rss_and_atom_candidates(self):
        rss = b"""<rss><channel><item><title>Dengue update</title>
        <link>https://example.org/news/1</link><pubDate>2026-09-01</pubDate>
        <description>Indonesia reports dengue cases</description></item></channel></rss>"""
        rows = parse_feed(rss, "https://example.org/feed.xml")
        self.assertEqual(rows[0]["url"], "https://example.org/news/1")
        self.assertEqual(rows[0]["published_at"], "2026-09-01")

    def test_parses_sitemap_index_and_urlset(self):
        index_kind, indexes = parse_sitemap(
            b'<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://example.org/sitemap-news.xml</loc></sitemap></sitemapindex>'
        )
        url_kind, urls = parse_sitemap(
            b'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.org/dengue-indonesia</loc><lastmod>2026-09-02</lastmod></url></urlset>'
        )
        self.assertEqual(index_kind, "index")
        self.assertEqual(indexes[0]["url"], "https://example.org/sitemap-news.xml")
        self.assertEqual(url_kind, "urlset")
        self.assertEqual(urls[0]["published_at"], "2026-09-02")

    def test_engine_deduplicates_tracking_variants_and_filters_dates(self):
        engine = DiscoveryEngine(["Dengue"], "Indonesia", "ASEAN", "2026-01-01", "2026-12-31", 10)
        engine.add({"url": "https://example.org/dengue-indonesia?id=1&utm_source=rss", "title": "Dengue Indonesia", "published_at": "2026-09-01"}, "rss")
        engine.add({"url": "https://example.org/dengue-indonesia?id=1&utm_medium=email", "title": "Dengue Indonesia", "published_at": "2026-09-01"}, "sitemap")
        engine.add({"url": "https://example.org/dengue-indonesia?id=2", "title": "Dengue Indonesia", "published_at": "2025-09-01"}, "sitemap")
        self.assertEqual(len(engine.results), 1)
        self.assertEqual(engine.results[0]["url"], "https://example.org/dengue-indonesia?id=1")

    def test_common_pagination_forms_are_bounded(self):
        self.assertEqual(
            pagination_urls("https://example.org/news?category=health", 3),
            [
                "https://example.org/news?category=health&page=2",
                "https://example.org/news?category=health&page=3",
            ],
        )
        self.assertEqual(
            pagination_urls("https://example.org/news", 3, style="path"),
            ["https://example.org/news/page/2", "https://example.org/news/page/3"],
        )


if __name__ == "__main__":
    unittest.main()
