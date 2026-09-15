import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.crawl_matrix_jobs import (
    analyze_article,
    article_matches,
    build_news_query,
    disease_labels,
    extract_article,
    prepare_text_for_nlp,
    selected_concept,
)


class CrawlMatrixWorkerTests(unittest.TestCase):
    def test_news_query_uses_diseases_as_alternatives_and_does_not_require_asean_word(self):
        query = build_news_query(["Dengue", "Measles"], None, "ASEAN")
        self.assertIn("Dengue OR Measles", query)
        self.assertNotIn("ASEAN", query)

    def test_scalar_and_list_disease_outputs_have_the_same_shape(self):
        self.assertEqual(disease_labels({"disease_classification": "Dengue"}), ["Dengue"])
        self.assertEqual(disease_labels({"disease_classification": ["Dengue", "Measles"]}), ["Dengue", "Measles"])

    def test_filter_keeps_matching_disease_and_country(self):
        article = {"title": "Dengue in Jakarta", "content": "Health officials reported cases"}
        analysis = {
            "disease_classification": ["Dengue"],
            "locations": [{"country": "Indonesia"}],
        }
        self.assertTrue(article_matches(article, analysis, ["Dengue"], "Indonesia"))
        self.assertFalse(article_matches(article, analysis, ["Measles"], "Indonesia"))

    def test_campak_and_dbd_aliases_match_icd11_filters(self):
        self.assertTrue(article_matches(
            {"title": "Wabah di Jawa", "content": "petugas kesehatan"},
            {"disease_classification": ["campak"], "locations": [{"country": "Indonesia"}]},
            ["Measles"],
            "Indonesia",
        ))

        dengue_article = {"title": "Kasus DBD meningkat", "content": "demam berdarah di Selangor"}
        dengue_analysis = {"disease_classification": ["Dengue"], "locations": []}
        self.assertTrue(article_matches(
            {**dengue_article, "source_country": "Malaysia"},
            dengue_analysis,
            ["Dengue"],
            "Malaysia",
        ))

    def test_asia_publisher_label_does_not_drop_malaysia_source_country(self):
        article = {
            "title": "Malaysia dengue cases surge",
            "content": "Putrajaya reported dengue deaths",
            "source_country": "Malaysia",
        }
        analysis = {"disease_classification": ["Dengue"], "locations": [{"country": "Asia"}]}
        self.assertTrue(article_matches(article, analysis, ["Dengue"], "Malaysia"))

    def test_prepare_text_sends_title_with_content(self):
        text = prepare_text_for_nlp({"title": "Dengue surge", "content": "Officials reported cases."})
        self.assertIn("Dengue surge", text)
        self.assertIn("Officials reported cases.", text)

    def test_pipeline_analysis_to_matrix_keeps_primary_country(self):
        from app.crawl_matrix_jobs import pipeline_analysis_to_matrix
        adapted = pipeline_analysis_to_matrix({
            "disease_classification": "Dengue",
            "country": "Malaysia",
            "location_name": "Selangor",
            "case_count": 19313,
            "death_count": 21,
            "case_count_unknown": False,
            "locations": [{"name": "Singapore", "country": "Singapore"}],
            "sub_events": [],
        })
        self.assertEqual(adapted["locations"][0]["country"], "Malaysia")
        self.assertEqual(adapted["locations"][0]["reported_cases"], 19313)

    def test_analyze_article_passes_title_and_source_country(self):
        from unittest.mock import Mock, patch
        response = Mock()
        response.json.return_value = {"disease_classification": ["Dengue"]}
        response.raise_for_status.return_value = None
        with patch("app.crawl_matrix_jobs.requests.post", return_value=response) as post:
            analyze_article({
                "title": "Sharp dengue surge",
                "content": "Health officials reported dengue cases.",
                "source_name": "thestar.com.my",
                "source_country": "Malaysia",
                "url": "https://www.thestar.com.my/news/nation/dengue",
            })
        payload = post.call_args.kwargs["json"]
        self.assertIn("/nlp/analyze/raw", post.call_args.args[0])
        self.assertIn("Sharp dengue surge", payload["text"])
        self.assertEqual(payload["source_country"], "Malaysia")

    def test_concept_resolution_keeps_full_label(self):
        label, concept = selected_concept(
            ["Dengue"],
            [{"canonical_name": "Dengue", "ontology_code": "1D2Z"}],
        )
        self.assertEqual(label, "Dengue")
        self.assertEqual(concept["ontology_code"], "1D2Z")

    def test_concept_resolution_maps_campak_alias_to_measles(self):
        label, concept = selected_concept(
            ["campak"],
            [{"canonical_name": "Measles", "ontology_code": "1F03"}],
        )
        self.assertEqual(label, "campak")
        self.assertEqual(concept["ontology_code"], "1F03")

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
