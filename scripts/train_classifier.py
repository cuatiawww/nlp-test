#!/usr/bin/env python3
"""Fine-tune an XLM-R classifier from JSONL without loading unbounded data.

The same script runs in Google Colab Pro and on a self-hosted GPU. Input rows
must contain ``text`` and the selected label field (``disease`` by default).
For millions of rows, use the exporter first or set ``--max-per-label`` to
keep the in-memory training set balanced and bounded.
"""

from __future__ import annotations

import argparse
import json
import os
import random
from collections import defaultdict
from inspect import signature
from pathlib import Path

import numpy as np
import torch
from datasets import Dataset
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    DataCollatorWithPadding,
    Trainer,
    TrainingArguments,
    set_seed,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--train", required=True, help="Training JSONL")
    parser.add_argument("--eval", required=True, help="Evaluation JSONL")
    parser.add_argument("--label-field", default="disease", choices=["disease", "event_type", "relevance_score"])
    parser.add_argument("--model-name", default=os.getenv("TRAINING_BASE_MODEL", "xlm-roberta-base"))
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--max-per-label", type=int, default=int(os.getenv("TRAINING_MAX_PER_LABEL", "100000")))
    parser.add_argument("--max-length", type=int, default=256)
    parser.add_argument("--epochs", type=float, default=3.0)
    parser.add_argument("--max-steps", type=int, default=-1)
    parser.add_argument("--learning-rate", type=float, default=2e-5)
    parser.add_argument("--train-batch-size", type=int, default=16)
    parser.add_argument("--eval-batch-size", type=int, default=32)
    parser.add_argument("--gradient-accumulation-steps", type=int, default=1)
    parser.add_argument("--warmup-ratio", type=float, default=0.1)
    parser.add_argument("--weight-decay", type=float, default=0.01)
    parser.add_argument("--seed", type=int, default=20260819)
    parser.add_argument("--exclude-label", action="append", default=[])
    parser.add_argument("--fp16", action="store_true", help="Use fp16 when CUDA is available")
    parser.add_argument("--bf16", action="store_true", help="Use bf16 when supported")
    return parser.parse_args()


def read_balanced(path: str, label_field: str, max_per_label: int, excludes: set[str], seed: int) -> list[dict]:
    buckets: dict[str, list[dict]] = defaultdict(list)
    seen: defaultdict[str, int] = defaultdict(int)
    rng = random.Random(seed)
    with open(path, encoding="utf-8") as source:
        for line in source:
            if not line.strip():
                continue
            row = json.loads(line)
            text = " ".join(str(row.get("text", "")).split())
            label = str(row.get(label_field, "")).strip()
            if len(text) < 10 or not label or label in excludes or label.lower() in {x.lower() for x in excludes}:
                continue
            item = {"text": text, "label": label}
            seen[label] += 1
            bucket = buckets[label]
            if len(bucket) < max_per_label:
                bucket.append(item)
            else:
                index = rng.randrange(seen[label])
                if index < max_per_label:
                    bucket[index] = item
    rows = [item for label in sorted(buckets) for item in buckets[label]]
    if len(rows) < 2:
        raise ValueError(f"Dataset {path} tidak memiliki minimal dua contoh berlabel")
    return rows


def as_dataset(rows: list[dict], label2id: dict[str, int]) -> Dataset:
    return Dataset.from_list([
        {"text": row["text"], "labels": label2id[row["label"]]}
        for row in rows
    ])


def main() -> None:
    args = parse_args()
    if args.max_per_label < 1:
        raise SystemExit("--max-per-label harus >= 1")
    set_seed(args.seed)

    excludes = set(args.exclude_label)
    train_rows = read_balanced(args.train, args.label_field, args.max_per_label, excludes, args.seed)
    eval_rows = read_balanced(args.eval, args.label_field, args.max_per_label, excludes, args.seed + 1)
    labels = sorted({row["label"] for row in train_rows} | {row["label"] for row in eval_rows})
    label2id = {label: index for index, label in enumerate(labels)}
    id2label = {index: label for label, index in label2id.items()}

    tokenizer = AutoTokenizer.from_pretrained(args.model_name, use_fast=True)
    train_ds = as_dataset(train_rows, label2id).map(
        lambda batch: tokenizer(batch["text"], truncation=True, max_length=args.max_length),
        batched=True,
        remove_columns=["text"],
    )
    eval_ds = as_dataset(eval_rows, label2id).map(
        lambda batch: tokenizer(batch["text"], truncation=True, max_length=args.max_length),
        batched=True,
        remove_columns=["text"],
    )

    model = AutoModelForSequenceClassification.from_pretrained(
        args.model_name,
        num_labels=len(labels),
        id2label=id2label,
        label2id=label2id,
    )
    use_bf16 = args.bf16 and torch.cuda.is_available() and torch.cuda.is_bf16_supported()
    use_fp16 = args.fp16 and torch.cuda.is_available() and not use_bf16
    training_kwargs = dict(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        max_steps=args.max_steps,
        learning_rate=args.learning_rate,
        per_device_train_batch_size=args.train_batch_size,
        per_device_eval_batch_size=args.eval_batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        warmup_ratio=args.warmup_ratio,
        weight_decay=args.weight_decay,
        logging_strategy="steps",
        logging_steps=100,
        save_strategy="epoch",
        save_total_limit=2,
        load_best_model_at_end=True,
        metric_for_best_model="f1_macro",
        greater_is_better=True,
        report_to="none",
        fp16=use_fp16,
        bf16=use_bf16,
        seed=args.seed,
    )
    # Transformers has renamed/removed TrainingArguments fields across
    # releases. Keep the notebook usable with the version already installed
    # in Colab instead of requiring a specific global transformers version.
    training_parameters = signature(TrainingArguments.__init__).parameters
    if "eval_strategy" in training_parameters:
        training_kwargs["eval_strategy"] = "epoch"
    elif "evaluation_strategy" in training_parameters:
        training_kwargs["evaluation_strategy"] = "epoch"
    if "warmup_ratio" not in training_parameters and "warmup_steps" in training_parameters:
        training_kwargs["warmup_steps"] = 0
    if "save_strategy" not in training_parameters:
        for key in (
            "save_strategy",
            "save_total_limit",
            "load_best_model_at_end",
            "metric_for_best_model",
            "greater_is_better",
        ):
            training_kwargs.pop(key, None)
    training_kwargs = {
        key: value for key, value in training_kwargs.items()
        if key in training_parameters
    }

    def metrics(result):
        predictions = np.argmax(result.predictions, axis=-1)
        return {
            "accuracy": accuracy_score(result.label_ids, predictions),
            "f1_macro": f1_score(result.label_ids, predictions, average="macro", zero_division=0),
            "precision_macro": precision_score(result.label_ids, predictions, average="macro", zero_division=0),
            "recall_macro": recall_score(result.label_ids, predictions, average="macro", zero_division=0),
        }

    trainer_kwargs = {
        "model": model,
        "args": TrainingArguments(**training_kwargs),
        "train_dataset": train_ds,
        "eval_dataset": eval_ds,
        "data_collator": DataCollatorWithPadding(tokenizer=tokenizer),
        "compute_metrics": metrics,
    }
    trainer_parameters = signature(Trainer.__init__).parameters
    if "processing_class" in trainer_parameters:
        trainer_kwargs["processing_class"] = tokenizer
    elif "tokenizer" in trainer_parameters:
        trainer_kwargs["tokenizer"] = tokenizer
    trainer = Trainer(**trainer_kwargs)
    trainer.train()
    result = trainer.evaluate()
    trainer.save_model(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)
    manifest = {
        "base_model": args.model_name,
        "label_field": args.label_field,
        "labels": labels,
        "train_samples": len(train_rows),
        "eval_samples": len(eval_rows),
        "metrics": result,
        "device": "cuda" if torch.cuda.is_available() else "cpu",
    }
    Path(args.output_dir, "training_manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(json.dumps(manifest, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
