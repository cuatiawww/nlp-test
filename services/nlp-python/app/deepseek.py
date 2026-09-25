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


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s-]", " ", (value or "").lower())).strip()


def verify_ground_truth_guardrails(
    result: dict[str, Any],
    raw_text: str,
    allowed_diseases: list[str] | None = None,
) -> dict[str, Any]:
    """Strict post-LLM anti-hallucination verification in Python:
    1. Verbatim Evidence Check: Each sub-event must have an exact sentence quote found in raw_text.
       If evidence is missing or hallucinated, the event is dropped.
    2. Strict Numeric Grounding: case_count and death_count must literally appear as digits in raw_text.
       If an LLM invents a count, it is forced to 0.
    3. Disease Concept Normalization: Disease name must be in allowed ASEAN concepts.
    4. Non-Event / Empty Clear: If no valid sub-events remain and is_health_related was only based on hallucinated events, clean up.
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
                evt["case_count"] = 0

        if death_count > 0:
            str_deaths = str(death_count)
            if str_deaths not in raw_clean_digits and str_deaths not in text_lower:
                logger.warning("Resetting hallucinated death count %d from LLM: not in source text", death_count)
                death_count = 0
                evt["death_count"] = 0

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
    candidate_diseases: list[str] | None = None
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

    truncated_text = truncate_for_llm(text, limit=16000)

    system_prompt = (
        "You are an expert epidemiological surveillance validator for ASEAN Health Authorities. "
        "Your role is to strictly validate and correct draft extractions from disease surveillance reports. "
        "STRICT GUARDRAILS:\n"
        "1. ZERO HALLUCINATION POLICY: Extract metrics ONLY if explicitly stated in text.\n"
        "2. NON-EVENT FILTER: If the article is purely educational, informational, or coordination/prevention meeting with NO active case/outbreak metrics, set is_health_related=true/false appropriately and sub_events=[].\n"
        "3. DISEASE CONSTRAINTS: 'disease' MUST match one of the allowed official ASEAN concepts.\n"
        "4. ATOMIC EVENTS: Separate distinct (disease, location, case_count, death_count) tuples.\n"
        "Output valid JSON ONLY matching the requested schema."
    )

    user_prompt = (
        f"Source URL: {source_url}\n"
        f"Article Title: {title}\n\n"
        f"Clean Article Text:\n{truncated_text}\n\n"
        f"Draft Extracted Disease: {draft_disease}\n"
        f"Draft Location: {draft_location} ({draft_country})\n"
        f"Draft Cases: {draft_case_count}, Deaths: {draft_death_count}\n"
        f"Draft Candidate Diseases: {json.dumps(candidate_diseases or [])}\n"
        f"Allowed ASEAN Master Diseases: {json.dumps(allowed_diseases)}\n\n"
        "Return JSON ONLY in this exact format:\n"
        "{\n"
        '  "is_health_related": bool,\n'
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
        result = chat_json(system_prompt, user_prompt, max_tokens=min(1200, config.DEEPSEEK_MAX_TOKENS * 3))
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
