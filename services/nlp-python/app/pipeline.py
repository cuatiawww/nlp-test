import logging
import re
from typing import Optional

from . import config, extractors
from .models.classifier import classify_disease, classify, classify_sentiment, classify_event_type, classify_relevance
from .schemas import AnalyzeRequest, AnalyzeResponse, SubEvent, DiseaseMention
from .translator import translate_and_extract
from .surveillance_extraction import source_reliability_score
from .epidemiology import (
    event_category as normalize_event_category,
    evidence_sentences,
    extract_event_date,
    extract_labeled_counts,
    normalize_publication_date,
)

logger = logging.getLogger(__name__)


def _build_article_summary(
    text: str,
    disease: str,
    location: Optional[str],
    country: Optional[str],
    case_count: int,
    death_count: int,
) -> str:
    """Build a short evidence-preserving summary for the URL analysis view.

    This is intentionally extractive/deterministic: it can highlight the
    disease, place, and explicit case/death sentence without inventing facts
    when an optional LLM is unavailable or slow.
    """
    raw_sentences = re.split(r"(?<=[.!?。！？])\s+|\n+", text or "")
    sentences = []
    for raw in raw_sentences:
        sentence = re.sub(r"\s+", " ", raw).strip(" \t\r\n-–—")
        if len(sentence) >= 35 and sentence not in sentences:
            sentences.append(sentence)
    if not sentences:
        return (text or "").strip()[:500]

    disease_terms = [term.casefold() for term in {disease, "stroke", "đột quỵ", "dot quy"} if term]
    location_terms = [term.casefold() for term in {location, country} if term]
    scored: list[tuple[int, int, str]] = []
    for index, sentence in enumerate(sentences):
        folded = sentence.casefold()
        score = 0
        if any(term in folded for term in disease_terms):
            score += 5
        if any(term in folded for term in location_terms):
            score += 3
        if re.search(r"\b(?:case|cases|kasus|patient|patients|pasien|death|deaths|kematian|hơn|lebih dari|more than|over)\b", folded):
            score += 5
        if re.search(r"\d[\d.,]*", sentence):
            score += 2
        if re.search(r"\b(?:conference|congress|konferensi|hội nghị|reported|reported|melaporkan|mencatat|traced|model|program|prevention|pencegahan)\b", folded):
            score += 1
        scored.append((score, index, sentence))

    selected = sorted(scored, key=lambda item: (-item[0], item[1]))[:3]
    selected = sorted(selected, key=lambda item: item[1])
    summary = " ".join(item[2] for item in selected)
    # Keep the result suitable for a card while retaining complete sentences.
    if len(summary) > 900:
        summary = summary[:897].rsplit(" ", 1)[0] + "..."
    return summary


def run(payload: AnalyzeRequest) -> AnalyzeResponse:
    text = extractors.repair_mojibake(payload.text)
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
        extractors.normalize_country(payload.source_country)
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
    if not location and not is_noisy_early and not payload.historical_fast:
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
    raw_country = location_country or (config.LOCATION_COUNTRIES.get(location) if location else None) or None
    country = extractors.country_scope(raw_country)
    symptoms = extractors.extract_terms(analysis_text, config.SYMPTOM_DICT)
    
    # Prefer explicit diseases in the title/opening section.
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
            clf_sample = (analysis_text or text)[:600]
            zero_shot = config.NLP_MODEL == "fine-tuned"
            if extracted:
                disease = extracted[0]
                confidence = 0.85
            else:
                disease, confidence = classify_disease(clf_sample)
            
            if payload.historical_fast:
                relevance = "high" if disease != "UNKNOWN" or has_keywords else "low"
                relevance_confidence = confidence if relevance == "high" else 0.99
            else:
                sentiment, sentiment_score = classify_sentiment(clf_sample, model_key="xlm-roberta" if zero_shot else None)
                event_type, event_confidence = classify_event_type(clf_sample, model_key="xlm-roberta" if zero_shot else None)
                relevance, relevance_confidence = classify_relevance(clf_sample, model_key="xlm-roberta" if zero_shot else None)

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

            if extractors.is_explicit_outbreak_report(text) or extractors.is_explicit_outbreak_report(analysis_text):
                event_type = "disease outbreak wabah"
                event_confidence = max(event_confidence, 0.90)
                relevance = "high"
                relevance_confidence = max(relevance_confidence, 0.90)
                is_health_related = True
                if sentiment == "positive":
                    sentiment = "negative" if extractors.is_explicit_outbreak_report(text) else "neutral" 

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

    is_noisy = extractors.is_content_too_short_or_noisy(text, has_health_indicators=has_keywords)
    if is_noisy and not extracted:
        is_health_related = False
        disease = "UNKNOWN"

    # Multiple explicit diseases are common in prevention/advisory articles.
    # Ask the constrained agent to arbitrate the primary disease instead of
    # allowing alphabetical/global-frequency ordering to decide it.
    should_use_deepseek = (
        not payload.historical_fast
        and not is_noisy
        and (
            disease == "UNKNOWN"
            or confidence < config.DEEPSEEK_TRIGGER_CONFIDENCE
            or (language not in {"en", "id"} and not extracted)
            or len(extracted) > 1
        )
    )
    if should_use_deepseek:
        try:
            from .deepseek import detect_disease
            resolved = detect_disease(analysis_text)
            if resolved:
                disease = resolved["canonical_name"]
                confidence = resolved["confidence"]
                extracted = [
                    disease,
                    *[item for item in extracted if item.lower() != disease.lower()],
                ]
                has_keywords = True
                is_health_related = True
            elif (
                disease == "UNKNOWN"
                or confidence < config.DEEPSEEK_TRIGGER_CONFIDENCE
            ):
                # Dynamic WHO ICD-11 Discovery & Self-Learning
                from .icd11 import resolve_and_learn_disease
                dynamic_resolved = resolve_and_learn_disease(analysis_text or text, language=language)
                if dynamic_resolved:
                    disease = dynamic_resolved["canonical_name"]
                    confidence = dynamic_resolved["confidence"]
                    extracted = [disease, *[x for x in extracted if x != disease]]
                    has_keywords = True
                    is_health_related = True
        except Exception as e:
            logger.info("DeepSeek / WHO ICD-11 discovery fallback unavailable: %s", e)

    if translated_text and extracted:
        disease = extracted[0]
        confidence = max(confidence, 0.85)
    if who_mentions and disease == "UNKNOWN":
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
        if case_count == 1:
            case_count = 0
        event_type = "health update"
        event_confidence = max(event_confidence, 0.85)
    if case_count == 1 and disease == "UNKNOWN" and not extracted:
        case_count = 0
    if death_count > 0 and not explicit_case_count and case_count == 1:
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
        case_count = 0
    outbreak_signal = max(case_count, death_count)
    outbreak_alert = explicit_outbreak and outbreak_signal >= config.OUTBREAK_RULES.get("UNKNOWN", 25)
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
        if case_count == 1:
            case_count = 0
    needs_review = confidence < config.LOW_CONFIDENCE_THRESHOLD

    source_type = payload.source_type or "web"
    cred_score = source_reliability_score(
        source_name=payload.source_name,
        source_type=source_type,
        source_url=payload.source_url,
    )

    def _canonical_display(value: str) -> str:
        return extractors.canonical_disease_name(
            value,
            concepts=config.WHO_DISEASE_CONCEPTS,
        )

    disease = _canonical_display(disease)
    extracted = [_canonical_display(d) for d in extracted]
    extracted = list(dict.fromkeys(extracted))

    # Resolve every explicit mention, including secondary diseases. The agent
    # chooses the primary disease, but WHO validation is applied to the full
    # mention set so related diseases are not lost.
    resolved_concept_overrides = {}
    try:
        from .icd11 import resolve_disease_term
        term_resolutions = {}
        for candidate in extracted[:12]:
            term_resolutions[candidate] = resolve_disease_term(
                candidate, language=language, sample_text=text
            )
        for candidate, resolved_term in term_resolutions.items():
            if resolved_term and resolved_term.get("canonical_name"):
                canonical = resolved_term["canonical_name"]
                resolved_concept_overrides[canonical.casefold()] = resolved_term
                extracted = [
                    canonical if value == candidate else value
                    for value in extracted
                ]
                if disease == candidate:
                    disease = canonical
                    confidence = max(confidence, resolved_term.get("confidence", 0.90))
        extracted = list(dict.fromkeys(extracted))
    except Exception as exc:
        logger.info("WHO term resolution unavailable: %s", exc)

    def _norm_disease(value: str) -> str:
        # Keep Unicode disease names (Thai/Lao/Khmer/etc.) available for
        # evidence lookup after alias matching.
        return re.sub(r"[^\w\s-]+", " ", (value or "").lower(), flags=re.UNICODE).strip()

    def _concept_for(value: str):
        normalized = _norm_disease(value)
        if not normalized:
            return None
        # A concept resolved through the live WHO API may not be in the
        # startup cache yet. Keep that validated result attached to this
        # article so the disease mention receives its ICD-11 code now.
        live_concept = resolved_concept_overrides.get(normalized)
        if live_concept and live_concept.get("ontology_code"):
            return {
                "canonical_name": live_concept.get("canonical_name") or value,
                "english_name": live_concept.get("english_name") or value,
                "ontology_code": live_concept.get("ontology_code"),
                "ontology_uri": live_concept.get("ontology_uri"),
                "aliases": [],
            }
        for concept in config.WHO_DISEASE_CONCEPTS:
            names = [concept.get("canonical_name"), concept.get("english_name")]
            names.extend(
                item.get("alias") if isinstance(item, dict) else item
                for item in (concept.get("aliases") or [])
            )
            cleaned = [_norm_disease(str(name or "")) for name in names]
            if normalized in cleaned or any(
                len(normalized) >= 4 and (normalized in name or name in normalized)
                for name in cleaned if name
            ):
                return concept
        return None

    def _mention_evidence(value: str, concept) -> tuple[str, str]:
        names = [value]
        if concept:
            names.extend([concept.get("canonical_name"), concept.get("english_name")])
            names.extend(
                item.get("alias") if isinstance(item, dict) else item
                for item in (concept.get("aliases") or [])
            )
        for sentence in re.split(r"(?<=[.!?])\s+|\n+", text):
            if any(name and str(name).lower() in sentence.lower() for name in names):
                surface = next(
                    (str(name) for name in names if name and str(name).lower() in sentence.lower()),
                    value,
                )
                return surface, sentence.strip()[:500]
        return value, text[:500].strip()

    disease_mentions: list[DiseaseMention] = []
    for candidate in extracted:
        concept = _concept_for(candidate)
        canonical = concept.get("canonical_name") if concept else candidate
        surface, evidence = _mention_evidence(candidate, concept)
        disease_mentions.append(
            DiseaseMention(
                surface_form=surface,
                canonical_name=canonical,
                icd11_code=concept.get("ontology_code") if concept else None,
                role="primary" if _norm_disease(canonical) == _norm_disease(disease) else "secondary",
                evidence=evidence,
                confidence=max(confidence if canonical == disease else 0.70, 0.0),
                resolution_source=("WHO ICD-11" if concept and concept.get("ontology_code") else "keyword/agent"),
            )
        )

    if config.ICD11_CANONICAL_OUTPUT_ONLY:
        from .icd11 import project_icd11_public_output

        public_projection = project_icd11_public_output(
            primary=disease,
            extracted=extracted,
            mentions=disease_mentions,
        )
        for index in public_projection["unresolved_indexes"]:
            # Keep the surface form/evidence for review, but prevent an
            # unvalidated classifier or agent label from becoming a public
            # disease name or dashboard aggregation key.
            disease_mentions[index].canonical_name = "UNKNOWN"
            disease_mentions[index].role = "mentioned"
            disease_mentions[index].resolution_source = "pending_icd11"
        disease = public_projection["primary"]
        extracted = public_projection["extracted"]
        if public_projection["unresolved_indexes"]:
            needs_review = True

    # Publication metadata and event dates describe different facts. Body
    # dates must never silently become the article publication date.
    published_at = normalize_publication_date(payload.published_at)
    event_date = extract_event_date(text)
    typed_counts = extract_labeled_counts(text)
    evidence = evidence_sentences(text)

    # --- Multi-event extraction ---
    try:
        from .multi_event_extractor import extract_multi_events
        multi_events = extract_multi_events(
            text=text,
            primary_disease=disease,
            primary_location=location,
            diseases_extracted=extracted,
            locations=[loc.model_dump() if hasattr(loc, 'model_dump') else loc for loc in all_locations],
            case_count=case_count,
            death_count=death_count,
        )
        sub_events = [
            SubEvent(
                disease=evt.get("disease", disease),
                location_name=evt.get("location_name", ""),
                country=evt.get("country"),
                latitude=evt.get("latitude"),
                longitude=evt.get("longitude"),
                case_count=evt.get("case_count", 0),
                death_count=evt.get("death_count", 0),
                evidence=evt.get("evidence", ""),
            )
            for evt in multi_events
        ]
    except Exception as exc:
        logger.warning("Multi-event extraction failed: %s", exc)
        sub_events = []

    # Project the same high-precision relational decision into the legacy
    # response. LLM supplementation is skipped here because the main worker
    # already has its own bounded agent stages; the dedicated structured
    # endpoint may opt into it.
    try:
        from .surveillance_extraction import (
            GazetteerLinker, aggregate_relation_totals, build_surveillance_output,
            extract_metric_relations,
        )
        strict_output = build_surveillance_output(
            text,
            published_at=published_at,
            diseases=extracted,
            source_name=payload.source_name,
            source_type=source_type,
            source_url=payload.source_url,
            include_llm=False,
        )
        relational_events = extract_metric_relations(
            text, linker=GazetteerLinker(), published_date=published_at,
        )
        if strict_output.locations:
            outbreak_alert = strict_output.outbreak_alert
            relevance = strict_output.health_relevance.lower()
            relevance_confidence = max(relevance_confidence, 0.90)
            is_health_related = is_health_related or strict_output.health_related
            cred_score = strict_output.source_reliability_score
            if relational_events:
                # The legacy response has one summary count. Use the sum of
                # explicit country/province relations, never the first number
                # found (which can be a strain number such as H3N2).
                case_count, death_count = aggregate_relation_totals(relational_events)
                explicit_case_count = case_count > 0
                first_relation = relational_events[0]
                location = first_relation.location.name
                country = first_relation.location.country
                lat = first_relation.location.latitude
                lon = first_relation.location.longitude
                all_locations = [
                    {
                        "name": item.location.name,
                        "latitude": item.location.latitude,
                        "longitude": item.location.longitude,
                        "country": item.location.country,
                    }
                    for item in relational_events
                ]
            if len(relational_events) >= 2:
                event_disease = strict_output.disease_classification[0] if strict_output.disease_classification else disease
                disease = event_disease
                extracted = [event_disease]
                sub_events = [
                    SubEvent(
                        disease=event_disease,
                        location_name=item.location.name,
                        country=item.location.country,
                        latitude=item.location.latitude,
                        longitude=item.location.longitude,
                        case_count=item.cases,
                        death_count=item.deaths or 0,
                        evidence=item.evidence,
                    )
                    for item in relational_events
                ]
    except Exception as exc:
        logger.info("Strict surveillance projection unavailable in legacy path: %s", exc)

    summary = _build_article_summary(
        text,
        disease=disease,
        location=location,
        country=country,
        case_count=case_count,
        death_count=death_count,
    )

    return AnalyzeResponse(
        language=language,
        normalized_text=extractors.normalize_text(text),
        summary=summary,
        published_at=published_at,
        publication_date=published_at,
        event_date=event_date,
        location_name=location,
        locations=all_locations,
        original_location=original_location,
        country=country,
        latitude=lat,
        longitude=lon,
        symptoms=symptoms,
        disease_extracted=extracted,
        disease_mentions=disease_mentions,
        disease_classification=disease,
        case_count=case_count,
        death_count=death_count,
        confirmed_cases=typed_counts["confirmed_cases"],
        suspected_cases=typed_counts["suspected_cases"],
        hospitalizations=typed_counts["hospitalizations"],
        evidence=evidence,
        confidence=confidence,
        outbreak_alert=outbreak_alert,
        sentiment=sentiment,
        sentiment_score=sentiment_score,
        event_type=event_type,
        event_category=normalize_event_category(event_type, outbreak_alert),
        event_confidence=event_confidence,
        relevance_score=relevance,
        relevance_confidence=relevance_confidence,
        source_credibility=cred_score,
        source_credibility_label=source_type,
        is_health_related=is_health_related,
        needs_review=needs_review,
        sub_events=sub_events,
    )
