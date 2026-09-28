"""A list must not be read as the analyze request.

Staging Full NLP returned HTTP 500:
AttributeError: 'list' object has no attribute 'source_type'
on POST /nlp/analyze/raw after the article fetch succeeded.
"""
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock

os.environ.setdefault("NLP_MODEL", "none")
os.environ.setdefault("AGENT_ENABLED", "false")
os.environ.setdefault("TRANSLATION_PROVIDER", "none")
# Classifier imports transformers at import time. Stub it only when this
# environment has not installed the model stack, so a full suite that has
# torch keeps the real modules.
try:
    import transformers  # noqa: F401
except ImportError:
    sys.modules.setdefault("transformers", MagicMock())
try:
    import torch  # noqa: F401
except ImportError:
    sys.modules.setdefault("torch", MagicMock())
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import _full_pipeline_payload
from app.pipeline import run
from app.schemas import AnalyzeRequest


class AnalyzeRawListPayloadTests(unittest.TestCase):
    def test_full_pipeline_unwraps_a_list_before_source_type_access(self):
        payload = _full_pipeline_payload([
            {
                "text": "Jakarta melaporkan 12 kasus demam berdarah.",
                "source_type": ["web"],
                "interactive": True,
                "rules_only": True,
            }
        ])
        self.assertIsInstance(payload, AnalyzeRequest)
        self.assertFalse(payload.interactive)
        self.assertFalse(payload.rules_only)
        self.assertEqual((payload.source_type or "web").strip().casefold(), "web")

    def test_pipeline_run_on_a_list_does_not_500_on_source_type(self):
        payload = [{
            "text": "Jakarta melaporkan 12 kasus demam berdarah pada September 2026.",
            "source_type": ["web"],
            "source_name": "URL Analyzer",
            "source_url": "https://berita.rtm.gov.my/example",
        }]
        try:
            result = run(payload)
        except AttributeError as exc:
            self.fail(f"list payload must not be read as an object: {exc}")
        self.assertEqual(result.source_credibility_label, "web")
