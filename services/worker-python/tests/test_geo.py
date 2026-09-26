import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.geo import (
    st_makepoint_args,
    coords_in_country_bbox,
    country_centroid,
    curated_admin_coordinates,
    replace_foreign_indonesia_centroid,
)


class GeoTests(unittest.TestCase):
    def test_st_makepoint_args_are_longitude_then_latitude(self):
        jakarta_lat, jakarta_lon = -6.2088, 106.8456
        lon_check, lat_check, x, y = st_makepoint_args(jakarta_lat, jakarta_lon)
        self.assertEqual((lon_check, lat_check), (jakarta_lon, jakarta_lat))
        self.assertEqual((x, y), (jakarta_lon, jakarta_lat))

    def test_singapore_bay_of_bengal_is_outside_bbox(self):
        self.assertFalse(coords_in_country_bbox(15.0, 90.0, "Singapore"))
        lat, lon = country_centroid("Singapore")
        self.assertTrue(coords_in_country_bbox(lat, lon, "Singapore"))

    def test_kampong_thom_stays_in_cambodia(self):
        self.assertTrue(coords_in_country_bbox(12.7111, 104.8889, "Cambodia"))

    def test_vietnam_centroid_is_not_hanoi(self):
        lat, lon = country_centroid("Vietnam")
        self.assertAlmostEqual(lat, 14.0583, places=3)
        self.assertAlmostEqual(lon, 108.2772, places=3)
        self.assertNotAlmostEqual(lat, 21.0278, places=3)

    def test_curated_admin_pins_and_foreign_indonesia_centroid(self):
        self.assertEqual(curated_admin_coordinates("An Giang", "Vietnam"), (10.5216, 105.1259))
        self.assertEqual(curated_admin_coordinates("Quảng Trị", "Vietnam"), (16.7943, 107.0027))
        self.assertEqual(curated_admin_coordinates("Jogja", "Indonesia"), (-7.7956, 110.3695))
        self.assertIsNone(curated_admin_coordinates("An Giang", "Indonesia"))
        lat, lon = replace_foreign_indonesia_centroid(-2.5489, 118.0149, "Cambodia")
        self.assertAlmostEqual(lat, 12.5657, places=3)
        self.assertAlmostEqual(lon, 104.9910, places=3)


if __name__ == "__main__":
    unittest.main()


if __name__ == "__main__":
    unittest.main()
