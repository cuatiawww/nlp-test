"""Gatekeeper logic to determine when DeepSeek local LLM is actually required."""

from __future__ import annotations

import logging
from . import config

logger = logging.getLogger(__name__)


def should_escalate_to_llm(
    historical_fast: bool = False,
    interactive: bool = False,
    is_noisy: bool = False,
    disease: str = "UNKNOWN",
    confidence: float = 0.0,
    extracted: list[str] | None = None,
    language: str = "en",
    needs_review: bool = False,
    location_missing: bool = False,
    non_health_topic: bool = False,
    sub_events: list | None = None,
    ncd_only: bool = False,
    is_policy_content: bool = False,
    is_explicit_outbreak: bool = False,
    is_official_bulletin: bool = False,
    case_count: int = 0,
    death_count: int = 0,
    has_location_conflict: bool = False,
    is_health_related: bool = False,
) -> bool:
    """Return True ONLY for valid outbreak candidates requiring rear-gate validation/correction."""
    # 1. Front-Gate Hard Rejections (Zero Token Waste):
    # - Non-health topics (skripsi, pertanian, judi online, militer, politik)
    # - NCD-only articles (kanker, diabetes, stroke) without infectious outbreak
    # - Pure policy/market/administrative articles without an active outbreak
    if historical_fast or is_noisy or non_health_topic or ncd_only:
        return False
    # DeepSeek is a bounded review/override layer, never the primary
    # classifier. Do not spend tokens on non-health or already high-confidence
    # rows, even when they are official bulletins or contain many locations.
    if not is_health_related or confidence >= config.DEEPSEEK_TRIGGER_CONFIDENCE:
        return False
    # Informational/policy articles without incident metrics remain a
    # zero-token path. A health article that contains cases or deaths must
    # still be reviewable: statistical wording can hide swapped metrics,
    # historical totals, or a wrong disease/location classifier.
    if (
        is_policy_content
        and not (is_explicit_outbreak or is_official_bulletin)
        and case_count <= 0
        and death_count <= 0
    ):
        return False
    if not config.AGENT_ENABLED:
        return False

    unknown = not disease or disease.strip().upper() == "UNKNOWN"

    # Strictly guard: If local pipeline found NO candidates and NO disease,
    # do NOT escalate (save 100% tokens on non-health/junk articles).
    if unknown and not extracted and not (is_official_bulletin or is_explicit_outbreak):
        return False

    # 2. Priority Escalation for Authoritative Outbreak Bulletins (e.g. WHO DON, official KLB alerts):
    # If the article is an official outbreak bulletin or explicit outbreak report,
    # ensure LLM verifies and structures the event whenever local confidence is not absolute,
    # or location hierarchy/sub-events require ground-truth verification.
    if is_official_bulletin or is_explicit_outbreak:
        if unknown or confidence < config.DEEPSEEK_MIN_CONFIDENCE or location_missing or needs_review:
            return True

    # 3. Standard Escalation criteria:
    # a. Disease is UNKNOWN or confidence <= threshold (operator rule: confidence <= 0.75 triggers review)
    if unknown or confidence <= config.DEEPSEEK_TRIGGER_CONFIDENCE:
        return True

    # b. Pipeline flagged needs_review (e.g. uncertain geocode, count conflict, epistemic review)
    if needs_review:
        return True

    # c. Location conflict or disease identified but location missing
    if has_location_conflict or (not unknown and location_missing):
        return True

    # d. Outbreak article with zero metrics extracted (e.g. Vietnam HFMD where regex missed 6,573)
    if is_explicit_outbreak and case_count == 0 and death_count == 0:
        return True

    # e. Non-English/Indonesian article with missing extraction
    if language not in {"en", "id"} and not extracted:
        return True

    # f. Multi-event complex bundle requiring rear-gate validation
    if sub_events and len(sub_events) > 1:
        return True

    return False


def truncate_for_llm(text: str | None, limit: int | None = None) -> str:
    """Bound prompt size for LLM input (up to 16,000 characters for full clean context)."""
    cap = getattr(config, "DEEPSEEK_PROMPT_CHARS", 16000) if limit is None else limit
    value = text or ""
    if cap <= 0:
        return ""
    if len(value) <= cap:
        return value
    return value[:cap].rsplit(" ", 1)[0]
