"""Field-level QA gate shared by CI and the validation scripts."""
from __future__ import annotations

from typing import Any


DEFAULT_QA_THRESHOLDS: dict[str, dict[str, float]] = {
    "disease": {"precision": 0.90, "recall": 0.90},
    "country": {"precision": 0.95, "recall": 0.95},
    "cases": {"precision": 0.90, "recall": 0.90},
    "deaths": {"precision": 0.90, "recall": 0.90},
    "location": {"precision": 0.85, "recall": 0.85},
    "time": {"precision": 0.85, "recall": 0.85},
    "evidence": {"precision": 0.90, "recall": 0.90},
}


def evaluate_field_report(
    report: dict[str, Any],
    thresholds: dict[str, dict[str, float]] | None = None,
    min_annotated: int = 5,
) -> dict[str, Any]:
    """Return a deterministic pass/fail decision without changing predictions.

    A field with no annotation is not treated as correct.  It is explicitly
    marked ``insufficient_coverage`` so missing temporal or native-script gold
    cannot hide behind a good aggregate score.
    """
    configured = thresholds or DEFAULT_QA_THRESHOLDS
    fields = report.get("fields") or {}
    results: dict[str, Any] = {}
    overall = True
    for field, target in configured.items():
        actual = fields.get(field) or {}
        annotated = int(actual.get("annotated") or 0)
        precision = actual.get("precision")
        recall = actual.get("recall")
        reasons: list[str] = []
        if annotated < min_annotated:
            reasons.append(f"annotated={annotated} < minimum={min_annotated}")
        if precision is None or float(precision) < target["precision"]:
            reasons.append(
                f"precision={precision!r} < required={target['precision']:.2f}"
            )
        if recall is None or float(recall) < target["recall"]:
            reasons.append(f"recall={recall!r} < required={target['recall']:.2f}")
        passed = not reasons
        overall = overall and passed
        results[field] = {
            "status": "pass" if passed else "fail",
            "annotated": annotated,
            "precision": precision,
            "recall": recall,
            "required": target,
            "reasons": reasons,
        }
    return {
        "status": "pass" if overall else "fail",
        "min_annotated": min_annotated,
        "fields": results,
    }
