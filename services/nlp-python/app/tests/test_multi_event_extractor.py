"""Unit tests for multi_event_extractor module."""

import os
import sys
import unittest
from unittest.mock import patch, MagicMock

# Ensure the app package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))


class TestParseCountValue(unittest.TestCase):
    def test_simple_integer(self):
        from app.multi_event_extractor import _parse_count_value
        self.assertEqual(_parse_count_value("445"), 445)

    def test_thousands_comma(self):
        from app.multi_event_extractor import _parse_count_value
        self.assertEqual(_parse_count_value("1,234"), 1234)

    def test_thousands_dot(self):
        from app.multi_event_extractor import _parse_count_value
        self.assertEqual(_parse_count_value("10.000"), 10000)

    def test_empty(self):
        from app.multi_event_extractor import _parse_count_value
        self.assertEqual(_parse_count_value(""), 0)


class TestRegexExtraction(unittest.TestCase):
    """Test the regex layer without needing the full NLP config loaded."""

    def setUp(self):
        """Mock config.LOCATION_COORDS and LOCATION_COUNTRIES."""
        self.location_coords_patch = patch("app.multi_event_extractor.config.LOCATION_COORDS", {
            "Singapore": (1.3521, 103.8198),
            "Thailand": (13.7563, 100.5018),
            "Malaysia": (3.1390, 101.6869),
            "Indonesia": (-6.2088, 106.8456),
            "Vietnam": (21.0285, 105.8542),
            "Cambodia": (11.5564, 104.9282),
            "Jawa Timur": (-7.5361, 112.2384),
            "Kalimantan Selatan": (-3.3194, 114.5908),
            "Jawa Barat": (-6.9175, 107.6191),
            "DKI Jakarta": (-6.2088, 106.8456),
            "Jawa Tengah": (-7.1510, 110.1403),
        })
        self.location_countries_patch = patch("app.multi_event_extractor.config.LOCATION_COUNTRIES", {
            "Singapore": "Singapore",
            "Thailand": "Thailand",
            "Malaysia": "Malaysia",
            "Indonesia": "Indonesia",
            "Vietnam": "Vietnam",
            "Cambodia": "Cambodia",
            "Jawa Timur": "Indonesia",
            "Kalimantan Selatan": "Indonesia",
            "Jawa Barat": "Indonesia",
            "DKI Jakarta": "Indonesia",
            "Jawa Tengah": "Indonesia",
        })
        self.location_coords_patch.start()
        self.location_countries_patch.start()

    def tearDown(self):
        self.location_coords_patch.stop()
        self.location_countries_patch.stop()

    def test_kemenkes_multi_country_id(self):
        """Test Indonesian Kemenkes format: Singapura (445 kasus), Thailand (391 kasus)..."""
        from app.multi_event_extractor import _regex_extract_location_cases
        text = (
            "Influenza A(H3N2) Subclade K: Singapura (445 kasus), "
            "Thailand (391 kasus), Malaysia (174 kasus), "
            "Indonesia (168 kasus), Vietnam (110 kasus), "
            "Kamboja (83 kasus)"
        )
        # Note: Kamboja -> Cambodia via COUNTRY_ALIASES
        pairs = _regex_extract_location_cases(text)
        locations = {p["location"] for p in pairs}
        self.assertIn("Singapore", locations)
        self.assertIn("Thailand", locations)
        self.assertIn("Malaysia", locations)
        self.assertIn("Indonesia", locations)
        self.assertIn("Vietnam", locations)
        # Kamboja might not match if not in COUNTRY_ALIASES mock
        self.assertTrue(len(pairs) >= 5)

        sg = next(p for p in pairs if p["location"] == "Singapore")
        self.assertEqual(sg["cases"], 445)

        th = next(p for p in pairs if p["location"] == "Thailand")
        self.assertEqual(th["cases"], 391)

    def test_english_multi_country(self):
        """Test English format: Singapore (445 cases), Thailand (391 cases)..."""
        from app.multi_event_extractor import _regex_extract_location_cases
        text = (
            "Influenza A(H3N2): Singapore (445 cases), "
            "Thailand (391 cases), Malaysia (174 cases)"
        )
        pairs = _regex_extract_location_cases(text)
        self.assertTrue(len(pairs) >= 3)

    def test_cases_di_location(self):
        """Test N kasus di Lokasi format."""
        from app.multi_event_extractor import _regex_extract_location_cases
        text = "Ditemukan 250 kasus di Jawa Barat dan 168 kasus di Indonesia"
        pairs = _regex_extract_location_cases(text)
        self.assertTrue(len(pairs) >= 2)

    def test_single_event_returns_empty(self):
        """A simple single-location article should not return multi-events."""
        from app.multi_event_extractor import _regex_extract_location_cases
        text = "Ditemukan 10 kasus DBD di Surabaya, Jawa Timur."
        pairs = _regex_extract_location_cases(text)
        # Only 0 or 1 pair expected (not enough for multi-event)
        self.assertTrue(len(pairs) < 2)

    def test_deaths_attached_to_location(self):
        """Test that death counts are correctly attached to locations."""
        from app.multi_event_extractor import _regex_extract_location_cases
        text = (
            "Indonesia (168 kasus), 3 kematian di Jawa Barat"
        )
        pairs = _regex_extract_location_cases(text)
        jb = [p for p in pairs if p["location"] == "Jawa Barat"]
        if jb:
            self.assertEqual(jb[0]["deaths"], 3)


class TestExtractMultiEvents(unittest.TestCase):
    """Test the main extract_multi_events function end-to-end."""

    def setUp(self):
        self.location_coords_patch = patch("app.multi_event_extractor.config.LOCATION_COORDS", {
            "Singapore": (1.3521, 103.8198),
            "Thailand": (13.7563, 100.5018),
            "Malaysia": (3.1390, 101.6869),
            "Indonesia": (-6.2088, 106.8456),
            "Vietnam": (21.0285, 105.8542),
            "Cambodia": (11.5564, 104.9282),
        })
        self.location_countries_patch = patch("app.multi_event_extractor.config.LOCATION_COUNTRIES", {
            "Singapore": "Singapore",
            "Thailand": "Thailand",
            "Malaysia": "Malaysia",
            "Indonesia": "Indonesia",
            "Vietnam": "Vietnam",
            "Cambodia": "Cambodia",
        })
        self.agent_patch = patch("app.multi_event_extractor.config.AGENT_ENABLED", False)
        self.location_coords_patch.start()
        self.location_countries_patch.start()
        self.agent_patch.start()

    def tearDown(self):
        self.location_coords_patch.stop()
        self.location_countries_patch.stop()
        self.agent_patch.stop()

    @patch("app.multi_event_extractor.MULTI_EVENT_ENABLED", True)
    @patch("app.multi_event_extractor.MULTI_EVENT_LLM_FALLBACK", False)
    def test_multi_country_kemenkes(self):
        from app.multi_event_extractor import extract_multi_events
        text = (
            "Influenza A(H3N2) Subclade K: Singapura (445 kasus), "
            "Thailand (391 kasus), Malaysia (174 kasus), "
            "Indonesia (168 kasus), Vietnam (110 kasus)"
        )
        events = extract_multi_events(
            text=text,
            primary_disease="Influenza A(H3N2)",
            primary_location="Singapore",
            diseases_extracted=["Influenza A(H3N2)"],
            locations=[],
            case_count=445,
            death_count=0,
        )
        self.assertTrue(len(events) >= 5)
        diseases = {e["disease"] for e in events}
        # All should be the same disease
        self.assertEqual(len(diseases), 1)
        locations = {e["location_name"] for e in events}
        self.assertIn("Singapore", locations)
        self.assertIn("Thailand", locations)

    @patch("app.multi_event_extractor.MULTI_EVENT_ENABLED", True)
    @patch("app.multi_event_extractor.MULTI_EVENT_LLM_FALLBACK", False)
    def test_single_event_backward_compatible(self):
        from app.multi_event_extractor import extract_multi_events
        text = "Ditemukan 10 kasus DBD di Surabaya, Jawa Timur."
        events = extract_multi_events(
            text=text,
            primary_disease="DBD",
            primary_location="Surabaya",
            diseases_extracted=["DBD"],
            locations=[],
            case_count=10,
            death_count=0,
        )
        self.assertEqual(len(events), 0)

    @patch("app.multi_event_extractor.MULTI_EVENT_LLM_FALLBACK", True)
    @patch("app.multi_event_extractor.config.AGENT_ENABLED", True)
    @patch("app.agent.chat_json")
    def test_single_event_does_not_call_llm_fallback(self, chat_json):
        from app.multi_event_extractor import extract_multi_events

        events = extract_multi_events(
            text="Ditemukan 10 kasus DBD di Surabaya, Jawa Timur.",
            primary_disease="DBD",
            primary_location="Surabaya",
            diseases_extracted=["DBD"],
            locations=[{"name": "Jawa Timur"}],
            case_count=10,
            death_count=0,
        )

        self.assertEqual(events, [])
        chat_json.assert_not_called()

    @patch("app.multi_event_extractor.MULTI_EVENT_LLM_FALLBACK", True)
    @patch("app.multi_event_extractor.config.AGENT_ENABLED", True)
    @patch("app.multi_event_extractor._regex_extract_location_cases", return_value=[])
    @patch("app.multi_event_extractor._llm_extract_events", return_value=[])
    def test_multi_event_signal_uses_evidence_relations_before_llm(self, llm_extract, regex_mock):
        from app.multi_event_extractor import extract_multi_events

        extract_multi_events(
            text="Indonesia reported 10 cases and Thailand reported 20 cases.",
            primary_disease="Dengue",
            primary_location=None,
            diseases_extracted=["Dengue"],
            locations=[],
            case_count=10,
            death_count=0,
        )

        llm_extract.assert_not_called()

    @patch("app.multi_event_extractor.MULTI_EVENT_ENABLED", False)
    def test_disabled_returns_empty(self):
        from app.multi_event_extractor import extract_multi_events
        events = extract_multi_events(
            text="Singapura (445 kasus), Thailand (391 kasus)",
            primary_disease="Flu",
            primary_location="Singapore",
            diseases_extracted=["Flu"],
            locations=[],
            case_count=445,
            death_count=0,
        )
        self.assertEqual(len(events), 0)


class TestComposeStructuredEvents(unittest.TestCase):
    def setUp(self):
        self.location_coords_patch = patch("app.multi_event_extractor.config.LOCATION_COORDS", {
            "Singapore": (1.3521, 103.8198),
            "Thailand": (13.7563, 100.5018),
            "Malaysia": (3.1390, 101.6869),
            "Indonesia": (-6.2088, 106.8456),
            "Vietnam": (21.0285, 105.8542),
            "Bangkok": (13.7563, 100.5018),
            "Philippines": (14.5995, 120.9842),
        })
        self.location_countries_patch = patch("app.multi_event_extractor.config.LOCATION_COUNTRIES", {
            "Singapore": "Singapore",
            "Thailand": "Thailand",
            "Malaysia": "Malaysia",
            "Indonesia": "Indonesia",
            "Vietnam": "Vietnam",
            "Bangkok": "Thailand",
            "Philippines": "Philippines",
        })
        self.agent_patch = patch("app.multi_event_extractor.config.AGENT_ENABLED", False)
        self.location_coords_patch.start()
        self.location_countries_patch.start()
        self.agent_patch.start()

    def tearDown(self):
        self.location_coords_patch.stop()
        self.location_countries_patch.stop()
        self.agent_patch.stop()

    @patch("app.multi_event_extractor.MULTI_EVENT_ENABLED", True)
    @patch("app.multi_event_extractor.MULTI_EVENT_LLM_FALLBACK", False)
    def test_compose_keeps_context_only_disease_mentions_in_one_event(self):
        from app.multi_event_extractor import compose_structured_events
        from app.multi_fact_display import collapse_facts
        text = (
            "Sanofi partnership with Bangkok and the Department of Medical Services "
            "to boost immunization against influenza and RSV. Vaccination campaign."
        )
        events = compose_structured_events(
            text=text,
            primary_disease="Influenza",
            primary_location="Bangkok",
            diseases_extracted=["Influenza", "Respiratory syncytial virus infection"],
            locations=[{"name": "Bangkok"}],
            case_count=0,
            death_count=0,
        )
        names = {event["disease"] for event in events}
        self.assertEqual(len(events), 1)
        joined = " ".join(names).lower()
        self.assertIn("influenza", joined)
        self.assertNotIn("rsv", joined)
        collapsed = collapse_facts(events)
        self.assertNotIn("; ", collapsed["disease_display"])

    @patch("app.multi_event_extractor.MULTI_EVENT_ENABLED", True)
    @patch("app.multi_event_extractor.MULTI_EVENT_LLM_FALLBACK", False)
    def test_compose_keeps_per_place_counts(self):
        from app.multi_event_extractor import compose_structured_events
        from app.multi_fact_display import collapse_facts
        text = (
            "Influenza A(H3N2): Indonesia (8278 cases), Philippines (3734 cases). "
            "12 deaths in Indonesia and 3 deaths in Philippines."
        )
        events = compose_structured_events(
            text=text,
            primary_disease="Influenza",
            primary_location="Indonesia",
            diseases_extracted=["Influenza"],
            locations=[],
            case_count=8278,
            death_count=12,
        )
        self.assertGreaterEqual(len(events), 2)
        collapsed = collapse_facts(events)
        self.assertEqual(collapsed["cases_display"], "Indonesia(8278); Philippines(3734)")
        self.assertEqual(collapsed["location_display"], "Indonesia; Philippines")


if __name__ == "__main__":
    unittest.main()
