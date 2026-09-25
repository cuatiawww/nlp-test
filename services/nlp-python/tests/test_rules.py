import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.extractors import (
    canonicalize_disease_labels,
    country_scope,
    extract_country_hint,
    extract_case_count,
    extract_death_count,
    has_explicit_case_count,
    extract_disease_mentions,
    is_explicit_outbreak_report,
    is_policy_or_statistical_health_content,
)
from app.epidemiology import calibrate_outbreak_alert


class ClassificationRulesTest(unittest.TestCase):
    def test_detects_south_sudan_as_country_context(self):
        self.assertEqual(extract_country_hint("UNICEF South Sudan humanitarian situation report"), "South Sudan")
        self.assertEqual(country_scope("South Sudan"), "OUTSIDE ASEAN")
        self.assertEqual(extract_country_hint("wabah Ebola di Kongo"), "Democratic Republic of the Congo")
        self.assertEqual(country_scope("Democratic Republic of the Congo"), "OUTSIDE ASEAN")
        self.assertEqual(country_scope("Indonesia"), "Indonesia")
        self.assertEqual(country_scope("Viet Nam"), "Vietnam")
        self.assertEqual(country_scope("Lao PDR"), "Laos")
        self.assertEqual(country_scope("United States"), "OUTSIDE ASEAN")
        self.assertEqual(country_scope("Utah"), "OUTSIDE ASEAN")

    def test_policy_statistics_are_not_outbreak(self):
        text = (
            "Per Mei 2026 terdapat 39.672 kasus DBD dan 105 kematian. "
            "Kemenkes memperkuat deteksi dini, surveilans, vaksinasi, dan inovasi wolbachia."
        )
        self.assertTrue(is_policy_or_statistical_health_content(text))
        self.assertFalse(is_explicit_outbreak_report(text))

    def test_explicit_outbreak_is_detected(self):
        self.assertTrue(is_explicit_outbreak_report("An outbreak was declared after local transmission and 40 new cases."))

    def test_native_script_outbreak_terms_are_detected(self):
        self.assertTrue(is_explicit_outbreak_report("Đồng Tháp: ổ dịch sốt xuất huyết, 172 ca mắc trong tuần."))
        self.assertTrue(is_explicit_outbreak_report("เมืองดานังมีการระบาดของไข้เลือดออก 238 ครั้ง"))

    def test_unverified_social_post_cannot_trigger_alert(self):
        self.assertFalse(calibrate_outbreak_alert(
            disease="Dengue",
            case_count=120,
            explicit_outbreak=True,
            is_health_related=True,
            base_alert=True,
            source_type="social_media",
        ))

    def test_confirmed_social_post_can_be_alert_candidate(self):
        self.assertTrue(calibrate_outbreak_alert(
            disease="Dengue",
            case_count=120,
            explicit_outbreak=True,
            epistemic_status="confirmed",
            is_health_related=True,
            base_alert=True,
            source_type="social_media",
        ))

    def test_historical_or_negative_outbreak_reference_is_not_incident(self):
        text = "Artikel kebijakan membahas pengalaman wabah DBD tahun-tahun sebelumnya; tidak ada kejadian baru atau klaster lokal."
        self.assertFalse(is_explicit_outbreak_report(text))

    def test_local_disease_keyword_maps_to_who_canonical(self):
        concepts = [{"canonical_name": "CHOLERA", "english_name": "Cholera"}]
        self.assertEqual(canonicalize_disease_labels(["CHOLERA"], concepts), ["CHOLERA"])
        self.assertEqual(extract_disease_mentions("Cholera outbreak", concepts), ["CHOLERA"])

    def test_pertussis_and_whooping_cough_mapped_to_who_canonical(self):
        concepts = [{"canonical_name": "pertussis", "english_name": "Pertussis / Whooping Cough"}]
        self.assertEqual(extract_disease_mentions("Severe whooping cough outbreak", concepts), ["pertussis"])
        self.assertEqual(extract_disease_mentions("Kasus pertussis meningkat", concepts), ["pertussis"])
        self.assertEqual(canonicalize_disease_labels(["PERTUSSIS"], concepts), ["pertussis"])

    def test_avian_influenza_and_h5n1_mapped_to_who_canonical(self):
        concepts = [{"canonical_name": "avian influenza H5N1", "english_name": "Avian Influenza / Bird Flu"}]
        self.assertEqual(extract_disease_mentions("Cambodia reports human H5N1 case", concepts), ["avian influenza H5N1"])
        self.assertEqual(extract_disease_mentions("Outbreak of bird flu in poultry", concepts), ["avian influenza H5N1"])
        self.assertEqual(canonicalize_disease_labels(["AVIAN_INFLUENZA"], concepts), ["avian influenza H5N1"])

    def test_filariasis_and_kaki_gajah_mapped_to_who_canonical(self):
        concepts = [{"canonical_name": "filariasis", "english_name": "Lymphatic Filariasis"}]
        self.assertEqual(extract_disease_mentions("Indonesia eliminasi filariasis", concepts), ["filariasis"])
        self.assertEqual(canonicalize_disease_labels(["FILARIASIS"], concepts), ["filariasis"])

    def test_deaths_are_not_counted_as_cases(self):
        text = "Lebih dari 2.300 orang telah meninggal dalam wabah Ebola di Kongo."
        self.assertEqual(extract_case_count(text), 0)
        self.assertEqual(extract_death_count(text), 2300)
        self.assertFalse(has_explicit_case_count(text))
        self.assertTrue(has_explicit_case_count("1 confirmed case and 23 deaths."))

    def test_case_count_is_not_discarded_by_later_death_statistic(self):
        text = "Ada 39.672 kasus DBD dan 105 kematian sampai Mei 2026."
        self.assertEqual(extract_case_count(text), 39672)
        self.assertEqual(extract_death_count(text), 105)


if __name__ == "__main__":
    unittest.main()
