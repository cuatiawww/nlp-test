"""Opt-in endpoint for interactive jobs only; legacy /nlp/analyze is unchanged."""
import logging
import os
import threading
import time
from fastapi import APIRouter, HTTPException
from . import config
from .schemas import AnalyzeRequest
from .stage_budget import bounded_call, remaining_inference_budget, GLOBAL_STAGE_TRACKER

logger = logging.getLogger(__name__)
router = APIRouter()
slots = threading.BoundedSemaphore(1)
TRANSLATION_STAGE_TIMEOUT_SECONDS = config.TRANSLATION_INTERACTIVE_TIMEOUT_SECONDS
INTERACTIVE_BUDGET_SECONDS = int(os.getenv("INTERACTIVE_STAGE_BUDGET_SECONDS", "30"))
STALE_JOB_TIMEOUT_SECONDS = int(os.getenv("STALE_JOB_TIMEOUT_SECONDS", "35"))


class BoundedRequest(AnalyzeRequest):
    rules_only: bool = False


def translate_stage(text):
    from .extractors import detect_language
    from .translator import translate_and_extract
    return translate_and_extract(
        text,
        detect_language(text),
        max_chars=config.TRANSLATION_INTERACTIVE_MAX_CHARS,
        chunk_chars=config.TRANSLATION_INTERACTIVE_CHUNK_CHARS,
        max_chunks=config.TRANSLATION_INTERACTIVE_MAX_CHUNKS,
    )


def inference_stage(payload, translation, rules_only):
    from . import config, pipeline
    orig_translate = pipeline.translate_and_extract
    orig_model = config.NLP_MODEL
    orig_agent = config.AGENT_ENABLED
    try:
        pipeline.translate_and_extract = lambda text, language: translation
        if rules_only or payload.get("interactive"):
            config.NLP_MODEL = "none"
            config.AGENT_ENABLED = False
            # Cap before pipeline so forked workers never see the full crawl.
            text = str(payload.get("text") or "")
            limit = int(getattr(config, "INTERACTIVE_ANALYSIS_MAX_CHARS", 6000) or 6000)
            if len(text) > limit:
                payload = dict(payload)
                cut = text[:limit]
                for sep in (". ", "\n\n", "\n", " "):
                    pos = cut.rfind(sep)
                    if pos >= max(800, limit // 3):
                        cut = cut[: pos + len(sep)].strip()
                        break
                payload["text"] = cut
                logger.info(
                    "bounded_interactive_text_cap chars_before=%s chars_after=%s",
                    len(text),
                    len(cut),
                )
        started = time.monotonic()
        result = pipeline.run(AnalyzeRequest(**payload)).model_dump()
        logger.info(
            "bounded_inference_stage_seconds=%.3f interactive=%s rules_only=%s text_chars=%s",
            time.monotonic() - started,
            bool(payload.get("interactive")),
            bool(rules_only),
            len(str(payload.get("text") or "")),
        )
        return result
    finally:
        pipeline.translate_and_extract = orig_translate
        config.NLP_MODEL = orig_model
        config.AGENT_ENABLED = orig_agent


@router.post("/nlp/analyze-bounded")
def analyze_bounded(payload: BoundedRequest):
    acquired = slots.acquire(blocking=False)
    if not acquired:
        if GLOBAL_STAGE_TRACKER.recover_if_stale(STALE_JOB_TIMEOUT_SECONDS):
            logger.warning("Recovered stale interactive NLP job; resetting semaphore slot")
            try:
                slots.release()
            except ValueError:
                pass
            acquired = slots.acquire(blocking=False)
        if not acquired:
            raise HTTPException(503, "Interactive NLP is busy; retry later")
    warnings = []
    translation = {
        "translated": False,
        "translated_text": "",
        "structured": {},
        "provider": "none",
        "translation_status": "deferred",
    }
    started = time.monotonic()
    job_id = f"url-{int(time.time() * 1000)}"
    try:
        if not payload.rules_only:
            try:
                from .extractors import detect_language
                from .translator import _hash, _cached
                lang = detect_language(payload.text)
                cached = _cached(_hash(payload.text, lang))
                if cached:
                    translation = {
                        "translated": True,
                        "provider": f"{cached['provider']}-cache",
                        "translation_status": "completed",
                        "translated_text": cached["translated_text"],
                        "structured": cached["structured_result"],
                    }
            except Exception as e:
                logger.debug("Cached translation lookup skipped: %s", e)

        inference_budget = min(
            INTERACTIVE_BUDGET_SECONDS,
            max(
                5,
                remaining_inference_budget(
                    time.monotonic() - started,
                    INTERACTIVE_BUDGET_SECONDS,
                    overhead=2,
                ),
            ),
        )
        try:
            result = bounded_call(
                inference_stage,
                (payload.model_dump(), translation, payload.rules_only),
                inference_budget,
                isolation="process",
                job_id=job_id,
            )
        except TimeoutError as exc:
            logger.warning("Inference stage timed out after %ss: %s", inference_budget, exc)
            raise HTTPException(
                408,
                f"NLP stage exceeded budget ({inference_budget}s)",
            ) from exc
        except Exception as exc:
            logger.warning("Inference stage failed: %s", exc)
            raise HTTPException(503, f"NLP stage exceeded budget or failed: {exc}")
        result["stage_warnings"] = warnings
        result.pop("outbreak_alert", None)
        result.pop("severity", None)
        return result
    finally:
        GLOBAL_STAGE_TRACKER.clear_active()
        try:
            slots.release()
        except ValueError:
            pass
