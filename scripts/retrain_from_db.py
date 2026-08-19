#!/usr/bin/env python3
"""Export high-confidence events, train a candidate, and promote safely.

This is intentionally a command-line workflow. A scheduled job or a secured
admin button can invoke the same command, but the web API must not start
unbounded GPU work directly.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--task", choices=["disease", "event_type", "relevance_score"], default="disease")
    parser.add_argument("--database-url", default=os.getenv("TRAINING_DATABASE_URL") or os.getenv("DATABASE_URL"))
    parser.add_argument("--min-confidence", type=float, default=float(os.getenv("TRAINING_MIN_CONFIDENCE", "0.90")))
    parser.add_argument("--max-per-label", type=int, default=int(os.getenv("TRAINING_MAX_PER_LABEL", "100000")))
    parser.add_argument("--min-macro-f1", type=float, default=float(os.getenv("TRAINING_MIN_MACRO_F1", "0.80")))
    parser.add_argument("--min-eval-samples", type=int, default=int(os.getenv("TRAINING_MIN_EVAL_SAMPLES", "100")))
    parser.add_argument("--model-name", default=os.getenv("TRAINING_BASE_MODEL", "xlm-roberta-base"))
    parser.add_argument("--models-root", default=os.getenv("TRAINING_MODEL_ROOT", "services/nlp-python/models"))
    parser.add_argument("--epochs", type=float, default=3.0)
    parser.add_argument("--max-steps", type=int, default=-1)
    parser.add_argument("--train-batch-size", type=int, default=16)
    parser.add_argument("--eval-batch-size", type=int, default=32)
    parser.add_argument("--gradient-accumulation-steps", type=int, default=1)
    parser.add_argument("--fp16", action="store_true")
    parser.add_argument("--bf16", action="store_true")
    parser.add_argument("--restart-service", action="store_true")
    parser.add_argument("--compose-file", default="docker-compose.yml")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def run(command: list[str]) -> None:
    print("$", " ".join(command))
    subprocess.run(command, cwd=ROOT, check=True)


def metric_from(candidate: Path) -> float:
    manifest = json.loads((candidate / "training_manifest.json").read_text(encoding="utf-8"))
    return float(manifest["metrics"].get("eval_f1_macro", 0.0))


def promote(candidate: Path, models_root: Path, task: str, stamp: str) -> Path:
    if task != "disease":
        raise RuntimeError("Promosi otomatis hanya diaktifkan untuk task disease; task lain perlu runtime mapping terpisah")
    releases = models_root / "releases"
    releases.mkdir(parents=True, exist_ok=True)
    release = releases / f"{task}-{stamp}"
    shutil.copytree(candidate, release)

    active = models_root / "fine-tuned"
    if active.exists() or active.is_symlink():
        backup = models_root / f"fine-tuned.previous.{stamp}"
        active.rename(backup)
        print(f"Previous model retained at {backup}")
    temporary_link = models_root / ".fine-tuned.next"
    if temporary_link.exists() or temporary_link.is_symlink():
        temporary_link.unlink()
    temporary_link.symlink_to(release.relative_to(models_root), target_is_directory=True)
    temporary_link.rename(active)
    return release


def main() -> None:
    args = parse_args()
    if not args.database_url:
        raise SystemExit("DATABASE_URL atau TRAINING_DATABASE_URL wajib diisi")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = ROOT / "training" / "runs" / f"{args.task}-{stamp}"
    dataset_dir = run_dir / "dataset"
    candidate_dir = run_dir / "candidate"
    dataset_dir.mkdir(parents=True, exist_ok=True)

    export_command = [
        sys.executable, str(ROOT / "scripts" / "export_training_data.py"),
        "--output-dir", str(dataset_dir),
        "--max-per-label", str(args.max_per_label),
        "--min-confidence", str(args.min_confidence),
        "--database-url", args.database_url,
    ]
    run(export_command)
    manifest = json.loads((dataset_dir / "manifest.json").read_text(encoding="utf-8"))
    if manifest["eval_samples"] < args.min_eval_samples:
        raise SystemExit(
            f"Eval dataset hanya {manifest['eval_samples']} contoh; minimal {args.min_eval_samples}. Model tidak dipromosikan."
        )
    if args.dry_run:
        print("Dry run selesai; tidak ada training atau perubahan model.")
        return

    train_command = [
        sys.executable, str(ROOT / "scripts" / "train_classifier.py"),
        "--train", str(dataset_dir / "train.jsonl"),
        "--eval", str(dataset_dir / "test.jsonl"),
        "--label-field", args.task,
        "--model-name", args.model_name,
        "--output-dir", str(candidate_dir),
        "--max-per-label", str(args.max_per_label),
        "--epochs", str(args.epochs),
        "--max-steps", str(args.max_steps),
        "--train-batch-size", str(args.train_batch_size),
        "--eval-batch-size", str(args.eval_batch_size),
        "--gradient-accumulation-steps", str(args.gradient_accumulation_steps),
    ]
    if args.fp16:
        train_command.append("--fp16")
    if args.bf16:
        train_command.append("--bf16")
    run(train_command)

    score = metric_from(candidate_dir)
    print(f"Candidate eval macro-F1: {score:.4f}")
    if score < args.min_macro_f1:
        raise SystemExit(f"Candidate ditolak: macro-F1 {score:.4f} < minimum {args.min_macro_f1:.4f}")

    models_root = (ROOT / args.models_root).resolve()
    release = promote(candidate_dir, models_root, args.task, stamp)
    print(f"Candidate dipromosikan: {release}")
    print("Rollback: rename fine-tuned.previous.<timestamp> menjadi fine-tuned lalu restart NLP.")

    if args.restart_service:
        compose = ["docker", "compose", "-f", str(ROOT / args.compose_file), "up", "-d", "--force-recreate", "nlp-python"]
        run(compose)


if __name__ == "__main__":
    main()
