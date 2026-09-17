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
    period = extract_event_period(text)
    if period.get("event_date"):
        return period["event_date"]
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


_MONTH_MAP = {
    "january": 1, "januari": 1, "jan": 1, "มกราคม": 1,
    "february": 2, "februari": 2, "feb": 2, "กุมภาพันธ์": 2,
    "march": 3, "maret": 3, "mar": 3, "มีนาคม": 3,
    "april": 4, "apr": 4, "เมษายน": 4,
    "may": 5, "mei": 5, "พฤษภาคม": 5,
    "june": 6, "juni": 6, "jun": 6, "มิถุนายน": 6,
    "july": 7, "juli": 7, "jul": 7, "กรกฎาคม": 7,
    "august": 8, "agustus": 8, "aug": 8, "ags": 8, "สิงหาคม": 8,
    "september": 9, "sep": 9, "กันยายน": 9,
    "october": 10, "oktober": 10, "oct": 10, "okt": 10, "ตุลาคม": 10,
    "november": 11, "nov": 11, "พฤศจิกายน": 11,
    "december": 12, "desember": 12, "dec": 12, "des": 12, "ธันวาคม": 12,
}

_MONTHS_PATTERN = (
    r"january|januari|february|februari|march|maret|april|may|mei|"
    r"june|juni|july|juli|august|agustus|september|october|oktober|"
    r"november|december|desember|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec|"
    r"มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|"
    r"กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม"
)

_RANGE = re.compile(
    r"(?:from|between|sejak|dari)?\s*"
    r"(?:(?P<d1>\d{1,2})\s+(?P<m1>" + _MONTHS_PATTERN + r")|(?P<m1_alt>" + _MONTHS_PATTERN + r")\.?\s+(?P<d1_alt>\d{1,2}))"
    r"(?:\s+(?P<y1>20\d{2}|25\d{2}))?"
    r"\s*(?:-|–|—|to|until|hingga|sampai|and|s/?d)\s*"
    r"(?:(?P<d2>\d{1,2})\s+(?P<m2>" + _MONTHS_PATTERN + r")|(?P<m2_alt>" + _MONTHS_PATTERN + r")\.?\s+(?P<d2_alt>\d{1,2}))"
    r"(?:\s+(?P<y2>20\d{2}|25\d{2}))?",
    re.IGNORECASE,
)


def _calendar_year(raw: Optional[str]) -> Optional[int]:
    if not raw:
        return None
    year = int(raw)
    if year >= 2500:
        year -= 543
    return year


def _ymd(year: Optional[int], month: Optional[int], day: Optional[int]) -> Optional[str]:
    if not year or not month:
        return None
    try:
        return date(year, month, int(day or 1)).isoformat()
    except ValueError:
        return None


def extract_event_period(text: str, published_at: Optional[str] = None) -> dict:
    """Return reporting window, period type, and whether Date Case needs review.

    Teammate QA:
    - no.51 range 1 Jan–23 Aug 2026 must not be stored as the article date only
    - no.52 cumulative Sep 2025 reported as of Jan 2026 must be labeled cumulative
    """
    from .extractors import count_period_type, extract_date_from_text

    result = {
        "event_date": None,
        "event_date_start": None,
        "event_date_end": None,
        "period_type": count_period_type(text),
        "date_needs_review": False,
    }
    sample = text or ""
    match = _RANGE.search(sample[:2500])
    if match:
        pub_year = int(published_at[:4]) if published_at and len(published_at) >= 4 and published_at[:4].isdigit() else datetime.now().year
        y2 = _calendar_year(match.group("y2")) or pub_year
        y1 = _calendar_year(match.group("y1")) or y2 or pub_year
        m1_raw = match.group("m1") or match.group("m1_alt") or ""
        m2_raw = match.group("m2") or match.group("m2_alt") or ""
        d1_raw = match.group("d1") or match.group("d1_alt")
        d2_raw = match.group("d2") or match.group("d2_alt")
        m1 = _MONTH_MAP.get(m1_raw.lower().rstrip("."))
        m2 = _MONTH_MAP.get(m2_raw.lower().rstrip("."))
        start = _ymd(y1, m1, d1_raw)
        end = _ymd(y2, m2, d2_raw)
        result["event_date_start"] = start
        result["event_date_end"] = end
        result["event_date"] = end or start
        result["period_type"] = "cumulative"
        result["date_needs_review"] = True
    elif result["period_type"] == "cumulative":
        start_only = re.search(
            r"\b(?:from|since|sejak|dari)\s+(?P<m>[A-Za-z]{3,12})\s+(?P<y>20\d{2}|25\d{2})",
            sample[:2000],
            re.I,
        )
        as_of = re.search(
            r"\b(?:as of|dilaporkan per|per|hingga|reported as of)\s+"
            r"([A-Za-z]{3,12}\s+20\d{2}|20\d{2}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]{3,12}\s+20\d{2})",
            sample[:2000],
            re.I,
        )
        if start_only:
            y = _calendar_year(start_only.group("y"))
            m = _MONTH_MAP.get(start_only.group("m").lower())
            result["event_date_start"] = _ymd(y, m, 1)
            result["date_needs_review"] = True
        if as_of:
            result["event_date"] = normalize_publication_date(extract_date_from_text(as_of.group(0)))
            result["event_date_end"] = result["event_date"]
            result["date_needs_review"] = True
    published = normalize_publication_date(published_at)
    try:
        today = date.today()
        for key in ("event_date", "event_date_end", "event_date_start"):
            value = result.get(key)
            if value and date.fromisoformat(value) > today:
                result["date_needs_review"] = True
        if published and result.get("event_date") and result["event_date"] > published:
            result["date_needs_review"] = True
    except ValueError:
        result["date_needs_review"] = True
    return result


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
