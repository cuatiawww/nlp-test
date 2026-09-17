"""Regression gate for live teammate Sheet10 URL Analysis QA.

Add a new fail by appending to tests/qa_teammate/gold.json (preferred) or by
filling Checklist=✘ plus Description in tests/qa_teammate/sheet10.csv and
adding article_text for that URL in gold.json.

Re-run from the nlp-python service root:
  python3 -m unittest tests.test_qa_teammate_sheet10 tests.test_epidemiology tests.test_cidrap_cambodia

Live URL re-eval after deploy:
  ANALYZE with force_refresh / Re-analyze checkbox on /nlp/analyze
  NLP_API_URL=... python3 scripts/asean_url_accuracy_harness.py --force-refresh
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import extractors
from app.epidemiology import extract_event_period
from tests.nlp_gold.gazetteer import seed_gold_gazetteer
from tests.qa_teammate.harness import load_gold_cases, run_qa_gold


class TeammateSheet10QaTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        seed_gold_gazetteer()
        cls.report = run_qa_gold()
        cls.by_no = {score.no: score for score in cls.report["scores"]}

    def test_reviewed_gold_rows_are_present(self):
        gold = load_gold_cases()
        self.assertEqual(len(gold), 7)
        self.assertEqual({row["no"] for row in gold}, {"1", "2", "3", "51", "52", "53", "54"})

    def test_all_scored_gold_rows_pass(self):
        failures = [
            f"{item.no}: " + "; ".join(f"{check.name} ({check.detail})" for check in item.failed_checks)
            for item in self.report["failures"]
        ]
        self.assertEqual(failures, [], "\n".join(failures))

    def test_no1_brunei_nipah_zero_cases(self):
        score = self.by_no["1"]
        self.assertTrue(score.passed, score.failed_checks)
        self.assertEqual(score.prediction.get("case_count"), 0)
        self.assertTrue(score.prediction.get("zero_cases_stated"))
        self.assertIn("nipah", " ".join(score.prediction.get("diseases") or []).lower()
                      + " " + str(score.prediction.get("disease") or "").lower())

    def test_no2_cambodia_h5n1_does_not_regress(self):
        score = self.by_no["2"]
        self.assertTrue(score.passed, score.failed_checks)
        self.assertEqual(score.prediction.get("case_count"), 1)
        self.assertEqual(score.prediction.get("country"), "Cambodia")

    def test_no3_cambodia_h5n1_second_case_does_not_regress(self):
        score = self.by_no["3"]
        self.assertTrue(score.passed, score.failed_checks)
        self.assertEqual(score.prediction.get("case_count"), 1)
        self.assertEqual(score.prediction.get("country"), "Cambodia")

    def test_no51_mpox_range_is_flagged_not_gospel(self):
        score = self.by_no["51"]
        self.assertTrue(score.passed, score.failed_checks)
        period = score.prediction.get("period") or {}
        self.assertTrue(period.get("date_needs_review"))
        self.assertEqual(period.get("event_date_start"), "2026-01-01")
        self.assertEqual(period.get("event_date_end"), "2026-08-23")
        self.assertEqual(score.prediction.get("case_count"), 254)
        self.assertEqual(period.get("period_type"), "cumulative")

    def test_no52_mpox_cumulative_window(self):
        score = self.by_no["52"]
        self.assertTrue(score.passed, score.failed_checks)
        self.assertEqual(score.prediction.get("count_period_type"), "cumulative")
        self.assertEqual(score.prediction.get("case_count"), 933)
        self.assertEqual(score.prediction.get("death_count"), 13)
        period = score.prediction.get("period") or {}
        self.assertTrue(period.get("date_needs_review"))
        self.assertEqual(period.get("event_date_start"), "2025-09-01")

    def test_no53_ncd_exhibition_is_not_an_outbreak_row(self):
        score = self.by_no["53"]
        self.assertTrue(score.passed, score.failed_checks)
        self.assertTrue(score.prediction.get("ncd_only") or score.prediction.get("non_health_topic"))
        self.assertEqual(score.prediction.get("diseases") or [], [])
        self.assertNotEqual((score.prediction.get("location") or "").casefold(), "long")
        disease = score.prediction.get("disease") or ""
        self.assertNotIn(",", disease)

    def test_no54_influenza_rsv_split_or_reject_mega_count(self):
        score = self.by_no["54"]
        self.assertTrue(score.passed, score.failed_checks)
        joined = " ".join(score.prediction.get("diseases") or []).lower()
        self.assertNotIn(",", score.prediction.get("disease") or "")
        self.assertTrue(
            "influenza" in joined and ("rsv" in joined or "syncytial" in joined),
            joined,
        )
        self.assertLess(int(score.prediction.get("case_count") or 0), 10000)
        self.assertTrue(score.prediction.get("vaccine_campaign"))
        from app.multi_fact_display import collapse_facts, short_disease_label
        collapsed = collapse_facts([
            {"disease": name, "location_name": "Bangkok", "case_count": 0, "death_count": 0}
            for name in (score.prediction.get("diseases") or [])
        ])
        self.assertIn("; ", collapsed["disease_display"])
        self.assertNotIn(",", collapsed["disease_display"])
        self.assertIn("RSV", collapsed["disease_display"] or short_disease_label("RSV"))

    def test_long_gazetteer_collision_is_rejected(self):
        self.assertFalse(extractors.is_usable_place_name("Long", "ชวนลองเผชิญโรคร้าย"))

    def test_sheet10_loader_keeps_fail_notes(self):
        from tests.qa_teammate.harness import load_sheet10_fail_notes
        notes = load_sheet10_fail_notes()
        self.assertGreaterEqual(len(notes), 5)
        urls = {row["url"] for row in notes}
        self.assertIn("https://www.bruneitribune.com/no-nipah-virus-cases-detected-in-brunei-darussalam/", urls)


class TeammateExtractorHelpersTest(unittest.TestCase):
    def test_zero_cases_regex_on_gold_title(self):
        title = (
            "Bandar seri begawan: No cases of Nipah virus infection have been "
            "reported in Brunei Darussalam, following recent detections in India."
        )
        self.assertTrue(extractors.article_states_zero_cases(title))
        self.assertEqual(extractors.extract_case_count(title, disease="Nipah virus disease"), 0)

    def test_split_does_not_keep_comma_joined_ncds(self):
        split = extractors.split_unrelated_disease_labels(["Cancer, Stroke, Heart Attack"])
        self.assertGreaterEqual(len(split), 3)
        self.assertNotIn("Cancer, Stroke, Heart Attack", split)

    def test_mpox_range_period(self):
        period = extract_event_period(
            "From 1 January to 23 August 2026, Thailand recorded 254 mpox cases."
        )
        self.assertEqual(period["event_date_start"], "2026-01-01")
        self.assertEqual(period["event_date_end"], "2026-08-23")
        self.assertTrue(period["date_needs_review"])
        self.assertEqual(period["period_type"], "cumulative")


if __name__ == "__main__":
    unittest.main()
