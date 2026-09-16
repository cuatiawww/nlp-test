import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from asean_url_catalog import (
    CASES,
    COUNTRIES,
    NEWSWAV_JOHOR_DENGUE,
    cases_by_country,
    regression_cases,
    validate_catalog,
)
from asean_url_accuracy_harness import evaluate_expect, _is_full_nlp


class AseanUrlCatalogTests(unittest.TestCase):
    def test_catalog_has_three_urls_per_asean_country(self):
        self.assertEqual(validate_catalog(), [])
        grouped = cases_by_country()
        for country in COUNTRIES:
            self.assertGreaterEqual(len(grouped[country]), 3, country)
        self.assertGreaterEqual(len(CASES), 33)

    def test_newswav_johor_is_a_malaysia_regression(self):
        rows = regression_cases()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["country"], "Malaysia")
        self.assertEqual(rows[0]["url"], NEWSWAV_JOHOR_DENGUE)
        expect = rows[0]["expect"]
        self.assertIn("dengue", expect["disease_contains"])
        self.assertEqual(expect["country"], "Malaysia")
        self.assertGreaterEqual(expect["case_count"]["min"], 9000)
        self.assertLessEqual(expect["case_count"]["max"], 11000)
        self.assertGreaterEqual(expect["death_count"]["min"], 10)
        self.assertIn("measles", expect["must_not_disease"])
        self.assertIn("Indonesia", expect["must_not_country"])

    def test_expect_scorer_does_not_invent_counts(self):
        failures = evaluate_expect(
            {"disease_classification": "Dengue", "country": "Malaysia"},
            {"disease_contains": ["dengue"], "country": "Malaysia", "case_count": {"min": 9000, "max": 11000}},
        )
        self.assertTrue(any("cases missing" in item for item in failures))
        failures = evaluate_expect(
            {
                "disease_classification": "Dengue",
                "country": "Malaysia",
                "case_count": 9954,
                "death_count": 13,
            },
            {
                "disease_contains": ["dengue"],
                "country": "Malaysia",
                "case_count": {"min": 9000, "max": 11000},
                "death_count": {"min": 10, "max": 16},
                "must_not_disease": ["measles"],
                "must_not_country": ["Indonesia"],
            },
        )
        self.assertEqual(failures, [])

    def test_full_nlp_detector_rejects_408_rules_only(self):
        self.assertFalse(
            _is_full_nlp(
                {"analysis_status": "partial"},
                ['Full NLP unavailable (NLP HTTP 408: {"detail": "NLP stage exceeded budget (90s)"}); attempted bounded rules-only analysis'],
            )
        )
        self.assertTrue(_is_full_nlp({"analysis_status": "completed"}, []))


if __name__ == "__main__":
    unittest.main()
