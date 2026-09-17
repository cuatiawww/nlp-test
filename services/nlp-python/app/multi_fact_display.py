"""Collapse N structured disease facts into one article-row display.

Display contract (user-mandated):
  Disease Name          Influenza; RSV
  Province / Location   Indonesia; Philippines   or  Jakarta; Manila
  Number of Cases       Indonesia(8278); Philippines(3734)
  Number of Deaths      Indonesia(12); Philippines(3)

When counts are per-disease at one place: Influenza(120); RSV(45).
When both disease AND location vary: prefer Location(count) for cases/deaths
and list diseases separately. Do not invent opaque mashups.
Empty/null counts are omitted. Zero cases are kept (Nipah “none detected”).
Zero deaths are omitted unless that is the only remaining segment.
"""

from __future__ import annotations

from typing import Any, Iterable, Optional

SEPARATOR = "; "

# Compact labels for the collapsed Disease column. Atomic event rows still
# keep the WHO/canonical name; only the article summary shortens these.
_SHORT_DISEASE = {
    "respiratory syncytial virus infection": "RSV",
    "respiratory syncytial virus": "RSV",
    "rsv": "RSV",
    "covid-19": "COVID-19",
    "covid19": "COVID-19",
    "nipah virus disease": "Nipah",
}


def short_disease_label(name: Optional[str]) -> str:
    raw = (name or "").strip()
    if not raw or raw.upper() == "UNKNOWN":
        return ""
    return _SHORT_DISEASE.get(raw.casefold(), raw)


def join_unique_labels(labels: Iterable[str]) -> str:
    seen: set[str] = set()
    ordered: list[str] = []
    for raw in labels:
        label = (raw or "").strip()
        if not label:
            continue
        key = label.casefold()
        if key in seen:
            continue
        seen.add(key)
        ordered.append(label)
    return SEPARATOR.join(ordered)


def format_label_counts(
    pairs: Iterable[tuple[str, Optional[int]]],
    *,
    omit_zero: bool = False,
) -> str:
    cleaned: list[tuple[str, int]] = []
    for label, count in pairs:
        name = (label or "").strip()
        if not name or count is None:
            continue
        try:
            value = int(count)
        except (TypeError, ValueError):
            continue
        if omit_zero and value == 0:
            continue
        cleaned.append((name, value))
    cleaned.sort(key=lambda item: (-item[1], item[0].casefold()))
    return SEPARATOR.join(f"{label}({value})" for label, value in cleaned)


def _fact_location(fact: dict[str, Any]) -> str:
    for key in (
        "location_label",
        "province",
        "city",
        "location_name",
        "country",
    ):
        value = str(fact.get(key) or "").strip()
        if value:
            return value
    return ""


def _int_or_none(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def collapse_facts(facts: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """Return semicolon display fields for one article URL.

    Dimension choice for cases/deaths parentheticals:
      1. locations vary → Location(count)  (matches the location column)
      2. only diseases vary → Disease(count)
      3. neither → leave cases_display/deaths_display empty so the UI
         can show the single numeric total
    """
    rows = [dict(item) for item in facts if isinstance(item, dict)]
    diseases = join_unique_labels(
        short_disease_label(item.get("disease") or item.get("disease_classification"))
        for item in rows
    )
    location_labels = [_fact_location(item) for item in rows]
    locations = join_unique_labels(location_labels)

    unique_diseases = [part for part in diseases.split(SEPARATOR) if part]
    unique_locations = [part for part in locations.split(SEPARATOR) if part]
    locations_vary = len(unique_locations) > 1
    diseases_vary = len(unique_diseases) > 1

    cases_by_location: dict[str, int] = {}
    deaths_by_location: dict[str, int] = {}
    cases_by_disease: dict[str, int] = {}
    deaths_by_disease: dict[str, int] = {}
    for item, loc in zip(rows, location_labels):
        disease = short_disease_label(item.get("disease") or item.get("disease_classification"))
        cases = _int_or_none(item.get("case_count", item.get("cases")))
        deaths = _int_or_none(item.get("death_count", item.get("deaths")))
        if loc and cases is not None:
            cases_by_location[loc] = cases_by_location.get(loc, 0) + cases
        if loc and deaths is not None:
            deaths_by_location[loc] = deaths_by_location.get(loc, 0) + deaths
        if disease and cases is not None:
            cases_by_disease[disease] = cases_by_disease.get(disease, 0) + cases
        if disease and deaths is not None:
            deaths_by_disease[disease] = deaths_by_disease.get(disease, 0) + deaths

    if locations_vary:
        # Same labels as the location column. Keep explicit 0 (no cases detected).
        cases_display = format_label_counts(cases_by_location.items())
        deaths_display = format_label_counts(deaths_by_location.items(), omit_zero=True)
    elif diseases_vary:
        # Per-disease counts at one place. Omit 0 so RSV without a count is
        # listed in Disease Name only, not as RSV(0).
        cases_display = format_label_counts(cases_by_disease.items(), omit_zero=True)
        deaths_display = format_label_counts(deaths_by_disease.items(), omit_zero=True)
    else:
        cases_display = ""
        deaths_display = ""

    total_cases = sum(value for value in (_int_or_none(item.get("case_count", item.get("cases"))) for item in rows) if value is not None)
    total_deaths = sum(value for value in (_int_or_none(item.get("death_count", item.get("deaths"))) for item in rows) if value is not None)

    return {
        "disease_display": diseases,
        "location_display": locations,
        "cases_display": cases_display or None,
        "deaths_display": deaths_display or None,
        "total_cases": total_cases,
        "total_deaths": total_deaths,
        "dimension": (
            "location" if locations_vary else "disease" if diseases_vary else "single"
        ),
    }


def facts_from_analyze_payload(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Build fact rows from an AnalyzeResponse-like dict (live or cached)."""
    sub_events = payload.get("sub_events") or []
    if isinstance(sub_events, list) and len(sub_events) >= 2:
        facts = []
        for item in sub_events:
            if not isinstance(item, dict):
                continue
            facts.append({
                "disease": item.get("disease") or payload.get("disease_classification"),
                "location_name": item.get("location_name") or payload.get("location_name"),
                "country": item.get("country") or payload.get("country"),
                "province": item.get("province") or payload.get("province"),
                "city": item.get("city") or payload.get("city"),
                "case_count": item.get("case_count"),
                "death_count": item.get("death_count"),
            })
        return facts

    diseases = list(payload.get("disease_extracted") or [])
    primary = payload.get("disease_classification")
    if primary and primary not in diseases:
        diseases = [primary, *diseases]
    locations = payload.get("locations") or []
    location_names = [
        str(item.get("name") or "").strip()
        for item in locations
        if isinstance(item, dict) and str(item.get("name") or "").strip()
    ]
    if not location_names and payload.get("location_name"):
        location_names = [str(payload.get("location_name"))]

    if len(diseases) >= 2 and len(location_names) <= 1:
        loc = location_names[0] if location_names else payload.get("country") or ""
        return [
            {
                "disease": name,
                "location_name": loc,
                "country": payload.get("country"),
                "case_count": payload.get("case_count") if index == 0 else 0,
                "death_count": payload.get("death_count") if index == 0 else 0,
            }
            for index, name in enumerate(diseases)
            if short_disease_label(name)
        ]
    if len(location_names) >= 2:
        return [
            {
                "disease": primary,
                "location_name": name,
                "country": payload.get("country"),
                "case_count": payload.get("case_count") if index == 0 else None,
                "death_count": payload.get("death_count") if index == 0 else None,
            }
            for index, name in enumerate(location_names)
        ]
    return [{
        "disease": primary,
        "location_name": payload.get("location_name"),
        "country": payload.get("country"),
        "province": payload.get("province"),
        "city": payload.get("city"),
        "case_count": payload.get("case_count"),
        "death_count": payload.get("death_count"),
    }]
