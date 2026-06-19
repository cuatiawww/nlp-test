import logging

from transformers import pipeline

from ..config import NLP_MODEL
from ..extractors import detect_language

logger = logging.getLogger(__name__)

_pipes: dict[str, pipeline] = {}
_current_labels: dict[str, list[str]] = {}


def _get_pipe(model_key: str):
    model_id = _get_model_id(model_key)
    if model_key not in _pipes:
        logger.info("Loading model %s (%s) — this may take a minute on first run", model_key, model_id)
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
    if category not in _current_labels:
        from ..config import DISEASE_LABELS, SENTIMENT_LABELS, EVENT_TYPE_LABELS, RELEVANCE_LABELS
        _current_labels["disease"] = DISEASE_LABELS
        _current_labels["sentiment"] = SENTIMENT_LABELS
        _current_labels["event_type"] = EVENT_TYPE_LABELS
        _current_labels["relevance"] = RELEVANCE_LABELS
    return _current_labels.get(category, [])


def classify(text: str, labels: list[str]) -> tuple[str, float]:
    key = _choose_model(text)
    pipe = _get_pipe(key)
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
    if label == "not relevant":
        return "low", score
    short = label.replace(" relevance to health crisis", "").replace(" relevance", "")
    return short, score
