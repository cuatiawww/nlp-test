import hashlib
import json
import logging
import os
import re
from functools import lru_cache
from pathlib import Path
from threading import Lock
from typing import Any

from . import config

logger = logging.getLogger(__name__)
NO_TRANSLATION_LANGS = {"en"}
_translation_lock = Lock()


def _no_translation_result(provider: str = "none", status: str = "not_required") -> dict[str, Any]:
    return {
        "translated": False,
        "provider": provider,
        "translation_status": status,
        "translated_text": "",
        "structured": {},
    }


def _deferred_translation_result(lang: str) -> dict[str, Any]:
    """Describe enrichment that will run outside the extraction request."""
    return {
        "translated": False,
        "provider": "nllb-async",
        "translation_status": "pending",
        "translated_text": "",
        "structured": {"source_language": lang},
    }


def _hash(text: str, lang: str) -> str:
    return hashlib.sha256(f"v2-chunked\0{lang}\0{text}".encode()).hexdigest()


def _cached(key: str):
    try:
        import psycopg
        from psycopg.rows import dict_row

        with psycopg.connect(config.DATABASE_URL, row_factory=dict_row) as conn:
            row = conn.execute(
                "UPDATE translation_cache SET last_used_at=NOW() WHERE content_hash=%s "
                "RETURNING source_language,provider,translated_text,structured_result",
                (key,),
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
                "last_used_at=NOW()",
                (key, lang, provider, translated, json.dumps(structured)),
            )
    except Exception as exc:
        logger.warning("Translation cache write failed: %s", exc)


@lru_cache(maxsize=1)
def _nllb_model():
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

    model_name = os.getenv("TRANSLATION_LOCAL_MODEL", "facebook/nllb-200-distilled-600M")
    model_path = _resolve_cached_model_path(model_name)
    load_kwargs = {"local_files_only": True} if model_path != model_name else {}
    return (
        AutoTokenizer.from_pretrained(model_path, **load_kwargs),
        AutoModelForSeq2SeqLM.from_pretrained(model_path, **load_kwargs),
    )


def _resolve_cached_model_path(model_name: str) -> str:
    """Use an existing local HF snapshot when the cache layout is legacy."""
    candidate = Path(model_name)
    if candidate.is_dir():
        return str(candidate)
    if "/" not in model_name:
        return model_name

    cache_roots = []
    for value in (os.getenv("HF_HUB_CACHE"), os.getenv("HF_HOME"), os.getenv("TRANSFORMERS_CACHE")):
        if value and value not in cache_roots:
            cache_roots.append(value)
    for root_value in cache_roots:
        repo_dir = Path(root_value) / ("models--" + model_name.replace("/", "--"))
        snapshot_root = repo_dir / "snapshots"
        if not snapshot_root.is_dir():
            continue
        snapshots = sorted(snapshot_root.iterdir(), key=lambda item: item.stat().st_mtime, reverse=True)
        for snapshot in snapshots:
            if (snapshot / "config.json").is_file() and any(
                (snapshot / filename).is_file()
                for filename in ("pytorch_model.bin", "model.safetensors", "model.safetensors.index.json")
            ):
                logger.info("Using cached local model snapshot for %s: %s", model_name, snapshot)
                return str(snapshot)
    return model_name


def _translation_chunks(
    text: str,
    *,
    max_chars: int | None = None,
    chunk_chars: int | None = None,
    max_chunks: int | None = None,
) -> tuple[list[str], bool]:
    source = (text or "")[: max_chars or config.TRANSLATION_MAX_CHARS].strip()
    if not source:
        return [], False

    # Prefer sentence boundaries, including punctuation used by native scripts.
    parts = [part.strip() for part in re.split(r"(?<=[.!?。！？])\s+|\n+", source) if part.strip()]
    chunks: list[str] = []
    current = ""
    chunk_limit = chunk_chars or config.TRANSLATION_CHUNK_CHARS
    for part in parts or [source]:
        while len(part) > chunk_limit:
            split_at = part.rfind(" ", 0, chunk_limit + 1)
            if split_at < max(100, chunk_limit // 2):
                split_at = chunk_limit
            piece = part[:split_at].strip()
            if piece:
                chunks.append(piece)
            part = part[split_at:].strip()
        if not part:
            continue
        if current and len(current) + 1 + len(part) > chunk_limit:
            chunks.append(current)
            current = ""
        current = f"{current} {part}".strip()
    if current:
        chunks.append(current)

    chunk_budget = max_chunks or config.TRANSLATION_MAX_CHUNKS
    truncated = len(chunks) > chunk_budget
    return chunks[:chunk_budget], truncated


def _nllb(
    text: str,
    lang: str,
    *,
    max_chars: int | None = None,
    chunk_chars: int | None = None,
    max_chunks: int | None = None,
):
    if os.getenv("TRANSLATION_LOCAL_ENABLED", "true").lower() != "true":
        return None
    codes = {
        "id": "ind_Latn", "ms": "zsm_Latn", "tl": "tgl_Latn",
        "vi": "vie_Latn", "th": "tha_Thai", "my": "mya_Mymr",
        "km": "khm_Khmr", "lo": "lao_Laoo",
        "zh-cn": "zho_Hans", "zh-tw": "zho_Hant", "zh": "zho_Hans",
        "ja": "jpn_Jpan", "ko": "kor_Hang", "ar": "arb_Arab",
        "hi": "hin_Deva", "bn": "ben_Beng", "ru": "rus_Cyrl",
        "uk": "ukr_Cyrl", "bg": "bul_Cyrl", "el": "ell_Grek",
        "he": "heb_Hebr", "fa": "pes_Arab", "ur": "urd_Arab",
        "ta": "tam_Taml", "te": "tel_Telu", "si": "sin_Sinh",
        "ne": "npi_Deva", "gu": "guj_Gujr", "pa": "pan_Guru",
        "ka": "kat_Geor", "hy": "hye_Armn",
    }
    source_code = codes.get(lang)
    if not source_code:
        return None

    # A production container is intentionally offline. Do not let
    # transformers perform a network lookup for a missing snapshot; that
    # turns an optional enrichment task into a long request timeout.
    model_name = os.getenv("TRANSLATION_LOCAL_MODEL", "facebook/nllb-200-distilled-600M")
    model_path = _resolve_cached_model_path(model_name)
    offline = os.getenv("HF_HUB_OFFLINE", "0").lower() in {"1", "true", "yes", "on"} or os.getenv(
        "TRANSFORMERS_OFFLINE", "0"
    ).lower() in {"1", "true", "yes", "on"}
    if offline and model_path == model_name and "/" in model_name:
        logger.info("NLLB snapshot is unavailable locally; returning without network lookup")
        return None

    with _translation_lock:
        tokenizer, model = _nllb_model()
        tokenizer.src_lang = source_code
        chunks, truncated = _translation_chunks(
            text,
            max_chars=max_chars,
            chunk_chars=chunk_chars,
            max_chunks=max_chunks,
        )
        translated_parts = []
        for chunk in chunks:
            inputs = tokenizer(chunk, return_tensors="pt", truncation=True, max_length=128)
            output = model.generate(
                **inputs,
                forced_bos_token_id=tokenizer.convert_tokens_to_ids("eng_Latn"),
                max_new_tokens=128,
            )
            translated_parts.append(tokenizer.batch_decode(output, skip_special_tokens=True)[0].strip())
    return {
        "translated_text": "\n".join(part for part in translated_parts if part),
        "translation_chunks": len(chunks),
        "translation_truncated": truncated,
    }


def translate_and_extract(
    text: str,
    lang: str,
    *,
    max_chars: int | None = None,
    chunk_chars: int | None = None,
    max_chunks: int | None = None,
    defer: bool | None = None,
) -> dict[str, Any]:
    """Return an optional NLLB view; original text remains authoritative."""
    if config.TRANSLATION_PROVIDER != "nllb":
        return _no_translation_result("none", "disabled")
    normalized_lang = (lang or "unknown").strip().lower()
    if normalized_lang in NO_TRANSLATION_LANGS or normalized_lang in config.TRANSLATION_NATIVE_FIRST_LANGS:
        return _no_translation_result("none", "not_required")

    key = _hash(text, lang)
    cached = _cached(key)
    if cached:
        return {
            "translated": True,
            "provider": f"{cached['provider']}-cache",
            "translation_status": "completed",
            "translated_text": cached["translated_text"],
            "structured": cached["structured_result"],
        }
    if defer is None:
        defer = config.TRANSLATION_ASYNC_ENABLED
    if defer:
        return _deferred_translation_result(normalized_lang)
    try:
        data = _nllb(
            text,
            lang,
            max_chars=max_chars,
            chunk_chars=chunk_chars,
            max_chunks=max_chunks,
        )
        if not data:
            return _no_translation_result("unavailable", "unavailable")
        translated = str(data.get("translated_text") or "").strip()
        structured = {k: v for k, v in data.items() if k != "translated_text"}
        if translated:
            _store(key, lang, "nllb-local", translated, structured)
        return {
            "translated": bool(translated),
            "provider": "nllb-local",
            "translation_status": "completed" if translated else "unavailable",
            "translated_text": translated,
            "structured": structured,
        }
    except Exception as exc:
        logger.warning("NLLB translation failed: %s", exc)
        return _no_translation_result("failed", "failed")


def preload_local_model():
    """Optionally warm NLLB; lazy loading remains the default."""
    if (
        config.TRANSLATION_PROVIDER == "nllb"
        and os.getenv("TRANSLATION_LOCAL_ENABLED", "true").lower() == "true"
        and os.getenv("TRANSLATION_PRELOAD", "false").lower() == "true"
    ):
        _nllb_model()
