"""WHO multi-country Situation Update sectioning + spaced thousands."""

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import config, extractors
from app.multi_event_extractor import (
    extract_multi_events,
    _split_who_country_sections,
    _extract_who_country_section_events,
)


WHO_SNIPPET = """
Dengue Situation Update 751
6 August 2026
Update on the Dengue situation in the Western Pacific Region

Northern Hemisphere
Cambodia
As of 26 July 2026, a total of 40 915 dengue cases, including 58 deaths (case fatality rate: 0.1%), have been
reported through the National Dengue Surveillance System. This represents a 67.7% increase compared to 2025.
Figure 1: Weekly dengue cases in 2026 in Cambodia
Dengue Situation Update 751 | 1

China (Monthly update)
There was no update in this reporting period. In June 2026, a total of 255 dengue cases were reported in
China, an increase from 222 cases reported in May 2026.
Figure 2: Dengue cases reported monthly in China
Dengue Situation Update 751 | 2

Indonesia
As of 5 August 2026, 124 dengue cases and no deaths were reported in July 2026, bringing the cumulative
total from January to July 2026 to 75 431 cases and 203 deaths.
Figure 3: Dengue cases reported monthly in Indonesia
Dengue Situation Update 751 | 3
"""


class WhoCountrySectionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        for name, country, lat, lon in (
            ("Cambodia", "Cambodia", 12.5657, 104.9910),
            ("China", "China", 35.8617, 104.1954),
            ("Indonesia", "Indonesia", -0.7893, 113.9213),
        ):
            config.LOCATION_COORDS[name] = (lat, lon)
            config.LOCATION_COUNTRIES[name] = country
        config.DISEASE_DICT.update({"dengue": "Dengue", "dbd": "Dengue"})
        config.build_location_patterns()

    def test_split_finds_multiple_country_sections(self):
        sections = _split_who_country_sections(WHO_SNIPPET)
        countries = [c for c, _ in sections]
        self.assertGreaterEqual(len(sections), 2)
        self.assertIn("Cambodia", countries)
        self.assertIn("China", countries)
        self.assertIn("Indonesia", countries)

    def test_who_section_events_bind_spaced_thousands_per_country(self):
        events = _extract_who_country_section_events(WHO_SNIPPET, "Dengue")
        by_country = {e["country"]: e for e in events}
        self.assertGreaterEqual(len(events), 2)
        self.assertEqual(by_country["Cambodia"]["case_count"], 40915)
        self.assertEqual(by_country["Cambodia"]["death_count"], 58)
        self.assertEqual(by_country["China"]["case_count"], 255)
        self.assertIn("Indonesia", by_country)
        # Prefer cumulative over the July monthly slice.
        self.assertEqual(by_country["Indonesia"]["case_count"], 75431)
        self.assertEqual(by_country["Indonesia"]["death_count"], 203)

    def test_extract_multi_events_returns_multi_country(self):
        events = extract_multi_events(
            text=WHO_SNIPPET,
            primary_disease="Dengue",
            primary_location="Cambodia",
            diseases_extracted=["Dengue"],
            locations=[{"name": "Cambodia", "country": "Cambodia"}],
            case_count=40915,
            death_count=58,
            primary_country="Cambodia",
        )
        countries = {e.get("country") for e in events}
        self.assertGreaterEqual(len(events), 2)
        self.assertIn("Cambodia", countries)
        self.assertTrue(countries & {"China", "Indonesia"})
        cambodia = next(e for e in events if e.get("country") == "Cambodia")
        self.assertEqual(cambodia["case_count"], 40915)


if __name__ == "__main__":
    unittest.main()
