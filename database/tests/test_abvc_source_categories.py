#!/usr/bin/env python3
"""Guard the ABVC catalog-type restore migration against another all-web collapse."""
import csv
import re
import unittest
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CSV_PATH = ROOT / "database" / "abvc-master-source.csv"
SQL_PATH = ROOT / "database" / "init" / "066_restore_abvc_source_categories.sql"


class AbvcSourceCategoryMigrationTests(unittest.TestCase):
    def setUp(self):
        with CSV_PATH.open(newline="", encoding="utf-8-sig") as handle:
            self.rows = list(csv.DictReader(handle))
        self.sql = SQL_PATH.read_text(encoding="utf-8")

    def test_catalog_is_not_collapsed_to_web(self):
        types = Counter(row["type"] for row in self.rows)
        self.assertGreaterEqual(types["Google"], 700)
        self.assertGreaterEqual(types["Local News"], 400)
        self.assertGreaterEqual(types["Official Government Sites"], 20)
        self.assertNotEqual(set(types), {"web"})

    def test_migration_embeds_alma_types(self):
        self.assertIn("'Google'", self.sql)
        self.assertIn("'Local News'", self.sql)
        self.assertIn("'Official Government Sites'", self.sql)
        self.assertIn("'HTML'", self.sql)
        self.assertIn("'Facebook'", self.sql)
        self.assertNotRegex(
            self.sql,
            r"INSERT INTO abvc_catalog[^\n]*\nVALUES\n(?:\('[^']+', 'web',){20}",
        )

    def test_migration_row_count_matches_catalog(self):
        value_rows = re.findall(r"^\('https?://", self.sql, flags=re.M)
        unique_urls = {(row["source"] or "").strip().lower().rstrip("/") for row in self.rows}
        unique_urls.discard("")
        self.assertEqual(len(value_rows), len(unique_urls))

    def test_crawler_engine_stays_constrained(self):
        self.assertIn("THEN 'social_media'", self.sql)
        self.assertIn("ELSE s.source_type", self.sql)
        self.assertNotIn("THEN 'Google'", self.sql)
        self.assertNotIn("THEN 'Local News'", self.sql)


if __name__ == "__main__":
    unittest.main()
