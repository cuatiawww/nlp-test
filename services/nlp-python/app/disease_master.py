"""Local disease-master resolver.

Resolution is database-only: active concepts and aliases loaded by the
database-backed master are the sole source of truth.
No external ontology lookup, token exchange, or concept auto-learning occurs.
"""

from __future__ import annotations

import re
from typing import Any

from . import config


def _mention_value(mention: Any, key: str, default: Any = None) -> Any:
    if isinstance(mention, dict):
        return mention.get(key, default)
    return getattr(mention, key, default)


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s-]", " ", (value or "").lower())).strip()


def project_disease_master_output(
    primary: str,
    extracted: list[str],
    mentions: list[Any],
) -> dict[str, Any]:
    """Keep only disease labels resolved by the local disease master."""
    resolved: list[str] = []
    # Candidate extraction and master resolution are separate concerns. A
    # surface form with no current master row is still useful evidence and
    # must remain visible for review instead of disappearing from the article.
    seen_identity: set[str] = set()
    unresolved_indexes: list[int] = []
    primary_resolved: str | None = None

    for index, mention in enumerate(mentions):
        name = str(_mention_value(mention, "canonical_name", "") or "").strip()
        master_id = str(_mention_value(mention, "disease_id", "") or "").strip()
        if not name or name.upper() == "UNKNOWN":
            unresolved_indexes.append(index)
            continue

        if not master_id:
            if name not in resolved:
                resolved.append(name)
            unresolved_indexes.append(index)
            continue

        identity = f"master:{master_id.casefold()}"
        if identity not in seen_identity:
            seen_identity.add(identity)
            resolved.append(name)
        role = str(_mention_value(mention, "role", "") or "").lower()
        if role == "primary" and primary_resolved is None:
            primary_resolved = name

    all_candidate_names = [
        str(_mention_value(mention, "canonical_name", "") or "").strip()
        for mention in mentions
    ]
    if primary_resolved is None and resolved:
        primary_norm = (primary or "").strip().casefold()
        primary_resolved = next(
            (name for name in resolved if name.casefold() == primary_norm),
            resolved[0] if not primary_norm or primary_norm == "unknown" else None,
        )
    if primary_resolved is None and primary:
        primary_resolved = next(
            (name for name in all_candidate_names if name.casefold() == primary.casefold()),
            None,
        )

    return {
        "primary": primary_resolved or "UNKNOWN",
        "extracted": resolved,
        "unresolved_indexes": unresolved_indexes,
    }


def _concept_term_values(concept: dict[str, Any]) -> list[str]:
    names = [concept.get("canonical_name"), concept.get("english_name")]
    names.extend(
        item.get("alias") if isinstance(item, dict) else item
        for item in (concept.get("aliases") or [])
    )
    return [str(name).strip() for name in names if name and str(name).strip()]


def _match_local_concept(term: str, catalog: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Match a surface form against active database concepts and aliases."""
    from .extractors import DISEASE_STOPWORDS, _normalize_entity_text, normalize_disease_display

    weak_terms = set(DISEASE_STOPWORDS) | {"influenza", "flu", "viral"}
    variants: list[str] = []
    for raw in (term, normalize_disease_display(term or "")):
        value = str(raw or "").strip()
        if value and value.upper() != "UNKNOWN" and value not in variants:
            variants.append(value)

    best: dict[str, Any] | None = None
    best_score = 0
    for variant in variants:
        vnorm = _normalize_entity_text(variant)
        if not vnorm:
            continue
        for concept in catalog:
            for label in _concept_term_values(concept):
                lnorm = _normalize_entity_text(label)
                if not lnorm:
                    continue
                score = 0
                if vnorm == lnorm:
                    score = 1000 + len(lnorm)
                elif vnorm in weak_terms or lnorm in weak_terms:
                    continue
                elif len(vnorm) >= 4 and len(lnorm) >= 4 and (vnorm in lnorm or lnorm in vnorm):
                    shorter, longer = (vnorm, lnorm) if len(vnorm) <= len(lnorm) else (lnorm, vnorm)
                    if set(shorter.split()) <= set(longer.split()) or shorter in longer:
                        score = 100 + len(shorter)
                if score > best_score:
                    best = concept
                    best_score = score
    return best


def _as_local_resolution(
    concept: dict[str, Any],
    confidence: float,
    source: str = "local_disease_master",
) -> dict[str, Any] | None:
    canonical = str(concept.get("canonical_name") or "").strip()
    disease_id = str(concept.get("disease_id") or "").strip()
    if not canonical or canonical.upper() == "UNKNOWN" or not disease_id:
        return None
    return {
        "disease_id": disease_id,
        "canonical_name": canonical,
        "english_name": concept.get("english_name") or canonical,
        "master_source": concept.get("source") or concept.get("ontology_system") or "local_database",
        "ontology_code": None,
        "ontology_uri": None,
        "confidence": confidence,
        "resolution_source": source,
    }


def resolve_local_disease_term(term: str) -> dict[str, Any] | None:
    """Resolve a disease term against the active local database master."""
    raw = (term or "").strip()
    if not raw or raw.upper() == "UNKNOWN":
        return None
    concept = _match_local_concept(raw, config.DISEASE_MASTER_CONCEPTS)
    return _as_local_resolution(concept, 0.99) if concept else None


def _resolve_local_only(term: str) -> dict[str, Any] | None:
    return resolve_local_disease_term(term)


def resolve_disease_term(term: str, language: str = "", sample_text: str = "") -> dict[str, Any] | None:
    """Resolve one term locally; language and sample text are compatibility inputs."""
    del language, sample_text
    return resolve_local_disease_term(term)
