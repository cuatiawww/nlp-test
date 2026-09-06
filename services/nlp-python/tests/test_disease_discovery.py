import unittest
from pathlib import Path


class DiseaseDiscoveryMigrationTests(unittest.TestCase):
    def test_asean_alias_migration_is_additive_and_multilingual(self):
        migration = Path(__file__).parents[3] / "database" / "init" / "042_asean_disease_aliases.sql"
        sql = migration.read_text(encoding="utf-8").lower()

        self.assertIn("insert into disease_aliases", sql)
        self.assertIn("on conflict do nothing", sql)
        for language in ("'id'", "'en'", "'vi'", "'th'", "'km'", "'my'", "'lo'", "'ms'"):
            self.assertIn(language, sql)

    def test_candidate_review_statuses_remain_quarantined(self):
        migration = Path(__file__).parents[3] / "database" / "init" / "039_disease_mentions_and_discovery.sql"
        sql = migration.read_text(encoding="utf-8").lower()

        self.assertIn("status in ('pending', 'resolved', 'rejected')", sql)
        self.assertIn("resolved_concept_id", sql)


if __name__ == "__main__":
    unittest.main()
