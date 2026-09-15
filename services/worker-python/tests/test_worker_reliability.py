import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import worker
from app.geo import st_makepoint_args


class WorkerReliabilityTests(unittest.TestCase):
    def test_document_identity_prefers_content_hash(self):
        key = worker.document_identity_key({"content_hash": "abc", "url_hash": "def", "url": "https://example.org"})
        self.assertEqual(key, "crawler-document:content_hash:abc")

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

    def test_st_makepoint_args_are_longitude_then_latitude(self):
        jakarta_lat, jakarta_lon = -6.2088, 106.8456
        lon_check, lat_check, x, y = st_makepoint_args(jakarta_lat, jakarta_lon)
        self.assertEqual((lon_check, lat_check), (jakarta_lon, jakarta_lat))
        self.assertEqual((x, y), (jakarta_lon, jakarta_lat))


if __name__ == "__main__":
    unittest.main()



if __name__ == "__main__":
    unittest.main()
