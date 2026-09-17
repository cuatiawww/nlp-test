import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import config


class InteractiveTimeoutConfigTests(unittest.TestCase):
    def test_html_url_analysis_stays_inside_gateway_budget(self):
        self.assertGreaterEqual(config.INTERACTIVE_HTML_TIMEOUT_SECONDS, 20)
        self.assertLessEqual(config.INTERACTIVE_HTML_TIMEOUT_SECONDS, 45)
        self.assertGreaterEqual(config.INTERACTIVE_HTML_MAX_BOUND_MS, 20_000)
        self.assertLessEqual(config.INTERACTIVE_HTML_MAX_BOUND_MS, 45_000)
        self.assertTrue(config.INTERACTIVE_SKIP_STEALTH)


if __name__ == "__main__":
    unittest.main()
