"""Durable worker for filtered crawling matrix jobs.

This worker can run as a child of ``python -m app.analysis_jobs`` (the existing
analysis-job-worker compose service) or standalone. It never consumes the
URL-analysis or bulk ingest queues, so the two jobs cannot ack each other's
messages.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import html
import json
import logging
import os
import queue
import re
import socket
import threading
import time
import uuid
import xml.etree.ElementTree as ET
from urllib.parse import quote_plus, urlparse

import psycopg
import requests
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from .geo import coords_in_country_bbox, country_centroid, st_makepoint_args
from .document_identity import identity_lock_keys, identity_where_clause
from .kpi import mark_kpi_snapshots_stale, nlp_needs_review
from .queue_reliability import (
    declare_queue_topology,
    settle_malformed_delivery,
    settle_transient_delivery,
)

logger = logging.getLogger("crawl-matrix-worker")
DATABASE_URL = os.getenv("DATABASE_URL", "postgres://postgres:root@host.docker.internal:9898/disease_ai")
COLLECTOR_URL = os.getenv("COLLECTOR_URL", "http://disease-collector-python:8002").rstrip("/")
NLP_SERVICE_URL = os.getenv("NLP_SERVICE_URL", "http://disease-nlp-python:8000").rstrip("/")
NLP_REQUEST_TIMEOUT_SECONDS = max(
    120, int(os.getenv("NLP_REQUEST_TIMEOUT_SECONDS", "270"))
)
POLL_SECONDS = max(1.0, float(os.getenv("CRAWL_MATRIX_POLL_SECONDS", "5")))
STALE_MINUTES = max(5, int(os.getenv("CRAWL_MATRIX_STALE_MINUTES", "15")))
CRAWL_QUEUE = os.getenv("CRAWL_MATRIX_QUEUE", "disease.crawl-matrix")
ARTICLE_WORKERS = max(1, min(int(os.getenv("CRAWL_MATRIX_ARTICLE_WORKERS", "3")), 6))
SURVEILLANCE_PIPELINE = "analyze-raw-v1"
MATRIX_WORKER_ID = os.getenv("CRAWL_MATRIX_WORKER_ID") or (
    f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4()}"
)
_job_lock = threading.Lock()
_pending_jobs: queue.SimpleQueue[tuple[str, dict, str]] = queue.SimpleQueue()
_wake = threading.Event()

ASEAN_COUNTRIES = {
    "Brunei", "Cambodia", "Indonesia", "Laos", "Malaysia", "Myanmar",
    "Philippines", "Singapore", "Thailand", "Timor-Leste", "Vietnam",
}
NON_GEO_PROVINCE_TOKENS = {
    "were", "was", "been", "have", "has", "had", "did", "does",
    "would", "could", "should", "might", "will", "asia",
}


def clean_province_names(provinces) -> list[str]:
    cleaned = []
    for item in provinces or []:
        name = str(item or "").strip()
        if not name or name.casefold() in NON_GEO_PROVINCE_TOKENS:
            continue
        cleaned.append(name)
    return cleaned


def surveillance_scope_for_country(country: str | None) -> str | None:
    value = str(country or '').strip().casefold()
    if not value:
        return None
    return 'ASEAN' if value in {item.casefold() for item in ASEAN_COUNTRIES} else 'Outside ASEAN'


def split_province_city(names: list[str]) -> tuple[str | None, str | None]:
    cleaned = clean_province_names(names)
    if not cleaned:
        return None, None
    city_hints = ("city", "kota", "town", "municipality", "kabupaten")
    cities = [name for name in cleaned if any(hint in name.casefold() for hint in city_hints)]
    provinces = [name for name in cleaned if name not in cities]
    province = provinces[0] if provinces else None
    city = cities[0] if cities else (cleaned[1] if len(cleaned) > 1 else None)
    if province is None and city is None and cleaned:
        province = cleaned[0]
    return province, city


def connect():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row, connect_timeout=5)


def safe_date(value) -> str | None:
    if not value:
        return None
    if isinstance(value, (dt.date, dt.datetime)):
        return value.date().isoformat() if isinstance(value, dt.datetime) else value.isoformat()
    match = re.search(r"20\d{2}-\d{2}-\d{2}", str(value))
    return match.group(0) if match else None


def source_name(url: str) -> str:
    return (urlparse(url).hostname or "URL Analyzer").removeprefix("www.")


def build_news_query(disease_names: list[str], country: str | None, region: str | None) -> str:
    """Build an effective Google News query for the selected filters."""
    disease_terms = [f'"{name}"' if " " in name else name for name in disease_names if name]
    if not disease_terms:
        raise ValueError("Select at least one disease from the local disease master")
    # Take up to 5 diseases to prevent query overflow in Google News
    selected_diseases = disease_terms[:5]
    query = f"({' OR '.join(selected_diseases)})"
    geography = (country or "").strip()
    if not geography:
        if region and region.casefold() == "asean":
            geography = "(Indonesia OR Malaysia OR Vietnam OR Thailand OR Philippines OR Singapore OR Cambodia OR Myanmar OR Laos OR Brunei)"
        elif region and region.casefold() not in {"asean", "global"}:
            geography = region.strip()
    return f"{query} {geography}".strip()


def discover_google_news(disease_names: list[str], country: str | None, region: str | None, limit: int) -> list[dict]:
    query = build_news_query(disease_names, country, region)
    logger.info("Discovering matrix articles with Google News query=%r limit=%s", query, limit)
    response = requests.get(
        "https://news.google.com/rss/search?q=" + quote_plus(query) + "&hl=en&gl=US&ceid=US:en",
        timeout=(5, 20),
    )
    response.raise_for_status()
    root = ET.fromstring(response.content)
    results: list[dict] = []
    seen: set[str] = set()
    items = root.findall(".//item") or root.findall(".//{*}item") or root.findall(".//{*}entry")
    for item in items:
        url = html.unescape((item.findtext("link") or "").strip())
        if not url:
            link = item.find("{*}link")
            url = html.unescape(str(link.get("href") or "").strip()) if link is not None else ""
        if not url or url in seen:
            continue
        seen.add(url)
        published = item.findtext("pubDate") or item.findtext("{*}published") or item.findtext("{*}updated") or ""
        try:
            from dateutil.parser import parse
            published = parse(published).date().isoformat() if published else None
        except Exception:
            published = None
        results.append({
            "url": url,
            "title": html.unescape((item.findtext("title") or item.findtext("{*}title") or "").strip()),
            "published_at": published,
            "source_name": source_name(url),
        })
        if len(results) >= limit:
            break
    if not results:
        logger.warning("Google News returned no matrix articles for query=%r", query)
    return results


def discover_urls(disease_names: list[str], country: str | None, region: str | None, limit: int,
                  date_from: str | None = None, date_to: str | None = None) -> tuple[list[dict], list[str]]:
    """Use collector-owned multi-source discovery, retaining a Google fallback."""
    try:
        response = requests.post(
            COLLECTOR_URL + "/discover-urls",
            json={
                "disease_names": disease_names,
                "country": country,
                "region": region,
                "date_from": date_from,
                "date_to": date_to,
                "max_urls": limit,
            },
            timeout=(5, 90),
        )
        response.raise_for_status()
        body = response.json()
        return list(body.get("data") or []), list(body.get("warnings") or [])
    except Exception as exc:
        warning = f"Multi-source discovery unavailable; Google News fallback used ({str(exc)[:120]})"
        logger.warning(warning)
        return discover_google_news(disease_names, country, region, limit), [warning]


def disease_labels(analysis: dict) -> list[str]:
    labels: list[str] = []

    def add(value) -> None:
        if isinstance(value, dict):
            for key in ("canonical_name", "disease_name", "name", "label", "surface_form"):
                add(value.get(key))
            return
        if isinstance(value, (list, tuple, set)):
            for item in value:
                add(item)
            return
        text = str(value or "").strip()
        if text and text.casefold() not in {item.casefold() for item in labels}:
            labels.append(text)

    # Surveillance NLP returns classification labels, while older or
    # alternate NLP contracts may populate disease_extracted/mentions only.
    # Use all resolved disease fields for filtering, not just one display field.
    for key in ("disease_classification", "disease_extracted", "disease_mentions"):
        add(analysis.get(key))
    return labels


def normalize_country(value: str | None) -> str:
    aliases = {
        "brunei darussalam": "brunei",
        "viet nam": "vietnam",
        "timor lest": "timor-leste",
        "timor leste": "timor-leste",
        "lao pdr": "laos",
        "lao people's democratic republic": "laos",
        "republic of the philippines": "philippines",
    }
    normalized = re.sub(r"\s+", " ", str(value or "").strip().casefold())
    return aliases.get(normalized, normalized)


DISEASE_SYNONYMS = {
    "dengue": (
        "dengue", "dbd", "demam berdarah", "dengue fever",
        "dengue haemorrhagic fever", "dengue hemorrhagic fever",
    ),
    "measles": ("measles", "campak"),
    "cholera": ("cholera", "kolera"),
    "malaria": ("malaria",),
    "mpox": ("mpox", "monkeypox"),
    "covid-19": ("covid-19", "covid", "coronavirus"),
    "influenza": ("influenza", "flu"),
    "avian influenza": ("avian influenza", "h5n1", "bird flu", "flu burung"),
    "hantavirus infection": ("hantavirus", "hantavirus infection"),
}

NON_COUNTRY_LOCATION_LABELS = {
    "asia", "africa", "europe", "oceania", "antarctica",
    "southeast asia", "south east asia", "east asia", "south asia",
    "west asia", "central asia", "north america", "south america",
    "central america", "middle east", "asean", "asean / asia", "international",
}


def expand_disease_terms(names: list[str] | tuple[str, ...] | set[str]) -> list[str]:
    """Expand local master names so campak/DBD match selected concepts."""
    terms: list[str] = []
    seen: set[str] = set()
    for name in names:
        folded = str(name or "").strip().casefold()
        if not folded or folded in seen:
            continue
        seen.add(folded)
        terms.append(folded)
        extras: list[str] = []
        for canonical, aliases in DISEASE_SYNONYMS.items():
            alias_list = list(aliases)
            if folded == canonical or folded in alias_list:
                extras.extend([canonical, *alias_list])
        for extra in extras:
            if extra not in seen:
                seen.add(extra)
                terms.append(extra)
    return terms


def _term_in_text(term: str, haystack: str) -> bool:
    if not term:
        return False
    if len(term) <= 3:
        return re.search(rf"\b{re.escape(term)}\b", haystack) is not None
    return term in haystack


def usable_location_countries(analysis: dict) -> list[str]:
    countries = []
    for item in analysis.get("locations") or []:
        value = normalize_country(item.get("country") if isinstance(item, dict) else None)
        if value and value not in NON_COUNTRY_LOCATION_LABELS:
            countries.append(value)
    return countries


def article_matches(article: dict, analysis: dict, disease_names: list[str], country: str | None) -> bool:
    selected_terms = expand_disease_terms(disease_names)
    found_terms = expand_disease_terms(disease_labels(analysis))
    matched_disease = any(
        selected in found or found in selected
        for selected in selected_terms for found in found_terms
    )
    full_text = f"{article.get('title', '')} {article.get('content', '')[:3000]}".casefold()
    if not matched_disease and selected_terms:
        matched_disease = any(_term_in_text(term, full_text) for term in selected_terms)

    if not matched_disease:
        return False

    if country:
        expected_country = normalize_country(country)
        loc_countries = usable_location_countries(analysis)
        if loc_countries:
            return expected_country in loc_countries or any(expected_country in lc for lc in loc_countries)
        source_countries = [
            normalize_country(article.get("source_country")),
            normalize_country(analysis.get("source_country")),
        ]
        if any(value and (expected_country in value or value in expected_country) for value in source_countries if value):
            return True
        return expected_country in full_text
    return True


def selected_concept(labels: list[str], concepts: list[dict]) -> tuple[str, dict | None]:
    for label in labels:
        label_terms = expand_disease_terms([label]) or [label.casefold()]
        for concept in concepts:
            concept_terms = expand_disease_terms([concept["canonical_name"]]) or [
                str(concept["canonical_name"]).casefold()
            ]
            if any(
                label_term == concept_term or label_term in concept_term or concept_term in label_term
                for label_term in label_terms
                for concept_term in concept_terms
            ):
                return label, concept
    return (labels[0] if labels else ""), None


def article_identity_hash(article: dict) -> str:
    """Use collector fingerprints, with a stable fallback for historical RAW."""
    for field in ("content_hash", "url_hash"):
        value = str(article.get(field) or "").strip()
        if value:
            return value
    source = " ".join(str(article.get("content") or "").split())
    if not source:
        source = str(article.get("canonical_url") or article.get("normalized_url") or article.get("url") or "").strip()
    return hashlib.sha256(source.encode("utf-8")).hexdigest() if source else ""


def load_cached_analysis(conn, identity_hash: str):
    if not identity_hash:
        return None
    return conn.execute(
        """SELECT raw_report_id, result
           FROM crawler_nlp_cache
           WHERE identity_hash=%s AND pipeline=%s""",
        (identity_hash, SURVEILLANCE_PIPELINE),
    ).fetchone()


def ensure_raw_report(conn, article: dict):
    """Reuse a global RAW identity or create one source-of-truth record."""
    explicit_id = article.get("raw_report_id")
    if explicit_id:
        row = conn.execute(
            "SELECT id FROM raw_reports WHERE id=%s AND processing_status IS DISTINCT FROM 'DUPLICATE'",
            (explicit_id,),
        ).fetchone()
        if row:
            if article.get("source_country"):
                conn.execute(
                    "UPDATE raw_reports SET source_country=COALESCE(NULLIF(BTRIM(source_country), ''), %s) WHERE id=%s",
                    (article.get("source_country"), row["id"]),
                )
            return row["id"]

    identity_clause, identity_params = identity_where_clause(article)
    row = conn.execute(
        f"""SELECT rr.id FROM raw_reports rr
            WHERE processing_status IS DISTINCT FROM 'DUPLICATE'
              AND ({identity_clause})
            ORDER BY CASE UPPER(COALESCE(processing_status, ''))
                       WHEN 'PROCESSED' THEN 0
                       WHEN 'NON_HEALTH' THEN 1
                       WHEN 'PROCESSING' THEN 2
                       WHEN 'NEW' THEN 3
                       WHEN 'FAILED' THEN 4
                       ELSE 5
                     END, created_at ASC, id ASC
            LIMIT 1 FOR UPDATE""",
        identity_params,
    ).fetchone()
    if row:
        if article.get("source_country"):
            conn.execute(
                "UPDATE raw_reports SET source_country=COALESCE(NULLIF(BTRIM(source_country), ''), %s) WHERE id=%s",
                (article.get("source_country"), row["id"]),
            )
        return row["id"]

    published = safe_date(article.get("published_at"))
    row = conn.execute(
        """INSERT INTO raw_reports(
               source_type, source_name, published_at, original_text, url, processing_status,
               normalized_url, canonical_url, url_hash, content_hash, final_url, author, object_path,
               source_country)
           VALUES ('news',%s,%s,%s,%s,'NEW',%s,%s,%s,%s,%s,%s,%s,%s)
           ON CONFLICT DO NOTHING
           RETURNING id""",
        (
            article.get("source_name"), published, article.get("content", ""), article.get("url"),
            article.get("normalized_url"), article.get("canonical_url"), article.get("url_hash"),
            article.get("content_hash"), article.get("final_url"), article.get("author"),
            article.get("object_path"), article.get("source_country"),
        ),
    ).fetchone()
    if not row:
        identity_clause, identity_params = identity_where_clause(article)
        row = conn.execute(
            f"""SELECT rr.id FROM raw_reports rr
                WHERE processing_status IS DISTINCT FROM 'DUPLICATE'
                  AND ({identity_clause})
                ORDER BY created_at ASC, id ASC
                LIMIT 1 FOR UPDATE""",
            identity_params,
        ).fetchone()
    if not row:
        raise RuntimeError("RAW identity conflict did not resolve to a database row")
    logger.info("RAW reused or created for manual crawl: raw_id=%s url=%s", row["id"], article.get("url"))
    return row["id"]


def store_cached_analysis(conn, identity_hash: str, raw_report_id, analysis: dict) -> None:
    if not identity_hash:
        return
    conn.execute(
        """INSERT INTO crawler_nlp_cache(identity_hash,pipeline,raw_report_id,result)
           VALUES (%s,%s,%s,%s)
           ON CONFLICT (identity_hash,pipeline) DO UPDATE SET
             raw_report_id=EXCLUDED.raw_report_id,
             result=EXCLUDED.result,
             updated_at=NOW()""",
        (identity_hash, SURVEILLANCE_PIPELINE, raw_report_id, Jsonb(analysis)),
    )
    conn.execute(
        "UPDATE raw_reports SET processing_status='PROCESSED' WHERE id=%s",
        (raw_report_id,),
    )


def matching_concepts(conn, ids: list[str]) -> list[dict]:
    rows = conn.execute(
        """SELECT id, disease_id, canonical_name, source
           FROM disease_concepts
           WHERE is_active=TRUE AND id = ANY(%s::uuid[])
           ORDER BY canonical_name""",
        (ids,),
    ).fetchall()
    if len(rows) != len(set(ids)):
        raise ValueError("One or more selected diseases are missing or inactive in the local disease master")
    return [dict(row) for row in rows]


def country_coordinates(conn, country: str, areas: list[str] | None = None):
    """Resolve the first cited city/province, then fall back to country center."""
    for area in areas or []:
        area_name = str(area or "").strip()
        if not area_name:
            continue
        row = conn.execute(
            """SELECT latitude, longitude FROM locations
               WHERE is_active=TRUE AND LOWER(name)=LOWER(%s)
                 AND LOWER(COALESCE(country, ''))=LOWER(%s)
               LIMIT 1""",
            (area_name, country),
        ).fetchone()
        if row:
            lat, lon = row["latitude"], row["longitude"]
            if coords_in_country_bbox(lat, lon, country):
                return lat, lon
            return None, None
    row = conn.execute(
        """SELECT latitude, longitude FROM locations
           WHERE is_active=TRUE AND (LOWER(name)=LOWER(%s) OR LOWER(country)=LOWER(%s))
           ORDER BY CASE WHEN LOWER(name)=LOWER(%s) THEN 0 ELSE 1 END, name
           LIMIT 1""",
        (country, country, country),
    ).fetchone()
    if not row:
        centroid = country_centroid(country)
        return (centroid[0], centroid[1]) if centroid else (None, None)
    lat, lon = row["latitude"], row["longitude"]
    if not coords_in_country_bbox(lat, lon, country):
        centroid = country_centroid(country)
        return (centroid[0], centroid[1]) if centroid else (None, None)
    return lat, lon


def persist_dashboard_event_from_analysis(conn, raw_id, article: dict, analysis: dict) -> bool:
    """Copy a manual-crawl analysis into disease_events using real NLP coords only.

    Country centroids used by crawl-matrix map rows are not copied here. Missing
    geo is stored as NULL + needs_review so Mapped Locations cannot grow from
    invented pins. KPI snapshots are marked stale after insert.
    """
    if not raw_id or not analysis:
        return False
    if analysis.get("is_health_related") is False:
        return False
    existing = conn.execute(
        "SELECT 1 FROM disease_events WHERE raw_report_id=%s LIMIT 1",
        (raw_id,),
    ).fetchone()
    if existing:
        return False
    lat = analysis.get("latitude")
    lon = analysis.get("longitude")
    if lat is None or lon is None:
        lat, lon = None, None
    title = str(article.get("title") or "").strip()
    content = str(article.get("content") or analysis.get("content") or "")
    original = f"{title}.\n{content}" if title else content
    conn.execute(
        """INSERT INTO disease_events
           (raw_report_id, source_type, source_name, source_country, surveillance_scope, published_at, original_text,
            language, location_name, province, city, geom, symptoms, disease_extracted,
            disease_mentions, disease_classification, case_count, death_count,
            confidence, outbreak_alert, sentiment, event_type, relevance_score,
           source_credibility, source_credibility_label, is_health_related, needs_review)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                   CASE WHEN %s::float8 IS NULL OR %s::float8 IS NULL THEN NULL
                        ELSE ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                   END,
                   %s::jsonb, %s::jsonb, %s::jsonb, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE, %s)""",
        (
            raw_id,
            article.get("source_type") or "news",
            article.get("source_name") or "Manual Crawler",
            analysis.get("source_country") or article.get("source_country"),
            analysis.get("surveillance_scope") or surveillance_scope_for_country(analysis.get("country")),
            analysis.get("published_at") or article.get("published_at"),
            original,
            analysis.get("language") or "unknown",
            analysis.get("location_name"),
            analysis.get("province"),
            analysis.get("city"),
            *st_makepoint_args(lat, lon),
            Jsonb(analysis.get("symptoms") or []),
            Jsonb(analysis.get("disease_extracted") or []),
            Jsonb(analysis.get("disease_mentions") or []),
            analysis.get("disease_classification"),
            analysis.get("case_count"),
            analysis.get("death_count") or 0,
            analysis.get("confidence") or 0.0,
            analysis.get("outbreak_alert") or False,
            analysis.get("sentiment"),
            analysis.get("event_type"),
            analysis.get("relevance_score"),
            analysis.get("source_credibility") or 0.50,
            analysis.get("source_credibility_label") or "",
            nlp_needs_review(analysis) or lat is None or lon is None,
        ),
    )
    mark_kpi_snapshots_stale(conn)
    return True


def persist_article(conn, job_id: str, raw_id, article: dict, analysis: dict, concepts: list[dict], request: dict) -> int:
    published = safe_date(article.get("published_at") or analysis.get("published_date"))
    disease, concept = selected_concept(disease_labels(analysis), concepts)
    rows = 0
    for item in analysis.get("locations") or []:
        item_disease = str(item.get("disease") or disease or "").strip()
        item_concept_name, item_concept = selected_concept([item_disease], concepts)
        item_disease = item_concept_name or item_disease or disease
        item_concept = item_concept or concept
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
        provinces = clean_province_names(item.get("provinces") or [])
        if request.get("province_city") and not any(
            request["province_city"].casefold() in str(province).casefold()
            for province in provinces
        ):
            continue
        areas = item.get("areas") or []
        if areas:
            # The surveillance API keeps a country aggregate for backwards
            # compatibility, while ``areas`` contains the precise city/
            # province metrics. Persist each area as its own map row so its
            # coordinate and count cannot be collapsed into one country point.
            for area in areas:
                area_item = dict(item)
                area_item["areas"] = []
                area_item["provinces"] = [area.get("name")]
                area_item["reported_cases"] = area.get("reported_cases") or 0
                area_item["deaths"] = area.get("deaths")
                area_item["time_frame"] = area.get("time_frame") or item.get("time_frame") or ""
                scoped_analysis = dict(analysis)
                scoped_analysis["locations"] = [area_item]
                rows += persist_article(conn, job_id, raw_id, article, scoped_analysis, concepts, request)
            continue
        evidence = str(item.get("evidence") or "").strip()[:1000]
        if not evidence:
            evidence = next(
                (
                    sentence.strip()[:1000]
                    for sentence in re.split(r"(?<=[.!?])\s+|\n+", article.get("content", ""))
                    if country.casefold() in sentence.casefold() and re.search(r"\d", sentence)
                ),
                "",
            )
        latitude, longitude = country_coordinates(conn, country, provinces)
        province, city = split_province_city(provinces)
        province_city_case = ", ".join(provinces) or None
        date_case = item.get("time_frame") or ""
        if _matrix_row_exists(
            conn, job_id, raw_id, disease, country, province_city_case, published, date_case
        ):
            rows += 1
            continue
        conn.execute(
            """INSERT INTO crawl_matrix_rows
               (crawl_job_id, raw_report_id, disease_concept_id, disease_name, icd11_code,
                crawling_date, region, country, province_city_case, province, city, article_date, date_case,
               number_of_cases, number_of_deaths, latitude, longitude, source_type, source_name, source_country,
               source_url, article_title, evidence, confidence, processing_status)
               VALUES (%s,%s,%s,%s,%s,CURRENT_DATE,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (
                job_id, raw_id, item_concept["id"] if item_concept else None, item_disease,
                None,
                "ASEAN" if country in ASEAN_COUNTRIES else (request.get("region") or "Global"),
                country, province_city_case, province, city, published, date_case,
                0 if analysis.get("case_count_unknown") else int(item.get("reported_cases") or 0),
                int(item.get("deaths") or 0),
                latitude, longitude, "news", article.get("source_name"),
                analysis.get("source_country") or article.get("source_country"), article.get("url"),
                article.get("title"), evidence, float(analysis.get("source_reliability_score") or 0.0),
                "needs_review" if (not evidence or analysis.get("case_count_unknown") or analysis.get("needs_review") or item.get("needs_review")) else "processed",
            ),
        )
        rows += 1

    if rows == 0 and disease:
        # Graceful fallback: article is relevant but lacks fine-grained metric pairs
        text_content = article.get("content", "") + " " + article.get("title", "")
        detected_country = request.get("country")
        if not detected_country:
            for c_name in ASEAN_COUNTRIES:
                if re.search(r"\b" + re.escape(c_name) + r"\b", text_content, re.I):
                    detected_country = c_name
                    break
        if not detected_country and request.get("region", "").casefold() == "asean":
            detected_country = None

        if detected_country:
            latitude, longitude = country_coordinates(conn, detected_country)
            evidence = next(
                (
                    sentence.strip()[:1000]
                    for sentence in re.split(r"(?<=[.!?])\s+|\n+", article.get("content", ""))
                    if disease.casefold() in sentence.casefold()
                ),
                article.get("title", "")[:500],
            )
            cases = 0 if analysis.get("case_count_unknown") else int(analysis.get("case_count") or analysis.get("confirmed_cases") or 0)
            deaths = int(analysis.get("death_count") or 0)
            province_city_case = analysis.get("province")
            date_case = analysis.get("time_frame") or analysis.get("event_date") or ""
            if _matrix_row_exists(
                conn, job_id, raw_id, disease, detected_country,
                province_city_case, published, date_case,
            ):
                rows += 1
                return rows
            conn.execute(
                """INSERT INTO crawl_matrix_rows
                   (crawl_job_id, raw_report_id, disease_concept_id, disease_name, icd11_code,
                    crawling_date, region, country, province_city_case, province, city, article_date, date_case,
                   number_of_cases, number_of_deaths, latitude, longitude, source_type, source_name, source_country,
                   source_url, article_title, evidence, confidence, processing_status)
                   VALUES (%s,%s,%s,%s,%s,CURRENT_DATE,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (
                    job_id, raw_id, concept["id"] if concept else None, disease,
                    None,
                    "ASEAN" if detected_country in ASEAN_COUNTRIES else (request.get("region") or "Global"),
                    detected_country,
                    province_city_case, analysis.get("city"), published, date_case,
                    cases, deaths,
                    latitude, longitude, "news", article.get("source_name"),
                    analysis.get("source_country") or article.get("source_country"), article.get("url"),
                    article.get("title"), evidence, float(analysis.get("source_reliability_score") or 0.65),
                    "needs_review" if (not evidence or analysis.get("case_count_unknown") or analysis.get("needs_review")) else "processed",
                ),
            )
            rows += 1

    return rows


def extract_article(item: dict) -> dict:
    url = item.get("url", "")
    if "news.google.com" in url.lower():
        try:
            from googlenewsdecoder import gnewsdecoder
            decoded = gnewsdecoder(url, interval=0.1)
            if decoded.get("status") and decoded.get("decoded_url"):
                url = decoded["decoded_url"]
                item["url"] = url
                item["source_name"] = source_name(url)
        except Exception as exc:
            logger.warning("Could not decode Google News URL %s: %s", url, exc)

    response = requests.post(
        COLLECTOR_URL + "/extract-url",
        json={"url": item["url"], "fetch_mode": "http", "timeout_ms": 30000, "max_retries": 1},
        timeout=(5, 45),
    )
    if response.status_code in {408, 502, 503, 504}:
        retry = requests.post(
            COLLECTOR_URL + "/extract-url",
            json={"url": item["url"], "fetch_mode": "http", "timeout_ms": 40000, "max_retries": 1},
            timeout=(5, 50),
        )
        if retry.status_code == 200:
            response = retry
    response.raise_for_status()
    extracted = response.json().get("data") or {}

    # Sparse SPA shells get one more HTTP pass, never stealth/browser. Stealth
    # ignores cooperative cancellation and is what produced 504s on URL jobs.
    if len(str(extracted.get("content") or "").strip()) < 150:
        try:
            retry_resp = requests.post(
                COLLECTOR_URL + "/extract-url",
                json={"url": item["url"], "fetch_mode": "http", "timeout_ms": 35000, "max_retries": 1},
                timeout=(5, 45),
            )
            if retry_resp.status_code == 200:
                retry_extracted = retry_resp.json().get("data") or {}
                if len(str(retry_extracted.get("content") or "").strip()) > len(str(extracted.get("content") or "").strip()):
                    extracted = retry_extracted
        except Exception as retry_exc:
            logger.debug("HTTP fetch fallback failed for %s: %s", item["url"], retry_exc)

    source_country = extracted.get("source_country") or item.get("source_country") or ""
    return {
        **item,
        **extracted,
        "url": item["url"],
        "source_name": item.get("source_name") or extracted.get("source_name"),
        "source_country": source_country,
        "title": extracted.get("title") or item.get("title") or "",
    }


def prepare_text_for_nlp(article: dict, max_chars: int = 35000) -> str:
    title = str(article.get("title") or "").strip()
    content = str(article.get("content") or "").strip()
    combined = f"{title}\n\n{content}".strip() if title else content
    return combined[:max_chars]


def analyze_article(article: dict) -> dict:
    """Run the same NLP contract as bulk ingest (`/nlp/analyze/raw`)."""
    response = requests.post(
        NLP_SERVICE_URL + "/nlp/analyze/raw",
        json={
            "text": prepare_text_for_nlp(article),
            "source_type": article.get("source_type") or "news",
            "source_name": article.get("source_name"),
            "source_country": article.get("source_country") or "",
            "published_at": article.get("published_at"),
            "source_url": article.get("url"),
        },
        timeout=(5, NLP_REQUEST_TIMEOUT_SECONDS),
    )
    response.raise_for_status()
    payload = response.json()
    return pipeline_analysis_to_matrix(payload.get("data") or payload)


def pipeline_analysis_to_matrix(analysis: dict) -> dict:
    """Adapt ingest NLP output into the crawl-matrix persist shape."""
    out = dict(analysis or {})
    locations = []
    seen: set[tuple] = set()

    primary_disease = out.get("disease_display") or out.get("disease_classification")
    if isinstance(primary_disease, (list, tuple)):
        primary_disease = primary_disease[0] if primary_disease else ""

    def add(
        country,
        provinces,
        cases,
        deaths,
        time_frame="",
        cities=None,
        disease=None,
        evidence="",
        confidence=None,
        needs_review=False,
    ):
        name = str(country or "").strip()
        if not name:
            return
        disease_name = str(disease or primary_disease or "").strip()
        subplaces = [
            str(item).strip()
            for item in [*(provinces or []), *(cities or [])]
            if str(item).strip() and str(item).strip().casefold() != name.casefold()
        ]
        key = (
            disease_name.casefold(),
            name.casefold(),
            tuple(dict.fromkeys(item.casefold() for item in subplaces)),
            int(cases or 0),
            int(deaths or 0),
            time_frame or out.get("event_date") or "",
        )
        if key in seen:
            return
        seen.add(key)
        item = {
            "country": name,
            "provinces": list(dict.fromkeys(subplaces)),
            "reported_cases": int(cases or 0),
            "deaths": int(deaths or 0),
            "time_frame": time_frame or out.get("event_date") or "",
        }
        if disease_name:
            item["disease"] = disease_name
        if evidence:
            item["evidence"] = str(evidence).strip()[:1000]
        if confidence is not None:
            item["confidence"] = float(confidence or 0.0)
        if needs_review:
            item["needs_review"] = True
        locations.append(item)

    sub_events = [event for event in (out.get("sub_events") or []) if isinstance(event, dict)]
    if not sub_events:
        primary_country = out.get("country")
        if primary_country and str(primary_country).casefold() == "outside asean":
            primary_country = None
        primary_place = out.get("location_name") or out.get("province")
        add(
            primary_country,
            [primary_place] if primary_place and str(primary_place).casefold() != str(primary_country or "").casefold() else [],
            0 if out.get("case_count_unknown") else out.get("case_count"),
            out.get("death_count"),
            disease=primary_disease,
            confidence=out.get("confidence"),
        )
    for event in sub_events:
        add(
            event.get("country"),
            [event.get("location_name")],
            event.get("case_count"),
            event.get("death_count"),
            event.get("time_frame")
            or event.get("event_date_start")
            or event.get("event_date_end")
            or "",
            disease=event.get("disease"),
            evidence=event.get("evidence") or event.get("source_evidence"),
            confidence=event.get("confidence"),
            needs_review=event.get("needs_review", False),
        )
    # A structured sub-event already carries the disease-location-metric
    # relation. Do not add the collapsed location projection again, or the
    # matrix would count the same article twice with different totals.
    for item in ([] if sub_events else out.get("locations") or []):
        if not isinstance(item, dict):
            continue
        add(
            item.get("country"),
            [item.get("name")],
            item.get("reported_cases"),
            item.get("deaths"),
            item.get("time_frame") or "",
            item.get("cities") or [],
            disease=item.get("disease") or primary_disease,
            evidence=item.get("evidence"),
            confidence=item.get("confidence"),
        )
    out["locations"] = locations
    out["source_country"] = out.get("source_country") or ""
    out["surveillance_scope"] = out.get("surveillance_scope") or (
        "ASEAN" if any(item.get("country") in ASEAN_COUNTRIES for item in locations)
        else "Outside ASEAN" if locations else None
    )
    if "source_reliability_score" not in out:
        out["source_reliability_score"] = out.get("source_credibility") or 0.65
    return out


class LeaseLost(RuntimeError):
    """The database lease was replaced by another matrix worker."""


def _renew_job_lease(conn, job_id: str, lease_token: str | None) -> None:
    if not lease_token:
        return
    row = conn.execute(
        """UPDATE crawl_matrix_jobs
           SET lease_expires_at=NOW() + (%s * INTERVAL '1 minute'), updated_at=NOW()
           WHERE id=%s::uuid AND lease_owner=%s AND lease_token=%s::uuid
             AND status='processing' AND lease_expires_at > NOW()
           RETURNING id""",
        (STALE_MINUTES, job_id, MATRIX_WORKER_ID, lease_token),
    ).fetchone()
    if not row:
        raise LeaseLost(f"Matrix job lease lost: {job_id}")


def _matrix_row_exists(
    conn,
    job_id: str,
    raw_id,
    disease_name: str,
    country: str,
    province_city_case: str | None,
    article_date,
    date_case: str | None,
) -> bool:
    """Serialize and deduplicate matrix rows across redelivery and stale workers."""
    identity = json.dumps(
        [job_id, raw_id, disease_name, country, province_city_case, article_date, date_case],
        ensure_ascii=False,
        separators=(",", ":"),
        default=str,
    )
    conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (f"matrix-row:{identity}",))
    return bool(
        conn.execute(
            """SELECT 1 FROM crawl_matrix_rows
               WHERE crawl_job_id=%s AND raw_report_id IS NOT DISTINCT FROM %s
                 AND disease_name=%s AND country=%s
                 AND province_city_case IS NOT DISTINCT FROM %s
                 AND article_date IS NOT DISTINCT FROM %s
                 AND date_case IS NOT DISTINCT FROM %s
               LIMIT 1""",
            (job_id, raw_id, disease_name, country, province_city_case, article_date, date_case),
        ).fetchone()
    )


def _fenced_job_update(conn, statement: str, values: tuple, job_id: str, lease_token: str | None) -> None:
    if lease_token:
        row = conn.execute(
            statement + " AND lease_owner=%s AND lease_token=%s::uuid AND lease_expires_at > NOW()",
            (*values, MATRIX_WORKER_ID, lease_token),
        )
        if row.rowcount != 1:
            raise LeaseLost(f"Matrix job lease lost: {job_id}")
        return
    conn.execute(statement, values)


def claim_job() -> tuple[str, dict, str] | None:
    with connect() as conn:
        row = conn.execute(
            """SELECT id, query
               FROM crawl_matrix_jobs
               WHERE status='queued'
               OR (status='processing' AND (
                        lease_expires_at IS NULL OR lease_expires_at <= NOW()
                     ))
               ORDER BY CASE WHEN status='queued' THEN 0 ELSE 1 END, created_at
               LIMIT 1 FOR UPDATE SKIP LOCKED""",
        ).fetchone()
        if not row:
            return None
        claimed = conn.execute(
            """UPDATE crawl_matrix_jobs
               SET status='processing', error=NULL, updated_at=NOW(),
                   lease_owner=%s, lease_token=gen_random_uuid(),
                   lease_expires_at=NOW() + (%s * INTERVAL '1 minute')
               WHERE id=%s
               RETURNING id, query, lease_token""",
            (MATRIX_WORKER_ID, STALE_MINUTES, row["id"]),
        ).fetchone()
        if not claimed:
            conn.rollback()
            return None
        conn.commit()
        return str(claimed["id"]), dict(claimed["query"] or {}), str(claimed["lease_token"])


def claim_job_by_id(job_id: str) -> tuple[str, dict, str] | None:
    with connect() as conn:
        row = conn.execute(
            """UPDATE crawl_matrix_jobs
               SET status='processing', error=NULL, updated_at=NOW(),
                   lease_owner=%s, lease_token=gen_random_uuid(),
                   lease_expires_at=NOW() + (%s * INTERVAL '1 minute')
               WHERE id=%s::uuid AND (
                    status='queued'
                    OR (status='processing' AND (
                        lease_expires_at IS NULL OR lease_expires_at <= NOW()
                    ))
               )
               RETURNING id, query, lease_token""",
            (MATRIX_WORKER_ID, STALE_MINUTES, job_id),
        ).fetchone()
        conn.commit()
        if not row:
            return None
        return str(row["id"]), dict(row["query"] or {}), str(row["lease_token"])


def _prepare_matrix_article(
    item: dict,
    reprocess: bool = False,
    job_id: str | None = None,
    lease_token: str | None = None,
):
    """Fetch or reuse one article and run NLP. Persistence stays serial."""
    try:
        article = item if reprocess else extract_article(item)
        if not (article.get("content") or "").strip():
            raise ValueError("Article has no extractable content")
        identity_hash = article_identity_hash(article)
        identity_lock = connect()
        identity_lock.autocommit = True
        lock_keys = identity_lock_keys(article)
        for lock_key in lock_keys:
            identity_lock.execute(
                "SELECT pg_advisory_lock(hashtext(%s))",
                (lock_key,),
            )
        try:
            cached = None if reprocess else load_cached_analysis(identity_lock, identity_hash)
            if cached:
                analysis = dict(cached["result"] or {})
                raw_id = cached.get("raw_report_id")
                logger.info("NLP cache hit: pipeline=%s identity=%s", SURVEILLANCE_PIPELINE, identity_hash)
            else:
                with connect() as conn:
                    _renew_job_lease(conn, job_id, lease_token)
                    raw_id = ensure_raw_report(conn, article)
                    _renew_job_lease(conn, job_id, lease_token)
                    conn.commit()
                logger.info("NLP started: pipeline=%s url=%s", SURVEILLANCE_PIPELINE, article.get("url"))
                analysis = analyze_article(article)
                with connect() as conn:
                    _renew_job_lease(conn, job_id, lease_token)
                    store_cached_analysis(conn, identity_hash, raw_id, analysis)
                    _renew_job_lease(conn, job_id, lease_token)
                    conn.commit()
                logger.info("NLP success: pipeline=%s url=%s", SURVEILLANCE_PIPELINE, article.get("url"))
            if not raw_id:
                with connect() as conn:
                    _renew_job_lease(conn, job_id, lease_token)
                    raw_id = ensure_raw_report(conn, article)
                    _renew_job_lease(conn, job_id, lease_token)
                    conn.commit()
        finally:
            for lock_key in reversed(lock_keys):
                identity_lock.execute(
                    "SELECT pg_advisory_unlock(hashtext(%s))",
                    (lock_key,),
                )
            identity_lock.close()
        return item, article, analysis, raw_id, None
    except LeaseLost:
        raise
    except Exception as exc:
        logger.warning("Matrix article prepare failed: %s", exc)
        return item, None, {}, None, f"{item.get('url', 'article')}: {str(exc)[:180]}"


def run_job(job_id: str, payload: dict, reprocess: bool = False, lease_token: str | None = None) -> None:
    warnings: list[str] = []
    direct_url_mode = bool(str(payload.get("url") or "").strip())
    try:
        with connect() as conn:
            _renew_job_lease(conn, job_id, lease_token)
            concepts = matching_concepts(conn, payload.get("disease_concept_ids") or [])
            disease_names = [str(row["canonical_name"]) for row in concepts]

        if reprocess:
            with connect() as conn:
                articles = conn.execute(
                    """SELECT r.id AS raw_report_id, r.original_text AS content, r.url, r.source_name,
                              r.published_at::text AS published_at, '' AS title,
                              r.normalized_url, r.canonical_url, r.url_hash, r.content_hash,
                              r.final_url, r.author, r.object_path
                       FROM raw_reports r JOIN crawl_matrix_rows m ON m.raw_report_id=r.id
                       WHERE m.crawl_job_id=%s GROUP BY r.id""",
                    (job_id,),
                ).fetchall()
                _renew_job_lease(conn, job_id, lease_token)
                conn.execute("DELETE FROM crawl_matrix_rows WHERE crawl_job_id=%s", (job_id,))
                _renew_job_lease(conn, job_id, lease_token)
                conn.commit()
            discovered = [dict(row) for row in articles]
            if not discovered:
                direct_url = str(payload.get("url") or "").strip()
                if direct_url:
                    discovered = [{"url": direct_url, "title": "", "published_at": None, "source_name": source_name(direct_url)}]
                else:
                    discovered, discovery_warnings = discover_urls(
                        disease_names, payload.get("country"), payload.get("region"),
                        payload.get("max_articles", 20), payload.get("date_from"), payload.get("date_to"),
                    )
                    warnings.extend(discovery_warnings)
        elif str(payload.get("url") or "").strip():
            direct_url = str(payload["url"]).strip()
            discovered = [{"url": direct_url, "title": "", "published_at": None, "source_name": source_name(direct_url)}]
        else:
            discovered, discovery_warnings = discover_urls(
                disease_names, payload.get("country"), payload.get("region"),
                payload.get("max_articles", 20), payload.get("date_from"), payload.get("date_to"),
            )
            warnings.extend(discovery_warnings)

        with connect() as conn:
            _fenced_job_update(
                conn,
                "UPDATE crawl_matrix_jobs SET discovered_count=%s, updated_at=NOW() WHERE id=%s",
                (len(discovered), job_id), job_id, lease_token,
            )
            conn.commit()

        processed = 0
        row_count = 0
        from concurrent.futures import ThreadPoolExecutor, as_completed

        def prepare(item):
            return _prepare_matrix_article(
                item, reprocess=reprocess, job_id=job_id, lease_token=lease_token,
            )

        workers = 1 if reprocess else ARTICLE_WORKERS
        prepared = []
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = [pool.submit(prepare, item) for item in discovered]
            for future in as_completed(futures):
                prepared.append(future.result())

        for item, article, analysis, raw_id, item_warning in prepared:
            if item_warning and article is None:
                warnings.append(item_warning)
                continue
            try:
                if article is not None:
                    with connect() as conn:
                        _renew_job_lease(conn, job_id, lease_token)
                        conn.commit()
                if not article_matches(article, analysis, disease_names, payload.get("country")):
                    if direct_url_mode:
                        warnings.append(
                            f"{item.get('url', 'article')}: direct URL was fetched, but it did not contain "
                            "the selected disease and country. Use a specific news article URL, not a homepage."
                        )
                    else:
                        warnings.append(f"{item.get('url', 'article')}: disease or location did not match the filter")
                else:
                    with connect() as conn:
                        _renew_job_lease(conn, job_id, lease_token)
                        inserted = persist_article(conn, job_id, raw_id, article, analysis, concepts, payload)
                        persist_dashboard_event_from_analysis(conn, raw_id, article, analysis)
                        row_count += inserted
                        _renew_job_lease(conn, job_id, lease_token)
                        conn.commit()
                    if inserted:
                        processed += 1
                    else:
                        warnings.append(f"{item.get('url', 'article')}: no validated country/province relation and case metric")
            except LeaseLost:
                raise
            except Exception as exc:
                warnings.append(f"{item.get('url', 'article')}: {str(exc)[:180]}")
                logger.warning("Matrix article failed: %s", exc)
            with connect() as conn:
                _fenced_job_update(
                    conn,
                    """UPDATE crawl_matrix_jobs
                       SET processed_count=%s, row_count=%s, warnings=%s, updated_at=NOW()
                       WHERE id=%s""",
                    (processed, row_count, Jsonb(warnings), job_id), job_id, lease_token,
                )
                conn.commit()

        final_status = "partial" if warnings and row_count else ("failed" if warnings and not row_count else "completed")
        with connect() as conn:
            _fenced_job_update(
                conn,
                """UPDATE crawl_matrix_jobs
                   SET status=%s, processed_count=%s, row_count=%s, warnings=%s,
                       updated_at=NOW(), completed_at=NOW()
                   WHERE id=%s""",
                (final_status, processed, row_count, Jsonb(warnings), job_id), job_id, lease_token,
            )
            conn.commit()
    except LeaseLost:
        logger.warning("Matrix job %s lease was replaced; stopping without further writes", job_id)
    except Exception as exc:
        logger.exception("Matrix job %s failed", job_id)
        with connect() as conn:
            _fenced_job_update(
                conn,
                """UPDATE crawl_matrix_jobs
                   SET status='failed', error=%s, warnings=%s, updated_at=NOW(), completed_at=NOW()
                   WHERE id=%s""",
                (str(exc)[:500], Jsonb(warnings), job_id), job_id, lease_token,
            )
            conn.commit()


def _execute_claimed(claimed: tuple[str, dict, str] | None) -> bool:
    if not claimed:
        return False
    job_id, payload, lease_token = claimed
    reprocess = bool(payload.pop("_reprocess", False))
    logger.info("Processing matrix job %s (reprocess=%s)", job_id, reprocess)
    run_job(job_id, payload, reprocess=reprocess, lease_token=lease_token)
    return True


def _run_claimed_exclusive(claimed: tuple[str, dict, str] | None) -> bool:
    """Only one matrix job runs in this process at a time."""
    if not claimed:
        return False
    with _job_lock:
        return _execute_claimed(claimed)


def _next_claimed_job() -> tuple[str, dict, str] | None:
    try:
        return _pending_jobs.get_nowait()
    except queue.Empty:
        pass
    return claim_job()


def _consume_crawl_queue() -> None:
    import pika
    rabbit_url = os.getenv("RABBITMQ_URL")
    if not rabbit_url:
        logger.info("RABBITMQ_URL unset; crawl matrix uses database outbox only")
        return
    while True:
        try:
            params = pika.URLParameters(rabbit_url)
            params.heartbeat = 300
            params.blocked_connection_timeout = 5
            with pika.BlockingConnection(params) as broker:
                channel = broker.channel()
                channel.confirm_delivery()
                declare_queue_topology(channel, (CRAWL_QUEUE,))
                channel.basic_qos(prefetch_count=1)

                def on_message(_ch, method, _properties, body):
                    try:
                        payload = json.loads(body)
                        if not isinstance(payload, dict):
                            raise ValueError("Crawl matrix message payload must be an object")
                        job_id = str(uuid.UUID(str(payload.get("job_id") or "")))
                    except (ValueError, TypeError, KeyError, json.JSONDecodeError):
                        logger.warning("Rejecting malformed crawl matrix message")
                        settle_malformed_delivery(channel, method, _properties, body, CRAWL_QUEUE)
                        return

                    try:
                        # ACK only after the database has claimed the job. If
                        # the process dies after this point, the processing
                        # lease is recovered by the normal stale-job poller.
                        claimed = claim_job_by_id(job_id)
                        if claimed:
                            _pending_jobs.put(claimed)
                            _wake.set()
                        else:
                            with connect() as conn:
                                state = conn.execute(
                                    "SELECT status FROM crawl_matrix_jobs WHERE id=%s",
                                    (job_id,),
                                ).fetchone()
                            if not state:
                                raise ValueError(f"Unknown crawl matrix job: {job_id}")
                            if state["status"] not in {"processing", "completed", "partial", "failed"}:
                                raise RuntimeError(f"Crawl matrix job was not claimable: {job_id}")
                        channel.basic_ack(delivery_tag=method.delivery_tag)
                    except ValueError as exc:
                        logger.warning("Rejecting crawl matrix message: %s", exc)
                        settle_malformed_delivery(channel, method, _properties, body, CRAWL_QUEUE)
                    except Exception:
                        logger.exception("Crawl matrix AMQP handler failed; requeueing")
                        settle_transient_delivery(
                            channel, method, _properties, body, CRAWL_QUEUE,
                            "crawl matrix callback failure",
                        )

                channel.basic_consume(queue=CRAWL_QUEUE, on_message_callback=on_message, auto_ack=False)
                logger.info("Crawl matrix AMQP consumer on %s", CRAWL_QUEUE)
                channel.start_consuming()
        except Exception:
            logger.exception("Crawl matrix AMQP consumer reconnecting")
            time.sleep(5)


def run_forever() -> None:
    logger.info(
        "Crawl matrix worker started; poll=%ss stale=%sm articles=%s queue=%s",
        POLL_SECONDS, STALE_MINUTES, ARTICLE_WORKERS, CRAWL_QUEUE,
    )
    amqp_thread = threading.Thread(target=_consume_crawl_queue, name="crawl-matrix-amqp", daemon=True)
    amqp_thread.start()
    while True:
        try:
            if not _run_claimed_exclusive(_next_claimed_job()):
                _wake.wait(POLL_SECONDS)
                _wake.clear()
        except KeyboardInterrupt:
            raise
        except Exception:
            logger.exception("Matrix worker loop failed; retrying")
            time.sleep(POLL_SECONDS)


def main() -> None:
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    run_forever()


if __name__ == "__main__":
    main()
