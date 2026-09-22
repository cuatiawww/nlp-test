import unittest
from app.schemas import AnalyzeRequest
from app import pipeline, extractors


class TestSlice5Resilience(unittest.TestCase):
    def test_extractors_challenge_content(self):
        """Verify challenge markers detection in NLP extractors."""
        cf_text = "Just a moment... Enable JavaScript and cookies to continue. Cloudflare Ray ID: 878342abc"
        self.assertTrue(extractors.is_challenge_or_blocked_content(cf_text))

        fr_cf_text = "Un instant... Vérification en cours de votre navigateur. Cloudflare Ray ID: 12345"
        self.assertTrue(extractors.is_challenge_or_blocked_content(fr_cf_text))

        es_cf_text = "Un momento... Verificando su navegador. Cloudflare Ray ID: 998877"
        self.assertTrue(extractors.is_challenge_or_blocked_content(es_cf_text))

        forbidden_text = "403 Forbidden. Access Denied. You do not have permission to view this directory."
        self.assertTrue(extractors.is_challenge_or_blocked_content(forbidden_text))

        normal_text = "The Ministry of Health has confirmed 12 cases of Mpox in Bangkok, Thailand."
        self.assertFalse(extractors.is_challenge_or_blocked_content(normal_text))

    def test_pipeline_cloudflare_rejection(self):
        """PHL-01: Cloudflare challenge page must NOT be classified as disease or health-related."""
        cf_text = (
            "Just a moment... Checking your browser before accessing the site. "
            "Enable JavaScript and cookies to continue. Cloudflare Ray ID: 9021839128."
        )
        req = AnalyzeRequest(
            text=cf_text,
            title="Just a moment...",
            url="https://example.com/blocked-article",
            source_country="PH",
            interactive=True,
            rules_only=True,
        )
        res = pipeline.run(req)
        self.assertEqual(res.disease_classification, "NEGATIVE_NON_HEALTH")
        self.assertFalse(res.is_health_related)
        self.assertEqual(res.case_count, 0)
        self.assertEqual(res.death_count, 0)
        self.assertEqual(len(res.sub_events), 0)
        self.assertIn("challenge_page_detected", res.validation_flags)

    def test_collector_challenge_detection(self):
        """Collector web_scraper must detect HTTP 200 Cloudflare challenges."""
        try:
            import sys
            sys.path.insert(0, "/home/aspire_5/app/NLP-PENYAKIT/services/collector-python")
            from app.collectors.web_scraper import _is_challenge

            html_200_cf = "<html><head><title>Just a moment...</title></head><body><div id='cf-turnstile'>Verifying...</div></body></html>"
            self.assertTrue(_is_challenge(200, html_200_cf))

            html_200_fr = "<html><head><title>Un instant...</title></head><body>Vérification de votre navigateur</body></html>"
            self.assertTrue(_is_challenge(200, html_200_fr))

            html_403 = "<html><body><script src='https://challenges.cloudflare.com/turnstile/v0/api.js'></script></body></html>"
            self.assertTrue(_is_challenge(403, html_403))

            html_normal = "<html><head><title>Dengue Outbreak in Manila</title></head><body><p>Health officials report 50 new dengue cases in Manila this week.</p></body></html>"
            self.assertFalse(_is_challenge(200, html_normal))
        except ImportError:
            # When running in isolated NLP container without collector path
            pass

    def test_worker_clean_iso_date(self):
        """PHL-02: Date sanitization must prevent invalid dates from crashing DB queries."""
        try:
            import sys
            sys.path.insert(0, "/home/aspire_5/app/NLP-PENYAKIT/services/worker-python")
            from app.analysis_jobs import _clean_iso_date, _fetch_error_diagnostic

            self.assertEqual(_clean_iso_date("2026-03-15"), "2026-03-15")
            self.assertEqual(_clean_iso_date("2026-03-15T10:30:00Z"), "2026-03-15")
            self.assertEqual(_clean_iso_date(" 2026-09-21 "), "2026-09-21")
            self.assertIsNone(_clean_iso_date("2026"))
            self.assertIsNone(_clean_iso_date("Jan 2026"))
            self.assertIsNone(_clean_iso_date("unknown"))
            self.assertIsNone(_clean_iso_date(None))
            self.assertIsNone(_clean_iso_date(12345))

            code, _ = _fetch_error_diagnostic(Exception("Source returned a browser challenge: Cloudflare"))
            self.assertEqual(code, "source_challenge")

            code, _ = _fetch_error_diagnostic(Exception("403 Forbidden from target server"))
            self.assertEqual(code, "source_blocked")

            code, _ = _fetch_error_diagnostic(Exception("404 Not Found"))
            self.assertEqual(code, "source_not_found")

            code, _ = _fetch_error_diagnostic(Exception("source returned an empty or unextractable article shell"))
            self.assertEqual(code, "empty_article")
        except ImportError:
            pass


if __name__ == "__main__":
    unittest.main()
