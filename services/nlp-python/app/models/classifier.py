import json
import logging
import time
import urllib.request

from transformers import pipeline

from ..config import NLP_MODEL
from ..extractors import detect_language

logger = logging.getLogger(__name__)

_pipes: dict[str, pipeline] = {}
_current_labels: dict[str, list[str]] = {}
_labels_last_fetch: float = 0
_LABELS_CACHE_TTL = 60
_BACKEND_URL = "http://backend-rust:8080"

_DEFAULT_LABELS: dict[str, list[str]] = {}


def _load_defaults():
    global _DEFAULT_LABELS
    if not _DEFAULT_LABELS:
        from ..config import DISEASE_LABELS, SENTIMENT_LABELS, EVENT_TYPE_LABELS, RELEVANCE_LABELS
        _DEFAULT_LABELS = {
            "disease": DISEASE_LABELS,
            "sentiment": SENTIMENT_LABELS,
            "event_type": EVENT_TYPE_LABELS,
            "relevance": RELEVANCE_LABELS,
        }


def _fetch_labels_api():
    global _current_labels, _labels_last_fetch
    now = time.time()
    if now - _labels_last_fetch < _LABELS_CACHE_TTL:
        return
    _load_defaults()

    for category in ("disease", "event_type", "sentiment", "relevance"):
        try:
            req = urllib.request.Request(f"{_BACKEND_URL}/api/v1/nlp-labels?category={category}",
                                          headers={"User-Agent": "nlp-service/1.0"})
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read())["data"]
                labels = [l["label"] for l in data if l.get("is_active", True)]
                if labels:
                    _current_labels[category] = labels
                    logger.info("Refreshed %d labels for '%s' from DB", len(labels), category)
        except Exception as e:
            logger.debug("Failed to fetch labels for '%s': %s", category, e)
            if category not in _current_labels:
                _current_labels[category] = _DEFAULT_LABELS.get(category, [])
    _labels_last_fetch = now


def _get_pipe(model_key: str):
    model_id = _get_model_id(model_key)
    if model_key not in _pipes:
        logger.info("Loading model %s (%s) — this may take a minute on first run", model_key, model_id)
        if model_key == "fine-tuned":
            _pipes[model_key] = pipeline(
                "text-classification",
                model=model_id,
                tokenizer=model_id,
                device=-1,
            )
        else:
            _pipes[model_key] = pipeline(
                "zero-shot-classification",
                model=model_id,
                device=-1,
            )
    return _pipes[model_key]


def _get_model_id(model_key: str) -> str:
    from ..config import MODEL_MAP
    return MODEL_MAP.get(model_key, "xlm-roberta-base")


def _choose_model(text: str) -> str:
    if NLP_MODEL == "dual":
        lang = detect_language(text)
        chosen = "indobert" if lang == "id" else "xlm-roberta"
        logger.debug("dual-mode: lang=%s → model=%s", lang, chosen)
        return chosen
    return NLP_MODEL


def set_labels(category: str, labels: list[str]):
    _current_labels[category] = labels
    logger.info("Updated labels for '%s': %s", category, labels)


def get_labels(category: str) -> list[str]:
    _fetch_labels_api()
    if category not in _current_labels:
        _load_defaults()
        _current_labels[category] = _DEFAULT_LABELS.get(category, [])
    return _current_labels.get(category, [])


def classify(text: str, labels: list[str]) -> tuple[str, float]:
    key = _choose_model(text)
    pipe = _get_pipe(key)
    if key == "fine-tuned":
        result = pipe(text)[0]
        return result["label"], result["score"]
    result = pipe(text, labels)
    return result["labels"][0], result["scores"][0]


def classify_disease(text: str) -> tuple[str, float]:
    return classify(text, get_labels("disease"))


def classify_sentiment(text: str) -> tuple[str, float]:
    return classify(text, get_labels("sentiment"))


def classify_event_type(text: str) -> tuple[str, float]:
    return classify(text, get_labels("event_type"))


def classify_relevance(text: str) -> tuple[str, float]:
    label, score = classify(text, get_labels("relevance"))
    if "health" in label:
        return "high", score
    return "low", score


def is_health_related(text: str) -> tuple[bool, float]:
    """Binary check: apakah teks terkait kesehatan/penyakit?"""
    label, score = classify(text, ["health related disease medical", "general news other topic"])
    is_health = "health" in label
    return is_health, score
