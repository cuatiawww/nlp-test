import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.kpi import (
    MARK_KPI_STALE_SQL,
    is_mappable_kpi_location,
    mapped_location_count,
    mark_kpi_snapshots_stale,
    nlp_needs_review,
)


class RecordingConn:
    def __init__(self, fail_on=None):
        self.statements = []
        self.fail_on = fail_on

    def execute(self, sql, params=None):
        self.statements.append(sql)
        if self.fail_on and self.fail_on in sql:
            raise RuntimeError("forced failure")
        return self


class KpiSnapshotInvalidationTests(unittest.TestCase):
    def test_mark_uses_savepoint_and_updates_stale_flag(self):
        conn = RecordingConn()
        self.assertTrue(mark_kpi_snapshots_stale(conn))
        joined = " ".join(conn.statements)
        self.assertIn("SAVEPOINT abvc_kpi_stale", joined)
        self.assertIn(MARK_KPI_STALE_SQL, conn.statements)
        self.assertIn("RELEASE SAVEPOINT abvc_kpi_stale", joined)

    def test_mark_rolls_back_savepoint_when_table_is_missing(self):
        conn = RecordingConn(fail_on="UPDATE kpi_snapshots")
        self.assertFalse(mark_kpi_snapshots_stale(conn))
        self.assertTrue(any("ROLLBACK TO SAVEPOINT" in sql for sql in conn.statements))

    def test_ingest_workers_call_invalidation(self):
        worker_root = ROOT / "app"
        for name in ("worker.py", "analysis_jobs.py", "reanalyze_health.py", "crawl_matrix_jobs.py"):
            source = (worker_root / name).read_text(encoding="utf-8")
            self.assertIn(
                "mark_kpi_snapshots_stale",
                source,
                f"{name} must invalidate KPI snapshots after writing disease_events",
            )


class MappedLocationCountTests(unittest.TestCase):
    def test_new_geocoded_asean_event_increases_count(self):
        existing = [
            {
                "location_name": "Phnom Penh",
                "mapped_latitude": 11.5564,
                "mapped_longitude": 104.9282,
                "resolved_country": "Cambodia",
            }
        ]
        self.assertEqual(mapped_location_count(existing), 1)
        with_new = existing + [
            {
                "location_name": "Kampong Thom",
                "mapped_latitude": 12.7111,
                "mapped_longitude": 104.8886,
                "resolved_country": "Cambodia",
            }
        ]
        self.assertEqual(mapped_location_count(with_new), 2)

    def test_missing_geo_is_unmapped_not_a_dummy_pin(self):
        events = [
            {
                "location_name": "Mystery Village",
                "mapped_latitude": None,
                "mapped_longitude": None,
                "resolved_country": "Cambodia",
            }
        ]
        self.assertEqual(mapped_location_count(events), 0)
        self.assertFalse(
            is_mappable_kpi_location("Mystery Village", None, None, "Cambodia")
        )

    def test_outside_asean_and_blank_names_do_not_count(self):
        events = [
            {
                "location_name": "Utah",
                "mapped_latitude": 40.0,
                "mapped_longitude": -111.9,
                "resolved_country": "OUTSIDE ASEAN",
            },
            {
                "location_name": "  ",
                "mapped_latitude": 1.35,
                "mapped_longitude": 103.82,
                "resolved_country": "Singapore",
            },
        ]
        self.assertEqual(mapped_location_count(events), 0)

    def test_duplicate_name_does_not_inflate_count(self):
        events = [
            {
                "location_name": "Jakarta",
                "mapped_latitude": -6.2,
                "mapped_longitude": 106.8,
                "resolved_country": "Indonesia",
            },
            {
                "location_name": "Jakarta",
                "mapped_latitude": -6.21,
                "mapped_longitude": 106.81,
                "resolved_country": "Indonesia",
            },
        ]
        self.assertEqual(mapped_location_count(events), 1)

    def test_location_master_count_is_not_this_metric(self):
        # Gazetteer size (location_master_count) can be 13k while the KPI is
        # distinct names actually present on dashboard-valid mapped events.
        self.assertEqual(
            mapped_location_count(
                [
                    {
                        "location_name": "Singapore",
                        "mapped_latitude": 1.3521,
                        "mapped_longitude": 103.8198,
                        "resolved_country": "Singapore",
                    }
                ]
            ),
            1,
        )

    def test_nlp_needs_review_when_location_lacks_coordinates(self):
        self.assertTrue(
            nlp_needs_review({"location_name": "Siem Reap", "latitude": None, "longitude": None})
        )
        self.assertFalse(
            nlp_needs_review(
                {
                    "location_name": "Siem Reap",
                    "latitude": 13.36,
                    "longitude": 103.86,
                    "needs_review": False,
                }
            )
        )


class SaveCompletedInvalidationTests(unittest.TestCase):
    def test_save_completed_marks_snapshots_stale(self):
        from app import analysis_jobs

        calls = []

        class FakeCursor:
            def fetchone(self):
                return {"id": "evt-1"}

        class FakeConn:
            def execute(self, sql, params=None):
                calls.append(sql)
                return FakeCursor()

        original_mark = analysis_jobs.mark_kpi_snapshots_stale
        original_loc = analysis_jobs.ENTITY_LOCATION_STORAGE_ENABLED
        original_dis = analysis_jobs.ENTITY_DISEASE_STORAGE_ENABLED
        analysis_jobs.mark_kpi_snapshots_stale = lambda conn: calls.append("MARK_STALE")
        analysis_jobs.ENTITY_LOCATION_STORAGE_ENABLED = False
        analysis_jobs.ENTITY_DISEASE_STORAGE_ENABLED = False
        try:
            analysis_jobs.save_completed(
                FakeConn(),
                "job-1",
                {
                    "url": "https://example.org/h5n1",
                    "content": "Cambodia confirms H5N1",
                    "language": "en",
                    "location_name": "Kampong Thom",
                    "province": "Kampong Thom",
                    "city": None,
                    "latitude": 12.71,
                    "longitude": 104.88,
                    "symptoms": [],
                    "disease_extracted": ["Avian influenza"],
                    "disease_mentions": [],
                    "disease_classification": "Avian influenza",
                    "case_count": 1,
                    "death_count": 0,
                    "confidence": 0.9,
                    "is_health_related": True,
                    "needs_review": False,
                },
            )
        finally:
            analysis_jobs.mark_kpi_snapshots_stale = original_mark
            analysis_jobs.ENTITY_LOCATION_STORAGE_ENABLED = original_loc
            analysis_jobs.ENTITY_DISEASE_STORAGE_ENABLED = original_dis
        self.assertIn("MARK_STALE", calls)


if __name__ == "__main__":
    unittest.main()
