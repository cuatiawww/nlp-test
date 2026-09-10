"""Multi-event extraction: decompose one document into N (disease x location) events.

Activated only when the text contains >=2 explicit location-count pairs.
Single-event articles pass through unchanged (backward compatible).

Strategy: Hybrid 2-layer
  Layer 1 - Regex Relational Parser (fast, 0 API cost)
  Layer 2 - LLM Structured Extraction (fallback for narrative text)
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Optional

from . import config

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
MULTI_EVENT_ENABLED = os.getenv("MULTI_EVENT_ENABLED", "true").lower() in (
    "true", "1", "yes", "on",
)
MULTI_EVENT_LLM_FALLBACK = os.getenv("MULTI_EVENT_LLM_FALLBACK", "true").lower() in (
    "true", "1", "yes", "on",
)
MULTI_EVENT_MIN_PAIRS = int(os.getenv("MULTI_EVENT_MIN_PAIRS", "2"))

# ---------------------------------------------------------------------------
# Layer 1: Regex Relational Parser
# ---------------------------------------------------------------------------

# Pattern family 1: "Lokasi (N kasus)" -- very common in Kemenkes / WHO Indonesian
_RE_LOCATION_CASES_PARENS_ID = re.compile(
    r"([A-Z\u00C0-\u024F][\w\s\-'.]{1,50}?)"
    r"\s*\(\s*"
    r"(\d[\d.,]*)"
    r"\s+kasus\s*\)",
    re.UNICODE,
)

# Pattern family 2: English "Location (N cases)"
_RE_LOCATION_CASES_PARENS_EN = re.compile(
    r"([A-Z\u00C0-\u024F][\w\s\-'.]{1,50}?)"
    r"\s*\(\s*"
    r"(\d[\d.,]*)"
    r"\s+cases?\s*\)",
    re.UNICODE,
)

# Pattern family 3: "N kasus di Lokasi" / "N cases in Location"
_RE_CASES_DI_LOCATION_ID = re.compile(
    r"(\d[\d.,]*)\s+kasus\s+di\s+"
    r"([A-Z\u00C0-\u024F][a-zA-Z\u00C0-\u024F\-'.]+(?:\s+[A-Z\u00C0-\u024F][a-zA-Z\u00C0-\u024F\-'.]+)*)",
    re.UNICODE,
)

_RE_CASES_IN_LOCATION_EN = re.compile(
    r"(\d[\d.,]*)\s+cases?\s+in\s+"
    r"([A-Z\u00C0-\u024F][a-zA-Z\u00C0-\u024F\-'.]+(?:\s+[A-Z\u00C0-\u024F][a-zA-Z\u00C0-\u024F\-'.]+)*)",
    re.UNICODE,
)

# Death patterns
_RE_DEATHS_LOCATION_ID = re.compile(
    r"(\d[\d.,]*)\s+(?:kematian|meninggal(?:\s+dunia)?|korban\s+jiwa)\s+(?:di|pada)\s+"
    r"([A-Z\u00C0-\u024F][\w\s\-',]{1,50})",
    re.UNICODE,
)

_RE_DEATHS_LOCATION_EN = re.compile(
    r"(\d[\d.,]*)\s+(?:deaths?|fatalities)\s+in\s+"
    r"([A-Z\u00C0-\u024F][\w\s\-',]{1,50})",
    re.UNICODE,
)

_RE_LOCATION_DEATHS_PARENS = re.compile(
    r"([A-Z\u00C0-\u024F][\w\s\-'.]{1,50}?)"
    r"\s*\(\s*"
    r"(\d[\d.,]*)"
    r"\s+(?:kematian|deaths?|fatalities)\s*\)",
    re.UNICODE,
)


def _parse_count_value(raw: str) -> int:
    """Parse a count string like '1,234' or '10.000' to int."""
    val = raw.strip().strip(".,")
    if not val:
        return 0
    if re.fullmatch(r"\d{1,3}(?:[,.]\d{3})+", val):
        return int(re.sub(r"[,.]", "", val))
    if re.fullmatch(r"\d+", val):
        return int(val)
    try:
        return int(round(float(val.replace(",", "."))))
    except (ValueError, OverflowError):
        return 0


def _clean_location_name(raw: str) -> str:
    """Strip trailing conjunctions and whitespace from a captured location name."""
    name = raw.strip()
    name = re.sub(
        r"\s+(?:dan|and|serta|with|atau|or|pada|di|in|from|dari)$",
        "", name, flags=re.IGNORECASE,
    )
    return name.strip(" ,;:.-()")


def _validate_location(name: str) -> Optional[str]:
    """Validate against the loaded gazetteer; return canonical name or None."""
    if not name:
        return None
    from .extractors import _fold_location_text, COUNTRY_ALIASES
    folded = _fold_location_text(name)
    all_aliases = {
        "singapura": "Singapore",
        "kamboja": "Cambodia",
        "filipina": "Philippines",
        **COUNTRY_ALIASES,
    }
    # Check country aliases first
    for alias, standard in all_aliases.items():
        if _fold_location_text(alias) == folded:
            return standard
    # Check full gazetteer
    for gaz_name in config.LOCATION_COORDS:
        if _fold_location_text(gaz_name) == folded:
            return gaz_name
    # Partial match for longer names
    for gaz_name in config.LOCATION_COORDS:
        gf = _fold_location_text(gaz_name)
        if len(gf) >= 4 and (gf in folded or folded in gf):
            return gaz_name
    return None


def _resolve_country(location: str) -> Optional[str]:
    """Resolve a location name to its country."""
    from .extractors import COUNTRY_ALIASES, _fold_location_text
    folded = _fold_location_text(location)
    all_aliases = {
        "singapura": "Singapore",
        "kamboja": "Cambodia",
        "filipina": "Philippines",
        **COUNTRY_ALIASES,
    }
    for alias, standard in all_aliases.items():
        if _fold_location_text(alias) == folded:
            return standard
    return config.LOCATION_COUNTRIES.get(location)


def _resolve_coords(location: str) -> tuple:
    """Get lat/lon from gazetteer."""
    return config.LOCATION_COORDS.get(location, (None, None))


def _regex_extract_location_cases(text: str) -> list[dict[str, Any]]:
    """Layer 1: Extract (location, case_count) pairs via regex patterns."""
    pairs: dict[str, dict[str, Any]] = {}

    for pattern in [_RE_LOCATION_CASES_PARENS_ID, _RE_LOCATION_CASES_PARENS_EN]:
        for match in pattern.finditer(text):
            raw_loc = _clean_location_name(match.group(1))
            canonical = _validate_location(raw_loc)
            if not canonical:
                continue
            count = _parse_count_value(match.group(2))
            key = canonical.casefold()
            if key not in pairs:
                pairs[key] = {
                    "location": canonical,
                    "cases": count,
                    "deaths": 0,
                    "evidence": match.group(0).strip(),
                }
            elif count > pairs[key]["cases"]:
                pairs[key]["cases"] = count

    for pattern in [_RE_CASES_DI_LOCATION_ID, _RE_CASES_IN_LOCATION_EN]:
        for match in pattern.finditer(text):
            count = _parse_count_value(match.group(1))
            raw_loc = _clean_location_name(match.group(2))
            canonical = _validate_location(raw_loc)
            if not canonical:
                continue
            key = canonical.casefold()
            if key not in pairs:
                pairs[key] = {
                    "location": canonical,
                    "cases": count,
                    "deaths": 0,
                    "evidence": match.group(0).strip(),
                }
            elif count > pairs[key]["cases"]:
                pairs[key]["cases"] = count

    # Attach death counts
    for pattern in [_RE_DEATHS_LOCATION_ID, _RE_DEATHS_LOCATION_EN]:
        for match in pattern.finditer(text):
            death_count = _parse_count_value(match.group(1))
            raw_loc = _clean_location_name(match.group(2))
            canonical = _validate_location(raw_loc)
            if not canonical:
                continue
            key = canonical.casefold()
            if key in pairs:
                pairs[key]["deaths"] = max(pairs[key]["deaths"], death_count)
            else:
                pairs[key] = {
                    "location": canonical,
                    "cases": 0,
                    "deaths": death_count,
                    "evidence": match.group(0).strip(),
                }

    for match in _RE_LOCATION_DEATHS_PARENS.finditer(text):
        raw_loc = _clean_location_name(match.group(1))
        canonical = _validate_location(raw_loc)
        if not canonical:
            continue
        death_count = _parse_count_value(match.group(2))
        key = canonical.casefold()
        if key in pairs:
            pairs[key]["deaths"] = max(pairs[key]["deaths"], death_count)
        else:
            pairs[key] = {
                "location": canonical,
                "cases": 0,
                "deaths": death_count,
                "evidence": match.group(0).strip(),
            }

    return list(pairs.values())


# ---------------------------------------------------------------------------
# Layer 2: LLM Structured Extraction
# ---------------------------------------------------------------------------

def _llm_extract_events(text: str, diseases: list[str]) -> list[dict[str, Any]]:
    """Use the configured LLM agent to extract structured multi-event data."""
    if not config.AGENT_ENABLED:
        return []

    from .agent import chat_json

    disease_hint = ", ".join(diseases[:5]) if diseases else "unknown"
    prompt = (
        "This is an epidemiological surveillance report. Extract ALL distinct "
        "(disease, location, case_count, death_count) tuples mentioned in the text. "
        "Each tuple represents one disease event in one specific location.\n\n"
        "Rules:\n"
        "- Include EVERY country/province/city mentioned with case or death numbers\n"
        "- Do NOT merge different locations into one tuple\n"
        "- Do NOT merge different diseases into one tuple\n"
        "- If a location has no explicit case count, set cases to 0\n"
        "- If a location has no explicit death count, set deaths to 0\n"
        "- Use the most specific location name available\n"
        "- Return JSON: {\"events\": [{\"disease\": str, \"location\": str, "
        "\"country\": str, \"cases\": int, \"deaths\": int, \"evidence\": str}]}\n\n"
        f"Known diseases in text: {disease_hint}\n"
        f"Report text:\n{json.dumps((text or '')[:6000], ensure_ascii=False)}"
    )

    result = chat_json(
        "You are an expert epidemiological data extractor. "
        "Output valid JSON only. Be precise with numbers.",
        prompt,
        max_tokens=1500,
    )

    raw_events = result.get("events") or []
    if not isinstance(raw_events, list):
        return []

    validated: list[dict[str, Any]] = []
    for item in raw_events:
        if not isinstance(item, dict):
            continue
        raw_loc = str(item.get("location") or "").strip()
        canonical = _validate_location(raw_loc)
        if not canonical:
            raw_country = str(item.get("country") or "").strip()
            canonical = _validate_location(raw_country)
            if not canonical:
                continue

        try:
            cases = int(item.get("cases") or 0)
        except (TypeError, ValueError):
            cases = 0
        try:
            deaths = int(item.get("deaths") or 0)
        except (TypeError, ValueError):
            deaths = 0

        validated.append({
            "location": canonical,
            "disease": str(item.get("disease") or "").strip(),
            "cases": max(0, cases),
            "deaths": max(0, deaths),
            "evidence": str(item.get("evidence") or "").strip()[:500],
        })

    return validated


# ---------------------------------------------------------------------------
# Section Detection for Multi-Disease Documents
# ---------------------------------------------------------------------------

_RE_SECTION_HEADING = re.compile(
    r"(?:^|\n\n)"
    r"(?:\d+[.)]\s+)?"
    r"(?:Situasi|Perkembangan|Update|Status|Laporan)\s+"
    r"(.+?)(?:\n|$)",
    re.IGNORECASE | re.MULTILINE,
)


def _split_sections(text: str) -> list[tuple]:
    """Split text into (heading, body) sections if heading patterns are found."""
    headings = list(_RE_SECTION_HEADING.finditer(text))
    if len(headings) < 2:
        return [("", text)]

    sections = []
    for i, match in enumerate(headings):
        title = match.group(1).strip()
        start = match.end()
        end = headings[i + 1].start() if i + 1 < len(headings) else len(text)
        body = text[start:end].strip()
        if body:
            sections.append((title, body))

    return sections if sections else [("", text)]


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def extract_multi_events(
    text: str,
    primary_disease: str,
    primary_location: Optional[str],
    diseases_extracted: list[str],
    locations: list[dict],
    case_count: int,
    death_count: int,
) -> list[dict[str, Any]]:
    """Decompose one document into N structured events.

    Returns a list of event dicts. Each dict contains:
        disease, location_name, country, latitude, longitude,
        case_count, death_count, evidence

    Returns an empty list if the text is single-event (backward compatible).
    Only returns >=2 events; never returns exactly 1.
    """
    if not MULTI_EVENT_ENABLED:
        return []

    if not text or not text.strip():
        return []

    # Step 1: Try section-based multi-disease detection
    sections = _split_sections(text)
    all_events: list[dict[str, Any]] = []

    for section_title, section_body in sections:
        section_disease = primary_disease
        if section_title:
            from . import extractors as ext
            section_diseases = ext.extract_diseases(section_title)
            if section_diseases:
                section_disease = section_diseases[0]
                section_disease = ext.normalize_disease_display(
                    section_disease, language="id", text=section_body,
                )

        regex_pairs = _regex_extract_location_cases(section_body)

        if len(regex_pairs) >= MULTI_EVENT_MIN_PAIRS:
            for pair in regex_pairs:
                loc = pair["location"]
                country = _resolve_country(loc)
                lat, lon = _resolve_coords(loc)
                all_events.append({
                    "disease": pair.get("disease") or section_disease,
                    "location_name": loc,
                    "country": country,
                    "latitude": lat,
                    "longitude": lon,
                    "case_count": pair["cases"],
                    "death_count": pair["deaths"],
                    "evidence": pair.get("evidence", ""),
                })

    if len(all_events) >= MULTI_EVENT_MIN_PAIRS:
        return _deduplicate_events(all_events)

    # Layer 2: Full-text regex (without section splitting)
    if not all_events:
        regex_pairs = _regex_extract_location_cases(text)
        if len(regex_pairs) >= MULTI_EVENT_MIN_PAIRS:
            for pair in regex_pairs:
                loc = pair["location"]
                country = _resolve_country(loc)
                lat, lon = _resolve_coords(loc)
                all_events.append({
                    "disease": primary_disease,
                    "location_name": loc,
                    "country": country,
                    "latitude": lat,
                    "longitude": lon,
                    "case_count": pair["cases"],
                    "death_count": pair["deaths"],
                    "evidence": pair.get("evidence", ""),
                })
            if len(all_events) >= MULTI_EVENT_MIN_PAIRS:
                return _deduplicate_events(all_events)

    # Layer 3: LLM fallback
    if MULTI_EVENT_LLM_FALLBACK and len(all_events) < MULTI_EVENT_MIN_PAIRS:
        try:
            llm_events = _llm_extract_events(text, diseases_extracted)
            if len(llm_events) >= MULTI_EVENT_MIN_PAIRS:
                all_events = []
                for item in llm_events:
                    loc = item["location"]
                    country = _resolve_country(loc)
                    lat, lon = _resolve_coords(loc)
                    disease = item.get("disease") or primary_disease
                    all_events.append({
                        "disease": disease,
                        "location_name": loc,
                        "country": country,
                        "latitude": lat,
                        "longitude": lon,
                        "case_count": item["cases"],
                        "death_count": item["deaths"],
                        "evidence": item.get("evidence", ""),
                    })
                return _deduplicate_events(all_events)
        except Exception as exc:
            logger.warning("Multi-event LLM fallback failed: %s", exc)

    return []


def _deduplicate_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Deduplicate events by (disease, location) key, keeping the highest counts."""
    merged: dict[tuple, dict[str, Any]] = {}
    for event in events:
        key = (
            (event.get("disease") or "").casefold(),
            (event.get("location_name") or "").casefold(),
        )
        if key not in merged:
            merged[key] = event.copy()
        else:
            existing = merged[key]
            existing["case_count"] = max(
                existing.get("case_count", 0), event.get("case_count", 0),
            )
            existing["death_count"] = max(
                existing.get("death_count", 0), event.get("death_count", 0),
            )
            if event.get("evidence") and not existing.get("evidence"):
                existing["evidence"] = event["evidence"]
    return list(merged.values())
