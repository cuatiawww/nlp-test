import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.schedule_interval import source_interval_minutes


class DueSourceIntervalTests(unittest.TestCase):
    def test_empty_schedule_uses_dispatcher_default(self):
        self.assertEqual(source_interval_minutes("", 60), 60)
        self.assertEqual(source_interval_minutes(None, 60), 60)

    def test_explicit_interval_120_is_honored(self):
        self.assertEqual(source_interval_minutes("interval:120", 60), 120)

    def test_daily_schedule_is_one_day(self):
        self.assertEqual(source_interval_minutes("daily:06:00", 60), 24 * 60)


if __name__ == "__main__":
    unittest.main()
