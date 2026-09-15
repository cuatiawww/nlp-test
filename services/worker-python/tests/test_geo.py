import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.geo import st_makepoint_args


class GeoTests(unittest.TestCase):
    def test_st_makepoint_args_are_longitude_then_latitude(self):
        jakarta_lat, jakarta_lon = -6.2088, 106.8456
        lon_check, lat_check, x, y = st_makepoint_args(jakarta_lat, jakarta_lon)
        self.assertEqual((lon_check, lat_check), (jakarta_lon, jakarta_lat))
        self.assertEqual((x, y), (jakarta_lon, jakarta_lat))


if __name__ == "__main__":
    unittest.main()
