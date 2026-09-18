import json
import threading
import pika
from . import config

_connection = None
_channel = None
_publish_lock = threading.Lock()


def _ensure_queue(channel, queue: str):
    channel.queue_declare(queue=queue, durable=True)


def _get_channel():
    global _connection, _channel
    if _connection is None or _connection.is_closed:
        params = pika.URLParameters(config.RABBITMQ_URL)
        _connection = pika.BlockingConnection(params)
        _channel = _connection.channel()
        _channel.confirm_delivery()
        _ensure_queue(_channel, config.RABBITMQ_QUEUE)
        _ensure_queue(_channel, config.RABBITMQ_SOCIAL_QUEUE)
        _ensure_queue(_channel, config.RABBITMQ_ANALYSIS_URL_QUEUE)
        _ensure_queue(_channel, config.RABBITMQ_CRAWL_MATRIX_QUEUE)
    elif _channel is None or _channel.is_closed:
        _channel = _connection.channel()
        _channel.confirm_delivery()
        _ensure_queue(_channel, config.RABBITMQ_QUEUE)
        _ensure_queue(_channel, config.RABBITMQ_SOCIAL_QUEUE)
        _ensure_queue(_channel, config.RABBITMQ_ANALYSIS_URL_QUEUE)
        _ensure_queue(_channel, config.RABBITMQ_CRAWL_MATRIX_QUEUE)
    return _channel


def publish(message: dict):
    # APScheduler runs collectors concurrently in worker threads, while
    # Pika's BlockingConnection/channel is not thread-safe. Serializing the
    # publish and recreating a broken connection prevents StreamLostError from
    # interrupting otherwise successful crawler runs.
    global _connection, _channel
    with _publish_lock:
        for attempt in range(2):
            try:
                channel = _get_channel()
                if message.get("source_type") == "skdr_api":
                    return
                routing_queue = (
                    config.RABBITMQ_SOCIAL_QUEUE
                    if message.get("source_type") == "social_media"
                    else config.RABBITMQ_QUEUE
                )
                confirmed = channel.basic_publish(
                    exchange="",
                    routing_key=routing_queue,
                    body=json.dumps(message, default=str),
                    properties=pika.BasicProperties(delivery_mode=2),
                    mandatory=True,
                )
                if confirmed is False:
                    raise RuntimeError(f"RabbitMQ rejected publish to {routing_queue}")
                return
            except Exception:
                try:
                    if _connection is not None and not _connection.is_closed:
                        _connection.close()
                except Exception:
                    pass
                _connection = None
                _channel = None
                if attempt == 1:
                    raise


def publish_to_queue(queue: str, message: dict) -> bool:
    """Best-effort publish to an isolated work queue. Never mix with disease.raw."""
    global _connection, _channel
    if not queue:
        return False
    with _publish_lock:
        for attempt in range(2):
            try:
                channel = _get_channel()
                _ensure_queue(channel, queue)
                confirmed = channel.basic_publish(
                    exchange="",
                    routing_key=queue,
                    body=json.dumps(message, default=str),
                    properties=pika.BasicProperties(delivery_mode=2, content_type="application/json"),
                    mandatory=True,
                )
                if confirmed is False:
                    raise RuntimeError(f"RabbitMQ rejected publish to {queue}")
                return True
            except Exception:
                try:
                    if _connection is not None and not _connection.is_closed:
                        _connection.close()
                except Exception:
                    pass
                _connection = None
                _channel = None
                if attempt == 1:
                    return False
    return False
