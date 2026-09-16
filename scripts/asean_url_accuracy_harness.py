#!/usr/bin/env python3
"""ASEAN URL accuracy harness for interactive analyze-url / Full NLP.

Catalog-only (no network):
  python3 scripts/asean_url_accuracy_harness.py --catalog-only

Local (Next proxy, logged-in token if required):
  NLP_API_URL=http://localhost:3010/nlp \\
  NLP_API_TOKEN=... \\
  python3 scripts/asean_url_accuracy_harness.py

Production:
  NLP_API_URL=https://abvc-surveillance.org/nlp \\
  NLP_API_TOKEN=... \\
  python3 scripts/asean_url_accuracy_harness.py --force-refresh

Success gate after a warm NLP service: >=80% Full NLP (not rules-only, not 408).
This script never invents case/death numbers; missing values stay null.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from asean_url_catalog import CASES, NEWSWAV_JOHOR_DENGUE, validate_catalog  # noqa: E402

FULL_NLP_FAIL_MARKERS = (
    "full nlp unavailable",
    "full nlp failed",
    "rules-only",
    "exceeded budget",
    "nlp http 408",
)


def _join(base: str, path: str) -> str:
    return base.rstrip("/") + "/" + path.lstrip("/")


def _headers(token: str | None) -> dict[str, str]:
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _request(url: str, payload: dict | None, token: str | None, timeout: int):
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers=_headers(token),
        method="GET" if payload is None else "POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
            parsed = json.loads(raw) if raw else {}
            return response.status, parsed, None
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            parsed = {"detail": raw[:500]}
        return exc.code, parsed, str(exc)
    except Exception as exc:
        return None, {}, str(exc)


def _payload_data(parsed: dict):
    if isinstance(parsed, dict) and isinstance(parsed.get("data"), dict):
        return parsed["data"]
    return parsed if isinstance(parsed, dict) else {}


def _is_full_nlp(result: dict, warnings: list) -> bool:
    blob = " ".join(str(item) for item in warnings).lower()
    if any(marker in blob for marker in FULL_NLP_FAIL_MARKERS):
        return False
    status = str(result.get("analysis_status") or result.get("status") or "").lower()
    if status in {"failed", "partial"} and any(marker in blob for marker in ("408", "rules-only")):
        return False
    return status in {"", "completed"} or (
        status == "partial" and not any(marker in blob for marker in FULL_NLP_FAIL_MARKERS)
    )


def _contains_any(value: str, needles: list[str]) -> bool:
    haystack = (value or "").lower()
    return any(needle.lower() in haystack for needle in needles)


def _first_text(*values) -> str:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value
        if isinstance(value, list):
            joined = " ".join(str(item) for item in value if item)
            if joined.strip():
                return joined
    return ""


def evaluate_expect(result: dict, expect: dict) -> list[str]:
    failures = []
    disease = _first_text(
        result.get("disease_classification"),
        result.get("disease_extracted"),
        " ".join(
            str(item.get("canonical_name") or item.get("surface_form") or "")
            for item in (result.get("disease_mentions") or [])
            if isinstance(item, dict)
        ),
    )
    country = _first_text(result.get("country"), result.get("location_name"))
    if expect.get("disease_contains") and not _contains_any(disease, expect["disease_contains"]):
        failures.append(f"disease {disease!r} missing {expect['disease_contains']}")
    if expect.get("country") and expect["country"].lower() not in country.lower():
        # Accept Viet Nam / Vietnam and Lao PDR / Laos aliases.
        aliases = {
            "vietnam": ("viet nam", "vietnam"),
            "laos": ("lao", "laos"),
            "timor-leste": ("timor", "timor-leste", "east timor"),
        }
        wanted = expect["country"].lower()
        options = aliases.get(wanted, (wanted,))
        if not any(option in country.lower() for option in options):
            failures.append(f"country {country!r} != {expect['country']}")
    for label, field in (("cases", "case_count"), ("deaths", "death_count")):
        bounds = expect.get(field)
        if not bounds:
            continue
        value = result.get(field)
        if value is None:
            failures.append(f"{label} missing (expected {bounds['min']}-{bounds['max']})")
            continue
        try:
            number = int(value)
        except (TypeError, ValueError):
            failures.append(f"{label} {value!r} is not an int")
            continue
        if number < bounds["min"] or number > bounds["max"]:
            failures.append(f"{label} {number} outside {bounds['min']}-{bounds['max']}")
    for needle in expect.get("must_not_disease") or []:
        if _contains_any(disease, [needle]):
            failures.append(f"disease must not contain {needle}")
    for needle in expect.get("must_not_country") or []:
        if needle.lower() in country.lower():
            failures.append(f"country must not be {needle}")
    return failures


def analyze_one(base_url: str, token: str | None, url: str, force_refresh: bool, poll_timeout: int):
    started = time.monotonic()
    status, parsed, error = _request(
        _join(base_url, "/api/v1/analyze-url"),
        {"url": url, "async": True, "force_refresh": force_refresh},
        token,
        timeout=30,
    )
    data = _payload_data(parsed)
    job_id = data.get("job_id")
    if not job_id:
        latency_ms = int((time.monotonic() - started) * 1000)
        return {
            "http_status": status,
            "full_nlp": False,
            "analysis_status": data.get("status") or "sync",
            "disease": data.get("disease_classification"),
            "country": data.get("country"),
            "province": data.get("province") or data.get("location_name"),
            "city": data.get("city"),
            "case_count": data.get("case_count"),
            "death_count": data.get("death_count"),
            "needs_review": data.get("needs_review"),
            "latency_ms": latency_ms,
            "error": error or data.get("error") or parsed.get("error") or parsed.get("detail"),
            "warnings": data.get("analysis_warnings") or [],
            "job_id": None,
            "result": data,
        }
    deadline = time.monotonic() + poll_timeout
    job = data
    while time.monotonic() < deadline:
        status, parsed, error = _request(
            _join(base_url, f"/api/v1/analysis-jobs/{job_id}"),
            None,
            token,
            timeout=30,
        )
        job = _payload_data(parsed)
        job_status = str(job.get("status") or "")
        if job_status in {"completed", "partial", "failed"}:
            break
        time.sleep(1.5)
    result = dict(job.get("result") or {})
    warnings = job.get("warnings") or result.get("analysis_warnings") or []
    result["analysis_status"] = job.get("status")
    latency_ms = int((time.monotonic() - started) * 1000)
    return {
        "http_status": status,
        "full_nlp": _is_full_nlp(result, warnings) and job.get("status") == "completed",
        "analysis_status": job.get("status"),
        "disease": result.get("disease_classification"),
        "country": result.get("country"),
        "province": result.get("province") or result.get("location_name"),
        "city": result.get("city"),
        "case_count": result.get("case_count"),
        "death_count": result.get("death_count"),
        "needs_review": result.get("needs_review"),
        "latency_ms": latency_ms,
        "error": job.get("error") or error,
        "warnings": warnings,
        "job_id": job_id,
        "result": result,
    }


def print_row(row: dict):
    nlp = "FULL" if row["full_nlp"] else "WEAK"
    print(
        f"[{nlp}] {row['id']:32} {row['country']:13} "
        f"http={row['http_status']} status={row['analysis_status']} "
        f"disease={row['disease']!s:.40} loc={row['country_extracted']!s:.20} "
        f"cases={row['case_count']} deaths={row['death_count']} "
        f"{row['latency_ms']}ms {row['error'] or ''}"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="ASEAN analyze-url Full NLP harness")
    parser.add_argument("--catalog-only", action="store_true", help="Validate catalog coverage and exit")
    parser.add_argument(
        "--base-url",
        default=os.getenv("NLP_API_URL", "http://localhost:3010/nlp"),
        help="Frontend origin including /nlp, or backend origin",
    )
    parser.add_argument("--token", default=os.getenv("NLP_API_TOKEN") or os.getenv("ANALYZE_URL_AUTH_TOKEN"))
    parser.add_argument("--force-refresh", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--country", action="append", default=[])
    parser.add_argument("--poll-timeout", type=int, default=int(os.getenv("ASEAN_HARNESS_POLL_SECONDS", "600")))
    parser.add_argument("--json-out", default="")
    args = parser.parse_args(argv)

    catalog_errors = validate_catalog()
    if catalog_errors:
        print("Catalog invalid:", file=sys.stderr)
        for item in catalog_errors:
            print(f"  - {item}", file=sys.stderr)
        return 2
    print(f"Catalog OK: {len(CASES)} URLs across 11 countries; regression={NEWSWAV_JOHOR_DENGUE}")
    if args.catalog_only:
        return 0

    selected = CASES
    if args.country:
        wanted = {item.lower() for item in args.country}
        selected = [case for case in CASES if case["country"].lower() in wanted]
    if args.limit:
        selected = selected[: args.limit]

    rows = []
    for case in selected:
        outcome = analyze_one(args.base_url, args.token, case["url"], args.force_refresh, args.poll_timeout)
        expect_failures = evaluate_expect(outcome.get("result") or {}, case.get("expect") or {})
        row = {
            "id": case["id"],
            "country": case["country"],
            "url": case["url"],
            "regression": bool(case.get("regression")),
            "http_status": outcome["http_status"],
            "full_nlp": outcome["full_nlp"],
            "analysis_status": outcome["analysis_status"],
            "disease": outcome["disease"],
            "country_extracted": outcome["country"],
            "province": outcome["province"],
            "city": outcome["city"],
            "case_count": outcome["case_count"],
            "death_count": outcome["death_count"],
            "needs_review": outcome["needs_review"],
            "latency_ms": outcome["latency_ms"],
            "error": outcome["error"],
            "warnings": outcome["warnings"],
            "expect_failures": expect_failures,
            "job_id": outcome["job_id"],
        }
        rows.append(row)
        print_row(row)
        if expect_failures:
            print(f"    expect: {'; '.join(expect_failures)}")

    analyzed = [row for row in rows if row["http_status"] not in (401, 403)]
    full = [row for row in analyzed if row["full_nlp"]]
    rate = (len(full) / len(analyzed) * 100) if analyzed else 0.0
    print(f"\nFull NLP success: {len(full)}/{len(analyzed)} = {rate:.1f}% (gate >= 80% when NLP is warm)")
    regression = [row for row in rows if row["regression"]]
    for row in regression:
        print(
            "Regression Newswav Johor: "
            f"full_nlp={row['full_nlp']} disease={row['disease']} "
            f"country={row['country_extracted']} cases={row['case_count']} deaths={row['death_count']}"
        )
        if row["expect_failures"]:
            print("  " + "; ".join(row["expect_failures"]))
    if args.json_out:
        Path(args.json_out).write_text(json.dumps(rows, indent=2), encoding="utf-8")
    if not analyzed:
        return 1
    return 0 if rate >= 80 else 1


if __name__ == "__main__":
    raise SystemExit(main())
