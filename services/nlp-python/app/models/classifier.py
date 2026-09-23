import json
import logging
import os
import time
import urllib.request
from pathlib import Path
from threading import Lock

# Must be set before importing tokenizers/transformers. Fork-after-load plus
# the Rayon thread pool is a common hang that surfaces as NLP HTTP 408.
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
# Defense-in-depth: main.py already pins threads at process start. Keep the
# same caps here in case classifier is imported from another entrypoint.
for _k, _v in (
    ("OMP_NUM_THREADS", "2"),
    ("MKL_NUM_THREADS", "2"),
    ("OPENBLAS_NUM_THREADS", "2"),
    ("TORCH_NUM_THREADS", "2"),
    ("TORCH_NUM_INTEROP_THREADS", "2"),
):
    os.environ.setdefault(_k, _v)

from transformers import pipeline

def _configure_torch_threads() -> None:
    try:
        import torch
    except Exception:
        return
    intra = int(os.environ.get("TORCH_NUM_THREADS", "2"))
    inter = int(os.environ.get("TORCH_NUM_INTEROP_THREADS", "2"))
    try:
        torch.set_num_threads(intra)
    except Exception:
        pass
    try:
        torch.set_num_interop_threads(inter)
    except RuntimeError:
        pass
    except Exception:
        pass

_configure_torch_threads()

from ..config import NLP_MODEL
from ..extractors import detect_language
from typing import Optional

logger = logging.getLogger(__name__)

_pipes: dict[str, pipeline] = {}
_pipe_failures: dict[str, float] = {}
_snapshot_lock = Lock()
_current_labels: dict[str, list[str]] = {}
_labels_last_fetch: float = 0
_LABELS_CACHE_TTL = int(os.getenv("NLP_LABELS_CACHE_TTL", "60"))
_BACKEND_URL = os.getenv("BACKEND_LABELS_URL", "http://backend-rust:8080")

_DEFAULT_LABELS: dict[str, list[str]] = {}


def validate_sequence_classification_checkpoint(model_id: str) -> dict[str, object]:
    """Validate a local checkpoint before Transformers constructs a pipeline.

    ``xlm-roberta-base`` is an encoder checkpoint.  It is useful as the
    starting point for fine-tuning, but it is not a zero-shot/NLI checkpoint.
    Passing it to ``zero-shot-classification`` would create an untrained head
    and produce plausible-looking but invalid scores.  Keep this check
    explicit so the deterministic source extractor remains authoritative.
    """
    from transformers import AutoConfig

    model_config = AutoConfig.from_pretrained(model_id, local_files_only=True)
    architectures = model_config.to_dict().get("architectures") or []
    supported = any("SequenceClassification" in str(item) for item in architectures)
    return {
        "model_id": model_id,
        "model_type": getattr(model_config, "model_type", None),
        "architectures": architectures,
        "supports_sequence_classification": supported,
    }


def _fetch_paginated_collection(path: str, category: str) -> list[dict]:
    """Read the complete DB collection instead of silently taking page one.

    The backend defaults to 20 rows per page. Classifier labels and keywords
    are runtime configuration, so truncating them changes model behaviour
    without an error. Keep the pagination detail here rather than teaching
    every caller a different API contract.
    """
    items: list[dict] = []
    page = 1
    per_page = 100
    while page <= 100:
        separator = "&" if "?" in path else "?"
        url = (
            f"{_BACKEND_URL}{path}{separator}category={category}"
            f"&page={page}&per_page={per_page}"
        )
        req = urllib.request.Request(url, headers={"User-Agent": "nlp-service/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            payload = json.loads(resp.read())
        batch = payload.get("data", []) if isinstance(payload, dict) else payload
        if not isinstance(batch, list):
            raise ValueError("configuration API returned a non-list data field")
        items.extend(item for item in batch if isinstance(item, dict))
        total_pages = int((payload or {}).get("total_pages") or page) if isinstance(payload, dict) else page
        if page >= total_pages or not batch:
            break
        page += 1
    return items


def _load_defaults():
    global _DEFAULT_LABELS
    if not _DEFAULT_LABELS:
        from ..config import (
            BINARY_HEALTH_LABELS,
            DISEASE_LABELS,
            SENTIMENT_LABELS,
            EVENT_TYPE_LABELS,
            RELEVANCE_LABELS,
        )
        _DEFAULT_LABELS = {
            "disease": DISEASE_LABELS,
            "sentiment": SENTIMENT_LABELS,
            "event_type": EVENT_TYPE_LABELS,
            "relevance": RELEVANCE_LABELS,
            "binary_health": BINARY_HEALTH_LABELS,
        }


def _fetch_labels_api():
    global _current_labels, _labels_last_fetch
    now = time.time()
    if now - _labels_last_fetch < _LABELS_CACHE_TTL:
        return
    _load_defaults()

    for category in ("disease", "event_type", "sentiment", "relevance", "binary_health"):
        try:
            data = _fetch_paginated_collection("/api/v1/nlp-labels", category)
            labels = [item["label"] for item in data if item.get("is_active", True) and item.get("label")]
            _current_labels[category] = labels
            logger.info("Refreshed %d labels for '%s' from DB", len(labels), category)
        except Exception as e:
            logger.debug("Failed to fetch labels for '%s': %s", category, e)
            if category not in _current_labels:
                _current_labels[category] = _DEFAULT_LABELS.get(category, [])
    _labels_last_fetch = now

    # Also fetch keywords (symptom + disease dicts)
    from .. import config as _cfg
    _fetch_keywords(_cfg)


def _fetch_keywords(cfg):
    """Update config.SYMPTOM_DICT and config.DISEASE_DICT from DB."""
    for cat, target_dict_name in [("symptom", "SYMPTOM_DICT"), ("disease", "DISEASE_DICT")]:
        try:
            items = _fetch_paginated_collection("/api/v1/nlp-keywords", cat)
            new_dict = {
                item["keyword"]: item["target_label"]
                for item in items
                if item.get("is_active", True) and item.get("keyword") and item.get("target_label")
            }
            setattr(cfg, target_dict_name, new_dict)
            logger.info("Refreshed %d keywords for '%s' from DB", len(new_dict), cat)
        except Exception as e:
            logger.debug("Failed to fetch keywords for '%s': %s", cat, e)


def _materialize_cached_snapshot(model_id: str) -> str | None:
    """Repair cache snapshots when only HF blob metadata was persisted.

    Some persistent volumes contain all model blobs but lost the lightweight
    snapshot symlinks. Recreating those symlinks is safe, avoids a download,
    and keeps the model selection generic rather than mapping filenames or
    disease terms in application code.
    """
    if not model_id or model_id.startswith("/"):
        return None
    roots = []
    for value in (
        os.getenv("HF_HUB_CACHE"),
        os.getenv("HF_HOME"),
        os.getenv("TRANSFORMERS_CACHE"),
    ):
        if value and value not in roots:
            roots.append(value)
    try:
        from huggingface_hub import scan_cache_dir

        for root in roots:
            cache_root = Path(root)
            repo_dir = cache_root / f"models--{model_id.replace('/', '--')}"
            existing_snapshots = repo_dir / "snapshots"
            if existing_snapshots.is_dir():
                for snapshot in existing_snapshots.iterdir():
                    if (snapshot / "config.json").is_file() and (
                        (snapshot / "model.safetensors").is_file()
                        or (snapshot / "pytorch_model.bin").is_file()
                    ):
                        return str(snapshot)
            report = scan_cache_dir(str(cache_root))
            repo = next((item for item in report.repos if item.repo_id == model_id), None)
            if not repo or not repo.revisions:
                continue
            revision = max(repo.revisions, key=lambda item: item.last_modified)
            snapshot = repo_dir / "snapshots" / revision.commit_hash
            with _snapshot_lock:
                snapshot.mkdir(parents=True, exist_ok=True)
                for cached_file in revision.files:
                    blob = Path(cached_file.blob_path)
                    target = snapshot / cached_file.file_name
                    if not blob.is_file():
                        break
                    if not target.exists():
                        os.symlink(blob, target)
                required = snapshot / "config.json"
                if required.is_file():
                    logger.info("Using repaired local model snapshot: %s", snapshot)
                    return str(snapshot)
    except Exception as exc:
        logger.debug("Could not repair local model snapshot for %s: %s", model_id, exc)
    return None


def _get_pipe(model_key: str):
    model_id = _get_model_id(model_key)
    resolved_model_id = _materialize_cached_snapshot(model_id) or model_id
    failed_at = _pipe_failures.get(model_key)
    if failed_at and time.time() - failed_at < int(os.getenv("MODEL_FAILURE_COOLDOWN_SECONDS", "300")):
        raise RuntimeError(f"model {model_key} unavailable; retry after cooldown")
    if model_key not in _pipes:
        max_length = int(os.getenv("NLP_MAX_LENGTH", "512"))
        logger.info("Loading model %s (%s) — this may take a minute on first run", model_key, resolved_model_id)
        try:
            if model_key != "fine-tuned":
                # An encoder checkpoint such as xlm-roberta-base has a
                # masked-language-model head, not an NLI head. Passing it to
                # zero-shot-classification silently creates random classifier
                # weights. Reject it so deterministic source extraction stays
                # safer than an untrained prediction.
                checkpoint = validate_sequence_classification_checkpoint(resolved_model_id)
                if not checkpoint["supports_sequence_classification"]:
                    raise RuntimeError(
                        f"model {resolved_model_id} is not a sequence-classification/NLI checkpoint"
                    )
            if model_key == "fine-tuned":
                _pipes[model_key] = pipeline(
                    "text-classification",
                    model=resolved_model_id,
                    tokenizer=resolved_model_id,
                    device=-1,
                    truncation=True,
                    max_length=max_length,
                )
            else:
                _pipes[model_key] = pipeline(
                    "zero-shot-classification",
                    model=resolved_model_id,
                    device=-1,
                    truncation=True,
                )
        except Exception:
            _pipe_failures[model_key] = time.time()
            raise
    return _pipes[model_key]


def _get_model_id(model_key: str) -> str:
    from ..config import MODEL_MAP
    return MODEL_MAP.get(model_key, "xlm-roberta-base")


def _choose_model(text: str) -> str:
    if NLP_MODEL == "dual":
        lang = detect_language(text)
        from ..config import LANGUAGE_MODEL_MAP
        return LANGUAGE_MODEL_MAP.get(lang, "xlm-roberta")
    return NLP_MODEL


def set_labels(category: str, labels: list[str]):
    _current_labels[category] = labels
    logger.info("Updated labels for '%s': %s", category, labels)


def refresh_labels_from_db():
    """Force a refresh after a re-analysis job changes DB-backed labels."""
    global _labels_last_fetch
    _labels_last_fetch = 0
    _fetch_labels_api()


def get_labels(category: str) -> list[str]:
    _fetch_labels_api()
    if category not in _current_labels:
        _load_defaults()
        _current_labels[category] = _DEFAULT_LABELS.get(category, [])
    return _current_labels.get(category, [])


def classify(text: str, labels: list[str], model_key: Optional[str] = None) -> tuple[str, float]:
    key = model_key or _choose_model(text)
    pipe = _get_pipe(key)
    if key == "fine-tuned":
        result = pipe(text)[0]
        return result["label"], result["score"]
    result = pipe(text, labels)
    return result["labels"][0], result["scores"][0]


def classify_disease(text: str) -> tuple[str, float]:
    return classify(text, get_labels("disease"))


def classify_sentiment(text: str, model_key: Optional[str] = None) -> tuple[str, float]:
    return classify(text, get_labels("sentiment"), model_key=model_key)


def classify_event_type(text: str, model_key: Optional[str] = None) -> tuple[str, float]:
    return classify(text, get_labels("event_type"), model_key=model_key)


def classify_relevance(text: str, model_key: Optional[str] = None) -> tuple[str, float]:
    label, score = classify(text, get_labels("relevance"), model_key=model_key)
    label_lower = label.lower()
    if "high" in label_lower or "tinggi" in label_lower or "health" in label_lower:
        return "high", score
    if "medium" in label_lower or "sedang" in label_lower or "moderate" in label_lower:
        return "medium", score
    return "low", score


def is_health_related(text: str) -> tuple[bool, float]:
    """Binary check: apakah teks terkait kesehatan/penyakit?"""
    label, score = classify(text, get_labels("binary_health"))
    is_health = "health" in label
    return is_health, score
