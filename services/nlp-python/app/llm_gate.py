"""Decide when optional DeepSeek/OpenAI fallbacks may run.

Rules NLP and gazetteer matching always run first. The LLM is only for
ambiguous extraction / needs_review escalation — never every raw crawl item,
and never full dashboard payloads.
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
) -> bool:
    """Return True only for high-value, low-confidence steps.

    Multiple extracted diseases are *not* an LLM trigger: prevention articles
    commonly list several pathogens and local ranking already handles that.
    """
    if historical_fast or interactive or is_noisy or non_health_topic:
        return False
    if not config.AGENT_ENABLED:
        return False
    extracted = extracted or []
    label = (disease or "").strip().upper()
    unknown = label in {"", "UNKNOWN"} or label.startswith("NEGATIVE")
    if unknown or confidence < config.DEEPSEEK_TRIGGER_CONFIDENCE:
        return True
    if needs_review or location_missing:
        return True
    if language not in {"en", "id"} and not extracted:
        return True
    return False


def truncate_for_llm(text: str | None, limit: int | None = None) -> str:
    """Bound prompt size so crawl bodies never dump a full article or dashboard."""
    cap = config.DEEPSEEK_PROMPT_CHARS if limit is None else limit
    value = text or ""
    if cap <= 0:
        return ""
    if len(value) <= cap:
        return value
    return value[:cap].rsplit(" ", 1)[0]
