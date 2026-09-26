"""Load registry snapshots from the app HTTP API.

When ``NLP_SERVICE_URL`` is set, startup and ``/reload`` read registries from
the backend. When it is unset, or the API call fails, callers use Postgres.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request


def http_registry_enabled() -> bool:
    """Use the app API only when this process is wired into the shared stack.

    ``NLP_SERVICE_URL`` is the existing stack signal. It is not required, and
    this module does not set it. Unset means the direct database path.
    """
    return bool(os.getenv("NLP_SERVICE_URL", "").strip())


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


class RegistryApiError(RuntimeError):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


def request_json(method: str, path: str, body: dict | None = None) -> dict:
    """JSON request to the app API. Raises ``RegistryApiError`` on HTTP failure."""
    separator = "" if path.startswith("/") else "/"
    url = f"{app_api_base_url()}{separator}{path}"
    payload = None if body is None else json.dumps(body).encode("utf-8")
    headers = {"User-Agent": "nlp-service/1.0", "Accept": "application/json"}
    if payload is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=payload, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=_timeout_seconds()) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:300]
        raise RegistryApiError(
            f"registry API {method} {path} returned HTTP {exc.code}: {detail}",
            status=exc.code,
        ) from exc
    parsed = json.loads(raw) if raw else {}
    if not isinstance(parsed, dict):
        raise RegistryApiError(f"registry API {path} returned {type(parsed).__name__}")
    if parsed.get("success") is False:
        raise RegistryApiError(str(parsed.get("error") or f"registry API {path} failed"))
    return parsed


def query_db(sql: str, params: tuple = ()) -> list[dict]:
    from .config import DATABASE_URL
    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        return [dict(row) for row in conn.execute(sql, params).fetchall()]


def load_rows(path: str, sql: str, params: tuple = ()) -> list[dict]:
    """HTTP snapshot when the stack URL is set, otherwise the existing SQL."""
    if http_registry_enabled():
        try:
            return fetch_collection(path)
        except Exception as exc:
            logging.getLogger(__name__).warning(
                "Registry API %s failed, using database: %s", path, exc
            )
    return query_db(sql, params)
