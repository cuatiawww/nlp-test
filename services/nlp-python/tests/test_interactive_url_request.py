import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.schemas import AnalyzeRequest, as_interactive, coerce_analyze_request


class InteractiveUrlRequestTests(unittest.TestCase):
    def test_model_dump_includes_interactive_default(self):
        payload = AnalyzeRequest(text="Avian influenza A(H5N1) case in Australia.")
        self.assertIn("interactive", payload.model_dump())
        self.assertFalse(payload.model_dump()["interactive"])

    def test_unpacking_dump_plus_interactive_kwarg_is_the_production_crash(self):
        payload = AnalyzeRequest(text="Eight hantavirus cases, including three deaths.")
        with self.assertRaises(TypeError):
            AnalyzeRequest(**payload.model_dump(), interactive=True)

    def test_list_payload_is_an_object_before_source_type_access(self):
        payload = coerce_analyze_request([
            {
                "text": "Jakarta melaporkan 12 kasus demam berdarah.",
                "source_type": ["web"],
            }
        ])
        self.assertIsInstance(payload, AnalyzeRequest)
        source_type = payload.source_type or "web"
        self.assertEqual(source_type.strip().casefold(), "web")

    def test_list_valued_source_type_on_a_model_is_text(self):
        raw = AnalyzeRequest.model_construct(
            text="Jakarta melaporkan 12 kasus demam berdarah.",
            source_type=["web", "news"],
        )
        payload = coerce_analyze_request(raw)
        self.assertEqual((payload.source_type or "web").strip(), "web")

    def test_as_interactive_overrides_without_typeerror(self):
        payload = AnalyzeRequest(
            text="Kasus Campak 2026 di Indonesia melonjak.",
            source_type="web",
            source_name="URL Analyzer",
            rules_only=True,
        )
        bounded = as_interactive(payload)
        self.assertTrue(bounded.interactive)
        self.assertTrue(bounded.rules_only)
        self.assertEqual(bounded.source_name, "URL Analyzer")
        self.assertIn("Campak", bounded.text)


if __name__ == "__main__":
    unittest.main()
