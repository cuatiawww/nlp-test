from typing import Optional
from pydantic import BaseModel


class AnalyzeRequest(BaseModel):
    text: str
    source_type: Optional[str] = None
    source_name: Optional[str] = None
    published_at: Optional[str] = None


class AnalyzeResponse(BaseModel):
    language: str
    normalized_text: str
    location_name: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    symptoms: list[str]
    disease_extracted: list[str]
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
