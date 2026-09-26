"""Fase 1: registry runtime audit — counts, readiness, sentinels."""
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import config
from app.disease_master import resolve_local_disease_term
from app.registry_audit import (
    STATUS_FALLBACK,
    STATUS_LOADED,
    STATUS_UNAVAILABLE,
    registry_audit,
    registry_readiness,
)


class RegistryAuditTests(unittest.TestCase):
    def test_empty_concepts_after_load_are_unavailable(self):
        with patch.object(config, "DISEASE_MASTER_CONCEPTS", []):
            with patch.object(config, "DISEASE_MASTER_LOAD_ATTEMPTED", True):
                with patch.object(config, "KEYWORDS_LOAD_ATTEMPTED", True):
                    with patch.object(config, "DISEASE_DICT", {"Dengue": "Dengue"}):
                        with patch.object(config, "SYMPTOM_DICT", {}):
                            with patch.object(config, "LOCATION_LOAD_ATTEMPTED", True):
                                with patch.object(config, "LOCATION_COORDS", {"Tuy Duc": (1.0, 1.0)}):
                                    with patch.object(config, "LOCATION_ALIASES", {}):
                                        with patch.object(config, "LOCATION_REGISTRY_REFERENCE_ID", None):
                                            with patch.object(config, "LEXICON_LOAD_ATTEMPTED", True):
                                                with patch.object(config, "LEXICON_READY", False):
                                                    with patch.object(config, "LANGUAGE_MARKERS", {"en": ["cases"]}):
                                                        with patch.object(config, "EXTRACTION_RULES", {}):
                                                            with patch.object(config, "OUTBREAK_RULES", {}):
                                                                with patch("app.registry_audit._ensure_attempted_loads"):
                                                                    readiness = registry_readiness()
        self.assertEqual(readiness["disease_concepts"]["status"], STATUS_UNAVAILABLE)
        self.assertNotEqual(readiness["disease_concepts"]["status"], STATUS_LOADED)

    def test_seed_only_locations_not_loaded(self):
        with patch("app.registry_audit._ensure_attempted_loads"):
            with patch.object(config, "LOCATION_LOAD_ATTEMPTED", True):
                with patch.object(
                    config,
                    "LOCATION_COORDS",
                    {"Tuy Đức": (1.0, 1.0), "Tuy Duc": (1.0, 1.0), "Sangatta": (1.0, 1.0)},
                ):
                    with patch.object(config, "LOCATION_ALIASES", {}):
                        with patch.object(config, "LOCATION_REGISTRY_REFERENCE_ID", None):
                            with patch.object(config, "KEYWORDS_LOAD_ATTEMPTED", True):
                                with patch.object(config, "DISEASE_DICT", {"x": "y"}):
                                    with patch.object(config, "SYMPTOM_DICT", {}):
                                        with patch.object(config, "DISEASE_MASTER_LOAD_ATTEMPTED", True):
                                            with patch.object(config, "DISEASE_MASTER_CONCEPTS", [{"disease_id": "DENGUE"}]):
                                                with patch.object(config, "LEXICON_LOAD_ATTEMPTED", True):
                                                    with patch.object(config, "LEXICON_READY", True):
                                                        with patch.object(config, "EXTRACTION_RULES", {"cases": ["x"]}):
                                                            with patch.object(config, "OUTBREAK_RULES", {"DENGUE": 1}):
                                                                readiness = registry_readiness()
        self.assertIn(readiness["locations"]["status"], {STATUS_FALLBACK, STATUS_UNAVAILABLE})
        self.assertNotEqual(readiness["locations"]["status"], STATUS_LOADED)

    def test_ispa_ari_sentinel_aliases_resolve(self):
        for surface in ("ISPA", "ARI", "infeksi saluran pernapasan akut"):
            resolved = resolve_local_disease_term(surface)
            self.assertIsNotNone(resolved, surface)
            self.assertEqual(resolved["disease_id"], "ISPA")

    def test_audit_payload_shape(self):
        with patch("app.registry_audit._ensure_attempted_loads"):
            with patch("app.registry_audit.registry_sentinels", return_value={"all_ok": True}):
                with patch.object(config, "KEYWORDS_LOAD_ATTEMPTED", True):
                    with patch.object(config, "DISEASE_DICT", {"Dengue": "Dengue"}):
                        with patch.object(config, "SYMPTOM_DICT", {}):
                            with patch.object(config, "DISEASE_MASTER_LOAD_ATTEMPTED", True):
                                with patch.object(
                                    config,
                                    "DISEASE_MASTER_CONCEPTS",
                                    [{"disease_id": "DENGUE", "canonical_name": "Dengue", "aliases": []}],
                                ):
                                    with patch.object(config, "LOCATION_LOAD_ATTEMPTED", True):
                                        with patch.object(
                                            config,
                                            "LOCATION_COORDS",
                                            {"Johor": (1.0, 1.0), "Johor Bahru": (1.1, 1.1)},
                                        ):
                                            with patch.object(config, "LOCATION_ALIASES", {}):
                                                with patch.object(config, "LOCATION_REGISTRY_REFERENCE_ID", 123):
                                                    with patch.object(config, "LEXICON_LOAD_ATTEMPTED", True):
                                                        with patch.object(config, "LEXICON_READY", True):
                                                            with patch.object(config, "EXTRACTION_RULES", {"cases": ["x"]}):
                                                                with patch.object(config, "OUTBREAK_RULES", {"DENGUE": 1}):
                                                                    with patch.object(
                                                                        config,
                                                                        "get_lexicon_terms",
                                                                        return_value=["kes", "cases"],
                                                                    ):
                                                                        payload = registry_audit()
        self.assertIn("counts", payload)
        self.assertIn("readiness", payload)
        self.assertIn("sentinels", payload)
        self.assertTrue(payload["cpu_gpu_parity"])


if __name__ == "__main__":
    unittest.main()
