import unittest

from app import pipeline
from app.schemas import AnalyzeRequest


class RelationAttributionTest(unittest.TestCase):
    def test_country_relations_are_not_lost_when_composer_has_one_primary_country(self):
        text = (
            "Thailand reported 31 dengue deaths and 21,620 cases in 2026. "
            "Vietnam reported 70,000 dengue cases and 9 deaths in 2026."
        )
        result = pipeline.run(
            AnalyzeRequest(
                text=text,
                source_language="en",
                historical_fast=True,
                rules_only=True,
            )
        )

        by_country = {event.country: event for event in result.sub_events}
        self.assertEqual(set(by_country), {"Thailand", "Vietnam"})
        self.assertEqual(by_country["Thailand"].case_count, 21620)
        self.assertEqual(by_country["Thailand"].death_count, 31)
        self.assertEqual(by_country["Vietnam"].case_count, 70000)
        self.assertEqual(by_country["Vietnam"].death_count, 9)
        self.assertTrue(by_country["Vietnam"].source_evidence)
        self.assertEqual(by_country["Vietnam"].evidence_offset_space, "original")

    def test_two_disease_metrics_keep_their_disease_relation(self):
        text = "Vietnam reported 361 dengue cases and 10 influenza cases during 2026."
        result = pipeline.run(
            AnalyzeRequest(
                text=text,
                source_language="en",
                historical_fast=True,
                rules_only=True,
            )
        )

        by_disease = {event.disease: event for event in result.sub_events}
        self.assertEqual(by_disease["Dengue"].case_count, 361)
        self.assertEqual(by_disease["Influenza"].case_count, 10)
        self.assertTrue(all(event.country == "Vietnam" for event in result.sub_events))


if __name__ == "__main__":
    unittest.main()
