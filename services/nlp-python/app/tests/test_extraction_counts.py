import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app import extractors, config


class ExtractionCountsAndLocationTest(unittest.TestCase):
    def setUp(self):
        config.LOCATION_COORDS = {
            "Kuala Lumpur": (3.139, 101.6869),
            "Selangor": (3.0738, 101.5183),
            "Klang": (3.0333, 101.45),
            "Petaling": (3.1667, 101.65),
            "Singapore": (1.3521, 103.8198),
            "Jakarta": (-6.2088, 106.8456),
            "Semarang": (-6.9667, 110.4167),
            "Bima": (-8.4606, 118.7272),
        }
        config.LOCATION_COUNTRIES = {
            "Kuala Lumpur": "Malaysia",
            "Selangor": "Malaysia",
            "Klang": "Malaysia",
            "Petaling": "Malaysia",
            "Singapore": "Singapore",
            "Jakarta": "Indonesia",
            "Semarang": "Indonesia",
            "Bima": "Indonesia",
        }
        config.build_location_patterns()

    def test_extract_infections_as_case_count(self):
        text = "Selangor still accounts for the most dengue cases, with 19,313 infections from January to July 9."
        self.assertEqual(extractors.extract_case_count(text), 19313)

    def test_extract_dengue_related_deaths(self):
        text = "The state also logged 21 dengue-related deaths, up from five fatalities during 2025."
        self.assertEqual(extractors.extract_death_count(text), 21)

    def test_extract_death_rose_from_x_to_y(self):
        text = "According to NST, deaths rose from 18 to 30 over the same period."
        self.assertEqual(extractors.extract_death_count(text), 30)

    def test_location_prefers_primary_over_comparison_singapore(self):
        text = (
            "Dengue cases in Malaysia rise nearly 30pc in H1 2026, MoH says outbreak remains under control.\n"
            "KUALA LUMPUR, July 6 — Dengue-related deaths in Malaysia have risen by 66.7 per cent this year. "
            "In contrast to regional trends observed in Singapore, Malaysia remains steady."
        )
        loc = extractors.extract_location(text)
        self.assertEqual(loc, "Kuala Lumpur")

    def test_location_prefers_headline_and_frequent_selangor(self):
        text = (
            "Petaling, Klang bear brunt of state's dengue surge.\n"
            "KUALA LUMPUR, Aug 4 — Petaling and Klang districts remain among Selangor's dengue hotspots. "
            "Selangor accounts for the most dengue cases with Selangor reporting highest burden."
        )
        loc = extractors.extract_location(text)
        self.assertEqual(loc, "Selangor")


if __name__ == "__main__":
    unittest.main()
