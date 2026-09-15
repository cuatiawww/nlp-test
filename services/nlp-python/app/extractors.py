import logging
import os
import re
import unicodedata


def strip_diacritics(s: str) -> str:
    """Normalize and remove diacritics/tone marks for robust multilingual matching."""
    if not s:
        return ""
    normalized = unicodedata.normalize("NFKD", s)
    return "".join(c for c in normalized if not unicodedata.combining(c))

from collections import Counter
from typing import Optional
from . import config


def normalize_disease_display(disease: str, language: str = "unknown", text: str = "") -> str:
    """Normalize model/database labels to one stable disease display name.

    Classifier labels are legacy strings (for example ``coronavirus MERS``)
    while the disease master contains reviewed ICD-11 names.  This function is
    deliberately deterministic and conservative: taxonomy words such as
    ``Viral`` are not diseases and therefore become ``UNKNOWN``.
    """
    raw = (disease or "").strip()
    if not raw:
        return "UNKNOWN"

    key = re.sub(r"[^a-z0-9]+", " ", strip_diacritics(raw).lower()).strip()
    key = re.sub(r"\s+", " ", key)
    generic_terms = {
        "viral", "virus", "bacterial", "bacteria", "infection",
        "infectious disease", "penyakit menular", "unknown", "unknown disease",
    }
    if key in generic_terms or (key and set(key.split()) <= generic_terms):
        return "UNKNOWN"

    # Reviewed display names. Keep aliases below in one place so old model
    # labels and multilingual keyword targets converge before persistence.
    canonical_aliases = {
        "covid": "COVID-19",
        "covid 19": "COVID-19",
        "covid19": "COVID-19",
        "covid 19 coronavirus": "COVID-19",
        "covid coronavirus": "COVID-19",
        "coronavirus": "COVID-19",
        "coronavirus mers": "Middle East Respiratory Syndrome (MERS)",
        "mers": "Middle East Respiratory Syndrome (MERS)",
        "mers cov": "Middle East Respiratory Syndrome (MERS)",
        "middle east respiratory syndrome": "Middle East Respiratory Syndrome (MERS)",
        "middle east respiratory syndrome mers": "Middle East Respiratory Syndrome (MERS)",
        "dengue": "Dengue",
        "dengue fever dbd": "Dengue",
        "dbd": "Dengue",
        "demam berdarah": "Dengue",
        "acute diarrhea": "Acute diarrhea",
        "diare akut": "Acute diarrhea",
        "influenza": "Influenza",
        "influenza flu": "Influenza",
        "flu": "Influenza",
        "influenza virus not identified": "Influenza",
        "tuberculosis": "Tuberculosis",
        "tuberculosis tb": "Tuberculosis",
        "tbc": "Tuberculosis",
        "campak": "Measles",
        "measles": "Measles",
        "measles campak": "Measles",
        "hantavirus": "Hantavirus infection",
        "hantavirus infection": "Hantavirus infection",
        "avian influenza": "Avian influenza",
        "avian influenza h5n1": "Avian influenza",
        "h5n1": "Avian influenza",
        "flu burung": "Avian influenza",
        "bird flu": "Avian influenza",
        "hfmd": "Hand, foot and mouth disease",
        "mpox": "Mpox",
        "monkeypox": "Mpox",
    }
    return canonical_aliases.get(key, raw)

def repair_mojibake(text: str) -> str:
    """Repair UTF-8 bytes that were accidentally decoded as Latin-1."""
    if not text:
        return text
    markers = ("Ã", "Â", "Ä", "Æ", "á»", "áº", "â", "ð")
    before = sum(text.count(marker) for marker in markers)
    if before == 0:
        return text
    try:
        candidate = text.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text
    after = sum(candidate.count(marker) for marker in markers)
    return candidate if after < before else text


def normalize_text(text: str) -> str:
    text = repair_mojibake(text or "").lower()
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
    "lao people's democratic republic": "Laos",
    "lao people s democratic republic": "Laos",
    "malaysia": "Malaysia",
    "myanmar": "Myanmar",
    "burma": "Myanmar",
    "philippines": "Philippines",
    "the philippines": "Philippines",
    "singapore": "Singapore",
    "singapura": "Singapore",
    "kamboja": "Cambodia",
    "filipina": "Philippines",
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
    "united states of america": "United States",
    "united states": "United States",
    "u.s.a.": "United States",
    "u.s.": "United States",
    "usa": "United States",
    "us": "United States",
    "amerika serikat": "United States",
    "mexico": "Mexico",
    "meksiko": "Mexico",
    "canada": "Canada",
    "kanada": "Canada",
    "brazil": "Brazil",
    "brasil": "Brazil",
    "united kingdom": "United Kingdom",
    "uk": "United Kingdom",
    "britain": "United Kingdom",
    "great britain": "United Kingdom",
    "inggris": "United Kingdom",
    "germany": "Germany",
    "jerman": "Germany",
    "france": "France",
    "prancis": "France",
    "spain": "Spain",
    "spanyol": "Spain",
    "italy": "Italy",
    "italia": "Italy",
    "russia": "Russia",
    "rusia": "Russia",
    "china": "China",
    "tiongkok": "China",
    "india": "India",
    "japan": "Japan",
    "jepang": "Japan",
    "south korea": "South Korea",
    "korea selatan": "South Korea",
    "australia": "Australia",
    "new zealand": "New Zealand",
    "pakistan": "Pakistan",
    "bangladesh": "Bangladesh",
    "nigeria": "Nigeria",
    "south africa": "South Africa",
    "egypt": "Egypt",
    "saudi arabia": "Saudi Arabia",
}

# Publisher shorthand is common in Vietnamese news headlines. Keep these
# aliases local and deterministic so a title such as "TP.HCM" resolves to the
# gazetteer city instead of falling back to the country only.
LOCATION_ALIASES = {
    "tp.hcm": "Ho Chi Minh City",
    "tp hcm": "Ho Chi Minh City",
    "tphcm": "Ho Chi Minh City",
    "hồ chí minh": "Ho Chi Minh City",
    "ho chi minh": "Ho Chi Minh City",
    "thành phố hồ chí minh": "Ho Chi Minh City",
    "thanh pho ho chi minh": "Ho Chi Minh City",
}

CONTINENT_AND_REGION_LABELS = {
    "asia", "africa", "europe", "oceania", "antarctica",
    "southeast asia", "south east asia", "east asia", "south asia",
    "west asia", "central asia", "north america", "south america",
    "central america", "middle east", "asean", "asean / asia",
}

_PUBLISHER_FOLLOWER = re.compile(
    r"^\s*(?:news(?:\s+network)?|times|post|tribune|herald|daily|network|media|online)\b",
    re.IGNORECASE,
)


def is_usable_place_name(name: str, surrounding_text: str = "", start: int = 0) -> bool:
    """Reject continents, function words, and publisher brands such as Asia News Network."""
    raw = (name or "").strip()
    if not raw:
        return False
    folded = _fold_location_text(raw)
    if folded in CONTINENT_AND_REGION_LABELS or folded in config.LOCATION_STOPWORDS:
        return False
    # One-word English auxiliaries are never provinces, even when capitalized
    # at the start of a sentence ("Were monitoring the farm outbreaks").
    if " " not in folded and folded.isascii() and folded in config.LOCATION_STOPWORDS:
        return False
    if surrounding_text:
        after = surrounding_text[start + len(raw): start + len(raw) + 48]
        if _PUBLISHER_FOLLOWER.match(after):
            return False
        window = surrounding_text[max(0, start - 12): start + len(raw) + 28]
        if folded == "asia" and re.search(r"asianews|asia\s+news", window, re.I):
            return False
    return True


def normalize_country(value: Optional[str]) -> Optional[str]:
    """Normalize a supplied country hint without confusing organizations with countries."""
    raw = (value or "").strip()
    if not raw:
        return None
    folded = _fold_location_text(raw)
    for alias, standard in COUNTRY_ALIASES.items():
        if folded == _fold_location_text(alias):
            return standard
    return raw


def extract_country_hint(text: str) -> Optional[str]:
    lower_text = (text or "").lower()
    if not lower_text.strip():
        return None
    contextual = re.compile(
        r"(?:including|includes|compared with|compared to|higher than|lower than|"
        r"both|between|across|regional partners|countries in|in contrast to|with\s+[a-z,\s]+and|than that of)",
        re.IGNORECASE,
    )
    country_scores: dict[str, float] = {}
    for alias, standard_country in COUNTRY_ALIASES.items():
        pattern = re.compile(rf"\b{re.escape(alias)}\b", re.IGNORECASE)
        matches = list(pattern.finditer(lower_text))
        if not matches:
            continue
        score = float(len(matches) * 3)
        if any(m.start() < 300 for m in matches):
            score += 10.0
        for m in matches:
            pos = m.start()
            if contextual.search(lower_text[max(0, pos - 80):pos]):
                score -= 3.0
        # Accumulate score across aliases for the same country (do not clobber)
        country_scores[standard_country] = country_scores.get(standard_country, 0.0) + score

    if not country_scores:
        return None

    # ASEAN surveillance platform bonus: prioritize ASEAN member states
    # in the title/lede so a Utah/USA secondary clause cannot beat Cambodia.
    opening = lower_text[:800]
    for c in list(country_scores.keys()):
        if c in config.ASEAN_COUNTRIES:
            country_scores[c] += 5.0
            if any(alias in opening for alias, standard in COUNTRY_ALIASES.items() if standard == c):
                country_scores[c] += 8.0

    return max(country_scores.keys(), key=lambda k: country_scores[k])


def country_scope(country: Optional[str]) -> Optional[str]:
    """Return the display/filter country without relabeling known ASEAN data."""
    value = (country or "").strip()
    if not value:
        return None
    if value in config.ASEAN_COUNTRIES:
        return value
    return config.OUTSIDE_ASEAN_COUNTRY


WHO_STOPWORDS = {
    "infectious", "without", "specification", "agent", "unspecified", "organism",
    "exposure", "harmful", "effects", "vaccines", "identified", "syndrome",
    "disease", "virus", "fever", "human", "late", "acute", "with", "from", "other",
    "diseases", "infections", "prevention", "control", "statement", "period", "under",
    "case", "cases", "death", "deaths", "health", "medical"
}


def _normalize_entity_text(value: str) -> str:
    """Normalize entity text while retaining Unicode scripts (Thai/Lao/Khmer)."""
    folded = strip_diacritics((value or "").casefold())
    folded = folded.replace("_", " ")
    return re.sub(r"[^\w]+", " ", folded, flags=re.UNICODE).strip()

def extract_who_disease_mentions(text: str, concepts: list[dict]) -> list[str]:
    """Match explicit WHO concept names and their clean specific variants."""
    value = _normalize_entity_text(text)
    mentions: list[str] = []
    for concept in concepts:
        canonical = str(concept.get("canonical_name") or "").strip()
        english = str(concept.get("english_name") or "").strip()
        terms = set()
        for name in (canonical, english):
            full_folded = _normalize_entity_text(name)
            if full_folded and full_folded not in WHO_STOPWORDS and len(full_folded) >= 4:
                terms.add(full_folded)
            for sub in re.split(r"[/,()]", name):
                t = _normalize_entity_text(sub)
                if len(t) >= 4 and t not in WHO_STOPWORDS:
                    terms.add(t)
            for token in full_folded.split():
                if len(token) >= 4 and token not in WHO_STOPWORDS and any(c.isdigit() for c in token):
                    terms.add(token)
        for alias_item in concept.get("aliases") or []:
            alias = alias_item.get("alias") if isinstance(alias_item, dict) else alias_item
            alias_clean = _normalize_entity_text(str(alias or ""))
            if len(alias_clean) >= 4 and alias_clean not in WHO_STOPWORDS:
                terms.add(alias_clean)

        for term in sorted(terms, key=len, reverse=True):
            if re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", value):
                mentions.append(canonical)
                break
    return sorted(set(mentions))


def canonicalize_who_disease_labels(labels: list[str], concepts: list[dict]) -> list[str]:
    """Map local keyword labels (e.g. KOLERA/MEASLES/AVIAN_INFLUENZA) to WHO canonicals."""
    matched = []
    for label in labels:
        lbl_clean = _normalize_entity_text(label)
        if not lbl_clean:
            continue
        for concept in concepts:
            canonical = str(concept.get("canonical_name") or "").strip()
            english = str(concept.get("english_name") or "").strip()
            can_clean = _normalize_entity_text(canonical)
            eng_clean = _normalize_entity_text(english)

            if lbl_clean == can_clean or lbl_clean == eng_clean:
                matched.append(canonical)
                break
            if len(lbl_clean) >= 4 and (lbl_clean in can_clean or lbl_clean in eng_clean or can_clean in lbl_clean):
                matched.append(canonical)
                break
            for alias_item in concept.get("aliases") or []:
                alias = alias_item.get("alias") if isinstance(alias_item, dict) else alias_item
                alias_clean = _normalize_entity_text(str(alias or ""))
                if alias_clean and (lbl_clean == alias_clean or (len(lbl_clean) >= 4 and lbl_clean in alias_clean)):
                    matched.append(canonical)
                    break
            else:
                continue
            break
    return sorted(set(matched))


def canonical_disease_name(disease: str, concepts: Optional[list[dict]] = None) -> str:
    """Return the active ICD-11 master name for a legacy/model label."""
    normalized = normalize_disease_display(disease)
    if normalized == "UNKNOWN":
        return normalized
    active_concepts = config.WHO_DISEASE_CONCEPTS if concepts is None else concepts
    matched = canonicalize_who_disease_labels([normalized], active_concepts)
    return matched[0] if matched else normalized

def extract_location(text: str, country: Optional[str] = None) -> Optional[str]:
    text = repair_mojibake(text or "")
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

    # Resolve curated publisher abbreviations before matching the generic
    # gazetteer regex. The canonical target still has to exist in the loaded
    # location table and match the country restriction.
    for alias, canonical in LOCATION_ALIASES.items():
        if canonical not in allowed_names:
            continue
        for match in re.finditer(re.escape(alias), compact_text, re.IGNORECASE):
            if not is_usable_place_name(canonical, compact_text, match.start()):
                continue
            hits.append((canonical, match.start()))

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
                if loc.lower() == "mexico" and raw_position >= 4 and compact_text[raw_position - 4:raw_position].lower() == "new ":
                    continue
            if not is_usable_place_name(loc, compact_text, raw_position):
                continue
            hits.append((loc, match.start()))

    if not hits:
        return None

    # Smart weighted scoring for candidate locations:
    # 1. Base score = frequency in text * 3
    # 2. Bonus if in headline / opening paragraph (pos < 200) = +4
    # 3. Specificity bonus for multi-word or distinct city names = +1
    # 4. Penalty if inside comparative phrasing ("in contrast to Singapore", "including Thailand") = -5
    contextual = re.compile(
        r"(?:including|includes|compared with|compared to|higher than|lower than|"
        r"both|between|across|regional partners|countries in|in contrast to)",
        re.IGNORECASE,
    )
    counts = Counter(loc for loc, _ in hits)
    scored: dict[str, float] = {}
    alias_names = {loc for loc, _ in hits if any(
        canonical == loc and re.search(re.escape(alias), compact_text, re.IGNORECASE)
        for alias, canonical in LOCATION_ALIASES.items()
    )}

    for loc, pos in hits:
        if loc not in scored:
            score = float(counts[loc] * 3)
            if any(p < 200 for l, p in hits if l == loc):
                score += 4.0
            if " " in loc or len(loc) > 6:
                score += 1.0
            if loc in alias_names:
                # Publisher abbreviations in a headline are much stronger
                # evidence than accidental one-word gazetteer matches.
                score += 20.0
            loc_country = config.LOCATION_COUNTRIES.get(loc, "")
            if loc_country in config.ASEAN_COUNTRIES or loc in config.ASEAN_COUNTRIES:
                score += 12.0
            if contextual.search(lower_text[max(0, pos - 80):pos]):
                score -= 5.0
            scored[loc] = score

    if not scored:
        return hits[0][0]

    return max(
        scored.keys(),
        key=lambda loc_name: (
            scored[loc_name],
            -min((p for l, p in hits if l == loc_name), default=999999)
        )
    )


def extract_all_locations(text: str, country: Optional[str] = None) -> list[dict]:
    """Extract all distinct valid locations mentioned in the text with coordinates."""
    text = repair_mojibake(text or "")
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

    for alias, canonical in LOCATION_ALIASES.items():
        if canonical not in allowed_names:
            continue
        for match in re.finditer(re.escape(alias), compact_text, re.IGNORECASE):
            if not is_usable_place_name(canonical, compact_text, match.start()):
                continue
            hits.append((canonical, match.start()))

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
                if loc.lower() == "mexico" and raw_position >= 4 and compact_text[raw_position - 4:raw_position].lower() == "new ":
                    continue
            if not is_usable_place_name(loc, compact_text, raw_position):
                continue
            hits.append((loc, match.start()))

    if not hits:
        return []

    primary = extract_location(text, country=country)
    counts = Counter(loc for loc, _ in hits)
    distinct_names = sorted(
        counts.keys(),
        key=lambda name: (
            1 if name == primary else 0,
            1 if (
                config.LOCATION_COUNTRIES.get(name) in config.ASEAN_COUNTRIES
                or name in config.ASEAN_COUNTRIES
            ) else 0,
            counts[name],
            len(name),
        ),
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
        "conference", "congress", "hội nghị", "dự phòng", "phòng ngừa",
        "tầm soát", "cộng đồng", "mô hình", "chương trình",
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
        r"\b(?:no\s+(?:new\s+)?(?:cases?|outbreaks?|infections?|clusters?|transmission)|tidak\s+ada\s+(?:kasus|wabah|klb|penularan))\b",
        value,
        re.IGNORECASE,
    ):
        return False
    explicit_incident = re.search(
        r"(?:\b(?:outbreaks?|epidemics?|wabah|klb|kejadian luar biasa|clusters?|klasters?|local transmission|community transmission|penularan lokal|transmisi lokal)\b|"
        r"\b(?:surge|spike|melonjak|lonjakan|meningkat tajam|increase in|peningkatan)\b.{0,80}\b(?:cases?|kasus|infections?)\b)",
        value,
        re.IGNORECASE,
    )
    if not explicit_incident:
        return False
    policy_only = is_policy_or_statistical_health_content(value)
    incident_qualifier = re.search(
        r"\b(?:outbreaks?|epidemics?|wabah|klb|kejadian luar biasa|clusters?|klasters?|spikes?|surges?|lonjakan|peningkatan tajam)\b"
        r".{0,80}\b(?:detected|declared|reported|occurred|confirmed|terjadi|dilaporkan|ditetapkan|"
        r"reported cases|kasus baru|new cases|transmission|penularan|cases?|kasus|infections?)\b",
        value,
        re.IGNORECASE,
    )
    return not policy_only or bool(incident_qualifier)


def is_outbreak_content(text: str) -> bool:
    """Backward-compatible name for explicit outbreak detection."""
    return is_explicit_outbreak_report(text)


def _sentence_window(text: str, start: int, end: int) -> str:
    left = text.rfind(".", 0, start)
    right = text.find(".", end)
    left = 0 if left < 0 else left + 1
    right = len(text) if right < 0 else right
    return text[left:right]


def _extract_count(text: str, field: str, default: int, disease: Optional[str] = None) -> int:
    search_text = "".join(
        str(unicodedata.digit(char)) if unicodedata.category(char) == "Nd" else char
        for char in text
    )
    disease_terms: list[str] = []
    if disease:
        disease_terms = [t for t in {
            disease.strip().lower(),
            *(disease.strip().lower().split()),
        } if len(t) > 2]
    localized_patterns = {
        "case_count": [
            r"\b([0-9][0-9,.]*)(?:\s+[a-z\u00C0-\u024F\u1EA0-\u1EFF-]+){0,3}\s+(?:cases?|infections?|patients?|warga|kasus|pasien|residents?|ca\s+mắc|ca\s+nhiễm|ca|trường\s+hợp|bệnh\s+nhân)\b"
            r"(?!\s*(?:telah|sudah|yang|were|was|have|has)?\s*"
            r"(?:meninggal|kematian|tewas|died|death|deaths|fatalities|tử\s+vong)\b)",
            r"(?:cases?|infections?|kasus|patients?|warga)\s*(?:of\s+[a-z-]+\s*)?\(\s*([0-9][0-9,.]*)\s*\)",
            r"(?:with|logged|recorded|reported|total of|mencatat|melaporkan|sebanyak|ghi\s+nhận|có)\s+([0-9][0-9,.]*)\s+(?:[a-z\u00C0-\u024F\u1EA0-\u1EFF-]+\s+)?(?:infections?|cases?|kasus|warga|pasien|ca\s+mắc|ca)",
            r"\b([0-9][0-9,.]*)\s+(?:[a-z-]+\s+)?(?:outbreaks?|wabah|klaster|clusters?)\b",
            r"ဓာတ်ခွဲနမူနာ[^။]{0,220}?စစ်ဆေးခဲ့ရာ\s*([0-9][0-9,.]*)\s*ဦးတွေ့ရှိ",
            r"(?:ผู้ป่วยใหม่|ผู้ป่วย|ติดเชื้อ)\s*([0-9][0-9,.]*)\s*ราย",
            r"(?:ករណីឆ្លងថ្មី|ករណីឆ្លង|អ្នកឆ្លង)\s*([0-9][0-9,.]*)\s*នាក់",
            r"(?:အတည်ပြုလူနာ|ကူးစက်သူ|လူနာ)\s*([0-9][0-9,.]*)\s*(?:ဦး|ယောက်)",
        ],
        "death_count": [
            r"(?:deaths?|kematian|korban jiwa|fatalities)\s+(?:rose|climbed|increased|jumped|meningkat|naik|bertambah)\s+(?:from\s+[0-9,.]+\s+)?to\s+([0-9][0-9,.]*)",
            r"\b([0-9][0-9,.]*)(?:\s+[a-z-]+){0,3}\s+(?:meninggal(?:\s+dunia)?|kematian|korban jiwa|death|deaths|fatalities|fatality|tewas|died|killed)\b",
            r"(?:logged|recorded|reported|mencatat|sebanyak)\s+([0-9][0-9,.]*)\s+(?:[a-z-]+\s+)?(?:deaths?|kematian|fatalities)",
            r"ယမန်နေ့တွင်\s*သေဆုံးသူ\s*([0-9][0-9,.]*)\s*ဦး",
            r"(?:ผู้เสียชีวิต|เสียชีวิต)\s*([0-9][0-9,.]*)\s*ราย",
            r"(?:ករណីស្លាប់|អ្នកស្លាប់)\s*([0-9][0-9,.]*)\s*នាក់",
            r"(?:သေဆုံးသူ|သေဆုံး)\s*([0-9][0-9,.]*)",
        ],
    }
    candidates: list[tuple[int, int, int]] = []
    for pattern in localized_patterns.get(field, []):
        for match in re.finditer(pattern, search_text, re.IGNORECASE):
            if not (
                match.start(1) > 0
                and search_text[match.start(1) - 1] in ".,0123456789"
            ):
                try:
                    parsed = _parse_count(match.group(1), match.group(0))
                    if parsed is None:
                        continue
                    window = _sentence_window(search_text, match.start(), match.end()).lower()
                    score = 1
                    if disease_terms and any(term in window for term in disease_terms):
                        score += 12
                    if re.search(r"\b(?:recorded|confirmed|reported|logged|mencatat|melaporkan)\b", window):
                        score += 3
                    if re.search(r"\b(?:cumulative|kumulatif|since \d{4}|population)\b", window):
                        score -= 4
                    candidates.append((score, match.start(), parsed))
                except Exception:
                    continue

    patterns = config.EXTRACTION_RULES.get(field, [])
    if patterns:
        for pattern in patterns:
            for match in re.finditer(pattern, search_text.lower()):
                if not (
                    match.start(1) > 0
                    and search_text[match.start(1) - 1] in ".,0123456789"
                ):
                    try:
                        parsed = _parse_count(match.group(1), match.group(0))
                        if parsed is None:
                            continue
                        window = _sentence_window(search_text, match.start(), match.end()).lower()
                        score = 0
                        if disease_terms and any(term in window for term in disease_terms):
                            score += 12
                        candidates.append((score, match.start(), parsed))
                    except Exception:
                        continue
    if not candidates:
        return default
    if disease_terms:
        scoped = [item for item in candidates if item[0] >= 12]
        if scoped:
            candidates = scoped
    best = max(candidates, key=lambda item: (item[0], -item[1]))
    return best[2]


def _parse_count(value: str, context: str = "") -> Optional[int]:
    """Safely parse count string to int, supporting decimals, multipliers, and formatting."""
    try:
        if not value:
            return None
        val = value.strip().strip(".,;:()[]{}")
        if not val:
            return None

        # Exclude percentage rates and per-capita incidence contexts
        ctx_lower = (context or "").lower()
        if ctx_lower and re.search(r"(?:%|persen|percent|peratus|pc|pct)\b", ctx_lower):
            return None
        if ctx_lower and re.search(
            r"\bper\s+(?:100|1000|10\.000|100\.000|10,000|100,000|seribu|ribu|thousand|penduduk|populasi|capita|orang|warga)\b",
            ctx_lower,
        ):
            return None

        # Determine multiplier from context. Billion-scale figures are treated as
        # population/budget/OCR noise for case and death extraction — never as counts.
        multiplier = 1
        if ctx_lower:
            if re.search(r"\b(?:miliar|milyar|billion|tỷ)\b", ctx_lower) or re.search(r"\d\s*(?:b|mld)\b", ctx_lower):
                return None
            elif re.search(r"\b(?:juta|million|triệu|lakh|crore|ล้าน|លាន|သန်း)\b", ctx_lower) or re.search(r"\d\s*m\b", ctx_lower):
                multiplier = 1_000_000
            elif re.search(r"\b(?:ribu|thousand|nghìn|ngàn|พัน|ពាន់|သိန်း)\b", ctx_lower) or re.search(r"\d\s*k\b", ctx_lower):
                multiplier = 1_000

        max_count = int(os.getenv("MAX_EVENT_CASE_COUNT", "2000000"))

        def _bounded(value: int):
            if value > max_count:
                return None
            return max(0, value)

        # Calendar years are not case/death totals. "among 2026 cases" and
        # "in 2026 so far" must not bind the reporting year as a count.
        if multiplier == 1 and re.fullmatch(r"(?:19|20)\d{2}", val):
            return None

        # Case 1: Standard thousands separator (e.g. 19,313 or 10.000 or 1,000,000 or 1.000.000)
        if re.fullmatch(r"\d{1,3}(?:[,.]\d{3})+", val):
            clean_int = re.sub(r"[,.]", "", val)
            return _bounded(int(clean_int) * multiplier)

        # Case 2: Pure integer digits
        if re.fullmatch(r"\d+", val):
            return _bounded(int(val) * multiplier)

        # Case 3: Decimal numbers (e.g. '2.1' or '2,1' or '12.5')
        norm_val = val
        if norm_val.count(",") == 1 and "." not in norm_val:
            norm_val = norm_val.replace(",", ".")
        elif norm_val.count(".") == 1 and "," not in norm_val:
            pass

        try:
            num_float = float(norm_val)
            if multiplier > 1:
                return _bounded(int(round(num_float * multiplier)))
            return _bounded(int(round(num_float)))
        except (ValueError, OverflowError):
            pass

        # Case 4: General fallback - clean non-digits except period
        clean_fallback = re.sub(r"[^\d.,]", "", val).strip(".,")
        if re.fullmatch(r"\d{1,3}(?:[,.]\d{3})+", clean_fallback):
            clean_fallback = re.sub(r"[,.]", "", clean_fallback)
        else:
            if clean_fallback.count(",") == 1 and "." not in clean_fallback:
                clean_fallback = clean_fallback.replace(",", ".")
            clean_fallback = re.sub(r"[^\d.]", "", clean_fallback)
        try:
            return _bounded(int(round(float(clean_fallback) * multiplier)))
        except Exception:
            return None
    except Exception:
        return None


def extract_case_count(text: str, disease: Optional[str] = None) -> int:
    try:
        default = int(os.getenv("DEFAULT_CASE_COUNT", "0"))
    except (ValueError, TypeError):
        default = 0
    default = max(0, default)
    try:
        parsed = _extract_count(text, "case_count", default, disease=disease)
        max_count = int(os.getenv("MAX_EVENT_CASE_COUNT", "2000000"))
        if parsed is None or parsed > max_count:
            return default
        return max(0, int(parsed))
    except Exception:
        return default


def has_explicit_case_count(text: str, disease: Optional[str] = None) -> bool:
    """Whether a case number was actually present, excluding the default."""
    try:
        return _extract_count(text, "case_count", -1, disease=disease) >= 0
    except Exception:
        return False


def extract_death_count(text: str) -> int:
    try:
        parsed = _extract_count(text, "death_count", 0)
        max_count = int(os.getenv("MAX_EVENT_DEATH_COUNT", "200000"))
        if parsed is None or parsed > max_count:
            return 0
        return max(0, int(parsed))
    except Exception:
        return 0


def extract_terms(text: str, dictionary: dict[str, str]) -> list[str]:
    lower_text = text.lower()
    stripped_text = strip_diacritics(lower_text)
    combined = lower_text + " " + stripped_text
    matches = set()
    for key, value in dictionary.items():
        k = key.lower()
        if len(k) <= 4 and re.match(r"^[a-z0-9]+$", k):
            if re.search(rf"\b{re.escape(k)}\b", combined):
                matches.add(value)
        else:
            if k in combined or strip_diacritics(k) in stripped_text:
                matches.add(value)
    return sorted(matches)


DISEASE_ALIASES = {
    "stroke": "Stroke",
    "cerebrovascular accident": "Stroke",
    "cerebrovascular disease": "Stroke",
    "penyakit stroke": "Stroke",
    "penyakit serebrovaskular": "Stroke",
    "đột quỵ": "Stroke",
    "dot quy": "Stroke",
    "đột quị": "Stroke",
    "hfmd": "HFMD",
    "hand, foot and mouth disease": "HFMD",
    "hand foot and mouth disease": "HFMD",
    "hand foot mouth disease": "HFMD",
    "hand foot mouth": "HFMD",
    "hand, foot, and mouth": "HFMD",
    "flu singapura": "HFMD",
    "penyakit tangan, kaki dan mulut": "HFMD",
    "penyakit tangan kaki dan mulut": "HFMD",
    "penyakit tangan kaki mulut": "HFMD",
    "bệnh tay chân miệng": "HFMD",
    "tay chân miệng": "HFMD",
    "โรคมือเท้าปาก": "HFMD",
    "มือเท้าปาก": "HFMD",
    "โรคเอ็มพ็อกซ์": "MPOX",
    "เอ็มพ็อกซ์": "MPOX",
    "mpox": "MPOX",
    "monkeypox": "MPOX",
    "campak": "Measles",
    "measles": "Measles",
    "dbd": "Dengue",
    "dengue": "Dengue",
    "demam berdarah": "Dengue",
    "hantavirus": "Hantavirus infection",
    "h5n1": "Avian influenza",
    "flu burung": "Avian influenza",
    "dengue fever": "DBD",
    "dengue hemorrhagic fever": "DBD",
    "dengue haemorrhagic fever": "DBD",
    "haemorrhagic fever": "DBD",
    "hemorrhagic fever": "DBD",
    "breakbone fever": "DBD",
    "avian influenza": "flu burung",
    "bird flu": "flu burung",
    "swine flu": "flu babi",
    "whooping cough": "pertussis",
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
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "mei": 5, "jun": 6, "jul": 7,
    "ags": 8, "agst": 8, "agu": 8, "aug": 8, "sep": 9, "okt": 10,
    "oct": 10, "nov": 11, "des": 12, "dec": 12,
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


NAV_BOILERPLATE_PATTERNS = [
    r"\b(disease reports|about|resources|blog|errata|contact us|subscribe)\b",
    r"\b(privacy policy|terms of service|all rights reserved|copyright|cookie policy)\b",
    r"\b(sign in|sign up|log in|register|my account|navigation|menu)\b",
]


def is_content_too_short_or_noisy(text: str, has_health_indicators: bool = False) -> bool:
    """Detect uninformative, navigation-only, or broken feed snippets.

    If text has explicit health indicators (e.g. recognized disease or symptoms),
    it is allowed to be shorter (e.g. short official alerts).
    """
    if not text:
        return True

    clean = re.sub(r"<[^>]+>", " ", text).strip()
    words = clean.split()

    if not words:
        return True

    word_count = len(words)

    if word_count < 4:
        return True

    raw_tag_count = len(re.findall(r"</?[a-z0-9]+(?:\s+[^>]*)?>", text, re.IGNORECASE))
    if raw_tag_count > 2 and word_count < 25 and not has_health_indicators:
        return True

    if word_count < 15 and not has_health_indicators:
        return True

    lower_clean = clean.lower()
    nav_matches = 0
    for pattern in NAV_BOILERPLATE_PATTERNS:
        nav_matches += len(re.findall(pattern, lower_clean))

    if word_count > 0 and (nav_matches * 2 / word_count) > 0.35 and not has_health_indicators:
        return True

    return False
