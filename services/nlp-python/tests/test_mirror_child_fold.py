"""Slice D: fold child/sub_event rows that mirror parent national metrics 1:1."""

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.multi_event_extractor import _deduplicate_events, _fold_mirror_child_events


class MirrorChildFoldTests(unittest.TestCase):
    def test_fold_child_that_mirrors_national_totals(self):
        events = [
            {
                "disease": "Dengue",
                "location_name": "Indonesia",
                "country": "Indonesia",
                "case_count": 100,
                "death_count": 2,
                "time_frame": "",
                "temporal_context": "",
            },
            {
                "disease": "Dengue",
                "location_name": "Jakarta",
                "country": "Indonesia",
                "case_count": 100,
                "death_count": 2,
                "time_frame": "",
                "temporal_context": "",
                "evidence": "same totals restated for capital",
            },
            {
                "disease": "Dengue",
                "location_name": "Surabaya",
                "country": "Indonesia",
                "case_count": 40,
                "death_count": 1,
                "time_frame": "",
                "temporal_context": "",
            },
        ]
        folded = _fold_mirror_child_events(events)
        locs = {e["location_name"] for e in folded}
        self.assertEqual(locs, {"Indonesia", "Surabaya"})

    def test_deduplicate_runs_mirror_fold(self):
        events = [
            {
                "disease": "Dengue",
                "location_name": "Indonesia",
                "country": "Indonesia",
                "case_count": 100,
                "death_count": 2,
                "time_frame": "",
                "temporal_context": "",
            },
            {
                "disease": "Dengue",
                "location_name": "Jakarta",
                "country": "Indonesia",
                "case_count": 100,
                "death_count": 2,
                "time_frame": "",
                "temporal_context": "",
            },
        ]
        out = _deduplicate_events(events)
        self.assertEqual([e["location_name"] for e in out], ["Indonesia"])


if __name__ == "__main__":
    unittest.main()
