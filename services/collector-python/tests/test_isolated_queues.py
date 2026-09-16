import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.modules.setdefault("pika", MagicMock())
from app import config


class IsolatedQueueConfigTests(unittest.TestCase):
    def test_interactive_queues_are_not_the_bulk_ingest_queue(self):
        self.assertEqual(config.RABBITMQ_QUEUE, "disease.raw")
        self.assertEqual(config.RABBITMQ_ANALYSIS_URL_QUEUE, "disease.analysis-url")
        self.assertEqual(config.RABBITMQ_CRAWL_MATRIX_QUEUE, "disease.crawl-matrix")
        self.assertNotEqual(config.RABBITMQ_ANALYSIS_URL_QUEUE, config.RABBITMQ_QUEUE)
        self.assertNotEqual(config.RABBITMQ_CRAWL_MATRIX_QUEUE, config.RABBITMQ_QUEUE)
        self.assertNotEqual(config.RABBITMQ_ANALYSIS_URL_QUEUE, config.RABBITMQ_CRAWL_MATRIX_QUEUE)


class PublishToQueueTests(unittest.TestCase):
    def test_publish_to_queue_best_effort_does_not_raise(self):
        from app.rabbitmq import publish_to_queue
        with patch("app.rabbitmq._get_channel", side_effect=RuntimeError("broker down")):
            self.assertFalse(publish_to_queue("disease.analysis-url", {"job_id": "x"}))

    def test_publish_to_queue_keeps_the_requested_routing_key(self):
        from app.rabbitmq import publish_to_queue
        channel = MagicMock()
        with patch("app.rabbitmq._get_channel", return_value=channel):
            self.assertTrue(publish_to_queue("disease.analysis-url", {"job_id": "abc"}))
            self.assertTrue(publish_to_queue("disease.crawl-matrix", {"job_id": "def"}))
        keys = [call.kwargs["routing_key"] for call in channel.basic_publish.call_args_list]
        self.assertEqual(keys, ["disease.analysis-url", "disease.crawl-matrix"])
        self.assertNotIn("disease.raw", keys)


if __name__ == "__main__":
    unittest.main()
