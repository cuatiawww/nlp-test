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

# Pattern family 4: "Lokasi tercatat/mencatat N kasus (dan N kematian)"
_RE_LOC_VERB_CASES_ID = re.compile(
    r"(?:(?:di|in|pada)\s+)?([A-Z\u00C0-\u024F][a-zA-Z\u00C0-\u024F\s-]{1,30}?)\s+"
    r"(?:tercatat|mencatat|melaporkan|ditemukan|ada|terdapat|mengonfirmasi|konfirmasi)\s+"
    r"(?:sebanyak\s+)?(\d[\d.,]*)\s+kasus"
    r"(?:(?:\s+dan|,)\s+(\d[\d.,]*)\s+(?:kematian|meninggal|korban\s+jiwa))?",
    re.UNICODE | re.IGNORECASE,
)

_RE_LOC_VERB_CASES_EN = re.compile(
    r"(?:(?:in|at)\s+)?([A-Z\u00C0-\u024F][a-zA-Z\u00C0-\u024F\s-]{1,30}?)\s+"
    r"(?:recorded|reports?|reported|confirmed|logged|found)\s+"
    r"(?:a\s+total\s+of\s+)?(\d[\d.,]*)\s+cases?"
    r"(?:(?:\s+and|,)\s+(\d[\d.,]*)\s+(?:deaths?|fatalities))?",
    re.UNICODE | re.IGNORECASE,
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
    """Strip trailing & leading conjunctions and whitespace from a captured location name."""
    name = raw.strip()
    name = re.sub(
        r"^(?:sementara(?:\s+itu)?|sedangkan|adapun|dan|and|meanwhile|while|serta|in|di|pada|dari|from|at)\s+",
        "", name, flags=re.IGNORECASE,
    )
    name = re.sub(
        r"\s+(?:has|have|had|dan|and|serta|with|atau|or|pada|di|in|from|dari)$",
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
    if location in config.ASEAN_COUNTRIES:
        return location
    if location in config.LOCATION_COUNTRIES:
        return config.LOCATION_COUNTRIES[location]
    for loc_name, c in config.LOCATION_COUNTRIES.items():
        if _fold_location_text(loc_name) == folded:
            return c
    return None


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

    for pattern in [_RE_LOC_VERB_CASES_ID, _RE_LOC_VERB_CASES_EN]:
        for match in pattern.finditer(text):
            raw_loc = _clean_location_name(match.group(1))
            canonical = _validate_location(raw_loc)
            if not canonical:
                continue
            count = _parse_count_value(match.group(2))
            death_count = _parse_count_value(match.group(3)) if match.group(3) else 0
            key = canonical.casefold()
            if key not in pairs:
                pairs[key] = {
                    "location": canonical,
                    "cases": count,
                    "deaths": death_count,
                    "evidence": match.group(0).strip(),
                }
            else:
                pairs[key]["cases"] = max(pairs[key]["cases"], count)
                pairs[key]["deaths"] = max(pairs[key]["deaths"], death_count)

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


def _has_multi_event_signal(text: str, locations: list[dict]) -> bool:
    """Avoid an LLM call for ordinary one-location articles.

    The regex layer remains authoritative.  The LLM fallback is only useful
    when the text contains at least two metric mentions and at least two
    location hints that the regex could not pair safely.
    """
    metric_mentions = re.findall(
        r"\b\d[\d.,]*\s+(?:cases?|kasus|deaths?|kematian|patients?|pasien)\b",
        text or "",
        flags=re.IGNORECASE,
    )
    if len(metric_mentions) < 2:
        return False

    location_names = {
        str(item.get("name") or item.get("location_name") or "").casefold()
        for item in (locations or [])
        if isinstance(item, dict)
    }
    folded = (text or "").casefold()
    for name in list(location_names):
        if not name or name not in folded:
            location_names.discard(name)

    # Include common country forms because location extraction may not have
    # resolved them yet.  Province/city candidates are covered by `locations`.
    country_hints = (
        "indonesia", "singapore", "singapura", "malaysia", "thailand",
        "vietnam", "viet nam", "cambodia", "kamboja", "philippines",
        "filipina", "myanmar", "laos", "brunei", "timor-leste",
    )
    location_names.update(name for name in country_hints if name in folded)
    return len(location_names) >= 2


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


def _extract_breakdown_events(text: str, default_location: Optional[str] = None) -> list[dict[str, Any]]:
    """Parse hierarchical breakdown sentences like:
    - 'Tuy Đức ghi nhận 68 ca bệnh truyền nhiễm, trong đó, có 46 ca sốt xuất huyết và 18 ca tay chân miệng'
    - 'Thailand recorded 254 cases, including 193 cases of Clade Ib and 58 cases of Clade II'
    """
    from . import extractors as ext
    results: list[dict[str, Any]] = []

    # Vietnamese breakdown: [Location] ghi nhận [Total] ca ..., trong đó [có] [N1] ca [Disease1] và [N2] ca [Disease2]
    vn_match = re.search(
        r"(?:([A-ZÀ-Ỹ][a-zà-ỹA-Z\s]{1,30}?)\s+)?ghi nhận\s+(\d+[\d,.]*)\s+ca\b.*?(?:trong đó|trong do|bao gồm|bao gom)\s*,?\s*(?:có\s+)?([0-9].+)",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if vn_match:
        raw_loc = vn_match.group(1)
        loc = _clean_location_name(raw_loc) if raw_loc else (default_location or "")
        canonical_loc = _validate_location(loc) or loc or default_location or ""
        breakdown_text = vn_match.group(3)
        sub_matches = list(re.finditer(
            r"(?:có\s+)?(\d+[\d,.]*)\s+ca\s+([A-ZÀ-Ỹa-zà-ỹ\s]+?)(?:,|và|and|;|\.|\n|$)",
            breakdown_text,
            re.IGNORECASE,
        ))
        if len(sub_matches) >= 2:
            country = _resolve_country(canonical_loc)
            lat, lon = _resolve_coords(canonical_loc)
            for sm in sub_matches:
                cnt = _parse_count_value(sm.group(1))
                raw_d = sm.group(2).strip()
                dis_list = ext.extract_diseases(raw_d)
                d_name = dis_list[0] if dis_list else raw_d
                d_display = ext.normalize_disease_display(d_name, language="vi", text=raw_d)
                results.append({
                    "disease": d_display,
                    "location_name": canonical_loc,
                    "country": country,
                    "latitude": lat,
                    "longitude": lon,
                    "case_count": cnt,
                    "death_count": 0,
                    "evidence": sm.group(0).strip(),
                })
            if len(results) >= 2:
                return results

    # English / Indonesian breakdown: [Location] recorded/reported/mencatat [Total] cases ..., including [N1] cases of [D1] and [N2] cases of [D2]
    en_match = re.search(
        r"(?:([A-Za-z\s]{2,30}?)\s+)?(?:recorded|reported|mencatat|melaporkan)\s+(\d+[\d,.]*)\s+(?:cases|kasus)\b.*?(?:including|consisting of|di antaranya|terdiri dari)\s+([0-9].+)",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if en_match:
        raw_loc = en_match.group(1)
        loc = _clean_location_name(raw_loc) if raw_loc else (default_location or "")
        canonical_loc = _validate_location(loc) or loc or default_location or ""
        breakdown_text = en_match.group(3)
        sub_matches = list(re.finditer(
            r"(\d+[\d,.]*)\s+(?:cases|kasus|patients)\s+(?:of\s+)?([A-Za-z\s-]+?)(?:,|and|dan|;|\.|\n|$)",
            breakdown_text,
            re.IGNORECASE,
        ))
        if len(sub_matches) >= 2:
            country = _resolve_country(canonical_loc)
            lat, lon = _resolve_coords(canonical_loc)
            for sm in sub_matches:
                cnt = _parse_count_value(sm.group(1))
                raw_d = sm.group(2).strip()
                dis_list = ext.extract_diseases(raw_d)
                d_name = dis_list[0] if dis_list else raw_d
                d_display = ext.normalize_disease_display(d_name, text=raw_d)
                results.append({
                    "disease": d_display,
                    "location_name": canonical_loc,
                    "country": country,
                    "latitude": lat,
                    "longitude": lon,
                    "case_count": cnt,
                    "death_count": 0,
                    "evidence": sm.group(0).strip(),
                })
            if len(results) >= 2:
                return results

    return results


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

    # Check for explicit breakdown sentences (e.g. 68 ca ..., trong đó có 46 ca sốt xuất huyết và 18 ca tay chân miệng)
    breakdown_events = _extract_breakdown_events(text, default_location=primary_location)
    if len(breakdown_events) >= MULTI_EVENT_MIN_PAIRS:
        return _deduplicate_events(breakdown_events)

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
    if (
        MULTI_EVENT_LLM_FALLBACK
        and len(all_events) < MULTI_EVENT_MIN_PAIRS
        and _has_multi_event_signal(text, locations)
    ):
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


def _infectious_disease_labels(diseases: list[str], text: str) -> list[str]:
    """Outbreak-relevant labels only — never NCD mashups or UNKNOWN."""
    from . import extractors as ext

    kept: list[str] = []
    for item in ext.filter_diseases_to_evidence(diseases or [], text):
        display = ext.normalize_disease_display(item, text=text)
        if not display or display.upper() == "UNKNOWN":
            continue
        if ext.is_ncd_only_non_outbreak(display, [display]):
            continue
        if display not in kept:
            kept.append(display)
    return kept


def _event_for_disease(
    *,
    disease: str,
    location: Optional[str],
    text: str,
    default_cases: int,
    default_deaths: int,
) -> dict[str, Any]:
    from . import extractors as ext

    loc = location or ""
    country = _resolve_country(loc) if loc else None
    lat, lon = _resolve_coords(loc) if loc else (None, None)
    per_cases = ext.extract_case_count(text, disease=disease)
    per_deaths = ext.extract_death_count(text, disease=disease)
    if ext.article_states_zero_cases(text):
        per_cases = 0
    if ext.is_vaccine_campaign_not_outbreak(text) or ext.should_reject_incident_count(per_cases, text):
        per_cases = 0
        per_deaths = 0
    elif not ext.has_explicit_case_count(text, disease=disease):
        # Extra diseases must not inherit the article-wide total.
        per_cases = 0
    return {
        "disease": disease,
        "location_name": loc,
        "country": country,
        "latitude": lat,
        "longitude": lon,
        "case_count": per_cases,
        "death_count": per_deaths,
        "evidence": "",
    }


def compose_structured_events(
    text: str,
    primary_disease: str,
    primary_location: Optional[str],
    diseases_extracted: list[str],
    locations: list[dict],
    case_count: int,
    death_count: int,
) -> list[dict[str, Any]]:
    """Location-scoped counts plus per-disease facts for one article.

    Location pairs stay authoritative for Number of Cases/Deaths. Extra
    outbreak-relevant diseases are persisted as their own rows so the
    collapsed Disease column can show ``Influenza; RSV`` instead of the
    primary label alone. NCD-only articles must not reach this helper.
    """
    events = extract_multi_events(
        text=text,
        primary_disease=primary_disease,
        primary_location=primary_location,
        diseases_extracted=diseases_extracted,
        locations=locations,
        case_count=case_count,
        death_count=death_count,
    )
    infectious = _infectious_disease_labels(
        [primary_disease, *(diseases_extracted or [])],
        text,
    )
    present = {(evt.get("disease") or "").casefold() for evt in events}
    for disease in infectious:
        if disease.casefold() in present:
            continue
        events.append(
            _event_for_disease(
                disease=disease,
                location=primary_location,
                text=text,
                default_cases=case_count,
                default_deaths=death_count,
            )
        )
        present.add(disease.casefold())
    events = _deduplicate_events(events)
    return events if len(events) >= MULTI_EVENT_MIN_PAIRS else []


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
