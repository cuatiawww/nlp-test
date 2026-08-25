import logging
from typing import Optional

from . import config, extractors
from .models.classifier import classify_disease, classify, classify_sentiment, classify_event_type, classify_relevance
from .schemas import AnalyzeRequest, AnalyzeResponse
from .translator import translate_and_extract

logger = logging.getLogger(__name__)


def run(payload: AnalyzeRequest) -> AnalyzeResponse:
    text = payload.text
    language = extractors.detect_language(text)
    if language == "unknown" and payload.source_language:
        language = payload.source_language
    translation = translate_and_extract(text, language)
    translated_text = translation["translated_text"]
    analysis_text = translated_text or text
    structured = translation["structured"]
    country_by_language = {
        "id": "Indonesia", "ms": "Malaysia", "th": "Thailand",
        "vi": "Vietnam", "km": "Cambodia", "lo": "Laos",
        "my": "Myanmar", "tl": "Philippines", "tet": "Timor-Leste",
    }
    location_country = payload.source_country or country_by_language.get(language, "")
    disease = "UNKNOWN"
    confidence = 0.40
    sentiment = "neutral"
    sentiment_score = 0.5
    event_type = "unknown"
    event_confidence = 0.0
    relevance = "medium"
    relevance_confidence = 0.0

    location = extractors.extract_location(text)
    original_location = location
    if not location and translated_text:
        location = extractors.extract_location(translated_text)
    if not location:
        try:
            from .deepseek import detect_location
            resolved_location = detect_location(
                analysis_text,
                source_language=payload.source_language or language,
                source_country=location_country,
            )
            if resolved_location:
                location = resolved_location["location_name"]
        except Exception as e:
            logger.info("DeepSeek location fallback unavailable: %s", e)

    if not location:
        fallback_country = location_country
        fallback_locations = {
            "Brunei": "Bandar Seri Begawan", "Cambodia": "Phnom Penh",
            "Indonesia": "Jakarta", "Laos": "Vientiane", "Malaysia": "Kuala Lumpur",
            "Myanmar": "Naypyidaw", "Philippines": "Manila", "Singapore": "Singapore",
            "Thailand": "Bangkok", "Timor-Leste": "Dili", "Vietnam": "Hanoi",
        }
        location = fallback_locations.get(fallback_country)
    lat, lon = config.LOCATION_COORDS.get(location, (None, None))
    country = config.LOCATION_COUNTRIES.get(location) if location else (location_country or None)
    symptoms = extractors.extract_terms(analysis_text, config.SYMPTOM_DICT)
    extracted = extractors.extract_terms(analysis_text, config.DISEASE_DICT)
    for value in structured.get("diseases") or []:
        if isinstance(value, str) and value.strip():
            extracted.append(value.strip().upper().replace("-", ""))
    extracted = sorted(set(extracted))
    has_keywords = bool(extracted or symptoms)
    is_health_related = has_keywords

    NON_HEALTH_LABELS = {"NEGATIVE - not health related"}

    if config.NLP_MODEL != "none":
        try:
            zero_shot = config.NLP_MODEL == "fine-tuned"
            if zero_shot:
                disease, confidence = classify_disease(analysis_text)
                if payload.historical_fast:
                    # Historical disease training does not need the three
                    # additional zero-shot passes. Keep their fields valid
                    # while retaining the disease model's result.
                    relevance = "high" if disease != "UNKNOWN" or has_keywords else "low"
                    relevance_confidence = confidence if relevance == "high" else 0.99
                else:
                    sentiment, sentiment_score = classify_sentiment(analysis_text, model_key="xlm-roberta")
                    event_type, event_confidence = classify_event_type(analysis_text, model_key="xlm-roberta")
                    relevance, relevance_confidence = classify_relevance(analysis_text, model_key="xlm-roberta")
            else:
                disease, confidence = classify_disease(analysis_text)
                sentiment, sentiment_score = classify_sentiment(analysis_text)
                event_type, event_confidence = classify_event_type(analysis_text)
                relevance, relevance_confidence = classify_relevance(analysis_text)

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

    # Optional accuracy fallback: DeepSeek may translate an unseen disease name,
    # but it can only select a concept already resolved to WHO ICD-11 in the DB.
    # Any API failure leaves the deterministic/model result unchanged.
    should_use_deepseek = (
        disease == "UNKNOWN"
        or confidence < config.DEEPSEEK_TRIGGER_CONFIDENCE
        or (language not in {"en", "id"} and not extracted)
    )
    if should_use_deepseek:
        try:
            from .deepseek import detect_disease
            resolved = detect_disease(analysis_text)
            if resolved:
                disease = resolved["canonical_name"]
                confidence = resolved["confidence"]
                extracted = list(dict.fromkeys([*extracted, disease]))
                has_keywords = True
                is_health_related = True
        except Exception as e:
            logger.info("DeepSeek fallback unavailable; continuing without it: %s", e)

    # An explicit disease entity found in locally translated text is stronger
    # than a contradictory generic zero-shot label (observed as Thai COVID-19
    # being classified as hantavirus). This path does not require an API call.
    if translated_text and extracted:
        disease = extracted[0]
        confidence = max(confidence, 0.85)

    case_count = extractors.extract_case_count(text)
    death_count = extractors.extract_death_count(text)
    if translated_text and case_count == 1:
        case_count = extractors.extract_case_count(translated_text)
    if translated_text and death_count == 0:
        death_count = extractors.extract_death_count(translated_text)
    if case_count == 1 and isinstance(structured.get("case_count"), int):
        case_count = max(0, structured["case_count"])
    if death_count == 0 and isinstance(structured.get("death_count"), int):
        death_count = max(0, structured["death_count"])
    if case_count == 1 and disease == "UNKNOWN" and not extracted:
        # DEFAULT_CASE_COUNT=1 is useful for disease reports with no explicit
        # number, but must not fabricate a case in a general health article.
        case_count = 0
    if structured.get("is_health_related") is True:
        is_health_related = True
    if is_health_related and disease == "UNKNOWN" and not extracted:
        event_type = "health update"
        event_confidence = max(event_confidence, 0.75)
    elif is_health_related and not any(
        token in event_type.lower()
        for token in ("disease", "outbreak", "wabah", "health", "medical")
    ):
        event_type = "health update"
        event_confidence = max(event_confidence, 0.75)
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
        language=language,
        normalized_text=extractors.normalize_text(text),
        location_name=location,
        latitude=lat,
        longitude=lon,
        country=country,
        translated=translation["translated"],
        translation_provider=translation["provider"],
        translated_text=translated_text,
        original_location_name=original_location,
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
