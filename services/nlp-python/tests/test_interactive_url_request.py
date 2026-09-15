import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.schemas import AnalyzeRequest, as_interactive


class InteractiveUrlRequestTests(unittest.TestCase):
    def test_model_dump_includes_interactive_default(self):
        payload = AnalyzeRequest(text="Avian influenza A(H5N1) case in Australia.")
        self.assertIn("interactive", payload.model_dump())
        self.assertFalse(payload.model_dump()["interactive"])

    def test_unpacking_dump_plus_interactive_kwarg_is_the_production_crash(self):
        payload = AnalyzeRequest(text="Eight hantavirus cases, including three deaths.")
        with self.assertRaises(TypeError):
            AnalyzeRequest(**payload.model_dump(), interactive=True)

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
