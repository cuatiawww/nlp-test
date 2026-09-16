"""Interactive URL analysis skips auxiliary zero-shot heads on the critical path."""
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.modules.setdefault("transformers", MagicMock())

from app.schemas import AnalyzeRequest
from app import pipeline


class InteractivePipelineTests(unittest.TestCase):
    def test_interactive_does_not_call_auxiliary_zero_shot_heads(self):
        payload = AnalyzeRequest(
            text="Johor recorded 9,954 dengue cases and 13 deaths in epi week 34.",
            source_type="web",
            source_name="URL Analyzer",
            source_url="https://newswav.com/article/dengue-surge-in-johor",
            interactive=True,
        )
        with patch.object(pipeline.config, "NLP_MODEL", "fine-tuned"), \
             patch.object(pipeline, "classify_disease", return_value=("dengue fever DBD", 0.9)), \
             patch.object(pipeline, "classify_sentiment") as sentiment, \
             patch.object(pipeline, "classify_event_type") as event_type, \
             patch.object(pipeline, "classify_relevance") as relevance:
            result = pipeline.run(payload)
        sentiment.assert_not_called()
        event_type.assert_not_called()
        relevance.assert_not_called()
        labels = " ".join(
            [result.disease_classification or ""] + list(result.disease_extracted or [])
        ).lower()
        self.assertIn("dengue", labels)

    def test_bulk_path_still_calls_auxiliary_heads_when_not_interactive(self):
        payload = AnalyzeRequest(
            text="Johor recorded 9,954 dengue cases and 13 deaths in epi week 34.",
            interactive=False,
        )
        with patch.object(pipeline.config, "NLP_MODEL", "fine-tuned"), \
             patch.object(pipeline, "classify_disease", return_value=("dengue fever DBD", 0.9)), \
             patch.object(pipeline, "classify_sentiment", return_value=("neutral", 0.5)) as sentiment, \
             patch.object(pipeline, "classify_event_type", return_value=("disease outbreak wabah", 0.9)) as event_type, \
             patch.object(pipeline, "classify_relevance", return_value=("high", 0.9)) as relevance:
            pipeline.run(payload)
        sentiment.assert_called()
        event_type.assert_called()
        relevance.assert_called()


if __name__ == "__main__":
    unittest.main()
