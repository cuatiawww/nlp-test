import logging

from fastapi import FastAPI, Body
from pydantic import BaseModel
from typing import Optional

from .schemas import AnalyzeRequest, AnalyzeResponse
from . import pipeline

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Disease NLP Service", version="0.2.0")


@app.on_event("startup")
def startup():
    from .config import NLP_MODEL, load_keywords_from_db, load_outbreak_rules_from_db, load_locations_from_db, load_credibility_from_db
    from .models.classifier import get_labels, classify
    logger.info("NLP service starting — model=%s labels=%s", NLP_MODEL, get_labels("disease"))
    load_keywords_from_db()
    load_outbreak_rules_from_db()
    load_locations_from_db()
    load_credibility_from_db()
    if NLP_MODEL != "none":
        try:
            from .models.classifier import classify_disease
            classify_disease("warmup")
        except Exception as e:
            logger.warning("Model warmup failed: %s", e)
    if NLP_MODEL == "fine-tuned":
        try:
            from .config import SENTIMENT_LABELS
            classify("warmup", SENTIMENT_LABELS, model_key="xlm-roberta")
            logger.info("Zero-shot model (xlm-roberta-base) ready")
        except Exception as e:
            logger.warning("Zero-shot warmup: %s", e)


@app.get("/health")
def health():
    from .config import NLP_MODEL
    from .models.classifier import get_labels
    return {
        "status": "ok",
        "service": "nlp-python",
        "model": NLP_MODEL,
        "disease_labels": get_labels("disease"),
    }


@app.post("/nlp/analyze", response_model=AnalyzeResponse)
def analyze(payload: AnalyzeRequest):
    return pipeline.run(payload)


class LabelsUpdate(BaseModel):
    labels: list[str]


@app.get("/labels")
def get_disease_labels():
    from .models.classifier import get_labels
    return {
        "success": True,
        "labels": get_labels("disease"),
        "sentiment_labels": get_labels("sentiment"),
    }


@app.put("/labels")
def update_disease_labels(body: LabelsUpdate):
    from .models.classifier import set_labels
    if not body.labels:
        return {"success": False, "error": "labels cannot be empty"}
    set_labels("disease", body.labels)
    logger.info("Disease labels updated to: %s", body.labels)
    return {"success": True, "labels": body.labels}


@app.put("/labels/sentiment")
def update_sentiment_labels(body: LabelsUpdate):
    from .models.classifier import set_labels
    if not body.labels:
        return {"success": False, "error": "labels cannot be empty"}
    set_labels("sentiment", body.labels)
    logger.info("Sentiment labels updated to: %s", body.labels)
    return {"success": True, "labels": body.labels}
