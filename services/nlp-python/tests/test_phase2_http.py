"""Phase 2: translation cache, discovery writes, and operator shims use HTTP."""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import config
from app.operator_http import get_training_export, post_correction, post_review
from app.registry_client import RegistryApiError
from app.translator import _cached, _store


class TranslationCacheHttpTests(unittest.TestCase):
    def test_cache_hit_uses_api_when_stack_url_is_set(self):
        payload = {
            "success": True,
            "data": {
                "source_language": "id",
                "provider": "nllb-local",
                "translated_text": "five cases",
                "structured_result": {"source_language": "id"},
            },
        }
        with mock.patch.dict(os.environ, {"NLP_SERVICE_URL": "http://nlp-python:8000"}):
            with mock.patch("app.registry_client.request_json", return_value=payload) as request:
                row = _cached("a" * 64)
        request.assert_called_once_with("GET", "/api/v1/nlp/translation-cache/" + ("a" * 64))
        self.assertEqual(row["translated_text"], "five cases")
        self.assertEqual(row["structured_result"]["source_language"], "id")

    def test_cache_miss_does_not_open_the_database(self):
        with mock.patch.dict(os.environ, {"NLP_SERVICE_URL": "http://nlp-python:8000"}):
            with mock.patch("app.registry_client.request_json", return_value={"success": True, "data": None}):
                self.assertIsNone(_cached("b" * 64))

    def test_store_puts_the_cache_row(self):
        with mock.patch.dict(os.environ, {"NLP_SERVICE_URL": "http://nlp-python:8000"}):
            with mock.patch("app.registry_client.request_json") as request:
                _store("c" * 64, "id", "nllb-local", "five cases", {"source_language": "id"})
        method, path, body = request.call_args.args
        self.assertEqual(method, "PUT")
        self.assertEqual(path, "/api/v1/nlp/translation-cache")
        self.assertEqual(body["content_hash"], "c" * 64)
        self.assertEqual(body["translated_text"], "five cases")


class DiscoveryHttpTests(unittest.TestCase):
    def test_concept_upsert_posts_and_reloads(self):
        with mock.patch.dict(os.environ, {"NLP_SERVICE_URL": "http://nlp-python:8000"}):
            with mock.patch("app.registry_client.request_json", return_value={"success": True, "data": {"id": "1"}}) as request:
                with mock.patch("app.config._reload_discovery_caches") as reload_caches:
                    ok = config.upsert_discovered_disease_concept(
                        "Nipah",
                        "Nipah virus infection",
                        "1D64",
                        "http://id.who.int/icd/entity/1D64",
                        aliases=[{"surface_form": "virus nipah", "language": "id", "confidence": 0.9}],
                    )
        self.assertTrue(ok)
        reload_caches.assert_called_once()
        body = request.call_args.args[2]
        self.assertEqual(request.call_args.args[1], "/api/v1/disease-concepts/upsert")
        self.assertEqual(body["ontology_code"], "1D64")
        self.assertEqual(body["aliases"][0]["surface_form"], "virus nipah")

    def test_concept_name_conflict_does_not_fall_back(self):
        with mock.patch.dict(os.environ, {"NLP_SERVICE_URL": "http://nlp-python:8000"}):
            with mock.patch(
                "app.registry_client.request_json",
                side_effect=RegistryApiError("conflict", status=409),
            ):
                with mock.patch("app.config._upsert_discovered_disease_concept_db") as db_write:
                    ok = config.upsert_discovered_disease_concept("Nipah", "Nipah", "1D64", "uri")
        self.assertFalse(ok)
        db_write.assert_not_called()

    def test_candidate_posts_when_stack_url_is_set(self):
        with mock.patch.dict(os.environ, {"NLP_SERVICE_URL": "http://nlp-python:8000"}):
            with mock.patch("app.registry_client.request_json", return_value={"success": True, "data": {}}) as request:
                ok = config.upsert_disease_discovery_candidate("Virus Nipah", "sample", "id", "rules", 0.4)
        self.assertTrue(ok)
        self.assertEqual(request.call_args.args[1], "/api/v1/disease-discovery-candidates")
        self.assertEqual(request.call_args.args[2]["surface_form"], "Virus Nipah")

    def test_blank_candidate_is_rejected_without_http(self):
        with mock.patch("app.registry_client.request_json") as request:
            self.assertFalse(config.upsert_disease_discovery_candidate("   "))
        request.assert_not_called()


class OperatorHttpTests(unittest.TestCase):
    def test_correction_shim_returns_backend_id(self):
        with mock.patch.dict(os.environ, {"NLP_SERVICE_URL": "http://nlp-python:8000"}):
            with mock.patch(
                "app.operator_http.request_json",
                return_value={"success": True, "data": {"correction_id": "corr-1"}},
            ) as request:
                result = post_correction({"field_name": "disease", "corrected_value": "Dengue"})
        self.assertEqual(result["correction_id"], "corr-1")
        self.assertEqual(request.call_args.args[1], "/api/v1/nlp-corrections")

    def test_review_shim_returns_backend_flags(self):
        with mock.patch.dict(os.environ, {"NLP_SERVICE_URL": "http://nlp-python:8000"}):
            with mock.patch(
                "app.operator_http.request_json",
                return_value={"success": True, "data": {"reviewed": True, "needs_review": False}},
            ) as request:
                result = post_review({"raw_report_id": "11111111-1111-1111-1111-111111111111", "reviewed": True})
        self.assertEqual(request.call_args.args[1], "/api/v1/nlp/reviews")
        self.assertTrue(result["reviewed"])
        self.assertFalse(result["needs_review"])

    def test_export_shim_returns_backend_dataset(self):
        dataset = {"total_examples": 1, "human_corrected_count": 1, "data": [{"id": "ex-1"}]}
        with mock.patch.dict(os.environ, {"NLP_SERVICE_URL": "http://nlp-python:8000"}):
            with mock.patch(
                "app.operator_http.request_json",
                return_value={"success": True, "data": dataset},
            ) as request:
                result = get_training_export(25)
        self.assertEqual(result["total_examples"], 1)
        self.assertIn("limit=25", request.call_args.args[1])

    def test_operator_http_disabled_returns_none(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("NLP_SERVICE_URL", None)
            with mock.patch("app.operator_http.request_json") as request:
                self.assertIsNone(post_correction({"field_name": "disease", "corrected_value": "Dengue"}))
                self.assertIsNone(post_review({"reviewed": True}))
                self.assertIsNone(get_training_export(10))
        request.assert_not_called()


if __name__ == "__main__":
    unittest.main()
