"""Conservative epidemiological facts shared by NLP response contracts."""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
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



EPISTEMIC_STATUSES = (
    "retracted", "suspected", "confirmed", "rumor", "official_report",
    "negative_surveillance", "reported",
)

_RE_RETRACTED = re.compile(
    r"\b(?:hoaks|hoax|bantah|membantah|disproven|false\s+alarm|retracted|"
    r"salah\s+diagnosis|bukan\s+(?:kasus|wabah|penyakit|demam\s+berdarah|antraks|rabies|kolera)|"
    r"tidak\s+benar|kabar\s+bohong|bác\s+bỏ|khẳng\s+định\s+sai)\b",
    re.IGNORECASE,
)

_RE_RUMOR = re.compile(
    r"\b(?:rumor|kabar\s+burung|isu\s+beredar|belum\s+terverifikasi|unverified|"
    r"viral\s+di\s+medsos|viral\s+di\s+media\s+sosial|isu\s+liar|tin\s+đồn|tin\s+đồn\s+thất\s+thiệt)\b",
    re.IGNORECASE,
)

_RE_SUSPECTED = re.compile(
    r"\b(?:diduga|suspek|dugaan|suspected|probable|kemungkinan|gejala\s+mirip|"
    r"indikasi|tanda[- ]tanda|menyerupai|terindikasi|nghi\s+ngờ|ca\s+nghi|สงสัย)\b",
    re.IGNORECASE,
)

_RE_CONFIRMED = re.compile(
    r"\b(?:terkonfirmasi|positif|confirmed|laboratory[- ]confirmed|hasil\s+lab(?:oratorium)?|"
    r"uji\s+lab(?:oratorium)?|swab\s+positif|pcr\s+positif|positif\s+terpapar|"
    r"xác\s+nhận|ca\s+xác\s+nhận|ยืนยัน|ผลตรวจยืนยัน)\b",
    re.IGNORECASE,
)

_RE_OFFICIAL = re.compile(
    r"\b(?:kemenkes(?:ri)?|dinkes|kementerian\s+kesehatan|dinas\s+kesehatan|"
    r"who|cdc|moh|doh|pemerintah\s+daerah|pemda|pejabat\s+kesehatan|"
    r"press\s+release|siaran\s+pers|keterangan\s+resmi|laporan\s+resmi)\b",
    re.IGNORECASE,
)

_RE_NEGATIVE_SURVEILLANCE = re.compile(
    r"\b(?:no(?:\s+new)?(?:\s+[\w-]+){0,6}\s+cases?|no\s+case|zero\s+cases?|"
    r"not\s+yet\s+detected|tidak\s+ada\s+kasus|belum\s+ada\s+kasus)\b"
    r"(?:[^.!?]{0,80}\b(?:detected|reported|recorded|identified|found|"
    r"terdeteksi|dilaporkan|tercatat|ditemukan)\b)?",
    re.IGNORECASE,
)


def classify_epistemic_status(
    text: str,
    disease: Optional[str] = None,
    evidence: Optional[str] = None,
) -> str:
    """Classify the epistemic status of an event or document.

    Precedence:
    1. retracted (highest priority: hoaks, bantahan, salah diagnosis)
    2. rumor (unverified, kabar burung, viral)
    3. suspected (diduga, suspek, probable)
    4. confirmed (terkonfirmasi, hasil lab, positif, confirmed)
    5. official_report (kemenkes, dinkes, WHO, MOH, siaran pers)
    6. reported (default verified reporting)
    """
    sample = f"{evidence or ''} {text or ''}"[:3000]
    if _RE_RETRACTED.search(sample):
        return "retracted"
    if _RE_RUMOR.search(sample):
        return "rumor"
    if _RE_SUSPECTED.search(sample):
        return "suspected"
    if _RE_NEGATIVE_SURVEILLANCE.search(sample):
        return "negative_surveillance"
    if _RE_CONFIRMED.search(sample):
        return "confirmed"
    if _RE_OFFICIAL.search(sample):
        return "official_report"
    return "reported"


_RE_CUMULATIVE = re.compile(
    r"\b(?:sejak\s+awal\s+tahun|total\s+akumulatif|akumulasi|sepanjang\s+tahun|"
    r"sepanjang\s+20\d{2}|total\s+kasus|secara\s+keseluruhan|cumulative|to\s+date|"
    r"so\s+far\s+this\s+year|year[- ]to[- ]date|ytd|tổng\s+số\s+ca)\b",
    re.IGNORECASE,
)

_RE_NEW_CASES = re.compile(
    r"\b(?:kasus\s+baru|penambahan\s+(?:kasus)?|tambahan\s+kasus|new\s+cases?|"
    r"tercatat\s+hari\s+ini|dalam\s+24\s+jam\s+terakhir|ca\s+mắc\s+mới|ca\s+mới)\b",
    re.IGNORECASE,
)

_RE_ACTIVE_CASES = re.compile(
    r"\b(?:kasus\s+aktif|masih\s+dirawat|dalam\s+perawatan|sedang\s+dirawat|"
    r"active\s+cases?|currently\s+hospitali[sz]ed|đang\s+điều\s+trị)\b",
    re.IGNORECASE,
)

_RE_DEATHS = re.compile(
    r"\b(?:kematian|meninggal(?:\s+dunia)?|korban\s+jiwa|tewas|deaths?|fatalities|tử\s+vong)\b",
    re.IGNORECASE,
)


def qualify_metric_type(
    text: str,
    default_period: str = "unknown",
    has_cases: bool = True,
    has_deaths: bool = False,
) -> tuple[str, str]:
    """Return (metric_type, unit) for an extracted surveillance count."""
    sample = (text or "")[:1500]
    if has_deaths and not has_cases:
        return "deaths", "persons"
    if _RE_DEATHS.search(sample) and not has_cases:
        return "deaths", "persons"
    if _RE_CUMULATIVE.search(sample) or default_period == "cumulative":
        return "cumulative_cases", "persons"
    if _RE_NEW_CASES.search(sample):
        return "new_cases", "persons"
    if _RE_ACTIVE_CASES.search(sample):
        return "active_cases", "persons"
    return "cases", "persons"

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

    Supports:
    - Explicit date ranges (e.g. 1 Jan–23 Aug 2026, sejak Januari hingga Maret 2026)
    - Epidemiological weeks (e.g. pekan ke-12 tahun 2026, week 10)
    - Relative expressions (e.g. kemarin, pekan lalu, sepanjang tahun ini)
    - Cumulative markers and review flagging
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
    pub_iso = normalize_publication_date(published_at)
    pub_dt = None
    if pub_iso:
        try:
            pub_dt = date.fromisoformat(pub_iso)
        except ValueError:
            pass
    pub_year = pub_dt.year if pub_dt else datetime.now().year

    # 1. Epidemiological Week (e.g. "pekan ke-12 tahun 2026", "minggu ke-10 2026", "epi week 14")
    epi_week_match = re.search(
        r"\b(?:pekan\s+ke[- ]?|minggu\s+ke[- ]?|epi(?:demiological)?\s+week\s+|week\s+)(\d{1,2})"
        r"(?:\s+(?:tahun\s+|of\s+)?(20\d{2}|25\d{2}))?\b",
        sample[:2500],
        re.I,
    )
    if epi_week_match:
        try:
            wnum = int(epi_week_match.group(1))
            wyear = _calendar_year(epi_week_match.group(2)) or pub_year
            if 1 <= wnum <= 53:
                start_d = date.fromisocalendar(wyear, wnum, 1)  # Monday
                end_d = date.fromisocalendar(wyear, wnum, 7)    # Sunday
                result["event_date_start"] = start_d.isoformat()
                result["event_date_end"] = end_d.isoformat()
                result["event_date"] = end_d.isoformat()
                result["period_type"] = "weekly"
                result["date_needs_review"] = False
                return result
        except (ValueError, OverflowError):
            pass

    # 2. Relative time expressions against published_at
    if pub_dt:
        # "kemarin" / "yesterday"
        if re.search(r"\b(?:kemarin|yesterday)\b", sample[:1500], re.I):
            y_date = pub_dt - timedelta(days=1)
            result["event_date"] = y_date.isoformat()
            result["event_date_start"] = y_date.isoformat()
            result["event_date_end"] = y_date.isoformat()
            result["period_type"] = "incident"
            return result

        # "pekan lalu" / "minggu lalu" / "last week"
        if re.search(r"\b(?:pekan\s+lalu|minggu\s+lalu|last\s+week)\b", sample[:1500], re.I):
            # Prior week Monday to Sunday
            cur_monday = pub_dt - timedelta(days=pub_dt.weekday())
            prev_monday = cur_monday - timedelta(days=7)
            prev_sunday = cur_monday - timedelta(days=1)
            result["event_date_start"] = prev_monday.isoformat()
            result["event_date_end"] = prev_sunday.isoformat()
            result["event_date"] = prev_sunday.isoformat()
            result["period_type"] = "weekly"
            return result

        # "sepanjang tahun ini" / "tahun ini"
        if re.search(r"\b(?:sepanjang\s+tahun\s+ini|tahun\s+ini|this\s+year)\b", sample[:1500], re.I):
            result["event_date_start"] = f"{pub_year}-01-01"
            result["event_date_end"] = pub_dt.isoformat()
            result["event_date"] = pub_dt.isoformat()
            result["period_type"] = "cumulative"
            result["date_needs_review"] = True
            return result

    # 3. Explicit date range regex
    match = _RANGE.search(sample[:2500])
    if match:
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

    # Annual references are periods, not publication dates.  Preserve them so
    # two reports for different years cannot collapse into one event merely
    # because they share a disease and location.
    if not result["event_date_start"] and not result["event_date_end"]:
        year_match = re.search(
            r"\b(?P<cue>in|pada|tahun|during|sepanjang|since|sejak)\s+(?P<year>20\d{2})\b",
            sample[:2500],
            re.IGNORECASE,
        )
        if year_match:
            year = int(year_match.group("year"))
            result["event_date_start"] = f"{year:04d}-01-01"
            result["event_date_end"] = f"{year:04d}-12-31"
            result["period_type"] = (
                "cumulative"
                if year_match.group("cue").casefold() in {"since", "sejak", "sepanjang"}
                else "historical"
            )
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


def find_evidence_offsets(text: str, evidence: str) -> tuple[Optional[int], Optional[int]]:
    """Return 0-indexed (start_char, end_char) of evidence within text.

    If exact match fails due to normalization/whitespace, finds the best
    substring match using whitespace-tolerant token regex.
    """
    if not text or not evidence:
        return None, None
    raw_text = str(text)
    clean_ev = str(evidence).strip()
    if not clean_ev:
        return None, None

    # 1. Exact match
    pos = raw_text.find(clean_ev)
    if pos != -1:
        return pos, pos + len(clean_ev)

    # 2. Case-insensitive match
    lower_pos = raw_text.lower().find(clean_ev.lower())
    if lower_pos != -1:
        return lower_pos, lower_pos + len(clean_ev)

    # 3. Whitespace-tolerant regex match
    tokens = [re.escape(w) for w in clean_ev.split()]
    if tokens:
        pattern = r"\s+".join(tokens)
        try:
            m = re.search(pattern, raw_text, re.IGNORECASE)
            if m:
                return m.start(), m.end()
        except re.error:
            pass

    return None, None


_LOW_CFR_DISEASES = frozenset({
    "dengue", "demam berdarah", "dbd", "chikungunya", "zika",
    "hand foot and mouth", "hfmd", "flu singapura", "campak", "measles",
    "varicella", "cacar air", "influenza", "common cold",
})


def validate_surveillance_facts(
    text: str,
    disease: str = "UNKNOWN",
    location: Optional[str] = None,
    case_count: int = 0,
    death_count: int = 0,
    epistemic_status: str = "reported",
    count_period_type: str = "unknown",
    sub_events: Optional[list] = None,
) -> tuple[bool, list[str]]:
    """Validate extracted surveillance facts against epidemiological plausibility rules.

    Returns:
      (needs_review: bool, validation_flags: list[str])
    """
    flags: list[str] = []
    cases = int(case_count or 0)
    deaths = int(death_count or 0)
    d_clean = (disease or "").lower()

    # 1. Death exceeds cases (impossible unless deaths-only report where cases == 0)
    if deaths > cases and cases > 0:
        flags.append("death_exceeds_cases")

    # 2. Extreme count anomaly (> 500,000 incident cases in one news report)
    if cases > 500_000 and count_period_type != "cumulative":
        flags.append("extreme_count_anomaly")

    # 3. Abnormal Case Fatality Rate (CFR)
    if any(low_d in d_clean for low_d in _LOW_CFR_DISEASES):
        if cases >= 10 and deaths > (cases * 0.40):
            flags.append("abnormal_cfr_ratio")

    # 4. Epistemic status flags
    if epistemic_status == "retracted":
        flags.append("retracted_report")
    elif epistemic_status == "rumor":
        flags.append("unverified_rumor")

    # 5. Conflicting headline vs body numbers
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    if len(lines) >= 2:
        headline = lines[0]
        body = " ".join(lines[1:])
        head_counts = re.findall(r"\b(\d[\d.,]*)\s+(?:kasus|cases?)\b", headline, re.I)
        body_counts = re.findall(r"\b(\d[\d.,]*)\s+(?:kasus|cases?)\b", body[:1500], re.I)
        if head_counts and body_counts:
            try:
                h_val = _parse_count(head_counts[0])
                b_val = _parse_count(body_counts[0])
                if h_val > 0 and b_val > 0 and (h_val / b_val > 5.0 or b_val / h_val > 5.0):
                    flags.append("conflicting_counts")
            except Exception:
                pass

    # 6. Child sub-event checks
    if sub_events:
        for sub in sub_events:
            s_cases = sub.get("case_count") if isinstance(sub, dict) else getattr(sub, "case_count", 0)
            s_deaths = sub.get("death_count") if isinstance(sub, dict) else getattr(sub, "death_count", 0)
            if s_deaths and s_cases and int(s_deaths) > int(s_cases) and int(s_cases) > 0:
                if "death_exceeds_cases" not in flags:
                    flags.append("death_exceeds_cases")

    needs_review = bool(flags)
    return needs_review, flags


def calibrate_outbreak_alert(
    *,
    disease: str = "UNKNOWN",
    case_count: int = 0,
    death_count: int = 0,
    epistemic_status: str = "reported",
    count_period_type: str = "unknown",
    explicit_outbreak: bool = False,
    is_health_related: bool = True,
    validation_flags: Optional[list[str]] = None,
    base_alert: bool = False,
) -> bool:
    """Calibrate outbreak_alert to prevent false alarms on rumors, hoaxes, and cumulative totals."""
    if not is_health_related:
        return False

    flags = set(validation_flags or [])

    # Retracted news or hoaxes must NEVER trigger an outbreak alert
    if epistemic_status == "retracted" or "retracted_report" in flags:
        return False

    # Unverified social media rumors should not trigger alert
    if epistemic_status == "rumor" or "unverified_rumor" in flags:
        return False

    # Severe data contradictions suppress alert until reviewed
    if "death_exceeds_cases" in flags or "extreme_count_anomaly" in flags:
        return False

    # Cumulative counts without explicit outbreak keywords must not trigger alert
    if count_period_type == "cumulative" and not explicit_outbreak:
        return False

    return base_alert
