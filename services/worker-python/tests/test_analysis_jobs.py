import sys
import os
import json
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.analysis_jobs import analyze_article, analyze_stages, fetch_article, validate_url

class AnalysisJobTests(unittest.TestCase):
    def test_analysis_delivery_acks_only_after_durable_processing(self):
        from app import analysis_jobs

        channel = Mock()
        method = Mock(delivery_tag=7)
        with patch.object(analysis_jobs, "process_job", return_value=True):
            analysis_jobs._handle_analysis_message(
                channel, method, None,
                json.dumps({"job_id": "00000000-0000-0000-0000-000000000001"}),
            )
        channel.basic_ack.assert_called_once_with(delivery_tag=7)
        channel.basic_nack.assert_not_called()

    def test_analysis_delivery_requeues_when_durable_processing_fails(self):
        from app import analysis_jobs

        channel = Mock()
        channel.basic_publish.return_value = True
        method = Mock(delivery_tag=8)
        with patch.object(analysis_jobs, "process_job", side_effect=RuntimeError("database down")):
            analysis_jobs._handle_analysis_message(
                channel, method, None,
                json.dumps({"job_id": "00000000-0000-0000-0000-000000000001"}),
            )
        channel.basic_ack.assert_called_once_with(delivery_tag=8)
        channel.basic_nack.assert_not_called()
        self.assertEqual(channel.basic_publish.call_args.kwargs["routing_key"], "disease.analysis-url.retry")

    def test_unknown_analysis_job_is_sent_to_dlq(self):
        from app import analysis_jobs

        channel = Mock()
        channel.basic_publish.return_value = True
        method = Mock(delivery_tag=11)
        with patch.object(
            analysis_jobs,
            "process_job",
            side_effect=analysis_jobs.UnknownAnalysisJob("missing"),
        ):
            analysis_jobs._handle_analysis_message(
                channel, method, None,
                json.dumps({"job_id": "00000000-0000-0000-0000-000000000001"}),
            )

        self.assertEqual(
            channel.basic_publish.call_args.kwargs["routing_key"],
            "disease.analysis-url.dlq",
        )
        channel.basic_reject.assert_called_once_with(delivery_tag=11, requeue=False)

    def test_rejects_non_http_urls(self):
        for url in ("file:///etc/passwd", "javascript:alert(1)", ""):
            with self.assertRaises(ValueError):
                validate_url(url)

    def test_success_preserves_extracted_content_and_results(self):
        fetch = Mock(return_value={"title": "Report", "content": "10 dengue cases", "published_at": "2026-09-01"})
        nlp = Mock(return_value={"disease_classification": "DENGUE", "case_count": 10})
        result = analyze_stages("https://example.org/news", fetch, nlp)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["result"]["case_count"], 10)
        self.assertEqual(result["result"]["content"], "10 dengue cases")
        self.assertFalse(result["cached"])
        self.assertFalse(result["result"]["cached"])
        self.assertEqual(nlp.call_args.args[0]["source_url"], "https://example.org/news")

    def test_translation_timeout_does_not_demote_source_extraction(self):
        nlp = Mock(return_value={
            "disease_classification": "DENGUE",
            "case_count": 10,
            "translation_status": "timeout",
            "stage_warnings": ["Translation unavailable within 20s; original text used"],
        })
        result = analyze_stages(
            "https://example.org/news",
            Mock(return_value={"content": "10 dengue cases"}),
            nlp,
        )
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["result"]["translation_status"], "timeout")
        self.assertEqual(result["result"]["case_count"], 10)
        self.assertTrue(result["result"]["needs_review"])

    def test_nlp_timeout_retries_only_full_nlp(self):
        nlp = Mock(side_effect=[TimeoutError(), {"disease_classification": "DENGUE", "case_count": 10}])
        result = analyze_stages(
            "https://example.org",
            Mock(return_value={"content": "10 dengue cases"}),
            nlp,
            nlp_retries=1,
        )
        self.assertEqual(result["status"], "completed")
        self.assertEqual(nlp.call_count, 2)
        self.assertTrue(all(not call.kwargs for call in nlp.call_args_list))
        self.assertEqual(result["result"]["case_count"], 10)

    def test_nlp_timeout_keeps_article_without_degraded_retry(self):
        nlp = Mock(side_effect=TimeoutError())
        result = analyze_stages(
            "https://example.org",
            Mock(return_value={"content": "10 dengue cases"}),
            nlp,
            nlp_retries=0,
        )
        self.assertEqual(result["status"], "failed")
        self.assertEqual(nlp.call_count, 1)
        self.assertTrue(result["result"]["needs_review"])

    def test_nlp_failure_warning_keeps_a_safe_diagnostic(self):
        nlp = Mock(side_effect=RuntimeError("NLP HTTP 503: busy"))
        result = analyze_stages(
            "https://example.org",
            Mock(return_value={"content": "Report"}),
            nlp,
            nlp_retries=0,
        )
        self.assertEqual(result["status"], "failed")
        self.assertIn("NLP HTTP 503: busy", result["warnings"][0])
        self.assertEqual(result["result"]["content"], "Report")

    def test_both_nlp_attempts_fail_does_not_fabricate_non_health(self):
        result = analyze_stages(
            "https://example.org",
            Mock(return_value={"content": "Report"}),
            Mock(side_effect=TimeoutError()),
            nlp_retries=0,
        )
        self.assertEqual(result["status"], "failed")
        self.assertTrue(result["result"]["needs_review"])
        self.assertNotIn("case_count", result["result"])
        self.assertEqual(result["result"]["content"], "Report")

    def test_fetch_failure_is_failed_and_does_not_invoke_nlp(self):
        nlp = Mock()
        result = analyze_stages("https://example.org", Mock(side_effect=TimeoutError()), nlp)
        self.assertEqual(result["status"], "failed")
        nlp.assert_not_called()

    def test_fetch_failure_retries_once_without_stealth(self):
        fetch = Mock(side_effect=[TimeoutError(), {"content": "Report"}])
        result = analyze_stages("https://example.org", fetch, Mock(return_value={"case_count": 0}))
        self.assertEqual(fetch.call_count, 2)
        self.assertTrue(fetch.call_args.kwargs["fallback"])
        self.assertEqual(result["status"], "partial")

    def test_fetch_failure_exposes_typed_source_diagnostic(self):
        from app.analysis_jobs import ArticleFetchError

        fetch = Mock(side_effect=[
            ArticleFetchError("source_challenge", "browser challenge", 403),
            ArticleFetchError("source_challenge", "browser challenge", 403),
        ])
        result = analyze_stages("https://example.org", fetch, Mock())
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["error_code"], "source_challenge")
        self.assertEqual(result["fetch_stage"], "article_fetch")

    def test_content_cache_skips_nlp_after_fetch(self):
        fetch = Mock(return_value={"content": "Stored outbreak report", "content_hash": "abc"})
        nlp = Mock()
        cached = {"disease_classification": "Dengue", "case_count": 12, "content": "Stored outbreak report"}
        before_nlp = Mock(return_value=cached)
        result = analyze_stages(
            "https://example.org/report", fetch, nlp, before_nlp=before_nlp
        )
        self.assertEqual(result["status"], "completed")
        self.assertTrue(result["cached"])
        self.assertEqual(result["result"]["case_count"], 12)
        nlp.assert_not_called()

    def test_fetch_article_retries_once_on_408(self):
        timeout = Mock()
        timeout.status_code = 408
        timeout.text = "URL extraction timed out"
        ok = Mock()
        ok.status_code = 200
        ok.json.return_value = {"data": {"content": "hello"}}
        ok.raise_for_status.return_value = None
        with patch("requests.post", side_effect=[timeout, ok]) as post:
            payload = fetch_article("https://example.org/news")
        self.assertEqual(payload["content"], "hello")
        self.assertEqual(post.call_count, 2)

    def test_fetch_article_uses_auto_mode(self):
        response = Mock()
        response.json.return_value = {"data": {"content": "hello"}}
        response.raise_for_status.return_value = None
        with patch("requests.post", return_value=response) as post:
            payload = fetch_article("https://example.org/news", fallback=False)
        self.assertEqual(payload["content"], "hello")
        sent = post.call_args.kwargs["json"]
        self.assertEqual(sent["fetch_mode"], "auto")
        self.assertFalse(sent.get("skip_stealth", True))
        self.assertEqual(sent["max_retries"], 1)
        self.assertGreaterEqual(sent["timeout_ms"], 25000)
        self.assertLessEqual(sent["timeout_ms"], 45000)
        connect_timeout, read_timeout = post.call_args.kwargs["timeout"]
        self.assertEqual(connect_timeout, 5)
        self.assertGreaterEqual(read_timeout, 35)
        self.assertLessEqual(read_timeout, 60)

    def test_fetch_article_classifies_empty_article_response(self):
        response = Mock()
        response.status_code = 422
        response.json.return_value = {"detail": "The page has no article text"}
        response.text = "no article text"
        with patch("requests.post", return_value=response):
            with self.assertRaises(Exception) as ctx:
                fetch_article("https://example.org/news")
        self.assertEqual(ctx.exception.code, "empty_article")

    def test_analyze_article_uses_full_raw_pipeline(self):
        response = Mock()
        response.ok = True
        response.json.return_value = {"disease_classification": "Dengue", "case_count": 10}
        with patch("requests.post", return_value=response) as post:
            analyze_article(
                {
                    "title": "DBD",
                    "content": "10 kasus demam berdarah",
                    "source_country": "Indonesia",
                    "url": "https://example.org/news",
                }
            )
        sent = post.call_args.kwargs["json"]
        self.assertFalse(sent["rules_only"])
        self.assertEqual(sent["source_url"], "https://example.org/news")
        self.assertIn("/nlp/analyze/raw", post.call_args.args[0])

    def test_url_worker_spawns_manual_crawler_in_the_existing_service(self):
        from app.analysis_jobs import spawn_matrix_worker_enabled, analysis_prefetch, QUEUE
        with patch.dict("os.environ", {"ANALYSIS_WORKER_SPAWN_MATRIX": ""}, clear=False):
            os.environ.pop("ANALYSIS_WORKER_SPAWN_MATRIX", None)
            self.assertTrue(spawn_matrix_worker_enabled())
        self.assertEqual(analysis_prefetch(), 1)
        self.assertEqual(QUEUE, "disease.analysis-url")
        self.assertNotEqual(QUEUE, "disease.raw")
        self.assertNotEqual(QUEUE, "disease.crawl-matrix")

    def test_nlp_retry_policy_does_not_retry_budget_timeout(self):
        from app.analysis_jobs import is_retryable_nlp_error
        self.assertFalse(is_retryable_nlp_error(RuntimeError("NLP HTTP 408: exceeded budget (180s)")))
        self.assertTrue(is_retryable_nlp_error(RuntimeError("NLP HTTP 503: busy")))
        self.assertFalse(is_retryable_nlp_error(RuntimeError("NLP HTTP 400: bad url")))

    def test_nlp_budget_failure_is_not_retried(self):
        nlp = Mock(side_effect=RuntimeError("NLP HTTP 408: exceeded budget (30s)"))
        result = analyze_stages(
            "https://example.org",
            Mock(return_value={"content": "Report"}),
            nlp,
            nlp_retries=1,
        )
        self.assertEqual(result["status"], "failed")
        self.assertEqual(nlp.call_count, 1)

    def test_legacy_env_timeout_is_clamped_up_in_code(self):
        from app.analysis_jobs import _seconds_at_least
        with patch.dict("os.environ", {"NLP_REQUEST_TIMEOUT_SECONDS": "180"}):
            self.assertEqual(_seconds_at_least("NLP_REQUEST_TIMEOUT_SECONDS", 270), 270)
        with patch.dict("os.environ", {"NLP_REQUEST_TIMEOUT_SECONDS": "400"}):
            self.assertEqual(_seconds_at_least("NLP_REQUEST_TIMEOUT_SECONDS", 270), 400)


if __name__ == "__main__":
    unittest.main()
