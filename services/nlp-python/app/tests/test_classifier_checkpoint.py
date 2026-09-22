import unittest
from unittest.mock import patch

from app.models import classifier


class _FakeConfig:
    model_type = "xlm-roberta"

    def __init__(self, architectures):
        self._architectures = architectures

    def to_dict(self):
        return {"architectures": self._architectures}


class TestClassifierCheckpoint(unittest.TestCase):
    @patch("transformers.AutoConfig.from_pretrained")
    def test_base_encoder_is_not_accepted_as_zero_shot_checkpoint(self, load_config):
        load_config.return_value = _FakeConfig(["XLMRobertaModel"])
        result = classifier.validate_sequence_classification_checkpoint("xlm-roberta-base")
        self.assertFalse(result["supports_sequence_classification"])

    @patch("transformers.AutoConfig.from_pretrained")
    def test_sequence_classifier_checkpoint_is_accepted(self, load_config):
        load_config.return_value = _FakeConfig(["XLMRobertaForSequenceClassification"])
        result = classifier.validate_sequence_classification_checkpoint("local-finetuned")
        self.assertTrue(result["supports_sequence_classification"])


if __name__ == "__main__":
    unittest.main()
