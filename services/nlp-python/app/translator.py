import hashlib
import json
import logging
import os
import threading
import time
from functools import lru_cache
from threading import Lock
from typing import Any

from . import config

logger = logging.getLogger(__name__)
LATIN_LANGS = {"id", "ms", "en", "vi", "tl", "fr", "es", "de", "pt"}
_translation_lock = Lock()
_remote_translation_gate = threading.BoundedSemaphore(1)
_remote_translation_state_lock = Lock()
_remote_translation_cooldown_until = 0.0


def _remote_post(url: str, headers: dict[str, str], body: dict[str, Any]):
    """Bound remote translation traffic and pause after provider throttling."""
    global _remote_translation_cooldown_until
    with _remote_translation_gate:
        with _remote_translation_state_lock:
            if time.time() < _remote_translation_cooldown_until:
                return None
        import requests
        response = requests.post(url, headers=headers, json=body, timeout=30)
        if response.status_code == 429:
            with _remote_translation_state_lock:
                _remote_translation_cooldown_until = time.time() + 120
        return response


def _hash(text: str, lang: str) -> str:
    return hashlib.sha256(f"v1\0{lang}\0{text}".encode()).hexdigest()


def _cached(key: str):
    try:
        import psycopg
        from psycopg.rows import dict_row
        with psycopg.connect(config.DATABASE_URL, row_factory=dict_row) as conn:
            row = conn.execute(
                "UPDATE translation_cache SET last_used_at=NOW() WHERE content_hash=%s "
                "RETURNING source_language,provider,translated_text,structured_result", (key,)
            ).fetchone()
        return dict(row) if row else None
    except Exception as exc:
        logger.warning("Translation cache read failed: %s", exc)
        return None


def _store(key: str, lang: str, provider: str, translated: str, structured: dict):
    try:
        import psycopg
        with psycopg.connect(config.DATABASE_URL) as conn:
            conn.execute(
                "INSERT INTO translation_cache(content_hash,source_language,provider,translated_text,structured_result) "
                "VALUES(%s,%s,%s,%s,%s::jsonb) ON CONFLICT(content_hash) DO UPDATE SET "
                "last_used_at=NOW()", (key, lang, provider, translated, json.dumps(structured))
            )
    except Exception as exc:
        logger.warning("Translation cache write failed: %s", exc)


def _deepseek(text: str, lang: str):
    if not config.DEEPSEEK_API_KEY:
        return None
    import requests
    limit = int(os.getenv("TRANSLATION_MAX_CHARS", "7000"))
    base = config.DEEPSEEK_BASE_URL.rstrip("/")
    url = f"{base}/chat/completions" if not base.endswith("/chat/completions") else base
    model = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
    is_openai = "api.openai.com" in base.lower() or model.lower().startswith(("gpt-", "o1", "o3", "chatgpt"))
    tok_key = "max_completion_tokens" if is_openai else "max_tokens"
    max_tok = int(os.getenv("TRANSLATION_MAX_TOKENS", "1800"))
    body = {
        "model": model,
        "messages": [{"role": "user", "content": (
            "Translate this ASEAN health article to concise English and extract facts. "
            "Return JSON only with translated_text, diseases(array), locations(array of "
            "{original,latin_name,country}), case_count, death_count, event_type, "
            "is_health_related. Use null when absent; never invent facts. Source language: "
            f"{lang}. Article:\n{text[:limit]}"
        )}],
        "response_format": {"type": "json_object"},
        tok_key: max_tok,
    }
    if not is_openai:
        body["temperature"] = 0

    headers = {"Authorization": f"Bearer {config.DEEPSEEK_API_KEY}", "Content-Type": "application/json"}
    response = _remote_post(url, headers, body)
    if response is None:
        return None
    if not response.ok and response.status_code == 400 and ("max_tokens" in response.text or "max_completion_tokens" in response.text or "temperature" in response.text):
        if "temperature" in response.text:
            body.pop("temperature", None)
        if "max_tokens" in response.text or "max_completion_tokens" in response.text:
            alt_key = "max_completion_tokens" if tok_key == "max_tokens" else "max_tokens"
            body.pop(tok_key, None)
            body[alt_key] = max_tok
        response = _remote_post(url, headers, body)
        if response is None:
            return None
    response.raise_for_status()
    return json.loads(response.json()["choices"][0]["message"]["content"])


@lru_cache(maxsize=1)
def _local_model():
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
    model_name = os.getenv("TRANSLATION_LOCAL_MODEL", "facebook/nllb-200-distilled-600M")
    return AutoTokenizer.from_pretrained(model_name), AutoModelForSeq2SeqLM.from_pretrained(model_name)


def _local(text: str, lang: str):
    if os.getenv("TRANSLATION_LOCAL_ENABLED", "true").lower() != "true":
        return None
    codes = {
        "vi": "vie_Latn", "th": "tha_Thai", "my": "mya_Mymr", "km": "khm_Khmr", "lo": "lao_Laoo",
        "zh-cn": "zho_Hans", "zh-tw": "zho_Hant", "zh": "zho_Hans",
        "ja": "jpn_Jpan", "ko": "kor_Hang", "ar": "arb_Arab",
        "hi": "hin_Deva", "bn": "ben_Beng",
        "ru": "rus_Cyrl", "uk": "ukr_Cyrl", "bg": "bul_Cyrl",
        "el": "ell_Grek", "he": "heb_Hebr", "fa": "pes_Arab",
        "ur": "urd_Arab", "ta": "tam_Taml", "te": "tel_Telu",
        "si": "sin_Sinh", "ne": "npi_Deva", "gu": "guj_Gujr",
        "pa": "pan_Guru", "ka": "kat_Geor", "hy": "hye_Armn",
    }
    if lang not in codes:
        return None
    with _translation_lock:
        tokenizer, model = _local_model()
        tokenizer.src_lang = codes[lang]
        # Translate opening informative content (max 500 chars) for fast low-latency inference on CPU
        max_chars = min(int(os.getenv("TRANSLATION_MAX_CHARS", "500")), 500)
        lead_text = text[:max_chars].strip()
        if not lead_text:
            return {"translated_text": ""}
        inputs = tokenizer(lead_text, return_tensors="pt", truncation=True, max_length=128)
        output = model.generate(**inputs, forced_bos_token_id=tokenizer.convert_tokens_to_ids("eng_Latn"), max_new_tokens=128)
        translated_str = tokenizer.batch_decode(output, skip_special_tokens=True)[0]
    return {"translated_text": translated_str}


def translate_and_extract(text: str, lang: str) -> dict[str, Any]:
    if lang in LATIN_LANGS:
        return {"translated": False, "provider": "none", "translated_text": "", "structured": {}}
    key = _hash(text, lang)
    cached = _cached(key)
    if cached:
        return {"translated": True, "provider": f"{cached['provider']}-cache", "translated_text": cached["translated_text"], "structured": cached["structured_result"]}
    try:
        data = _local(text, lang)
        provider = "nllb-local"
        if not data:
            data, provider = _deepseek(text, lang), "deepseek"
        if not data:
            return {"translated": False, "provider": "unavailable", "translated_text": "", "structured": {}}
        translated = str(data.get("translated_text") or "").strip()
        structured = {k: v for k, v in data.items() if k != "translated_text"}
        if translated:
            _store(key, lang, provider, translated, structured)
        return {"translated": bool(translated), "provider": provider, "translated_text": translated, "structured": structured}
    except Exception as exc:
        logger.warning("Translation failed: %s", exc)
        return {"translated": False, "provider": "failed", "translated_text": "", "structured": {}}


def preload_local_model():
    """Download/load NLLB during service startup, before accepting requests."""
    if os.getenv("TRANSLATION_LOCAL_ENABLED", "true").lower() == "true":
        _local_model()
