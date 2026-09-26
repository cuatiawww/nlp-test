"""Registry paths that RunPod previously answered with HTTP 404."""
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import config
from app.registry_routes import router


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


class RegistryRouteTests(unittest.TestCase):
    def setUp(self):
        self.client = _client()
        self._symptoms = dict(config.SYMPTOM_DICT)
        self._diseases = dict(config.DISEASE_DICT)
        self._rules = dict(config.OUTBREAK_RULES)
        self._concepts = list(config.DISEASE_MASTER_CONCEPTS)
        self._models = dict(config.LANGUAGE_MODEL_MAP)
        self._extraction = {key: list(value) for key, value in config.EXTRACTION_RULES.items()}
        config.SYMPTOM_DICT = {"demam": "fever"}
        config.DISEASE_DICT = {"dbd": "Dengue"}
        config.OUTBREAK_RULES = {"DENGUE": 5}
        config.DISEASE_MASTER_CONCEPTS = [{
            "canonical_name": "Dengue",
            "disease_id": "dengue",
            "is_active": True,
            "aliases": [{"alias": "DBD", "language": "id"}],
        }]
        config.LANGUAGE_MODEL_MAP = {"id": "nllb"}
        config.EXTRACTION_RULES = {"cases": [r"\d+ kasus"]}
        config.LOCATION_COORDS["Samar"] = (11.78, 125.0)
        config.LOCATION_COUNTRIES["Samar"] = "Philippines"
        config.LOCATION_ISO3["Samar"] = "PHL"

    def tearDown(self):
        config.SYMPTOM_DICT = self._symptoms
        config.DISEASE_DICT = self._diseases
        config.OUTBREAK_RULES = self._rules
        config.DISEASE_MASTER_CONCEPTS = self._concepts
        config.LANGUAGE_MODEL_MAP = self._models
        config.EXTRACTION_RULES = self._extraction
        config.LOCATION_COORDS.pop("Samar", None)
        config.LOCATION_COUNTRIES.pop("Samar", None)
        config.LOCATION_ISO3.pop("Samar", None)

    def _get(self, path: str):
        with patch("app.registry_routes._query", side_effect=OSError("no database")):
            response = self.client.get(path)
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertTrue(body["success"])
        self.assertIsInstance(body["data"], list)
        return body["data"]

    def test_short_and_api_paths_return_registry_rows(self):
        pairs = [
            ("/nlp-keywords", "/api/v1/nlp-keywords", "keyword", "demam"),
            ("/disease-concepts?include=aliases", "/api/v1/disease-concepts?include=aliases", "canonical_name", "Dengue"),
            ("/outbreak-rules", "/api/v1/outbreak-rules", "disease_name", "DENGUE"),
            ("/extraction-rules", "/api/v1/extraction-rules", "field_name", "cases"),
            ("/language-markers", "/api/v1/language-markers", "word", "kasus"),
            ("/language-models", "/api/v1/language-models", "language", "id"),
            ("/source-credibility", "/api/v1/source-credibility", "source_type", "who"),
            ("/locations?include=aliases", "/api/v1/locations?include=aliases", "name", "Samar"),
        ]
        for short_path, api_path, field, expected in pairs:
            short_rows = self._get(short_path)
            api_rows = self._get(api_path)
            self.assertTrue(any(row.get(field) == expected for row in short_rows), short_path)
            self.assertTrue(any(row.get(field) == expected for row in api_rows), api_path)

    def test_translation_cache_round_trip(self):
        content_hash = "a" * 64
        with patch("app.registry_routes._query", side_effect=OSError("no database")):
            saved = self.client.put("/translation-cache", json={
                "content_hash": content_hash,
                "source_language": "id",
                "provider": "nllb",
                "translated_text": "dengue cases",
                "structured_result": {},
            })
            loaded = self.client.get(f"/api/v1/nlp/translation-cache/{content_hash}")
            listed = self.client.get("/translation-cache")
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(loaded.json()["data"]["translated_text"], "dengue cases")
        self.assertTrue(any(row["content_hash"] == content_hash for row in listed.json()["data"]))

    def test_location_upsert_survives_without_a_database(self):
        with patch("app.config._upsert_reviewed_location_db", side_effect=OSError("no database")):
            response = self.client.post("/api/v1/locations/upsert-reviewed", json={
                "name": "Basey",
                "country": "Philippines",
            })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["name"], "Basey")
        self.assertEqual(config.LOCATION_COUNTRIES["Basey"], "Philippines")
        config.LOCATION_COUNTRIES.pop("Basey", None)
        config.LOCATION_COORDS.pop("Basey", None)


if __name__ == "__main__":
    unittest.main()
