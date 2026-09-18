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


if __name__ == "__main__":
    unittest.main()
