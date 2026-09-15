import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.geo import st_makepoint_args, coords_in_country_bbox, country_centroid


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


if __name__ == "__main__":
    unittest.main()


if __name__ == "__main__":
    unittest.main()
