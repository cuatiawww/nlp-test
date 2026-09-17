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


@app.post("/nlp/process/skdr", response_model=None)
def process_skdr_endpoint(_payload: AnalyzeRequest):
    """SKDR IBS/EBS processing is detached until a later reattach."""
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="SKDR IBS and EBS integrations are detached and will be reattached later",
    )


@app.post("/nlp/analyze/url")
def analyze_url_endpoint(payload: AnalyzeRequest):
    """Dedicated endpoint for on-demand interactive URL analysis."""
    from .bounded_analysis import analyze_bounded
    from .schemas import as_interactive
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


class NLPCorrectionRequest(BaseModel):
    event_id: Optional[str] = None
    raw_report_id: Optional[str] = None
    field_name: str
    original_value: Optional[str] = None
    corrected_value: str
    correction_source: Optional[str] = "user_ui"
    text_snippet: Optional[str] = None
    language: Optional[str] = None
    corrected_by: Optional[str] = "operator"


@app.post("/correct")
@app.post("/api/nlp/correct")
def submit_nlp_correction(payload: NLPCorrectionRequest):
    """Save user correction to nlp_corrections and boost training example confidence to 1.0."""
    import psycopg
    from . import config
    try:
        conn = psycopg.connect(config.DATABASE_URL)
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO nlp_corrections (
                event_id, raw_report_id, field_name, original_value, 
                corrected_value, correction_source, text_snippet, language, corrected_by
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id;""",
            (
                payload.event_id if payload.event_id else None,
                payload.raw_report_id if payload.raw_report_id else None,
                payload.field_name,
                payload.original_value,
                payload.corrected_value,
                payload.correction_source or "user_ui",
                payload.text_snippet,
                payload.language,
                payload.corrected_by or "operator",
            )
        )
        row = cur.fetchone()
        conn.commit()
        correction_id = str(row[0]) if row else None
        logger.info("Saved NLP correction %s: %s -> %s", correction_id, payload.field_name, payload.corrected_value)
        return {
            "status": "ok",
            "message": "Correction recorded and applied to continuous learning loop.",
            "correction_id": correction_id,
        }
    except Exception as e:
        logger.error("Failed to save correction: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


class MarkReviewedRequest(BaseModel):
    event_id: Optional[str] = None
    raw_report_id: Optional[str] = None
    reviewed: bool = True
    reviewed_by: Optional[str] = "operator"
    notes: Optional[str] = None


@app.post("/mark-reviewed")
@app.post("/api/nlp/mark-reviewed")
@app.post("/nlp/mark-reviewed")
def mark_article_reviewed(payload: MarkReviewedRequest):
    """Mark an article / disease event as reviewed or unreviewed."""
    import psycopg
    from . import config
    try:
        conn = psycopg.connect(config.DATABASE_URL)
        cur = conn.cursor()
        needs_review_val = not payload.reviewed
        status_val = "reviewed" if payload.reviewed else "processed"
        
        updated_events = 0
        updated_reports = 0

        if payload.event_id:
            cur.execute(
                "UPDATE disease_events SET needs_review = %s WHERE id = %s",
                (needs_review_val, payload.event_id)
            )
            updated_events += cur.rowcount

        if payload.raw_report_id:
            cur.execute(
                "UPDATE disease_events SET needs_review = %s WHERE raw_report_id = %s",
                (needs_review_val, payload.raw_report_id)
            )
            updated_events += cur.rowcount
            cur.execute(
                "UPDATE raw_reports SET processing_status = %s WHERE id = %s",
                (status_val, payload.raw_report_id)
            )
            updated_reports += cur.rowcount

        conn.commit()
        conn.close()
        logger.info(
            "Marked article reviewed=%s for event_id=%s, raw_report_id=%s (events=%d, reports=%d)",
            payload.reviewed, payload.event_id, payload.raw_report_id, updated_events, updated_reports
        )
        return {
            "status": "ok",
            "message": "Article review status updated successfully.",
            "reviewed": payload.reviewed,
            "needs_review": needs_review_val,
            "event_id": payload.event_id,
            "raw_report_id": payload.raw_report_id,
        }
    except Exception as e:
        logger.error("Failed to update review status: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/export-dataset")
@app.get("/api/nlp/export-dataset")
def export_training_dataset(limit: int = 5000):
    """Export training data for Google Colab fine-tuning, prioritizing human corrections."""
    import psycopg
    from psycopg.rows import dict_row
    from . import config
    try:
        conn = psycopg.connect(config.DATABASE_URL, row_factory=dict_row)
        cur = conn.cursor()
        cur.execute(
            """SELECT id, text, disease_label, case_count, death_count, confidence, source, language
               FROM nlp_training_examples
               WHERE text IS NOT NULL AND length(text) > 20
               ORDER BY (CASE WHEN source = 'human_corrected' THEN 1 ELSE 2 END), confidence DESC, created_at DESC
               LIMIT %s;""",
            (limit,)
        )
        rows = cur.fetchall()
        # Convert UUID to str
        for r in rows:
            if r.get("id"):
                r["id"] = str(r["id"])
        return {
            "total_examples": len(rows),
            "human_corrected_count": sum(1 for r in rows if r["source"] == "human_corrected"),
            "data": rows,
        }
    except Exception as e:
        logger.error("Failed to export dataset: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
