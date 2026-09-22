#!/usr/bin/env python3
"""Build a review-safe multilingual retraining manifest.

The official gold pack is an evaluation set and must not silently become
training data.  Slice 7 URL runs are also not labels: they are a review queue
until a person confirms the disease, scope, locality, metric, period, and
native evidence.  This script keeps those two roles explicit in one JSONL
manifest so a later training job cannot accidentally learn from predictions.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_GOLD = ROOT / "services/nlp-python/tests/nlp_gold/nlp-gold-20.json"
DEFAULT_FOCUS = ROOT / "docs/catatan/slice7-focus-regressions-2026-09-22.json"
DEFAULT_OUTPUT = ROOT / "docs/catatan/multilingual-retraining-manifest-2026-09-22.jsonl"

TARGET_FIELDS = (
    "disease",
    "country",
    "location",
    "cases",
    "deaths",
    "time",
    "evidence",
)


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _source_hash(url: str, source_text: str) -> str:
    value = (url.strip() or source_text.strip()).encode("utf-8")
    return hashlib.sha256(value).hexdigest()[:16]


def _gold_text(row: dict[str, Any]) -> str:
    return "\n".join(
        str(value).strip()
        for value in (row.get("title"), row.get("evidence_quote") or row.get("text"))
        if value and str(value).strip()
    )


def _expected_labels(row: dict[str, Any]) -> dict[str, Any]:
    expected = row.get("expected") or row.get("expect") or {}
    return {
        "disease": expected.get("disease"),
        "country": expected.get("country"),
        "location": expected.get("province_or_city", expected.get("location")),
        "cases": expected.get("cases"),
        "deaths": expected.get("deaths"),
        "time": expected.get("time") or expected.get("event_date") or expected.get("reporting_period"),
        "evidence": row.get("evidence_quote") or expected.get("evidence"),
    }


def gold_rows(payload: dict[str, Any]) -> Iterable[dict[str, Any]]:
    for row in payload.get("fixtures") or []:
        text = _gold_text(row)
        if not text:
            raise ValueError(f"gold row {row.get('id')} has no original evidence text")
        url = str(row.get("url") or "")
        labels = _expected_labels(row)
        yield {
            "id": str(row.get("id") or ""),
            "role": "evaluation",
            "label_status": "reviewed_gold",
            "eligible_for_training": False,
            "source_hash": _source_hash(url, text),
            "url": url,
            "source": row.get("source"),
            "language": row.get("language"),
            "script": row.get("script"),
            "original_text": text,
            "native_evidence": row.get("evidence_quote") or row.get("text") or "",
            "translated_text": None,
            "labels": labels,
            "review_fields": [field for field, value in labels.items() if value is not None and value != ""],
            "error_tags": [],
            "notes": row.get("expected", {}).get("notes") if isinstance(row.get("expected"), dict) else None,
        }


def _focus_text(row: dict[str, Any]) -> str:
    result = row.get("result") or {}
    content = result.get("content") if isinstance(result, dict) else None
    if content:
        return str(content).strip()
    evidence = result.get("evidence") if isinstance(result, dict) else None
    if isinstance(evidence, list):
        return "\n".join(str(item) for item in evidence if item and not isinstance(item, dict)).strip()
    return ""


def _focus_error_tags(row: dict[str, Any]) -> list[str]:
    tags: list[str] = ["needs_manual_field_annotation"]
    if not row.get("full_nlp"):
        tags.append("full_nlp_not_completed")
    if row.get("error"):
        tags.append("request_error")
    result = row.get("result") or {}
    if isinstance(result, dict):
        if not result.get("disease_classification") or result.get("disease_classification") == "UNKNOWN":
            tags.append("disease_requires_review")
        if not result.get("country") or result.get("country") == "UNKNOWN":
            tags.append("country_requires_review")
        if result.get("case_count_unknown"):
            tags.append("cases_requires_review")
        if result.get("death_count_unknown"):
            tags.append("deaths_requires_review")
    return tags


def focus_rows(payload: dict[str, Any]) -> Iterable[dict[str, Any]]:
    for row in payload.get("rows") or []:
        text = _focus_text(row)
        if not text:
            raise ValueError(f"focus row {row.get('id')} has no original source text")
        url = str(row.get("url") or "")
        yield {
            "id": str(row.get("id") or ""),
            "role": "annotation_queue",
            "label_status": "needs_annotation",
            "eligible_for_training": False,
            "source_hash": _source_hash(url, text),
            "url": url,
            "source": row.get("source"),
            "language": row.get("language"),
            "script": row.get("script"),
            "original_text": text,
            "native_evidence": text,
            "translated_text": (row.get("result") or {}).get("translated_text"),
            "labels": {field: None for field in TARGET_FIELDS},
            "review_fields": list(TARGET_FIELDS),
            "error_tags": _focus_error_tags(row),
            "notes": "Prediction is context only; annotate against the original text before training.",
        }


def build_manifest(gold_path: Path = DEFAULT_GOLD, focus_path: Path = DEFAULT_FOCUS) -> list[dict[str, Any]]:
    gold_payload = _read_json(gold_path)
    focus_payload = _read_json(focus_path)
    rows = list(gold_rows(gold_payload)) + list(focus_rows(focus_payload))
    seen_ids: set[str] = set()
    for row in rows:
        if not row["id"] or row["id"] in seen_ids:
            raise ValueError(f"duplicate or empty manifest id: {row['id']!r}")
        seen_ids.add(row["id"])
    return rows


def write_manifest(rows: list[dict[str, Any]], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build the multilingual retraining review manifest")
    parser.add_argument("--gold", type=Path, default=DEFAULT_GOLD)
    parser.add_argument("--focus", type=Path, default=DEFAULT_FOCUS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args(argv)
    rows = build_manifest(args.gold, args.focus)
    write_manifest(rows, args.output)
    summary = {
        "rows": len(rows),
        "evaluation": sum(row["role"] == "evaluation" for row in rows),
        "annotation_queue": sum(row["role"] == "annotation_queue" for row in rows),
        "eligible_for_training": sum(bool(row["eligible_for_training"]) for row in rows),
        "output": str(args.output),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
