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
import time
from typing import Any, Optional

from . import config, extractors
from .multi_fact_display import join_unique_labels

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
MULTI_EVENT_ENABLED = os.getenv("MULTI_EVENT_ENABLED", "true").lower() in (
    "true", "1", "yes", "on",
)
MULTI_EVENT_LLM_FALLBACK = os.getenv("MULTI_EVENT_LLM_FALLBACK", "false").lower() in (
    "true", "1", "yes", "on",
)
MULTI_EVENT_MIN_PAIRS = int(os.getenv("MULTI_EVENT_MIN_PAIRS", "2"))

# ---------------------------------------------------------------------------
# Layer 1: Regex Relational Parser
# ---------------------------------------------------------------------------

_ASEAN_CHARS = r"A-Z\u00C0-\u024F\u0E00-\u0E7F\u0E80-\u0EFF\u1000-\u109F\u1780-\u17FF"

# Pattern family 1: "Lokasi (N kasus)" -- very common in Kemenkes / WHO Indonesian
_RE_LOCATION_CASES_PARENS_ID = re.compile(
    rf"([{_ASEAN_CHARS}][\w\s\-'.{_ASEAN_CHARS}]{{1,50}}?)"
    r"\s*\(\s*"
    r"(\d[\d.,]*)"
    r"\s+kasus\s*\)",
    re.UNICODE,
)

# Pattern family 2: English "Location (N cases)"
_RE_LOCATION_CASES_PARENS_EN = re.compile(
    rf"([{_ASEAN_CHARS}][\w\s\-'.{_ASEAN_CHARS}]{{1,50}}?)"
    r"\s*\(\s*"
    r"(\d[\d.,]*)"
    r"\s+cases?\s*\)",
    re.UNICODE,
)

# Pattern family 3: "N kasus [penyakit] di Lokasi" / "N cases [disease] in Location"
_RE_CASES_DI_LOCATION_ID = re.compile(
    rf"(\d[\d.,]*)\s+kasus(?:\s+[a-zA-Z\u00C0-\u024F{_ASEAN_CHARS}]+){{0,3}}\s+di\s+"
    rf"([{_ASEAN_CHARS}][a-zA-Z\u00C0-\u024F{_ASEAN_CHARS}\-'.]+(?:\s+[{_ASEAN_CHARS}][a-zA-Z\u00C0-\u024F{_ASEAN_CHARS}\-'.]+)*)",
    re.UNICODE,
)

_RE_CASES_IN_LOCATION_EN = re.compile(
    rf"(\d[\d.,]*)\s+cases?(?:\s+[a-zA-Z\u00C0-\u024F{_ASEAN_CHARS}]+){{0,3}}\s+in\s+"
    rf"([{_ASEAN_CHARS}][a-zA-Z\u00C0-\u024F{_ASEAN_CHARS}\-'.]+(?:\s+[{_ASEAN_CHARS}][a-zA-Z\u00C0-\u024F{_ASEAN_CHARS}\-'.]+)*)",
    re.UNICODE,
)

# Pattern family 3b: List continuation ", N [kasus] di Lokasi" / "and N [cases] in Location"
_RE_CASES_LIST_CONT = re.compile(
    rf"(?:,|dan|and)\s+(\d[\d.,]*)\s+(?:kasus\s+|cases?\s+)?(?:di|in)\s+"
    rf"([{_ASEAN_CHARS}][a-zA-Z\u00C0-\u024F{_ASEAN_CHARS}\-'.]+(?:\s+[{_ASEAN_CHARS}][a-zA-Z\u00C0-\u024F{_ASEAN_CHARS}\-'.]+)*)",
    re.UNICODE,
)

# Death patterns
_RE_DEATHS_LOCATION_ID = re.compile(
    rf"(\d[\d.,]*)\s+(?:kematian|meninggal(?:\s+dunia)?|korban\s+jiwa)\s+(?:di|pada)\s+"
    rf"([{_ASEAN_CHARS}][\w\s\-',]{{1,50}})",
    re.UNICODE,
)

_RE_DEATHS_LOCATION_EN = re.compile(
    rf"(\d[\d.,]*)\s+(?:deaths?|fatalities)\s+in\s+"
    rf"([{_ASEAN_CHARS}][\w\s\-',]{{1,50}})",
    re.UNICODE,
)

_RE_LOCATION_DEATHS_PARENS = re.compile(
    rf"([{_ASEAN_CHARS}][\w\s\-'.{_ASEAN_CHARS}]{{1,50}}?)"
    r"\s*\(\s*"
    r"(\d[\d.,]*)"
    r"\s+(?:kematian|deaths?|fatalities)\s*\)",
    re.UNICODE,
)

# Pattern family 4: "Lokasi tercatat/mencatat N kasus (dan N kematian)"
_RE_LOC_VERB_CASES_ID = re.compile(
    rf"(?:(?:di|in|pada)\s+)?([{_ASEAN_CHARS}][a-zA-Z\u00C0-\u024F{_ASEAN_CHARS}\s-]{{1,30}}?)\s+"
    r"(?:tercatat|mencatat|melaporkan|ditemukan|ada|terdapat|mengonfirmasi|konfirmasi)\s+"
    r"(?:sebanyak\s+)?(\d[\d.,]*)\s+kasus"
    r"(?:(?:\s+dan|,)\s+(\d[\d.,]*)\s+(?:kematian|meninggal|korban\s+jiwa))?",
    re.UNICODE | re.IGNORECASE,
)

_RE_LOC_VERB_CASES_EN = re.compile(
    rf"(?:(?:in|at)\s+)?([{_ASEAN_CHARS}][a-zA-Z\u00C0-\u024F{_ASEAN_CHARS}\s-]{{1,30}}?)\s+"
    r"(?:recorded|reports?|reported|confirmed|logged|found)\s+"
    r"(?:a\s+total\s+of\s+)?(\d[\d.,]*)\s+cases?"
    r"(?:(?:\s+and|,)\s+(\d[\d.,]*)\s+(?:deaths?|fatalities))?",
    re.UNICODE | re.IGNORECASE,
)


def _parse_count_value(raw: str) -> int:
    """Compatibility wrapper around the shared surveillance count parser."""

    return extractors.parse_surveillance_count(raw) or 0


def _clean_location_name(raw: str) -> str:
    """Strip trailing & leading conjunctions and whitespace from a captured location name."""
    name = raw.strip()
    if ":" in name:
        name = name.rsplit(":", 1)[-1].strip()
    if ";" in name:
        name = name.rsplit(";", 1)[-1].strip()
    name = re.sub(
        r"^(?:sementara(?:\s+itu)?|sedangkan|adapun|dan|and|meanwhile|while|serta|in|di|pada|dari|from|at|wilayah|provinsi|daerah)\s+",
        "", name, flags=re.IGNORECASE,
    )
    name = re.sub(
        r"\s+(?:has|have|had|dan|and|serta|with|atau|or|pada|di|in|from|dari)$",
        "", name, flags=re.IGNORECASE,
    )
    return name.strip(" ,;:.-()")


def _validate_location(name: str) -> Optional[str]:
    """Validate against the loaded gazetteer; return canonical name or None.

    Uses folded_location_index() for O(1) exact/suffix lookups. The previous
    O(aliases × gazetteer) loops that called _fold_location_text per row were
    the interactive compose hotspot (~500k fold calls / ~22s).
    """
    if not name:
        return None
    from .extractors import (
        is_usable_place_name,
        _fold_location_text,
        folded_location_index,
    )
    if not is_usable_place_name(name):
        return None
    index = folded_location_index()
    folded = _fold_location_text(name)
    hit = index.get(folded)
    if hit:
        return hit

    # Suffix walk only (e.g. "wilayah Jakarta" -> "Jakarta"); each probe is O(1).
    words = name.split()
    if len(words) > 1:
        for i in range(1, len(words)):
            sub_folded = _fold_location_text(" ".join(words[i:]))
            hit = index.get(sub_folded)
            if hit:
                return hit

    # Catastrophic partial scan (gf in folded / folded in gf over all
    # LOCATION_COORDS) intentionally removed — it dominated compose time.
    return None


def _resolve_country(location: str) -> Optional[str]:
    """Resolve a location name to its country."""
    if not location:
        return None
    from .extractors import resolve_location_hierarchy
    hier = resolve_location_hierarchy(location)
    if hier.get("country"):
        return hier["country"]
    return None


def _resolve_coords(location: str) -> tuple:
    """Get lat/lon from gazetteer."""
    return config.LOCATION_COORDS.get(location, (None, None))


def _regex_extract_location_cases(text: str) -> list[dict[str, Any]]:
    """Layer 1: Extract (location, case_count) pairs via regex patterns."""
    text = extractors.normalize_spaced_thousands(text or "")
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

    for pattern in [_RE_CASES_DI_LOCATION_ID, _RE_CASES_IN_LOCATION_EN, _RE_CASES_LIST_CONT]:
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

        # Create regional events ONLY when metrics are truly bound to that region
        if cases <= 0 and deaths <= 0:
            continue
        validated.append({
            "location": canonical,
            "disease": str(item.get("disease") or "").strip(),
            "cases": max(0, cases),
            "deaths": max(0, deaths),
            "evidence": str(item.get("evidence") or "").strip()[:500],
        })

    return validated



# ---------------------------------------------------------------------------
# WHO Situation Update country headings (WPR dengue bulletins, etc.)
# ---------------------------------------------------------------------------

# Standalone line headings used in WHO WPR dengue Situation Updates.
# Longer forms first so "Lao People's Democratic Republic" wins over "Laos".
_WHO_COUNTRY_HEADING_NAMES: tuple[str, ...] = (
    "Lao People's Democratic Republic",
    "Lao PDR",
    "Viet Nam",
    "French Polynesia",
    "Papua New Guinea",
    "New Caledonia",
    "Solomon Islands",
    "Marshall Islands",
    "Federated States of Micronesia",
    "Timor-Leste",
    "Philippines",
    "Cambodia",
    "Indonesia",
    "Malaysia",
    "Singapore",
    "Thailand",
    "Myanmar",
    "Vietnam",
    "Australia",
    "Brunei",
    "China",
    "Laos",
    "Fiji",
    "Guam",
)

_RE_WHO_UPDATE_FOOTER = re.compile(
    r"(?im)^Dengue Situation Update\s+\d+\s*[│|/|-].*$"
)
_RE_WHO_PAGE_MARKER = re.compile(r"(?im)^---PAGE\s+\d+---\s*")
_RE_WHO_REGION_LABEL = re.compile(
    r"(?im)^(?:Northern Hemisphere|Southern Hemisphere|Pacific Islands?(?: Countries)?)\s*$"
)


def _who_country_heading_regex() -> re.Pattern:
    alternates = "|".join(
        re.escape(name) for name in sorted(_WHO_COUNTRY_HEADING_NAMES, key=len, reverse=True)
    )
    # Optional parenthetical such as "(Monthly update)".
    return re.compile(
        rf"(?m)^(?P<country>{alternates})(?:\s*\([^)\n]{{0,60}}\))?\s*$"
    )


def _canonical_who_country(raw: str) -> Optional[str]:
    mapped = extractors.normalize_country(raw)
    if not mapped:
        return None
    # Collapse WHO long-form Lao heading onto the ASEAN canonical.
    if mapped.casefold() in {
        "lao people's democratic republic".casefold(),
        "lao pdr",
    }:
        return "Laos"
    if mapped.casefold() == "viet nam":
        return "Vietnam"
    return mapped


def _split_who_country_sections(text: str) -> list[tuple[str, str]]:
    """Split a WHO multi-country bulletin into (country, body) sections.

    Country names appear as standalone headings; metric sentences often omit
    repeating the country. Page footers must not restart the parse at Cambodia.
    """
    source = extractors.normalize_spaced_thousands(text or "")
    if not source.strip():
        return []
    # PDF text often uses curly apostrophes in "Lao People's ...".
    source = (
        source.replace("\u2019", "'")
        .replace("\u2018", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
    )
    source = _RE_WHO_UPDATE_FOOTER.sub("", source)
    source = _RE_WHO_PAGE_MARKER.sub("", source)
    source = _RE_WHO_REGION_LABEL.sub("", source)

    heading = _who_country_heading_regex()
    matches = list(heading.finditer(source))
    if len(matches) < 2:
        return []

    sections: list[tuple[str, str]] = []
    for index, match in enumerate(matches):
        country = _canonical_who_country(match.group("country"))
        if not country:
            continue
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(source)
        body = source[start:end].strip()
        if not body:
            continue
        sections.append((country, body))
    return sections


def _who_section_case_death_counts(body: str, disease: str) -> tuple[int, int]:
    """Prefer cumulative / 'a total of' totals inside one WHO country section."""
    source = extractors.normalize_spaced_thousands(body or "")
    if not source.strip():
        return 0, 0

    case_patterns = (
        (60, re.compile(
            r"(?i)\bbringing\s+the\s+cumulative\s+total\b.{0,100}?\bto\s+"
            r"(?P<cases>\d{1,3}(?:,\d{3})+|\d+)\s+cases?\b"
            r"(?:\s+and\s+(?P<deaths>\d{1,3}(?:,\d{3})+|\d+)\s+deaths?)?",
        )),
        (55, re.compile(
            r"(?i)\bcumulativ(?:e|ely)\b.{0,80}?\b(?:a\s+total\s+of\s+|total\s+of\s+)?"
            r"(?P<cases>\d{1,3}(?:,\d{3})+|\d+)\s+cases?\b"
            r"(?:.{0,40}?\b(?:and|,)\s+(?P<deaths>\d{1,3}(?:,\d{3})+|\d+)\s+deaths?)?",
        )),
        (50, re.compile(
            r"(?i)\ba\s+total\s+of\s+(?P<cases>\d{1,3}(?:,\d{3})+|\d+)\s+"
            r"(?:new\s+)?(?:dengue\s+)?cases?\b"
            r"(?:.{0,60}?\bincluding\s+(?P<deaths>\d{1,3}(?:,\d{3})+|\d+)\s+deaths?)?",
        )),
        (25, re.compile(
            r"(?i)\b(?P<cases>\d{1,3}(?:,\d{3})+|\d+)\s+(?:new\s+)?(?:dengue\s+)?cases?\b"
            r"(?:.{0,60}?\bincluding\s+(?P<deaths>\d{1,3}(?:,\d{3})+|\d+)\s+deaths?)?",
        )),
    )

    best_cases: tuple[int, int] | None = None  # (priority, value)
    best_deaths: tuple[int, int] | None = None
    for priority, pattern in case_patterns:
        for match in pattern.finditer(source):
            before = source[max(0, match.start("cases") - 24): match.start("cases")]
            if re.search(r"(?i)\b(?:from|n\s*=)\s*$", before):
                continue
            parsed_cases = extractors.parse_surveillance_count(match.group("cases"), match.group(0))
            if parsed_cases is None or parsed_cases <= 0:
                continue
            if best_cases is None or priority > best_cases[0] or (
                priority == best_cases[0] and parsed_cases > best_cases[1]
            ):
                best_cases = (priority, int(parsed_cases))
            raw_deaths = match.groupdict().get("deaths")
            if raw_deaths:
                parsed_deaths = extractors.parse_surveillance_count(raw_deaths, match.group(0))
                if parsed_deaths is not None and parsed_deaths >= 0:
                    if best_deaths is None or priority > best_deaths[0]:
                        best_deaths = (priority, int(parsed_deaths))

    if best_deaths is None:
        death_match = re.search(
            r"(?i)\b(?:including|and)\s+(?P<deaths>\d{1,3}(?:,\d{3})+|\d+)\s+deaths?\b",
            source,
        )
        if death_match:
            parsed_deaths = extractors.parse_surveillance_count(
                death_match.group("deaths"), death_match.group(0)
            )
            if parsed_deaths is not None:
                best_deaths = (10, int(parsed_deaths))

    cases = best_cases[1] if best_cases else extractors.extract_case_count(source, disease=disease)
    deaths = best_deaths[1] if best_deaths else extractors.extract_death_count(source, disease=disease)
    return max(0, int(cases or 0)), max(0, int(deaths or 0))


def _extract_who_country_section_events(
    text: str,
    primary_disease: str,
) -> list[dict[str, Any]]:
    """One event per WHO country section with an explicit case/death total."""
    sections = _split_who_country_sections(text)
    if len(sections) < MULTI_EVENT_MIN_PAIRS:
        return []

    disease = primary_disease or "Dengue"
    events: list[dict[str, Any]] = []
    for country, body in sections:
        cases, deaths = _who_section_case_death_counts(body, disease)
        if cases <= 0 and deaths <= 0:
            continue
        lat, lon = _resolve_coords(country)
        # Prefer a short evidence window near the first case/death mention.
        evidence_match = re.search(
            r"(?i).{0,40}\b(?:cases?|kasus|deaths?|kematian)\b.{0,80}",
            body,
        )
        evidence = (evidence_match.group(0).strip() if evidence_match else body[:180]).strip()
        events.append({
            "disease": disease,
            "location_name": country,
            "country": country,
            "latitude": lat,
            "longitude": lon,
            "case_count": max(0, int(cases or 0)),
            "death_count": max(0, int(deaths or 0)),
            "evidence": evidence[:500],
        })
    return events


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
    primary_country: Optional[str] = None,
    linker: Any = None,
    relations: Optional[list[Any]] = None,
    atomic_events: Optional[list[dict[str, Any]]] = None,
    published_at: Optional[str] = None,
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

    # WHO multi-country Situation Updates: country headings delimit sections.
    # Handle before single-country atomic/legacy paths so page-1 Cambodia does
    # not swallow China/Indonesia/etc. from later pages.
    who_events = _extract_who_country_section_events(text, primary_disease)
    if len(who_events) >= MULTI_EVENT_MIN_PAIRS:
        return _deduplicate_events(who_events)

    # The canonical path is evidence-first: metrics are linked to a disease
    # and location in the same local context before an event is created.  The
    # legacy parsers below remain as a bounded fallback for formats that the
    # relation layer cannot yet parse, but they are never allowed to split a
    # document that the canonical layer already judged to be one event.
    atomic_evidence_found = False
    if atomic_events is None:
        try:
            from .intelligence import build_atomic_events

            atomic_events = build_atomic_events(
                text,
                disease_labels=diseases_extracted,
                primary_disease=primary_disease,
                published_at=published_at,
                linker=linker,
                relations=relations,
            )
        except Exception as exc:
            logger.warning("Atomic event extraction unavailable; using legacy parser: %s", exc)
            atomic_events = []

    if atomic_events:
        if len(atomic_events) >= MULTI_EVENT_MIN_PAIRS:
            return _deduplicate_events(atomic_events)
        # A deterministic relation exists, but it is not enough to prove
        # multiple events. Legacy deterministic parsers may still recover
        # a second explicit location, but the LLM must not split it.
        atomic_evidence_found = True

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
        and not atomic_evidence_found
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
    primary_country: Optional[str] = None,
) -> dict[str, Any]:
    from . import extractors as ext

    loc = location or ""
    hier = ext.resolve_event_location_hierarchy(loc, country_hint=primary_country) if loc else {}
    country = hier.get("country") or primary_country or (_resolve_country(loc) if loc else None)
    admin1 = hier.get("admin1_name")
    admin2 = hier.get("admin2_name")
    iso3 = hier.get("country_iso3") or (config.COUNTRY_TO_ISO3.get(country.casefold()) if country else None)
    lat = hier.get("latitude") or (_resolve_coords(loc)[0] if loc else None)
    lon = hier.get("longitude") or (_resolve_coords(loc)[1] if loc else None)
    canonical_loc = hier.get("canonical_name") or loc
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
    if not ext.has_explicit_death_count(text, disease=disease):
        # Extra diseases must not inherit the article-wide death count.
        per_deaths = 0
    return {
        "disease": disease,
        "location_name": canonical_loc,
        "country": country,
        "admin1": admin1,
        "admin2": admin2,
        "country_iso3": iso3,
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
    primary_country: Optional[str] = None,
    linker: Any = None,
    relations: Optional[list[Any]] = None,
    published_at: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Location-scoped counts plus per-disease facts for one article.

    Location pairs stay authoritative for Number of Cases/Deaths. Extra
    outbreak-relevant diseases are persisted as their own rows so the
    collapsed Disease column can show ``Influenza; RSV`` instead of the
    primary label alone. NCD-only articles must not reach this helper.
    """
    atomic_events: Optional[list[dict[str, Any]]] = None
    atomic_started = time.perf_counter()
    try:
        from .intelligence import build_atomic_events

        atomic_events = build_atomic_events(
            text,
            disease_labels=diseases_extracted,
            primary_disease=primary_disease,
            published_at=published_at,
            linker=linker,
            relations=relations,
        )
    except Exception as exc:
        logger.warning("Atomic event extraction unavailable before multi-event path: %s", exc)

    logger.info(
        "multi_event_function_timings build_atomic_events_seconds=%.3f events=%s",
        time.perf_counter() - atomic_started,
        len(atomic_events or []),
    )
    extract_started = time.perf_counter()
    events = extract_multi_events(
        text=text,
        primary_disease=primary_disease,
        primary_location=primary_location,
        diseases_extracted=diseases_extracted,
        locations=locations,
        case_count=case_count,
        death_count=death_count,
        primary_country=primary_country,
        linker=linker,
        relations=relations,
        atomic_events=atomic_events,
        published_at=published_at,
    )
    logger.info(
        "multi_event_function_timings extract_multi_events_seconds=%.3f events=%s",
        time.perf_counter() - extract_started,
        len(events),
    )

    # Keep one evidence-backed atomic event as the canonical representation;
    # the old extractor intentionally returned [] for single-event documents.
    if not events and atomic_events is not None and len(atomic_events) == 1:
        events = atomic_events
    # A disease mention without an attributed metric is context, not a new
    # epidemiological event.  Additional events must come from the evidence
    # first relation layer above, never from the length of `diseases_extracted`.
    from . import extractors as ext

    # Create regional events ONLY when metrics are truly bound to that region.
    # No empty 1.1 events from bare disease/location mentions.
    events = [
        evt for evt in events
        if (
            (evt.get("case_count") or 0) > 0
            or (evt.get("death_count") or 0) > 0
            or evt.get("metric_type") == "negative_surveillance"
            or (evt.get("country") and str(evt.get("location_name") or "").casefold() == str(evt.get("country")).casefold())
        )
    ]

    # UNKNOWN child may inherit parent disease ONLY if single relation + has metric.
    candidates = list(dict.fromkeys(
        ext.canonical_disease_name(d)
        for d in (diseases_extracted or ([primary_disease] if primary_disease else []))
        if d and ext.canonical_disease_name(d).upper() != "UNKNOWN"
    ))
    if len(candidates) == 1:
        inherited_disease = candidates[0]
        for evt in events:
            if (
                ext.canonical_disease_name(evt.get("disease") or "UNKNOWN").upper() == "UNKNOWN"
                and ((evt.get("case_count") or 0) > 0 or (evt.get("death_count") or 0) > 0)
            ):
                evt["disease"] = inherited_disease
                evt["needs_review"] = True
                flags = list(evt.get("validation_flags") or [])
                if "disease_inherited_from_single_relation" not in flags:
                    flags.append("disease_inherited_from_single_relation")
                evt["validation_flags"] = flags

    if len(events) == 1 and primary_disease:
        event_disease = str(events[0].get("disease") or "")
        if event_disease and ext.canonical_disease_name(event_disease).casefold() == ext.canonical_disease_name(primary_disease).casefold():
            # Keep the caller's established display label for a single event;
            # normalization still governs identity comparisons and attribution.
            events[0]["disease"] = primary_disease
    events = _deduplicate_events(events)

    # Cross-disease count cloning guard:
    # If multiple sub-events in the same country share identical non-zero cases and deaths,
    # ensure counts only remain with the disease actually attested in that evidence sentence.
    if len(events) >= 2:
        metric_groups: dict[tuple, list[dict[str, Any]]] = {}
        for evt in events:
            c = int(evt.get("case_count") or 0)
            d = int(evt.get("death_count") or 0)
            country = str(evt.get("country") or "").casefold()
            if c > 0 or d > 0:
                key = (c, d, country)
                metric_groups.setdefault(key, []).append(evt)
        for key, group in metric_groups.items():
            if len(group) >= 2:
                # Multiple sub-events claim identical metric numbers
                for evt in group:
                    disease_name = evt.get("disease") or ""
                    evidence_text = evt.get("evidence") or ""
                    if disease_name and evidence_text:
                        if not ext.disease_has_textual_evidence(disease_name, evidence_text):
                            evt["case_count"] = 0
                            evt["death_count"] = 0
                            evt["metric_type"] = "mention"
        # Discard phantom secondary rows that were stripped of cloned counts
        events = [
            evt for evt in events
            if (int(evt.get("case_count") or 0) > 0)
            or (int(evt.get("death_count") or 0) > 0)
            or evt.get("metric_type") == "negative_surveillance"
            or (primary_disease and str(evt.get("disease") or "").casefold() == str(primary_disease).casefold())
        ]
    from .epidemiology import (
        classify_epistemic_status,
        qualify_metric_type,
        extract_event_period,
        find_evidence_offsets,
        validate_surveillance_facts,
    )

    doc_period = extract_event_period(text, published_at=published_at)
    epistemic_cache = {}
    metric_cache = {}
    period_cache = {}
    offset_cache = {}
    validation_cache = {}
    hierarchy_cache = {}
    for evt in events:
        loc = evt.get("location_name")
        hierarchy_key = (str(loc or ""), str(evt.get("country") or ""))
        if loc:
            hier = hierarchy_cache.get(hierarchy_key)
            if hier is None:
                hier = ext.resolve_event_location_hierarchy(loc, country_hint=evt.get("country"))
                hierarchy_cache[hierarchy_key] = hier
        else:
            hier = {}
        if hier.get("canonical_name"):
            evt["location_name"] = hier["canonical_name"]
        evt["admin1"] = evt.get("admin1") or hier.get("admin1_name")
        evt["admin2"] = evt.get("admin2") or hier.get("admin2_name")
        evt["country_iso3"] = evt.get("country_iso3") or hier.get("country_iso3")
        if not evt.get("country") and hier.get("country"):
            evt["country"] = hier.get("country")
        if not evt.get("latitude") and hier.get("latitude"):
            evt["latitude"] = hier.get("latitude")
            evt["longitude"] = hier.get("longitude")
        if hier.get("country_conflict"):
            evt["country"] = hier.get("country") or evt.get("country")
            evt["admin1"] = None
            evt["admin2"] = None
            evt["country_iso3"] = hier.get("country_iso3")
            evt["latitude"] = hier.get("latitude")
            evt["longitude"] = hier.get("longitude")
            evt["needs_review"] = True
            flags = list(evt.get("validation_flags") or [])
            if "location_country_conflict" not in flags:
                flags.append("location_country_conflict")
            evt["validation_flags"] = flags
            provenance = dict(evt.get("provenance") or {})
            provenance["location_conflict"] = {
                "original_location_name": hier.get("original_location_name") or loc,
                "original_canonical_name": hier.get("original_canonical_name"),
                "original_country": hier.get("original_country"),
                "resolved_country": hier.get("country"),
            }
            evt["provenance"] = provenance

        # Epistemic status qualification per sub-event
        evt_evidence = evt.get("evidence") or ""
        epistemic_key = (text, str(evt.get("disease") or ""), evt_evidence)
        evt_epistemic = epistemic_cache.get(epistemic_key)
        if evt_epistemic is None:
            evt_epistemic = classify_epistemic_status(text, disease=evt.get("disease"), evidence=evt_evidence)
            epistemic_cache[epistemic_key] = evt_epistemic
        evt["epistemic_status"] = evt_epistemic

        # Metric qualification per sub-event
        if evt_epistemic == "negative_surveillance":
            m_type, m_unit = "negative_surveillance", "status"
        else:
            metric_key = (evt_evidence or text, doc_period.get("period_type", "unknown"), bool((evt.get("case_count") or 0) > 0), bool((evt.get("death_count") or 0) > 0), evt_epistemic)
            cached_metric = metric_cache.get(metric_key)
            if cached_metric is None:
                cached_metric = qualify_metric_type(evt_evidence or text, default_period=doc_period.get("period_type", "unknown"), has_cases=bool((evt.get("case_count") or 0) > 0), has_deaths=bool((evt.get("death_count") or 0) > 0))
                metric_cache[metric_key] = cached_metric
            m_type, m_unit = cached_metric
        evt["metric_type"] = m_type
        evt["unit"] = m_unit

        # Temporal interval per sub-event
        evt_period = period_cache.get(evt_evidence)
        if evt_period is None:
            evt_period = (
                extract_event_period(evt_evidence, published_at=published_at)
                if evt_evidence else {}
            )
            period_cache[evt_evidence] = evt_period
        # Atomic events already resolved relative phrases from published_at.
        # Do not let a document-wide year or "this year" overwrite that date.
        if not evt.get("event_date_start"):
            evt["event_date_start"] = evt_period.get("event_date_start") or doc_period.get("event_date_start")
        if not evt.get("event_date_end"):
            evt["event_date_end"] = evt_period.get("event_date_end") or doc_period.get("event_date_end")
        if not evt.get("temporal_context"):
            evt["temporal_context"] = (
                evt_period.get("period_type") or doc_period.get("period_type") or "current"
            )

        # Evidence offsets
        cached_offsets = offset_cache.get(evt_evidence)
        if cached_offsets is None:
            cached_offsets = find_evidence_offsets(text, evt_evidence)
            offset_cache[evt_evidence] = cached_offsets
        s_off, e_off = cached_offsets
        evt["evidence_offset_start"] = s_off
        evt["evidence_offset_end"] = e_off

        # Plausibility validation per sub-event
        validation_key = (text, str(evt.get("disease", "")), str(evt.get("location_name") or ""), int(evt.get("case_count", 0) or 0), int(evt.get("death_count", 0) or 0), evt_epistemic, doc_period.get("period_type", "unknown"))
        cached_validation = validation_cache.get(validation_key)
        if cached_validation is None:
            cached_validation = validate_surveillance_facts(text=text, disease=evt.get("disease", ""), location=evt.get("location_name"), case_count=evt.get("case_count", 0), death_count=evt.get("death_count", 0), epistemic_status=evt_epistemic, count_period_type=doc_period.get("period_type", "unknown"))
            validation_cache[validation_key] = cached_validation
        _, sub_flags = cached_validation
        evt["validation_flags"] = list(sub_flags)
        evt.setdefault("confidence", 0.90)

    events = _fold_global_background_event(
        text,
        _collapse_same_country_events(events, text=text, disease=primary_disease),
        relations=relations,
        case_count=case_count,
        primary_disease=primary_disease,
    )
    if events:
        return events

    # Canonical single-event fallback: emit exactly 1 structured event
    # representing the primary disease and location fact
    if primary_disease and primary_disease.upper() not in {"UNKNOWN", "NEGATIVE - NOT HEALTH RELATED"}:
        hier = ext.resolve_location_hierarchy(primary_location, country_hint=None) if primary_location else {}
        lat = hier.get("latitude") or (_resolve_coords(primary_location or "")[0] if primary_location else None)
        lon = hier.get("longitude") or (_resolve_coords(primary_location or "")[1] if primary_location else None)
        country = hier.get("country") or (_resolve_country(primary_location or "") if primary_location else None)
        m_type, m_unit = qualify_metric_type(
            text,
            default_period=doc_period.get("period_type", "unknown"),
            has_cases=bool(case_count > 0),
            has_deaths=bool(death_count > 0),
        )
        doc_epistemic = classify_epistemic_status(text, disease=primary_disease)

        # Locate single-event evidence sentence
        single_evidence = ""
        evidence_candidates: list[tuple[int, int, str]] = []
        for sentence_index, sentence in enumerate(re.split(r"(?<=[.!?。！？])\s+|\n+", text)):
            clean_s = sentence.strip()
            disease_evidence = (
                primary_disease
                and ext.disease_has_textual_evidence(primary_disease, clean_s)
            )
            if not disease_evidence:
                disease_evidence = bool(ext.extract_diseases(clean_s))
            if disease_evidence and ext.has_explicit_case_count(clean_s, disease=primary_disease) and re.search(
                r"\b(?:kasus|cases?|infeksi|infections?|pasien|patients?|kematian|deaths?)\b",
                clean_s,
                re.IGNORECASE,
            ):
                approximate = bool(re.search(
                    r"(?:-?an\b|\blebih\b|\bsekitar\b|\bhampir\b|\babout\b|\baround\b|\bnearly\b|\bmore than\b|\bover\b)",
                    clean_s,
                    re.IGNORECASE,
                ))
                evidence_candidates.append((0 if approximate else 1, -sentence_index, clean_s))
        if evidence_candidates:
            single_evidence = max(evidence_candidates)[2]
        if not single_evidence:
            for sentence in re.split(r"(?<=[.!?。！？])\s+|\n+", text):
                clean_s = sentence.strip()
                disease_evidence = (
                    primary_disease
                    and ext.disease_has_textual_evidence(primary_disease, clean_s)
                )
                if not disease_evidence:
                    disease_evidence = bool(ext.extract_diseases(clean_s))
                if disease_evidence and (
                    ext.has_explicit_case_count(clean_s, disease=primary_disease)
                    or ext.has_explicit_death_count(clean_s, disease=primary_disease)
                ):
                    single_evidence = clean_s
                    break
        if ext.article_states_zero_cases(text):
            single_evidence = next(
                (
                    " ".join(sentence.split())
                    for sentence in re.split(r"(?<=[.!?。！？])\s+|\n+", text)
                    if ext.article_states_zero_cases(sentence)
                ),
                single_evidence,
            )
            doc_epistemic = "negative_surveillance"
        s_off, e_off = find_evidence_offsets(text, single_evidence)
        _, sub_flags = validate_surveillance_facts(
            text=text,
            disease=primary_disease,
            location=hier.get("canonical_name") or primary_location,
            case_count=case_count,
            death_count=death_count,
            epistemic_status=doc_epistemic,
            count_period_type=doc_period.get("period_type", "unknown"),
        )

        validation_flags = list(sub_flags)
        if doc_epistemic == "negative_surveillance" and "negative_surveillance" not in validation_flags:
            validation_flags.append("negative_surveillance")

        return _fold_global_background_event(
            text,
            [{
                "disease": primary_disease,
                "location_name": hier.get("canonical_name") or primary_location or "",
                "country": country,
                "admin1": hier.get("admin1_name"),
                "admin2": hier.get("admin2_name"),
                "country_iso3": hier.get("country_iso3"),
                "latitude": lat,
                "longitude": lon,
                "case_count": max(0, case_count),
                "death_count": max(0, death_count),
                "metric_type": "negative_surveillance" if doc_epistemic == "negative_surveillance" else m_type,
                "unit": "status" if doc_epistemic == "negative_surveillance" else m_unit,
                "evidence": single_evidence,
                "evidence_offset_start": s_off,
                "evidence_offset_end": e_off,
                "event_date_start": doc_period.get("event_date_start"),
                "event_date_end": doc_period.get("event_date_end"),
                "epistemic_status": doc_epistemic,
                "validation_flags": validation_flags,
                "relations": ([{"type": "negative_surveillance", "evidence": single_evidence}] if doc_epistemic == "negative_surveillance" else []),
                "needs_review": False if doc_epistemic == "negative_surveillance" else True,
                "confidence": 0.90,
            }],
            relations=relations,
            case_count=case_count,
            primary_disease=primary_disease,
        )
    logger.info(
        "multi_event_function_timings compose_structured_events_seconds=%.3f events=%s",
        time.perf_counter() - extract_started,
        len(events),
    )
    return events


def _event_country_context(event: dict[str, Any]) -> tuple[Optional[str], dict[str, Any]]:
    """Resolve country and hierarchy without trusting a publisher location."""
    from . import extractors as ext

    location = str(event.get("location_name") or "").strip()
    country_hint = str(event.get("country") or "").strip() or None
    hierarchy = ext.resolve_event_location_hierarchy(location, country_hint=country_hint) if location else {}
    country = hierarchy.get("country") or country_hint
    if country:
        country = ext.normalize_country(country)
    return country, hierarchy


def _country_centroid(country: Optional[str], hierarchy: dict[str, Any]) -> tuple[Optional[float], Optional[float]]:
    """Use the country centroid only when an event is intentionally country-level."""
    from . import extractors as ext

    if hierarchy.get("latitude") is not None and hierarchy.get("longitude") is not None:
        return hierarchy["latitude"], hierarchy["longitude"]
    if not country:
        return None, None
    country_hierarchy = ext.resolve_location_hierarchy(country, country_hint=country)
    if country_hierarchy.get("latitude") is not None and country_hierarchy.get("longitude") is not None:
        return country_hierarchy["latitude"], country_hierarchy["longitude"]
    lat, lon, _, _ = ext.geocode_place(country, country)
    return lat, lon


def _count_is_global_average(text: str, value: int) -> bool:
    digits = re.sub(r"\D", "", str(value))
    if not digits:
        return False
    for match in re.finditer(r"\d[\d.,]*", text or ""):
        if re.sub(r"\D", "", match.group(0)) != digits:
            continue
        if extractors.metric_source_scope(text, match.start(), match.end()) == "global_average":
            return True
    return False


def _global_metric_values(relations: Optional[list[Any]], text: str, case_count: int) -> list[int]:
    values: list[int] = []
    for relation in relations or []:
        if getattr(relation, "source_scope", "") != "global_average":
            continue
        value = int(getattr(relation, "value", 0) or getattr(relation, "cases", 0) or 0)
        if value > 0:
            values.append(value)
    if int(case_count or 0) > 0 and _count_is_global_average(text, int(case_count)):
        values.append(int(case_count))
    return list(dict.fromkeys(values))


_DISEASE_ANAPHORA = re.compile(
    r"\b(?:the\s+(?:disease|virus|outbreak)|this\s+(?:disease|virus|outbreak)|"
    r"penyakit\s+(?:ini|tersebut)|virus\s+(?:ini|tersebut)|wabah\s+(?:ini|tersebut)|"
    r"bệnh\s+này|dịch\s+(?:này|bệnh))\b",
    re.IGNORECASE,
)
_OUTBREAK_PRESENCE = re.compile(
    r"\b(?:cases?|kasus|kes|kaso|wabah|outbreak|deaths?|kematian|"
    r"present|melanda|beredar|tercatat|recorded|reported|"
    r"ada\s+di|terdapat|menyebar|spreading|circulating)\b",
    re.IGNORECASE,
)


def _place_aliases(place: str) -> list[str]:
    names = [place]
    for alias, canonical in (getattr(config, "LOCATION_ALIASES", {}) or {}).items():
        if str(canonical).casefold() == place.casefold() and alias not in names:
            names.append(alias)
    return names


def _place_named_in(sentence: str, place: str) -> bool:
    if extractors.country_alias_in_text(place, sentence):
        return True
    for alias in _place_aliases(place):
        if not alias:
            continue
        if re.search(rf"(?<!\w){re.escape(alias)}(?!\w)", sentence or "", re.IGNORECASE):
            return True
    return False


def _place_is_comparative_only(sentence: str, place: str) -> bool:
    return bool(
        re.search(
            rf"\b(?:unlike|compared\s+(?:to|with)|dibandingkan(?:\s+dengan)?|daripada)\s+"
            rf"{re.escape(place)}\b",
            sentence or "",
            re.IGNORECASE,
        )
    )


def _place_tied_to_disease_narrative(text: str, place: str, disease: Optional[str]) -> bool:
    """A named place is listed only when that sentence is about this disease."""

    if not place or not (text or "").strip():
        return False
    from .intelligence import sentence_spans

    prev_has_disease = False
    for _, _, sentence in sentence_spans(text):
        has_disease = bool(disease) and extractors.disease_has_textual_evidence(disease, sentence)
        if _place_named_in(sentence, place) and not _place_is_comparative_only(sentence, place):
            if has_disease:
                return True
            if prev_has_disease and (
                _DISEASE_ANAPHORA.search(sentence) or _OUTBREAK_PRESENCE.search(sentence)
            ):
                return True
        prev_has_disease = has_disease or (
            prev_has_disease and bool(_DISEASE_ANAPHORA.search(sentence))
        )
    return False


def _mentioned_countries_without_counts(
    text: str,
    events: list[dict[str, Any]],
    disease: Optional[str] = None,
) -> list[str]:
    counted = {
        str(item.get("location_name") or item.get("country") or "").casefold()
        for item in events
        if (
            int(item.get("case_count") or 0) > 0
            or int(item.get("death_count") or 0) > 0
        )
        and str(item.get("location_name") or "").casefold()
        != str(extractors.GLOBAL_SCOPE_COUNTRY).casefold()
    }
    named: list[str] = []
    for name in (
        *extractors.extract_mentioned_case_countries(text),
        *extractors.extract_named_countries(text),
        *extractors.extract_all_mentioned_countries(text),
    ):
        if not name or extractors.is_global_scope_country(name):
            continue
        if name.casefold() in counted:
            continue
        if not _place_tied_to_disease_narrative(text, name, disease):
            continue
        if name not in named:
            named.append(name)
    return named


def _fold_global_background_event(
    text: str,
    events: list[dict[str, Any]],
    *,
    relations: Optional[list[Any]] = None,
    case_count: int = 0,
    primary_disease: Optional[str] = None,
) -> list[dict[str, Any]]:
    """A worldwide average plus named countries without counts is one Global event."""

    global_values = _global_metric_values(relations, text, case_count)
    if not global_values:
        return events
    global_value = max(global_values)
    own_local = [
        item for item in events
        if (
            int(item.get("case_count") or 0) > 0
            or int(item.get("death_count") or 0) > 0
        )
        and not extractors.is_global_scope_country(item.get("location_name") or item.get("country"))
        and int(item.get("case_count") or 0) not in global_values
    ]
    if own_local:
        return events
    mentioned = _mentioned_countries_without_counts(text, own_local, disease=primary_disease)
    if not mentioned and not any(
        extractors.is_global_scope_country(item.get("location_name") or item.get("country"))
        for item in events
    ) and events:
        leaked = [
            item for item in events
            if int(item.get("case_count") or 0) in global_values
        ]
        if not leaked:
            return events
    global_event = next(
        (
            item.copy()
            for item in events
            if extractors.is_global_scope_country(item.get("location_name") or item.get("country"))
        ),
        (events[0].copy() if events else {}),
    )
    evidence = next(
        (
            str(getattr(relation, "evidence", "") or "")
            for relation in relations or []
            if getattr(relation, "source_scope", "") == "global_average"
            and getattr(relation, "evidence", None)
        ),
        str(global_event.get("evidence") or ""),
    )
    listed = join_unique_labels(mentioned)
    global_event.update({
        "disease": global_event.get("disease") or primary_disease or "UNKNOWN",
        "location_name": extractors.GLOBAL_SCOPE_COUNTRY,
        "country": listed or extractors.GLOBAL_SCOPE_COUNTRY,
        "admin1": None,
        "admin2": None,
        "country_iso3": None,
        "latitude": None,
        "longitude": None,
        "case_count": global_value,
        "metric_qualifier": "global_average",
        "evidence": evidence or global_event.get("evidence") or "",
    })
    provenance = dict(global_event.get("provenance") or {})
    provenance["source_scope"] = "global_average"
    provenance["mentioned_countries"] = mentioned
    global_event["provenance"] = provenance
    return [global_event]


def _event_time_bucket(event: dict[str, Any]) -> str:
    """Split historical years and relative months from the current report."""
    period = str(event.get("temporal_context") or "current")
    start = str(event.get("event_date_start") or "")
    year = start[:4] if len(start) >= 4 and start[:4].isdigit() else ""
    if period == "historical":
        return f"historical:{year or 'unknown'}"
    if period == "monthly":
        return f"monthly:{start or 'open'}"
    return "current"


def _collapse_same_country_events(
    events: list[dict[str, Any]],
    text: str = "",
    disease: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Fold a national total and its provincial list into one country event.

    Named provinces stay on ``admin1`` as ``Jawa Barat; Jawa Timur``. Distinct
    regional rows without a country total stay separate. Different diseases,
    periods, or countries remain separate events.
    """
    if len(events) < 2:
        return events

    groups: dict[tuple[str, str, str, str], list[dict[str, Any]]] = {}
    unresolved: list[dict[str, Any]] = []
    for event in events:
        country, hierarchy = _event_country_context(event)
        if not country:
            unresolved.append(event)
            continue
        event["country"] = country
        event["country_iso3"] = event.get("country_iso3") or hierarchy.get("country_iso3")
        event.setdefault("admin1", hierarchy.get("admin1_name"))
        event.setdefault("admin2", hierarchy.get("admin2_name"))
        disease = str(event.get("disease") or "UNKNOWN").casefold()
        # A national total and its province list are one event even when
        # qualifier typing marks one row cumulative and the next unknown.
        # Distinct years and relative months stay out of that fold.
        key = (
            disease,
            country.casefold(),
            _event_time_bucket(event),
        )
        groups.setdefault(key, []).append(event)

    collapsed: list[dict[str, Any]] = []
    for group in groups.values():
        distinct_locations = {
            str(item.get("location_name") or "").casefold()
            for item in group
            if item.get("location_name")
        }
        country = str(group[0].get("country") or "").strip()
        country_level = [
            item for item in group
            if str(item.get("location_name") or "").casefold() == country.casefold()
        ]

        # Regional rows without a country total stay atomic. A stated national
        # total plus a provincial/city list is still one country event; the
        # named places go into admin1 as ``Jawa Barat; Jawa Timur``.
        if not country_level:
            collapsed.extend(group)
            continue

        regional = [
            item for item in group
            if str(item.get("location_name") or "").casefold() != country.casefold()
        ]
        best_country = max(
            country_level,
            key=lambda item: (
                int(item.get("case_count") or 0),
                int(item.get("death_count") or 0),
            ),
        )
        country_cases = int(best_country.get("case_count") or 0)
        country_deaths = int(best_country.get("death_count") or 0)

        regional_labels: list[str] = []
        distinct_regional = []
        relation_rows = list(best_country.get("relations") or [])
        metric_rows = list(best_country.get("metrics") or [])
        for item in regional:
            label = str(item.get("location_name") or item.get("admin1") or "").strip()
            cases = int(item.get("case_count") or 0)
            deaths = int(item.get("death_count") or 0)
            leaked_total = bool(country_cases and cases == country_cases and deaths == country_deaths)
            if (
                label
                and label.casefold() != country.casefold()
                and not leaked_total
                and (
                    cases > 0
                    or deaths > 0
                    or _place_tied_to_disease_narrative(text, label, disease)
                )
            ):
                regional_labels.append(label)
            if cases <= 0 and deaths <= 0:
                continue
            if leaked_total:
                continue
            distinct_regional.append(item)
            relation_rows.append({
                "type": "regional_support",
                "location": item.get("location_name"),
                "country": item.get("country") or country,
                "cases": item.get("case_count", 0),
                "deaths": item.get("death_count", 0),
                "evidence": item.get("evidence", ""),
                "evidence_offset_start": item.get("evidence_offset_start"),
                "evidence_offset_end": item.get("evidence_offset_end"),
                "source_text": "original",
            })
            metric_rows.extend(item.get("metrics") or [])
        joined_places = join_unique_labels(regional_labels)
        if (country_cases > 0 or country_deaths > 0) and (joined_places or distinct_regional):
            folded = best_country.copy()
            folded["admin1"] = joined_places or folded.get("admin1")
            folded["admin2"] = None
            folded["relations"] = relation_rows
            folded["metrics"] = metric_rows
            provenance = dict(folded.get("provenance") or {})
            provenance["country_aggregation"] = {
                "source_event_count": len(group),
                "source_locations": sorted(distinct_locations),
                "country_total_preferred": True,
                "folded_places": joined_places,
            }
            folded["provenance"] = provenance
            collapsed.append(folded)
            continue
        if distinct_regional:
            collapsed.extend(distinct_regional)
            continue
        collapsed.append(best_country)

    return [*collapsed, *unresolved]


def _deduplicate_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Deduplicate equivalent events without merging distinct time contexts."""
    merged: dict[tuple, dict[str, Any]] = {}
    for event in events:
        key = (
            (event.get("disease") or "").casefold(),
            (event.get("location_name") or "").casefold(),
            event.get("time_frame") or "",
            event.get("temporal_context") or "",
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
    return _fold_mirror_child_events(list(merged.values()))


def _fold_mirror_child_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Drop child/subnational rows that mirror a parent national metric 1:1.

    When a province/city event carries the same disease + cases + deaths as a
    country-level parent in the same country, it is a parser duplicate of the
    national total rather than a distinct bound subnational observation.
    """
    if len(events) < 2:
        return events

    def _is_country_level(event: dict[str, Any]) -> bool:
        loc = str(event.get("location_name") or "").casefold().strip()
        country = str(event.get("country") or "").casefold().strip()
        if not loc or not country:
            return False
        return loc == country

    parents = [
        event for event in events
        if _is_country_level(event)
        and (int(event.get("case_count") or 0) > 0 or int(event.get("death_count") or 0) > 0)
    ]
    if not parents:
        return events

    kept: list[dict[str, Any]] = []
    for event in events:
        if _is_country_level(event):
            kept.append(event)
            continue
        mirror = False
        for parent in parents:
            if str(event.get("country") or "").casefold() != str(parent.get("country") or "").casefold():
                continue
            if (event.get("disease") or "").casefold() != (parent.get("disease") or "").casefold():
                continue
            if int(event.get("case_count") or 0) != int(parent.get("case_count") or 0):
                continue
            if int(event.get("death_count") or 0) != int(parent.get("death_count") or 0):
                continue
            if (event.get("time_frame") or "") != (parent.get("time_frame") or ""):
                continue
            if (event.get("temporal_context") or "") != (parent.get("temporal_context") or ""):
                continue
            mirror = True
            break
        if not mirror:
            kept.append(event)
    return kept
