"""Isolated interactive URL worker; never consumes the bulk collector queues."""
import json
import logging
import os
import time
from decimal import Decimal
from urllib.parse import urlparse

from .entity_relations import disease_relation_rows, location_relation_rows
from .document_identity import identity_lock_keys, identity_where_clause
from .geo import st_makepoint_args
from .kpi import mark_kpi_snapshots_stale
from .multi_event_persist import load_sibling_facts, persist_child_facts
from .queue_reliability import (
    declare_queue_topology,
    settle_malformed_delivery,
    settle_transient_delivery,
)

logger = logging.getLogger(__name__)
NLP_PIPELINE_VERSION = os.getenv("NLP_PIPELINE_VERSION", "2026.09.17.multi-fact")


def _pipeline_version_matches(row) -> bool:
    """Stale disease_events (missing or older pipeline version) are cache misses."""
    version = (row or {}).get("nlp_pipeline_version")
    return bool(version) and version == NLP_PIPELINE_VERSION


def _json_safe(value):
    """Convert PostgreSQL numeric values into JSON-compatible primitives."""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    return value
QUEUE = os.getenv("RABBITMQ_ANALYSIS_URL_QUEUE", "disease.analysis-url")


class UnknownAnalysisJob(ValueError):
    """The message references no durable analysis job."""


def _seconds_at_least(name, default):
    try:
        value = float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        value = float(default)
    return max(float(default), value)


# Floors live in code. An existing production .env of 180 must not shrink the
# worker HTTP wait below a Full NLP pass. Env may only raise the budget.
NLP_REQUEST_TIMEOUT_SECONDS = _seconds_at_least("NLP_REQUEST_TIMEOUT_SECONDS", 270)
ANALYZE_URL_NLP_RETRIES = max(0, int(os.getenv("ANALYZE_URL_NLP_RETRIES", "1")))
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


def _env_flag(name, default=False):
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def rules_only_fallback_enabled():
    return _env_flag("ANALYZE_URL_RULES_ONLY_FALLBACK", False)


def nlp_retry_count():
    return max(0, int(os.getenv("ANALYZE_URL_NLP_RETRIES", str(ANALYZE_URL_NLP_RETRIES))))


def is_retryable_nlp_error(exc):
    reason = f"{type(exc).__name__} {exc}".lower()
    return any(
        token in reason
        for token in ("408", "503", "timeout", "timed out", "exceeded budget", "busy")
    )


def is_nlp_read_timeout(exc):
    """A timed-out HTTP client may leave the server request still running."""

    return type(exc).__name__ in {"ReadTimeout", "ConnectTimeout"} and type(exc).__module__.startswith("requests")


def analyze_stages(
    url,
    fetch,
    nlp,
    progress=lambda stage: None,
    before_nlp=None,
    rules_only_fallback=None,
    nlp_retries=None,
):
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
    if rules_only_fallback is None:
        rules_only_fallback = rules_only_fallback_enabled()
    if nlp_retries is None:
        nlp_retries = nlp_retry_count()
    analysis = None
    last_error = None
    attempts = 1 + max(0, int(nlp_retries))
    for attempt in range(attempts):
        try:
            analysis = nlp(extracted_for_analysis, fallback=False)
            last_error = None
            break
        except Exception as exc:
            last_error = exc
            if attempt + 1 < attempts and is_retryable_nlp_error(exc) and not is_nlp_read_timeout(exc):
                logger.warning(
                    "Full NLP attempt %s/%s failed for %s; retrying extracted text: %s",
                    attempt + 1,
                    attempts,
                    url,
                    exc,
                )
                if "busy" in str(exc).lower() or "503" in str(exc):
                    time.sleep(min(30, max(2, 5 * (2 ** attempt))))
                continue
            if is_nlp_read_timeout(exc):
                logger.warning(
                    "Full NLP HTTP request timed out for %s; not retrying immediately because the server request may still be running",
                    url,
                )
            break
    if analysis is None:
        reason = str(last_error or "unknown error").replace("\n", " ").strip()[:240]
        if rules_only_fallback:
            warning = "Full NLP unavailable"
            if reason:
                warning += f" ({reason})"
            warnings.append(warning + "; attempted bounded rules-only analysis")
            logger.warning("Full NLP failed for %s: %s", url, reason or type(last_error).__name__)
            try:
                analysis = nlp(extracted_for_analysis, fallback=True)
            except Exception:
                analysis = {}
                warnings.append("NLP unavailable; source content retained for review")
        else:
            warning = "Full NLP failed"
            if reason:
                warning += f" ({reason})"
            warnings.append(warning + "; article text retained. Retry the job; rules-only fallback is opt-in.")
            logger.warning("Full NLP failed for %s without rules-only fallback: %s", url, reason)
            return {
                "status": "failed",
                "error": warning + ". Article text was fetched; retry Full NLP (do not silently use rules-only).",
                "result": {**extracted, "url": url, "needs_review": True},
                "warnings": warnings,
            }
    warnings.extend(analysis.pop("stage_warnings", []))
    result = {**extracted, **analysis, "url": url, "cached": False}
    if warnings:
        result["needs_review"] = True
    return {
        "status": "partial" if warnings else "completed",
        "result": result,
        "warnings": warnings,
        "cached": False,
    }

def connect():
    import psycopg
    from psycopg.rows import dict_row
    return psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row, connect_timeout=5)

def fetch_article(url, fallback=False):
    import requests
    endpoint = os.getenv("COLLECTOR_URL", "http://disease-collector-python:8002")
    is_pdf = urlparse(url).path.lower().endswith(".pdf")
    timeout_ms = 120000 if is_pdf else (40000 if fallback else 30000)
    connect_timeout = 5
    # Async URL jobs are not bound by the browser/gateway 60s budget. Give
    # slow publishers a real window, then one short retry, instead of 504.
    read_timeout = 140 if is_pdf else (55 if fallback else 40)
    attempts = 2
    last_error = None
    for attempt in range(attempts):
        try:
            response = requests.post(
                endpoint + "/extract-url",
                json={
                    "url": url,
                    "fetch_mode": "http",
                    "timeout_ms": timeout_ms,
                    "max_retries": 0 if is_pdf else 1,
                },
                timeout=(connect_timeout, read_timeout),
            )
            if response.status_code in {408, 502, 503, 504} and attempt + 1 < attempts:
                last_error = requests.HTTPError(
                    f"{response.status_code} {response.text[:180]}",
                    response=response,
                )
                continue
            response.raise_for_status()
            return response.json()["data"]
        except (requests.Timeout, requests.ConnectionError) as exc:
            last_error = exc
            if attempt + 1 >= attempts:
                raise
    if last_error:
        raise last_error
    raise RuntimeError("Article fetch failed")

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
            "interactive": True,
        },
        timeout=(5, NLP_REQUEST_TIMEOUT_SECONDS),
    )
    if not response.ok:
        detail = response.text.replace("\n", " ").strip()[:240]
        raise RuntimeError(f"NLP HTTP {response.status_code}: {detail or response.reason}")
    return response.json()
def save_completed(conn, job_id, result, raw_report_id=None):
    """Add a new version without deleting any existing report or event."""
    if not raw_report_id:
        raw_report_id, _ = retain_raw_or_get_cached(
            conn, result["url"], result, allow_cached=False
        )
    values = (
        result.get("published_at") or None,
        result.get("content", ""),
        result.get("summary") or None,
        result["url"],
        result.get("object_path"),
        result.get("normalized_url"), result.get("canonical_url"), result.get("url_hash"),
        result.get("content_hash"), result.get("final_url"), result.get("author"),
        result.get("source_country"),
    )
    if raw_report_id:
        row = conn.execute(
            """UPDATE raw_reports SET
                 source_type='web', source_name='URL Analyzer', published_at=%s,
                 original_text=%s, summary=%s, url=%s, object_path=%s,
                 processing_status='PROCESSED', normalized_url=%s, canonical_url=%s,
                 url_hash=%s, content_hash=%s, final_url=%s, author=%s, source_country=%s
               WHERE id=%s RETURNING id""",
            (*values, raw_report_id),
        ).fetchone()
    else:
        row = conn.execute("""INSERT INTO raw_reports(
                source_type,source_name,published_at,original_text,summary,url,object_path,processing_status,
                normalized_url,canonical_url,url_hash,content_hash,final_url,author,source_country)
            VALUES ('web','URL Analyzer',%s,%s,%s,%s,%s,'PROCESSED',%s,%s,%s,%s,%s,%s,%s)
            RETURNING id""", values).fetchone()
    from psycopg.types.json import Jsonb
    event = conn.execute(
        """INSERT INTO disease_events(raw_report_id,source_type,source_name,published_at,original_text,
        language,location_name,province,city,geom,symptoms,disease_extracted,disease_mentions,disease_classification,
        case_count,death_count,event_date,confirmed_cases,suspected_cases,hospitalizations,
        epidemiological_evidence,confidence,is_health_related,outbreak_alert,sentiment,event_type,relevance_score,
        source_credibility,source_credibility_label,needs_review,nlp_pipeline_version,
        count_period_type,event_date_start,event_date_end,date_needs_review)
        VALUES (%s,'web','URL Analyzer',%s,%s,%s,%s,%s,%s,
        CASE WHEN %s::float8 IS NULL OR %s::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(%s,%s),4326) END,
        %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (row["id"],result.get("published_at") or None,result.get("content",""),result.get("language"),
         result.get("location_name"),result.get("province"),result.get("city"),*st_makepoint_args(result.get("latitude"), result.get("longitude")),Jsonb(result.get("symptoms",[])),
         Jsonb(result.get("disease_extracted",[])),Jsonb(result.get("disease_mentions",[])),
         result.get("disease_classification"),result.get("case_count",0),result.get("death_count",0),
         result.get("event_date"),result.get("confirmed_cases"),result.get("suspected_cases"),
         result.get("hospitalizations"),Jsonb(result.get("epidemiological_evidence", result.get("evidence",[]))),
         result.get("confidence",0),result.get("is_health_related",False),result.get("outbreak_alert",False),
         result.get("sentiment"),result.get("event_type"),result.get("relevance_score"),
         result.get("source_credibility"),result.get("source_credibility_label"),result.get("needs_review",False),
         result.get("nlp_pipeline_version") or NLP_PIPELINE_VERSION,
         result.get("count_period_type") or "unknown",
         result.get("event_date_start"),
         result.get("event_date_end"),
         result.get("date_needs_review", False))).fetchone()
    conn.execute(
        "UPDATE disease_events SET source_country=%s, surveillance_scope=%s WHERE id=%s",
        (result.get("source_country"), result.get("surveillance_scope"), event["id"]),
    )
    if ENTITY_LOCATION_STORAGE_ENABLED:
        for relation in location_relation_rows(result):
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
                    relation.get("geocode_confidence"),
                    relation.get("geocode_needs_review", False),
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

    persist_child_facts(
        conn,
        parent_event_id=event["id"],
        raw_id=row["id"],
        result=result,
        source_url=result.get("url"),
    )
    conn.execute("UPDATE analysis_jobs SET event_id=%s WHERE id=%s", (event["id"],job_id))
    mark_kpi_snapshots_stale(conn)


def retain_raw_or_get_cached(conn, requested_url: str, extracted: dict, allow_cached: bool = True):
    """Deduplicate canonical/content identity after fetch and retain RAW before NLP."""
    identity_clause, identity_params = identity_where_clause(
        {**extracted, "url": requested_url}
    )
    row = conn.execute(
        f"""SELECT rr.id AS raw_report_id, rr.summary AS raw_summary,
                  rr.published_at AS raw_published_at, de.id AS event_id,
                  de.language, de.location_name, ST_X(de.geom) AS longitude,
                  ST_Y(de.geom) AS latitude, de.symptoms, de.disease_extracted,
                  de.disease_mentions, de.disease_classification, de.case_count,
                  de.death_count, de.event_date, de.confirmed_cases, de.suspected_cases,
                  de.hospitalizations, de.epidemiological_evidence,
                  de.confidence, de.outbreak_alert, de.sentiment,
                  de.needs_review, de.event_type, de.relevance_score,
                  de.source_credibility, de.source_credibility_label, de.is_health_related,
                  de.nlp_pipeline_version
           FROM raw_reports rr
           LEFT JOIN LATERAL (
               SELECT event.* FROM disease_events event
               WHERE event.raw_report_id=rr.id
               ORDER BY CASE WHEN event.parent_event_id IS NULL THEN 0 ELSE 1 END,
                        event.created_at DESC
               LIMIT 1
           ) de ON TRUE
            WHERE rr.processing_status IS DISTINCT FROM 'DUPLICATE'
              AND ({identity_clause})
            ORDER BY CASE WHEN de.id IS NOT NULL THEN 0 ELSE 1 END,
                     rr.created_at ASC, rr.id ASC
            LIMIT 1""",
         identity_params,
    ).fetchone()
    if row and row.get("event_id") and allow_cached and _pipeline_version_matches(row):
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
        raw_id = row.get("raw_report_id") or row.get("id")
        if not raw_id:
            raise RuntimeError("identity lookup returned a row without a raw report id")
        conn.execute(
            """UPDATE raw_reports SET processing_status='PROCESSING', original_text=%s,
                 normalized_url=COALESCE(normalized_url,%s), canonical_url=COALESCE(canonical_url,%s),
                 url_hash=COALESCE(url_hash,%s), content_hash=COALESCE(content_hash,%s),
                 final_url=COALESCE(final_url,%s), author=COALESCE(author,%s),
                 source_country=COALESCE(source_country,%s)
               WHERE id=%s""",
            (
                extracted.get("content", ""), extracted.get("normalized_url"), extracted.get("canonical_url"),
                extracted.get("url_hash"), extracted.get("content_hash"), extracted.get("final_url"),
                extracted.get("author"), extracted.get("source_country"), raw_id,
            ),
        )
        return raw_id, None
    raw = conn.execute(
        """INSERT INTO raw_reports(
             source_type,source_name,published_at,original_text,url,object_path,processing_status,
             normalized_url,canonical_url,url_hash,content_hash,final_url,author,source_country)
            VALUES ('web','URL Analyzer',%s,%s,%s,%s,'PROCESSING',%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT DO NOTHING
            RETURNING id""",
        (
            extracted.get("published_at"), extracted.get("content", ""), requested_url,
            extracted.get("object_path"), extracted.get("normalized_url"), extracted.get("canonical_url"),
            extracted.get("url_hash"), extracted.get("content_hash"), extracted.get("final_url"),
            extracted.get("author"), extracted.get("source_country"),
        ),
    ).fetchone()
    if not raw:
        resolved = conn.execute(
            f"""SELECT rr.id FROM raw_reports rr
                WHERE rr.processing_status IS DISTINCT FROM 'DUPLICATE'
                  AND ({identity_clause})
                ORDER BY rr.created_at ASC, rr.id ASC
                LIMIT 1 FOR UPDATE""",
            identity_params,
        ).fetchone()
        if not resolved:
            raise RuntimeError("RAW identity conflict did not resolve to a database row")
        raw = resolved
    logger.info("RAW retained before URL NLP: raw_id=%s url=%s", raw["id"], requested_url)
    return raw["id"], None

def process_job(job_id):
    from psycopg.types.json import Jsonb
    with connect() as lock_conn:
        lock_conn.autocommit = True
        locked = lock_conn.execute("SELECT pg_try_advisory_lock(hashtext(%s)) AS locked",(job_id,)).fetchone()["locked"]
        if not locked:
            # Another delivery is already processing this durable job state.
            return True
        try:
            row = lock_conn.execute("SELECT * FROM analysis_jobs WHERE id=%s",(job_id,)).fetchone()
            if not row:
                raise UnknownAnalysisJob(f"Analysis job was not found: {job_id}")
            if row["status"] in {"completed","partial","failed"}:
                return True

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
                          de.published_at AS event_published_at,
                          de.nlp_pipeline_version,
                          de.count_period_type,
                          de.event_date_start,
                          de.event_date_end,
                          de.date_needs_review
                   FROM raw_reports rr
                   LEFT JOIN LATERAL (
                       SELECT event.*
                       FROM disease_events event
                       WHERE event.raw_report_id = rr.id
                       ORDER BY CASE WHEN event.parent_event_id IS NULL THEN 0 ELSE 1 END,
                                event.created_at DESC
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

            cache_usable = (
                cached_report
                and cached_report.get("event_id")
                and not row.get("force_refresh", False)
                and _pipeline_version_matches(cached_report)
            )
            if cache_usable:
                latest = lock_conn.execute(
                    """SELECT warnings FROM analysis_jobs
                       WHERE id <> %s
                         AND (url = %s OR (%s::text IS NOT NULL AND normalized_url = %s))
                         AND status IN ('completed', 'partial', 'failed')
                       ORDER BY created_at DESC
                       LIMIT 1""",
                    (job_id, row["url"], row.get("normalized_url"), row.get("normalized_url")),
                ).fetchone()
                warnings_text = str((latest or {}).get("warnings") or "")
                weak_nlp = "Full NLP unavailable" in warnings_text or "exceeded budget" in warnings_text
            else:
                weak_nlp = None
            if cache_usable and not weak_nlp:
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
                    "nlp_pipeline_version": cached_report.get("nlp_pipeline_version") or NLP_PIPELINE_VERSION,
                    "count_period_type": cached_report.get("count_period_type") or "unknown",
                    "event_date_start": str(cached_report.get("event_date_start")) if cached_report.get("event_date_start") else None,
                    "event_date_end": str(cached_report.get("event_date_end")) if cached_report.get("event_date_end") else None,
                    "date_needs_review": bool(cached_report.get("date_needs_review")),
                    "raw_report_id": str(cached_report["raw_report_id"]),
                    "event_id": str(cached_report["event_id"]) if has_cached_event else None,
                    "cached": True,
                    "source": "database",
                })
                sibling_facts = load_sibling_facts(lock_conn, cached_report.get("raw_report_id"))
                if len(sibling_facts) >= 2:
                    res["sub_events"] = sibling_facts
                    extracted = list(res.get("disease_extracted") or [])
                    for fact in sibling_facts:
                        name = fact.get("disease")
                        if name and name not in extracted:
                            extracted.append(name)
                    res["disease_extracted"] = extracted
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
                return True

            def progress(stage):
                lock_conn.execute("UPDATE analysis_jobs SET status='processing',stage=%s,updated_at=NOW() WHERE id=%s",
                                  (stage, job_id))
            retained = {"raw_id": None, "lock_conn": None, "lock_keys": ()}

            fetch_for_job = fetch_article
            reuse_stored_raw = cached_report and not row.get("force_refresh", False) and (
                not cached_report.get("event_id")
                or weak_nlp
                or not _pipeline_version_matches(cached_report)
            )
            if reuse_stored_raw:
                # RAW already exists but NLP did not finish, or the previous
                # event was a rules-only/timeout fallback. Reuse stored text.
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
                logger.info("Reusing stored RAW for Full NLP: raw_id=%s", cached_report["raw_report_id"])

            def before_nlp(extracted):
                retained["lock_keys"] = identity_lock_keys({**extracted, "url": row["url"]})
                if retained["lock_keys"]:
                    retained["lock_conn"] = connect()
                    retained["lock_conn"].autocommit = True
                    for lock_key in retained["lock_keys"]:
                        retained["lock_conn"].execute(
                            "SELECT pg_advisory_lock(hashtext(%s))", (lock_key,)
                        )
                with connect() as raw_conn:
                    raw_id, cached_result = retain_raw_or_get_cached(
                        raw_conn,
                        row["url"],
                        extracted,
                        allow_cached=not row.get("force_refresh", False) and not weak_nlp,
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
                    # Persist Full NLP completions. Rules-only partials are
                    # opt-in and must not become a cache hit that hides a 408.
                    persist_event = (
                        result
                        and not outcome.get("cached")
                        and (
                            outcome["status"] == "completed"
                            or (
                                outcome["status"] == "partial"
                                and rules_only_fallback_enabled()
                                and not any(
                                    "Full NLP unavailable" in str(item)
                                    or "exceeded budget" in str(item)
                                    for item in (outcome.get("warnings") or [])
                                )
                            )
                        )
                    )
                    if persist_event:
                        save_completed(conn, job_id, result, raw_report_id=retained["raw_id"])
                    elif outcome.get("cached") and result and result.get("event_id"):
                        conn.execute("UPDATE analysis_jobs SET event_id=%s WHERE id=%s", (result["event_id"], job_id))
                    conn.execute("UPDATE analysis_jobs SET status=%s,stage='finished',result=%s,warnings=%s,error=%s,updated_at=NOW() WHERE id=%s",
                        (outcome["status"],Jsonb(result if result is not None else {}),Jsonb(outcome["warnings"]),outcome.get("error"),job_id))
            finally:
                if retained["lock_conn"] is not None:
                    for lock_key in reversed(retained["lock_keys"]):
                        retained["lock_conn"].execute(
                            "SELECT pg_advisory_unlock(hashtext(%s))", (lock_key,)
                        )
                    retained["lock_conn"].close()
            return True
        except UnknownAnalysisJob:
            raise
        except Exception:
            logger.exception("Analysis job failed: %s", job_id)
            try:
                failed = lock_conn.execute(
                    "UPDATE analysis_jobs SET status='failed',error='Analysis storage failed; please retry',updated_at=NOW() WHERE id=%s",
                    (job_id,),
                )
                if failed.rowcount != 1:
                    raise RuntimeError(f"Analysis job failure state was not persisted: {job_id}")
                state = lock_conn.execute(
                    "SELECT status FROM analysis_jobs WHERE id=%s", (job_id,)
                ).fetchone()
                if not state or state["status"] != "failed":
                    raise RuntimeError(f"Analysis job failure state was not durable: {job_id}")
                return True
            except Exception:
                logger.exception("Could not persist failed analysis job state: %s", job_id)
                raise
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
            confirmed = channel.basic_publish(
                "", QUEUE, json.dumps({"job_id": str(row["id"])}),
                properties=pika.BasicProperties(delivery_mode=2, content_type="application/json"),
                mandatory=True,
            )
            if confirmed is False:
                raise RuntimeError(f"RabbitMQ rejected analysis job {row['id']}")
            conn.execute("UPDATE analysis_jobs SET dispatched_at=NOW() WHERE id=%s",(row["id"],))


def _run_matrix_worker_process():
    """Run manual crawler jobs without consuming the URL-analysis queue."""
    from .crawl_matrix_jobs import main as matrix_main
    matrix_main()


def spawn_matrix_worker_enabled():
    """Existing analysis-job-worker already runs both jobs in one compose service.

    Keep that layout: no docker-compose.yml change. Separate RabbitMQ queues
    stop URL analysis and the crawler from acknowledging each other's messages.
    Set ANALYSIS_WORKER_SPAWN_MATRIX=false only if a dedicated crawl worker
    is already running elsewhere.
    """
    return os.getenv("ANALYSIS_WORKER_SPAWN_MATRIX", "true").lower() in {"1", "true", "yes", "on"}


def analysis_prefetch():
    return max(1, min(int(os.getenv("ANALYSIS_URL_PREFETCH", "1")), 4))


def _handle_analysis_message(channel, method, _properties, body):
    try:
        payload = json.loads(body)
        job_id = str(__import__("uuid").UUID(payload["job_id"]))
    except (ValueError, KeyError, json.JSONDecodeError, TypeError):
        logger.warning("Rejecting malformed analysis job message")
        settle_malformed_delivery(channel, method, _properties, body, QUEUE)
        return

    try:
        processed = process_job(job_id)
        if processed is not True:
            raise RuntimeError("Analysis job did not reach a durable terminal or active state")
    except UnknownAnalysisJob:
        logger.warning("Rejecting analysis message for unknown durable job: %s", job_id)
        settle_malformed_delivery(channel, method, _properties, body, QUEUE)
        return
    except Exception:
        logger.exception("Analysis job callback failed")
        settle_transient_delivery(channel, method, _properties, body, QUEUE, "analysis callback failure")
        return

    try:
        channel.basic_ack(delivery_tag=method.delivery_tag)
    except Exception:
        logger.exception("Failed to ack analysis job message")


def consume_analysis_queue(channel):
    declare_queue_topology(channel, (QUEUE,))
    channel.basic_qos(prefetch_count=analysis_prefetch())
    channel.basic_consume(queue=QUEUE, on_message_callback=_handle_analysis_message, auto_ack=False)


def main():
    import pika
    from multiprocessing import Process

    logging.basicConfig(level=logging.INFO)
    matrix_process = None
    if spawn_matrix_worker_enabled():
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
                channel.confirm_delivery()
                consume_analysis_queue(channel)

                def outbox():
                    try:
                        dispatch(channel)
                    except Exception:
                        logger.exception("analysis outbox dispatch failed")
                    try:
                        broker.call_later(15, outbox)
                    except Exception:
                        pass

                broker.call_later(1, outbox)
                while broker.is_open:
                    if matrix_process is not None and not matrix_process.is_alive():
                        logger.warning("Manual crawler worker stopped; restarting child process")
                        matrix_process = Process(
                            target=_run_matrix_worker_process,
                            name="manual-crawler-worker",
                            daemon=True,
                        )
                        matrix_process.start()
                    broker.process_data_events(time_limit=1)
        except Exception:
            logger.exception("Analysis worker unavailable; reconnecting")
            time.sleep(5)

if __name__ == "__main__":
    main()
