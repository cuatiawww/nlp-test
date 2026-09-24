"""Decide when optional DeepSeek rear-gate validator and corrector may run.

Rules NLP and gazetteer matching always run first. The LLM is strictly a
Rear-Gate Validator for ambiguous/low-confidence extractions — never every
raw crawl item, and never educational/non-event articles.
"""

from __future__ import annotations

from . import config


def should_escalate_to_llm(
    *,
    historical_fast: bool = False,
    interactive: bool = False,
    is_noisy: bool = False,
    disease: str | None = None,
    confidence: float = 0.0,
    extracted: list[str] | None = None,
    language: str = "en",
    needs_review: bool = False,
    location_missing: bool = False,
    non_health_topic: bool = False,
    sub_events: list | None = None,
) -> bool:
    """Return True ONLY for valid outbreak candidates requiring rear-gate validation/correction."""
    if historical_fast or interactive or is_noisy or non_health_topic:
        return False
    if not config.AGENT_ENABLED:
        return False

    extracted = extracted or []
    label = (disease or "").strip().upper()
    unknown = label in {"", "UNKNOWN"} or label.startswith("NEGATIVE")

    # Strictly guard: If local pipeline found NO candidates and NO disease,
    # do NOT escalate (save 100% tokens on non-health/junk articles).
    if unknown and not extracted:
        return False

    # Escalation criteria:
    # 1. Disease is UNKNOWN or confidence < threshold
    if unknown or confidence < config.DEEPSEEK_TRIGGER_CONFIDENCE:
        return True

    # 2. Pipeline flagged needs_review or missing location for an active metric
    if needs_review or location_missing:
        return True

    # 3. Non-English/Indonesian article with missing extraction
    if language not in {"en", "id"} and not extracted:
        return True

    return False


def truncate_for_llm(text: str | None, limit: int | None = None) -> str:
    """Bound prompt size for LLM input (up to 16,000 characters for full clean context)."""
    cap = config.DEEPSEEK_PROMPT_CHARS if limit is None else limit
    value = text or ""
    if cap <= 0:
        return ""
    if len(value) <= cap:
        return value
    return value[:cap].rsplit(" ", 1)[0]
