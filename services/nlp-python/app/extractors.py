import re
from typing import Optional
from . import config


def normalize_text(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^\w\s\-/:.]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def detect_language(text: str) -> str:
    try:
        from langdetect import detect
        lang = detect(text)
        if lang in ("id", "ms"):
            return "id"
        return lang
    except Exception:
        english_markers = ["many", "residents", "fever", "cough", "shortness", "this week"]
        score_en = sum(1 for w in english_markers if w in text.lower())
        return "en" if score_en >= 2 else "id"


def extract_location(text: str) -> Optional[str]:
    lower_text = text.lower()
    for loc in config.LOCATION_COORDS:
        if loc.lower() in lower_text:
            return loc
    for loc in config.LOCATION_COORDS:
        if loc.split()[-1].lower() in lower_text:
            return loc
    return None


def extract_case_count(text: str) -> int:
    match = re.search(r"\b(\d+)\s+(?:warga|pasien|kasus|residents)", text.lower())
    return int(match.group(1)) if match else 1


def extract_death_count(text: str) -> int:
    match = re.search(r"\b(\d+)\s+(?:meninggal|death|deaths)", text.lower())
    return int(match.group(1)) if match else 0


def extract_terms(text: str, dictionary: dict[str, str]) -> list[str]:
    lower_text = text.lower()
    return sorted(set(value for key, value in dictionary.items() if key in lower_text))
