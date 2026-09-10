"""Isolated interactive URL worker; never consumes the bulk collector queues."""
import json
import logging
import os
import time
from decimal import Decimal
from urllib.parse import urlparse

from .entity_relations import disease_relation_rows, location_relation_rows

logger = logging.getLogger(__name__)


def _json_safe(value):
    """Convert PostgreSQL numeric values into JSON-compatible primitives."""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    return value
QUEUE = "disease.analysis-url"
NLP_REQUEST_TIMEOUT_SECONDS = float(os.getenv("NLP_REQUEST_TIMEOUT_SECONDS", "240"))
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

def analyze_stages(url, fetch, nlp, progress=lambda stage: None, before_nlp=None):
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
    if before_nlp is not None:
        cached_result = before_nlp(extracted)
        if cached_result is not None:
            warnings.append("Equivalent content retrieved from database cache")
            return {"status": "completed", "result": cached_result, "warnings": warnings, "cached": True}
    progress("nlp")
    # Carry the actual article URL into NLP so domain-level source reliability
    # can identify DW/BBC/Detik/Antara instead of falling back to web=0.65.
    extracted_for_analysis = {**extracted, "source_url": url}
    try:
        analysis = nlp(extracted_for_analysis, fallback=False)
    except Exception as exc:
        # Preserve a short, non-secret diagnostic in the job result. The old
        # generic warning made HTTP 503, timeout, and malformed NLP responses
        # indistinguishable in the UI.
        reason = str(exc).replace("\n", " ").strip()[:240]
        warning = "Full NLP unavailable"
        if reason:
            warning += f" ({reason})"
        warnings.append(warning + "; attempted bounded rules-only analysis")
        logger.warning("Full NLP failed for %s: %s", url, reason or type(exc).__name__)
        try:
            analysis = nlp(extracted_for_analysis, fallback=True)
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
    timeout_ms = 120000 if is_pdf else (15000 if fallback else 12000)
    connect_timeout = 5
    # The collector allows a PDF extraction window of up to 60 seconds plus
    # its response buffer. Keep the client-side read timeout above that limit
    # so a slow but valid surveillance report is not cancelled prematurely.
    read_timeout = 140 if is_pdf else 20
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
    # Interactive URL analysis has its own NLP runtime. Keep the old variable
    # as a fallback so one-off worker runs and older deployments still work.
    endpoint = os.getenv("NLP_SERVICE_URL", "http://disease-nlp-python:8000")
    text_payload = _prepare_text_for_nlp(extracted)
    response = requests.post(
        endpoint + "/nlp/analyze/url",
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
    if not response.ok:
        detail = response.text.replace("\n", " ").strip()[:240]
        raise RuntimeError(f"NLP HTTP {response.status_code}: {detail or response.reason}")
    return response.json()
def save_completed(conn, job_id, result, raw_report_id=None):
    """Add a new version without deleting any existing report or event."""
    values = (
        result.get("published_at") or None,
        result.get("content", ""),
        result.get("summary") or None,
        result["url"],
        result.get("object_path"),
        result.get("normalized_url"), result.get("canonical_url"), result.get("url_hash"),
        result.get("content_hash"), result.get("final_url"), result.get("author"),
    )
    if raw_report_id:
        row = conn.execute(
            """UPDATE raw_reports SET
                 source_type='web', source_name='URL Analyzer', published_at=%s,
                 original_text=%s, summary=%s, url=%s, object_path=%s,
                 processing_status='PROCESSED', normalized_url=%s, canonical_url=%s,
                 url_hash=%s, content_hash=%s, final_url=%s, author=%s
               WHERE id=%s RETURNING id""",
            (*values, raw_report_id),
        ).fetchone()
    else:
        row = conn.execute("""INSERT INTO raw_reports(
                source_type,source_name,published_at,original_text,summary,url,object_path,processing_status,
                normalized_url,canonical_url,url_hash,content_hash,final_url,author)
            VALUES ('web','URL Analyzer',%s,%s,%s,%s,%s,'PROCESSED',%s,%s,%s,%s,%s,%s)
            RETURNING id""", values).fetchone()
    from psycopg.types.json import Jsonb
    event = conn.execute(
        """INSERT INTO disease_events(raw_report_id,source_type,source_name,published_at,original_text,
        language,location_name,geom,symptoms,disease_extracted,disease_mentions,disease_classification,
        case_count,death_count,event_date,confirmed_cases,suspected_cases,hospitalizations,
        epidemiological_evidence,confidence,is_health_related,outbreak_alert,sentiment,event_type,relevance_score,
        source_credibility,source_credibility_label,needs_review)
        VALUES (%s,'web','URL Analyzer',%s,%s,%s,%s,
        CASE WHEN %s::float8 IS NULL OR %s::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(%s,%s),4326) END,
        %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (row["id"],result.get("published_at") or None,result.get("content",""),result.get("language"),
         result.get("location_name"),result.get("longitude"),result.get("latitude"),
         result.get("longitude"),result.get("latitude"),Jsonb(result.get("symptoms",[])),
         Jsonb(result.get("disease_extracted",[])),Jsonb(result.get("disease_mentions",[])),
         result.get("disease_classification"),result.get("case_count",0),result.get("death_count",0),
         result.get("event_date"),result.get("confirmed_cases"),result.get("suspected_cases"),
         result.get("hospitalizations"),Jsonb(result.get("evidence",[])),
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


def retain_raw_or_get_cached(conn, requested_url: str, extracted: dict, allow_cached: bool = True):
    """Deduplicate canonical/content identity after fetch and retain RAW before NLP."""
    row = conn.execute(
        """SELECT rr.id AS raw_report_id, rr.summary AS raw_summary,
                  rr.published_at AS raw_published_at, de.id AS event_id,
                  de.language, de.location_name, ST_X(de.geom) AS longitude,
                  ST_Y(de.geom) AS latitude, de.symptoms, de.disease_extracted,
                  de.disease_mentions, de.disease_classification, de.case_count,
                  de.death_count, de.event_date, de.confirmed_cases, de.suspected_cases,
                  de.hospitalizations, de.epidemiological_evidence,
                  de.confidence, de.outbreak_alert, de.sentiment,
                  de.needs_review, de.event_type, de.relevance_score,
                  de.source_credibility, de.source_credibility_label, de.is_health_related
           FROM raw_reports rr
           LEFT JOIN LATERAL (
               SELECT event.* FROM disease_events event
               WHERE event.raw_report_id=rr.id
               ORDER BY event.created_at DESC LIMIT 1
           ) de ON TRUE
           WHERE (%s::text IS NOT NULL AND rr.content_hash=%s)
              OR (%s::text IS NOT NULL AND rr.canonical_url=%s)
              OR (%s::text IS NOT NULL AND rr.url_hash=%s)
              OR (%s::text IS NOT NULL AND rr.normalized_url=%s)
           ORDER BY CASE WHEN de.id IS NOT NULL THEN 0 ELSE 1 END, rr.created_at DESC
           LIMIT 1""",
        (
            extracted.get("content_hash"), extracted.get("content_hash"),
            extracted.get("canonical_url"), extracted.get("canonical_url"),
            extracted.get("url_hash"), extracted.get("url_hash"),
            extracted.get("normalized_url"), extracted.get("normalized_url"),
        ),
    ).fetchone()
    if row and row.get("event_id") and not allow_cached:
        row = None
    if row and row.get("event_id"):
        result = {
            **extracted,
            "url": requested_url,
            "summary": row.get("raw_summary") or "",
            "published_at": str(row.get("raw_published_at")) if row.get("raw_published_at") else extracted.get("published_at"),
            "language": row.get("language") or "unknown",
            "location_name": row.get("location_name"),
            "latitude": row.get("latitude"),
            "longitude": row.get("longitude"),
            "symptoms": row.get("symptoms") or [],
            "disease_extracted": row.get("disease_extracted") or [],
            "disease_mentions": row.get("disease_mentions") or [],
            "disease_classification": row.get("disease_classification") or "UNKNOWN",
            "case_count": row.get("case_count") or 0,
            "death_count": row.get("death_count") or 0,
            "event_date": str(row.get("event_date")) if row.get("event_date") else None,
            "confirmed_cases": row.get("confirmed_cases"),
            "suspected_cases": row.get("suspected_cases"),
            "hospitalizations": row.get("hospitalizations"),
            "evidence": row.get("epidemiological_evidence") or [],
            "confidence": row.get("confidence") or 0.0,
            "outbreak_alert": row.get("outbreak_alert") or False,
            "sentiment": row.get("sentiment"),
            "needs_review": row.get("needs_review") or False,
            "event_type": row.get("event_type"),
            "relevance_score": row.get("relevance_score"),
            "source_credibility": row.get("source_credibility"),
            "source_credibility_label": row.get("source_credibility_label"),
            "is_health_related": row.get("is_health_related"),
            "raw_report_id": str(row["raw_report_id"]),
            "event_id": str(row["event_id"]),
            "cached": True,
            "source": "database-content-identity",
        }
        return row["raw_report_id"], _json_safe(result)
    if row:
        raw_id = row["raw_report_id"]
        conn.execute(
            """UPDATE raw_reports SET processing_status='PROCESSING', original_text=%s,
                 normalized_url=COALESCE(normalized_url,%s), canonical_url=COALESCE(canonical_url,%s),
                 url_hash=COALESCE(url_hash,%s), content_hash=COALESCE(content_hash,%s),
                 final_url=COALESCE(final_url,%s), author=COALESCE(author,%s)
               WHERE id=%s""",
            (
                extracted.get("content", ""), extracted.get("normalized_url"), extracted.get("canonical_url"),
                extracted.get("url_hash"), extracted.get("content_hash"), extracted.get("final_url"),
                extracted.get("author"), raw_id,
            ),
        )
        return raw_id, None
    raw = conn.execute(
        """INSERT INTO raw_reports(
             source_type,source_name,published_at,original_text,url,object_path,processing_status,
             normalized_url,canonical_url,url_hash,content_hash,final_url,author)
           VALUES ('web','URL Analyzer',%s,%s,%s,%s,'PROCESSING',%s,%s,%s,%s,%s,%s)
           RETURNING id""",
        (
            extracted.get("published_at"), extracted.get("content", ""), requested_url,
            extracted.get("object_path"), extracted.get("normalized_url"), extracted.get("canonical_url"),
            extracted.get("url_hash"), extracted.get("content_hash"), extracted.get("final_url"),
            extracted.get("author"),
        ),
    ).fetchone()
    logger.info("RAW retained before URL NLP: raw_id=%s url=%s", raw["id"], requested_url)
    return raw["id"], None

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

            # Check raw_reports first. Any existing URL is a cache hit, even
            # when the previous run was partial or did not create an event.
            # This keeps interactive URL analysis from re-crawling/re-analyzing
            # a source that is already stored in the database.
            cached_report = lock_conn.execute(
                """SELECT rr.id AS raw_report_id,
                          rr.original_text AS raw_original_text,
                          rr.summary AS raw_summary,
                          rr.published_at AS raw_published_at,
                          rr.processing_status AS raw_processing_status,
                          rr.object_path AS raw_object_path,
                          rr.normalized_url AS raw_normalized_url,
                          rr.canonical_url AS raw_canonical_url,
                          rr.url_hash AS raw_url_hash,
                          rr.content_hash AS raw_content_hash,
                          rr.final_url AS raw_final_url,
                          rr.author AS raw_author,
                          de.id AS event_id,
                          de.original_text AS event_original_text,
                          de.language,
                          de.location_name,
                          ST_X(de.geom) AS longitude,
                          ST_Y(de.geom) AS latitude,
                          de.symptoms,
                          de.disease_extracted,
                          de.disease_mentions,
                          de.disease_classification,
                          de.case_count,
                          de.death_count,
                          de.event_date,
                          de.confirmed_cases,
                          de.suspected_cases,
                          de.hospitalizations,
                          de.epidemiological_evidence,
                          de.confidence,
                          de.outbreak_alert,
                          de.sentiment,
                          de.needs_review,
                          de.event_type,
                          de.relevance_score,
                          de.source_credibility,
                          de.source_credibility_label,
                          de.is_health_related,
                          de.published_at AS event_published_at
                   FROM raw_reports rr
                   LEFT JOIN LATERAL (
                       SELECT event.*
                       FROM disease_events event
                       WHERE event.raw_report_id = rr.id
                       ORDER BY event.created_at DESC
                       LIMIT 1
                   ) de ON TRUE
                   WHERE (rr.url = %s
                          OR (%s::text IS NOT NULL AND rr.normalized_url = %s)
                          OR (%s::text IS NOT NULL AND rr.url_hash = %s))
                   ORDER BY CASE WHEN de.id IS NOT NULL THEN 0 ELSE 1 END,
                            rr.created_at DESC
                   LIMIT 1""",
                (
                    row["url"],
                    row.get("normalized_url"), row.get("normalized_url"),
                    row.get("url_hash"), row.get("url_hash"),
                ),
            ).fetchone()

            if cached_report and cached_report.get("event_id") and not row.get("force_refresh", False):
                has_cached_event = True
                logger.info(
                    "URL %s found in DB cache, completing job %s immediately (event=%s)",
                    row["url"],
                    job_id,
                    has_cached_event,
                )
                original_text = (
                    cached_report.get("event_original_text")
                    or cached_report.get("raw_original_text")
                    or ""
                )
                if ".\n" in original_text:
                    cached_title, cached_content = original_text.split(".\n", 1)
                else:
                    cached_title, cached_content = "", original_text

                res = _json_safe({
                    "title": cached_title,
                    "content": cached_content,
                    "summary": cached_report.get("raw_summary") or "",
                    "url": row["url"],
                    "published_at": str(
                        cached_report.get("event_published_at")
                        or cached_report.get("raw_published_at")
                    ) if cached_report.get("event_published_at") or cached_report.get("raw_published_at") else None,
                    "language": cached_report.get("language") or "id",
                    "location_name": cached_report.get("location_name"),
                    "latitude": cached_report.get("latitude"),
                    "longitude": cached_report.get("longitude"),
                    "symptoms": cached_report.get("symptoms") or [],
                    "disease_extracted": cached_report.get("disease_extracted") or [],
                    "disease_mentions": cached_report.get("disease_mentions") or [],
                    "disease_classification": cached_report.get("disease_classification") or "UNKNOWN",
                    "case_count": cached_report.get("case_count") or 0,
                    "death_count": cached_report.get("death_count") or 0,
                    "event_date": str(cached_report.get("event_date")) if cached_report.get("event_date") else None,
                    "confirmed_cases": cached_report.get("confirmed_cases"),
                    "suspected_cases": cached_report.get("suspected_cases"),
                    "hospitalizations": cached_report.get("hospitalizations"),
                    "evidence": cached_report.get("epidemiological_evidence") or [],
                    "confidence": cached_report.get("confidence") or 0.0,
                    "outbreak_alert": cached_report.get("outbreak_alert") or False,
                    "sentiment": cached_report.get("sentiment"),
                    "event_type": cached_report.get("event_type"),
                    "relevance_score": cached_report.get("relevance_score"),
                    "source_credibility": cached_report.get("source_credibility"),
                    "source_credibility_label": cached_report.get("source_credibility_label"),
                    "is_health_related": cached_report.get("is_health_related") if has_cached_event else True,
                    "needs_review": cached_report.get("needs_review") if has_cached_event else True,
                    "raw_report_id": str(cached_report["raw_report_id"]),
                    "event_id": str(cached_report["event_id"]) if has_cached_event else None,
                    "cached": True,
                    "source": "database",
                })
                # psycopg JSON adaptation must receive only stdlib JSON
                # primitives, including values nested in database JSONB.
                res = json.loads(json.dumps(
                    res,
                    default=lambda value: float(value) if isinstance(value, Decimal) else str(value),
                ))
                lock_conn.execute(
                    """UPDATE analysis_jobs
                       SET status=%s, stage='finished', event_id=%s, result=%s,
                           warnings=%s, updated_at=NOW()
                       WHERE id=%s""",
                    (
                        "completed",
                        cached_report.get("event_id"),
                        Jsonb(res),
                        Jsonb(["Data retrieved from database cache"]),
                        job_id,
                    ),
                )
                return

            def progress(stage):
                lock_conn.execute("UPDATE analysis_jobs SET status='processing',stage=%s,updated_at=NOW() WHERE id=%s",
                                  (stage, job_id))
            retained = {"raw_id": None, "lock_conn": None, "lock_key": ""}

            fetch_for_job = fetch_article
            if cached_report and not cached_report.get("event_id") and not row.get("force_refresh", False):
                # RAW already exists but NLP did not finish. Reuse the stored
                # source instead of crawling the external website again.
                def fetch_for_job(_url, fallback=False):
                    return {
                        "url": row["url"],
                        "content": cached_report.get("raw_original_text") or "",
                        "title": "",
                        "published_at": str(cached_report.get("raw_published_at")) if cached_report.get("raw_published_at") else None,
                        "object_path": cached_report.get("raw_object_path"),
                        "normalized_url": cached_report.get("raw_normalized_url") or row.get("normalized_url"),
                        "canonical_url": cached_report.get("raw_canonical_url"),
                        "url_hash": cached_report.get("raw_url_hash") or row.get("url_hash"),
                        "content_hash": cached_report.get("raw_content_hash"),
                        "final_url": cached_report.get("raw_final_url"),
                        "author": cached_report.get("raw_author"),
                        "fetch_mode": "database_raw",
                    }
                logger.info("Reusing stored RAW for unfinished NLP: raw_id=%s", cached_report["raw_report_id"])

            def before_nlp(extracted):
                identity_field = next(
                    (field for field in ("content_hash", "canonical_url", "url_hash", "normalized_url") if extracted.get(field)),
                    "",
                )
                identity = extracted.get(identity_field) if identity_field else None
                if identity:
                    retained["lock_key"] = f"crawler-document:{identity_field}:{identity}"
                    retained["lock_conn"] = connect()
                    retained["lock_conn"].autocommit = True
                    retained["lock_conn"].execute(
                        "SELECT pg_advisory_lock(hashtext(%s))", (retained["lock_key"],)
                    )
                with connect() as raw_conn:
                    raw_id, cached_result = retain_raw_or_get_cached(
                        raw_conn,
                        row["url"],
                        extracted,
                        allow_cached=not row.get("force_refresh", False),
                    )
                    raw_conn.commit()
                retained["raw_id"] = raw_id
                return cached_result

            try:
                outcome = analyze_stages(
                    row["url"], fetch_for_job, analyze_article, progress, before_nlp=before_nlp
                )
                with connect() as conn:
                    result = outcome.get("result")
                    # Persist partial results too. In particular, an article whose
                    # full NLP timed out but whose source was fetched must become
                    # a cache hit on the next URL request instead of being crawled
                    # again indefinitely.
                    if outcome["status"] in {"completed", "partial"} and result and not outcome.get("cached"):
                        save_completed(conn, job_id, result, raw_report_id=retained["raw_id"])
                    elif outcome.get("cached") and result.get("event_id"):
                        conn.execute("UPDATE analysis_jobs SET event_id=%s WHERE id=%s", (result["event_id"], job_id))
                    conn.execute("UPDATE analysis_jobs SET status=%s,stage='finished',result=%s,warnings=%s,error=%s,updated_at=NOW() WHERE id=%s",
                        (outcome["status"],Jsonb(result),Jsonb(outcome["warnings"]),outcome.get("error"),job_id))
            finally:
                if retained["lock_conn"] is not None:
                    retained["lock_conn"].execute(
                        "SELECT pg_advisory_unlock(hashtext(%s))", (retained["lock_key"],)
                    )
                    retained["lock_conn"].close()
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


def _run_matrix_worker_process():
    """Run manual crawler jobs without consuming the URL-analysis queue."""
    from .crawl_matrix_jobs import main as matrix_main
    matrix_main()


def main():
    import pika
    from multiprocessing import Process

    logging.basicConfig(level=logging.INFO)
    matrix_process = Process(
        target=_run_matrix_worker_process,
        name="manual-crawler-worker",
        daemon=True,
    )
    matrix_process.start()
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
                    if not matrix_process.is_alive():
                        logger.warning("Manual crawler worker stopped; restarting child process")
                        matrix_process = Process(
                            target=_run_matrix_worker_process,
                            name="manual-crawler-worker",
                            daemon=True,
                        )
                        matrix_process.start()
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
