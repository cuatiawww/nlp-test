from typing import Any, Optional
from pydantic import BaseModel, Field


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
    original_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    country: Optional[str] = None
    country_iso3: Optional[str] = None
    admin1: Optional[str] = None
    admin2: Optional[str] = None
    admin_level: Optional[int] = None
    geocode_confidence: Optional[float] = None
    geocode_needs_review: bool = False
    evidence: str = ""
    evidence_offset_start: Optional[int] = None
    evidence_offset_end: Optional[int] = None


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
    admin1: Optional[str] = None
    admin2: Optional[str] = None
    country_iso3: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    case_count: int = 0
    death_count: int = 0
    metric_type: str = "cases"
    unit: str = "persons"
    metric_value_min: Optional[float] = None
    metric_value_max: Optional[float] = None
    evidence: str = ""
    evidence_offset_start: Optional[int] = None
    evidence_offset_end: Optional[int] = None
    event_date_start: Optional[str] = None
    event_date_end: Optional[str] = None
    epistemic_status: str = "reported"
    metric_qualifier: Optional[str] = None
    time_frame: Optional[str] = None
    temporal_context: str = "current"
    disease_confidence: Optional[float] = None
    location_confidence: Optional[float] = None
    relation_confidence: Optional[float] = None
    needs_review: bool = False
    relations: list[dict[str, Any]] = Field(default_factory=list)
    metrics: list[dict[str, Any]] = Field(default_factory=list)
    provenance: dict[str, Any] = Field(default_factory=dict)
    validation_flags: list[str] = Field(default_factory=list)
    confidence: float = 0.90
    source_language: Optional[str] = None
    source_script: Optional[str] = None
    source_sentence_id: Optional[str] = None
    source_evidence: str = ""
    evidence_is_translated: bool = False
    evidence_offset_space: str = "original"


class AnalyzeResponse(BaseModel):
    language: str
    language_confidence: float = 0.0
    language_detection_method: str = "unknown"
    script: str = "Latin"
    original_text: str = ""
    evidence_offset_space: str = "original"
    normalized_text: str
    summary: str = ""
    published_at: Optional[str] = None
    publication_date: Optional[str] = None
    event_date: Optional[str] = None
    location_name: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    country: Optional[str] = None
    country_iso3: Optional[str] = None
    admin1_name: Optional[str] = None
    admin2_name: Optional[str] = None
    # Publisher/source metadata is deliberately separate from the country
    # where the epidemiological event occurred.
    source_country: Optional[str] = None
    surveillance_scope: Optional[str] = None
    translated: bool = False
    translation_provider: str = "none"
    translated_text: str = ""
    translation_alignment: str = "sentence_id_only"
    original_location_name: Optional[str] = None
    symptoms: list[str]
    disease_extracted: list[str]
    disease_mentions: list[DiseaseMention] = Field(default_factory=list)
    disease_classification: str
    case_count: int
    death_count: int
    confirmed_cases: Optional[int] = None
    suspected_cases: Optional[int] = None
    hospitalizations: Optional[int] = None
    evidence: list[str] = Field(default_factory=list)
    epidemiological_evidence: list[Any] = Field(default_factory=list)
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
    locations: list[LocationItem] = Field(default_factory=list)
    sub_events: list[SubEvent] = Field(default_factory=list)
    nlp_pipeline_version: str = ""
    count_period_type: str = "unknown"
    event_date_start: Optional[str] = None
    event_date_end: Optional[str] = None
    date_needs_review: bool = False
    epistemic_status: str = "reported"
    validation_flags: list[str] = Field(default_factory=list)
    # Collapsed one-row-per-URL summary. Atomic events stay in sub_events.
    disease_display: Optional[str] = None
    location_display: Optional[str] = None
    cases_display: Optional[str] = None
    deaths_display: Optional[str] = None
    display_dimension: Optional[str] = None
