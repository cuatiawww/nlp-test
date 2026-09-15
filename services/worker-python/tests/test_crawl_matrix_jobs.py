import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.crawl_matrix_jobs import article_matches, build_news_query, disease_labels, extract_article, selected_concept


class CrawlMatrixWorkerTests(unittest.TestCase):
    def test_news_query_uses_diseases_as_alternatives_and_does_not_require_asean_word(self):
        query = build_news_query(["Dengue", "Measles"], None, "ASEAN")
        self.assertIn("Dengue OR Measles", query)
        self.assertNotIn("ASEAN", query)

    def test_scalar_and_list_disease_outputs_have_the_same_shape(self):
        self.assertEqual(disease_labels({"disease_classification": "Dengue"}), ["Dengue"])
        self.assertEqual(disease_labels({"disease_classification": ["Dengue", "Measles"]}), ["Dengue", "Measles"])

    def test_filter_keeps_matching_disease_and_country(self):
        analysis = {
            "disease_classification": ["Dengue"],
            "locations": [{"country": "Indonesia"}],
        }
        self.assertTrue(article_matches(analysis, ["Dengue"], "Indonesia"))
        self.assertFalse(article_matches(analysis, ["Measles"], "Indonesia"))

    def test_concept_resolution_keeps_full_label(self):
        label, concept = selected_concept(
            ["Dengue"],
            [{"canonical_name": "Dengue", "ontology_code": "1D2Z"}],
        )
        self.assertEqual(label, "Dengue")
        self.assertEqual(concept["ontology_code"], "1D2Z")

    def test_extract_article_never_uses_stealth_or_auto(self):
        from unittest.mock import Mock, patch

        sparse = Mock()
        sparse.json.return_value = {"data": {"content": "short"}}
        sparse.raise_for_status.return_value = None
        sparse.status_code = 200
        richer = Mock()
        richer.json.return_value = {"data": {"content": "Health officials reported dengue cases across the province this week."}}
        richer.status_code = 200
        with patch("app.crawl_matrix_jobs.requests.post", side_effect=[sparse, richer]) as post:
            extract_article({"url": "https://example.org/news"})
        self.assertEqual(post.call_count, 2)
        for call in post.call_args_list:
            payload = call.kwargs["json"]
            self.assertEqual(payload["fetch_mode"], "http")
            self.assertEqual(payload["max_retries"], 0)
            self.assertLessEqual(payload["timeout_ms"], 15000)
            self.assertLessEqual(call.kwargs["timeout"][1], 25)


if __name__ == "__main__":
    unittest.main()
