"""Optional runtime disease resolver constrained by WHO ICD-11 concepts."""

from __future__ import annotations

import json
import re
from typing import Any

from . import config
from .agent import chat_json


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s-]", " ", (value or "").lower())).strip()


def detect_disease(text: str) -> dict[str, Any] | None:
    """Return a WHO-approved concept, or None when the optional LLM is unavailable."""
    if not config.WHO_DISEASE_CONCEPTS:
        return None

    allowed = [
        {
            "canonical_label": item["canonical_name"],
            "english_name": item.get("english_name") or item["canonical_name"],
            "icd_code": item.get("ontology_code"),
        }
        for item in config.WHO_DISEASE_CONCEPTS
    ]
    prompt = (
        "Detect the PRIMARY disease or pathogen of this report. Return JSON only: "
        "{canonical_label,english_name,icd_code,confidence} or null values. "
        "canonical_label and icd_code MUST exactly match one allowed WHO ICD-11 "
        "concept. Prefer the title, headline and lead paragraph. Diseases mentioned "
        "only as examples, comparisons, prevention targets, historical background, "
        "or a list introduced by 'including' are secondary and must not replace the "
        "primary disease. Do not infer from symptoms alone; preserve negation.\n\n"
        f"allowed_concepts={json.dumps(allowed, ensure_ascii=False)}\n"
        f"report={json.dumps((text or '')[:5000], ensure_ascii=False)}"
    )
    result = chat_json(
        "You are a cautious medical entity detector. Output valid JSON only.",
        prompt,
        max_tokens=config.DEEPSEEK_MAX_TOKENS,
    )

    label = str(result.get("canonical_label") or "").strip()
    code = str(result.get("icd_code") or "").strip()
    try:
        score = float(result.get("confidence") or 0.0)
    except (TypeError, ValueError):
        score = 0.0
    by_label = {_normalize(item["canonical_name"]): item for item in config.WHO_DISEASE_CONCEPTS}
    by_code = {str(item.get("ontology_code")): item for item in config.WHO_DISEASE_CONCEPTS if item.get("ontology_code")}
    concept = by_code.get(code) or by_label.get(_normalize(label))
    if not concept or score < config.DEEPSEEK_MIN_CONFIDENCE:
        return None
    return {
        "canonical_name": concept["canonical_name"],
        "english_name": concept.get("english_name") or concept["canonical_name"],
        "ontology_code": concept.get("ontology_code"),
        "confidence": min(score, 0.99),
        "resolution_source": result.get("_provider", "agent") + "+WHO ICD-11",
    }


def detect_location(text: str, source_language: str = "", source_country: str = "") -> dict[str, Any] | None:
    """Resolve an unseen location to an existing DB gazetteer entry.

    DeepSeek is never allowed to invent coordinates. It may only select an
    exact location already populated in the ASEAN gazetteer.
    """
    if not config.AGENT_ENABLED or not config.LOCATION_COORDS:
        return None

    candidate_names = list(config.LOCATION_COORDS)
    if source_country:
        country_candidates = [
            name for name in candidate_names
            if config.LOCATION_COUNTRIES.get(name) == source_country
        ]
        if country_candidates:
            candidate_names = country_candidates
    # Keep the prompt bounded if a URL has no country metadata.
    max_candidates = int(__import__("os").getenv("DEEPSEEK_LOCATION_MAX_CANDIDATES", "3000"))
    candidate_names = sorted(candidate_names)[:max_candidates]
    allowed = [
        {"name": name, "country": config.LOCATION_COUNTRIES.get(name, "")}
        for name in candidate_names
    ]
    prompt = (
        "Extract the primary incident location from this news report. Return JSON only: "
        "{location_name,confidence} or null values. location_name MUST exactly match "
        "one allowed gazetteer name. Ignore publisher datelines, navigation, related "
        "stories, comparison countries, and places mentioned only as background. "
        "Do not invent a place or coordinates. If no place is explicit, return null.\n\n"
        f"source_language={json.dumps(source_language)} source_country={json.dumps(source_country)}\n"
        f"allowed_locations={json.dumps(allowed, ensure_ascii=False)}\n"
        f"report={json.dumps((text or '')[:7000], ensure_ascii=False)}"
    )
    result = chat_json(
        "You are a cautious geospatial news entity extractor. Output valid JSON only.",
        prompt,
        max_tokens=500,
    )
    name = str(result.get("location_name") or "").strip()
    try:
        score = float(result.get("confidence") or 0.0)
    except (TypeError, ValueError):
        score = 0.0

    by_name = {_normalize(name): name for name in candidate_names}
    canonical = by_name.get(_normalize(name))
    if not canonical or score < config.DEEPSEEK_LOCATION_MIN_CONFIDENCE:
        return None
    return {"location_name": canonical, "confidence": min(score, 0.99)}
