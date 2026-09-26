"""Centralized Rear-Gate Validator & Corrector powered by DeepSeek."""

from __future__ import annotations

import json
import re
import logging
from typing import Any

from . import config
from .agent import chat_json
from .llm_gate import truncate_for_llm

logger = logging.getLogger(__name__)


_NUMBER_WORDS = {
    "zero": 0,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13,
    "fourteen": 14,
    "fifteen": 15,
    "sixteen": 16,
    "seventeen": 17,
    "eighteen": 18,
    "nineteen": 19,
    "twenty": 20,
}


def _parse_count_token(value: str) -> int | None:
    token = (value or "").strip().casefold()
    if token in _NUMBER_WORDS:
        return _NUMBER_WORDS[token]
    compact = re.sub(r"[,\.\s]", "", token)
    if compact.isdigit():
        try:
            return int(compact)
        except ValueError:
            return None
    return None


def _location_aliases(location: str) -> list[str]:
    normalized = _normalize(location)
    aliases = {normalized}
    if normalized in {
        "democratic republic of the congo",
        "democratic republic of congo",
        "drc",
    }:
        aliases.update({"democratic republic of the congo", "democratic republic of congo", "drc"})
    return sorted((item for item in aliases if item), key=len, reverse=True)


def _scoped_metric_count(
    evidence: str,
    location: str,
    metric: str,
    source_text: str = "",
) -> int | None:
    """Return a metric explicitly bound to ``location`` in one evidence quote.

    Presence of a number anywhere in an article is not enough for a child
    event. This conservative parser accepts direct forms such as ``20 cases
    in Uganda`` and ``the DRC reported 6757 cases``. It also handles the WHO
    form ``3269 deaths ... including two in Uganda``. Unbound totals are
    rejected instead of being copied to every country.
    """
    source = re.sub(r"\s+", " ", evidence or "").strip()
    if not source or not location:
        return None
    aliases = _location_aliases(location)
    location_pattern = re.compile("|".join(re.escape(alias) for alias in aliases), re.IGNORECASE)

    # DeepSeek is instructed to quote the supporting sentence, but many news
    # articles put the place in the preceding sentence, headline, or section
    # lead. Keep the quoted sentence authoritative for the number and add only
    # a narrow source context window for the location binding.
    sources = [source]
    if not location_pattern.search(source) and source_text:
        normalized_source_text = re.sub(r"\s+", " ", source_text or "").strip()
        start = normalized_source_text.casefold().find(source.casefold())
        if start >= 0:
            context = normalized_source_text[max(0, start - 350):start + len(source) + 180]
            if location_pattern.search(context):
                sources.append(context)
    if not any(location_pattern.search(candidate) for candidate in sources):
        return None

    if _normalize(location) == "germany" and re.search(
        r"(?:diagnosed|confirmed)\s+in\s+(?:the\s+)?democratic republic of the congo"
        r".{0,100}\btreated\s+in\s+germany\b",
        source,
        re.IGNORECASE,
    ) and not re.search(r"\b(?:cases?|infections?)\s+(?:reported\s+)?in\s+germany\b", source, re.IGNORECASE):
        return None

    number_pattern = re.compile(
        r"\b(?:\d[\d,.]*|" + "|".join(_NUMBER_WORDS) + r")\b",
        re.IGNORECASE,
    )
    label_pattern = (
        re.compile(
            r"\b(?:confirmed\s+|suspected\s+|cumulative\s+)?"
            r"(?:cases?|infections?|casos?|kasus|ca(?:\s+mắc)?|ca\s+bệnh|"
            r"trường\s+hợp)\b",
            re.IGNORECASE,
        )
        if metric == "cases"
        else re.compile(
            r"\b(?:deaths?|fatalities|mortality|died|dead|kematian|"
            r"meninggal(?:\s+dunia)?|maut|tử\s+vong|เสียชีวิต)\b",
            re.IGNORECASE,
        )
    )
    opposite_pattern = (
        re.compile(
            r"\b(?:deaths?|fatalities|mortality|died|dead|kematian|"
            r"meninggal(?:\s+dunia)?|maut|tử\s+vong|เสียชีวิต)\b",
            re.IGNORECASE,
        )
        if metric == "cases"
        else re.compile(
            r"\b(?:cases?|infections?|casos?|kasus|ca(?:\s+mắc)?|ca\s+bệnh|"
            r"trường\s+hợp)\b",
            re.IGNORECASE,
        )
    )
    alias_pattern = "|".join(re.escape(alias) for alias in aliases)
    all_metric_pattern = re.compile(
        rf"(?:{label_pattern.pattern})|(?:{opposite_pattern.pattern})",
        re.IGNORECASE,
    )
    candidates: list[tuple[int, int, int]] = []

    # If the place occurs only in the surrounding source context, bind the
    # metric to the quoted sentence itself. This prevents a nearby weekly
    # figure (for example 381 cases) from replacing the quoted cumulative
    # total (2,913 cases).
    if len(sources) > 1 and not location_pattern.search(source):
        quote_candidates: list[tuple[int, int, int]] = []
        for match in re.finditer(r"\b(?:\d[\d,.]*|" + "|".join(_NUMBER_WORDS) + r")\b", source, re.IGNORECASE):
            value = _parse_count_token(match.group(0))
            if value is None or value <= 0:
                continue
            if 1900 <= value <= 2100:
                continue
            if (
                match.end() < len(source) and source[match.end()] == "/"
            ) or (match.start() > 0 and source[match.start() - 1] == "/"):
                continue
            after = source[match.end():match.end() + 55]
            before = source[max(0, match.start() - 140):match.start()]
            target = label_pattern.search(after[:45])
            if not target:
                continue
            if re.search(r"\b(?:\d[\d,.]*|" + "|".join(_NUMBER_WORDS) + r")\b", after[:target.start()], re.IGNORECASE):
                continue
            opposite_before = opposite_pattern.search(before[-80:])
            if opposite_before and metric == "cases":
                continue
            score = 5
            if re.search(
                r"\b(?:cumulative|l[ũuù]y\s+k[eế]|kumulatif|so\s+far|to\s+date|"
                r"hingga|sampai|sejak|from\s+the\s+beginning)\b",
                before,
                re.IGNORECASE,
            ):
                score += 2
            quote_candidates.append((score, -match.start(), value))
        if metric == "deaths" and re.search(
            r"(?:first|đầu\s+tiên|pertama(?:\s+kali)?|yang\s+pertama)"
            r"[^.!?]{0,45}(?:deaths?|death|kematian|meninggal|maut|tử\s+vong|เสียชีวิต)"
            r"|(?:deaths?|death|kematian|meninggal|maut|tử\s+vong|เสียชีวิต)"
            r"[^.!?]{0,45}(?:first|đầu\s+tiên|pertama(?:\s+kali)?|yang\s+pertama)",
            source,
            re.IGNORECASE,
        ):
            quote_candidates.append((7, 0, 1))
        if quote_candidates:
            quote_candidates.sort(reverse=True)
            return quote_candidates[0][2]

    for candidate_source in sources:
      for match in number_pattern.finditer(candidate_source):
        value = _parse_count_token(match.group(0))
        if value is None or value <= 0:
            continue
        if 1900 <= value <= 2100:
            continue
        # Do not treat the day in a date such as ``8/7`` as an epidemiology
        # metric when a nearby location happens to be in the same sentence.
        if (
            match.end() < len(candidate_source)
            and candidate_source[match.end()] == "/"
        ) or (match.start() > 0 and candidate_source[match.start() - 1] == "/"):
            continue
        after = candidate_source[match.end():min(len(candidate_source), match.end() + 100)]
        before = candidate_source[max(0, match.start() - 140):match.start()]
        immediate_label = label_pattern.search(after[:45])
        preceding_label = list(label_pattern.finditer(before[-90:]))
        preceding_label = preceding_label[-1] if preceding_label else None

        # Direct country binding: ``20 cases in Uganda`` or ``6757 in DRC``
        # where the metric label appears immediately before the number.
        location_after = re.search(
            r"\b(?:in|from|at|di|dari|tại|từ|ở)\s+(?:the\s+)?(?:" + alias_pattern + r")\b",
            after,
            re.IGNORECASE,
        )
        between_number_location = after[:location_after.start()] if location_after else ""
        number_between = number_pattern.search(between_number_location)
        if location_after and not number_between and (immediate_label or preceding_label):
            score = 6 if immediate_label else 5
            if re.search(r"\bincluding\s*$", before[-25:], re.IGNORECASE):
                score = 2
            candidates.append((score, -abs(match.start() - (match.end() + location_after.start())), value))

        # Some Vietnamese/Indonesian sentences state the place after a
        # metric clause: ``2,913 cases ... Gia Lai``. A comparison number may
        # occur between the metric and the place, so accept that layout only
        # when the quoted number is explicitly cumulative/to-date.
        location_later = re.search(
            r"(?:" + alias_pattern + r")\b",
            after[:220],
            re.IGNORECASE,
        )
        if immediate_label and location_later:
            between = after[:location_later.start()]
            has_intervening_number = bool(number_pattern.search(between))
            comparison_number = bool(re.search(
                r"\b(?:tăng|meningkat|naik|increase(?:d)?|up\s+by|compared\s+with|"
                r"compared\s+to|so\s+với)\b[^\d]{0,20}$",
                before,
                re.IGNORECASE,
            ))
            has_cumulative_marker = bool(re.search(
                r"\b(?:cumulative|kumulatif|l[ũuù]y\s+k[eế]|so\s+far|hingga|sampai|"
                r"year\s+to\s+date|ytd)\b",
                before,
                re.IGNORECASE,
            ))
            if not comparison_number and (not has_intervening_number or has_cumulative_marker):
                candidates.append((6 if has_cumulative_marker else 4, -match.start(), value))

        # Country-first binding: ``DRC reported 3267 deaths``. The target
        # label must be the first metric label after the number; otherwise a
        # case total can be mistaken for a death total in the same sentence.
        for loc in location_pattern.finditer(before):
            tail = candidate_source[match.end():min(len(candidate_source), match.end() + 45)]
            target_label = label_pattern.search(tail)
            # ``label_pattern`` also includes ASEAN wording such as ``ca
            # mắc``, ``kasus``, ``kematian``, and ``tử vong``. The old
            # English-only check silently rejected otherwise valid bindings.
            any_label = all_metric_pattern.search(tail)
            window_start = max(0, match.start() - 140)
            location_end = window_start + loc.end()
            connector = candidate_source[location_end:match.start()]
            has_connector = bool(re.search(
                r"\b(?:reported|recorded|has|had|including|total|"
                r"mencatat|mencapai|tercatat|menurut|dilaporkan|"
                r"ghi\s+nhận|đã\s+ghi\s+nhận|đã\s+báo\s+cáo|"
                r"được\s+báo\s+cáo)\b",
                connector,
                re.IGNORECASE,
            ))
            number_before_target_label = bool(
                number_pattern.search(tail[:target_label.start()])
            ) if target_label else False
            if (
                target_label
                and any_label
                and target_label.start() <= any_label.start()
                and not number_before_target_label
                and has_connector
            ):
                candidates.append((5, -abs(match.start() - (max(0, match.start() - 140) + loc.start())), value))
                break

        # WHO-style inherited metric: ``3269 deaths ..., including two in
        # Uganda``. The number must be in the same inclusion clause.
        if metric == "deaths":
            inherited = re.search(
                r"\bincluding\s+" + re.escape(match.group(0))
                + r"(?:\s+deaths?)?\s+in\s+(?:the\s+)?(?:" + alias_pattern + r")\b",
                candidate_source,
                re.IGNORECASE,
            )
            if inherited:
                candidates.append((7, -inherited.start(), value))

        # Vietnamese/Indonesian reporting often says “the first death” as a
        # word rather than the digit 1. Accept it only when the death label is
        # in the same clause and the location is explicitly bound.
        if metric == "deaths" and re.search(
            r"(?:first|đầu\s+tiên|pertama(?:\s+kali)?|yang\s+pertama)"
            r"[^.!?]{0,45}(?:deaths?|death|kematian|meninggal|maut|tử\s+vong|เสียชีวิต)"
            r"|(?:deaths?|death|kematian|meninggal|maut|tử\s+vong|เสียชีวิต)"
            r"[^.!?]{0,45}(?:first|đầu\s+tiên|pertama(?:\s+kali)?|yang\s+pertama)",
            candidate_source,
            re.IGNORECASE,
        ) and location_pattern.search(candidate_source):
            candidates.append((5, -len(candidate_source), 1))

    # ASEAN source phrasing often places a country/province before a chain of
    # metrics without an English connector, for example:
    # ``Indonesia ... mencapai 39672 kasus dengan 105 kematian`` or
    # ``Gia Lai ghi nhận 2913 ca mắc``. Treat the nearest location in the
    # preceding window as an explicit binding when the number is immediately
    # followed by the requested metric label.
    if not candidates:
        for match in number_pattern.finditer(source):
            value = _parse_count_token(match.group(0))
            if value is None or value <= 0:
                continue
            before = source[max(0, match.start() - 180):match.start()]
            after = source[match.end():min(len(source), match.end() + 55)]
            if not location_pattern.search(before):
                continue
            label_match = label_pattern.search(after[:45])
            if not label_match or number_pattern.search(after[:label_match.start()]):
                continue
            candidates.append((4, -abs(match.start()), value))

    if not candidates:
        return None
    candidates.sort(reverse=True)
    return candidates[0][2] if candidates[0][0] >= 3 else None


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s-]", " ", (value or "").lower())).strip()


def _compact_review_body(text: str, limit: int) -> str:
    """Keep evidence-bearing body sentences without sending the whole crawl.

    The local pipeline has already fetched and cleaned the article. DeepSeek
    receives only a bounded review packet: the opening context plus sentences
    containing metrics, disease/outbreak terms, or geography. The exact source
    sentence remains required by ``verify_ground_truth_guardrails``.
    """
    value = re.sub(r"\s+", " ", text or "").strip()
    if len(value) <= limit:
        return value
    sentences = [
        part.strip()
        for part in re.split(r"(?<=[.!?。！？])\s+|\n+", value)
        if part.strip()
    ]
    if not sentences:
        return value[:limit]
    anchor = re.compile(
        r"\b\d[\d,.]*\b|case|cases|confirmed|death|deaths|died|fatal|"
        r"kematian|meninggal|kasus|outbreak|epidemic|wabah|affected|"
        r"country|province|district|city|health zone|democratic republic|uganda|france|germany",
        re.I,
    )
    selected: list[str] = []
    used: set[str] = set()

    def add(sentence: str) -> bool:
        sentence = sentence.strip()
        if not sentence or sentence in used:
            return True
        candidate = "\n".join([*selected, sentence])
        if len(candidate) > limit:
            return False
        selected.append(sentence)
        used.add(sentence)
        return True

    # Preserve title/lede context, then add all high-value evidence in source order.
    for sentence in sentences[:2]:
        add(sentence)
    for sentence in sentences[2:]:
        if anchor.search(sentence) and not add(sentence):
            break
    return "\n".join(selected)[:limit].rstrip()


def verify_ground_truth_guardrails(
    result: dict[str, Any],
    raw_text: str,
    allowed_diseases: list[str] | None = None,
) -> dict[str, Any]:
    """Strict post-LLM anti-hallucination verification in Python:
    1. Verbatim Evidence Check: Each sub-event must have an exact sentence quote found in raw_text.
       If evidence is missing or hallucinated, the event is dropped.
    2. Strict Numeric Grounding: case_count and death_count must literally appear in raw_text.
       If an LLM invents a count, it is forced to 0.
    3. Location-Metric Binding: each non-zero metric must be explicitly tied to
       the event location in the quoted evidence. Article-wide totals are not
       copied into every country.
    4. Disease Concept Normalization: Disease name must be in allowed ASEAN concepts.
    5. Non-Event / Empty Clear: If no valid sub-events remain and is_health_related was only based on hallucinated events, clean up.
    """
    if not isinstance(result, dict):
        return {}

    sub_events = result.get("sub_events") or []
    verified_events = []
    text_lower = raw_text.lower()
    
    raw_digits_set = set(re.findall(r"\b\d[\d,\.]*\b", raw_text))
    raw_clean_digits = {re.sub(r"[,\.]", "", d) for d in raw_digits_set}

    for evt in sub_events:
        if not isinstance(evt, dict):
            continue
        
        # 1. Verbatim quote check
        evidence = str(evt.get("evidence") or "").strip()
        clean_evidence = re.sub(r'["“”\']', '', evidence).strip().lower()
        if not clean_evidence:
            logger.warning("Dropping LLM sub-event without source evidence")
            continue
        if clean_evidence and clean_evidence not in text_lower:
            words = clean_evidence.split()
            found_chunk = False
            if len(words) >= 6:
                chunk = " ".join(words[:8])
                if chunk in text_lower:
                    found_chunk = True
            if not found_chunk:
                logger.warning("Dropping hallucinated LLM sub-event: evidence '%s' not in source text", evidence[:80])
                continue

        # 2. Strict Numeric Grounding
        case_count = int(evt.get("case_count") or 0)
        death_count = int(evt.get("death_count") or 0)

        if case_count > 0:
            str_cases = str(case_count)
            if str_cases not in raw_clean_digits and str_cases not in text_lower:
                logger.warning("Resetting hallucinated case count %d from LLM: not in source text", case_count)
                case_count = 0
            scoped_cases = _scoped_metric_count(
                evidence,
                str(evt.get("location_name") or evt.get("country") or ""),
                "cases",
                raw_text,
            )
            if scoped_cases is None:
                logger.warning(
                    "Resetting unbound case count %d for location=%s",
                    case_count,
                    evt.get("location_name") or evt.get("country"),
                )
                case_count = 0
            else:
                # Prefer the source-bound country metric over an article-wide
                # total selected by the model (e.g. 6757 vs 6778 in DRC).
                case_count = scoped_cases

        if death_count > 0:
            str_deaths = str(death_count)
            first_death_phrase = bool(re.search(
                r"(?:first|đầu\s+tiên|pertama(?:\s+kali)?|yang\s+pertama)"
                r"[^.!?]{0,45}(?:deaths?|death|kematian|meninggal|maut|tử\s+vong|เสียชีวิต)"
                r"|(?:deaths?|death|kematian|meninggal|maut|tử\s+vong|เสียชีวิต)"
                r"[^.!?]{0,45}(?:first|đầu\s+tiên|pertama(?:\s+kali)?|yang\s+pertama)",
                evidence,
                re.IGNORECASE,
            ))
            if str_deaths not in raw_clean_digits and str_deaths not in text_lower and not (
                death_count == 1 and first_death_phrase
            ):
                logger.warning("Resetting hallucinated death count %d from LLM: not in source text", death_count)
                death_count = 0
            scoped_deaths = _scoped_metric_count(
                evidence,
                str(evt.get("location_name") or evt.get("country") or ""),
                "deaths",
                raw_text,
            )
            if scoped_deaths is None:
                logger.warning(
                    "Resetting unbound death count %d for location=%s",
                    death_count,
                    evt.get("location_name") or evt.get("country"),
                )
                death_count = 0
            else:
                death_count = scoped_deaths

        # 3. Disease constraint
        evt_disease = evt.get("disease") or result.get("disease_classification") or "UNKNOWN"
        if allowed_diseases and evt_disease != "UNKNOWN":
            matched = next((d for d in allowed_diseases if d.lower() == evt_disease.lower()), None)
            if matched:
                evt["disease"] = matched
            else:
                evt["disease"] = "UNKNOWN"

        evt["case_count"] = case_count
        evt["death_count"] = death_count
        if case_count <= 0 and death_count <= 0:
            logger.warning(
                "Dropping LLM sub-event without location-bound metrics: location=%s evidence=%s",
                evt.get("location_name") or evt.get("country"),
                evidence[:100],
            )
            continue
        verified_events.append(evt)

    result["sub_events"] = verified_events
    return result


def validate_and_correct_events(
    text: str,
    title: str = "",
    source_url: str = "",
    draft_disease: str = "UNKNOWN",
    draft_location: str = "",
    draft_country: str = "",
    draft_case_count: int = 0,
    draft_death_count: int = 0,
    draft_sub_events: list[dict[str, Any]] | None = None,
    candidate_diseases: list[str] | None = None,
    review_focus: list[str] | None = None,
    mentioned_countries: list[str] | None = None,
) -> dict[str, Any] | None:
    """Centralized Rear-Gate LLM Validator & Corrector.
    
    Enforces strict zero-hallucination guardrails:
    1. Disease must strictly match one of the 31 ASEAN master concepts.
    2. Educational/info articles without active case/outbreak evidence MUST return empty sub_events [].
    3. Locations must be grounded in country/province/city.
    4. Overwrites draft events with verified atomic events.
    """
    if not config.AGENT_ENABLED:
        return None

    allowed_diseases = [
        item["canonical_name"] for item in config.DISEASE_MASTER_CONCEPTS
    ] if config.DISEASE_MASTER_CONCEPTS else []

    focus = list(dict.fromkeys(review_focus or ["disease", "location", "counts", "outbreak status"]))
    is_complex = "multi-country" in focus or "outbreak status" in focus
    counts_missing = (
        "counts" in focus and draft_case_count <= 0 and draft_death_count <= 0
    )
    prompt_limit = (
        config.DEEPSEEK_PROMPT_CHARS
        if is_complex or counts_missing
        else min(config.DEEPSEEK_PROMPT_CHARS, 2800)
    )
    truncated_text = _compact_review_body(text, prompt_limit)

    system_prompt = (
        "You are an expert epidemiological surveillance validator for ASEAN Health Authorities. "
        "Your role is to strictly validate and correct draft extractions from disease surveillance reports. "
        "STRICT GUARDRAILS:\n"
        "1. ZERO HALLUCINATION POLICY: Extract metrics ONLY if explicitly stated in text.\n"
        "2. NON-EVENT FILTER: If the article is purely educational, informational, or coordination/prevention meeting with NO active case/outbreak metrics, set is_health_related=true/false appropriately and sub_events=[].\n"
        "3. DISEASE CONSTRAINTS: 'disease' MUST match one of the allowed official ASEAN concepts.\n"
        "4. ATOMIC EVENTS: Return distinct country-level (disease, location, case_count, death_count) tuples. If a country total is present, do not also return province/city subset counts because they double-count the total.\n"
        "5. REVIEW ONLY: Correct the local draft using the supplied body evidence; do not fetch or browse the URL.\n"
        "6. COMPLETENESS: Include every explicitly stated country total relevant to the draft; do not omit a country merely because another country has a larger total.\n"
        "7. METRIC SCOPE: Bind each case/death number to the same country in the exact evidence sentence. Never assign an article-wide total to a country, a treatment country, a recovered-patient count, or a clinical-trial participant count.\n"
        "8. PERIOD SELECTION: If a country total cumulative/to-date figure and a weekly/monthly figure both appear, use the cumulative/to-date total for the country-level event; use the shorter period only as a detail when it has a distinct location.\n"
        "9. SOURCE BOUNDARY: Articles can contain a copied footer or a second syndicated article. Prefer the primary headline/lede and its first complete report; do not mix a later appended article's metrics into the primary event.\n"
        "10. OUTBREAK STATUS: Set outbreak_alert=true only when the article reports an active outbreak/epidemic/cluster/KLB or active transmission as an incident. A prevention campaign, routine surveillance total, rising risk, or a warning that an outbreak could occur is not itself an outbreak.\n"
        "11. OVERRIDE: If no active incident event is supported, return sub_events=[] so the local draft can be cleared.\n"
        "Output valid JSON ONLY matching the requested schema."
    )

    user_prompt = (
        f"Source URL: {source_url}\n"
        f"Article Title: {title}\n\n"
        f"Clean Article Body Evidence (already extracted locally; do not fetch the URL):\n{truncated_text}\n\n"
        f"Draft Extracted Disease: {draft_disease}\n"
        f"Draft Location: {draft_location} ({draft_country})\n"
        f"Draft Cases: {draft_case_count}, Deaths: {draft_death_count}\n"
        f"Draft Candidate Diseases: {json.dumps(candidate_diseases or [])}\n"
        f"Review Focus: {json.dumps(focus)}\n"
        f"Countries explicitly seen by local extraction: {json.dumps(mentioned_countries or [])}\n"
        f"Allowed ASEAN Master Diseases: {json.dumps(allowed_diseases)}\n\n"
        "Return JSON ONLY in this exact format:\n"
        "{\n"
        '  "is_health_related": bool,\n'
        '  "outbreak_alert": bool,\n'
        '  "disease_classification": "Primary Disease Name from Allowed List or UNKNOWN",\n'
        '  "sub_events": [\n'
        "    {\n"
        '      "disease": "Disease Name",\n'
        '      "country": "Country Name",\n'
        '      "location_name": "Specific City or Province",\n'
        '      "admin1": "Province/State or null",\n'
        '      "admin2": "City/District or null",\n'
        '      "case_count": int,\n'
        '      "death_count": int,\n'
        '      "evidence": "Exact supporting sentence from article text"\n'
        "    }\n"
        "  ]\n"
        "}"
    )

    try:
        result = chat_json(
            system_prompt,
            user_prompt,
            max_tokens=min(
                config.DEEPSEEK_RESPONSE_MAX_TOKENS,
                config.DEEPSEEK_MAX_TOKENS,
                800 if is_complex else 500,
            ),
        )
        if not isinstance(result, dict):
            return None
        return verify_ground_truth_guardrails(result, text, allowed_diseases)
    except Exception as exc:
        logger.warning("Rear-gate DeepSeek validation failed: %s", exc)
        return None


def detect_disease(text: str) -> dict[str, Any] | None:
    """Legacy helper fallback for disease concept resolution."""
    res = validate_and_correct_events(text, draft_disease="UNKNOWN")
    if res and res.get("disease_classification") and res["disease_classification"] != "UNKNOWN":
        return {"canonical_name": res["disease_classification"], "confidence": config.DEEPSEEK_MIN_CONFIDENCE}
    return None


def detect_location(text: str) -> dict[str, Any] | None:
    """Legacy helper fallback for location resolution."""
    res = validate_and_correct_events(text)
    if res and res.get("sub_events") and len(res["sub_events"]) > 0:
        evt = res["sub_events"][0]
        return {
            "name": evt.get("location_name"),
            "country": evt.get("country"),
            "admin1": evt.get("admin1"),
            "admin2": evt.get("admin2")
        }
    return None
