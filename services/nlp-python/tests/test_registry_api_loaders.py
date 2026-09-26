"""Phase 1 registry loaders read app HTTP snapshots, not Postgres."""

import inspect
import json
import os
import unittest
import urllib.error
from unittest import mock

from app import config
from app import extractors
from app import registry_client


def _response(payload):
    raw = json.dumps(payload).encode("utf-8")

    class _Body:
        def read(self):
            return raw

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    return _Body()


class RegistryClientTests(unittest.TestCase):
    def test_base_url_prefers_explicit_override(self):
        with mock.patch.dict(
            os.environ,
            {
                "APP_API_BASE_URL": "http://app.example/root/",
                "BACKEND_LABELS_URL": "http://labels.example",
                "API_INTERNAL_URL": "http://internal.example",
            },
            clear=False,
        ):
            self.assertEqual(registry_client.app_api_base_url(), "http://app.example/root")

    def test_base_url_falls_back_to_existing_backend_envs(self):
        env = {
            "APP_API_BASE_URL": "",
            "BACKEND_LABELS_URL": "",
            "API_INTERNAL_URL": "http://disease-backend-rust:8081/",
        }
        with mock.patch.dict(os.environ, env, clear=False):
            self.assertEqual(
                registry_client.app_api_base_url(),
                "http://disease-backend-rust:8081",
            )
        env["BACKEND_LABELS_URL"] = "http://backend-rust:8080"
        with mock.patch.dict(os.environ, env, clear=False):
            self.assertEqual(registry_client.app_api_base_url(), "http://backend-rust:8080")

    def test_fetch_unwraps_api_response_and_drops_non_objects(self):
        payload = {"success": True, "data": [{"word": "kasus"}, "skip", {"word": "wabah"}]}
        with mock.patch("app.registry_client.urllib.request.urlopen", return_value=_response(payload)):
            rows = registry_client.fetch_collection("/api/v1/language-markers")
        self.assertEqual(rows, [{"word": "kasus"}, {"word": "wabah"}])

    def test_fetch_raises_on_failed_payload(self):
        payload = {"success": False, "error": "db down"}
        with mock.patch("app.registry_client.urllib.request.urlopen", return_value=_response(payload)):
            with self.assertRaises(RuntimeError):
                registry_client.fetch_collection("/api/v1/nlp-keywords")

    def test_fetch_raises_on_http_error(self):
        error = urllib.error.HTTPError(
            url="http://backend/api",
            code=500,
            msg="err",
            hdrs=None,
            fp=mock.Mock(read=lambda: b"boom"),
        )
        with mock.patch("app.registry_client.urllib.request.urlopen", side_effect=error):
            with self.assertRaises(RuntimeError):
                registry_client.fetch_collection("/api/v1/locations")


class RegistryLoaderTests(unittest.TestCase):
    def setUp(self):
        self.saved = {
            "SYMPTOM_DICT": dict(config.SYMPTOM_DICT),
            "DISEASE_DICT": dict(config.DISEASE_DICT),
            "DISEASE_MASTER_CONCEPTS": list(config.DISEASE_MASTER_CONCEPTS),
            "OUTBREAK_RULES": dict(config.OUTBREAK_RULES),
            "SOURCE_CREDIBILITY_MAP": dict(config.SOURCE_CREDIBILITY_MAP),
            "LANGUAGE_MARKERS": {k: list(v) for k, v in config.LANGUAGE_MARKERS.items()},
            "LEXICON_TERMS": {
                marker: {lang: list(words) for lang, words in by_lang.items()}
                for marker, by_lang in config.LEXICON_TERMS.items()
            },
            "LEXICON_VALUES": {
                marker: dict(values) for marker, values in config.LEXICON_VALUES.items()
            },
            "TEMPORAL_MONTH_MAP": dict(config.TEMPORAL_MONTH_MAP),
            "LEXICON_READY": config.LEXICON_READY,
            "LEXICON_LOAD_ATTEMPTED": config.LEXICON_LOAD_ATTEMPTED,
            "EXTRACTION_RULES": {k: list(v) for k, v in config.EXTRACTION_RULES.items()},
            "LANGUAGE_MODEL_MAP": dict(config.LANGUAGE_MODEL_MAP),
            "LOCATION_COORDS": dict(config.LOCATION_COORDS),
            "LOCATION_COUNTRIES": dict(config.LOCATION_COUNTRIES),
            "LOCATION_ADMIN1": dict(config.LOCATION_ADMIN1),
            "LOCATION_ADMIN2": dict(config.LOCATION_ADMIN2),
            "LOCATION_ISO3": dict(config.LOCATION_ISO3),
            "LOCATION_ADMIN_LEVEL": dict(config.LOCATION_ADMIN_LEVEL),
            "LOCATION_ALIASES": dict(config.LOCATION_ALIASES),
            "LOCATION_LOAD_ATTEMPTED": config.LOCATION_LOAD_ATTEMPTED,
            "KEYWORDS_LOAD_ATTEMPTED": config.KEYWORDS_LOAD_ATTEMPTED,
            "DISEASE_ALIASES": dict(extractors.DISEASE_ALIASES),
            "COUNTRY_ALIASES": dict(extractors.COUNTRY_ALIASES),
        }

    def tearDown(self):
        config.SYMPTOM_DICT = self.saved["SYMPTOM_DICT"]
        config.DISEASE_DICT = self.saved["DISEASE_DICT"]
        config.DISEASE_MASTER_CONCEPTS = self.saved["DISEASE_MASTER_CONCEPTS"]
        config.OUTBREAK_RULES = self.saved["OUTBREAK_RULES"]
        config.SOURCE_CREDIBILITY_MAP = self.saved["SOURCE_CREDIBILITY_MAP"]
        config.LANGUAGE_MARKERS = self.saved["LANGUAGE_MARKERS"]
        config.LEXICON_TERMS = self.saved["LEXICON_TERMS"]
        config.LEXICON_VALUES = self.saved["LEXICON_VALUES"]
        config.TEMPORAL_MONTH_MAP = self.saved["TEMPORAL_MONTH_MAP"]
        config.LEXICON_READY = self.saved["LEXICON_READY"]
        config.LEXICON_LOAD_ATTEMPTED = self.saved["LEXICON_LOAD_ATTEMPTED"]
        config.EXTRACTION_RULES = self.saved["EXTRACTION_RULES"]
        config.LANGUAGE_MODEL_MAP = self.saved["LANGUAGE_MODEL_MAP"]
        config.LOCATION_COORDS = self.saved["LOCATION_COORDS"]
        config.LOCATION_COUNTRIES = self.saved["LOCATION_COUNTRIES"]
        config.LOCATION_ADMIN1 = self.saved["LOCATION_ADMIN1"]
        config.LOCATION_ADMIN2 = self.saved["LOCATION_ADMIN2"]
        config.LOCATION_ISO3 = self.saved["LOCATION_ISO3"]
        config.LOCATION_ADMIN_LEVEL = self.saved["LOCATION_ADMIN_LEVEL"]
        config.LOCATION_ALIASES = self.saved["LOCATION_ALIASES"]
        config.LOCATION_LOAD_ATTEMPTED = self.saved["LOCATION_LOAD_ATTEMPTED"]
        config.KEYWORDS_LOAD_ATTEMPTED = self.saved["KEYWORDS_LOAD_ATTEMPTED"]
        extractors.DISEASE_ALIASES = self.saved["DISEASE_ALIASES"]
        extractors.COUNTRY_ALIASES = self.saved["COUNTRY_ALIASES"]

    def test_phase1_loaders_do_not_open_postgres(self):
        loaders = (
            config.load_keywords_from_db,
            config.load_disease_master_from_db,
            config.load_outbreak_rules_from_db,
            config.load_locations_from_db,
            config.load_credibility_from_db,
            config.load_language_markers_from_db,
            config.load_extraction_rules_from_db,
            config.load_language_models_from_db,
        )
        for loader in loaders:
            self.assertNotIn("psycopg", inspect.getsource(loader), loader.__name__)

    def test_keywords_snapshot_keeps_priority_order_and_refetches(self):
        calls = []

        def fake(path):
            calls.append(path)
            return [
                {"category": "other", "keyword": "skip", "target_label": "X", "is_active": True},
                {"category": "disease", "keyword": "dbd", "target_label": "Old", "is_active": True},
                {"category": "disease", "keyword": "dbd", "target_label": "Dengue", "is_active": False},
                {"category": "symptom", "keyword": "demam", "target_label": "fever", "is_active": True},
                {"category": "disease", "keyword": "dbd", "target_label": "Dengue fever", "is_active": True},
            ]

        with mock.patch("app.registry_client.fetch_collection", side_effect=fake):
            config.load_keywords_from_db()
            config.load_keywords_from_db()

        self.assertEqual(calls, [
            "/api/v1/nlp-keywords?is_active=true&snapshot=true",
            "/api/v1/nlp-keywords?is_active=true&snapshot=true",
        ])
        self.assertEqual(config.DISEASE_DICT["dbd"], "Dengue fever")
        self.assertEqual(config.SYMPTOM_DICT["demam"], "fever")
        self.assertNotIn("skip", config.DISEASE_DICT)
        self.assertTrue(config.KEYWORDS_LOAD_ATTEMPTED)

    def test_keyword_failure_clears_dicts(self):
        config.DISEASE_DICT = {"keep": "no"}
        with mock.patch("app.registry_client.fetch_collection", side_effect=OSError("down")):
            config.load_keywords_from_db()
        self.assertEqual(config.DISEASE_DICT, {})
        self.assertEqual(config.SYMPTOM_DICT, {})

    def test_disease_master_applies_aliases_and_keeps_previous_on_failure(self):
        rows = [{
            "disease_id": "DENGUE",
            "canonical_name": "Dengue",
            "english_name": "Dengue fever",
            "ontology_system": "WHO-ICD-11",
            "source": "asean_master_database",
            "is_active": True,
            "aliases": [{"alias": "demam berdarah", "language": "id"}],
        }]
        with mock.patch("app.registry_client.fetch_collection", return_value=rows) as fetch:
            config.load_disease_master_from_db()
        fetch.assert_called_once_with(
            "/api/v1/disease-concepts?is_active=true&snapshot=true&include=aliases"
        )
        self.assertEqual(config.DISEASE_MASTER_CONCEPTS[0]["disease_id"], "DENGUE")
        self.assertEqual(extractors.DISEASE_ALIASES["demam berdarah"], "Dengue")

        with mock.patch("app.registry_client.fetch_collection", side_effect=OSError("down")):
            config.load_disease_master_from_db()
        self.assertEqual(config.DISEASE_MASTER_CONCEPTS, [])
        self.assertTrue(config.DISEASE_MASTER_LOAD_ATTEMPTED)

    def test_outbreak_credibility_and_models(self):
        config.OUTBREAK_RULES = {"KEEP": 9}

        def fake(path):
            if path.startswith("/api/v1/outbreak-rules"):
                return [
                    {"disease_name": "Dengue", "min_case_count": 5, "is_active": True},
                    {"disease_name": "Hidden", "min_case_count": 1, "is_active": False},
                ]
            if path == "/api/v1/source-credibility":
                return [
                    {"source_type": "who", "score": 0.98, "is_active": True},
                    {"source_type": "blog", "score": 0.1, "is_active": False},
                ]
            if path == "/api/v1/language-models":
                return [
                    {"language": "id", "model_key": "local-id", "is_active": True},
                    {"language": "en", "model_key": "off", "is_active": False},
                ]
            raise AssertionError(path)

        with mock.patch("app.registry_client.fetch_collection", side_effect=fake):
            config.load_outbreak_rules_from_db()
            config.load_credibility_from_db()
            config.load_language_models_from_db()
        self.assertEqual(config.OUTBREAK_RULES, {"DENGUE": 5})
        self.assertEqual(config.SOURCE_CREDIBILITY_MAP, {"who": 0.98})
        self.assertEqual(config.LANGUAGE_MODEL_MAP, {"id": "local-id"})

        with mock.patch("app.registry_client.fetch_collection", side_effect=OSError("down")):
            config.load_outbreak_rules_from_db()
        self.assertEqual(config.OUTBREAK_RULES, {"DENGUE": 5})

    def test_language_markers_and_extraction_rules(self):
        def fake(path):
            if path == "/api/v1/language-markers":
                return [
                    {"word": "agustus", "language": "id", "marker_type": "temporal_month", "canonical_value": "8", "priority": 2, "is_active": True},
                    {"word": "inactive", "language": "id", "marker_type": "language_marker", "priority": 0, "is_active": False},
                    {"word": "seribu", "language": "id", "marker_type": "number_word", "canonical_value": "1000", "priority": 1, "is_active": True},
                    {"word": "kasus", "language": "id", "marker_type": "language_marker", "priority": 1, "is_active": True},
                ]
            if path == "/api/v1/extraction-rules":
                return [
                    {"field_name": "cases", "regex_pattern": "(", "priority": 1, "is_active": True},
                    {"field_name": "cases", "regex_pattern": r"(\d+)", "priority": 2, "is_active": True},
                    {"field_name": "deaths", "regex_pattern": r"(\d+)", "priority": 1, "is_active": False},
                ]
            raise AssertionError(path)

        with mock.patch("app.registry_client.fetch_collection", side_effect=fake):
            config.load_language_markers_from_db()
            config.load_extraction_rules_from_db()

        self.assertEqual(config.TEMPORAL_MONTH_MAP["agustus"], 8)
        self.assertEqual(config.LEXICON_VALUES["number_word"]["seribu"], 1000)
        self.assertIn("kasus", config.LANGUAGE_MARKERS["id"])
        self.assertNotIn("inactive", config.LANGUAGE_MARKERS["id"])
        self.assertTrue(config.LEXICON_READY)
        self.assertEqual(config.EXTRACTION_RULES, {"cases": [r"(\d+)"]})

        with mock.patch("app.registry_client.fetch_collection", side_effect=OSError("down")):
            config.load_language_markers_from_db()
        self.assertFalse(config.LEXICON_READY)
        self.assertEqual(config.TEMPORAL_MONTH_MAP, {})
        self.assertIn("kasus", config.LANGUAGE_MARKERS["id"])

    def test_location_snapshot_flattens_aliases(self):
        rows = [
            {
                "name": "harian",
                "latitude": 0,
                "longitude": 0,
                "country": "Indonesia",
                "is_active": True,
                "aliases": [],
            },
            {
                "name": "Phase1 Harbor",
                "latitude": 1.25,
                "longitude": 103.5,
                "country": "Singapore",
                "country_iso3": "SGP",
                "admin1_name": "Central",
                "admin2_name": None,
                "admin_level": 3,
                "is_active": True,
                "aliases": [{
                    "alias_name": "Pelabuhan Phase1",
                    "canonical_name": "Phase1 Harbor",
                    "country": "Singapore",
                    "admin_level": 3,
                }],
            },
            {
                "name": "Indonesia",
                "latitude": -2.5,
                "longitude": 118.0,
                "country": "Indonesia",
                "country_iso3": "IDN",
                "admin_level": 0,
                "is_active": True,
                "aliases": [{
                    "alias_name": "RI",
                    "canonical_name": "Indonesia",
                    "country": "Indonesia",
                    "admin_level": 0,
                }],
            },
            {
                "name": "Inactive Town",
                "latitude": 9,
                "longitude": 9,
                "country": "Laos",
                "is_active": False,
                "aliases": [{"alias_name": "Ghost", "canonical_name": "Inactive Town"}],
            },
        ]
        with mock.patch("app.registry_client.fetch_collection", return_value=rows) as fetch:
            config.load_locations_from_db()
        fetch.assert_called_once_with(
            "/api/v1/locations?is_active=true&snapshot=true&include=aliases"
        )
        self.assertEqual(config.LOCATION_COORDS["Phase1 Harbor"], (1.25, 103.5))
        self.assertEqual(config.LOCATION_COUNTRIES["Phase1 Harbor"], "Singapore")
        self.assertEqual(config.LOCATION_ISO3["Phase1 Harbor"], "SGP")
        self.assertEqual(config.LOCATION_ADMIN1["Phase1 Harbor"], "Central")
        self.assertEqual(config.LOCATION_ADMIN_LEVEL["Phase1 Harbor"], 3)
        self.assertEqual(config.LOCATION_ALIASES["pelabuhan phase1"], "Phase1 Harbor")
        self.assertEqual(config.LOCATION_ALIASES["ri"], "Indonesia")
        self.assertEqual(extractors.COUNTRY_ALIASES["ri"], "Indonesia")
        self.assertNotIn("pelabuhan phase1", extractors.COUNTRY_ALIASES)
        self.assertNotIn("harian", config.LOCATION_COORDS)
        self.assertNotIn("Inactive Town", config.LOCATION_COORDS)
        self.assertNotIn("ghost", config.LOCATION_ALIASES)

        with mock.patch("app.registry_client.fetch_collection", side_effect=OSError("down")):
            config.load_locations_from_db()
        self.assertEqual(config.LOCATION_COORDS, {})
        self.assertEqual(config.LOCATION_COUNTRIES, {})
        self.assertEqual(config.LOCATION_ALIASES, {})
        self.assertIsNone(config.LOCATION_REGISTRY_REFERENCE_ID)


if __name__ == "__main__":
    unittest.main()
