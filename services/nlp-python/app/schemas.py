from typing import Optional
from pydantic import BaseModel


class AnalyzeRequest(BaseModel):
    text: str
    source_type: Optional[str] = None
    source_name: Optional[str] = None
    published_at: Optional[str] = None
    source_language: Optional[str] = None
    source_country: Optional[str] = None
    source_url: Optional[str] = None
    historical_fast: bool = False
    rules_only: bool = False
    interactive: bool = False


def as_interactive(payload: "AnalyzeRequest") -> "AnalyzeRequest":
    """Force interactive=True without duplicating a keyword argument.

    ``model_dump()`` already includes ``interactive=False``. Passing
    ``interactive=True`` after unpacking that dump raises TypeError and
    aborts NLP for every URL analysis job.
    """
    data = payload.model_dump()
    data["interactive"] = True
    return AnalyzeRequest.model_validate(data)


class LocationItem(BaseModel):
    name: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    country: Optional[str] = None
    geocode_confidence: Optional[float] = None
    geocode_needs_review: bool = False


class DiseaseMention(BaseModel):
    surface_form: str
    canonical_name: str
    icd11_code: Optional[str] = None
    role: str = "secondary"
    evidence: str = ""
    confidence: float = 0.0
    resolution_source: str = "local"



class SubEvent(BaseModel):
    """A single decomposed event from a multi-event document."""
    disease: str
    disease_icd11_code: Optional[str] = None
    location_name: str
    country: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    case_count: int = 0
    death_count: int = 0
    evidence: str = ""


class AnalyzeResponse(BaseModel):
    language: str
    normalized_text: str
    summary: str = ""
    published_at: Optional[str] = None
    publication_date: Optional[str] = None
    event_date: Optional[str] = None
    location_name: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    country: Optional[str] = None
    translated: bool = False
    translation_provider: str = "none"
    translated_text: str = ""
    original_location_name: Optional[str] = None
    symptoms: list[str]
    disease_extracted: list[str]
    disease_mentions: list[DiseaseMention] = []
    disease_classification: str
    case_count: int
    death_count: int
    confirmed_cases: Optional[int] = None
    suspected_cases: Optional[int] = None
    hospitalizations: Optional[int] = None
    evidence: list[str] = []
    case_count_unknown: bool = False
    province: Optional[str] = None
    city: Optional[str] = None
    geocode_confidence: Optional[float] = None
    geocode_needs_review: bool = False
    confidence: float
    outbreak_alert: bool
    sentiment: str = "neutral"
    sentiment_score: float = 0.5
    needs_review: bool = False
    event_type: str = "unknown"
    event_category: str = "other"
    event_confidence: float = 0.0
    relevance_score: str = "medium"
    relevance_confidence: float = 0.0
    source_credibility: float = 0.5
    source_credibility_label: str = "unknown"
    is_health_related: bool = True
    locations: list[LocationItem] = []
    sub_events: list[SubEvent] = []
    nlp_pipeline_version: str = ""
    count_period_type: str = "unknown"
    event_date_start: Optional[str] = None
    event_date_end: Optional[str] = None
    date_needs_review: bool = False
    # Collapsed one-row-per-URL summary. Atomic events stay in sub_events.
    disease_display: Optional[str] = None
    location_display: Optional[str] = None
    cases_display: Optional[str] = None
    deaths_display: Optional[str] = None
    display_dimension: Optional[str] = None
