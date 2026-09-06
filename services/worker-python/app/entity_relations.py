"""Pure relation builders shared by ingestion workers and tests.

They intentionally keep report-level case/death counts on the primary
location/disease only unless the NLP result provides an explicit entity-level
count. This prevents a single article total from being multiplied across
background locations or mentioned diseases.
"""

from __future__ import annotations

from typing import Any


def _as_int_or_none(value: Any) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _same_name(left: Any, right: Any) -> bool:
    return bool(left and right and str(left).strip().casefold() == str(right).strip().casefold())


def location_relation_rows(nlp: dict[str, Any]) -> list[dict[str, Any]]:
    primary_name = str(nlp.get("location_name") or "").strip() or None
    raw_locations = nlp.get("locations") or []
    if not raw_locations and primary_name:
        raw_locations = [{
            "name": primary_name,
            "latitude": nlp.get("latitude"),
            "longitude": nlp.get("longitude"),
            "country": nlp.get("country"),
            "role": "event",
        }]

    rows: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for item in raw_locations:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        default_role = "event" if _same_name(name, primary_name) else "other"
        role = str(item.get("role") or default_role).strip().lower()
        if role not in {"event", "source", "other"}:
            role = default_role
        key = (name.casefold(), role)
        if key in seen:
            continue
        seen.add(key)
        is_event = role == "event"
        rows.append({
            "location_name": name,
            "location_ref": name,
            "role": role,
            "country": item.get("country") or (nlp.get("country") if is_event else None),
            "latitude": item.get("latitude"),
            "longitude": item.get("longitude"),
            "case_count": _as_int_or_none(item.get("case_count")) if item.get("case_count") is not None else (
                _as_int_or_none(nlp.get("case_count")) if is_event else None
            ),
            "death_count": _as_int_or_none(item.get("death_count")) if item.get("death_count") is not None else (
                _as_int_or_none(nlp.get("death_count")) if is_event else None
            ),
            "evidence": str(item.get("evidence") or "").strip() or None,
        })
    return rows

def disease_relation_rows(nlp: dict[str, Any]) -> list[dict[str, Any]]:
    primary_name = str(nlp.get("disease_classification") or "").strip()
    mentions = nlp.get("disease_mentions") or []
    extracted = nlp.get("disease_extracted") or []
    candidates: list[dict[str, Any]] = [
        item for item in mentions if isinstance(item, dict)
    ]
    known = {
        str(item.get("canonical_name") or item.get("surface_form") or "").strip().casefold()
        for item in candidates
    }
    if primary_name and primary_name.casefold() not in known:
        candidates.insert(0, {
            "surface_form": primary_name,
            "canonical_name": primary_name,
            "role": "primary",
            "confidence": nlp.get("confidence"),
            "resolution_source": "legacy_primary",
        })
    for value in extracted:
        name = str(value or "").strip()
        if name and name.casefold() not in known and name.casefold() != primary_name.casefold():
            candidates.append({
                "surface_form": name,
                "canonical_name": name,
                "role": "mentioned",
                "resolution_source": "keyword/agent",
            })
            known.add(name.casefold())

    rows: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for item in candidates:
        canonical = str(item.get("canonical_name") or item.get("surface_form") or "").strip()
        if not canonical or canonical.upper() in {"UNKNOWN", "NEGATIVE - NOT HEALTH RELATED"}:
            continue
        role = "primary" if (
            str(item.get("role") or "").lower() == "primary"
            or _same_name(canonical, primary_name)
        ) else "mentioned"
        key = (canonical.casefold(), role)
        if key in seen:
            continue
        seen.add(key)
        is_primary = role == "primary"
        rows.append({
            "surface_form": str(item.get("surface_form") or canonical).strip(),
            "disease_name": canonical,
            "role": role,
            "icd11_code": item.get("icd11_code"),
            "confidence": item.get("confidence"),
            "evidence": str(item.get("evidence") or "").strip() or None,
            "resolution_source": str(item.get("resolution_source") or "unknown"),
            "case_count": _as_int_or_none(nlp.get("case_count")) if is_primary else None,
            "death_count": _as_int_or_none(nlp.get("death_count")) if is_primary else None,
        })
    return rows
