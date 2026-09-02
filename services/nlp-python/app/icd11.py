"""Dynamic WHO ICD-11 MMS discovery and self-learning module.

Combines unconstrained LLM medical entity extraction (DeepSeek/OpenAI) with
the official WHO ICD-11 MMS API to automatically verify, register, and learn
new disease concepts and multilingual aliases in the local database.
"""

from __future__ import annotations

import base64
import json
import logging
import re
import threading
import time
import urllib.request
import urllib.parse
from typing import Any

from . import config

logger = logging.getLogger(__name__)

_TOKEN_CACHE: dict[str, Any] = {"token": None, "expires_at": 0}
_DISCOVERY_CACHE: dict[str, tuple[dict[str, Any] | None, float]] = {}
_DISCOVERY_LOCK = threading.Lock()
_CACHE_TTL_SECONDS = 600  # 10 minutes cache


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s-]", " ", (value or "").lower())).strip()


def _json_response(text: str) -> dict[str, Any]:
    text = (text or "").strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.I)
    try:
        result = json.loads(text)
        return result if isinstance(result, dict) else {}
    except Exception:
        return {}


def who_token() -> str | None:
    """Fetch OAuth2 token from WHO ICD Access Management with caching."""
    client_id = config.WHO_ICD_CLIENT_ID
    client_secret = config.WHO_ICD_CLIENT_SECRET
    if not client_id or not client_secret:
        return None

    now = time.time()
    if _TOKEN_CACHE["token"] and now < _TOKEN_CACHE["expires_at"] - 60:
        return _TOKEN_CACHE["token"]

    try:
        basic = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode("ascii")
        payload = urllib.parse.urlencode({"grant_type": "client_credentials", "scope": "icdapi_access"}).encode()
        req = urllib.request.Request(
            config.WHO_ICD_TOKEN_URL,
            data=payload,
            headers={
                "Authorization": f"Basic {basic}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        token = data.get("access_token")
        expires_in = int(data.get("expires_in", 3600))
        if token:
            _TOKEN_CACHE["token"] = token
            _TOKEN_CACHE["expires_at"] = now + expires_in
            return token
    except Exception as e:
        logger.warning("Failed to acquire WHO ICD-11 access token: %s", e)
    return None


def _parse_who_search_response(term: str, data: dict[str, Any]) -> dict[str, Any] | None:
    """Extract and rank candidates from WHO ICD-11 search results."""
    entities = data.get("destinationEntities", [])
    if not isinstance(entities, list) or not entities:
        return None

    # Strict guardrail: Entity MUST have an official ICD code
    candidates = [
        e for e in entities
        if isinstance(e, dict) and e.get("theCode") and str(e.get("theCode")).strip()
    ]
    if not candidates:
        return None

    q_norm = _normalize(term)

    def score(entity: dict[str, Any]) -> tuple[int, int, int, float]:
        title = _normalize(str(entity.get("title") or ""))
        exact = int(title == q_norm)
        starts = int(title.startswith(q_norm))
        contains = int(q_norm in title)
        api_score = float(entity.get("score") or 0.0)
        return (exact, starts, contains, api_score)

    best = max(candidates, key=score)
    title = str(best.get("title") or term).strip()
    raw_uri = str(best.get("id") or "").replace("http://", "https://", 1)
    return {
        "canonical_name": title,
        "english_name": title,
        "ontology_system": "WHO ICD-11 MMS",
        "ontology_code": str(best["theCode"]).strip(),
        "ontology_uri": raw_uri,
        "ontology_release": config.WHO_ICD_RELEASE,
    }


def who_search(term: str, token: str | None = None) -> dict[str, Any] | None:
    """Search WHO ICD-11 MMS release for a disease concept."""
    if not term or not term.strip():
        return None
    token = token or who_token()
    if not token:
        return None

    encoded_q = urllib.parse.quote(term.strip())
    url = (
        f"{config.WHO_ICD_API_URL}/icd/release/{config.WHO_ICD_RELEASE}/search"
        f"?q={encoded_q}&flatResults=true&highlightingEnabled=false&useFlexisearch=true"
    )
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "API-Version": config.WHO_ICD_API_VERSION,
            "Accept-Language": config.WHO_ICD_LANGUAGE,
            "User-Agent": "disease-surveillance-nlp/1.0",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return _parse_who_search_response(term, data)
    except Exception as e:
        logger.warning("WHO ICD-11 search failed for query '%s': %s", term, e)
        return None


def discover_disease_entity(text: str, language: str = "") -> dict[str, Any] | None:
    """Use LLM to extract disease entity without static DB concept constraints."""
    api_key = config.DEEPSEEK_API_KEY or config.OPENAI_API_KEY
    if not api_key:
        return None

    sample = (text or "")[:5000].strip()
    if not sample:
        return None

    prompt = (
        "You are an expert multilingual medical epidemiologist. Analyze this news article and extract "
        "any primary human or zoonotic infectious disease or pathogen mentioned.\n"
        "DO NOT be constrained by any existing list. Output JSON only with the following schema:\n"
        "{\n"
        '  "detected_disease_raw": "<exact disease name in original article language, e.g. cacar monyet, ไข้หวัดนก, đậu mùa khỉ>",\n'
        '  "english_medical_name": "<standard international English disease name suitable for WHO ICD-11 search, e.g. Mpox, Avian influenza, Leptospirosis, Nipah virus disease>",\n'
        '  "scientific_or_synonym": "<alternative search term / pathogen name, e.g. Monkeypox, H5N1, Lyssavirus>",\n'
        '  "is_actual_disease": true/false (set false if only non-specific symptom like fever/headache or not a disease report),\n'
        '  "confidence": <float 0.0 to 1.0>\n'
        "}\n\n"
        f"source_language={json.dumps(language)}\n"
        f"article_sample={json.dumps(sample, ensure_ascii=False)}"
    )

    body = {
        "model": config.DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": "You are a cautious medical entity detector. Output valid JSON only."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "max_completion_tokens": 500,
    }

    base_url = config.DEEPSEEK_BASE_URL
    url = base_url if base_url.endswith("/chat/completions") else f"{base_url}/chat/completions"

    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "disease-surveillance-nlp/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=config.DEEPSEEK_TIMEOUT_SECONDS) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        message = payload["choices"][0]["message"]
        result = _json_response(message.get("content") or "")
        if not result.get("is_actual_disease"):
            return None
        return result
    except Exception as e:
        logger.info("LLM disease discovery extraction failed: %s", e)
        return None


def resolve_and_learn_disease(text: str, language: str = "") -> dict[str, Any] | None:
    """End-to-end auto-discovery: LLM extraction -> WHO ICD-11 search -> DB upsert -> Cache reload."""
    if not config.WHO_DISCOVERY_ENABLED:
        return None

    sample = (text or "")[:1200]
    sample_key = _normalize(sample[:200])
    if not sample_key:
        return None

    now = time.time()
    with _DISCOVERY_LOCK:
        if sample_key in _DISCOVERY_CACHE:
            cached_res, exp = _DISCOVERY_CACHE[sample_key]
            if now < exp:
                return cached_res

    discovered = discover_disease_entity(text, language)
    if not discovered or not discovered.get("is_actual_disease"):
        with _DISCOVERY_LOCK:
            _DISCOVERY_CACHE[sample_key] = (None, now + _CACHE_TTL_SECONDS)
        return None

    confidence = float(discovered.get("confidence") or 0.0)
    if confidence < config.WHO_DISCOVERY_MIN_CONFIDENCE:
        with _DISCOVERY_LOCK:
            _DISCOVERY_CACHE[sample_key] = (None, now + _CACHE_TTL_SECONDS)
        return None

    raw_term = str(discovered.get("detected_disease_raw") or "").strip()
    en_term = str(discovered.get("english_medical_name") or "").strip()
    synonym = str(discovered.get("scientific_or_synonym") or "").strip()

    search_terms = [t for t in [en_term, synonym, raw_term] if t]
    if not search_terms:
        return None

    # 1. Quick check: Is this English name or raw term already in our active DB concepts?
    for term in search_terms:
        norm_t = _normalize(term)
        for concept in config.WHO_DISEASE_CONCEPTS:
            if _normalize(concept.get("canonical_name", "")) == norm_t or _normalize(concept.get("english_name", "")) == norm_t:
                # If raw term differs, register new alias in DB
                if raw_term and _normalize(raw_term) != norm_t:
                    config.upsert_discovered_disease_concept(
                        canonical_name=concept["canonical_name"],
                        english_name=concept.get("english_name") or concept["canonical_name"],
                        ontology_code=concept.get("ontology_code") or "",
                        ontology_uri=concept.get("ontology_uri") or "",
                        aliases=[{"surface_form": raw_term, "language": language or "unknown", "confidence": confidence}],
                    )
                return {
                    "canonical_name": concept["canonical_name"],
                    "english_name": concept.get("english_name") or concept["canonical_name"],
                    "ontology_code": concept.get("ontology_code"),
                    "ontology_uri": concept.get("ontology_uri"),
                    "confidence": max(confidence, 0.88),
                }

    # 2. Query WHO ICD-11 MMS API
    token = who_token()
    concept = None
    for term in search_terms:
        concept = who_search(term, token)
        if concept:
            break

    if not concept:
        logger.info("No official WHO ICD-11 concept found for terms: %s", search_terms)
        with _DISCOVERY_LOCK:
            _DISCOVERY_CACHE[sample_key] = (None, now + _CACHE_TTL_SECONDS)
        return None

    # 3. Persist to PostgreSQL database (disease_concepts, disease_aliases, nlp_keywords, nlp_labels)
    aliases = []
    if raw_term:
        aliases.append({"surface_form": raw_term, "language": language or "unknown", "confidence": confidence})
    if en_term and _normalize(en_term) != _normalize(raw_term):
        aliases.append({"surface_form": en_term, "language": "en", "confidence": 1.0})
    if synonym and _normalize(synonym) not in {_normalize(raw_term), _normalize(en_term)}:
        aliases.append({"surface_form": synonym, "language": "en", "confidence": 0.9})

    success = config.upsert_discovered_disease_concept(
        canonical_name=concept["canonical_name"],
        english_name=concept["english_name"],
        ontology_code=concept["ontology_code"],
        ontology_uri=concept["ontology_uri"],
        ontology_release=concept.get("ontology_release", config.WHO_ICD_RELEASE),
        aliases=aliases,
    )

    result = {
        "canonical_name": concept["canonical_name"],
        "english_name": concept["english_name"],
        "ontology_code": concept["ontology_code"],
        "ontology_uri": concept["ontology_uri"],
        "confidence": max(confidence, 0.90),
    }

    with _DISCOVERY_LOCK:
        _DISCOVERY_CACHE[sample_key] = (result, now + _CACHE_TTL_SECONDS)
        if raw_term:
            _DISCOVERY_CACHE[_normalize(raw_term)] = (result, now + _CACHE_TTL_SECONDS)
        if en_term:
            _DISCOVERY_CACHE[_normalize(en_term)] = (result, now + _CACHE_TTL_SECONDS)

    logger.info(
        "[WHO ICD-11 AUTO-LEARN] Successfully mapped '%s' -> %s [%s] (DB upserted=%s)",
        raw_term or en_term, concept["canonical_name"], concept["ontology_code"], success,
    )
    return result
