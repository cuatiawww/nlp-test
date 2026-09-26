import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.discovery import (
    DiscoveryEngine,
    discover_urls,
    pagination_urls,
    parse_feed,
    parse_sitemap,
    select_manual_crawl_sources,
    source_matches_geography,
)


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


class ManualCatalogDiscoveryTests(unittest.TestCase):
    def test_disabled_malaysian_catalog_is_kept_and_china_is_skipped(self):
        sources = [
            {
                "name": "The Star",
                "country": "Malaysia",
                "enabled": False,
                "source_type": "web",
                "config": {
                    "url": "https://www.thestar.com.my/",
                    "validity_status": "Official",
                    "from_engine": "No",
                },
            },
            {
                "name": "163",
                "country": "China",
                "enabled": False,
                "source_type": "web",
                "config": {"url": "https://163.com/", "validity_status": "Unofficial", "from_engine": "Yes"},
            },
        ]
        selected = select_manual_crawl_sources(sources, "Malaysia", "ASEAN")
        self.assertEqual([row["name"] for row in selected], ["The Star"])
        self.assertFalse(source_matches_geography(sources[1], None, "ASEAN"))
        self.assertTrue(source_matches_geography({"country": "International"}, "Malaysia", "ASEAN"))
        self.assertFalse(source_matches_geography(
            {"country": "Malaysia"}, None, "Europe", ["France", "Germany"],
        ))
        self.assertTrue(source_matches_geography(
            {"country": "France"}, None, "Europe", ["France", "Germany"],
        ))

    def test_official_main_source_ranks_ahead_of_google_other_and_international(self):
        selected = select_manual_crawl_sources(
            [
                {
                    "name": "WHO",
                    "country": "International",
                    "enabled": False,
                    "config": {"validity_status": "Official", "from_engine": "No", "source_origin": "Main Source"},
                },
                {
                    "name": "Google Mirror",
                    "country": "Malaysia",
                    "enabled": False,
                    "config": {"validity_status": "Unofficial", "from_engine": "Yes", "source_origin": "Other Source"},
                },
                {
                    "name": "The Star",
                    "country": "Malaysia",
                    "enabled": False,
                    "config": {"validity_status": "Official", "from_engine": "No", "source_origin": "Main Source"},
                },
            ],
            "Malaysia",
            "ASEAN",
        )
        self.assertEqual([row["name"] for row in selected], ["The Star", "Google Mirror", "WHO"])

    def test_campak_alias_matches_measles_filter(self):
        engine = DiscoveryEngine(["Measles"], "Indonesia", "ASEAN", None, None, 10)
        engine.add(
            {
                "url": "https://kompas.id/artikel/campak-8000",
                "title": "Lebih dari 8000 kasus suspek campak",
                "source_country": "Indonesia",
            },
            "Kompas",
        )
        self.assertEqual(len(engine.results), 1)

    def test_malaysian_source_keeps_dengue_link_without_country_word_in_title(self):
        engine = DiscoveryEngine(["Dengue"], "Malaysia", "ASEAN", None, None, 10)
        engine.add(
            {
                "url": "https://www.thestar.com.my/news/nation/dengue-surge",
                "title": "Sharp dengue surge sets off alarm",
                "source_country": "Malaysia",
            },
            "The Star",
        )
        self.assertEqual(len(engine.results), 1)

    def test_disabled_web_homepage_is_scanned_without_recursive_flags(self):
        fetched = []

        def fake_fetch(url, timeout=20):
            fetched.append(url)
            raise RuntimeError("skip network")

        with patch("app.discovery._fetch_bytes", side_effect=fake_fetch):
            discover_urls(
                ["Dengue"],
                "Malaysia",
                "ASEAN",
                None,
                None,
                20,
                [{
                    "name": "The Star",
                    "source_type": "web",
                    "enabled": False,
                    "country": "Malaysia",
                    "config": {"url": "https://www.thestar.com.my/"},
                }],
            )
        self.assertTrue(any("news.google.com" in url for url in fetched))
        self.assertTrue(any("thestar.com.my" in url for url in fetched))

    def test_google_news_does_not_consume_the_entire_url_budget(self):
        fetched = []

        def filling_feed(self, feed_url, source, trusted_query=False, entry_limit=None, source_country=None):
            if source != "Google News":
                return
            limit = entry_limit if entry_limit is not None else self.max_urls
            for index in range(limit):
                self.add(
                    {
                        "url": f"https://example.org/google/{index}",
                        "title": "Dengue Malaysia",
                        "source_country": "Malaysia",
                    },
                    source,
                    trusted_query=True,
                )

        def fake_fetch(url, timeout=20):
            fetched.append(url)
            raise RuntimeError("skip catalog")

        with patch.object(DiscoveryEngine, "feed", filling_feed):
            with patch("app.discovery._fetch_bytes", side_effect=fake_fetch):
                discover_urls(
                    ["Dengue"],
                    "Malaysia",
                    "ASEAN",
                    None,
                    None,
                    20,
                    [{
                        "name": "The Star",
                        "source_type": "web",
                        "enabled": False,
                        "country": "Malaysia",
                        "config": {"url": "https://www.thestar.com.my/"},
                    }],
                )
        self.assertTrue(any("thestar.com.my" in url for url in fetched))


if __name__ == "__main__":
    unittest.main()
