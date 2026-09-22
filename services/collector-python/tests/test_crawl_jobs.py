import socket
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.crawl_jobs import analyze_article, _article_matches, _disease_labels, _selected_concept, sanitize_crawl_url
from app.crawler_identity import UnsafeUrlError


class CrawlJobLogicTests(unittest.TestCase):
    def test_surveillance_labels_keep_a_scalar_as_one_label(self):
        analysis = {"disease_classification": "Dengue"}
        self.assertEqual(_disease_labels(analysis), ["Dengue"])

    def test_selected_concept_does_not_use_first_character(self):
        labels = _disease_labels({"disease_classification": ["Dengue"]})
        concept = {"canonical_name": "Dengue", "id": "concept-1"}
        label, selected = _selected_concept(labels, [concept])
        self.assertEqual(label, "Dengue")
        self.assertEqual(selected, concept)

    def test_article_filter_accepts_surveillance_list_and_country(self):
        analysis = {
            "disease_classification": ["Dengue"],
            "locations": [{"country": "Indonesia"}],
        }
        self.assertTrue(_article_matches(analysis, ["Dengue"], "Indonesia"))
        self.assertFalse(_article_matches(analysis, ["Measles"], "Indonesia"))

    def test_direct_url_rejects_loopback_before_queue(self):
        resolver = lambda *_: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 0))]
        with self.assertRaises(UnsafeUrlError):
            sanitize_crawl_url("http://example.org/private", resolver=resolver)

    def test_direct_url_accepts_public_address(self):
        resolver = lambda *_: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))]
        self.assertEqual(
            sanitize_crawl_url("https://example.org/news?utm_source=rss", resolver=resolver),
            "https://example.org/news",
        )
        self.assertIsNone(sanitize_crawl_url(None))

    def test_collector_calls_shared_surveillance_adapter(self):
        from unittest.mock import Mock, patch

        response = Mock()
        response.json.return_value = {"disease_classification": ["Dengue"]}
        response.raise_for_status.return_value = None
        with patch("app.crawl_jobs.requests.post", return_value=response) as post:
            result = analyze_article({
                "content": "12 dengue cases and one death in Thailand.",
                "source_name": "example.org",
                "published_at": "2026-09-22",
                "url": "https://example.org/dengue",
            })

        self.assertEqual(result["disease_classification"], ["Dengue"])
        self.assertIn("/nlp/analyze/surveillance", post.call_args.args[0])
        self.assertEqual(post.call_args.kwargs["json"]["source_url"], "https://example.org/dengue")


if __name__ == "__main__":
    unittest.main()
