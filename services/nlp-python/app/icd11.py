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
from .agent import chat_json

logger = logging.getLogger(__name__)

_TOKEN_CACHE: dict[str, Any] = {"token": None, "expires_at": 0}
_DISCOVERY_CACHE: dict[str, tuple[dict[str, Any] | None, float]] = {}
_DISCOVERY_LOCK = threading.Lock()
_CACHE_TTL_SECONDS = 600  # 10 minutes cache


def _mention_value(mention: Any, key: str, default: Any = None) -> Any:
    if isinstance(mention, dict):
        return mention.get(key, default)
    return getattr(mention, key, default)


def project_icd11_public_output(
    primary: str,
    extracted: list[str],
    mentions: list[Any],
) -> dict[str, Any]:
    """Project disease output to names backed by a valid WHO ICD-11 code.

    The classifier/agent may produce useful surface terms, but those terms are
    not public disease labels until a WHO concept and code are attached. The
    caller keeps the original surface form separately for review evidence.
    """
    resolved = []
    unresolved_indexes = []
    primary_resolved = None

    for index, mention in enumerate(mentions):
        name = str(_mention_value(mention, "canonical_name", "") or "").strip()
        code = str(_mention_value(mention, "icd11_code", "") or "").strip()
        if not name or not code or name.upper() == "UNKNOWN":
            unresolved_indexes.append(index)
            continue

        if name not in resolved:
            resolved.append(name)
        role = str(_mention_value(mention, "role", "") or "").lower()
        if role == "primary" and primary_resolved is None:
            primary_resolved = name

    # If the primary role was not retained, use the first valid WHO-backed
    # mention only when it is the classifier's selected disease.
    if primary_resolved is None and primary:
        primary_norm = primary.strip().casefold()
        primary_resolved = next(
            (name for name in resolved if name.casefold() == primary_norm),
            None,
        )

    return {
        "primary": primary_resolved or "UNKNOWN",
        "extracted": resolved,
        "unresolved_indexes": unresolved_indexes,
    }


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
        logger.warning(
            "WHO ICD-11 OAuth token unavailable: reason=missing_credentials"
        )
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
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        token = data.get("access_token")
        expires_in = int(data.get("expires_in", 3600))
        if token:
            _TOKEN_CACHE["token"] = token
            _TOKEN_CACHE["expires_at"] = now + expires_in
            return token
    except Exception as e:
        logger.warning(
            "WHO ICD-11 OAuth token request failed: reason=request_error error=%s",
            e,
        )
        # Negative cache for 120s so we do not block every article on network/bad credentials
        _TOKEN_CACHE["token"] = None
        _TOKEN_CACHE["expires_at"] = now + 120
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
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return _parse_who_search_response(term, data)
    except Exception as e:
        logger.warning(
            "WHO ICD-11 search failed: reason=request_error query=%s error=%s",
            term,
            e,
        )
        return None


def resolve_disease_term(term: str, language: str = "", sample_text: str = "") -> dict[str, Any] | None:
    """Resolve one explicit surface term directly against local concepts/WHO."""
    if not config.WHO_TERM_RESOLUTION_ENABLED or not term or not term.strip():
        return None
    normalized = _normalize(term)
    for concept in config.WHO_DISEASE_CONCEPTS:
        names = [concept.get("canonical_name"), concept.get("english_name")]
        names.extend(
            item.get("alias") if isinstance(item, dict) else item
            for item in (concept.get("aliases") or [])
        )
        if any(_normalize(str(name or "")) == normalized for name in names):
            return {
                "canonical_name": concept["canonical_name"],
                "english_name": concept.get("english_name") or concept["canonical_name"],
                "ontology_code": concept.get("ontology_code"),
                "ontology_uri": concept.get("ontology_uri"),
                "confidence": 0.99,
                "resolution_source": "local WHO concept",
            }

    concept = who_search(term)
    if concept:
        aliases = [{"surface_form": term, "language": language or "unknown", "confidence": 0.90}]
        config.upsert_discovered_disease_concept(
            canonical_name=concept["canonical_name"],
            english_name=concept["english_name"],
            ontology_code=concept["ontology_code"],
            ontology_uri=concept["ontology_uri"],
            ontology_release=concept.get("ontology_release", config.WHO_ICD_RELEASE),
            aliases=aliases,
        )
        return {
            "canonical_name": concept["canonical_name"],
            "english_name": concept["english_name"],
            "ontology_code": concept["ontology_code"],
            "ontology_uri": concept["ontology_uri"],
            "confidence": 0.90,
            "resolution_source": "WHO ICD-11 search",
        }

    config.upsert_disease_discovery_candidate(
        term, sample_text=sample_text, language=language or "unknown", provider="WHO search"
    )
    return None


def discover_disease_entity(text: str, language: str = "") -> dict[str, Any] | None:
    """Use LLM to extract disease entity without static DB concept constraints."""
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

    result = chat_json(
        "You are a cautious medical entity detector. Output valid JSON only.",
        prompt,
        max_tokens=500,
    )
    result.pop("_provider", None)
    if not result.get("is_actual_disease"):
        return None
    return result


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
            concept_terms = [concept.get("canonical_name"), concept.get("english_name")]
            concept_terms.extend(
                item.get("alias") if isinstance(item, dict) else item
                for item in (concept.get("aliases") or [])
            )
            if any(_normalize(str(value or "")) == norm_t for value in concept_terms):
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
        config.upsert_disease_discovery_candidate(
            raw_term or en_term or synonym,
            sample_text=text,
            language=language or "unknown",
            provider="agent",
            confidence=confidence,
        )
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
