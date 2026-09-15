import logging
from typing import Optional

from fastapi import FastAPI, Body, HTTPException, status
from pydantic import BaseModel

from .schemas import AnalyzeRequest, AnalyzeResponse
from .surveillance_extraction import SurveillanceOutput, build_surveillance_output
from . import pipeline

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Disease NLP Service", version="0.3.0")
from .bounded_analysis import router as bounded_analysis_router
app.include_router(bounded_analysis_router)


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


@app.post(
    "/nlp/analyze/raw",
    response_model=AnalyzeResponse,
    response_model_exclude={"outbreak_alert"},
)
def analyze_raw(payload: AnalyzeRequest):
    """Dedicated endpoint for raw news/unstructured text analysis."""
    try:
        return pipeline.run(payload)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to analyze raw payload: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Raw NLP analysis failed: {type(exc).__name__}: {str(exc)}",
        )


@app.post(
    "/nlp/analyze/surveillance",
    response_model=SurveillanceOutput,
    response_model_exclude_none=True,
)
def analyze_surveillance(payload: AnalyzeRequest):
    """Return the strict country/metric surveillance contract.

    The legacy endpoint remains available for existing workers. This endpoint
    is intended for outbreak-news consumers that need one JSON shape for all
    multi-country articles.
    """
    try:
        return build_surveillance_output(
            payload.text,
            published_at=payload.published_at,
            source_name=payload.source_name,
            source_type=payload.source_type,
            source_url=payload.source_url,
        )
    except Exception as exc:
        logger.exception("Failed to build structured surveillance output: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Structured surveillance extraction failed: {type(exc).__name__}: {str(exc)}",
        )


@app.post("/nlp/process/skdr", response_model=AnalyzeResponse)
def process_skdr_endpoint(payload: AnalyzeRequest):
    """Dedicated, high-efficiency endpoint for SKDR surveillance reports."""
    from .skdr_processor import process_skdr
    try:
        return process_skdr(payload)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to process SKDR payload: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"SKDR processing failed: {type(exc).__name__}: {str(exc)}",
        )


@app.post("/nlp/analyze/url")
def analyze_url_endpoint(payload: AnalyzeRequest):
    """Dedicated endpoint for on-demand interactive URL analysis."""
    from .bounded_analysis import analyze_bounded, as_interactive
    try:
        # Keep the URL endpoint isolated from the bulk pipeline while still
        # allowing the worker's bounded rules-only fallback after an NLP error.
        return analyze_bounded(as_interactive(payload))
    except HTTPException:
        raise
    except TimeoutError as exc:
        logger.warning("URL NLP analysis timed out: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_408_REQUEST_TIMEOUT,
            detail="URL NLP analysis timed out",
        ) from exc
    except Exception as exc:
        logger.exception("Failed to analyze URL payload: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"URL NLP analysis failed: {type(exc).__name__}: {str(exc)}",
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
