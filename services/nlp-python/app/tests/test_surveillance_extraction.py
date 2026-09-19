import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))


class SurveillanceExtractionTest(unittest.TestCase):
    def setUp(self):
        from app import config

        self.coords = {
            "Indonesia": (-6.2, 106.8),
            "Thailand": (13.7, 100.5),
            "Banten": (-6.1, 106.1),
            "DKI Jakarta": (-6.2, 106.8),
            "Jawa Timur": (-7.5, 112.2),
            # Must not be accepted when used as a statistic.
            "Puncak": (-6.7, 106.9),
            "Sudah": (0.0, 0.0),
            "Rekor": (0.0, 0.0),
            "Asia": (35.0, 105.0),
            "Malaysia": (4.2, 101.9),
            "ประเทศไทย": (13.7, 100.5),
            "Laos": (17.9757, 102.6331),
        }
        self.countries = {
            "Indonesia": "Indonesia",
            "Thailand": "Thailand",
            "Banten": "Indonesia",
            "DKI Jakarta": "Indonesia",
            "Jawa Timur": "Indonesia",
            "Puncak": "Indonesia",
            "Sudah": "Indonesia",
            "Rekor": "Indonesia",
            "Asia": "Asia",
            "Malaysia": "Malaysia",
            "ประเทศไทย": "Thailand",
            "Laos": "Laos",
        }
        self.coords_patch = patch.object(config, "LOCATION_COORDS", self.coords)
        self.countries_patch = patch.object(config, "LOCATION_COUNTRIES", self.countries)
        self.agent_patch = patch.object(config, "AGENT_ENABLED", False)
        self.coords_patch.start()
        self.countries_patch.start()
        self.agent_patch.start()

    def tearDown(self):
        self.agent_patch.stop()
        self.countries_patch.stop()
        self.coords_patch.stop()

    def test_source_country_is_not_event_country(self):
        from app.extractors import predict_surveillance_facts

        facts = predict_surveillance_facts(
            "Thailand reported 12 dengue cases.",
            source_country="Indonesia",
        )

        self.assertEqual(facts["country"], "Thailand")

    def test_country_metric_and_time_are_bound_to_the_correct_country(self):
        from app.surveillance_extraction import GazetteerLinker, build_surveillance_output

        text = (
            "COVID-19 update Weekly M22, 2025-05-25 to 2025-05-31. "
            "Indonesia reported 7 cases across Banten, DKI Jakarta, and Jawa Timur. "
            "Thailand reported 65,880 cases and 3 deaths."
        )
        output = build_surveillance_output(
            text,
            published_at="2025-06-02T10:00:00Z",
            source_name="DW",
            source_type="web",
            linker=GazetteerLinker(allow_remote=False),
        ).model_dump(exclude_none=True)

        by_country = {item["country"]: item for item in output["locations"]}
        self.assertEqual(by_country["Indonesia"]["reported_cases"], 7)
        self.assertEqual(by_country["Thailand"]["reported_cases"], 65880)
        self.assertEqual(by_country["Thailand"]["deaths"], 3)
        self.assertEqual(by_country["Indonesia"]["time_frame"], "2025-05-25 to 2025-05-31")
        self.assertEqual(set(by_country["Indonesia"]["provinces"]), {"Banten", "DKI Jakarta", "Jawa Timur"})
        self.assertTrue(output["outbreak_alert"])
        self.assertEqual(output["health_relevance"], "High")
        self.assertEqual(output["source_reliability_score"], 0.92)

    def test_statistical_words_are_not_linked_as_locations(self):
        from app.surveillance_extraction import GazetteerLinker

        linker = GazetteerLinker(allow_remote=False)
        self.assertIsNone(linker.link("Puncak", "puncak kasus tertinggi"))
        self.assertIsNone(linker.link("Sudah", "sudah tercatat 10 kasus"))
        self.assertIsNone(linker.link("Rekor", "rekor 65,880 kasus"))
        self.assertIsNone(linker.link("Asia", "Malaysia's dengue cases surge – Asia News Network"))

    def test_domain_and_brand_scores_are_not_generic_web_defaults(self):
        from app.surveillance_extraction import source_reliability_score

        self.assertGreaterEqual(source_reliability_score("DW", "web"), 0.90)
        self.assertGreaterEqual(source_reliability_score("Detik.com", "rss"), 0.90)
        self.assertGreaterEqual(source_reliability_score(source_url="https://www.bbc.com/news", source_type="web"), 0.90)

    def test_country_total_is_not_added_again_to_province_breakdown(self):
        from app.surveillance_extraction import GazetteerLinker, aggregate_relation_totals, extract_metric_relations

        text = "Indonesia reported 7 cases. Banten reported 2 cases. Thailand reported 4 cases."
        relations = extract_metric_relations(text, linker=GazetteerLinker(allow_remote=False))
        self.assertEqual(aggregate_relation_totals(relations), (11, 0))

    def test_thai_postfix_case_and_death_metrics_keep_their_labels(self):
        from app.surveillance_extraction import GazetteerLinker, build_surveillance_output, extract_metric_relations

        text = (
            "ข้อมูลตั้งแต่วันที่ 1 มกราคม – 31 สิงหาคม 2569 "
            "ประเทศไทยพบผู้ป่วยสะสม 99,691 ราย เสียชีวิต 15 ราย"
        )
        output = build_surveillance_output(
            text,
            published_at="2026-09-01",
            source_name="DDC",
            linker=GazetteerLinker(allow_remote=False),
        ).model_dump(exclude_none=True)

        thailand = next(item for item in output["locations"] if item["country"] == "Thailand")
        self.assertEqual(thailand["reported_cases"], 99691)
        self.assertEqual(thailand["deaths"], 15)
        self.assertEqual(thailand["time_frame"], "2026-01-01 to 2026-08-31")
        relations = extract_metric_relations(text, linker=GazetteerLinker(allow_remote=False))
        self.assertTrue(any("99,691" in item.evidence and "15" in item.evidence for item in relations))

    def test_calendar_year_is_not_promoted_to_case_metric(self):
        from app.surveillance_extraction import GazetteerLinker, extract_metric_relations

        text = (
            "ปี 2568 ประเทศไทยพบผู้ป่วยสะสม 12,345 ราย"
        )
        relations = extract_metric_relations(text, linker=GazetteerLinker(allow_remote=False))

        self.assertTrue(relations)
        self.assertNotIn(2568, [item.cases for item in relations])
        self.assertIn(12345, [item.cases for item in relations])

    def test_lao_dengue_metric_and_country_are_linked_from_original_text(self):
        from app.intelligence import build_atomic_events
        from app.surveillance_extraction import GazetteerLinker, extract_metric_relations

        text = (
            "ສປປ ລາວ ມີຕົວເລກຜູ້ຕິດເຊື້ອໄຂ້ຍຸງລາຍ 214 ກໍລະນີ "
            "ໃນ 6 ເດືອນຕົ້ນປີ 2026"
        )
        linker = GazetteerLinker(allow_remote=False)
        relations = extract_metric_relations(text, linker=linker)
        self.assertTrue(any(item.location.country == "Laos" and item.cases == 214 for item in relations))

        events = build_atomic_events(text, disease_labels=["Dengue"], linker=linker)
        self.assertTrue(any(item["disease"] == "Dengue" and item["case_count"] == 214 for item in events))

    def test_lao_calendar_year_is_not_promoted_to_cases(self):
        from app.surveillance_extraction import GazetteerLinker, extract_metric_relations

        text = "ສປປ ລາວ ວັນທີ 6 ມັງກອນ 2021 ພົບຜູ້ຕິດເຊື້ອ 26 ກໍລະນີ"
        relations = extract_metric_relations(text, linker=GazetteerLinker(allow_remote=False))
        self.assertNotIn(2021, [item.cases for item in relations])

    def test_domestic_thai_metrics_use_source_scope_and_keep_historical_comparison_separate(self):
        from app.surveillance_extraction import extract_metric_relations

        text = (
            "เหตุการณ์โรคในประเทศ ตั้งแต่วันที่ 1 มกราคม – 9 มีนาคม 2569 "
            "พบผู้ป่วยโรคไข้หวัดใหญ่สะสม 137,276 ราย "
            "และมีรายงานผู้เสียชีวิต 8 ราย โดยในปี 2568 ประเทศไทยมีรายงานผู้ป่วยสะสม "
            "1,194,342 ราย มีรายงานผู้เสียชีวิต 129 ราย"
        )
        text = (
            "Thailand nationwide reported 137,276 cases and 8 deaths in 2026; "
            "compared with 1,194,342 cases and 129 deaths in 2025."
        )
        relations = extract_metric_relations(text, source_country="Thailand")

        current = next(item for item in relations if item.cases == 137276)
        historical = next(item for item in relations if item.cases == 1194342)
        self.assertEqual(current.location.name, "Thailand")
        self.assertEqual(current.deaths, 8)
        self.assertEqual(historical.location.name, "Thailand")
        self.assertEqual(historical.deaths, 129)
        self.assertIn("2025", historical.time_frame)
        self.assertNotEqual(current.time_frame, historical.time_frame)


if __name__ == "__main__":
    unittest.main()
