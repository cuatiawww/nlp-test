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
    location_country = (
        payload.source_country
        or extractors.extract_country_hint(text)
        or country_by_language.get(language, "")
    )
    disease = "UNKNOWN"
    confidence = 0.40
    sentiment = "neutral"
    sentiment_score = 0.5
    event_type = "unknown"
    event_confidence = 0.0
    relevance = "medium"
    relevance_confidence = 0.0

    location = extractors.extract_location(text, country=location_country)
    all_locations = extractors.extract_all_locations(text, country=location_country)
    original_location = location
    if not location and translated_text:
        location = extractors.extract_location(translated_text, country=location_country)
        if not all_locations:
            all_locations = extractors.extract_all_locations(translated_text, country=location_country)
    is_noisy_early = extractors.is_content_too_short_or_noisy(text, has_health_indicators=bool(extractors.extract_diseases(text)))
    if not location and not is_noisy_early:
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
        # Preserve a verified country-level location when no city/province is
        # present in the local gazetteer. Never fabricate a capital city or
        # coordinates for a national report.
        location = location_country
    lat, lon = config.LOCATION_COORDS.get(location, (None, None))
    # A source URL/country hint is stronger than a legacy gazetteer row. This
    # prevents the old generic location name "Sudan" (once seeded with an
    # Indonesian country value) from overriding an explicit Sudan context.
    raw_country = location_country or (config.LOCATION_COUNTRIES.get(location) if location else None) or None
    country = extractors.country_scope(raw_country)
    symptoms = extractors.extract_terms(analysis_text, config.SYMPTOM_DICT)
    # Prefer explicit diseases in the title/opening section. Mentions deeper in
    # an article are often comparisons or differential diagnoses (the Thai
    # Mpox fact sheet also mentions influenza and malaria).
    primary_aliases = sorted(set(
        extractors.extract_alias_diseases(text[:1200])
        + extractors.extract_alias_diseases(analysis_text[:1200])
    ))
    keyword_diseases = sorted(set(
        extractors.extract_diseases(text[:1200])
        + extractors.extract_diseases(analysis_text[:1200])
    ))
    who_mentions = extractors.extract_who_disease_mentions(
        text[:5000] + " " + analysis_text[:5000],
        config.WHO_DISEASE_CONCEPTS,
    )
    who_mentions = sorted(set(
        who_mentions
        + extractors.canonicalize_who_disease_labels(keyword_diseases, config.WHO_DISEASE_CONCEPTS)
    ))
    # Keep all explicit WHO-backed mentions even when a short alias appears
    # early in the article (a situation common in humanitarian situation
    # reports listing several concurrent outbreaks).
    def _rank_diseases(candidates: list[str], sample: str) -> list[str]:
        unique = list(dict.fromkeys([c for c in candidates if c]))
        l_sample = sample.lower()
        def _score(name: str):
            token = name.lower().split()[0] if name else ""
            cnt = l_sample.count(token) if token else 0
            pos = l_sample.find(token) if token and token in l_sample else 999999
            return (-cnt, pos)
        return sorted(unique, key=_score)

    primary_candidates = primary_aliases + keyword_diseases + who_mentions
    primary_extracted = _rank_diseases(primary_candidates, text[:2500] + " " + analysis_text[:2500])
    fallback_extracted = _rank_diseases(extractors.extract_diseases(analysis_text) + who_mentions, analysis_text)
    extracted = primary_extracted or fallback_extracted
    for value in structured.get("diseases") or []:
        if isinstance(value, str) and value.strip():
            extracted.append(value.strip().upper().replace("-", ""))
    extracted = _rank_diseases(extracted, text + " " + analysis_text)
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

            # Prioritize ground truth extracted disease entities if model predicted unrelated disease
            if extracted and (disease == "UNKNOWN" or disease not in extracted):
                disease = extracted[0]
                confidence = max(confidence, 0.80)
            elif disease in extracted:
                confidence = max(confidence, 0.85)

            if extractors.is_outbreak_content(text) or extractors.is_explicit_outbreak_report(analysis_text):
                event_type = "disease outbreak wabah"
                event_confidence = max(event_confidence, 0.90)
                relevance = "high"
                relevance_confidence = max(relevance_confidence, 0.90)
                is_health_related = True
                if sentiment == "positive":
                    sentiment = "negative" if extractors.is_outbreak_content(text) else "neutral" 

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
    is_noisy = extractors.is_content_too_short_or_noisy(text, has_health_indicators=has_keywords)
    if is_noisy and not extracted:
        is_health_related = False
        disease = "UNKNOWN"

    should_use_deepseek = (
        not is_noisy
        and (
            disease == "UNKNOWN"
            or confidence < config.DEEPSEEK_TRIGGER_CONFIDENCE
            or (language not in {"en", "id"} and not extracted)
        )
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
    if who_mentions:
        # An explicit WHO-backed term wins over a generic classifier guess
        opening_text = text[:1500] + " " + analysis_text[:1500]
        opening_who = [w for w in who_mentions if w.lower().split()[0] in opening_text.lower()]
        disease = opening_who[0] if opening_who else who_mentions[0]
        confidence = max(confidence, 0.85)
    if extracted:
        is_health_related = True

    case_count = extractors.extract_case_count(text)
    death_count = extractors.extract_death_count(text)
    explicit_case_count = extractors.has_explicit_case_count(text)
    if translated_text and case_count == 1:
        case_count = extractors.extract_case_count(translated_text)
        explicit_case_count = explicit_case_count or extractors.has_explicit_case_count(translated_text)
    if translated_text and death_count == 0:
        death_count = extractors.extract_death_count(translated_text)
    if case_count == 1 and isinstance(structured.get("case_count"), int):
        case_count = max(0, structured["case_count"])
    if death_count == 0 and isinstance(structured.get("death_count"), int):
        death_count = max(0, structured["death_count"])
    reference_markers = (
        "signs and symptoms", "diagnosis", "treatment", "prevention",
        "symptoms", "health information", "fact sheet", "clinical features",
        "gejala", "informasi kesehatan", "tanda dan gejala", "diagnosis",
        "pengobatan", "perawatan", "pencegahan", "cara penularan",
        "อาการแสดงและอาการ", "การวินิจฉัย", "การรักษา", "การป้องกัน",
    )
    is_reference_content = sum(
        marker in analysis_text.lower() or marker in text.lower()
        for marker in reference_markers
    ) >= 2
    if is_reference_content:
        # Educational/fact-sheet pages contain historical and comparison
        # figures. They are health information, not a local incident report.
        if case_count == 1:
            case_count = 0
        event_type = "health update"
        event_confidence = max(event_confidence, 0.85)
    if case_count == 1 and disease == "UNKNOWN" and not extracted:
        # DEFAULT_CASE_COUNT=1 is useful for disease reports with no explicit
        # number, but must not fabricate a case in a general health article.
        case_count = 0
    if death_count > 0 and not explicit_case_count and case_count == 1:
        # A death-only report (for example "23 deaths") must not inherit the
        # schema's synthetic DEFAULT_CASE_COUNT=1.
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
    explicit_outbreak = extractors.is_explicit_outbreak_report(analysis_text)
    if (
        not explicit_outbreak
        and extractors.is_policy_or_statistical_health_content(analysis_text)
        and case_count == 1
    ):
        # DEFAULT_CASE_COUNT=1 is a fallback for an incident with no number;
        # policy/education pages must not inherit that synthetic case.
        case_count = 0
    outbreak_signal = max(case_count, death_count)
    outbreak_alert = explicit_outbreak and outbreak_signal >= config.OUTBREAK_RULES.get("UNKNOWN", 25)
    # B4: disease-outbreak matching — token-based (bukan partial substring)
    disease_tokens = set(disease.upper().split())
    if "CAMPAK" in disease_tokens or "MEASLES" in disease_tokens:
        disease_tokens.update({"CAMPAK", "MEASLES"})
    matched_disease_rule = False
    for db_name, min_count in config.OUTBREAK_RULES.items():
        if db_name != "UNKNOWN" and (db_name in disease_tokens or any(t in db_name for t in disease_tokens)):
            matched_disease_rule = True
            outbreak_alert = (
                explicit_outbreak
                and outbreak_signal >= min_count
            )
            break
    if explicit_outbreak and who_mentions and not matched_disease_rule:
        outbreak_alert = outbreak_signal >= config.EXPLICIT_KNOWN_DISEASE_MIN_CASES
    if (explicit_outbreak or case_count > 0 or death_count > 0) and disease != "UNKNOWN":
        event_type = "disease outbreak wabah"
        event_confidence = max(event_confidence, 0.85)
    elif is_reference_content or (
        extractors.is_policy_or_statistical_health_content(analysis_text)
        and not explicit_outbreak
    ):
        outbreak_alert = False
        if is_health_related:
            event_type = "health update"
            event_confidence = max(event_confidence, 0.85)

    health_indicator_words = (
        "health", "kesehatan", "kesihatan", "disease", "penyakit", "outbreak", "wabah", "klb",
        "virus", "bakteri", "bacteria", "infection", "infeksi", "vaksin", "vaccin", "imunisasi",
        "hospital", "rumah sakit", "puskesmas", "clinic", "klinik", "pasien", "patient",
        "dokter", "doctor", "epidemi", "pandemi", "symptom", "gejala", "who", "kemenkes", "cdc", "suc khoe", "suc-khoe"
    )
    lower_full = (text[:4000] + " " + analysis_text[:4000]).lower()
    has_health_indicators = any(hw in lower_full for hw in health_indicator_words)

    # UNKNOWN handling: portal overviews from WHO/health agencies remain health-related
    if not disease or disease.strip().upper() == "UNKNOWN":
        if has_health_indicators or symptoms or (payload.source_name and "who" in payload.source_name.lower()):
            is_health_related = True
            event_type = "health update"
            event_confidence = 0.70
            outbreak_alert = False
        else:
            is_health_related = False
            outbreak_alert = False
            event_type = "unknown"
            event_confidence = 0.0
        # Keep confirmed deaths for audit, but remove the synthetic default
        # case count when no actual case number was found.
        if case_count == 1:
            case_count = 0
    needs_review = confidence < config.LOW_CONFIDENCE_THRESHOLD

    source_type = payload.source_type or "web"
    cred_score = config.SOURCE_CREDIBILITY_MAP.get(source_type.lower(), 0.50)
    for key, val in config.SOURCE_CREDIBILITY_MAP.items():
        if key in source_type.lower():
            cred_score = val
            break

    disease = extractors.normalize_disease_display(disease, language=language, text=text)
    extracted = [
        extractors.normalize_disease_display(d, language=language, text=text)
        for d in extracted
    ]
    extracted = list(dict.fromkeys(extracted))

    published_at = payload.published_at or extractors.extract_date_from_text(text)

    return AnalyzeResponse(
        language=language,
        normalized_text=extractors.normalize_text(text),
        published_at=published_at,
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
        locations=all_locations,
    )
