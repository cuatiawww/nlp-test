#!/usr/bin/env python3
"""Bootstrap multilingual disease data from the existing database.

The script is intentionally idempotent. It reads existing labels, keywords,
raw reports, and disease events, then populates concept/alias/training tables.
WHO ICD-11 is the source of canonical disease terminology and codes. DeepSeek is
not used by this bootstrap; it is reserved for runtime fallback detection in the
NLP service when a report cannot be resolved deterministically.

Examples:
  python3 scripts/bootstrap_multilingual_data.py --dry-run
  python3 scripts/bootstrap_multilingual_data.py --limit 5000
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import time
import unicodedata
import urllib.error
import urllib.request
from urllib.parse import quote_plus
from collections import defaultdict
from typing import Any

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover - allows --help without DB dependencies
    psycopg = None
    dict_row = None


DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgres://postgres:root@postgres:5432/disease_ai"
)
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "").strip()
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")
DEEPSEEK_MAX_TOKENS = int(os.getenv("DEEPSEEK_MAX_TOKENS", "2000"))
LLM_CONFIDENCE_THRESHOLD = float(os.getenv("BOOTSTRAP_LLM_MIN_CONFIDENCE", "0.85"))

WHO_ICD_CLIENT_ID = os.getenv("WHO_ICD_CLIENT_ID", "").strip()
WHO_ICD_CLIENT_SECRET = os.getenv("WHO_ICD_CLIENT_SECRET", "").strip()
WHO_ICD_TOKEN_URL = os.getenv(
    "WHO_ICD_TOKEN_URL", "https://icdaccessmanagement.who.int/connect/token"
)
WHO_ICD_API_URL = os.getenv("WHO_ICD_API_URL", "https://id.who.int").rstrip("/")
WHO_ICD_RELEASE = os.getenv("WHO_ICD_RELEASE", "11/2026-01/mms").strip("/")
WHO_ICD_LANGUAGE = os.getenv("WHO_ICD_LANGUAGE", "en")
WHO_ICD_API_VERSION = os.getenv("WHO_ICD_API_VERSION", "v2")
BOOTSTRAP_LANGUAGES = tuple(
    language.strip().lower()
    for language in os.getenv(
        "BOOTSTRAP_LANGUAGES", "id,ms,en,th,vi,km,lo,my,fil,tet,pt"
    ).split(",")
    if language.strip()
)
LANGUAGE_CODE_ALIASES = {
    "bahasa indonesia": "id",
    "indonesian": "id",
    "bahasa melayu": "ms",
    "malay": "ms",
    "english": "en",
    "thai": "th",
    "vietnamese": "vi",
    "khmer": "km",
    "lao": "lo",
    "burmese": "my",
    "myanmar": "my",
    "filipino": "fil",
    "tetum": "tet",
    "portuguese": "pt",
}

UNKNOWN_LABELS = {"", "UNKNOWN", "NEGATIVE - NOT HEALTH RELATED", "NO DISEASE"}
_who_token: tuple[str, float] | None = None


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKC", value or "").replace("_", " ").strip().lower()
    value = re.sub(r"[^\w\s-]", " ", value, flags=re.UNICODE)
    return re.sub(r"\s+", " ", value).strip()


def is_unknown(label: str | None) -> bool:
    return normalize(label or "").upper() in {normalize(x).upper() for x in UNKNOWN_LABELS}


def detect_language(text: str) -> str:
    """Cheap deterministic detector used only for bootstrap metadata."""
    if re.search(r"[\u0e00-\u0e7f]", text):
        return "th"
    if re.search(r"[\u1780-\u17ff]", text):
        return "km"
    if re.search(r"[\u0e80-\u0eff]", text):
        return "lo"
    if re.search(r"[\u1000-\u109f]", text):
        return "my"

    lower = f" {normalize(text)} "
    markers = {
        "vi": (" và ", " của ", " bệnh ", " sốt ", " người "),
        "id": (" yang ", " dan ", " kasus ", " warga ", " penyakit "),
        "ms": (" yang ", " dan ", " kes ", " pesakit ", " penyakit "),
        "fil": (" mga ", " ang ", " ng ", " sakit ", " kaso "),
        "tet": (" no ", " nia ", " moras ", " ema "),
        "pt": (" os ", " uma ", " doença ", " casos "),
    }
    scores = {lang: sum(marker in lower for marker in words) for lang, words in markers.items()}
    best = max(scores, key=scores.get)
    if scores[best] > 0:
        return best
    return "en"


def language_code(value: str | None, fallback: str = "en") -> str:
    value = (value or "").strip().lower()
    return LANGUAGE_CODE_ALIASES.get(value, value if value in BOOTSTRAP_LANGUAGES else fallback)


def canonical_for_target(target: str, labels: list[str]) -> str:
    """Resolve legacy keyword targets such as DBD to the DB label."""
    target_norm = normalize(target)
    if not target_norm:
        return target.strip()
    exact = next((label for label in labels if normalize(label) == target_norm), None)
    if exact:
        return exact
    contained = next(
        (label for label in labels if target_norm in normalize(label).split()), None
    )
    if contained:
        return contained
    return target.strip()


def split_for(text: str, label: str) -> str:
    digest = hashlib.sha256(f"{text}\0{label}".encode("utf-8")).digest()[0]
    if digest < 20:
        return "test"
    if digest < 30:
        return "validation"
    return "train"


def content_hash(text: str, language: str, disease: str, event_type: str) -> str:
    raw = "\0".join((normalize(text), language, disease, event_type))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def parse_json_content(content: str) -> dict[str, Any]:
    content = (content or "").strip()
    content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content, flags=re.I)
    parsed = json.loads(content)
    if not isinstance(parsed, dict):
        raise ValueError("DeepSeek response is not a JSON object")
    return parsed


def deepseek_json(messages: list[dict[str, str]], timeout: int = 30) -> dict[str, Any]:
    request = urllib.request.Request(
        f"{DEEPSEEK_BASE_URL}/chat/completions",
        data=json.dumps(
            {
                "model": DEEPSEEK_MODEL,
                "messages": messages,
                "temperature": 0,
                "response_format": {"type": "json_object"},
                "max_tokens": DEEPSEEK_MAX_TOKENS,
            }
        ).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
            "Content-Type": "application/json",
            "User-Agent": "disease-surveillance-bootstrap/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = json.loads(response.read())
    content = body["choices"][0]["message"].get("content") or "{}"
    return parse_json_content(content)


def who_icd_access_token() -> str | None:
    """Get a short-lived WHO ICD API OAuth token, if configured."""
    global _who_token
    if not WHO_ICD_CLIENT_ID or not WHO_ICD_CLIENT_SECRET:
        return None
    if _who_token and _who_token[1] > time.time() + 30:
        return _who_token[0]

    body = b"grant_type=client_credentials&scope=icdapi_access"
    basic = base64.b64encode(
        f"{WHO_ICD_CLIENT_ID}:{WHO_ICD_CLIENT_SECRET}".encode("utf-8")
    ).decode("ascii")
    request = urllib.request.Request(
        WHO_ICD_TOKEN_URL,
        data=body,
        headers={
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.loads(response.read())
        token = str(payload["access_token"])
        expires_in = int(payload.get("expires_in", 3600))
        _who_token = (token, time.time() + expires_in)
        return token
    except (OSError, KeyError, TypeError, ValueError, urllib.error.URLError):
        return None


def who_search_terms(term: str) -> list[str]:
    """Create safe English lookup variants for legacy local labels."""
    value = (
        normalize(term)
        .replace("covid19", "covid-19")
        .replace("diare", "diarrhea")
        .replace("akut", "acute")
    )
    if value == "diarrhea acute":
        value = "acute diarrhea"
    tokens = value.split()
    aliases = {
        "dbd": "dengue",
        "tb": "tuberculosis",
        "flu": "influenza",
        "campak": "measles",
        "mers": "MERS",
    }
    variants: list[str] = []
    for token in tokens:
        if token in aliases:
            variants.append(aliases[token])
    if not variants:
        core = [token for token in tokens if token not in {"fever", "disease", "virus", "coronavirus"}]
        if core:
            variants.append(" ".join(core))
    variants.append(value)
    return list(dict.fromkeys(variant for variant in variants if variant))


def who_icd_search(term: str) -> dict[str, Any] | None:
    """Resolve a term against WHO ICD-11 MMS without trusting a bad top result."""
    token = who_icd_access_token()
    if not token or not term.strip():
        return None

    headers = {
        "Authorization": f"Bearer {token}",
        "API-Version": WHO_ICD_API_VERSION,
        "Accept": "application/json",
        "Accept-Language": WHO_ICD_LANGUAGE,
        "User-Agent": "disease-surveillance-bootstrap/1.0",
    }
    candidates: list[tuple[dict[str, Any], str, int]] = []
    try:
        for query_index, query in enumerate(who_search_terms(term)):
            url = (
                f"{WHO_ICD_API_URL}/icd/release/{WHO_ICD_RELEASE}/search"
                f"?q={quote_plus(query)}&flatResults=true"
                "&highlightingEnabled=false&useFlexisearch=true"
            )
            request = urllib.request.Request(url, headers=headers, method="GET")
            with urllib.request.urlopen(request, timeout=20) as response:
                payload = json.loads(response.read())
            entities = payload.get("destinationEntities", payload.get("DestinationEntities", []))
            if isinstance(entities, list):
                candidates.extend(
                    (entity, query, query_index)
                    for entity in entities if isinstance(entity, dict)
                )
    except (OSError, KeyError, TypeError, ValueError, urllib.error.URLError):
        return None

    if not candidates:
        return None

    def rank(item: tuple[dict[str, Any], str, int]) -> tuple[int, int, int, int, int, int, int, float]:
        entity, query, query_index = item
        title = normalize(str(entity.get("title", entity.get("Title", ""))))
        matching_terms = " ".join(
            normalize(str(pv.get("label", "")))
            for pv in entity.get("matchingPVs", [])
            if isinstance(pv, dict)
        )
        search_blob = f"{title} {matching_terms}".replace("diarrhoea", "diarrhea")
        query_tokens = [token for token in normalize(query).split() if len(token) > 2]
        anchor = max(query_tokens, key=len, default="")
        anchor_match = int(anchor in search_blob)
        title_match = sum(token in search_blob for token in query_tokens)
        unspecified = int("unspecified" in title)
        normalized_query = normalize(query)
        exactish = int(
            title == normalized_query
            or title.startswith(f"{normalized_query} ")
            or title.startswith(f"{normalized_query},")
        )
        broad_penalty = int(any(word in title for word in ("congenital", "complication", "screening", "immunization")))
        specific_penalty = int(" due to " in f" {title} " or " myocarditis" in title)
        top_score = int(bool(entity.get("titleIsTopScore", entity.get("TitleIsTopScore"))))
        score = float(entity.get("score", entity.get("Score") or 0) or 0)
        return (-query_index, anchor_match, title_match, exactish, unspecified, -specific_penalty, -broad_penalty + top_score, score)

    candidates.sort(key=rank, reverse=True)
    best = candidates[0][0]
    code = best.get("theCode", best.get("TheCode"))
    title = best.get("title", best.get("Title"))
    uri = str(best.get("id", best.get("Id")) or "").replace("http://", "https://", 1)
    if not code or not uri:
        return None
    return {
        "ontology_system": "WHO ICD-11 MMS",
        "ontology_code": str(code),
        "ontology_uri": uri,
        "ontology_release": WHO_ICD_RELEASE,
        "english_name": str(title or term),
    }


def normalize_alias_with_llm(alias: str, labels: list[str]) -> dict[str, Any] | None:
    if not DEEPSEEK_API_KEY:
        return None
    prompt = (
        "Normalize a disease alias for a public-health NLP system. "
        "Return JSON only with keys: language, canonical_label, english_name, confidence. "
        "canonical_label MUST be exactly one item from allowed_labels or null. "
        "Do not invent an ontology code.\n\n"
        f"allowed_labels={json.dumps(labels, ensure_ascii=False)}\n"
        f"alias={json.dumps(alias, ensure_ascii=False)}"
    )
    try:
        result = deepseek_json([
            {"role": "system", "content": "You are a cautious medical terminology normalizer. Output JSON."},
            {"role": "user", "content": prompt},
        ])
        result["alias"] = alias
        return result
    except (OSError, KeyError, TypeError, ValueError, urllib.error.URLError):
        return None


def generate_multilingual_aliases(
    canonical: str, english_name: str, languages: tuple[str, ...]
) -> list[dict[str, Any]]:
    """Generate cautious surface aliases; this never generates ontology codes."""
    if not DEEPSEEK_API_KEY or not languages:
        return []
    prompt = (
        "Create medically standard disease-name aliases for a public-health NLP "
        "dictionary. Return JSON only: {aliases:[{alias,language,confidence}]}. "
        "Generate one common short name per requested language when possible. "
        "Use ISO-639-1 codes exactly, do not add explanations, symptoms, locations, "
        "or unrelated diseases. If a reliable translation is not known, omit it. "
        "These aliases are for matching text only; do not generate ICD codes.\n\n"
        f"canonical_label={json.dumps(canonical, ensure_ascii=False)}\n"
        f"english_name={json.dumps(english_name, ensure_ascii=False)}\n"
        f"languages={json.dumps(list(languages))}"
    )
    try:
        result = deepseek_json([
            {"role": "system", "content": "You are a conservative medical terminology translator. Output JSON."},
            {"role": "user", "content": prompt},
        ])
        aliases = result.get("aliases", [])
        return aliases if isinstance(aliases, list) else []
    except (OSError, KeyError, TypeError, ValueError, urllib.error.URLError):
        return []


def extract_unknown_with_llm(text: str, labels: list[str]) -> list[dict[str, Any]]:
    if not DEEPSEEK_API_KEY:
        return []
    prompt = (
        "Extract diseases explicitly mentioned in this report. Return JSON only: "
        "{diseases:[{surface_form,language,canonical_label,english_name,confidence}]}. "
        "canonical_label must be an exact allowed label or null. Do not infer a disease "
        "from symptoms alone and preserve negation.\n\n"
        f"allowed_labels={json.dumps(labels, ensure_ascii=False)}\n"
        f"report={json.dumps(text[:4000], ensure_ascii=False)}"
    )
    try:
        result = deepseek_json([
            {"role": "system", "content": "You extract disease entities conservatively. Output JSON."},
            {"role": "user", "content": prompt},
        ])
        diseases = result.get("diseases", [])
        return diseases if isinstance(diseases, list) else []
    except (OSError, KeyError, TypeError, ValueError, urllib.error.URLError):
        return []


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=10000, help="Maximum existing events to read")
    parser.add_argument("--dry-run", action="store_true", help="Read and report, do not write")
    args = parser.parse_args()

    if psycopg is None:
        raise SystemExit(
            "psycopg is required. Install services/nlp-python/requirements.txt "
            "or run this script inside the NLP container."
        )

    # This job must remain deterministic and independent of an LLM. DeepSeek
    # is used only by the online NLP fallback detector.
    use_llm = False
    conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
    try:
        all_labels = [
            row["label"]
            for row in conn.execute(
                "SELECT label FROM nlp_labels WHERE category='disease' AND is_active=TRUE ORDER BY priority, label"
            ).fetchall()
        ]
        negative_label = next(
            (label for label in all_labels if "not health" in normalize(label)),
            "NEGATIVE - not health related",
        )
        labels = [label for label in all_labels if not is_unknown(label)]
        if not labels:
            raise RuntimeError("No active disease labels found; run database migrations first")

        keywords = conn.execute(
            "SELECT keyword, target_label FROM nlp_keywords WHERE category='disease' AND is_active=TRUE ORDER BY priority, keyword"
        ).fetchall()
        events = conn.execute(
            """
            SELECT e.id, e.raw_report_id, e.original_text, e.language,
                   e.disease_classification, e.event_type, e.relevance_score,
                   e.is_health_related, e.case_count, e.death_count, e.confidence
            FROM disease_events e
            WHERE e.original_text IS NOT NULL AND length(e.original_text) > 30
            ORDER BY e.created_at DESC
            LIMIT %s
            """,
            (args.limit,),
        ).fetchall()

        # psycopg starts a transaction for the read queries above. End that
        # read transaction before opening the write transaction below; without
        # this explicit commit, a nested transaction can be rolled back when
        # the connection closes.
        conn.commit()

        concepts: dict[str, dict[str, Any]] = {}
        aliases: dict[tuple[str, str, str], dict[str, Any]] = {}
        examples: list[dict[str, Any]] = []
        new_keywords: dict[str, str] = {}

        def add_concept(canonical: str, english: str | None, source: str, confidence: float) -> None:
            canonical = (canonical or "").strip()
            if not canonical or is_unknown(canonical):
                return
            key = normalize(canonical)
            current = concepts.get(key)
            if not current or confidence > current["confidence"]:
                concepts[key] = {
                    "canonical_name": canonical,
                    "english_name": english or canonical,
                    "source": source,
                    "confidence": max(0.0, min(1.0, confidence)),
                }

        def add_alias(alias: str, canonical: str, language: str, source: str, confidence: float) -> None:
            if not alias or not canonical or is_unknown(canonical):
                return
            add_concept(canonical, canonical, source, confidence)
            key = (normalize(canonical), normalize(alias), language or "unknown")
            current = aliases.get(key)
            candidate = {
                "canonical": canonical,
                "alias": alias.strip(),
                "language": language or "unknown",
                "source": source,
                "confidence": max(0.0, min(1.0, confidence)),
            }
            if not current or candidate["confidence"] > current["confidence"]:
                aliases[key] = candidate

        for label in labels:
            add_concept(label, label, "existing_label", 1.0)

        llm_calls = 0
        for row in keywords:
            canonical = canonical_for_target(row["target_label"], labels)
            language = detect_language(row["keyword"])
            confidence = 0.95
            source = "existing_keyword"
            add_alias(row["keyword"], canonical, language, source, confidence)

        for row in events:
            disease = row["disease_classification"] or ""
            language = row["language"] or detect_language(row["original_text"])
            canonical = canonical_for_target(disease, labels)
            if not is_unknown(disease) and canonical in labels:
                add_alias(disease, canonical, language, "existing_event", float(row["confidence"] or 0.0))

            event_type = row["event_type"] or ""
            examples.append({
                "raw_report_id": row["raw_report_id"],
                "text": row["original_text"],
                "language": language,
                "disease_label": (
                    canonical if canonical in labels
                    else negative_label if row["is_health_related"] is False
                    else None
                ),
                "event_type": event_type or None,
                "relevance_score": row["relevance_score"],
                "is_health_related": row["is_health_related"],
                "case_count": row["case_count"],
                "death_count": row["death_count"],
                "confidence": float(row["confidence"] or 0.0),
            })

        for alias in aliases.values():
            # Runtime LLM aliases are deliberately not persisted by bootstrap.
            # New aliases should come from observed reports or WHO terminology.
            if alias["source"].startswith("who") and alias["confidence"] >= LLM_CONFIDENCE_THRESHOLD:
                new_keywords[normalize(alias["alias"])] = alias["canonical"]

        print(f"Existing labels: {len(labels)}")
        print(f"Existing events: {len(events)}")
        print(f"Concepts to upsert: {len(concepts)}")
        print(f"Aliases to upsert: {len(aliases)}")
        print(f"Training examples to upsert: {len(examples)}")
        print(f"Runtime keywords to add: {len(new_keywords)}")
        who_enabled = bool(WHO_ICD_CLIENT_ID and WHO_ICD_CLIENT_SECRET)
        print("DeepSeek enabled for bootstrap: False; runtime fallback only")
        print(f"WHO ICD-11 enabled: {who_enabled}; release: {WHO_ICD_RELEASE}")

        if args.dry_run:
            return

        with conn.transaction():
            concept_ids: dict[str, Any] = {}
            for concept in concepts.values():
                ontology = who_icd_search(concept["english_name"] or concept["canonical_name"])
                english_name = ontology["english_name"] if ontology else concept["english_name"]
                source = "who_icd11" if ontology else concept["source"]
                row = conn.execute(
                    """
                    INSERT INTO disease_concepts
                      (canonical_name, english_name, ontology_system, ontology_code,
                       ontology_uri, ontology_release, source, confidence)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (canonical_name) DO UPDATE SET
                      english_name = COALESCE(EXCLUDED.english_name, disease_concepts.english_name),
                      ontology_system = COALESCE(EXCLUDED.ontology_system, disease_concepts.ontology_system),
                      ontology_code = COALESCE(EXCLUDED.ontology_code, disease_concepts.ontology_code),
                      ontology_uri = COALESCE(EXCLUDED.ontology_uri, disease_concepts.ontology_uri),
                      ontology_release = COALESCE(EXCLUDED.ontology_release, disease_concepts.ontology_release),
                      source = CASE WHEN EXCLUDED.ontology_code IS NOT NULL THEN 'who_icd11'
                                    ELSE disease_concepts.source END,
                      confidence = GREATEST(disease_concepts.confidence, EXCLUDED.confidence),
                      updated_at = NOW()
                    RETURNING id
                    """,
                    (
                        concept["canonical_name"], english_name,
                        ontology["ontology_system"] if ontology else None,
                        ontology["ontology_code"] if ontology else None,
                        ontology["ontology_uri"] if ontology else None,
                        ontology["ontology_release"] if ontology else None,
                        source, concept["confidence"],
                    ),
                ).fetchone()
                concept_ids[normalize(concept["canonical_name"])] = row["id"]

            for alias in aliases.values():
                concept_id = concept_ids.get(normalize(alias["canonical"]))
                if not concept_id:
                    continue
                conn.execute(
                    """
                    INSERT INTO disease_aliases
                      (concept_id, alias, normalized_alias, language, source, confidence)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (concept_id, normalized_alias, language) DO UPDATE SET
                      confidence = GREATEST(disease_aliases.confidence, EXCLUDED.confidence),
                      source = CASE WHEN EXCLUDED.confidence >= disease_aliases.confidence
                                    THEN EXCLUDED.source ELSE disease_aliases.source END,
                      updated_at = NOW()
                    """,
                    (concept_id, alias["alias"], normalize(alias["alias"]), alias["language"], alias["source"], alias["confidence"]),
                )

            for alias, target in new_keywords.items():
                conn.execute(
                    """
                    INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
                    VALUES ('disease', %s, %s, 500, TRUE)
                    ON CONFLICT (category, keyword) DO NOTHING
                    """,
                    (alias, target),
                )

            for example in examples:
                label = example["disease_label"] or ""
                event_type = example["event_type"] or ""
                language = example["language"] or "unknown"
                digest = content_hash(example["text"], language, label, event_type)
                conn.execute(
                    """
                    INSERT INTO nlp_training_examples
                      (raw_report_id, content_hash, text, language, disease_label,
                       event_type, relevance_score, is_health_related, case_count,
                       death_count, source, confidence, split)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (content_hash) DO UPDATE SET
                      confidence = GREATEST(nlp_training_examples.confidence, EXCLUDED.confidence),
                      updated_at = NOW()
                    """,
                    (
                        example["raw_report_id"], digest, example["text"], language,
                        example["disease_label"], example["event_type"], example["relevance_score"],
                        example["is_health_related"], example["case_count"], example["death_count"],
                        "existing_event", example["confidence"], split_for(example["text"], label),
                    ),
                )
    finally:
        conn.close()


if __name__ == "__main__":
    main()
