import logging
from typing import Optional
import os

# Cap BLAS/torch threads BEFORE any heavyweight import so interactive URL
# analysis cannot leave inter-op at the torch default (16) when the classifier
# is never imported.
for _k, _v in (
    ("OMP_NUM_THREADS", "2"),
    ("MKL_NUM_THREADS", "2"),
    ("OPENBLAS_NUM_THREADS", "2"),
    ("TORCH_NUM_THREADS", "2"),
    ("TORCH_NUM_INTEROP_THREADS", "2"),
    ("TOKENIZERS_PARALLELISM", "false"),
):
    os.environ.setdefault(_k, _v)

def _configure_torch_threads() -> None:
    """Always pin intra-op and inter-op; ignore double-init RuntimeError."""
    try:
        import torch
    except Exception as exc:  # pragma: no cover
        logging.getLogger(__name__).warning("torch unavailable for thread pin: %s", exc)
        return
    intra = int(os.environ.get("TORCH_NUM_THREADS", "2"))
    inter = int(os.environ.get("TORCH_NUM_INTEROP_THREADS", "2"))
    try:
        torch.set_num_threads(intra)
    except Exception as exc:
        logging.getLogger(__name__).warning("torch.set_num_threads(%s) failed: %s", intra, exc)
    try:
        torch.set_num_interop_threads(inter)
    except RuntimeError as exc:
        # Torch only allows one successful interop set per process.
        logging.getLogger(__name__).info(
            "torch.set_num_interop_threads(%s) skipped (already set): %s", inter, exc
        )
    except Exception as exc:
        logging.getLogger(__name__).warning(
            "torch.set_num_interop_threads(%s) failed: %s", inter, exc
        )

_configure_torch_threads()

from fastapi import FastAPI, Body, HTTPException, status
from pydantic import BaseModel

from .schemas import AnalyzeRequest, AnalyzeResponse
from .surveillance_extraction import SurveillanceOutput, surveillance_from_analysis
from . import pipeline

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

import threading

# One CPU-bound fine-tuned inference at a time. Extra requests wait rather than
# stacking torch threadpools that hang /health under load.
_INFERENCE_SEM = threading.Semaphore(max(1, int(os.getenv("NLP_INFERENCE_CONCURRENCY", "1"))))


app = FastAPI(title="Disease NLP Service", version="0.3.0")


def _full_pipeline_payload(payload: AnalyzeRequest) -> AnalyzeRequest:
    """Keep public production endpoints on one source-first NLP profile."""
    return payload.model_copy(update={"interactive": False, "rules_only": False})


@app.on_event("startup")
def startup():
    from .config import (NLP_MODEL, load_keywords_from_db, load_outbreak_rules_from_db,
                          load_locations_from_db, load_credibility_from_db,
                          load_language_markers_from_db, load_extraction_rules_from_db,
                          load_language_models_from_db, load_disease_master_from_db,
                          DISEASE_LABELS)
    logger.info("NLP service starting — model=%s fallback_labels=%d", NLP_MODEL, len(DISEASE_LABELS))
    load_keywords_from_db()
    load_disease_master_from_db()
    load_outbreak_rules_from_db()
    load_locations_from_db()
    load_credibility_from_db()
    load_language_markers_from_db()
    load_extraction_rules_from_db()
    load_language_models_from_db()
    try:
        from .translator import preload_local_model
        preload_local_model()
        logger.info(
            "NLLB translation provider=%s preload=%s model=%s (lazy loading remains default)",
            os.getenv("TRANSLATION_PROVIDER", "nllb"),
            os.getenv("TRANSLATION_PRELOAD", "false"),
            os.getenv("TRANSLATION_LOCAL_MODEL", "facebook/nllb-200-distilled-600M"),
        )
    except Exception as e:
        logger.warning("NLLB translation preload failed: %s", e)
    # Classifier and translation models remain lazy. Extraction and relation
    # intelligence can serve immediately, while a first model-backed request
    # pays the model-load cost in its own bounded request path. Warming here
    # made readiness depend on a heavyweight model that is not authoritative
    # for source-first surveillance extraction.


@app.get("/registry/audit")
def registry_audit_endpoint():
    """Fase 1: read-only registry counts, readiness, and sentinel checks."""
    from .registry_audit import registry_audit

    return registry_audit()


@app.get("/health")
def health():
    # Do not call classifier.get_labels() here: it refreshes labels through
    # backend-rust, while backend-rust itself waits for this health check.
    # Readiness must be local and non-blocking to avoid a startup deadlock.
    from .config import NLP_MODEL, DISEASE_LABELS
    return {
        "status": "ok",
        "service": "nlp-python",
        "model": NLP_MODEL,
        "disease_labels": list(DISEASE_LABELS),
    }


@app.post("/nlp/analyze", response_model=AnalyzeResponse)
def analyze(payload: AnalyzeRequest):
    try:
        with _INFERENCE_SEM:
            return pipeline.run(_full_pipeline_payload(payload))
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to analyze payload: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"NLP analysis failed: {type(exc).__name__}: {str(exc)}",
        )


@app.post("/nlp/analyze/raw", response_model=AnalyzeResponse)
def analyze_raw(payload: AnalyzeRequest):
    """Dedicated endpoint for raw news/unstructured text analysis."""
    try:
        with _INFERENCE_SEM:
            return pipeline.run(_full_pipeline_payload(payload))
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
        # Compatibility adapter for collector consumers. Extraction, relation
        # attribution, and event composition happen in the shared pipeline.
        return surveillance_from_analysis(pipeline.run(_full_pipeline_payload(payload)))
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


class DiseaseResolveRequest(BaseModel):
    text: str
    language: Optional[str] = "unknown"


class TranslationRequest(BaseModel):
    """Explicit background translation request.

    The normal analysis endpoints deliberately do not call this path. A
    queue/worker may use it for semantic enrichment after the source-first
    surveillance result has already been persisted.
    """

    text: str
    language: str = "unknown"
    max_chars: Optional[int] = None
    chunk_chars: Optional[int] = None
    max_chunks: Optional[int] = None


@app.post("/nlp/translate")
def translate_endpoint(payload: TranslationRequest):
    from .translator import translate_and_extract

    try:
        return translate_and_extract(
            payload.text,
            payload.language,
            max_chars=payload.max_chars,
            chunk_chars=payload.chunk_chars,
            max_chunks=payload.max_chunks,
            defer=False,
        )
    except Exception as exc:
        logger.exception("Explicit translation request failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Translation unavailable: {type(exc).__name__}",
        ) from exc


@app.post("/disease/resolve")
def resolve_disease(payload: DiseaseResolveRequest):
    """Resolve a disease term against the local database master."""
    from .disease_master import resolve_local_disease_term
    resolved = resolve_local_disease_term(payload.text)
    if resolved:
        return {"success": True, "data": resolved}
    return {"success": False, "message": "No local disease-master concept resolved for the given text"}


@app.post("/icd11/resolve", include_in_schema=False)
def resolve_legacy_disease(payload: DiseaseResolveRequest):
    """Compatibility alias for old clients; it never contacts an external API."""
    return resolve_disease(payload)


@app.post("/reload")
def reload_runtime_data():
    """Reload registry concepts, aliases, locations, and extraction rules from the app API."""
    from .config import (
        load_keywords_from_db, load_outbreak_rules_from_db, load_locations_from_db,
        load_credibility_from_db, load_language_markers_from_db,
        load_extraction_rules_from_db, load_language_models_from_db,
        load_disease_master_from_db,
    )
    load_keywords_from_db()
    load_disease_master_from_db()
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
    review_reason: Optional[str] = None
    evidence_offset_start: Optional[int] = None
    evidence_offset_end: Optional[int] = None
    prediction_version: Optional[str] = None
    review_action: Optional[str] = "corrected"


@app.post("/correct")
@app.post("/api/nlp/correct")
def submit_nlp_correction(payload: NLPCorrectionRequest):
    """Record a human correction without discarding the original prediction."""
    import psycopg
    from . import config
    try:
        conn = psycopg.connect(config.DATABASE_URL)
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO nlp_corrections (
                event_id, raw_report_id, field_name, original_value, 
                corrected_value, correction_source, text_snippet, language, corrected_by,
                review_reason, evidence_offset_start, evidence_offset_end,
                prediction_version, review_action, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW()) RETURNING id;""",
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
                payload.review_reason,
                payload.evidence_offset_start,
                payload.evidence_offset_end,
                payload.prediction_version,
                payload.review_action or "corrected",
            )
        )
        row = cur.fetchone()
        # The legacy correction trigger stores country edits in ``province``.
        # Keep the normalized country field authoritative for new review edits.
        if payload.field_name == "country":
            if payload.event_id:
                cur.execute(
                    "UPDATE disease_events SET source_country = %s WHERE id = %s",
                    (payload.corrected_value.strip(), payload.event_id),
                )
            elif payload.raw_report_id:
                cur.execute(
                    "UPDATE disease_events SET source_country = %s WHERE raw_report_id = %s",
                    (payload.corrected_value.strip(), payload.raw_report_id),
                )
        conn.commit()
        correction_id = str(row[0]) if row else None
        logger.info("Saved NLP correction %s: %s -> %s", correction_id, payload.field_name, payload.corrected_value)
        return {
            "status": "ok",
            "message": "Correction recorded with the original prediction and evidence context.",
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

        # Keep the review decision auditable even when no field value changed.
        cur.execute(
            """INSERT INTO nlp_corrections (
                event_id, raw_report_id, field_name, original_value,
                corrected_value, correction_source, text_snippet,
                corrected_by, review_reason, review_action, updated_at
            ) VALUES (%s, %s, 'review_status', %s, %s, 'review_ui', %s, %s, %s, %s, NOW())""",
            (
                payload.event_id or None,
                payload.raw_report_id or None,
                "needs_review" if not payload.reviewed else "reviewed",
                "reviewed" if payload.reviewed else "needs_review",
                payload.notes,
                payload.reviewed_by or "operator",
                payload.notes,
                "confirmed" if payload.reviewed else "reopened",
            ),
        )

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
