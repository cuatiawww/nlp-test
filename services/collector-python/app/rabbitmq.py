import json
import threading
import pika
from . import config

_connection = None
_channel = None
_publish_lock = threading.Lock()


def _get_channel():
    global _connection, _channel
    if _connection is None or _connection.is_closed:
        params = pika.URLParameters(config.RABBITMQ_URL)
        _connection = pika.BlockingConnection(params)
        _channel = _connection.channel()
        _channel.queue_declare(queue=config.RABBITMQ_QUEUE, durable=True)
        _channel.queue_declare(queue=config.RABBITMQ_SOCIAL_QUEUE, durable=True)
        _channel.queue_declare(queue=config.RABBITMQ_SKDR_QUEUE, durable=True)
    elif _channel is None or _channel.is_closed:
        _channel = _connection.channel()
        _channel.queue_declare(queue=config.RABBITMQ_QUEUE, durable=True)
        _channel.queue_declare(queue=config.RABBITMQ_SOCIAL_QUEUE, durable=True)
        _channel.queue_declare(queue=config.RABBITMQ_SKDR_QUEUE, durable=True)
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
                routing_queue = (
                    config.RABBITMQ_SOCIAL_QUEUE
                    if message.get("source_type") == "social_media"
                    else config.RABBITMQ_SKDR_QUEUE
                    if message.get("source_type") == "skdr_api"
                    else config.RABBITMQ_QUEUE
                )
                channel.basic_publish(
                    exchange="",
                    routing_key=routing_queue,
                    body=json.dumps(message, default=str),
                    properties=pika.BasicProperties(delivery_mode=2),
                )
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
