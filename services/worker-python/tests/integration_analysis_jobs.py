"""Run only against a disposable DB, never the application's DATABASE_URL."""
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
ROOT = Path("/repo")
sys.path.insert(0, str(ROOT / "services/worker-python"))
from app import analysis_jobs as jobs

class JobDatabaseTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if os.getenv("DIRECTIVE_TEST_DB") != "disposable":
            raise RuntimeError("Requires isolated disposable database")
        with jobs.connect() as conn:
            for name in (
                "001_schema.sql",
                "003_sentiment.sql",
                "010_is_health_related.sql",
                "011_locations.sql",
            ):
                conn.execute((ROOT / "database/init" / name).read_text())
            conn.execute("ALTER TABLE disease_events ADD COLUMN IF NOT EXISTS disease_mentions JSONB DEFAULT '[]'")
            conn.execute((ROOT / "database/init/041_analysis_jobs.sql").read_text())
            conn.execute((ROOT / "database/init/043_disease_event_locations.sql").read_text())
            conn.execute((ROOT / "database/init/044_disease_event_diseases.sql").read_text())

    def test_job_replay_is_idempotent_and_preserves_old_event(self):
        from uuid import uuid4
        url = "https://example.org/test/" + str(uuid4())
        with jobs.connect() as conn:
            job_id = str(conn.execute("INSERT INTO analysis_jobs(url) VALUES (%s) RETURNING id",(url,)).fetchone()["id"])
        nlp = {
            "disease_classification": "DENGUE",
            "case_count": 10,
            "death_count": 0,
            "confidence": 0.9,
            "language": "en",
            "is_health_related": True,
            "longitude": 102.2,
            "latitude": 18.1,
            "location_name": "Vientiane",
            "locations": [
                {"name": "Vientiane", "country": "Laos"},
                {"name": "Luang Prabang", "country": "Laos"},
            ],
            "disease_mentions": [
                {
                    "surface_form": "DENGUE",
                    "canonical_name": "DENGUE",
                    "role": "primary",
                    "confidence": 0.9,
                },
                {
                    "surface_form": "measles",
                    "canonical_name": "MEASLES",
                    "role": "secondary",
                    "confidence": 0.7,
                },
            ],
        }
        with patch.object(jobs,"fetch_article",return_value={"content":"10 dengue cases","published_at":"2026-09-01"}), patch.object(jobs,"analyze_article",return_value=nlp):
            jobs.process_job(job_id)
            jobs.process_job(job_id)
        with jobs.connect() as conn:
            row = conn.execute("SELECT * FROM analysis_jobs WHERE id=%s",(job_id,)).fetchone()
            self.assertEqual(row["status"],"completed",row["error"])
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM disease_events WHERE id=%s",(row["event_id"],)).fetchone()["n"],1)
            self.assertEqual(row["result"]["case_count"],10)
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM raw_reports WHERE url=%s",(url,)).fetchone()["n"],1)
            locations = conn.execute(
                "SELECT location_name, role, case_count FROM disease_event_locations "
                "WHERE disease_event_id=%s ORDER BY role, location_name",
                (row["event_id"],),
            ).fetchall()
            self.assertEqual(len(locations), 2)
            self.assertEqual(locations[0]["case_count"], 10)
            self.assertEqual(locations[1]["case_count"], None)
            diseases = conn.execute(
                "SELECT disease_name, role, case_count FROM disease_event_diseases "
                "WHERE disease_event_id=%s ORDER BY case_count DESC NULLS LAST, disease_name",
                (row["event_id"],),
            ).fetchall()
            self.assertEqual(len(diseases), 2)
            self.assertEqual(diseases[0]["case_count"], 10)
            self.assertEqual(diseases[1]["case_count"], None)

    def test_partial_retains_source_without_inventing_event(self):
        with jobs.connect() as conn:
            job_id = str(conn.execute("INSERT INTO analysis_jobs(url) VALUES ('https://example.org/partial') RETURNING id").fetchone()["id"])
        with patch.object(jobs,"fetch_article",return_value={"content":"Medical report"}), patch.object(jobs,"analyze_article",side_effect=TimeoutError()):
            jobs.process_job(job_id)
        with jobs.connect() as conn:
            row = conn.execute("SELECT * FROM analysis_jobs WHERE id=%s",(job_id,)).fetchone()
            self.assertEqual(row["status"],"partial")
            self.assertIsNone(row["event_id"])
            self.assertEqual(row["result"]["content"],"Medical report")

if __name__ == "__main__":
    unittest.main()
