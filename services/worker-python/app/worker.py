import json
import datetime
import logging
import os
import time

import pika
import psycopg
from psycopg.rows import dict_row
import requests

from .entity_relations import disease_relation_rows, location_relation_rows

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("worker")

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/%2f")
RABBITMQ_QUEUE = os.getenv("RABBITMQ_QUEUE", "disease.raw")
RABBITMQ_SOCIAL_QUEUE = os.getenv("RABBITMQ_SOCIAL_QUEUE", "disease.social")
RABBITMQ_SKDR_QUEUE = os.getenv("RABBITMQ_SKDR_QUEUE", "disease.skdr")
DATABASE_URL = os.getenv("DATABASE_URL", "postgres://postgres:root@host.docker.internal:9898/disease_ai")
NLP_SERVICE_URL = os.getenv("NLP_SERVICE_URL", "http://localhost:8003")
CURRENT_YEAR_ONLY = os.getenv("CURRENT_YEAR_ONLY", "true").lower() in {"1", "true", "yes", "on"}
ENTITY_LOCATION_STORAGE_ENABLED = os.getenv(
    "ENTITY_LOCATION_STORAGE_ENABLED", "true"
).lower() in {"1", "true", "yes", "on"}
ENTITY_DISEASE_STORAGE_ENABLED = os.getenv(
    "ENTITY_DISEASE_STORAGE_ENABLED", "true"
).lower() in {"1", "true", "yes", "on"}


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
_DELIVERY_ATTEMPTS: dict[str, int] = {}
HISTORICAL_FAST_NON_HEALTH = os.getenv("HISTORICAL_FAST_NON_HEALTH", "false").lower() in {"1", "true", "yes", "on"}
HEALTH_HINTS = (
    "health", "disease", "illness", "hospital", "patient", "virus", "fever", "dengue",
    "malaria", "covid", "flu", "outbreak", "wabah", "penyakit", "rumah sakit", "pasien",
    "demam", "kesihatan", "pesakit", "โรค", "ไข้", "โรงพยาบาล", "ជំងឺ", "គ្រុន",
    "ພະຍາດ", "ໄຂ້", "ໂຮງໝໍ", "ရောဂါ", "ဖျား", "ဆေးရုံ", "bệnh", "sốt", "bệnh viện",
)


def get_db():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def persist_location_relations(conn, event_id, nlp: dict) -> None:
    if not ENTITY_LOCATION_STORAGE_ENABLED:
        return
    for relation in location_relation_rows(nlp):
        conn.execute(
            """INSERT INTO disease_event_locations
               (disease_event_id, location_ref, location_name, role, country,
                latitude, longitude, case_count, death_count, evidence)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (disease_event_id, location_ref, role) DO UPDATE SET
                 country = EXCLUDED.country,
                 latitude = EXCLUDED.latitude,
                 longitude = EXCLUDED.longitude,
                 case_count = EXCLUDED.case_count,
                 death_count = EXCLUDED.death_count,
                 evidence = EXCLUDED.evidence""",
            (
                event_id,
                relation["location_ref"],
                relation["location_name"],
                relation["role"],
                relation.get("country"),
                relation.get("latitude"),
                relation.get("longitude"),
                relation.get("case_count"),
                relation.get("death_count"),
                relation.get("evidence"),
            ),
        )


def persist_disease_relations(conn, event_id, nlp: dict) -> None:
    if not ENTITY_DISEASE_STORAGE_ENABLED:
        return
    for relation in disease_relation_rows(nlp):
        conn.execute(
            """INSERT INTO disease_event_diseases
               (disease_event_id, surface_form, disease_name, role, icd11_code,
                confidence, case_count, death_count, evidence, resolution_source)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (disease_event_id, disease_name, role) DO UPDATE SET
                 surface_form = EXCLUDED.surface_form,
                 icd11_code = EXCLUDED.icd11_code,
                 confidence = EXCLUDED.confidence,
                 case_count = EXCLUDED.case_count,
                 death_count = EXCLUDED.death_count,
                 evidence = EXCLUDED.evidence,
                 resolution_source = EXCLUDED.resolution_source""",
            (
                event_id,
                relation["surface_form"],
                relation["disease_name"],
                relation["role"],
                relation.get("icd11_code"),
                relation.get("confidence"),
                relation.get("case_count"),
                relation.get("death_count"),
                relation.get("evidence"),
                relation.get("resolution_source"),
            ),
        )


def mark_message_processing(msg: dict) -> None:
    """Make the NLP queue visible to the dashboard while analysis is running.

    Collector messages normally do not have a raw_report row until after NLP
    finishes. Create/update a provisional row for URL-based messages so the
    API can expose the in-flight NLP count without changing the final dedupe
    behavior below.
    """
    raw_id = msg.get("raw_report_id")
    url = msg.get("url")
    skdr_report_id = msg.get("skdr_report_id")
    if not raw_id and not url and not skdr_report_id:
        return

    with get_db() as conn:
        if raw_id:
            conn.execute(
                "UPDATE raw_reports SET processing_status='PROCESSING' WHERE id=%s",
                (raw_id,),
            )
        elif url:
            conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (url,))
            existing = conn.execute(
                """SELECT id FROM raw_reports
                   WHERE url=%s
                   ORDER BY created_at DESC
                   LIMIT 1
                   FOR UPDATE""",
                (url,),
            ).fetchone()
            if existing:
                conn.execute(
                    "UPDATE raw_reports SET processing_status='PROCESSING' WHERE id=%s",
                    (existing["id"],),
                )
            else:
                conn.execute(
                    """INSERT INTO raw_reports
                       (source_type, source_name, published_at, original_text, url, object_path, processing_status)
                       VALUES (%s, %s, %s, %s, %s, %s, 'PROCESSING')""",
                    (
                        msg.get("source_type"),
                        msg.get("source_name"),
                        parse_date(msg.get("published_at")),
                        msg.get("text", ""),
                        url,
                        msg.get("object_path"),
                    ),
                )
        else:
            skdr_row = conn.execute(
                "SELECT raw_report_id FROM skdr_reports WHERE id=%s FOR UPDATE",
                (skdr_report_id,),
            ).fetchone()
            if skdr_row and skdr_row["raw_report_id"]:
                conn.execute(
                    "UPDATE raw_reports SET processing_status='PROCESSING' WHERE id=%s",
                    (skdr_row["raw_report_id"],),
                )
            elif skdr_row:
                raw_row = conn.execute(
                    """INSERT INTO raw_reports
                       (source_type, source_name, published_at, original_text, url, object_path, processing_status)
                       VALUES (%s, %s, %s, %s, NULL, NULL, 'PROCESSING')
                       RETURNING id""",
                    (
                        msg.get("source_type"),
                        msg.get("source_name"),
                        parse_date(msg.get("published_at")),
                        msg.get("text", ""),
                    ),
                ).fetchone()
                conn.execute(
                    "UPDATE skdr_reports SET raw_report_id=%s, updated_at=NOW() WHERE id=%s",
                    (raw_row["id"], skdr_report_id),
                )
        conn.commit()


def mark_message_failed(msg: dict) -> None:
    """Remove a permanently failed message from the in-flight NLP count."""
    raw_id = msg.get("raw_report_id")
    url = msg.get("url")
    skdr_report_id = msg.get("skdr_report_id")
    if not raw_id and not url and not skdr_report_id:
        return

    try:
        with get_db() as conn:
            if raw_id:
                conn.execute(
                    "UPDATE raw_reports SET processing_status='FAILED' WHERE id=%s",
                    (raw_id,),
                )
            elif url:
                conn.execute(
                    """UPDATE raw_reports SET processing_status='FAILED'
                       WHERE id=(SELECT id FROM raw_reports WHERE url=%s ORDER BY created_at DESC LIMIT 1)""",
                    (url,),
                )
            else:
                conn.execute(
                    """UPDATE raw_reports SET processing_status='FAILED'
                       WHERE id=(SELECT raw_report_id FROM skdr_reports WHERE id=%s)""",
                    (skdr_report_id,),
                )
            conn.commit()
    except Exception:
        logger.exception("Could not mark failed NLP message")


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
        timeout=120,
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

        mark_message_processing(msg)

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
            if source_type == "skdr_api" and msg.get("skdr_report_id"):
                # SKDR records have no URL and can be replayed after retries.
                # Resolve the single raw_report row through skdr_reports and
                # replace its event instead of inserting a duplicate.
                skdr_row = conn.execute(
                    """SELECT raw_report_id FROM skdr_reports
                       WHERE id=%s FOR UPDATE""",
                    (msg.get("skdr_report_id"),),
                ).fetchone()
                if not skdr_row:
                    raise RuntimeError("SKDR report reference not found")
                raw_id = skdr_row["raw_report_id"]
                if raw_id:
                    conn.execute("DELETE FROM disease_events WHERE raw_report_id=%s", (raw_id,))
                    conn.execute(
                        """UPDATE raw_reports
                           SET source_type=%s, source_name=%s,
                               published_at=%s, original_text=%s,
                               processing_status='PROCESSED'
                           WHERE id=%s""",
                        (
                            msg.get("source_type"), msg.get("source_name"),
                            parse_date(msg.get("published_at")), msg.get("text"), raw_id,
                        ),
                    )
                else:
                    cur = conn.execute(
                        """INSERT INTO raw_reports
                           (source_type, source_name, published_at, original_text, url, object_path, processing_status)
                           VALUES (%s, %s, %s, %s, NULL, NULL, 'PROCESSED')
                           RETURNING id""",
                        (
                            msg.get("source_type"), msg.get("source_name"),
                            parse_date(msg.get("published_at")), msg.get("text"),
                        ),
                    )
                    raw_id = cur.fetchone()["id"]
                    conn.execute(
                        "UPDATE skdr_reports SET raw_report_id=%s, updated_at=NOW() WHERE id=%s",
                        (raw_id, msg.get("skdr_report_id")),
                    )
            elif raw_id:
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
                        location_name, geom, disease_extracted, disease_mentions, disease_classification,
                        case_count, death_count, confidence, outbreak_alert, sentiment, event_type, relevance_score,
                         source_credibility, source_credibility_label, is_health_related)
                       VALUES (%s, %s, %s, %s, %s, %s, %s,
                               CASE WHEN %s::float8 IS NULL OR %s::float8 IS NULL THEN NULL
                                    ELSE ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                               END,
                                 %s::jsonb, %s::jsonb, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, FALSE)""",
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
                        json.dumps(nlp.get("disease_mentions", [])),
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

            event_cursor = conn.execute(
                """INSERT INTO disease_events
                   (raw_report_id, source_type, source_name, published_at, original_text, language,
                         location_name, geom, symptoms, disease_extracted, disease_mentions, disease_classification,
                    case_count, death_count, confidence, outbreak_alert,
                    sentiment, event_type, relevance_score,
                    source_credibility, source_credibility_label, is_health_related)
                   VALUES (%s, %s, %s, %s, %s, %s, %s,
                            CASE WHEN %s::float8 IS NULL OR %s::float8 IS NULL THEN NULL
                                 ELSE ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                            END,
                            %s::jsonb, %s::jsonb, %s::jsonb, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE)
                   RETURNING id""",
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
                    json.dumps(nlp.get("disease_mentions", [])),
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
            event_id = event_cursor.fetchone()["id"]
            persist_location_relations(conn, event_id, nlp)
            persist_disease_relations(conn, event_id, nlp)
            conn.commit()

        logger.info("Processed successfully: raw_id=%s", raw_id)
        msg_key = str(msg.get("raw_report_id") or msg.get("url") or hash(msg.get("text", "")[:120]))
        _DELIVERY_ATTEMPTS.pop(msg_key, None)
        ch.basic_ack(delivery_tag=method.delivery_tag)

    except json.JSONDecodeError as e:
        logger.error("Invalid JSON message: %s", e)
        ch.basic_ack(delivery_tag=method.delivery_tag)
    except requests.RequestException as e:
        logger.error("NLP service error: %s", e)
        msg_key = str(msg.get("raw_report_id") or msg.get("url") or hash(msg.get("text", "")[:120])) if 'msg' in locals() else str(method.delivery_tag)
        attempts = _DELIVERY_ATTEMPTS.get(msg_key, 0) + 1
        _DELIVERY_ATTEMPTS[msg_key] = attempts
        if attempts >= 3:
            logger.error("Message %s failed %d times with NLP error, dropping poison pill: %s", msg_key, attempts, e)
            mark_message_failed(msg)
            _DELIVERY_ATTEMPTS.pop(msg_key, None)
            ch.basic_ack(delivery_tag=method.delivery_tag)
        else:
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)
    except psycopg.Error as e:
        diagnostic = getattr(e, "diag", None)
        table_name = getattr(diagnostic, "table_name", None) if diagnostic else None
        column_name = getattr(diagnostic, "column_name", None) if diagnostic else None
        data_type = getattr(diagnostic, "datatype_name", None) if diagnostic else None
        msg_key = str(msg.get("raw_report_id") or msg.get("skdr_report_id") or msg.get("url") or hash(msg.get("text", "")[:120])) if "msg" in locals() else str(method.delivery_tag)
        attempts = _DELIVERY_ATTEMPTS.get(msg_key, 0) + 1
        _DELIVERY_ATTEMPTS[msg_key] = attempts
        logger.error(
            "Database error attempt=%d key=%s table=%s column=%s datatype=%s: %s",
            attempts, msg_key, table_name or "?", column_name or "?", data_type or "?", e,
        )
        if attempts >= 3:
            logger.error("Database poison pill failed %d times; marking failed and acknowledging key=%s", attempts, msg_key)
            if "msg" in locals():
                mark_message_failed(msg)
            _DELIVERY_ATTEMPTS.pop(msg_key, None)
            ch.basic_ack(delivery_tag=method.delivery_tag)
        else:
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
            if RABBITMQ_SKDR_QUEUE not in {RABBITMQ_QUEUE, RABBITMQ_SOCIAL_QUEUE}:
                channel.queue_declare(queue=RABBITMQ_SKDR_QUEUE, durable=True)
            channel.basic_qos(prefetch_count=1)
            channel.basic_consume(queue=RABBITMQ_QUEUE, on_message_callback=callback)
            if RABBITMQ_SOCIAL_QUEUE != RABBITMQ_QUEUE:
                channel.basic_consume(queue=RABBITMQ_SOCIAL_QUEUE, on_message_callback=callback)
            if RABBITMQ_SKDR_QUEUE not in {RABBITMQ_QUEUE, RABBITMQ_SOCIAL_QUEUE}:
                channel.basic_consume(queue=RABBITMQ_SKDR_QUEUE, on_message_callback=callback)
            queues = [RABBITMQ_QUEUE]
            for queue in (RABBITMQ_SOCIAL_QUEUE, RABBITMQ_SKDR_QUEUE):
                if queue not in queues:
                    queues.append(queue)
            if len(queues) > 1:
                logger.info("Worker listening on %s", ", ".join(queues))
            else:
                logger.info("Worker listening on %s", RABBITMQ_QUEUE)
            channel.start_consuming()
        except Exception as e:
            logger.error("Connection error: %s — retrying in 5s", e)
            time.sleep(5)


if __name__ == "__main__":
    main()
