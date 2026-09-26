"""Crawl-history audit regressions (2026-09-26).

Rules-only facts. These fixtures do not import the transformer pipeline.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import config, extractors


IRAN_AFP = """
Iran vows a response after new UN sanctions. Parliament debated five proposals
on the nuclear file. (AFP)
"""

HAZE = """
BBC News. Haze from forest fires blankets Indonesia. The smoke and poor air
quality affected 170000 people across Sumatra. Respiratory complaints rose.
"""

CLUSTER = """
ReliefWeb: cluster munition contamination in a cleared field. Five devices
were marked. Explosive remnants remain. This is not a disease report.
"""

SIMULATION = """
Exercise Polaris was a pandemic preparedness simulation exercise.
Participants discussed a mock Nipah outbreak. No cases were reported.
"""

DMR_PAGE = """
Myanmar Department of Medical Research. Institutional listing of laboratory
methods covering anthrax, malaria and tuberculosis. No outbreak is declared.
"""

TRIBUNE = """
DoH logs over 76,000 dengue cases
The Department of Health (DoH) logged 76,425 dengue cases from 1 January to 15 March 2025.
This represents a 78 percent increase from the same period in 2024 (48,822).
The case fatality rate was about 1 percent. One percent fatality was cited in the brief.
Regions later noted measles-rubella: 1,185 cases and 295 in NCR.
In 2021 the Philippines recorded 167,828 dengue cases.
"""

AN_GIANG = """
HÀ NỘI — An Giang logged 1,240 dengue cases and 3 deaths this month.
The same province recorded 860 hand, foot and mouth disease cases and 2 deaths.
"""

QUANG_TRI = """
HÀ NỘI — Quang Tri reported 430 dengue cases after flooding. No deaths.
"""


class CrawlAuditExtractionTests(unittest.TestCase):
    def setUp(self):
        self._coords = dict(config.LOCATION_COORDS)
        self._countries = dict(config.LOCATION_COUNTRIES)
        self._aliases = dict(config.LOCATION_ALIASES)
        self._patterns = list(config.LOCATION_PATTERNS)
        self._lex_attempted = config.LEXICON_LOAD_ATTEMPTED
        self._lex_terms = dict(config.LEXICON_TERMS)
        self._lex_values = {key: dict(value) for key, value in config.LEXICON_VALUES.items()}
        config.LEXICON_LOAD_ATTEMPTED = True
        config.LEXICON_TERMS = {
            "metric_case": {"en": ["cases", "case", "infections"], "id": ["kasus"]},
            "metric_death": {"en": ["death", "deaths", "dead", "died", "fatality", "fatalities"]},
        }
        config.LEXICON_VALUES = {
            "number_word": {
                "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
                "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
            },
            "metric_magnitude": {"ribu": 1000, "thousand": 1000, "juta": 1000000},
        }
        config.LOCATION_COORDS = {
            "An Giang": (10.5216, 105.1259),
            "Quang Tri": (16.7943, 107.0027),
            "Ha Noi": (21.0278, 105.8342),
            "Hanoi": (21.0278, 105.8342),
            "Yogyakarta": (-7.7956, 110.3695),
            "Philippines": (14.5995, 120.9842),
            "Vietnam": (14.0583, 108.2772),
            "Thailand": (13.7563, 100.5018),
            "Cambodia": (12.5657, 104.9910),
        }
        config.LOCATION_COUNTRIES = {
            "An Giang": "Vietnam",
            "Quang Tri": "Vietnam",
            "Ha Noi": "Vietnam",
            "Hanoi": "Vietnam",
            "Yogyakarta": "Indonesia",
            "Philippines": "Philippines",
            "Vietnam": "Vietnam",
            "Thailand": "Thailand",
            "Cambodia": "Cambodia",
        }
        config.LOCATION_ALIASES = {"ha noi": "Hanoi", "jogja": "Yogyakarta"}
        config.build_location_patterns()
        extractors.invalidate_location_alias_cache()

    def tearDown(self):
        config.LOCATION_COORDS = self._coords
        config.LOCATION_COUNTRIES = self._countries
        config.LOCATION_ALIASES = self._aliases
        config.LOCATION_PATTERNS = self._patterns
        config.LEXICON_LOAD_ATTEMPTED = self._lex_attempted
        config.LEXICON_TERMS = self._lex_terms
        config.LEXICON_VALUES = self._lex_values
        extractors.invalidate_location_alias_cache()

    def test_non_health_documents_do_not_invent_outbreaks(self):
        iran = extractors.predict_surveillance_facts(IRAN_AFP)
        self.assertTrue(iran["non_health_topic"] or iran["disease"] is None)
        self.assertNotEqual(iran["disease"], "Polio")
        self.assertEqual(iran["case_count"], 0)

        haze = extractors.predict_surveillance_facts(HAZE)
        self.assertTrue(haze["non_health_topic"])
        self.assertNotEqual(haze["disease"], "Anthrax")
        self.assertEqual(haze["case_count"], 0)

        munition = extractors.predict_surveillance_facts(CLUSTER)
        self.assertTrue(munition["non_health_topic"])
        self.assertNotEqual(munition["disease"], "Anthrax")
        self.assertEqual(munition["case_count"], 0)

        exercise = extractors.predict_surveillance_facts(SIMULATION)
        self.assertTrue(exercise["non_health_topic"])
        self.assertNotIn("Nipah", exercise["diseases"])
        self.assertEqual(exercise["case_count"], 0)

        dmr = extractors.predict_surveillance_facts(DMR_PAGE)
        self.assertTrue(dmr["non_health_topic"])
        self.assertNotEqual(dmr["disease"], "Anthrax")
        self.assertEqual(dmr["case_count"], 0)

    def test_real_polio_and_dengue_still_pass(self):
        polio = extractors.predict_surveillance_facts(
            "The ministry confirmed 12 polio cases in the province this month."
        )
        self.assertFalse(polio["non_health_topic"])
        self.assertEqual(polio["disease"], "Polio")
        self.assertEqual(polio["case_count"], 12)

        dengue = extractors.predict_surveillance_facts(
            "The Department of Health logged 76,425 dengue cases from 1 January to 15 March 2025."
        )
        self.assertFalse(dengue["non_health_topic"])
        self.assertEqual(dengue["disease"], "Dengue")
        self.assertEqual(dengue["case_count"], 76425)

    def test_tribune_uses_lede_total_not_historical_or_percent(self):
        facts = extractors.predict_surveillance_facts(TRIBUNE)
        self.assertEqual(facts["disease"], "Dengue")
        self.assertEqual(facts["case_count"], 76425)
        self.assertEqual(facts["death_count"], 0)
        self.assertNotIn("Measles", facts["diseases"])

    def test_three_dead_hfmd_title(self):
        text = "Three dead from hand, foot and mouth disease in Vietnam"
        self.assertEqual(extractors.extract_death_count(text), 3)
        facts = extractors.predict_surveillance_facts(text)
        self.assertEqual(facts["death_count"], 3)
        self.assertIn("Hand, foot and mouth disease", facts["diseases"])

    def test_ribu_cases_are_thousands(self):
        text = "64 ribu kasus COVID di Thailand"
        self.assertEqual(extractors.extract_case_count(text, disease="COVID-19"), 64000)
        facts = extractors.predict_surveillance_facts(
            "Thailand melaporkan 64 ribu kasus COVID. Lima kematian tercatat."
        )
        self.assertEqual(facts["case_count"], 64000)

    def test_dengue_death_title_not_a_percent(self):
        deaths = extractors.extract_death_count("5 dengue deaths in Yogyakarta")
        self.assertEqual(deaths, 5)
        percent = extractors.extract_death_count(
            "Dengue in the Philippines had a case fatality rate of about 1 percent."
        )
        self.assertEqual(percent, 0)

    def test_wrong_country_centroid_is_not_kept(self):
        lat, lon = extractors.sanitize_event_coordinates(
            -2.5489, 118.0149, "Cambodia", "Cambodia"
        )
        self.assertAlmostEqual(lat, 12.5657, places=3)
        self.assertAlmostEqual(lon, 104.9910, places=3)

        multi_lat, multi_lon = extractors.sanitize_event_coordinates(
            -2.5489, 118.0149, "MULTI_COUNTRY", "MULTI_COUNTRY"
        )
        self.assertIsNone(multi_lat)
        self.assertIsNone(multi_lon)

        missing_lat, missing_lon = extractors.sanitize_event_coordinates(
            -2.5489, 118.0149, "Vietnam", "An Giang"
        )
        self.assertIsNone(missing_lat)
        self.assertIsNone(missing_lon)

        country_lat, country_lon = extractors.sanitize_event_coordinates(
            21.0278, 105.8342, "Vietnam", "Vietnam"
        )
        self.assertAlmostEqual(country_lat, 14.0583, places=3)
        self.assertAlmostEqual(country_lon, 108.2772, places=3)

    def test_an_giang_keeps_dengue_and_hfmd_off_the_hanoi_dateline(self):
        facts = extractors.predict_surveillance_facts(AN_GIANG)
        self.assertIn("Dengue", facts["diseases"])
        self.assertTrue(
            any("foot" in str(item).casefold() or item == "HFMD" for item in facts["diseases"])
        )
        self.assertEqual(facts["disease"], "Dengue")
        self.assertEqual(facts["case_count"], 1240)
        self.assertEqual(facts["location"], "An Giang")
        self.assertNotEqual(facts["location"], "Hanoi")
        place = facts["locations"][0]
        self.assertAlmostEqual(place["latitude"], 10.5216, places=3)
        self.assertNotAlmostEqual(place["latitude"], -2.5489, places=3)
        self.assertNotAlmostEqual(place["latitude"], 21.0278, places=3)

    def test_quang_tri_is_not_replaced_by_hanoi(self):
        facts = extractors.predict_surveillance_facts(QUANG_TRI)
        self.assertEqual(facts["location"], "Quang Tri")
        self.assertEqual(facts["case_count"], 430)

    def test_google_news_anchor_is_stripped_from_the_title(self):
        raw = (
            '<a href=https://news.google.com/rss/articles/CBMi '
            "Three dead from hand, foot and mouth disease in Vietnam"
        )
        cleaned = extractors.strip_embedded_markup(raw)
        self.assertNotIn("<a", cleaned)
        self.assertNotIn("href=", cleaned)
        self.assertIn("Three dead", cleaned)
        facts = extractors.predict_surveillance_facts(raw)
        self.assertEqual(facts["death_count"], 3)


if __name__ == "__main__":
    unittest.main()
