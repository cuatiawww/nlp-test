"""Isolated interactive URL worker; never consumes the bulk collector queues."""
import json
import logging
import os
import time
from urllib.parse import urlparse

from .entity_relations import disease_relation_rows, location_relation_rows

logger = logging.getLogger(__name__)
QUEUE = "disease.analysis-url"
NLP_REQUEST_TIMEOUT_SECONDS = float(os.getenv("NLP_REQUEST_TIMEOUT_SECONDS", "180"))
ENTITY_LOCATION_STORAGE_ENABLED = os.getenv(
    "ENTITY_LOCATION_STORAGE_ENABLED", "true"
).lower() in {"1", "true", "yes", "on"}
ENTITY_DISEASE_STORAGE_ENABLED = os.getenv(
    "ENTITY_DISEASE_STORAGE_ENABLED", "true"
).lower() in {"1", "true", "yes", "on"}

def validate_url(url):
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username:
        raise ValueError("A valid HTTP(S) article URL is required")
    return url

def analyze_stages(url, fetch, nlp, progress=lambda stage: None):
    validate_url(url)
    warnings = []
    progress("fetch")
    try:
        extracted = fetch(url, fallback=False)
    except Exception:
        warnings.append("Primary fetch failed; used HTTP fallback")
        try:
            extracted = fetch(url, fallback=True)
        except Exception:
            return {"status": "failed", "error": "Fetch failed. Check the source URL or retry later.", "warnings": warnings}
    if not extracted.get("content", "").strip():
        return {"status": "failed", "error": "No extractable article content", "warnings": warnings}
    progress("nlp")
    try:
        analysis = nlp(extracted, fallback=False)
    except Exception:
        warnings.append("Full NLP unavailable; attempted bounded rules-only analysis")
        try:
            analysis = nlp(extracted, fallback=True)
        except Exception:
            analysis = {}
            warnings.append("NLP unavailable; source content retained for review")
    warnings.extend(analysis.pop("stage_warnings", []))
    result = {**extracted, **analysis, "url": url}
    if warnings:
        result["needs_review"] = True
    return {"status": "partial" if warnings else "completed", "result": result, "warnings": warnings}

def connect():
    import psycopg
    from psycopg.rows import dict_row
    return psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row, connect_timeout=5)

def fetch_article(url, fallback=False):
    import requests
    endpoint = os.getenv("COLLECTOR_URL", "http://disease-collector-python:8002")
    is_pdf = urlparse(url).path.lower().endswith(".pdf")
    timeout_ms = 45000 if is_pdf else (15000 if fallback else 12000)
    connect_timeout = 5
    read_timeout = 55 if is_pdf else 20
    response = requests.post(
        endpoint + "/extract-url",
        json={"url": url, "fetch_mode": "http" if fallback else "auto", "timeout_ms": timeout_ms},
        timeout=(connect_timeout, read_timeout),
    )
    response.raise_for_status()
    return response.json()["data"]

def _prepare_text_for_nlp(extracted, max_chars=35000):
    title = (extracted.get("title") or "").strip()
    content = (extracted.get("content") or "").strip()
    if len(content) <= max_chars:
        return (title + "\n\n" + content).strip()

    sections = extracted.get("sections") or []
    if sections:
        header = f"{title}\n\n" + content[:4000]
        parts = [header]
        cur_len = len(header)
        for sec in sections:
            sec_text = f"\n\n--- {sec.get('title', '')} ---\n{sec.get('content', '')}"
            if cur_len + len(sec_text) <= max_chars:
                parts.append(sec_text)
                cur_len += len(sec_text)
            else:
                rem = max_chars - cur_len
                if rem > 400:
                    parts.append(sec_text[:rem])
                break
        return "".join(parts).strip()
    return (title + "\n\n" + content[:max_chars]).strip()

def analyze_article(extracted, fallback=False):
    import requests
    endpoint = os.getenv("NLP_SERVICE_URL", "http://disease-nlp-python:8000")
    text_payload = _prepare_text_for_nlp(extracted)
    response = requests.post(
        endpoint + "/nlp/analyze-bounded",
        json={
            "text": text_payload,
            "source_type": "web",
            "source_name": "URL Analyzer",
            "source_country": extracted.get("source_country"),
            "published_at": extracted.get("published_at"),
            "rules_only": fallback,
        },
        timeout=(5, NLP_REQUEST_TIMEOUT_SECONDS),
    )
    response.raise_for_status()
    return response.json()
def save_completed(conn, job_id, result):
    """Add a new version without deleting any existing report or event."""
    row = conn.execute("INSERT INTO raw_reports(source_type,source_name,published_at,original_text,url,object_path,processing_status) "
        "VALUES ('web','URL Analyzer',%s,%s,%s,%s,'PROCESSED') RETURNING id",
        (result.get("published_at") or None, result.get("content", ""), result["url"], result.get("object_path"))).fetchone()
    from psycopg.types.json import Jsonb
    event = conn.execute(
        """INSERT INTO disease_events(raw_report_id,source_type,source_name,published_at,original_text,
        language,location_name,geom,symptoms,disease_extracted,disease_mentions,disease_classification,
        case_count,death_count,confidence,is_health_related,outbreak_alert,sentiment,event_type,relevance_score,
        source_credibility,source_credibility_label,needs_review)
        VALUES (%s,'web','URL Analyzer',%s,%s,%s,%s,
        CASE WHEN %s::float8 IS NULL OR %s::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(%s,%s),4326) END,
        %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (row["id"],result.get("published_at") or None,result.get("content",""),result.get("language"),
         result.get("location_name"),result.get("longitude"),result.get("latitude"),
         result.get("longitude"),result.get("latitude"),Jsonb(result.get("symptoms",[])),
         Jsonb(result.get("disease_extracted",[])),Jsonb(result.get("disease_mentions",[])),
         result.get("disease_classification"),result.get("case_count",0),result.get("death_count",0),
         result.get("confidence",0),result.get("is_health_related",False),result.get("outbreak_alert",False),
         result.get("sentiment"),result.get("event_type"),result.get("relevance_score"),
         result.get("source_credibility"),result.get("source_credibility_label"),result.get("needs_review",False))).fetchone()
    if ENTITY_LOCATION_STORAGE_ENABLED:
        for relation in location_relation_rows(result):
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
                    event["id"],
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
    if ENTITY_DISEASE_STORAGE_ENABLED:
        for relation in disease_relation_rows(result):
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
                    event["id"],
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
    result.update(raw_report_id=str(row["id"]), event_id=str(event["id"]))

    # --- Multi-event decomposition for interactive analysis ---
    sub_events = result.get("sub_events", [])
    if len(sub_events) >= 2:
        parent_event_id = event["id"]
        for sub_evt in sub_events:
            sub_location = sub_evt.get("location_name")
            sub_disease = sub_evt.get("disease")
            sub_cases = sub_evt.get("case_count", 0)
            sub_deaths = sub_evt.get("death_count", 0)
            sub_lat = sub_evt.get("latitude")
            sub_lon = sub_evt.get("longitude")
            child = conn.execute(
                """INSERT INTO disease_events
                   (raw_report_id, source_type, source_name, published_at,
                    original_text, language, location_name, geom,
                    disease_classification, case_count, death_count,
                    confidence, outbreak_alert, sentiment, event_type,
                    relevance_score, source_credibility,
                    source_credibility_label, is_health_related,
                    parent_event_id, source_url)
                   VALUES (%s, %s, %s, %s, %s, %s, %s,
                            CASE WHEN %s::float8 IS NULL OR %s::float8 IS NULL THEN NULL
                                 ELSE ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                            END,
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE, %s, %s)
                   ON CONFLICT DO NOTHING""",
                (
                    row["id"], result.get("source_type"), result.get("source_name"),
                    result.get("published_at"), sub_evt.get("evidence", ""),
                    result.get("language", "id"), sub_location,
                    sub_lat, sub_lon, sub_lat, sub_lon,
                    sub_disease, sub_cases, sub_deaths,
                    result.get("confidence", 0.0), result.get("outbreak_alert", False),
                    result.get("sentiment"), result.get("event_type"),
                    result.get("relevance_score"), result.get("source_credibility", 0.50),
                    result.get("source_credibility_label", ""),
                    parent_event_id, result.get("url"),
                ),
            )
        logger.info("Multi-event analysis: inserted %d child events", len(sub_events))
    conn.execute("UPDATE analysis_jobs SET event_id=%s WHERE id=%s", (event["id"],job_id))

def process_job(job_id):
    from psycopg.types.json import Jsonb
    with connect() as lock_conn:
        lock_conn.autocommit = True
        locked = lock_conn.execute("SELECT pg_try_advisory_lock(hashtext(%s)) AS locked",(job_id,)).fetchone()["locked"]
        if not locked:
            return
        try:
            row = lock_conn.execute("SELECT * FROM analysis_jobs WHERE id=%s",(job_id,)).fetchone()
            if not row or row["status"] in {"completed","partial","failed"}:
                return

            # Fast-path: Check if URL was already analyzed in database (Cache hit)
            cached_event = lock_conn.execute(
                """SELECT de.id as event_id, de.raw_report_id, de.original_text, de.language,
                          de.location_name, ST_X(de.geom) as longitude, ST_Y(de.geom) as latitude,
                          de.symptoms, de.disease_extracted, de.disease_mentions,
                          de.disease_classification, de.case_count, de.death_count, de.confidence,
                          de.outbreak_alert, de.sentiment, de.needs_review, de.event_type,
                          de.relevance_score, de.source_credibility, de.source_credibility_label,
                          de.is_health_related, COALESCE(de.published_at, rr.published_at) as published_at
                   FROM disease_events de
                   JOIN raw_reports rr ON de.raw_report_id = rr.id
                   WHERE rr.url = %s
                     AND de.disease_classification IS NOT NULL
                     AND de.disease_classification != 'UNKNOWN'
                     AND de.disease_classification != 'Unknown Disease'
                     AND de.confidence >= 0.50
                   ORDER BY de.created_at DESC
                   LIMIT 1""",
                (row["url"],),
            ).fetchone()

            if cached_event:
                logger.info("URL %s found in DB cache, completing job %s immediately", row["url"], job_id)
                original_text = cached_event.get("original_text") or ""
                if ".\n" in original_text:
                    cached_title, cached_content = original_text.split(".\n", 1)
                else:
                    cached_title, cached_content = "", original_text

                res = {
                    "title": cached_title,
                    "content": cached_content,
                    "url": row["url"],
                    "published_at": str(cached_event["published_at"]) if cached_event.get("published_at") else None,
                    "language": cached_event.get("language") or "id",
                    "location_name": cached_event.get("location_name"),
                    "latitude": cached_event.get("latitude"),
                    "longitude": cached_event.get("longitude"),
                    "symptoms": cached_event.get("symptoms") or [],
                    "disease_extracted": cached_event.get("disease_extracted") or [],
                    "disease_mentions": cached_event.get("disease_mentions") or [],
                    "disease_classification": cached_event.get("disease_classification"),
                    "case_count": cached_event.get("case_count", 0),
                    "death_count": cached_event.get("death_count", 0),
                    "confidence": cached_event.get("confidence", 0.0),
                    "outbreak_alert": cached_event.get("outbreak_alert", False),
                    "sentiment": cached_event.get("sentiment"),
                    "event_type": cached_event.get("event_type"),
                    "relevance_score": cached_event.get("relevance_score"),
                    "source_credibility": cached_event.get("source_credibility"),
                    "source_credibility_label": cached_event.get("source_credibility_label"),
                    "is_health_related": cached_event.get("is_health_related", True),
                    "raw_report_id": str(cached_event["raw_report_id"]),
                    "event_id": str(cached_event["event_id"]),
                    "cached": True,
                }
                lock_conn.execute(
                    """UPDATE analysis_jobs
                       SET status='completed', stage='finished', event_id=%s, result=%s,
                           warnings='["Data retrieved from database cache"]'::jsonb, updated_at=NOW()
                       WHERE id=%s""",
                    (cached_event["event_id"], Jsonb(res), job_id),
                )
                return

            def progress(stage):
                lock_conn.execute("UPDATE analysis_jobs SET status='processing',stage=%s,updated_at=NOW() WHERE id=%s",
                                  (stage, job_id))
            outcome = analyze_stages(row["url"], fetch_article, analyze_article, progress)
            with connect() as conn:
                result = outcome.get("result")
                if outcome["status"] == "completed":
                    save_completed(conn, job_id, result)
                conn.execute("UPDATE analysis_jobs SET status=%s,stage='finished',result=%s,warnings=%s,error=%s,updated_at=NOW() WHERE id=%s",
                    (outcome["status"],Jsonb(result),Jsonb(outcome["warnings"]),outcome.get("error"),job_id))
        except Exception:
            logger.exception("Analysis job failed: %s", job_id)
            lock_conn.execute("UPDATE analysis_jobs SET status='failed',error='Analysis storage failed; please retry',updated_at=NOW() WHERE id=%s",(job_id,))
        finally:
            lock_conn.execute("SELECT pg_advisory_unlock(hashtext(%s))",(job_id,))

def dispatch(channel):
    import pika
    # Republish stale leases after a crash. process_job is idempotent and locked.
    with connect() as conn:
        rows = conn.execute("""SELECT id FROM analysis_jobs
            WHERE status IN ('queued','processing')
            AND (dispatched_at IS NULL OR dispatched_at < NOW()-INTERVAL '5 minutes')
            ORDER BY created_at LIMIT 50 FOR UPDATE SKIP LOCKED""").fetchall()
        for row in rows:
            channel.basic_publish("",QUEUE,json.dumps({"job_id":str(row["id"])}),
                properties=pika.BasicProperties(delivery_mode=2),mandatory=True)
            conn.execute("UPDATE analysis_jobs SET dispatched_at=NOW() WHERE id=%s",(row["id"],))

def main():
    import pika
    logging.basicConfig(level=logging.INFO)
    while True:
        try:
            params = pika.URLParameters(os.environ["RABBITMQ_URL"])
            params.heartbeat = 300
            params.blocked_connection_timeout = 5
            with pika.BlockingConnection(params) as broker:
                channel = broker.channel()
                channel.queue_declare(queue=QUEUE,durable=True)
                channel.confirm_delivery()
                while broker.is_open:
                    dispatch(channel)
                    method, properties, body = channel.basic_get(QUEUE,auto_ack=False)
                    if method:
                        try:
                            process_job(str(__import__("uuid").UUID(json.loads(body)["job_id"])))
                        except (ValueError, KeyError, json.JSONDecodeError):
                            logger.warning("Discarding malformed analysis job message")
                        channel.basic_ack(method.delivery_tag)
                    else:
                        broker.sleep(2)
        except Exception:
            logger.exception("Analysis worker unavailable; reconnecting")
            time.sleep(5)

if __name__ == "__main__":
    main()
