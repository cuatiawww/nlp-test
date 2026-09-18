"""Small, shared RabbitMQ reliability primitives for crawler workers."""

from __future__ import annotations

import os
import time

import pika


DEFAULT_MAX_ATTEMPTS = 4
DEFAULT_RETRY_BASE_MS = 5_000
DEFAULT_RETRY_MAX_MS = 60_000
DEFAULT_DLQ_RETRY_MS = 60_000
MAX_DLQ_DEFER_ATTEMPTS = 3


def max_attempts() -> int:
    try:
        return max(1, int(os.getenv("RABBITMQ_MAX_DELIVERY_RETRIES", str(DEFAULT_MAX_ATTEMPTS))))
    except ValueError:
        return DEFAULT_MAX_ATTEMPTS


def _bounded_int(name: str, default: int, minimum: int = 1) -> int:
    try:
        return max(minimum, int(os.getenv(name, str(default))))
    except ValueError:
        return default


def retry_delay_ms(attempt: int) -> int:
    base = _bounded_int("RABBITMQ_RETRY_BASE_MILLISECONDS", DEFAULT_RETRY_BASE_MS)
    ceiling = max(base, _bounded_int("RABBITMQ_RETRY_MAX_MILLISECONDS", DEFAULT_RETRY_MAX_MS))
    return min(ceiling, base * (2 ** max(0, attempt - 1)))


def queue_names(source_queue: str) -> tuple[str, str]:
    return f"{source_queue}.retry", f"{source_queue}.dlq"


def declare_queue_topology(channel, source_queues: tuple[str, ...]) -> None:
    """Declare additive retry/DLQ queues without changing primary queue args."""
    for source_queue in source_queues:
        retry_queue, dlq_queue = queue_names(source_queue)
        channel.queue_declare(queue=source_queue, durable=True)
        channel.queue_declare(
            queue=retry_queue,
            durable=True,
            arguments={
                "x-dead-letter-exchange": "",
                "x-dead-letter-routing-key": source_queue,
            },
        )
        channel.queue_declare(queue=dlq_queue, durable=True)


def _headers(properties) -> dict:
    return dict(getattr(properties, "headers", None) or {})


def _publish(channel, queue: str, body: bytes, headers: dict, expiration: str | None = None) -> bool:
    properties = pika.BasicProperties(
        delivery_mode=2,
        content_type="application/json",
        headers=headers,
        expiration=expiration,
    )
    confirmed = channel.basic_publish(
        exchange="",
        routing_key=queue,
        body=body,
        properties=properties,
        mandatory=True,
    )
    if confirmed is False:
        raise RuntimeError(f"RabbitMQ rejected publish to {queue}")
    return True


def publish_retry(channel, source_queue: str, properties, body: bytes, reason: str) -> bool:
    """Publish a bounded delayed retry; caller settles the original delivery."""
    headers = _headers(properties)
    try:
        attempt = int(headers.get("x-retry-count", 0)) + 1
    except (TypeError, ValueError):
        attempt = 1
    if attempt > max_attempts():
        return False
    headers.update({
        "x-retry-count": attempt,
        "x-last-error": str(reason).replace("\n", " ")[:180],
    })
    retry_queue, _ = queue_names(source_queue)
    return _publish(channel, retry_queue, body, headers, str(retry_delay_ms(attempt)))


def publish_dlq(channel, source_queue: str, properties, body: bytes, reason: str) -> bool:
    headers = _headers(properties)
    headers.update({
        "x-original-queue": source_queue,
        "x-terminal-reason": str(reason).replace("\n", " ")[:240],
        "x-dead-lettered-at": str(int(time.time())),
    })
    _, dlq_queue = queue_names(source_queue)
    return _publish(channel, dlq_queue, body, headers)


def publish_dlq_retry(channel, source_queue: str, properties, body: bytes, reason: str) -> bool:
    """Defer terminal handling if the DLQ broker route is temporarily unavailable."""
    headers = _headers(properties)
    try:
        defer_attempt = int(headers.get("x-dlq-retry-count", 0)) + 1
    except (TypeError, ValueError):
        defer_attempt = 1
    if defer_attempt > MAX_DLQ_DEFER_ATTEMPTS:
        return False
    headers.update({
        "x-retry-count": max_attempts(),
        "x-dlq-retry": True,
        "x-dlq-retry-count": defer_attempt,
        "x-last-error": str(reason).replace("\n", " ")[:180],
    })
    retry_delay = _bounded_int("RABBITMQ_DLQ_RETRY_MILLISECONDS", DEFAULT_DLQ_RETRY_MS)
    retry_queue, _ = queue_names(source_queue)
    return _publish(channel, retry_queue, body, headers, str(retry_delay))


def settle_transient_delivery(channel, method, properties, body: bytes, source_queue: str, reason: str) -> str:
    """Use bounded delay, then DLQ, without acknowledging an unpreserved message."""
    try:
        if publish_retry(channel, source_queue, properties, body, reason):
            channel.basic_ack(delivery_tag=method.delivery_tag)
            return "retry"
    except Exception:
        pass
    try:
        if publish_dlq(channel, source_queue, properties, body, reason):
            channel.basic_ack(delivery_tag=method.delivery_tag)
            return "dlq"
    except Exception:
        pass
    try:
        if publish_dlq_retry(channel, source_queue, properties, body, reason):
            channel.basic_ack(delivery_tag=method.delivery_tag)
            return "dlq-deferred"
    except Exception:
        pass
    raise RuntimeError(f"Could not durably settle delivery for {source_queue}; leaving it unacknowledged")


def settle_malformed_delivery(channel, method, properties, body: bytes, source_queue: str) -> str:
    """Reject only after the malformed body is durably copied to its DLQ."""
    try:
        if publish_dlq(channel, source_queue, properties, body, "malformed message"):
            channel.basic_reject(delivery_tag=method.delivery_tag, requeue=False)
            return "dlq"
    except Exception:
        pass
    try:
        if publish_dlq_retry(channel, source_queue, properties, body, "DLQ unavailable"):
            channel.basic_ack(delivery_tag=method.delivery_tag)
            return "dlq-deferred"
    except Exception:
        pass
    raise RuntimeError(f"Could not route malformed delivery for {source_queue}; leaving it unacknowledged")
