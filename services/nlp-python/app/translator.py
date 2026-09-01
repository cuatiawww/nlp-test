import hashlib
import json
import logging
import os
from functools import lru_cache
from threading import Lock
from typing import Any

from . import config

logger = logging.getLogger(__name__)
LATIN_LANGS = {"id", "ms", "en", "vi", "tl", "fr", "es", "de", "pt"}
_translation_lock = Lock()


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
    response = requests.post(
        "https://api.deepseek.com/chat/completions",
        headers={"Authorization": f"Bearer {config.DEEPSEEK_API_KEY}"},
        json={
            "model": os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
            "messages": [{"role": "user", "content": (
                "Translate this ASEAN health article to concise English and extract facts. "
                "Return JSON only with translated_text, diseases(array), locations(array of "
                "{original,latin_name,country}), case_count, death_count, event_type, "
                "is_health_related. Use null when absent; never invent facts. Source language: "
                f"{lang}. Article:\n{text[:limit]}"
            )}],
            "response_format": {"type": "json_object"}, "temperature": 0,
            "max_tokens": int(os.getenv("TRANSLATION_MAX_TOKENS", "1800")),
        }, timeout=45,
    )
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
        # Translate opening informative content (max 1800 chars / ~2 chunks) for fast low-latency inference
        max_chars = int(os.getenv("TRANSLATION_MAX_CHARS", "1800"))
        lead_text = text[:max_chars]
        chunks = [lead_text[i:i + 900] for i in range(0, len(lead_text), 900)]
        translated = []
        for chunk in chunks:
            inputs = tokenizer(chunk, return_tensors="pt", truncation=True, max_length=256)
            output = model.generate(**inputs, forced_bos_token_id=tokenizer.convert_tokens_to_ids("eng_Latn"), max_new_tokens=256)
            translated.append(tokenizer.batch_decode(output, skip_special_tokens=True)[0])
    return {"translated_text": " ".join(translated)}


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
