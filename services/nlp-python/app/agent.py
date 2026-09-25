"""Small provider-agnostic JSON agent client used by disease resolution.

The agent is deliberately a bounded helper.  It may extract terminology and
rank candidates, but it never gets to create an external ontology code; that decision stays
with the local disease-master validator.
"""

from __future__ import annotations

import json
import logging
import re
import urllib.request
import urllib.error
import hashlib
import threading
from typing import Any

from . import config

import time
from datetime import datetime, timezone

logger = logging.getLogger(__name__)
_PROVIDER_FAILURES: dict[str, float] = {}
_REQUEST_GATE = threading.BoundedSemaphore(config.AGENT_MAX_CONCURRENT_REQUESTS)
_REQUEST_RATE_LOCK = threading.Lock()
_LAST_REQUEST_AT = 0.0
_RESPONSE_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_RESPONSE_CACHE_LOCK = threading.Lock()
_DAILY_LOCK = threading.Lock()
_DAILY_COUNT = 0
_DAILY_STAMP = ""


def _utc_today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def remaining_daily_budget() -> int:
    """Calls remaining today. 0 or negative DEEPSEEK_DAILY_BUDGET is a kill switch."""
    budget = int(config.DEEPSEEK_DAILY_BUDGET)
    if budget <= 0:
        return 0
    global _DAILY_COUNT, _DAILY_STAMP
    today = _utc_today()
    with _DAILY_LOCK:
        if _DAILY_STAMP != today:
            _DAILY_STAMP = today
            _DAILY_COUNT = 0
        return max(0, budget - _DAILY_COUNT)


def _consume_daily_budget() -> bool:
    budget = int(config.DEEPSEEK_DAILY_BUDGET)
    if budget <= 0:
        return False
    global _DAILY_COUNT, _DAILY_STAMP
    today = _utc_today()
    with _DAILY_LOCK:
        if _DAILY_STAMP != today:
            _DAILY_STAMP = today
            _DAILY_COUNT = 0
        if _DAILY_COUNT >= budget:
            return False
        _DAILY_COUNT += 1
        return True


def _json_response(value: str) -> dict[str, Any]:
    if isinstance(value, list):
        value = "".join(
            str(item.get("text") or item.get("content") or "")
            if isinstance(item, dict) else str(item)
            for item in value
        )
    text = (value or "").strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.I)
    try:
        result = json.loads(text)
    except (TypeError, ValueError, json.JSONDecodeError):
        # Some compatible OpenAI endpoints wrap JSON in a short preamble.
        # Recover only a complete outer object; never attempt free-form repair.
        start, end = text.find("{"), text.rfind("}")
        if start < 0 or end <= start:
            return {}
        try:
            result = json.loads(text[start:end + 1])
        except (TypeError, ValueError, json.JSONDecodeError):
            return {}
    return result if isinstance(result, dict) else {}


def _providers() -> list[tuple[str, str, str, str]]:
    """Configured LLM providers: DeepSeek is the exclusive provider."""
    configured = {
        "deepseek": (config.DEEPSEEK_API_KEY, config.DEEPSEEK_BASE_URL, config.DEEPSEEK_MODEL),
    }
    order = [x.strip().lower() for x in config.AGENT_PROVIDER_ORDER.split(",") if x.strip() and x.strip().lower() == "deepseek"]
    providers: list[tuple[str, str, str, str]] = []
    seen: set[tuple[str, str, str]] = set()
    for name in order:
        key, base_url, model = configured.get(name, ("", "", ""))
        item = (key, base_url.rstrip("/"), model)
        if key and base_url and model and item not in seen:
            providers.append((name, *item))
            seen.add(item)
    return providers



def _cache_key(system_prompt: str, user_prompt: str, max_tokens: int) -> str:
    value = f"{max_tokens}\0{system_prompt}\0{user_prompt}".encode("utf-8")
    return hashlib.sha256(value).hexdigest()


def _cached_response(key: str) -> dict[str, Any] | None:
    if config.AGENT_RESPONSE_CACHE_TTL_SECONDS <= 0:
        return None
    now = time.time()
    with _RESPONSE_CACHE_LOCK:
        item = _RESPONSE_CACHE.get(key)
        if not item:
            return None
        expires_at, value = item
        if expires_at <= now:
            _RESPONSE_CACHE.pop(key, None)
            return None
        return dict(value)


def _store_response(key: str, value: dict[str, Any]) -> None:
    if config.AGENT_RESPONSE_CACHE_TTL_SECONDS <= 0:
        return
    with _RESPONSE_CACHE_LOCK:
        if len(_RESPONSE_CACHE) >= config.AGENT_RESPONSE_CACHE_SIZE:
            oldest = min(_RESPONSE_CACHE, key=lambda item: _RESPONSE_CACHE[item][0])
            _RESPONSE_CACHE.pop(oldest, None)
        _RESPONSE_CACHE[key] = (time.time() + config.AGENT_RESPONSE_CACHE_TTL_SECONDS, dict(value))


def _send_bounded(send):
    """Serialize optional LLM calls and enforce a small inter-request gap."""
    global _LAST_REQUEST_AT
    with _REQUEST_GATE:
        with _REQUEST_RATE_LOCK:
            delay = config.AGENT_MIN_INTERVAL_SECONDS - (time.monotonic() - _LAST_REQUEST_AT)
            if delay > 0:
                time.sleep(delay)
            _LAST_REQUEST_AT = time.monotonic()
        return send()


def _is_quota_failure(error: Exception, response_body: str = "") -> bool:
    """Identify provider failures that should be skipped for the rest of the day."""
    status = getattr(error, "code", None)
    if status in {401, 402, 403}:
        return True
    if status != 429:
        return False
    message = f"{error} {response_body}".casefold()
    return any(
        marker in message
        for marker in ("quota", "billing", "balance", "payment", "credit", "insufficient")
    )


def chat_json(system_prompt: str, user_prompt: str, max_tokens: int = 400) -> dict[str, Any]:
    """Ask configured agents in order and return the first valid JSON object."""
    if not config.AGENT_ENABLED:
        return {}
    cache_key = _cache_key(system_prompt, user_prompt, max_tokens)
    cached = _cached_response(cache_key)
    if cached is not None:
        return cached
    if remaining_daily_budget() <= 0:
        logger.info("DeepSeek daily budget exhausted or disabled; skipping LLM call")
        return {}
    now = time.time()
    for provider, api_key, base_url, model in _providers():
        if provider in _PROVIDER_FAILURES and now < _PROVIDER_FAILURES[provider]:
            continue
        url = base_url if base_url.endswith("/chat/completions") else f"{base_url}/chat/completions"
        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "response_format": {"type": "json_object"},
            "max_tokens": max_tokens,
            "temperature": 0,
        }

        def _send(payload_dict):
            req = urllib.request.Request(
                url,
                data=json.dumps(payload_dict).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "disease-surveillance-nlp/1.0",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=config.AGENT_TIMEOUT_SECONDS) as response:
                return json.loads(response.read())

        quota_failure = False
        try:
            if not _consume_daily_budget():
                return {}
            try:
                payload = _send_bounded(lambda: _send(body))
            except urllib.error.HTTPError as http_err:
                err_body = ""
                try:
                    err_body = http_err.read().decode("utf-8")
                except Exception:
                    pass
                quota_failure = _is_quota_failure(http_err, err_body)
                # Handle parameter incompatibility gracefully
                retried = False
                if http_err.code == 400:
                    if "temperature" in err_body and "temperature" in body:
                        body.pop("temperature", None)
                        retried = True
                    if "max_tokens" in err_body or "max_completion_tokens" in err_body:
                        current_key = "max_tokens" if "max_tokens" in body else "max_completion_tokens"
                        alt_key = "max_completion_tokens" if current_key == "max_tokens" else "max_tokens"
                        body.pop(current_key, None)
                        body[alt_key] = max_tokens
                        retried = True
                    if retried:
                        payload = _send_bounded(lambda: _send(body))
                    else:
                        raise
                else:
                    raise

            message = payload["choices"][0].get("message") or {}
            content = message.get("content") or ""
            if not content and isinstance(message.get("content"), list):
                content = message.get("content")
            if not content:
                content = message.get("reasoning_content") or payload.get("output_text") or ""
            usage = payload.get("usage") or {}
            logger.info(
                "DeepSeek usage provider=%s prompt_tokens=%s completion_tokens=%s total_tokens=%s",
                provider,
                usage.get("prompt_tokens"),
                usage.get("completion_tokens"),
                usage.get("total_tokens"),
            )
            result = _json_response(content)
            if result:
                result["_provider"] = provider
                _store_response(cache_key, result)
                return result
            logger.warning("Agent %s returned invalid/empty JSON preview=%s", provider, str(content)[:240])
        except Exception as exc:
            cooldown = (
                config.DEEPSEEK_QUOTA_COOLDOWN_SECONDS
                if quota_failure
                else config.DEEPSEEK_FAILURE_COOLDOWN_SECONDS
            )
            _PROVIDER_FAILURES[provider] = time.time() + cooldown
            reason = "quota/billing unavailable" if quota_failure else "transient failure"
            logger.warning(
                "Agent %s unavailable (%s); skipping provider for %ss: %s",
                provider,
                reason,
                cooldown,
                exc,
            )
    return {}
