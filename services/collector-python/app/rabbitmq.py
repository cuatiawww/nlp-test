import json
import pika
from . import config

_connection = None


def _get_channel():
    global _connection
    if _connection is None or _connection.is_closed:
        params = pika.URLParameters(config.RABBITMQ_URL)
        _connection = pika.BlockingConnection(params)
    channel = _connection.channel()
    channel.queue_declare(queue=config.RABBITMQ_QUEUE, durable=True)
    return channel


def publish(message: dict):
    channel = _get_channel()
    channel.basic_publish(
        exchange="",
        routing_key=config.RABBITMQ_QUEUE,
        body=json.dumps(message, default=str),
        properties=pika.BasicProperties(delivery_mode=2),
    )
