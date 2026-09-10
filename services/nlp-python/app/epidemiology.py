"""Conservative epidemiological facts shared by NLP response contracts."""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Optional


COUNT_LABELS = {
    "confirmed_cases": (
        r"confirmed\s+cases?", r"laboratory[- ]confirmed", r"kasus\s+terkonfirmasi",
        r"kasus\s+konfirmasi", r"ca\s+xac\s+nhan",
    ),
    "suspected_cases": (
        r"suspected\s+cases?", r"probable\s+cases?", r"kasus\s+suspek",
        r"kasus\s+dugaan", r"ca\s+nghi\s+ngo",
    ),
    "hospitalizations": (
        r"hospitali[sz](?:ed|ations?)", r"admitted\s+to\s+hospital",
        r"dirawat(?:\s+di\s+rumah\s+sakit)?", r"rawat\s+inap",
    ),
}


def normalize_publication_date(value: Optional[str]) -> Optional[str]:
    """Normalize only source metadata; never infer publication from body text."""
    if not value:
        return None
    raw = str(value).strip()
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        match = re.search(r"\b(20\d{2}-\d{2}-\d{2})\b", raw)
        if match:
            try:
                return date.fromisoformat(match.group(1)).isoformat()
            except ValueError:
                return None
    return None


def extract_event_date(text: str) -> Optional[str]:
    """Extract a date only from an explicitly event-oriented sentence."""
    from .extractors import extract_date_from_text

    event_markers = re.compile(
        r"\b(?:on|as\s+of|during|between|since|reported\s+on|recorded\s+on|"
        r"pada|tanggal|hingga|sejak|selama|dilaporkan\s+pada|tercatat\s+pada|"
        r"ngay|vao\s+ngay|tinh\s+den)\b",
        re.IGNORECASE,
    )
    for sentence in re.split(r"(?<=[.!?。！？])\s+|\n+", text or ""):
        if not event_markers.search(sentence):
            continue
        extracted = extract_date_from_text(sentence)
        if extracted:
            return normalize_publication_date(extracted)
    return None


def _parse_count(raw: str) -> int:
    compact = raw.strip().replace(" ", "")
    if re.fullmatch(r"\d{1,3}(?:[.,]\d{3})+", compact):
        compact = compact.replace(".", "").replace(",", "")
    else:
        compact = compact.replace(",", "")
    return int(compact)


def extract_labeled_counts(text: str) -> dict[str, Optional[int]]:
    """Extract typed counts only when number and metric label are adjacent."""
    result: dict[str, Optional[int]] = {key: None for key in COUNT_LABELS}
    number = r"(?P<count>\d{1,3}(?:[.,\s]\d{3})*|\d+)"
    for field, labels in COUNT_LABELS.items():
        label = "(?:" + "|".join(labels) + ")"
        patterns = (
            re.compile(rf"{number}\s+(?:new\s+|baru\s+)?{label}", re.IGNORECASE),
            re.compile(rf"{label}\s*(?:were|was|is|are|of|sebanyak|mencapai|:|-)?\s*{number}", re.IGNORECASE),
        )
        values = []
        for pattern in patterns:
            for match in pattern.finditer(text or ""):
                try:
                    values.append(_parse_count(match.group("count")))
                except ValueError:
                    continue
        if values:
            result[field] = max(values)
    return result


def evidence_sentences(text: str, limit: int = 5) -> list[str]:
    """Retain short source spans containing an explicit surveillance fact."""
    evidence = []
    metric = re.compile(
        r"\b(?:cases?|kasus|patients?|pasien|deaths?|kematian|died|meninggal|"
        r"hospitali[sz]|dirawat|confirmed|terkonfirmasi|suspected|suspek|outbreak|wabah|cluster)\b",
        re.IGNORECASE,
    )
    for sentence in re.split(r"(?<=[.!?。！？])\s+|\n+", text or ""):
        clean = " ".join(sentence.split()).strip()
        if 20 <= len(clean) <= 800 and re.search(r"\d", clean) and metric.search(clean):
            evidence.append(clean)
        if len(evidence) >= limit:
            break
    return evidence


def event_category(value: str, outbreak_alert: bool = False) -> str:
    folded = (value or "").casefold()
    if outbreak_alert or "outbreak" in folded or "wabah" in folded:
        return "outbreak"
    if "cluster" in folded:
        return "cluster"
    if "death" in folded:
        return "death"
    if "vaccin" in folded or "immun" in folded:
        return "vaccination"
    if "prevent" in folded:
        return "prevention"
    if "surveillance" in folded or "health update" in folded:
        return "surveillance"
    if "case" in folded or "disease" in folded:
        return "case_report"
    if "alert" in folded:
        return "alert"
    return "other"
