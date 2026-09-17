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
from .geo import st_makepoint_args

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
MAX_DELIVERY_RETRIES = max(1, int(os.getenv("RABBITMQ_MAX_DELIVERY_RETRIES", "4")))
RETRY_BASE_MILLISECONDS = max(1000, int(os.getenv("RABBITMQ_RETRY_BASE_MILLISECONDS", "5000")))
RETRY_MAX_MILLISECONDS = max(RETRY_BASE_MILLISECONDS, int(os.getenv("RABBITMQ_RETRY_MAX_MILLISECONDS", "60000")))
HISTORICAL_FAST_NON_HEALTH = os.getenv("HISTORICAL_FAST_NON_HEALTH", "false").lower() in {"1", "true", "yes", "on"}
HEALTH_HINTS = (
    "health", "disease", "illness", "hospital", "patient", "virus", "fever", "dengue",
    "malaria", "covid", "flu", "outbreak", "wabah", "penyakit", "rumah sakit", "pasien",
    "demam", "kesihatan", "pesakit", "โรค", "ไข้", "โรงพยาบาล", "ជំងឺ", "គ្រុន",
    "ພະຍາດ", "ໄຂ້", "ໂຮງໝໍ", "ရောဂါ", "ဖျား", "ဆေးရုံ", "bệnh", "sốt", "bệnh viện",
)


def get_db():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def document_identity_key(msg: dict) -> str:
    """Return the strongest identity available before NLP starts."""
    for field in ("content_hash", "canonical_url", "url_hash", "normalized_url", "url"):
        value = str(msg.get(field) or "").strip()
        if value:
            return f"crawler-document:{field}:{value}"
    raw_id = str(msg.get("raw_report_id") or "").strip()
    return f"crawler-raw:{raw_id}" if raw_id else ""


def find_completed_duplicate(conn, msg: dict):
    """Find an already analyzed report using layered, database-backed identity."""
    content_hash = str(msg.get("content_hash") or "").strip() or None
    canonical_url = str(msg.get("canonical_url") or "").strip() or None
    url_digest = str(msg.get("url_hash") or "").strip() or None
    normalized_url = str(msg.get("normalized_url") or "").strip() or None
    url = str(msg.get("url") or "").strip() or None
    raw_id = msg.get("raw_report_id")
    if not any((content_hash, canonical_url, url_digest, normalized_url, url, raw_id)):
        return None
    return conn.execute(
        """SELECT rr.id, de.id AS event_id
           FROM raw_reports rr
           JOIN LATERAL (
               SELECT event.id
               FROM disease_events event
               WHERE event.raw_report_id=rr.id
               ORDER BY event.created_at DESC
               LIMIT 1
           ) de ON TRUE
           WHERE rr.processing_status IN ('PROCESSED', 'NON_HEALTH')
             AND (
                 (%s::uuid IS NOT NULL AND rr.id=%s::uuid)
                 OR (%s::text IS NOT NULL AND rr.content_hash=%s)
                 OR (%s::text IS NOT NULL AND rr.canonical_url=%s)
                 OR (%s::text IS NOT NULL AND rr.url_hash=%s)
                 OR (%s::text IS NOT NULL AND rr.normalized_url=%s)
                 OR (%s::text IS NOT NULL AND rr.url=%s)
             )
           ORDER BY
             CASE WHEN %s::text IS NOT NULL AND rr.content_hash=%s THEN 0
                  WHEN %s::text IS NOT NULL AND rr.canonical_url=%s THEN 1
                  ELSE 2 END,
             rr.created_at DESC
           LIMIT 1""",
        (
            raw_id, raw_id,
            content_hash, content_hash,
            canonical_url, canonical_url,
            url_digest, url_digest,
            normalized_url, normalized_url,
            url, url,
            content_hash, content_hash,
            canonical_url, canonical_url,
        ),
    ).fetchone()


def mark_duplicate_input(msg: dict, duplicate_raw_id) -> None:
    """Close an already-created RAW row while retaining its duplicate lineage."""
    raw_id = msg.get("raw_report_id")
    if not raw_id or str(raw_id) == str(duplicate_raw_id):
        return
    with get_db() as conn:
        conn.execute(
            """UPDATE raw_reports
               SET processing_status='DUPLICATE', duplicate_of_raw_report_id=%s,
                   normalized_url=COALESCE(normalized_url, %s),
                   canonical_url=COALESCE(canonical_url, %s),
                   url_hash=COALESCE(url_hash, %s),
                   content_hash=COALESCE(content_hash, %s),
                   final_url=COALESCE(final_url, %s),
                   author=COALESCE(author, %s)
               WHERE id=%s""",
            (
                duplicate_raw_id,
                msg.get("normalized_url"), msg.get("canonical_url"),
                msg.get("url_hash"), msg.get("content_hash"),
                msg.get("final_url"), msg.get("author"), raw_id,
            ),
        )
        conn.commit()


def persist_location_relations(conn, event_id, nlp: dict) -> None:
    if not ENTITY_LOCATION_STORAGE_ENABLED:
        return
    for relation in location_relation_rows(nlp):
        conn.execute(
            """INSERT INTO disease_event_locations
               (disease_event_id, location_ref, location_name, role, country,
                latitude, longitude, case_count, death_count, evidence,
                geocode_confidence, geocode_needs_review)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (disease_event_id, location_ref, role) DO UPDATE SET
                 country = EXCLUDED.country,
                 latitude = EXCLUDED.latitude,
                 longitude = EXCLUDED.longitude,
                 case_count = EXCLUDED.case_count,
                 death_count = EXCLUDED.death_count,
                 evidence = EXCLUDED.evidence,
                 geocode_confidence = EXCLUDED.geocode_confidence,
                 geocode_needs_review = EXCLUDED.geocode_needs_review""",
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
                relation.get("geocode_confidence"),
                relation.get("geocode_needs_review", False),
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
    if not raw_id and not url:
        return

    with get_db() as conn:
        if raw_id:
            conn.execute(
                """UPDATE raw_reports SET processing_status='PROCESSING',
                     normalized_url=COALESCE(normalized_url,%s), canonical_url=COALESCE(canonical_url,%s),
                     url_hash=COALESCE(url_hash,%s), content_hash=COALESCE(content_hash,%s),
                     final_url=COALESCE(final_url,%s), author=COALESCE(author,%s)
                   WHERE id=%s""",
                (
                    msg.get("normalized_url"), msg.get("canonical_url"), msg.get("url_hash"),
                    msg.get("content_hash"), msg.get("final_url"), msg.get("author"), raw_id,
                ),
            )
        elif url:
            existing = conn.execute(
                """SELECT id FROM raw_reports
                   WHERE (url=%s
                          OR (%s::text IS NOT NULL AND normalized_url=%s)
                          OR (%s::text IS NOT NULL AND canonical_url=%s)
                          OR (%s::text IS NOT NULL AND url_hash=%s)
                          OR (%s::text IS NOT NULL AND content_hash=%s))
                   ORDER BY created_at DESC
                   LIMIT 1
                   FOR UPDATE""",
                (
                    url,
                    msg.get("normalized_url"), msg.get("normalized_url"),
                    msg.get("canonical_url"), msg.get("canonical_url"),
                    msg.get("url_hash"), msg.get("url_hash"),
                    msg.get("content_hash"), msg.get("content_hash"),
                ),
            ).fetchone()
            if existing:
                conn.execute(
                    """UPDATE raw_reports SET processing_status='PROCESSING',
                         normalized_url=COALESCE(normalized_url,%s), canonical_url=COALESCE(canonical_url,%s),
                         url_hash=COALESCE(url_hash,%s), content_hash=COALESCE(content_hash,%s),
                         final_url=COALESCE(final_url,%s), author=COALESCE(author,%s)
                       WHERE id=%s""",
                    (
                        msg.get("normalized_url"), msg.get("canonical_url"), msg.get("url_hash"),
                        msg.get("content_hash"), msg.get("final_url"), msg.get("author"), existing["id"],
                    ),
                )
            else:
                conn.execute(
                    """INSERT INTO raw_reports
                       (source_type, source_name, published_at, original_text, url, object_path, processing_status,
                        normalized_url, canonical_url, url_hash, content_hash, final_url, author)
                       VALUES (%s, %s, %s, %s, %s, %s, 'PROCESSING', %s, %s, %s, %s, %s, %s)""",
                    (
                        msg.get("source_type"),
                        msg.get("source_name"),
                        parse_date(msg.get("published_at")),
                        msg.get("text", ""),
                        url,
                        msg.get("object_path"),
                        msg.get("normalized_url"), msg.get("canonical_url"), msg.get("url_hash"),
                        msg.get("content_hash"), msg.get("final_url"), msg.get("author"),
                    ),
                )
        conn.commit()


def mark_message_failed(msg: dict) -> None:
    """Remove a permanently failed message from the in-flight NLP count."""
    raw_id = msg.get("raw_report_id")
    url = msg.get("url")
    if not raw_id and not url:
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
    url = f"{NLP_SERVICE_URL}/nlp/analyze/raw"
    payload = {
        "text": text,
        "source_type": source_type,
        "source_name": source_name,
        "published_at": published_at,
        "source_language": source_language,
        "source_country": source_country,
        "historical_fast": HISTORICAL_FAST_NON_HEALTH,
    }
    resp = requests.post(url, json=payload, timeout=120)
    resp.raise_for_status()
    return resp.json()


def retry_delay_milliseconds(retry_count: int) -> int:
    return min(RETRY_MAX_MILLISECONDS, RETRY_BASE_MILLISECONDS * (2 ** max(0, retry_count - 1)))


def schedule_rabbit_retry(ch, method, properties, body, reason: str) -> bool:
    """Ack the delivery only after a durable delayed retry has been published."""
    headers = dict(getattr(properties, "headers", None) or {})
    retry_count = int(headers.get("x-retry-count", 0)) + 1
    if retry_count > MAX_DELIVERY_RETRIES:
        return False
    queue = str(getattr(method, "routing_key", "") or RABBITMQ_QUEUE)
    retry_queue = f"{queue}.retry"
    delay_ms = retry_delay_milliseconds(retry_count)
    headers.update({
        "x-retry-count": retry_count,
        "x-last-error": reason.replace("\n", " ")[:180],
    })
    published = ch.basic_publish(
        exchange="",
        routing_key=retry_queue,
        body=body,
        properties=pika.BasicProperties(
            delivery_mode=2,
            content_type="application/json",
            headers=headers,
            expiration=str(delay_ms),
        ),
        mandatory=True,
    )
    if published is False:
        return False
    ch.basic_ack(delivery_tag=method.delivery_tag)
    logger.warning(
        "Scheduled durable RabbitMQ retry: queue=%s attempt=%d delay_ms=%d error=%s",
        queue, retry_count, delay_ms, reason[:180],
    )
    return True


def callback(ch, method, properties, body):
    identity_lock_conn = None
    identity_lock_key = ""
    try:
        msg = json.loads(body)
        published_at = msg.get("published_at", "")
        source_type = msg.get("source_type", "")
        if source_type == "skdr_api":
            logger.info("SKDR processing is disabled. Dropping SKDR message %s", method.delivery_tag)
            ch.basic_ack(delivery_tag=method.delivery_tag)
            return
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

        identity_lock_key = document_identity_key(msg)
        if identity_lock_key:
            identity_lock_conn = get_db()
            identity_lock_conn.autocommit = True
            identity_lock_conn.execute(
                "SELECT pg_advisory_lock(hashtext(%s))", (identity_lock_key,)
            )
            duplicate = find_completed_duplicate(identity_lock_conn, msg)
            if duplicate:
                logger.info(
                    "Skipping duplicate before NLP: identity=%s duplicate_raw_id=%s",
                    identity_lock_key, duplicate["id"],
                )
                mark_duplicate_input(msg, duplicate["id"])
                ch.basic_ack(delivery_tag=method.delivery_tag)
                return

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
            if raw_id:
                # Rust backend already inserted raw_reports — update status
                conn.execute(
                    """UPDATE raw_reports SET processing_status='PROCESSED',
                         normalized_url=COALESCE(normalized_url,%s), canonical_url=COALESCE(canonical_url,%s),
                         url_hash=COALESCE(url_hash,%s), content_hash=COALESCE(content_hash,%s),
                         final_url=COALESCE(final_url,%s), author=COALESCE(author,%s)
                       WHERE id=%s""",
                    (
                        msg.get("normalized_url"), msg.get("canonical_url"), msg.get("url_hash"),
                        msg.get("content_hash"), msg.get("final_url"), msg.get("author"), raw_id,
                    ),
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
                       WHERE (url=%s
                              OR (%s::text IS NOT NULL AND normalized_url=%s)
                              OR (%s::text IS NOT NULL AND canonical_url=%s)
                              OR (%s::text IS NOT NULL AND url_hash=%s)
                              OR (%s::text IS NOT NULL AND content_hash=%s))
                       ORDER BY created_at DESC
                       LIMIT 1
                       FOR UPDATE""",
                    (
                        msg.get("url"),
                        msg.get("normalized_url"), msg.get("normalized_url"),
                        msg.get("canonical_url"), msg.get("canonical_url"),
                        msg.get("url_hash"), msg.get("url_hash"),
                        msg.get("content_hash"), msg.get("content_hash"),
                    ),
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
                               processing_status='PROCESSED',
                               normalized_url=COALESCE(normalized_url,%s),
                               canonical_url=COALESCE(canonical_url,%s),
                               url_hash=COALESCE(url_hash,%s),
                               content_hash=COALESCE(content_hash,%s),
                               final_url=COALESCE(final_url,%s),
                               author=COALESCE(author,%s)
                           WHERE id=%s""",
                        (
                            msg.get("source_type"),
                            msg.get("source_name"),
                            parse_date(msg.get("published_at")),
                            msg.get("text"),
                            msg.get("object_path"),
                            msg.get("normalized_url"), msg.get("canonical_url"), msg.get("url_hash"),
                            msg.get("content_hash"), msg.get("final_url"), msg.get("author"),
                            raw_id,
                        ),
                    )
                else:
                    cur = conn.execute(
                        """INSERT INTO raw_reports
                           (source_type, source_name, published_at, original_text, url, object_path, processing_status,
                            normalized_url, canonical_url, url_hash, content_hash, final_url, author)
                           VALUES (%s, %s, %s, %s, %s, %s, 'PROCESSED', %s, %s, %s, %s, %s, %s)
                           RETURNING id""",
                        (
                            msg.get("source_type"),
                            msg.get("source_name"),
                            parse_date(msg.get("published_at")),
                            msg.get("text"),
                            msg.get("url"),
                            msg.get("object_path"),
                            msg.get("normalized_url"), msg.get("canonical_url"), msg.get("url_hash"),
                            msg.get("content_hash"), msg.get("final_url"), msg.get("author"),
                        ),
                    )
                    raw_id = cur.fetchone()["id"]
            else:
                # Collector message — insert raw_reports now
                cur = conn.execute(
                    """INSERT INTO raw_reports
                       (source_type, source_name, published_at, original_text, url, object_path, processing_status,
                        normalized_url, canonical_url, url_hash, content_hash, final_url, author)
                       VALUES (%s, %s, %s, %s, %s, %s, 'PROCESSED', %s, %s, %s, %s, %s, %s)
                       RETURNING id""",
                    (
                        msg.get("source_type"),
                        msg.get("source_name"),
                        parse_date(msg.get("published_at")),
                        msg.get("text"),
                        msg.get("url"),
                        msg.get("object_path"),
                        msg.get("normalized_url"), msg.get("canonical_url"), msg.get("url_hash"),
                        msg.get("content_hash"), msg.get("final_url"), msg.get("author"),
                    ),
                )
                raw_id = cur.fetchone()["id"]

            if not nlp.get("is_health_related", True):
                conn.execute(
                    "UPDATE raw_reports SET processing_status='NON_HEALTH' WHERE id=%s",
                    (raw_id,),
                )
                conn.commit()
                logger.info("Non-health crawl retained as raw_report only: raw_id=%s", raw_id)
                ch.basic_ack(delivery_tag=method.delivery_tag)
                return

            event_cursor = conn.execute(
                """INSERT INTO disease_events
                   (raw_report_id, source_type, source_name, published_at, original_text, language,
                         location_name, province, city, geom, symptoms, disease_extracted, disease_mentions, disease_classification,
                    case_count, death_count, event_date, confirmed_cases, suspected_cases,
                    hospitalizations, epidemiological_evidence, confidence, outbreak_alert,
                    sentiment, event_type, relevance_score,
                    source_credibility, source_credibility_label, is_health_related)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s,
                            CASE WHEN %s::float8 IS NULL OR %s::float8 IS NULL THEN NULL
                                 ELSE ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                            END,
                            %s::jsonb, %s::jsonb, %s::jsonb, %s, %s, %s, %s, %s, %s, %s, %s::jsonb,
                            %s, %s, %s, %s, %s, %s, %s, TRUE)
                   RETURNING id""",
                (
                    raw_id,
                    msg.get("source_type"),
                    msg.get("source_name"),
                    parse_date(msg.get("published_at")),
                    msg.get("text"),
                    nlp["language"],
                    nlp.get("location_name"),
                    nlp.get("province"),
                    nlp.get("city"),
                    *st_makepoint_args(nlp.get("latitude"), nlp.get("longitude")),
                    json.dumps(nlp.get("symptoms", [])),
                    json.dumps(nlp.get("disease_extracted", [])),
                    json.dumps(nlp.get("disease_mentions", [])),
                    nlp.get("disease_classification"),
                    nlp.get("case_count", 0),
                    nlp.get("death_count", 0),
                    parse_date(nlp.get("event_date")),
                    nlp.get("confirmed_cases"),
                    nlp.get("suspected_cases"),
                    nlp.get("hospitalizations"),
                    json.dumps(nlp.get("epidemiological_evidence", nlp.get("evidence", []))),
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

            # --- Multi-event decomposition: insert child events ---
            sub_events = nlp.get("sub_events", [])
            if len(sub_events) >= 2:
                parent_event_id = event_id
                for sub_evt in sub_events:
                    sub_location = sub_evt.get("location_name") or nlp.get("location_name")
                    sub_disease = sub_evt.get("disease") or nlp.get("disease_classification")
                    sub_cases = sub_evt.get("case_count", 0)
                    sub_deaths = sub_evt.get("death_count", 0)
                    sub_lat = sub_evt.get("latitude")
                    sub_lon = sub_evt.get("longitude")
                    sub_country = sub_evt.get("country") or nlp.get("country")
                    sub_evidence = sub_evt.get("evidence", "")

                    child_cursor = conn.execute(
                        """INSERT INTO disease_events
                           (raw_report_id, source_type, source_name, published_at,
                            original_text, language, location_name, province, city, geom,
                            symptoms, disease_extracted, disease_mentions,
                            disease_classification, case_count, death_count,
                            confidence, outbreak_alert, sentiment, event_type,
                            relevance_score, source_credibility,
                            source_credibility_label, is_health_related,
                            parent_event_id, source_url)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s,
                                    CASE WHEN %s::float8 IS NULL OR %s::float8 IS NULL THEN NULL
                                         ELSE ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                                    END,
                                    %s::jsonb, %s::jsonb, %s::jsonb, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE,
                                    %s, %s)
                           RETURNING id""",
                        (
                            raw_id,
                            msg.get("source_type"),
                            msg.get("source_name"),
                            parse_date(msg.get("published_at")),
                            sub_evidence or msg.get("text", ""),
                            nlp["language"],
                            sub_location,
                            nlp.get("province"),
                            nlp.get("city"),
                            *st_makepoint_args(sub_lat, sub_lon),
                            json.dumps(nlp.get("symptoms", [])),
                            json.dumps([sub_disease] if sub_disease else []),
                            json.dumps(nlp.get("disease_mentions", [])),
                            sub_disease,
                            sub_cases,
                            sub_deaths,
                            nlp.get("confidence", 0.0),
                            nlp.get("outbreak_alert", False),
                            nlp.get("sentiment"),
                            nlp.get("event_type"),
                            nlp.get("relevance_score"),
                            nlp.get("source_credibility", 0.50),
                            nlp.get("source_credibility_label", ""),
                            parent_event_id,
                            msg.get("url"),
                        ),
                    )
                    child_event_id = child_cursor.fetchone()["id"]
                    # Create location relation for the child event
                    child_loc_nlp = {
                        "location_name": sub_location,
                        "latitude": sub_lat,
                        "longitude": sub_lon,
                        "country": sub_country,
                        "case_count": sub_cases,
                        "death_count": sub_deaths,
                        "locations": [{
                            "name": sub_location,
                            "latitude": sub_lat,
                            "longitude": sub_lon,
                            "country": sub_country,
                            "role": "event",
                        }] if sub_location else [],
                        "disease_classification": sub_disease,
                        "confidence": nlp.get("confidence", 0.0),
                        "disease_extracted": [sub_disease] if sub_disease else [],
                        "disease_mentions": [],
                    }
                    persist_location_relations(conn, child_event_id, child_loc_nlp)
                    persist_disease_relations(conn, child_event_id, child_loc_nlp)
                logger.info(
                    "Multi-event: inserted %d child events for raw_id=%s",
                    len(sub_events), raw_id,
                )

            conn.commit()

        logger.info("Processed successfully: raw_id=%s", raw_id)
        ch.basic_ack(delivery_tag=method.delivery_tag)

    except json.JSONDecodeError as e:
        logger.error("Invalid JSON message: %s", e)
        ch.basic_ack(delivery_tag=method.delivery_tag)
    except requests.RequestException as e:
        logger.error("NLP service error: %s", e)
        if not schedule_rabbit_retry(ch, method, properties, body, str(e)):
            logger.error("NLP retry budget exhausted; marking message failed")
            if "msg" in locals():
                mark_message_failed(msg)
            ch.basic_ack(delivery_tag=method.delivery_tag)
    except psycopg.Error as e:
        diagnostic = getattr(e, "diag", None)
        table_name = getattr(diagnostic, "table_name", None) if diagnostic else None
        column_name = getattr(diagnostic, "column_name", None) if diagnostic else None
        data_type = getattr(diagnostic, "datatype_name", None) if diagnostic else None
        logger.error(
            "Database error table=%s column=%s datatype=%s: %s",
            table_name or "?", column_name or "?", data_type or "?", e,
        )
        if not schedule_rabbit_retry(ch, method, properties, body, str(e)):
            logger.error("Database retry budget exhausted; marking message failed")
            if "msg" in locals():
                mark_message_failed(msg)
            ch.basic_ack(delivery_tag=method.delivery_tag)
    except Exception as e:
        logger.exception("Unexpected worker error: %s", e)
        if not schedule_rabbit_retry(ch, method, properties, body, str(e)):
            if "msg" in locals():
                mark_message_failed(msg)
            ch.basic_ack(delivery_tag=method.delivery_tag)
    finally:
        if identity_lock_conn is not None:
            try:
                identity_lock_conn.execute(
                    "SELECT pg_advisory_unlock(hashtext(%s))", (identity_lock_key,)
                )
            except Exception:
                logger.exception("Could not release crawler identity lock")
            finally:
                identity_lock_conn.close()


def main():
    while True:
        try:
            params = pika.URLParameters(RABBITMQ_URL)
            conn = pika.BlockingConnection(params)
            channel = conn.channel()
            channel.queue_declare(queue=RABBITMQ_QUEUE, durable=True)
            if RABBITMQ_SOCIAL_QUEUE != RABBITMQ_QUEUE:
                channel.queue_declare(queue=RABBITMQ_SOCIAL_QUEUE, durable=True)
            queues = list(dict.fromkeys((RABBITMQ_QUEUE, RABBITMQ_SOCIAL_QUEUE)))
            for queue in queues:
                channel.queue_declare(
                    queue=f"{queue}.retry",
                    durable=True,
                    arguments={
                        "x-dead-letter-exchange": "",
                        "x-dead-letter-routing-key": queue,
                    },
                )
            # SKDR queue disabled
            # if RABBITMQ_SKDR_QUEUE not in {RABBITMQ_QUEUE, RABBITMQ_SOCIAL_QUEUE}:
            #     channel.queue_declare(queue=RABBITMQ_SKDR_QUEUE, durable=True)
            channel.basic_qos(prefetch_count=1)
            channel.basic_consume(queue=RABBITMQ_QUEUE, on_message_callback=callback)
            if RABBITMQ_SOCIAL_QUEUE != RABBITMQ_QUEUE:
                channel.basic_consume(queue=RABBITMQ_SOCIAL_QUEUE, on_message_callback=callback)
            # if RABBITMQ_SKDR_QUEUE not in {RABBITMQ_QUEUE, RABBITMQ_SOCIAL_QUEUE}:
            #     channel.basic_consume(queue=RABBITMQ_SKDR_QUEUE, on_message_callback=callback)
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
