#!/usr/bin/env python3
"""Guard KPI snapshot invalidation on ingest and mapped-location semantics."""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "database" / "init" / "084_kpi_snapshot_ingest_invalidation.sql"
BACKEND = ROOT / "services" / "backend-rust" / "src" / "main.rs"
WORKER = ROOT / "services" / "worker-python" / "app"


class KpiSnapshotInvalidationMigrationTests(unittest.TestCase):
    def setUp(self):
        self.sql = MIGRATION.read_text(encoding="utf-8")
        self.backend = BACKEND.read_text(encoding="utf-8")

    def test_migration_marks_snapshots_stale_on_disease_events_dml(self):
        self.assertIn("CREATE OR REPLACE FUNCTION abvc_mark_kpi_snapshots_stale()", self.sql)
        self.assertIn("UPDATE kpi_snapshots SET is_stale = TRUE", self.sql)
        self.assertIn("AFTER INSERT OR UPDATE OR DELETE ON disease_events", self.sql)
        self.assertIn("FOR EACH STATEMENT", self.sql)
        self.assertIn("trg_disease_events_mark_kpi_stale", self.sql)

    def test_backend_bootstraps_the_same_trigger(self):
        self.assertIn("abvc_mark_kpi_snapshots_stale", self.backend)
        self.assertIn("trg_disease_events_mark_kpi_stale", self.backend)

    def test_snapshot_refresh_has_max_age_safety_net(self):
        self.assertRegex(
            self.backend,
            r"KPI_SNAPSHOT_MAX_AGE_SECS:\s*i64\s*=\s*\d+",
        )
        self.assertIn("age_secs >= KPI_SNAPSHOT_MAX_AGE_SECS", self.backend)

    def test_mapped_locations_require_coordinates(self):
        self.assertIn("mapped_latitude", self.backend)
        self.assertIn("mapped_longitude", self.backend)
        self.assertIn(
            "WHERE mapped_latitude IS NOT NULL AND mapped_longitude IS NOT NULL",
            self.backend,
        )
        self.assertIn("COUNT(DISTINCT NULLIF(TRIM(location_name), ''))", self.backend)

    def test_month_trend_uses_per_event_caps(self):
        self.assertIn("SANE_CASES_SQL", self.backend)
        # The live month-vs-all-time bug was SUM(case_count) without LEAST cap.
        month_block = self.backend.split("let trend_row = client.query_one(")[1].split(
            "let weekly_country"
        )[0]
        self.assertIn("{cases}", month_block)
        self.assertIn("{deaths}", month_block)
        self.assertNotIn("SUM(GREATEST(COALESCE(case_count,0),0))", month_block)

    def test_workers_invalidate_snapshots(self):
        for name in ("worker.py", "analysis_jobs.py", "reanalyze_health.py", "crawl_matrix_jobs.py"):
            source = (WORKER / name).read_text(encoding="utf-8")
            self.assertIn("mark_kpi_snapshots_stale", source)


if __name__ == "__main__":
    unittest.main()
