"""Fase 2 — rules-first disease resolver with explicit provenance.

Contract:
- rule + evidence > model
- rule outside the classifier label set remains valid
- model without textual evidence → UNKNOWN
- rule vs evidenced model conflict → keep rule, model_rule_conflict + needs_review
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Callable

EvidenceFn = Callable[[str, str], bool]


@dataclass
class DiseaseResolution:
    disease: str
    source: str  # rule | model | unknown | rule_over_model
    model_rule_conflict: bool
    needs_review: bool
    rule_disease: str | None
    model_disease: str | None
    evidence_ok: bool

    def as_provenance(self) -> dict[str, Any]:
        return {
            "disease_resolution_source": self.source,
            "model_rule_conflict": self.model_rule_conflict,
            "rule_disease": self.rule_disease,
            "model_disease": self.model_disease,
            "evidence_ok": self.evidence_ok,
        }

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def _norm(value: str | None) -> str:
    return " ".join(str(value or "").strip().casefold().split())


def resolve_disease_label(
    *,
    rule_candidates: list[str] | None,
    model_disease: str | None,
    text: str,
    has_textual_evidence: EvidenceFn,
    unknown_label: str = "UNKNOWN",
) -> DiseaseResolution:
    """Resolve one disease label under the rules-first contract."""
    corpus = text or ""
    rules: list[str] = []
    for candidate in rule_candidates or []:
        name = str(candidate or "").strip()
        if not name or _norm(name) == _norm(unknown_label):
            continue
        if has_textual_evidence(name, corpus):
            if name not in rules:
                rules.append(name)

    model = str(model_disease or "").strip() or None
    if model and _norm(model) == _norm(unknown_label):
        model = None
    model_ok = bool(model and has_textual_evidence(model, corpus))

    if rules:
        rule = rules[0]
        if model and model_ok and _norm(model) != _norm(rule):
            return DiseaseResolution(
                disease=rule,
                source="rule_over_model",
                model_rule_conflict=True,
                needs_review=True,
                rule_disease=rule,
                model_disease=model,
                evidence_ok=True,
            )
        return DiseaseResolution(
            disease=rule,
            source="rule",
            model_rule_conflict=False,
            needs_review=False,
            rule_disease=rule,
            model_disease=model,
            evidence_ok=True,
        )

    if model_ok and model:
        return DiseaseResolution(
            disease=model,
            source="model",
            model_rule_conflict=False,
            needs_review=False,
            rule_disease=None,
            model_disease=model,
            evidence_ok=True,
        )

    return DiseaseResolution(
        disease=unknown_label,
        source="unknown",
        model_rule_conflict=False,
        needs_review=True,
        rule_disease=None,
        model_disease=model,
        evidence_ok=False,
    )


def apply_resolution_to_provenance(
    provenance: dict[str, Any] | None,
    resolution: DiseaseResolution,
) -> dict[str, Any]:
    merged = dict(provenance or {})
    merged.update(resolution.as_provenance())
    if resolution.model_rule_conflict:
        flags = list(merged.get("validation_flags") or [])
        if "model_rule_conflict" not in flags:
            flags.append("model_rule_conflict")
        merged["validation_flags"] = flags
    return merged
