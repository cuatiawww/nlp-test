import json
import logging
import os
import time

import pika
import psycopg
from psycopg.rows import dict_row
import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("worker")

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/%2f")
RABBITMQ_QUEUE = os.getenv("RABBITMQ_QUEUE", "disease.raw")
DATABASE_URL = os.getenv("DATABASE_URL", "postgres://postgres:root@host.docker.internal:9898/disease_ai")
NLP_SERVICE_URL = os.getenv("NLP_SERVICE_URL", "http://localhost:8001")


def get_db():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def parse_date(val: str) -> str | None:
    if not val:
        return None
    try:
        import dateutil.parser
        return dateutil.parser.parse(val).strftime("%Y-%m-%d")
    except Exception:
        return None


def call_nlp(text: str, source_type: str, source_name: str, published_at: str) -> dict:
    url = f"{NLP_SERVICE_URL}/nlp/analyze"
    resp = requests.post(
        url,
        json={
            "text": text,
            "source_type": source_type,
            "source_name": source_name,
            "published_at": published_at,
        },
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


def callback(ch, method, properties, body):
    try:
        msg = json.loads(body)
        logger.info(
            "Processing message: raw_report_id=%s source_type=%s len=%d",
            msg.get("raw_report_id", "N/A"),
            msg.get("source_type", ""),
            len(msg.get("text", "")),
        )

        nlp = call_nlp(
            msg.get("text", ""),
            msg.get("source_type", ""),
            msg.get("source_name", ""),
            msg.get("published_at", ""),
        )

        with get_db() as conn:
            # Handle both pre-inserted raw_report_id (Rust backend) and collector messages
            raw_id = msg.get("raw_report_id")
            if raw_id:
                # Rust backend already inserted raw_reports — update status
                conn.execute(
                    "UPDATE raw_reports SET processing_status='PROCESSED' WHERE id=%s",
                    (raw_id,),
                )
            else:
                # Collector message — insert raw_reports now
                cur = conn.execute(
                    """INSERT INTO raw_reports
                       (source_type, source_name, published_at, original_text, url, object_path, processing_status)
                       VALUES (%s, %s, %s, %s, %s, %s, 'PROCESSED')
                       RETURNING id""",
                    (
                        msg.get("source_type"),
                        msg.get("source_name"),
                        parse_date(msg.get("published_at")),
                        msg.get("text"),
                        msg.get("url"),
                        msg.get("object_path"),
                    ),
                )
                raw_id = cur.fetchone()["id"]

            if not nlp.get("is_health_related", True):
                conn.execute(
                    "UPDATE raw_reports SET processing_status='SKIPPED' WHERE id=%s",
                    (raw_id,),
                )
                conn.commit()
                logger.info("Skipped (not health related): raw_id=%s", raw_id)
                ch.basic_ack(delivery_tag=method.delivery_tag)
                return

            conn.execute(
                """INSERT INTO disease_events
                   (raw_report_id, source_type, source_name, published_at, original_text, language,
                    location_name, geom, symptoms, disease_extracted, disease_classification,
                    case_count, death_count, confidence, outbreak_alert,
                    sentiment, event_type, relevance_score)
                   VALUES (%s, %s, %s, %s, %s, %s, %s,
                           CASE WHEN %s::float8 IS NULL OR %s::float8 IS NULL THEN NULL
                                ELSE ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                           END,
                           %s::jsonb, %s::jsonb, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    raw_id,
                    msg.get("source_type"),
                    msg.get("source_name"),
                    parse_date(msg.get("published_at")),
                    msg.get("text"),
                    nlp["language"],
                    nlp.get("location_name"),
                    nlp.get("latitude"),
                    nlp.get("longitude"),
                    nlp.get("latitude"),
                    nlp.get("longitude"),
                    json.dumps(nlp.get("symptoms", [])),
                    json.dumps(nlp.get("disease_extracted", [])),
                    nlp.get("disease_classification"),
                    nlp.get("case_count", 1),
                    nlp.get("death_count", 0),
                    nlp.get("confidence", 0.0),
                    nlp.get("outbreak_alert", False),
                    nlp.get("sentiment"),
                    nlp.get("event_type"),
                    nlp.get("relevance_score"),
                ),
            )
            conn.commit()

        logger.info("Processed successfully: raw_id=%s", raw_id)
        ch.basic_ack(delivery_tag=method.delivery_tag)

    except json.JSONDecodeError as e:
        logger.error("Invalid JSON message: %s", e)
        ch.basic_ack(delivery_tag=method.delivery_tag)
    except requests.RequestException as e:
        logger.error("NLP service error: %s — requeueing", e)
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)
    except psycopg.Error as e:
        logger.error("Database error: %s — requeueing", e)
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)
    except Exception as e:
        logger.exception("Unexpected error: %s — discarding", e)
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)


def main():
    while True:
        try:
            params = pika.URLParameters(RABBITMQ_URL)
            conn = pika.BlockingConnection(params)
            channel = conn.channel()
            channel.queue_declare(queue=RABBITMQ_QUEUE, durable=True)
            channel.basic_qos(prefetch_count=1)
            channel.basic_consume(queue=RABBITMQ_QUEUE, on_message_callback=callback)
            logger.info("Worker listening on %s", RABBITMQ_QUEUE)
            channel.start_consuming()
        except Exception as e:
            logger.error("Connection error: %s — retrying in 5s", e)
            time.sleep(5)


if __name__ == "__main__":
    main()
