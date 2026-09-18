"""High-precision, article-level disease surveillance extraction.

This module deliberately separates three concerns that are easy to conflate:

* NER/linking: a string is a location only after contextual checks and
  gazetteer/geocoder validation.
* Relation extraction: a metric is attached to the nearest validated location
  in the same evidence window, never to the first number in the document.
* Decision logic: alert and relevance are computed from all country relations,
  official advisories, and regional thresholds.

The local gazetteer is authoritative in production. Nominatim is an optional
fallback for a genuinely unseen place and is disabled unless explicitly
enabled, which prevents a network lookup from turning statistical words into
locations.
"""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass
from datetime import date, datetime
from functools import lru_cache
from typing import Any, Iterable, Optional, Protocol
from urllib.parse import urlparse

import requests
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import config, extractors
from .epidemiology import evidence_sentences, extract_event_date, extract_labeled_counts, normalize_publication_date

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public, strict output contract
# ---------------------------------------------------------------------------


class SurveillanceArea(BaseModel):
    """A city/province metric used for precise matrix coordinates."""

    model_config = ConfigDict(extra="forbid")

    name: str
    country: str
    reported_cases: int = Field(default=0, ge=0)
    deaths: Optional[int] = Field(default=None, ge=0)
    time_frame: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class SurveillanceLocation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    country: str
    provinces: list[str] = Field(default_factory=list)
    cities: list[str] = Field(default_factory=list)
    areas: list[SurveillanceArea] = Field(default_factory=list)
    reported_cases: int = Field(ge=0)
    deaths: Optional[int] = Field(default=None, ge=0)
    time_frame: str

class HistoricalComparison(BaseModel):
    """A non-primary period retained for comparison, never used as current data."""

    model_config = ConfigDict(extra="forbid")

    country: str
    provinces: list[str] = Field(default_factory=list)
    cities: list[str] = Field(default_factory=list)
    reported_cases: int = Field(default=0, ge=0)
    deaths: Optional[int] = Field(default=None, ge=0)
    time_frame: str = ""
    year: Optional[int] = None
    evidence: str = ""


class SurveillanceOutput(BaseModel):
    """The stable JSON contract for article-level surveillance consumers."""

    model_config = ConfigDict(extra="forbid")

    disease_classification: list[str] = Field(default_factory=list)
    published_date: Optional[str] = None
    publication_date: Optional[str] = None
    event_date: Optional[str] = None
    confirmed_cases: Optional[int] = Field(default=None, ge=0)
    suspected_cases: Optional[int] = Field(default=None, ge=0)
    hospitalizations: Optional[int] = Field(default=None, ge=0)
    evidence: list[str] = Field(default_factory=list)
    locations: list[SurveillanceLocation] = Field(default_factory=list)
    historical_comparisons: list[HistoricalComparison] = Field(default_factory=list)
    signal_type: str = "Disease Outbreak"
    health_relevance: str
    outbreak_alert: bool
    source_reliability_score: float = Field(ge=0.0, le=1.0)
    health_related: bool

    @field_validator("health_relevance")
    @classmethod
    def valid_relevance(cls, value: str) -> str:
        value = value.title()
        if value not in {"Low", "Medium", "High"}:
            raise ValueError("health_relevance must be Low, Medium, or High")
        return value

    @field_validator("published_date")
    @classmethod
    def valid_date(cls, value: Optional[str]) -> Optional[str]:
        if value is not None:
            date.fromisoformat(value)
        return value


class RawLLMRelation(BaseModel):
    """Constrained LLM supplement. It cannot bypass local entity linking."""

    model_config = ConfigDict(extra="ignore")

    location: str
    country: Optional[str] = None
    cases: int = Field(default=0, ge=0)
    deaths: Optional[int] = Field(default=None, ge=0)
    time_frame: Optional[str] = None
    evidence: str = ""


# ---------------------------------------------------------------------------
# Source reliability
# ---------------------------------------------------------------------------


# These are domain scores, not a generic "web = 0.50" default. A source name
# is still useful when no URL is available (RSS feeds often only provide that).
SOURCE_DOMAIN_RELIABILITY: dict[str, float] = {
    "who.int": 0.98,
    "cdc.gov": 0.97,
    "kemenkes.go.id": 0.98,
    "kemkes.go.id": 0.98,
    "antaranews.com": 0.90,
    "detik.com": 0.90,
    "dw.com": 0.92,
    "bbc.com": 0.94,
    "bbc.co.uk": 0.94,
    "reuters.com": 0.94,
    "apnews.com": 0.92,
    "kompas.com": 0.88,
    "cnn.com": 0.88,
    "cnnindonesia.com": 0.88,
    "channelnewsasia.com": 0.88,
    "nationthailand.com": 0.86,
    "vnexpress.net": 0.86,
    "reliefweb.int": 0.86,
}

SOURCE_TYPE_RELIABILITY: dict[str, float] = {
    "government": 0.95,
    "who": 0.98,
    "cdc": 0.97,
    "hospital": 0.90,
    "research": 0.88,
    "news": 0.84,
    "rss": 0.78,
    "web": 0.65,
    "social_media": 0.35,
    "csv": 0.60,
    "api": 0.70,
}

SOURCE_BRAND_RELIABILITY: dict[str, float] = {
    "dw": 0.92,
    "bbc": 0.94,
    "detik": 0.90,
    "antara": 0.90,
}


def source_reliability_score(
    source_name: Optional[str] = None,
    source_type: Optional[str] = None,
    source_url: Optional[str] = None,
) -> float:
    """Return a bounded score using exact domain matching before source type."""

    candidates = [source_url or "", source_name or ""]
    for candidate in candidates:
        value = candidate.lower().strip()
        if not value:
            continue
        host = urlparse(value if "://" in value else f"https://{value}").hostname or ""
        host = host.removeprefix("www.")
        for domain, score in SOURCE_DOMAIN_RELIABILITY.items():
            if host == domain or host.endswith(f".{domain}") or domain in value:
                return score
        if candidate is source_name:
            for brand, score in SOURCE_BRAND_RELIABILITY.items():
                if re.search(rf"\b{re.escape(brand)}\b", value):
                    return score

    value = (source_type or "web").lower().strip()
    for key, score in SOURCE_TYPE_RELIABILITY.items():
        if key in value:
            return score
    return SOURCE_TYPE_RELIABILITY["web"]


# ---------------------------------------------------------------------------
# Gazetteer / entity linking
# ---------------------------------------------------------------------------


NON_GEOGRAPHIC_TERMS = frozenset({
    "puncak", "sudah", "rekor", "tertinggi", "terendah", "rata-rata",
    "rata rata", "persen", "kasus", "kematian", "pasien", "total",
    "jumlah", "angka", "periode", "minggu", "weekly",
    "asia", "africa", "europe", "oceania", "antarctica",
    "southeast asia", "south east asia", "asean",
    "were", "was", "been", "have", "has", "had", "did", "does",
    "would", "could", "should", "might", "will", "shall",
})

def _is_subnational_location(name: str, country: str) -> bool:
    """Treat a validated gazetteer place below country level as an area.

    The legacy flag is named ``is_province`` for compatibility, but the
    locations table contains both provinces and cities for every supported
    country. Keeping all validated non-country places in the same relation
    path prevents a city such as Bangkok or Ho Chi Minh City from being lost.
    """

    if not country or name.casefold() == country.casefold():
        return False
    return True


KNOWN_CITY_NAMES = frozenset({
    "bandar seri begawan", "bangkok", "bandung", "cebu", "chiang mai",
    "dili", "hanoi", "ho chi minh city", "jakarta", "kuala lumpur",
    "manila", "naypyidaw", "phnom penh", "singapore", "surabaya",
    "vientiane", "yangon",
})


def _is_city_location(name: str, country: str) -> bool:
    """Classify only explicit city aliases/cues; do not guess unknown places."""

    if not name or not country or name.casefold() == country.casefold():
        return False
    folded = extractors._fold_location_text(name)
    city_hints = (
        " city", "kota ", "town", "municipality", "kabupaten", "district",
        "kecamatan", "village", "kelurahan",
    )
    return folded in KNOWN_CITY_NAMES or any(hint in folded for hint in city_hints)

LOCATION_CUES = re.compile(
    r"(?:\bdi\b|\bke\b|\bdari\b|\bhingga\b|\bse-?Indonesia\b|"
    r"\bin\b|\bfrom\b|\bto\b|\bacross\b|\bwithin\b|\bprovince\b|"
    r"\bstate\b|\bdistrict\b|\bcountry\b|\bnegara\b|\bwilayah\b)",
    re.IGNORECASE,
)

METRIC_CUES = re.compile(
    r"\b(?:cases?|kasus|infections?|infeksi|patients?|pasien|deaths?|"
    r"kematian|fatalities|meninggal)\b",
    re.IGNORECASE,
)


class Geocoder(Protocol):
    def lookup(self, query: str) -> Optional[dict[str, Any]]: ...


class NominatimGeocoder:
    """Small opt-in geocoder adapter; obey Nominatim's identifying header."""

    def __init__(self, endpoint: Optional[str] = None, timeout: float = 3.0):
        self.endpoint = endpoint or os.getenv(
            "SURVEILLANCE_GEOCODER_URL", "https://nominatim.openstreetmap.org/search"
        )
        self.timeout = timeout

    @lru_cache(maxsize=512)
    def lookup(self, query: str) -> Optional[dict[str, Any]]:
        try:
            response = requests.get(
                self.endpoint,
                params={
                    "q": query,
                    "format": "jsonv2",
                    "limit": 1,
                    "addressdetails": 1,
                    "countrycodes": os.getenv(
                        "SURVEILLANCE_GEOCODER_COUNTRYCODES",
                        "bn,kh,id,la,my,mm,ph,sg,th,vn,tl",
                    ),
                },
                headers={"User-Agent": os.getenv("SURVEILLANCE_GEOCODER_USER_AGENT", "disease-surveillance-nlp/1.0")},
                timeout=self.timeout,
            )
            response.raise_for_status()
            rows = response.json()
            if not rows:
                return None
            row = rows[0]
            address = row.get("address") or {}
            if not any(key in address for key in ("country", "state", "province", "city", "town", "village")):
                return None
            return {
                "name": query,
                "display_name": row.get("display_name", query),
                "country": address.get("country"),
                "latitude": float(row["lat"]),
                "longitude": float(row["lon"]),
            }
        except (requests.RequestException, ValueError, KeyError, TypeError) as exc:
            logger.info("Geocoder lookup failed for %r: %s", query, exc)
            return None


@dataclass(frozen=True)
class LinkedLocation:
    name: str
    country: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_province: bool = False
    is_city: bool = False
    evidence: str = ""


class GazetteerLinker:
    """Validate NER spans against local data, optionally falling back to OSM."""

    def __init__(
        self,
        coords: Optional[dict[str, tuple[float, float]]] = None,
        countries: Optional[dict[str, str]] = None,
        geocoder: Optional[Geocoder] = None,
        allow_remote: Optional[bool] = None,
    ):
        self.coords = coords if coords is not None else config.LOCATION_COORDS
        self.countries = countries if countries is not None else config.LOCATION_COUNTRIES
        # The old linker compared every candidate against every gazetteer row.
        # Build one folded index and one matcher per linker so article length
        # does not multiply gazetteer work.
        self._folded_coords: dict[str, str] = {}
        for name in self.coords:
            folded = extractors._fold_location_text(name)
            if folded and folded not in self._folded_coords:
                self._folded_coords[folded] = name
        names = sorted(self.coords, key=len, reverse=True)
        self._mention_pattern = (
            re.compile(
                rf"(?<!\w)(?:{'|'.join(re.escape(name) for name in names)})(?!\w)",
                re.IGNORECASE,
            )
            if names else None
        )
        self.geocoder = geocoder or NominatimGeocoder()
        self.allow_remote = (
            os.getenv("SURVEILLANCE_GEOCODER_ENABLED", "false").lower() in {"1", "true", "yes", "on"}
            if allow_remote is None else allow_remote
        )

    def _canonical_local(self, value: str) -> Optional[str]:
        folded = extractors._fold_location_text(value.strip())
        if not folded or folded in NON_GEOGRAPHIC_TERMS:
            return None
        if not extractors.is_usable_place_name(value):
            return None
        # Countries include aliases such as Singapura/Kamboja.
        for alias, canonical in extractors.COUNTRY_ALIASES.items():
            if folded == extractors._fold_location_text(alias):
                return canonical
        name = self._folded_coords.get(folded)
        if name:
            if folded in NON_GEOGRAPHIC_TERMS:
                return None
            return name
        return None

    def local_mentions(self, text: str) -> list[tuple[int, int, LinkedLocation]]:
        """Find validated local gazetteer mentions in one pass."""

        if not self._mention_pattern:
            return []
        mentions: list[tuple[int, int, LinkedLocation]] = []
        for match in self._mention_pattern.finditer(text or ""):
            context = text[max(0, match.start() - 80):min(len(text), match.end() + 80)]
            linked = self.link(match.group(0), context=context)
            if linked:
                mentions.append((match.start(), match.end(), linked))
        return mentions

    def link(self, value: str, context: str = "", evidence: str = "") -> Optional[LinkedLocation]:
        value = re.sub(r"\s+", " ", (value or "").strip(" ,.;:()[]{}"))
        if not value or len(value) > 80:
            return None
        if not extractors.is_usable_place_name(value, f"{value} {context} {evidence}"):
            return None
        canonical = self._canonical_local(value)
        if canonical:
            country = extractors.COUNTRY_ALIASES.get(canonical.casefold()) or self.countries.get(canonical)
            if not country and canonical in config.ASEAN_COUNTRIES:
                country = canonical
            if not country:
                return None
            if canonical.casefold() in NON_GEOGRAPHIC_TERMS:
                return None
            # An ambiguous common word is accepted only in a direct geographic
            # cue. This blocks phrases such as "puncak kasus" and "sudah ...".
            if canonical.casefold() in NON_GEOGRAPHIC_TERMS and not LOCATION_CUES.search(context):
                return None
            coords = self.coords.get(canonical, (None, None))
            return LinkedLocation(
                name=canonical,
                country=country,
                latitude=coords[0], longitude=coords[1],
                is_province=_is_subnational_location(canonical, country) and not _is_city_location(canonical, country),
                is_city=_is_city_location(canonical, country),
                evidence=evidence,
            )

        # Remote lookup is intentionally only attempted for a contextual NER
        # span. A bare statistical token never reaches this branch.
        if not self.allow_remote or not (LOCATION_CUES.search(context) or METRIC_CUES.search(context)):
            return None
        result = self.geocoder.lookup(value)
        if not result or not result.get("country"):
            return None
        return LinkedLocation(
            name=value,
            country=str(result["country"]),
            latitude=result.get("latitude"), longitude=result.get("longitude"),
            is_province=_is_subnational_location(value, str(result["country"])) and not _is_city_location(value, str(result["country"])),
            is_city=_is_city_location(value, str(result["country"])),
            evidence=evidence,
        )


def _spacy_candidates(text: str) -> Iterable[tuple[str, str]]:
    """Yield contextual GPE/LOC candidates when an optional spaCy model exists."""

    model_name = os.getenv("SURVEILLANCE_SPACY_MODEL", "").strip()
    if not model_name:
        return []
    try:
        import spacy
        nlp = spacy.load(model_name)
        doc = nlp(text[:12000])
        return [
            (ent.text, text[max(0, ent.start_char - 100):min(len(text), ent.end_char + 100)])
            for ent in doc.ents if ent.label_ in {"GPE", "LOC", "FAC"}
        ]
    except Exception as exc:
        logger.info("Optional spaCy NER unavailable: %s", exc)
        return []


# ---------------------------------------------------------------------------
# Relation and temporal extraction
# ---------------------------------------------------------------------------


@dataclass
class MetricRelation:
    location: LinkedLocation
    cases: int = 0
    deaths: Optional[int] = None
    time_frame: str = ""
    evidence: str = ""


def aggregate_relation_totals(
    relations: list[MetricRelation],
    published_date: Optional[str] = None,
) -> tuple[int, int]:
    """Aggregate metrics without adding a national total to its breakdown."""

    by_country: dict[str, list[MetricRelation]] = {}
    for relation in relations:
        by_country.setdefault(relation.location.country.casefold(), []).append(relation)

    total_cases = 0
    total_deaths = 0
    for country_relations in by_country.values():
        country_relations, _, _ = _select_primary_period(country_relations, published_date)
        country_level = [
            item for item in country_relations
            if item.location.name.casefold() == item.location.country.casefold()
        ]
        case_source = country_level or [item for item in country_relations if item.cases > 0]
        death_source = [item for item in country_level if item.deaths]
        if not death_source:
            death_source = [item for item in country_relations if item.deaths]
        total_cases += sum(item.cases for item in case_source)
        total_deaths += sum(item.deaths or 0 for item in death_source)
    return total_cases, total_deaths


MONTHS = {
    "januari": 1, "january": 1, "februari": 2, "february": 2, "maret": 3,
    "march": 3, "april": 4, "mei": 5, "may": 5, "juni": 6, "june": 6,
    "juli": 7, "july": 7, "agustus": 8, "august": 8, "september": 9,
    "oktober": 10, "october": 10, "november": 11, "desember": 12, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7,
    "ags": 8, "agst": 8, "agu": 8, "aug": 8, "sep": 9,
    "okt": 10, "oct": 10, "nov": 11, "des": 12, "dec": 12,
}

_NUMBER = r"(?:\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)"
_CASE_BEFORE_LOCATION = re.compile(
    rf"(?<![\w.,])(?P<count>{_NUMBER})(?![\w])\s*(?:ribu|juta|million|thousand)?\s*"
    r"(?:kasus|cases?|infeksi|infections?|pasien|patients?)\s+"
    r"(?:baru\s+)?(?:di|in|from|among)\s+"
    r"(?P<location>[A-ZÀ-ÖØ-Ý][\wÀ-ÿ'’-]*(?:\s+[A-ZÀ-ÖØ-Ý][\wÀ-ÿ'’-]*){0,5})",
    re.IGNORECASE | re.UNICODE,
)
_LOCATION_BEFORE_CASE = re.compile(
    r"(?P<location>[A-ZÀ-ÖØ-Ý][\wÀ-ÿ'’-]*(?:\s+[A-ZÀ-ÖØ-Ý][\wÀ-ÿ'’-]*){0,5})"
    rf"(?:\s+[^.\n;:()]{{0,100}}?\s*[:,-]?\s*)"
    rf"(?P<count>{_NUMBER})\s*(?P<multiplier>ribu|juta|million|thousand)?\s*"
    r"(?:kasus|cases?|infeksi|infections?|pasien|patients?)\b",
    re.IGNORECASE | re.UNICODE,
)
_LOCATION_PARENS_CASE = re.compile(
    rf"(?P<location>[A-ZÀ-ÖØ-Ý][\wÀ-ÿ'’.-]*(?:\s+[A-ZÀ-ÖØ-Ý][\wÀ-ÿ'’.-]*){{0,5}})"
    rf"\s*\(\s*(?P<count>{_NUMBER})\s*(?P<multiplier>ribu|juta|million|thousand)?\s*(?:kasus|cases?)\s*\)",
    re.IGNORECASE | re.UNICODE,
)
_DEATH_NEAR_LOCATION = re.compile(
    rf"(?P<count>{_NUMBER})\s*(?P<multiplier>ribu|juta|million|thousand)?\s*"
    r"(?:kematian|deaths?|fatalities|meninggal(?: dunia)?)\s+(?:di|in)\s+"
    r"(?P<location>[A-ZÀ-ÖØ-Ý][\wÀ-ÿ'’.-]*(?:\s+[A-ZÀ-ÖØ-Ý][\wÀ-ÿ'’.-]*){0,5})",
    re.IGNORECASE | re.UNICODE,
)
_DEATH_WITH_LABEL = re.compile(
    rf"(?P<count>{_NUMBER})\s+[^.\n;:()]{{0,60}}?"
    r"(?:kematian|deaths?|fatalities|meninggal(?: dunia)?)\s+"
    r"(?:pada\s+[^.\n;:()]{0,40}?\s+)?(?:di|in)\s+"
    r"(?P<location>[A-ZÀ-ÖØ-Ý][\wÀ-ÿ'’-]*(?:\s+[A-ZÀ-ÖØ-Ý][\wÀ-ÿ'’-]*){0,5})",
    re.IGNORECASE | re.UNICODE,
)
_LOCATION_BEFORE_DEATH = re.compile(
    r"(?P<location>[A-ZÀ-ÖØ-Ý][\wÀ-ÿ'’-]*(?:\s+[A-ZÀ-ÖØ-Ý][\wÀ-ÿ'’-]*){0,5})"
    rf"(?:\s+[^.\n;:()]{{0,120}}?\s*[:,-]?\s*)"
    rf"(?P<count>{_NUMBER})\s*(?P<multiplier>ribu|juta|million|thousand)?\s*"
    r"(?:kematian|deaths?|fatalities|meninggal(?: dunia)?)\b",
    re.IGNORECASE | re.UNICODE,
)


def _number(raw: str, multiplier: str = "") -> int:
    value = (raw or "").strip().replace(" ", "")
    if re.fullmatch(r"\d{1,3}(?:[.,]\d{3})+", value):
        result = int(re.sub(r"[.,]", "", value))
    else:
        try:
            result = int(float(value.replace(",", ".")))
        except (TypeError, ValueError):
            return 0
    multiplier = (multiplier or "").lower()
    if multiplier in {"ribu", "thousand"}:
        result *= 1_000
    elif multiplier in {"juta", "million"}:
        result *= 1_000_000
    return max(0, result)


def _date_from_parts(day: str, month: str, year: str) -> Optional[date]:
    try:
        return date(int(year), MONTHS[month.lower()], int(day))
    except (KeyError, TypeError, ValueError):
        return None


_YEAR_TOKEN = re.compile(r"\b(20\d{2})\b")
_NAMED_RANGE = re.compile(
    r"(?P<day1>\d{1,2})\s+(?P<month1>[A-Za-z]+)\s*"
    r"(?:(?P<year1>20\d{2})\s*)?"
    r"(?:to|sampai|hingga|s/d|sd|[-–])\s*"
    r"(?P<day2>\d{1,2})\s+(?P<month2>[A-Za-z]+)\s+(?P<year2>20\d{2})",
    re.IGNORECASE,
)
_MONTH_RANGE = re.compile(
    r"(?P<month1>[A-Za-z]+)\s+(?:to|sampai|hingga|s/d|sd|[-–])\s+"
    r"(?P<month2>[A-Za-z]+)\s+(?P<year>20\d{2})",
    re.IGNORECASE,
)
_SEMESTER = re.compile(r"\bsemester\s*(?P<part>[12]|I{1,2})\s*(?P<year>20\d{2})\b", re.IGNORECASE)
_QUARTER = re.compile(
    r"\b(?:(?:triwulan|quarter|kuartal)\s*(?P<part>[1-4]|IV|III|II|I)|Q(?P<q>[1-4]))\s*(?P<year>20\d{2})\b",
    re.IGNORECASE,
)


def _year_frame(year: int) -> str:
    return f"{year:04d}-01-01 to {year:04d}-12-31"


def _roman_or_int(value: Optional[str]) -> Optional[int]:
    if not value:
        return None
    if value.isdigit():
        return int(value)
    return {"i": 1, "ii": 2, "iii": 3, "iv": 4}.get(value.casefold())


def _metric_context(text: str, start: int, end: int, radius: int = 220) -> str:
    """Return the nearest narrative clause around a metric occurrence."""

    source = text or ""
    left = max(0, start - radius)
    right = min(len(source), end + radius)
    for boundary in (".", "!", "?", ";", "\n"):
        left = max(left, source.rfind(boundary, left, start) + 1)
        boundary_index = source.find(boundary, end, right)
        if boundary_index >= 0:
            right = min(right, boundary_index)
    return source[left:right].strip()


def extract_time_frame(text: str, published_date: Optional[str] = None) -> str:
    value = re.sub(r"\s+", " ", text or "").strip()
    iso = re.search(r"(\d{4}-\d{2}-\d{2})\s*(?:to|sampai|hingga|-|–)\s*(\d{4}-\d{2}-\d{2})", value, re.I)
    if iso:
        return f"{iso.group(1)} to {iso.group(2)}"
    named = _NAMED_RANGE.search(value)
    if named:
        year = named.group("year2")
        start = _date_from_parts(named.group("day1"), named.group("month1"), named.group("year1") or year)
        end = _date_from_parts(named.group("day2"), named.group("month2"), year)
        if start and end:
            return f"{start.isoformat()} to {end.isoformat()}"
    month_range = _MONTH_RANGE.search(value)
    if month_range:
        first = MONTHS.get(month_range.group("month1").lower())
        last = MONTHS.get(month_range.group("month2").lower())
        if first and last:
            from calendar import monthrange
            year = int(month_range.group("year"))
            start_month, end_month = sorted((first, last))
            return f"{date(year, start_month, 1).isoformat()} to {date(year, end_month, monthrange(year, end_month)[1]).isoformat()}"
    semester = _SEMESTER.search(value)
    if semester:
        part = _roman_or_int(semester.group("part"))
        if part in {1, 2}:
            from calendar import monthrange
            year = int(semester.group("year"))
            start_month, end_month = ((1, 6), (7, 12))[part - 1]
            return f"{date(year, start_month, 1).isoformat()} to {date(year, end_month, monthrange(year, end_month)[1]).isoformat()}"
    quarter = _QUARTER.search(value)
    if quarter:
        part = _roman_or_int(quarter.group("part") or quarter.group("q"))
        if part in {1, 2, 3, 4}:
            from calendar import monthrange
            year = int(quarter.group("year"))
            start_month = (part - 1) * 3 + 1
            end_month = start_month + 2
            return f"{date(year, start_month, 1).isoformat()} to {date(year, end_month, monthrange(year, end_month)[1]).isoformat()}"
    year_only = re.search(
        r"\b(?:pada|di|tahun|year|in|during|throughout|sepanjang)\s+(?:tahun\s+)?(20\d{2})\b",
        value, re.I,
    )
    if year_only:
        return _year_frame(int(year_only.group(1)))
    weekly = re.findall(r"\b(?:weekly|minggu(?: ke-)?)\s*(?:M|ke-)?\s*(\d{1,2})\b", value, re.I)
    # If the article mentions different reporting weeks for different
    # countries, do not assign the first week to every metric relation.
    if len(set(weekly)) == 1:
        return f"Weekly M{weekly[0]}"
    if published_date:
        return published_date[:10]
    return ""


def _location_time_frame(text: str, location: LinkedLocation) -> str:
    """Bind a week marker to a location when the same sentence names it."""

    aliases = [location.name, location.country]
    aliases.extend(
        alias for alias, canonical in extractors.COUNTRY_ALIASES.items()
        if canonical.casefold() == location.country.casefold()
    )
    for match in re.finditer(
        r"\b(?:weekly|minggu(?:\s+ke-)?|week)\s*(?:M|ke-)?\s*(\d{1,2})\b",
        text or "", re.IGNORECASE,
    ):
        # Require the location to occur before the marker in the same short
        # evidence window. This prevents "sedangkan Indonesia ... M7" from
        # inheriting the earlier Singapore/Thailand M30 marker.
        evidence = text[max(0, match.start() - 60):match.start()]
        if any(re.search(rf"(?<!\w){re.escape(alias)}(?!\w)", evidence, re.IGNORECASE) for alias in aliases):
            return f"Weekly M{match.group(1)}"
    return ""


def _relation_time_frame(text: str, location: LinkedLocation, published_date: Optional[str]) -> str:
    """Prefer a location-bound week, then a document-wide explicit period."""

    # Publication date is article metadata, not proof that every metric was
    # reported on that date. Leave the frame empty when the article gives no
    # metric window rather than silently converting it to the publication day.
    return _location_time_frame(text, location) or extract_time_frame(text, None)


def _relation_time_frame_for_span(
    text: str,
    location: LinkedLocation,
    published_date: Optional[str],
    start: int,
    end: int,
) -> str:
    """Bind one metric to the closest explicit reporting period."""

    source = text or ""
    context = _metric_context(source, start, end)
    years = _YEAR_TOKEN.findall(context)
    local_frame = extract_time_frame(context, None)
    if local_frame and len(set(years)) <= 1:
        return local_frame

    nearby_years = list(_YEAR_TOKEN.finditer(source, max(0, start - 180), min(len(source), end + 180)))
    nearest_year = min(
        nearby_years,
        key=lambda item: min(abs(start - item.end()), abs(item.start() - end)),
        default=None,
    )
    year_after_metric = next(
        _YEAR_TOKEN.finditer(source, end, min(len(source), end + 100)),
        None,
    )
    named_ranges = list(_NAMED_RANGE.finditer(source))
    if year_after_metric and not any(
        match.group("year2") == year_after_metric.group(1)
        and match.end() >= start - 80
        for match in named_ranges
    ):
        return _year_frame(int(year_after_metric.group(1)))
    # Preserve a complete date range when the metric is close to its range,
    # but let a closer comparison year win for later historical clauses.
    for match in named_ranges:
        distance = min(abs(start - match.end()), abs(match.start() - end))
        range_year = match.group("year2")
        if distance <= 140 and (nearest_year is None or nearest_year.group(1) == range_year):
            frame = extract_time_frame(match.group(0), None)
            if frame:
                return frame

    # A single document-wide reporting range remains safe and preserves the
    # previous behavior for articles that place the period in their lead.
    all_years = set(_YEAR_TOKEN.findall(source))
    global_frame = extract_time_frame(source, None)
    if global_frame and len(all_years) <= 1:
        return global_frame

    if nearby_years:
        return _year_frame(int(nearest_year.group(1)))

    # Keep weekly/location behavior and the old single-period fallback.
    if len(set(_YEAR_TOKEN.findall(source))) <= 1:
        return _relation_time_frame(source, location, published_date)
    return _location_time_frame(source, location)


def _candidate_location(linker: GazetteerLinker, raw: str, text: str, start: int, end: int) -> Optional[LinkedLocation]:
    context = text[max(0, start - 100):min(len(text), end + 100)]
    # Regex capture can consume trailing conjunctions or metric words. Try
    # shorter prefixes until a gazetteer entity links successfully.
    words = raw.strip(" ,;:.-").split()
    for size in range(min(6, len(words)), 0, -1):
        candidate = " ".join(words[:size])
        linked = linker.link(candidate, context=context, evidence=text[max(0, start - 60):min(len(text), end + 100)])
        if linked:
            return linked
    # Regex spans can begin in a disease/connector phrase before the actual
    # place (e.g. "Subclade K Singapura" or "and Jawa Timur Thailand").
    # Try suffixes as well, but still require the same strict linker.
    for offset in range(1, len(words)):
        candidate = " ".join(words[offset:])
        linked = linker.link(candidate, context=context, evidence=text[max(0, start - 60):min(len(text), end + 100)])
        if linked:
            return linked
    return None


def _mentioned_locations(text: str, linker: GazetteerLinker) -> list[LinkedLocation]:
    """Collect validated province/country mentions for grouping context."""

    found: dict[tuple[str, str], LinkedLocation] = {}
    spans: list[tuple[int, int, LinkedLocation]] = []
    for start, end, linked in linker.local_mentions(text):
        context = text[max(0, start - 80):min(len(text), end + 80)]
        if not LOCATION_CUES.search(context):
            continue
        found[(linked.country.casefold(), linked.name.casefold())] = linked
        spans.append((start, end, linked))

    # Gazetteers often contain both a full administrative name and its tokens
    # (e.g. "Jawa Timur", "Jawa", "Timur"). Retain only the longest span at
    # an overlapping text position so aliases cannot leak into the UI.
    selected: list[tuple[int, int, LinkedLocation]] = []
    for start, end, linked in sorted(spans, key=lambda item: (item[0], -(item[1] - item[0]))):
        if any(start < other_end and end > other_start for other_start, other_end, _ in selected):
            continue
        selected.append((start, end, linked))
    selected_keys = {(item[2].country.casefold(), item[2].name.casefold()) for item in selected}
    return sorted(
        (found[key] for key in selected_keys),
        key=lambda item: next((start for start, _, candidate in selected if candidate == item), len(text or "")),
    )


_NARRATIVE_CASE = re.compile(
    rf"(?P<count>{_NUMBER})\s*(?P<multiplier>ribu|juta|million|thousand)?\s*"
    r"(?:new\s+)?(?:[A-Za-z][\w-]*\s+){0,3}"
    r"(?:kasus|cases?|infeksi|infections?|pasien|patients?)\b",
    re.IGNORECASE,
)
_NARRATIVE_DEATH = re.compile(
    rf"(?P<count>{_NUMBER})\s*(?P<multiplier>ribu|juta|million|thousand)?\s*"
    r"(?:[A-Za-z][\w-]*\s+){0,3}"
    r"(?:kematian|deaths?|fatalities|meninggal(?: dunia)?)\b",
    re.IGNORECASE,
)
_NON_CASE_NUMBER_CONTEXT = re.compile(
    r"(?:%|persen|percent|per\s+100|population|populasi|tempat\s+tidur|"
    r"bed(?:s)?|spesimen|specimen|swab|sampel|sample|dosis|dose|vaksin|vaccine)",
    re.IGNORECASE,
)


def _metric_is_valid(text: str, start: int, end: int) -> bool:
    """Reject numbers that look like rates, capacity, samples, or doses."""

    context = text[max(0, start - 32):min(len(text), end + 48)]
    return not _NON_CASE_NUMBER_CONTEXT.search(context)


def _location_spans(text: str, linker: GazetteerLinker) -> list[tuple[int, int, LinkedLocation]]:
    spans = linker.local_mentions(text)
    selected: list[tuple[int, int, LinkedLocation]] = []
    for item in sorted(spans, key=lambda value: (value[0], -(value[1] - value[0]))):
        if any(item[0] < end and item[1] > start for start, end, _ in selected):
            continue
        selected.append(item)
    return selected


def _nearest_location(
    metric_start: int,
    metric_end: int,
    locations: list[tuple[int, int, LinkedLocation]],
    max_distance: int = 260,
) -> Optional[LinkedLocation]:
    if not locations:
        return None
    candidate = min(
        locations,
        key=lambda item: min(abs(metric_start - item[1]), abs(item[0] - metric_end)),
    )
    distance = min(abs(metric_start - candidate[1]), abs(candidate[0] - metric_end))
    return candidate[2] if distance <= max_distance else None


def _upsert_relation(
    relations: dict[tuple[str, str, str], MetricRelation],
    relation: MetricRelation,
) -> None:
    key = (
        relation.location.country.casefold(),
        relation.location.name.casefold(),
        relation.time_frame,
    )
    current = relations.get(key)
    if not current:
        relations[key] = relation
        return
    if relation.cases > current.cases:
        current.cases = relation.cases
        current.evidence = relation.evidence or current.evidence
    if relation.deaths is not None:
        current.deaths = max(current.deaths or 0, relation.deaths)


def _extract_narrative_relations(
    text: str,
    linker: GazetteerLinker,
    published_date: Optional[str],
) -> list[MetricRelation]:
    """Recover implicit-location comparisons such as ``2025 ... 614,601``."""

    locations = _location_spans(text or "", linker)
    relations: dict[tuple[str, str, str], MetricRelation] = {}
    for pattern, metric_name in ((_NARRATIVE_CASE, "cases"), (_NARRATIVE_DEATH, "deaths")):
        for match in pattern.finditer(text or ""):
            if not _metric_is_valid(text, match.start("count"), match.end()):
                continue
            linked = _nearest_location(match.start(), match.end(), locations)
            if not linked:
                continue
            frame = _relation_time_frame_for_span(
                text, linked, published_date, match.start(), match.end()
            )
            evidence = _metric_context(text, match.start(), match.end(), radius=180)
            relation = MetricRelation(
                location=linked,
                cases=_number(match.group("count"), match.groupdict().get("multiplier", "")) if metric_name == "cases" else 0,
                deaths=_number(match.group("count"), match.groupdict().get("multiplier", "")) if metric_name == "deaths" else None,
                time_frame=frame,
                evidence=evidence,
            )
            _upsert_relation(relations, relation)
    return list(relations.values())


def extract_metric_relations(
    text: str,
    linker: Optional[GazetteerLinker] = None,
    published_date: Optional[str] = None,
) -> list[MetricRelation]:
    """Extract explicit location↔metric relations from local evidence windows."""

    linker = linker or GazetteerLinker()
    relations: dict[tuple[str, str, str], MetricRelation] = {}

    patterns = (_LOCATION_PARENS_CASE, _CASE_BEFORE_LOCATION, _LOCATION_BEFORE_CASE)
    for pattern in patterns:
        for match in pattern.finditer(text or ""):
            raw_location = match.group("location")
            linked = _candidate_location(linker, raw_location, text, match.start("location"), match.end("location"))
            if not linked:
                continue
            count = _number(match.group("count"), match.groupdict().get("multiplier", ""))
            if not _metric_is_valid(text, match.start("count"), match.end()):
                continue
            frame = _relation_time_frame_for_span(
                text, linked, published_date, match.start("count"), match.end("count")
            )
            _upsert_relation(relations, MetricRelation(
                location=linked, cases=count,
                time_frame=frame, evidence=match.group(0).strip(),
            ))

    for pattern in (_DEATH_NEAR_LOCATION, _DEATH_WITH_LABEL, _LOCATION_BEFORE_DEATH):
        for match in pattern.finditer(text or ""):
            linked = _candidate_location(linker, match.group("location"), text, match.start("location"), match.end("location"))
            if not linked:
                continue
            death_count = _number(match.group("count"), match.groupdict().get("multiplier", ""))
            if not _metric_is_valid(text, match.start("count"), match.end()):
                continue
            frame = _relation_time_frame_for_span(
                text, linked, published_date, match.start("count"), match.end("count")
            )
            _upsert_relation(relations, MetricRelation(
                location=linked, deaths=death_count,
                time_frame=frame, evidence=match.group(0).strip(),
            ))

    # The deterministic location patterns intentionally require a nearby
    # place. This second pass handles common narrative shorthand where the
    # country is named once and subsequent comparison values omit it.
    narrative_count = len(_NARRATIVE_CASE.findall(text or "")) + len(_NARRATIVE_DEATH.findall(text or ""))
    if not relations or narrative_count > len(relations):
        for relation in _extract_narrative_relations(text or "", linker, published_date):
            _upsert_relation(relations, relation)

    # Optional NER contributes only locations; it is not allowed to invent a
    # metric. This improves coverage for province grouping without weakening
    # the relation rule above.
    for raw, context in _spacy_candidates(text or ""):
        linked = linker.link(raw, context=context)
        if linked and not any(r.location.name.casefold() == linked.name.casefold() for r in relations.values()):
            continue
    return list(relations.values())


# ---------------------------------------------------------------------------
# LLM supplement and final projection
# ---------------------------------------------------------------------------


def _llm_relations(text: str) -> list[RawLLMRelation]:
    if not config.AGENT_ENABLED or os.getenv("SURVEILLANCE_LLM_RELATIONS", "true").lower() not in {"1", "true", "yes", "on"}:
        return []
    try:
        from .agent import chat_json
        result = chat_json(
            "You extract epidemiological relations. Return JSON only.",
            "Extract every explicit country/province-to-cases/deaths relation. "
            "Never use an unrelated number. Preserve the exact evidence and time "
            "window. Return {relations:[{location,country,cases,deaths,time_frame,evidence}]} .\n"
            + json.dumps((text or "")[:9000], ensure_ascii=False),
            max_tokens=1800,
        )
        return [RawLLMRelation.model_validate(item) for item in (result.get("relations") or []) if isinstance(item, dict)]
    except Exception as exc:
        logger.info("Structured relation LLM supplement unavailable: %s", exc)
        return []


def _should_use_llm_relations(text: str, relations: list[MetricRelation], mentioned_locations: list[LinkedLocation]) -> bool:
    """Call the relation agent only when deterministic extraction is incomplete."""
    if len(relations) >= 2:
        return False
    metric_mentions = re.findall(
        r"\b\d[\d.,]*\s+(?:cases?|kasus|deaths?|kematian|patients?|pasien)\b",
        text or "",
        flags=re.IGNORECASE,
    )
    if not metric_mentions:
        return False
    names = {item.name.casefold() for item in mentioned_locations if item.name}
    names.update(item.location.name.casefold() for item in relations if item.location.name)
    folded = (text or "").casefold()
    for hint in (
        "indonesia", "singapore", "singapura", "malaysia", "thailand",
        "vietnam", "viet nam", "cambodia", "kamboja", "philippines",
        "filipina", "myanmar", "laos", "brunei", "timor-leste",
    ):
        if hint in folded:
            names.add(hint)
    return len(names) >= 2 or (not relations and len(metric_mentions) >= 2)


def _published_date(value: Optional[str], text: str) -> Optional[str]:
    # Kept as a compatibility wrapper; body dates belong to event_date.
    return normalize_publication_date(value)


def _disease_labels(text: str, diseases: Optional[list[str]] = None) -> list[str]:
    values = list(diseases or [])
    if not values:
        values = extractors.extract_diseases(text or "")
    variant_match = re.search(
        r"\bInfluenza\s+A\s*\([^)]{2,12}\)(?:\s+Subclade\s+[A-Za-z0-9-]+)?",
        text or "", re.IGNORECASE,
    )
    if variant_match:
        values.insert(0, variant_match.group(0).strip())
    # Keep the strict projection useful before the optional DB-backed disease
    # dictionary has finished loading (for example during a cold-start test).
    common_terms = (
        (r"\bcovid(?:-19)?\b|\bcoronavirus\b", "COVID-19"),
        (r"\b(?:dengue|dbd|demam berdarah)\b", "Dengue"),
        (r"\b(?:influenza|flu)\b", "Influenza"),
        (r"\b(?:mpox|monkeypox)\b", "Mpox"),
        (r"\b(?:malaria)\b", "Malaria"),
        (r"\b(?:measles|campak)\b", "Measles"),
        (r"\b(?:cholera|kolera)\b", "Cholera"),
        (r"\b(?:stroke|cerebrovascular\s+(?:accident|disease))\b|\b(?:đột\s+quỵ|dot\s+quy)\b", "Stroke"),
    )
    for pattern, label in common_terms:
        if re.search(pattern, text or "", re.IGNORECASE):
            values.append(label)
    aliases = {
        "dbd": "Dengue", "demam berdarah": "Dengue", "coronavirus": "COVID-19",
        "covid": "COVID-19", "bird flu": "Avian influenza", "influenza": "Influenza",
        "đột quỵ": "Stroke", "dot quy": "Stroke",
    }
    normalized = []
    for value in values:
        label = str(value).strip()
        if not label or label.upper() == "UNKNOWN":
            continue
        normalized_label = aliases.get(label.casefold(), label)
        normalized.append(extractors.canonical_disease_name(normalized_label))
    result = list(dict.fromkeys(normalized))
    # A named strain/subclade is more useful and more precise than a second
    # generic "Influenza" label for the same article.
    if variant_match:
        variant = variant_match.group(0).strip()
        return [variant]
    return result


def decide_alert(
    text: str,
    relations: list[MetricRelation],
    disease_labels: list[str],
) -> tuple[bool, str, str]:
    """Return (alert, relevance, signal) using local and regional evidence."""

    lower = (text or "").lower()
    official_advisory = bool(re.search(
        r"surat edaran|surat keputusan|official advisory|health advisory|"
        r"kementerian kesehatan|kementerian kesihatan|minister(?:y)? of health|"
        r"who recommends|cdc advises|public health notice",
        lower,
    ))
    regional_spike = any(
        r.location.country in config.ASEAN_COUNTRIES and r.cases >= int(os.getenv("REGIONAL_SPIKE_CASE_THRESHOLD", "65000"))
        for r in relations
    )
    explicit = extractors.is_explicit_outbreak_report(text)
    deaths = sum(r.deaths or 0 for r in relations)
    max_cases = max((r.cases for r in relations), default=0)
    disease_known = bool(disease_labels)
    multi_country_deaths = len({r.location.country for r in relations}) >= 2 and deaths > 0
    local_threshold = int(os.getenv("LOCAL_OUTBREAK_CASE_THRESHOLD", "25"))
    alert = bool(disease_known and (
        regional_spike or official_advisory or multi_country_deaths
        or (explicit and (max_cases >= local_threshold or deaths > 0))
    ))
    if alert:
        return True, "High", "Disease Outbreak"
    health_related = disease_known or bool(re.search(r"\b(?:kasus|cases?|wabah|outbreak|kesehatan|health|penyakit|disease|virus)\b", lower))
    if health_related and (relations or official_advisory):
        if len({r.location.country for r in relations}) >= 2 or deaths > 0:
            return False, "High", "Disease Outbreak"
        return False, "Medium", "Disease Outbreak" if (relations or explicit) else "Health Event"
    return False, "Low", "Health Event" if health_related else "Other"


def _period_year(time_frame: str, published_date: Optional[str] = None) -> Optional[int]:
    match = _YEAR_TOKEN.search(time_frame or "")
    if match:
        return int(match.group(1))
    if published_date:
        match = _YEAR_TOKEN.match(published_date[:4])
        if match:
            return int(match.group(1))
    return None


def _period_sort_key(time_frame: str) -> tuple[int, str, str]:
    years = _YEAR_TOKEN.findall(time_frame or "")
    year = int(years[-1]) if years else 0
    iso_dates = re.findall(r"20\d{2}-\d{2}-\d{2}", time_frame or "")
    return year, (iso_dates[-1] if iso_dates else ""), time_frame or ""


def _period_identity(relation: MetricRelation, published_date: Optional[str]) -> tuple[Optional[int], str]:
    return _period_year(relation.time_frame, published_date), relation.time_frame or ""


def _select_primary_period(
    relations: list[MetricRelation],
    published_date: Optional[str],
) -> tuple[list[MetricRelation], Optional[int], str]:
    """Select the newest observed period without mixing historical values."""

    publication_year = _period_year("", published_date)
    relation_years = {_period_year(item.time_frame) for item in relations if _period_year(item.time_frame)}
    target_year = publication_year if publication_year in relation_years or not relation_years else max(relation_years)
    if target_year is None:
        return relations, None, ""
    same_year = [item for item in relations if _period_year(item.time_frame, published_date) == target_year]
    if not same_year:
        same_year = relations
    frames = {item.time_frame for item in same_year if item.time_frame}
    selected_frame = max(frames, key=_period_sort_key) if frames else ""
    if selected_frame:
        same_year = [item for item in same_year if item.time_frame == selected_frame]
    return same_year, target_year, selected_frame


def _project_period(
    country: str,
    relations: list[MetricRelation],
    published_date: Optional[str],
) -> tuple[SurveillanceLocation, list[MetricRelation], list[HistoricalComparison]]:
    primary, _, primary_frame = _select_primary_period(relations, published_date)
    country_level = [item for item in primary if item.location.name.casefold() == country.casefold()]
    subnational_level = [item for item in primary if item.location.is_province or item.location.is_city]
    province_level = [item for item in subnational_level if item.location.is_province]
    city_level = [item for item in subnational_level if item.location.is_city]
    if country_level:
        # A country total is authoritative over its province breakdown.
        selected_case = max((item.cases for item in country_level), default=0)
        death_values = [item.deaths for item in country_level if item.deaths is not None]
        selected_deaths = max(death_values) if death_values else None
        selected_provinces = [item.location.name for item in province_level]
        selected_cities = [item.location.name for item in city_level]
    else:
        selected_case = sum(item.cases for item in subnational_level)
        death_values = [item.deaths for item in subnational_level if item.deaths is not None]
        selected_deaths = sum(death_values) if death_values else None
        selected_provinces = [item.location.name for item in province_level]
        selected_cities = [item.location.name for item in city_level]

    primary_ids = {id(item) for item in primary}
    historical_groups: dict[tuple[Optional[int], str], list[MetricRelation]] = {}
    for item in relations:
        if id(item) in primary_ids:
            continue
        historical_groups.setdefault(_period_identity(item, published_date), []).append(item)
    historical: list[HistoricalComparison] = []
    for (year, frame), period_relations in sorted(
        historical_groups.items(), key=lambda item: (item[0][0] or 0, _period_sort_key(item[0][1])), reverse=True
    ):
        country_total = [item for item in period_relations if item.location.name.casefold() == country.casefold()]
        subnational = [item for item in period_relations if item.location.is_province or item.location.is_city]
        provinces = [item for item in subnational if item.location.is_province]
        cities = [item for item in subnational if item.location.is_city]
        source = country_total or subnational
        if country_total:
            cases = max((item.cases for item in source), default=0)
            death_values = [item.deaths for item in source if item.deaths is not None]
            deaths = max(death_values) if death_values else None
        else:
            cases = sum(item.cases for item in source)
            death_values = [item.deaths for item in source if item.deaths is not None]
            deaths = sum(death_values) if death_values else None
        historical.append(HistoricalComparison(
            country=country,
            provinces=list(dict.fromkeys(item.location.name for item in provinces)),
            cities=list(dict.fromkeys(item.location.name for item in cities)),
            reported_cases=cases,
            deaths=deaths,
            time_frame=frame or (_year_frame(year) if year else ""),
            year=year,
            evidence=next((item.evidence for item in source if item.evidence), ""),
        ))

    frame = primary_frame or next((item.time_frame for item in primary if item.time_frame), "")
    areas = [SurveillanceArea(
        name=item.location.name,
        country=item.location.country,
        reported_cases=item.cases,
        deaths=item.deaths,
        time_frame=item.time_frame,
        latitude=item.location.latitude,
        longitude=item.location.longitude,
    ) for item in subnational_level]
    location = SurveillanceLocation(
        country=country,
        provinces=list(dict.fromkeys(selected_provinces)),
        cities=list(dict.fromkeys(selected_cities)),
        areas=areas,
        reported_cases=selected_case,
        deaths=selected_deaths,
        time_frame=frame,
    )
    return location, primary, historical


def build_surveillance_output(
    text: str,
    *,
    published_at: Optional[str] = None,
    diseases: Optional[list[str]] = None,
    source_name: Optional[str] = None,
    source_type: Optional[str] = None,
    source_url: Optional[str] = None,
    linker: Optional[GazetteerLinker] = None,
    include_llm: bool = True,
) -> SurveillanceOutput:
    """Build the strict output from an article, preserving country relations."""

    linker = linker or GazetteerLinker()
    published_date = _published_date(published_at, text)
    event_date = extract_event_date(text)
    typed_counts = extract_labeled_counts(text)
    relations = extract_metric_relations(text, linker=linker, published_date=published_date)
    mentioned_locations = _mentioned_locations(text, linker)

    # LLM relations are supplements only. They must resolve to the same local
    # gazetteer, and they can never overwrite a stronger deterministic count.
    use_llm_relations = include_llm and _should_use_llm_relations(text, relations, mentioned_locations)
    for candidate in (_llm_relations(text) if use_llm_relations else []):
        linked = linker.link(candidate.location, context=candidate.evidence or text, evidence=candidate.evidence)
        if not linked:
            continue
        frame = candidate.time_frame or extract_time_frame(text, None)
        key = (linked.country.casefold(), linked.name.casefold(), frame)
        existing = next((r for r in relations if (r.location.country.casefold(), r.location.name.casefold(), r.time_frame) == key), None)
        if existing:
            existing.cases = max(existing.cases, candidate.cases)
            existing.deaths = max(existing.deaths or 0, candidate.deaths or 0) or None
        else:
            relations.append(MetricRelation(linked, candidate.cases, candidate.deaths, frame, candidate.evidence))

    labels = _disease_labels(text, diseases)
    grouped: dict[str, list[MetricRelation]] = {}
    for relation in relations:
        grouped.setdefault(relation.location.country, []).append(relation)

    output_locations: list[SurveillanceLocation] = []
    historical_comparisons: list[HistoricalComparison] = []
    primary_relations: list[MetricRelation] = []
    for country, country_relations in grouped.items():
        mentioned_provinces = [
            item.name for item in mentioned_locations
            if item.country.casefold() == country.casefold() and item.is_province
        ]
        location, selected_relations, historical = _project_period(country, country_relations, published_date)
        location.provinces = list(dict.fromkeys([*mentioned_provinces, *location.provinces]))
        location.cities = list(dict.fromkeys(
            item.name for item in mentioned_locations
            if item.country.casefold() == country.casefold()
            and item.is_city
            and item.name.casefold() != country.casefold()
        ))
        output_locations.append(location)
        primary_relations.extend(selected_relations)
        historical_comparisons.extend(historical)

    # Alerting must use the same current-period projection as the dashboard;
    # a large historical comparison must not create a current outbreak alert.
    alert, relevance, signal = decide_alert(text, primary_relations, labels)

    health_related = bool(labels or relations or re.search(
        r"\b(?:kasus|cases?|wabah|outbreak|kesehatan|health|penyakit|disease|virus|patient|pasien)\b", text or "", re.I
    ))
    if signal == "Other":
        signal = "Health Event" if health_related else "Other"
    return SurveillanceOutput(
        disease_classification=labels,
        published_date=published_date,
        publication_date=published_date,
        event_date=event_date,
        confirmed_cases=typed_counts["confirmed_cases"],
        suspected_cases=typed_counts["suspected_cases"],
        hospitalizations=typed_counts["hospitalizations"],
        evidence=evidence_sentences(text),
        locations=output_locations,
        historical_comparisons=historical_comparisons,
        signal_type=signal,
        health_relevance=relevance,
        outbreak_alert=alert,
        source_reliability_score=source_reliability_score(source_name, source_type, source_url),
        health_related=health_related,
    )
