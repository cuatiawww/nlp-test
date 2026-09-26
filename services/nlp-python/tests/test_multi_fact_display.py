"""Semicolon display contract for multi-disease / multi-location articles."""

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.multi_fact_display import (
    collapse_facts,
    facts_from_analyze_payload,
    format_label_counts,
    join_unique_labels,
    parent_geo_from_events,
    short_disease_label,
)


class MultiFactDisplayTest(unittest.TestCase):
    def test_multi_disease_semicolon_not_comma(self):
        collapsed = collapse_facts([
            {"disease": "Influenza", "location_name": "Bangkok", "case_count": 120, "death_count": 0},
            {
                "disease": "Respiratory syncytial virus infection",
                "location_name": "Bangkok",
                "case_count": 45,
                "death_count": 0,
            },
        ])
        self.assertEqual(collapsed["disease_display"], "Influenza; RSV")
        self.assertEqual(collapsed["cases_display"], "Influenza(120); RSV(45)")
        self.assertEqual(collapsed["dimension"], "disease")
        self.assertNotIn(",", collapsed["disease_display"])

    def test_multi_location_parenthetical_matches_location_column(self):
        collapsed = collapse_facts([
            {"disease": "Influenza", "location_name": "Indonesia", "case_count": 8278, "death_count": 12},
            {"disease": "Influenza", "location_name": "Philippines", "case_count": 3734, "death_count": 3},
        ])
        self.assertEqual(collapsed["location_display"], "Indonesia; Philippines")
        self.assertEqual(collapsed["cases_display"], "Indonesia(8278); Philippines(3734)")
        self.assertEqual(collapsed["deaths_display"], "Indonesia(12); Philippines(3)")
        self.assertEqual(collapsed["dimension"], "location")

    def test_both_vary_prefers_location_counts(self):
        collapsed = collapse_facts([
            {"disease": "Influenza", "location_name": "Indonesia", "case_count": 8278, "death_count": 12},
            {"disease": "RSV", "location_name": "Philippines", "case_count": 3734, "death_count": 3},
        ])
        self.assertEqual(collapsed["disease_display"], "Influenza; RSV")
        self.assertEqual(collapsed["cases_display"], "Indonesia(8278); Philippines(3734)")
        self.assertNotIn("Influenza(8278)", collapsed["cases_display"])

    def test_omit_empty_and_zero_deaths(self):
        self.assertEqual(format_label_counts([("Indonesia", 12), ("", 9)]), "Indonesia(12)")
        self.assertEqual(format_label_counts([("Indonesia", 0)], omit_zero=True), "")
        self.assertEqual(
            join_unique_labels(["Philippines", "Indonesia", "Indonesia"]),
            "Philippines; Indonesia",
        )

    def test_ncd_comma_string_is_not_a_display_join(self):
        self.assertEqual(short_disease_label("UNKNOWN"), "")
        self.assertNotEqual(
            join_unique_labels(["Cancer", "Stroke", "Heart Attack"]),
            "Cancer, Stroke, Heart Attack",
        )

    def test_payload_sub_events_drive_summary(self):
        payload = {
            "disease_classification": "Influenza",
            "sub_events": [
                {"disease": "Influenza", "location_name": "Jakarta", "case_count": 10, "death_count": 1},
                {"disease": "RSV", "location_name": "Manila", "case_count": 4, "death_count": 0},
            ],
        }
        collapsed = collapse_facts(facts_from_analyze_payload(payload))
        self.assertEqual(collapsed["disease_display"], "Influenza; RSV")
        self.assertEqual(collapsed["cases_display"], "Jakarta(10); Manila(4)")

    def test_parent_geo_lists_outbreak_countries_not_multi_country(self):
        country, location = parent_geo_from_events([
            {"disease": "Dengue", "country": "Indonesia", "location_name": "Indonesia", "case_count": 5000},
            {"disease": "Dengue", "country": "Vietnam", "location_name": "Vietnam", "case_count": 3000},
        ])
        self.assertEqual(country, "Indonesia; Vietnam")
        self.assertEqual(location, "Indonesia; Vietnam")
        self.assertNotIn("MULTI_COUNTRY", country)

    def test_parent_geo_keeps_one_country_when_others_have_no_metric(self):
        country, location = parent_geo_from_events([
            {"disease": "Dengue", "country": "Indonesia", "location_name": "Indonesia", "case_count": 5000},
            {"disease": "Dengue", "country": "Japan", "location_name": "Japan", "case_count": 0},
        ])
        self.assertEqual(country, "Indonesia")
        self.assertIsNone(location)

    def test_parent_geo_global_row_keeps_country_list(self):
        country, location = parent_geo_from_events([
            {
                "disease": "Dengue",
                "country": "Indonesia; Vietnam; Thailand",
                "location_name": "Global",
                "case_count": 200000,
            },
        ])
        self.assertEqual(country, "Indonesia; Vietnam; Thailand")
        self.assertEqual(location, "Global")


if __name__ == "__main__":
    unittest.main()
