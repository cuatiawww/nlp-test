"""Gatekeeper logic to determine when DeepSeek local LLM is actually required."""

from __future__ import annotations

import logging
import re
from . import config

logger = logging.getLogger(__name__)

# A count token sitting next to a case/death label. Years and the "19" in
# COVID-19 are not metric evidence.
_UNBOUND_METRIC = re.compile(
    r"(?<![-A-Za-z])(\d[\d.,]*)(?:\s+[A-Za-z][\w'-]*){0,6}\s+"
    r"(?:kasus|cases?|infections?|deaths?|dead|meninggal|kematian|"
    r"tử\s*vong|ca\s+mắc|ca\s+tử|เสียชีวิต)"
    r"|(?:kasus|cases?|deaths?|dead|meninggal|kematian|ca\s+mắc)"
    r"\s+(?:sebanyak\s+|reaching\s+|of\s+|mencapai\s+)?"
    r"(?<![-A-Za-z])(\d[\d.,]*)"
    r"|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|"
    r"satu|dua|tiga|empat|lima)\s+dead\b",
    re.IGNORECASE,
)


def _year_token(token: str) -> bool:
    digits = re.sub(r"[^\d]", "", token or "")
    return len(digits) == 4 and digits.startswith(("19", "20"))


def text_has_unbound_metric_evidence(text: str | None) -> bool:
    """True when the article states a case or death figure the rules did not bind."""
    for match in _UNBOUND_METRIC.finditer(text or ""):
        token = match.group(1) or match.group(2) or ""
        if token and _year_token(token):
            continue
        return True
    return False


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
    unbound_metrics: bool = False,
    publisher_country_conflict: bool = False,
) -> bool:
    """Return True ONLY for valid outbreak candidates requiring rear-gate validation/correction."""
    # 1. Front-Gate Hard Rejections (Zero Token Waste):
    # - Non-health topics (skripsi, pertanian, judi online, militer, politik)
    # - NCD-only articles (kanker, diabetes, stroke) without infectious outbreak
    # - Pure policy/market/administrative articles without an active outbreak
    if historical_fast or is_noisy or non_health_topic or ncd_only or not is_health_related:
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
        and not unbound_metrics
        and not publisher_country_conflict
    ):
        return False
    if not config.AGENT_ENABLED:
        return False

    unknown = not disease or disease.strip().upper() == "UNKNOWN"
    # Rules often pin confidence at 0.85 as soon as a disease name is
    # source-grounded, before any case or death number is bound. That row
    # is exactly what the rear gate is for: correct the miss, do not replace
    # the rules extractor.
    if unbound_metrics and not unknown and case_count <= 0 and death_count <= 0:
        return True
    # The same rear gate watches a publisher country that survived after the
    # article named a different country. Rules stay first; this only fires
    # when they still kept the outlet's country.
    if publisher_country_conflict:
        return True
    # Already-high-confidence rows stay local, including official bulletins,
    # unless the unbound-metric carve-out above applied.
    if confidence >= config.DEEPSEEK_TRIGGER_CONFIDENCE:
        return False

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

# Agent / DeepSeek invocation status (Fase 0 baseline).
# Distinguishes why the external LLM was or was not used so QA never
# confuses "disabled" with "gate skipped" or "provider failed".
AGENT_STATUS_DISABLED = "disabled"
AGENT_STATUS_NOT_CALLED_GATE = "not_called_gate"
AGENT_STATUS_FAILED = "failed"
AGENT_STATUS_APPLIED = "applied"

AGENT_INVOCATION_STATUSES = (
    AGENT_STATUS_DISABLED,
    AGENT_STATUS_NOT_CALLED_GATE,
    AGENT_STATUS_FAILED,
    AGENT_STATUS_APPLIED,
)


def resolve_agent_invocation_status(
    *,
    agent_enabled: bool | None = None,
    gate_would_escalate: bool = False,
    review_attempted: bool = False,
    review_applied: bool = False,
    review_failed: bool = False,
) -> str:
    """Classify DeepSeek/agent usage for a single analyze call.

    Priority:
    1. disabled — AGENT_ENABLED is false (kill switch; no HTTP ever)
    2. failed — enabled + gate said yes, but call errored / returned empty
    3. applied — enabled + review succeeded and was merged
    4. not_called_gate — enabled but gate rejected escalation (or never attempted)
    """
    enabled = config.AGENT_ENABLED if agent_enabled is None else bool(agent_enabled)
    if not enabled:
        return AGENT_STATUS_DISABLED
    if review_failed:
        return AGENT_STATUS_FAILED
    if review_applied:
        return AGENT_STATUS_APPLIED
    if review_attempted and not review_applied:
        # Attempted but empty / None response without raising — treat as failed
        # so operators do not confuse it with a deliberate gate skip.
        return AGENT_STATUS_FAILED
    if not gate_would_escalate:
        return AGENT_STATUS_NOT_CALLED_GATE
    # Gate would escalate but nothing attempted (defensive).
    return AGENT_STATUS_NOT_CALLED_GATE
