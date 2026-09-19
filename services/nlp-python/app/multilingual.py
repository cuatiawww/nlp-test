"""Small, dependency-free multilingual primitives used by the NLP pipeline.

The functions in this module deliberately operate on a working copy of the
article.  Replacing a Unicode digit with its ASCII equivalent is one code
point for one code point, so offsets calculated from the working copy still
refer to the original article.  Translation is intentionally not part of
this module: it is an optional semantic aid, never the evidence source.
"""

from __future__ import annotations

import re
from typing import Mapping, Optional


LANGUAGE_ALIASES = {
    "in": "id",
    "id-id": "id",
    "ms-my": "ms",
    "ms-bn": "ms",
    "th-th": "th",
    "vi-vn": "vi",
    "tl-ph": "tl",
    "fil-ph": "tl",
    "fil": "tl",
    "km-kh": "km",
    "lo-la": "lo",
    "my-mm": "my",
    "bur": "my",
}

SUPPORTED_ASEAN_LANGUAGES = frozenset({"id", "ms", "th", "vi", "km", "lo", "my", "tl"})

SCRIPT_RANGES = {
    "th": (0x0E00, 0x0E7F),
    "lo": (0x0E80, 0x0EFF),
    "my": (0x1000, 0x109F),
    "km": (0x1780, 0x17FF),
}

_LOCAL_DIGITS = str.maketrans(
    "๐๑๒๓๔๕๖๗๘๙໐໑໒໓໔໕໖໗໘໙០១២៣៤៥៦៧៨៩၀၁၂၃၄၅၆၇၈၉",
    "0123456789" * 4,
)

def normalize_language_code(value: Optional[str]) -> str:
    value = str(value or "").strip().casefold().replace("_", "-")
    if not value:
        return "unknown"
    value = LANGUAGE_ALIASES.get(value, value)
    return value.split("-", 1)[0] if value not in SUPPORTED_ASEAN_LANGUAGES else value


def script_counts(text: str) -> dict[str, int]:
    counts = {language: 0 for language in SCRIPT_RANGES}
    for char in text or "":
        codepoint = ord(char)
        for language, (start, end) in SCRIPT_RANGES.items():
            if start <= codepoint <= end:
                counts[language] += 1
                break
    return counts


def script_for_language(language: str) -> str:
    return {
        "th": "Thai",
        "lo": "Lao",
        "my": "Myanmar",
        "km": "Khmer",
    }.get(language, "Latin")


def normalize_local_digits(text: str) -> str:
    """Normalize ASEAN native digits without changing string length or offsets."""

    return (text or "").translate(_LOCAL_DIGITS)


def detect_language_profile(
    text: str,
    hint: Optional[str] = None,
    markers: Optional[Mapping[str, list[str]]] = None,
) -> dict[str, object]:
    """Return language, script, confidence, and detection method.

    Native scripts are high-signal and take precedence over statistical
    detection. Latin-script languages still use langdetect when available,
    with the caller hint taking precedence when it is explicit.
    """

    normalized_hint = normalize_language_code(hint)
    if normalized_hint != "unknown":
        return {
            "language": normalized_hint,
            "script": script_for_language(normalized_hint),
            "confidence": 1.0,
            "method": "caller_hint",
        }

    counts = script_counts(text or "")
    total = max(1, sum(char.isalpha() for char in (text or "")))
    native_language, native_count = max(counts.items(), key=lambda item: item[1])
    if native_count >= 3 and native_count / total >= 0.10:
        return {
            "language": native_language,
            "script": script_for_language(native_language),
            "confidence": min(0.99, 0.75 + native_count / max(len(text or ""), 1)),
            "method": "unicode_script",
        }

    if markers:
        folded = (text or "").casefold()
        scores = {
            normalize_language_code(language): sum(
                1 for marker in words if str(marker).casefold() in folded
            )
            for language, words in markers.items()
        }
        ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
        if ranked and ranked[0][1] >= 2 and (len(ranked) == 1 or ranked[0][1] > ranked[1][1]):
            return {
                "language": ranked[0][0],
                "script": script_for_language(ranked[0][0]),
                "confidence": min(0.95, 0.70 + ranked[0][1] * 0.05),
                "method": "language_markers",
            }

    try:
        from langdetect import detect

        detected = normalize_language_code(detect(text or ""))
        if detected != "unknown":
            return {
                "language": detected,
                "script": script_for_language(detected),
                "confidence": 0.72,
                "method": "langdetect",
            }
    except Exception:
        pass

    return {
        "language": "unknown",
        "script": "Latin" if not native_count else script_for_language(native_language),
        "confidence": 0.0,
        "method": "unresolved",
    }


def metric_term_pattern(terms: tuple[str, ...]) -> str:
    if not terms:
        return r"(?!)"
    return "(?:" + "|".join(re.escape(term) for term in terms) + ")"


def contains_metric_term(
    text: str,
    case_terms: tuple[str, ...] = (),
    death_terms: tuple[str, ...] = (),
) -> bool:
    """Check caller-supplied lexicon terms without embedding language data."""

    pattern = re.compile(
        rf"(?:{metric_term_pattern(case_terms)}|{metric_term_pattern(death_terms)})",
        re.IGNORECASE | re.UNICODE,
    )
    return bool(pattern.search(text or ""))
