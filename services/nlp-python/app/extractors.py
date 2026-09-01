import os
import re
import unicodedata
from collections import Counter
from typing import Optional
from . import config


def normalize_disease_display(disease: str, language: str = "unknown", text: str = "") -> str:
    """Normalize raw/zero-shot disease labels to clean clinical/display terms."""
    raw = (disease or "").strip()
    lower = raw.lower()
    text_lower = (text or "").lower()

    # Campak / Measles
    if "campak" in lower or "measles" in lower or lower == "measles campak":
        if language in ("id", "ms") or "campak" in text_lower or not language or language == "unknown":
            return "Campak"
        return "Measles"

    return raw


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


COUNTRY_ALIASES = {
    "brunei": "Brunei",
    "brunei darussalam": "Brunei",
    "cambodia": "Cambodia",
    "kampuchea": "Cambodia",
    "indonesia": "Indonesia",
    "laos": "Laos",
    "lao pdr": "Laos",
    "malaysia": "Malaysia",
    "myanmar": "Myanmar",
    "burma": "Myanmar",
    "philippines": "Philippines",
    "the philippines": "Philippines",
    "singapore": "Singapore",
    "thailand": "Thailand",
    "timor-leste": "Timor-Leste",
    "timor leste": "Timor-Leste",
    "east timor": "Timor-Leste",
    "vietnam": "Vietnam",
    "viet nam": "Vietnam",
    "south sudan": "South Sudan",
    "sudan": "Sudan",
    "democratic republic of the congo": "Democratic Republic of the Congo",
    "dr congo": "Democratic Republic of the Congo",
    "rd congo": "Democratic Republic of the Congo",
    "rd kongo": "Democratic Republic of the Congo",
    "congo": "Democratic Republic of the Congo",
    "kongo": "Democratic Republic of the Congo",
}


def extract_country_hint(text: str) -> Optional[str]:
    folded = _fold_location_text(text or "")
    for alias in sorted(COUNTRY_ALIASES, key=len, reverse=True):
        if re.search(rf"(?<![A-Za-z]){re.escape(_fold_location_text(alias))}(?![A-Za-z])", folded, re.IGNORECASE):
            return COUNTRY_ALIASES[alias]
    return None


def country_scope(country: Optional[str]) -> Optional[str]:
    """Return the display/filter country without relabeling known ASEAN data."""
    value = (country or "").strip()
    if not value:
        return None
    if value in config.ASEAN_COUNTRIES:
        return value
    return config.OUTSIDE_ASEAN_COUNTRY


def extract_who_disease_mentions(text: str, concepts: list[dict]) -> list[str]:
    """Match explicit WHO concept names without asking the model to infer."""
    value = re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()
    mentions: list[str] = []
    for concept in concepts:
        canonical = str(concept.get("canonical_name") or "").strip()
        english = str(concept.get("english_name") or "").strip()
        for name in (canonical, english):
            folded = re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()
            if folded and re.search(rf"(?<![a-z0-9]){re.escape(folded)}(?![a-z0-9])", value):
                mentions.append(canonical)
                break
    return sorted(set(mentions))


def canonicalize_who_disease_labels(labels: list[str], concepts: list[dict]) -> list[str]:
    """Map local keyword labels (e.g. KOLERA/MEASLES) to WHO canonicals."""
    by_name = {
        str(concept.get("canonical_name") or "").strip().upper(): str(
            concept.get("canonical_name") or ""
        ).strip()
        for concept in concepts
        if concept.get("canonical_name")
    }
    return sorted(set(by_name[label.strip().upper()] for label in labels if label.strip().upper() in by_name))


def extract_location(text: str, country: Optional[str] = None) -> Optional[str]:
    compact_text = re.sub(r"\s+", " ", text)
    lower_text, folded_positions = _fold_with_positions(compact_text)
    hits: list[tuple[str, int]] = []
    country_folded = _fold_location_text(country) if country else ""
    allowed_names = {
        name for name in config.LOCATION_COORDS
        if not country_folded
        or _fold_location_text(config.LOCATION_COUNTRIES.get(name, "")) == country_folded
    }
    if country and not allowed_names:
        # A country hint is a restriction, not permission to select a similarly
        # named place from another country (e.g. Sudan, Indonesia).
        return None
    folded_names = {
        _fold_location_text(name): name
        for name in config.LOCATION_COORDS
        if name in allowed_names
    }
    if config.LOCATION_PATTERNS:
        pattern = config.LOCATION_PATTERNS[0][1]
        for match in pattern.finditer(lower_text):
            m_lower = match.group(0).lower()
            if country and m_lower not in folded_names:
                continue
            loc = folded_names.get(m_lower, match.group(0))
            raw_position = folded_positions[match.start()]
            # Latin one-word gazetteer entries are prone to collide with
            # ordinary prose (e.g. "sudah", "dalam", "same"). Require a
            # proper-case occurrence unless the entry is multi-word or uses a
            # non-Latin script.
            if " " not in loc and loc.isascii():
                if loc.casefold() in config.LOCATION_STOPWORDS:
                    continue
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
    # Prefer highest frequency, more specific location names, then earlier mentions
    return max(hits, key=lambda item: (counts[item[0]], len(item[0]), -item[1]))[0]


def extract_all_locations(text: str, country: Optional[str] = None) -> list[dict]:
    """Extract all distinct valid locations mentioned in the text with coordinates."""
    compact_text = re.sub(r"\s+", " ", text)
    lower_text, folded_positions = _fold_with_positions(compact_text)
    hits: list[tuple[str, int]] = []
    country_folded = _fold_location_text(country) if country else ""
    allowed_names = {
        name for name in config.LOCATION_COORDS
        if not country_folded
        or _fold_location_text(config.LOCATION_COUNTRIES.get(name, "")) == country_folded
    }
    if country and not allowed_names:
        return []
    folded_names = {
        _fold_location_text(name): name
        for name in config.LOCATION_COORDS
        if name in allowed_names
    }
    if config.LOCATION_PATTERNS:
        pattern = config.LOCATION_PATTERNS[0][1]
        for match in pattern.finditer(lower_text):
            m_lower = match.group(0).lower()
            if country and m_lower not in folded_names:
                continue
            loc = folded_names.get(m_lower, match.group(0))
            raw_position = folded_positions[match.start()]
            if " " not in loc and loc.isascii():
                if loc.casefold() in config.LOCATION_STOPWORDS:
                    continue
                first = compact_text[raw_position:raw_position + 1]
                if not (first.isupper() or first.isdigit()):
                    continue
            hits.append((loc, match.start()))

    if not hits:
        return []

    primary = extract_location(text, country=country)
    counts = Counter(loc for loc, _ in hits)
    distinct_names = sorted(
        counts.keys(),
        key=lambda name: (1 if name == primary else 0, counts[name], len(name)),
        reverse=True
    )

    results = []
    for name in distinct_names:
        lat, lon = config.LOCATION_COORDS.get(name, (None, None))
        c = config.LOCATION_COUNTRIES.get(name, country)
        results.append({
            "name": name,
            "latitude": lat,
            "longitude": lon,
            "country": c
        })
    return results


def is_policy_or_statistical_health_content(text: str) -> bool:
    """Detect health-policy/statistical articles, not a local incident."""
    value = normalize_text(text or "")
    markers = (
        "rencana aksi", "strategi", "kebijakan", "program", "inovasi",
        "wolbachia", "vaksinasi", "vaksin", "deteksi dini", "deteksi lebih kuat",
        "surveilans", "pencegahan", "prevention", "policy", "strategy",
        "national action plan", "asean dengue day", "zero death",
        "secara nasional", "nasional", "regional", "global", "world",
        "cumulative", "kumulatif", "as of", "per mei", "since january",
        "sejak januari", "menyumbang", "terbesar di dunia",
    )
    return any(marker in value for marker in markers)


def is_explicit_outbreak_report(text: str) -> bool:
    """Return true only for explicit outbreak/cluster/transmission evidence."""
    value = normalize_text(text or "")
    if re.search(r"\b(?:no outbreak|not an outbreak|bukan wabah|tidak ada wabah)\b", value):
        return False
    if re.search(
        r"\b(?:no|not|without|bukan|tidak ada|tidak terdapat|belum ada)\b"
        r".{0,80}\b(?:new|current|local|incident|kejadian|kasus|outbreak|wabah|"
        r"cluster|klaster|transmission|penularan)\b",
        value,
        re.IGNORECASE,
    ):
        return False
    explicit_incident = re.search(
        r"(?:\b(?:outbreak|epidemic|wabah)\b\s*(?:detected|declared|reported|occurred|confirmed|terjadi|dilaporkan|ditetapkan)?|"
        r"\b(?:klb|kejadian luar biasa|cluster|klaster|local transmission|community transmission|"
        r"penularan lokal|transmisi lokal)\b|"
        r"\b(?:surge|spike|melonjak|lonjakan|meningkat tajam)\b.{0,80}\b(?:case|cases|kasus)\b)",
        value,
        re.IGNORECASE,
    )
    if not explicit_incident:
        return False
    # A policy article may mention "outbreak prevention/control" without
    # reporting an outbreak. Require an incident qualifier in that case.
    policy_only = is_policy_or_statistical_health_content(value)
    incident_qualifier = re.search(
        r"\b(?:outbreak|epidemic|wabah|klb|kejadian luar biasa|cluster|klaster)\b"
        r".{0,60}\b(?:detected|declared|reported|occurred|confirmed|terjadi|dilaporkan|ditetapkan|"
        r"reported cases|kasus baru|new cases|transmission|penularan)\b",
        value,
        re.IGNORECASE,
    )
    return not policy_only or bool(incident_qualifier)


def _extract_count(text: str, field: str, default: int) -> int:
    search_text = "".join(
        str(unicodedata.digit(char)) if unicodedata.category(char) == "Nd" else char
        for char in text
    )
    localized_patterns = {
        "case_count": [
            # Do not treat "2.300 orang telah meninggal" as case_count.
            r"\b([0-9][0-9,.]*)\s+(?:warga|pasien|kasus|orang|residents|patients|cases)\b"
            r"(?!\s*(?:telah|sudah|yang|were|was|have|has)?\s*"
            r"(?:meninggal|kematian|tewas|died|death|deaths)\b)",
            # Myanmar daily bulletin: distinguish positive cases from the
            # number of laboratory samples and earlier cumulative totals.
            r"ဓာတ်ခွဲနမူနာ[^။]{0,220}?စစ်ဆေးခဲ့ရာ\s*([0-9][0-9,.]*)\s*ဦးတွေ့ရှိ",
            r"([0-9][0-9,.]*)(?:\s+[a-z-]+){0,3}\s+cases?\b",
            r"(?:ผู้ป่วยใหม่|ผู้ป่วย|ติดเชื้อ)\s*([0-9][0-9,.]*)\s*ราย",
            r"(?:ករណីឆ្លងថ្មី|ករណីឆ្លង|អ្នកឆ្លង)\s*([0-9][0-9,.]*)\s*នាក់",
            r"(?:အတည်ပြုလူနာ|ကူးစက်သူ|လူနာ)\s*([0-9][0-9,.]*)\s*(?:ဦး|ယောက်)",
        ],
        "death_count": [
            r"\b([0-9][0-9,.]*)\s+(?:orang\s+)?(?:telah\s+|sudah\s+)?(?:meninggal(?:\s+dunia)?|kematian|tewas|died|death|deaths)\b",
            r"\b([0-9][0-9,.]*)\s+(?:meninggal|kematian|korban jiwa|death|deaths|killed|died|tewas)\b",
            r"ယမန်နေ့တွင်\s*သေဆုံးသူ\s*([0-9][0-9,.]*)\s*ဦး",
            r"([0-9][0-9,.]*)\s+deaths?\b",
            r"(?:ผู้เสียชีวิต|เสียชีวิต)\s*([0-9][0-9,.]*)\s*ราย",
            r"(?:ករណីស្លាប់|អ្នកស្លាប់)\s*([0-9][0-9,.]*)\s*នាក់",
            r"(?:သေဆုံးသူ|သေဆုံး)\s*([0-9][0-9,.]*)",
        ],
    }
    for pattern in localized_patterns.get(field, []):
        match = re.search(pattern, search_text)
        if match and not (
            match.start(1) > 0
            and search_text[match.start(1) - 1] in ".,0123456789"
        ):
            return _parse_count(match.group(1))
    patterns = config.EXTRACTION_RULES.get(field, [])
    if not patterns:
        return default
    for pattern in patterns:
        match = re.search(pattern, search_text.lower())
        if match and not (
            match.start(1) > 0
            and search_text[match.start(1) - 1] in ".,0123456789"
        ):
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


def has_explicit_case_count(text: str) -> bool:
    """Whether a case number was actually present, excluding the default 1."""
    return _extract_count(text, "case_count", -1) >= 0


def extract_death_count(text: str) -> int:
    return _extract_count(text, "death_count", 0)


def extract_terms(text: str, dictionary: dict[str, str]) -> list[str]:
    lower_text = text.lower()
    return sorted(set(value for key, value in dictionary.items() if key in lower_text))


DISEASE_ALIASES = {
    "โรคเอ็มพ็อกซ์": "MPOX",
    "เอ็มพ็อกซ์": "MPOX",
    "mpox": "MPOX",
    "monkeypox": "MPOX",
}


def extract_diseases(text: str) -> list[str]:
    diseases = set(extract_terms(text, config.DISEASE_DICT))
    lower_text = text.lower()
    diseases.update(value for key, value in DISEASE_ALIASES.items() if key in lower_text)
    
    def disease_score(d: str) -> tuple[int, int]:
        d_lower = d.lower()
        cnt = lower_text.count(d_lower)
        pos = lower_text.find(d_lower)
        if pos == -1:
            pos = 999999
        return (-cnt, pos)

    return sorted(diseases, key=disease_score)


def extract_alias_diseases(text: str) -> list[str]:
    """Return high-precision explicit aliases, primarily for title matching."""
    lower_text = text.lower()
    return sorted(set(
        value for key, value in DISEASE_ALIASES.items() if key in lower_text
    ))


MONTH_MAP = {
    # Indonesian / Malay
    "januari": 1, "februari": 2, "maret": 3, "mac": 3, "april": 4, "mei": 5,
    "juni": 6, "julai": 7, "juli": 7, "agustus": 8, "ogos": 8, "september": 9,
    "oktober": 10, "november": 11, "nopember": 11, "desember": 12, "disember": 12,
    # English
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
    # Short
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def extract_date_from_text(text: str) -> Optional[str]:
    if not text:
        return None
    sample = text[:1000]
    # ISO date: 2026-08-27 or 2026/08/27
    m = re.search(r'\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b', sample)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    # Day Month Year (supports hyphens, slashes, spaces): e.g. "26-May-2025", "27 Agustus 2026"
    m = re.search(r'\b(0?[1-9]|[12]\d|3[01])[-/\s]+([A-Za-z]{3,12})[-/\s]+(20\d{2})\b', sample)
    if m:
        month_str = m.group(2).lower()
        if month_str in MONTH_MAP:
            return f"{m.group(3)}-{MONTH_MAP[month_str]:02d}-{int(m.group(1)):02d}"
    # Month Day, Year: e.g. "May 26, 2025", "August 27, 2026"
    m = re.search(r'\b([A-Za-z]{3,12})[-/\s]+(0?[1-9]|[12]\d|3[01]),?[-/\s]+(20\d{2})\b', sample)
    if m:
        month_str = m.group(1).lower()
        if month_str in MONTH_MAP:
            return f"{m.group(3)}-{MONTH_MAP[month_str]:02d}-{int(m.group(2)):02d}"
    return None
