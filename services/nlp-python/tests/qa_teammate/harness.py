"""Score teammate Sheet10 QA gold without HTTP.

Load ``gold.json`` (reviewed rows with ``article_text``). Optional extra ✘
rows from ``sheet10.csv`` Description notes become regressions once they have
matching gold ``article_text`` / ``issue_tags``.

Run:
  python3 -m unittest services.nlp-python.tests.test_qa_teammate_sheet10
  # from services/nlp-python:
  python3 -m unittest tests.test_qa_teammate_sheet10
"""

from __future__ import annotations

import csv
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app import extractors
from app.epidemiology import extract_event_period
from tests.nlp_gold.gazetteer import seed_gold_gazetteer

HERE = Path(__file__).resolve().parent
GOLD_PATH = HERE / "gold.json"
SHEET10_PATH = HERE / "sheet10.csv"

TAG_FROM_NOTE = (
    (re.compile(r"tidak ada keterangan tentang jumlah kasus|no cases|jumlah kasus", re.I),
     "missing_or_zero_cases_when_article_says_none"),
    (re.compile(r"kumulatif|as of|dilaporkan per", re.I),
     "cumulative_vs_point_in_time"),
    (re.compile(r"date case|januari|agustus|2026|range", re.I),
     "future_or_suspicious_date_range"),
    (re.compile(r"cancer|stroke|heart attack|ncd", re.I),
     "zero_cases_non_outbreak"),
    (re.compile(r"influenza|rsv|dan |, ", re.I),
     "multi_disease_split_or_reject"),
    (re.compile(r"184 ?276|number of case [0-9]{3,}", re.I),
     "implausible_or_national_cumulative_counts"),
)


@dataclass
class CheckResult:
    name: str
    passed: bool
    detail: str = ""


@dataclass
class CaseScore:
    no: str
    url: str
    passed: bool
    checks: list[CheckResult] = field(default_factory=list)
    prediction: dict[str, Any] = field(default_factory=dict)

    @property
    def failed_checks(self) -> list[CheckResult]:
        return [item for item in self.checks if not item.passed]


def load_gold_cases() -> list[dict]:
    payload = json.loads(GOLD_PATH.read_text(encoding="utf-8"))
    return list(payload.get("cases") or [])


def infer_issue_tags(note: str) -> list[str]:
    tags: list[str] = []
    sample = note or ""
    for pattern, tag in TAG_FROM_NOTE:
        if pattern.search(sample) and tag not in tags:
            tags.append(tag)
    return tags


def load_sheet10_fail_notes() -> list[dict]:
    """New teammate ✘ Description rows, keyed by URL for harness extension."""
    if not SHEET10_PATH.exists():
        return []
    rows: list[dict] = []
    with SHEET10_PATH.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for raw in reader:
            checklist = (raw.get("Checklist") or "").strip()
            note = (raw.get("Description") or "").strip()
            if "✘" not in checklist and "✗" not in checklist:
                continue
            if not note:
                continue
            rows.append({
                "no": (raw.get("No") or "").strip(),
                "url": (raw.get("Source URL") or "").strip(),
                "title": raw.get("Article Title") or "",
                "teammate_note": note,
                "issue_tags": infer_issue_tags(note),
                "article_text": raw.get("Article Title") or "",
                "pass": False,
                "from_sheet10": True,
            })
    return rows


def merge_cases() -> list[dict]:
    gold = load_gold_cases()
    by_url = {item["url"]: item for item in gold if item.get("url")}
    extra: list[dict] = []
    for row in load_sheet10_fail_notes():
        existing = by_url.get(row["url"])
        if existing:
            if not existing.get("issue_tags"):
                existing["issue_tags"] = row["issue_tags"]
            if not existing.get("teammate_note"):
                existing["teammate_note"] = row["teammate_note"]
            continue
        extra.append(row)
    return gold + extra


def _joined_diseases(prediction: dict[str, Any]) -> str:
    names = [prediction.get("disease") or ""]
    names.extend(prediction.get("diseases") or [])
    return " ".join(str(item).lower() for item in names if item)


def predict_case(row: dict) -> dict[str, Any]:
    text = row.get("article_text") or row.get("title") or ""
    facts = extractors.predict_surveillance_facts(text)
    period = extract_event_period(text)
    facts["period"] = period
    facts["zero_cases_stated"] = extractors.article_states_zero_cases(text)
    facts["ncd_only"] = extractors.is_ncd_only_non_outbreak(text, facts.get("diseases") or [])
    facts["vaccine_campaign"] = extractors.is_vaccine_campaign_not_outbreak(text)
    return facts


def check_pass_expectations(row: dict, prediction: dict[str, Any]) -> list[CheckResult]:
    expect = row.get("expect") or {}
    checks: list[CheckResult] = []
    joined = _joined_diseases(prediction)
    for needle in expect.get("disease_contains") or []:
        checks.append(CheckResult(
            f"disease contains {needle}",
            needle.lower() in joined,
            joined,
        ))
    for needle in expect.get("must_not_disease") or []:
        checks.append(CheckResult(
            f"must not disease {needle}",
            needle.lower() not in joined,
            joined,
        ))
    if expect.get("country"):
        checks.append(CheckResult(
            "country",
            (prediction.get("country") or "") == expect["country"],
            str(prediction.get("country")),
        ))
    if "case_count" in expect:
        checks.append(CheckResult(
            "case_count",
            prediction.get("case_count") == expect["case_count"],
            str(prediction.get("case_count")),
        ))
    return checks


def check_issue_tags(row: dict, prediction: dict[str, Any]) -> list[CheckResult]:
    tags = row.get("issue_tags") or infer_issue_tags(row.get("teammate_note") or "")
    checks: list[CheckResult] = []
    diseases = [item.lower() for item in (prediction.get("diseases") or []) if item]
    disease = (prediction.get("disease") or "")
    period = prediction.get("period") or {}
    location = (prediction.get("location") or "")
    for tag in tags:
        if tag == "missing_or_zero_cases_when_article_says_none":
            ok = prediction.get("case_count") in (0, None) and prediction.get("zero_cases_stated")
            if disease:
                ok = ok and "nipah" in _joined_diseases(prediction)
            checks.append(CheckResult(tag, bool(ok), f"cases={prediction.get('case_count')} disease={disease}"))
        elif tag == "future_or_suspicious_date_range":
            ok = bool(period.get("date_needs_review")) or bool(
                period.get("event_date_start") and period.get("event_date_end")
            )
            checks.append(CheckResult(tag, ok, str(period)))
        elif tag == "cumulative_vs_point_in_time":
            ok = (prediction.get("count_period_type") == "cumulative") or (
                period.get("period_type") == "cumulative"
            )
            checks.append(CheckResult(tag, ok, str(prediction.get("count_period_type"))))
        elif tag == "zero_cases_non_outbreak":
            joined = _joined_diseases(prediction)
            comma_joined = bool(re.search(r"cancer.*,.*stroke|stroke.*,.*cancer", disease, re.I))
            ok = (
                prediction.get("ncd_only")
                or prediction.get("non_health_topic")
                or not diseases
            ) and not comma_joined
            ok = ok and location.casefold() != "long"
            checks.append(CheckResult(tag, ok, f"diseases={diseases} loc={location}"))
        elif tag == "multi_disease_split_or_reject":
            comma_joined = "," in (disease or "")
            flu_rsv = [
                item for item in diseases
                if any(token in item for token in ("influenza", "rsv", "syncytial"))
            ]
            ncd = prediction.get("ncd_only") or prediction.get("non_health_topic")
            ok = (not comma_joined) and (ncd or len(flu_rsv) >= 2 or len(diseases) <= 1)
            checks.append(CheckResult(tag, ok, f"disease={disease} diseases={diseases}"))
        elif tag == "implausible_or_national_cumulative_counts":
            cases = int(prediction.get("case_count") or 0)
            period_type = prediction.get("count_period_type") or period.get("period_type")
            rejected_mega = cases < 100000
            labeled = period_type == "cumulative"
            ok = rejected_mega or labeled
            if prediction.get("vaccine_campaign"):
                ok = cases < 10000
            checks.append(CheckResult(tag, ok, f"cases={cases} period={period_type}"))
        else:
            checks.append(CheckResult(tag, True, "unrecognized tag skipped"))
    return checks


def score_case(row: dict) -> CaseScore:
    prediction = predict_case(row)
    checks: list[CheckResult] = []
    if row.get("pass"):
        checks.extend(check_pass_expectations(row, prediction))
    else:
        if not (row.get("article_text") or row.get("title")):
            checks.append(CheckResult("has_text", False, "add article_text to score this ✘ row"))
        else:
            checks.extend(check_issue_tags(row, prediction))
    passed = bool(checks) and all(item.passed for item in checks)
    return CaseScore(
        no=str(row.get("no") or ""),
        url=row.get("url") or "",
        passed=passed,
        checks=checks,
        prediction=prediction,
    )


def run_qa_gold() -> dict[str, Any]:
    seed_gold_gazetteer()
    scores = [score_case(row) for row in merge_cases() if row.get("article_text") or row.get("pass")]
    reviewed = [row for row in load_gold_cases()]
    return {
        "scores": scores,
        "passed": sum(1 for item in scores if item.passed),
        "ready": len(scores),
        "reviewed": len(reviewed),
        "failures": [item for item in scores if not item.passed],
    }
