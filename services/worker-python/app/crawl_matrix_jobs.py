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
import threading
import time
import xml.etree.ElementTree as ET
from urllib.parse import quote_plus, urlparse

import psycopg
import requests
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from .geo import coords_in_country_bbox, country_centroid, st_makepoint_args
from .kpi import mark_kpi_snapshots_stale, nlp_needs_review

logger = logging.getLogger("crawl-matrix-worker")
DATABASE_URL = os.getenv("DATABASE_URL", "postgres://postgres:root@host.docker.internal:9898/disease_ai")
COLLECTOR_URL = os.getenv("COLLECTOR_URL", "http://disease-collector-python:8002").rstrip("/")
NLP_SERVICE_URL = os.getenv("NLP_SERVICE_URL", "http://disease-nlp-python:8000").rstrip("/")
POLL_SECONDS = max(1.0, float(os.getenv("CRAWL_MATRIX_POLL_SECONDS", "5")))
STALE_MINUTES = max(5, int(os.getenv("CRAWL_MATRIX_STALE_MINUTES", "15")))
CRAWL_QUEUE = os.getenv("CRAWL_MATRIX_QUEUE", "disease.crawl-matrix")
ARTICLE_WORKERS = max(1, min(int(os.getenv("CRAWL_MATRIX_ARTICLE_WORKERS", "3")), 6))
SURVEILLANCE_PIPELINE = "analyze-raw-v1"
_job_lock = threading.Lock()
_pending_job_ids: queue.SimpleQueue[str] = queue.SimpleQueue()
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
        raise ValueError("Select at least one disease from the ICD-11 master")
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
    """Expand ICD-11 names so campak/DBD still match Measles/Dengue filters."""
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
        row = conn.execute("SELECT id FROM raw_reports WHERE id=%s", (explicit_id,)).fetchone()
        if row:
            return row["id"]

    row = conn.execute(
        """SELECT id FROM raw_reports
           WHERE (%s::text IS NOT NULL AND content_hash=%s)
              OR (%s::text IS NOT NULL AND canonical_url=%s)
              OR (%s::text IS NOT NULL AND url_hash=%s)
              OR (%s::text IS NOT NULL AND normalized_url=%s)
              OR (%s::text IS NOT NULL AND url=%s)
           ORDER BY created_at DESC LIMIT 1""",
        (
            article.get("content_hash"), article.get("content_hash"),
            article.get("canonical_url"), article.get("canonical_url"),
            article.get("url_hash"), article.get("url_hash"),
            article.get("normalized_url"), article.get("normalized_url"),
            article.get("url"), article.get("url"),
        ),
    ).fetchone()
    if row:
        return row["id"]

    published = safe_date(article.get("published_at"))
    row = conn.execute(
        """INSERT INTO raw_reports(
               source_type, source_name, published_at, original_text, url, processing_status,
               normalized_url, canonical_url, url_hash, content_hash, final_url, author, object_path)
           VALUES ('news',%s,%s,%s,%s,'NEW',%s,%s,%s,%s,%s,%s,%s)
           RETURNING id""",
        (
            article.get("source_name"), published, article.get("content", ""), article.get("url"),
            article.get("normalized_url"), article.get("canonical_url"), article.get("url_hash"),
            article.get("content_hash"), article.get("final_url"), article.get("author"),
            article.get("object_path"),
        ),
    ).fetchone()
    logger.info("RAW created for manual crawl: raw_id=%s url=%s", row["id"], article.get("url"))
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
        """SELECT id, canonical_name, ontology_code
           FROM disease_concepts
           WHERE is_active=TRUE AND id = ANY(%s::uuid[])
           ORDER BY canonical_name""",
        (ids,),
    ).fetchall()
    if len(rows) != len(set(ids)):
        raise ValueError("One or more selected diseases are missing or inactive in the ICD-11 master")
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
           (raw_report_id, source_type, source_name, published_at, original_text,
            language, location_name, province, city, geom, symptoms, disease_extracted,
            disease_mentions, disease_classification, case_count, death_count,
            confidence, outbreak_alert, sentiment, event_type, relevance_score,
            source_credibility, source_credibility_label, is_health_related, needs_review)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s,
                   CASE WHEN %s::float8 IS NULL OR %s::float8 IS NULL THEN NULL
                        ELSE ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                   END,
                   %s::jsonb, %s::jsonb, %s::jsonb, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE, %s)""",
        (
            raw_id,
            article.get("source_type") or "news",
            article.get("source_name") or "Manual Crawler",
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
        conn.execute(
            """INSERT INTO crawl_matrix_rows
               (crawl_job_id, raw_report_id, disease_concept_id, disease_name, icd11_code,
                crawling_date, region, country, province_city_case, province, city, article_date, date_case,
                number_of_cases, number_of_deaths, latitude, longitude, source_type, source_name,
                source_url, article_title, evidence, confidence, processing_status)
               VALUES (%s,%s,%s,%s,%s,CURRENT_DATE,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (
                job_id, raw_id, concept["id"] if concept else None, disease,
                concept.get("ontology_code") if concept else None,
                "ASEAN" if country in ASEAN_COUNTRIES else (request.get("region") or "Global"),
                country, ", ".join(provinces) or None, province, city, published, item.get("time_frame") or "",
                0 if analysis.get("case_count_unknown") else int(item.get("reported_cases") or 0),
                int(item.get("deaths") or 0),
                latitude, longitude, "news", article.get("source_name"), article.get("url"),
                article.get("title"), evidence, float(analysis.get("source_reliability_score") or 0.0),
                "needs_review" if (not evidence or analysis.get("case_count_unknown") or analysis.get("needs_review")) else "processed",
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
            conn.execute(
                """INSERT INTO crawl_matrix_rows
                   (crawl_job_id, raw_report_id, disease_concept_id, disease_name, icd11_code,
                    crawling_date, region, country, province_city_case, province, city, article_date, date_case,
                    number_of_cases, number_of_deaths, latitude, longitude, source_type, source_name,
                    source_url, article_title, evidence, confidence, processing_status)
                   VALUES (%s,%s,%s,%s,%s,CURRENT_DATE,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (
                    job_id, raw_id, concept["id"] if concept else None, disease,
                    concept.get("ontology_code") if concept else None,
                    "ASEAN" if detected_country in ASEAN_COUNTRIES else (request.get("region") or "Global"),
                    detected_country, analysis.get("province") or analysis.get("city") or detected_country,
                    analysis.get("province"), analysis.get("city"), published,
                    analysis.get("time_frame") or analysis.get("event_date") or "",
                    cases, deaths,
                    latitude, longitude, "news", article.get("source_name"), article.get("url"),
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
        json={"url": item["url"], "fetch_mode": "http", "timeout_ms": 15000, "max_retries": 0},
        timeout=(5, 25),
    )
    response.raise_for_status()
    extracted = response.json().get("data") or {}

    # Sparse SPA shells get one more HTTP pass, never stealth/browser. Stealth
    # ignores cooperative cancellation and is what produced 504s on URL jobs.
    if len(str(extracted.get("content") or "").strip()) < 150:
        try:
            retry_resp = requests.post(
                COLLECTOR_URL + "/extract-url",
                json={"url": item["url"], "fetch_mode": "http", "timeout_ms": 15000, "max_retries": 0},
                timeout=(5, 20),
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
        timeout=(5, 120),
    )
    response.raise_for_status()
    payload = response.json()
    return pipeline_analysis_to_matrix(payload.get("data") or payload)


def pipeline_analysis_to_matrix(analysis: dict) -> dict:
    """Adapt ingest NLP output into the crawl-matrix persist shape."""
    out = dict(analysis or {})
    locations = []
    seen: set[str] = set()

    def add(country, provinces, cases, deaths, time_frame=""):
        name = str(country or "").strip()
        if not name:
            return
        key = name.casefold()
        if key in seen:
            return
        seen.add(key)
        locations.append({
            "country": name,
            "provinces": [str(item).strip() for item in (provinces or []) if str(item).strip()],
            "reported_cases": int(cases or 0),
            "deaths": int(deaths or 0),
            "time_frame": time_frame or out.get("event_date") or "",
        })

    primary_country = out.get("country")
    if primary_country and str(primary_country).casefold() == "outside asean":
        primary_country = None
    primary_place = out.get("location_name") or out.get("province")
    add(
        primary_country,
        [primary_place] if primary_place and str(primary_place).casefold() != str(primary_country or "").casefold() else [],
        0 if out.get("case_count_unknown") else out.get("case_count"),
        out.get("death_count"),
    )
    for event in out.get("sub_events") or []:
        if not isinstance(event, dict):
            continue
        add(
            event.get("country"),
            [event.get("location_name")],
            event.get("case_count"),
            event.get("death_count"),
            event.get("evidence") or "",
        )
    for item in out.get("locations") or []:
        if not isinstance(item, dict):
            continue
        add(item.get("country"), [item.get("name")], 0, 0)
    out["locations"] = locations
    if "source_reliability_score" not in out:
        out["source_reliability_score"] = out.get("source_credibility") or 0.65
    return out


def claim_job() -> tuple[str, dict] | None:
    with connect() as conn:
        row = conn.execute(
            """SELECT id, query
               FROM crawl_matrix_jobs
               WHERE status='queued'
                  OR (status='processing' AND updated_at < NOW() - (%s * INTERVAL '1 minute'))
               ORDER BY CASE WHEN status='queued' THEN 0 ELSE 1 END, created_at
               LIMIT 1 FOR UPDATE SKIP LOCKED""",
            (STALE_MINUTES,),
        ).fetchone()
        if not row:
            return None
        conn.execute(
            """UPDATE crawl_matrix_jobs
               SET status='processing', error=NULL, updated_at=NOW()
               WHERE id=%s""",
            (row["id"],),
        )
        conn.commit()
        return str(row["id"]), dict(row["query"] or {})


def claim_job_by_id(job_id: str) -> tuple[str, dict] | None:
    with connect() as conn:
        row = conn.execute(
            """UPDATE crawl_matrix_jobs
               SET status='processing', error=NULL, updated_at=NOW()
               WHERE id=%s::uuid AND (
                    status='queued'
                    OR (status='processing' AND updated_at < NOW() - (%s * INTERVAL '1 minute'))
               )
               RETURNING id, query""",
            (job_id, STALE_MINUTES),
        ).fetchone()
        conn.commit()
        if not row:
            return None
        return str(row["id"]), dict(row["query"] or {})


def _prepare_matrix_article(item: dict, reprocess: bool = False):
    """Fetch or reuse one article and run NLP. Persistence stays serial."""
    try:
        article = item if reprocess else extract_article(item)
        if not (article.get("content") or "").strip():
            raise ValueError("Article has no extractable content")
        identity_hash = article_identity_hash(article)
        identity_lock = connect()
        identity_lock.autocommit = True
        identity_lock.execute(
            "SELECT pg_advisory_lock(hashtext(%s))",
            (f"manual-crawl:{identity_hash}",),
        )
        try:
            cached = None if reprocess else load_cached_analysis(identity_lock, identity_hash)
            if cached:
                analysis = dict(cached["result"] or {})
                raw_id = cached.get("raw_report_id")
                logger.info("NLP cache hit: pipeline=%s identity=%s", SURVEILLANCE_PIPELINE, identity_hash)
            else:
                with connect() as conn:
                    raw_id = ensure_raw_report(conn, article)
                    conn.commit()
                logger.info("NLP started: pipeline=%s url=%s", SURVEILLANCE_PIPELINE, article.get("url"))
                analysis = analyze_article(article)
                with connect() as conn:
                    store_cached_analysis(conn, identity_hash, raw_id, analysis)
                    conn.commit()
                logger.info("NLP success: pipeline=%s url=%s", SURVEILLANCE_PIPELINE, article.get("url"))
            if not raw_id:
                with connect() as conn:
                    raw_id = ensure_raw_report(conn, article)
                    conn.commit()
        finally:
            identity_lock.execute(
                "SELECT pg_advisory_unlock(hashtext(%s))",
                (f"manual-crawl:{identity_hash}",),
            )
            identity_lock.close()
        return item, article, analysis, raw_id, None
    except Exception as exc:
        logger.warning("Matrix article prepare failed: %s", exc)
        return item, None, {}, None, f"{item.get('url', 'article')}: {str(exc)[:180]}"


def run_job(job_id: str, payload: dict, reprocess: bool = False) -> None:
    warnings: list[str] = []
    direct_url_mode = bool(str(payload.get("url") or "").strip())
    try:
        with connect() as conn:
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
                conn.execute("DELETE FROM crawl_matrix_rows WHERE crawl_job_id=%s", (job_id,))
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
            conn.execute("UPDATE crawl_matrix_jobs SET discovered_count=%s, updated_at=NOW() WHERE id=%s", (len(discovered), job_id))
            conn.commit()

        processed = 0
        row_count = 0
        from concurrent.futures import ThreadPoolExecutor, as_completed

        def prepare(item):
            return _prepare_matrix_article(item, reprocess=reprocess)

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
                        inserted = persist_article(conn, job_id, raw_id, article, analysis, concepts, payload)
                        persist_dashboard_event_from_analysis(conn, raw_id, article, analysis)
                        row_count += inserted
                        conn.commit()
                    if inserted:
                        processed += 1
                    else:
                        warnings.append(f"{item.get('url', 'article')}: no validated country/province relation and case metric")
            except Exception as exc:
                warnings.append(f"{item.get('url', 'article')}: {str(exc)[:180]}")
                logger.warning("Matrix article failed: %s", exc)
            with connect() as conn:
                conn.execute(
                    """UPDATE crawl_matrix_jobs
                       SET processed_count=%s, row_count=%s, warnings=%s, updated_at=NOW()
                       WHERE id=%s""",
                    (processed, row_count, Jsonb(warnings), job_id),
                )
                conn.commit()

        final_status = "partial" if warnings and row_count else ("failed" if warnings and not row_count else "completed")
        with connect() as conn:
            conn.execute(
                """UPDATE crawl_matrix_jobs
                   SET status=%s, processed_count=%s, row_count=%s, warnings=%s,
                       updated_at=NOW(), completed_at=NOW()
                   WHERE id=%s""",
                (final_status, processed, row_count, Jsonb(warnings), job_id),
            )
            conn.commit()
    except Exception as exc:
        logger.exception("Matrix job %s failed", job_id)
        with connect() as conn:
            conn.execute(
                """UPDATE crawl_matrix_jobs
                   SET status='failed', error=%s, warnings=%s, updated_at=NOW(), completed_at=NOW()
                   WHERE id=%s""",
                (str(exc)[:500], Jsonb(warnings), job_id),
            )
            conn.commit()


def _execute_claimed(claimed: tuple[str, dict] | None) -> bool:
    if not claimed:
        return False
    job_id, payload = claimed
    reprocess = bool(payload.pop("_reprocess", False))
    logger.info("Processing matrix job %s (reprocess=%s)", job_id, reprocess)
    run_job(job_id, payload, reprocess=reprocess)
    return True


def _run_claimed_exclusive(claimed: tuple[str, dict] | None) -> bool:
    """Only one matrix job runs in this process at a time."""
    if not claimed:
        return False
    with _job_lock:
        return _execute_claimed(claimed)


def _next_claimed_job() -> tuple[str, dict] | None:
    try:
        job_id = _pending_job_ids.get_nowait()
    except queue.Empty:
        job_id = None
    if job_id:
        claimed = claim_job_by_id(job_id)
        if claimed:
            return claimed
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
                channel.queue_declare(queue=CRAWL_QUEUE, durable=True)
                channel.basic_qos(prefetch_count=1)

                def on_message(_ch, method, _properties, body):
                    try:
                        payload = json.loads(body)
                        job_id = str(payload.get("job_id") or "")
                        if job_id:
                            _pending_job_ids.put(job_id)
                            _wake.set()
                    except Exception:
                        logger.exception("Crawl matrix AMQP handler failed")
                    try:
                        channel.basic_ack(method.delivery_tag)
                    except Exception:
                        logger.exception("Failed to ack crawl matrix message")

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
