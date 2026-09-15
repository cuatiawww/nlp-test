import sys
import unittest
from pathlib import Path
from types import ModuleType

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

if "transformers" not in sys.modules:
    transformers_stub = ModuleType("transformers")
    transformers_stub.pipeline = lambda *args, **kwargs: None
    sys.modules["transformers"] = transformers_stub

from app import config, pipeline
from app.icd11 import project_icd11_public_output, resolve_local_icd11_term
from app.schemas import AnalyzeRequest


class LocalIcd11ResolveTests(unittest.TestCase):
    def test_keyword_labels_map_to_icd11_names_without_who_api(self):
        cases = {
            "campak": ("Measles", "1F03"),
            "CAMPAK": ("Measles", "1F03"),
            "DBD": ("Dengue", "1D2Z"),
            "demam berdarah": ("Dengue", "1D2Z"),
            "H5N1": ("Avian influenza", "1E30"),
            "flu burung": ("Avian influenza", "1E30"),
            "HANTAVIRUS": ("Hantavirus infection", "1D62"),
            "hantavirus": ("Hantavirus infection", "1D62"),
        }
        for surface, (name, code) in cases.items():
            with self.subTest(surface=surface):
                resolved = resolve_local_icd11_term(surface)
                self.assertIsNotNone(resolved, surface)
                self.assertEqual(resolved["canonical_name"], name)
                self.assertEqual(resolved["ontology_code"], code)

    def test_live_catalog_name_wins_over_fallback_aliases(self):
        previous = list(config.WHO_DISEASE_CONCEPTS)
        config.WHO_DISEASE_CONCEPTS = [
            {
                "canonical_name": "avian influenza H5N1",
                "english_name": "Avian Influenza / Bird Flu",
                "ontology_code": "1E30",
                "aliases": [{"alias": "H5N1"}],
            }
        ]
        try:
            resolved = resolve_local_icd11_term("flu burung")
            self.assertEqual(resolved["canonical_name"], "avian influenza H5N1")
            self.assertEqual(resolved["ontology_code"], "1E30")
        finally:
            config.WHO_DISEASE_CONCEPTS = previous

    def test_unknown_is_not_invented(self):
        self.assertIsNone(resolve_local_icd11_term("UNKNOWN"))
        self.assertIsNone(resolve_local_icd11_term(""))
        self.assertIsNone(resolve_local_icd11_term("not a disease label"))

    def test_resolved_keywords_survive_canonical_output_projection(self):
        resolved = resolve_local_icd11_term("campak")
        projection = project_icd11_public_output(
            primary=resolved["canonical_name"],
            extracted=[resolved["canonical_name"]],
            mentions=[
                {
                    "canonical_name": resolved["canonical_name"],
                    "icd11_code": resolved["ontology_code"],
                    "role": "primary",
                }
            ],
        )
        self.assertEqual(projection["primary"], "Measles")
        self.assertEqual(projection["extracted"], ["Measles"])
        self.assertEqual(projection["unresolved_indexes"], [])


class InteractivePipelineIcd11Tests(unittest.TestCase):
    def setUp(self):
        self._model = config.NLP_MODEL
        self._agent = config.AGENT_ENABLED
        self._concepts = list(config.WHO_DISEASE_CONCEPTS)
        self._dict = dict(config.DISEASE_DICT)
        self._canonical_only = config.ICD11_CANONICAL_OUTPUT_ONLY
        config.NLP_MODEL = "none"
        config.AGENT_ENABLED = False
        config.WHO_DISEASE_CONCEPTS = []
        config.ICD11_CANONICAL_OUTPUT_ONLY = True

    def tearDown(self):
        config.NLP_MODEL = self._model
        config.AGENT_ENABLED = self._agent
        config.WHO_DISEASE_CONCEPTS = self._concepts
        config.DISEASE_DICT = self._dict
        config.ICD11_CANONICAL_OUTPUT_ONLY = self._canonical_only

    def _analyze(self, text: str):
        return pipeline.run(
            AnalyzeRequest(
                text=text,
                interactive=True,
                source_country="Indonesia",
                source_type="web",
            )
        )

    def test_interactive_campak_is_measles_not_unknown(self):
        result = self._analyze(
            "Kemenkes menyatakan KLB campak di Aceh dengan 40 kasus dan 2 kematian."
        )
        self.assertEqual(result.disease_classification, "Measles")
        self.assertIn("Measles", result.disease_extracted)
        self.assertTrue(any(m.icd11_code == "1F03" for m in result.disease_mentions))

    def test_interactive_dbd_is_dengue_not_unknown(self):
        result = self._analyze(
            "Dinas Kesehatan mencatat 120 kasus DBD di Jakarta selama Januari."
        )
        self.assertEqual(result.disease_classification, "Dengue")
        self.assertTrue(any(m.icd11_code == "1D2Z" for m in result.disease_mentions))

    def test_interactive_h5n1_is_avian_influenza_not_unknown(self):
        result = self._analyze(
            "Cambodia reports a human H5N1 avian influenza case after poultry deaths."
        )
        self.assertEqual(result.disease_classification, "Avian influenza")
        self.assertTrue(any(m.icd11_code == "1E30" for m in result.disease_mentions))

    def test_interactive_hantavirus_keeps_icd11_name(self):
        result = self._analyze(
            "Eight hantavirus cases, including three deaths, were confirmed this week."
        )
        self.assertEqual(result.disease_classification, "Hantavirus infection")
        self.assertTrue(any(m.icd11_code == "1D62" for m in result.disease_mentions))


if __name__ == "__main__":
    unittest.main()
