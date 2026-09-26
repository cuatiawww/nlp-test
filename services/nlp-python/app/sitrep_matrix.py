"""Front-path scrape of sitrep tables, e-week matrices, and PDF table rows.

This is not the rear-gate corrector. Rules scrape the matrix first; the agent
runs only when AGENT_ENABLED and the deterministic pass is incomplete.
"""

from __future__ import annotations

import logging
import re
from datetime import date
from typing import Any, Optional

from . import config, extractors
from .surveillance_extraction import (
    GazetteerLinker,
    LinkedLocation,
    MetricRelation,
    _country_level_location,
    _number,
    _source_sentence_id,
    _weekly_frame,
)

logger = logging.getLogger(__name__)

_SITREP_MARK = re.compile(
    r"(?:"
    r"\b(?:sitrep|situational\s+report|laporan\s+situasi(?:\s+klb)?)\b|"
    r"\bminggu\s+epidemiologi\b|"
    r"\bepidemiolog(?:ical|i)\s+week\b|"
    r"\be-?weeks?\b|"
    r"\bpenambahan\s+kasus\b|"
    r"\binformasi\s+penambahan\s+kasus\b|"
    r"\bnumber\s+of\s+reported\s+cases\s+by\s+e-?week\b|"
    r"\bcumulative\s+(?:no\.?|number)\s+of\s+cases\b|"
    r"\btambahan\s+kasus\b"
    r")",
    re.IGNORECASE,
)

_TABLEISH = re.compile(
    r"(?:"
    r"\|\s*\S+\s*\||"
    r"(?:^|\n)\s*\d{1,2}[.)]\s+\S+.+\b(?:M\s*\d{1,2}|e-?week)\b|"
    r"\b(?:konfirmasi|kematian|periode\s+penambahan)\b"
    r")",
    re.IGNORECASE,
)

_PERIOD = re.compile(
    r"M\s*(?P<start>\d{1,2})(?:\s*[-–]\s*M?\s*(?P<end>\d{1,2}))?\s+(?P<year>20\d{2})",
    re.IGNORECASE,
)

_EWEEK = re.compile(
    r"E-?week\s*(?P<week>\d{1,2})\s*(?:\(\s*(?P<span>[^)]*?)\s*\))?",
    re.IGNORECASE,
)

_DAY_HEADER = re.compile(
    r"\b(?P<day>\d{1,2})[-/](?P<month>Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b",
    re.IGNORECASE,
)

_CUMULATIVE = re.compile(
    r"cumulative\s+(?:no\.?|number)\s+of\s+cases[^\n]{0,100}?:\s*"
    r"(?P<count>\d{1,3}(?:[.,]\d{3})+|\d{2,7})\b",
    re.IGNORECASE,
)

_MONTH_NUM = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

_DISEASE_SURFACES: tuple[tuple[str, str], ...] = (
    ("avian influenza a(h5n1)", "Avian influenza A(H5N1)"),
    ("avian influenza a(h9n2)", "Avian influenza A(H9N2)"),
    ("avian influenza a (h5n1)", "Avian influenza A(H5N1)"),
    ("avian influenza a (h9n2)", "Avian influenza A(H9N2)"),
    ("penyakit virus west nile", "West Nile virus infection"),
    ("penyakit meningokokus", "Meningitis"),
    ("penyakit ebola", "Ebola disease, virus unspecified"),
    ("virus west nile", "West Nile virus infection"),
    ("demam lassa", "Lassa fever"),
    ("demam kuning", "Yellow fever"),
    ("virus hanta", "Hantavirus infection"),
    ("hantavirus", "Hantavirus infection"),
    ("legionellosis", "Legionellosis"),
    ("listeriosis", "Listeriosis, unspecified"),
    ("covid-19", "COVID-19"),
    ("covid19", "COVID-19"),
    ("mpox", "Mpox"),
    ("ebola", "Ebola disease, virus unspecified"),
    ("polio", "Polio"),
    ("dengue", "Dengue"),
)


def flatten_pdf_tables(tables: Any) -> str:
    """Serialize collector pdf_tables rows as pipe-delimited text."""
    lines: list[str] = []
    for table in tables or []:
        rows = table.get("rows") if isinstance(table, dict) else table
        if not rows:
            continue
        for row in rows:
            cells = [re.sub(r"\s+", " ", str(cell or "")).strip() for cell in (row or [])]
            if any(cells):
                lines.append(" | ".join(cells))
        if lines and lines[-1] != "":
            lines.append("")
    return "\n".join(lines).strip()


def looks_like_sitrep_matrix(
    text: str,
    *,
    source_url: str | None = None,
    source_name: str | None = None,
    document_type: str | None = None,
    pdf_tables: Any = None,
) -> bool:
    if pdf_tables:
        return True
    body = text or ""
    if _SITREP_MARK.search(body) or _SITREP_MARK.search(source_name or ""):
        return True
    url = (source_url or "").casefold()
    if (document_type or "").casefold() == "pdf" or url.endswith(".pdf"):
        return bool(_TABLEISH.search(body) or _SITREP_MARK.search(body))
    return bool(_TABLEISH.search(body) and _PERIOD.search(body))


def extract_sitrep_matrix_relations(
    text: str,
    linker: Optional[GazetteerLinker] = None,
    published_date: Optional[str] = None,
    fallback_location: Optional[LinkedLocation] = None,
    source_country: Optional[str] = None,
) -> list[MetricRelation]:
    source = text or ""
    if not source.strip() or not looks_like_sitrep_matrix(source):
        return []
    linker = linker or GazetteerLinker()
    if fallback_location is None and source_country:
        fallback_location = _country_level_location(source_country, linker, source, source)
    relations: list[MetricRelation] = []
    relations.extend(_kemenkes_increment_rows(source, linker, fallback_location))
    relations.extend(_eweek_matrix_rows(source, linker, published_date, fallback_location))
    relations.extend(_daily_matrix_rows(source, linker, published_date, fallback_location))
    relations.extend(_cumulative_row(source, linker, published_date, fallback_location))
    if config.AGENT_ENABLED and _agent_needed(source, relations):
        relations.extend(
            _agent_sitrep_rows(source, linker, published_date, fallback_location)
        )
    return relations


def drop_stolen_sitrep_counts(
    relations: list[MetricRelation],
    sitrep_relations: list[MetricRelation],
) -> list[MetricRelation]:
    """A combined sitrep increment is not a per-country case total."""
    if not sitrep_relations:
        return relations
    sitrep_ids = {id(item) for item in sitrep_relations}
    stolen_keys: list[tuple[str, int, int, set[str]]] = []
    for item in sitrep_relations:
        countries = set(_named_countries(item.evidence))
        if len(countries) < 2 and not extractors.is_global_scope_country(item.location.country):
            continue
        stolen_keys.append((
            (item.disease or "").casefold(),
            int(item.cases or 0),
            int(item.deaths or 0),
            countries,
        ))
    if not stolen_keys:
        return relations
    kept: list[MetricRelation] = []
    for item in relations:
        if id(item) in sitrep_ids:
            kept.append(item)
            continue
        disease = (item.disease or "").casefold()
        country = extractors.normalize_country(item.location.country)
        drop = False
        for sitrep_disease, cases, deaths, countries in stolen_keys:
            if sitrep_disease and disease and sitrep_disease != disease:
                continue
            same_metric = (
                (cases and item.cases == cases)
                or (deaths and (item.deaths or 0) == deaths)
            )
            if same_metric and country in countries:
                drop = True
                break
        if not drop:
            kept.append(item)
    return kept


def _agent_needed(text: str, relations: list[MetricRelation]) -> bool:
    if not relations:
        return True
    numbered = len(re.findall(r"(?m)^\s*\d{1,2}[.)]\s+\S+", text or ""))
    diseases = {str(item.disease or "").casefold() for item in relations if item.disease}
    return numbered >= 5 and len(diseases) < max(3, numbered // 2)


def _kemenkes_increment_rows(
    source: str,
    linker: GazetteerLinker,
    fallback: Optional[LinkedLocation],
) -> list[MetricRelation]:
    relations: list[MetricRelation] = []
    seen: set[tuple[str, str, str]] = set()
    for surface, canonical in _DISEASE_SURFACES:
        for match in re.finditer(rf"(?<!\w){re.escape(surface)}(?!\w)", source, re.IGNORECASE):
            rest = source[match.end(): match.end() + 420]
            tail = re.match(
                r"\s*(?P<places>.+?)\s+"
                rf"(?P<cases>{_count_token()})\s+(?P<deaths>{_count_token()})\s+"
                r"(?P<period>M\s*\d{1,2}(?:\s*[-–]\s*M?\s*\d{1,2})?\s+20\d{2})",
                rest,
                re.IGNORECASE | re.DOTALL,
            )
            if not tail:
                continue
            places = re.sub(r"\s+", " ", tail.group("places")).strip(" |")
            if _looks_like_next_disease(places):
                continue
            cases = _number(tail.group("cases"))
            deaths = _number(tail.group("deaths"))
            if cases <= 0 and deaths <= 0:
                continue
            period = re.sub(r"\s+", " ", tail.group("period"))
            evidence = re.sub(
                r"\s+", " ",
                source[match.start(): match.end() + tail.end()],
            ).strip(" |")
            disease = _row_disease(match.group(0), canonical)
            frame = _period_frame(period)
            location = _row_location(places, linker, source, evidence, fallback)
            if location is None:
                continue
            key = (disease.casefold(), location.country.casefold(), frame)
            if key in seen:
                continue
            seen.add(key)
            relations.append(MetricRelation(
                location=location,
                cases=cases,
                deaths=deaths,
                time_frame=frame,
                evidence=evidence,
                disease=disease,
                metric_type="cases" if cases else "deaths",
                qualifier="sitrep_weekly",
                value=cases or deaths,
                evidence_offset_start=match.start(),
                evidence_offset_end=match.end() + tail.end(),
                source_sentence_id=_source_sentence_id(source, match.start()),
                country_scope=location.country,
            ))
    return relations


def _eweek_matrix_rows(
    source: str,
    linker: GazetteerLinker,
    published_date: Optional[str],
    fallback: Optional[LinkedLocation],
) -> list[MetricRelation]:
    headers = list(_EWEEK.finditer(source))
    if len(headers) < 2:
        return []
    location = _matrix_home(source, linker, fallback)
    if location is None:
        return []
    disease = _matrix_disease(source) or "Dengue"
    year = _year_hint(source, published_date)
    after = source[headers[-1].end(): headers[-1].end() + 240]
    counts = [
        _number(token)
        for token in re.findall(r"\b\d{1,5}(?:[.,]\d{3})?\b", after)
        if not re.fullmatch(r"20\d{2}", token)
    ]
    if len(counts) < len(headers):
        return []
    relations: list[MetricRelation] = []
    for index, header in enumerate(headers):
        week = int(header.group("week"))
        value = counts[index]
        if value <= 0:
            continue
        frame = _weekly_frame(week, year)
        span = header.group("span") or ""
        evidence = re.sub(r"\s+", " ", f"{header.group(0)} {value}").strip()
        relations.append(MetricRelation(
            location=location,
            cases=value,
            time_frame=frame,
            evidence=evidence,
            disease=disease,
            metric_type="cases",
            qualifier="sitrep_weekly",
            value=value,
            evidence_offset_start=header.start(),
            evidence_offset_end=header.end(),
            source_sentence_id=_source_sentence_id(source, header.start()),
            country_scope=location.country,
        ))
        if span:
            relations[-1].evidence = re.sub(r"\s+", " ", f"E-week {week} ({span}) {value}")
    return relations


def _daily_matrix_rows(
    source: str,
    linker: GazetteerLinker,
    published_date: Optional[str],
    fallback: Optional[LinkedLocation],
) -> list[MetricRelation]:
    if not re.search(r"number\s+of\s+reported\s+cases\b", source, re.IGNORECASE):
        return []
    headers = list(_DAY_HEADER.finditer(source))
    if len(headers) < 3:
        return []
    location = _matrix_home(source, linker, fallback)
    if location is None:
        return []
    disease = _matrix_disease(source) or "Dengue"
    year = _year_hint(source, published_date)
    after = source[headers[-1].end(): headers[-1].end() + 160]
    counts = [
        _number(token)
        for token in re.findall(r"\b\d{1,4}\b", after)
        if not re.fullmatch(r"20\d{2}", token)
    ]
    if len(counts) < len(headers):
        return []
    relations: list[MetricRelation] = []
    for index, header in enumerate(headers):
        value = counts[index]
        if value < 0:
            continue
        day = int(header.group("day"))
        month = _MONTH_NUM.get(header.group("month")[:3].casefold())
        if not month or not year:
            continue
        try:
            stamp = date(year, month, day).isoformat()
        except ValueError:
            continue
        relations.append(MetricRelation(
            location=location,
            cases=value,
            time_frame=stamp,
            evidence=re.sub(r"\s+", " ", f"{header.group(0)} {value}"),
            disease=disease,
            metric_type="cases",
            qualifier="sitrep_daily",
            value=value,
            evidence_offset_start=header.start(),
            evidence_offset_end=header.end(),
            source_sentence_id=_source_sentence_id(source, header.start()),
            country_scope=location.country,
        ))
    return relations


def _cumulative_row(
    source: str,
    linker: GazetteerLinker,
    published_date: Optional[str],
    fallback: Optional[LinkedLocation],
) -> list[MetricRelation]:
    match = _CUMULATIVE.search(source)
    if not match:
        return []
    location = _matrix_home(source, linker, fallback)
    if location is None:
        return []
    value = _number(match.group("count"))
    if value <= 0:
        return []
    year = _year_hint(source, published_date)
    week_hit = re.search(r"first\s+(\d{1,2})\s+e-?weeks?", match.group(0) + source[match.end(): match.end() + 40], re.I)
    if year and week_hit:
        try:
            end = date.fromisocalendar(year, int(week_hit.group(1)), 7).isoformat()
            frame = f"{year}-01-01 to {end}"
        except ValueError:
            frame = f"Cumulative {year}"
    else:
        frame = f"Cumulative {year}" if year else "Cumulative"
    return [MetricRelation(
        location=location,
        cases=value,
        time_frame=frame,
        evidence=re.sub(r"\s+", " ", source[match.start(): match.end() + 8]).strip(),
        disease=_matrix_disease(source) or "Dengue",
        metric_type="cases",
        qualifier="sitrep_cumulative",
        value=value,
        evidence_offset_start=match.start(),
        evidence_offset_end=match.end(),
        source_sentence_id=_source_sentence_id(source, match.start()),
        country_scope=location.country,
    )]


def _agent_sitrep_rows(
    source: str,
    linker: GazetteerLinker,
    published_date: Optional[str],
    fallback: Optional[LinkedLocation],
) -> list[MetricRelation]:
    try:
        from .agent import chat_json
    except Exception as exc:
        logger.info("Sitrep agent unavailable: %s", exc)
        return []
    result = chat_json(
        "You scrape epidemiological sitrep tables and e-week matrices. "
        "Return JSON only. Extract every explicit table row. "
        "A combined increment for several countries without per-country numbers "
        "is one Global event; list those countries in countries. "
        "Do not invent a country or number. evidence must be an exact quote.",
        "Extract sitrep / e-week / daily matrix rows from this source.\n"
        "Return {rows:[{disease,countries,location,cases,deaths,period,evidence}]}.\n"
        + (source[:14000]),
        max_tokens=min(int(getattr(config, "DEEPSEEK_MAX_TOKENS", 1500) or 1500), 1800),
    )
    rows = result.get("rows") if isinstance(result, dict) else None
    if not isinstance(rows, list):
        return []
    relations: list[MetricRelation] = []
    for item in rows:
        if not isinstance(item, dict):
            continue
        evidence = re.sub(r"\s+", " ", str(item.get("evidence") or "")).strip()
        cases = _number(str(item.get("cases") or 0))
        deaths = _number(str(item.get("deaths") or 0))
        if not _grounded(evidence, source, cases, deaths):
            continue
        disease = _row_disease(str(item.get("disease") or ""), "")
        if not disease or disease == "UNKNOWN":
            continue
        places = " ".join(str(part) for part in (item.get("countries") or []))
        places = places or str(item.get("location") or "")
        location = _row_location(places, linker, source, evidence, fallback)
        if location is None:
            continue
        period = str(item.get("period") or "")
        qualifier = "sitrep_weekly"
        frame = _period_frame(period) if _PERIOD.search(period) else period
        if re.search(r"e-?week", period, re.I):
            week_hit = re.search(r"(\d{1,2})", period)
            year = _year_hint(source, published_date)
            if week_hit:
                frame = _weekly_frame(int(week_hit.group(1)), year)
        elif re.search(r"\b(20\d{2}-\d{2}-\d{2})\b", period):
            frame = re.search(r"20\d{2}-\d{2}-\d{2}", period).group(0)
            qualifier = "sitrep_daily"
        relations.append(MetricRelation(
            location=location,
            cases=cases,
            deaths=deaths or None,
            time_frame=frame or period,
            evidence=evidence,
            disease=disease,
            metric_type="cases" if cases else "deaths",
            qualifier=qualifier,
            value=cases or deaths,
            country_scope=location.country,
        ))
    return relations


def _count_token() -> str:
    return r"(?:\d{1,3}(?:[.,]\d{3})+|\d+)"


def _looks_like_next_disease(places: str) -> bool:
    folded = (places or "").casefold()
    return any(surface in folded for surface, _ in _DISEASE_SURFACES if len(surface) >= 5)


def _row_disease(raw: str, fallback: str) -> str:
    strain = re.search(r"A\s*\((H\d+N\d+)\)", raw or "", re.IGNORECASE)
    if strain:
        return f"Avian influenza A({strain.group(1).upper()})"
    label = extractors.canonical_disease_name(raw or fallback or "")
    if label and label != "UNKNOWN":
        return label
    return fallback or label or "UNKNOWN"


def _period_frame(period: str) -> str:
    match = _PERIOD.search(period or "")
    if not match:
        return re.sub(r"\s+", " ", period or "").strip()
    start = int(match.group("start"))
    end = int(match.group("end") or start)
    year = int(match.group("year"))
    if start == end:
        return _weekly_frame(start, year)
    try:
        first = date.fromisocalendar(year, start, 1)
        last = date.fromisocalendar(year, end, 7)
        return f"{first.isoformat()} to {last.isoformat()}"
    except ValueError:
        return f"Weekly M{start}-M{end} {year}"


def _named_countries(text: str) -> list[str]:
    source = text or ""
    occupied = [False] * len(source)
    found: list[str] = []
    aliases = sorted(extractors.COUNTRY_ALIASES.items(), key=lambda item: -len(item[0]))
    for alias, canonical in aliases:
        if len(alias) < 4 and alias not in {"usa", "drc", "rdc"}:
            continue
        for match in re.finditer(rf"(?<!\w){re.escape(alias)}(?!\w)", source, re.IGNORECASE):
            if any(occupied[match.start(): match.end()]):
                continue
            for index in range(match.start(), match.end()):
                occupied[index] = True
            if canonical not in found:
                found.append(canonical)
    return found


def _global_location(evidence: str = "") -> LinkedLocation:
    return LinkedLocation(
        name=extractors.GLOBAL_SCOPE_COUNTRY,
        country=extractors.GLOBAL_SCOPE_COUNTRY,
        evidence=evidence,
    )


def _row_location(
    places: str,
    linker: GazetteerLinker,
    source: str,
    evidence: str,
    fallback: Optional[LinkedLocation],
) -> Optional[LinkedLocation]:
    countries = _named_countries(places)
    if len(countries) >= 2:
        return _global_location(evidence)
    if len(countries) == 1:
        return _country_level_location(countries[0], linker, source, evidence) or _global_location(evidence)
    if fallback:
        return fallback
    home = _matrix_home(source, linker, None)
    return home or _global_location(evidence)


def _matrix_home(
    source: str,
    linker: GazetteerLinker,
    fallback: Optional[LinkedLocation],
) -> Optional[LinkedLocation]:
    if fallback and not extractors.is_global_scope_country(fallback.country):
        return fallback
    for name in extractors.extract_named_countries(source[:2500]):
        linked = _country_level_location(name, linker, source, source)
        if linked and not extractors.is_global_scope_country(linked.country):
            return linked
    return fallback


def _matrix_disease(source: str) -> Optional[str]:
    labels = extractors.extract_diseases(source[:2000])
    for label in labels:
        if label and str(label).strip().upper() != "UNKNOWN":
            return extractors.canonical_disease_name(label)
    folded = (source or "").casefold()
    if "dengue" in folded or "dbd" in folded:
        return "Dengue"
    return None


def _year_hint(source: str, published_date: Optional[str]) -> Optional[int]:
    if published_date:
        try:
            return int(published_date[:4])
        except (TypeError, ValueError):
            pass
    match = re.search(r"\b(20\d{2})\b", source or "")
    return int(match.group(1)) if match else None


def _grounded(evidence: str, source: str, cases: int, deaths: int) -> bool:
    quote = re.sub(r"\s+", " ", evidence or "").strip().casefold()
    body = re.sub(r"\s+", " ", source or "").strip().casefold()
    if len(quote) < 8 or quote not in body:
        return False
    if cases > 0 and str(cases) not in re.sub(r"[^\d]", "", evidence) and str(cases) not in re.sub(r"[^\d]", "", source):
        return False
    if deaths > 0 and str(deaths) not in re.sub(r"[^\d]", "", source):
        return False
    return True
