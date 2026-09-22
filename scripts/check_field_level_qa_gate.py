#!/usr/bin/env python3
"""Apply the field-level QA gate to a scorer JSON report."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "nlp-python"))
from app.qa_gate import evaluate_field_report  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check field-level NLP QA thresholds")
    parser.add_argument("report", type=Path)
    parser.add_argument("--min-annotated", type=int, default=5)
    parser.add_argument("--json-out", type=Path, default=None)
    args = parser.parse_args(argv)

    report = json.loads(args.report.read_text(encoding="utf-8"))
    gate = evaluate_field_report(report, min_annotated=max(1, args.min_annotated))
    output = {"report": str(args.report), "qa_gate": gate}
    print(json.dumps(output, ensure_ascii=False, indent=2))
    if args.json_out:
        args.json_out.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0 if gate["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
