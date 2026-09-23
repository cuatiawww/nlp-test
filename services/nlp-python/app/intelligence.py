"""Evidence-first document intelligence helpers.

This module is deliberately small.  It turns the existing location/metric
relations into atomic event candidates only after disease, location, metric,
and temporal evidence can be attributed to the same local context.
"""

from __future__ import annotations

import re
from collections import OrderedDict
from dataclasses import replace
from typing import Any, Optional

from . import extractors
from .epidemiology import classify_epistemic_status, extract_event_period, qualify_metric_type
from .surveillance_extraction import (
    GazetteerLinker,
    MetricRelation,
    _metric_context,
    extract_metric_relations,
)
from .multilingual import normalize_local_digits


_SENTENCE_RE = re.compile(r".*?(?:[.!?。！？]+|$)", re.S)
_GENERIC_METRIC_RE = re.compile(
    r"(?P<value>\d[\d.,]*)\s*"
    r"(?P<qualifier>more than|over|at least|nearly|about|around|approximately|"
    r"lebih dari|setidaknya|sekitar|hampir|lebih kurang)?\s*"
    r"(?P<metric>hospitali[sz]ed|rawat inap|dirawat|recovered|sembuh|pulih|"
    r"tests?|tes|specimens?|spesimen|vaccinated|divaksin|vaksinasi|"
    r"suspected|suspek|confirmed|terkonfirmasi|active|aktif|percent|persen|"
    r"rate|rasio|ratio|"
    r"โรงพยาบาล|รักษาในโรงพยาบาล|หายป่วย|ตรวจ|ฉีดวัคซีน|"
    r"សម្រាកពេទ្យ|ជាសះស្បើយ|ធ្វើតេស្ត|ចាក់វ៉ាក់សាំង|"
    r"ນອນໂຮງໝໍ|ຫາຍດີ|ກວດ|ສັກວັກຊີນ|"
    r"ဆေးရုံတက်|ပြန်လည်ကောင်းမွန်|စမ်းသပ်|ကာကွယ်ဆေးထိုး)\b",
    re.IGNORECASE,
)


def sentence_spans(text: str) -> list[tuple[int, int, str]]:
    """Return non-empty sentence spans while retaining original offsets."""

    source = text or ""
    spans: list[tuple[int, int, str]] = []
    start = 0
    # Avoid splitting on periods inside numbers (e.g. 7.994 or 218.356)
    pattern = re.compile(
        r"(?:(?<!\d)[.!?。！？]+|(?<=\d)[.!?。！？]+(?=\s+[A-Z\"“'‘\n]|\s*$))(?:\s+|\n+|$)|(?<![\w\d])[.!?。！？]+(?:\s+|\n+|$)|[!?。！？]+|\n+"
    )
    for match in pattern.finditer(source):
        end = match.end()
        value = source[start:end].strip()
        if value:
            leading = len(source[start:end]) - len(source[start:end].lstrip())
            spans.append((start + leading, end, value))
        start = end
    tail = source[start:].strip()
    if tail:
        leading = len(source[start:]) - len(source[start:].lstrip())
        spans.append((start + leading, len(source), tail))
    return spans or ([(0, len(source), source)] if source.strip() else [])


def _canonical_labels(labels: list[str] | None) -> list[str]:
    result: list[str] = []
    for value in labels or []:
        label = str(value or "").strip()
        if not label or label.upper() == "UNKNOWN":
            continue
        canonical = extractors.canonical_disease_name(label)
        if canonical.casefold() not in {item.casefold() for item in result}:
            result.append(canonical)
    return result


def _disease_candidates(context: str, labels: list[str]) -> list[str]:
    """Resolve only diseases with textual evidence in the local context."""

    observed = _canonical_labels(
        extractors.extract_diseases(context) + extractors.extract_alias_diseases(context)
    )
    known = _canonical_labels(labels)
    candidates: list[str] = []
    for label in [*observed, *known]:
        if label.casefold() in {item.casefold() for item in candidates}:
            continue
        if extractors.disease_has_textual_evidence(label, context):
            candidates.append(label)
    return candidates


def _nearest_disease(context: str, candidates: list[str], metric_anchor: int) -> Optional[str]:
    if len(candidates) == 1:
        return candidates[0]
    scored: list[tuple[int, str]] = []
    for candidate in candidates:
        tokens = [candidate, *candidate.split()]
        positions = [context.casefold().find(token.casefold()) for token in tokens if token]
        positions = [position for position in positions if position >= 0]
        if positions:
            scored.append((min(abs(position - metric_anchor) for position in positions), candidate))
    if not scored:
        return None
    scored.sort(key=lambda item: item[0])
    if len(scored) > 1 and scored[0][0] == scored[1][0]:
        return None
    if len(scored) > 1 and (scored[0][0] > 90 or scored[1][0] - scored[0][0] < 20):
        return None
    return scored[0][1]


def _metric_qualifier(context: str) -> Optional[str]:
    match = re.search(
        r"\b(more than|over|at least|nearly|about|around|approximately|"
        r"lebih dari|setidaknya|sekitar|hampir|lebih kurang)\b",
        context or "",
        re.IGNORECASE,
    )
    return match.group(1).lower() if match else None


def _generic_metric_type(label: str) -> tuple[str, str]:
    value = label.casefold()
    if value in {"hospitalized", "hospitalised", "rawat inap", "dirawat"}:
        return "hospitalized", "persons"
    if value in {"recovered", "sembuh", "pulih"}:
        return "recovered", "persons"
    if value in {"tests", "test", "tes", "specimens", "specimen", "spesimen"}:
        return "tests", "tests"
    if value in {"vaccinated", "divaksin", "vaksinasi"}:
        return "vaccinated", "persons"
    if value in {"suspected", "suspek"}:
        return "suspected_cases", "persons"
    if value in {"confirmed", "terkonfirmasi"}:
        return "confirmed_cases", "persons"
    if value in {"active", "aktif"}:
        return "active_cases", "persons"
    if value in {"percent", "persen"}:
        return "percentage", "percent"
    if value in {"rate", "rasio", "ratio"}:
        return "rate", "ratio"
    if value in {"โรงพยาบาล", "รักษาในโรงพยาบาล", "សម្រាកពេទ្យ", "ນອນໂຮງໝໍ", "ဆေးရုံတက်"}:
        return "hospitalized", "persons"
    if value in {"หายป่วย", "ជាសះស្បើយ", "ຫາຍດີ", "ပြန်လည်ကောင်းမွန်"}:
        return "recovered", "persons"
    if value in {"ตรวจ", "ធ្វើតេស្ត", "ກວດ", "စမ်းသပ်"}:
        return "tests", "tests"
    if value in {"ฉีดวัคซีน", "ចាក់វ៉ាក់សាំង", "ສັກວັກຊີນ", "ကာကွယ်ဆေးထိုး"}:
        return "vaccinated", "persons"
    return value, "persons"


def _generic_observations(sentence: str, linker: GazetteerLinker) -> list[dict[str, Any]]:
    """Extract non-case metrics only when a location can be linked locally."""

    source = sentence or ""
    working = normalize_local_digits(source)
    locations = list(linker.local_mentions(source))
    observations: list[dict[str, Any]] = []
    for match in _GENERIC_METRIC_RE.finditer(working):
        metric_type, unit = _generic_metric_type(match.group("metric"))
        raw = match.group("value").replace(" ", "")
        try:
            value = float(raw.replace(",", ".")) if "." in raw and raw.count(".") == 1 else int(re.sub(r"[.,]", "", raw))
        except ValueError:
            continue
        nearby = [item for item in locations if abs(item[0] - match.start()) <= 180 or abs(item[1] - match.end()) <= 180]
        if len({item[2].name.casefold() for item in nearby}) != 1:
            continue
        location = nearby[0][2]
        observations.append({
            "location": location,
            "metric_type": metric_type,
            "value": value,
            "unit": unit,
            "qualifier": match.group("qualifier"),
            "evidence": source.strip(),
            "offset_start": match.start(),
            "offset_end": match.end(),
        })
    return observations


def _relation_key(event: dict[str, Any]) -> tuple[str, str, str]:
    return (
        str(event.get("disease") or "UNKNOWN").casefold(),
        str(event.get("location_name") or "").casefold(),
        str(event.get("time_frame") or ""),
    )


def _location_level(value: dict[str, Any]) -> int:
    """Return the loaded administrative depth without inventing hierarchy."""

    level = value.get("admin_level")
    if level is not None:
        try:
            return int(level)
        except (TypeError, ValueError):
            pass
    name = str(value.get("canonical_name") or value.get("name") or "")
    configured = getattr(extractors.config, "LOCATION_ADMIN_LEVEL", {}).get(name)
    try:
        return int(configured) if configured is not None else 0
    except (TypeError, ValueError):
        return 0


def _is_parent_location(parent: dict[str, Any], child: dict[str, Any]) -> bool:
    """Check only relationships supported by the resolved hierarchy."""

    parent_name = str(parent.get("canonical_name") or parent.get("name") or "").casefold()
    child_name = str(child.get("canonical_name") or child.get("name") or "").casefold()
    if not parent_name or not child_name or parent_name == child_name:
        return False
    parent_country = str(parent.get("country") or "").casefold()
    child_country = str(child.get("country") or "").casefold()
    if not parent_country or parent_country != child_country:
        return False
    if _location_level(child) <= _location_level(parent):
        return False
    if _location_level(parent) == 0:
        return parent_name == child_country
    return (
        str(parent.get("admin1_name") or "").casefold()
        == str(child.get("admin1_name") or "").casefold()
        and str(parent.get("admin2_name") or "").casefold()
        != str(child.get("admin2_name") or "").casefold()
    )


def _same_metric_observation(left: dict[str, Any], right: dict[str, Any]) -> bool:
    """Identify parser duplicates, not distinct observations with equal values."""

    if (left.get("disease") or "").casefold() != (right.get("disease") or "").casefold():
        return False
    if left.get("metric_type") != right.get("metric_type"):
        return False
    if left.get("case_count", 0) != right.get("case_count", 0):
        return False
    if left.get("death_count", 0) != right.get("death_count", 0):
        return False
    left_start, left_end = left.get("evidence_offset_start"), left.get("evidence_offset_end")
    right_start, right_end = right.get("evidence_offset_start"), right.get("evidence_offset_end")
    if all(isinstance(item, int) for item in (left_start, left_end, right_start, right_end)):
        return left_start < right_end and right_start < left_end
    return bool(left.get("evidence") and left.get("evidence") == right.get("evidence"))


def _collapse_hierarchical_parser_duplicates(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Drop a parent-location duplicate when one metric has one child relation.

    A national total and a provincial breakdown remain separate when their
    values or evidence differ. This only removes overlapping parser outputs
    for the same metric value and hierarchy.
    """

    kept: list[dict[str, Any]] = []
    for candidate in events:
        candidate_hierarchy = extractors.resolve_location_hierarchy(
            candidate.get("location_name"), country_hint=candidate.get("country")
        )
        remove_existing: list[int] = []
        discard_candidate = False
        for index, existing in enumerate(kept):
            if not _same_metric_observation(candidate, existing):
                continue
            existing_hierarchy = extractors.resolve_location_hierarchy(
                existing.get("location_name"), country_hint=existing.get("country")
            )
            if _is_parent_location(existing_hierarchy, candidate_hierarchy):
                remove_existing.append(index)
            elif _is_parent_location(candidate_hierarchy, existing_hierarchy):
                discard_candidate = True
                break
        if discard_candidate:
            continue
        for index in reversed(remove_existing):
            kept.pop(index)
        kept.append(candidate)
    return kept


def _most_specific_event_location(sentence: str, evidence: str, base_location, linker: GazetteerLinker):
    """Prefer a supported child place when a relation initially links its parent."""

    try:
        candidates = extractors.extract_all_locations(
            sentence,
            country=getattr(base_location, "country", None),
        )
    except Exception:
        candidates = []
    if not candidates:
        return base_location

    # A country-level metric followed by origin/breakdown locations is still
    # a country total. Do not promote it to the first province merely because
    # the sentence lists where the referred cases originated.
    base_is_country = not any(
        bool(getattr(base_location, attribute, False))
        for attribute in ("is_province", "is_city")
    )
    if base_is_country and re.search(
        r"\b(?:berasal\s+dari|berpunca\s+dari|originat(?:e|ed)\s+from|came\s+from|from)\b",
        evidence or sentence,
        re.IGNORECASE,
    ):
        return base_location

    from .surveillance_extraction import _is_comparative_location
    filtered_candidates = []
    for c in candidates:
        c_name = str(c.get("name") or "")
        idx = sentence.find(c_name)
        if idx >= 0 and _is_comparative_location(sentence, idx):
            continue
        filtered_candidates.append(c)
    if filtered_candidates:
        candidates = filtered_candidates

    base_country = str(getattr(base_location, "country", "") or "").casefold()
    compatible = [
        item for item in candidates
        if not base_country or str(item.get("country") or "").casefold() == base_country
    ]
    if not compatible:
        return base_location
    anchor = sentence.find(evidence) if evidence else 0
    compatible.sort(
        key=lambda item: (
            item.get("admin_level") if item.get("admin_level") is not None else -1,
            -abs(sentence.find(str(item.get("name") or "")) - max(anchor, 0)),
        ),
        reverse=True,
    )
    selected = compatible[0]
    linked = linker.link(
        str(selected.get("name") or ""),
        context=sentence,
        evidence=evidence,
    )
    return linked or base_location


def _merge_metric(event: dict[str, Any], metric: dict[str, Any]) -> None:
    metrics = event.setdefault("metrics", [])
    metric_key = (metric.get("metric_type"), metric.get("unit"), metric.get("value"), metric.get("time_frame"))
    if not any((item.get("metric_type"), item.get("unit"), item.get("value"), item.get("time_frame")) == metric_key for item in metrics):
        metrics.append(metric)
    metric_type = metric.get("metric_type")
    qualifier = str(metric.get("qualifier") or "").casefold()
    if metric_type in {"cases", "new_cases", "cumulative_cases", "active_cases", "suspected_cases", "confirmed_cases"}:
        if metric_type in {"suspected_cases", "confirmed_cases", "active_cases"}:
            event[metric["metric_type"]] = max(event.get(metric["metric_type"]) or 0, int(metric.get("value") or 0))
        elif qualifier in {"comparison", "historical"}:
            event["historical_cases"] = max(event.get("historical_cases") or 0, int(metric.get("value") or 0))
            if not event.get("case_count"):
                event["case_count"] = int(metric.get("value") or 0)
                event["primary_case_qualifier"] = qualifier
        elif qualifier == "new":
            event["new_cases"] = max(event.get("new_cases") or 0, int(metric.get("value") or 0))
            event["case_count"] = event["new_cases"]
            event["primary_case_qualifier"] = "new"
        elif qualifier == "cumulative":
            event["cumulative_cases"] = max(event.get("cumulative_cases") or 0, int(metric.get("value") or 0))
            if not event.get("case_count") or event.get("primary_case_qualifier") not in {"new", "current"}:
                event["case_count"] = event["cumulative_cases"]
                event["primary_case_qualifier"] = "cumulative"
        else:
            value = int(metric.get("value") or 0)
            if event.get("primary_case_qualifier") in {"historical", "comparison"}:
                event["case_count"] = value
                event["primary_case_qualifier"] = "current"
            else:
                event["case_count"] = max(event.get("case_count") or 0, value)
                event.setdefault("primary_case_qualifier", "current")
    if metric_type == "deaths":
        value = int(metric.get("value") or 0)
        if qualifier == "explicit_zero":
            event["death_count"] = 0
            event["death_count_explicit"] = True
        elif not event.get("death_count_explicit"):
            event["death_count"] = max(event.get("death_count") or 0, value)


def build_atomic_events(
    text: str,
    *,
    disease_labels: list[str] | None = None,
    primary_disease: Optional[str] = None,
    published_at: Optional[str] = None,
    linker: Optional[GazetteerLinker] = None,
    relations: Optional[list[MetricRelation]] = None,
) -> list[dict[str, Any]]:
    """Build event candidates only from co-attributed evidence spans.

    A document-level disease or location is used only as a low-confidence
    fallback when there is exactly one unambiguous candidate.  Competing
    diseases/locations are left unresolved instead of being silently merged.
    """

    source = text or ""
    if not source.strip():
        return []
    linker = linker or GazetteerLinker(allow_remote=False)
    labels = _canonical_labels([*(disease_labels or []), *( [primary_disease] if primary_disease else [])])
    spans = sentence_spans(source)
    events: "OrderedDict[tuple[str, str, str], dict[str, Any]]" = OrderedDict()
    # Resolve metric-location relations once per document. Calling this inside
    # every sentence repeatedly scans the full gazetteer and makes long
    # articles degrade quadratically.
    document_relations = (
        relations
        if relations is not None
        else extract_metric_relations(source, linker=linker, published_date=None)
    )

    for start, end, sentence in spans:
        local_relations = [
            relation for relation in document_relations
            if relation.evidence and relation.evidence.casefold() in sentence.casefold()
        ]
        local_relations = [
            relation for relation in local_relations
            if relation.cases
            or relation.deaths
            or relation.value_min is not None
            or relation.qualifier == "explicit_zero"
        ]
        generic = _generic_observations(sentence, linker)
        if not local_relations and not generic:
            continue
        paragraph_start = source.rfind("\n\n", 0, start) + 2
        paragraph_end = source.find("\n\n", end)
        paragraph = source[paragraph_start:paragraph_end if paragraph_end >= 0 else len(source)]
        context = paragraph[:1200]

        # A metric can be stated without repeating the country in the same
        # sentence (for example, a heading/lead establishes Indonesia and the
        # next sentence says only ``two new cases``).  Use a single unambiguous
        # country in the sentence or paragraph as scope, but keep an explicit
        # subnational location when the metric evidence names it directly.
        scope_countries = list(dict.fromkeys(
            extractors.normalize_country(value)
            for value in extractors.extract_all_mentioned_countries(sentence)
            if extractors.normalize_country(value)
        ))
        if not scope_countries:
            # Do not use the whole paragraph for country scope: a roundup can
            # mention several countries, while the next sentence still belongs
            # to the country introduced immediately before it. Prefer a small
            # sentence neighbourhood, then fall back to the paragraph only
            # when it contains one country.
            local_context_start = max(paragraph_start, start - 360)
            local_context_end = min(paragraph_end if paragraph_end >= 0 else len(source), end + 180)
            local_context = source[local_context_start:local_context_end]
            scope_countries = list(dict.fromkeys(
                extractors.normalize_country(value)
                for value in extractors.extract_all_mentioned_countries(local_context)
                if extractors.normalize_country(value)
            ))
            if len(scope_countries) != 1:
                paragraph_countries = list(dict.fromkeys(
                    extractors.normalize_country(value)
                    for value in extractors.extract_all_mentioned_countries(context)
                    if extractors.normalize_country(value)
                ))
                scope_countries = paragraph_countries if len(paragraph_countries) == 1 else []
        if len(scope_countries) == 1 and local_relations:
            scoped_country = scope_countries[0]
            scoped_relations = []
            for relation in local_relations:
                evidence_lower = str(relation.evidence or sentence).casefold()
                sentence_lower = sentence.casefold()
                explicit_location = any(
                    token and (token.casefold() in evidence_lower or token.casefold() in sentence_lower)
                    for token in (relation.location.name, relation.location.country)
                )
                same_country = relation.location.country.casefold() == scoped_country.casefold()
                if not explicit_location and same_country and relation.location.name.casefold() != scoped_country.casefold():
                    # A fallback nearest-place match can land on a province
                    # mentioned in the following sentence. If the metric
                    # evidence itself has no subnational name, keep it at the
                    # country level rather than inventing a provincial count.
                    scoped_location = linker.link(
                        scoped_country,
                        context=sentence,
                        evidence=relation.evidence or sentence,
                    )
                    if scoped_location:
                        relation = replace(
                            relation,
                            location=scoped_location,
                            country_scope=scoped_country,
                        )
                elif not explicit_location and not same_country:
                    scoped_location = linker.link(
                        scoped_country,
                        context=sentence,
                        evidence=relation.evidence or sentence,
                    )
                    if scoped_location:
                        relation = replace(
                            relation,
                            location=scoped_location,
                            country_scope=scoped_country,
                        )
                elif same_country:
                    relation = replace(relation, country_scope=scoped_country)
                scoped_relations.append(relation)
            local_relations = scoped_relations
        period = extract_event_period(sentence, published_at=published_at)

        sentence_candidates = _disease_candidates(sentence, labels)
        paragraph_candidates = _disease_candidates(context, labels)

        def resolve_disease(evidence: str, evidence_start: int) -> tuple[str, float]:
            direct = _disease_candidates(evidence, labels)
            # A paragraph-level disease is context, not attribution.  It is
            # unsafe to attach a country-wide metric to a disease mentioned
            # in a title, neighbouring paragraph, or reference section.
            # Only a disease in the metric evidence/sentence may be resolved;
            # the single-label fallback remains safe for a genuinely
            # single-disease article.
            candidates = direct or sentence_candidates
            if not candidates and len(labels) == 1:
                candidates = labels
            if not candidates and len(paragraph_candidates) == 1:
                candidates = paragraph_candidates
            disease = _nearest_disease(sentence, candidates, evidence_start) if candidates else None
            if disease is None and len(candidates) == 1:
                disease = candidates[0]
            if disease is None and primary_disease and str(primary_disease).strip().upper() != "UNKNOWN":
                if not candidates or len(candidates) <= 1:
                    disease = str(primary_disease).strip()
            resolved = disease or "UNKNOWN"
            explicit = bool(direct or sentence_candidates)
            confidence = 0.92 if explicit and len(candidates) == 1 else (0.75 if len(paragraph_candidates) == 1 else (0.68 if candidates else 0.40))
            return resolved, confidence

        def add_event(location, cases=0, deaths=0, evidence="", start_offset=0, end_offset=0, metric_type="cases", unit="persons", qualifier=None, value=None, value_min=None, value_max=None, event_disease="UNKNOWN", event_confidence=0.30, source_sentence_id=None, relation_time_frame=None):
            location = _most_specific_event_location(sentence, evidence, location, linker)
            hierarchy = extractors.resolve_location_hierarchy(location.name)
            frame = extract_event_period(sentence, published_at=None)
            metric_frame = extract_event_period(relation_time_frame or "", published_at=None) if relation_time_frame else {}
            if relation_time_frame and (" to " in relation_time_frame or metric_frame.get("event_date_start")):
                time_frame = relation_time_frame
            elif frame.get("event_date_start") and frame.get("event_date_end"):
                time_frame = f"{frame['event_date_start']} to {frame['event_date_end']}"
            else:
                time_frame = frame.get("event_date_start") or frame.get("event_date_end") or ""
            event_period = metric_frame or frame
            metric_value = value if value is not None else (deaths if metric_type == "deaths" else cases)
            event = {
                "disease": event_disease,
                "location_name": hierarchy.get("canonical_name") or location.name,
                "country": hierarchy.get("country") or location.country,
                "country_scope": hierarchy.get("country") or location.country,
                "admin1": hierarchy.get("admin1_name"),
                "admin2": hierarchy.get("admin2_name"),
                "country_iso3": hierarchy.get("country_iso3"),
                "latitude": hierarchy.get("latitude") if hierarchy.get("latitude") is not None else location.latitude,
                "longitude": hierarchy.get("longitude") if hierarchy.get("longitude") is not None else location.longitude,
                # Primary scalar counts are selected by _merge_metric after
                # qualifier classification. Initializing from the raw
                # relation would let a comparison/cumulative value win before
                # a current/new metric is seen.
                "case_count": 0,
                "death_count": 0,
                "metric_type": metric_type,
                "unit": unit,
                "metric_value_min": value_min,
                "metric_value_max": value_max,
                "metric_qualifier": qualifier,
                "time_frame": time_frame,
                "temporal_context": frame.get("period_type") or "current",
                "epistemic_status": classify_epistemic_status(sentence, disease=event_disease),
                "evidence": evidence or sentence.strip(),
                "evidence_offset_start": start + max(0, start_offset),
                "evidence_offset_end": start + max(0, end_offset),
                "event_date_start": event_period.get("event_date_start") or period.get("event_date_start"),
                "event_date_end": event_period.get("event_date_end") or period.get("event_date_end"),
                "validation_flags": [],
                "confidence": event_confidence,
                "disease_confidence": event_confidence,
                "location_confidence": 0.90 if hierarchy.get("country") else 0.45,
                "relation_confidence": min(event_confidence, 0.90),
                "needs_review": event_disease == "UNKNOWN" or not hierarchy.get("country"),
                "relations": [{
                    "type": "reported_in",
                    "evidence": evidence or sentence.strip(),
                    "source_sentence_id": source_sentence_id,
                    "evidence_is_translated": False,
                }],
                "metrics": [],
                "provenance": {
                    "method": "evidence_relation",
                    "source": "surveillance_extraction",
                    "offset_start": start + max(0, start_offset),
                    "offset_end": start + max(0, end_offset),
                    "source_sentence_id": source_sentence_id,
                    "source_text": "original",
                },
                "source_sentence_id": source_sentence_id,
                "source_text": "original",
            }
            metric = {
                "metric_type": metric_type,
                "value": metric_value,
                "unit": unit,
                "qualifier": qualifier,
                "time_frame": time_frame,
                "evidence": evidence or sentence.strip(),
                "confidence": min(event_confidence, 0.90),
                "value_min": value_min,
                "value_max": value_max,
                "source_sentence_id": source_sentence_id,
                "evidence_is_translated": False,
                "country_scope": hierarchy.get("country") or location.country,
            }
            _merge_metric(event, metric)
            if metric_type != "deaths" and deaths is not None:
                _merge_metric(event, {
                    "metric_type": "deaths",
                    "value": int(deaths or 0),
                    "unit": "persons",
                    "qualifier": "explicit_zero" if int(deaths or 0) == 0 else qualifier,
                    "time_frame": time_frame,
                    "evidence": evidence or sentence.strip(),
                    "confidence": min(event_confidence, 0.90),
                    "source_sentence_id": source_sentence_id,
                    "evidence_is_translated": False,
                    "country_scope": hierarchy.get("country") or location.country,
                })
            key = _relation_key(event)
            existing = events.get(key)
            if existing:
                _merge_metric(existing, metric)
                existing["evidence"] = existing.get("evidence") or event["evidence"]
                existing["evidence_offset_start"] = min(existing.get("evidence_offset_start") or event["evidence_offset_start"], event["evidence_offset_start"])
                existing["evidence_offset_end"] = max(existing.get("evidence_offset_end") or event["evidence_offset_end"], event["evidence_offset_end"])
            else:
                events[key] = event

        for relation in local_relations:
            evidence_start = sentence.find(relation.evidence) if relation.evidence else 0
            event_disease = relation.disease
            event_confidence = 0.94 if (event_disease and str(event_disease).upper() != "UNKNOWN") else 0.30
            if not event_disease or str(event_disease).upper() == "UNKNOWN":
                event_disease, event_confidence = resolve_disease(relation.evidence or sentence, max(0, evidence_start))
            relation_evidence = relation.evidence or sentence.strip()
            # Some narrative parsers retain only the numeric span (for
            # example ``28,074 case``). If the disease was resolved from the
            # same sentence, keep that complete original sentence as the
            # traceable evidence instead of creating a disease-less proof.
            if (
                event_disease
                and event_disease.upper() != "UNKNOWN"
                and not extractors.disease_has_textual_evidence(event_disease, relation_evidence)
            ):
                relation_evidence = sentence.strip()
            evidence_start = sentence.find(relation_evidence)
            add_event(
                relation.location,
                cases=relation.cases,
                deaths=relation.deaths,
                evidence=relation_evidence,
                start_offset=max(0, evidence_start),
                end_offset=(max(0, evidence_start) + len(relation_evidence)) if evidence_start >= 0 else len(sentence),
                metric_type=relation.metric_type or ("deaths" if relation.deaths and not relation.cases else qualify_metric_type(sentence, has_cases=bool(relation.cases), has_deaths=bool(relation.deaths))[0]),
                unit="persons",
                qualifier=relation.qualifier or _metric_qualifier(relation.evidence or sentence),
                value=relation.deaths if relation.deaths and not relation.cases else relation.cases,
                value_min=relation.value_min,
                value_max=relation.value_max,
                event_disease=event_disease,
                event_confidence=event_confidence,
                source_sentence_id=relation.source_sentence_id,
                relation_time_frame=relation.time_frame,
            )

        for item in generic:
            event_disease, event_confidence = resolve_disease(item["evidence"], item["offset_start"])
            add_event(
                item["location"],
                evidence=item["evidence"],
                start_offset=item["offset_start"],
                end_offset=item["offset_end"],
                metric_type=item["metric_type"],
                unit=item["unit"],
                qualifier=item["qualifier"],
                value=item["value"],
                event_disease=event_disease,
                event_confidence=event_confidence,
                source_sentence_id=None,
            )

    return _collapse_hierarchical_parser_duplicates(list(events.values()))
