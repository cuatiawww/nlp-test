"""CIDRAP multi-location headline + invented-count regression tests (round 2)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app import extractors, config

try:
    from app.pipeline import run
    from app.schemas import AnalyzeRequest
except Exception:  # classifiers need optional ML deps
    run = None
    AnalyzeRequest = None


CIDRAP_URL = (
    "https://www.cidrap.umn.edu/avian-influenza-bird-flu/"
    "cambodia-confirms-human-h5n1-avian-flu-case-h5n1-hits-more-utah-egg-farms"
)

CIDRAP_TEXT = """
Cambodia confirms human H5N1 avian flu case; H5N1 hits more Utah egg farms
October 11, 2024
Lisa Schnirring
The Cambodian Ministry of Health yesterday reported another human H5N1 avian influenza
infection, involving a 15-year-old boy from Kampong Thom province who had been exposed
to dead poultry. Officials said the patient is in intensive care.
Separately, the US Department of Agriculture reported that H5N1 avian flu struck more
egg-laying farms in Utah. Were monitoring the farm outbreaks in the United States.
"""

SINGAPORE_MEASLES = """
S'pore sees highest number of measles cases in 6 years, vaccinated individuals among 2026 cases.
Singapore has recorded 43 cases of measles in 2026 so far, its highest number of cases since 2020.
This is according to the Communicable Diseases Agency (CDA) Weekly Infectious Diseases Bulletin
published on 30 July. In contrast, 27 cases were recorded in 2025.
"""


class CidrapCambodiaFixtureTest(unittest.TestCase):
    def setUp(self):
        config.LOCATION_COORDS = {
            "Cambodia": (12.5657, 104.9910),
            "Phnom Penh": (11.5564, 104.9282),
            "Kampong Thom": (12.7111, 104.8889),
            "Indonesia": (-2.5489, 118.0149),
            "Were": (-8.8725, 121.0602),
            "Utah": (39.3210, -111.0937),
            "Singapore": (1.3521, 103.8198),
            "India": (20.5937, 78.9629),
        }
        config.LOCATION_COUNTRIES = {
            "Cambodia": "Cambodia",
            "Phnom Penh": "Cambodia",
            "Kampong Thom": "Cambodia",
            "Indonesia": "Indonesia",
            "Were": "Indonesia",
            "Utah": "United States",
            "Singapore": "Singapore",
            "India": "India",
        }
        config.LOCATION_STOPWORDS.update({
            "were", "was", "been", "have", "has", "had", "did", "does",
        })
        config.build_location_patterns()

    def test_country_hint_prefers_asean_cambodia_over_utah(self):
        self.assertEqual(extractors.extract_country_hint(CIDRAP_TEXT), "Cambodia")

    def test_were_is_rejected_as_indonesia_province(self):
        self.assertFalse(extractors.is_usable_place_name("Were", CIDRAP_TEXT))
        loc = extractors.extract_location(CIDRAP_TEXT, country="Indonesia")
        self.assertNotEqual((loc or "").casefold(), "were")
        loc_open = extractors.extract_location(CIDRAP_TEXT)
        self.assertNotEqual((loc_open or "").casefold(), "were")
        self.assertIn(loc_open, {"Cambodia", "Kampong Thom", "Phnom Penh"})

    def test_title_disease_is_avian_influenza_not_measles(self):
        aliases = extractors.extract_alias_diseases(CIDRAP_TEXT[:1200])
        canonical = {extractors.normalize_disease_display(item) for item in aliases}
        self.assertTrue({"Avian influenza", "flu burung"} & (set(aliases) | canonical))
        self.assertNotIn("Measles", aliases)
        ranked = extractors.extract_diseases(CIDRAP_TEXT[:1200])
        joined = " ".join(ranked).lower()
        self.assertIn("avian", joined + " " + " ".join(aliases).lower())
        self.assertNotIn("measles", joined)

    @unittest.skipIf(run is None, "nlp pipeline extras (transformers) are not installed")
    def test_pipeline_primary_event_is_cambodia_h5n1(self):
        orig_model = config.NLP_MODEL
        config.NLP_MODEL = "none"
        try:
            result = run(AnalyzeRequest(
                text=CIDRAP_TEXT,
                source_url=CIDRAP_URL,
                source_name="CIDRAP",
                source_type="web",
                rules_only=True,
                interactive=True,
            ))
        finally:
            config.NLP_MODEL = orig_model
        disease = extractors.normalize_disease_display(result.disease_classification)
        self.assertIn("avian", disease.lower() + " " + " ".join(result.disease_extracted).lower())
        self.assertNotEqual(disease.lower(), "measles")
        self.assertEqual(result.country, "Cambodia")
        self.assertNotEqual((result.location_name or "").casefold(), "were")
        self.assertNotEqual(result.country, "Indonesia")
        countries = {item.country for item in result.locations} | {
            evt.country for evt in result.sub_events
        }
        self.assertIn("Cambodia", countries | {result.country})
        self.assertNotIn("Were", {item.name for item in result.locations})

    def test_measles_binds_to_explicit_43_not_year_or_noise(self):
        self.assertEqual(
            extractors.extract_case_count(SINGAPORE_MEASLES, disease="Measles"),
            43,
        )
        self.assertNotEqual(extractors.extract_case_count(SINGAPORE_MEASLES, disease="Measles"), 2026)
        self.assertIsNone(extractors._parse_count("2026", "among 2026 cases"))


if __name__ == "__main__":
    unittest.main()
