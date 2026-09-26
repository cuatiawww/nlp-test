import functools
import logging
import os
import re
import time
import unicodedata
from contextvars import ContextVar


def strip_diacritics(s: str) -> str:
    """Normalize and remove diacritics/tone marks for robust multilingual matching."""
    if not s:
        return ""
    normalized = unicodedata.normalize("NFKD", s)
    return "".join(c for c in normalized if not unicodedata.combining(c))

from collections import Counter
from typing import Optional, Any, Iterable
from . import config
from .multilingual import detect_language_profile, normalize_language_code


def normalize_disease_display(disease: str, language: str = "unknown", text: str = "") -> str:
    """Normalize model/database labels to one stable disease display name.

    Classifier labels are legacy strings (for example ``coronavirus MERS``)
    while the disease master contains reviewed local names.  This function is
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
        "ebola": "Ebola disease, virus unspecified",
        "ebola disease": "Ebola disease, virus unspecified",
        "ebola virus": "Ebola disease, virus unspecified",
        "ebola virus disease": "Ebola disease, virus unspecified",
        "evd": "Ebola disease, virus unspecified",
        "virus ebola": "Ebola disease, virus unspecified",
        "penyakit ebola": "Ebola disease, virus unspecified",
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
    "rsv": "Respiratory syncytial virus infection",
    "respiratory syncytial": "Respiratory syncytial virus infection",
    "respiratory syncytial virus": "Respiratory syncytial virus infection",
    "nipah": "Nipah virus disease",
    "nipah virus": "Nipah virus disease",
    "cancer": "Cancer",
    "heart attack": "Heart attack",
        "tuberculosis": "Tuberculosis",
        "tuberculosis tb": "Tuberculosis",
        "tbc": "Tuberculosis",
        "campak": "Measles",
        "measles": "Measles",
        "measles campak": "Measles",
        "mumps": "Mumps",
        "gondongan": "Mumps",
        "parotitis": "Mumps",
        "beguk": "Mumps",
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
        "ispa": "Acute Respiratory Infection (ARI/ISPA)",
        "ari": "Acute Respiratory Infection (ARI/ISPA)",
        "infeksi saluran pernapasan akut": "Acute Respiratory Infection (ARI/ISPA)",
        "infeksi saluran pernafasan akut": "Acute Respiratory Infection (ARI/ISPA)",
        "acute respiratory infection": "Acute Respiratory Infection (ARI/ISPA)",
        "upper respiratory infection": "Acute Respiratory Infection (ARI/ISPA)",
        "upper respiratory tract infection": "Acute Respiratory Infection (ARI/ISPA)",
        "lower respiratory infection": "Acute Respiratory Infection (ARI/ISPA)",
        "pneumonia": "Pneumonia",
        "radang paru": "Pneumonia",
        "hepatitis": "Hepatitis",
        "hepatitis a": "Hepatitis A",
        "hepatitis b": "Hepatitis B",
        "diare": "Acute diarrhea",
        "diarrhea": "Acute diarrhea",
        "diarrhoea": "Acute diarrhea",
        "typhoid": "Typhoid fever",
        "tifus": "Typhoid fever",
        "typhoid fever": "Typhoid fever",
        "demam tifoid": "Typhoid fever",
        "tipes": "Typhoid fever",
        "chikungunya": "Chikungunya",
        "leptospirosis": "Leptospirosis",
        "filariasis": "Filariasis",
        "kaki gajah": "Filariasis",
        "scabies": "Scabies",
        "kudis": "Scabies",
        "tetanus": "Tetanus",
        "pertusis": "Pertussis",
        "pertussis": "Pertussis",
        "batuk rejan": "Pertussis",
        "whooping cough": "Pertussis",
        "difteri": "Diphtheria",
        "diphtheria": "Diphtheria",
        "antraks": "Anthrax",
        "anthrax": "Anthrax",
        "pes": "Plague",
        "plague": "Plague",
        "kusta": "Leprosy",
        "leprosy": "Leprosy",
        "lepra": "Leprosy",
        "stroke": "Stroke",
        "jantung koroner": "Coronary heart disease",
        "diabetes": "Diabetes mellitus",
        "diabetes melitus": "Diabetes mellitus",
        "hipertensi": "Hypertension",
        "hypertension": "Hypertension",
    }
    return canonical_aliases.get(key, raw)

def _legacy_repair_mojibake(text: str) -> str:
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


def repair_mojibake(text: str) -> str:
    """Repair UTF-8 text that was decoded as Latin-1/Windows-1252."""
    if not text:
        return text
    markers = ("Ã", "Â", "â\x80", "à¸", "à¹", "àº", "à»", "á€", "á", "�")

    def score(value: str) -> int:
        return sum(value.count(marker) for marker in markers)

    if score(text) == 0:
        return text
    candidates = [text]
    for encoding in ("latin-1", "cp1252"):
        try:
            candidates.append(text.encode(encoding).decode("utf-8"))
        except (UnicodeEncodeError, UnicodeDecodeError):
            continue
    return min(candidates, key=score)


def normalize_text(text: str) -> str:
    text = repair_mojibake(text or "").lower()
    text = re.sub(r"[^\w\s\-/:\.\+%#@]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def detect_language(text: str) -> str:
    profile = detect_language_profile(text, markers=config.LANGUAGE_MARKERS)
    language = str(profile.get("language") or "unknown")
    if language != "unknown":
        return language

    # Database markers are a deterministic fallback when langdetect is absent
    # or cannot classify a short Latin-script article.
    markers = config.LANGUAGE_MARKERS
    min_match = int(os.getenv("LANG_MARKER_MIN_MATCH", "2"))
    folded = (text or "").casefold()
    scores = {
        normalize_language_code(lang_code): sum(1 for word in words if str(word).casefold() in folded)
        for lang_code, words in markers.items()
    }
    if not scores or max(scores.values(), default=0) < min_match:
        return "unknown"
    return max(scores, key=scores.get)


# Non-Latin Southeast Asian scripts (Thai, Lao, Myanmar, Khmer) do not use whitespace between words
_NON_LATIN_SCRIPT_RE = re.compile(r"[฀-๿຀-໿က-႟ក-៿]")

_NON_LATIN_SCRIPT_RE = re.compile(r"[\u0E00-\u0E7F\u0E80-\u0EFF\u1000-\u109F\u1780-\u17FF]")


def _is_native_script(text: str) -> bool:
    """Check if text contains non-Latin Southeast Asian characters."""
    return bool(_NON_LATIN_SCRIPT_RE.search(text))


@functools.lru_cache(maxsize=65536)
def _fold_location_text(value: str) -> str:
    """Make Latin locations match their local-script/diacritic variants."""
    if _is_native_script(value):
        return value.strip().casefold()
    decomposed = unicodedata.normalize("NFKD", value.lower())
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def _fold_with_positions(value: str) -> tuple[str, list[int]]:
    folded: list[str] = []
    positions: list[int] = []
    for index, char in enumerate(value):
        if _is_native_script(char):
            folded.append(char.casefold())
            positions.append(index)
            continue
        decomposed = unicodedata.normalize("NFKD", char.lower())
        for part in decomposed:
            if not unicodedata.combining(part):
                folded.append(part)
                positions.append(index)
    return "".join(folded), positions


# Country and place aliases are loaded from location_aliases. Native-script
# country names are retained as a small offline safety registry so a Lao/Thai/
# Khmer/Burmese article remains attributable before DB bootstrap completes.
DEFAULT_COUNTRY_ALIASES: dict[str, str] = {
    # Idiomatic homeland label used in Indonesian national totals.
    "tanah air": "Indonesia",
    "seluruh tanah air": "Indonesia",
    # Publisher mastheads that encode event geography when the body only
    # says "nationwide" / "the capital" (gold title+source meta path).
    "jakarta post": "Indonesia",
    "the jakarta post": "Indonesia",
    "antaranews": "Indonesia",
    "antara news": "Indonesia",
    "bernama": "Malaysia",
    "gma news": "Philippines",
    "gmanetwork": "Philippines",
    "philstar": "Philippines",
    "philippine star": "Philippines",
    "inquirer.net": "Philippines",
    "philippine doh": "Philippines",
    "ລາວ": "Laos",
    "ສປປ ລາວ": "Laos",
    "ประเทศไทย": "Thailand",
    "ไทย": "Thailand",
    "เวียดนาม": "Vietnam",
    "កម្ពុជា": "Cambodia",
    "ឡាវ": "Laos",
    "မြန်မာ": "Myanmar",
    "မိူင်းမြန်မာ": "Myanmar",
}
COUNTRY_ALIASES: dict[str, str] = dict(DEFAULT_COUNTRY_ALIASES)

# The location master is ASEAN-focused. Keep the small external-country
# fallback needed to classify an explicitly named non-ASEAN article until the
# country registry is expanded; it is only a country scope hint, never a
# locality or event metric source.
EXTERNAL_COUNTRY_ALIASES: dict[str, str] = {
    "yemen": "Yemen",
    "yaman": "Yemen",
    "colombia": "Colombia",
    "kolombia": "Colombia",
    "panama": "Panama",
    "panamá": "Panama",
    "jordan": "Jordan",
    "yordania": "Jordan",
    "sudan": "Sudan",
    "south sudan": "South Sudan",
    "brazil": "Brazil",
    "brasil": "Brazil",
    "burundi": "Burundi",
    "drc": "Democratic Republic of the Congo",
    "democratic republic of the congo": "Democratic Republic of the Congo",
    "dr congo": "Democratic Republic of the Congo",
    "ethiopia": "Ethiopia",
    "etiopia": "Ethiopia",
    "kenya": "Kenya",
    "uganda": "Uganda",
    "tanzania": "Tanzania",
    "somalia": "Somalia",
    "chad": "Chad",
    "niger": "Niger",
    "nigeria": "Nigeria",
    "ghana": "Ghana",
    "peru": "Peru",
    "chile": "Chile",
    "argentina": "Argentina",
    "ecuador": "Ecuador",
    "bolivia": "Bolivia",
    "paraguay": "Paraguay",
    "uruguay": "Uruguay",
    "venezuela": "Venezuela",
    "haiti": "Haiti",
    "cuba": "Cuba",
    "dominican republic": "Dominican Republic",
    "costa rica": "Costa Rica",
    "guatemala": "Guatemala",
    "honduras": "Honduras",
    "nicaragua": "Nicaragua",
    "el salvador": "El Salvador",
    "mexico": "Mexico",
    "meksiko": "Mexico",
    "canada": "Canada",
    "kanada": "Canada",
    "united states": "United States",
    "united states of america": "United States",
    "usa": "United States",
    "u.s.": "United States",
    "u.s.a.": "United States",
    "amerika serikat": "United States",
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
    "egypt": "Egypt",
    "saudi arabia": "Saudi Arabia",
    "south africa": "South Africa",
    "democratic republic of the congo": "Democratic Republic of the Congo",
    "dr congo": "Democratic Republic of the Congo",
    "rd congo": "Democratic Republic of the Congo",
}




# Available before DB bootstrap so explicit external countries still resolve offline.
COUNTRY_ALIASES.update(EXTERNAL_COUNTRY_ALIASES)
# Keep legacy mojibake seed keys usable after the article decoder restores
# native script. The canonical country values remain unchanged.
COUNTRY_ALIASES = {
    repair_mojibake(alias): canonical
    for alias, canonical in COUNTRY_ALIASES.items()
}

def _country_alias_view() -> dict[str, str]:
    """Merge DB aliases with stable country names used by the scope contract."""
    aliases = {str(country).casefold(): str(country) for country in config.ASEAN_COUNTRIES}
    aliases.update(
        {
            "viet nam": "Vietnam",
            "lao pdr": "Laos",
            "burma": "Myanmar",
            "philippine": "Philippines",
            "the philippines": "Philippines",
            "brunei darussalam": "Brunei",
            "timor leste": "Timor-Leste",
        }
    )
    aliases.update(EXTERNAL_COUNTRY_ALIASES)
    aliases.update(COUNTRY_ALIASES)
    return aliases

# Publisher shorthand is common in Vietnamese news headlines. Keep these
# aliases local and deterministic so a title such as "TP.HCM" resolves to the
# gazetteer city instead of falling back to the country only.
# Publisher and shorthand aliases are maintained in location_aliases.
LOCATION_ALIASES: dict[str, str] = {}


_ACTIVE_LOCATION_ALIASES_CACHE: dict[str, str] | None = None
_ACTIVE_LOCATION_ALIASES_SOURCE_ID: int | None = None
_FOLDED_LOCATION_INDEX: dict[str, str] | None = None
_FOLDED_LOCATION_INDEX_SOURCE_ID: tuple | None = None
_LOCATION_HIERARCHY_CACHE: dict[tuple[str, str], dict[str, Any]] = {}
_LOCATION_HIERARCHY_CACHE_SOURCE_ID: tuple | None = None
_LOCATION_RESOLUTION_STATS: ContextVar[dict[str, Any] | None] = ContextVar(
    "location_resolution_stats",
    default=None,
)


def invalidate_location_alias_cache() -> None:
    """Drop the repaired alias view after a location registry reload."""
    global _ACTIVE_LOCATION_ALIASES_CACHE, _ACTIVE_LOCATION_ALIASES_SOURCE_ID
    global _FOLDED_LOCATION_INDEX, _FOLDED_LOCATION_INDEX_SOURCE_ID
    global _LOCATION_HIERARCHY_CACHE, _LOCATION_HIERARCHY_CACHE_SOURCE_ID
    _ACTIVE_LOCATION_ALIASES_CACHE = None
    _ACTIVE_LOCATION_ALIASES_SOURCE_ID = None
    _FOLDED_LOCATION_INDEX = None
    _FOLDED_LOCATION_INDEX_SOURCE_ID = None
    _LOCATION_HIERARCHY_CACHE = {}
    _LOCATION_HIERARCHY_CACHE_SOURCE_ID = None
    _fold_location_text.cache_clear()


def begin_location_resolution_stats() -> object:
    """Start request-local resolver counters for runtime diagnostics."""

    return _LOCATION_RESOLUTION_STATS.set({
        "calls": 0,
        "cache_hits": 0,
        "duration_seconds": 0.0,
    })


def get_location_resolution_stats() -> dict[str, Any]:
    """Return a snapshot of the current request-local resolver counters."""

    stats = _LOCATION_RESOLUTION_STATS.get()
    return dict(stats or {
        "calls": 0,
        "cache_hits": 0,
        "duration_seconds": 0.0,
    })


def reset_location_resolution_stats(token: object) -> None:
    _LOCATION_RESOLUTION_STATS.reset(token)


def _location_hierarchy_source_id() -> tuple:
    """Identify the loaded registry maps used to build a hierarchy result."""

    return tuple(
        id(getattr(config, name, None))
        for name in (
            "LOCATION_COORDS",
            "LOCATION_ALIASES",
            "LOCATION_COUNTRIES",
            "LOCATION_ISO3",
            "LOCATION_ADMIN_LEVEL",
            "LOCATION_ADMIN1",
            "LOCATION_ADMIN2",
            "COUNTRY_TO_ISO3",
        )
    ) + (id(COUNTRY_ALIASES),)


def active_location_aliases() -> dict[str, str]:
    """Return the merged DB-backed locality/country alias view.

    Repairing mojibake across the full alias map is useful, but doing it on
    every extractor call turns interactive URL analysis into a multi-minute
    CPU burn once the gazetteer grows. Cache by the identity of the live
    config map and invalidate on registry reload.
    """
    global _ACTIVE_LOCATION_ALIASES_CACHE, _ACTIVE_LOCATION_ALIASES_SOURCE_ID

    cfg_aliases = getattr(config, "LOCATION_ALIASES", {}) or {}
    source_id = id(cfg_aliases)
    if (
        _ACTIVE_LOCATION_ALIASES_CACHE is not None
        and _ACTIVE_LOCATION_ALIASES_SOURCE_ID == source_id
    ):
        return _ACTIVE_LOCATION_ALIASES_CACHE

    merged = {
        **LOCATION_ALIASES,
        **cfg_aliases,
    }
    # Older seed data contains native-script aliases that were decoded into
    # Latin mojibake. Repair the key at lookup time so the DB remains the
    # source of truth and no second hardcoded vocabulary is needed.
    _ACTIVE_LOCATION_ALIASES_CACHE = {
        repair_mojibake(str(alias)): canonical for alias, canonical in merged.items()
    }
    _ACTIVE_LOCATION_ALIASES_SOURCE_ID = source_id
    return _ACTIVE_LOCATION_ALIASES_CACHE


def folded_location_index() -> dict[str, str]:
    """Map folded alias/name → canonical for O(1) gazetteer lookups.

    Built once from LOCATION_COORDS + LOCATION_ALIASES + COUNTRY_ALIASES +
    active_location_aliases(). Invalidated with the alias cache on registry reload.
    """
    global _FOLDED_LOCATION_INDEX, _FOLDED_LOCATION_INDEX_SOURCE_ID

    coords = getattr(config, "LOCATION_COORDS", {}) or {}
    cfg_aliases = getattr(config, "LOCATION_ALIASES", {}) or {}
    active = active_location_aliases()
    source_id = (id(coords), id(cfg_aliases), id(active), id(COUNTRY_ALIASES))
    if (
        _FOLDED_LOCATION_INDEX is not None
        and _FOLDED_LOCATION_INDEX_SOURCE_ID == source_id
    ):
        return _FOLDED_LOCATION_INDEX

    index: dict[str, str] = {}
    for name in coords:
        folded = _fold_location_text(str(name))
        if folded and folded not in index:
            index[folded] = str(name)
    for alias, canonical in active.items():
        folded = _fold_location_text(str(alias))
        if folded and folded not in index:
            index[folded] = str(canonical)
    for alias, canonical in cfg_aliases.items():
        folded = _fold_location_text(str(alias))
        if folded and folded not in index:
            index[folded] = str(canonical)
    for alias, canonical in LOCATION_ALIASES.items():
        folded = _fold_location_text(str(alias))
        if folded and folded not in index:
            index[folded] = str(canonical)
    for alias, canonical in COUNTRY_ALIASES.items():
        folded = _fold_location_text(str(alias))
        if folded and folded not in index:
            index[folded] = str(canonical)

    _FOLDED_LOCATION_INDEX = index
    _FOLDED_LOCATION_INDEX_SOURCE_ID = source_id
    return index


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

# One-word gazetteer collisions that are almost always prose/media, not admin
# places, unless an explicit kabupaten/kecamatan/province cue is present.
MEDIA_FILLER_PLACE_TOKENS = {
    "harian", "persen", "percent", "tak", "pesisir", "pantai",
    "antara", "detik", "tempo", "tribun", "kompas", "times", "post",
    "daily", "herald", "tribune", "online", "network", "media",
    "sepanjang",
    # Thai "ลอง" (try) and English "Long" collide with a gazetteer row
    # (teammate QA no.53 province=Long for an exhibition).
    "long",
}

_ADMIN_CUE_BEFORE = re.compile(
    r"(?:kabupaten|kecamatan|kelurahan|kota|provinsi|province|regency|"
    r"district|state of|city of|wilayah|daerah)\s+$",
    re.IGNORECASE,
)


def _has_admin_place_cue(name: str, surrounding_text: str = "", start: int = 0) -> bool:
    if not surrounding_text:
        return False
    before = surrounding_text[max(0, start - 48): start]
    if _ADMIN_CUE_BEFORE.search(before):
        return True
    window = surrounding_text[max(0, start - 8): start + len(name) + 32]
    return bool(re.search(
        rf"\b(?:kabupaten|kecamatan|provinsi|province|regency)\s+{re.escape(name)}\b",
        window,
        re.IGNORECASE,
    ))



_ORG_HQ_AFFILIATION = re.compile(
    r"(?:"
    r"headquarters|\bhq\b|regional office|country office|secretariat|"
    r"based in|berkantor di|berpusat di|"
    r"who\s+(?:regional|country)\s+office|"
    r"world health organization|"
    r"pan american health|\bpaho\b|\bunicef\b|\bunhcr\b|\bfao\b|"
    r"centers for disease control|\bcdc\b"
    r")",
    re.IGNORECASE,
)


def _mention_is_org_affiliation(text: str, start: int, end: int) -> bool:
    """True when a place mention sits inside an org HQ / affiliation clause."""
    if not text:
        return False
    window = text[max(0, start - 70): min(len(text), end + 70)]
    return bool(_ORG_HQ_AFFILIATION.search(window))


_METRIC_OR_MEDIA_PLACE_NOISE = re.compile(
    r"(?i)(?:"
    r"\b(?:kasus|cases?|deaths?|kematian|meninggal|pasien|patients?|infections?)\b|"
    r"\b(?:wib|wita|wit|bagikan|scroll|advertisement|vaksin|vaccine)\b|"
    r"\b(?:ribu|juta|thousand|million)\b|"
    r"\b(?:tahun\s+kini|kini\s+bisa|lebih\s+dari)\b"
    r")"
)


def is_usable_place_name(name: str, surrounding_text: str = "", start: int = 0) -> bool:
    """Reject continents, function words, and publisher brands such as Asia News Network."""
    raw = (name or "").strip()
    if not raw:
        return False
    folded = _fold_location_text(raw)
    # Title/chrome fragments bound as places ("Ribu Kasus Dengue", "WIB Bagikan").
    if _METRIC_OR_MEDIA_PLACE_NOISE.search(raw):
        return False
    location_stopwords = config.get_location_stopwords()
    if folded in CONTINENT_AND_REGION_LABELS or folded in location_stopwords:
        return False
    # One-word English auxiliaries are never provinces, even when capitalized
    # at the start of a sentence ("Were monitoring the farm outbreaks").
    if " " not in folded and folded.isascii() and folded in location_stopwords:
        return False
    if " " not in folded and folded in MEDIA_FILLER_PLACE_TOKENS:
        if not _has_admin_place_cue(raw, surrounding_text, start):
            return False
    # Bare 1–3 letter Latin tokens ("Tak", "Ulu") collide with function words.
    if " " not in folded and folded.isascii() and len(folded) <= 3:
        if folded not in {item.casefold() for item in config.ASEAN_COUNTRIES}:
            if not _has_admin_place_cue(raw, surrounding_text, start):
                return False
    if surrounding_text:
        after = surrounding_text[start + len(raw): start + len(raw) + 48]
        if _PUBLISHER_FOLLOWER.match(after):
            return False
        window = surrounding_text[max(0, start - 12): start + len(raw) + 28]
        if folded == "asia" and re.search(r"asianews|asia\s+news", window, re.I):
            return False
    if surrounding_text and _mention_is_org_affiliation(
        surrounding_text, start, start + len(raw)
    ):
        return False
    return True


def _drop_nested_place_hits(hits: list[tuple[str, int]]) -> list[tuple[str, int]]:
    """Drop shorter gazetteer names that only match inside a longer name.

    Live bug: 'Pesisir' scored above 'Pesisir Selatan' because every mention of
    the kabupaten also counted as the one-word village/coast token.
    """
    if len(hits) < 2:
        return hits
    kept: list[tuple[str, int]] = []
    for name, pos in hits:
        end = pos + len(name)
        nested = False
        for other, other_pos in hits:
            if other == name and other_pos == pos:
                continue
            other_end = other_pos + len(other)
            if len(other) <= len(name):
                continue
            if other_pos <= pos and end <= other_end:
                nested = True
                break
            if other_pos == pos and other.lower().startswith(name.lower()):
                nested = True
                break
        if not nested:
            kept.append((name, pos))
    return kept


# south, north, west, east — used to reject gazetteer rows that land in the
# wrong sea (live bug: Singapore pinned in the Bay of Bengal).
ASEAN_COUNTRY_BBOXES: dict[str, tuple[float, float, float, float]] = {
    "Brunei": (4.0, 5.15, 114.0, 115.5),
    "Cambodia": (10.3, 14.75, 102.3, 107.7),
    "Indonesia": (-11.2, 6.35, 94.9, 141.1),
    "Laos": (13.9, 22.55, 100.0, 107.8),
    "Malaysia": (0.85, 7.55, 99.55, 119.4),
    "Myanmar": (9.5, 28.55, 92.1, 101.2),
    "Philippines": (4.55, 21.25, 116.9, 126.7),
    "Singapore": (1.15, 1.48, 103.6, 104.1),
    "Thailand": (5.55, 20.55, 97.3, 105.7),
    "Vietnam": (8.35, 23.45, 102.1, 109.55),
    "Timor-Leste": (-9.55, -8.1, 124.0, 127.45),
}

# Country-level pins only. Never used as a fallback for a missing city.
ASEAN_COUNTRY_CENTROIDS: dict[str, tuple[float, float]] = {
    "Brunei": (4.5353, 114.7277),
    "Cambodia": (12.5657, 104.9910),
    "Indonesia": (-2.5489, 118.0149),
    "Laos": (17.9757, 102.6331),
    "Malaysia": (3.1390, 101.6869),
    "Myanmar": (19.7633, 96.0785),
    "Philippines": (14.5995, 120.9842),
    "Singapore": (1.3521, 103.8198),
    "Thailand": (13.7563, 100.5018),
    "Vietnam": (21.0278, 105.8342),
    "Timor-Leste": (-8.5569, 125.5603),
}

_CITY_HINTS = (
    "city", "kota", "town", "municipality", "kabupaten", "regency",
    "village", "kelurahan", "district", "kecamatan",
)
_PROVINCE_HINTS = (
    "province", "provinsi", "state", "oblast", "prefecture", "region",
)


def coords_in_country_bbox(lat: Optional[float], lon: Optional[float], country: Optional[str]) -> bool:
    """True when lat/lon sit inside the ASEAN member bbox (or country is not ASEAN-11)."""
    if lat is None or lon is None:
        return False
    mapped = normalize_country(country)
    bbox = ASEAN_COUNTRY_BBOXES.get(mapped or "")
    if not bbox:
        return True
    south, north, west, east = bbox
    return south <= float(lat) <= north and west <= float(lon) <= east


def resolve_location_hierarchy(
    location_name: Optional[str],
    country_hint: Optional[str] = None,
) -> dict[str, Any]:
    """Resolve a location name into its canonical administrative hierarchy:
    locality -> admin2 (city/regency) -> admin1 (province/state) -> country (iso3).
    """
    started = time.perf_counter()
    stats = _LOCATION_RESOLUTION_STATS.get()
    if stats is not None:
        stats["calls"] += 1

    def finish(result: dict[str, Any], *, cache_hit: bool = False) -> dict[str, Any]:
        if stats is not None:
            stats["duration_seconds"] += time.perf_counter() - started
            if cache_hit:
                stats["cache_hits"] += 1
        return result

    config.ensure_location_registry_loaded()
    global _LOCATION_HIERARCHY_CACHE, _LOCATION_HIERARCHY_CACHE_SOURCE_ID
    hierarchy_source_id = _location_hierarchy_source_id()
    if _LOCATION_HIERARCHY_CACHE_SOURCE_ID != hierarchy_source_id:
        _LOCATION_HIERARCHY_CACHE = {}
        _LOCATION_HIERARCHY_CACHE_SOURCE_ID = hierarchy_source_id

    if not location_name or not str(location_name).strip():
        norm_c = normalize_country(country_hint) if country_hint else None
        iso3 = config.COUNTRY_TO_ISO3.get((norm_c or "").lower()) if norm_c else None
        return finish({
            "canonical_name": "",
            "country": norm_c,
            "country_iso3": iso3,
            "admin1_name": None,
            "admin2_name": None,
            "admin_level": 3,
            "latitude": None,
            "longitude": None,
        })

    raw = str(location_name).strip()
    folded = _fold_location_text(raw)
    cache_key = (folded, _fold_location_text(str(country_hint or "")))
    cached = _LOCATION_HIERARCHY_CACHE.get(cache_key)
    if cached is not None:
        return finish(dict(cached), cache_hit=True)

    aliases = active_location_aliases()

    canonical = None
    # 1. Alias lookup (prioritize exact casefold for native non-Latin scripts)
    if raw.casefold() in aliases:
        canonical = aliases[raw.casefold()]
    elif raw in aliases:
        canonical = aliases[raw]
    elif folded in aliases:
        canonical = aliases[folded]
    elif raw.casefold() in COUNTRY_ALIASES:
        canonical = COUNTRY_ALIASES[raw.casefold()]
    elif raw in config.LOCATION_COORDS:
        canonical = raw
    else:
        # Match folded names and aliases through the already-built immutable
        # index. The previous fallback scanned every gazetteer row here.
        canonical = folded_location_index().get(folded)

    if not canonical:
        canonical = raw

    # 2. Country resolution.  A caller hint is only a disambiguation input
    # for a known gazetteer entity; it must never manufacture a parent country
    # for an unresolved place or override the entity's actual parent.
    country = config.LOCATION_COUNTRIES.get(canonical)
    country_conflict = False
    if not country and canonical.casefold() in config.COUNTRY_TO_ISO3:
        country = normalize_country(canonical)
    if country and country_hint:
        hinted_country = normalize_country(country_hint)
        if hinted_country and country.casefold() != hinted_country.casefold():
            country_conflict = True
    elif not country and canonical.casefold() in {item.casefold() for item in config.ASEAN_COUNTRIES}:
        country = normalize_country(canonical)

    # 3. Country ISO3
    country_iso3 = config.LOCATION_ISO3.get(canonical)
    if not country_iso3 and country:
        country_iso3 = config.COUNTRY_TO_ISO3.get(country.casefold())

    # 4. Admin level, admin1, admin2
    admin_level = config.LOCATION_ADMIN_LEVEL.get(canonical, 3)
    admin1_name = config.LOCATION_ADMIN1.get(canonical)
    admin2_name = config.LOCATION_ADMIN2.get(canonical)

    if country and canonical.casefold() == country.casefold():
        admin_level = 0
        admin1_name = None
        admin2_name = None
    elif admin_level == 1 or (admin1_name and canonical.casefold() == admin1_name.casefold()):
        admin_level = 1
        admin1_name = canonical
        admin2_name = None

    lat, lon = config.LOCATION_COORDS.get(canonical, (None, None))
    if lat is None and lon is None and country:
        lat, lon, _, _ = geocode_place(canonical, country)

    result = {
        "canonical_name": canonical,
        "country": country,
        "country_iso3": country_iso3,
        "admin1_name": admin1_name,
        "admin2_name": admin2_name,
        "admin_level": admin_level,
        "latitude": lat,
        "longitude": lon,
        "country_conflict": country_conflict,
        "needs_review": country_conflict or not bool(country),
    }
    if len(_LOCATION_HIERARCHY_CACHE) >= 8192:
        _LOCATION_HIERARCHY_CACHE.clear()
    _LOCATION_HIERARCHY_CACHE[cache_key] = dict(result)
    return finish(result)


def resolve_event_location_hierarchy(
    location_name: Optional[str],
    country_hint: Optional[str] = None,
) -> dict[str, Any]:
    """Resolve event geography without allowing a conflicting gazetteer pin.

    ``resolve_location_hierarchy`` intentionally exposes the gazetteer's
    original parent country so callers can diagnose ambiguous names. Event
    projections need a safer contract: when article evidence says the event
    is in country A but a locality lookup resolves to country B, retain the
    conflict as provenance and use country A at country level. This prevents
    a locality from producing coordinates in a different country than the
    event evidence.
    """
    hierarchy = resolve_location_hierarchy(location_name, country_hint=country_hint)
    if not hierarchy.get("country_conflict"):
        return hierarchy

    hinted_country = normalize_country(country_hint)
    if not hinted_country:
        return hierarchy

    safe = resolve_location_hierarchy(hinted_country, country_hint=hinted_country)
    safe.update(
        {
            "country_conflict": True,
            "needs_review": True,
            "original_location_name": location_name,
            "original_canonical_name": hierarchy.get("canonical_name") or location_name,
            "original_country": hierarchy.get("country"),
            "original_country_iso3": hierarchy.get("country_iso3"),
        }
    )
    return safe


def split_admin_place(location: Optional[str], country: Optional[str] = None) -> tuple[Optional[str], Optional[str]]:
    """Return (province, city) using hierarchical location intelligence."""
    name = (location or "").strip()
    if not name:
        return None, None
    mapped = normalize_country(country)
    if mapped and name.casefold() == mapped.casefold():
        return None, None
    if name in config.ASEAN_COUNTRIES:
        return None, None
    folded_name = _fold_location_text(name)
    if folded_name in {_fold_location_text(alias) for alias in COUNTRY_ALIASES}:
        return None, None
    hier = resolve_location_hierarchy(name, country_hint=country)
    # A common-language token can also be a real locality (for example
    # ``Negara`` in Indonesia). Keep the hierarchy available when the caller
    # supplied the matching country, while still rejecting the same token for
    # a conflicting country or an article-context location scan.
    if not is_usable_place_name(name) and not (
        mapped
        and hier.get("country")
        and str(hier.get("country")).casefold() == mapped.casefold()
    ):
        return None, None
    if hier["admin_level"] == 0:
        return None, None
    if hier.get("country_conflict"):
        return None, None
    if mapped and hier.get("country") and hier["country"].casefold() != mapped.casefold():
        return None, None
    if hier.get("admin1_name") or hier.get("admin2_name"):
        return hier.get("admin1_name"), hier.get("admin2_name")

    folded = name.casefold()
    if any(token in folded for token in _PROVINCE_HINTS):
        return name, None
    if any(token in folded for token in _CITY_HINTS):
        return None, name
    return name, None


def geocode_place(
    name: Optional[str],
    country: Optional[str] = None,
    surrounding_text: str = "",
) -> tuple[Optional[float], Optional[float], float, bool]:
    """Gazetteer lookup with ASEAN bbox validation.

    Low-confidence or out-of-bbox rows return null coordinates and
    needs_review=True rather than a wrong pin.
    """
    raw = (name or "").strip()
    if not raw or not is_usable_place_name(raw, surrounding_text):
        return None, None, 0.0, True
    mapped = normalize_country(country) or config.LOCATION_COUNTRIES.get(raw)
    is_country_match = raw in config.ASEAN_COUNTRIES or (mapped and raw.casefold() == mapped.casefold())
    if is_country_match:
        # Check database-loaded country centroid first (supports all 78 countries), fallback to ASEAN dict
        centroid = (
            config.LOCATION_COORDS.get(mapped or "")
            or config.LOCATION_COORDS.get(raw)
            or ASEAN_COUNTRY_CENTROIDS.get(raw)
            or ASEAN_COUNTRY_CENTROIDS.get(mapped or "")
        )
        if centroid and centroid[0] is not None and centroid[1] is not None:
            return float(centroid[0]), float(centroid[1]), 0.95, False
        return None, None, 0.0, True
    lat, lon = config.LOCATION_COORDS.get(raw, (None, None))
    loc_country = config.LOCATION_COUNTRIES.get(raw) or mapped
    if lat is None or lon is None:
        return None, None, 0.0, True
    if loc_country in config.ASEAN_COUNTRIES and not coords_in_country_bbox(lat, lon, loc_country):
        return None, None, 0.0, True
    return float(lat), float(lon), 0.85, False


def normalize_country(value: Optional[str]) -> Optional[str]:
    """Normalize a supplied country hint without confusing organizations with countries."""
    config.ensure_location_registry_loaded()
    raw = (value or "").strip()
    if not raw:
        return None
    folded = _fold_location_text(raw)
    for alias, standard in _country_alias_view().items():
        if folded == _fold_location_text(alias):
            return standard
    return raw


def extract_country_hint(text: str) -> Optional[str]:
    config.ensure_location_registry_loaded()
    lower_text = _fold_location_text(text or "")
    if not lower_text.strip():
        return None
    contextual = re.compile(
        r"(?:setelah|sesudah|dibandingkan|dibanding|daripada|seperti|termasuk|antara lain|misalnya|including|includes|compared with|compared to|higher than|lower than|"
        r"both|between|across|regional partners|countries in|in contrast to|"
        r"neighbouring|neighboring|unlike|versus|vs\.?|rather than|than that of)",
        re.IGNORECASE,
    )
    country_scores: dict[str, float] = {}
    for alias, standard_country in _country_alias_view().items():
        folded_alias = _fold_location_text(alias)
        # A short database alias such as ``AS`` is a normal English
        # preposition, not reliable country evidence ("as of ...").
        if folded_alias in {"as"}:
            continue
        pattern = re.compile(
            re.escape(folded_alias)
            if _is_native_script(alias)
            else rf"\b{re.escape(folded_alias)}\b",
            re.IGNORECASE,
        )
        matches = list(pattern.finditer(lower_text))
        if not matches:
            continue
        score = float(len(matches) * 3)
        # Prefer a matched compound country name over a shorter country token
        # contained inside it (e.g. South Sudan vs Sudan).
        score += len(folded_alias.split()) * 2.0 + len(folded_alias) / 100.0
        if any(m.start() < 300 for m in matches):
            score += 10.0
        for m in matches:
            pos = m.start()
            if contextual.search(lower_text[max(0, pos - 80):pos]):
                score -= 12.0
        # Accumulate score across aliases for the same country (do not clobber)
        country_scores[standard_country] = country_scores.get(standard_country, 0.0) + score

    # WHO sitrep PDFs label the block as "— Lao PDR section". That heading
    # must beat later country names that leak from adjacent sections.
    section = re.search(
        r"(?:—|–|-{1,2})\s*([A-Za-z .'-]+?)\s+section\b",
        text[:600] if text else "",
        re.IGNORECASE,
    )
    if section:
        section_country = normalize_country(section.group(1))
        if section_country:
            country_scores[section_country] = country_scores.get(section_country, 0.0) + 40.0

    if not country_scores:
        return None

    # ASEAN surveillance platform bonus: prioritize ASEAN member states
    # in the title/lede so a Utah/USA secondary clause cannot beat Cambodia.
    opening = lower_text[:800]
    for c in list(country_scores.keys()):
        if c in config.ASEAN_COUNTRIES:
            country_scores[c] += 5.0
            if any(
                _fold_location_text(alias) in opening
                for alias, standard in _country_alias_view().items()
                if standard == c
            ):
                country_scores[c] += 8.0
            affil_hits = 0
            total_hits = 0
            for alias, standard in _country_alias_view().items():
                if standard != c:
                    continue
                folded_alias = _fold_location_text(alias)
                for match in re.finditer(rf"\b{re.escape(folded_alias)}\b", lower_text, re.I):
                    total_hits += 1
                    if _mention_is_org_affiliation(lower_text, match.start(), match.end()):
                        affil_hits += 1
            if total_hits and affil_hits == total_hits:
                country_scores[c] -= 25.0
        if c not in config.ASEAN_COUNTRIES and any(
            _fold_location_text(alias) in opening
            for alias, standard in EXTERNAL_COUNTRY_ALIASES.items()
            if standard == c
        ):
            country_scores[c] += 18.0

    return max(country_scores.keys(), key=lambda k: country_scores[k])


def extract_all_mentioned_countries(text: str) -> list[str]:
    """Extract all distinct ASEAN countries explicitly mentioned in text with positive evidence."""
    config.ensure_location_registry_loaded()
    lower_text = _fold_location_text(text or "")
    if not lower_text.strip():
        return []
    contextual = re.compile(
        r"(?:setelah|sesudah|dibandingkan|dibanding|daripada|seperti|termasuk|antara lain|misalnya|including|includes|compared with|compared to|higher than|lower than|"
        r"both|between|across|regional partners|countries in|in contrast to|"
        r"neighbouring|neighboring|unlike|versus|vs\.?|rather than|than that of)",
        re.IGNORECASE,
    )
    country_scores: dict[str, float] = {}
    for alias, standard_country in _country_alias_view().items():
        if standard_country not in config.ASEAN_COUNTRIES:
            continue
        folded_alias = _fold_location_text(alias)
        pattern = re.compile(rf"\b{re.escape(folded_alias)}\b", re.IGNORECASE)
        matches = list(pattern.finditer(lower_text))
        if not matches:
            continue
        score = float(len(matches) * 3)
        if any(m.start() < 300 for m in matches):
            score += 10.0
        for m in matches:
            pos = m.start()
            if contextual.search(lower_text[max(0, pos - 80):pos]):
                score -= 12.0
        country_scores[standard_country] = country_scores.get(standard_country, 0.0) + score

    valid = [c for c, sc in country_scores.items() if sc > 0]
    return sorted(valid, key=lambda c: country_scores[c], reverse=True)


def validate_location_context(
    name: str,
    text: str,
    source_country: Optional[str] = None,
    mentioned_countries: Optional[list[str]] = None,
) -> dict[str, Any]:
    """Score and resolve a location candidate against article context to eliminate location leakage.
    
    Scores:
      3: Highest confidence (Location is an ASEAN country mentioned in text, or city with nearby parent country)
      2: High confidence (City mentioned and its country is among explicitly mentioned countries in article)
      1: Medium confidence (No country mentioned in article, validated via source_country or prominent city context)
      0: Rejected / Leakage (City belongs to a country not mentioned in article, or prose stopword)
    """
    raw_name = (name or "").strip()
    if not raw_name:
        return {"name": "", "country": None, "score": 0, "is_valid": False}
    
    for c in config.ASEAN_COUNTRIES:
        if raw_name.casefold() == c.casefold():
            return {"name": c, "country": c, "score": 3, "is_valid": True}
            
    city_country = config.LOCATION_COUNTRIES.get(raw_name)
    if not city_country or city_country not in config.ASEAN_COUNTRIES:
        return {"name": raw_name, "country": city_country, "score": 0, "is_valid": False}
    
    lower_text = text.lower()
    name_lower = raw_name.lower()
    
    # 1. Proximity Check (Score 3): City and its country mentioned in the same sentence or within 120 chars
    country_lower = city_country.lower()
    country_aliases = [alias for alias, std in COUNTRY_ALIASES.items() if std == city_country]
    country_patterns = [country_lower] + [a.lower() for a in country_aliases]
    
    for match in re.finditer(rf"\b{re.escape(name_lower)}\b", lower_text):
        start = max(0, match.start() - 120)
        end = min(len(lower_text), match.end() + 120)
        window = lower_text[start:end]
        if any(re.search(rf"\b{re.escape(cp)}\b", window) for cp in country_patterns):
            return {"name": raw_name, "country": city_country, "score": 3, "is_valid": True}
            
    # 2. Dominant / Mentioned Country Check (Score 2): City mentioned and country is in mentioned_countries
    if mentioned_countries and city_country in mentioned_countries:
        return {"name": raw_name, "country": city_country, "score": 2, "is_valid": True}

    # A primary country explicitly established by the article is sufficient
    # context for one of its gazetteer localities, even when the locality is
    # introduced in a later paragraph. This keeps the guard country-aware
    # without accepting a publisher country as event geography.
    article_country = extract_country_hint(text[:1200])
    if article_country == city_country:
        return {"name": raw_name, "country": city_country, "score": 2, "is_valid": True}
        
    # 3. Source Context / Standalone Unambiguous City (Score 1):
    norm_source = normalize_country(source_country)
    if not mentioned_countries:
        if norm_source and norm_source == city_country:
            return {"name": raw_name, "country": city_country, "score": 1, "is_valid": True}
        # Prominent city with health or case indicator
        for match in re.finditer(rf"\b{re.escape(name_lower)}\b", lower_text):
            start = max(0, match.start() - 100)
            end = min(len(lower_text), match.end() + 100)
            window = lower_text[start:end]
            if re.search(r"\b(?:\d+[\d.,]*\s+kasus|\d+[\d.,]*\s+cases?|dinas\s+kesehatan|kemenkes|hospital|rsud|puskesmas|dinas)\b", window):
                return {"name": raw_name, "country": city_country, "score": 1, "is_valid": True}
                
    return {"name": raw_name, "country": city_country, "score": 0, "is_valid": False}


def country_scope(country: Optional[str]) -> Optional[str]:
    """Return the display/filter country without relabeling known ASEAN data.

    Non-ASEAN labels (United States/Utah, India, DRC, ...) become OUTSIDE ASEAN
    so default asean11 KPIs cannot be inflated by secondary geographies.
    """
    mapped = normalize_country(country)
    value = (mapped or "").strip()
    if not value:
        return None
    if value in config.ASEAN_COUNTRIES:
        return value
    return config.OUTSIDE_ASEAN_COUNTRY


DISEASE_STOPWORDS = {
    "infectious", "without", "specification", "agent", "unspecified", "organism",
    "exposure", "harmful", "effects", "vaccines", "identified", "syndrome",
    "disease", "virus", "fever", "human", "late", "acute", "with", "from", "other",
    "diseases", "infections", "prevention", "control", "statement", "period", "under",
    "case", "cases", "death", "deaths", "health", "medical"
}


# The disease master is loaded as an immutable snapshot for the lifetime of a
# request. Matching it by scanning every concept and alias for every call made
# long articles needlessly quadratic. Keep the cache keyed by the snapshot
# identity so a DB reload naturally builds a new index.
_DISEASE_TERM_INDEX_SOURCE: list[dict] | None = None
_DISEASE_TERM_INDEX_CACHE: dict[str, tuple[str, ...]] = {}


def _disease_term_index(concepts: list[dict]) -> dict[str, tuple[str, ...]]:
    global _DISEASE_TERM_INDEX_SOURCE, _DISEASE_TERM_INDEX_CACHE
    if _DISEASE_TERM_INDEX_SOURCE is concepts:
        return _DISEASE_TERM_INDEX_CACHE

    index: dict[str, list[str]] = {}
    for concept in concepts or []:
        canonical = str(concept.get("canonical_name") or "").strip()
        if not canonical:
            continue
        names = [concept.get("canonical_name"), concept.get("english_name")]
        names.extend(
            item.get("alias") if isinstance(item, dict) else item
            for item in (concept.get("aliases") or [])
        )
        for raw_name in names:
            name = str(raw_name or "")
            candidates = [name, *re.split(r"[/,()]", name)]
            for candidate in candidates:
                term = _normalize_entity_text(candidate)
                if len(term) < 4 or term in DISEASE_STOPWORDS:
                    continue
                if canonical not in index.setdefault(term, []):
                    index[term].append(canonical)
            full_term = _normalize_entity_text(name)
            for token in full_term.split():
                if len(token) >= 4 and any(char.isdigit() for char in token):
                    if canonical not in index.setdefault(token, []):
                        index[token].append(canonical)

    frozen = {term: tuple(names) for term, names in index.items()}
    _DISEASE_TERM_INDEX_SOURCE = concepts
    _DISEASE_TERM_INDEX_CACHE = frozen
    return frozen


def _normalize_entity_text(value: str) -> str:
    """Normalize entity text while retaining Unicode scripts (Thai/Lao/Khmer)."""
    folded = strip_diacritics((value or "").casefold())
    folded = folded.replace("_", " ")
    return re.sub(r"[^\w]+", " ", folded, flags=re.UNICODE).strip()

def extract_disease_mentions(text: str, concepts: list[dict], max_chars: int | None = None) -> list[str]:
    """Match explicit local-master disease names and their specific variants."""
    if max_chars is not None and max_chars > 0 and text and len(text) > max_chars:
        text = text[:max_chars]
    value = _normalize_entity_text(text)
    term_index = _disease_term_index(concepts)
    if not term_index:
        return []
    matcher = re.compile(
        r"(?<![a-z0-9])(?:" + "|".join(
            re.escape(term) for term in sorted(term_index, key=len, reverse=True)
        ) + r")(?![a-z0-9])",
        re.UNICODE,
    )
    mentions: set[str] = set()
    for match in matcher.finditer(value):
        mentions.update(term_index.get(match.group(0), ()))
    return sorted(mentions)


def canonicalize_disease_labels(labels: list[str], concepts: list[dict]) -> list[str]:
    """Map local keyword labels (e.g. KOLERA/MEASLES/AVIAN_INFLUENZA) to WHO canonicals."""
    matched = []
    term_index = _disease_term_index(concepts)
    for label in labels:
        lbl_clean = _normalize_entity_text(label)
        if not lbl_clean:
            continue
        exact = term_index.get(lbl_clean)
        if exact:
            matched.extend(exact)
            continue
        # Pass 1: Strict exact match on canonical, english, or alias
        found_canonical = None
        for concept in concepts:
            canonical = str(concept.get("canonical_name") or "").strip()
            english = str(concept.get("english_name") or "").strip()
            can_clean = _normalize_entity_text(canonical)
            eng_clean = _normalize_entity_text(english)
            if lbl_clean == can_clean or lbl_clean == eng_clean:
                found_canonical = canonical
                break
            for alias_item in concept.get("aliases") or []:
                alias = alias_item.get("alias") if isinstance(alias_item, dict) else alias_item
                alias_clean = _normalize_entity_text(str(alias or ""))
                if alias_clean and lbl_clean == alias_clean:
                    found_canonical = canonical
                    break
            if found_canonical:
                break
        if found_canonical:
            matched.append(found_canonical)
            continue

        # Pass 2: Boundary/substring match, strictly ignoring negation clauses ("without mention of X")
        for concept in concepts:
            canonical = str(concept.get("canonical_name") or "").strip()
            english = str(concept.get("english_name") or "").strip()
            can_clean = _normalize_entity_text(canonical)
            eng_clean = _normalize_entity_text(english)

            # Never match if the search label is part of a negation clause
            if re.search(rf"without\s+(?:mention\s+of\s+)?{re.escape(lbl_clean)}", can_clean):
                continue
            if re.search(rf"without\s+(?:mention\s+of\s+)?{re.escape(lbl_clean)}", eng_clean):
                continue

            if len(lbl_clean) >= 4 and (lbl_clean in can_clean or lbl_clean in eng_clean or can_clean in lbl_clean):
                matched.append(canonical)
                break
            for alias_item in concept.get("aliases") or []:
                alias = alias_item.get("alias") if isinstance(alias_item, dict) else alias_item
                alias_clean = _normalize_entity_text(str(alias or ""))
                if re.search(rf"without\s+(?:mention\s+of\s+)?{re.escape(lbl_clean)}", alias_clean):
                    continue
                if alias_clean and (len(lbl_clean) >= 4 and (lbl_clean in alias_clean or alias_clean in lbl_clean)):
                    matched.append(canonical)
                    break
            else:
                continue
            break
    return sorted(set(matched))


def canonical_disease_name(disease: str, concepts: Optional[list[dict]] = None) -> str:
    """Return the active local-master name for a legacy/model label."""
    normalized = normalize_disease_display(disease)
    if normalized == "UNKNOWN":
        return normalized
    active_concepts = config.DISEASE_MASTER_CONCEPTS if concepts is None else concepts
    matched = canonicalize_disease_labels([normalized], active_concepts)
    return matched[0] if matched else normalized

def extract_location(
    text: str,
    country: Optional[str] = None,
    allowed_countries: Optional[set[str] | list[str]] = None,
) -> Optional[str]:
    # A caller may intentionally install a small in-memory gazetteer (the
    # library tests do this).  A compiled pattern set is the signal that such
    # a registry is already active; do not merge the production DB rows into
    # it mid-call.  Normal service startup loads the DB registry before the
    # first extraction, while direct callers with no pattern set still get
    # lazy loading.
    if not config.LOCATION_PATTERNS:
        config.ensure_location_registry_loaded()
    text = repair_mojibake(text or "")
    compact_text = re.sub(r"\s+", " ", text)
    lower_text, folded_positions = _fold_with_positions(compact_text)
    hits: list[tuple[str, int]] = []
    allowed_set = {
        _fold_location_text(c)
        for c in (allowed_countries or ([country] if country else []))
        if c
    }
    allowed_names = {
        name for name in config.LOCATION_COORDS
        if not allowed_set
        or _fold_location_text(config.LOCATION_COUNTRIES.get(name, "")) in allowed_set
        or _fold_location_text(name) in allowed_set
    }
    if (country or allowed_countries) and not allowed_names:
        return None

    # Resolve curated publisher abbreviations before matching the generic
    # gazetteer regex. Skip when LOCATION_PATTERNS already covers aliases.
    if not config.LOCATION_PATTERNS:
        for alias, canonical in active_location_aliases().items():
            if canonical not in allowed_names:
                continue
            if _is_native_script(alias):
                pattern_str = re.escape(alias)
                flags = 0
            else:
                is_short_code = len(alias) <= 2
                flags = 0 if is_short_code else re.IGNORECASE
                pattern_str = rf"\b{re.escape(alias.upper() if is_short_code else alias)}\b"
            for match in re.finditer(pattern_str, compact_text, flags):
                if not is_usable_place_name(canonical, compact_text, match.start()):
                    continue
                hits.append((canonical, match.start()))

    location_index = folded_location_index()
    folded_names = (
        location_index
        if not allowed_set
        else {
            folded: canonical
            for folded, canonical in location_index.items()
            if canonical in allowed_names
        }
    )
    if config.LOCATION_PATTERNS:
        pattern = config.LOCATION_PATTERNS[0][1]
        for match in pattern.finditer(lower_text):
            m_lower = match.group(0).lower()
            if (country or allowed_countries) and m_lower not in folded_names:
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
            hits.append((loc, raw_position))

    hits = _drop_nested_place_hits(hits)
    if not hits:
        return None

    # Smart weighted scoring for candidate locations:
    # 1. Base score = frequency in text * 3
    # 2. Bonus if in headline / opening paragraph (pos < 200) = +4
    # 3. Specificity bonus for multi-word or distinct city names = +1
    # 4. Penalty if inside comparative phrasing ("in contrast to Singapore", "including Thailand") = -5
    contextual = re.compile(
        r"(?:setelah|sesudah|dibandingkan|dibanding|daripada|seperti|termasuk|antara lain|misalnya|including|includes|compared with|compared to|higher than|lower than|"
        r"both|between|across|regional partners|countries in|in contrast to|"
        r"neighbouring|neighboring|unlike|versus|vs\.?)",
        re.IGNORECASE,
    )
    counts = Counter(loc for loc, _ in hits)
    scored: dict[str, float] = {}
    all_loc_aliases = active_location_aliases()
    # Country aliases are registry data too, but they must not receive the
    # stronger locality-alias bonus.  Otherwise a comparison country such as
    # Singapore can outrank a primary dateline locality such as Kuala Lumpur.
    alias_names = {loc for loc, _ in hits if loc not in config.ASEAN_COUNTRIES and any(
        canonical == loc and (
            re.search(re.escape(alias), compact_text) if _is_native_script(alias)
            else re.search(rf"\b{re.escape(alias)}\b", compact_text, re.IGNORECASE)
        )
        for alias, canonical in all_loc_aliases.items()
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
            if " " in loc:
                score += 8.0
            loc_country = config.LOCATION_COUNTRIES.get(loc, "")
            if loc_country in config.ASEAN_COUNTRIES or loc in config.ASEAN_COUNTRIES:
                score += 12.0
            if loc in config.ASEAN_COUNTRIES:
                score += 6.0
            if contextual.search(lower_text[max(0, pos - 80):pos]):
                score -= 8.0
            after_loc = compact_text[pos + len(loc): pos + len(loc) + 24]
            if re.match(
                r"\s*,\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|"
                r"[A-Z][a-z]{2,}|[0-9]{1,2}\s)",
                after_loc,
                re.I,
            ):
                # Dateline "KUALA LUMPUR, Aug 4 —" is byline location, not the outbreak province.
                score -= 12.0
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


def extract_all_locations(
    text: str,
    country: Optional[str] = None,
    allowed_countries: Optional[set[str] | list[str]] = None,
    max_chars: Optional[int] = None,
) -> list[dict]:
    """Extract all distinct valid locations mentioned in the text with coordinates."""
    if max_chars is not None and max_chars > 0 and text and len(text) > max_chars:
        text = text[:max_chars]
    if not config.LOCATION_PATTERNS:
        config.ensure_location_registry_loaded()
    text = repair_mojibake(text or "")
    compact_text = re.sub(r"\s+", " ", text)
    lower_text, folded_positions = _fold_with_positions(compact_text)
    hits: list[tuple[str, int]] = []
    allowed_set = {
        _fold_location_text(c)
        for c in (allowed_countries or ([country] if country else []))
        if c
    }
    allowed_names = {
        name for name in config.LOCATION_COORDS
        if not allowed_set
        or _fold_location_text(config.LOCATION_COUNTRIES.get(name, "")) in allowed_set
        or _fold_location_text(name) in allowed_set
    }
    if (country or allowed_countries) and not allowed_names:
        return []

    # LOCATION_PATTERNS already encodes coords + aliases. Re-running one
    # finditer per alias is O(aliases × text) and dominates interactive URL
    # analysis on a full ASEAN gazetteer. Keep the per-alias pass only when
    # the compiled matcher is unavailable (empty registry / unit tests).
    if not config.LOCATION_PATTERNS:
        for alias, canonical in active_location_aliases().items():
            if canonical not in allowed_names:
                continue
            if _is_native_script(alias):
                pattern_str = re.escape(alias)
                flags = 0
            else:
                is_short_code = len(alias) <= 2
                flags = 0 if is_short_code else re.IGNORECASE
                pattern_str = rf"\b{re.escape(alias.upper() if is_short_code else alias)}\b"
            for match in re.finditer(pattern_str, compact_text, flags):
                if not is_usable_place_name(canonical, compact_text, match.start()):
                    continue
                hits.append((canonical, match.start()))

    location_index = folded_location_index()
    folded_names = (
        location_index
        if not allowed_set
        else {
            folded: canonical
            for folded, canonical in location_index.items()
            if canonical in allowed_names
        }
    )
    if config.LOCATION_PATTERNS:
        pattern = config.LOCATION_PATTERNS[0][1]
        for match in pattern.finditer(lower_text):
            m_lower = match.group(0).lower()
            if (country or allowed_countries) and m_lower not in folded_names:
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
            hits.append((loc, raw_position))

    hits = _drop_nested_place_hits(hits)
    if not hits:
        return []

    primary = extract_location(text, country=country, allowed_countries=allowed_countries)
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
        c = config.LOCATION_COUNTRIES.get(name, country)
        if allowed_set:
            folded_c = _fold_location_text(c or "")
            folded_n = _fold_location_text(name)
            if folded_c not in allowed_set and folded_n not in allowed_set:
                continue
        lat, lon, conf, needs_review = geocode_place(name, c)
        hier = resolve_location_hierarchy(name, country_hint=c)
        if hier.get("country_conflict"):
            hier = resolve_event_location_hierarchy(name, country_hint=c)
            needs_review = True
        results.append({
            "name": name,
            "latitude": hier.get("latitude") if lat is not None else None,
            "longitude": hier.get("longitude") if lon is not None else None,
            "country": hier.get("country") or c,
            "admin1": hier.get("admin1_name"),
            "admin2": hier.get("admin2_name"),
            "country_iso3": hier.get("country_iso3"),
            "admin_level": hier.get("admin_level"),
            "geocode_confidence": conf if not hier.get("country_conflict") else 0.0,
            "geocode_needs_review": needs_review or hier.get("country_conflict", False),
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
        "dịch bệnh", "phòng chống dịch", "giám sát dịch", "โรคระบาด",
        "ป้องกันโรค", "เฝ้าระวังโรค",
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
        r"\b(?:surge|spike|melonjak|lonjakan|meningkat tajam|increase in|peningkatan)\b.{0,80}\b(?:cases?|kasus|infections?)\b|"
        r"\b(?:bùng phát|ổ dịch)\b|(?:โรคระบาด|การระบาด|แพร่ระบาด))",
        value,
        re.IGNORECASE,
    )
    if not explicit_incident:
        return False
    policy_only = is_policy_or_statistical_health_content(value)
    incident_qualifier = re.search(
        r"(?:\b(?:outbreaks?|epidemics?|wabah|klb|kejadian luar biasa|clusters?|klasters?|spikes?|surges?|lonjakan|peningkatan tajam)\b"
        r".{0,80}\b(?:detected|declared|reported|occurred|confirmed|terjadi|dilaporkan|ditetapkan|"
        r"reported cases|kasus baru|new cases|transmission|penularan|cases?|kasus|infections?|"
        r"bùng phát|ổ dịch|โรคระบาด|การระบาด|แพร่ระบาด)\b|"
        r"(?:bùng phát|ổ dịch|โรคระบาด|การระบาด|แพร่ระบาด)"
        r".{0,80}(?:\b(?:ca|ca mắc|trường hợp|người bệnh|cases?|kasus|patients?)\b|ผู้ป่วย|ราย))",
        value,
        re.IGNORECASE,
    )
    return not policy_only or bool(incident_qualifier)


def is_outbreak_content(text: str) -> bool:
    """Backward-compatible name for explicit outbreak detection."""
    return is_explicit_outbreak_report(text)


# Fallback built-ins when database extraction_rules are empty or DB is offline
_ACADEMIC_STUDY_FALLBACK = re.compile(
    r"\b("
    r"skripsi|tesis|disertasi|tugas\s+akhir|karya\s+tulis\s+ilmiah|\bkti\b|"
    r"abstrak\s+penelitian|latar\s+belakang\s+masalah|rumusan\s+masalah|tujuan\s+penelitian|"
    r"tinjauan\s+pustaka|metode\s+penelitian|populasi\s+dan\s+sampel|teknik\s+sampling|"
    r"kuesioner|kuisioner|koefisien\s+korelasi|uji\s+validitas|uji\s+reliabilitas|"
    r"total\s+sampling|purposive\s+sampling|cross[- ]sectional|case[- ]control|"
    r"cohort\s+study|descriptive\s+study|uji\s+chi[- ]square|regresi\s+logistik|"
    r"fakultas\s+kedokteran|program\s+studi|prodi\s+kesehatan|dosen\s+pembimbing|"
    r"penguji\s+skripsi|sidang\s+skripsi|wisuda|yudisium|"
    r"jurnal\s+kesehatan|journal\s+of|volume\s+\d+\s+nomor\s+\d+|\bissn\b|prosiding\s+seminar|"
    r"call\s+for\s+papers|best\s+paper|mahasiswa\s+kkn|kuliah\s+kerja\s+nyata|"
    r"pengabdian\s+masyarakat|pengabdian\s+kepada\s+masyarakat"
    r")\b",
    re.IGNORECASE,
)

_AGRICULTURAL_DISEASE_FALLBACK = re.compile(
    r"\b("
    r"tanaman|tumbuhan|ubi\s+kayu|singkong|padi|kelapa\s+sawit|jagung|kakao|karet|hortikultura|"
    r"hama\s+tanaman|wereng|fusarium|daun\s+menguning|perkebunan|gagal\s+panen\s+tanaman|"
    r"aquaculture|akuakultur|perikanan\s+budidaya|tambak\s+udang|budidaya\s+ikan"
    r")\b",
    re.IGNORECASE,
)

_METAPHORICAL_PHRASE_FALLBACK = re.compile(
    r"\b("
    r"judi\s+online|judol|pinjaman\s+online|pinjol|"
    r"demam\s+panggung|demam\s+piala\s+dunia|demam\s+pilkada|demam\s+pesta\s+demokrasi|"
    r"kanker\s+korupsi|virus\s+hoax|wabah\s+kemiskinan|wabah\s+kejahatan"
    r")\b",
    re.IGNORECASE,
)

_NON_HEALTH_TOPIC_FALLBACK = re.compile(
    r"\b("
    r"asian games|sea games|premier league|world cup|grand slam|"
    r"olympic|olympics|surfing|surfer|cricket|football|soccer|"
    r"basketball|volleyball|sepak bola|badminton|"
    r"spectrum auctions?|money laundering|stock market|oil price|"
    r"harga minyak|parlemen|pemilu|election|elections|far[- ]right|"
    r"voting under way|korupsi|corruption|gratifikasi|pungli|politik uang|dinasti politik|"
    r"ambang batas parlemen|ruu pemilu|budget approaches|"
    r"super-luxe condos|properties seized|"
    r"violence|violent|conflict|war|unrest|political unrest|"
    r"refugees?|displaced people|idps?|humanitarian crisis|"
    r"casualt(?:y|ies)|airstrike|military operation|rudal balistik|rudal|kapal perang|"
    r"messi|ronaldo|fifa|uefa|liga champions|champions league|"
    r"transfer window|hat-?trick|soccer match|football match|"
    r"food security|ketahanan pangan|drought|kekeringan|"
    r"crop failure|gagal panen|famine|kelaparan|"
    r"armed conflict|konflik bersenjata|border tension|"
    r"ketegangan|ceasefire|gencatan senjata"
    r")\b",
    re.IGNORECASE,
)

_METRIC_EXCLUSION_FALLBACK = re.compile(
    r"\b(?:"
    r"responden|sampel|subjek|kuesioner|kuisioner|mahasiswa|siswa|murid|"
    r"peserta\s+penyuluhan|peserta\s+seminar"
    r")\b",
    re.IGNORECASE,
)

_NON_HEALTH_TOPIC = _NON_HEALTH_TOPIC_FALLBACK


def _get_dynamic_rule_patterns(field_name: str, fallback_regex: re.Pattern) -> list[re.Pattern]:
    """Retrieve database-driven extraction rules for field_name, with fallback to built-in."""
    patterns = getattr(config, "EXTRACTION_RULES", {}).get(field_name, [])
    if patterns:
        compiled = []
        for p in patterns:
            try:
                compiled.append(re.compile(p, re.IGNORECASE))
            except re.error:
                continue
        if compiled:
            return compiled
    return [fallback_regex]


def is_academic_or_scholarly_research(text: str) -> bool:
    """Return True if article is academic research, student thesis, or scholarly abstract."""
    sample = text or ""
    patterns = _get_dynamic_rule_patterns("academic_study", _ACADEMIC_STUDY_FALLBACK)
    if not any(p.search(sample[:6000]) for p in patterns):
        return False
    # If the article explicitly reports an active outbreak / declared emergency, do not drop
    if is_explicit_outbreak_report(sample):
        return False
    if re.search(r"\b(?:status\s+waspada\s+klb|ditetapkan\s+(?:sebagai\s+)?klb|darurat\s+kesehatan)\b", sample, re.I):
        return False
    return True


def is_agricultural_or_plant_disease(text: str) -> bool:
    """Return True if disease context is agricultural, plant, crop, or non-human pest."""
    sample = text or ""
    patterns = _get_dynamic_rule_patterns("agricultural_disease", _AGRICULTURAL_DISEASE_FALLBACK)
    if not any(p.search(sample[:4000]) for p in patterns):
        return False
    # A generic word like 'wabah' or 'kasus' in a crop/plant article is NOT a human health signal.
    # Only override if explicit human disease master concepts AND human medical terms exist.
    human_diseases = [
        d for d in (extract_alias_diseases(sample[:2000]) or extract_diseases(sample[:2000]))
        if d and d.upper() != "UNKNOWN"
    ]
    if human_diseases and re.search(r"\b(?:pasien|korban\s+jiwa|rumah\s+sakit|kemenkes|menkes|penderita|warga\s+terinfeksi)\b", sample, re.I):
        return False
    return True


def is_metaphorical_or_social_topic(text: str) -> bool:
    """Return True if disease terms are used metaphorically in politics/crime/social news."""
    sample = text or ""
    patterns = _get_dynamic_rule_patterns("metaphorical_phrase", _METAPHORICAL_PHRASE_FALLBACK)
    if not any(p.search(sample[:4000]) for p in patterns):
        return False
    # Only override if there is an actual medical context and verified human disease
    human_diseases = [
        d for d in (extract_alias_diseases(sample[:2000]) or extract_diseases(sample[:2000]))
        if d and d.upper() != "UNKNOWN"
    ]
    if human_diseases and re.search(r"\b(?:rawat\s+inap|puskesmas|rumah\s+sakit|kemenkes|dinas\s+kesehatan)\b", sample, re.I):
        return False
    return True



_PREVENTION_TIPS_FALLBACK = re.compile(
    r"\b("
    r"tips\s+mencegah|cara\s+mencegah|langkah\s+pencegahan|kenali\s+gejala|"
    r"pola\s+hidup\s+bersih\s+dan\s+sehat|\bphbs\b|jangan\s+panik|mitos\s+dan\s+fakta"
    r")\b",
    re.IGNORECASE,
)


def is_general_prevention_tips(text: str) -> bool:
    """Return True if article is generic prevention tips or PHBS without active outbreak."""
    sample = text or ""
    patterns = _get_dynamic_rule_patterns("general_prevention_tips", _PREVENTION_TIPS_FALLBACK)
    if not any(p.search(sample[:4000]) for p in patterns):
        return False
    if has_surveillance_signal(sample) or is_explicit_outbreak_report(sample):
        return False
    return True


def is_metric_excluded_number(window: str, before: str, after: str) -> bool:
    """Return True if number in context refers to respondents, sample size, or participants."""
    patterns = _get_dynamic_rule_patterns("metric_exclusion", _METRIC_EXCLUSION_FALLBACK)
    check_text = f"{before} {after}"
    return any(p.search(check_text) or p.search(after[:60]) for p in patterns)

_NON_INCIDENT_CONTEXT_FALLBACK = re.compile(
    r"\b(?:refugees?|displaced|internally displaced|idps?|"
    r"humanitarian aid|humanitarian assistance|beneficiaries|"
    r"conflict casualties?|war casualties?|civilian casualties?)\b",
    re.IGNORECASE,
)

_NEGATED_HEALTH_CONTEXT = re.compile(
    r"\b(?:no|not|without|lacks?|denies?)\b[^.!?\n]{0,120}\b(?:disease|infection|"
    r"outbreak|cases?|health surveillance)\b",
    re.IGNORECASE,
)

_SURVEILLANCE_LEXICON = re.compile(
    r"\b("
    r"outbreak|wabah|klb|epidemic|pandemic|epidemi|"
    r"confirmed cases?|laboratory-confirmed|kasus (?:terkonfirmasi|positif)|"
    r"hospitali[sz]ed|meninggal dunia|kematian|"
    r"ministry of health|kemenkes|department of health|"
    r"disease outbreak news|world health organization|"
    r"infectious disease|penyakit menular|surveilans|surveillance"
    r")\b",
    re.IGNORECASE,
)

_AVIAN_EVIDENCE = (
    "h5n1", "h5n2", "h5n6", "h5n8", "hpai", "avian", "bird flu",
    "flu burung", "poultry", "unggas", "highly pathogenic",
)


def has_surveillance_signal(text: str, diseases: Optional[list[str]] = None) -> bool:
    """True when the article has disease + outbreak/case language, not a stray keyword."""
    sample = text or ""
    labels = [item for item in (diseases or []) if item]
    if not labels:
        labels = extract_alias_diseases(sample) or extract_diseases(sample)
    if not labels:
        return bool(is_explicit_outbreak_report(sample))
    if is_explicit_outbreak_report(sample):
        return True
    if _SURVEILLANCE_LEXICON.search(sample):
        return True
    if has_explicit_case_count(sample, disease=labels[0]):
        return True
    return False


def is_clearly_non_health_topic(text: str, diseases: Optional[list[str]] = None) -> bool:
    """Reject non-health topics, academic research, plant diseases, and metaphors."""
    sample = text or ""

    # 1. Academic & Student Research Filter (Skripsi, Tesis, Disertasi, Jurnal, KTI)
    if is_academic_or_scholarly_research(sample):
        return True

    # 2. Agricultural & Plant Disease Filter (Penyakit Tanaman, Hama, Pertanian)
    if is_agricultural_or_plant_disease(sample):
        return True

    # 3. Metaphorical Disease Mentions (Kiasan Politik, Judi Online, Korupsi)
    if is_metaphorical_or_social_topic(sample):
        return True

    # 4. General Non-Health Topics (Olahraga, Pemilu, Militer, dll.)
    nh_patterns = _get_dynamic_rule_patterns("non_health_topic", _NON_HEALTH_TOPIC_FALLBACK)
    sample_lead = sample[:4000]
    matched_nh = any(p.search(sample_lead) for p in nh_patterns)
    if not matched_nh:
        return False

    # A social/conflict article may mention health terms only to say that no
    # disease or surveillance event is present. That negation is not a health
    # signal and must not be reversed by the model/translation projection.
    if _NEGATED_HEALTH_CONTEXT.search(sample) and not (
        extract_alias_diseases(sample) or extract_diseases(sample)
    ):
        return True
    return not has_surveillance_signal(sample, diseases)


def article_states_zero_cases(text: str) -> bool:
    """True when the article explicitly says no cases were detected/reported."""
    sample = text or ""
    if _NO_CASES_REPORTED.search(sample):
        return True
    # Malaria-free / elimination certifications are current-zero statements.
    return article_states_disease_free(sample)


def is_ncd_only_non_outbreak(text: str, diseases: Optional[list[str]] = None) -> bool:
    """Cancer/stroke/heart-attack exhibitions are not infectious-disease events.

    Teammate QA no.53: Disease Name Cancer, Stroke, Heart Attack + 0 cases.
    """
    if is_explicit_outbreak_report(text):
        return False
    labels = [normalize_disease_display(item).lower() for item in (diseases or []) if item]
    folded = (text or "").lower()
    if not labels:
        labels = [name for name in _NCD_LABELS if name in folded]
    infectious = [
        item for item in labels
        if not any(ncd in item for ncd in _NCD_LABELS)
        and item not in {"unknown", ""}
    ]
    if infectious and has_surveillance_signal(text, infectious):
        return False
    ncd_hits = [item for item in labels if any(ncd in item for ncd in _NCD_LABELS)]
    context = bool(_NCD_CONTEXT.search(text or ""))
    # Thai exhibition copy may name no English disease; the NCD framing is enough.
    if context and not infectious:
        return True
    if ncd_hits:
        return context or not has_surveillance_signal(text, ncd_hits)
    return False


def is_vaccine_campaign_not_outbreak(text: str) -> bool:
    """Sanofi/Bangkok influenza-RSV immunity campaigns are not incident outbreaks."""
    sample = text or ""
    if not _VACCINE_CAMPAIGN.search(sample):
        return False
    # Burden figures on a campaign page still match generic case language.
    # Only treat it as an outbreak if the article actually says outbreak/wabah.
    if re.search(r"\b(?:outbreak|wabah|klb|epidemic)\b", sample, re.I):
        return False
    return True


def count_period_type(text: str) -> str:
    """Return incident, cumulative, or unknown for the reporting window."""
    sample = (text or "").lower()
    if article_states_zero_cases(text):
        return "incident"
    if re.search(
        r"\b(?:cumulativ(?:e|ely)|kumulatif|year to date|\bytd\b|so far this year|"
        r"from \w+ (?:20\d{2}|to)|\bas of\b|hingga|sejak|\bso far\b|"
        r"1 january|1 januari|january to|januari hingga|"
        r"dilaporkan per|reported as of)\b",
        sample,
    ):
        return "cumulative"
    if re.search(
        r"\b(?:historically|previous\s+outbreak|prior\s+outbreak|past\s+outbreak|"
        r"for\s+the\s+whole\s+of\s+20\d{2}|in\s+all\s+of\s+20\d{2}|"
        r"in\s+(?:19\d{2}|20[01]\d|202[0-5])|pada\s+tahun\s+(?:19\d{2}|20[01]\d|202[0-5]))\b",
        sample,
    ):
        return "historical"
    if re.search(r"\b(?:this week|epi(?:demiological)? week|past 24 hours|yesterday|new cases)\b", sample):
        return "incident"
    return "unknown"


def should_reject_incident_count(count: Optional[int], text: str) -> bool:
    """Drop national mega-counts that are not labeled as a cumulative window.

    Teammate QA no.54: 184,276 influenza/RSV on a vaccine campaign page.
    Keep genuine cumulative burden (no.52 933 mpox) when the period is labeled.
    """
    try:
        value = int(count or 0)
    except (TypeError, ValueError):
        return False
    if value <= 0:
        return False
    if is_vaccine_campaign_not_outbreak(text) and value >= 10000:
        return True
    if value >= 1000000 and count_period_type(text) != "cumulative":
        return True
    return False


_PROTECTED_JOINED_DISEASES = (
    "hand, foot",
    "foot and mouth",
    "hand foot and mouth",
)
_JOINED_DISEASE_SPLIT = re.compile(
    r"\s*(?:,|/|;|\band\b|\bdan\b|&|\+| vs\.? )\s*",
    re.IGNORECASE,
)


def split_unrelated_disease_labels(diseases: list[str]) -> list[str]:
    """Never persist 'Cancer, Stroke, Heart Attack' as one disease_events name."""
    split: list[str] = []
    for item in diseases or []:
        raw = (item or "").strip()
        if not raw:
            continue
        folded = raw.lower()
        if any(token in folded for token in _PROTECTED_JOINED_DISEASES):
            split.append(raw)
            continue
        if re.search(r",|/|\band\b|\bdan\b", raw, re.I):
            parts = [part.strip() for part in _JOINED_DISEASE_SPLIT.split(raw) if part.strip()]
            split.extend(parts or [raw])
        else:
            split.append(raw)
    return list(dict.fromkeys(split))


def drop_generic_influenza_if_avian(diseases: list[str]) -> list[str]:
    """Keep H5N1/avian as the primary flu disease when both labels fire."""
    labels = [item for item in diseases or [] if item]
    if any(
        any(token in item.lower() for token in ("avian", "h5n1", "bird flu", "flu burung"))
        for item in labels
    ):
        return [
            item for item in labels
            if item.lower() not in {"influenza", "flu", "influenza flu"}
        ]
    return labels


def disease_has_textual_evidence(disease: str, text: str) -> bool:
    """Do not keep a canonical label that is not actually named in the article."""
    label = normalize_disease_display(disease)
    if not label or label.upper() == "UNKNOWN":
        return False
    folded = (text or "").lower()
    token = label.lower()

    # 1. Dynamic check against full active alias registry (including native ASEAN scripts)
    try:
        active = active_disease_aliases()
        canon = canonical_disease_name(label).casefold()
        for alias_key, target_label in active.items():
            if target_label.casefold() == canon or canonical_disease_name(target_label).casefold() == canon:
                if _match_disease_alias(alias_key, text, folded):
                    return True
    except Exception:
        pass
    if any(part in token for part in ("avian", "h5n1", "bird flu", "flu burung")):
        return any(marker in folded for marker in _AVIAN_EVIDENCE)
    aliases = {
        "measles": ("measles", "campak", "sởi", "โรคหัด", "ဝက်သက်", "កញ្ជ្រឹល", "ໝາກແດງ"),
        "mumps": ("mumps", "gondongan", "beguk", "parotitis", "quai bị", "quai bi", "คางทูม", "beke"),
        "rabies": ("rabies", "anjing gila", "lyssavirus", "bệnh dại", "พิษสุนัขบ้า", "ခွေးရူးရောဂါ", "ជំងឺឆ្កែឆ្កួត", "ພະຍາດວໍ້"),
        "dengue": (
            "dengue", "dbd", "demam berdarah", "sot xuat huyet", "sốt xuất huyết",
            "demam denggi", "denggi", "ไข้เลือดออก", "ໄຂ້ຍຸງລາຍ", "ໄຂ້ເລືອດອອກ",
            "သွေးလွန်တုပ်ကွေး", "គ្រុនឈាម",
        ),
        "covid-19": ("covid", "coronavirus", "sars-cov", "โควิด", "ကိုဗစ်", "កូវីដ", "ໂຄວິດ"),
        "malaria": ("malaria", "sốt rét", "sot ret", "มาลาเรีย", "ငှက်ဖျား", "គ្រុនចាញ់", "ໄຂ້ມာລາເຣຍ"),
        "cholera": ("cholera", "kolera", "taun", "bệnh tả", "อหิวาตกโรค", "ကာလဝမ်းရောဂါ", "អាសន្នរោគ", "ອະຫິວາ"),
        "mpox": ("mpox", "monkeypox", "cacar monyet", "đậu mùa khỉ", "dau mua khi", "เอ็มพ็อกซ์"),
        "hfmd": (
            "hfmd", "hand foot", "tangan kaki", "flu singapura", "tay chân miệng", "tay chan mieng",
            "มือเท้าปาก", "โรคมือเท้าปาก", "penyakit tangan, kaki dan mulut",
            "လက်၊ ခြေ၊ ခံတွင်းရောဂါ", "ជំងឺពងបែកដៃជើងនិងក្នុងមាត់",
        ),
        "poliomyelitis": ("polio", "poliovirus", "cvdpv", "poliomyelitis"),
        "hantavirus": ("hantavirus",),
        "influenza": ("influenza", "hmpv", "ไข้หวัดใหญ่", "ໄຂ້ຫວັດໃຫຍ່"),
        "rsv": ("rsv", "respiratory syncytial"),
        "syncytial": ("rsv", "respiratory syncytial", "syncytial"),
        "nipah": ("nipah",),
        "tuberculosis": ("tbc", "tuberculosis", "tuberkulosis", "tibi", "penyakit tibi", "batuk kering", "bệnh lao", "lao", "วัณโรค", "တီဘီ", "របេង", "ວັນນະໂລກ"),
        "acute respiratory": ("ispa", "ari", "infeksi saluran pernapasan", "infeksi saluran pernafasan", "acute respiratory infection", "upper respiratory", "lower respiratory"),
        "pneumonia": ("pneumonia", "radang paru", "viêm phổi", "ปอดบวม"),
        "hepatitis": ("hepatitis",),
        "typhoid": ("typhoid", "tifus", "tipes", "demam tifoid", "thương hàn"),
        "chikungunya": ("chikungunya", "ไข้ชิคุนกุนยา"),
        "leptospirosis": ("leptospirosis", "kencing tikus", "penyakit kencing tikus", "โรคฉี่หนู"),
        "diarrhea": ("diare", "diarrhea", "diarrhoea", "tiêu chảy", "ท้องร่วง"),
        "acute diarrhea": ("diare", "diarrhea", "diarrhoea", "diare akut", "acute diarrhea"),
        "pertussis": ("pertussis", "pertusis", "batuk rejan", "whooping cough"),
        "diphtheria": ("diphtheria", "difteri", "bạch hầu", "bach hau"),
        "filariasis": ("filariasis", "kaki gajah"),
        "scabies": ("scabies", "kudis"),
        "anthrax": ("anthrax", "antraks"),
        "leprosy": ("leprosy", "kusta", "lepra"),
        "stroke": ("stroke", "đột quỵ", "dot quy", "cerebrovascular"),
        "diabetes": ("diabetes", "diabetes melitus"),
        "hypertension": ("hipertensi", "hypertension"),
    }
    key = token
    for name, needles in aliases.items():
        if name in token:
            return any(needle in folded for needle in needles)
    first = token.split()[0]
    return bool(first) and first in folded


def filter_diseases_to_evidence(diseases: list[str], text: str) -> list[str]:
    """Drop canonical labels that are not supported by the article text.

    Live bug: keyword map ``influenza`` → Avian influenza, or a zero-shot
    head picking Rabies for an oil-pipeline 'kasus' story.
    """
    kept: list[str] = []
    for item in drop_generic_influenza_if_avian(split_unrelated_disease_labels(diseases or [])):
        if disease_has_textual_evidence(item, text):
            display = normalize_disease_display(item)
            if display.upper() != "UNKNOWN" and display not in kept:
                kept.append(display)
    return kept


def title_lede_text(text: str, max_chars: int = 500) -> str:
    """Title plus opening sentences — disease and country usually live here."""
    raw = re.sub(r"[ \t]+", " ", (text or "").strip())
    if not raw:
        return ""
    blocks = [part.strip() for part in re.split(r"\n+", raw) if part.strip()]
    head = " ".join(blocks[:2]) if blocks else raw
    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", raw) if part.strip()]
    lede = " ".join(sentences[:2]) if sentences else head
    combined = head if head in lede or lede in head else f"{head} {lede}"
    return combined[:max_chars]


def rank_lede_diseases(candidates: list[str], sample: str) -> list[str]:
    """Prefer diseases named in the title/lede over later body/sidebar mentions."""
    unique = list(dict.fromkeys(item for item in candidates if item))
    folded = (sample or "").lower()
    def _score(name: str):
        token = name.lower()
        first = token.split()[0] if token else ""
        pos = folded.find(token) if token and token in folded else folded.find(first) if first else 999999
        if pos == -1:
            pos = 999999
        avian = 1 if any(part in token for part in ("h5n1", "avian", "bird flu", "flu burung")) else 0
        return (-avian, pos, -len(token))
    return sorted(unique, key=_score)


def predict_surveillance_facts(text: str, source_country: Optional[str] = None) -> dict:
    """Deterministic disease/geo/count facts shared by ingest and the gold runner.

    Manual crawler and bulk ingest must call the same pipeline so mapping and
    case counts cannot drift between those paths.
    """
    lede = title_lede_text(text)
    opening = text[:1200] if text else ""
    aliases = extract_alias_diseases(lede) or extract_alias_diseases(opening)
    diseases = extract_diseases(lede) or extract_diseases(opening)
    ranked = filter_diseases_to_evidence(
        rank_lede_diseases(aliases + diseases, lede or opening),
        text,
    )
    ranked = prefer_outbreak_diseases(ranked, text)
    disease = ranked[0] if ranked else None
    # The full article may mention neighbouring countries in background or
    # weather sections. Primary geography must start from the headline/lede;
    # source-country and later regional mentions are not event geography.
    country = extract_country_hint(opening)
    norm_source = normalize_country(source_country)
    mentioned_asean = extract_all_mentioned_countries(opening)

    # Source metadata identifies the publisher, not the event geography. Do
    # not turn an Indonesian/Vietnamese outlet into a case country when the
    # article itself does not name one.

    # Do not globally filter the gazetteer by every country named anywhere in
    # the document. A province can be the actual event location even when a
    # later paragraph compares regional countries. Context validation below
    # remains the authority for accepting a candidate.
    allowed = None

    all_locations = [
        item for item in extract_all_locations(text, allowed_countries=allowed)
        if is_usable_place_name(str(item.get("name") or ""), text)
    ]

    # Validate with validate_location_context to eliminate leakage
    validated_locations = []
    for item in all_locations:
        loc_name = str(item.get("name") or "")
        res = validate_location_context(
            loc_name, text, source_country=source_country, mentioned_countries=mentioned_asean
        )
        if res["is_valid"]:
            if res.get("country"):
                item["country"] = res["country"]
            # Never let a secondary/foreign gazetteer hit replace an
            # explicitly established article country (e.g. Thailand text
            # with a stray Indonesia locality). Keep the candidate out of
            # primary event attribution; the raw evidence remains available
            # through the source text for later multi-country composition.
            if country and item.get("country") and item["country"] != country:
                item["country_conflict"] = True
                continue
            validated_locations.append(item)
    all_locations = validated_locations

    location = None
    if all_locations:
        location = all_locations[0]["name"]
        country = all_locations[0].get("country") or country
    elif country in config.ASEAN_COUNTRIES:
        # National report with cases/deaths directly attached to the named
        # country. This is still article evidence, not source metadata.
        location = country
        lat, lon, conf, needs_rev = geocode_place(country, country, text)
        all_locations = [{
            "name": country,
            "latitude": lat,
            "longitude": lon,
            "country": country,
            "geocode_confidence": conf,
            "geocode_needs_review": needs_rev,
        }]

    if not location and country in config.ASEAN_COUNTRIES:
        location = country
    if not country and not location:
        country = extract_country_hint(text)
    # National deixis ("nationwide", "across the country") with no named
    # foreign country: the ASEAN source_country is the event geography.
    if not country and norm_source and norm_source in config.ASEAN_COUNTRIES:
        national_scope = re.search(
            r"(?i)\b(?:"
            r"nationwide|nationally|countrywide|across\s+the\s+country|"
            r"throughout\s+the\s+country|in\s+the\s+country|"
            r"seluruh\s+(?:tanah\s+air|negeri|negara)|di\s+tanah\s+air|"
            r"peringkat\s+kebangsaan|seluruh\s+indonesia"
            r")\b",
            text or "",
        )
        conflicting = [
            c for c in extract_all_mentioned_countries(text or "")
            if c != norm_source
        ]
        if national_scope and not conflicting:
            country = norm_source
            if not location:
                location = country
    cases = extract_case_count(text, disease=disease)
    explicit = has_explicit_case_count(text, disease=disease)
    if article_states_zero_cases(text):
        cases = 0
        explicit = True
    if not explicit:
        cases = 0
    deaths = extract_death_count(text, disease=disease)
    if article_states_zero_cases(text):
        # "No cases detected" is not a death report either.
        if not re.search(r"\b(?:deaths?|kematian|meninggal)\b.{0,40}\d", text or "", re.I):
            deaths = 0
    if should_reject_incident_count(cases, text):
        cases = 0
        explicit = False
        deaths = 0
    from .epidemiology import extract_event_period
    period = extract_event_period(text)
    asean_location = country if country in config.ASEAN_COUNTRIES else None
    if is_clearly_non_health_topic(text, ranked) or is_ncd_only_non_outbreak(text, ranked):
        return {
            "disease": None,
            "diseases": [],
            "country": asean_location,
            "location": asean_location,
            "locations": [
                item for item in all_locations
                if item.get("country") in config.ASEAN_COUNTRIES or item.get("name") in config.ASEAN_COUNTRIES
            ],
            "case_count": 0,
            "case_count_unknown": True,
            "death_count": 0,
            "non_health_topic": True,
            "ncd_only": is_ncd_only_non_outbreak(text, ranked),
            "count_period_type": period.get("period_type") or "unknown",
            "event_date": period.get("event_date"),
            "event_date_start": period.get("event_date_start"),
            "event_date_end": period.get("event_date_end"),
            "date_needs_review": bool(period.get("date_needs_review")),
        }
    return {
        "disease": disease,
        "diseases": ranked,
        "country": country,
        "location": location,
        "locations": all_locations,
        "case_count": cases,
        "case_count_unknown": not explicit,
        "death_count": deaths,
        "non_health_topic": False,
        "ncd_only": False,
        "count_period_type": period.get("period_type") or count_period_type(text),
        "event_date": period.get("event_date"),
        "event_date_start": period.get("event_date_start"),
        "event_date_end": period.get("event_date_end"),
        "date_needs_review": bool(period.get("date_needs_review")),
    }


def _sentence_window(text: str, start: int, end: int) -> str:
    left = -1
    for index, char in enumerate(text[:start]):
        if char in ".!?\n":
            left = index
    right = len(text)
    for index in range(end, len(text)):
        if text[index] in ".!?\n":
            right = index
            break
    return text[left + 1:right]


def _runtime_number_word_pattern() -> str:
    """Build the number-token pattern from reviewed DB vocabulary."""

    words = sorted(config.get_lexicon_values("number_word"), key=len, reverse=True)
    alternatives = [re.escape(word) for word in words]
    alternatives.append(r"[0-9]{1,3}(?:[,\.\s]\d{3})+\.?")
    alternatives.append(r"[0-9]+(?:[.,]\d+)?\.?")
    return "(?:" + "|".join(alternatives) + ")"


def _runtime_metric_label_pattern(marker_type: str) -> str:
    terms = sorted(config.get_lexicon_terms(marker_type), key=len, reverse=True)
    return "(?:" + "|".join(re.escape(term) for term in terms) + ")" if terms else r"(?!)"


def _is_embedded_number_word(text: str, start: int) -> bool:
    source = (text or "").casefold()
    for word in config.get_lexicon_values("number_word"):
        if " " not in word:
            continue
        candidate = source.find(
            word.casefold(),
            max(0, start - len(word) - 1),
            start + len(word),
        )
        if 0 <= candidate < start < candidate + len(word):
            return True
    return False

_FOCAL_SINGULAR = re.compile(
    r"(?:"
    r"this one involving|"
    # An ordinal cumulative label still refers to the newly reported case;
    # it must not be replaced by a later historical total in the same story.
    r"(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+"
    r"(?:human\s+)?(?:h5n1\s+)?(?:avian\s+(?:influenza|flu)\s+)?(?:case|infection)\b|"
    r"a severe (?:h5n1|avian).{0,80}(?:infection|case)|"
    r"(?:infection|case) involved a \d+-year-old|"
    r"(?:reported|reports|confirms?)\s+(?:a|another|one)\s+(?:severe\s+)?"
    r"(?:human\s+)?(?:h5n1\s+)?(?:avian\s+(?:influenza|flu)\s+)?"
    r"(?:infection|case)\b|"
    # Indonesian / Malay single individual
    r"seorang\s+(?:wanita|pria|anak|pasien|warga|balita|bayi|ibu|bapak|orang|lansia|santri|siswi|siswa|korban|perawat|dokter)\b|"
    r"seekor\s+(?:anjing|kucing|kera|monyet|unggas|burung|ayam)\b|"
    r"satu\s+(?:kasus|pasien|orang|warga)\s+(?:baru\s+)?(?:positif|terkonfirmasi|ditemukan|dilaporkan|tercatat|dirawat|meninggal)|"
    r"(?:pasien|balita|bayi|anak|korban)\s+(?:berusia|berumur)?\s*\d+\s*(?:tahun|thn|th|bulan|bln)\s+(?:terjangkit|terinfeksi|positif|terkena|dirawat|meninggal)|"
    # English contextual single
    r"(?:a|one|the)\s+(?:woman|man|child|patient|resident|person|boy|girl|infant|toddler|elderly|individual)\s+(?:was\s+)?(?:diagnosed|infected|contracted|tested positive|hospitalized|stricken|admitted|died)|"
    r"(?:he|she)\s+(?:was\s+)?(?:diagnosed|infected|contracted|tested positive|hospitalized)|"
    r"(?:reported|confirms?|detected|logged)\s+(?:a|one|another)\s+(?:case|infection)\b|"
    # Vietnamese
    r"một\s+(?:người|phụ nữ|đàn ông|trẻ em|bệnh nhân|cháu bé|ca)\s+(?:nhiễm|mắc|dương tính|nhập viện|tử vong)|"
    # Thai
    r"ผู้ป่วย(?:หญิง|ชาย|เด็ก)?รายหนึ่ง\s*(?:ติดเชื้อ|ป่วย|รักษาตัว|เสียชีวิต)"
    r")",
    re.I,
)

_HEADLINE_TWO = re.compile(
    r"(?:"
    r"first(?:\s+\w+){0,8}\s+two|the two cases|two cases\s+[–-]\s+both|"
    r"both\s+(?:patients?|cases?|victims?)|a\s+couple|"
    r"sepasang\s+(?:suami\s+istri|lansia|warga|pasien)|"
    r"kedua\s+(?:pasien|korban|anak|balita|warga)|"
    r"dua\s+(?:orang\s+)?(?:pasien|warga|anak|balita|kasus)\s+(?:positif|terinfeksi|terjangkit|terkena|dirawat)|"
    r"hai\s+(?:mẹ\s+con|anh\s+em|bệnh\s+nhân|ca)|"
    r"cả\s+hai\s+ca|"
    r"ผู้ป่วย\s*2\s*ราย|ทั้งสองราย"
    r")",
    re.I,
)

_APPROXIMATE_QUANTIFIERS = {
    "beberapa": {"min": 2, "max": 9, "median": 5},
    "several": {"min": 2, "max": 9, "median": 5},
    "a few": {"min": 2, "max": 5, "median": 3},
    "belasan": {"min": 11, "max": 19, "median": 15},
    "puluhan": {"min": 20, "max": 99, "median": 50},
    "tens of": {"min": 20, "max": 99, "median": 50},
    "ratusan": {"min": 100, "max": 999, "median": 200},
    "hundreds of": {"min": 100, "max": 999, "median": 200},
    "ribuan": {"min": 1000, "max": 9999, "median": 2000},
    "thousands of": {"min": 1000, "max": 9999, "median": 2000},
}

_OUTBREAK_CLOSED = re.compile(
    r"\b(?:ended its outbreak|officially ended|outbreak closure|"
    r"no poliovirus has been detected|closure of (?:the )?polio)\b",
    re.I,
)

# Certification / elimination language: current burden is zero; historical peaks
# belong in historical_cases, not the live case_count.
_DISEASE_FREE_CERT = re.compile(
    r"(?i)\b(?:"
    r"malaria[- ]free|certified(?:\s+\w+){0,6}\s+(?:as\s+)?malaria[- ]free|"
    r"(?:declared|certified)\s+(?:\w+\s+){0,4}(?:disease[- ]free|free\s+of\s+malaria)|"
    r"zero\s+indigenous\s+cases|"
    r"from\s+\d[\d\s,.]{0,12}\s+cases\s+to\s+zero|"
    r"(?:to|at)\s+zero(?:\s+indigenous)?\s+cases|"
    r"elimination\s+(?:of\s+)?malaria|interrupted\s+nationwide"
    r")\b",
)

_NO_CASES_REPORTED = re.compile(
    r"\b("
    r"no(?:\s+new)?\s+cases?(?:\s+of\s+[\w][\w\s-]{0,40})?\s+"
    r"(?:have\s+been\s+|has\s+been\s+|were\s+|was\s+|are\s+)?"
    r"(?:detected|reported|recorded|identified|found)|"
    r"no\s+(?:nipah|covid|measles|dengue|mpox|ebola)(?:\s+virus)?\s+"
    r"(?:cases?|infections?)\s+(?:have\s+been\s+|has\s+been\s+)?"
    r"(?:detected|reported|recorded)|"
    r"not\s+yet\s+detected|"
    r"tidak\s+ada\s+kasus|belum\s+ada\s+kasus|zero\s+cases"
    r")\b",
    re.I,
)


def article_states_disease_free(text: str) -> bool:
    """True when the article certifies elimination / malaria-free / zero indigenous."""
    return bool(_DISEASE_FREE_CERT.search(text or ""))

_NCD_LABELS = {
    "stroke", "cancer", "heart attack", "heart disease", "diabetes",
    "hypertension", "cardiovascular", "cerebrovascular",
}

_NCD_CONTEXT = re.compile(
    r"(?:นิทรรศการ|exhibition|insurance|asuransi|alianz|อยุธยา|"
    r"heart attack|cancer|stroke|non-communicable|ncd|"
    r"ลองเผชิญ|โรคร้ายแลนด์|ลอง\s+เผชิญ)",
    re.I,
)

_VACCINE_CAMPAIGN = re.compile(
    r"\b(?:vaccine campaign|vaccination campaign|immuni[sz]ation campaign|"
    r"เกราะภูมิคุ้มกัน|จับมือ|partnership|campaign target|doses?)\b",
    re.I,
)

_VACCINE_WINDOW = re.compile(
    r"\b(?:doses?|immuni[sz]ation|campaign target)\b|\bvaccinat(?:ed|ion|ing)\b",
    re.I,
)

_ANIMAL_OUTBREAK = re.compile(
    r"\b(?:poultry|egg(?:-laying)? farms?|avian flu outbreaks?|animal)\b",
    re.I,
)


def _compact_spaced_thousands(text: str) -> str:
    """WHO WPRO style: '40 915' / '3 029' / '73 828' → compact integers."""
    return re.sub(
        r"\b(\d{1,3}(?:[ \u00a0]\d{3})+)\b",
        lambda match: re.sub(r"[ \u00a0]", "", match.group(1)),
        text or "",
    )


def _years_in(text: str) -> list[int]:
    return [int(year) for year in re.findall(r"\b((?:19|20)\d{2})\b", text or "")]


def _period_score(window: str, full_text: str) -> int:
    """Boost current-year / YTD figures; penalize comparator-year distractors."""
    score = 0
    window_l = (window or "").lower()
    full_l = (full_text or "").lower()
    if re.search(r"\b(?:this year|so far|year to date|\bytd\b|nationwide|in the country|nationally|tahun ini|setakat ini|peringkat kebangsaan|seluruh negara)\b", window_l):
        score += 8
    if re.search(r"\b(?:cumulativ(?:e|ely)|a total of|has logged|so far|kumulatif)\b", window_l):
        score += 20
    # Prefer a reporting window anchored to a start period over a shorter
    # nested update later in the article (for example, ``since January`` vs
    # ``this month``). These are generic period signals, not article rules.
    if re.search(
        r"\b(?:since|from|sejak|mulai|sejak awal|từ|từ đầu)\s+(?:19|20)?\d{0,2}\s*"
        r"(?:january|januari|february|februari|march|maret|april|may|mei|june|juni|"
        r"july|juli|august|agustus|september|october|oktober|november|december|desember|"
        r"q[1-4]|the year|tahun)\b",
        window_l,
    ):
        score += 8
    if re.search(
        r"\b(?:last year|previous year|previous week|compared with|compared to|"
        r"same period|in contrast|in all of|the whole of|tahun lepas|tahun lalu|tempoh sama|berbanding)\b",
        window_l,
    ):
        score -= 10
    years_w = _years_in(window)
    years_all = _years_in(full_text)
    has_this_year = bool(re.search(r"\bthis year\b", full_l))
    if years_w and years_all:
        latest = max(years_all)
        if any(year == latest for year in years_w):
            score += 6
        if all(year < latest for year in years_w):
            score -= 12
    if has_this_year and years_w and not re.search(r"\bthis year\b", window_l):
        score -= 10
        # A focal current-year case can be followed by a prior-year country
        # total.  The prior-year value must not win merely because it is
        # attached to the same country name.
        latest_year = max(years_all) if years_all else None
        if latest_year is not None and max(years_w) <= latest_year:
            score -= 30
    if re.search(
        r"\b(?:since\s+(?:then|19\d{2}|200[0-9]|201[0-9])|since\s+the\s+re-emergence|"
        r"historical|all[- ]time|first\s+detected|initially\s+affecting)\b",
        window_l,
    ):
        # All-time / since-first-detection CFR totals must not outrank the
        # focal outbreak-year death clause (H5N1 DON pattern).
        score -= 28
    if re.search(r"\b(?:this month|this week|district|previous week|the whole of)\b", window_l):
        score -= 12
    if re.search(r"\b(?:the whole of|all of)\s+(?:19|20)\d{2}\b", window_l):
        score -= 25
    if re.search(
        r"\b(?:in|during|pada|selama)\s+(?:january|januari|february|februari|march|maret|"
        r"april|may|mei|june|juni|july|juli|august|agustus|september|october|oktober|"
        r"november|december|desember)\b",
        window_l,
    ):
        score += 4
    return score


def _focal_human_case_override(text: str) -> Optional[int]:
    if article_states_zero_cases(text) or _OUTBREAK_CLOSED.search(text or ""):
        return None
    source = text or ""
    # Photo-caption / vignette singular ("A child diagnosed...") must not
    # override an explicit multi-case national total in the same article.
    large_total = re.search(
        r"(?i)(?:more\s+than|over|nearly|about|around|approximately|at\s+least|top|reached|recorded|logged|reported|"
        r"sebanyak|lebih\s+dari|mencapai|ghi\s+nhận)\s*"
        r"(\d{1,3}(?:[,.\s]\d{3})+|\d{2,})\s+"
        r"(?:cases?|kasus|infections?|patients?|penderita|ca\s+mắc|trường\s+hợp)",
        source,
    )
    if large_total:
        try:
            raw = re.sub(r"[,.\s]", "", large_total.group(1))
            if int(raw) >= 10:
                return None
        except Exception:
            pass
    headline_two = _HEADLINE_TWO.search(source)
    if headline_two and not _is_embedded_number_word(source, headline_two.start()):
        return 2
    if _FOCAL_SINGULAR.search(source):
        return 1
    return None

def is_non_incident_metric_context(text: str, start: int, end: int) -> bool:
    """Detect DB-managed counts that are not disease incidence metrics."""

    source = text or ""
    left = max(0, start - 180)
    right = min(len(source), end + 180)
    context = source[left:right].casefold()
    if _NON_INCIDENT_CONTEXT_FALLBACK.search(context):
        return True
    return any(
        term.strip().casefold() in context
        for term in config.get_lexicon_terms("metric_non_incident")
        if term and term.strip()
    )


# World/annual signals in the languages this pipeline already reads.
# A figure in one of these sentences is a global average, not a local outbreak count.
_GLOBAL_AVERAGE_SCOPE = re.compile(
    r"(?:"
    r"\b(?:worldwide|world-wide|globally|annual average|each year|every year|per year)\b|"
    r"\bglobal average\b|"
    # WHO alone is often the notifying agency for a national DON; only treat it
    # as global when paired with worldwide/annual wording in the same sentence.
    r"(?:\bWHO\b|world health organization|organisasi kesehatan dunia).{0,100}?"
    r"(?:\b(?:worldwide|world-wide|globally|each year|every year|per year|annual)\b)|"
    r"(?:\b(?:worldwide|world-wide|globally|each year|every year|per year|annual)\b).{0,100}?"
    r"(?:\bWHO\b|world health organization|organisasi kesehatan dunia)|"
    r"secara global|seluruh dunia|setiap tahun(?:nya)?|"
    r"toàn cầu|mỗi năm|"
    r"ทั่วโลก|ทุกปี|"
    r"ទូទាំងពិភពលោក|"
    r"ທົ່ວໂລກ|"
    r"ကမ္ဘာတစ်ဝှမ်း|နှစ်စဉ်"
    r")",
    re.IGNORECASE | re.UNICODE,
)
_RELATED_LINK_HEADING = re.compile(
    r"(?:^|\n)[ \t]*(?:"
    r"related(?:[ \t]+(?:articles?|stories|links?))?|"
    r"see also|read more|more on this story|"
    r"baca juga|artikel terkait|berita terkait|lihat juga|"
    r"xem thêm|đọc thêm|"
    r"ข่าวที่เกี่ยวข้อง|អត្ថបទពាក់ព័ន្ធ|ບົດຄວາມທີ່ກ່ຽວຂ້ອງ"
    r")\b",
    re.IGNORECASE | re.UNICODE,
)
_VACCINE_MENTION = re.compile(
    r"(?:vaccin(?:e|es|ation)|immuni[sz]ation|\bmmr\b|"
    r"vaksin(?:asi)?|imunisasi|"
    r"วัคซีน|vắc[\s-]?xin|វ៉ាក់សាំង|ວັກຊີນ|ကာကွယ်ဆေး|bakuna)",
    re.IGNORECASE | re.UNICODE,
)


def related_link_offset(text: str) -> int:
    """Offset where a related-link block starts, or -1 when the article has none."""

    match = _RELATED_LINK_HEADING.search(text or "")
    return match.start() if match else -1


def _metric_sentence_bounds(text: str, start: int, end: int) -> tuple[int, int]:
    """Sentence bounds that do not split on thousands separators such as 2.001."""

    source = text or ""
    left = 0
    pos = start
    while pos > 0:
        idx = max(source.rfind(mark, 0, pos) for mark in ".!?\n")
        if idx < 0:
            break
        if (
            source[idx] == "."
            and idx > 0
            and idx + 1 < len(source)
            and source[idx - 1].isdigit()
            and source[idx + 1].isdigit()
        ):
            pos = idx
            continue
        left = idx + 1
        break
    right = len(source)
    pos = end
    while pos < len(source):
        candidates = [source.find(mark, pos) for mark in ".!?\n"]
        candidates = [item for item in candidates if item >= 0]
        if not candidates:
            break
        idx = min(candidates)
        if (
            source[idx] == "."
            and idx > 0
            and idx + 1 < len(source)
            and source[idx - 1].isdigit()
            and source[idx + 1].isdigit()
        ):
            pos = idx + 1
            continue
        right = idx
        break
    return left, right


def metric_source_scope(text: str, start: int, end: int) -> str:
    """Label a metric as article-local, a global average, or a figure from another URL.

    The decision uses the sentence around the number. It does not look up a city
    list and it does not treat a later country mention as the place of a global figure.
    """

    source = text or ""
    link_at = related_link_offset(source)
    if link_at >= 0 and start >= link_at:
        return "other_url"
    sentence_start, sentence_end = _metric_sentence_bounds(source, start, end)
    sentence = source[sentence_start:sentence_end]
    if _GLOBAL_AVERAGE_SCOPE.search(sentence):
        return "global_average"
    return "article_local"


def _extract_count(text: str, field: str, default: int, disease: Optional[str] = None) -> int:
    raw = "".join(
        str(unicodedata.digit(char)) if unicodedata.category(char) == "Nd" else char
        for char in (text or "")
    )
    search_text = _compact_spaced_thousands(raw)
    article_country = extract_country_hint(search_text[:1500])
    disease_terms: list[str] = []
    if disease:
        disease_norm = disease.strip().lower()
        matched_aliases = []
        for concept in getattr(config, "DISEASE_MASTER_CONCEPTS", []):
            if concept.get("canonical_name", "").lower() == disease_norm:
                for a in concept.get("aliases", []):
                    alias_str = (a.get("alias") if isinstance(a, dict) else str(a)).lower().strip()
                    if len(alias_str) > 2:
                        matched_aliases.append(alias_str)
                        matched_aliases.extend(alias_str.split())
        disease_terms = [t for t in {
            disease_norm,
            *(disease_norm.split()),
            *matched_aliases,
            *({
                "h5n1", "avian", "flu",
            } if "avian" in disease.lower() or "h5n1" in disease.lower() else set()),
            *({"mpox", "monkeypox"} if "mpox" in disease.lower() or "monkey" in disease.lower() else set()),
            *({"polio", "poliovirus", "cvdpv"} if "polio" in disease.lower() else set()),
        } if len(t) > 2]
    num_token = _runtime_number_word_pattern()
    case_label = _runtime_metric_label_pattern("metric_case")
    localized_patterns = {
        "case_count": [
            rf"(?<![A-Za-z0-9])({num_token})(?:\s+[A-Za-z\u00C0-\u024F\u1EA0-\u1EFF(),/'-]+){{0,7}}\s*{case_label}(?!\w)"
            r"(?!\s*(?:telah|sudah|yang|were|was|have|has|of)?\s*"
            r"(?:meninggal|kematian|tewas|died|death|deaths|fatalities|tử\s+vong)\b)",
            rf"(?:cases?|infections?|kasus|patients?|warga)\s*(?:of\s+[a-z-]+\s*)?\(\s*({num_token})\s*\)",
            rf"(?:with|logged|recorded|reported|total of|mencatat|melaporkan|sebanyak|ghi\s+nhận|có|nearly|about|around|approximately|more than|over|reached)\s+({num_token})\s+(?:[a-z\u00C0-\u024F\u1EA0-\u1EFF-]+\s+)?(?:infections?|cases?|kasus|warga|pasien|ca\s+mắc|ca|suspected)",
            rf"(?:cases?|infections?|kasus).{{0,90}}(?:rose|climbed|increased|jumped|naik).{{0,50}}to\s+({num_token})",
            rf"(?:cases?|infections?|kasus)\s+(?:reached|total(?:ed)?|stood at|of)\s+({num_token})",
            rf"(?:cases?|infections?|kasus|pasien)\b[^.\n;:]{{0,100}}?\b(?:reached|recorded|reported|tercatat|mencatat|melaporkan|total(?:ed)?|stood at|of)\s+({num_token})",
            rf"(?:sickened|infected|affected)\s+(?:more than|over|nearly|about|around)?\s*({num_token})\s+(?:children|people|persons|residents)",
            r"ဓာတ်ခွဲနမူနာ[^။]{0,220}?စစ်ဆေးခဲ့ရာ\s*([0-9][0-9,.]*)\s*ဦးတွေ့ရှိ",
            r"(?:ผู้ป่วยใหม่|ผู้ป่วย|ติดเชื้อ)\s*([0-9][0-9,.]*)\s*ราย",
            r"(?:ผู้ป่วย|ผู้ติดเชื้อ)(?:สะสม|ใหม่|ทั้งหมด)?\s*([0-9][0-9,.]*)\s*(?:ราย|คน)",
            r"(?:ករណីឆ្លងថ្មី|ករណីឆ្លង|អ្នកឆ្លង)\s*([0-9][0-9,.]*)\s*នាក់",
            r"(?:အတည်ပြုလူနာ|ကူးစက်သူ|လူနာ)\s*([0-9][0-9,.]*)\s*(?:ဦး|ယောက်)",
        ],
        "death_count": [
            rf"\b({num_token})\s+(?:cases?|kasus|kes)\s+(?:of\s+)?(?:deaths?|kematian|fatalities|tewas|maut)\b",
            rf"(?:deaths?|kematian|korban jiwa|fatalities|maut)\s+(?:rose|climbed|increased|jumped|meningkat|naik|bertambah)\s+(?:from\s+[0-9,.]+\s+)?to\s+({num_token})",
            rf"\b({num_token})(?:\s+[\w\u00C0-\u024F\u1EA0-\u1EFF/'’-]+){{0,3}}\s+(?:meninggal(?:\s+dunia)?|kematian|korban jiwa|death|deaths|fatalities|fatality|tewas|died|killed|fatal|maut|tử\s+vong)\b",
            rf"(?:logged|recorded|reported|mencatat|sebanyak|including)\s+({num_token})\s+(?:[a-z-]+\s+)?(?:deaths?|kematian|fatalities|maut)",
            rf"(?:killed|caused|causing|menyebabkan|meragut\s+nyawa|mengorbankan)\s+({num_token})\s+(?:people|persons|residents|orang|warga|jiwa)?",
            rf"(?:death toll|toll)\s+(?:reached|reaches|rose to|stood at|of)\s+({num_token})",
            rf"({num_token})\s+of them fatally",
            rf"in 20\d{{2}},\s+the figure was\s+({num_token})",
            rf"(?:kumulatif\s+)?(?:kematian|angka\s+korban|maut|korban\s+jiwa)\b[^.\n;:]{{0,140}}?\b(?:terdapat|mencatat|mencatatkan|sebanyak|ialah|adalah|mencapai)\s+({num_token})\s*(?:kes)?",
            rf"\b(?:deaths?|kematian|angka\s+korban|maut|korban\s+jiwa|meninggal(?:\s+dunia)?)\b[^.\n;:]{{0,180}}?\b(?:bagi|pada|in|for)\s+(?:tahun\s+|year\s+)?20\d{{2}}[^.\n;:]{{0,80}}?\b(?:terdapat|sebanyak|adalah|mencatat|mencatatkan|to|stood at)\s+({num_token})\s*(?:kes)?",
            rf"\b(?:bagi|pada|in|for)\s+(?:tahun\s+|year\s+)?20\d{{2}}[^.\n;:]{{0,80}}?\b(?:terdapat|sebanyak|adalah|mencatat|mencatatkan|to|stood at)\s+({num_token})\s*(?:kes)?",
            rf"\b({num_token})\s*(?:kes)?\s+(?:kematian|maut|korban\s+jiwa)\b",
            r"ယမန်နေ့တွင်\s*သေဆုံးသူ\s*([0-9][0-9,.]*)\s*ဦး",
            r"(?:ผู้เสียชีวิต|เสียชีวิต)\s*([0-9][0-9,.]*)\s*ราย",
            r"(?:ករណីស្លាប់|អ្នកស្លាប់)\s*([0-9][0-9,.]*)\s*នាក់",
            r"(?:သေဆုံးသူ|သေဆုံး)\s*([0-9][0-9,.]*)",
        ],
    }
    candidates: list[tuple[int, int, int, int]] = []

    def _consider(match: re.Match, base_score: int) -> None:
        if (
            match.start(1) > 0
            and search_text[match.start(1) - 1] in ".,0123456789"
        ):
            return
        # Reject digits that are part of disease / virus designation (e.g. Covid-19, SARS-CoV-2, H5N1, Clade Ib, Type 1)
        prefix_slice = search_text[max(0, match.start(1) - 18): match.start(1)].lower()
        if re.search(r"(?:covid[\s_-]*|sars[\s_-]*cov[\s_-]*|h\d+n|clade[\s_-]*|type[\s_-]*|ev[\s_-]*|b\d{1,2}[\s_-]*)$", prefix_slice):
            return
        token_str = match.group(1).strip(".,")
        if token_str == "19" and re.search(r"covid|sars", search_text[max(0, match.start(1) - 24): min(len(search_text), match.end(1) + 24)].lower()):
            return
        after = search_text[match.end(1): match.end(1) + 30].strip()
        before = search_text[max(0, match.start(1) - 30): match.start(1)].strip()

        # Percentages qualify a nearby metric; they are not incident totals.
        # This prevents a broad narrative pattern from reading
        # ``46 percent from 35,390 cases`` as 46 cases.
        if re.match(r"^(?:percent|percentage|%)\b", after, re.IGNORECASE):
            return
        
        # 1. Multilingual Age Filtering: Prevent patient ages from being captured as case or death counts
        # e.g., 'balita 3 tahun' (age 3), 'lansia 65 tahun meninggal' (age 65), 'bé 4 tuổi'
        is_age = bool(re.match(r"^(?:-|–|\s)*(?:years?(?:\s+old)?|months?(?:\s+old)?|days?(?:\s+old)?|tahun|thn|th|bulan|bln|hari|hr|tuổi|tháng(?:\s+tuổi)?|ขวบ|ปี|yo|yr|mths?)\b", after, re.I))
        is_age |= bool(re.search(r"\b(?:aged|berusia|berumur|umur|usia|bệnh nhân|bé|độ tuổi)\s*$", before, re.I))
        if is_age:
            return

        parsed = _parse_count(match.group(1), match.group(0))
        if parsed is None:
            return
        raw_token = match.group(1).strip(".,")
        # 2. Year filter (19xx, 20xx)
        if re.fullmatch(r"(?:19|20|25)\d{2}", raw_token):
            return
        # 3. Calendar dates (e.g. '23 Agustus', '1 to 23 Aug')
        if re.match(
            r"^(?:-|–|\s)*(?:januari|februari|maret|april|mei|juni|juli|agustus|"
            r"september|oktober|november|desember|january|february|march|april|may|"
            r"june|july|august|october|november|december|tháng|jan|feb|mar|apr|"
            r"jun|jul|aug|sep|sept|oct|nov|dec)\b",
            after,
            re.I,
        ):
            return
        window = _sentence_window(search_text, match.start(), match.end())
        window_l = window.lower()
        if field == "death_count" and re.search(
            r"\b(?:bagi|pada|in|for)\s+(?:tahun\s+|year\s+)?20\d{2}\b",
            match.group(0),
            re.IGNORECASE,
        ) and not re.search(
            r"\b(?:death|deaths|fatalit(?:y|ies)|died|meninggal(?:\s+dunia)?|"
            r"kematian|maut|korban\s+jiwa|tewas|tử\s+vong|เสียชีวิต|"
            r"ស្លាប់|ເສຍຊີວິດ|သေဆုံး)\b",
            search_text[max(0, match.start(1) - 180): match.start(1)],
            re.IGNORECASE,
        ):
            # A year-to-number phrase is not a death metric unless the
            # surrounding source sentence actually declares deaths.
            return
        if field == "case_count" and is_non_incident_metric_context(
            search_text, match.start(1), match.end(1)
        ):
            return
        if field == "case_count" and _VACCINE_WINDOW.search(window):
            return
        # A death clause may use the generic case unit (for example Malay
        # ``kematian ... terdapat 62 kes``). The number is a death metric,
        # not a second disease-incidence total. Only reject a case candidate
        # when the death label is immediately to its left.
        if field == "case_count" and re.search(
            r"\b(?:death|deaths|fatalit(?:y|ies)|died|meninggal(?:\s+dunia)?|"
            r"kematian|maut|korban\s+jiwa|tewas|tử\s+vong|เสียชีวิต|"
            r"ស្លាប់|ເສຍຊີວິດ|သေဆုံး)\b[^.!?;:]{0,100}$",
            search_text[max(0, match.start(1) - 180): match.start(1)],
            re.IGNORECASE,
        ):
            return
        # "10 patients were hospitalized/admitted and later discharged" is a
        # care-utilization fact, not ten new disease cases. Keep it available
        # to typed hospitalization extraction, but never promote it to a
        # disease total.
        if field == "case_count" and re.search(r"\bpatients?\b", match.group(0), re.IGNORECASE) and re.search(
            r"\b(?:hospitali[sz](?:ed|ation)?|hospital\s+(?:treatment|care|admission|ward)|"
            r"required\s+hospital|admitted|in hospital|discharged|returned home|"
            r"hospitalis(?:é|e|és|ées)|admis(?:e|es)?|sort(?:i|is|ie|ies) de l(?:['’]hôpital|hôpital)|"
            r"dirawat|rawat inap|pulang)\b",
            window_l,
            re.IGNORECASE,
        ):
            return
        if field == "case_count" and is_metric_excluded_number(window, before, after):
            # A survey/thesis respondent sample is not an incident case count.
            return
        if field == "case_count" and re.search(
            r"^\s*(?:meninggal(?:\s+dunia)?|died|tewas|kematian|maut|korban\s+jiwa|fatal(?:ities|ity)?|passed\s+away|tử\s+vong|เสียชีวิต)\b",
            search_text[match.end(0): match.end(0) + 40],
            re.IGNORECASE,
        ):
            # E.g. '3 Pasien Meninggal Dunia' or '3 orang meninggal' is a death count, not a disease case count.
            return
        if field == "case_count" and re.search(
            r"\b(?:of\s+the|among\s+the|of)\s+(?:patients?|people|children|persons?)\s+"
            r"(?:who\s+)?(?:died|were\s+fatal|fatalities|killed|meninggal|tewas|passed\s+away)\b",
            after,
            re.IGNORECASE,
        ):
            # A death sub-group such as ``16 of the patients who died`` is
            # not a second incidence total.
            return
        if field == "case_count" and _ANIMAL_OUTBREAK.search(window) and re.search(
            r"\b(?:outbreaks?|clusters?|farms?)\b", window_l
        ):
            return
        if field == "case_count" and re.match(
            r"\s*(?:share|likes?|comments?|subscribers?)\b", after, re.I
        ):
            return
        if field == "case_count" and article_states_zero_cases(search_text):
            return
        if field == "death_count" and re.search(r"\bno deaths?\b", window_l):
            return
        if field == "death_count" and re.search(
            r"\b(?:cases?|infections?|kasus|kes|patients?)\b[^.!?;:]{0,30}\b(?:and|&|dan)\b",
            after,
            re.IGNORECASE,
        ):
            # Do not let ``53,362 cases and one death`` attach the case total
            # to the death metric while scanning the same sentence.
            if not re.search(
                r"\b(?:death|deaths|fatalit(?:y|ies)|died|meninggal(?:\s+dunia)?|"
                r"kematian|maut|korban\s+jiwa|tewas|tử\s+vong|เสียชีวิต|"
                r"ស្លាប់|ເສຍຊີວິດ|သေဆုံး)\b",
                search_text[max(0, match.start(1) - 180): match.start(1)],
                re.IGNORECASE,
            ):
                return
        period = _period_score(window, search_text)
        score = base_score + period
        # Prefer a metric explicitly attached to the article's named country
        # over a later locality breakdown.  This keeps a national total such
        # as ``Thailand has recorded 21,620 cases`` from being replaced by
        # ``Bangkok has recorded 1,785 cases`` while retaining both source
        # spans for relation/location intelligence.
        if article_country and strip_diacritics(str(article_country)).casefold() in strip_diacritics(str(window)).casefold():
            score += 12
        # Preceding / following year disambiguation (e.g. 2025 vs 2026 comparator)
        all_years = _years_in(search_text)
        latest_year = max(all_years) if all_years else None
        preceding_text = search_text[max(0, match.start(1) - 60): match.start(1)]
        preceding_years = _years_in(preceding_text)
        if preceding_years and latest_year:
            if any(y == latest_year for y in preceding_years):
                score += 15
            elif all(y < latest_year for y in preceding_years):
                score -= 15
        following_text = search_text[match.end(1): min(len(search_text), match.end(1) + 40)]
        following_years = _years_in(following_text)
        if following_years and latest_year:
            if any(y == latest_year for y in following_years):
                # A year after the number usually scopes a comparator phrase
                # (``up from five fatalities during 2025``). It remains a
                # valid candidate when alone, but must not outrank an
                # unscoped/current number in the same article.
                score -= 15
            elif all(y < latest_year for y in following_years):
                score -= 15
        if field in {"case_count", "death_count"} and re.search(
            r"\b(?:compared\s+(?:to|with)|versus|vs\.?|dibanding(?:kan)?(?:\s+dengan)?|berbanding|than)\b",
            before,
            re.IGNORECASE,
        ):
            # Keep comparator values available as historical evidence, but
            # never let them win the article-level primary metric.
            score -= 50
        if field in {"case_count", "death_count"} and re.search(
            r"\b(?:from|dari|daripada)\s*$",
            before,
            re.IGNORECASE,
        ):
            # ``down from 99 deaths`` and ``decline ... from 35,390 cases``
            # are comparison values, not the active total.
            score -= 50
        if field == "case_count" and re.search(
            r"\b(?:percent|percentage|per\s+cent|%)\s+from\s*$",
            before,
            re.IGNORECASE,
        ):
            score -= 50
        # Approximate wording must not outrank a nearby exact surveillance
        # total. This covers Indonesian ``11.000-an`` and equivalent
        # qualifiers without hardcoding a disease or publisher.
        if re.match(r"\s*(?:-?an|lebih)\b", after, re.IGNORECASE) or re.search(
            r"\b(?:sekitar|hampir|lebih dari|kurang lebih|about|around|approximately|nearly|over|more than)\b",
            before + " " + after,
            re.IGNORECASE,
        ):
            score -= 12
        if re.search(r"\b(?:about|around|nearly|approximately|roughly)\b", window_l):
            score -= 14
        scope = metric_source_scope(search_text, match.start(1), match.end(1)) if field == "case_count" else "article_local"
        if scope in {"global_average", "other_url"}:
            # A sole worldwide figure can still be the article total. When a
            # local count is also present, this penalty keeps the global
            # average from winning the scalar.
            score -= 100
        if disease_terms and any(term in window_l for term in disease_terms):
            score += 12
        if re.search(r"\b(?:recorded|confirmed|reported|logged|mencatat|melaporkan)\b", window_l):
            score += 3
        if match.start() < 400:
            score += 3
        candidates.append((score, match.start(), parsed, period))

    for pattern in localized_patterns.get(field, []):
        for match in re.finditer(pattern, search_text, re.IGNORECASE):
            try:
                _consider(match, 1)
            except Exception:
                continue

    # Add an explicit country-scoped candidate when the source names the
    # country immediately before its metric.  This is deliberately built
    # from the resolved country text, so it works across the configured
    # ASEAN lexicon without a publisher, disease, or place rule in code.
    if article_country and field == "case_count":
        country_pattern = re.compile(
            rf"\b{re.escape(str(article_country))}\b[^.!?;:]{{0,140}}?"
            rf"(?P<count>{num_token})\s+(?:[A-Za-z\u00C0-\u024F\u1EA0-\u1EFF()/'-]+\s+)?"
            rf"{case_label}\b",
            re.IGNORECASE | re.UNICODE,
        )
        for match in country_pattern.finditer(search_text):
            try:
                _consider(match, 28)
            except Exception:
                continue

    patterns = config.EXTRACTION_RULES.get(field, [])
    if patterns:
        for pattern in patterns:
            for match in re.finditer(pattern, search_text.lower()):
                try:
                    _consider(match, 0)
                except Exception:
                    continue

    if field == "death_count":
        # Preserve a singular death in the common ``cases and one death``
        # construction. The broader count patterns intentionally reject the
        # preceding case total, but that rejection must not discard the
        # separate number word.
        adjacent = re.search(
            rf"(?:{_runtime_metric_label_pattern('metric_case')})\s+(?:and|dan)\s+"
            rf"(?P<count>{num_token})\s*{_runtime_metric_label_pattern('metric_death')}\b",
            search_text,
            re.IGNORECASE | re.UNICODE,
        )
        if adjacent:
            parsed = _parse_count(adjacent.group("count"), adjacent.group(0))
            if parsed is not None:
                candidates.append((40, adjacent.start("count"), parsed, _period_score(
                    _sentence_window(search_text, adjacent.start(), adjacent.end()), search_text
                )))
        # "Deaths due to dengue ... to 43 cases compared with 111"
        # Some English wires reuse the word "cases" for fatality totals.
        deaths_as_cases = re.search(
            # Allow '.' inside percentages such as "61.3 per cent to 43 cases".
            rf"(?i)(?:deaths?|fatalities|kematian|korban\s+jiwa)\s+due\s+to\b.{{0,160}}?"
            rf"\bto\s+(?P<count>{num_token})\s+(?:cases?|deaths?|fatalities|kematian)\b",
            search_text,
        )
        if deaths_as_cases:
            parsed = _parse_count(deaths_as_cases.group("count"), deaths_as_cases.group(0))
            if parsed is not None:
                candidates.append((45, deaths_as_cases.start("count"), parsed, _period_score(
                    _sentence_window(search_text, deaths_as_cases.start(), deaths_as_cases.end()), search_text
                )))

    override = _focal_human_case_override(search_text)
    if field == "case_count" and _OUTBREAK_CLOSED.search(search_text):
        return default
    if field == "case_count" and override == 2:
        return 2
    if field == "case_count" and override == 1:
        # Remove older-year totals before deciding whether a focal single
        # case should win.  A country-scoped historical candidate can have a
        # high lexical score even though the article's current fact is one
        # newly reported patient.
        all_years = _years_in(search_text)
        if re.search(r"\b(?:this year|so far|year to date|ytd)\b", search_text, re.IGNORECASE):
            candidates = [
                item for item in candidates
                if not (
                    item[2] > 1
                    and _years_in(_sentence_window(search_text, item[1], item[1] + 1))
                    and not re.search(
                        r"\b(?:this year|so far|year to date|ytd)\b",
                        _sentence_window(search_text, item[1], item[1] + 1),
                        re.IGNORECASE,
                    )
                    and max(_years_in(_sentence_window(search_text, item[1], item[1] + 1))) <= max(all_years)
                )
            ]
        # A focal single-case construction is authoritative over a later
        # historical/cumulative total (for example, a fifth human case this
        # year followed by last year's 19 cases).
        if re.search(
            r"\b(?:this\s+one\s+involving|(?:case|infection)\s+involved\s+a)\b",
            search_text,
            re.IGNORECASE,
        ):
            return 1
        strong = [item for item in candidates if item[2] > 1 and item[3] >= 0 and item[0] >= 12]
        if not strong:
            return 1

    if field == "death_count":
        # Check if text describes a single focal death (e.g. 'meninggal dunia', 'tewas', 'died')
        if re.search(r"\b(?:meninggal(?:\s+dunia)?|tewas|korban\s+jiwa|merenggut\s+nyawa|died|passed\s+away|fatally|tử\s+vong|เสียชีวิต)\b", search_text, re.I):
            if override == 1 or _FOCAL_SINGULAR.search(search_text):
                # If all candidates were filtered out (like ages 65 tahun) or no candidate exists, return 1 death
                valid_candidates = [item for item in candidates if item[2] > 0 and item[0] >= 5]
                if not valid_candidates:
                    return 1
        if override == 1:
            candidates = [item for item in candidates if item[3] >= 0]
            if not candidates:
                return default

    # An explicitly cumulative sentence is a stronger scope declaration than
    # a shorter weekly/monthly breakdown elsewhere in the article. Restrict
    # the primary metric to those candidates only when such evidence exists;
    # the individual relation remains available in the source evidence.
    if field == "case_count":
        cumulative_candidates = [
            item for item in candidates
            if re.search(
                r"\b(?:cumulativ(?:e|ely)|a\s+total\s+of|total(?:ly)?|has\s+logged|"
                r"reported\s+in\s+20\d{2})\b",
                _sentence_window(search_text, item[1], item[1] + 1),
                re.IGNORECASE,
            )
        ]
        if cumulative_candidates:
            candidates = cumulative_candidates

    if not candidates:
        if field == "death_count" and re.search(r"\bno deaths?\b", search_text, re.I):
            return 0
        if field == "case_count":
            search_lower = search_text.lower()
            # Quantifiers such as "several" describe the number of
            # outbreaks/clusters as well as the number of cases.  Do not
            # convert that non-case context into a surveillance total.  The
            # vocabulary is maintained in the shared DB lexicon.
            non_case_terms = config.get_lexicon_terms("metric_non_case")
            if any(
                re.search(rf"(?<!\w){re.escape(term.casefold())}(?!\w)", search_lower)
                for term in non_case_terms
                if term.strip()
            ):
                return default
            for quant, info in _APPROXIMATE_QUANTIFIERS.items():
                if re.search(rf"\b{re.escape(quant)}\b", search_lower):
                    return info["median"]
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
        word_val = val.casefold()
        number_values = config.get_lexicon_values("number_word")
        if word_val in number_values:
            val = str(number_values[word_val])

        # Exclude percentage rates when the captured token is the rate
        # ("2.1 persen", "66 per cent") — not when a nearby percent is a
        # change-rate next to a real case total ("rose 66 per cent to 65,979").
        ctx_lower = (context or "").lower()
        if ctx_lower and re.search(
            rf"{re.escape(val)}\s*(?:%|persen|percent|per\s*cent|peratus|pc|pct)\b",
            ctx_lower,
        ):
            return None
        if ctx_lower and re.search(
            r"\bper\s+(?:100|1000|10\.000|100\.000|10,000|100,000|seribu|ribu|thousand|penduduk|populasi|capita|orang|warga)\b",
            ctx_lower,
        ):
            return None

        # Magnitudes are data, not a second code-owned multilingual lexicon.
        # Billion-scale values remain invalid surveillance counts, while
        # smaller magnitudes retain their exact parsed multiplier.
        multiplier = 1
        magnitude_values = config.get_lexicon_values("metric_magnitude")
        if ctx_lower and magnitude_values:
            matched_values = [
                value for term, value in magnitude_values.items()
                if re.search(rf"(?<!\w){re.escape(term)}(?!\w)", ctx_lower, re.IGNORECASE | re.UNICODE)
            ]
            if matched_values:
                multiplier = max(matched_values)
                if multiplier >= 1_000_000_000:
                    return None

        max_count = int(os.getenv("MAX_EVENT_CASE_COUNT", "2000000"))

        def _bounded(value: int):
            if value > max_count:
                return None
            return max(0, value)

        # Calendar years are not case/death totals. "among 2026 cases" and
        # "in 2026 so far" must not bind the reporting year as a count.
        if multiplier == 1 and re.fullmatch(r"(?:19|20)\d{2}", val):
            return None

        # Case 1: Standard thousands separator (e.g. 19,313 or 10.000 or 1,000,000 or 40 915)
        if re.fullmatch(r"\d{1,3}(?:[,. ]\d{3})+", val):
            clean_int = re.sub(r"[,. ]", "", val)
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


def parse_surveillance_count(value: str, context: str = "") -> Optional[int]:
    """Parse a surveillance count through the single numeric policy.

    Relation, epidemiology, and multi-event modules call this public wrapper;
    ``_parse_count`` remains private for the legacy whole-article scorer.
    """

    return _parse_count(value, context)


def extract_disease_case_metrics(
    text: str,
    disease_labels: Iterable[str],
) -> dict[str, dict[str, Optional[int]]]:
    """Extract counts explicitly attached to individual disease mentions.

    This is deliberately label-driven: disease names come from the DB/model
    output and metric vocabulary comes from the shared runtime lexicon. It is
    used only when one article has multiple diseases, so a country total is
    not duplicated across every disease merely because they share a sentence.
    """
    source = str(text or "")
    if not source:
        return {}
    number = _runtime_number_word_pattern()
    case_label = _runtime_metric_label_pattern("metric_case")
    result: dict[str, dict[str, Optional[int]]] = {}
    for raw_label in disease_labels:
        label = canonical_disease_name(str(raw_label or "").strip())
        if not label or label.upper() == "UNKNOWN":
            continue
        terms = {str(raw_label).strip(), label}
        terms.update(
            word for word in re.split(r"[,/()]+", str(raw_label))
            if len(word.strip()) > 2
        )
        term_pattern = "(?:" + "|".join(
            sorted((re.escape(term.strip()) for term in terms if term.strip()), key=len, reverse=True)
        ) + ")"
        patterns = (
            re.compile(
                rf"(?P<count>{number})\s+(?:{term_pattern})\s*(?:{case_label})(?!\w)",
                re.IGNORECASE | re.UNICODE,
            ),
            re.compile(
                rf"(?P<count>{number})\s*(?:{case_label})\s+(?:of\s+|penyakit\s+)?(?:{term_pattern})(?!\w)",
                re.IGNORECASE | re.UNICODE,
            ),
            re.compile(
                rf"(?:{term_pattern})\s*(?:[:=-]\s*)?(?P<count>{number})\s*(?:{case_label})(?!\w)",
                re.IGNORECASE | re.UNICODE,
            ),
            re.compile(
                rf"(?:{term_pattern})\s*\(\s*(?P<count>{number})\s*(?:{case_label})?\s*\)",
                re.IGNORECASE | re.UNICODE,
            ),
            re.compile(
                rf"(?:{term_pattern})\s*[:=-]\s*(?P<count>{number})(?!\w)",
                re.IGNORECASE | re.UNICODE,
            ),
        )
        for pattern in patterns:
            match = pattern.search(source)
            if not match:
                continue
            value = parse_surveillance_count(match.group("count"), match.group(0))
            if value is None:
                continue
            result[label] = {
                "case_count": value,
                "evidence": match.group(0),
                "evidence_offset_start": match.start(),
                "evidence_offset_end": match.end(),
            }
            break
    return result


def extract_case_count(text: str, disease: Optional[str] = None) -> int:
    if article_states_zero_cases(text):
        return 0
    try:
        default = int(os.getenv("DEFAULT_CASE_COUNT", "0"))
    except (ValueError, TypeError):
        default = 0
    default = max(0, default)
    try:
        source = _compact_spaced_thousands(str(text or ""))
        # Prefer exact "sebanyak 161.752 kasus ... dengan 673 kematian" over "161 ribu".
        exact_pair = re.search(
            r"(?i)(?:sebanyak|tercatat|logged|recorded|reported)\s+"
            r"(?P<cases>\d{1,3}(?:[.,]\d{3})+)\s+(?:kasus|cases)\b"
            r"[^.!?]{0,80}?(?:dengan|with|and)\s+"
            r"(?P<deaths>\d{1,3}(?:[.,]\d{3})*|\d+)\s+"
            r"(?:kematian|deaths?|meninggal|fatalities)\b",
            source[:2500],
        )
        if exact_pair:
            parsed_cases = _parse_count(exact_pair.group("cases"), exact_pair.group(0))
            if parsed_cases is not None and parsed_cases >= 10:
                return max(0, int(parsed_cases))
        article_country = extract_country_hint(source[:1500])
        if article_country and _focal_human_case_override(source) != 1:
            number = _runtime_number_word_pattern()
            case_label = _runtime_metric_label_pattern("metric_case")
            country_pattern = re.compile(
                rf"\b{re.escape(str(article_country))}\b[^.!?;:]{{0,140}}?"
                rf"(?P<count>{number})\s+(?:[A-Za-z\u00C0-\u024F\u1EA0-\u1EFF()/'-]+\s+)?"
                rf"{case_label}\b",
                re.IGNORECASE | re.UNICODE,
            )
            scoped_candidates = []
            for match in country_pattern.finditer(source):
                parsed = _parse_count(match.group("count"), match.group(0))
                if parsed is None:
                    continue
                window = _sentence_window(source, match.start(), match.end())
                window_l = window.casefold()
                if re.search(
                    r"\b(?:last year|previous year|year before|a year earlier|same period|compared with|compared to|"
                    r"tahun lalu|tahun lepas|berbanding|berbanding dengan)\b",
                    window_l,
                ):
                    continue
                window_years = _years_in(window)
                all_years = _years_in(source)
                if (
                    window_years
                    and all_years
                    and re.search(r"\b(?:this year|so far|year to date|ytd)\b", source, re.IGNORECASE)
                    and max(window_years) < max(all_years)
                    and not re.search(r"\b(?:this year|so far|year to date|ytd)\b", window, re.IGNORECASE)
                ):
                    continue
                scoped_candidates.append((
                    _period_score(window, source),
                    -match.start(),
                    parsed,
                ))
            if scoped_candidates:
                return max(scoped_candidates)[2]
        parsed = _extract_count(text, "case_count", default, disease=disease)
        max_count = int(os.getenv("MAX_EVENT_CASE_COUNT", "2000000"))
        if parsed is None or parsed > max_count:
            return default
        return max(0, int(parsed))
    except Exception:
        return default


def has_explicit_case_count(text: str, disease: Optional[str] = None) -> bool:
    """Whether a case number was actually present, excluding the default."""
    if article_states_zero_cases(text):
        return True
    try:
        return _extract_count(text, "case_count", -1, disease=disease) >= 0
    except Exception:
        return False


def has_explicit_death_count(text: str, disease: Optional[str] = None) -> bool:
    """Whether a death number was actually present, excluding default 0."""
    try:
        return _extract_count(text, "death_count", -1, disease=disease) >= 0
    except Exception:
        return False


def extract_death_count(text: str, disease: Optional[str] = None) -> int:
    try:
        source = _compact_spaced_thousands(str(text or ""))
        # Prefer deaths bound to the latest outbreak year / same clause as the
        # focal case count (e.g. "11 cases ... including six deaths" in 2025)
        # over all-time CFR totals ("83 cases ... including 49 deaths").
        latest_years = _years_in(source[:4000])
        latest = max(latest_years) if latest_years else None
        focal_including = list(re.finditer(
            r"(?i)(?P<cases>\d{1,3}(?:[.,]\d{3})*|\d+)\s+"
            r"(?:laboratory-confirmed\s+)?(?:cases?|kasus|infections?)\b"
            r"[^.!?]{0,120}?\bincluding\s+(?P<deaths>\d{1,3}(?:[.,]\d{3})*|\d+|"
            r"twenty|nineteen|eighteen|seventeen|sixteen|fifteen|fourteen|thirteen|"
            r"twelve|eleven|ten|nine|eight|seven|six|five|four|three|two|one)\s+"
            r"(?:deaths?|fatalities|kematian|meninggal)\b",
            source[:4000],
        ))
        if focal_including:
            word_deaths = {
                "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
                "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11,
                "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
                "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19,
                "twenty": 20,
            }
            ranked = []
            for match in focal_including:
                window = _sentence_window(source, match.start(), match.end())
                raw_d = match.group("deaths")
                parsed_d = word_deaths.get(raw_d.casefold())
                if parsed_d is None:
                    parsed_d = _parse_count(raw_d, match.group(0))
                if parsed_d is None:
                    continue
                years = _years_in(window)
                period = _period_score(window, source)
                if latest is not None and years and latest in years:
                    period += 20
                # Prefer cumulative / YTD national totals over a single-month
                # slice in the same outbreak year (Viet Nam dengue 9 vs 1).
                if re.search(
                    r"\b(?:cumulatively|cumulative|year[- ]to[- ]date|\bytd\b|"
                    r"from\s+january|january\s+to|total\s+of|so\s+far\s+this\s+year)\b",
                    window,
                    re.I,
                ):
                    period += 28
                if re.search(
                    r"\b(?:in\s+(?:january|february|march|april|may|june|july|august|"
                    r"september|october|november|december)\s+20\d{2})\b",
                    window,
                    re.I,
                ) and not re.search(
                    r"\b(?:cumulatively|cumulative|from\s+january|january\s+to|total\s+of)\b",
                    window,
                    re.I,
                ):
                    period -= 15
                if re.search(r"\b(?:since\s+(?:then|19\d{2}|200)|first\s+detected|historical)\b", window, re.I):
                    period -= 30
                # Higher death totals win period ties so YTD beats a month slice.
                ranked.append((period, int(parsed_d), -match.start()))
            if ranked:
                best = max(ranked)
                max_count = int(os.getenv("MAX_EVENT_DEATH_COUNT", "200000"))
                if 0 < best[1] <= max_count:
                    return max(0, int(best[1]))
        # "20,115 total cases, including 11 deaths" — national inclusive death total
        including_deaths = re.search(
            r"(?i)(?:total\s+)?(?:cases?|kasus)\b[^.!?]{0,60}?\bincluding\s+"
            r"(?P<deaths>\d{1,3}(?:[.,]\d{3})*|\d+)\s+"
            r"(?:deaths?|fatalities|kematian|meninggal)\b",
            source[:2500],
        )
        if including_deaths:
            parsed_deaths = _parse_count(including_deaths.group("deaths"), including_deaths.group(0))
            if parsed_deaths is not None:
                max_count = int(os.getenv("MAX_EVENT_DEATH_COUNT", "200000"))
                if 0 < parsed_deaths <= max_count:
                    return max(0, int(parsed_deaths))
        exact_pair = re.search(
            r"(?i)(?:sebanyak|tercatat|logged|recorded|reported)\s+"
            r"(?P<cases>\d{1,3}(?:[.,]\d{3})+)\s+(?:kasus|cases)\b"
            r"[^.!?]{0,80}?(?:dengan|with|and)\s+"
            r"(?P<deaths>\d{1,3}(?:[.,]\d{3})*|\d+)\s+"
            r"(?:kematian|deaths?|meninggal|fatalities)\b",
            source[:2500],
        )
        if exact_pair:
            parsed_deaths = _parse_count(exact_pair.group("deaths"), exact_pair.group(0))
            if parsed_deaths is not None:
                max_count = int(os.getenv("MAX_EVENT_DEATH_COUNT", "200000"))
                if parsed_deaths <= max_count:
                    return max(0, int(parsed_deaths))
        if re.search(
            r"(?i)(?:^|[^A-Za-z0-9])(?:no\s+deaths?|tidak\s+ada\s+kematian|tanpa\s+kematian|"
            r"zero\s+deaths?|belum\s+ada\s+kematian)(?:[^A-Za-z0-9]|$)",
            source,
        ):
            return 0
        parsed = _extract_count(text, "death_count", 0, disease=disease)
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


DISEASE_ALIASES: dict[str, str] = {
    "dbd": "Dengue",
    "demam berdarah": "Dengue",
    "demam berdarah dengue": "Dengue",
    "infeksi dengue": "Dengue",
    "dengue": "Dengue",
    "demam denggi": "Dengue",
    "denggi": "Dengue",
    "wabak denggi": "Dengue",
    "ไข้เลือดออก": "Dengue",
    "ไข้เดงกี": "Dengue",
    "โรคไข้เลือดออก": "Dengue",
    "เดงกี": "Dengue",
    "ไวรัสเดงกี": "Dengue",
    "sốt xuất huyết": "Dengue",
    "sot xuat huyet": "Dengue",
    "sốt xuất huyết dengue": "Dengue",
    "bệnh sốt xuất huyết": "Dengue",
    "vi rút sốt xuất huyết": "Dengue",
    "trangkaso ng dengue": "Dengue",
    "lagnat ng dengue": "Dengue",
    "သွေးလွန်တုပ်ကွေး": "Dengue",
    "သွေးလွန်တုပ်ကွေးရောဂါ": "Dengue",
    "ဒင်းဂီး": "Dengue",
    "គ្រុនឈាម": "Dengue",
    "ជំងឺគ្រុនឈាម": "Dengue",
    "គ្រុនឈាមដេងហ្គី": "Dengue",
    "ໄຂ້ເລືອດອອກ": "Dengue",
    "ພະຍາດໄຂ້ເລືອດອອກ": "Dengue",
    "ໄຂ້ເດັງກີ": "Dengue",
    "dengue fever": "Dengue",
    "dengue virus infection": "Dengue",
    "dengue virus": "Dengue",
    "dengue hemorrhagic fever": "Dengue",
    "dengue berat": "Severe dengue",
    "dbd berat": "Severe dengue",
    "dengue shock syndrome": "Severe dengue",
    "dss": "Severe dengue",
    "denggi parah": "Severe dengue",
    "sindrom kejutan denggi": "Severe dengue",
    "ไข้เลือดออกรุนแรง": "Severe dengue",
    "เดงกีรุนแรง": "Severe dengue",
    "ภาวะช็อกเดงกี": "Severe dengue",
    "sốt xuất huyết nặng": "Severe dengue",
    "hội chứng sốc dengue": "Severe dengue",
    "sốc sốt xuất huyết": "Severe dengue",
    "malubhang dengue": "Severe dengue",
    "ပြင်းထန်သွေးလွန်တုပ်ကွေး": "Severe dengue",
    "ဒင်းဂီးရှော့ခ်ရောဂါလက္ခဏာစု": "Severe dengue",
    "ជំងឺគ្រុនឈាមធ្ងន់ធ្ងរ": "Severe dengue",
    "ໄຂ້ເລືອດອອກຮ້າຍແຮງ": "Severe dengue",
    "severe dengue": "Severe dengue",
    "malaria": "Malaria",
    "penyakit malaria": "Malaria",
    "parasit malaria": "Malaria",
    "plasmodium": "Malaria",
    "demam kura": "Malaria",
    "ไข้มาลาเรีย": "Malaria",
    "มาลาเรีย": "Malaria",
    "ไข้ป่า": "Malaria",
    "ไข้จับสั่น": "Malaria",
    "sốt rét": "Malaria",
    "sot ret": "Malaria",
    "bệnh sốt rét": "Malaria",
    "ký sinh trùng sốt rét": "Malaria",
    "malarya": "Malaria",
    "ငှက်ဖျား": "Malaria",
    "ငှက်ဖျားရောဂါ": "Malaria",
    "គ្រុនចាញ់": "Malaria",
    "ជំងឺគ្រុនចាញ់": "Malaria",
    "ໄຂ້ມາລາເຣຍ": "Malaria",
    "ໄຂ້ປ່າ": "Malaria",
    "ມາລາເຣຍ": "Malaria",
    "plasmodium falciparum": "Malaria",
    "plasmodium vivax": "Malaria",
    "marsh fever": "Malaria",
    "chikungunya": "Chikungunya",
    "cikungunya": "Chikungunya",
    "flu tulang": "Chikungunya",
    "demam chikungunya": "Chikungunya",
    "โรคชิคุนกุนยา": "Chikungunya",
    "ชิคุนกุนยา": "Chikungunya",
    "ไข้ปวดข้อยุงลาย": "Chikungunya",
    "bệnh chikungunya": "Chikungunya",
    "sốt chikungunya": "Chikungunya",
    "ချီကွန်ဂန်ညာ": "Chikungunya",
    "ချီကန်ဂန်ညာရောဂါ": "Chikungunya",
    "ជំងឺឈីគុនហ្គុនយ៉ា": "Chikungunya",
    "ឈីគុនហ្គុនយ៉ា": "Chikungunya",
    "ໄຂ້ຊິຄຸນກຸນຢາ": "Chikungunya",
    "ຊິຄຸນກຸນຢາ": "Chikungunya",
    "chikungunya fever": "Chikungunya",
    "chikungunya virus": "Chikungunya",
    "zika": "Zika virus disease",
    "virus zika": "Zika virus disease",
    "penyakit virus zika": "Zika virus disease",
    "demam zika": "Zika virus disease",
    "penyakit zika": "Zika virus disease",
    "โรคติดเชื้อไวรัสซิกา": "Zika virus disease",
    "ไวรัสซิกา": "Zika virus disease",
    "ไข้ซิกา": "Zika virus disease",
    "ซิกา": "Zika virus disease",
    "vi rút zika": "Zika virus disease",
    "bệnh do vi rút zika": "Zika virus disease",
    "sốt zika": "Zika virus disease",
    "virus na zika": "Zika virus disease",
    "ဇီကာ": "Zika virus disease",
    "ဇီကာဗိုင်းရပ်စ်ရောဂါ": "Zika virus disease",
    "វីរុសហ្ស៊ីកា": "Zika virus disease",
    "ជំងឺហ្ស៊ីកា": "Zika virus disease",
    "ໄວຣັດຊິກາ": "Zika virus disease",
    "ພະຍາດໄຂ້ຊິກາ": "Zika virus disease",
    "zika virus": "Zika virus disease",
    "zika virus disease": "Zika virus disease",
    "zika fever": "Zika virus disease",
    "japanese encephalitis": "Japanese encephalitis",
    "radang otak jepang": "Japanese encephalitis",
    "ensefalitis jepang": "Japanese encephalitis",
    "je": "Japanese encephalitis",
    "ensefalitis jepun": "Japanese encephalitis",
    "โรคไข้สมองอักเสบเจอี": "Japanese encephalitis",
    "ไข้สมองอักเสบเจอี": "Japanese encephalitis",
    "ไวรัสเจอี": "Japanese encephalitis",
    "สมองอักเสบญี่ปุ่น": "Japanese encephalitis",
    "viêm não nhật bản": "Japanese encephalitis",
    "viem nao nhat ban": "Japanese encephalitis",
    "bệnh viêm não nhật bản": "Japanese encephalitis",
    "pamamaga ng utak": "Japanese encephalitis",
    "ဂျပန်ဦးနှောက်ရောင်ရောဂါ": "Japanese encephalitis",
    "ဦးနှောက်ရောင်ရောဂါ": "Japanese encephalitis",
    "ជំងឺរលាកខួរក្បាលជប៉ុន": "Japanese encephalitis",
    "រលាកខួរក្បាលជប៉ុន": "Japanese encephalitis",
    "ໄຂ້ສະໝອງອັກເສບຍີ່ປຸ່ນ": "Japanese encephalitis",
    "japanese encephalitis virus": "Japanese encephalitis",
    "je virus": "Japanese encephalitis",
    "demam kuning": "Yellow fever",
    "yellow fever": "Yellow fever",
    "penyakit demam kuning": "Yellow fever",
    "ไข้เหลือง": "Yellow fever",
    "โรคไข้เหลือง": "Yellow fever",
    "sốt vàng da": "Yellow fever",
    "sốt vàng": "Yellow fever",
    "bệnh sốt vàng": "Yellow fever",
    "dilaw na lagnat": "Yellow fever",
    "အဝါရောင်ဖျားနာရောဂါ": "Yellow fever",
    "အဝါဖျား": "Yellow fever",
    "ជំងឺគ្រុនលឿង": "Yellow fever",
    "គ្រុនលឿង": "Yellow fever",
    "ໄຂ້ເຫຼືອງ": "Yellow fever",
    "yellow fever virus": "Yellow fever",
    "yellow jack": "Yellow fever",
    "virus west nile": "West Nile virus infection",
    "demam west nile": "West Nile virus infection",
    "infeksi west nile": "West Nile virus infection",
    "ไวรัสเวสต์ไนล์": "West Nile virus infection",
    "โรคติดเชื้อไวรัสเวสต์ไนล์": "West Nile virus infection",
    "ไข้เวสต์ไนล์": "West Nile virus infection",
    "virus tây sông nile": "West Nile virus infection",
    "sốt tây sông nile": "West Nile virus infection",
    "vi rút west nile": "West Nile virus infection",
    "west nile virus": "West Nile virus infection",
    "ဝက်စ်နိုင်းဗိုင်းရပ်စ်ရောဂါ": "West Nile virus infection",
    "វីរុសវេសនីល": "West Nile virus infection",
    "ໄວຣັດເວສໄນລ໌": "West Nile virus infection",
    "west nile fever": "West Nile virus infection",
    "west nile encephalitis": "West Nile virus infection",
    "filariasis": "Filariasis",
    "kaki gajah": "Filariasis",
    "penyakit kaki gajah": "Filariasis",
    "filariasis limfatik": "Filariasis",
    "penyakit untut": "Filariasis",
    "โรคเท้าช้าง": "Filariasis",
    "พยาธิเท้าช้าง": "Filariasis",
    "เท้าช้าง": "Filariasis",
    "bệnh giun chỉ": "Filariasis",
    "phù chân voi": "Filariasis",
    "bệnh phù chân voi": "Filariasis",
    "elephantiasis": "Filariasis",
    "ဆင်ခြေထောက်ရောဂါ": "Filariasis",
    "ជំងឺជើងដំរី": "Filariasis",
    "ជើងដំរី": "Filariasis",
    "ພະຍາດຂາຊ້າງ": "Filariasis",
    "ຂາຊ້າງ": "Filariasis",
    "lymphatic filariasis": "Filariasis",
    "schistosomiasis": "Schistosomiasis",
    "skistosomiasis": "Schistosomiasis",
    "demam keong": "Schistosomiasis",
    "demam siput": "Schistosomiasis",
    "โรคพยาธิใบไม้ในเลือด": "Schistosomiasis",
    "พยาธิใบไม้ในเลือด": "Schistosomiasis",
    "bệnh sán máng": "Schistosomiasis",
    "sán máng": "Schistosomiasis",
    "သွေးစုပ်ដង្ကောရောဂါ": "Schistosomiasis",
    "ជំងឺព្រូនឈាម": "Schistosomiasis",
    "ព្រូនឈាម": "Schistosomiasis",
    "ພະຍາດແມ່ທ້ອງເລືອດ": "Schistosomiasis",
    "bilharzia": "Schistosomiasis",
    "snail fever": "Schistosomiasis",
    "covid": "COVID-19",
    "covid-19": "COVID-19",
    "covid19": "COVID-19",
    "korona": "COVID-19",
    "coronavirus": "COVID-19",
    "sars-cov-2": "COVID-19",
    "koronavirus": "COVID-19",
    "wabak korona": "COVID-19",
    "โควิด": "COVID-19",
    "โควิด-19": "COVID-19",
    "โควิด19": "COVID-19",
    "โคโรนาไวรัส": "COVID-19",
    "โรคโควิด-19": "COVID-19",
    "ไวรัสโคโรนา": "COVID-19",
    "bệnh corona": "COVID-19",
    "vi-rút corona": "COVID-19",
    "virus corona": "COVID-19",
    "koronabirus": "COVID-19",
    "ကိုဗစ်": "COVID-19",
    "ကိုဗစ်-၁၉": "COVID-19",
    "ကိုရိုနာဗိုင်းရပ်စ်": "COVID-19",
    "កូវីដ": "COVID-19",
    "កូវីដ-១៩": "COVID-19",
    "វីរុសកូរ៉ូណា": "COVID-19",
    "ໂຄວິດ": "COVID-19",
    "ໂຄວິດ-19": "COVID-19",
    "ໄວຣັດໂຄໂຣນາ": "COVID-19",
    "coronavirus disease 2019": "COVID-19",
    "2019-ncov": "COVID-19",
    "influenza": "Influenza",
    "flu": "Influenza",
    "pilek": "Influenza",
    "flu musiman": "Influenza",
    "selesema": "Influenza",
    "ไข้หวัดใหญ่": "Influenza",
    "โรคไข้หวัดใหญ่": "Influenza",
    "อินฟลูเอนซา": "Influenza",
    "ไวรัสไข้หวัดใหญ่": "Influenza",
    "cúm": "Influenza",
    "cum": "Influenza",
    "bệnh cúm": "Influenza",
    "cúm mùa": "Influenza",
    "trangkaso": "Influenza",
    "တုပ်ကွေး": "Influenza",
    "တုပ်ကွေးရောဂါ": "Influenza",
    "ရာသီတုပ်ကွေး": "Influenza",
    "គ្រុនផ្តាសាយ": "Influenza",
    "ជំងឺគ្រុនផ្តាសាយ": "Influenza",
    "ផ្តាសាយធំ": "Influenza",
    "ໄຂ້ຫວັດໃຫຍ່": "Influenza",
    "ໄຂ້ຫວັດ": "Influenza",
    "seasonal flu": "Influenza",
    "influenza virus": "Influenza",
    "flu burung": "Avian influenza",
    "avian influenza": "Avian influenza",
    "h5n1": "Avian influenza",
    "virus flu burung": "Avian influenza",
    "flu unggas": "Avian influenza",
    "selesema burung": "Avian influenza",
    "ไข้หวัดนก": "Avian influenza",
    "โรคไข้หวัดนก": "Avian influenza",
    "เอช5เอ็น1": "Avian influenza",
    "cúm gia cầm": "Avian influenza",
    "cum gia cam": "Avian influenza",
    "cúm a h5n1": "Avian influenza",
    "bệnh cúm gia cầm": "Avian influenza",
    "bird flu": "Avian influenza",
    "trangkaso ng ibon": "Avian influenza",
    "ကြက်ငှက်တုပ်ကွေး": "Avian influenza",
    "ကြက်ငှက်တုပ်ကွေးရောဂါ": "Avian influenza",
    "ផ្តាសាយបក្សី": "Avian influenza",
    "ជំងឺគ្រុនផ្តាសាយបក្សី": "Avian influenza",
    "ໄຂ້ຫວັດສັດປີກ": "Avian influenza",
    "ໄຂ້ຫວັດນົກ": "Avian influenza",
    "avian flu": "Avian influenza",
    "highly pathogenic avian influenza": "Avian influenza",
    "hpai": "Avian influenza",
    "influenza a h5n1": "Influenza due to infection with Influenza A/H5N1 virus",
    "virus h5n1": "Influenza due to infection with Influenza A/H5N1 virus",
    "infeksi h5n1": "Influenza due to infection with Influenza A/H5N1 virus",
    "ไข้หวัดใหญ่สายพันธุ์เอช5เอ็น1": "Influenza due to infection with Influenza A/H5N1 virus",
    "ไข้หวัดใหญ่ h5n1": "Influenza due to infection with Influenza A/H5N1 virus",
    "cúm a/h5n1": "Influenza due to infection with Influenza A/H5N1 virus",
    "nhiễm cúm h5n1": "Influenza due to infection with Influenza A/H5N1 virus",
    "h5n1 influenza": "Influenza due to infection with Influenza A/H5N1 virus",
    "အေ/h5n1 တုပ်ကွေးရောဂါ": "Influenza due to infection with Influenza A/H5N1 virus",
    "គ្រុនផ្តាសាយ a/h5n1": "Influenza due to infection with Influenza A/H5N1 virus",
    "ໄຂ້ຫວັດໃຫຍ່ສາຍພັນ a h5n1": "Influenza due to infection with Influenza A/H5N1 virus",
    "avian influenza a h5n1": "Influenza due to infection with Influenza A/H5N1 virus",
    "influenza a/h5n1": "Influenza due to infection with Influenza A/H5N1 virus",
    "tbc": "Tuberculosis",
    "tb": "Tuberculosis",
    "tuberkulosis": "Tuberculosis",
    "tuberculosis": "Tuberculosis",
    "flek paru": "Tuberculosis",
    "batuk darah tbc": "Tuberculosis",
    "batuk kering": "Tuberculosis",
    "tibi": "Tuberculosis",
    "วัณโรค": "Tuberculosis",
    "โรควัณโรค": "Tuberculosis",
    "ทีบี": "Tuberculosis",
    "lao phổi": "Tuberculosis",
    "benh lao": "Tuberculosis",
    "bệnh lao": "Tuberculosis",
    "lao": "Tuberculosis",
    "tisis": "Tuberculosis",
    "တီဘီ": "Tuberculosis",
    "တီဘီရောဂါ": "Tuberculosis",
    "အဆုတ်တီဘီ": "Tuberculosis",
    "របេង": "Tuberculosis",
    "ជំងឺរបេង": "Tuberculosis",
    "របេងសួត": "Tuberculosis",
    "ວັນນະໂລກ": "Tuberculosis",
    "ພະຍາດວັນນະໂລກ": "Tuberculosis",
    "ວັນນະໂຣກ": "Tuberculosis",
    "consumption": "Tuberculosis",
    "phthisis": "Tuberculosis",
    "mycobacterium tuberculosis": "Tuberculosis",
    "difteri": "Diphtheria",
    "diphtheria": "Diphtheria",
    "infeksi difteri": "Diphtheria",
    "difteria": "Diphtheria",
    "โรคคอตีบ": "Diphtheria",
    "คอตีบ": "Diphtheria",
    "bạch hầu": "Diphtheria",
    "bach hau": "Diphtheria",
    "bệnh bạch hầu": "Diphtheria",
    "dipterya": "Diphtheria",
    "ဆုံဆို့နာ": "Diphtheria",
    "ဆုံဆို့ရောဂါ": "Diphtheria",
    "ជំងឺខាន់ស្លាក់": "Diphtheria",
    "ខាន់ស្លាក់": "Diphtheria",
    "ພະຍາດຄໍຕີບ": "Diphtheria",
    "ຄໍຕີບ": "Diphtheria",
    "corynebacterium diphtheriae": "Diphtheria",
    "pertussis": "Pertussis",
    "batuk rejan": "Pertussis",
    "batuk 100 hari": "Pertussis",
    "pertusis": "Pertussis",
    "batuk kokol": "Pertussis",
    "โรคไอกรน": "Pertussis",
    "ไอกรน": "Pertussis",
    "ho gà": "Pertussis",
    "ho ga": "Pertussis",
    "bệnh ho gà": "Pertussis",
    "ubong dalahit": "Pertussis",
    "ကြက်ညှာချောင်းဆိုး": "Pertussis",
    "ကြက်ညှာရောဂါ": "Pertussis",
    "ជំងឺក្អកមាន់": "Pertussis",
    "ក្អកមាន់": "Pertussis",
    "ພະຍາດໄອໄກ່": "Pertussis",
    "ໄອໄກ່": "Pertussis",
    "whooping cough": "Pertussis",
    "100-day cough": "Pertussis",
    "bordetella pertussis": "Pertussis",
    "campak": "Measles",
    "morbili": "Measles",
    "gabag": "Measles",
    "tampek": "Measles",
    "measles": "Measles",
    "demam campak": "Measles",
    "โรคหัด": "Measles",
    "หัด": "Measles",
    "ไข้หัด": "Measles",
    "bệnh sởi": "Measles",
    "benh soi": "Measles",
    "sởi": "Measles",
    "soi": "Measles",
    "tigdas": "Measles",
    "ဝက်သက်": "Measles",
    "ဝက်သက်ရောဂါ": "Measles",
    "កញ្ជ្រឹល": "Measles",
    "ជំងឺកញ្ជ្រឹល": "Measles",
    "ພະຍາດໝາກແດງ": "Measles",
    "ໝາກແດງ": "Measles",
    "ໄຂ້ໝາກແດງ": "Measles",
    "rubeola": "Measles",
    "morbilli": "Measles",
    "mumps": "Mumps",
    "parotitis": "Mumps",
    "infectious parotitis": "Mumps",
    "epidemic parotitis": "Mumps",
    "gondongan": "Mumps",
    "penyakit gondongan": "Mumps",
    "beguk": "Mumps",
    "quai bị": "Mumps",
    "bệnh quai bị": "Mumps",
    "benh quai bi": "Mumps",
    "คางทูม": "Mumps",
    "โรคคางทูม": "Mumps",
    "beke": "Mumps",
    "ပါးချိတ်ရောင်": "Mumps",
    "rubella": "Rubella",
    "campak jerman": "Rubella",
    "campak 3 hari": "Rubella",
    "โรคหัดเยอรมัน": "Rubella",
    "หัดเยอรมัน": "Rubella",
    "sởi đức": "Rubella",
    "bệnh rubella": "Rubella",
    "tigdas-hangin": "Rubella",
    "ဂျာမန်ဝက်သက်": "Rubella",
    "ရူဘယ်လာ": "Rubella",
    "ជំងឺកញ្ជ្រឹលអាល្លឺម៉ង់": "Rubella",
    "កញ្ជ្រឹលអាល្លឺម៉ង់": "Rubella",
    "ພະຍາດໝາກແດງເຢຍລະມັນ": "Rubella",
    "ໝາກແດງເຢຍລະມັນ": "Rubella",
    "german measles": "Rubella",
    "three-day measles": "Rubella",
    "pneumonia": "Pneumonia",
    "radang paru-paru": "Pneumonia",
    "paru-paru basah": "Pneumonia",
    "infeksi paru": "Pneumonia",
    "ปอดอักเสบ": "Pneumonia",
    "โรคปอดอักเสบ": "Pneumonia",
    "ปอดบวม": "Pneumonia",
    "โรคปอดบวม": "Pneumonia",
    "viêm phổi": "Pneumonia",
    "viem phoi": "Pneumonia",
    "bệnh viêm phổi": "Pneumonia",
    "pulmonya": "Pneumonia",
    "အဆုတ်ရောင်": "Pneumonia",
    "အဆုတ်ရောင်ရောဂါ": "Pneumonia",
    "ជំងឺរលាកសួត": "Pneumonia",
    "រលាកសួត": "Pneumonia",
    "ພະຍາດປອດອັກເສບ": "Pneumonia",
    "ປອດອັກເສບ": "Pneumonia",
    "ປອດບວມ": "Pneumonia",
    "lung inflammation": "Pneumonia",
    "bronchopneumonia": "Pneumonia",
    "pulmonary infection": "Pneumonia",
    "legionellosis": "Legionellosis",
    "penyakit legionnaire": "Legionellosis",
    "infeksi legionella": "Legionellosis",
    "legionella": "Legionellosis",
    "ลีเจียนแนร์": "Legionellosis",
    "โรคลิเจียนแนร์": "Legionellosis",
    "โรคติดเชื้อลีเจียนแนร์": "Legionellosis",
    "โรคลีเจียนแนร์": "Legionellosis",
    "ลีจิโอเนลลา": "Legionellosis",
    "bệnh legionnaires": "Legionellosis",
    "nhiễm legionella": "Legionellosis",
    "viêm phổi legionella": "Legionellosis",
    "sakit na legionnaires": "Legionellosis",
    "လီဂျီယွန်နဲရောဂါ": "Legionellosis",
    "လီဂျီယွန်နဲလား": "Legionellosis",
    "ជំងឺលីជែនណែរ": "Legionellosis",
    "ជំងឺ legionnaires": "Legionellosis",
    "ພະຍາດລີຈຽນແນຣ໌": "Legionellosis",
    "ລີຈຽນແນຣ໌": "Legionellosis",
    "legionnaires' disease": "Legionellosis",
    "legionnaires disease": "Legionellosis",
    "pontiac fever": "Legionellosis",
    "rsv": "Respiratory syncytial virus infection",
    "virus sinsitium pernapasan": "Respiratory syncytial virus infection",
    "infeksi rsv": "Respiratory syncytial virus infection",
    "respiratory syncytial virus": "Respiratory syncytial virus infection",
    "virus sinsitium pernafasan": "Respiratory syncytial virus infection",
    "อาร์เอสวี": "Respiratory syncytial virus infection",
    "ไวรัสอาร์เอสวี": "Respiratory syncytial virus infection",
    "โรคติดเชื้อไวรัสอาร์เอสวี": "Respiratory syncytial virus infection",
    "virus hợp bào hô hấp": "Respiratory syncytial virus infection",
    "vi rút hợp bào hô hấp": "Respiratory syncytial virus infection",
    "nhiễm rsv": "Respiratory syncytial virus infection",
    "အသက်ရှူလမ်းကြောင်းဆိုင်ရာ ဗိုင်းရပ်စ် rsv": "Respiratory syncytial virus infection",
    "វីរុស rsv": "Respiratory syncytial virus infection",
    "ការឆ្លងមេរោគ rsv": "Respiratory syncytial virus infection",
    "ໄວຣັດ rsv": "Respiratory syncytial virus infection",
    "ພະຍາດຕິດເຊື້ອ rsv": "Respiratory syncytial virus infection",
    "respiratory syncytial virus infection": "Respiratory syncytial virus infection",
    "human orthopneumovirus": "Respiratory syncytial virus infection",
    "mers": "Middle East respiratory syndrome",
    "mers-cov": "Middle East respiratory syndrome",
    "middle east respiratory syndrome": "Middle East respiratory syndrome",
    "flu arab": "Middle East respiratory syndrome",
    "โรคเมอร์ส": "Middle East respiratory syndrome",
    "เมอร์ส": "Middle East respiratory syndrome",
    "ไวรัสเมอร์ส": "Middle East respiratory syndrome",
    "hội chứng hô hấp trung đông": "Middle East respiratory syndrome",
    "မာ့စ်": "Middle East respiratory syndrome",
    "အရှေ့အလယ်ပိုင်း အသက်ရှူလမ်းကြောင်းဆိုင်ရာ ရောဂါလက္ခဏာစု": "Middle East respiratory syndrome",
    "ជំងឺផ្លូវដង្ហើមមជ្ឈិមបូព៌ា": "Middle East respiratory syndrome",
    "ພະຍາດເມິຣ໌ສ": "Middle East respiratory syndrome",
    "camel flu": "Middle East respiratory syndrome",
    "kolera": "Cholera",
    "cholera": "Cholera",
    "muntaber kolera": "Cholera",
    "vibrio cholerae": "Cholera",
    "taun": "Cholera",
    "penyakit taun": "Cholera",
    "อหิวาตกโรค": "Cholera",
    "อหิวาต์": "Cholera",
    "โรคห่า": "Cholera",
    "bệnh tả": "Cholera",
    "benh ta": "Cholera",
    "tả": "Cholera",
    "dịch tả": "Cholera",
    "ကာလဝမ်းရောဂါ": "Cholera",
    "ကာလဝမ်း": "Cholera",
    "អាសន្នរោគ": "Cholera",
    "ជំងឺអាសន្នរោគ": "Cholera",
    "ພະຍາດອະຫິວາ": "Cholera",
    "ອະຫິວາ": "Cholera",
    "ໄຂ້ຮາກລົງທ້ອງ": "Cholera",
    "vibrio cholera": "Cholera",
    "tifus": "Typhoid",
    "tipes": "Typhoid",
    "demam tifoid": "Typhoid",
    "typhoid": "Typhoid",
    "thypoid": "Typhoid",
    "salmonella typhi": "Typhoid",
    "demam kepialu": "Typhoid",
    "tifoid": "Typhoid",
    "penyakit kepialu": "Typhoid",
    "ไข้ไทฟอยด์": "Typhoid",
    "ไข้รากสาดน้อย": "Typhoid",
    "ไทฟอยด์": "Typhoid",
    "thương hàn": "Typhoid",
    "thuong han": "Typhoid",
    "bệnh thương hàn": "Typhoid",
    "sốt thương hàn": "Typhoid",
    "tipus": "Typhoid",
    "lagnat na tipus": "Typhoid",
    "အူရောင်ငန်းဖျား": "Typhoid",
    "တိုက်ဖွိုက်": "Typhoid",
    "គ្រុនពោះវៀន": "Typhoid",
    "ជំងឺគ្រុនពោះវៀន": "Typhoid",
    "ໄຂ້ໄທຟອຍ": "Typhoid",
    "ໄຂ້ຮາກສາດນ້ອຍ": "Typhoid",
    "ໄທຟອຍ": "Typhoid",
    "typhoid fever": "Typhoid",
    "enteric fever": "Typhoid",
    "diare akut": "Acute diarrhea",
    "diare": "Acute diarrhea",
    "mencret": "Acute diarrhea",
    "muntaber": "Acute diarrhea",
    "buang air besar cair": "Acute diarrhea",
    "cirit-birit": "Acute diarrhea",
    "cirit-birit akut": "Acute diarrhea",
    "diarrhoea": "Acute diarrhea",
    "อุจจาระร่วงเฉียบพลัน": "Acute diarrhea",
    "โรคท้องร่วง": "Acute diarrhea",
    "ท้องร่วงเฉียบพลัน": "Acute diarrhea",
    "ท้องเสียเฉียบพลัน": "Acute diarrhea",
    "tiêu chảy cấp": "Acute diarrhea",
    "tieu chay cap": "Acute diarrhea",
    "bệnh tiêu chảy": "Acute diarrhea",
    "tiêu chảy": "Acute diarrhea",
    "pagtatae": "Acute diarrhea",
    "diarrhea": "Acute diarrhea",
    "matinding pagtatae": "Acute diarrhea",
    "ပြင်းထန်ဝမ်းလျှောရောဂါ": "Acute diarrhea",
    "ဝမ်းပျက်ဝမ်းလျှော": "Acute diarrhea",
    "រាគរួចស្រួចស្រាវ": "Acute diarrhea",
    "ជំងឺរាគ": "Acute diarrhea",
    "ຖອກທ້ອງກະທັນຫັນ": "Acute diarrhea",
    "ຖອກທ້ອງ": "Acute diarrhea",
    "ພະຍາດຖອກທ້ອງ": "Acute diarrhea",
    "acute diarrhea": "Acute diarrhea",
    "acute diarrhoea": "Acute diarrhea",
    "watery diarrhea": "Acute diarrhea",
    "gastroenteritis": "Acute diarrhea",
    "rabies": "Rabies",
    "penyakit anjing gila": "Rabies",
    "virus rabies": "Rabies",
    "gigitan anjing gila": "Rabies",
    "โรคพิษสุนัขบ้า": "Rabies",
    "โรคกลัวน้ำ": "Rabies",
    "พิษสุนัขบ้า": "Rabies",
    "bệnh dại": "Rabies",
    "benh dai": "Rabies",
    "dại": "Rabies",
    "vi rút dại": "Rabies",
    "kamandag ng aso": "Rabies",
    "ခွေးရူးပြန်": "Rabies",
    "ခွေးရူးပြန်ရောဂါ": "Rabies",
    "ឆ្កែឆ្កួត": "Rabies",
    "ជំងឺឆ្កែឆ្កួត": "Rabies",
    "ជំងឺខាំឆ្កួត": "Rabies",
    "ພະຍາດວໍ້": "Rabies",
    "ວໍ້": "Rabies",
    "ພະຍາດໝາບ້າ": "Rabies",
    "hydrophobia": "Rabies",
    "lyssavirus": "Rabies",
    "rabid animal bite": "Rabies",
    "antraks": "Anthrax",
    "anthrax": "Anthrax",
    "penyakit sapi gila antraks": "Anthrax",
    "radang limpa antraks": "Anthrax",
    "โรคแอนแทรกซ์": "Anthrax",
    "แอนแทรกซ์": "Anthrax",
    "กาลี": "Anthrax",
    "bệnh than": "Anthrax",
    "benh than": "Anthrax",
    # NOTE: bare "than" removed — collides with English "more than"/"rather than".
    "bệnh nhiệt thán": "Anthrax",
    "ဒေါင့်သန်း": "Anthrax",
    "ဒေါင့်သန်းရောဂါ": "Anthrax",
    "ជំងឺអង់ត្រាក់": "Anthrax",
    "អង់ត្រាក់": "Anthrax",
    "ພະຍາດແອນແທຣກຊ໌": "Anthrax",
    "ແອນແທຣກຊ໌": "Anthrax",
    "bacillus anthracis": "Anthrax",
    "woolsorter's disease": "Anthrax",
    "leptospirosis": "Leptospirosis",
    "penyakit kencing tikus": "Leptospirosis",
    "demam banjir leptospirosis": "Leptospirosis",
    "โรคฉี่หนู": "Leptospirosis",
    "ฉี่หนู": "Leptospirosis",
    "โรคเลปโตสไปโรซิส": "Leptospirosis",
    "เลปโตสไปโรซิส": "Leptospirosis",
    "bệnh xoắn khuẩn leptospira": "Leptospirosis",
    "bệnh leptospira": "Leptospirosis",
    "sốt do chuột": "Leptospirosis",
    "ကြွက်ကျင်ငယ်မှတစ်ဆင့်ကူးစက်သောရောဂါ": "Leptospirosis",
    "လက်တိုစပိုင်ရိုးဆစ်": "Leptospirosis",
    "ជំងឺឆ្លងតាមទឹកនោមសត្វ": "Leptospirosis",
    "លេបតូស្ពីរ៉ូស៊ីស": "Leptospirosis",
    "ພະຍາດຍ່ຽວໜູ": "Leptospirosis",
    "ໄຂ້ຍ່ຽວໜູ": "Leptospirosis",
    "weil's disease": "Leptospirosis",
    "rat urine disease": "Leptospirosis",
    "mpox": "Mpox",
    "monkeypox": "Mpox",
    "cacar monyet": "Mpox",
    "gondongan": "Mumps",
    "penyakit gondongan": "Mumps",
    "mumps": "Mumps",
    "parotitis": "Mumps",
    "epidemic parotitis": "Mumps",
    "ฝีดาษลิง": "Mpox",
    "โรคฝีดาษวานร": "Mpox",
    "ฝีดาษวานร": "Mpox",
    "เอ็มพ็อกซ์": "Mpox",
    "đậu mùa khỉ": "Mpox",
    "dau mua khi": "Mpox",
    "bệnh đậu mùa khỉ": "Mpox",
    "bulutong-unggoy": "Mpox",
    "မျောက်ကျောက်": "Mpox",
    "မျောက်ကျောက်ရောဂါ": "Mpox",
    "ជំងឺអុតស្វា": "Mpox",
    "អុតស្វា": "Mpox",
    "ພະຍາດໝາກສຸກລີງ": "Mpox",
    "ໝາກສຸກລີງ": "Mpox",
    "monkeypox virus": "Mpox",
    "simian pox": "Mpox",
    "cacar air": "Chickenpox",
    "chickenpox": "Chickenpox",
    "chicken pox": "Chickenpox",
    "varicella": "Chickenpox",
    "varicella zoster": "Chickenpox",
    "variola": "Smallpox",
    "cacar": "Smallpox",
    "smallpox": "Smallpox",
    "ไข้ทรพิษ": "Smallpox",
    "ฝีดาษ": "Smallpox",
    "đậu mùa": "Smallpox",
    "dau mua": "Smallpox",
    "bệnh đậu mùa": "Smallpox",
    "bulutong": "Smallpox",
    "ကျောက်ကြီးရောဂါ": "Smallpox",
    "ကျောက်ရောဂါ": "Smallpox",
    "ជំងឺអុតធំ": "Smallpox",
    "អុតធំ": "Smallpox",
    "ໝາກສຸກໃຫຍ່": "Smallpox",
    "ພະຍາດໝາກສຸກ": "Smallpox",
    "variola major": "Smallpox",
    "flu singapura": "Hand, foot and mouth disease",
    "penyakit tangan kaki dan mulut": "Hand, foot and mouth disease",
    "hfmd": "Hand, foot and mouth disease",
    "tangan kaki mulut": "Hand, foot and mouth disease",
    "penyakit tangan, kaki dan mulut": "Hand, foot and mouth disease",
    "selesema singapura": "Hand, foot and mouth disease",
    "โรคมือเท้าปาก": "Hand, foot and mouth disease",
    "มือเท้าปาก": "Hand, foot and mouth disease",
    "เอชเอฟเอ็มดี": "Hand, foot and mouth disease",
    "tay chân miệng": "Hand, foot and mouth disease",
    "tay chan mieng": "Hand, foot and mouth disease",
    "bệnh tay chân miệng": "Hand, foot and mouth disease",
    "hand, foot, and mouth disease": "Hand, foot and mouth disease",
    "လက်၊ ခြေ၊ ခံတွင်းရောဂါ": "Hand, foot and mouth disease",
    "ជំងឺពងបែកដៃជើងនិងក្នុងមាត់": "Hand, foot and mouth disease",
    "ជំងឺដៃជើងមាត់": "Hand, foot and mouth disease",
    "ພະຍາດມືຕີນປາກ": "Hand, foot and mouth disease",
    "ມືຕີນປາກ": "Hand, foot and mouth disease",
    "hand foot and mouth disease": "Hand, foot and mouth disease",
    "hand foot mouth": "Hand, foot and mouth disease",
    "coxsackie virus": "Hand, foot and mouth disease",
    "enterovirus 71": "Hand, foot and mouth disease",
    "pmk": "Foot and mouth disease",
    "penyakit mulut dan kuku": "Foot and mouth disease",
    "foot and mouth disease": "Foot and mouth disease",
    "penyakit kuku dan mulut": "Foot and mouth disease",
    "fmd": "Foot and mouth disease",
    "โรคปากและเท้าเปื่อย": "Foot and mouth disease",
    "ปากและเท้าเปื่อย": "Foot and mouth disease",
    "lở mồm long móng": "Foot and mouth disease",
    "bệnh lở mồm long móng": "Foot and mouth disease",
    "ခွာနာလျှာနာရောဂါ": "Foot and mouth disease",
    "ခွာနာလျှာနာ": "Foot and mouth disease",
    "ជំងឺសារទឹក និងបាក់ជើង": "Foot and mouth disease",
    "ພະຍາດປາກເປື່ອຍລົງເລັບ": "Foot and mouth disease",
    "aphthous fever": "Foot and mouth disease",
    "ebola": "Ebola",
    "virus ebola": "Ebola",
    "demam berdarah ebola": "Ebola",
    "โรคไวรัสอีโบลา": "Ebola",
    "อีโบลา": "Ebola",
    "ไวรัสอีโบลา": "Ebola",
    "bệnh do vi rút ebola": "Ebola",
    "sốt xuất huyết ebola": "Ebola",
    "ebola virus": "Ebola",
    "အီဘိုလာ": "Ebola",
    "အီဘိုလာဗိုင်းရပ်စ်ရောဂါ": "Ebola",
    "ជំងឺអេបូឡា": "Ebola",
    "អេបូឡា": "Ebola",
    "ພະຍາດອີໂບລາ": "Ebola",
    "ອີໂບລາ": "Ebola",
    "ebola virus disease": "Ebola",
    "evd": "Ebola",
    "ebola hemorrhagic fever": "Ebola",
    "marburg": "Marburg disease",
    "virus marburg": "Marburg disease",
    "demam marburg": "Marburg disease",
    "โรคไวรัสมาร์บวร์ก": "Marburg disease",
    "มาร์บวร์ก": "Marburg disease",
    "ไวรัสมาร์เบิร์ก": "Marburg disease",
    "bệnh do vi rút marburg": "Marburg disease",
    "marburg virus disease": "Marburg disease",
    "မာဘတ်ဗိုင်းရပ်စ်ရောဂါ": "Marburg disease",
    "ជំងឺវីរុសម៉ាប៊ើក": "Marburg disease",
    "ພະຍາດມາຣ໌ບວກ": "Marburg disease",
    "mvd": "Marburg disease",
    "marburg hemorrhagic fever": "Marburg disease",
    "demam lassa": "Lassa fever",
    "lassa fever": "Lassa fever",
    "virus lassa": "Lassa fever",
    "ไข้ลัสซา": "Lassa fever",
    "โรคไข้ลัสซา": "Lassa fever",
    "sốt lassa": "Lassa fever",
    "bệnh sốt lassa": "Lassa fever",
    "လာဆာဖျားနာရောဂါ": "Lassa fever",
    "ជំងឺគ្រុនឡាសា": "Lassa fever",
    "ໄຂ້ລັສຊາ": "Lassa fever",
    "lassa virus": "Lassa fever",
    "hantavirus": "Hantavirus",
    "virus hanta": "Hantavirus",
    "sindrom paru hantavirus": "Hantavirus",
    "ไวรัสฮันตา": "Hantavirus",
    "โรคติดเชื้อไวรัสฮันตา": "Hantavirus",
    "nhiễm virus hanta": "Hantavirus",
    "ဟန်တာဗိုင်းရပ်စ်": "Hantavirus",
    "វីរុសហានតា": "Hantavirus",
    "ຮັນຕາໄວຣັດ": "Hantavirus",
    "hantavirus pulmonary syndrome": "Hantavirus",
    "hps": "Hantavirus",
    "hemorrhagic fever with renal syndrome": "Hantavirus",
    "virus nipah": "Nipah virus disease",
    "nipah": "Nipah virus disease",
    "penyakit virus nipah": "Nipah virus disease",
    "โรคติดเชื้อไวรัสนิปาห์": "Nipah virus disease",
    "ไวรัสนิปาห์": "Nipah virus disease",
    "นิปาห์": "Nipah virus disease",
    "vi rút nipah": "Nipah virus disease",
    "bệnh do virus nipah": "Nipah virus disease",
    "nipah virus": "Nipah virus disease",
    "နီပါးဗိုင်းရပ်စ်ရောဂါ": "Nipah virus disease",
    "វីរុសនីប៉ា": "Nipah virus disease",
    "ໄວຣັດນິປາຫ໌": "Nipah virus disease",
    "nipah virus disease": "Nipah virus disease",
    "niv": "Nipah virus disease",
    "pes": "Plague",
    "penyakit pes": "Plague",
    "plague": "Plague",
    "sampar": "Plague",
    "wabak hawar": "Plague",
    "plag": "Plague",
    "กาฬโรค": "Plague",
    "โรคกาฬโรค": "Plague",
    "dịch hạch": "Plague",
    "dich hach": "Plague",
    "bệnh dịch hạch": "Plague",
    "salot": "Plague",
    "ပလိပ်ရောဂါ": "Plague",
    "ပလိပ်": "Plague",
    "ជំងឺប៉េស្ត": "Plague",
    "ប៉េស្ត": "Plague",
    "ພະຍາດກາລະໂລກ": "Plague",
    "ກາລະໂລກ": "Plague",
    "bubonic plague": "Plague",
    "pneumonic plague": "Plague",
    "black death": "Plague",
    "yersinia pestis": "Plague",
    "tetanus": "Tetanus",
    "kejang mulut": "Tetanus",
    "infeksi tetanus": "Tetanus",
    "kancing gigi": "Tetanus",
    "โรคบาดทะยัก": "Tetanus",
    "บาดทะยัก": "Tetanus",
    "uốn ván": "Tetanus",
    "uon van": "Tetanus",
    "bệnh uốn ván": "Tetanus",
    "tetano": "Tetanus",
    "မေးခိုင်": "Tetanus",
    "မေးခိုင်ရောဂါ": "Tetanus",
    "ជំងឺតេតាណុស": "Tetanus",
    "តេតាណុស": "Tetanus",
    "ພະຍາດບາດທະຍັກ": "Tetanus",
    "ບາດທະຍັກ": "Tetanus",
    "lockjaw": "Tetanus",
    "clostridium tetani": "Tetanus",
    "kusta": "Leprosy",
    "lepra": "Leprosy",
    "morbus hansen": "Leprosy",
    "penyakit kusta": "Leprosy",
    "penyakit hansen": "Leprosy",
    "โรคเรื้อน": "Leprosy",
    "เรื้อน": "Leprosy",
    "bệnh phong": "Leprosy",
    "bệnh cùi": "Leprosy",
    "phong cùi": "Leprosy",
    "ketong": "Leprosy",
    "leprosy": "Leprosy",
    "နူနာ": "Leprosy",
    "နူနာရောဂါ": "Leprosy",
    "ជំងឺឃ្លង់": "Leprosy",
    "ឃ្លង់": "Leprosy",
    "ພະຍາດຂີ້ທູດ": "Leprosy",
    "ຂີ້ທູດ": "Leprosy",
    "hansen's disease": "Leprosy",
    "mycobacterium leprae": "Leprosy",
    "meningitis": "Meningitis",
    "radang selaput otak": "Meningitis",
    "infeksi selaput otak": "Meningitis",
    "radang membran otak": "Meningitis",
    "โรคเยื่อหุ้มสมองอักเสบ": "Meningitis",
    "เยื่อหุ้มสมองอักเสบ": "Meningitis",
    "viêm màng não": "Meningitis",
    "viem mang nao": "Meningitis",
    "bệnh viêm màng não": "Meningitis",
    "pamamaga ng lining ng utak": "Meningitis",
    "ဦးနှောက်မြှေးရောင်ရောဂါ": "Meningitis",
    "ဦးနှောက်မြှေးရောင်": "Meningitis",
    "ជំងឺរលាកស្រោមខួរ": "Meningitis",
    "រលាកស្រោមខួរ": "Meningitis",
    "ພະຍາດເຍື່ອຫຸ້ມສະໝອງອັກເສບ": "Meningitis",
    "ເຍື່ອຫຸ້ມສະໝອງອັກເສບ": "Meningitis",
    "bacterial meningitis": "Meningitis",
    "viral meningitis": "Meningitis",
    "meningococcal disease": "Meningitis",
    "polio": "Polio",
    "poliomielitis": "Polio",
    "lumpuh layu": "Polio",
    "kelumpuhan layu akut": "Polio",
    "afp": "Polio",
    "lumpuh kanak-kanak": "Polio",
    "โรคโปลิโอ": "Polio",
    "โปลิโอ": "Polio",
    "bại liệt": "Polio",
    "bai liet": "Polio",
    "bệnh bại liệt": "Polio",
    "poliomyelitis": "Polio",
    "ပိုလီယို": "Polio",
    "ပိုလီယိုရောဂါ": "Polio",
    "ជំងឺស្វិតដៃជើង": "Polio",
    "ស្វិតដៃជើង": "Polio",
    "ប៉ូលីយ៉ូ": "Polio",
    "ພະຍາດໂປລິໂອ": "Polio",
    "ໂປລິໂອ": "Polio",
    "infantile paralysis": "Polio",
    "poliovirus": "Polio",
    "hepatitis b": "Chronic hepatitis B, unspecified",
    "hepatitis b kronis": "Chronic hepatitis B, unspecified",
    "radang hati b": "Chronic hepatitis B, unspecified",
    "penyakit kuning hepatitis b": "Chronic hepatitis B, unspecified",
    "ไวรัสตับอักเสบบี": "Chronic hepatitis B, unspecified",
    "โรคตับอักเสบบี": "Chronic hepatitis B, unspecified",
    "ตับอักเสบบี": "Chronic hepatitis B, unspecified",
    "viêm gan b": "Chronic hepatitis B, unspecified",
    "viem gan b": "Chronic hepatitis B, unspecified",
    "viêm gan b mạn tính": "Chronic hepatitis B, unspecified",
    "အသည်းရောင် အသားဝါ ဘီပိုး": "Chronic hepatitis B, unspecified",
    "ជំងឺរលាកថ្លើមប្រភេទបេ": "Chronic hepatitis B, unspecified",
    "រលាកថ្លើមបេ": "Chronic hepatitis B, unspecified",
    "ພະຍາດຕັບອັກເສບບີ": "Chronic hepatitis B, unspecified",
    "ຕັບອັກເສບບີ": "Chronic hepatitis B, unspecified",
    "chronic hepatitis b": "Chronic hepatitis B, unspecified",
    "hbv": "Chronic hepatitis B, unspecified",
    "hiv": "Human immunodeficiency virus disease without mention of tuberculosis or malaria, clinical stage unspecified",
    "aids": "Human immunodeficiency virus disease without mention of tuberculosis or malaria, clinical stage unspecified",
    "infeksi hiv": "Human immunodeficiency virus disease without mention of tuberculosis or malaria, clinical stage unspecified",
    "odha": "Human immunodeficiency virus disease without mention of tuberculosis or malaria, clinical stage unspecified",
    "เอชไอวี": "Human immunodeficiency virus disease without mention of tuberculosis or malaria, clinical stage unspecified",
    "เอดส์": "Human immunodeficiency virus disease without mention of tuberculosis or malaria, clinical stage unspecified",
    "โรคเอดส์": "Human immunodeficiency virus disease without mention of tuberculosis or malaria, clinical stage unspecified",
    "ผู้ติดเชื้อเอชไอวี": "Human immunodeficiency virus disease without mention of tuberculosis or malaria, clinical stage unspecified",
    "nhiễm hiv": "Human immunodeficiency virus disease without mention of tuberculosis or malaria, clinical stage unspecified",
    "bệnh aids": "Human immunodeficiency virus disease without mention of tuberculosis or malaria, clinical stage unspecified",
    "အေ့ဒ်စ်": "Human immunodeficiency virus disease without mention of tuberculosis or malaria, clinical stage unspecified",
    "အိပ်ခ်ျအိုင်ဗွီ": "Human immunodeficiency virus disease without mention of tuberculosis or malaria, clinical stage unspecified",
    "hiv/aids": "Human immunodeficiency virus disease without mention of tuberculosis or malaria, clinical stage unspecified",
    "អេដស៍": "Human immunodeficiency virus disease without mention of tuberculosis or malaria, clinical stage unspecified",
    "មេរោគអេដស៍": "Human immunodeficiency virus disease without mention of tuberculosis or malaria, clinical stage unspecified",
    "ພະຍາດເອດສ໌": "Human immunodeficiency virus disease without mention of tuberculosis or malaria, clinical stage unspecified",
    "ເອດສ໌": "Human immunodeficiency virus disease without mention of tuberculosis or malaria, clinical stage unspecified",
    "human immunodeficiency virus": "Human immunodeficiency virus disease without mention of tuberculosis or malaria, clinical stage unspecified",
    "acquired immunodeficiency syndrome": "Human immunodeficiency virus disease without mention of tuberculosis or malaria, clinical stage unspecified",
    "salmonella": "Salmonella enteritis",
    "infeksi salmonella": "Salmonella enteritis",
    "salmonelosis": "Salmonella enteritis",
    "keracunan makanan salmonella": "Salmonella enteritis",
    "โรคติดเชื้อซัลโมเนลลา": "Salmonella enteritis",
    "ซัลโมเนลลา": "Salmonella enteritis",
    "nhiễm khuẩn salmonella": "Salmonella enteritis",
    "nhiễm độc thức ăn do salmonella": "Salmonella enteritis",
    "ဆယ်လ်မိုနယ်လားရောဂါ": "Salmonella enteritis",
    "ការឆ្លងបាក់តេរីសាល់ម៉ូណេឡា": "Salmonella enteritis",
    "ພະຍາດຊາວໂມເນລລາ": "Salmonella enteritis",
    "salmonella enteritis": "Salmonella enteritis",
    "salmonellosis": "Salmonella enteritis",
    "salmonella food poisoning": "Salmonella enteritis",
    "listeriosis": "Listeriosis, unspecified",
    "infeksi listeria": "Listeriosis, unspecified",
    "โรคติดเชื้อลิสทีเรีย": "Listeriosis, unspecified",
    "ลิสทีเรีย": "Listeriosis, unspecified",
    "bệnh do listeria": "Listeriosis, unspecified",
    "nhiễm khuẩn listeria": "Listeriosis, unspecified",
    "လစ်စတီးရီးယားရောဂါ": "Listeriosis, unspecified",
    "ជំងឺលីស្តេរីញ៉ូស៊ីស": "Listeriosis, unspecified",
    "ພະຍາດລີສເຕີຣິໂອຊີສ": "Listeriosis, unspecified",
    "listeria monocytogenes infection": "Listeriosis, unspecified",
    "stroke": "Stroke",
    "serangan stroke": "Stroke",
    "angin duduk": "Stroke",
    "kelumpuhan otak": "Stroke",
    "strok": "Stroke",
    "angin ahmar": "Stroke",
    "โรคหลอดเลือดสมอง": "Stroke",
    "สโตรก": "Stroke",
    "อัมพฤกษ์": "Stroke",
    "อัมพาต": "Stroke",
    "đột quỵ": "Stroke",
    "tai biến mạch máu não": "Stroke",
    "atake sa utak": "Stroke",
    "လေဖြတ်ခြင်း": "Stroke",
    "လေဖြတ်ရောဂါ": "Stroke",
    "ដាច់សរសៃឈាមខួរក្បាល": "Stroke",
    "ខ្វិន": "Stroke",
    "ພະຍາດເສັ້ນເລືອດສະໝອງຕີບ": "Stroke",
    "ເສັ້ນເລືອດໃນສະໝອງແຕກ": "Stroke",
    "cerebrovascular accident": "Stroke",
    "cva": "Stroke",
    "brain attack": "Stroke",
    "diabetes": "Diabetes mellitus, type unspecified",
    "kencing manis": "Diabetes mellitus, type unspecified",
    "diabetes melitus": "Diabetes mellitus, type unspecified",
    "โรคเบาหวาน": "Diabetes mellitus, type unspecified",
    "เบาหวาน": "Diabetes mellitus, type unspecified",
    "tiểu đường": "Diabetes mellitus, type unspecified",
    "đái tháo đường": "Diabetes mellitus, type unspecified",
    "diyabetes": "Diabetes mellitus, type unspecified",
    "ဆီးချို": "Diabetes mellitus, type unspecified",
    "ဆီးချိုရောဂါ": "Diabetes mellitus, type unspecified",
    "ជំងឺទឹកនោមផ្អែម": "Diabetes mellitus, type unspecified",
    "ទឹកនោមផ្អែម": "Diabetes mellitus, type unspecified",
    "ພະຍາດເບົາຫວານ": "Diabetes mellitus, type unspecified",
    "ເບົາຫວານ": "Diabetes mellitus, type unspecified",
    "diabetes mellitus": "Diabetes mellitus, type unspecified",
    "sugar sickness": "Diabetes mellitus, type unspecified",
    "radang lambung dan usus": "Infectious gastroenteritis or colitis without specification of infectious agent",
    "infeksi saluran pencernaan": "Infectious gastroenteritis or colitis without specification of infectious agent",
    "โรคกระเพาะและลำไส้อักเสบ": "Infectious gastroenteritis or colitis without specification of infectious agent",
    "กระเพาะลำไส้อักเสบ": "Infectious gastroenteritis or colitis without specification of infectious agent",
    "viêm dạ dày ruột": "Infectious gastroenteritis or colitis without specification of infectious agent",
    "nhiễm trùng tiêu hóa": "Infectious gastroenteritis or colitis without specification of infectious agent",
    "အစာအိမ်နှင့် အူလမ်းကြောင်းရောင်ခြင်း": "Infectious gastroenteritis or colitis without specification of infectious agent",
    "រលាកក្រពះពោះវៀន": "Infectious gastroenteritis or colitis without specification of infectious agent",
    "ພະຍາດກະເພາະແລະລໍາໄສ້ອັກເສບ": "Infectious gastroenteritis or colitis without specification of infectious agent",
    "infectious gastroenteritis": "Infectious gastroenteritis or colitis without specification of infectious agent",
    "stomach flu": "Infectious gastroenteritis or colitis without specification of infectious agent",
    "infeksi paru lain": "Other specified lung infections",
    "infeksi saluran napas bawah": "Other specified lung infections",
    "jangkitan paru-paru lain": "Other specified lung infections",
    "การติดเชื้อที่ปอดอื่นๆ": "Other specified lung infections",
    "nhiễm trùng phổi khác": "Other specified lung infections",
    "ibang impeksyon sa baga": "Other specified lung infections",
    "အခြား အဆုတ်ပိုးဝင်ခြင်းများ": "Other specified lung infections",
    "ការឆ្លងមេរោគសួតផ្សេងទៀត": "Other specified lung infections",
    "ການຕິດເຊື້ອປອດອື່ນໆ": "Other specified lung infections",
    "other specified lung infections": "Other specified lung infections",
    "lower respiratory infection": "Other specified lung infections",
    "periodontitis akut": "Acute periodontitis",
    "radang gusi akut": "Acute periodontitis",
    "โรคปริทันต์อักเสบเฉียบพลัน": "Acute periodontitis",
    "viêm nha chu cấp": "Acute periodontitis",
    "acute periodontitis": "Acute periodontitis",
    "ပြင်းထန် သွားဖုံးရောင်ခြင်း": "Acute periodontitis",
    "រលាកជាលិកាធ្មេញស្រួចស្រាវ": "Acute periodontitis",
    "ພະຍາດເຫືອກອັກເສບກະທັນຫັນ": "Acute periodontitis",
    "gum infection": "Acute periodontitis",
    "siklosporiasis": "Cyclosporiasis",
    "cyclosporiasis": "Cyclosporiasis",
    "โรคติดเชื้อไซโคลสปอรา": "Cyclosporiasis",
    "bệnh do cyclospora": "Cyclosporiasis",
    "ဆိုက်ကလိုစပိုရာရောဂါ": "Cyclosporiasis",
    "ជំងឺស៊ីក្លូស្ប៉ូរ៉ា": "Cyclosporiasis",
    "ພະຍາດໄຊໂຄລສະປໍຣາ": "Cyclosporiasis",
    "cyclospora infection": "Cyclosporiasis",
    "fibrosis kistik": "Cystic fibrosis, unspecified",
    "โรคซิสติกไฟโบรซิส": "Cystic fibrosis, unspecified",
    "bệnh xơ nang": "Cystic fibrosis, unspecified",
    "cystic fibrosis": "Cystic fibrosis, unspecified",
    "ဆစ်စတစ် ဖိုင်ဘရိုးဆစ်": "Cystic fibrosis, unspecified",
    "ជំងឺសរសៃពងបែក": "Cystic fibrosis, unspecified",
    "ພະຍາດຊີສຕິກໄຟໂບຣຊີສ": "Cystic fibrosis, unspecified",
    "mucoviscidosis": "Cystic fibrosis, unspecified",
    "miasis": "Myiasis, unspecified",
    "belatungan": "Myiasis, unspecified",
    "myiasis": "Myiasis, unspecified",
    "berenga": "Myiasis, unspecified",
    "โรคหนอนแมลงวัน": "Myiasis, unspecified",
    "หนอนแมลงวัน": "Myiasis, unspecified",
    "bệnh giòi ruồi": "Myiasis, unspecified",
    "ယင်လောက်ကောင်ရောဂါ": "Myiasis, unspecified",
    "ជំងឺដង្កូវរុយ": "Myiasis, unspecified",
    "ພະຍາດໜອນແມງວັນ": "Myiasis, unspecified",
    "maggot infestation": "Myiasis, unspecified",
    "fly larva infestation": "Myiasis, unspecified",
    "kolitis hpv": "Colitis due to human papillomavirus infection",
    "ลำไส้ใหญ่อักเสบจากเอชพีวี": "Colitis due to human papillomavirus infection",
    "viêm đại tràng do hpv": "Colitis due to human papillomavirus infection",
    "hpv colitis": "Colitis due to human papillomavirus infection",
    "hpv အူမကြီးရောင်ခြင်း": "Colitis due to human papillomavirus infection",
    "រលាកពោះវៀនធំដោយ hpv": "Colitis due to human papillomavirus infection",
    "ລໍາໄສ້ອັກເສບຈາກ hpv": "Colitis due to human papillomavirus infection",
    "colitis due to human papillomavirus": "Colitis due to human papillomavirus infection",
}

def active_disease_aliases() -> dict[str, str]:
    """Return the DB disease vocabulary with compatibility aliases layered last."""

    if not config.KEYWORDS_LOAD_ATTEMPTED:
        config.load_keywords_from_db()
    db_aliases = {
        str(alias).strip().casefold(): str(label).strip()
        for alias, label in config.DISEASE_DICT.items()
        if str(alias).strip() and str(label).strip()
    }
    return {**db_aliases, **DISEASE_ALIASES}

_ALIAS_WORD_REGEX_CACHE: dict[str, re.Pattern] = {}
_ALIAS_FOLDED_REGEX_CACHE: dict[str, re.Pattern] = {}

def _match_disease_alias(
    key: str,
    text: str,
    lower_text: str,
    folded_text: Optional[str] = None,
) -> bool:
    """Check if alias exists in text.
    For keys containing ASCII letters/numbers, word boundaries \b are strictly enforced
    to avoid false positives (e.g. 'ari' matching 'dari' or 'sementara').
    """
    key = repair_mojibake(key or "")
    if not key:
        return False
    if re.search(r"[a-zA-Z0-9]", key):
        # Punctuation varies across publishers (``hand, foot`` versus
        # ``hand foot``). Compare a whitespace-folded view as well so a
        # reviewed alias is not lost because of editorial commas.
        folded_key = re.sub(r"[^\w]+", " ", key.casefold()).strip()
        folded_text = (
            folded_text
            if folded_text is not None
            else re.sub(r"[^\w]+", " ", text.casefold()).strip()
        )
        folded_pattern = _ALIAS_FOLDED_REGEX_CACHE.get(folded_key)
        if folded_pattern is None and folded_key:
            folded_pattern = re.compile(rf"(?<!\w){re.escape(folded_key)}(?!\w)")
            _ALIAS_FOLDED_REGEX_CACHE[folded_key] = folded_pattern
        if folded_pattern is not None and folded_pattern.search(folded_text):
            return True
        pat = _ALIAS_WORD_REGEX_CACHE.get(key)
        if pat is None:
            pat = re.compile(rf"\b{re.escape(key)}\b", re.IGNORECASE)
            _ALIAS_WORD_REGEX_CACHE[key] = pat
        return bool(pat.search(text))
    return key in lower_text


def _matched_disease_aliases(
    text: str,
    aliases: Optional[dict[str, str]] = None,
    folded_text: Optional[str] = None,
) -> list[tuple[str, str]]:
    """Return explicit aliases while suppressing shorter conflicting aliases."""
    aliases = aliases or active_disease_aliases()
    lower_text = text.lower()
    folded_text = (
        folded_text
        if folded_text is not None
        else re.sub(r"[^\w]+", " ", text.casefold()).strip()
    )
    matched = [
        (key, value)
        for key, value in aliases.items()
        if _match_disease_alias(key, text, lower_text, folded_text)
    ]
    normalized = [
        (
            key,
            value,
            re.sub(r"[^\w]+", " ", repair_mojibake(key).casefold()).strip(),
        )
        for key, value in matched
    ]
    shadowed_values = {
        value
        for _, value, short_key in normalized
        if short_key and any(
            value != other_value
            and len(short_key) < len(long_key)
            and f" {short_key} " in f" {long_key} "
            for _, other_value, long_key in normalized
        )
    }
    return [(key, value) for key, value, _ in normalized if value not in shadowed_values]


def extract_diseases(text: str) -> list[str]:
    aliases = active_disease_aliases()
    diseases = set(extract_terms(text, config.DISEASE_DICT))
    lower_text = text.lower()
    folded_text = re.sub(r"[^\w]+", " ", text.casefold()).strip()
    matched = _matched_disease_aliases(text, aliases=aliases, folded_text=folded_text)
    diseases.update(value for _, value in matched)
    
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
    return sorted(set(value for _, value in _matched_disease_aliases(text)))


def _alias_positions(alias: str, text: str) -> list[int]:
    if not alias or not text:
        return []
    if re.search(r"[A-Za-z0-9]", alias):
        pattern = rf"(?<!\w){re.escape(alias)}(?!\w)"
    else:
        pattern = re.escape(alias)
    return [match.start() for match in re.finditer(pattern, text, re.IGNORECASE | re.UNICODE)]


def disease_mention_positions(disease: str, text: str) -> list[int]:
    """Character offsets where this disease, or one of its aliases, is named."""

    label = canonical_disease_name(disease)
    canon = label.casefold()
    positions: list[int] = []
    try:
        aliases = active_disease_aliases()
    except Exception:
        aliases = DISEASE_ALIASES
    for alias, target in aliases.items():
        target_canon = canonical_disease_name(str(target)).casefold()
        if target_canon != canon and str(target).casefold() != canon:
            continue
        positions.extend(_alias_positions(str(alias), text or ""))
    positions.extend(_alias_positions(label, text or ""))
    return sorted(set(positions))


def _mention_is_non_outbreak_context(pos: int, text: str, link_at: int) -> bool:
    if link_at >= 0 and pos >= link_at:
        return True
    window = (text or "")[max(0, pos - 90): pos + 90]
    return bool(_VACCINE_MENTION.search(window))


def prefer_outbreak_diseases(candidates: list[str], text: str) -> list[str]:
    """Keep the disease named with the counts.

    A vaccine phrase or a related-link headline must not replace that disease.
    Alias coverage is multilingual; the rule itself only looks at where the
    mention sits relative to the count, a vaccine word, or a related-link block.
    """

    unique = list(dict.fromkeys(
        item for item in candidates
        if item and str(item).strip().upper() != "UNKNOWN"
    ))
    if len(unique) <= 1:
        return unique
    source = text or ""
    link_at = related_link_offset(source)

    def context_only(name: str) -> bool:
        positions = disease_mention_positions(name, source)
        if not positions:
            return False
        return all(_mention_is_non_outbreak_context(pos, source, link_at) for pos in positions)

    substantive = [item for item in unique if not context_only(item)]
    pool = substantive or unique

    def sort_key(name: str) -> tuple[int, int]:
        positions = disease_mention_positions(name, source) or [10**9]
        near_count = 0
        for pos in positions:
            if pos >= 10**9 or (link_at >= 0 and pos >= link_at):
                continue
            if _mention_is_non_outbreak_context(pos, source, link_at):
                continue
            window = source[max(0, pos - 120): pos + 120]
            if re.search(r"\d", window):
                near_count = 1
                break
        return (-near_count, min(positions))

    return sorted(pool, key=sort_key)


def extract_date_from_text(text: str) -> Optional[str]:
    if not text:
        return None
    sample = text[:1000]
    # ISO date: 2026-08-27 or 2026/08/27
    m = re.search(r'\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b', sample)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    # Day Month Year (supports hyphens, slashes, spaces): e.g. "26-May-2025", "27 Agustus 2026"
    month_pattern = config.get_temporal_month_pattern()
    month_map = config.get_temporal_month_map()
    m = re.search(rf'(?<!\w)(0?[1-9]|[12]\d|3[01])[-/\s]+(?P<month>{month_pattern})[-/\s]+(20\d{{2}})\b', sample, re.IGNORECASE | re.UNICODE)
    if m:
        month_str = m.group("month").casefold()
        if month_str in month_map:
            return f"{m.group(3)}-{month_map[month_str]:02d}-{int(m.group(1)):02d}"
    # Month Day, Year: e.g. "May 26, 2025", "August 27, 2026"
    m = re.search(rf'(?<!\w)(?P<month>{month_pattern})[-/\s]+(0?[1-9]|[12]\d|3[01]),?[-/\s]+(20\d{{2}})\b', sample, re.IGNORECASE | re.UNICODE)
    if m:
        month_str = m.group("month").casefold()
        if month_str in month_map:
            return f"{m.group(3)}-{month_map[month_str]:02d}-{int(m.group(2)):02d}"
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

CHALLENGE_CONTENT_MARKERS = (
    "just a moment",
    "checking your browser",
    "checking if the site connection is secure",
    "verifying you are human",
    "enable javascript and cookies to continue",
    "attention required! | cloudflare",
    "cloudflare ray id",
    "un instant...",
    "un momento...",
    "403 forbidden",
    "access denied",
    "404 not found",
    "page not found",
)


def is_challenge_or_blocked_content(text: str) -> bool:
    """Detect if the input text is a browser challenge, bot wall, or error page."""
    if not text:
        return False
    sample = text[:5000].lower()
    return any(marker in sample for marker in CHALLENGE_CONTENT_MARKERS)


def get_folded_country_aliases() -> dict[str, str]:
    """Return folded country aliases dictionary from config."""
    from . import config
    return getattr(config, "FOLDED_COUNTRY_ALIASES", {})
