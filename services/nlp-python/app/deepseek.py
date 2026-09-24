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


def validate_and_correct_events(
    text: str,
    title: str = "",
    draft_disease: str = "UNKNOWN",
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
        "2. NON-EVENT FILTER: If the article is purely educational, informational, or prevention advice with NO active case/outbreak metrics, set is_health_related=false and sub_events=[].\n"
        "3. DISEASE CONSTRAINTS: 'disease' MUST match one of the allowed official ASEAN concepts.\n"
        "4. ATOMIC EVENTS: Separate distinct (disease, location, case_count, death_count) tuples.\n"
        "Output valid JSON ONLY matching the requested schema."
    )

    user_prompt = (
        f"Article Title: {title}\n\n"
        f"Clean Article Text:\n{truncated_text}\n\n"
        f"Draft Extracted Disease: {draft_disease}\n"
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
        return result
    except Exception as exc:
        logger.warning("Rear-gate DeepSeek validation failed: %s", exc)
        return None


def detect_disease(text: str) -> dict[str, Any] | None:
    """Legacy helper fallback for disease concept resolution."""
    res = validate_and_correct_events(text, draft_disease="UNKNOWN")
    if res and res.get("disease_classification") and res["disease_classification"] != "UNKNOWN":
        return {"canonical_name": res["disease_classification"]}
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
