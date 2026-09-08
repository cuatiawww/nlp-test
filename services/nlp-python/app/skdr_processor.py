"""Specialized, high-throughput processor for SKDR surveillance data.

Processes structured/semi-structured SKDR reports directly without
unnecessary generative LLM overhead, ensuring deterministic disease mapping,
exact case counts, and sub-second processing latency.
"""
import json
import logging
import re
from typing import Optional

from .schemas import AnalyzeRequest, AnalyzeResponse, LocationItem, DiseaseMention
from . import config, pipeline

logger = logging.getLogger(__name__)

SKDR_DISEASE_MAP = {
    "dbd": ("Dengue Fever", "1D20"),
    "dengue": ("Dengue Fever", "1D20"),
    "demam berdarah": ("Dengue Fever", "1D20"),
    "demam berdarah dengue": ("Dengue Fever", "1D20"),
    "diare": ("Diarrhoeal diseases", "1A00"),
    "diare akut": ("Diarrhoeal diseases", "1A00"),
    "malaria": ("Malaria", "1F40"),
    "ili": ("Influenza", "1E30"),
    "influenza like illness": ("Influenza", "1E30"),
    "influenza": ("Influenza", "1E30"),
    "afp": ("Acute Flaccid Paralysis", "8B80"),
    "campak": ("Measles", "1F03"),
    "measles": ("Measles", "1F03"),
    "difteri": ("Diphtheria", "1B90"),
    "pertusis": ("Pertussis", "1C12"),
    "rabies": ("Rabies", "1D80"),
    "ghpr": ("Rabies", "1D80"),
    "gigitan hewan penular rabies": ("Rabies", "1D80"),
    "leptospirosis": ("Leptospirosis", "1B93"),
    "antraks": ("Anthrax", "1B91"),
    "tetanus": ("Tetanus", "1C17"),
    "covid-19": ("COVID-19", "RA01"),
    "covid": ("COVID-19", "RA01"),
    "pneumonia": ("Pneumonia", "CA40"),
    "hepatitis": ("Hepatitis", "1E50"),
    "kolera": ("Cholera", "1A00"),
    "tipoid": ("Typhoid fever", "1A07"),
    "demam tifoid": ("Typhoid fever", "1A07"),
}


def _parse_int(val: Optional[str], default: int = 0) -> int:
    if val is None:
        return default
    val_str = str(val).strip()
    match = re.search(r"\d+", val_str)
    return int(match.group()) if match else default


def process_skdr(payload: AnalyzeRequest) -> AnalyzeResponse:
    text = payload.text or ""

    disease_str = ""
    location_str = ""
    cases_count = 0
    deaths_count = 0
    report_date = payload.published_at

    for line in text.splitlines():
        line = line.strip()
        if line.lower().startswith("penyakit:"):
            disease_str = line.split(":", 1)[1].strip()
        elif line.lower().startswith("lokasi:"):
            location_str = line.split(":", 1)[1].strip()
        elif line.lower().startswith("kasus:"):
            cases_count = _parse_int(line.split(":", 1)[1])
        elif line.lower().startswith("kematian:"):
            deaths_count = _parse_int(line.split(":", 1)[1])
        elif line.lower().startswith("tanggal laporan:"):
            parsed_d = line.split(":", 1)[1].strip()
            if parsed_d:
                report_date = parsed_d

    if "Data SKDR:" in text:
        try:
            json_part = text.split("Data SKDR:", 1)[1].strip()
            skdr_data = json.loads(json_part)
            if not disease_str:
                disease_str = str(skdr_data.get("penyakit") or skdr_data.get("nama_penyakit") or skdr_data.get("disease") or "")
            if not location_str:
                location_str = str(skdr_data.get("lokasi") or skdr_data.get("wilayah") or skdr_data.get("provinsi") or skdr_data.get("kabupaten") or "")
            if not cases_count and "kasus" in skdr_data:
                cases_count = _parse_int(str(skdr_data["kasus"]))
            if not deaths_count and "kematian" in skdr_data:
                deaths_count = _parse_int(str(skdr_data["kematian"]))
        except Exception as e:
            logger.debug("Failed parsing embedded SKDR JSON: %s", e)

    if not disease_str and not location_str:
        logger.info("SKDR payload lacks standard headers, falling back to general pipeline")
        return pipeline.run(payload)

    d_clean = disease_str.lower().strip()
    canonical_disease, icd11 = SKDR_DISEASE_MAP.get(d_clean, (disease_str.title() if disease_str else "Unknown Disease", None))

    lat, lon = (None, None)
    country = "Indonesia"
    if location_str:
        loc_key = location_str.strip()
        if loc_key in config.LOCATION_COORDS:
            lat, lon = config.LOCATION_COORDS[loc_key]
            country = config.LOCATION_COUNTRIES.get(loc_key, "Indonesia")
        else:
            loc_lower = loc_key.casefold()
            for name, coords in config.LOCATION_COORDS.items():
                if name.casefold() == loc_lower:
                    lat, lon = coords
                    country = config.LOCATION_COUNTRIES.get(name, "Indonesia")
                    location_str = name
                    break

    location_items = []
    if location_str:
        location_items.append(LocationItem(name=location_str, latitude=lat, longitude=lon, country=country))

    disease_mentions = []
    if canonical_disease and canonical_disease != "Unknown Disease":
        disease_mentions.append(DiseaseMention(
            surface_form=disease_str or canonical_disease,
            canonical_name=canonical_disease,
            icd11_code=icd11,
            role="primary",
            evidence="SKDR Official Surveillance Report",
            confidence=0.98,
            resolution_source="skdr_registry",
        ))

    outbreak_alert = deaths_count > 0 or cases_count >= 10

    return AnalyzeResponse(
        language="id",
        normalized_text=text[:1000],
        published_at=report_date,
        location_name=location_str or "Indonesia",
        latitude=lat,
        longitude=lon,
        country=country,
        translated=False,
        translation_provider="none",
        translated_text="",
        original_location_name=location_str,
        symptoms=[],
        disease_extracted=[canonical_disease] if canonical_disease != "Unknown Disease" else [],
        disease_mentions=disease_mentions,
        disease_classification=canonical_disease,
        case_count=cases_count,
        death_count=deaths_count,
        confidence=0.95,
        outbreak_alert=outbreak_alert,
        sentiment="neutral",
        sentiment_score=0.5,
        needs_review=False,
        event_type="surveillance_report",
        event_confidence=0.95,
        relevance_score="high",
        relevance_confidence=0.98,
        source_credibility=1.0,
        source_credibility_label="skdr_official",
        is_health_related=True,
        locations=location_items,
    )
