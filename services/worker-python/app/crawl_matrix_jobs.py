"""Durable worker for filtered crawling matrix jobs.

This worker runs in the dedicated ``manual-crawler-worker`` container. It uses
the same database-backed job table but never consumes the URL-analysis queue,
so manual crawling and URL analysis cannot acknowledge each other's messages
or compete for the same worker process.
"""

from __future__ import annotations

import datetime as dt
import html
import logging
import os
import re
import time
import xml.etree.ElementTree as ET
from urllib.parse import quote_plus, urlparse

import psycopg
import requests
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

logger = logging.getLogger("crawl-matrix-worker")
DATABASE_URL = os.getenv("DATABASE_URL", "postgres://postgres:root@host.docker.internal:9898/disease_ai")
COLLECTOR_URL = os.getenv("COLLECTOR_URL", "http://disease-collector-python:8002").rstrip("/")
NLP_SERVICE_URL = os.getenv("NLP_SERVICE_URL", "http://disease-nlp-python:8000").rstrip("/")
POLL_SECONDS = max(1.0, float(os.getenv("CRAWL_MATRIX_POLL_SECONDS", "2")))
STALE_MINUTES = max(5, int(os.getenv("CRAWL_MATRIX_STALE_MINUTES", "15")))

ASEAN_COUNTRIES = {
    "Brunei", "Cambodia", "Indonesia", "Laos", "Malaysia", "Myanmar",
    "Philippines", "Singapore", "Thailand", "Timor-Leste", "Vietnam",
}


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
    """Build a permissive Google News query for the selected filters.

    Multiple diseases are alternatives, not mandatory words. Region buckets
    such as ASEAN/Global are applied after extraction and must not be sent as
    literal search terms because they make Google News return almost nothing.
    """
    disease_terms = [f'"{name}"' if " " in name else name for name in disease_names if name]
    if not disease_terms:
        raise ValueError("Pilih minimal satu penyakit dari master ICD-11")
    query = f"({' OR '.join(disease_terms)})"
    geography = (country or "").strip()
    if not geography and region and region.casefold() not in {"asean", "global"}:
        geography = region.strip()
    return f"{query} {geography}".strip()


def discover_urls(disease_names: list[str], country: str | None, region: str | None, limit: int) -> list[dict]:
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


def disease_labels(analysis: dict) -> list[str]:
    value = analysis.get("disease_classification")
    if isinstance(value, (list, tuple, set)):
        return [str(item).strip() for item in value if str(item).strip()]
    label = str(value or "").strip()
    return [label] if label else []


def article_matches(analysis: dict, disease_names: list[str], country: str | None) -> bool:
    found = [value.casefold() for value in disease_labels(analysis)]
    if disease_names and not any(
        name.casefold() in value or value in name.casefold()
        for name in disease_names for value in found
    ):
        return False
    if country:
        return any(
            str(item.get("country") or "").casefold() == country.casefold()
            for item in analysis.get("locations") or []
        )
    return True


def selected_concept(labels: list[str], concepts: list[dict]) -> tuple[str, dict | None]:
    for label in labels:
        label_key = label.casefold()
        for concept in concepts:
            concept_key = str(concept["canonical_name"]).casefold()
            if label_key == concept_key or label_key in concept_key or concept_key in label_key:
                return label, concept
    return (labels[0] if labels else ""), None


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


def country_coordinates(conn, country: str):
    row = conn.execute(
        """SELECT latitude, longitude FROM locations
           WHERE is_active=TRUE AND (LOWER(name)=LOWER(%s) OR LOWER(country)=LOWER(%s))
           ORDER BY CASE WHEN LOWER(name)=LOWER(%s) THEN 0 ELSE 1 END, name
           LIMIT 1""",
        (country, country, country),
    ).fetchone()
    return (row["latitude"], row["longitude"]) if row else (None, None)


def persist_article(conn, job_id: str, article: dict, analysis: dict, concepts: list[dict], request: dict) -> int:
    published = safe_date(article.get("published_at") or analysis.get("published_date"))
    raw = conn.execute(
        """INSERT INTO raw_reports(source_type, source_name, published_at, original_text, url, processing_status)
           VALUES (%s,%s,%s,%s,%s,'PROCESSED') RETURNING id""",
        ("news", article.get("source_name"), published, article.get("content", ""), article.get("url")),
    ).fetchone()
    raw_id = raw["id"]
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
        provinces = item.get("provinces") or []
        if request.get("province_city") and not any(
            request["province_city"].casefold() in str(province).casefold()
            for province in provinces
        ):
            continue
        evidence = next(
            (
                sentence.strip()[:1000]
                for sentence in re.split(r"(?<=[.!?])\s+|\n+", article.get("content", ""))
                if country.casefold() in sentence.casefold() and re.search(r"\d", sentence)
            ),
            "",
        )
        latitude, longitude = country_coordinates(conn, country)
        conn.execute(
            """INSERT INTO crawl_matrix_rows
               (crawl_job_id, raw_report_id, disease_concept_id, disease_name, icd11_code,
                crawling_date, region, country, province_city_case, article_date, date_case,
                number_of_cases, number_of_deaths, latitude, longitude, source_type, source_name,
                source_url, article_title, evidence, confidence, processing_status)
               VALUES (%s,%s,%s,%s,%s,CURRENT_DATE,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (
                job_id, raw_id, concept["id"] if concept else None, disease,
                concept.get("ontology_code") if concept else None,
                "ASEAN" if country in ASEAN_COUNTRIES else (request.get("region") or "Global"),
                country, ", ".join(provinces), published, item.get("time_frame") or "",
                int(item.get("reported_cases") or 0), int(item.get("deaths") or 0),
                latitude, longitude, "news", article.get("source_name"), article.get("url"),
                article.get("title"), evidence, float(analysis.get("source_reliability_score") or 0.0),
                "needs_review" if not evidence else "processed",
            ),
        )
        rows += 1
    return rows


def extract_article(item: dict) -> dict:
    response = requests.post(
        COLLECTOR_URL + "/extract-url",
        json={"url": item["url"], "fetch_mode": "http", "timeout_ms": 12000},
        timeout=(5, 25),
    )
    response.raise_for_status()
    extracted = response.json().get("data") or {}
    return {**item, **extracted, "url": item["url"], "source_name": item.get("source_name")}


def analyze_article(article: dict) -> dict:
    response = requests.post(
        NLP_SERVICE_URL + "/nlp/analyze/surveillance",
        json={
            "text": article["content"],
            "source_type": "news",
            "source_name": article.get("source_name"),
            "published_at": article.get("published_at"),
            "source_url": article.get("url"),
        },
        timeout=(5, 120),
    )
    response.raise_for_status()
    return response.json()


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


def run_job(job_id: str, payload: dict, reprocess: bool = False) -> None:
    warnings: list[str] = []
    try:
        with connect() as conn:
            concepts = matching_concepts(conn, payload.get("disease_concept_ids") or [])
            disease_names = [str(row["canonical_name"]) for row in concepts]

        if reprocess:
            with connect() as conn:
                articles = conn.execute(
                    """SELECT r.id, r.original_text AS content, r.url, r.source_name,
                              r.published_at::text AS published_at, '' AS title
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
                    discovered = discover_urls(disease_names, payload.get("country"), payload.get("region"), payload.get("max_articles", 20))
        elif str(payload.get("url") or "").strip():
            direct_url = str(payload["url"]).strip()
            discovered = [{"url": direct_url, "title": "", "published_at": None, "source_name": source_name(direct_url)}]
        else:
            discovered = discover_urls(disease_names, payload.get("country"), payload.get("region"), payload.get("max_articles", 20))

        with connect() as conn:
            conn.execute("UPDATE crawl_matrix_jobs SET discovered_count=%s, updated_at=NOW() WHERE id=%s", (len(discovered), job_id))
            conn.commit()

        processed = 0
        row_count = 0
        for item in discovered:
            try:
                article = item if reprocess else extract_article(item)
                if not (article.get("content") or "").strip():
                    raise ValueError("Artikel tidak memiliki isi")
                analysis = analyze_article(article)
                if not article_matches(analysis, disease_names, payload.get("country")):
                    warnings.append(f"{item.get('url', 'article')}: penyakit/wilayah tidak cocok dengan filter")
                else:
                    with connect() as conn:
                        inserted = persist_article(conn, job_id, article, analysis, concepts, payload)
                        row_count += inserted
                        conn.commit()
                    if inserted:
                        processed += 1
                    else:
                        warnings.append(f"{item.get('url', 'article')}: tidak ada relasi negara/provinsi dan metrik kasus yang tervalidasi")
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


def run_forever() -> None:
    logger.info("Crawl matrix worker started; poll=%ss stale=%sm", POLL_SECONDS, STALE_MINUTES)
    while True:
        try:
            claimed = claim_job()
            if claimed:
                job_id, payload = claimed
                reprocess = bool(payload.pop("_reprocess", False))
                logger.info("Processing matrix job %s (reprocess=%s)", job_id, reprocess)
                run_job(job_id, payload, reprocess=reprocess)
            else:
                time.sleep(POLL_SECONDS)
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
