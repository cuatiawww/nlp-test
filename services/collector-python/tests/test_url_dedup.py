import unittest
from unittest.mock import Mock, patch

from app import db


class UrlDeduplicationTest(unittest.TestCase):
    def _connection(self, row):
        connection = Mock()
        connection.execute.return_value.fetchone.return_value = row
        return connection

    def test_empty_url_is_not_considered_processed(self):
        with patch.object(db, "get_conn") as get_conn:
            self.assertFalse(db.is_url_already_processed("  "))
            get_conn.assert_not_called()

    def test_completed_record_is_skipped(self):
        connection = self._connection({"value": 1})
        with patch.object(db, "get_conn", return_value=connection):
            self.assertTrue(db.is_url_already_processed("https://example.org/news"))
        connection.execute.assert_called_once()
        connection.commit.assert_called_once()

    def test_missing_or_failed_record_can_be_retried(self):
        connection = self._connection(None)
        with patch.object(db, "get_conn", return_value=connection):
            self.assertFalse(db.is_url_already_processed("https://example.org/news"))

if __name__ == "__main__":
    unittest.main()
