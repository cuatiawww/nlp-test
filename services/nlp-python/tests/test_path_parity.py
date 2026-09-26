"""URL analyze, crawl, and batch must emit the same events for the same article."""

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.pipeline import run
from app.schemas import AnalyzeRequest
from test_clause_owned_national_counts import VOV_HFMD


def _event_keys(result):
    return sorted(
        (
            str(event.country or ""),
            str(event.location_name or ""),
            int(event.case_count or 0),
            int(event.death_count or 0),
        )
        for event in (result.sub_events or [])
    )


class PathParityTests(unittest.TestCase):
    def test_three_callers_same_events_after_full_pipeline_payload(self):
        url = "https://vov.vn/en/society/hfmd-cases-surge"
        shapes = (
            AnalyzeRequest(
                text=VOV_HFMD,
                source_type="web",
                source_name="URL Analyzer",
                source_url=url,
                published_at="2026-03-31",
                interactive=True,
            ),
            AnalyzeRequest(
                text=VOV_HFMD,
                source_type="news",
                source_name="VOV",
                source_url=url,
                published_at="2026-03-31",
            ),
            AnalyzeRequest(
                text=VOV_HFMD,
                source_type="news",
                source_name="manual crawl",
                source_url=url,
                published_at="2026-03-31",
                rules_only=True,
            ),
        )
        keys = []
        for raw in shapes:
            payload = raw.model_copy(update={"interactive": False, "rules_only": False})
            keys.append(_event_keys(run(payload)))
        self.assertEqual(keys[0], keys[1])
        self.assertEqual(keys[1], keys[2])
        self.assertTrue(keys[0])
