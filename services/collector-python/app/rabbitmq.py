import json
import pika
from . import config

_connection = None
_channel = None


def _get_channel():
    global _connection, _channel
    if _connection is None or _connection.is_closed:
        params = pika.URLParameters(config.RABBITMQ_URL)
        _connection = pika.BlockingConnection(params)
        _channel = _connection.channel()
        _channel.queue_declare(queue=config.RABBITMQ_QUEUE, durable=True)
    elif _channel is None or _channel.is_closed:
        _channel = _connection.channel()
        _channel.queue_declare(queue=config.RABBITMQ_QUEUE, durable=True)
    return _channel


def publish(message: dict):
    channel = _get_channel()
    channel.basic_publish(
        exchange="",
        routing_key=config.RABBITMQ_QUEUE,
        body=json.dumps(message, default=str),
        properties=pika.BasicProperties(delivery_mode=2),
    )
