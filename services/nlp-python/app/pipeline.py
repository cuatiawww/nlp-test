import logging
from typing import Optional

from . import config, extractors
from .models.classifier import classify_disease, classify, classify_sentiment, classify_event_type, classify_relevance
from .schemas import AnalyzeRequest, AnalyzeResponse

logger = logging.getLogger(__name__)


def run(payload: AnalyzeRequest) -> AnalyzeResponse:
    text = payload.text
    disease = "UNKNOWN"
    confidence = 0.40
    sentiment = "neutral"
    sentiment_score = 0.5
    event_type = "unknown"
    event_confidence = 0.0
    relevance = "medium"
    relevance_confidence = 0.0

    location = extractors.extract_location(text)
    lat, lon = config.LOCATION_COORDS.get(location, (None, None))
    symptoms = extractors.extract_terms(text, config.SYMPTOM_DICT)
    extracted = extractors.extract_terms(text, config.DISEASE_DICT)
    has_keywords = bool(extracted or symptoms)
    is_health_related = has_keywords

    NON_HEALTH_LABELS = {"NEGATIVE - not health related"}

    if config.NLP_MODEL != "none":
        try:
            zero_shot = config.NLP_MODEL == "fine-tuned"
            if zero_shot:
                disease, confidence = classify_disease(text)
                sentiment, sentiment_score = classify_sentiment(text, model_key="xlm-roberta")
                event_type, event_confidence = classify_event_type(text, model_key="xlm-roberta")
                relevance, relevance_confidence = classify_relevance(text, model_key="xlm-roberta")
            else:
                disease, confidence = classify_disease(text)
                sentiment, sentiment_score = classify_sentiment(text)
                event_type, event_confidence = classify_event_type(text)
                relevance, relevance_confidence = classify_relevance(text)

            # A3: hanya override event type kalau keyword juga match (bukan ML saja)
            if disease != "UNKNOWN" and extracted:
                if event_confidence < 0.3 and "disease" not in event_type.lower() and "wabah" not in event_type.lower():
                    event_type = "disease outbreak wabah"
                    event_confidence = 0.85
                elif "disease" in event_type.lower():
                    event_confidence = max(event_confidence, 0.85)

            # A1: keyword hanya override kalau model confidence RENDAH
            if disease == "UNKNOWN" and extracted and confidence < config.LOW_CONFIDENCE_THRESHOLD:
                disease = extracted[0]
                confidence = max(confidence, 0.60)

            # A1 (cont): model ML dihargai kalau confidence cukup
            if not extracted and confidence < config.LOW_CONFIDENCE_THRESHOLD:
                confidence = min(confidence, 0.30)
                disease = "UNKNOWN"

            # A2 + A4: non-health hanya kalau TIDAKADA keyword sama sekali
            if disease in NON_HEALTH_LABELS or (disease == "UNKNOWN" and not has_keywords):
                is_health_related = False
        except Exception as e:
            logger.warning("NLP inference failed, using regex: %s", e)
            if extracted:
                disease = extracted[0]

    case_count = extractors.extract_case_count(text)
    death_count = extractors.extract_death_count(text)
    outbreak_alert = case_count >= config.OUTBREAK_RULES.get("UNKNOWN", 25)
    # B4: disease-outbreak matching — token-based (bukan partial substring)
    disease_tokens = set(disease.upper().split())
    for db_name, min_count in config.OUTBREAK_RULES.items():
        if db_name != "UNKNOWN" and (db_name in disease_tokens or any(t in db_name for t in disease_tokens)):
            outbreak_alert = case_count >= min_count
            break
    needs_review = confidence < config.LOW_CONFIDENCE_THRESHOLD

    source_type = payload.source_type or "web"
    cred_score = config.SOURCE_CREDIBILITY_MAP.get(source_type.lower(), 0.50)
    for key, val in config.SOURCE_CREDIBILITY_MAP.items():
        if key in source_type.lower():
            cred_score = val
            break

    return AnalyzeResponse(
        language=extractors.detect_language(text),
        normalized_text=extractors.normalize_text(text),
        location_name=location,
        latitude=lat,
        longitude=lon,
        symptoms=symptoms,
        disease_extracted=extracted,
        disease_classification=disease,
        case_count=case_count,
        death_count=death_count,
        confidence=round(confidence, 4),
        outbreak_alert=outbreak_alert,
        sentiment=sentiment,
        sentiment_score=round(sentiment_score, 4),
        needs_review=needs_review,
        event_type=event_type,
        event_confidence=round(event_confidence, 4),
        relevance_score=relevance,
        relevance_confidence=round(relevance_confidence, 4),
        source_credibility=round(cred_score, 2),
        source_credibility_label=source_type,
        is_health_related=is_health_related,
    )
