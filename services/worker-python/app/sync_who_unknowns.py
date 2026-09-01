"""Discover diseases in UNKNOWN reports and register WHO ICD-11 concepts.

DeepSeek is used only to extract the surface disease name from text. The
canonical name and ICD-11 code are accepted only from the WHO ICD API.
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import logging
import os
import re
import time
from typing import Any

import psycopg
import requests
from psycopg.rows import dict_row


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("sync-who-unknowns")

DATABASE_URL = os.getenv("DATABASE_URL", "postgres://postgres:root@host.docker.internal:9898/disease_ai")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "").strip()
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")
DEEPSEEK_TIMEOUT = int(os.getenv("DEEPSEEK_TIMEOUT_SECONDS", "30"))
DEEPSEEK_MIN_CONFIDENCE = float(os.getenv("WHO_UNKNOWN_MIN_CONFIDENCE", "0.85"))
WHO_CLIENT_ID = os.getenv("WHO_ICD_CLIENT_ID", "").strip()
WHO_CLIENT_SECRET = os.getenv("WHO_ICD_CLIENT_SECRET", "").strip()
WHO_TOKEN_URL = os.getenv("WHO_ICD_TOKEN_URL", "https://icdaccessmanagement.who.int/connect/token")
WHO_API_URL = os.getenv("WHO_ICD_API_URL", "https://id.who.int").rstrip("/")
WHO_RELEASE = os.getenv("WHO_ICD_RELEASE", "11/2026-01/mms").strip("/")
WHO_LANGUAGE = os.getenv("WHO_ICD_LANGUAGE", "en")
WHO_API_VERSION = os.getenv("WHO_ICD_API_VERSION", "v2")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=500, help="Maksimum report UNKNOWN yang dipindai.")
    parser.add_argument("--dry-run", action="store_true", help="Tampilkan hasil tanpa menulis database.")
    parser.add_argument(
        "--term", action="append", default=[],
        help="Istilah WHO langsung untuk sinkronisasi; boleh diulang, misalnya --term Ebola.",
    )
    parser.add_argument("--include-health", action="store_true", help="Sertakan UNKNOWN yang masih ditandai health.")
    return parser.parse_args()


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s-]", " ", value or "").lower()).strip()


def deepseek_json(text: str) -> dict[str, Any]:
    if not DEEPSEEK_API_KEY:
        return {}
    body = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {
                "role": "system",
                "content": "You extract explicitly mentioned diseases. Return JSON only.",
            },
            {
                "role": "user",
                "content": (
                    "Extract only disease names explicitly written in this report. "
                    "Do not infer from symptoms, deaths, or the word outbreak. "
                    "Return {diseases:[{surface_form,language,confidence}]} and omit "
                    "uncertain terms. Do not create ICD codes or canonical names.\n\n"
                    f"report={json.dumps((text or '')[:5000], ensure_ascii=False)}"
                ),
            },
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "max_completion_tokens": 500,
    }
    response = requests.post(
        (DEEPSEEK_BASE_URL if DEEPSEEK_BASE_URL.endswith("/chat/completions") else f"{DEEPSEEK_BASE_URL}/chat/completions"),
        headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}"},
        json=body,
        timeout=DEEPSEEK_TIMEOUT,
    )
    response.raise_for_status()
    content = response.json()["choices"][0]["message"].get("content") or "{}"
    content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content.strip(), flags=re.I)
    result = json.loads(content)
    return result if isinstance(result, dict) else {}


def who_token() -> str:
    if not WHO_CLIENT_ID or not WHO_CLIENT_SECRET:
        raise RuntimeError("WHO_ICD_CLIENT_ID dan WHO_ICD_CLIENT_SECRET wajib diisi")
    basic = base64.b64encode(f"{WHO_CLIENT_ID}:{WHO_CLIENT_SECRET}".encode()).decode("ascii")
    response = requests.post(
        WHO_TOKEN_URL,
        headers={"Authorization": f"Basic {basic}"},
        data={"grant_type": "client_credentials", "scope": "icdapi_access"},
        timeout=30,
    )
    response.raise_for_status()
    return str(response.json()["access_token"])


def who_search(term: str, token: str) -> dict[str, str] | None:
    response = requests.get(
        f"{WHO_API_URL}/icd/release/{WHO_RELEASE}/search",
        params={
            "q": term,
            "flatResults": "true",
            "highlightingEnabled": "false",
            "useFlexisearch": "true",
        },
        headers={
            "Authorization": f"Bearer {token}",
            "API-Version": WHO_API_VERSION,
            "Accept-Language": WHO_LANGUAGE,
        },
        timeout=30,
    )
    response.raise_for_status()
    entities = response.json().get("destinationEntities", [])
    if not isinstance(entities, list):
        return None
    query = normalize(term)

    def score(entity: dict[str, Any]) -> tuple[int, int, int, float]:
        title = normalize(str(entity.get("title") or ""))
        exact = int(title == query)
        starts = int(title.startswith(query))
        code = int(bool(entity.get("theCode")))
        api_score = float(entity.get("score") or 0)
        return exact, starts, code, api_score

    candidates = [entity for entity in entities if isinstance(entity, dict) and entity.get("theCode")]
    if not candidates:
        return None
    best = max(candidates, key=score)
    title = str(best.get("title") or term).strip()
    uri = str(best.get("id") or "").replace("http://", "https://", 1)
    return {
        "canonical_name": title,
        "english_name": title,
        "ontology_system": "WHO ICD-11 MMS",
        "ontology_code": str(best["theCode"]),
        "ontology_uri": uri,
        "ontology_release": WHO_RELEASE,
    }


def discover_terms(text: str) -> list[dict[str, Any]]:
    result = deepseek_json(text)
    terms = result.get("diseases", [])
    if not isinstance(terms, list):
        return []
    discovered = []
    for item in terms:
        if not isinstance(item, dict):
            continue
        surface = str(item.get("surface_form") or "").strip()
        confidence = float(item.get("confidence") or 0)
        if surface and confidence >= DEEPSEEK_MIN_CONFIDENCE:
            discovered.append({
                "surface_form": surface,
                "language": str(item.get("language") or "unknown"),
                "confidence": min(confidence, 1.0),
            })
    return discovered


def upsert_concept(conn: psycopg.Connection, concept: dict[str, str], aliases: list[dict[str, Any]]) -> None:
    row = conn.execute(
        """
        INSERT INTO disease_concepts
          (canonical_name, english_name, ontology_system, ontology_code,
           ontology_uri, ontology_release, source, confidence)
        VALUES (%s, %s, %s, %s, %s, %s, 'who_icd11', 1.0)
        ON CONFLICT (canonical_name) DO UPDATE SET
          english_name = EXCLUDED.english_name,
          ontology_system = EXCLUDED.ontology_system,
          ontology_code = EXCLUDED.ontology_code,
          ontology_uri = EXCLUDED.ontology_uri,
          ontology_release = EXCLUDED.ontology_release,
          source = 'who_icd11',
          confidence = GREATEST(disease_concepts.confidence, EXCLUDED.confidence),
          updated_at = NOW()
        RETURNING id
        """,
        (
            concept["canonical_name"], concept["english_name"], concept["ontology_system"],
            concept["ontology_code"], concept["ontology_uri"], concept["ontology_release"],
        ),
    ).fetchone()
    concept_id = row["id"]
    all_aliases = aliases + [{"surface_form": concept["english_name"], "language": "en", "confidence": 1.0}]
    for alias in all_aliases:
        surface = alias["surface_form"].strip()
        if not surface:
            continue
        language = alias.get("language") or "unknown"
        confidence = float(alias.get("confidence") or 0.0)
        conn.execute(
            """
            INSERT INTO disease_aliases
              (concept_id, alias, normalized_alias, language, source, confidence)
            VALUES (%s, %s, %s, %s, 'who_icd11', %s)
            ON CONFLICT (concept_id, normalized_alias, language) DO UPDATE SET
              confidence = GREATEST(disease_aliases.confidence, EXCLUDED.confidence),
              source = 'who_icd11', updated_at = NOW()
            """,
            (concept_id, surface, normalize(surface), language, confidence),
        )
        conn.execute(
            """
            INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
            VALUES ('disease', %s, %s, 400, TRUE)
            ON CONFLICT (category, keyword) DO UPDATE SET
              target_label = EXCLUDED.target_label, is_active = TRUE, priority = LEAST(nlp_keywords.priority, EXCLUDED.priority),
              updated_at = NOW()
            """,
            (normalize(surface), concept["canonical_name"]),
        )


def sync_unknown_concepts(
    conn: psycopg.Connection,
    *,
    limit: int = 500,
    include_health: bool = False,
    terms: list[str] | None = None,
    dry_run: bool = False,
) -> int:
    """Resolve UNKNOWN terms and optionally persist validated WHO concepts."""
    terms = terms or []
    if limit < 0:
        raise ValueError("limit harus >= 0")
    if not terms and not DEEPSEEK_API_KEY:
        raise RuntimeError("DEEPSEEK_API_KEY wajib diisi untuk auto-discovery, atau gunakan term.")

    if terms:
        rows = [{"id": None, "original_text": "", "language": "unknown"}]
    else:
        health_filter = "" if include_health else "AND COALESCE(e.is_health_related, FALSE) IS FALSE"
        rows = conn.execute(
            f"""
            SELECT e.id, e.original_text, e.language
            FROM disease_events e
            WHERE UPPER(COALESCE(e.disease_classification, '')) = 'UNKNOWN'
              {health_filter}
            ORDER BY e.created_at, e.id
            LIMIT %s
            """,
            (limit,),
        ).fetchall()
    logger.info("UNKNOWN reports to inspect: %d", len(rows))
    if not rows:
        return 0

    token = who_token()
    resolved: dict[str, tuple[dict[str, str], list[dict[str, Any]]]] = {}
    for row in rows:
        discovered = [
            {"surface_form": term, "language": "en", "confidence": 1.0}
            for term in terms
        ] if terms else discover_terms(row["original_text"] or "")
        for term in discovered:
            key = normalize(term["surface_form"])
            if not key or key in resolved:
                continue
            try:
                concept = who_search(term["surface_form"], token)
            except requests.RequestException as exc:
                logger.warning("WHO search failed for %s: %s", term["surface_form"], exc)
                continue
            if not concept:
                logger.info("WHO concept not found for %s", term["surface_form"])
                continue
            resolved[key] = (concept, [term])
            logger.info(
                "%s -> %s [%s]",
                term["surface_form"], concept["canonical_name"], concept["ontology_code"],
            )

    if not dry_run:
        with conn.transaction():
            for concept, aliases in resolved.values():
                upsert_concept(conn, concept, aliases)
        logger.info("WHO concepts upserted: %d", len(resolved))
    return len(resolved)


def main() -> int:
    args = parse_args()
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        sync_unknown_concepts(
            conn,
            limit=args.limit,
            include_health=args.include_health,
            terms=args.term,
            dry_run=args.dry_run,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
