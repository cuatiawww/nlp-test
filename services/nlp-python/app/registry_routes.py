"""Registry collections the NLP engine reads, served by this process.

RunPod exposes the inference routes. These paths are the registries that
feed the same engine: keywords, diseases, outbreak rules, extraction rules,
language markers, language models, source credibility, locations, and the
translation cache. Each one answers on the short path and on ``/api/v1``.
"""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Query

router = APIRouter()

_TRANSLATION_CACHE: dict[str, dict[str, Any]] = {}
_HASH = re.compile(r"^[0-9a-fA-F]{64}$")


def _jsonable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {key: _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    return value


def _collection(rows: list[dict]) -> dict[str, Any]:
    data = _jsonable(rows)
    return {"success": True, "data": data, "total": len(data)}


def _active(rows: list[dict], is_active: bool | None) -> list[dict]:
    if is_active is None:
        return rows
    return [row for row in rows if bool(row.get("is_active", True)) is is_active]


def _query(sql: str) -> list[dict]:
    from .registry_client import query_db

    return [dict(row) for row in query_db(sql)]


def _keywords() -> list[dict]:
    try:
        return _query(
            "SELECT category, keyword, target_label, is_active, priority "
            "FROM nlp_keywords ORDER BY priority, category, keyword"
        )
    except Exception:
        from . import config

        rows = [
            {"category": "symptom", "keyword": keyword, "target_label": label, "is_active": True, "priority": 0}
            for keyword, label in config.SYMPTOM_DICT.items()
        ]
        rows.extend(
            {"category": "disease", "keyword": keyword, "target_label": label, "is_active": True, "priority": 0}
            for keyword, label in config.DISEASE_DICT.items()
        )
        return rows


def _disease_concepts(include_aliases: bool) -> list[dict]:
    alias_sql = (
        """COALESCE(
              json_agg(json_build_object('alias', a.alias, 'language', a.language)
                       ORDER BY a.alias) FILTER (WHERE a.id IS NOT NULL),
              '[]'::json
           ) AS aliases"""
        if include_aliases
        else "'[]'::json AS aliases"
    )
    join_sql = (
        "LEFT JOIN disease_aliases a ON a.concept_id = c.id AND a.is_active = TRUE"
        if include_aliases
        else ""
    )
    group_sql = "GROUP BY c.id" if include_aliases else ""
    try:
        return _query(
            f"""SELECT c.disease_id, c.canonical_name, c.english_name, c.ontology_system,
                      c.source, c.is_active, {alias_sql}
               FROM disease_concepts c
               {join_sql}
               WHERE c.is_active = TRUE
               {group_sql}
               ORDER BY c.canonical_name"""
        )
    except Exception:
        from . import config

        rows = [dict(row) for row in config.DISEASE_MASTER_CONCEPTS]
        if not include_aliases:
            for row in rows:
                row.pop("aliases", None)
        return rows


def _outbreak_rules() -> list[dict]:
    try:
        return _query(
            "SELECT disease_name, min_case_count, is_active FROM disease_outbreak_rules"
        )
    except Exception:
        from . import config

        return [
            {"disease_name": name, "min_case_count": count, "is_active": True}
            for name, count in config.OUTBREAK_RULES.items()
        ]


def _extraction_rules() -> list[dict]:
    try:
        return _query(
            "SELECT field_name, regex_pattern, priority, is_active FROM extraction_rules "
            "ORDER BY field_name, priority"
        )
    except Exception:
        from . import config

        rows = []
        for field, patterns in config.EXTRACTION_RULES.items():
            for priority, pattern in enumerate(patterns):
                rows.append({
                    "field_name": field,
                    "regex_pattern": pattern,
                    "priority": priority,
                    "is_active": True,
                })
        return rows


def _language_markers() -> list[dict]:
    try:
        return _query(
            "SELECT word, language, marker_type, canonical_value, priority, is_active "
            "FROM language_markers ORDER BY marker_type, language, word"
        )
    except Exception:
        from .config import get_language_markers

        return [
            {
                "word": word,
                "language": language,
                "marker_type": "language_marker",
                "canonical_value": None,
                "priority": 0,
                "is_active": True,
            }
            for language, words in get_language_markers().items()
            for word in words
        ]


def _language_models() -> list[dict]:
    try:
        return _query(
            "SELECT language, model_key, is_active FROM language_models ORDER BY language"
        )
    except Exception:
        from . import config

        return [
            {"language": language, "model_key": model_key, "is_active": True}
            for language, model_key in config.LANGUAGE_MODEL_MAP.items()
        ]


def _source_credibility() -> list[dict]:
    try:
        return _query(
            "SELECT source_type, score, is_active FROM source_credibility"
        )
    except Exception:
        from . import config

        return [
            {"source_type": source_type, "score": score, "is_active": True}
            for source_type, score in config.SOURCE_CREDIBILITY_MAP.items()
        ]


def _locations(include_aliases: bool) -> list[dict]:
    try:
        rows = _query(
            """SELECT name, latitude, longitude, country, country_iso3,
                      admin1_name, admin2_name, admin_level, is_active
               FROM locations
               WHERE is_active = TRUE"""
        )
        if include_aliases:
            aliases = _query(
                """SELECT a.alias_name, l.name AS canonical_name, l.country, l.admin_level
                   FROM location_aliases a
                   JOIN locations l ON a.location_id = l.id
                   WHERE l.is_active = TRUE"""
            )
            grouped: dict[str, list[dict]] = {}
            for alias in aliases:
                grouped.setdefault(str(alias.get("canonical_name") or ""), []).append(alias)
            for row in rows:
                row["aliases"] = grouped.get(str(row.get("name") or ""), [])
        return rows
    except Exception:
        from . import config

        grouped: dict[str, list[dict]] = {}
        for alias, canonical in config.LOCATION_ALIASES.items():
            grouped.setdefault(canonical, []).append({
                "alias_name": alias,
                "canonical_name": canonical,
                "country": config.LOCATION_COUNTRIES.get(canonical),
                "admin_level": config.LOCATION_ADMIN_LEVEL.get(canonical),
            })
        rows = []
        for name, coords in config.LOCATION_COORDS.items():
            lat, lon = coords if coords else (None, None)
            row = {
                "name": name,
                "latitude": lat,
                "longitude": lon,
                "country": config.LOCATION_COUNTRIES.get(name),
                "country_iso3": config.LOCATION_ISO3.get(name),
                "admin1_name": config.LOCATION_ADMIN1.get(name),
                "admin2_name": config.LOCATION_ADMIN2.get(name),
                "admin_level": config.LOCATION_ADMIN_LEVEL.get(name),
                "is_active": True,
            }
            if include_aliases:
                row["aliases"] = grouped.get(name, [])
            rows.append(row)
        return rows


def _translation_row(content_hash: str) -> dict | None:
    cached = _TRANSLATION_CACHE.get(content_hash.lower())
    if cached:
        return dict(cached)
    try:
        from .registry_client import query_db

        rows = query_db(
            "SELECT source_language, provider, translated_text, structured_result "
            "FROM translation_cache WHERE content_hash = %s",
            (content_hash.lower(),),
        )
    except Exception:
        return None
    return dict(rows[0]) if rows else None


def _store_translation(body: dict) -> dict:
    content_hash = str(body.get("content_hash") or "")
    if not _HASH.fullmatch(content_hash):
        raise HTTPException(status_code=400, detail="content_hash must be 64 hex characters")
    row = {
        "content_hash": content_hash.lower(),
        "source_language": body.get("source_language"),
        "provider": body.get("provider"),
        "translated_text": body.get("translated_text") or "",
        "structured_result": body.get("structured_result") or {},
    }
    _TRANSLATION_CACHE[row["content_hash"]] = row
    return row


@router.get("/nlp-keywords")
@router.get("/api/v1/nlp-keywords")
def list_nlp_keywords(
    is_active: bool | None = None,
    category: str | None = None,
):
    rows = _active(_keywords(), is_active)
    if category:
        rows = [row for row in rows if str(row.get("category") or "") == category]
    return _collection(rows)


@router.get("/disease-concepts")
@router.get("/api/v1/disease-concepts")
def list_disease_concepts(
    is_active: bool | None = None,
    include: str | None = None,
):
    include_aliases = "aliases" in {part.strip() for part in (include or "").split(",") if part.strip()}
    return _collection(_active(_disease_concepts(include_aliases), is_active))


@router.post("/disease-concepts/upsert")
@router.post("/api/v1/disease-concepts/upsert")
def upsert_disease_concept(body: dict = Body(...)):
    from .config import DISEASE_MASTER_CONCEPTS, _upsert_discovered_disease_concept_db

    canonical = str(body.get("canonical_name") or "").strip()
    code = str(body.get("ontology_code") or "").strip()
    if not canonical or not code:
        raise HTTPException(status_code=400, detail="canonical_name and ontology_code are required")
    try:
        stored = _upsert_discovered_disease_concept_db(
            canonical,
            str(body.get("english_name") or ""),
            code,
            str(body.get("ontology_uri") or ""),
            str(body.get("ontology_release") or ""),
            list(body.get("aliases") or []),
        )
    except Exception:
        stored = None
    if stored is False:
        raise HTTPException(status_code=409, detail="canonical name belongs to another ontology code")
    if stored is None:
        DISEASE_MASTER_CONCEPTS.append({
            "canonical_name": canonical,
            "english_name": body.get("english_name") or canonical,
            "ontology_code": code,
            "ontology_uri": body.get("ontology_uri"),
            "ontology_system": "WHO ICD-11 MMS",
            "source": "who_icd11_discovery",
            "is_active": True,
            "aliases": list(body.get("aliases") or []),
        })
    return {"success": True, "data": {"canonical_name": canonical, "ontology_code": code}}


@router.get("/outbreak-rules")
@router.get("/api/v1/outbreak-rules")
def list_outbreak_rules(is_active: bool | None = None):
    return _collection(_active(_outbreak_rules(), is_active))


@router.get("/extraction-rules")
@router.get("/api/v1/extraction-rules")
def list_extraction_rules(is_active: bool | None = None):
    return _collection(_active(_extraction_rules(), is_active))


@router.get("/language-markers")
@router.get("/api/v1/language-markers")
def list_language_markers(is_active: bool | None = None):
    return _collection(_active(_language_markers(), is_active))


@router.get("/language-models")
@router.get("/api/v1/language-models")
def list_language_models(is_active: bool | None = None):
    return _collection(_active(_language_models(), is_active))


@router.get("/source-credibility")
@router.get("/api/v1/source-credibility")
def list_source_credibility(is_active: bool | None = None):
    return _collection(_active(_source_credibility(), is_active))


@router.get("/locations")
@router.get("/api/v1/locations")
def list_locations(
    is_active: bool | None = None,
    include: str | None = Query(None),
):
    include_aliases = "aliases" in {part.strip() for part in (include or "").split(",") if part.strip()}
    return _collection(_active(_locations(include_aliases), is_active))


@router.post("/locations/upsert-reviewed")
@router.post("/api/v1/locations/upsert-reviewed")
def upsert_reviewed_location(body: dict = Body(...)):
    from . import config

    name = " ".join(str(body.get("name") or "").split()).strip()
    country = " ".join(str(body.get("country") or "").split()).strip()
    if not name or not country:
        raise HTTPException(status_code=400, detail="name and country are required")
    try:
        stored = config._upsert_reviewed_location_db(
            name,
            country,
            " ".join(str(body.get("alias") or "").split()).strip(),
            str(body.get("language") or "und")[:12] or "und",
            body.get("country_iso3") or config.COUNTRY_TO_ISO3.get(country.casefold()),
        )
    except Exception:
        config.LOCATION_COUNTRIES[name] = country
        config.LOCATION_COORDS.setdefault(name, (None, None))
        stored = name
    return {"success": True, "data": {"name": stored, "country": country}}


@router.get("/translation-cache")
@router.get("/api/v1/nlp/translation-cache")
def list_translation_cache():
    return _collection(list(_TRANSLATION_CACHE.values()))


@router.get("/translation-cache/{content_hash}")
@router.get("/api/v1/nlp/translation-cache/{content_hash}")
def get_translation_cache(content_hash: str):
    if not _HASH.fullmatch(content_hash):
        raise HTTPException(status_code=400, detail="content_hash must be 64 hex characters")
    return {"success": True, "data": _translation_row(content_hash)}


@router.put("/translation-cache")
@router.put("/api/v1/nlp/translation-cache")
def put_translation_cache(body: dict = Body(...)):
    return {"success": True, "data": _store_translation(body)}
