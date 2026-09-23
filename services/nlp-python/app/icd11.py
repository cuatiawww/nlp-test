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
    seen_identity: set[str] = set()
    unresolved_indexes = []
    primary_resolved = None

    for index, mention in enumerate(mentions):
        name = str(_mention_value(mention, "canonical_name", "") or "").strip()
        code = str(_mention_value(mention, "icd11_code", "") or "").strip()
        if not name or not code or name.upper() == "UNKNOWN":
            unresolved_indexes.append(index)
            continue

        # Several surface forms can resolve to the same WHO concept (for
        # example a local alias and its English canonical name). Aggregate by
        # ICD-11 code first so the public matrix never counts one disease
        # twice merely because it was mentioned through two aliases.
        identity = f"icd11:{code.casefold()}" if code else f"name:{_normalize(name)}"
        if identity not in seen_identity:
            seen_identity.add(identity)
            resolved.append(name)
        role = str(_mention_value(mention, "role", "") or "").lower()
        if role == "primary" and primary_resolved is None:
            primary_resolved = name

    # If the primary role was not retained, use the first valid WHO-backed
    # mention only when it is the classifier's selected disease. An UNKNOWN
    # primary with a coded mention still publishes the ICD-11 name so keyword
    # captures are not wiped after local resolution.
    if primary_resolved is None and resolved:
        primary_norm = (primary or "").strip().casefold()
        if not primary_norm or primary_norm == "unknown":
            primary_resolved = resolved[0]
        else:
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

    # A one-word broad query such as "hepatitis", "polio", or "flu" can
    # match an unrelated WHO post-coordination entity. Only accept a
    # non-exact result when every query token is explicitly present in a
    # multi-word title. Otherwise leave it for manual review.
    exact_candidates = [
        entity for entity in candidates
        if _normalize(str(entity.get("title") or "")) == q_norm
    ]
    if exact_candidates:
        best = max(exact_candidates, key=score)
    else:
        query_tokens = set(q_norm.split())
        strong_candidates = [
            entity for entity in candidates
            if len(query_tokens) >= 2
            and query_tokens.issubset(set(_normalize(str(entity.get("title") or "")).split()))
        ]
        if not strong_candidates:
            logger.info("WHO ICD-11 search rejected ambiguous term: term=%s", term)
            return None
        best = max(strong_candidates, key=score)
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


def _concept_term_values(concept: dict[str, Any]) -> list[str]:
    names = [concept.get("canonical_name"), concept.get("english_name")]
    names.extend(
        item.get("alias") if isinstance(item, dict) else item
        for item in (concept.get("aliases") or [])
    )
    return [str(name).strip() for name in names if name and str(name).strip()]


def _as_local_resolution(concept: dict[str, Any], confidence: float, source: str) -> dict[str, Any] | None:
    canonical = str(concept.get("canonical_name") or "").strip()
    code = str(concept.get("ontology_code") or "").strip()
    if not canonical or not code or canonical.upper() == "UNKNOWN":
        return None
    return {
        "canonical_name": canonical,
        "english_name": concept.get("english_name") or canonical,
        "ontology_code": code,
        "ontology_uri": concept.get("ontology_uri"),
        "confidence": confidence,
        "resolution_source": source,
    }


def _local_icd11_fallback_catalog() -> list[dict[str, Any]]:
    """Curated ICD-11 names/codes for keyword labels when the DB cache is empty.

    Display labels follow migration 059. Codes are the reviewed MMS codes already
    used by the disease master; this catalog does not invent new ontology links.
    """
    return [
        {"canonical_name": "COVID-19", "ontology_code": "RA01", "aliases": ["covid", "covid-19", "covid19", "coronavirus"]},
        {"canonical_name": "Cholera", "ontology_code": "1A00", "aliases": ["cholera", "kolera"]},
        {"canonical_name": "Typhoid fever", "ontology_code": "1A07", "aliases": ["typhoid", "tipoid", "demam tifoid"]},
        {"canonical_name": "Acute diarrhea", "ontology_code": "1A40.Z&XT5R", "aliases": ["diare akut", "diare", "acute diarrhea", "DIARE_AKUT"]},
        {"canonical_name": "Tuberculosis", "ontology_code": "1B1Z", "aliases": ["tuberculosis", "tb", "tbc"]},
        {"canonical_name": "Leprosy", "ontology_code": "1B20", "aliases": ["leprosy", "kusta"]},
        {"canonical_name": "Leptospirosis", "ontology_code": "1B91", "aliases": ["leptospirosis"]},
        {"canonical_name": "Plague", "ontology_code": "1B93", "aliases": ["plague", "pes"]},
        {"canonical_name": "Anthrax", "ontology_code": "1B97", "aliases": ["anthrax", "antraks"]},
        {"canonical_name": "Tetanus", "ontology_code": "1C10", "aliases": ["tetanus"]},
        {"canonical_name": "Diphtheria", "ontology_code": "1C11", "aliases": ["diphtheria", "difteri"]},
        {"canonical_name": "Pertussis", "ontology_code": "1C12", "aliases": ["pertussis", "whooping cough", "batuk rejan"]},
        {"canonical_name": "Japanese encephalitis", "ontology_code": "1C80", "aliases": ["japanese encephalitis", "radang otak jepang"]},
        {"canonical_name": "Poliomyelitis", "ontology_code": "1C81", "aliases": ["polio", "poliomyelitis"]},
        {"canonical_name": "Rabies", "ontology_code": "1C82", "aliases": ["rabies"]},
        {"canonical_name": "Meningitis", "ontology_code": "1D00", "aliases": ["meningitis"]},
        {
            "canonical_name": "Dengue",
            "ontology_code": "1D2Z",
            "aliases": ["dengue", "dengue fever", "dbd", "demam berdarah", "demam berdarah dengue"],
        },
        {"canonical_name": "Chikungunya", "ontology_code": "1D40", "aliases": ["chikungunya", "cikungunya"]},
        {"canonical_name": "Ebola disease", "ontology_code": "1D42", "aliases": ["ebola", "ebola virus"]},
        {"canonical_name": "Marburg disease", "ontology_code": "1D43", "aliases": ["marburg", "marburg virus"]},
        {"canonical_name": "Lassa fever", "ontology_code": "1D44", "aliases": ["lassa", "lassa fever", "LASSA_FEVER"]},
        {"canonical_name": "Yellow fever", "ontology_code": "1D47", "aliases": ["yellow fever", "demam kuning", "YELLOW_FEVER"]},
        {"canonical_name": "Zika virus disease", "ontology_code": "1D48", "aliases": ["zika", "zika virus"]},
        {
            "canonical_name": "Hantavirus infection",
            "ontology_code": "1D62",
            "aliases": ["hantavirus", "hantavirus infection", "HANTAVIRUS"],
        },
        {"canonical_name": "Nipah virus disease", "ontology_code": "1D63", "aliases": ["nipah", "nipah virus"]},
        {
            "canonical_name": "Middle East respiratory syndrome",
            "ontology_code": "1D64",
            "aliases": ["mers", "mers cov", "middle east respiratory syndrome"],
        },
        {
            "canonical_name": "Hand, foot and mouth disease",
            "ontology_code": "1D82",
            "aliases": ["hfmd", "hand foot mouth", "hand foot and mouth disease", "flu singapura"],
        },
        {
            "canonical_name": "Avian influenza",
            "ontology_code": "1E30",
            "aliases": [
                "avian influenza",
                "avian influenza h5n1",
                "h5n1",
                "bird flu",
                "flu burung",
                "AVIAN_INFLUENZA",
            ],
        },
        {"canonical_name": "Influenza", "ontology_code": "1E32", "aliases": ["influenza", "flu"]},
        {
            "canonical_name": "Respiratory syncytial virus infection",
            "ontology_code": "CA40.11",
            "aliases": ["rsv", "respiratory syncytial", "respiratory syncytial virus"],
        },
        {"canonical_name": "Smallpox", "ontology_code": "1E70", "aliases": ["smallpox", "cacar"]},
        {"canonical_name": "Mpox", "ontology_code": "1E71", "aliases": ["mpox", "monkeypox", "cacar monyet"]},
        {"canonical_name": "Rubella", "ontology_code": "1F02", "aliases": ["rubella", "campak jerman"]},
        {"canonical_name": "Measles", "ontology_code": "1F03", "aliases": ["measles", "campak", "CAMPAK"]},
        {"canonical_name": "Malaria", "ontology_code": "1F4Z", "aliases": ["malaria"]},
        {"canonical_name": "Schistosomiasis", "ontology_code": "1F64", "aliases": ["schistosomiasis"]},
        {"canonical_name": "Filariasis", "ontology_code": "1F66", "aliases": ["filariasis", "kaki gajah"]},
        {"canonical_name": "Pneumonia", "ontology_code": "CA40.Z", "aliases": ["pneumonia"]},
        {
            "canonical_name": "Legionellosis",
            "ontology_code": "1B95",
            "aliases": [
                "legionellosis", "legionnaires disease", "legionnaires' disease",
                "legionella", "ลีเจียนแนร์", "โรคลิเจียนแนร์", "โรคติดเชื้อลีเจียนแนร์", "โรคลีเจียนแนร์"
            ],
        },
        {"canonical_name": "Stroke", "ontology_code": "8B20", "aliases": ["stroke"]},
    ]


def _match_local_icd11_concept(term: str, catalog: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Score a captured surface form against one ICD-11 catalog. No network."""
    from .extractors import WHO_STOPWORDS, _normalize_entity_text, normalize_disease_display

    weak_substring_terms = set(WHO_STOPWORDS) | {"influenza", "flu", "viral"}
    variants: list[str] = []
    for raw in (term, normalize_disease_display(term or "")):
        value = str(raw or "").strip()
        if not value or value.upper() == "UNKNOWN":
            continue
        if value not in variants:
            variants.append(value)

    best: dict[str, Any] | None = None
    best_score = 0
    for variant in variants:
        vnorm = _normalize_entity_text(variant)
        if not vnorm:
            continue
        for concept in catalog:
            if not str(concept.get("ontology_code") or "").strip():
                continue
            for label in _concept_term_values(concept):
                lnorm = _normalize_entity_text(label)
                if not lnorm:
                    continue
                score = 0
                if vnorm == lnorm:
                    score = 1000 + len(lnorm)
                elif vnorm in weak_substring_terms or lnorm in weak_substring_terms:
                    continue
                elif len(vnorm) >= 4 and len(lnorm) >= 4 and (vnorm in lnorm or lnorm in vnorm):
                    shorter, longer = (vnorm, lnorm) if len(vnorm) <= len(lnorm) else (lnorm, vnorm)
                    if set(shorter.split()) <= set(longer.split()) or shorter in longer:
                        score = 100 + len(shorter)
                if score > best_score:
                    best = concept
                    best_score = score
    return best


def resolve_local_icd11_term(term: str) -> dict[str, Any] | None:
    """Map a captured disease label to a local ICD-11 name and code.

    Interactive URL analysis skips the live WHO API. This path uses the loaded
    disease master first, then a curated ICD-11 fallback, so keyword captures
    such as campak/DBD/H5N1 become public ICD-11 names instead of UNKNOWN.
    """
    raw = (term or "").strip()
    if not raw or raw.upper() == "UNKNOWN":
        return None

    live = _match_local_icd11_concept(raw, config.WHO_DISEASE_CONCEPTS)
    if live:
        return _as_local_resolution(live, 0.99, "local WHO concept")

    fallback = _match_local_icd11_concept(raw, _local_icd11_fallback_catalog())
    if not fallback:
        return None
    code = str(fallback.get("ontology_code") or "").strip()
    for concept in config.WHO_DISEASE_CONCEPTS:
        if str(concept.get("ontology_code") or "").strip() == code:
            return _as_local_resolution(concept, 0.95, "local WHO concept")
    return _as_local_resolution(fallback, 0.93, "ICD-11 local catalog")


def _resolve_local_only(term: str) -> dict[str, Any] | None:
    """Backward-compatible alias used by the interactive URL pipeline."""
    return resolve_local_icd11_term(term)


def resolve_disease_term(term: str, language: str = "", sample_text: str = "") -> dict[str, Any] | None:
    """Resolve one explicit surface term directly against local concepts/WHO."""
    if not term or not term.strip():
        return None
    local = resolve_local_icd11_term(term)
    if local:
        return local
    if not config.WHO_TERM_RESOLUTION_ENABLED:
        return None

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
