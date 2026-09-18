"""Persist N structured disease facts as child disease_events rows."""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional

from .geo import st_makepoint_args

logger = logging.getLogger(__name__)
NLP_PIPELINE_VERSION = os.getenv("NLP_PIPELINE_VERSION", "2026.09.17.multi-fact")


def persist_child_facts(conn, *, parent_event_id, raw_id, result: dict[str, Any], source_url: Optional[str] = None) -> int:
    """Insert every sub_event as its own disease_events row.

    Parent stays as the Analyze event_id pointer. Its case/death totals are
    cleared so History/dashboard sums do not double-count children.
    """
    sub_events = result.get("sub_events") or []
    if len(sub_events) < 2:
        return 0
    version = result.get("nlp_pipeline_version") or NLP_PIPELINE_VERSION
    inserted = 0
    for sub_evt in sub_events:
        if not isinstance(sub_evt, dict):
            continue
        sub_location = sub_evt.get("location_name") or result.get("location_name")
        sub_disease = sub_evt.get("disease") or result.get("disease_classification")
        sub_cases = sub_evt.get("case_count")
        sub_deaths = sub_evt.get("death_count")
        sub_lat = sub_evt.get("latitude")
        sub_lon = sub_evt.get("longitude")
        sub_evidence = sub_evt.get("evidence") or ""
        sub_admin1 = sub_evt.get("admin1") or result.get("admin1_name") or result.get("province")
        sub_admin2 = sub_evt.get("admin2") or result.get("admin2_name") or result.get("city")
        sub_iso3 = sub_evt.get("country_iso3") or result.get("country_iso3")
        sub_epistemic = sub_evt.get("epistemic_status") or result.get("epistemic_status") or "reported"
        sub_metric_type = sub_evt.get("metric_type") or "cases"
        sub_start = sub_evt.get("event_date_start") or result.get("event_date_start")
        sub_end = sub_evt.get("event_date_end") or result.get("event_date_end")
        sub_period_type = "cumulative" if sub_metric_type == "cumulative_cases" else (result.get("count_period_type") or "unknown")
        sub_confirmed = sub_cases if sub_epistemic == "confirmed" else None
        sub_suspected = sub_cases if sub_epistemic == "suspected" else None
        sub_hospitalized = sub_cases if sub_metric_type == "active_cases" else None
        sub_evidence_payload = {
            "text": sub_evidence,
            "metrics": sub_evt.get("metrics") or [],
            "relations": sub_evt.get("relations") or [],
            "provenance": sub_evt.get("provenance") or {},
        }
        sub_evidence_json = json.dumps(
            [sub_evidence, sub_evidence_payload] if sub_evidence else [sub_evidence_payload]
        )
        sub_validation_flags = sub_evt.get("validation_flags") or result.get("validation_flags") or []

        conn.execute(
            """INSERT INTO disease_events
               (raw_report_id, source_type, source_name, published_at,
                original_text, language, location_name, province, city, geom,
                admin1_name, admin2_name, country_iso3,
                symptoms, disease_extracted, disease_mentions,
                disease_classification, case_count, death_count,
                confidence, outbreak_alert, sentiment, event_type,
                relevance_score, source_credibility,
                source_credibility_label, is_health_related,
                parent_event_id, source_url, nlp_pipeline_version,
                count_period_type, event_date_start, event_date_end,
                date_needs_review, needs_review,
                epistemic_status, confirmed_cases, suspected_cases, hospitalizations,
                epidemiological_evidence, validation_flags)
               VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    CASE WHEN %s::float8 IS NULL OR %s::float8 IS NULL THEN NULL
                         ELSE ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                    END,
                    %s, %s, %s,
                    %s::jsonb, %s::jsonb, %s::jsonb,
                    %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s,
                    TRUE, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s::jsonb, %s::jsonb
               )
               ON CONFLICT DO NOTHING""",
            (
                raw_id,
                result.get("source_type") or "web",
                result.get("source_name"),
                result.get("published_at"),
                sub_evidence or result.get("content") or "",
                result.get("language") or "id",
                sub_location,
                sub_admin1,
                sub_admin2,
                *st_makepoint_args(sub_lat, sub_lon),
                sub_admin1,
                sub_admin2,
                sub_iso3,
                json.dumps(result.get("symptoms") or []),
                json.dumps([sub_disease] if sub_disease else []),
                json.dumps(result.get("disease_mentions") or []),
                sub_disease,
                sub_cases,
                sub_deaths,
                result.get("confidence", 0.0),
                result.get("outbreak_alert", False),
                result.get("sentiment"),
                result.get("event_type"),
                result.get("relevance_score"),
                result.get("source_credibility", 0.50),
                result.get("source_credibility_label", ""),
                parent_event_id,
                source_url or result.get("url"),
                version,
                sub_period_type,
                sub_start,
                sub_end,
                result.get("date_needs_review", False),
                result.get("needs_review", False),
                sub_epistemic,
                sub_confirmed,
                sub_suspected,
                sub_hospitalized,
                sub_evidence_json,
                json.dumps(sub_validation_flags),
            ),
        )
        inserted += 1
    if inserted:
        conn.execute(
            """UPDATE disease_events
               SET case_count = NULL, death_count = NULL,
                   nlp_pipeline_version = COALESCE(nlp_pipeline_version, %s)
               WHERE id = %s""",
            (version, parent_event_id),
        )
        logger.info("Multi-event: inserted %s child facts for parent=%s", inserted, parent_event_id)
    return inserted


def load_sibling_facts(conn, raw_report_id) -> list[dict[str, Any]]:
    """Return atomic facts for one article, preferring child rows when present."""
    if not raw_report_id:
        return []
    rows = conn.execute(
        """SELECT disease_classification AS disease,
                  location_name, province, city,
                  admin1_name, admin2_name, country_iso3,
                  case_count, death_count, parent_event_id,
                  epistemic_status, validation_flags,
                  ST_Y(geom) AS latitude, ST_X(geom) AS longitude
           FROM disease_events
           WHERE raw_report_id = %s
           ORDER BY parent_event_id NULLS FIRST, created_at ASC""",
        (raw_report_id,),
    ).fetchall()
    records = [dict(row) for row in rows]
    children = [row for row in records if row.get("parent_event_id")]
    source = children if len(children) >= 2 else records
    facts = []
    for row in source:
        if not row.get("disease") and not row.get("location_name"):
            continue
        facts.append({
            "disease": row.get("disease"),
            "location_name": row.get("location_name"),
            "province": row.get("province") or row.get("admin1_name"),
            "city": row.get("city") or row.get("admin2_name"),
            "admin1_name": row.get("admin1_name"),
            "admin2_name": row.get("admin2_name"),
            "country_iso3": row.get("country_iso3"),
            "case_count": row.get("case_count"),
            "death_count": row.get("death_count"),
            "latitude": row.get("latitude"),
            "longitude": row.get("longitude"),
        })
    return facts
