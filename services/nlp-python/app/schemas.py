from typing import Optional
from pydantic import BaseModel


class AnalyzeRequest(BaseModel):
    text: str
    source_type: Optional[str] = None
    source_name: Optional[str] = None
    published_at: Optional[str] = None
    source_language: Optional[str] = None
    source_country: Optional[str] = None
    historical_fast: bool = False


class LocationItem(BaseModel):
    name: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    country: Optional[str] = None


class DiseaseMention(BaseModel):
    surface_form: str
    canonical_name: str
    icd11_code: Optional[str] = None
    role: str = "secondary"
    evidence: str = ""
    confidence: float = 0.0
    resolution_source: str = "local"


class AnalyzeResponse(BaseModel):
    language: str
    normalized_text: str
    published_at: Optional[str] = None
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
    confidence: float
    outbreak_alert: bool
    sentiment: str = "neutral"
    sentiment_score: float = 0.5
    needs_review: bool = False
    event_type: str = "unknown"
    event_confidence: float = 0.0
    relevance_score: str = "medium"
    relevance_confidence: float = 0.0
    source_credibility: float = 0.5
    source_credibility_label: str = "unknown"
    is_health_related: bool = True
    locations: list[LocationItem] = []
