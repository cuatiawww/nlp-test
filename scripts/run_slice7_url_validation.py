#!/usr/bin/env python3
"""Run the reviewed Slice 7 URL set and preserve raw outcomes.

This runner never substitutes rules-only or fabricated values for a failed
Full NLP job. A failed job is recorded as failed so the QA report can measure
availability separately from extraction quality.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from asean_22_terminal_test import load_env, login  # noqa: E402
from asean_url_accuracy_harness import analyze_one  # noqa: E402


DEFAULT_INPUT = ROOT / "scripts" / "slice7_asean_validation_urls_2026-09-22.json"


def _md(value: object) -> str:
    return str(value if value is not None else "—").replace("|", "\\|").replace("\n", " ")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run Slice 7 ASEAN URL validation")
    parser.add_argument("--input", default=str(DEFAULT_INPUT))
    parser.add_argument("--base-url", default=os.getenv("NLP_API_URL", "http://localhost:3010/nlp"))
    parser.add_argument("--username", default=os.getenv("NLP_TEST_USERNAME", "webmaster"))
    parser.add_argument("--password", default=os.getenv("WEBMASTER_PASSWORD"))
    parser.add_argument("--token", default=os.getenv("NLP_API_TOKEN") or os.getenv("ANALYZE_URL_AUTH_TOKEN"))
    parser.add_argument("--force-refresh", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--id", action="append", default=[], help="Run only selected fixture ID(s); repeatable")
    parser.add_argument("--poll-timeout", type=int, default=int(os.getenv("ASEAN_HARNESS_POLL_SECONDS", "240")))
    parser.add_argument("--json-out", required=True)
    parser.add_argument("--md-out", required=True)
    args = parser.parse_args(argv)

    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
    cases = list(payload.get("cases") or [])
    if args.id:
        selected = set(args.id)
        cases = [case for case in cases if case.get("id") in selected]
    if args.limit:
        cases = cases[: args.limit]
    env = load_env()
    token = args.token
    if not token:
        password = args.password or env.get("WEBMASTER_PASSWORD")
        if not password:
            raise SystemExit("WEBMASTER_PASSWORD is required via .env or --password")
        token = login(args.base_url, args.username, password)

    rows: list[dict] = []
    for case in cases:
        outcome = analyze_one(
            args.base_url,
            token,
            case["url"],
            args.force_refresh,
            args.poll_timeout,
        )
        result = outcome.get("result") or {}
        row = {
            **case,
            "tested_at": datetime.now(timezone.utc).isoformat(),
            "full_nlp": outcome.get("full_nlp", False),
            "analysis_status": outcome.get("analysis_status"),
            "http_status": outcome.get("http_status"),
            "latency_ms": outcome.get("latency_ms"),
            "error": outcome.get("error"),
            "warnings": outcome.get("warnings") or [],
            "disease": outcome.get("disease"),
            "country_extracted": outcome.get("country"),
            "province": outcome.get("province"),
            "city": outcome.get("city"),
            "case_count": outcome.get("case_count"),
            "death_count": outcome.get("death_count"),
            "needs_review": outcome.get("needs_review"),
            "result": result,
        }
        rows.append(row)
        print(
            f"[{('FULL' if row['full_nlp'] else 'WEAK'):4}] {case['id']:12} "
            f"{case.get('country') or 'regional':12} status={row['analysis_status']} "
            f"disease={row['disease']!s:.32} country={row['country_extracted']!s:.18} "
            f"cases={row['case_count']} deaths={row['death_count']} latency_ms={row['latency_ms']}"
        )

    full = sum(1 for row in rows if row["full_nlp"])
    payload_out = {
        "run": "slice7",
        "input": str(Path(args.input).relative_to(ROOT)),
        "tested_at": datetime.now(timezone.utc).isoformat(),
        "count": len(rows),
        "full_nlp_count": full,
        "full_nlp_rate": round((full / len(rows) * 100), 2) if rows else 0.0,
        "rows": rows,
    }
    Path(args.json_out).write_text(json.dumps(payload_out, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = [
        "# Slice 7 ASEAN URL validation",
        "",
        f"- Run: `{payload_out['tested_at']}`",
        f"- URLs: `{len(rows)}`",
        f"- Full NLP: `{full}/{len(rows)}` ({payload_out['full_nlp_rate']}%)",
        "- Rules-only, timeout, and fetch failures remain visible; no fallback values are substituted.",
        "",
        "| ID | Expected country | Full NLP | Status | Disease | Country out | Cases | Deaths | Latency ms | Error |",
        "|---|---|---:|---|---|---|---:|---:|---:|---|",
    ]
    for row in rows:
        lines.append(
            "| " + " | ".join(
                _md(row.get(key))
                for key in (
                    "id", "country", "full_nlp", "analysis_status", "disease",
                    "country_extracted", "case_count", "death_count", "latency_ms", "error",
                )
            ) + " |"
        )
    Path(args.md_out).write_text("\n".join(lines) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
