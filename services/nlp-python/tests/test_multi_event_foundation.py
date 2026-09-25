"""Tests for Phase 1: Unified Multi-Event Foundation & Persistence Harmonization."""

import sys
import unittest

sys.path.insert(0, "/app")

from app.schemas import SubEvent, AnalyzeResponse
from app.multi_event_extractor import compose_structured_events, extract_multi_events
from app.intelligence import _generic_observations
from app import config

TEST_LOCATIONS = {
    "Jakarta": ("Indonesia", -6.2088, 106.8456),
    "Bandung": ("Indonesia", -6.9175, 107.6191),
    "Surabaya": ("Indonesia", -7.2575, 112.7521),
    "Bangkok": ("Thailand", 13.7563, 100.5018),
    "Manila": ("Philippines", 14.5995, 120.9842),
    "Tuy Đức": ("Vietnam", 12.18, 107.50),
}


class MultiEventFoundationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        for name, (country, lat, lon) in TEST_LOCATIONS.items():
            config.LOCATION_COORDS[name] = (lat, lon)
            config.LOCATION_COUNTRIES[name] = country
        config.DISEASE_DICT.update({
            "dbd": "Dengue",
            "dengue": "Dengue",
            "sốt xuất huyết": "Dengue",
            "tay chân miệng": "HFMD",
        })
        config.build_location_patterns()

    def test_subevent_schema_defaults(self):
        evt = SubEvent(
            disease="Dengue",
            location_name="Jakarta",
            country="Indonesia",
            case_count=150,
            death_count=2,
        )
        self.assertEqual(evt.disease, "Dengue")
        self.assertEqual(evt.location_name, "Jakarta")
        self.assertEqual(evt.case_count, 150)
        self.assertEqual(evt.death_count, 2)
        self.assertEqual(evt.metric_type, "cases")
        self.assertEqual(evt.unit, "persons")
        self.assertIsNone(evt.admin1)
        self.assertIsNone(evt.admin2)
        self.assertEqual(evt.epistemic_status, "reported")
        self.assertAlmostEqual(evt.confidence, 0.90)

    def test_single_event_article_produces_one_structured_event(self):
        # Single-event text without multi-event breakdown
        events = compose_structured_events(
            text="Kemenkes melaporkan 50 kasus DBD di Jakarta selama bulan ini.",
            primary_disease="Dengue",
            primary_location="Jakarta",
            diseases_extracted=["Dengue"],
            locations=[{"name": "Jakarta", "country": "Indonesia"}],
            case_count=50,
            death_count=0,
        )
        self.assertEqual(len(events), 1)
        single = events[0]
        self.assertEqual(single["disease"], "Dengue")
        self.assertEqual(single["location_name"], "Jakarta")
        self.assertEqual(single["case_count"], 50)
        self.assertEqual(single["death_count"], 0)
        self.assertEqual(single["metric_type"], "cases")
        self.assertEqual(single["unit"], "persons")

    def test_multi_event_breakdown_produces_multiple_events(self):
        # Vietnamese breakdown pattern
        text = (
            "Tuy Đức ghi nhận 68 ca bệnh truyền nhiễm, trong đó, "
            "có 46 ca sốt xuất huyết và 18 ca tay chân miệng"
        )
        events = compose_structured_events(
            text=text,
            primary_disease="Dengue",
            primary_location="Tuy Đức",
            diseases_extracted=["sốt xuất huyết", "tay chân miệng"],
            locations=[{"name": "Tuy Đức", "country": "Vietnam"}],
            case_count=68,
            death_count=0,
        )
        self.assertGreaterEqual(len(events), 2)
        counts = {evt["disease"].lower(): evt["case_count"] for evt in events}
        self.assertTrue(any("dengue" in d or "sốt xuất huyết" in d for d in counts))
        self.assertTrue(any("hand, foot" in d or "tay chân miệng" in d or "hfmd" in d for d in counts))

    def test_parenthetical_multi_location_events(self):
        text = "Laporan kasus DBD per wilayah: Jakarta (120 kasus), Bangkok (45 kasus), Manila (80 kasus)."
        events = compose_structured_events(
            text=text,
            primary_disease="Dengue",
            primary_location="Jakarta",
            diseases_extracted=["Dengue"],
            locations=[
                {"name": "Jakarta", "country": "Indonesia"},
                {"name": "Bangkok", "country": "Thailand"},
                {"name": "Manila", "country": "Philippines"},
            ],
            case_count=245,
            death_count=0,
        )
        self.assertGreaterEqual(len(events), 3)
        locs = {evt["location_name"] for evt in events}
        self.assertIn("Jakarta", locs)
        self.assertIn("Bangkok", locs)
        self.assertIn("Manila", locs)

    def test_unknown_or_non_health_returns_empty_events(self):
        events = compose_structured_events(
            text="Berita politik dan ekonomi terkini tidak ada penyakit.",
            primary_disease="UNKNOWN",
            primary_location=None,
            diseases_extracted=[],
            locations=[],
            case_count=0,
            death_count=0,
        )
        self.assertEqual(len(events), 0)

    def test_generic_observation_ignores_unresolved_location(self):
        class UnresolvedLocationLinker:
            def local_mentions(self, _text):
                return [(0, 7, None)]

        observations = _generic_observations(
            "Geneva reported 12 hospitalized patients.",
            UnresolvedLocationLinker(),
        )
        self.assertEqual(observations, [])


if __name__ == "__main__":
    unittest.main()
