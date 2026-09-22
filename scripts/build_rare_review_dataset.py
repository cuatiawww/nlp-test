#!/usr/bin/env python3
"""Build a classifier dataset with a review bucket for under-supported labels.

The original disease label is retained in each JSONL row as
``original_disease``. The classifier label becomes ``RARE_DISEASE_REVIEW``
when the complete source dataset has fewer than the configured number of
examples for that disease. This prevents a one-example label from being
treated as a learnable class while preserving the WHO/rule fallback target.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path


RARE_LABEL = "RARE_DISEASE_REVIEW"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--min-label-count", type=int, default=20)
    return parser.parse_args()


def read_rows(path: Path) -> list[dict]:
    rows = []
    with path.open(encoding="utf-8") as source:
        for line in source:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def split_for(item: dict) -> bool:
    key = "|".join(
        [
            str(item.get("article_key") or item.get("raw_report_id") or item.get("url") or ""),
            str(item.get("language") or ""),
            str(item.get("original_disease") or item.get("disease") or ""),
        ]
    )
    value = int(hashlib.sha256(key.encode("utf-8")).hexdigest()[:8], 16) / 0xFFFFFFFF
    return value < 0.10


def main() -> None:
    args = parse_args()
    if args.min_label_count < 2:
        raise SystemExit("--min-label-count harus >= 2")

    input_dir = Path(args.input_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    train = read_rows(input_dir / "train.jsonl")
    test = read_rows(input_dir / "test.jsonl")
    rows = train + test
    counts = Counter(str(row.get("disease") or "").strip() for row in rows)
    rare_labels = sorted(
        label for label, count in counts.items()
        if label and label != "NEGATIVE - not health related" and count < args.min_label_count
    )
    rare_set = set(rare_labels)

    transformed = []
    for row in rows:
        original = str(row.get("disease") or "").strip()
        item = dict(row)
        item["original_disease"] = original
        item["disease"] = RARE_LABEL if original in rare_set else original
        transformed.append(item)

    # Re-split after grouping so the review bucket is represented in eval.
    grouped_train = [row for row in transformed if not split_for(row)]
    grouped_test = [row for row in transformed if split_for(row)]
    if not grouped_train or not grouped_test:
        raise SystemExit("Split dataset gagal")

    for rows_out, name in ((grouped_train, "train.jsonl"), (grouped_test, "test.jsonl")):
        with (output_dir / name).open("w", encoding="utf-8", newline="\n") as target:
            for row in rows_out:
                target.write(json.dumps(row, ensure_ascii=False) + "\n")

    manifest = {
        "source": str(input_dir),
        "label_field": "disease",
        "rare_label": RARE_LABEL,
        "min_label_count": args.min_label_count,
        "original_rows": len(rows),
        "train_samples": len(grouped_train),
        "eval_samples": len(grouped_test),
        "original_label_counts": dict(sorted(counts.items())),
        "classifier_label_counts": dict(
            sorted(Counter(row["disease"] for row in transformed).items())
        ),
        "rare_labels": rare_labels,
        "fallback_required": True,
    }
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (output_dir / "rare_label_map.json").write_text(
        json.dumps(
            {label: RARE_LABEL for label in rare_labels},
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps(manifest, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
