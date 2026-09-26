"""HTTP shims for operator correction, review, and training export.

When ``NLP_SERVICE_URL`` is unset or the call fails, these return None so the
caller keeps the existing Postgres path.
"""

from __future__ import annotations

import logging

from .registry_client import http_registry_enabled, request_json

logger = logging.getLogger(__name__)


def post_correction(payload: dict) -> dict | None:
    if not http_registry_enabled():
        return None
    try:
        result = request_json("POST", "/api/v1/nlp-corrections", payload)
    except Exception as exc:
        logger.warning("NLP correction API failed, using database: %s", exc)
        return None
    data = result.get("data") if isinstance(result.get("data"), dict) else {}
    return {
        "status": "ok",
        "message": "Correction recorded with the original prediction and evidence context.",
        "correction_id": data.get("correction_id") or data.get("id"),
    }


def post_review(payload: dict) -> dict | None:
    if not http_registry_enabled():
        return None
    try:
        result = request_json("POST", "/api/v1/nlp/reviews", payload)
    except Exception as exc:
        logger.warning("NLP review API failed, using database: %s", exc)
        return None
    data = result.get("data") if isinstance(result.get("data"), dict) else {}
    reviewed = data.get("reviewed", payload.get("reviewed", True))
    return {
        "status": "ok",
        "message": "Article review status updated successfully.",
        "reviewed": reviewed,
        "needs_review": data.get("needs_review", not reviewed),
        "event_id": data.get("event_id", payload.get("event_id")),
        "raw_report_id": data.get("raw_report_id", payload.get("raw_report_id")),
    }


def get_training_export(limit: int) -> dict | None:
    if not http_registry_enabled():
        return None
    bounded = max(1, min(int(limit), 20000))
    try:
        result = request_json("GET", f"/api/v1/nlp-training-examples?limit={bounded}")
    except Exception as exc:
        logger.warning("Training export API failed, using database: %s", exc)
        return None
    data = result.get("data")
    return data if isinstance(data, dict) else None
