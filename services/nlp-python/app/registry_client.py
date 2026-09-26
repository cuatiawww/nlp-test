"""Load registry snapshots from the app HTTP API.

Startup and `/reload` use these collections instead of opening Postgres.
The in-memory maps in ``config`` stay the cache after a successful fetch.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request


def app_api_base_url() -> str:
    """Resolve the backend that already serves ``/api/v1/*`` registry routes.

    ``APP_API_BASE_URL`` is an optional override. Otherwise reuse the URL the
    classifier already uses, then the internal API URL already set for this
    deployment, then the compose hostname the classifier defaults to.
    """
    for key in ("APP_API_BASE_URL", "BACKEND_LABELS_URL", "API_INTERNAL_URL"):
        value = os.getenv(key, "").strip()
        if value:
            return value.rstrip("/")
    return "http://backend-rust:8080"


def _timeout_seconds() -> float:
    raw = os.getenv("REGISTRY_API_TIMEOUT_SECONDS", "30").strip()
    try:
        return max(1.0, float(raw))
    except ValueError:
        return 30.0


def fetch_collection(path: str) -> list[dict]:
    """GET one registry collection and return its ``data`` rows."""
    separator = "" if path.startswith("/") else "/"
    url = f"{app_api_base_url()}{separator}{path}"
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "nlp-service/1.0", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=_timeout_seconds()) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"registry API {path} returned HTTP {exc.code}: {detail}") from exc

    if isinstance(payload, list):
        data = payload
    elif isinstance(payload, dict):
        if payload.get("success") is False:
            raise RuntimeError(str(payload.get("error") or f"registry API {path} failed"))
        data = payload.get("data", [])
    else:
        raise ValueError(f"registry API {path} returned {type(payload).__name__}")
    if not isinstance(data, list):
        raise ValueError(f"registry API {path} returned a non-list data field")
    return [item for item in data if isinstance(item, dict)]
