import json
import datetime
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
RABBITMQ_SOCIAL_QUEUE = os.getenv("RABBITMQ_SOCIAL_QUEUE", "disease.social")
DATABASE_URL = os.getenv("DATABASE_URL", "postgres://postgres:root@host.docker.internal:9898/disease_ai")
NLP_SERVICE_URL = os.getenv("NLP_SERVICE_URL", "http://localhost:8003")
CURRENT_YEAR_ONLY = os.getenv("CURRENT_YEAR_ONLY", "true").lower() in {"1", "true", "yes", "on"}


def env_year(name: str = "CURRENT_YEAR") -> int:
    """Return a sane year when an optional env value is blank or malformed."""
    raw_value = os.getenv(name, "").strip()
    try:
        year = int(raw_value)
        if 1900 <= year <= 2200:
            return year
    except ValueError:
        pass
    return datetime.date.today().year


CURRENT_YEAR = env_year()
HISTORICAL_FAST_NON_HEALTH = os.getenv("HISTORICAL_FAST_NON_HEALTH", "false").lower() in {"1", "true", "yes", "on"}
HEALTH_HINTS = (
    "health", "disease", "illness", "hospital", "patient", "virus", "fever", "dengue",
    "malaria", "covid", "flu", "outbreak", "wabah", "penyakit", "rumah sakit", "pasien",
    "demam", "kesihatan", "pesakit", "โรค", "ไข้", "โรงพยาบาล", "ជំងឺ", "គ្រុន",
    "ພະຍາດ", "ໄຂ້", "ໂຮງໝໍ", "ရောဂါ", "ဖျား", "ဆေးရုံ", "bệnh", "sốt", "bệnh viện",
)


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


def is_allowed_processing_year(value: str) -> bool:
    """Keep the worker aligned with the collector's current-year policy."""
    if not CURRENT_YEAR_ONLY:
        return True
    parsed = parse_date(value)
    return bool(parsed and int(parsed[:4]) == CURRENT_YEAR)


def fast_non_health_result(msg: dict) -> dict | None:
    if not HISTORICAL_FAST_NON_HEALTH:
        return None
    text = (msg.get("text") or "").lower()
    if any(hint in text for hint in HEALTH_HINTS):
        return None
    return {
        "language": msg.get("source_language") or "unknown",
        "location_name": None,
        "latitude": None,
        "longitude": None,
        "symptoms": [],
        "disease_extracted": [],
        "disease_classification": "NEGATIVE - not health related",
        "case_count": 0,
        "death_count": 0,
        "confidence": 0.99,
        "outbreak_alert": False,
        "sentiment": "neutral",
        "event_type": "unknown",
        "relevance_score": "low",
        "source_credibility": 0.65,
        "source_credibility_label": "rss",
        "is_health_related": False,
    }


def call_nlp(text: str, source_type: str, source_name: str, published_at: str,
             source_language: str = "", source_country: str = "") -> dict:
    url = f"{NLP_SERVICE_URL}/nlp/analyze"
    resp = requests.post(
        url,
        json={
            "text": text,
            "source_type": source_type,
            "source_name": source_name,
            "published_at": published_at,
            "source_language": source_language,
            "source_country": source_country,
            "historical_fast": HISTORICAL_FAST_NON_HEALTH,
        },
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


def callback(ch, method, properties, body):
    try:
        msg = json.loads(body)
        published_at = msg.get("published_at", "")
        source_type = msg.get("source_type", "")
        if source_type != "social_media" and not is_allowed_processing_year(published_at):
            logger.info(
                "Skipping non-current/undated message: published_at=%s current_year=%s",
                published_at or "<empty>", CURRENT_YEAR,
            )
            ch.basic_ack(delivery_tag=method.delivery_tag)
            return
        logger.info(
            "Processing message: raw_report_id=%s source_type=%s len=%d",
            msg.get("raw_report_id", "N/A"),
            msg.get("source_type", ""),
            len(msg.get("text", "")),
        )

        nlp = fast_non_health_result(msg)
        if nlp is None:
            nlp = call_nlp(
                msg.get("text", ""),
                msg.get("source_type", ""),
                msg.get("source_name", ""),
                published_at,
                msg.get("source_language", ""),
                msg.get("source_country", ""),
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
            elif msg.get("url"):
                # RSS and social feeds are replayed on every scheduled run.
                # Reuse the latest report for the URL so repeated collection
                # refreshes the NLP result instead of inflating
                # raw_reports/disease_events. The transaction-scoped lock
                # also protects against duplicate URL messages with multiple
                # workers.
                conn.execute(
                    "SELECT pg_advisory_xact_lock(hashtext(%s))",
                    (msg.get("url"),),
                )
                existing = conn.execute(
                    """SELECT id FROM raw_reports
                       WHERE url=%s
                       ORDER BY created_at DESC
                       LIMIT 1
                       FOR UPDATE""",
                    (msg.get("url"),),
                ).fetchone()
                if existing:
                    raw_id = existing["id"]
                    conn.execute(
                        "DELETE FROM disease_events WHERE raw_report_id=%s",
                        (raw_id,),
                    )
                    conn.execute(
                        """UPDATE raw_reports
                           SET source_type=%s, source_name=%s,
                               published_at=COALESCE(%s, published_at),
                               original_text=%s, object_path=%s,
                               processing_status='PROCESSED'
                           WHERE id=%s""",
                        (
                            msg.get("source_type"),
                            msg.get("source_name"),
                            parse_date(msg.get("published_at")),
                            msg.get("text"),
                            msg.get("object_path"),
                            raw_id,
                        ),
                    )
                else:
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
                    "UPDATE raw_reports SET processing_status='NON_HEALTH' WHERE id=%s",
                    (raw_id,),
                )

                conn.execute(
                    """INSERT INTO disease_events
                       (raw_report_id, source_type, source_name, published_at, original_text, language,
                        location_name, geom, disease_extracted, disease_classification,
                        case_count, death_count, confidence, outbreak_alert, sentiment, event_type, relevance_score,
                        source_credibility, source_credibility_label, is_health_related)
                       VALUES (%s, %s, %s, %s, %s, %s, %s,
                               CASE WHEN %s::float8 IS NULL OR %s::float8 IS NULL THEN NULL
                                    ELSE ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                               END,
                               %s::jsonb, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, FALSE)""",
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
                        json.dumps(nlp.get("disease_extracted", [])),
                        nlp.get("disease_classification"),
                        nlp.get("case_count", 0),
                        nlp.get("death_count", 0),
                        nlp.get("confidence", 0.0),
                        nlp.get("outbreak_alert", False),
                        nlp.get("sentiment"),
                        nlp.get("event_type"),
                        nlp.get("relevance_score"),
                        nlp.get("source_credibility", 0.50),
                        nlp.get("source_credibility_label", ""),
                    ),
                )
                conn.commit()
                logger.info("Non-health event inserted: raw_id=%s", raw_id)
                ch.basic_ack(delivery_tag=method.delivery_tag)
                return

            conn.execute(
                """INSERT INTO disease_events
                   (raw_report_id, source_type, source_name, published_at, original_text, language,
                    location_name, geom, symptoms, disease_extracted, disease_classification,
                    case_count, death_count, confidence, outbreak_alert,
                    sentiment, event_type, relevance_score,
                    source_credibility, source_credibility_label, is_health_related)
                   VALUES (%s, %s, %s, %s, %s, %s, %s,
                            CASE WHEN %s::float8 IS NULL OR %s::float8 IS NULL THEN NULL
                                 ELSE ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                            END,
                           %s::jsonb, %s::jsonb, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE)""",
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
                    nlp.get("source_credibility", 0.50),
                    nlp.get("source_credibility_label", ""),
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
            if RABBITMQ_SOCIAL_QUEUE != RABBITMQ_QUEUE:
                channel.queue_declare(queue=RABBITMQ_SOCIAL_QUEUE, durable=True)
            channel.basic_qos(prefetch_count=1)
            channel.basic_consume(queue=RABBITMQ_QUEUE, on_message_callback=callback)
            if RABBITMQ_SOCIAL_QUEUE != RABBITMQ_QUEUE:
                channel.basic_consume(queue=RABBITMQ_SOCIAL_QUEUE, on_message_callback=callback)
                logger.info("Worker listening on %s and %s", RABBITMQ_QUEUE, RABBITMQ_SOCIAL_QUEUE)
            else:
                logger.info("Worker listening on %s", RABBITMQ_QUEUE)
            channel.start_consuming()
        except Exception as e:
            logger.error("Connection error: %s — retrying in 5s", e)
            time.sleep(5)


if __name__ == "__main__":
    main()

