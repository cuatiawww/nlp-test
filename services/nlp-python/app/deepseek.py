"""Optional runtime disease resolver constrained by WHO ICD-11 concepts."""

from __future__ import annotations

import json
import re
import urllib.request
from typing import Any

from . import config


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s-]", " ", (value or "").lower())).strip()


def _json_response(text: str) -> dict[str, Any]:
    text = (text or "").strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.I)
    result = json.loads(text)
    return result if isinstance(result, dict) else {}


def detect_disease(text: str) -> dict[str, Any] | None:
    """Return a WHO-approved concept, or None when the optional LLM is unavailable."""
    if not config.DEEPSEEK_API_KEY or not config.WHO_DISEASE_CONCEPTS:
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
        "Detect an explicitly mentioned disease in this report. Return JSON only: "
        "{canonical_label,english_name,icd_code,confidence} or null values. "
        "canonical_label and icd_code MUST exactly match one allowed WHO ICD-11 "
        "concept. Translate the detected disease meaning to English in english_name. "
        "Do not infer a disease from symptoms alone; preserve negation.\n\n"
        f"allowed_concepts={json.dumps(allowed, ensure_ascii=False)}\n"
        f"report={json.dumps((text or '')[:5000], ensure_ascii=False)}"
    )
    body = {
        "model": config.DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": "You are a cautious medical entity detector. Output JSON only."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "max_completion_tokens": config.DEEPSEEK_MAX_TOKENS,
    }
    request = urllib.request.Request(
        (config.DEEPSEEK_BASE_URL if config.DEEPSEEK_BASE_URL.endswith("/chat/completions") else f"{config.DEEPSEEK_BASE_URL}/chat/completions"),
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {config.DEEPSEEK_API_KEY}",
            "Content-Type": "application/json",
            "User-Agent": "disease-surveillance-nlp/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=config.DEEPSEEK_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read())
        message = payload["choices"][0]["message"]
        result = _json_response(message.get("content") or "")
    except Exception:
        return None

    label = str(result.get("canonical_label") or "").strip()
    code = str(result.get("icd_code") or "").strip()
    score = float(result.get("confidence") or 0.0)
    by_label = {_normalize(item["canonical_name"]): item for item in config.WHO_DISEASE_CONCEPTS}
    by_code = {str(item.get("ontology_code")): item for item in config.WHO_DISEASE_CONCEPTS if item.get("ontology_code")}
    concept = by_code.get(code) or by_label.get(_normalize(label))
    if not concept or score < config.DEEPSEEK_MIN_CONFIDENCE:
        return None
    return {"canonical_name": concept["canonical_name"], "confidence": min(score, 0.99)}


def detect_location(text: str, source_language: str = "", source_country: str = "") -> dict[str, Any] | None:
    """Resolve an unseen location to an existing DB gazetteer entry.

    DeepSeek is never allowed to invent coordinates. It may only select an
    exact location already populated in the ASEAN gazetteer.
    """
    if not config.DEEPSEEK_API_KEY or not config.LOCATION_COORDS:
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
    body = {
        "model": config.DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": "You are a cautious geospatial news entity extractor. Output JSON only."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "max_completion_tokens": 500,
    }
    request = urllib.request.Request(
        (config.DEEPSEEK_BASE_URL if config.DEEPSEEK_BASE_URL.endswith("/chat/completions") else f"{config.DEEPSEEK_BASE_URL}/chat/completions"),
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {config.DEEPSEEK_API_KEY}",
            "Content-Type": "application/json",
            "User-Agent": "disease-surveillance-nlp/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=config.DEEPSEEK_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read())
        result = _json_response(payload["choices"][0]["message"].get("content") or "")
        name = str(result.get("location_name") or "").strip()
        score = float(result.get("confidence") or 0.0)
    except Exception:
        return None

    by_name = {_normalize(name): name for name in candidate_names}
    canonical = by_name.get(_normalize(name))
    if not canonical or score < config.DEEPSEEK_LOCATION_MIN_CONFIDENCE:
        return None
    return {"location_name": canonical, "confidence": min(score, 0.99)}
