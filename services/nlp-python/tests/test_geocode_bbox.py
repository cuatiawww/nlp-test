"""Round 3 geocode bbox + garbage-token tests."""
import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app import extractors, config


class GeocodeBboxTests(unittest.TestCase):
    def setUp(self):
        self._coords = dict(config.LOCATION_COORDS)
        self._countries = dict(config.LOCATION_COUNTRIES)
        config.LOCATION_COORDS = {
            "Singapore": (15.0, 90.0),  # Bay of Bengal — must be rejected
            "Kampong Thom": (12.7111, 104.8889),
            "Were": (-8.8725, 121.0602),
            "Jakarta": (-6.2088, 106.8456),
        }
        config.LOCATION_COUNTRIES = {
            "Singapore": "Singapore",
            "Kampong Thom": "Cambodia",
            "Were": "Indonesia",
            "Jakarta": "Indonesia",
        }

    def tearDown(self):
        config.LOCATION_COORDS = self._coords
        config.LOCATION_COUNTRIES = self._countries

    def test_were_is_not_a_place(self):
        self.assertFalse(extractors.is_usable_place_name("Were"))
        lat, lon, _conf, needs_review = extractors.geocode_place("Were", "Indonesia")
        self.assertIsNone(lat)
        self.assertIsNone(lon)
        self.assertTrue(needs_review)

    def test_singapore_bay_of_bengal_gazetteer_row_is_rejected(self):
        # Country-level Singapore uses the curated island centroid, not the bad row.
        lat, lon, conf, needs_review = extractors.geocode_place("Singapore", "Singapore")
        self.assertAlmostEqual(lat, 1.3521, places=3)
        self.assertAlmostEqual(lon, 103.8198, places=3)
        self.assertFalse(needs_review)
        self.assertGreater(conf, 0.9)
        self.assertFalse(extractors.coords_in_country_bbox(15.0, 90.0, "Singapore"))

    def test_kampong_thom_stays_inside_cambodia(self):
        lat, lon, _conf, needs_review = extractors.geocode_place("Kampong Thom", "Cambodia")
        self.assertIsNotNone(lat)
        self.assertFalse(needs_review)
        province, city = extractors.split_admin_place("Kampong Thom", "Cambodia")
        self.assertEqual(province, "Kampong Thom")
        self.assertIsNone(city)

    def test_country_event_has_no_province(self):
        province, city = extractors.split_admin_place("Cambodia", "Cambodia")
        self.assertIsNone(province)
        self.assertIsNone(city)


if __name__ == "__main__":
    unittest.main()
