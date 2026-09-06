import logging
import unittest
from unittest.mock import patch

from app import icd11


class WhoOAuthLoggingTests(unittest.TestCase):
    def setUp(self):
        icd11._TOKEN_CACHE.update({"token": None, "expires_at": 0})

    def test_missing_credentials_is_explicitly_logged(self):
        with self.assertLogs("app.icd11", level=logging.WARNING) as captured:
            with patch.object(icd11.config, "WHO_ICD_CLIENT_ID", ""), patch.object(
                icd11.config, "WHO_ICD_CLIENT_SECRET", ""
            ):
                self.assertIsNone(icd11.who_token())

        self.assertTrue(
            any("WHO ICD-11 OAuth token unavailable" in message
                and "missing_credentials" in message
                for message in captured.output)
        )

    def test_request_failure_is_explicitly_logged(self):
        with self.assertLogs("app.icd11", level=logging.WARNING) as captured:
            with patch.object(icd11.config, "WHO_ICD_CLIENT_ID", "id"), patch.object(
                icd11.config, "WHO_ICD_CLIENT_SECRET", "secret"
            ), patch(
                "urllib.request.urlopen", side_effect=TimeoutError("test timeout")
            ):
                self.assertIsNone(icd11.who_token())

        self.assertTrue(
            any("WHO ICD-11 OAuth token request failed" in message
                and "request_error" in message
                for message in captured.output)
        )


if __name__ == "__main__":
    unittest.main()
