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

    def test_defaults_cover_full_xlm_geo_counts_path(self):
        # Production 408s were INFERENCE_STAGE_TIMEOUT_SECONDS=90, which is
        # below a cold/auxiliary-head CPU pass. Keep a coordinated window.
        self.assertGreaterEqual(config.INFERENCE_STAGE_TIMEOUT_SECONDS, 180)
        self.assertGreaterEqual(config.NLP_REQUEST_TIMEOUT_SECONDS, 270)
        self.assertGreaterEqual(
            config.NLP_REQUEST_TIMEOUT_SECONDS
            - config.TRANSLATION_STAGE_TIMEOUT_SECONDS
            - config.NLP_STAGE_OVERHEAD_SECONDS,
            90,
        )


if __name__ == "__main__":
    unittest.main()
