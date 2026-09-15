"""Score NLP gold fixtures: disease, country, cases, non-geo tokens, ASEAN-primary.

Parent is assembling a 20-URL pack. Each fixture may include inline ``text``
now; later attachments can add ``url`` plus fetched article body without
changing the scorer.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app import extractors
from .gazetteer import seed_gold_gazetteer

FIXTURE_DIR = Path(__file__).resolve().parent
FIXTURES_PATH = FIXTURE_DIR / "fixtures.json"
PASS_BAR = 18
GOLD_SIZE = 20

ASEAN = {
    "brunei", "cambodia", "indonesia", "laos", "malaysia", "myanmar",
    "philippines", "singapore", "thailand", "timor-leste", "vietnam",
}


@dataclass
class CheckResult:
    name: str
    passed: bool
    detail: str = ""


@dataclass
class FixtureScore:
    fixture_id: str
    passed: bool
    checks: list[CheckResult] = field(default_factory=list)
    prediction: dict[str, Any] = field(default_factory=dict)

    @property
    def failed_checks(self) -> list[CheckResult]:
        return [item for item in self.checks if not item.passed]


def load_fixtures() -> list[dict]:
    payload = json.loads(FIXTURES_PATH.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError("nlp_gold/fixtures.json must be a list")
    return payload


def _fold(value: Any) -> str:
    return extractors.strip_diacritics(str(value or "")).casefold().strip()


def _disease_tokens(value: Any) -> set[str]:
    folded = _fold(extractors.normalize_disease_display(str(value or "")))
    tokens = {folded} if folded and folded != "unknown" else set()
    for alias, canonical in extractors.DISEASE_ALIASES.items():
        if _fold(canonical) == folded or _fold(alias) == folded:
            tokens.add(_fold(alias))
            tokens.add(_fold(canonical))
    return {token for token in tokens if token}


def disease_matches(predicted: Any, expected: list[str] | str | None) -> bool:
    if not expected:
        return True
    wanted = expected if isinstance(expected, list) else [expected]
    pred_tokens = _disease_tokens(predicted)
    for label in predicted if isinstance(predicted, list) else []:
        pred_tokens |= _disease_tokens(label)
    for item in wanted:
        exp_tokens = _disease_tokens(item)
        if pred_tokens & exp_tokens:
            return True
        if any(token and token in " ".join(pred_tokens) for token in exp_tokens if len(token) >= 4):
            return True
    return False


def country_matches(predicted: Any, expected: str | None) -> bool:
    if not expected:
        return True
    pred = _fold(predicted)
    exp = _fold(expected)
    if pred == exp:
        return True
    aliases = {
        "viet nam": "vietnam",
        "lao pdr": "laos",
        "brunei darussalam": "brunei",
        "timor leste": "timor-leste",
    }
    return aliases.get(pred, pred) == aliases.get(exp, exp)


def predict_fixture(fixture: dict) -> dict:
    text = "\n".join(
        part for part in (fixture.get("title") or "", fixture.get("text") or "") if part
    ).strip()
    return extractors.predict_surveillance_facts(text)


def score_fixture(fixture: dict, prediction: dict | None = None) -> FixtureScore:
    expect = fixture.get("expect") or {}
    prediction = prediction or predict_fixture(fixture)
    location_names = [prediction.get("location"), prediction.get("country")]
    for item in prediction.get("locations") or []:
        if isinstance(item, dict):
            location_names.extend([item.get("name"), item.get("country")])
        else:
            location_names.append(item)
    location_folds = {_fold(name) for name in location_names if name}

    checks = [
        CheckResult(
            "disease",
            disease_matches(
                [prediction.get("disease"), *(prediction.get("diseases") or [])],
                expect.get("disease"),
            ),
            f"pred={prediction.get('disease')!r} expect={expect.get('disease')!r}",
        ),
        CheckResult(
            "country",
            country_matches(prediction.get("country"), expect.get("country")),
            f"pred={prediction.get('country')!r} expect={expect.get('country')!r}",
        ),
    ]
    if "cases" in expect:
        expected_cases = expect.get("cases")
        predicted_cases = int(prediction.get("case_count") or 0)
        if expected_cases is None:
            checks.append(CheckResult(
                "cases",
                predicted_cases == 0 or prediction.get("case_count_unknown"),
                f"pred={predicted_cases} (must not invent; expected unknown/0)",
            ))
        else:
            checks.append(CheckResult(
                "cases",
                predicted_cases == int(expected_cases),
                f"pred={predicted_cases} expect={expected_cases}",
            ))
    reject = [_fold(item) for item in expect.get("reject_locations") or []]
    if reject:
        hit = sorted(location_folds & set(reject))
        checks.append(CheckResult(
            "reject_non_geo",
            not hit,
            f"rejected tokens present: {hit}" if hit else "ok",
        ))
    if expect.get("asean_primary"):
        checks.append(CheckResult(
            "asean_primary",
            _fold(prediction.get("country")) in ASEAN,
            f"pred country={prediction.get('country')!r}",
        ))
    passed = all(item.passed for item in checks)
    return FixtureScore(
        fixture_id=str(fixture.get("id") or fixture.get("url") or "unknown"),
        passed=passed,
        checks=checks,
        prediction={
            "disease": prediction.get("disease"),
            "country": prediction.get("country"),
            "location": prediction.get("location"),
            "case_count": prediction.get("case_count"),
            "case_count_unknown": prediction.get("case_count_unknown"),
        },
    )


def run_gold_set(fixtures: list[dict] | None = None) -> dict:
    seed_gold_gazetteer()
    rows = fixtures if fixtures is not None else load_fixtures()
    ready = [item for item in rows if item.get("status") != "pending_url"]
    scores = [score_fixture(item) for item in ready]
    failed = [item for item in scores if not item.passed]
    return {
        "total": len(rows),
        "ready": len(ready),
        "passed": len(scores) - len(failed),
        "failed": len(failed),
        "pass_bar": PASS_BAR,
        "gold_size": GOLD_SIZE,
        "scores": scores,
        "failures": failed,
    }


def failure_summary(report: dict) -> str:
    lines = [
        f"{report['passed']}/{report['ready']} ready fixtures passed "
        f"(bar {report['pass_bar']}/{report['gold_size']})"
    ]
    for score in report["failures"]:
        failed = ", ".join(f"{item.name}: {item.detail}" for item in score.failed_checks)
        lines.append(f"- {score.fixture_id}: {failed}")
    return "\n".join(lines)


def write_failures_doc(report: dict) -> None:
    path = FIXTURE_DIR / "FAILURES.md"
    if not report["failures"]:
        path.write_text(
            f"# NLP gold failures\n\nAll {report['passed']}/{report['ready']} ready fixtures passed.\n",
            encoding="utf-8",
        )
        return
    lines = [
        "# NLP gold failures",
        "",
        failure_summary(report),
        "",
        "Parent URL pack can replace `text` on these ids without changing the scorer.",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")
