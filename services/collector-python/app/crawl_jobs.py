"""Filtered news crawling for the factual surveillance matrix.

The collector is an I/O adapter: it fetches articles, calls the shared NLP
core, applies the crawl request filter, and persists the returned facts. Alert,
severity, and outbreak decisions are not implemented in this service.
"""
import asyncio
import datetime as dt
import logging
import re
from typing import Any
from urllib.parse import quote_plus, urlparse

import feedparser
import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator
from psycopg.types.json import Jsonb

from . import config
from .collectors.web_scraper import WebScraperCollector
from .crawler_identity import UnsafeUrlError, identity_fields, validate_public_url

router = APIRouter()
logger = logging.getLogger(__name__)

ASEAN_COUNTRIES = {
    "Brunei", "Cambodia", "Indonesia", "Laos", "Malaysia", "Myanmar",
    "Philippines", "Singapore", "Thailand", "Timor-Leste", "Vietnam",
}


class CrawlJobRequest(BaseModel):
    disease_concept_ids: list[str] = Field(default_factory=list, max_length=20)
    url: str | None = None
    country: str | None = None
    region: str | None = None
    province_city: str | None = None
    date_from: dt.date | None = None
    date_to: dt.date | None = None
    max_articles: int = Field(default=20, ge=1, le=500)

    @field_validator("url", "country", "region", "province_city", mode="before")
    @classmethod
    def clean_text(cls, value):
        if value is None:
            return None
        value = str(value).strip()
        return value or None

    @field_validator("url")
    @classmethod
    def validate_article_url(cls, value):
        if value is None:
            return None
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username:
            raise ValueError("Article URL must use valid HTTP(S)")
        return value


def _connection():
    import psycopg
    from psycopg.rows import dict_row
    return psycopg.connect(config.DATABASE_URL, row_factory=dict_row, connect_timeout=5)


def _safe_date(value: Any) -> str | None:
    if not value:
        return None
    if isinstance(value, (dt.date, dt.datetime)):
        return value.date().isoformat() if isinstance(value, dt.datetime) else value.isoformat()
    raw = str(value)
    match = re.search(r"20\d{2}-\d{2}-\d{2}", raw)
    return match.group(0) if match else None


def _source_name(url: str) -> str:
    return (urlparse(url).hostname or "Google News").removeprefix("www.")


def sanitize_crawl_url(url: str | None, resolver=None) -> str | None:
    """Reject private/loopback destinations before the job is queued."""
    if not url:
        return None
    if resolver is None:
        return validate_public_url(url)
    return validate_public_url(url, resolver=resolver)


def _build_news_query(disease_names: list[str], country: str | None, region: str | None) -> str:
    disease_terms = [f'"{name}"' if " " in name else name for name in disease_names if name]
    if not disease_terms:
        raise ValueError("Select at least one disease from the local disease master")
    query = f"({' OR '.join(disease_terms)})"
    geography = (country or "").strip()
    if not geography and region and region.casefold() not in {"asean", "global"}:
        geography = region.strip()
    return f"{query} {geography}".strip()


def _discover_urls(disease_names: list[str], country: str | None, region: str | None, limit: int) -> list[dict]:
    query = _build_news_query(disease_names, country, region)
    feed_url = (
        "https://news.google.com/rss/search?q=" + quote_plus(query) +
        "&hl=en&gl=US&ceid=US:en"
    )
    feed = feedparser.parse(feed_url)
    if feed.bozo and not feed.entries:
        raise RuntimeError(f"Google News RSS tidak dapat diakses: {feed.bozo_exception}")
    results = []
    seen = set()
    for entry in feed.entries:
        url = str(entry.get("link") or "").strip()
        if not url or url in seen:
            continue
        seen.add(url)
        published = str(entry.get("published") or entry.get("updated") or "")
        try:
            from dateutil.parser import parse
            published = parse(published).date().isoformat() if published else None
        except Exception:
            published = None
        source = entry.get("source") or {}
        publisher = source.get("title") if isinstance(source, dict) else None
        results.append({
            "url": url,
            "title": str(entry.get("title") or "").strip(),
            "published_at": published,
            "source_name": str(publisher or _source_name(url)).strip(),
        })
        if len(results) >= limit:
            break
    return results


def _matching_concepts(conn, ids: list[str]) -> list[dict]:
    if not ids:
        return []
    rows = conn.execute(
        """SELECT id, disease_id, canonical_name, source FROM disease_concepts
           WHERE is_active=TRUE AND id = ANY(%s::uuid[]) ORDER BY canonical_name""",
        (ids,),
    ).fetchall()
    if len(rows) != len(set(ids)):
        raise ValueError("One or more selected diseases are missing or inactive in the local disease master")
    return [dict(row) for row in rows]


def _country_coordinates(conn, country: str):
    row = conn.execute(
        """SELECT latitude, longitude FROM locations
           WHERE is_active=TRUE AND (LOWER(name)=LOWER(%s) OR LOWER(country)=LOWER(%s))
           ORDER BY CASE WHEN LOWER(name)=LOWER(%s) THEN 0 ELSE 1 END, name
           LIMIT 1""",
        (country, country, country),
    ).fetchone()
    return (row["latitude"], row["longitude"]) if row else (None, None)


def _disease_labels(analysis: dict) -> list[str]:
    """Return surveillance disease labels without treating a string as chars."""
    value = analysis.get("disease_classification")
    if isinstance(value, (list, tuple, set)):
        return [str(item).strip() for item in value if str(item).strip()]
    if value is None:
        return []
    label = str(value).strip()
    return [label] if label else []


def _selected_concept(labels: list[str], concepts: list[dict]) -> tuple[str, dict | None]:
    """Resolve one NLP label to the selected local-master concept."""
    for label in labels:
        label_key = label.casefold()
        for concept in concepts:
            concept_key = str(concept["canonical_name"]).casefold()
            if label_key == concept_key or label_key in concept_key or concept_key in label_key:
                return label, concept
    return (labels[0] if labels else ""), None


def _article_matches(analysis: dict, disease_names: list[str], country: str | None) -> bool:
    found = [value.casefold() for value in _disease_labels(analysis)]
    if disease_names and not any(
        name.casefold() in value or value in name.casefold()
        for name in disease_names for value in found
    ):
        return False
    if country:
        return any(str(item.get("country") or "").casefold() == country.casefold()
                   for item in analysis.get("locations") or [])
    return True


def analyze_article(article: dict) -> dict:
    """Call the shared NLP core through the collector compatibility adapter."""
    response = requests.post(
        config.NLP_SERVICE_URL.rstrip("/") + "/nlp/analyze/surveillance",
        json={
            "text": article.get("content") or "",
            "source_type": "news",
            "source_name": article.get("source_name"),
            "published_at": article.get("published_at"),
            "source_url": article.get("url"),
        },
        timeout=(5, 120),
    )
    response.raise_for_status()
    return response.json()


def _ensure_raw_report(conn, article: dict):
    identity = identity_fields(
        article.get("url", ""), article.get("content", ""),
        canonical_url=article.get("canonical_url", ""),
        final_url=article.get("final_url", ""),
    )
    candidates = [
        (field, value)
        for field, value in (("url", article.get("url")), *identity.items())
        if str(value or "").strip()
    ]
    lock_keys = sorted({f"crawler-document:{field}:{value}" for field, value in candidates})
    for key in lock_keys:
        conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (key,))
    where = " OR ".join(f"{field}=%s" for field, _ in candidates) or "FALSE"
    params = [value for _, value in candidates]
    row = conn.execute(
        f"""SELECT id FROM raw_reports
            WHERE processing_status IS DISTINCT FROM 'DUPLICATE' AND ({where})
            ORDER BY created_at ASC, id ASC LIMIT 1 FOR UPDATE""",
        params,
    ).fetchone()
    if row:
        raw_id = row["id"]
        conn.execute("DELETE FROM disease_events WHERE raw_report_id=%s", (raw_id,))
        conn.execute(
            """UPDATE raw_reports
               SET source_type='news', source_name=%s, published_at=%s,
                   original_text=%s, url=%s, processing_status='PROCESSED',
                   normalized_url=%s, canonical_url=%s, url_hash=%s,
                   content_hash=%s, final_url=%s
             WHERE id=%s""",
            (
                article.get("source_name"), article.get("published_at"), article.get("content", ""),
                article.get("url"), identity["normalized_url"], identity["canonical_url"],
                identity["url_hash"], identity["content_hash"], identity["final_url"], raw_id,
            ),
        )
        return raw_id
    raw = conn.execute(
        """INSERT INTO raw_reports
           (source_type, source_name, published_at, original_text, url, processing_status,
            normalized_url, canonical_url, url_hash, content_hash, final_url)
           VALUES ('news',%s,%s,%s,%s,'PROCESSED',%s,%s,%s,%s,%s)
           ON CONFLICT DO NOTHING RETURNING id""",
        (
            article.get("source_name"), article.get("published_at"), article.get("content", ""),
            article.get("url"), identity["normalized_url"], identity["canonical_url"],
            identity["url_hash"], identity["content_hash"], identity["final_url"],
        ),
    ).fetchone()
    if not raw:
        raw = conn.execute(
            f"""SELECT id FROM raw_reports
                WHERE processing_status IS DISTINCT FROM 'DUPLICATE' AND ({where})
                ORDER BY created_at ASC, id ASC LIMIT 1 FOR UPDATE""",
            params,
        ).fetchone()
    if not raw:
        raise RuntimeError("RAW identity conflict did not resolve to a database row")
    return raw["id"]


def _persist_article(conn, job_id: str, article: dict, analysis: dict, concepts: list[dict], request: dict) -> int:
    from psycopg.types.json import Jsonb
    published = _safe_date(article.get("published_at") or analysis.get("published_date"))
    article = {**article, "published_at": published}
    raw_id = _ensure_raw_report(conn, article)
    rows = 0
    selected = concepts
    disease_labels = _disease_labels(analysis)
    disease, concept = _selected_concept(disease_labels, selected)
    for item in analysis.get("locations") or []:
        country = str(item.get("country") or "").strip()
        if not country:
            continue
        if request.get("country") and country.casefold() != request["country"].casefold():
            continue
        if request.get("region", "").casefold() == "asean" and country not in ASEAN_COUNTRIES:
            continue
        if request.get("date_from") and published and published < request["date_from"]:
            continue
        if request.get("date_to") and published and published > request["date_to"]:
            continue
        latitude, longitude = _country_coordinates(conn, country)
        provinces = item.get("provinces") or []
        if request.get("province_city") and not any(
            request["province_city"].casefold() in str(province).casefold()
            for province in provinces
        ):
            continue
        evidence = ""
        # The strict extractor includes evidence internally only in its relation
        # stage; retain a deterministic article excerpt when it is unavailable.
        content = article.get("content", "")
        for sentence in re.split(r"(?<=[.!?])\s+|\n+", content):
            if country.casefold() in sentence.casefold() and re.search(r"\d", sentence):
                evidence = sentence.strip()[:1000]
                break
        conn.execute(
            """INSERT INTO crawl_matrix_rows
               (crawl_job_id, raw_report_id, disease_concept_id, disease_name, icd11_code,
                crawling_date, region, country, province_city_case, article_date, date_case,
                number_of_cases, number_of_deaths, latitude, longitude, source_type, source_name,
                source_url, article_title, evidence, confidence, processing_status)
               VALUES (%s,%s,%s,%s,%s,CURRENT_DATE,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (job_id, raw_id, concept["id"] if concept else None, disease,
             None,
             "ASEAN" if country in ASEAN_COUNTRIES else (request.get("region") or "Global"),
             country, ", ".join(provinces), published, item.get("time_frame") or "",
             int(item.get("reported_cases") or 0), int(item.get("deaths") or 0), latitude, longitude,
             "news", article.get("source_name"), article.get("url"), article.get("title"), evidence,
             float(analysis.get("source_reliability_score") or 0.0),
             "needs_review" if not evidence else "processed"),
        )
        rows += 1
    return rows


async def _run_job(job_id: str, payload: dict, reprocess: bool = False):
    """Legacy in-process runner. Production uses ``python -m app.crawl_matrix_jobs``."""
    warnings: list[str] = []
    try:
        with _connection() as conn:
            concepts = _matching_concepts(conn, payload.get("disease_concept_ids") or [])
            disease_names = [str(row["canonical_name"]) for row in concepts]
            conn.execute("UPDATE crawl_matrix_jobs SET status='processing', updated_at=NOW() WHERE id=%s", (job_id,))
            conn.commit()

        if reprocess:
            with _connection() as conn:
                articles = conn.execute(
                    """SELECT r.id, r.original_text AS content, r.url, r.source_name,
                              r.published_at::text AS published_at, '' AS title
                       FROM raw_reports r JOIN crawl_matrix_rows m ON m.raw_report_id=r.id
                       WHERE m.crawl_job_id=%s GROUP BY r.id""", (job_id,)
                ).fetchall()
                conn.execute("DELETE FROM crawl_matrix_rows WHERE crawl_job_id=%s", (job_id,))
                conn.commit()
            discovered = [dict(row) for row in articles]
        else:
            direct_url = str(payload.get("url") or "").strip()
            if direct_url:
                discovered = [{
                    "url": direct_url,
                    "title": "",
                    "published_at": None,
                    "source_name": _source_name(direct_url),
                }]
            else:
                discovered = await asyncio.to_thread(_discover_urls, disease_names, payload.get("country"), payload.get("region"), payload.get("max_articles", 20))
            with _connection() as conn:
                conn.execute("UPDATE crawl_matrix_jobs SET discovered_count=%s, updated_at=NOW() WHERE id=%s", (len(discovered), job_id))
                conn.commit()

        processed = 0
        row_count = 0
        for item in discovered:
            try:
                if not reprocess:
                    collector = WebScraperCollector({"id": "crawl-matrix", "name": item.get("source_name", "News"), "config": {"fetch_mode": "http", "timeout_ms": 12000, "max_pages": 1, "max_retries": 0, "skip_stealth": True}})
                    extracted = await asyncio.wait_for(collector.extract_url(item["url"]), timeout=18)
                    article = {**item, **extracted, "url": item["url"], "source_name": item.get("source_name")}
                else:
                    article = item
                if not (article.get("content") or "").strip():
                    raise ValueError("Artikel tidak memiliki isi")
                analysis = analyze_article(article)
                if not _article_matches(analysis, disease_names, payload.get("country")):
                    continue
                with _connection() as conn:
                    row_count += _persist_article(conn, job_id, article, analysis, concepts, payload)
                    conn.commit()
                processed += 1
            except Exception as exc:
                warnings.append(f"{item.get('url', 'article')}: {str(exc)[:180]}")
                logger.warning("Crawl article failed: %s", exc)
            with _connection() as conn:
                conn.execute("UPDATE crawl_matrix_jobs SET processed_count=%s, row_count=%s, warnings=%s, updated_at=NOW() WHERE id=%s", (processed, row_count, Jsonb(warnings), job_id))
                conn.commit()
        with _connection() as conn:
            conn.execute("""UPDATE crawl_matrix_jobs SET status=%s, processed_count=%s, row_count=%s,
                         warnings=%s, updated_at=NOW(), completed_at=NOW() WHERE id=%s""",
                         ("partial" if warnings and row_count else ("failed" if warnings and not row_count else "completed"), processed, row_count, Jsonb(warnings), job_id))
            conn.commit()
    except Exception as exc:
        logger.exception("Crawl job failed: %s", exc)
        with _connection() as conn:
            conn.execute("UPDATE crawl_matrix_jobs SET status='failed', error=%s, warnings=%s, updated_at=NOW(), completed_at=NOW() WHERE id=%s", (str(exc)[:500], Jsonb(warnings), job_id))
            conn.commit()


@router.post("/crawl-jobs")
async def create(payload: CrawlJobRequest):
    payload_dict = payload.model_dump(mode="json")
    if payload.url:
        try:
            payload_dict["url"] = sanitize_crawl_url(payload.url)
        except (UnsafeUrlError, ValueError) as exc:
            raise HTTPException(400, str(exc)) from exc
    with _connection() as conn:
        concepts = _matching_concepts(conn, payload.disease_concept_ids)
        if not concepts:
            raise HTTPException(400, "Select at least one active disease from the local disease master")
        row = conn.execute(
            """INSERT INTO crawl_matrix_jobs(disease_concept_ids,disease_names,region,country,province_city,date_from,date_to,max_articles,query)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id,status,created_at""",
            (Jsonb(payload.disease_concept_ids), Jsonb([r["canonical_name"] for r in concepts]), payload.region, payload.country,
             payload.province_city, payload.date_from, payload.date_to, payload.max_articles, Jsonb(payload_dict)),
        ).fetchone()
        job_id = str(row["id"])
    # Processing is handled by the dedicated crawl-matrix worker. Keeping the
    # API request limited to enqueueing makes jobs durable across collector
    # restarts and prevents matrix crawling from blocking /extract-url or the
    # normal collector scheduler.
    try:
        from .rabbitmq import publish_to_queue
        published = publish_to_queue(config.RABBITMQ_CRAWL_MATRIX_QUEUE, {"job_id": job_id})
        if not published:
            logger.warning(
                "RabbitMQ publish skipped for crawl job %s; worker outbox will retry", job_id
            )
    except Exception:
        logger.warning(
            "RabbitMQ publish skipped for crawl job %s; worker outbox will retry", job_id
        )
    return {"success": True, "data": {"job_id": job_id, "status": row["status"], "created_at": row["created_at"]}}


@router.get("/crawl-jobs/{job_id}")
def status(job_id: str):
    with _connection() as conn:
        job = conn.execute("SELECT * FROM crawl_matrix_jobs WHERE id=%s", (job_id,)).fetchone()
        if not job:
            raise HTTPException(404, "Manual crawler job was not found")
        rows = conn.execute("""SELECT m.id, m.disease_name, m.icd11_code, m.crawling_date::text, m.region, m.country,
                    m.province, m.city, m.province_city_case, m.article_date::text, m.date_case,
                    m.number_of_cases, m.number_of_deaths, m.latitude, m.longitude, m.source_type, m.source_name,
                    m.source_url, m.article_title, m.evidence, m.confidence, m.processing_status,
                    m.raw_report_id, m.reprocessed_at::text,
                    de.language, de.event_type, de.sentiment, de.relevance_score,
                    de.is_health_related, de.source_credibility
                    FROM crawl_matrix_rows m
                    LEFT JOIN LATERAL (
                        SELECT language, event_type, sentiment, relevance_score::text AS relevance_score,
                               is_health_related, source_credibility
                        FROM disease_events
                        WHERE raw_report_id = m.raw_report_id
                        ORDER BY CASE WHEN parent_event_id IS NULL THEN 0 ELSE 1 END, created_at DESC
                        LIMIT 1
                    ) de ON TRUE
                    WHERE m.crawl_job_id=%s
                    ORDER BY m.article_date DESC NULLS LAST, m.country, m.disease_name""", (job_id,)).fetchall()
    return {"success": True, "data": {"job_id": job_id, "status": job["status"], "disease_names": job["disease_names"],
        "region": job["region"], "country": job["country"], "discovered_count": job["discovered_count"],
        "processed_count": job["processed_count"], "row_count": job["row_count"], "warnings": job["warnings"],
        "error": job["error"], "query": job["query"], "created_at": job["created_at"], "updated_at": job["updated_at"],
        "rows": [dict(row) for row in rows]}}


@router.post("/crawl-jobs/{job_id}/reprocess")
async def reprocess(job_id: str):
    with _connection() as conn:
        row = conn.execute("SELECT query FROM crawl_matrix_jobs WHERE id=%s", (job_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Manual crawler job was not found")
        conn.execute("""UPDATE crawl_matrix_jobs
                       SET status='queued', error=NULL, warnings='[]',
                           query = query || '{"_reprocess": true}'::jsonb,
                           updated_at=NOW()
                       WHERE id=%s""", (job_id,))
        conn.commit()
    try:
        from .rabbitmq import publish_to_queue
        published = publish_to_queue(config.RABBITMQ_CRAWL_MATRIX_QUEUE, {"job_id": job_id})
        if not published:
            logger.warning(
                "RabbitMQ publish skipped for crawl reprocess %s; worker outbox will retry", job_id
            )
    except Exception:
        logger.warning(
            "RabbitMQ publish skipped for crawl reprocess %s; worker outbox will retry", job_id
        )
    return {"success": True, "data": {"job_id": job_id, "status": "queued"}}
