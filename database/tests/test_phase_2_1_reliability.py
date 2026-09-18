import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class Phase21ReliabilityContractTests(unittest.TestCase):
    def test_identity_migration_casts_dynamic_values_to_text(self):
        migration = (ROOT / "database" / "init" / "088_crawler_identity_constraints.sql").read_text()
        self.assertIn("WHERE %1$I::text = $1::text", migration)
        self.assertIn("USING duplicate_group.identity_value::text", migration)
        self.assertIn("WHERE %1$I::text = $2::text", migration)
        self.assertIn("USING survivor_id, duplicate_group.identity_value::text", migration)

    def test_outbox_migration_recovers_existing_processing_rows(self):
        migration = (ROOT / "database" / "init" / "089_phase_2_1_queue_reliability.sql").read_text()
        self.assertIn("CREATE TABLE IF NOT EXISTS raw_report_outbox", migration)
        self.assertIn("processing_status IN ('NEW', 'FAILED', 'PROCESSING')", migration)
        self.assertIn("ON CONFLICT (raw_report_id) DO NOTHING", migration)

    def test_rust_raw_publish_is_recoverable_and_confirmed(self):
        source = (ROOT / "services" / "backend-rust" / "src" / "main.rs").read_text()
        self.assertIn("raw_report_outbox_once", source)
        self.assertIn("FOR UPDATE OF o SKIP LOCKED", source)
        self.assertIn("confirm_select", source)
        self.assertIn('"disease.raw"', source)
        self.assertIn("with_delivery_mode(2)", source)
        self.assertIn("publisher_confirm.await", source)
        self.assertIn("Confirmation::Nack", source)
        self.assertNotIn('matches!(status.as_str(), "PROCESSED" | "NON_HEALTH" | "DUPLICATE")', source)


if __name__ == "__main__":
    unittest.main()
