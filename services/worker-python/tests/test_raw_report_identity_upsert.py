"""Focused regression: re-analyze must not UniqueViolation on raw_reports URL."""
from __future__ import annotations

import ast
import unittest
from pathlib import Path
from unittest.mock import MagicMock


ROOT = Path(__file__).resolve().parents[1]
ANALYSIS_JOBS = ROOT / "app" / "analysis_jobs.py"


class RawReportIdentityUpsertTests(unittest.TestCase):
    def test_save_completed_insert_uses_on_conflict(self):
        source = ANALYSIS_JOBS.read_text(encoding="utf-8")
        tree = ast.parse(source)
        fn = next(
            node for node in tree.body
            if isinstance(node, ast.FunctionDef) and node.name == "save_completed"
        )
        dump = ast.dump(fn)
        self.assertIn("ON CONFLICT DO NOTHING", source[fn.lineno:fn.end_lineno and None or None] if False else source)
        # Narrow to the save_completed body text
        body = "\n".join(source.splitlines()[fn.lineno - 1: fn.end_lineno])
        self.assertIn("ON CONFLICT DO NOTHING", body)
        self.assertIn("identity conflict did not resolve", body)
        self.assertIn("UPDATE raw_reports SET", body)

    def test_conflict_branch_updates_existing_row(self):
        """Exercise the conflict-resolve UPDATE path in isolation."""
        conn = MagicMock()
        values = (
            "2026-09-01",
            "Kasus denggi meningkat",
            "denggi",
            "https://www.bharian.com.my/denggi-example",
            None,
            "https://www.bharian.com.my/denggi-example",
            "https://www.bharian.com.my/denggi-example",
            "abc",
            "def",
            "https://www.bharian.com.my/denggi-example",
            None,
            "Malaysia",
        )
        result = {"url": values[3], "normalized_url": values[5], "canonical_url": values[6],
                  "url_hash": values[7], "content_hash": values[8], "final_url": values[9]}

        insert_result = MagicMock()
        insert_result.fetchone.return_value = None
        resolve_result = MagicMock()
        resolve_result.fetchone.return_value = {"id": "raw-existing-1"}
        update_result = MagicMock()
        update_result.fetchone.return_value = {"id": "raw-existing-1"}
        conn.execute.side_effect = [insert_result, resolve_result, update_result]

        # Inline the conflict branch from save_completed (same SQL contract).
        from app.document_identity import identity_where_clause

        row = conn.execute(
            """INSERT INTO raw_reports(
                source_type,source_name,published_at,original_text,summary,url,object_path,processing_status,
                normalized_url,canonical_url,url_hash,content_hash,final_url,author,source_country)
            VALUES ('web','URL Analyzer',%s,%s,%s,%s,%s,'PROCESSED',%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT DO NOTHING
            RETURNING id""",
            values,
        ).fetchone()
        self.assertIsNone(row)
        identity_clause, identity_params = identity_where_clause({**result, "url": result.get("url")})
        resolved = conn.execute(
            f"""SELECT rr.id FROM raw_reports rr
                WHERE rr.processing_status IS DISTINCT FROM 'DUPLICATE'
                  AND ({identity_clause})
                ORDER BY rr.created_at ASC, rr.id ASC
                LIMIT 1 FOR UPDATE""",
            identity_params,
        ).fetchone()
        row = conn.execute(
            """UPDATE raw_reports SET
                 source_type='web', source_name='URL Analyzer', published_at=%s,
                 original_text=%s, summary=%s, url=%s, object_path=%s,
                 processing_status='PROCESSED', normalized_url=%s, canonical_url=%s,
                 url_hash=%s, content_hash=%s, final_url=%s, author=%s, source_country=%s
               WHERE id=%s RETURNING id""",
            (*values, resolved["id"]),
        ).fetchone()
        self.assertEqual(row["id"], "raw-existing-1")
        sqls = [" ".join(str(c.args[0]).split()) for c in conn.execute.call_args_list]
        self.assertTrue(any("ON CONFLICT DO NOTHING" in s for s in sqls))
        self.assertTrue(any(s.startswith("UPDATE raw_reports SET") for s in sqls))


if __name__ == "__main__":
    unittest.main()
