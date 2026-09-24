import sys
import unittest
from pathlib import Path
from types import ModuleType

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

if "transformers" not in sys.modules:
    transformers_stub = ModuleType("transformers")
    transformers_stub.pipeline = lambda *args, **kwargs: None
    sys.modules["transformers"] = transformers_stub

from app import config
from app.disease_master import project_disease_master_output, resolve_local_disease_term


class LocalDiseaseMasterResolveTests(unittest.TestCase):
    def setUp(self):
        self.previous = list(config.DISEASE_MASTER_CONCEPTS)
        config.DISEASE_MASTER_CONCEPTS = [
            {
                "disease_id": "DENGUE",
                "canonical_name": "Dengue",
                "english_name": "Dengue fever",
                "source": "asean_master_database",
                "aliases": [{"alias": "demam berdarah", "language": "id"}],
            },
            {
                "disease_id": "MEASLES",
                "canonical_name": "Measles",
                "english_name": "Measles",
                "source": "asean_master_database",
                "aliases": [{"alias": "campak", "language": "id"}],
            },
        ]

    def tearDown(self):
        config.DISEASE_MASTER_CONCEPTS = self.previous

    def test_alias_resolves_to_local_id_without_ontology_code(self):
        resolved = resolve_local_disease_term("demam berdarah")
        self.assertEqual(resolved["disease_id"], "DENGUE")
        self.assertEqual(resolved["master_source"], "asean_master_database")
        self.assertIsNone(resolved["ontology_code"])

    def test_unknown_is_not_invented(self):
        self.assertIsNone(resolve_local_disease_term("not a disease label"))

    def test_projection_deduplicates_by_local_master_id(self):
        projection = project_disease_master_output(
            primary="Dengue",
            extracted=["Dengue", "demam berdarah"],
            mentions=[
                {"canonical_name": "Dengue", "disease_id": "DENGUE", "role": "primary"},
                {"canonical_name": "Dengue", "disease_id": "DENGUE", "role": "secondary"},
            ],
        )
        self.assertEqual(projection["primary"], "Dengue")
        self.assertEqual(projection["extracted"], ["Dengue"])
        self.assertEqual(projection["unresolved_indexes"], [])


if __name__ == "__main__":
    unittest.main()
