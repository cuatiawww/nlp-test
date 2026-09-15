import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import config


class UrlTimeoutConfigTests(unittest.TestCase):
    def test_interactive_stage_budgets_fit_the_nlp_request_window(self):
        self.assertGreaterEqual(config.TRANSLATION_STAGE_TIMEOUT_SECONDS, 1)
        self.assertGreaterEqual(config.INFERENCE_STAGE_TIMEOUT_SECONDS, 1)
        self.assertLessEqual(
            config.TRANSLATION_STAGE_TIMEOUT_SECONDS + config.INFERENCE_STAGE_TIMEOUT_SECONDS,
            config.NLP_REQUEST_TIMEOUT_SECONDS,
        )


if __name__ == "__main__":
    unittest.main()
