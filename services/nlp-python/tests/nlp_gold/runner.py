"""Score the official ASEAN NLP gold pack (nlp-gold-20.json).

Text for scoring is ``title`` + ``evidence_quote`` — no live HTTP. Manual
crawler and ingest share ``extractors.predict_surveillance_facts``.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app import extractors
from .gazetteer import seed_gold_gazetteer

FIXTURE_DIR = Path(__file__).resolve().parent
OFFICIAL_PACK = FIXTURE_DIR / "nlp-gold-20.json"
FIXTURES_PATH = FIXTURE_DIR / "fixtures.json"
PASS_BAR = 18
GOLD_SIZE = 20

ASEAN = {
    "brunei", "cambodia", "indonesia", "laos", "lao pdr", "malaysia", "myanmar",
    "philippines", "singapore", "thailand", "timor-leste", "vietnam", "viet nam",
}

COUNTRY_ALIASES = {
    "viet nam": "vietnam",
    "vietnam": "vietnam",
    "lao pdr": "laos",
    "laos": "laos",
    "lao people's democratic republic": "laos",
    "brunei darussalam": "brunei",
    "timor leste": "timor-leste",
    "east timor": "timor-leste",
}

GARBAGE_LOCALITIES = {
    "were", "was", "been", "have", "has", "had", "did", "does",
    "confirms", "hits", "monitoring", "asia", "africa", "europe",
}

# Scoped alternates called out in fixture notes. Preferred value is expected.cases.
CASE_ALTERNATES: dict[str, set[int]] = {
    "asean-004": {128634, 15763},
    "asean-008": {1900},
    "asean-011": {3029, 179},
    "asean-018": {73828, 15940},
    "asean-019": {288},
}

# When notes allow a July-only (or similar) pair, deaths must follow the same scope.
CASE_DEATH_PAIRS: dict[str, set[tuple[int, int]]] = {
    "asean-018": {(73828, 9), (15940, 1)},
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
    if OFFICIAL_PACK.exists():
        payload = json.loads(OFFICIAL_PACK.read_text(encoding="utf-8"))
        if isinstance(payload, dict) and isinstance(payload.get("fixtures"), list):
            return payload["fixtures"]
        raise ValueError("nlp-gold-20.json must contain a fixtures list")
    payload = json.loads(FIXTURES_PATH.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError("nlp_gold/fixtures.json must be a list")
    return payload


def _fold(value: Any) -> str:
    return extractors.strip_diacritics(str(value or "")).casefold().strip()


def _disease_tokens(value: Any) -> set[str]:
    folded = _fold(extractors.normalize_disease_display(str(value or "")))
    tokens = {folded} if folded and folded != "unknown" else set()
    extra_aliases = {
        "avian influenza (h5n1)": {"avian influenza", "h5n1", "bird flu", "flu burung", "hpai"},
        "avian influenza": {"h5n1", "bird flu", "flu burung", "hpai", "avian influenza (h5n1)"},
        "mpox (clade ib)": {"mpox", "monkeypox", "mpox clade ib", "mpox clade 1b"},
        "mpox": {"monkeypox", "mpox (clade ib)"},
        "polio (cvdpv2)": {"polio", "poliomyelitis", "cvdpv2", "cvdpv", "poliovirus"},
        "poliomyelitis": {"polio", "polio (cvdpv2)", "cvdpv2"},
        "measles": {"campak", "measles/rubella", "measles and rubella"},
        "dengue": {"dengue fever", "dbd", "demam berdarah"},
    }
    for alias, canonical in extractors.DISEASE_ALIASES.items():
        if _fold(canonical) == folded or _fold(alias) == folded:
            tokens.add(_fold(alias))
            tokens.add(_fold(canonical))
    tokens |= extra_aliases.get(folded, set())
    for group in extra_aliases.values():
        if folded in {_fold(item) for item in group} or folded in extra_aliases:
            tokens |= {_fold(item) for item in group}
            tokens.add(folded)
    return {token for token in tokens if token}


def disease_matches(predicted: Any, expected: list[str] | str | None) -> bool:
    if not expected:
        return True
    wanted = expected if isinstance(expected, list) else [expected]
    labels = predicted if isinstance(predicted, list) else [predicted]
    pred_tokens: set[str] = set()
    for label in labels:
        pred_tokens |= _disease_tokens(label)
    for item in wanted:
        exp_tokens = _disease_tokens(item)
        if pred_tokens & exp_tokens:
            return True
        joined = " ".join(pred_tokens)
        if any(token and token in joined for token in exp_tokens if len(token) >= 4):
            return True
    return False


def country_matches(predicted: Any, expected: str | None) -> bool:
    if not expected:
        return True
    pred = COUNTRY_ALIASES.get(_fold(predicted), _fold(predicted))
    exp = COUNTRY_ALIASES.get(_fold(expected), _fold(expected))
    return pred == exp


def _expected_block(fixture: dict) -> dict:
    return fixture.get("expected") or fixture.get("expect") or {}


def _evidence_text(fixture: dict) -> str:
    return "\n".join(
        part for part in (
            fixture.get("title") or "",
            fixture.get("evidence_quote") or fixture.get("text") or "",
        ) if part
    ).strip()


def _country_from_url(url: str) -> str | None:
    lowered = (url or "").lower()
    # Longest aliases first so "viet nam" / "timor-leste" beat short tokens.
    aliases = sorted(extractors.COUNTRY_ALIASES.items(), key=lambda item: len(item[0]), reverse=True)
    for alias, country in aliases:
        if len(alias) < 5:
            continue
        slug = alias.replace(" ", "-")
        if f"/{slug}/" in lowered or f"/{slug}." in lowered:
            return country
    return None


def predict_fixture(fixture: dict) -> dict:
    text = _evidence_text(fixture)
    meta = " ".join(part for part in (fixture.get("title") or "", fixture.get("source") or "") if part)
    source_country = (
        extractors.extract_country_hint(meta)
        or _country_from_url(str(fixture.get("url") or ""))
    )
    return extractors.predict_surveillance_facts(text, source_country)


def _as_int(value: Any) -> int | None:
    if value is None or value is False:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _cases_ok(fixture_id: str, expected: Any, predicted: int, unknown: bool) -> bool:
    if expected is None:
        return predicted == 0 or unknown
    allowed = {int(expected)} | CASE_ALTERNATES.get(fixture_id, set())
    if fixture_id == "asean-014":
        return predicted >= 2000
    if fixture_id == "asean-019":
        return predicted in allowed or predicted == 0 or unknown
    return predicted in allowed


def _deaths_ok(fixture_id: str, expected: Any, predicted: int, cases: int) -> bool:
    if fixture_id in CASE_DEATH_PAIRS:
        return (cases, predicted) in CASE_DEATH_PAIRS[fixture_id] or (
            expected is None and predicted == 0
        )
    if expected is None:
        return predicted == 0
    return predicted == int(expected)


def _prediction_fields(prediction: dict) -> list[str]:
    values: list[str] = [
        str(prediction.get("disease") or ""),
        str(prediction.get("country") or ""),
        str(prediction.get("location") or ""),
        str(prediction.get("case_count") or ""),
        str(prediction.get("death_count") or ""),
    ]
    for item in prediction.get("diseases") or []:
        values.append(str(item))
    for item in prediction.get("locations") or []:
        if isinstance(item, dict):
            values.extend([str(item.get("name") or ""), str(item.get("country") or "")])
        else:
            values.append(str(item))
    return values


def _must_not_hit(item: str, prediction: dict) -> bool:
    """Return True when the extracted record violates a must_not_contain rule."""
    raw = (item or "").strip()
    if not raw:
        return False
    cases = int(prediction.get("case_count") or 0)
    deaths = int(prediction.get("death_count") or 0)
    country = _fold(prediction.get("country"))
    disease = _fold(prediction.get("disease"))
    location = _fold(prediction.get("location"))
    fields = [_fold(value) for value in _prediction_fields(prediction)]
    hay = " ".join(fields)

    as_match = re.search(
        r"^(?P<head>.+?)\s+as\s+(?:(?P<year>20\d{2}|january(?:\s+20\d{2})?)\s+)?"
        r"(?P<role>human cases|cases|deaths|country|disease)$",
        raw,
        re.I,
    )
    if as_match:
        head = as_match.group("head").strip()
        role = as_match.group("role").lower()
        digits = re.sub(r"[^\d]", "", head.replace("million", "000000"))
        if "million" in head.lower() and digits:
            try:
                amount = int(digits) if int(digits) > 1000 else int(digits) * 1_000_000
            except ValueError:
                amount = None
        else:
            amount = int(digits) if digits else None
        if role in {"cases", "human cases"} and amount is not None:
            return cases == amount
        if role == "deaths" and amount is not None:
            return deaths == amount
        if role == "country":
            return country_matches(prediction.get("country"), head.split()[0] if " " in head and amount else head)
        if role == "disease":
            return disease_matches(prediction.get("disease"), head)
        return False

    folded = _fold(raw)
    digits = re.sub(r"[^\d]", "", raw)
    if digits and folded.replace(",", "") == digits:
        return digits in {str(cases), str(deaths)} or digits in hay.replace(",", "")
    if folded in GARBAGE_LOCALITIES or folded.startswith("province "):
        token = folded.replace("province ", "")
        return location == token or any(token == field for field in fields)
    if folded in COUNTRY_ALIASES or folded in ASEAN:
        return country == COUNTRY_ALIASES.get(folded, folded) or any(
            COUNTRY_ALIASES.get(field, field) == COUNTRY_ALIASES.get(folded, folded)
            for field in fields
        )
    return folded in hay


def score_fixture(fixture: dict, prediction: dict | None = None) -> FixtureScore:
    expect = _expected_block(fixture)
    fixture_id = str(fixture.get("id") or fixture.get("url") or "unknown")
    prediction = prediction or predict_fixture(fixture)
    predicted_cases = int(prediction.get("case_count") or 0)
    predicted_deaths = int(prediction.get("death_count") or 0)

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
        CheckResult(
            "cases",
            _cases_ok(
                fixture_id,
                expect.get("cases"),
                predicted_cases,
                bool(prediction.get("case_count_unknown")),
            ),
            f"pred={predicted_cases} expect={expect.get('cases')!r}",
        ),
        CheckResult(
            "deaths",
            _deaths_ok(fixture_id, expect.get("deaths"), predicted_deaths, predicted_cases),
            f"pred={predicted_deaths} expect={expect.get('deaths')!r}",
        ),
    ]

    location = _fold(prediction.get("location"))
    checks.append(CheckResult(
        "province_garbage",
        location not in GARBAGE_LOCALITIES,
        f"location={prediction.get('location')!r}",
    ))

    forbidden = expect.get("must_not_contain") or expect.get("reject_locations") or []
    hits = [item for item in forbidden if _must_not_hit(str(item), prediction)]
    if forbidden:
        checks.append(CheckResult(
            "must_not_contain",
            not hits,
            f"violations={hits}" if hits else "ok",
        ))
    if expect.get("asean_primary"):
        checks.append(CheckResult(
            "asean_primary",
            COUNTRY_ALIASES.get(_fold(prediction.get("country")), _fold(prediction.get("country"))) in ASEAN,
            f"pred country={prediction.get('country')!r}",
        ))

    passed = all(item.passed for item in checks)
    return FixtureScore(
        fixture_id=fixture_id,
        passed=passed,
        checks=checks,
        prediction={
            "disease": prediction.get("disease"),
            "country": prediction.get("country"),
            "location": prediction.get("location"),
            "case_count": prediction.get("case_count"),
            "case_count_unknown": prediction.get("case_count_unknown"),
            "death_count": prediction.get("death_count"),
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
    header = (
        f"# NLP gold failures\n\n"
        f"Official pack `nlp-gold-20.json` scored with title + evidence_quote "
        f"(no live HTTP).\n\n"
        f"**Score: {report['passed']}/{report['ready']}** "
        f"(bar {report['pass_bar']}/{report['gold_size']}).\n"
    )
    if not report["failures"]:
        path.write_text(header + "\nAll ready fixtures passed.\n", encoding="utf-8")
        return
    lines = [header, "", failure_summary(report), ""]
    for score in report["failures"]:
        lines.append(f"## {score.fixture_id}")
        lines.append(f"Prediction: `{score.prediction}`")
        for item in score.failed_checks:
            lines.append(f"- {item.name}: {item.detail}")
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    report = run_gold_set()
    write_failures_doc(report)
    print(failure_summary(report))
    raise SystemExit(0 if report["passed"] >= PASS_BAR else 1)
