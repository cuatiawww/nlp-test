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
from .multilingual import metric_term_pattern, normalize_local_digits
from .epidemiology import (
    evidence_sentences,
    extract_event_date,
    extract_event_period,
    extract_labeled_counts,
    normalize_publication_date,
)

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


def surveillance_from_analysis(analysis: Any) -> SurveillanceOutput:
    """Adapt the shared ``pipeline.run`` response to the matrix contract.

    This function is intentionally a serialization adapter. It does not
    detect language, extract entities, attach metrics, or make event
    decisions. Those decisions must already be present in ``sub_events``
    and the parent response produced by the shared NLP pipeline.
    """

    if hasattr(analysis, "model_dump"):
        data = analysis.model_dump()
    elif isinstance(analysis, dict):
        data = dict(analysis)
    else:
        raise TypeError("analysis must be an AnalyzeResponse or mapping")

    def text(value: Any) -> str:
        return str(value or "").strip()

    def integer(value: Any) -> int:
        try:
            return max(0, int(value or 0))
        except (TypeError, ValueError):
            return 0

    def date_value(value: Any) -> Optional[str]:
        match = re.search(r"\d{4}-\d{2}-\d{2}", text(value))
        return match.group(0) if match else None

    def event_country(event: dict[str, Any]) -> str:
        return text(event.get("country")) or text(data.get("country"))

    def event_location(event: dict[str, Any], country: str) -> str:
        return text(event.get("location_name")) or country

    events = [item for item in (data.get("sub_events") or []) if isinstance(item, dict)]
    locations = [item for item in (data.get("locations") or []) if isinstance(item, dict)]

    # A country-level event is authoritative for its disease and prevents an
    # aggregate plus regional breakdown from being summed twice. Different
    # diseases remain separate and are summed at the country contract level.
    grouped: dict[str, list[dict[str, Any]]] = {}
    for event in events:
        country = event_country(event)
        if country:
            grouped.setdefault(country.casefold(), []).append(event)

    for item in locations:
        country = text(item.get("country")) or text(data.get("country"))
        if country:
            grouped.setdefault(country.casefold(), [])

    primary_country = text(data.get("country"))
    if primary_country:
        grouped.setdefault(primary_country.casefold(), [])

    output_locations: list[SurveillanceLocation] = []
    for country_key, country_events in grouped.items():
        country = next(
            (event_country(item) for item in country_events if event_country(item)),
            next((text(item.get("country")) for item in locations
                  if text(item.get("country")).casefold() == country_key), country_key),
        )
        country_diseases = {
            text(item.get("disease")).casefold()
            for item in country_events
            if text(item.get("disease")) and text(item.get("disease")).casefold() != "unknown"
        }

        selected_events: list[dict[str, Any]] = []
        for disease_key in country_diseases or {""}:
            disease_events = [
                item for item in country_events
                if text(item.get("disease")).casefold() == disease_key
            ]
            country_level = [
                item for item in disease_events
                if event_location(item, country).casefold() == country.casefold()
            ]
            selected_events.extend(country_level or disease_events)

        # If no disease was attached to an event, retain the event rather than
        # dropping a valid metric from the legacy surveillance contract.
        if not selected_events and country_events:
            selected_events = list(country_events)

        cases = sum(integer(item.get("case_count")) for item in selected_events)
        death_values = [integer(item.get("death_count")) for item in selected_events]
        deaths: Optional[int] = sum(death_values) if any(death_values) else None

        # The parent scalar is the fallback for a single-country response when
        # the event composer has no metric-bearing child, and for a country
        # aggregate that is larger than its regional children.
        if country.casefold() == primary_country.casefold() or len(grouped) == 1:
            cases = max(cases, 0 if data.get("case_count_unknown") else integer(data.get("case_count")))
            parent_deaths = integer(data.get("death_count"))
            if parent_deaths:
                deaths = max(deaths or 0, parent_deaths)

        time_frame = next(
            (text(item.get("time_frame")) for item in selected_events if text(item.get("time_frame"))),
            text(data.get("event_date")),
        )
        areas: list[SurveillanceArea] = []
        provinces: list[str] = []
        cities: list[str] = []
        seen_area: set[tuple[str, str]] = set()
        for event in country_events:
            name = event_location(event, country)
            if not name or name.casefold() == country.casefold():
                continue
            key = (name.casefold(), text(event.get("disease")).casefold())
            if key in seen_area:
                continue
            seen_area.add(key)
            admin1 = text(event.get("admin1"))
            admin2 = text(event.get("admin2"))
            if admin1:
                provinces.append(admin1)
            else:
                provinces.append(name)
            if admin2:
                cities.append(admin2)
            areas.append(SurveillanceArea(
                name=name,
                country=country,
                reported_cases=integer(event.get("case_count")),
                deaths=integer(event.get("death_count")) or None,
                time_frame=text(event.get("time_frame")) or time_frame,
                latitude=event.get("latitude"),
                longitude=event.get("longitude"),
            ))

        for item in locations:
            if text(item.get("country")).casefold() != country.casefold():
                continue
            name = text(item.get("name"))
            if not name or name.casefold() == country.casefold():
                continue
            admin1 = text(item.get("admin1"))
            admin2 = text(item.get("admin2"))
            provinces.append(admin1 or name)
            if admin2:
                cities.append(admin2)

        output_locations.append(SurveillanceLocation(
            country=country,
            provinces=list(dict.fromkeys(provinces)),
            cities=list(dict.fromkeys(cities)),
            areas=areas,
            reported_cases=cases,
            deaths=deaths,
            time_frame=time_frame,
        ))

    relevance = text(data.get("relevance_score")) or "medium"
    signal = text(data.get("event_category")) or "Disease Outbreak"
    classification = data.get("disease_classification")
    if isinstance(classification, list):
        disease_labels = classification
    elif text(classification):
        disease_labels = [text(classification)]
    else:
        disease_labels = list(data.get("disease_extracted") or [])
    for event in events:
        label = text(event.get("disease"))
        if label and label.casefold() != "unknown" and label.casefold() not in {
            text(item).casefold() for item in disease_labels
        }:
            disease_labels.append(label)
    return SurveillanceOutput(
        disease_classification=disease_labels,
        published_date=date_value(data.get("published_date") or data.get("published_at")),
        publication_date=date_value(data.get("publication_date") or data.get("published_date")),
        event_date=date_value(data.get("event_date")),
        confirmed_cases=data.get("confirmed_cases"),
        suspected_cases=data.get("suspected_cases"),
        hospitalizations=data.get("hospitalizations"),
        evidence=list(data.get("evidence") or []),
        locations=output_locations,
        historical_comparisons=[],
        signal_type=signal,
        health_relevance=relevance,
        outbreak_alert=bool(data.get("outbreak_alert")),
        source_reliability_score=float(
            data.get("source_reliability_score", data.get("source_credibility", 0.5)) or 0.5
        ),
        health_related=bool(data.get("is_health_related", True)),
    )


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
    "jumlah", "angka", "periode", "minggu", "weekly", "sepanjang",
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

    _SHARED_FOLDED_COORDS: Optional[dict[str, str]] = None
    _SHARED_MENTION_PATTERN: Optional[re.Pattern] = None
    _SHARED_COORDS_ID: Optional[int] = None
    _SHARED_ALIASES_ID: Optional[int] = None

    def __init__(
        self,
        coords: Optional[dict[str, tuple[float, float]]] = None,
        countries: Optional[dict[str, str]] = None,
        geocoder: Optional[Geocoder] = None,
        allow_remote: Optional[bool] = None,
    ):
        is_default = (coords is None and countries is None)
        if is_default and len(config.LOCATION_COORDS) <= 3:
            config.ensure_location_registry_loaded()
        self.coords = coords if coords is not None else config.LOCATION_COORDS
        self.countries = countries if countries is not None else config.LOCATION_COUNTRIES
        current_aliases = getattr(config, "LOCATION_ALIASES", None)
        cur_sig = (
            id(self.coords),
            len(self.coords),
            id(current_aliases),
            len(current_aliases or {}),
            id(self.countries),
            len(self.countries or {}),
        )
        if (
            is_default
            and GazetteerLinker._SHARED_FOLDED_COORDS is not None
            and getattr(GazetteerLinker, "_SHARED_SIG", None) == cur_sig
        ):
            self._folded_coords = GazetteerLinker._SHARED_FOLDED_COORDS
            self._mention_pattern = GazetteerLinker._SHARED_MENTION_PATTERN
            self.geocoder = geocoder or NominatimGeocoder()
            self.allow_remote = (
                os.getenv("SURVEILLANCE_GEOCODER_ENABLED", "false").lower() in {"1", "true", "yes", "on"}
                if allow_remote is None else allow_remote
            )
            return
        # The old linker compared every candidate against every gazetteer row.
        # Build one folded index and one matcher per linker so article length
        # does not multiply gazetteer work.
        self._folded_coords: dict[str, str] = {}
        for name in self.coords:
            folded = extractors._fold_location_text(name)
            if folded and folded not in self._folded_coords:
                self._folded_coords[folded] = name
        for alias, canonical in getattr(config, "LOCATION_ALIASES", {}).items():
            folded_alias = extractors._fold_location_text(alias)
            if folded_alias and folded_alias not in self._folded_coords:
                self._folded_coords[folded_alias] = canonical
        all_names = set(self.coords.keys())
        all_names.update(getattr(config, "LOCATION_ALIASES", {}).keys())
        # Country aliases live in the extractor vocabulary as well as the
        # database-loaded location aliases. Include both so native mentions
        # such as ``ລາວ`` and ``ສປປ ລາວ`` can enter the same linker path.
        all_names.update(getattr(extractors, "COUNTRY_ALIASES", {}).keys())
        for alias, canonical in getattr(extractors, "COUNTRY_ALIASES", {}).items():
            folded_alias = extractors._fold_location_text(alias)
            if folded_alias and folded_alias not in self._folded_coords and (canonical in self.coords or canonical in self.countries):
                self._folded_coords[folded_alias] = canonical
        for name in self.countries:
            folded_name = extractors._fold_location_text(name)
            if folded_name and folded_name not in self._folded_coords:
                self._folded_coords[folded_name] = name
        for country in config.ASEAN_COUNTRIES:
            folded_country = extractors._fold_location_text(country)
            if folded_country and folded_country not in self._folded_coords:
                self._folded_coords[folded_country] = country
        all_names.update(self.countries.keys())
        all_names.update(config.ASEAN_COUNTRIES)
        names = sorted(all_names, key=len, reverse=True)
        native_names = [name for name in names if extractors._is_native_script(name)]
        latin_names = [name for name in names if name not in native_names]
        native_pattern = "|".join(re.escape(name) for name in native_names)
        latin_pattern = "|".join(re.escape(name) for name in latin_names)
        alternatives = []
        if native_pattern:
            # Thai/Lao/Khmer/Myanmar do not use whitespace word boundaries.
            alternatives.append(rf"(?:{native_pattern})")
        if latin_pattern:
            alternatives.append(rf"(?<!\w)(?:{latin_pattern})(?!\w)")
        self._mention_pattern = (
            re.compile(
                "|".join(alternatives),
                re.IGNORECASE,
            )
            if alternatives else None
        )
        if is_default:
            GazetteerLinker._SHARED_FOLDED_COORDS = self._folded_coords
            GazetteerLinker._SHARED_MENTION_PATTERN = self._mention_pattern
            GazetteerLinker._SHARED_SIG = cur_sig
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
        # O(1) lookup via pre-built folded index (covers aliases + coords)
        folded_idx = getattr(config, "FOLDED_LOCATION_INDEX", {})
        hit = folded_idx.get(folded) or self._folded_coords.get(folded)
        if not hit:
            cf = value.strip().casefold()
            hit = folded_idx.get(cf) or self._folded_coords.get(cf)
        if not hit:
            country_aliases = extractors.get_folded_country_aliases()
            hit = country_aliases.get(folded) or country_aliases.get(value.strip().casefold()) or self.countries.get(value.strip())
        if hit:
            if hit.casefold() in NON_GEOGRAPHIC_TERMS:
                return None
            return hit
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


def _country_level_location(
    country: str,
    linker: GazetteerLinker,
    context: str = "",
    evidence: str = "",
) -> Optional[LinkedLocation]:
    """Resolve a country scope without requiring a subnational gazetteer hit."""

    normalized = extractors.normalize_country(country)
    if not normalized:
        return None
    linked = linker.link(normalized, context=context, evidence=evidence)
    if linked:
        return linked
    coords = config.LOCATION_COORDS.get(normalized, (None, None))
    return LinkedLocation(
        name=normalized,
        country=normalized,
        latitude=coords[0],
        longitude=coords[1],
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
    disease: Optional[str] = None
    metric_type: str = "cases"
    unit: str = "persons"
    qualifier: Optional[str] = None
    value: Optional[float] = None
    value_min: Optional[float] = None
    value_max: Optional[float] = None
    evidence_offset_start: Optional[int] = None
    evidence_offset_end: Optional[int] = None
    source_sentence_id: Optional[str] = None
    country_scope: Optional[str] = None


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


# Month aliases are loaded from the shared language_markers registry.
# Numeric month grammar remains handled by the date parser.
def _is_comparative_location(text: str, loc_start: int) -> bool:
    """Returns True if the location at loc_start is inside a comparative clause,
    e.g. 'setelah Jawa Barat, Jawa Tengah, dan Jawa Timur'."""
    prefix = text[max(0, loc_start - 120):loc_start]
    comp_match = re.search(
        r"\b(?:setelah|sesudah|dibandingkan(?:\s+dengan)?|dibanding|daripada|seperti|antara\s+lain|misalnya|after|following|behind|compared\s+(?:to|with))\s+([^.;\n]*)$",
        prefix,
        re.IGNORECASE,
    )
    if comp_match:
        intervening = comp_match.group(1).strip()
        if re.fullmatch(r"(?:[A-Za-zÀ-ÿ'’.-]+\s*[,/&]?\s*|(?:dan|atau|serta|and|or)\s+)*", intervening, re.IGNORECASE):
            return True
    return False


_NUMBER = r"(?:\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)"


def _runtime_relation_patterns() -> dict[str, tuple[re.Pattern[str], ...]]:
    """Build legacy location relations from the active DB lexicon."""

    case_term = metric_term_pattern(tuple(config.get_lexicon_terms("metric_case")))
    death_term = metric_term_pattern(tuple(config.get_lexicon_terms("metric_death")))
    number = extractors._runtime_number_word_pattern()
    magnitude_term = metric_term_pattern(tuple(config.get_lexicon_terms("metric_magnitude")))
    magnitude_group = rf"(?P<multiplier>{magnitude_term})?"
    # The surrounding patterns are case-insensitive for metric vocabulary,
    # but locality starts must remain title-cased. Otherwise ``Thailand
    # reported 12 cases`` is captured as the fake locality ``Thailand
    # reported`` and cannot be linked to the country.
    location = r"(?P<location>(?-i:[A-ZÀ-ÖØ-Ý])[\wÀ-ÿ'’-]*(?:\s+(?-i:[A-ZÀ-ÖØ-Ý])[\wÀ-ÿ'’-]*){0,5})"
    location_dotted = r"(?P<location>(?-i:[A-ZÀ-ÖØ-Ý])[\wÀ-ÿ'’.-]*(?:\s+(?-i:[A-ZÀ-ÖØ-Ý])[\wÀ-ÿ'’.-]*){0,5})"
    return {
        "cases": (
            re.compile(
                rf"(?<![\w.,])(?P<count>{number})(?![\w])\s*{magnitude_group}\s*"
                rf"{case_term}\s+(?:[\w\u0E00-\u0EFF\u1000-\u109F\u1780-\u17FF-]+\s+){{0,4}}"
                rf"(?:di|in|from|among)\s+(?:provinsi\s+|prov\.\s+|kabupaten\s+|kab\.\s+|kota\s+)?{location}",
                re.IGNORECASE | re.UNICODE,
            ),
            re.compile(
                rf"{location}(?:\s+[^.\n;:()]{{0,100}}?\s*[:,-]?\s*)"
                rf"(?P<count>{number})\s*{magnitude_group}\s*{case_term}\b",
                re.IGNORECASE | re.UNICODE,
            ),
            re.compile(
                rf"{location_dotted}\s*\(\s*(?P<count>{number})\s*{magnitude_group}\s*{case_term}\s*\)",
                re.IGNORECASE | re.UNICODE,
            ),
        ),
        "deaths": (
            re.compile(
                rf"(?P<count>{number})\s*{magnitude_group}\s*{death_term}\s+(?:di|in)\s+{location_dotted}",
                re.IGNORECASE | re.UNICODE,
            ),
            re.compile(
                rf"(?P<count>{number})\s+[^.\n;:()]{{0,60}}?{death_term}\s+"
                rf"(?:pada\s+[^.\n;:()]{{0,40}}?\s+)?(?:di|in)\s+{location}",
                re.IGNORECASE | re.UNICODE,
            ),
            re.compile(
                rf"{location}(?:\s+[^.\n;:()]{{0,120}}?\s*[:,-]?\s*)"
                rf"(?P<count>{number})\s*{magnitude_group}\s*{death_term}\b",
                re.IGNORECASE | re.UNICODE,
            ),
        ),
        "deaths_after_cases": (
            re.compile(
                rf"{case_term}\s+(?:and|dan)\s+(?P<count>{number})\s*{death_term}\b",
                re.IGNORECASE | re.UNICODE,
            ),
        ),
    }


def _number(raw: str, multiplier: str = "") -> int:
    return max(0, extractors.parse_surveillance_count(raw, multiplier or "") or 0)


def _date_from_parts(day: str, month: str, year: str) -> Optional[date]:
    try:
        month_key = (month or "").casefold().strip()
        month_number = config.get_temporal_month_map().get(month_key)
        if month_number is None:
            numeric = re.fullmatch(r"(?:tháng\s*)?(1[0-2]|[1-9])", month_key)
            month_number = int(numeric.group(1)) if numeric else None
        return date(int(year), int(month_number), int(day)) if month_number else None
    except (TypeError, ValueError):
        return None


_YEAR_TOKEN = re.compile(r"\b(20\d{2}|25\d{2})\b")


def _calendar_year(raw: str | int) -> int:
    """Normalize Gregorian and Thai Buddhist years for period logic."""

    year = int(raw)
    return year - 543 if 2500 <= year <= 2599 else year
_NAMED_RANGE = re.compile(
    r"(?P<day1>\d{1,2})\s+(?P<month1>[^\W\d_]+(?:\s+[^\W\d_]+)?)\s*"
    r"(?:(?P<year1>20\d{2})\s*)?"
    r"(?:to|sampai|hingga|s/d|sd|đến|ถึง|ដល់|ຫາ|ထိ|[-–])\s*"
    r"(?P<day2>\d{1,2})\s+(?P<month2>[^\W\d_]+(?:\s+[^\W\d_]+)?)\s+(?P<year2>20\d{2})",
    re.IGNORECASE,
)
_SAME_MONTH_DAY_RANGE = re.compile(
    r"(?P<day1>\d{1,2})\s*(?:-|–|to|sampai|hingga|s/d|sd|đến|ถึง|ដល់|ຫາ|ထိ)\s*"
    r"(?P<day2>\d{1,2})\s+(?P<month>[^\W\d_]+(?:\s+[^\W\d_]+)?)\s+(?P<year>20\d{2})",
    re.IGNORECASE,
)
_MONTH_RANGE = re.compile(
    r"(?P<month1>[^\W\d_]+(?:\s+[^\W\d_]+)?)\s+(?:to|sampai|hingga|đến|ถึง|ដល់|ຫາ|ထိ|s/d|sd|[-–])\s+"
    r"(?P<month2>[^\W\d_]+(?:\s+[^\W\d_]+)?)\s+(?P<year>20\d{2})",
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
    value = re.sub(r"\s+", " ", normalize_local_digits(text or "")).strip()
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
    same_month = _SAME_MONTH_DAY_RANGE.search(value)
    if same_month:
        start = _date_from_parts(same_month.group("day1"), same_month.group("month"), same_month.group("year"))
        end = _date_from_parts(same_month.group("day2"), same_month.group("month"), same_month.group("year"))
        if start and end:
            return f"{start.isoformat()} to {end.isoformat()}"
    month_range = _MONTH_RANGE.search(value)
    if month_range:
        month_map = config.get_temporal_month_map()
        first = month_map.get(month_range.group("month1").casefold())
        last = month_map.get(month_range.group("month2").casefold())
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
    explicit_period = extract_event_period(value)
    if explicit_period.get("event_date_start"):
        start = explicit_period["event_date_start"]
        end = explicit_period.get("event_date_end") or start
        return start if start == end else f"{start} to {end}"
    year_only = re.search(
        r"\b(?:pada|di|tahun|year|in|during|throughout|sepanjang|ช่วงกลางปี|ปี)\s+(?:tahun\s+)?(20\d{2}|25\d{2})\b",
        value, re.I,
    )
    if year_only:
        return _year_frame(_calendar_year(year_only.group(1)))
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
    prior_year = next(
        reversed(list(_YEAR_TOKEN.finditer(source, max(0, start - 220), start))),
        None,
    )
    year_after_metric = next(
        _YEAR_TOKEN.finditer(source, end, min(len(source), end + 100)),
        None,
    )
    if year_after_metric is not None and (year_after_metric.start() - end) <= 45:
        after_clause = source[end:year_after_metric.start()]
        after_year = source[year_after_metric.end():year_after_metric.end() + 120]
        has_explicit_range = bool(
            re.search(r"\(\s*\d{1,2}\s+[^()\d]{2,24}\s*(?:-|–|to|s/d)\s*\d{1,2}", after_year, re.IGNORECASE)
        )
        if not re.search(r"[.!?;\n]", after_clause) and re.search(
            r"(?:\b(?:in|during|throughout|year|tahun|pada|for\s+the\s+whole\s+of|in\s+all\s+of|sepanjang(?:\s+tahun)?|selama(?:\s+tahun)?)\b|ปี|ປີ|ឆ្នាំ|年)\s*$",
            after_clause,
            re.IGNORECASE | re.UNICODE,
        ) and not has_explicit_range:
            return _year_frame(_calendar_year(year_after_metric.group(1)))
        if not has_explicit_range and re.search(
            r"[\u0e00-\u0e7f\u0e80-\u0eff\u1000-\u109f\u1780-\u17ff]\s*$",
            after_clause,
        ):
            return _year_frame(_calendar_year(year_after_metric.group(1)))
    local_year = _calendar_year(years[0]) if len(set(years)) == 1 else None
    document_period = extract_event_period(source)
    document_start = document_period.get("event_date_start")
    document_end = document_period.get("event_date_end") or document_period.get("event_date")
    document_frame = (
        f"{document_start} to {document_end}"
        if document_start and document_end and document_start != document_end
        else document_start or document_end or ""
    )
    document_year = int(document_start[:4]) if document_start else None
    if (
        document_frame
        and prior_year
        and document_year is not None
        and _calendar_year(prior_year.group(1)) == document_year
        and (not local_frame or local_year == document_year)
    ):
        return document_frame
    # A native article can place the historical year just outside the local
    # clause while a later current-year comparison is still inside it. Do not
    # let that later year override the metric's preceding historical year.
    prior_is_different = bool(
        prior_year
        and local_year
        and _calendar_year(prior_year.group(1)) != local_year
    )
    if local_frame and len(set(years)) <= 1 and not prior_is_different:
        return local_frame

    nearby_years = list(_YEAR_TOKEN.finditer(source, max(0, start - 220), min(len(source), end + 220)))
    nearest_year = min(
        nearby_years,
        key=lambda item: min(abs(start - item.end()), abs(item.start() - end)),
        default=None,
    )
    # In long native-script sentences a comparison year can appear after the
    # metric. Prefer the closest year already introducing the metric clause;
    # otherwise ``129 deaths`` can inherit the later ``2026`` mentioned in
    # the next comparison clause instead of the preceding ``2025``.
    year_before_metric = next(
        reversed(list(_YEAR_TOKEN.finditer(source, max(0, start - 220), start))),
        None,
    )
    if year_before_metric is not None and (start - year_before_metric.end()) <= 220:
        nearest_year = year_before_metric
    named_ranges = list(_NAMED_RANGE.finditer(source))
    if year_after_metric and year_before_metric is None and not any(
        match.group("year2") == year_after_metric.group(1)
        and match.end() >= start - 80
        for match in named_ranges
    ):
        after_metric_text = source[end:year_after_metric.start()]
        if not re.search(r"[.!?\n]", after_metric_text):
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
        between_text = source[min(end, nearest_year.start()):max(start, nearest_year.end())]
        if re.search(r"[.!?\n]", between_text):
            nearest_sentence = _metric_context(source, nearest_year.start(), nearest_year.end())
            if re.search(r"\b\d+\s+(?:cases?|kasus|deaths?|kematian)\b", nearest_sentence, re.I):
                nearest_year = None
        if nearest_year is not None:
            return _year_frame(_calendar_year(nearest_year.group(1)))

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


_DOMESTIC_SCOPE = re.compile(
    r"(?:\bnationwide\b|\bcountrywide\b|\bdomestic\b|\bnational(?:ly)?\b|"
    r"\bacross the country\b|\bin the country\b|\bthroughout the country\b|"
    r"\bnasional\b|\bse[- ]?indonesia\b|\bdalam negeri\b|\bseluruh negara\b|"
    r"\btrong nước\b|\btoàn quốc\b|\btrên cả nước\b|ทั่วประเทศ|"
    r"ในประเทศ|ระดับประเทศ|ទូទាំងប្រទេស|ທົ່ວປະເທດ|"
    r"ພາຍໃນປະເທດ|တစ်နိုင်ငံလုံး|\bsa buong bansa\b|\bpambansa\b)",
    re.IGNORECASE | re.UNICODE,
)


def _source_scope_location(
    text: str,
    linker: GazetteerLinker,
    source_country: Optional[str],
) -> Optional[LinkedLocation]:
    """Use source scope only when the article explicitly says domestic."""

    country = extractors.normalize_country(source_country)
    if country not in config.ASEAN_COUNTRIES:
        return None
    mentioned = extractors.extract_all_mentioned_countries(text)
    same_country_mentioned = country in mentioned and len(mentioned) == 1
    if not _DOMESTIC_SCOPE.search(text or "") and not same_country_mentioned:
        return None
    linked = linker.link(country, context="national country scope", evidence="")
    if linked:
        return linked
    latitude, longitude = config.LOCATION_COORDS.get(country, (None, None))
    return LinkedLocation(
        name=country,
        country=country,
        latitude=latitude,
        longitude=longitude,
        evidence="",
    )


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


def _runtime_metric_patterns() -> dict[str, Any]:
    """Build metric grammars from the shared DB lexicon at call time.

    The surrounding grammar stays algorithmic, while language-specific words
    are data. Rebuilding these small patterns per extraction keeps admin
    lexicon reloads effective without restarting the NLP process.
    """

    case_terms = config.get_lexicon_terms("metric_case")
    death_terms = config.get_lexicon_terms("metric_death")
    unit_terms = config.get_lexicon_terms("count_unit")
    case_term = metric_term_pattern(tuple(case_terms))
    death_term = metric_term_pattern(tuple(death_terms))
    unit_term = metric_term_pattern(tuple(unit_terms))
    location_dotted = (
        r"(?P<location>(?-i:[A-ZÀ-ÖØ-Ý])"
        r"[\wÀ-ÿ'’-]*(?:\s+(?-i:[A-ZÀ-ÖØ-Ý])[\wÀ-ÿ'’.-]*){0,5})"
    )
    range_case = re.compile(
        rf"(?:between|antara|from|từ|từ khoảng|ระหว่าง|จาก|ចន្លោះ|ລະຫວ່າງ|"
        rf"ຈາກ)\s*(?P<low>{_NUMBER})\s*(?:and|dan|to|sampai|hingga|đến|ถึง|ដល់|"
        rf"ຫາ|နှင့်)\s*(?P<high>{_NUMBER})\s*(?:{case_term})",
        re.IGNORECASE | re.UNICODE,
    )
    narrative_case = re.compile(
        rf"(?P<count>{_NUMBER})\s*(?P<multiplier>ribu|juta|million|thousand)?\s*"
        rf"(?:new\s+|baru\s+|terkonfirmasi\s+|confirmed\s+)?"
        rf"(?:[\w\u0E00-\u0EFF\u1000-\u109F\u1780-\u17FF-]+\s+){{0,2}}"
        rf"(?:{case_term})",
        re.IGNORECASE | re.UNICODE,
    )
    narrative_death = re.compile(
        rf"(?P<count>{_NUMBER})\s*(?P<multiplier>ribu|juta|million|thousand)?\s*"
        rf"(?:[\w\u0E00-\u0EFF\u1000-\u109F\u1780-\u17FF-]+\s+){{0,2}}"
        rf"(?:{death_term})",
        re.IGNORECASE | re.UNICODE,
    )
    count_number = extractors._runtime_number_word_pattern()
    narrative_case = re.compile(
        rf"(?P<count>(?<!\w)(?!(?:19|20|25)\d{{2}}\b){count_number}(?!\w))\s*(?P<multiplier>ribu|juta|million|thousand)?\s*"
        rf"(?:new\s+|baru\s+|terkonfirmasi\s+|confirmed\s+|tambahan\s+)?"
        rf"(?:[\w\u0E00-\u0EFF\u1000-\u109F\u1780-\u17FF-]+\s+){{0,2}}"
        rf"(?:{case_term})",
        re.IGNORECASE | re.UNICODE,
    )
    narrative_death = re.compile(
        rf"(?P<count>(?<!\w)(?!(?:19|20|25)\d{{2}}\b){count_number}(?!\w))\s*(?P<multiplier>ribu|juta|million|thousand)?\s*"
        rf"(?:[\w\u0E00-\u0EFF\u1000-\u109F\u1780-\u17FF-]+\s+){{0,2}}"
        rf"(?:{death_term})",
        re.IGNORECASE | re.UNICODE,
    )
    case_location_count = re.compile(
        rf"(?:{case_term})\s+(?:[\w\u0E00-\u0EFF\u1000-\u109F\u1780-\u17FF-]+\s+){{0,5}}"
        rf"(?:di|in|from|among)\s+{location_dotted}\s+"
        rf"(?:[^.\n;:()\d]{{0,80}}?\b(?:mencapai|mencatat|reported|reached|"
        rf"recorded|logged|tercatat|sebanyak|total)\s+)?"
        rf"(?P<count>(?<!\w)(?!(?:19|20|25)\d{{2}}\b){count_number}(?!\w))\s*(?P<multiplier>ribu|juta|million|thousand)?",
        re.IGNORECASE | re.UNICODE,
    )
    postfix_case = re.compile(
        rf"(?:{case_term})(?:\s*(?:cumulative|accumulated|new|total|baru|terkonfirmasi|"
        rf"confirmed|mới|xác\s+nhận|สะสม|ใหม่|ทั้งหมด|รวม|ថ្មី|ໃໝ່|အသစ်))?\s*"
        rf"(?P<count>{_NUMBER})\s*(?:{unit_term})?",
        re.IGNORECASE | re.UNICODE,
    )
    postfix_death = re.compile(
        rf"(?:{death_term})(?:\s*(?:cumulative|total|tercatat|reported|baru|สะสม|ทั้งหมด|"
        rf"รวม|ថាំងអស់|ເສຍຊີວິດ|အသစ်))?\s*(?P<count>{_NUMBER})\s*(?:{unit_term})?",
        re.IGNORECASE | re.UNICODE,
    )
    return {
        "case_term": case_term,
        "death_term": death_term,
        "range_case": range_case,
        "narrative_case": narrative_case,
        "narrative_death": narrative_death,
        "case_location_count": case_location_count,
        "postfix_case": postfix_case,
        "postfix_death": postfix_death,
    }
_NON_CASE_NUMBER_CONTEXT = re.compile(
    r"(?:%|persen|percent|per\s+100|population|populasi|tempat\s+tidur|"
    r"bed(?:s)?|spesimen|specimen|swab|sampel|sample|dosis|dose|vaksin|vaccine)",
    re.IGNORECASE,
)

_CASE_BREAKDOWN_CONTEXT = re.compile(
    r"(?:\bage(?:d)?\b|\brate\b|อายุ|อัตราป่วย|โรงพยาบาล|hospital)",
    re.IGNORECASE | re.UNICODE,
)


def _looks_like_case_breakdown(text: str, start: int) -> bool:
    """Reject age/hospital/rate breakdown numbers as national case totals."""

    source = text or ""
    prefix_start = max(0, start - 120)
    for match in re.finditer(r"[.!?;\n]", source[prefix_start:start]):
        if match.group(0) == ".":
            absolute = prefix_start + match.start()
            if (
                absolute > 0
                and absolute + 1 < len(source)
                and source[absolute - 1].isdigit()
                and source[absolute + 1].isdigit()
            ):
                continue
        prefix_start = prefix_start + match.end()
    prefix = source[prefix_start:start]
    return bool(_CASE_BREAKDOWN_CONTEXT.search(prefix))

_CALENDAR_YEAR_CONTEXT = re.compile(
    r"(?:\b(?:year|tahun|in|during|throughout|pada|di|tahun)\s*|"
    r"(?:ปี|พ\.ศ\.?|ค\.ศ\.?|ឆ្នាំ|ປີ|နှစ်)\s*)$|"
    r"(?:\b(?:year|tahun|ปี|พ\.ศ\.?|ค\.ศ\.?|ឆ្នាំ|ປີ|နှစ်)\s*)"
    r"(?:19\d{2}|20\d{2}|25\d{2})\b",
    re.IGNORECASE | re.UNICODE,
)


def _looks_like_calendar_year(text: str, start: int, end: int) -> bool:
    """Reject a calendar year when a loose case regex spans into its label.

    Narrative patterns intentionally allow a few words between a number and a
    metric label.  That is useful for prose, but it also makes ``ปี 2568 ...
    ผู้ป่วย`` look like 2,568 cases.  The number remains available to temporal
    extraction; it is only excluded from the metric relation layer.
    """

    raw = (text or "")[start:end]
    compact = re.sub(r"[\s,._]", "", raw)
    if not re.fullmatch(r"(?:19\d{2}|20\d{2}|25\d{2})", compact):
        return False
    source = text or ""
    prefix = source[max(0, start - 40):start]
    suffix = source[end:min(len(source), end + 12)]
    if re.search(
        r"(?:\b(?:year|tahun|in|during|throughout|pada|di)\s*|"
        r"(?:ปี|พ\.ศ\.?|ค\.ศ\.?|กลางปี|ឆ្នាំ|ປີ|နှစ်)\s*)$",
        prefix,
        re.IGNORECASE | re.UNICODE,
    ):
        return True
    # A year followed by a date/period connector is temporal even when the
    # language places the marker after the number.
    return bool(re.match(r"\s*(?:年|ปี|г\.?|年|[-–/]\s*\d)", suffix, re.IGNORECASE | re.UNICODE))


def _metric_is_valid(text: str, start: int, end: int) -> bool:
    """Reject numbers that look like rates, capacity, samples, or doses."""

    # Do not interpret the numeric suffix of a hyphenated disease/variant
    # token (for example ``COVID-19``) as a surveillance count.
    prefix_token = (text or "")[max(0, start - 24):start]
    if re.search(r"[A-Za-z\u0E00-\u0EFF\u1000-\u109F\u1780-\u17FF]\s*[-–]\s*$", prefix_token):
        return False
    if extractors.is_non_incident_metric_context(text, start, end):
        return False
    short_context = text[max(0, start - 32):min(len(text), end + 48)]
    if _NON_CASE_NUMBER_CONTEXT.search(short_context):
        return False
    context = text[max(0, start - 100):min(len(text), end + 100)]
    if re.search(
        r"\b(?:patients?|pasien|pesakit)\b[^.!?;:]{0,80}\b(?:required\s+hospital|hospital\s+(?:treatment|care|admission|ward)|"
        r"hospitali[sz](?:ed|ation)|admitted|in\s+hospital|dirawat|rawat\s+inap)\b",
        context,
        re.IGNORECASE,
    ):
        # Hospital utilization is a separate metric. It must not inflate the
        # incident-case total merely because ``patients`` is a case alias.
        return False
    return not _looks_like_calendar_year(text, start, end)


def _is_prior_case_total_for_death(text: str, match: re.Match) -> bool:
    """Reject a case total accidentally captured as a death count.

    ``99,691 cases, 15 deaths`` contains two numbers and two metrics. The
    first number must not become a death relation, while ``3 ca tử vong`` is
    a valid Vietnamese death expression even though ``ca`` is also a case
    lexicon term. The extra-number check distinguishes those shapes.
    """

    span = match.group(0)
    death_label = re.search(
        _runtime_metric_patterns()["death_term"], span, re.IGNORECASE | re.UNICODE
    )
    if not death_label:
        return False
    count_end = match.end("count") - match.start()
    between = span[count_end:death_label.start()]
    case_label = re.search(
        _runtime_metric_patterns()["case_term"], between, re.IGNORECASE | re.UNICODE
    )
    if not case_label:
        return False
    if re.search(_NUMBER, between[case_label.end():]):
        return True
    trailing = (text or "")[match.end():match.end() + 48]
    return bool(re.search(_NUMBER, trailing))


def _case_number_after_death_label(text: str, start: int) -> bool:
    """Reject ``death label + number`` from the case relation pass."""

    prefix = (text or "")[max(0, start - 80):start]
    death_term = _runtime_metric_patterns()["death_term"]
    return bool(re.search(rf"(?:{death_term})\s*$", prefix, re.IGNORECASE | re.UNICODE))


def _narrative_metric_is_valid(text: str, match: re.Match, metric_name: str) -> bool:
    """Keep adjacent case/death metrics from stealing each other's value."""

    span = match.group(0)
    if _looks_like_calendar_year(text, match.start("count"), match.end("count")):
        return False
    if metric_name == "cases" and _looks_like_case_breakdown(text, match.start("count")):
        return False
    # A loose native-script pattern may start at a year and consume several
    # words before reaching ``cases``/``deaths``. A four-digit calendar year
    # is not a metric in that form, even when the language omits a Latin date
    # marker (common in Lao reporting).
    raw_count = match.group("count")
    compact_count = re.sub(r"[\s,._]", "", raw_count or "")
    after_count = span[match.end("count") - match.start():].strip()
    if re.fullmatch(r"(?:19\d{2}|20\d{2}|25\d{2})", compact_count) and len(after_count) > 10:
        return False
    if metric_name == "cases":
        # ``the two cases originated from X and Y`` refers back to an
        # already reported total. It is location context, not another case
        # observation. Keep numeric reports such as ``2 cases from X``.
        raw_lower = str(raw_count or "").strip().casefold()
        origin_context = re.search(
            r"\b(?:berasal\s+dari|berpunca\s+dari|originat(?:e|ed)\s+from|came\s+from|from)\b",
            _metric_context(text, match.start(), match.end(), radius=320),
            re.IGNORECASE,
        )
        if origin_context and (
            raw_lower in {"kedua", "both", "these two", "the two"}
            or re.search(r"\b(?:kedua|both|these\s+two|the\s+two)\s+(?:cases?|kasus|patients?|pasien)\b", _metric_context(text, match.start(), match.end(), radius=320), re.IGNORECASE)
            or re.search(r"\b(?:the\s+|these\s+)?two\s+(?:cases?|patients?)\s+(?:were|are|came|originated|from)\b", _metric_context(text, match.start(), match.end(), radius=320), re.IGNORECASE)
        ):
            return False
        return not _case_number_after_death_label(text, match.start("count"))

    death_label = re.search(
        _runtime_metric_patterns()["death_term"], span, re.IGNORECASE | re.UNICODE
    )
    if not death_label:
        return True
    # ``99,691 ราย เสียชีวิต 15 ราย`` must not yield a synthetic death count
    # of 99,691. A direct ``99,691 patients died`` remains valid because
    # patient/person wording is not treated as a prior case total here.
    return not _is_prior_case_total_for_death(text, match)


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
    text: str = "",
) -> Optional[LinkedLocation]:
    if not locations:
        return None
    valid_locations = locations
    if text:
        filtered = [loc for loc in locations if not _is_comparative_location(text, loc[0])]
        if filtered:
            valid_locations = filtered
    candidate = min(
        valid_locations,
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
        (relation.disease or "").casefold(),
        relation.qualifier or "",
    )
    current = relations.get(key)
    if not current:
        # Native-script pages frequently omit sentence punctuation, and a
        # decimal rate can make a simple punctuation counter split one
        # reporting clause in two. Merge a disease-labelled case/death pair
        # when the location, period, and qualifier agree and the evidence is
        # close; never merge two different explicit diseases.
        for candidate in relations.values():
            same_scope = (
                candidate.location.country.casefold() == relation.location.country.casefold()
                and candidate.location.name.casefold() == relation.location.name.casefold()
                and candidate.time_frame == relation.time_frame
            )
            metric_pair = {candidate.metric_type, relation.metric_type}
            qualifier_compatible = (
                (candidate.qualifier or "") == (relation.qualifier or "")
                or metric_pair == {"cases", "deaths"}
            )
            disease_compatible = (
                not candidate.disease
                or not relation.disease
                or candidate.disease.casefold() == relation.disease.casefold()
            )
            if not same_scope or not qualifier_compatible or not disease_compatible:
                continue
            candidate_hist = bool(re.search(r"\b(?:last\s+year|previous\s+year|the\s+whole\s+of|in\s+all\s+of|compared\s+(?:with|to)|sebelumnya|tahun\s+lalu)\b", candidate.evidence or "", re.I))
            relation_hist = bool(re.search(r"\b(?:last\s+year|previous\s+year|the\s+whole\s+of|in\s+all\s+of|compared\s+(?:with|to)|sebelumnya|tahun\s+lalu)\b", relation.evidence or "", re.I))
            if candidate_hist != relation_hist:
                continue
            if candidate.evidence_offset_start is None or relation.evidence_offset_start is None:
                continue
            if abs(candidate.evidence_offset_start - relation.evidence_offset_start) <= 500:
                current = candidate
                break
    if not current:
        relations[key] = relation
        return
    previous_evidence = current.evidence
    if not current.disease and relation.disease:
        current.disease = relation.disease
    if relation.cases > current.cases:
        if current.metric_type == "deaths" or current.cases == 0:
            current.qualifier = relation.qualifier
        current.cases = relation.cases
        # Some narrative grammars match a clause containing both a new count
        # and a cumulative count. The relation's ``cases`` field is the
        # selected case value after merge; keep ``value`` synchronized so the
        # intelligence layer does not publish the earlier count as primary.
        if relation.metric_type != "deaths":
            current.value = relation.cases
        current.evidence = relation.evidence or current.evidence
        current.metric_type = "cases"
    if relation.deaths is not None:
        current.deaths = max(current.deaths or 0, relation.deaths)
        if current.cases == 0:
            current.metric_type = "deaths"
    if (
        relation.evidence
        and current.evidence
        and relation.evidence not in previous_evidence
        and (
            relation.source_sentence_id == current.source_sentence_id
            or (
                current.evidence_offset_start is not None
                and relation.evidence_offset_start is not None
                and abs(current.evidence_offset_start - relation.evidence_offset_start) <= 500
            )
        )
    ):
        # Keep case and death proof together when they came from one original
        # sentence. This avoids exposing a death count with case-only evidence
        # while preserving the exact source wording.
        evidence_parts = [current.evidence]
        if previous_evidence and previous_evidence not in evidence_parts[0]:
            evidence_parts.append(previous_evidence)
        if relation.evidence not in evidence_parts[0]:
            evidence_parts.append(relation.evidence)
        current.evidence = " ".join(dict.fromkeys(part for part in evidence_parts if part)).strip()
        if current.evidence_offset_start is not None and relation.evidence_offset_start is not None:
            current.evidence_offset_start = min(current.evidence_offset_start, relation.evidence_offset_start)
        if current.evidence_offset_end is not None and relation.evidence_offset_end is not None:
            current.evidence_offset_end = max(current.evidence_offset_end, relation.evidence_offset_end)
    if relation.evidence and len(relation.evidence) > len(current.evidence):
        current.evidence = relation.evidence
    current.value_min = min(
        value for value in (current.value_min, relation.value_min) if value is not None
    ) if any(value is not None for value in (current.value_min, relation.value_min)) else None
    current.value_max = max(
        value for value in (current.value_max, relation.value_max) if value is not None
    ) if any(value is not None for value in (current.value_max, relation.value_max)) else None


def _source_sentence_id(text: str, offset: int) -> str:
    """Create a stable source sentence identifier without fake translations."""

    prefix = (text or "")[:max(0, offset)]
    boundaries = re.findall(r"[.!?。！？\n]", prefix)
    return f"s{len(boundaries) + 1}"


def _relation_disease(text: str, start: int, end: int) -> Optional[str]:
    """Use only disease terms found in the same metric evidence window."""

    context = _metric_context(text, start, end)
    candidates = list(dict.fromkeys(
        extractors.extract_diseases(context) + extractors.extract_alias_diseases(context)
    ))
    candidates = [item for item in candidates if extractors.disease_has_textual_evidence(item, context)]
    return candidates[0] if len(candidates) == 1 else None


def _relation_qualifier(text: str, start: int, end: int) -> Optional[str]:
    context = _metric_context(text, start, end)
    # Qualifiers are clause-local. Looking at the whole sentence makes
    # ``2 new cases and 121 cumulative cases`` classify both candidates as
    # cumulative because the second qualifier is farther to the right.
    sentence_start = max(
        (text or "").rfind(".", 0, start),
        (text or "").rfind("!", 0, start),
        (text or "").rfind("?", 0, start),
        (text or "").rfind("\n", 0, start),
    ) + 1
    sentence_end_candidates = [
        index for index in (
            (text or "").find(".", end),
            (text or "").find("!", end),
            (text or "").find("?", end),
            (text or "").find("\n", end),
        ) if index >= 0
    ]
    sentence_end = min(sentence_end_candidates) if sentence_end_candidates else len(text or "")
    local_start = max(sentence_start, start - 60)
    local_end = min(sentence_end, end + 60)
    local = (text or "")[local_start:local_end]
    qualifier_patterns = (
        ("comparison", r"\b(?:compared\s+(?:with|to)|versus|vs\.?|previous(?:ly)?|prior|last\s+(?:week|month|year)|pekan\s+sebelumnya|tahun\s+(?:lalu|sebelumnya)|dibanding(?:kan)?|berbanding)\b"),
        ("historical", r"\b(?:historical(?:ly)?|historis|in\s+20\d{2}|pada\s+tahun\s+20\d{2}|for\s+the\s+whole\s+of)\b"),
        ("cumulative", r"\b(?:cumulative|accumulated|total|year\s+to\s+date|ytd|sepanjang|kumulatif|jumlah\s+keseluruhan|sampai\s+saat\s+ini)\b"),
        ("new", r"\b(?:new|baru|tambahan|latest|recent)\b"),
        ("suspected", r"\b(?:suspected|suspect|suspek|diduga)\b"),
        ("confirmed", r"\b(?:confirmed|terkonfirmasi|konfirmasi|positif)\b"),
    )
    nearby: list[tuple[int, str]] = []
    for qualifier, pattern in qualifier_patterns:
        for match in re.finditer(pattern, local, re.IGNORECASE | re.UNICODE):
            nearby.append((abs((local_start + match.start()) - start), qualifier))
    if nearby:
        return min(nearby, key=lambda item: item[0])[1]
    match = re.search(
        r"\b(more than|over|at least|nearly|about|around|approximately|"
        r"lebih dari|setidaknya|sekitar|hampir|lebih kurang|approximately)\b",
        local,
        re.IGNORECASE,
    )
    if not match:
        match = re.search(
            r"\b(more than|over|at least|nearly|about|around|approximately|"
            r"lebih dari|setidaknya|sekitar|hampir|lebih kurang|approximately)\b",
            context,
            re.IGNORECASE,
        )
    return f"approximate:{match.group(1).casefold()}" if match else None


def _extract_narrative_relations(
    text: str,
    linker: GazetteerLinker,
    published_date: Optional[str],
    fallback_location: Optional[LinkedLocation] = None,
) -> list[MetricRelation]:
    """Recover implicit-location comparisons such as ``2025 ... 614,601``."""

    source = text or ""
    working = normalize_local_digits(source)
    locations = _location_spans(source, linker)
    relations: dict[tuple[str, str, str], MetricRelation] = {}
    runtime_patterns = _runtime_metric_patterns()
    for pattern, metric_name in (
        (runtime_patterns["narrative_case"], "cases"),
        (runtime_patterns["narrative_death"], "deaths"),
    ):
        for match in pattern.finditer(working):
            if not _narrative_metric_is_valid(source, match, metric_name):
                continue
            if not _metric_is_valid(source, match.start("count"), match.end()):
                continue
            if _looks_like_case_breakdown(source, match.start("count")):
                continue
            linked = _nearest_location(match.start(), match.end(), locations, text=source)
            sentence_start = max(
                source.rfind(".", 0, match.start()),
                source.rfind("!", 0, match.start()),
                source.rfind("?", 0, match.start()),
                source.rfind("\n", 0, match.start()),
            ) + 1
            sentence_end_candidates = [
                index for index in (
                    source.find(".", match.end()),
                    source.find("!", match.end()),
                    source.find("?", match.end()),
                    source.find("\n", match.end()),
                ) if index >= 0
            ]
            sentence_end = min(sentence_end_candidates) if sentence_end_candidates else len(source)
            local_locations = [
                item for item in locations
                if item[0] >= sentence_start and item[1] <= sentence_end
            ]
            local_countries = list(dict.fromkeys(
                extractors.normalize_country(value)
                for value in extractors.extract_all_mentioned_countries(
                    source[sentence_start:sentence_end]
                )
                if extractors.normalize_country(value)
            ))
            local_subnational = [
                item for item in local_locations
                if item[2].name.casefold() not in {c.casefold() for c in local_countries}
            ]
            if local_subnational:
                linked = _nearest_location(
                    match.start(), match.end(), local_locations, text=source
                ) or linked
            elif len(local_countries) == 1:
                linked = _country_level_location(
                    local_countries[0],
                    linker,
                    context=source[sentence_start:sentence_end],
                    evidence=source[sentence_start:sentence_end],
                ) or linked
            elif local_locations:
                linked = _nearest_location(
                    match.start(), match.end(), local_locations, text=source
                ) or linked
            elif not local_locations:
                prior_countries = list(dict.fromkeys(
                    extractors.normalize_country(value)
                    for value in extractors.extract_all_mentioned_countries(
                        source[max(0, sentence_start - 360):sentence_start]
                    )
                    if extractors.normalize_country(value)
                ))
                if prior_countries:
                    prior_text = source[max(0, sentence_start - 360):sentence_start]
                    prior_country = max(
                        prior_countries,
                        key=lambda candidate: max(
                            [
                                prior_text.casefold().rfind(str(alias).casefold())
                                for alias, canonical in extractors.COUNTRY_ALIASES.items()
                                if extractors.normalize_country(canonical) == candidate
                            ] + [prior_text.casefold().rfind(candidate.casefold())]
                        ),
                    )
                    linked = _country_level_location(
                        prior_country,
                        linker,
                        context=source[sentence_start:sentence_end],
                        evidence=source[sentence_start:sentence_end],
                    )
            if not linked:
                linked = fallback_location
            if not linked:
                continue
            frame = _relation_time_frame_for_span(
                source, linked, published_date, match.start(), match.end()
            )
            evidence = source[match.start():match.end()].strip()
            value = _number(match.group("count"), match.groupdict().get("multiplier", ""))
            relation = MetricRelation(
                location=linked,
                cases=value if metric_name == "cases" else 0,
                deaths=value if metric_name == "deaths" else None,
                time_frame=frame,
                evidence=evidence,
                disease=_relation_disease(source, match.start(), match.end()),
                metric_type=metric_name,
                qualifier=_relation_qualifier(source, match.start(), match.end()),
                value=value,
                evidence_offset_start=match.start(),
                evidence_offset_end=match.end(),
                source_sentence_id=_source_sentence_id(source, match.start()),
            )
            _upsert_relation(relations, relation)
    return list(relations.values())


def _extract_range_relations(
    text: str,
    linker: GazetteerLinker,
    published_date: Optional[str],
) -> list[MetricRelation]:
    """Keep a numeric range as a range instead of selecting one endpoint."""

    source = text or ""
    working = normalize_local_digits(source)
    locations = _location_spans(source, linker)
    relations: list[MetricRelation] = []
    for match in _runtime_metric_patterns()["range_case"].finditer(working):
        linked = _nearest_location(match.start(), match.end(), locations, text=source)
        if not linked:
            continue
        low = _number(match.group("low"))
        high = _number(match.group("high"))
        if high < low:
            low, high = high, low
        relations.append(MetricRelation(
            location=linked,
            cases=0,
            time_frame=_relation_time_frame_for_span(source, linked, published_date, match.start(), match.end()),
            evidence=source[match.start():match.end()].strip(),
            disease=_relation_disease(source, match.start(), match.end()),
            metric_type="cases",
            qualifier="range",
            value_min=low,
            value_max=high,
            evidence_offset_start=match.start(),
            evidence_offset_end=match.end(),
            source_sentence_id=_source_sentence_id(source, match.start()),
        ))
    return relations


def extract_metric_relations(
    text: str,
    linker: Optional[GazetteerLinker] = None,
    published_date: Optional[str] = None,
    source_country: Optional[str] = None,
) -> list[MetricRelation]:
    """Extract explicit location↔metric relations from local evidence windows."""

    source = text or ""
    working = normalize_local_digits(source)
    linker = linker or GazetteerLinker()
    locations = _location_spans(source, linker)
    # Keep a verified domestic-scope fallback even when the article also
    # mentions a country later in a historical comparison. The nearest
    # location still wins; the fallback is used only when a metric has no
    # nearby explicit location.
    fallback_location = _source_scope_location(source, linker, source_country)
    relations: dict[tuple[str, str, str], MetricRelation] = {}

    for relation in _extract_range_relations(source, linker, published_date):
        _upsert_relation(relations, relation)

    relation_patterns = _runtime_relation_patterns()
    runtime_patterns = _runtime_metric_patterns()
    patterns = relation_patterns["cases"]
    for pattern in patterns:
        for match in pattern.finditer(working):
            if _is_comparative_location(source, match.start("location")):
                continue
            raw_location = match.group("location")
            linked = _candidate_location(linker, raw_location, source, match.start("location"), match.end("location"))
            if not linked:
                continue
            count = _number(match.group("count"), match.groupdict().get("multiplier", ""))
            if _case_number_after_death_label(source, match.start("count")):
                continue
            case_clause = _metric_context(source, match.start(), match.end(), radius=320)
            if re.search(
                r"\b(?:berasal\s+dari|berpunca\s+dari|originat(?:e|ed)\s+from|came\s+from|from)\b",
                case_clause,
                re.IGNORECASE,
            ) and re.search(
                r"\b(?:kedua|both|these\s+two|the\s+two)\s+(?:\w+\s+){0,2}(?:cases?|kasus|patients?|pasien)\b|"
                r"\b(?:the\s+|these\s+)?two\s+(?:cases?|patients?)\s+(?:were|are|came|originated|from)\b",
                case_clause,
                re.IGNORECASE,
            ):
                continue
            if not _metric_is_valid(source, match.start("count"), match.end()):
                continue
            if _looks_like_case_breakdown(source, match.start("count")):
                continue
            frame = _relation_time_frame_for_span(
                source, linked, published_date, match.start("count"), match.end("count")
            )
            _upsert_relation(relations, MetricRelation(
                location=linked, cases=count,
                time_frame=frame, evidence=source[match.start():match.end()].strip(),
                disease=_relation_disease(source, match.start(), match.end()),
                metric_type="cases", qualifier=_relation_qualifier(source, match.start(), match.end()),
                value=count, evidence_offset_start=match.start(), evidence_offset_end=match.end(),
                source_sentence_id=_source_sentence_id(source, match.start()),
            ))

    # Narrative order used by many news reports: ``cases in Singapore
    # reached 12,700``.  The older grammars only accepted location-before-count
    # or count-before-location and therefore dropped this metric entirely.
    for match in runtime_patterns["case_location_count"].finditer(working):
        raw_location = match.group("location")
        linked = _candidate_location(
            linker, raw_location, source, match.start("location"), match.end("location")
        )
        if not linked or not _metric_is_valid(source, match.start("count"), match.end()):
            continue
        count = _number(match.group("count"), match.groupdict().get("multiplier", ""))
        frame = _relation_time_frame_for_span(
            source, linked, published_date, match.start("count"), match.end("count")
        )
        _upsert_relation(relations, MetricRelation(
            location=linked,
            cases=count,
            time_frame=frame,
            evidence=source[match.start():match.end()].strip(),
            disease=_relation_disease(source, match.start(), match.end()),
            metric_type="cases",
            qualifier=_relation_qualifier(source, match.start(), match.end()),
            value=count,
            evidence_offset_start=match.start(),
            evidence_offset_end=match.end(),
            source_sentence_id=_source_sentence_id(source, match.start()),
            country_scope=linked.country,
        ))

    for pattern, metric_name in (
        (runtime_patterns["postfix_case"], "cases"),
        (runtime_patterns["postfix_death"], "deaths"),
    ):
        for match in pattern.finditer(working):
            if not _metric_is_valid(source, match.start("count"), match.end()):
                continue
            if metric_name == "cases" and re.search(
                r"\b(?:berasal\s+dari|berpunca\s+dari|originat(?:e|ed)\s+from|came\s+from|from)\b",
                _metric_context(source, match.start(), match.end()),
                re.IGNORECASE,
            ) and re.search(
                r"\b(?:kedua|both|these\s+two|the\s+two)\s+(?:\w+\s+){0,2}(?:cases?|kasus|patients?|pasien)\b|"
                r"\b(?:the\s+|these\s+)?two\s+(?:cases?|patients?)\s+(?:were|are|came|originated|from)\b",
                _metric_context(source, match.start(), match.end(), radius=320),
                re.IGNORECASE,
            ):
                continue
            linked = _nearest_location(match.start(), match.end(), locations, text=source)
            if not linked:
                linked = fallback_location
            if not linked:
                continue
            count = _number(match.group("count"), match.groupdict().get("multiplier", ""))
            frame = _relation_time_frame_for_span(
                source, linked, published_date, match.start("count"), match.end("count")
            )
            _upsert_relation(relations, MetricRelation(
                location=linked,
                cases=count if metric_name == "cases" else 0,
                deaths=count if metric_name == "deaths" else None,
                time_frame=frame,
                evidence=source[match.start():match.end()].strip(),
                disease=_relation_disease(source, match.start(), match.end()),
                metric_type=metric_name,
                qualifier=_relation_qualifier(source, match.start(), match.end()),
                value=count,
                evidence_offset_start=match.start(),
                evidence_offset_end=match.end(),
                source_sentence_id=_source_sentence_id(source, match.start()),
            ))

    for pattern in relation_patterns["deaths"]:
        for match in pattern.finditer(working):
            if _is_comparative_location(source, match.start("location")):
                continue
            linked = _candidate_location(linker, match.group("location"), source, match.start("location"), match.end("location"))
            if not linked:
                continue
            death_count = _number(match.group("count"), match.groupdict().get("multiplier", ""))
            if _is_prior_case_total_for_death(source, match):
                continue
            if not _metric_is_valid(source, match.start("count"), match.end()):
                continue
            frame = _relation_time_frame_for_span(
                source, linked, published_date, match.start("count"), match.end("count")
            )
            _upsert_relation(relations, MetricRelation(
                location=linked, deaths=death_count,
                time_frame=frame, evidence=source[match.start():match.end()].strip(),
                disease=_relation_disease(source, match.start(), match.end()),
                metric_type="deaths", qualifier=_relation_qualifier(source, match.start(), match.end()),
                value=death_count, evidence_offset_start=match.start(), evidence_offset_end=match.end(),
                source_sentence_id=_source_sentence_id(source, match.start()),
            ))

    # Preserve an explicit zero as a scoped death metric.  Absence of a death
    # mention remains unknown; only source wording such as ``no deaths`` or
    # ``tidak ada laporan kematian`` is allowed to produce zero.
    death_terms = metric_term_pattern(tuple(config.get_lexicon_terms("metric_death")))
    zero_death = re.compile(
        rf"(?:\b(?:no|zero|without)\s+(?:reported\s+)?{death_terms}\b|"
        rf"\b(?:tidak\s+ada|tiada|nihil|tanpa)\s+(?:laporan\s+)?{death_terms}\b)",
        re.IGNORECASE | re.UNICODE,
    )
    for match in zero_death.finditer(working):
        sentence_start = max(
            source.rfind(".", 0, match.start()),
            source.rfind("!", 0, match.start()),
            source.rfind("?", 0, match.start()),
            source.rfind("\n", 0, match.start()),
        ) + 1
        sentence_end_candidates = [
            index for index in (
                source.find(".", match.end()),
                source.find("!", match.end()),
                source.find("?", match.end()),
                source.find("\n", match.end()),
            ) if index >= 0
        ]
        sentence_end = min(sentence_end_candidates) if sentence_end_candidates else len(source)
        local_locations = [
            item for item in locations
            if item[0] >= sentence_start and item[1] <= sentence_end
        ]
        local_countries = list(dict.fromkeys(item[2].country for item in local_locations))
        if len(local_countries) == 1 and len(local_locations) > 1:
            linked = _country_level_location(local_countries[0], linker, context="country-level metric")
        else:
            linked = _nearest_location(
                match.start(), match.end(), local_locations or locations, text=source
            )
        if not linked:
            linked = fallback_location
        if not linked:
            continue
        evidence = source[sentence_start:sentence_end].strip()
        _upsert_relation(relations, MetricRelation(
            location=linked,
            deaths=0,
            time_frame=_relation_time_frame_for_span(
                source, linked, published_date, sentence_start, sentence_end
            ),
            evidence=evidence,
            disease=_relation_disease(source, sentence_start, sentence_end),
            metric_type="deaths",
            qualifier="explicit_zero",
            value=0,
            evidence_offset_start=sentence_start,
            evidence_offset_end=sentence_end,
            source_sentence_id=_source_sentence_id(source, sentence_start),
            country_scope=linked.country,
        ))

    # Narrative shorthand such as ``53,362 cases and one death`` has no
    # second location token. Attach the death to the nearest validated
    # location in the source sentence rather than dropping it or reusing the
    # case total.
    for pattern in relation_patterns["deaths_after_cases"]:
        for match in pattern.finditer(working):
            if not _metric_is_valid(source, match.start("count"), match.end()):
                continue
            linked = _nearest_location(match.start(), match.end(), locations, text=source)
            if not linked:
                linked = fallback_location
            if not linked:
                continue
            death_count = _number(match.group("count"), match.groupdict().get("multiplier", ""))
            _upsert_relation(relations, MetricRelation(
                location=linked,
                deaths=death_count,
                time_frame=_relation_time_frame_for_span(
                    source, linked, published_date, match.start("count"), match.end("count")
                ),
                evidence=source[match.start():match.end()].strip(),
                disease=_relation_disease(source, match.start(), match.end()),
                metric_type="deaths",
                qualifier=_relation_qualifier(source, match.start(), match.end()),
                value=death_count,
                evidence_offset_start=match.start(),
                evidence_offset_end=match.end(),
                source_sentence_id=_source_sentence_id(source, match.start()),
            ))

    # The deterministic location patterns intentionally require a nearby
    # place. This second pass handles common narrative shorthand where the
    # country is named once and subsequent comparison values omit it.
    runtime_patterns = _runtime_metric_patterns()
    narrative_count = (
        len(runtime_patterns["narrative_case"].findall(working))
        + len(runtime_patterns["narrative_death"].findall(working))
    )
    # The location pass and narrative pass cover different grammars. Always
    # merge the narrative candidates: a location-bearing sentence can still
    # contain a second ``new``/``cumulative`` metric that the first pass has
    # collapsed or skipped. _upsert_relation keeps equivalent candidates
    # deduplicated by scope, qualifier, and period.
    for relation in _extract_narrative_relations(
        source, linker, published_date, fallback_location=fallback_location
    ):
        _upsert_relation(relations, relation)

    # Optional NER contributes only locations; it is not allowed to invent a
    # metric. This improves coverage for province grouping without weakening
    # the relation rule above.
    for raw, context in _spacy_candidates(source):
        linked = linker.link(raw, context=context)
        if linked and not any(r.location.name.casefold() == linked.name.casefold() for r in relations.values()):
            continue
    return list(relations.values())


# ---------------------------------------------------------------------------
# LLM supplement and final projection
# ---------------------------------------------------------------------------


def _llm_relations(text: str) -> list[RawLLMRelation]:
    if not config.AGENT_ENABLED or os.getenv("SURVEILLANCE_LLM_RELATIONS", "false").lower() not in {"1", "true", "yes", "on"}:
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
        return _calendar_year(match.group(1))
    if published_date:
        match = _YEAR_TOKEN.match(published_date[:4])
        if match:
            return _calendar_year(match.group(1))
    return None


def _period_sort_key(time_frame: str) -> tuple[int, str, str]:
    years = _YEAR_TOKEN.findall(time_frame or "")
    year = _calendar_year(years[-1]) if years else 0
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
    relation_years = {
        _period_year(item.time_frame, published_date)
        for item in relations
        if _period_year(item.time_frame, published_date)
    }
    target_year = publication_year if publication_year else (max(relation_years) if relation_years else None)
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
    source_country: Optional[str] = None,
    linker: Optional[GazetteerLinker] = None,
    relations: Optional[list[MetricRelation]] = None,
    include_llm: bool = True,
) -> SurveillanceOutput:
    """Build the strict output from an article, preserving country relations."""

    linker = linker or GazetteerLinker()
    published_date = _published_date(published_at, text)
    event_date = extract_event_date(text)
    typed_counts = extract_labeled_counts(text)
    if relations is None:
        relations = extract_metric_relations(
            text,
            linker=linker,
            published_date=published_date,
            source_country=source_country,
        )
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
