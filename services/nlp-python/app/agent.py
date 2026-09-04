"""Small provider-agnostic JSON agent client used by disease resolution.

The agent is deliberately a bounded helper.  It may extract terminology and
rank candidates, but it never gets to create an ICD code; that decision stays
with the WHO ICD-11 API and the local database validator.
"""

from __future__ import annotations

import json
import logging
import re
import urllib.request
from typing import Any

from . import config

logger = logging.getLogger(__name__)


def _json_response(value: str) -> dict[str, Any]:
    text = (value or "").strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.I)
    try:
        result = json.loads(text)
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}
    return result if isinstance(result, dict) else {}


def _providers() -> list[tuple[str, str, str, str]]:
    configured = {
        "deepseek": (config.DEEPSEEK_API_KEY, config.DEEPSEEK_BASE_URL, config.DEEPSEEK_MODEL),
        "openai": (config.OPENAI_API_KEY, config.OPENAI_BASE_URL, config.OPENAI_MODEL),
    }
    order = [x.strip().lower() for x in config.AGENT_PROVIDER_ORDER.split(",") if x.strip()]
    providers: list[tuple[str, str, str, str]] = []
    seen: set[tuple[str, str, str]] = set()
    for name in order:
        key, base_url, model = configured.get(name, ("", "", ""))
        item = (key, base_url.rstrip("/"), model)
        if key and base_url and model and item not in seen:
            providers.append((name, *item))
            seen.add(item)
    return providers


def chat_json(system_prompt: str, user_prompt: str, max_tokens: int = 800) -> dict[str, Any]:
    """Ask configured agents in order and return the first valid JSON object."""
    if not config.AGENT_ENABLED:
        return {}
    body_base = {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }
    for provider, api_key, base_url, model in _providers():
        url = base_url if base_url.endswith("/chat/completions") else f"{base_url}/chat/completions"
        body = {**body_base, "model": model}
        # DeepSeek's OpenAI-compatible endpoint accepts the legacy field;
        # OpenAI's current Chat Completions reference uses the newer field.
        body["max_tokens" if provider == "deepseek" else "max_completion_tokens"] = max_tokens
        request = urllib.request.Request(
            url,
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "disease-surveillance-nlp/1.0",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=config.AGENT_TIMEOUT_SECONDS) as response:
                payload = json.loads(response.read())
            content = payload["choices"][0]["message"].get("content") or ""
            result = _json_response(content)
            if result:
                result["_provider"] = provider
                return result
            logger.warning("Agent %s returned invalid/empty JSON", provider)
        except Exception as exc:
            logger.warning("Agent %s failed; trying next provider: %s", provider, exc)
    return {}
