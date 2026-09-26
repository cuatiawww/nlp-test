"""ASEAN admin short forms: Sumsel, OKU, TP.HCM, and DeepSeek geo-uncertain."""

import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import config, extractors
from app.admin_abbreviations import (
    apply_admin_abbreviations,
    extraction_geo_uncertain,
)
from app.llm_gate import should_escalate_to_llm
from app.multi_event_extractor import compose_structured_events
from app.surveillance_extraction import GazetteerLinker


def _reload_abbreviations():
    apply_admin_abbreviations()
    config.build_location_patterns()
    extractors.invalidate_location_alias_cache()
    GazetteerLinker._SHARED_FOLDED_COORDS = None
    GazetteerLinker._SHARED_MENTION_PATTERN = None
    GazetteerLinker._SHARED_SIG = None


class AdminAbbreviationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _reload_abbreviations()

    def test_dinkes_sumsel_catat_resolves_south_sumatra(self):
        text = "Dinkes Sumsel catat 1.426 kasus DBD hingga Mei 2026."
        hier = extractors.resolve_location_hierarchy("Sumsel")
        self.assertEqual(hier["country"], "Indonesia")
        self.assertIn(
            hier["canonical_name"].casefold(),
            {"sumatera selatan", "sumatra selatan", "south sumatra"},
        )
        place = extractors.extract_location(text)
        self.assertIsNotNone(place)
        self.assertIn(
            place.casefold(),
            {"sumatera selatan", "sumatra selatan", "south sumatra", "sumsel"},
        )
        self.assertEqual(extractors.parse_surveillance_count("1.426"), 1426)

    def test_oku_is_indonesia_not_malaysia(self):
        text = (
            "Kabupaten Banyuasin mencatat 85 kasus dengan dua kematian, "
            "kabupaten Ogan Komering Ulu (OKU) mencatat 80 kasus DBD."
        )
        had_ulu = "Ulu" in config.LOCATION_COORDS
        previous_ulu_country = config.LOCATION_COUNTRIES.get("Ulu")
        config.LOCATION_COORDS.setdefault("Ulu", (3.15, 101.70))
        config.LOCATION_COUNTRIES["Ulu"] = "Malaysia"
        config.build_location_patterns()
        extractors.invalidate_location_alias_cache()
        try:
            events = compose_structured_events(
                text=text,
                primary_disease="dengue fever DBD",
                primary_location="Ogan Komering Ulu",
                diseases_extracted=["dengue fever DBD"],
                locations=[],
                case_count=165,
                death_count=2,
            )
            countries = {str(evt.get("country") or "") for evt in events}
            self.assertIn("Indonesia", countries)
            self.assertNotIn("Malaysia", countries)
            oku = next(
                (
                    evt
                    for evt in events
                    if "ogan komering ulu" in str(evt.get("location_name") or "").casefold()
                    or "oku" in str(evt.get("location_name") or "").casefold()
                    or str(evt.get("admin2") or "").casefold() == "ogan komering ulu"
                ),
                None,
            )
            self.assertIsNotNone(oku)
            self.assertEqual(oku["country"], "Indonesia")
        finally:
            if not had_ulu:
                config.LOCATION_COORDS.pop("Ulu", None)
                config.LOCATION_COUNTRIES.pop("Ulu", None)
            elif previous_ulu_country is not None:
                config.LOCATION_COUNTRIES["Ulu"] = previous_ulu_country
            config.build_location_patterns()
            extractors.invalidate_location_alias_cache()

    def test_non_indonesia_short_forms(self):
        cases = [
            ("TP.HCM", "Ho Chi Minh City", "Vietnam"),
            ("BKK", "Bangkok", "Thailand"),
            ("KL", "Kuala Lumpur", "Malaysia"),
            ("NCR", "Metro Manila", "Philippines"),
        ]
        for alias, canonical, country in cases:
            with self.subTest(alias=alias):
                hier = extractors.resolve_location_hierarchy(alias)
                self.assertEqual(hier["country"], country)
                self.assertEqual(hier["canonical_name"].casefold(), canonical.casefold())

    def test_province_total_stays_beside_kabupaten_counts(self):
        text = (
            "Dinkes Sumsel catat 1.426 kasus DBD hingga Mei 2026. "
            "Ia menjelaskan, Kota Palembang menjadi wilayah dengan jumlah kasus DBD "
            "terbanyak, yakni 413 kasus dengan satu kematian. Selanjutnya Kabupaten "
            "Muara Enim mencatat 281 kasus dengan dua kematian, Kabupaten Ogan Ilir "
            "141 kasus dengan satu kematian, dan Kota Lubuklinggau 109 kasus dengan "
            "dua kematian. Kemudian, Kabupaten Banyuasin mencatat 85 kasus dengan "
            "dua kematian, kabupaten Ogan Komering Ulu (OKU) mencatat 80 kasus DBD."
        )
        events = compose_structured_events(
            text=text,
            primary_disease="dengue fever DBD",
            primary_location="Sumatera Selatan",
            primary_country="Indonesia",
            diseases_extracted=["dengue fever DBD"],
            locations=[],
            case_count=1426,
            death_count=0,
        )
        counted = {
            (str(evt.get("location_name") or ""), int(evt.get("case_count") or 0))
            for evt in events
            if int(evt.get("case_count") or 0) > 0
        }
        self.assertIn(("Sumatera Selatan", 1426), counted)
        self.assertIn(("Palembang", 413), counted)
        self.assertIn(("Muara Enim", 281), counted)
        self.assertIn(("Ogan Ilir", 141), counted)
        self.assertIn(("Lubuklinggau", 109), counted)
        self.assertIn(("Banyuasin", 85), counted)
        self.assertIn(("Ogan Komering Ulu", 80), counted)
        self.assertNotIn(("Palembang", 141), counted)
        self.assertNotIn(("Lubuklinggau", 141), counted)

    def test_named_cities_without_counts_stay_one_event(self):
        text = (
            "Dinkes Sumsel catat 1.426 kasus DBD hingga Mei 2026. "
            "Kasus tersebar di Muara Enim, Banyuasin, dan Ogan Komering Ulu."
        )
        events = compose_structured_events(
            text=text,
            primary_disease="dengue fever DBD",
            primary_location="Sumatera Selatan",
            primary_country="Indonesia",
            diseases_extracted=["dengue fever DBD"],
            locations=[],
            case_count=1426,
            death_count=0,
        )
        counted = [evt for evt in events if int(evt.get("case_count") or 0) > 0]
        self.assertEqual(len(counted), 1)
        self.assertEqual(int(counted[0]["case_count"]), 1426)
        self.assertEqual(counted[0]["country"], "Indonesia")

    def test_geo_uncertain_escalates_when_sumsel_unbound(self):
        text = "Dinkes Sumsel catat 1.426 kasus DBD hingga Mei 2026."
        self.assertTrue(
            extraction_geo_uncertain(
                text,
                resolved_names=["", "Outside ASEAN"],
                case_count=1426,
            )
        )
        self.assertFalse(
            extraction_geo_uncertain(
                text,
                resolved_names=["Sumatera Selatan", "Indonesia"],
                case_count=1426,
            )
        )
        with patch.object(config, "AGENT_ENABLED", True):
            self.assertTrue(
                should_escalate_to_llm(
                    disease="Dengue",
                    confidence=0.92,
                    extracted=["Dengue"],
                    case_count=1426,
                    is_health_related=True,
                    geo_uncertain=True,
                )
            )
            self.assertFalse(
                should_escalate_to_llm(
                    disease="Dengue",
                    confidence=0.92,
                    extracted=["Dengue"],
                    case_count=1426,
                    is_health_related=True,
                    geo_uncertain=False,
                )
            )
