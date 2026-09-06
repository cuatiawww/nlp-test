"""Opt-in endpoint for interactive jobs only; legacy /nlp/analyze is unchanged."""
import threading
from fastapi import APIRouter, HTTPException
from .schemas import AnalyzeRequest
from .stage_budget import bounded_call
router = APIRouter()
slots = threading.BoundedSemaphore(1)

class BoundedRequest(AnalyzeRequest):
    rules_only: bool = False

def translate_stage(text):
    from .extractors import detect_language
    from .translator import translate_and_extract
    return translate_and_extract(text, detect_language(text))

def inference_stage(payload, translation, rules_only):
    from . import config, pipeline
    # These assignments affect only this spawned process, never the shared API.
    pipeline.translate_and_extract = lambda text, language: translation
    if rules_only:
        config.NLP_MODEL = "none"
        config.AGENT_ENABLED = False
        config.WHO_DISCOVERY_ENABLED = False
        config.WHO_TERM_RESOLUTION_ENABLED = False
    config.load_keywords_from_db()
    config.load_who_disease_concepts_from_db()
    config.load_locations_from_db()
    config.load_outbreak_rules_from_db()
    config.load_credibility_from_db()
    return pipeline.run(AnalyzeRequest(**payload)).model_dump()

@router.post("/nlp/analyze-bounded")
def analyze_bounded(payload: BoundedRequest):
    if not slots.acquire(blocking=False):
        raise HTTPException(503, "Interactive NLP is busy; retry later")
    warnings = []
    translation = {"translated": False, "translated_text": "", "structured": {}, "provider": "none"}
    try:
        if not payload.rules_only:
            try:
                translation = bounded_call(translate_stage, (payload.text,), 6)
            except Exception:
                warnings.append("Translation unavailable within 6s; original text used")
        try:
            result = bounded_call(inference_stage,
                (payload.model_dump(), translation, payload.rules_only), 14)
        except Exception:
            raise HTTPException(503, "NLP stage exceeded budget or failed")
        result["stage_warnings"] = warnings
        return result
    finally:
        slots.release()
