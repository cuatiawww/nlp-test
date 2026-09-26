"""Fase 1 — read-only runtime registry audit (counts, readiness, sentinels).

CPU and GPU share these in-process registries. Readiness is explicit so a DB
failure that leaves an empty or seed-only dict is never reported as healthy.
"""

from __future__ import annotations

from typing import Any

from . import config
from .disease_master import resolve_local_disease_term

STATUS_LOADED = "loaded"
STATUS_FALLBACK = "fallback"
STATUS_UNAVAILABLE = "unavailable"

_LOCATION_SEED_NAMES = frozenset({"Tuy Đức", "Tuy Duc", "Sangatta"})


def _status(*, attempted: bool, loaded_ok: bool, using_fallback: bool = False) -> str:
    if not attempted:
        return STATUS_UNAVAILABLE
    if loaded_ok:
        return STATUS_LOADED
    if using_fallback:
        return STATUS_FALLBACK
    return STATUS_UNAVAILABLE


def _ensure_attempted_loads() -> None:
    if not config.KEYWORDS_LOAD_ATTEMPTED:
        config.load_keywords_from_db()
    if not getattr(config, "DISEASE_MASTER_LOAD_ATTEMPTED", False):
        config.load_disease_master_from_db()
    if not config.LOCATION_LOAD_ATTEMPTED:
        config.load_locations_from_db()
    if not config.LEXICON_LOAD_ATTEMPTED:
        config.load_language_markers_from_db()
    if not config.EXTRACTION_RULES:
        config.load_extraction_rules_from_db()
    if not config.OUTBREAK_RULES:
        config.load_outbreak_rules_from_db()


def registry_counts() -> dict[str, int]:
    _ensure_attempted_loads()
    concept_aliases = 0
    for concept in config.DISEASE_MASTER_CONCEPTS or []:
        concept_aliases += len(concept.get("aliases") or [])
    try:
        from .models.classifier import get_labels

        label_count = len(get_labels("disease") or [])
    except Exception:
        label_count = len(getattr(config, "DISEASE_LABELS", []) or [])
    return {
        "disease_keywords": len(config.DISEASE_DICT or {}),
        "symptom_keywords": len(config.SYMPTOM_DICT or {}),
        "disease_concepts": len(config.DISEASE_MASTER_CONCEPTS or []),
        "disease_concept_aliases": concept_aliases,
        "metric_case_keywords": len(config.get_lexicon_terms("metric_case")),
        "metric_death_keywords": len(config.get_lexicon_terms("metric_death")),
        "locations": len(config.LOCATION_COORDS or {}),
        "location_aliases": len(config.LOCATION_ALIASES or {}),
        "extraction_rules": sum(len(v) for v in (config.EXTRACTION_RULES or {}).values()),
        "extraction_rule_fields": len(config.EXTRACTION_RULES or {}),
        "outbreak_rules": len(config.OUTBREAK_RULES or {}),
        "label_classifier": label_count,
    }


def registry_readiness() -> dict[str, dict[str, Any]]:
    _ensure_attempted_loads()
    loc_keys = set(config.LOCATION_COORDS or {})
    seed_only = bool(loc_keys) and loc_keys <= _LOCATION_SEED_NAMES
    location_db_ok = bool(
        config.LOCATION_LOAD_ATTEMPTED
        and config.LOCATION_REGISTRY_REFERENCE_ID is not None
        and len(loc_keys) > len(_LOCATION_SEED_NAMES)
        and not seed_only
    )
    lexicon_loaded = bool(config.LEXICON_LOAD_ATTEMPTED and config.LEXICON_READY)
    lexicon_fallback = bool(
        config.LEXICON_LOAD_ATTEMPTED
        and not config.LEXICON_READY
        and (config.LANGUAGE_MARKERS or config.DEFAULT_LANGUAGE_MARKERS)
    )
    keywords_ok = bool(
        config.KEYWORDS_LOAD_ATTEMPTED and (config.DISEASE_DICT or config.SYMPTOM_DICT)
    )
    concepts_attempted = bool(getattr(config, "DISEASE_MASTER_LOAD_ATTEMPTED", True))
    concepts_ok = bool(config.DISEASE_MASTER_CONCEPTS)
    return {
        "disease_keywords": {
            "status": _status(
                attempted=config.KEYWORDS_LOAD_ATTEMPTED,
                loaded_ok=keywords_ok,
            ),
            "count": len(config.DISEASE_DICT or {}) + len(config.SYMPTOM_DICT or {}),
        },
        "disease_concepts": {
            "status": _status(attempted=concepts_attempted, loaded_ok=concepts_ok),
            "count": len(config.DISEASE_MASTER_CONCEPTS or []),
        },
        "locations": {
            "status": _status(
                attempted=config.LOCATION_LOAD_ATTEMPTED,
                loaded_ok=location_db_ok,
                using_fallback=bool(
                    config.LOCATION_LOAD_ATTEMPTED and not location_db_ok and seed_only
                ),
            ),
            "count": len(loc_keys),
            "alias_count": len(config.LOCATION_ALIASES or {}),
            "seed_only": seed_only,
        },
        "lexicon_metrics": {
            "status": _status(
                attempted=config.LEXICON_LOAD_ATTEMPTED,
                loaded_ok=lexicon_loaded,
                using_fallback=lexicon_fallback,
            ),
            "ready_flag": bool(config.LEXICON_READY),
            "metric_case_count": len(config.get_lexicon_terms("metric_case")),
            "metric_death_count": len(config.get_lexicon_terms("metric_death")),
        },
        "extraction_rules": {
            "status": _status(attempted=True, loaded_ok=bool(config.EXTRACTION_RULES)),
            "count": sum(len(v) for v in (config.EXTRACTION_RULES or {}).values()),
        },
        "outbreak_rules": {
            "status": _status(attempted=True, loaded_ok=bool(config.OUTBREAK_RULES)),
            "count": len(config.OUTBREAK_RULES or {}),
        },
        "label_classifier": {
            "status": STATUS_LOADED
            if getattr(config, "DISEASE_LABELS", None)
            else STATUS_UNAVAILABLE,
            "count": len(getattr(config, "DISEASE_LABELS", []) or []),
        },
    }


def _location_resolves(name: str) -> bool:
    target = (name or "").strip()
    if not target:
        return False
    folded = target.casefold()
    if any(str(k).casefold() == folded for k in (config.LOCATION_COORDS or {})):
        return True
    aliases = config.LOCATION_ALIASES or {}
    if folded in aliases or target in aliases:
        return True
    return any(str(k).casefold() == folded for k in aliases)


def _metric_resolves(surface: str, marker_type: str) -> bool:
    needle = (surface or "").strip().casefold()
    if not needle:
        return False
    return any(
        str(term).casefold() == needle for term in config.get_lexicon_terms(marker_type)
    )


def _disease_sentinel(surface: str, expect_tokens: tuple[str, ...]) -> dict[str, Any]:
    resolved = resolve_local_disease_term(surface)
    ok = False
    payload = None
    if resolved:
        blob = f"{resolved.get('disease_id')} {resolved.get('canonical_name')}".casefold()
        ok = any(tok.casefold() in blob for tok in expect_tokens)
        payload = {
            "disease_id": resolved.get("disease_id"),
            "canonical_name": resolved.get("canonical_name"),
        }
    return {"surface": surface, "ok": ok, "resolved": payload}


def registry_sentinels() -> dict[str, Any]:
    _ensure_attempted_loads()
    disease = [
        _disease_sentinel("Denggi", ("DENGUE", "Dengue")),
        _disease_sentinel("Demam denggi", ("DENGUE", "Dengue")),
        _disease_sentinel("HFMD", ("HFMD",)),
        _disease_sentinel("ISPA", ("ISPA", "ARI", "Respiratory")),
        _disease_sentinel("ARI", ("ISPA", "ARI", "Respiratory")),
    ]
    metrics = {
        "kes_to_cases": {
            "ok": _metric_resolves("kes", "metric_case"),
            "surface": "kes",
            "marker_type": "metric_case",
        },
        "death_to_deaths": {
            "ok": _metric_resolves("death", "metric_death")
            or _metric_resolves("deaths", "metric_death"),
            "surface": "death/deaths",
            "marker_type": "metric_death",
        },
        "meninggal_to_deaths": {
            "ok": _metric_resolves("meninggal", "metric_death")
            or _metric_resolves("meninggal dunia", "metric_death"),
            "surface": "meninggal",
            "marker_type": "metric_death",
        },
    }
    locations = {
        "Johor": {"ok": _location_resolves("Johor"), "surface": "Johor"},
        "Johor Bahru": {"ok": _location_resolves("Johor Bahru"), "surface": "Johor Bahru"},
    }
    all_ok = (
        all(item["ok"] for item in disease)
        and all(item["ok"] for item in metrics.values())
        and all(item["ok"] for item in locations.values())
    )
    return {
        "all_ok": all_ok,
        "disease": disease,
        "metrics": metrics,
        "locations": locations,
    }


def registry_audit() -> dict[str, Any]:
    counts = registry_counts()
    readiness = registry_readiness()
    sentinels = registry_sentinels()
    critical = ("disease_keywords", "disease_concepts", "locations", "lexicon_metrics")
    unhealthy = [
        name
        for name in critical
        if readiness.get(name, {}).get("status") == STATUS_UNAVAILABLE
    ]
    return {
        "source": "shared_runtime_registry",
        "cpu_gpu_parity": True,
        "counts": counts,
        "readiness": readiness,
        "sentinels": sentinels,
        "healthy": (not unhealthy) and bool(sentinels.get("all_ok")),
        "unhealthy_registries": unhealthy,
    }
