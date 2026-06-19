#!/usr/bin/env python3
"""Export training data dari database ke JSONL untuk fine-tuning."""

import json
import os
import random
from collections import defaultdict

import psycopg
from psycopg.rows import dict_row

DATABASE_URL = os.getenv("DATABASE_URL", "postgres://postgres:root@postgres:5432/disease_ai")
OUTPUT_DIR = "training"
MAX_SAMPLES = 200
TEST_SPLIT = 0.1
MIN_SAMPLES = 10


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)

    rows = conn.execute("""
        SELECT r.original_text,
               COALESCE(e.disease_classification, 'UNKNOWN') AS disease
        FROM raw_reports r
        JOIN disease_events e ON e.raw_report_id = r.id
        WHERE r.original_text IS NOT NULL AND LENGTH(r.original_text) > 30
        ORDER BY r.created_at DESC
    """).fetchall()

    if not rows:
        print("❌ No data found in database. Run a collector trigger first!")
        return

    groups = defaultdict(list)
    for row in rows:
        text = row["original_text"][:1000]
        groups[row["disease"]].append(text)

    # Balance: max per label
    balanced = []
    for label, texts in sorted(groups.items()):
        selected = texts[:MAX_SAMPLES]
        balanced.extend([(t, label) for t in selected])
        print(f"  {label:35s} {len(texts):4d} available → {len(selected):4d} selected")

    if len(balanced) < 20:
        print("\n⚠️  Very little data. Trigger RSS collection first!")
        print("   http://localhost:3001/sources → klik Play button")

    random.shuffle(balanced)
    split_idx = max(1, int(len(balanced) * (1 - TEST_SPLIT)))
    train = balanced[:split_idx]
    test = balanced[split_idx:]

    def save_jsonl(data, path):
        with open(path, "w") as f:
            for text, label in data:
                f.write(json.dumps({"text": text, "disease": label}) + "\n")

    save_jsonl(train, f"{OUTPUT_DIR}/train.jsonl")
    save_jsonl(test, f"{OUTPUT_DIR}/test.jsonl")

    print(f"\n✅ Train: {len(train)} samples → {OUTPUT_DIR}/train.jsonl")
    print(f"✅ Test:  {len(test)} samples → {OUTPUT_DIR}/test.jsonl")

    dist = defaultdict(int)
    for _, label in balanced:
        dist[label] += 1
    print("\nDistribution:")
    for label, count in sorted(dist.items(), key=lambda x: -x[1]):
        print(f"  {label:35s} {count}")


if __name__ == "__main__":
    main()
