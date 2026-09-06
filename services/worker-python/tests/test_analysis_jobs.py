import sys
import unittest
from pathlib import Path
from unittest.mock import Mock
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.analysis_jobs import analyze_stages, validate_url

class AnalysisJobTests(unittest.TestCase):
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
        self.assertFalse(nlp.call_args.kwargs["fallback"])

    def test_nlp_timeout_keeps_article_and_tries_rules(self):
        nlp = Mock(side_effect=[TimeoutError(), {"disease_classification": "DENGUE", "case_count": 10}])
        result = analyze_stages("https://example.org", Mock(return_value={"content": "10 dengue cases"}), nlp)
        self.assertEqual(result["status"], "partial")
        self.assertTrue(nlp.call_args.kwargs["fallback"])
        self.assertTrue(result["result"]["needs_review"])

    def test_both_nlp_attempts_fail_does_not_fabricate_non_health(self):
        result = analyze_stages("https://example.org", Mock(return_value={"content": "Report"}), Mock(side_effect=TimeoutError()))
        self.assertEqual(result["status"], "partial")
        self.assertIsNone(result["result"].get("is_health_related"))
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
