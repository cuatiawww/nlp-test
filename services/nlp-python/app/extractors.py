import os
import re
import unicodedata
from collections import Counter
from typing import Optional
from . import config


def normalize_text(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^\w\s\-/:\.\+%#@]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def detect_language(text: str) -> str:
    script_counts = {
        "th": sum("\u0e00" <= char <= "\u0e7f" for char in text),
        "lo": sum("\u0e80" <= char <= "\u0eff" for char in text),
        "my": sum("\u1000" <= char <= "\u109f" for char in text),
        "km": sum("\u1780" <= char <= "\u17ff" for char in text),
    }
    if text and max(script_counts.values(), default=0) >= 3:
        return max(script_counts, key=script_counts.get)
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


def _fold_location_text(value: str) -> str:
    """Make Latin locations match their local-script/diacritic variants."""
    decomposed = unicodedata.normalize("NFKD", value.lower())
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def _fold_with_positions(value: str) -> tuple[str, list[int]]:
    folded: list[str] = []
    positions: list[int] = []
    for index, char in enumerate(value):
        decomposed = unicodedata.normalize("NFKD", char.lower())
        for part in decomposed:
            if not unicodedata.combining(part):
                folded.append(part)
                positions.append(index)
    return "".join(folded), positions


def extract_location(text: str) -> Optional[str]:
    compact_text = re.sub(r"\s+", " ", text)
    lower_text, folded_positions = _fold_with_positions(compact_text)
    hits: list[tuple[str, int]] = []
    folded_names = {
        _fold_location_text(name): name
        for name in config.LOCATION_COORDS
    }
    if config.LOCATION_PATTERNS:
        pattern = config.LOCATION_PATTERNS[0][1]
        for match in pattern.finditer(lower_text):
            loc = folded_names.get(match.group(0).lower(), match.group(0))
            raw_position = folded_positions[match.start()]
            # Latin one-word gazetteer entries are prone to collide with
            # ordinary prose (e.g. "sudah", "dalam", "same"). Require a
            # proper-case occurrence unless the entry is multi-word or uses a
            # non-Latin script.
            if " " not in loc and loc.isascii():
                first = compact_text[raw_position:raw_position + 1]
                if not (first.isupper() or first.isdigit()):
                    continue
            hits.append((loc, match.start()))

    if not hits:
        return None

    # A news article often starts with a dateline (e.g. "Jakarta (ANTARA)")
    # while the incident is elsewhere. Prefer locations in the article body
    # when a real body location is available.
    body_hits = [(loc, pos) for loc, pos in hits if pos >= 120]
    if body_hits:
        hits = body_hits

    # International comparison sections often mention other countries or
    # cities ("including Singapore", "higher than Thailand", etc.). These
    # are not the incident location. Keep genuine mentions when available.
    contextual = re.compile(
        r"(?:including|includes|compared with|compared to|higher than|lower than|"
        r"both|between|across|regional partners|countries in)",
        re.IGNORECASE,
    )
    primary_hits = [
        (loc, pos)
        for loc, pos in hits
        if not contextual.search(lower_text[max(0, pos - 100):pos])
    ]
    if primary_hits:
        hits = primary_hits

    counts = Counter(loc for loc, _ in hits)
    return max(hits, key=lambda item: (counts[item[0]], item[1], len(item[0])))[0]


def _extract_count(text: str, field: str, default: int) -> int:
    search_text = "".join(
        str(unicodedata.digit(char)) if unicodedata.category(char) == "Nd" else char
        for char in text
    )
    localized_patterns = {
        "case_count": [
            r"([0-9][0-9,.]*)(?:\s+[a-z-]+){0,3}\s+cases?\b",
            r"(?:ผู้ป่วยใหม่|ผู้ป่วย|ติดเชื้อ)\s*([0-9][0-9,.]*)\s*ราย",
            r"(?:ករណីឆ្លងថ្មី|ករណីឆ្លង|អ្នកឆ្លង)\s*([0-9][0-9,.]*)\s*នាក់",
            r"(?:အတည်ပြုလူနာ|ကူးစက်သူ|လူနာ)\s*([0-9][0-9,.]*)\s*(?:ဦး|ယောက်)",
        ],
        "death_count": [
            r"([0-9][0-9,.]*)\s+deaths?\b",
            r"(?:ผู้เสียชีวิต|เสียชีวิต)\s*([0-9][0-9,.]*)\s*ราย",
            r"(?:ករណីស្លាប់|អ្នកស្លាប់)\s*([0-9][0-9,.]*)\s*នាក់",
            r"(?:သေဆုံးသူ|သေဆုံး)\s*([0-9][0-9,.]*)",
        ],
    }
    for pattern in localized_patterns.get(field, []):
        match = re.search(pattern, search_text)
        if match:
            return _parse_count(match.group(1))
    patterns = config.EXTRACTION_RULES.get(field, [])
    if not patterns:
        return default
    for pattern in patterns:
        match = re.search(pattern, search_text.lower())
        if match:
            return _parse_count(match.group(1))
    return default


def _parse_count(value: str) -> int:
    value = value.strip()
    if re.fullmatch(r"\d{1,3}(?:[,.]\d{3})+", value):
        value = re.sub(r"[,.]", "", value)
    return int(value)


def extract_case_count(text: str) -> int:
    default = int(os.getenv("DEFAULT_CASE_COUNT", "1"))
    return _extract_count(text, "case_count", default)


def extract_death_count(text: str) -> int:
    return _extract_count(text, "death_count", 0)


def extract_terms(text: str, dictionary: dict[str, str]) -> list[str]:
    lower_text = text.lower()
    return sorted(set(value for key, value in dictionary.items() if key in lower_text))
