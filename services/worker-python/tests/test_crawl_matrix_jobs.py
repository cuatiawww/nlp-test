import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.crawl_matrix_jobs import (
    analyze_article,
    article_matches,
    build_news_query,
    disease_labels,
    extract_article,
    LeaseLost,
    persist_dashboard_event_from_analysis,
    pipeline_analysis_to_matrix,
    prepare_text_for_nlp,
    selected_concept,
)


class CrawlMatrixWorkerTests(unittest.TestCase):
    def test_news_query_uses_diseases_as_alternatives_and_does_not_require_asean_word(self):
        query = build_news_query(["Dengue", "Measles"], None, "ASEAN")
        self.assertIn("Dengue OR Measles", query)
        self.assertNotIn("ASEAN", query)

    def test_scalar_and_list_disease_outputs_have_the_same_shape(self):
        self.assertEqual(disease_labels({"disease_classification": "Dengue"}), ["Dengue"])
        self.assertEqual(disease_labels({"disease_classification": ["Dengue", "Measles"]}), ["Dengue", "Measles"])

    def test_filter_keeps_matching_disease_and_country(self):
        article = {"title": "Dengue in Jakarta", "content": "Health officials reported cases"}
        analysis = {
            "disease_classification": ["Dengue"],
            "locations": [{"country": "Indonesia"}],
        }
        self.assertTrue(article_matches(article, analysis, ["Dengue"], "Indonesia"))
        self.assertFalse(article_matches(article, analysis, ["Measles"], "Indonesia"))

    def test_campak_and_dbd_aliases_match_local_master_filters(self):
        self.assertTrue(article_matches(
            {"title": "Wabah di Jawa", "content": "petugas kesehatan"},
            {"disease_classification": ["campak"], "locations": [{"country": "Indonesia"}]},
            ["Measles"],
            "Indonesia",
        ))

        dengue_article = {"title": "Kasus DBD meningkat", "content": "demam berdarah di Selangor"}
        dengue_analysis = {"disease_classification": ["Dengue"], "locations": []}
        self.assertTrue(article_matches(
            {**dengue_article, "source_country": "Malaysia"},
            dengue_analysis,
            ["Dengue"],
            "Malaysia",
        ))

    def test_asia_publisher_label_does_not_drop_malaysia_source_country(self):
        article = {
            "title": "Malaysia dengue cases surge",
            "content": "Putrajaya reported dengue deaths",
            "source_country": "Malaysia",
        }
        analysis = {"disease_classification": ["Dengue"], "locations": [{"country": "Asia"}]}
        self.assertTrue(article_matches(article, analysis, ["Dengue"], "Malaysia"))

    def test_prepare_text_sends_title_with_content(self):
        text = prepare_text_for_nlp({"title": "Dengue surge", "content": "Officials reported cases."})
        self.assertIn("Dengue surge", text)
        self.assertIn("Officials reported cases.", text)

    def test_prepare_text_strips_unclosed_google_news_anchor(self):
        text = prepare_text_for_nlp({
            "title": "<a href=https://news.google.com/rss/articles/CBMi Three dead from HFMD",
            "content": "Vietnam recorded 860 cases.",
        })
        self.assertIn("Three dead from HFMD", text)
        self.assertNotIn("<a href", text)
        self.assertIn("860 cases", text)

    def test_article_workers_stay_bounded(self):
        from app import crawl_matrix_jobs as jobs
        self.assertGreaterEqual(jobs.ARTICLE_WORKERS, 1)
        self.assertLessEqual(jobs.ARTICLE_WORKERS, 6)
        self.assertEqual(jobs.CRAWL_QUEUE, "disease.crawl-matrix")
        self.assertNotEqual(jobs.CRAWL_QUEUE, "disease.analysis-url")
        self.assertNotEqual(jobs.CRAWL_QUEUE, "disease.raw")

    def test_amqp_and_poll_share_an_exclusive_job_lock(self):
        from app import crawl_matrix_jobs as jobs
        self.assertTrue(jobs._job_lock.acquire(blocking=False))
        jobs._job_lock.release()
        self.assertIs(jobs._run_claimed_exclusive(None), False)

    def test_amqp_wakeup_queues_claimed_job_without_running_nlp(self):
        import queue
        from app import crawl_matrix_jobs as jobs
        while not jobs._pending_jobs.empty():
            jobs._pending_jobs.get_nowait()
        jobs._wake.clear()
        claimed = ("11111111-1111-1111-1111-111111111111", {"url": "https://example.org"}, "22222222-2222-2222-2222-222222222222")
        jobs._pending_jobs.put(claimed)
        jobs._wake.set()
        self.assertTrue(jobs._wake.is_set())
        self.assertEqual(jobs._pending_jobs.get_nowait(), claimed)

    def test_replaced_matrix_lease_blocks_further_writes(self):
        from app import crawl_matrix_jobs as jobs

        class EmptyCursor:
            rowcount = 0

            def fetchone(self):
                return None

        class FakeConn:
            def execute(self, sql, params=None):
                self.sql = sql
                self.params = params
                return EmptyCursor()

        with self.assertRaises(LeaseLost):
            jobs._renew_job_lease(
                FakeConn(),
                "11111111-1111-1111-1111-111111111111",
                "22222222-2222-2222-2222-222222222222",
            )

    def test_matrix_row_identity_is_serialized_before_duplicate_check(self):
        from app import crawl_matrix_jobs as jobs

        calls = []

        class Cursor:
            def fetchone(self):
                return {"id": "existing"}

        class FakeConn:
            def execute(self, sql, params=None):
                calls.append((sql, params))
                return Cursor()

        self.assertTrue(
            jobs._matrix_row_exists(
                FakeConn(), "job", "raw", "Dengue", "Indonesia",
                "Jakarta", "2026-09-18", "week 38",
            )
        )
        self.assertIn("pg_advisory_xact_lock", calls[0][0])
        self.assertIn("IS NOT DISTINCT FROM", calls[1][0])

    def test_pipeline_analysis_to_matrix_keeps_primary_country(self):
        adapted = pipeline_analysis_to_matrix({
            "disease_classification": "Dengue",
            "country": "Malaysia",
            "location_name": "Selangor",
            "case_count": 19313,
            "death_count": 21,
            "case_count_unknown": False,
            "locations": [{"name": "Singapore", "country": "Singapore"}],
            "sub_events": [],
        })
        self.assertEqual(adapted["locations"][0]["country"], "Malaysia")
        self.assertEqual(adapted["locations"][0]["reported_cases"], 19313)

    def test_pipeline_analysis_to_matrix_preserves_disease_specific_sub_events(self):
        adapted = pipeline_analysis_to_matrix({
            "disease_classification": "Dengue",
            "country": "Indonesia",
            "location_name": "Jakarta",
            "case_count": 20,
            "sub_events": [
                {
                    "disease": "Dengue",
                    "country": "Indonesia",
                    "location_name": "Jakarta",
                    "case_count": 12,
                    "death_count": 1,
                    "evidence": "Jakarta reported 12 dengue cases and 1 death.",
                },
                {
                    "disease": "Measles",
                    "country": "Indonesia",
                    "location_name": "Jakarta",
                    "case_count": 8,
                    "death_count": 0,
                    "evidence": "Jakarta reported 8 measles cases.",
                },
            ],
        })
        disease_rows = [
            (item["disease"], item["reported_cases"])
            for item in adapted["locations"]
            if item.get("disease")
        ]
        self.assertIn(("Dengue", 12), disease_rows)
        self.assertIn(("Measles", 8), disease_rows)

    def test_matrix_keeps_the_same_sub_events_as_url_analysis(self):
        adapted = pipeline_analysis_to_matrix({
            "disease_classification": "Chikungunya",
            "country": "Philippines",
            "sub_events": [
                {
                    "disease": "Chikungunya",
                    "country": "Philippines",
                    "location_name": "Basey; ; Gandara",
                    "admin1": "Samar",
                    "case_count": 372,
                    "death_count": 0,
                    "latitude": 11.28,
                    "longitude": 125.07,
                },
                {
                    "disease": "Chikungunya",
                    "country": "Philippines",
                    "location_name": "Thailand",
                    "case_count": 1,
                    "death_count": 0,
                },
                {
                    "disease": "UNKNOWN",
                    "country": "Philippines",
                    "location_name": "Paranas",
                    "case_count": 0,
                    "death_count": 0,
                },
            ],
        })
        rows = [
            (item["country"], item["provinces"], item["reported_cases"])
            for item in adapted["locations"]
        ]
        self.assertEqual(rows, [
            ("Philippines", ["Samar", "Basey"], 372),
            ("Philippines", ["Thailand"], 1),
            ("Philippines", ["Paranas"], 0),
        ])
        self.assertNotIn(";", str(rows))
        self.assertEqual(adapted["locations"][0]["latitude"], 11.28)

    def test_event_place_does_not_inherit_parent_or_semicolons(self):
        from app.multi_event_persist import event_place_fields

        location, province, city = event_place_fields(
            {
                "country": "Philippines",
                "location_name": ";; Basey",
                "admin1": "Samar",
            },
            {"province": "Communicable Diseases Agency", "city": "Quezon City"},
        )
        self.assertEqual(location, "Basey")
        self.assertEqual(province, "Samar")
        self.assertEqual(city, "Basey")

    def test_analyze_article_passes_title_and_source_country(self):
        from unittest.mock import Mock, patch
        response = Mock()
        response.json.return_value = {"disease_classification": ["Dengue"]}
        response.raise_for_status.return_value = None
        with patch("app.crawl_matrix_jobs.requests.post", return_value=response) as post:
            analyze_article({
                "title": "Sharp dengue surge",
                "content": "Health officials reported dengue cases.",
                "source_name": "thestar.com.my",
                "source_country": "Malaysia",
                "url": "https://www.thestar.com.my/news/nation/dengue",
            })
        payload = post.call_args.kwargs["json"]
        self.assertIn("/nlp/analyze/raw", post.call_args.args[0])
        self.assertIn("Sharp dengue surge", payload["text"])
        self.assertEqual(payload["source_country"], "Malaysia")
        self.assertFalse(payload["rules_only"])
        self.assertFalse(payload["historical_fast"])

    def test_concept_resolution_keeps_full_label(self):
        label, concept = selected_concept(
            ["Dengue"],
            [{"disease_id": "DENGUE", "canonical_name": "Dengue", "source": "asean_master_database"}],
        )
        self.assertEqual(label, "Dengue")
        self.assertEqual(concept["disease_id"], "DENGUE")

    def test_concept_resolution_maps_campak_alias_to_measles(self):
        label, concept = selected_concept(
            ["campak"],
            [{"disease_id": "MEASLES", "canonical_name": "Measles", "source": "asean_master_database"}],
        )
        self.assertEqual(label, "campak")
        self.assertEqual(concept["disease_id"], "MEASLES")

    def test_extract_article_never_uses_stealth_or_auto(self):
        from unittest.mock import Mock, patch

        sparse = Mock()
        sparse.json.return_value = {"data": {"content": "short"}}
        sparse.raise_for_status.return_value = None
        sparse.status_code = 200
        richer = Mock()
        richer.json.return_value = {"data": {"content": "Health officials reported dengue cases across the province this week."}}
        richer.status_code = 200
        with patch("app.crawl_matrix_jobs.requests.post", side_effect=[sparse, richer]) as post:
            extract_article({"url": "https://example.org/news"})
        self.assertEqual(post.call_count, 2)
        for call in post.call_args_list:
            payload = call.kwargs["json"]
            self.assertEqual(payload["fetch_mode"], "http")
            self.assertEqual(payload["max_retries"], 1)
            self.assertGreaterEqual(payload["timeout_ms"], 25000)
            self.assertLessEqual(payload["timeout_ms"], 45000)
            self.assertLessEqual(call.kwargs["timeout"][1], 55)

    def test_dashboard_persist_uses_nlp_coords_and_marks_kpi_stale(self):
        statements = []

        class FakeCursor:
            def fetchone(self):
                return None

        class FakeConn:
            def execute(self, sql, params=None):
                statements.append((sql, params))
                return FakeCursor()

        analysis = {
            "is_health_related": True,
            "location_name": "Kampong Thom",
            "latitude": 12.7111,
            "longitude": 104.8886,
            "language": "en",
            "disease_classification": "Avian influenza",
            "case_count": 1,
            "death_count": 0,
            "confidence": 0.9,
            "needs_review": False,
        }
        article = {
            "title": "Cambodia H5N1",
            "content": "Kampong Thom confirms a case",
            "source_name": "CIDRAP",
            "source_type": "news",
        }
        self.assertTrue(
            persist_dashboard_event_from_analysis(FakeConn(), "raw-1", article, analysis)
        )
        insert_sql = next(sql for sql, _ in statements if "INSERT INTO disease_events" in sql)
        self.assertIn("ST_MakePoint", insert_sql)
        geo_params = next(params for sql, params in statements if params and 12.7111 in params)
        self.assertIn(12.7111, geo_params)
        self.assertIn(104.8886, geo_params)
        self.assertTrue(any("kpi_snapshots" in sql for sql, _ in statements))

    def test_dashboard_persist_does_not_invent_coordinates(self):
        statements = []

        class FakeCursor:
            def fetchone(self):
                return None

        class FakeConn:
            def execute(self, sql, params=None):
                statements.append((sql, params))
                return FakeCursor()

        analysis = {
            "is_health_related": True,
            "location_name": "Unknown Hamlet",
            "latitude": None,
            "longitude": None,
            "language": "en",
            "disease_classification": "Dengue",
            "needs_review": True,
        }
        persist_dashboard_event_from_analysis(
            FakeConn(), "raw-2", {"title": "Note", "content": "Dengue"}, analysis
        )
        params = next(item[1] for item in statements if item[1] and "Unknown Hamlet" in item[1])
        self.assertIn(None, params)


if __name__ == "__main__":
    unittest.main()
