import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import worker


class WorkerReliabilityTests(unittest.TestCase):
    def test_document_identity_prefers_content_hash(self):
        key = worker.document_identity_key({"content_hash": "abc", "url_hash": "def", "url": "https://example.org"})
        self.assertEqual(key, "crawler-document:content_hash:abc")

    def test_document_identity_locks_every_persistence_identity(self):
        keys = worker.identity_lock_keys({
            "url": "https://example.org/article",
            "normalized_url": "https://example.org/article",
            "canonical_url": "https://example.org/article",
            "final_url": "https://example.org/article",
            "url_hash": "url-digest",
            "content_hash": "content-digest",
        })
        self.assertEqual(len(keys), 6)
        self.assertEqual(keys, tuple(sorted(keys)))
        self.assertIn("crawler-document:content_hash:content-digest", keys)
        self.assertIn("crawler-document:final_url:https://example.org/article", keys)

    def test_identity_where_clause_is_parameterized_for_all_fields(self):
        clause, params = worker.identity_where_clause({
            "url": "https://example.org/article",
            "normalized_url": "https://example.org/article",
            "canonical_url": "https://example.org/article",
            "final_url": "https://example.org/article",
            "url_hash": "url-digest",
            "content_hash": "content-digest",
        })
        self.assertEqual(clause.count("%s"), 6)
        self.assertEqual(len(params), 6)

    def test_retry_delay_is_bounded_exponential(self):
        with patch.object(worker, "RETRY_BASE_MILLISECONDS", 1000), patch.object(worker, "RETRY_MAX_MILLISECONDS", 5000):
            self.assertEqual(worker.retry_delay_milliseconds(1), 1000)
            self.assertEqual(worker.retry_delay_milliseconds(3), 4000)
            self.assertEqual(worker.retry_delay_milliseconds(9), 5000)

    def test_retry_count_is_persisted_in_rabbit_header(self):
        channel = Mock()
        channel.basic_publish.return_value = True
        method = Mock(routing_key="disease.raw", delivery_tag=7)
        properties = Mock(headers={"x-retry-count": 1})
        self.assertTrue(worker.schedule_rabbit_retry(channel, method, properties, b"{}", "temporary"))
        published = channel.basic_publish.call_args.kwargs
        self.assertEqual(published["routing_key"], "disease.raw.retry")
        self.assertEqual(published["properties"].headers["x-retry-count"], 2)
        channel.basic_ack.assert_called_once_with(delivery_tag=7)

    def test_failed_state_requires_one_updated_row(self):
        class Cursor:
            rowcount = 0

            def fetchone(self):
                return None

        class FakeConn:
            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            def execute(self, *_args, **_kwargs):
                return Cursor()

            def rollback(self):
                self.rolled_back = True

            def commit(self):
                self.committed = True

        with patch.object(worker, "get_db", return_value=FakeConn()):
            self.assertFalse(worker.mark_message_failed({"raw_report_id": "missing"}))

    def test_malformed_delivery_is_rejected_only_after_dlq_publish(self):
        channel = Mock()
        channel.basic_publish.return_value = True
        method = Mock(routing_key="disease.raw", delivery_tag=8)
        properties = Mock(headers={})

        from app.queue_reliability import settle_malformed_delivery
        self.assertEqual(
            settle_malformed_delivery(channel, method, properties, b"not-json", "disease.raw"),
            "dlq",
        )
        self.assertEqual(channel.basic_publish.call_args.kwargs["routing_key"], "disease.raw.dlq")
        channel.basic_reject.assert_called_once_with(delivery_tag=8, requeue=False)

    def test_non_string_raw_text_is_sent_to_dlq(self):
        channel = Mock()
        channel.basic_publish.return_value = True
        method = Mock(routing_key="disease.social", delivery_tag=10)
        properties = Mock(headers={})

        worker.callback(
            channel,
            method,
            properties,
            b'{"source_type":"social_media","text":[]}',
        )

        self.assertEqual(channel.basic_publish.call_args.kwargs["routing_key"], "disease.social.dlq")
        channel.basic_reject.assert_called_once_with(delivery_tag=10, requeue=False)

    def test_retry_exhaustion_routes_to_dlq(self):
        channel = Mock()
        channel.basic_publish.return_value = True
        method = Mock(routing_key="disease.analysis-url", delivery_tag=9)
        properties = Mock(headers={"x-retry-count": 4})

        from app.queue_reliability import settle_transient_delivery
        self.assertEqual(
            settle_transient_delivery(
                channel, method, properties, b"{}", "disease.analysis-url", "terminal failure"
            ),
            "dlq",
        )
        self.assertEqual(channel.basic_publish.call_args.kwargs["routing_key"], "disease.analysis-url.dlq")
        channel.basic_ack.assert_called_once_with(delivery_tag=9)


if __name__ == "__main__":
    unittest.main()
