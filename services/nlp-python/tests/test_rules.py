import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.extractors import (
    canonicalize_who_disease_labels,
    country_scope,
    extract_country_hint,
    extract_case_count,
    extract_death_count,
    has_explicit_case_count,
    extract_who_disease_mentions,
    is_explicit_outbreak_report,
    is_policy_or_statistical_health_content,
)


class ClassificationRulesTest(unittest.TestCase):
    def test_detects_south_sudan_as_country_context(self):
        self.assertEqual(extract_country_hint("UNICEF South Sudan humanitarian situation report"), "South Sudan")
        self.assertEqual(country_scope("South Sudan"), "OUTSIDE ASEAN")
        self.assertEqual(extract_country_hint("wabah Ebola di Kongo"), "Democratic Republic of the Congo")
        self.assertEqual(country_scope("Democratic Republic of the Congo"), "OUTSIDE ASEAN")
        self.assertEqual(country_scope("Indonesia"), "Indonesia")

    def test_policy_statistics_are_not_outbreak(self):
        text = (
            "Per Mei 2026 terdapat 39.672 kasus DBD dan 105 kematian. "
            "Kemenkes memperkuat deteksi dini, surveilans, vaksinasi, dan inovasi wolbachia."
        )
        self.assertTrue(is_policy_or_statistical_health_content(text))
        self.assertFalse(is_explicit_outbreak_report(text))

    def test_explicit_outbreak_is_detected(self):
        self.assertTrue(is_explicit_outbreak_report("An outbreak was declared after local transmission and 40 new cases."))

    def test_historical_or_negative_outbreak_reference_is_not_incident(self):
        text = "Artikel kebijakan membahas pengalaman wabah DBD tahun-tahun sebelumnya; tidak ada kejadian baru atau klaster lokal."
        self.assertFalse(is_explicit_outbreak_report(text))

    def test_local_disease_keyword_maps_to_who_canonical(self):
        concepts = [{"canonical_name": "CHOLERA", "english_name": "Cholera"}]
        self.assertEqual(canonicalize_who_disease_labels(["CHOLERA"], concepts), ["CHOLERA"])
        self.assertEqual(extract_who_disease_mentions("Cholera outbreak", concepts), ["CHOLERA"])

    def test_deaths_are_not_counted_as_cases(self):
        text = "Lebih dari 2.300 orang telah meninggal dalam wabah Ebola di Kongo."
        self.assertEqual(extract_case_count(text), 1)
        self.assertEqual(extract_death_count(text), 2300)
        self.assertFalse(has_explicit_case_count(text))
        self.assertTrue(has_explicit_case_count("1 confirmed case and 23 deaths."))

    def test_case_count_is_not_discarded_by_later_death_statistic(self):
        text = "Ada 39.672 kasus DBD dan 105 kematian sampai Mei 2026."
        self.assertEqual(extract_case_count(text), 39672)
        self.assertEqual(extract_death_count(text), 105)


if __name__ == "__main__":
    unittest.main()
