"""Opt-in endpoint for interactive jobs only; legacy /nlp/analyze is unchanged."""
import logging
import threading
from fastapi import APIRouter, HTTPException
from .schemas import AnalyzeRequest
from .stage_budget import bounded_call

logger = logging.getLogger(__name__)
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
    orig_translate = pipeline.translate_and_extract
    orig_model = config.NLP_MODEL
    orig_agent = config.AGENT_ENABLED
    orig_who_disc = config.WHO_DISCOVERY_ENABLED
    orig_who_res = config.WHO_TERM_RESOLUTION_ENABLED
    try:
        pipeline.translate_and_extract = lambda text, language: translation
        if rules_only:
            config.NLP_MODEL = "none"
            config.AGENT_ENABLED = False
            config.WHO_DISCOVERY_ENABLED = False
            config.WHO_TERM_RESOLUTION_ENABLED = False
        return pipeline.run(AnalyzeRequest(**payload)).model_dump()
    finally:
        pipeline.translate_and_extract = orig_translate
        config.NLP_MODEL = orig_model
        config.AGENT_ENABLED = orig_agent
        config.WHO_DISCOVERY_ENABLED = orig_who_disc
        config.WHO_TERM_RESOLUTION_ENABLED = orig_who_res

@router.post("/nlp/analyze-bounded")
def analyze_bounded(payload: BoundedRequest):
    if not slots.acquire(blocking=False):
        raise HTTPException(503, "Interactive NLP is busy; retry later")
    warnings = []
    translation = {"translated": False, "translated_text": "", "structured": {}, "provider": "none"}
    try:
        if not payload.rules_only:
            try:
                translation = bounded_call(translate_stage, (payload.text,), 12)
            except Exception as e:
                logger.warning("Translation stage failed or timed out: %s", e)
                warnings.append("Translation unavailable within 12s; original text used")
        try:
            result = bounded_call(inference_stage,
                (payload.model_dump(), translation, payload.rules_only), 30)
        except Exception as exc:
            logger.warning("Inference stage failed: %s", exc)
            raise HTTPException(503, f"NLP stage exceeded budget or failed: {exc}")
        result["stage_warnings"] = warnings
        return result
    finally:
        slots.release()
