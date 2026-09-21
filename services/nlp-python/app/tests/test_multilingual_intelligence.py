import unittest
from unittest.mock import patch


class MultilingualIntelligenceTests(unittest.TestCase):
    def setUp(self):
        from app import config

        self.coords = {
            "Bangkok": (13.7563, 100.5018),
            "Phnom Penh": (11.5564, 104.9282),
            "Vientiane": (17.9757, 102.6331),
            "Yangon": (16.8403, 96.1735),
            "Thailand": (15.8, 100.9),
        }
        self.countries = {
            "Bangkok": "Thailand",
            "Phnom Penh": "Cambodia",
            "Vientiane": "Laos",
            "Yangon": "Myanmar",
            "Thailand": "Thailand",
        }
        self.coords_patch = patch.object(config, "LOCATION_COORDS", self.coords)
        self.countries_patch = patch.object(config, "LOCATION_COUNTRIES", self.countries)
        self.alias_patch = patch.object(
            config,
            "LOCATION_ALIASES",
            {
                "กรุงเทพฯ": "Bangkok",
                "ភ្នំពេញ": "Phnom Penh",
                "ວຽງຈັນ": "Vientiane",
                "ရန်ကုန်": "Yangon",
            },
        )
        self.coords_patch.start()
        self.countries_patch.start()
        self.alias_patch.start()

    def tearDown(self):
        self.alias_patch.stop()
        self.countries_patch.stop()
        self.coords_patch.stop()

    def test_script_detection_is_not_translation_dependent(self):
        from app.multilingual import detect_language_profile

        self.assertEqual(detect_language_profile("พบผู้ป่วยในกรุงเทพฯ")['language'], "th")
        self.assertEqual(detect_language_profile("ករណីនៅភ្នំពេញ")['language'], "km")
        self.assertEqual(detect_language_profile("ກໍລະນີຢູ່ວຽງຈັນ")['language'], "lo")
        self.assertEqual(detect_language_profile("ရန်ကုန်မြို့")['language'], "my")

    def test_latin_marker_detection_does_not_promote_substrings(self):
        from app.multilingual import detect_language_profile

        profile = detect_language_profile(
            "Malaysia melaporkan 10 kes dan 2 kematian akibat demam denggi.",
            markers={
                "id": ["kasus", "demam", "meninggal"],
                "ms": ["kes", "kematian"],
            },
        )
        self.assertEqual(profile["language"], "ms")

    def test_location_country_conflict_downgrades_to_country(self):
        from app import config
        from app.pipeline import _guard_event_location_country

        with patch.object(config, "LOCATION_COUNTRIES", {"Jembrana": "Indonesia"}):
            location, needs_review = _guard_event_location_country("Jembrana", "Brunei")
        self.assertEqual(location, "Brunei")
        self.assertTrue(needs_review)

    def test_event_hierarchy_uses_country_centroid_for_conflicting_locality(self):
        from app import config
        from app.extractors import resolve_event_location_hierarchy

        with patch.object(
            config,
            "LOCATION_COUNTRIES",
            {**self.countries, "Bandung": "Indonesia"},
        ):
            safe = resolve_event_location_hierarchy("Bandung", country_hint="Thailand")
        self.assertEqual(safe["country"], "Thailand")
        self.assertEqual(safe["country_iso3"], "THA")
        self.assertIsNone(safe["admin1_name"])
        self.assertTrue(safe["country_conflict"])
        self.assertEqual(safe["original_country"], "Indonesia")

    def test_native_explicit_dates_remain_event_dates(self):
        from app.epidemiology import extract_event_period

        samples = {
            "th": "รายงานเมื่อวันที่ 12 กันยายน 2026",
            "km": "បានរាយការណ៍នៅថ្ងៃទី 12 ខែកញ្ញា ឆ្នាំ 2026",
            "vi": "báo cáo vào ngày 12 tháng 9 năm 2026",
        }
        for text in samples.values():
            period = extract_event_period(text)
            self.assertEqual(period["event_date"], "2026-09-12")
            self.assertEqual(period["event_date_start"], "2026-09-12")
            self.assertEqual(period["event_date_end"], "2026-09-12")

    def test_native_digits_keep_offsets_and_exact_source_evidence(self):
        from app.intelligence import build_atomic_events

        text = "พบผู้ป่วยไข้เลือดออก ๔๕ รายในกรุงเทพฯวันนี้"
        events = build_atomic_events(text, disease_labels=["Dengue"])

        self.assertEqual(len(events), 1)
        event = events[0]
        self.assertEqual(event["location_name"], "Bangkok")
        self.assertEqual(event["case_count"], 45)
        self.assertIn("๔๕", event["evidence"])
        self.assertEqual(text[event["evidence_offset_start"]:event["evidence_offset_end"]], event["evidence"])
        self.assertEqual(event["provenance"]["source_text"], "original")

    def test_native_script_locations_can_form_separate_events(self):
        from app.intelligence import build_atomic_events

        text = "กรุงเทพฯ ๔๕ ราย และ ភ្នំពេញ ១៥ ករណី"
        events = build_atomic_events(text, disease_labels=["Dengue"])

        self.assertEqual(
            {(item["location_name"], item["case_count"]) for item in events},
            {("Bangkok", 45), ("Phnom Penh", 15)},
        )
        self.assertTrue(all(item["source_sentence_id"] == "s1" for item in events))

    def test_range_is_preserved_without_selecting_an_endpoint(self):
        from app.surveillance_extraction import GazetteerLinker, extract_metric_relations

        text = "ระหว่าง ๑๐ ถึง ๒๐ รายในกรุงเทพฯ"
        relations = extract_metric_relations(
            text,
            linker=GazetteerLinker(coords=self.coords, countries=self.countries, allow_remote=False),
        )

        relation = next(item for item in relations if item.location.name == "Bangkok")
        self.assertEqual(relation.value_min, 10)
        self.assertEqual(relation.value_max, 20)
        self.assertEqual(relation.cases, 0)
        self.assertIn("๑๐", relation.evidence)
        self.assertEqual(text[relation.evidence_offset_start:relation.evidence_offset_end], relation.evidence)


if __name__ == "__main__":
    unittest.main()
