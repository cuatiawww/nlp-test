import sys
import unittest
from pathlib import Path
from unittest.mock import Mock


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.queue_reliability import (  # noqa: E402
    MAX_DLQ_DEFER_ATTEMPTS,
    max_attempts,
    publish_retry,
    settle_malformed_delivery,
)


class QueueReliabilityTests(unittest.TestCase):
    def test_retry_is_delayed_persistent_and_bounded(self):
        channel = Mock()
        channel.basic_publish.return_value = True
        properties = Mock(headers={"x-retry-count": max_attempts()})

        self.assertFalse(publish_retry(channel, "disease.raw", properties, b"{}", "failure"))
        channel.basic_publish.assert_not_called()

        properties = Mock(headers={"x-retry-count": 0})
        self.assertTrue(publish_retry(channel, "disease.raw", properties, b"{}", "failure"))
        call = channel.basic_publish.call_args.kwargs
        self.assertEqual(call["routing_key"], "disease.raw.retry")
        self.assertEqual(call["properties"].delivery_mode, 2)
        self.assertGreater(int(call["properties"].expiration), 0)

    def test_malformed_route_failure_has_bounded_defer_count(self):
        channel = Mock()
        channel.basic_publish.side_effect = RuntimeError("DLQ unavailable")
        method = Mock(delivery_tag=4)
        properties = Mock(headers={"x-dlq-retry-count": MAX_DLQ_DEFER_ATTEMPTS})

        with self.assertRaises(RuntimeError):
            settle_malformed_delivery(channel, method, properties, b"bad", "disease.social")
        channel.basic_ack.assert_not_called()
        channel.basic_reject.assert_not_called()


if __name__ == "__main__":
    unittest.main()
