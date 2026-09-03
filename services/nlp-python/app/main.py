import logging
from typing import Optional

from fastapi import FastAPI, Body, HTTPException, status
from pydantic import BaseModel

from .schemas import AnalyzeRequest, AnalyzeResponse
from . import pipeline

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Disease NLP Service", version="0.3.0")


@app.on_event("startup")
def startup():
    from .config import (NLP_MODEL, load_keywords_from_db, load_outbreak_rules_from_db,
                          load_locations_from_db, load_credibility_from_db,
                          load_language_markers_from_db, load_extraction_rules_from_db,
                          load_language_models_from_db, load_who_disease_concepts_from_db)
    from .models.classifier import get_labels, classify
    logger.info("NLP service starting — model=%s labels=%s", NLP_MODEL, get_labels("disease"))
    load_keywords_from_db()
    load_who_disease_concepts_from_db()
    load_outbreak_rules_from_db()
    load_locations_from_db()
    load_credibility_from_db()
    load_language_markers_from_db()
    load_extraction_rules_from_db()
    load_language_models_from_db()
    try:
        from .translator import preload_local_model
        preload_local_model()
        logger.info("Local NLLB translation model preloaded")
    except Exception as e:
        logger.warning("Local translation preload failed; API fallback remains available: %s", e)
    if NLP_MODEL != "none":
        from .models.classifier import classify_disease, _get_pipe
        from .config import LANGUAGE_MODEL_MAP
        warmed: set[str] = set()
        try:
            classify_disease("warmup")
            warmed.add(NLP_MODEL)
            logger.info("Warmed up model: %s", NLP_MODEL)
        except Exception as e:
            logger.warning("Model warmup failed for '%s': %s", NLP_MODEL, e)
        for model_key in set(LANGUAGE_MODEL_MAP.values()):
            if model_key not in warmed:
                try:
                    _get_pipe(model_key)
                    warmed.add(model_key)
                    logger.info("Preloaded model: %s", model_key)
                except Exception as e:
                    logger.warning("Model preload failed for '%s': %s", model_key, e)


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
    try:
        return pipeline.run(payload)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to analyze payload: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"NLP analysis failed: {type(exc).__name__}: {str(exc)}",
        )


class ICD11ResolveRequest(BaseModel):
    text: str
    language: Optional[str] = "unknown"


@app.post("/icd11/resolve")
def resolve_icd11(payload: ICD11ResolveRequest):
    """Resolve an unseen disease from news text against WHO ICD-11 and persist to DB."""
    from .icd11 import resolve_and_learn_disease
    resolved = resolve_and_learn_disease(payload.text, language=payload.language or "unknown")
    if resolved:
        return {"success": True, "data": resolved}
    return {"success": False, "message": "No verified WHO ICD-11 concept resolved for the given text"}


@app.post("/reload")
def reload_runtime_data():
    """Reload DB-backed concepts, aliases, locations, and extraction rules."""
    from .config import (
        load_keywords_from_db, load_outbreak_rules_from_db, load_locations_from_db,
        load_credibility_from_db, load_language_markers_from_db,
        load_extraction_rules_from_db, load_language_models_from_db,
        load_who_disease_concepts_from_db,
    )
    load_keywords_from_db()
    load_who_disease_concepts_from_db()
    load_outbreak_rules_from_db()
    load_locations_from_db()
    load_credibility_from_db()
    load_language_markers_from_db()
    load_extraction_rules_from_db()
    load_language_models_from_db()
    from .models.classifier import refresh_labels_from_db
    refresh_labels_from_db()
    return {"status": "reloaded"}


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
