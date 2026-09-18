"""Unit tests for Phase 2: Hierarchical ASEAN Location Intelligence Engine."""

import unittest
from app import config
from app import extractors
from app.multi_event_extractor import compose_structured_events


class TestLocationHierarchy(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Ensure database gazetteer & aliases are loaded
        config.load_locations_from_db()

    def test_indonesia_city_hierarchy(self):
        hier = extractors.resolve_location_hierarchy("Bandung")
        self.assertEqual(hier["canonical_name"], "Bandung")
        self.assertEqual(hier["country"], "Indonesia")
        self.assertEqual(hier["country_iso3"], "IDN")
        self.assertEqual(hier["admin1_name"], "Jawa Barat")
        self.assertEqual(hier["admin2_name"], "Kota Bandung")
        self.assertEqual(hier["admin_level"], 2)
        self.assertIsNotNone(hier["latitude"])
        self.assertIsNotNone(hier["longitude"])

    def test_indonesia_province_hierarchy(self):
        hier = extractors.resolve_location_hierarchy("Jawa Barat")
        self.assertEqual(hier["canonical_name"], "Jawa Barat")
        self.assertEqual(hier["country"], "Indonesia")
        self.assertEqual(hier["country_iso3"], "IDN")
        self.assertEqual(hier["admin1_name"], "Jawa Barat")
        self.assertIsNone(hier["admin2_name"])
        self.assertEqual(hier["admin_level"], 1)

    def test_indonesia_country_level_hierarchy(self):
        hier = extractors.resolve_location_hierarchy("Indonesia")
        self.assertEqual(hier["canonical_name"], "Indonesia")
        self.assertEqual(hier["country"], "Indonesia")
        self.assertEqual(hier["country_iso3"], "IDN")
        self.assertIsNone(hier["admin1_name"])
        self.assertIsNone(hier["admin2_name"])
        self.assertEqual(hier["admin_level"], 0)

    def test_asean_countries_iso3(self):
        cases = [
            ("Singapore", "Singapore", "SGP", 0),
            ("Bangkok", "Thailand", "THA", 3),
            ("Hanoi", "Vietnam", "VNM", 3),
            ("Manila", "Philippines", "PHL", 3),
            ("Kuala Lumpur", "Malaysia", "MYS", 3),
        ]
        for name, expected_country, expected_iso3, expected_level in cases:
            with self.subTest(name=name):
                hier = extractors.resolve_location_hierarchy(name)
                self.assertEqual(hier["country"], expected_country)
                self.assertEqual(hier["country_iso3"], expected_iso3)
                self.assertEqual(hier["admin_level"], expected_level)

    def test_multilingual_alias_resolution(self):
        aliases = [
            ("Jabar", "Jawa Barat", "Indonesia", "IDN"),
            ("Jateng", "Jawa Tengah", "Indonesia", "IDN"),
            ("Jatim", "Jawa Timur", "Indonesia", "IDN"),
            ("Singapura", "Singapore", "Singapore", "SGP"),
            ("Krung Thep", "Bangkok", "Thailand", "THA"),
            ("TP.HCM", "Ho Chi Minh City", "Vietnam", "VNM"),
            ("Saigon", "Ho Chi Minh City", "Vietnam", "VNM"),
            ("Hà Nội", "Hanoi", "Vietnam", "VNM"),
        ]
        for alias, canonical, country, iso3 in aliases:
            with self.subTest(alias=alias):
                hier = extractors.resolve_location_hierarchy(alias)
                self.assertEqual(hier["canonical_name"], canonical)
                self.assertEqual(hier["country"], country)
                self.assertEqual(hier["country_iso3"], iso3)

    def test_split_admin_place_hierarchical(self):
        # City returns (provinsi, kabupaten/kota)
        prov, city = extractors.split_admin_place("Bandung", country="Indonesia")
        self.assertEqual(prov, "Jawa Barat")
        self.assertEqual(city, "Kota Bandung")

        # Province returns (provinsi, None)
        prov, city = extractors.split_admin_place("Jawa Barat", country="Indonesia")
        self.assertEqual(prov, "Jawa Barat")
        self.assertIsNone(city)

        # Country returns (None, None)
        prov, city = extractors.split_admin_place("Indonesia", country="Indonesia")
        self.assertIsNone(prov)
        self.assertIsNone(city)

    def test_structured_events_inherit_hierarchy(self):
        text = "Dinas Kesehatan Jawa Barat mencatat 90 kasus DBD di Bandung dan 200 di Depok."
        events = compose_structured_events(
            text=text,
            primary_disease="dengue fever DBD",
            primary_location="Bandung",
            diseases_extracted=["dengue fever DBD"],
            locations=[],
            case_count=290,
            death_count=0,
        )
        self.assertGreaterEqual(len(events), 2)
        bandung_evt = next((e for e in events if e.get("location_name") == "Bandung"), None)
        self.assertIsNotNone(bandung_evt)
        self.assertEqual(bandung_evt["country"], "Indonesia")
        self.assertEqual(bandung_evt["country_iso3"], "IDN")
        self.assertEqual(bandung_evt["admin1"], "Jawa Barat")
        self.assertEqual(bandung_evt["admin2"], "Kota Bandung")

        depok_evt = next((e for e in events if e.get("location_name") == "Depok"), None)
        self.assertIsNotNone(depok_evt)
        self.assertEqual(depok_evt["country"], "Indonesia")
        self.assertEqual(depok_evt["country_iso3"], "IDN")
        self.assertEqual(depok_evt["admin1"], "Jawa Barat")
        self.assertEqual(depok_evt["admin2"], "Kota Depok")

    def test_single_event_fallback_hierarchy(self):
        text = "Wabah flu burung melanda Bandung dengan 12 kasus."
        events = compose_structured_events(
            text=text,
            primary_disease="avian influenza",
            primary_location="Bandung",
            diseases_extracted=["avian influenza"],
            locations=[],
            case_count=12,
            death_count=0,
        )
        self.assertEqual(len(events), 1)
        evt = events[0]
        self.assertEqual(evt["disease"], "avian influenza")
        self.assertEqual(evt["location_name"], "Bandung")
        self.assertEqual(evt["country"], "Indonesia")
        self.assertEqual(evt["country_iso3"], "IDN")
        self.assertEqual(evt["admin1"], "Jawa Barat")
        self.assertEqual(evt["admin2"], "Kota Bandung")


if __name__ == "__main__":
    unittest.main()
