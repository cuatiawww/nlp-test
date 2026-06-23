import os
import re
from typing import Optional
from . import config


def normalize_text(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^\w\s\-/:\.\+%#@]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def detect_language(text: str) -> str:
    try:
        from langdetect import detect
        lang = detect(text)
        if lang in ("id", "ms"):
            return "id"
        return lang
    except Exception:
        markers = config.LANGUAGE_MARKERS
        min_match = int(os.getenv("LANG_MARKER_MIN_MATCH", "2"))
        scores: dict[str, int] = {}
        for lang_code, words in markers.items():
            scores[lang_code] = sum(1 for w in words if w in text.lower())
        if not scores or max(scores.values()) < min_match:
            return "unknown"
        return max(scores, key=scores.get)


def extract_location(text: str) -> Optional[str]:
    lower_text = text.lower()
    for loc in config.LOCATION_COORDS:
        if loc.lower() in lower_text:
            return loc
    for loc in config.LOCATION_COORDS:
        if loc.split()[-1].lower() in lower_text:
            return loc
    return None


def _extract_count(text: str, field: str, default: int) -> int:
    patterns = config.EXTRACTION_RULES.get(field, [])
    if not patterns:
        return default
    for pattern in patterns:
        match = re.search(pattern, text.lower())
        if match:
            return int(match.group(1))
    return default


def extract_case_count(text: str) -> int:
    default = int(os.getenv("DEFAULT_CASE_COUNT", "1"))
    return _extract_count(text, "case_count", default)


def extract_death_count(text: str) -> int:
    return _extract_count(text, "death_count", 0)


def extract_terms(text: str, dictionary: dict[str, str]) -> list[str]:
    lower_text = text.lower()
    return sorted(set(value for key, value in dictionary.items() if key in lower_text))
