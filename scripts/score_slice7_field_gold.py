#!/usr/bin/env python3
"""Score annotated NLP fields with precision/recall and no hidden fallbacks.

The scorer uses the existing reviewed nlp-gold pack. Unannotated fields are
reported as ``not_scored`` rather than treated as correct or incorrect.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "nlp-python"))
from app import extractors, pipeline  # noqa: E402
from app.schemas import AnalyzeRequest  # noqa: E402
from tests.nlp_gold.runner import _country_from_url, _evidence_text, load_fixtures  # noqa: E402


def _fold(value: Any) -> str:
    return re.sub(r"\s+", " ", extractors.strip_diacritics(str(value or "")).casefold()).strip()


def _expected_block(fixture: dict) -> dict:
    return fixture.get("expected") or fixture.get("expect") or {}


def _pred_location(prediction: dict) -> str | None:
    value = str(prediction.get("location") or "").strip()
    country = str(prediction.get("country") or "").strip()
    if not value or _fold(value) == _fold(country) or value.upper() in {"UNKNOWN", "NONE"}:
        return None
    return value


def _pred_evidence(prediction: dict) -> str:
    values = prediction.get("evidence") or prediction.get("epidemiological_evidence") or []
    if isinstance(values, str):
        values = [values]
    return " ".join(str(value) for value in values if value)


def _evidence_match(expected: str, predicted: str) -> bool:
    gold = _fold(expected)
    got = _fold(predicted)
    if not gold or not got:
        return False
    if gold in got or got in gold:
        return True
    gold_tokens = {token for token in re.findall(r"\w+", gold) if len(token) >= 4}
    got_tokens = {token for token in re.findall(r"\w+", got) if len(token) >= 4}
    return bool(gold_tokens) and len(gold_tokens & got_tokens) / len(gold_tokens) >= 0.80


def _field_value(fixture: dict, prediction: dict, field: str):
    expected = _expected_block(fixture)
    if field == "disease":
        return expected.get("disease"), prediction.get("disease_classification") or prediction.get("disease")
    if field == "country":
        return expected.get("country"), prediction.get("country")
    if field == "location":
        return expected.get("province_or_city", expected.get("location")), _pred_location(
            {**prediction, "location": prediction.get("location_name") or prediction.get("location")}
        )
    if field == "cases":
        return expected.get("cases"), prediction.get("case_count")
    if field == "deaths":
        return expected.get("deaths"), prediction.get("death_count")
    if field == "time":
        expected_time = expected.get("time") or expected.get("event_date") or expected.get("reporting_period")
        predicted_time = prediction.get("event_date") or prediction.get("event_date_start") or prediction.get("count_period_type")
        return expected_time, predicted_time
    if field == "evidence":
        return fixture.get("evidence_quote") or expected.get("evidence"), _pred_evidence(prediction)
    raise KeyError(field)


def _equal(field: str, expected: Any, predicted: Any) -> bool:
    if field in {"cases", "deaths"}:
        if expected is None:
            return predicted in (None, 0, False, "")
        try:
            return int(expected) == int(predicted)
        except (TypeError, ValueError):
            return False
    if expected is None:
        return predicted in (None, "", [], False)
    if field == "evidence":
        return _evidence_match(str(expected), str(predicted or ""))
    if field == "disease":
        wanted = _fold(expected)
        got = _fold(predicted)
        aliases = {
            "avian influenza (h5n1)": {"avian influenza", "h5n1", "bird flu"},
            "measles": {"measles", "campak"},
            "dengue": {"dengue", "dengue fever", "dbd", "demam berdarah"},
        }
        return got == wanted or bool(aliases.get(wanted, {wanted}) & {got})
    if field == "country":
        aliases = {"viet nam": "vietnam", "lao pdr": "laos", "brunei darussalam": "brunei"}
        return aliases.get(_fold(expected), _fold(expected)) == aliases.get(_fold(predicted), _fold(predicted))
    if field == "location":
        return _fold(expected) == _fold(predicted)
    return _fold(expected) == _fold(predicted)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Score Slice 7 field-level gold")
    parser.add_argument("--json-out", default="")
    args = parser.parse_args(argv)

    report = {field: {"annotated": 0, "tp": 0, "fp": 0, "fn": 0} for field in (
        "disease", "country", "location", "cases", "deaths", "time", "evidence"
    )}
    fixture_rows = []
    for fixture in load_fixtures():
        text = _evidence_text(fixture)
        meta = " ".join(str(part) for part in (fixture.get("title") or "", fixture.get("source") or "") if part)
        source_country = extractors.extract_country_hint(meta) or _country_from_url(str(fixture.get("url") or ""))
        prediction = pipeline.run(
            AnalyzeRequest(
                text=text,
                url=str(fixture.get("url") or ""),
                title=str(fixture.get("title") or ""),
                source_country=source_country,
                rules_only=True,
                historical_fast=True,
            )
        ).model_dump()
        row = {"id": fixture.get("id"), "fields": {}}
        for field in report:
            expected, predicted = _field_value(fixture, prediction, field)
            annotated = expected is not None and expected != ""
            if not annotated:
                row["fields"][field] = {"status": "not_scored"}
                continue
            correct = _equal(field, expected, predicted)
            report[field]["annotated"] += 1
            if correct:
                report[field]["tp"] += 1
                status = "tp"
            elif predicted not in (None, "", 0, False):
                report[field]["fp"] += 1
                status = "fp"
            else:
                report[field]["fn"] += 1
                status = "fn"
            row["fields"][field] = {"status": status, "expected": expected, "predicted": predicted}
        fixture_rows.append(row)

    for values in report.values():
        values["precision"] = round(values["tp"] / (values["tp"] + values["fp"]), 4) if values["tp"] + values["fp"] else None
        values["recall"] = round(values["tp"] / (values["tp"] + values["fn"]), 4) if values["tp"] + values["fn"] else None
    output = {"dataset": "nlp-gold-20", "fields": report, "fixtures": fixture_rows}
    print(json.dumps(output, ensure_ascii=False, indent=2))
    if args.json_out:
        Path(args.json_out).write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
