"""A YTD total and a later dated increment stay two events."""

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import config, extractors
from app.admin_abbreviations import apply_admin_abbreviations, bind_document_admin_scope
from app.epidemiology import numeric_case_window
from app.multi_event_extractor import compose_structured_events
from app.surveillance_extraction import (
    GazetteerLinker,
    _METRIC_PATTERN_CACHE,
    _RELATION_PATTERN_CACHE,
    extract_metric_relations,
)


TP_HCM_DENGUE = """
TP HCM ghi nhận hơn 31.000 ca sốt xuất huyết trong 8 tháng

TP HCM ghi nhận 31.032 ca sốt xuất huyết Dengue tính từ đầu năm đến ngày 6/9,
so với cùng kỳ năm trước. Số liệu do Trung tâm Kiểm soát bệnh tật TP HCM
(HCDC) công bố ngày 9/9. Riêng (31/8-6/9), thành phố ghi nhận 1.338 ca.
Theo đơn vị, ca mắc hàng tuần tại TP HCM liên tục tăng so với trung bình
4 tuần trước đó.
"""


class YtdIncrementWindowTests(unittest.TestCase):
    def setUp(self):
        apply_admin_abbreviations()
        config.build_location_patterns()
        extractors.invalidate_location_alias_cache()
        GazetteerLinker._SHARED_FOLDED_COORDS = None
        GazetteerLinker._SHARED_MENTION_PATTERN = None
        GazetteerLinker._SHARED_SIG = None
        _RELATION_PATTERN_CACHE.clear()
        _METRIC_PATTERN_CACHE.clear()
        bind_document_admin_scope(TP_HCM_DENGUE)

    def test_numeric_windows_split_ytd_and_week(self):
        ytd = numeric_case_window("tính từ đầu năm đến ngày 6/9", "2026-09-11")
        self.assertEqual(ytd["event_date_start"], "2026-01-01")
        self.assertEqual(ytd["event_date_end"], "2026-09-06")
        self.assertEqual(ytd["period_type"], "cumulative")
        week = numeric_case_window("Riêng (31/8-6/9), thành phố ghi nhận 1.338 ca", "2026-09-11")
        self.assertEqual(week["event_date_start"], "2026-08-31")
        self.assertEqual(week["event_date_end"], "2026-09-06")
        self.assertEqual(week["period_type"], "weekly")

    def test_hcmc_keeps_two_dated_events(self):
        linker = GazetteerLinker(allow_remote=False)
        relations = extract_metric_relations(
            TP_HCM_DENGUE, linker=linker, published_date="2026-09-11"
        )
        events = compose_structured_events(
            text=TP_HCM_DENGUE,
            primary_disease="Dengue",
            primary_location="Ho Chi Minh City",
            diseases_extracted=["Dengue"],
            locations=[],
            case_count=0,
            death_count=0,
            primary_country="Vietnam",
            linker=linker,
            relations=relations,
            published_at="2026-09-11",
        )
        by_count = {int(item.get("case_count") or 0): item for item in events}
        self.assertIn(31032, by_count)
        self.assertIn(1338, by_count)
        self.assertGreaterEqual(len(events), 2)
        self.assertNotEqual(
            by_count[31032].get("time_frame") or by_count[31032].get("event_date_start"),
            by_count[1338].get("time_frame") or by_count[1338].get("event_date_start"),
        )


if __name__ == "__main__":
    unittest.main()
