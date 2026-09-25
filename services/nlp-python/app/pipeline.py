import logging
import re
from functools import partial
from typing import Optional, Any

from . import config, extractors
from .llm_gate import should_escalate_to_llm
from .models.classifier import classify_disease, classify, classify_sentiment, classify_event_type, classify_relevance
from .schemas import AnalyzeRequest, AnalyzeResponse, SubEvent, DiseaseMention
from .translator import translate_and_extract
from .multilingual import detect_language_profile, normalize_language_code
from .surveillance_extraction import source_reliability_score
from .epidemiology import (
    calibrate_outbreak_alert,
    classify_epistemic_status,
    event_category as normalize_event_category,
    evidence_sentences,
    extract_event_date,
    extract_event_period,
    extract_labeled_counts,
    normalize_publication_date,
    validate_surveillance_facts,
)

logger = logging.getLogger(__name__)


def _primary_article_boundary(text: str) -> int | None:
    """Return the first obvious syndicated-footer boundary, if present.

    Feeds sometimes concatenate a second article after the primary report
    (for example a ``Vietnam+`` attribution).  Keeping that tail as context
    is useful, but its metrics must not replace the primary article's event.
    """
    matches = [
        match.start()
        for match in re.finditer(
            r"(?:\(\s*(?:vietnam\+|source:)\s*\)|\b(?:vietnam\+|source:)\s*|\bBộ\s+Y\s+tế\s*:)",
            text or "",
            re.IGNORECASE,
        )
    ]
    return min(matches) if matches else None


def _location_is_source_grounded(name: str | None, text: str) -> bool:
    """Require an LLM locality to be present in the original source text."""
    candidate = " ".join(str(name or "").split()).strip()
    if not candidate:
        return False
    names = [candidate]
    for alias, canonical in config.LOCATION_ALIASES.items():
        if str(canonical).casefold() == candidate.casefold():
            if str(alias).casefold() not in config.LOCATION_STOPWORDS:
                names.append(str(alias))
    return any(
        re.search(rf"(?<!\w){re.escape(value)}(?!\w)", text or "", re.IGNORECASE)
        for value in names
        if value
    )


def _interactive_analysis_text(text: str) -> str:
    """Keep interactive URL analysis on lede+body, not a full crawl dump."""
    limit = int(getattr(config, "INTERACTIVE_ANALYSIS_MAX_CHARS", 6000) or 6000)
    raw = text or ""
    if len(raw) <= limit:
        return raw
    # Prefer a clean sentence boundary near the cap so counts in the lede
    # remain intact while long sidebars/related stories are dropped.
    cut = raw[:limit]
    for sep in (". ", "。", "! ", "? ", "\n\n", "\n"):
        pos = cut.rfind(sep)
        if pos >= max(800, limit // 3):
            return cut[: pos + len(sep)].strip()
    return cut.rsplit(" ", 1)[0].strip() or cut


def _stage_mark(stages: dict[str, float], name: str, started: float) -> float:
    import time as _time
    now = _time.monotonic()
    stages[name] = round(now - started, 3)
    return now


def _guard_event_location_country(
    location: Optional[str],
    event_country: Optional[str],
) -> tuple[Optional[str], bool]:
    """Downgrade a conflicting locality to the explicit event country.

    Gazetteer coordinates are never allowed to override an article's explicit
    country. The original locality is kept by ``original_location_name`` and
    the caller adds a review flag; the public event receives a safe country
    centroid instead of a cross-country pin.
    """

    if not location or not event_country:
        return location, False
    place_hierarchy = extractors.resolve_location_hierarchy(location)
    place_country = extractors.normalize_country(place_hierarchy.get("country"))
    normalized_event = extractors.normalize_country(event_country)
    if (
        place_country
        and normalized_event
        and place_country.casefold() != normalized_event.casefold()
    ):
        return normalized_event, True
    return location, False


def _attach_location_provenance(locations: list[dict[str, Any]], source: str) -> list[dict[str, Any]]:
    """Attach source spelling and offsets without deriving them from translation."""

    aliases_by_canonical: dict[str, list[str]] = {}
    for alias, canonical in extractors.active_location_aliases().items():
        aliases_by_canonical.setdefault(str(canonical).casefold(), []).append(str(alias))
    result: list[dict[str, Any]] = []
    for raw_item in locations or []:
        item = dict(raw_item) if isinstance(raw_item, dict) else raw_item.model_dump()
        canonical = str(item.get("name") or "")
        candidates = [canonical, *aliases_by_canonical.get(canonical.casefold(), [])]
        found = next(
            ((candidate, source.casefold().find(candidate.casefold())) for candidate in candidates if candidate),
            (canonical, -1),
        )
        original_name, offset = found
        item["original_name"] = original_name if offset >= 0 else None
        item["evidence"] = source[offset:offset + len(original_name)] if offset >= 0 else ""
        item["evidence_offset_start"] = offset if offset >= 0 else None
        item["evidence_offset_end"] = offset + len(original_name) if offset >= 0 else None
        result.append(item)
    return result


def _build_article_summary(
    text: str,
    disease: str,
    location: Optional[str],
    country: Optional[str],
    case_count: int,
    death_count: int,
    source_country: Optional[str] = None,
    surveillance_scope: Optional[str] = None,
    **kwargs: Any,
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
    import time as _time
    _run_started = _time.monotonic()
    _stage_t0 = _run_started
    _stages: dict[str, float] = {}
    _location_resolution_token = extractors.begin_location_resolution_stats()
    original_text = payload.text or ""
    text = extractors.repair_mojibake(original_text)
    if payload.interactive or payload.rules_only:
        before = len(text)
        text = _interactive_analysis_text(text)
        if len(text) < before:
            logger.info(
                "interactive_text_cap chars_before=%s chars_after=%s limit=%s",
                before,
                len(text),
                getattr(config, "INTERACTIVE_ANALYSIS_MAX_CHARS", 6000),
            )
    primary_boundary = _primary_article_boundary(text)
    if primary_boundary is not None and primary_boundary >= 500:
        logger.info("primary_article_boundary chars=%s total=%s", primary_boundary, len(text))
        text = text[:primary_boundary].rstrip()
    evidence_offset_space = "original" if text == original_text else "repaired_original"
    language_profile = detect_language_profile(
        text,
        payload.source_language,
        markers=config.get_language_markers(),
    )
    language = str(language_profile.get("language") or "unknown")
    if language == "unknown" and payload.source_language:
        language = normalize_language_code(payload.source_language)
    # Full source-first analysis must never wait for a heavyweight NLLB model.
    # A pending result is queued as enrichment by the analysis worker after
    # this primary surveillance result has been persisted.
    translation = translate_and_extract(text, language, defer=True)
    translated_text = translation["translated_text"]
    # Deterministic extraction always sees the source article. Translation is
    # an auxiliary semantic view and must never become an evidence authority.
    analysis_text = text
    # A translation is an analyst-facing enrichment only. It must not change
    # health relevance, disease identity, outbreak classification, or any
    # source metric: local translation can be fluent while still mistranslating
    # a disease term. All intelligence decisions remain source-text based.
    semantic_text = text
    structured = translation["structured"]
    if payload.interactive or payload.rules_only:
        loc_cap = int(getattr(config, "INTERACTIVE_LOCATION_SCAN_MAX_CHARS", 4000) or 4000)
        facts = extractors.predict_surveillance_facts(text[:loc_cap], payload.source_country)
        # Preserve full (capped) article for metric extractors below; geo used the lede window.
    else:
        facts = extractors.predict_surveillance_facts(text, payload.source_country)
    _stage_t0 = _stage_mark(_stages, "predict_surveillance_facts", _stage_t0)
    non_health_topic = bool(facts.get("non_health_topic")) or extractors.is_clearly_non_health_topic(
        text
    ) or extractors.is_clearly_non_health_topic(semantic_text)
    source_country = extractors.normalize_country(payload.source_country)
    location_country = source_country or facts.get("country") or extractors.extract_country_hint(text[:1500])
    if location_country and location_country not in config.ASEAN_COUNTRIES:
        # Keep ASEAN countries; do not promote a source/publisher country into
        # the article's event geography.
        if extractors.extract_country_hint(text[:1500]) is None:
            location_country = extractors.country_scope(location_country)
    mentioned_countries = extractors.extract_all_mentioned_countries(text[:1500])
    if location_country and location_country in config.ASEAN_COUNTRIES:
        allowed_countries = {location_country}
    elif mentioned_countries:
        allowed_countries = set(mentioned_countries)
    else:
        allowed_countries = None

    disease = "UNKNOWN"
    confidence = 0.40
    sentiment = "neutral"
    sentiment_score = 0.5
    event_type = "unknown"
    event_confidence = 0.0
    relevance = "medium"
    relevance_confidence = 0.0
    doc_validation_flags = []

    location = facts.get("location") or extractors.extract_location(text, allowed_countries=allowed_countries)
    all_locations = facts.get("locations") or extractors.extract_all_locations(text, allowed_countries=allowed_countries)
    all_locations = [
        item for item in all_locations
        if isinstance(item, dict)
        and (_location_is_source_grounded(item.get("name"), text)
        or str(item.get("name") or "").casefold() == str(source_country or "").casefold()
        )
    ]
    all_locations = _attach_location_provenance(all_locations, text)
    original_location = location
    is_challenge_page = extractors.is_challenge_or_blocked_content(text)
    if is_challenge_page:
        non_health_topic = True
        is_health_related = False
        doc_validation_flags.append("challenge_page_detected")
        needs_review = True
    is_noisy_early = extractors.is_content_too_short_or_noisy(text, has_health_indicators=bool(extractors.extract_diseases(text))) or is_challenge_page
    if not location and not is_noisy_early and not payload.historical_fast and not payload.interactive and not non_health_topic:
        try:
            from .deepseek import detect_location
            resolved_location = detect_location(
                semantic_text,
                source_country=location_country,
            )
            if resolved_location:
                location = resolved_location["location_name"]
        except Exception as e:
            logger.info("DeepSeek location fallback unavailable: %s", e)

    # Missing city/province remains missing. A country-level location is only
    # retained when the article explicitly names that country.
    if location and not _location_is_source_grounded(location, text):
        location = (
            source_country
            if source_country
            else extractors.extract_country_hint(text)
            if extractors.extract_country_hint(text)
            else None
        )
    asean_hits = [
        loc for loc in all_locations
        if isinstance(loc, dict)
        and loc.get("country") in config.ASEAN_COUNTRIES
        and extractors.is_usable_place_name(str(loc.get("name") or ""), text)
    ]
    if facts.get("country"):
        raw_country = facts["country"]
    else:
        raw_country = location_country or (config.LOCATION_COUNTRIES.get(location) if location else None) or None
    location, location_country_conflict = _guard_event_location_country(location, raw_country)
    if location_country_conflict:
        # Keep the source spelling and the rejected locality for review, but
        # ensure all downstream hierarchy/geocoding uses the country-level
        # event location.
        raw_country = extractors.normalize_country(raw_country)
    explicit_country = extractors.extract_country_hint(text[:1500])
    if (
        not location
        and explicit_country
        and raw_country
        and raw_country.casefold() == explicit_country.casefold()
        and raw_country not in config.ASEAN_COUNTRIES
    ):
        # An explicitly named non-ASEAN country is still a valid country-level
        # event location. Keep the surveillance scope scalar as OUTSIDE ASEAN,
        # but do not erase the actual place from location_name.
        location = raw_country
    if asean_hits and (raw_country not in config.ASEAN_COUNTRIES or not location):
        location = asean_hits[0]["name"]
        raw_country = asean_hits[0].get("country") or raw_country
    country = extractors.country_scope(raw_country)
    lat, lon, geocode_confidence, geocode_needs_review = extractors.geocode_place(
        location, raw_country if raw_country in config.ASEAN_COUNTRIES else country, text
    )
    if asean_hits and location == asean_hits[0].get("name"):
        hit_lat, hit_lon = asean_hits[0].get("latitude"), asean_hits[0].get("longitude")
        if hit_lat is not None and hit_lon is not None:
            if extractors.coords_in_country_bbox(hit_lat, hit_lon, asean_hits[0].get("country")):
                lat, lon = hit_lat, hit_lon
                geocode_confidence = max(geocode_confidence, 0.85)
                geocode_needs_review = False
            else:
                lat, lon = None, None
                geocode_confidence = 0.0
                geocode_needs_review = True
    symptoms = extractors.extract_terms(analysis_text, config.SYMPTOM_DICT)
    
    # Prefer explicit diseases in the title/lede; do not let later body
    # frequency (related-story measles, Utah farms) steal the primary label.
    lede = extractors.title_lede_text(text) + " " + extractors.title_lede_text(analysis_text)
    primary_aliases = sorted(set(
        extractors.extract_alias_diseases(lede)
        + extractors.extract_alias_diseases(text[:1200])
        + extractors.extract_alias_diseases(analysis_text[:1200])
    ))
    keyword_diseases = sorted(set(
        extractors.extract_diseases(lede)
        + extractors.extract_diseases(text[:1200])
        + extractors.extract_diseases(analysis_text[:1200])
    ))
    if payload.interactive or payload.rules_only:
        # Keyword/alias hits already cover dengue/cholera style ASEAN news.
        # Full WHO concept regex over thousands of rows is a common 408 cause;
        # map the cheap keyword set instead of scanning every concept alias.
        who_mentions = extractors.canonicalize_disease_labels(
            keyword_diseases + primary_aliases,
            config.DISEASE_MASTER_CONCEPTS,
        )
    else:
        who_mentions = extractors.extract_disease_mentions(
            text[:5000] + " " + analysis_text[:5000],
            config.DISEASE_MASTER_CONCEPTS,
        )
    who_mentions = sorted(set(
        who_mentions
        + extractors.canonicalize_disease_labels(keyword_diseases, config.DISEASE_MASTER_CONCEPTS)
    ))
    
    def _rank_diseases(candidates: list[str], sample: str) -> list[str]:
        unique = list(dict.fromkeys([c for c in candidates if c]))
        l_sample = sample.lower()
        title = (text[:500] + " " + analysis_text[:500]).lower()
        def _score(name: str):
            token = name.lower()
            first = token.split()[0] if name else ""
            cnt = l_sample.count(first) if first else 0
            pos = title.find(token) if token and token in title else l_sample.find(first) if first else 999999
            if pos == -1:
                pos = 999999
            title_hit = 1 if token in title or first in title else 0
            specificity = len(token)
            avian = 1 if any(part in token for part in ("h5n1", "avian", "bird flu", "flu burung")) else 0
            return (-avian, -title_hit, -specificity, -cnt, pos)
        return sorted(unique, key=_score)

    primary_candidates = (facts.get("diseases") or []) + primary_aliases + keyword_diseases + who_mentions
    primary_extracted = extractors.rank_lede_diseases(primary_candidates, lede) or _rank_diseases(
        primary_candidates, text[:2500] + " " + analysis_text[:2500]
    )
    if payload.interactive or payload.rules_only:
        fallback_extracted = _rank_diseases(
            extractors.extract_diseases(analysis_text[:2500]) + who_mentions,
            analysis_text[:2500],
        )
    else:
        fallback_extracted = _rank_diseases(extractors.extract_diseases(analysis_text) + who_mentions, analysis_text)
    _stage_t0 = _stage_mark(_stages, "disease_entity_extract", _stage_t0)
    extracted = list(dict.fromkeys(primary_extracted or fallback_extracted))
    extracted = extractors.filter_diseases_to_evidence(extracted, text + " " + analysis_text)
    # Structured translation output is deliberately not promoted to an entity
    # unless the source article independently contains evidence for it.
    for value in structured.get("diseases") or []:
        if isinstance(value, str) and value.strip() and extractors.disease_has_textual_evidence(value, text):
            extracted.append(value.strip())
    extras = _rank_diseases(extracted, text + " " + analysis_text)
    extracted = list(dict.fromkeys([*(facts.get("diseases") or []), *extracted, *extras]))
    extracted = extractors.filter_diseases_to_evidence(extracted, text + " " + analysis_text)
    extracted = extractors.prefer_outbreak_diseases(extracted, text + " " + analysis_text)
    if facts.get("disease"):
        ordered = extractors.prefer_outbreak_diseases(
            [facts["disease"], *extracted],
            text + " " + analysis_text,
        )
        if ordered:
            disease = ordered[0]
            extracted = ordered
            confidence = max(confidence, 0.85)
        else:
            extracted = [facts["disease"], *[item for item in extracted if item != facts["disease"]]]
            disease = facts["disease"]
            confidence = max(confidence, 0.85)
    has_keywords = bool(extracted or symptoms)
    is_health_related = has_keywords and not non_health_topic

    NON_HEALTH_LABELS = {"NEGATIVE - not health related"}

    if non_health_topic:
        disease = "UNKNOWN"
        extracted = []
        has_keywords = False
        is_health_related = False
        confidence = min(confidence, 0.35)

    if config.NLP_MODEL != "none" and not non_health_topic:
        try:
            # Keep both views inside the classifier budget. Previously the
            # original lead consumed all 1,200 characters, so XLM-R never
            # saw the translated semantic aid on long native-script articles.
            if translated_text:
                clf_sample = f"{text[:600]}\n{translated_text[:600]}"
            else:
                clf_sample = (text or "")[:1200]
            zero_shot = config.NLP_MODEL == "fine-tuned"
            if extracted:
                disease = extracted[0]
                confidence = 0.85
            else:
                disease, confidence = classify_disease(clf_sample)
                # Prefer needs_review over a model label that is not in the
                # article (live: oil-pipeline "kasus" → Rabies).
                if not extractors.disease_has_textual_evidence(disease, text + " " + analysis_text):
                    disease = "UNKNOWN"
                    confidence = min(confidence, 0.35)
            
            # Interactive URL analysis must finish inside the worker HTTP
            # budget. Auxiliary zero-shot XLM-RoBERTa heads (sentiment /
            # event_type / relevance) were loading a second model on the
            # critical path and routinely exceeded the old 90s cap. A
            # fine-tuned disease checkpoint is not a zero-shot checkpoint and
            # its label set does not contain the auxiliary categories, so it
            # must not fall back to the invalid base XLM-R checkpoint here.
            # Disease, geo, and counts still run; outbreak/relevance labels
            # are filled from rules later in this function.
            skip_aux_models = (
                payload.historical_fast
                or payload.interactive
                or config.NLP_MODEL == "fine-tuned"
            )
            if skip_aux_models:
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

            # Prefer needs_review over a model label that is not in the article.
            if not extracted:
                if confidence < config.LOW_CONFIDENCE_THRESHOLD or not extractors.disease_has_textual_evidence(
                    disease, text + " " + analysis_text
                ):
                    confidence = min(confidence, 0.30)
                    disease = "UNKNOWN"

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

    is_explicit_outbreak = extractors.is_explicit_outbreak_report(
        text
    ) or extractors.is_explicit_outbreak_report(analysis_text)
    is_policy_content = extractors.is_policy_or_statistical_health_content(
        analysis_text
    )
    ncd_only = extractors.is_ncd_only_non_outbreak(
        text, extracted
    ) or extractors.is_ncd_only_non_outbreak(analysis_text, extracted)
    is_official_bulletin = bool(
        (
            payload.source_url
            and (
                "disease-outbreak-news" in payload.source_url.lower()
                or "who.int/emergencies" in payload.source_url.lower()
            )
        )
        or (
            payload.source_name
            and any(
                token in str(payload.source_name).lower()
                for token in ("who don", "disease outbreak news", "sitrep")
            )
        )
        or re.search(
            r"\b(?:disease outbreak news|situational report|sitrep|laporan situasi klb)\b",
            text[:400],
            re.IGNORECASE,
        )
    )

    # Preliminary metric counts for gate evaluation
    prelim_cases = extractors.extract_case_count(text, disease=disease if disease != "UNKNOWN" else None) or 0
    prelim_deaths = extractors.extract_death_count(text) or 0
    has_location_conflict = bool(geocode_needs_review)
    review_focus = []
    if disease.strip().upper() == "UNKNOWN" or confidence < config.DEEPSEEK_TRIGGER_CONFIDENCE:
        review_focus.append("disease")
    if not location or has_location_conflict:
        review_focus.append("location")
    if prelim_cases == 0 or prelim_deaths == 0 or "death_exceeds_cases" in doc_validation_flags:
        review_focus.append("counts")
    if is_explicit_outbreak or is_official_bulletin:
        review_focus.append("outbreak status")
    if len(mentioned_countries) > 1 or is_official_bulletin:
        review_focus.append("multi-country")

    # Cheap local/rules NLP first. DeepSeek only on UNKNOWN / low confidence /
    # needs_review / zero metrics on outbreak — never because an article listed more than one disease.
    gate_confidence = confidence
    if is_policy_content and (prelim_cases > 0 or prelim_deaths > 0):
        # Entity extraction promotes a source-grounded disease to 0.85 before
        # the gate, but that is a heuristic confidence, not a calibrated
        # classifier score. Statistical articles with explicit metrics still
        # need the rear-gate to catch swapped case/death totals and periods.
        gate_confidence = min(
            gate_confidence,
            max(0.0, config.DEEPSEEK_TRIGGER_CONFIDENCE - 0.01),
        )
    should_use_deepseek = should_escalate_to_llm(
        historical_fast=payload.historical_fast,
        interactive=payload.interactive,
        is_noisy=is_noisy,
        disease=disease,
        confidence=gate_confidence,
        extracted=extracted,
        language=language,
        needs_review=geocode_needs_review,
        location_missing=not location,
        non_health_topic=non_health_topic,
        ncd_only=ncd_only,
        is_policy_content=is_policy_content,
        is_explicit_outbreak=is_explicit_outbreak,
        is_official_bulletin=is_official_bulletin,
        case_count=prelim_cases,
        death_count=prelim_deaths,
        has_location_conflict=has_location_conflict,
        is_health_related=is_health_related,
    )
    llm_verified_sub_events = []
    llm_review_applied = False
    llm_review_cleared_events = False
    llm_review_non_health = False
    llm_review_outbreak: bool | None = None
    llm_review_disease: str | None = None
    if should_use_deepseek:
        try:
            from .deepseek import validate_and_correct_events
            from .disease_master import resolve_local_disease_term
            resolved = validate_and_correct_events(
                text=analysis_text,
                title=getattr(payload, "title", "") or "",
                source_url=payload.source_url or "",
                draft_disease=disease,
                draft_location=location,
                draft_country=country,
                draft_case_count=prelim_cases,
                draft_death_count=prelim_deaths,
                candidate_diseases=extracted,
                review_focus=review_focus,
                mentioned_countries=mentioned_countries,
            )
            if resolved is not None:
                llm_review_applied = True
                verified_disease = resolved.get("disease_classification")
                if verified_disease and verified_disease != "UNKNOWN":
                    local_verified = resolve_local_disease_term(verified_disease)
                    llm_review_disease = (
                        local_verified.get("canonical_name")
                        if local_verified
                        else verified_disease
                    )
                    disease = llm_review_disease
                    confidence = config.DEEPSEEK_MIN_CONFIDENCE
                    if disease not in extracted:
                        extracted = [disease, *extracted]
                    has_keywords = True
                    is_health_related = True

                llm_evts = resolved.get("sub_events") or []
                if llm_evts:
                    llm_verified_sub_events = llm_evts
                    first_evt = llm_evts[0]
                    if first_evt.get("location_name"):
                        reviewed_location = first_evt["location_name"]
                        local_specific = next(
                            (
                                item.get("name")
                                for item in all_locations
                                if item.get("name")
                                and item.get("country") == (first_evt.get("country") or country)
                                and str(item.get("name")).casefold()
                                != str(first_evt.get("country") or country).casefold()
                                and _location_is_source_grounded(item.get("name"), text)
                            ),
                            None,
                        )
                        # A country-only LLM answer must not erase a
                        # source-grounded province/city already linked by the
                        # local gazetteer.
                        location = local_specific or (
                            reviewed_location
                            if _location_is_source_grounded(reviewed_location, text)
                            else (payload.source_country or country)
                        )
                    if first_evt.get("country"):
                        if not payload.source_country or _location_is_source_grounded(
                            first_evt.get("location_name"), text
                        ):
                            country = first_evt["country"]
                    if first_evt.get("case_count") is not None:
                        prelim_cases = int(first_evt["case_count"])
                    if first_evt.get("death_count") is not None:
                        prelim_deaths = int(first_evt["death_count"])
                else:
                    # An empty review is an override only when DeepSeek
                    # explicitly says there is no active outbreak. If it
                    # confirms an outbreak but its atomic events fail local
                    # guardrails, preserve the source-first local metrics
                    # instead of turning a valid outbreak into zero cases.
                    llm_review_cleared_events = resolved.get("outbreak_alert") is False
                if resolved.get("is_health_related") is False:
                    llm_review_non_health = True
                if isinstance(resolved.get("outbreak_alert"), bool):
                    llm_review_outbreak = resolved["outbreak_alert"]
        except Exception as e:
            logger.info("DeepSeek local rear-gate fallback unavailable: %s", e)

    extracted = extractors.filter_diseases_to_evidence(extracted, text + " " + analysis_text)
    if translated_text and extracted:
        disease = extracted[0]
        confidence = max(confidence, 0.85)
    if who_mentions and disease == "UNKNOWN":
        opening_text = text[:1500] + " " + analysis_text[:1500]
        opening_who = [
            w for w in who_mentions
            if extractors.disease_has_textual_evidence(w, opening_text)
        ]
        if opening_who:
            disease = opening_who[0]
            confidence = max(confidence, 0.85)
    if extracted and (not disease or disease.strip().upper() == "UNKNOWN"):
        disease = extracted[0]
        confidence = max(confidence, 0.85)
    if extracted and not non_health_topic:
        is_health_related = True
    if non_health_topic:
        disease = "UNKNOWN"
        extracted = []
        is_health_related = False
        source_extracted_cases = 0
        source_extracted_deaths = 0
        facts_case_count = 0
        facts_death_count = 0
        case_count = 0
        death_count = 0
        explicit_case_count = False
    else:
        # The original article is the metric authority.  ``predict_surveillance_facts``
        # may select a nearby regional candidate while building its broad fact
        # bundle (for example Bangkok 1,785 before the Thailand total 21,620).
        # Always run the source metric selectors first, and use the broad bundle
        # only when the source selector found no value at all.
        source_extracted_cases = extractors.extract_case_count(
            text, disease=disease if disease != "UNKNOWN" else None
        )
        source_extracted_deaths = extractors.extract_death_count(text)
        facts_case_count = facts.get("case_count") if facts.get("disease") else 0
        facts_death_count = facts.get("death_count") if facts.get("disease") else 0
        case_count = source_extracted_cases or facts_case_count or 0
        death_count = source_extracted_deaths or facts_death_count or 0
        explicit_case_count = not facts.get("case_count_unknown", True) if facts.get("disease") else extractors.has_explicit_case_count(
            text, disease=disease if disease != "UNKNOWN" else None
        )
    if not explicit_case_count:
        case_count = 0
        explicit_case_count = False
    if extractors.article_states_zero_cases(text) or extractors.article_states_zero_cases(analysis_text):
        case_count = 0
        explicit_case_count = True
        if death_count and not re.search(r"\b(?:deaths?|kematian|meninggal)\b", (text + " " + analysis_text).lower()):
            death_count = 0
        event_type = "health update"
        outbreak_alert = False
    if extractors.is_vaccine_campaign_not_outbreak(text) or extractors.is_vaccine_campaign_not_outbreak(analysis_text):
        outbreak_alert = False
        event_type = "health update"
        if extractors.should_reject_incident_count(case_count, text) or extractors.should_reject_incident_count(
            case_count, analysis_text
        ):
            case_count = 0
            death_count = 0
            explicit_case_count = False
    elif extractors.should_reject_incident_count(case_count, text):
        case_count = 0
        death_count = 0
        explicit_case_count = False
    if death_count == 0 and isinstance(structured.get("death_count"), int):
        death_count = max(0, structured["death_count"])
    # Source-first death invariant: a structured/translated projection must
    # not copy the case total into deaths. If the original article contains a
    # scoped explicit death metric, that source value is authoritative.
    source_death_explicit = extractors.has_explicit_death_count(
        text, disease=disease if disease != "UNKNOWN" else None
    )
    if source_death_explicit:
        source_death_count = extractors.extract_death_count(
            text, disease=disease if disease != "UNKNOWN" else None
        )
        if death_count != source_death_count:
            logger.info(
                "Preserving source death metric %s over projected value %s",
                source_death_count,
                death_count,
            )
        death_count = source_death_count
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
        if not explicit_case_count:
            case_count = 0
        event_type = "health update"
        event_confidence = max(event_confidence, 0.85)
    if not explicit_case_count and disease == "UNKNOWN" and not extracted:
        case_count = 0
    if death_count > 0 and not explicit_case_count:
        case_count = 0
    # Auxiliary translation/structured output is never allowed to override a
    # source-first non-health decision (e.g. conflict or violence reporting
    # that happens to contain the word "health").
    if structured.get("is_health_related") is True and not non_health_topic:
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
        and not explicit_case_count
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
        "dokter", "doctor", "epidemi", "pandemi", "symptom", "gejala", "kemenkes", "cdc",
        "world health organization", "suc khoe", "suc-khoe",
    )
    lower_full = (text[:4000] + " " + analysis_text[:4000]).lower()
    has_health_indicators = any(hw in lower_full for hw in health_indicator_words)

    ncd_only = extractors.is_ncd_only_non_outbreak(text, extracted) or extractors.is_ncd_only_non_outbreak(
        analysis_text, extracted
    )
    if ncd_only:
        # NCD/policy articles are health information, but not infectious
        # surveillance events. Keep them visible as health updates without
        # turning them into outbreaks or assigning a stray body location.
        is_health_related = True
        disease = "UNKNOWN"
        extracted = []
        case_count = 0
        death_count = 0
        outbreak_alert = False
        event_type = "health update"
        location = extractors.extract_country_hint(text) if extractors.extract_country_hint(text) in config.ASEAN_COUNTRIES else None
        needs_review = True

    # UNKNOWN handling: portal overviews from WHO/health agencies remain health-related
    if not ncd_only and (not disease or disease.strip().upper() == "UNKNOWN"):
        source_is_who = bool(payload.source_name and "who" in payload.source_name.lower())
        if not non_health_topic and (has_health_indicators or symptoms or source_is_who):
            is_health_related = True
            event_type = "health update"
            event_confidence = 0.70
            outbreak_alert = False
            needs_review = True
        else:
            is_health_related = False
            outbreak_alert = False
            event_type = "unknown"
            event_confidence = 0.0
        if not explicit_case_count:
            case_count = 0
    if ncd_only:
        is_health_related = True
        location = None
        raw_country = None
        country = None
        all_locations = []
    needs_review = True if ncd_only else (confidence < config.LOW_CONFIDENCE_THRESHOLD)
    if not explicit_case_count:
        needs_review = True
        case_count = 0
    if geocode_needs_review:
        needs_review = True

    source_type = payload.source_type or "web"
    cred_score = source_reliability_score(
        source_name=payload.source_name,
        source_type=source_type,
        source_url=payload.source_url,
    )

    def _canonical_display(value: str) -> str:
        return extractors.canonical_disease_name(
            value,
            concepts=config.DISEASE_MASTER_CONCEPTS,
        )

    disease = _canonical_display(disease)
    extracted = [_canonical_display(d) for d in extracted]
    extracted = list(dict.fromkeys(extracted))

    # Resolve every explicit mention, including secondary diseases, against
    # the same local disease master used by the extractor.
    from .disease_master import resolve_disease_term, resolve_local_disease_term

    resolved_concept_overrides = {}
    try:
        term_resolutions = {}
        resolve_candidates = list(dict.fromkeys([*extracted[:12], disease]))
        for candidate in resolve_candidates:
            if not candidate or str(candidate).upper() == "UNKNOWN":
                continue
            if payload.interactive:
                term_resolutions[candidate] = resolve_local_disease_term(candidate)
            else:
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
                    # Do not artificially inflate overall article confidence to 0.99
                    # if the article has pending location review or missing location.
                    term_conf = float(resolved_term.get("confidence") or 0.90)
                    if not geocode_needs_review and location:
                        confidence = max(confidence, min(0.90, term_conf))
                    else:
                        confidence = max(confidence, 0.70)
        extracted = list(dict.fromkeys(extracted))
    except Exception as exc:
        logger.info("Local disease-master resolution unavailable: %s", exc)

    def _norm_disease(value: str) -> str:
        # Keep Unicode disease names (Thai/Lao/Khmer/etc.) available for
        # evidence lookup after alias matching.
        return re.sub(r"[^\w\s-]+", " ", (value or "").lower(), flags=re.UNICODE).strip()

    def _concept_for(value: str):
        normalized = _norm_disease(value)
        if not normalized:
            return None
        resolved_concept = resolved_concept_overrides.get(normalized)
        if resolved_concept and resolved_concept.get("disease_id"):
            return {
                "disease_id": resolved_concept.get("disease_id"),
                "canonical_name": resolved_concept.get("canonical_name") or value,
                "english_name": resolved_concept.get("english_name") or value,
                "source": resolved_concept.get("master_source") or "local_database",
                "ontology_code": None,
                "ontology_uri": None,
                "aliases": [],
            }
        for concept in config.DISEASE_MASTER_CONCEPTS:
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
        local_resolved = resolve_local_disease_term(value)
        if local_resolved and local_resolved.get("disease_id"):
            return {
                "disease_id": local_resolved.get("disease_id"),
                "canonical_name": local_resolved.get("canonical_name") or value,
                "english_name": local_resolved.get("english_name") or value,
                "source": local_resolved.get("master_source") or "local_database",
                "ontology_code": None,
                "ontology_uri": None,
                "aliases": [],
            }
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
        surface_offset = text.casefold().find(surface.casefold()) if surface else -1
        disease_mentions.append(
            DiseaseMention(
                surface_form=surface,
                canonical_name=canonical,
                disease_id=concept.get("disease_id") if concept else None,
                master_source=concept.get("source") if concept else None,
                icd11_code=None,
                role="primary" if _norm_disease(canonical) == _norm_disease(disease) else "secondary",
                evidence=evidence,
                confidence=max(confidence if canonical == disease else 0.70, 0.0),
                resolution_source=("local_disease_master" if concept and concept.get("disease_id") else "keyword/agent"),
                evidence_offset_start=surface_offset if surface_offset >= 0 else None,
                evidence_offset_end=(surface_offset + len(surface)) if surface_offset >= 0 else None,
            )
        )

    if config.DISEASE_MASTER_RESOLUTION_ENABLED:
        from .disease_master import project_disease_master_output

        public_projection = project_disease_master_output(
            primary=disease,
            extracted=extracted,
            mentions=disease_mentions,
        )
        for index in public_projection["unresolved_indexes"]:
            # Keep the candidate and evidence for review. Resolution status is
            # explicit; candidate extraction must not erase a valid secondary
            # disease merely because the current master snapshot lacks an ID.
            disease_mentions[index].role = "mentioned"
            disease_mentions[index].resolution_source = "pending_local_master"
        disease = public_projection["primary"]
        extracted = public_projection["extracted"]
        if public_projection["unresolved_indexes"]:
            needs_review = True

    # Publication metadata and event dates describe different facts. Body
    # dates must never silently become the article publication date.
    published_at = normalize_publication_date(payload.published_at)
    period = extract_event_period(text, published_at=published_at)
    event_date = period.get("event_date") or extract_event_date(text)
    count_period = period.get("period_type") or extractors.count_period_type(text)
    if period.get("date_needs_review"):
        needs_review = True
    if extractors.should_reject_incident_count(case_count, text) and count_period != "cumulative":
        case_count = 0
        death_count = 0
        explicit_case_count = False
        needs_review = True
    typed_counts = extract_labeled_counts(text)
    evidence = evidence_sentences(text)
    start = period.get("event_date_start")
    end = period.get("event_date_end") or period.get("event_date")
    if count_period == "cumulative":
        window = "Cumulative reporting window"
        if start and end:
            window = f"Cumulative reporting window {start} to {end}"
        elif end:
            window = f"Cumulative total reported as of {end}"
        if window not in evidence:
            evidence = [window, *evidence]
    if extractors.article_states_zero_cases(text):
        zero_span = next(
            (
                " ".join(sentence.split())
                for sentence in re.split(r"(?<=[.!?。！？])\s+|\n+", text)
                if extractors.article_states_zero_cases(sentence)
            ),
            "",
        )
        if zero_span and zero_span not in evidence:
            evidence = [zero_span, *evidence]
        if count_period == "unknown":
            count_period = "incident"

    # --- Shared relation context for multi-event and strict projection ---
    # Both consumers need the same evidence-bound metric relations. Building
    # them independently made one article scan the full text up to three
    # times, and could let the two projections disagree at cold start.
    shared_linker = None
    relational_events = []
    relation_context_ready = False
    try:
        from .surveillance_extraction import GazetteerLinker, extract_metric_relations

        shared_linker = GazetteerLinker()
        relational_events = extract_metric_relations(
            text,
            linker=shared_linker,
            published_date=published_at,
            source_country=source_country,
        )
        relation_context_ready = True
    except Exception as exc:
        logger.warning("Shared metric relation extraction failed: %s", exc)
    _stage_t0 = _stage_mark(_stages, "metric_relations", _stage_t0)

    # --- Multi-event extraction (locations AND diseases) ---
    try:
        from .multi_event_extractor import compose_structured_events, _collapse_same_country_events
        from .stage_budget import bounded_call
        multi_events = bounded_call(
            partial(
                compose_structured_events,
                text=text,
                primary_disease=disease,
                primary_location=location,
                diseases_extracted=extracted,
                locations=[loc.model_dump() if hasattr(loc, 'model_dump') else loc for loc in all_locations],
                case_count=case_count,
                death_count=death_count,
                primary_country=country,
                linker=shared_linker,
                relations=relational_events if relation_context_ready else None,
            ),
            (),
            config.MULTI_EVENT_STAGE_TIMEOUT_SECONDS,
            isolation="process",
        )
        # Preserve evidence-backed regional events as the source of truth.
        # Country-level aggregation belongs in compatibility adapters, not in
        # the shared event list.
        multi_events = _collapse_same_country_events(multi_events)
        _stage_t0 = _stage_mark(_stages, "multi_event", _stage_t0)
        sub_events = [
            SubEvent(
                disease=evt.get("disease", disease),
                location_name=evt.get("location_name", ""),
                country=evt.get("country"),
                admin1=evt.get("admin1"),
                admin2=evt.get("admin2"),
                country_iso3=evt.get("country_iso3"),
                latitude=evt.get("latitude"),
                longitude=evt.get("longitude"),
                case_count=evt.get("case_count", 0),
                new_cases=evt.get("new_cases"),
                cumulative_cases=evt.get("cumulative_cases"),
                historical_cases=evt.get("historical_cases"),
                death_count=evt.get("death_count", 0),
                metric_type=evt.get("metric_type", "cases"),
                unit=evt.get("unit", "persons"),
                metric_value_min=evt.get("metric_value_min"),
                metric_value_max=evt.get("metric_value_max"),
                evidence=evt.get("evidence", ""),
                evidence_offset_start=evt.get("evidence_offset_start"),
                evidence_offset_end=evt.get("evidence_offset_end"),
                event_date_start=evt.get("event_date_start"),
                event_date_end=evt.get("event_date_end"),
                epistemic_status=evt.get("epistemic_status", "reported"),
                metric_qualifier=evt.get("metric_qualifier"),
                time_frame=evt.get("time_frame"),
                temporal_context=evt.get("temporal_context", "current"),
                disease_confidence=evt.get("disease_confidence"),
                location_confidence=evt.get("location_confidence"),
                relation_confidence=evt.get("relation_confidence"),
                needs_review=evt.get("needs_review", False),
                relations=evt.get("relations", []),
                metrics=evt.get("metrics", []),
                provenance=evt.get("provenance") or {
                    "method": "evidence_relation",
                    "source": "surveillance_extraction",
                },
                validation_flags=evt.get("validation_flags", []),
                confidence=evt.get("confidence", 0.90),
                source_language=language,
                source_script=str(language_profile.get("script") or "Latin"),
                source_sentence_id=evt.get("source_sentence_id"),
                source_evidence=evt.get("evidence", ""),
                evidence_is_translated=False,
                evidence_offset_space=evidence_offset_space,
            )
            for evt in multi_events
        ]
    except Exception as exc:
        logger.warning("Multi-event extraction failed: %s", exc)
        sub_events = []

    if sub_events:
        event_diseases = list(dict.fromkeys(
            extractors.canonical_disease_name(evt.disease)
            for evt in sub_events
            if evt.disease and evt.disease.upper() != "UNKNOWN"
            and (evt.case_count or evt.death_count)
        ))
        # A page can mention a disease in a title, prevention section, or
        # comparison paragraph. If exactly one disease owns a real metric
        # relation, use that identity for the parent row instead of the
        # contextual classifier label.
        if len(event_diseases) == 1:
            disease = event_diseases[0]
            extracted = list(dict.fromkeys([disease, *extracted]))
        if not location and sub_events[0].location_name:
            location = sub_events[0].location_name
        if not country and sub_events[0].country:
            country = sub_events[0].country
        if lat is None and sub_events[0].latitude is not None:
            lat = sub_events[0].latitude
            lon = sub_events[0].longitude

    # Project the same high-precision relational decision into the legacy
    # response. LLM supplementation is skipped here because the main worker
    # already has its own bounded agent stages; the dedicated structured
    # endpoint may opt into it.
    strict_projection_locations = []
    relation_diseases = []
    article_disease_candidates = []
    source_case_count = case_count
    source_death_count = death_count
    source_death_explicit = extractors.has_explicit_death_count(
        text, disease=disease if disease != "UNKNOWN" else None
    )
    try:
        from .surveillance_extraction import (
            build_surveillance_output,
        )
        # Interactive URL analysis already ran compose_structured_events /
        # atomic relations. A second full gazetteer+relation pass routinely
        # burned 60–120s wall on mid-length ASEAN articles and 408'd under
        # INTERACTIVE_STAGE_BUDGET. Keep the strict projection for batch.
        if (payload.interactive or payload.rules_only) and getattr(
            config, "INTERACTIVE_SKIP_STRICT_SURVEILLANCE", True
        ):
            raise RuntimeError("interactive_skip_strict_surveillance")
        strict_output = build_surveillance_output(
            text,
            published_at=published_at,
            diseases=extracted,
            source_name=payload.source_name,
            source_type=source_type,
            source_url=payload.source_url,
            source_country=source_country,
            include_llm=False,
            linker=shared_linker,
            relations=relational_events if relation_context_ready else None,
        )
        article_disease_candidates = list(dict.fromkeys(
            extractors.canonical_disease_name(value)
            for value in [*strict_output.disease_classification, *extracted]
            if value and extractors.canonical_disease_name(value).upper() != "UNKNOWN"
            and extractors.disease_has_textual_evidence(value, text)
        ))
        # The composer may start from the classifier's primary location. Add
        # any additional country-level relation that is explicitly backed by
        # the strict projection, otherwise a multi-country article can lose a
        # valid country event before the shared metric attribution pass runs.
        existing_event_countries = {
            str(evt.country or "").casefold()
            for evt in sub_events
            if evt.country
        }
        for projection in strict_output.locations:
            projection_country = str(projection.country or "").strip()
            if not projection_country or projection_country.casefold() in existing_event_countries:
                continue
            country_relations = [
                relation for relation in relational_events
                if relation.location.country.casefold() == projection_country.casefold()
                and relation.evidence
                and (relation.cases or relation.deaths is not None)
            ]
            if not country_relations:
                continue
            relation = max(
                country_relations,
                key=lambda item: (item.cases or 0) + (item.deaths or 0),
            )
            event_disease = extractors.canonical_disease_name(
                relation.disease or disease or "UNKNOWN"
            )
            if event_disease.upper() == "UNKNOWN":
                continue
            hierarchy = extractors.resolve_location_hierarchy(
                projection_country,
                country_hint=projection_country,
            )
            sub_events.append(
                SubEvent(
                    disease=event_disease,
                    location_name=projection_country,
                    country=projection_country,
                    country_iso3=hierarchy.get("country_iso3"),
                    latitude=hierarchy.get("latitude"),
                    longitude=hierarchy.get("longitude"),
                    case_count=int(relation.cases or projection.reported_cases or 0),
                    death_count=int(
                        relation.deaths
                        if relation.deaths is not None
                        else projection.deaths or 0
                    ),
                    metric_type=relation.metric_type or "cases",
                    unit=relation.unit or "persons",
                    metric_qualifier=relation.qualifier,
                    time_frame=relation.time_frame or projection.time_frame,
                    temporal_context=extractors.count_period_type(relation.evidence),
                    evidence=relation.evidence,
                    evidence_offset_start=relation.evidence_offset_start,
                    evidence_offset_end=relation.evidence_offset_end,
                    relations=[{
                        "type": "reported_in",
                        "evidence": relation.evidence,
                        "source_sentence_id": relation.source_sentence_id,
                        "evidence_is_translated": False,
                    }],
                    metrics=[],
                    provenance={
                        "method": "evidence_relation",
                        "source": "surveillance_extraction",
                        "source_sentence_id": relation.source_sentence_id,
                        "source_text": "original",
                    },
                    source_language=language,
                    source_script=str(language_profile.get("script") or "Latin"),
                    source_sentence_id=relation.source_sentence_id,
                    source_evidence=relation.evidence,
                    evidence_is_translated=False,
                    evidence_offset_space=evidence_offset_space,
                )
            )
            existing_event_countries.add(projection_country.casefold())
        # Relation evidence is authoritative for the public evidence view as
        # well as for event construction.  Keep the original source span;
        # translation must never be the only visible proof of a metric.
        for relation in relational_events:
            relation_evidence = str(relation.evidence or "").strip()
            if relation_evidence and relation_evidence not in evidence:
                evidence.append(relation_evidence)

        relation_diseases = list(dict.fromkeys(
            extractors.canonical_disease_name(relation.disease)
            for relation in relational_events
            if relation.disease and str(relation.disease).strip().upper() != "UNKNOWN"
        ))
        # The strict relation projection is the current-period authority. It
        # prevents historical comparisons (for example, an older death total)
        # from overwriting the current event and keeps national totals ahead of
        # regional breakdown rows.
        strict_current_cases = sum(
            int(item.reported_cases or 0)
            for item in strict_output.locations
        )
        strict_current_deaths = sum(
            int(item.deaths or 0)
            for item in strict_output.locations
            if item.deaths is not None
        )
        if strict_output.locations and relational_events:
            if strict_current_cases > 0:
                # The strict location parser can retain a smaller regional
                # breakdown while the general metric parser has the national
                # total. Keep the larger evidence-backed value; never let a
                # breakdown replace the article's exact country total.
                case_count = max(case_count, strict_current_cases)
                explicit_case_count = True
            case_count = max(0, case_count)
            if strict_current_deaths > 0:
                death_count = max(death_count, strict_current_deaths)
            death_count = max(0, death_count)
        # Keep the original-language article metric authoritative for a
        # single-disease projection. Relation parsing still powers sub-events
        # and multi-disease attribution, but it must not replace a focal
        # current-period value with a historical/comparator candidate.
        if len(relation_diseases) == 1 and source_case_count and explicit_case_count:
            case_count = source_case_count
        if source_death_explicit:
            death_count = source_death_count
        # The classifier may choose a disease from a page title or a health
        # reference section.  When the metric relation has exactly one
        # disease identity, prefer that evidence-backed identity for the
        # article-level projection.
        if len(relation_diseases) == 1:
            relation_disease = relation_diseases[0]
            if (
                disease == "UNKNOWN"
                or extractors.canonical_disease_name(disease).casefold()
                != relation_disease.casefold()
            ):
                disease = relation_disease
                extracted = list(dict.fromkeys([relation_disease, *extracted]))
        if strict_output.locations:
            strict_projection_locations = list(strict_output.locations)
            outbreak_alert = strict_output.outbreak_alert
            relevance = strict_output.health_relevance.lower()
            relevance_confidence = max(relevance_confidence, 0.90)
            is_health_related = is_health_related or (
                strict_output.health_related and not non_health_topic and not ncd_only
            )
            cred_score = strict_output.source_reliability_score
            if relational_events:
                # Keep title/lede + ASEAN gazetteer as the primary event.
                # Surveillance relations may add extra locations but must not
                # replace Cambodia with Utah or invent a farm-count total.
                usable_relations = [
                    item for item in relational_events
                    if extractors.is_usable_place_name(item.location.name, text)
                ]
                extra_locations = [
                    {
                        "name": item.location.name,
                        "latitude": item.location.latitude,
                        "longitude": item.location.longitude,
                        "country": item.location.country,
                    }
                    for item in usable_relations
                ]
                # A country total can mention several provinces/cities without
                # assigning a metric to each one. Keep those names in the
                # location matrix as hierarchy/evidence, but do not turn them
                # into child events or copy the country total onto them.
                for projection in strict_output.locations:
                    for region_name in [*projection.provinces, *projection.cities]:
                        if not region_name or str(region_name).casefold() == str(projection.country or "").casefold():
                            continue
                        region_hierarchy = extractors.resolve_location_hierarchy(
                            region_name,
                            country_hint=projection.country,
                        )
                        extra_locations.append(
                            {
                                "name": region_hierarchy.get("canonical_name") or region_name,
                                "latitude": region_hierarchy.get("latitude"),
                                "longitude": region_hierarchy.get("longitude"),
                                "country": projection.country,
                                "admin1": region_hierarchy.get("admin1_name"),
                                "admin2": region_hierarchy.get("admin2_name"),
                                "country_iso3": region_hierarchy.get("country_iso3"),
                            }
                        )
                if extra_locations:
                    known = {(str(item.get("name") or ""), str(item.get("country") or "")) for item in all_locations}
                    for item in extra_locations:
                        key = (str(item.get("name") or ""), str(item.get("country") or ""))
                        if key not in known:
                            all_locations.append(item)
                            known.add(key)
            # Use the strict country projection for event metrics.  Raw
            # relation rows are deliberately not promoted one-for-one: they
            # can be regional breakdowns of the same country total and can
            # repeat a death count that belongs to the country aggregate.
            projected_disease = disease
            if projected_disease == "UNKNOWN" and len(relation_diseases) == 1:
                projected_disease = relation_diseases[0]
            if projected_disease != "UNKNOWN":
                def evidence_for_metric_value(value: int) -> tuple[str, Optional[int], Optional[int]]:
                    value_digits = re.sub(r"\D", "", str(value))
                    if not value_digits:
                        return "", None, None
                    for candidate in evidence:
                        candidate_digits = re.sub(r"\D", "", str(candidate))
                        if value_digits not in candidate_digits:
                            continue
                        start = text.find(candidate)
                        end = start + len(candidate) if start >= 0 else None
                        return candidate, (start if start >= 0 else None), end
                    return "", None, None

                by_country = {
                    str(item.country or "").casefold(): item
                    for item in strict_output.locations
                    if item.country
                }
                for evt in sub_events:
                    evt_country = str(evt.country or "").casefold()
                    if not evt_country and evt.location_name:
                        evt_country = str(
                            extractors.resolve_location_hierarchy(evt.location_name).get("country") or ""
                        ).casefold()
                    projection = by_country.get(evt_country)
                    if projection is None and len(by_country) == 1:
                        projection = next(iter(by_country.values()))
                    if projection is None:
                        continue
                    projection_country = str(projection.country or "")
                    event_location = str(evt.location_name or "")
                    location_is_country = event_location.casefold() == projection_country.casefold()
                    event_relation = max(
                        (
                            relation
                            for relation in relational_events
                            if relation.location.country.casefold() == projection_country.casefold()
                            and relation.location.name.casefold() == event_location.casefold()
                            and relation.evidence
                        ),
                        key=lambda relation: (relation.cases or 0) + (relation.deaths or 0),
                        default=None,
                    )
                    if event_relation is not None:
                        relation_start = event_relation.evidence_offset_start
                        relation_end = event_relation.evidence_offset_end
                        relation_context = event_relation.evidence or ""
                        if relation_start is not None and relation_end is not None:
                            relation_context = text[
                                max(0, relation_start - 180): min(len(text), relation_end + 180)
                            ]
                        # A gazetteer can attach a nearby number to the last
                        # region mentioned in a paragraph. Treat that as a
                        # regional metric only when the region is explicitly
                        # present in the metric's local evidence window.
                        if event_location and event_location.casefold() not in relation_context.casefold():
                            event_relation = None
                    country_relation = max(
                        (
                            relation
                            for relation in relational_events
                            if relation.location.country.casefold() == projection_country.casefold()
                            and relation.location.name.casefold() == projection_country.casefold()
                            and relation.evidence
                        ),
                        key=lambda relation: (relation.cases or 0) + (relation.deaths or 0),
                        default=None,
                    )
                    # A regional name without a regional metric is only a
                    # breakdown mention. Promote the event to the country so
                    # a national total is never displayed as (for example)
                    # Sumatera Barat or Hanoi. A region keeps its own event
                    # only when the source has a relation for that region.
                    if (
                        not location_is_country
                        and event_relation is None
                        and (
                            country_relation is not None
                            or int(projection.reported_cases or 0) > 0
                            or projection.deaths is not None
                        )
                    ):
                        evt.location_name = projection_country
                        evt.admin1 = None
                        evt.admin2 = None
                        evt.country = projection_country
                        if len(sub_events) == 1:
                            location = projection_country
                            country = projection_country
                            lat = None
                            lon = None
                        evt.latitude = None
                        evt.longitude = None
                        evt_country = projection_country.casefold()
                        event_location = projection_country
                        location_is_country = True
                    event_disease = extractors.canonical_disease_name(evt.disease or "UNKNOWN")
                    target_disease = extractors.canonical_disease_name(projected_disease)
                    if event_disease.upper() != "UNKNOWN" and event_disease.casefold() != target_disease.casefold():
                        # A metric belonging to another disease must not be
                        # copied into this row. Keep the row reviewable rather
                        # than silently changing its identity.
                        evt.needs_review = True
                        if "metric_disease_mismatch" not in evt.validation_flags:
                            evt.validation_flags.append("metric_disease_mismatch")
                        continue
                    evt.disease = projected_disease
                    evt.country = projection.country
                    # Use a region-specific relation when it exists. Otherwise
                    # this is the country-level event and the strict country
                    # projection is the only safe metric source.
                    metric_relation = event_relation if event_relation is not None else country_relation
                    if metric_relation is not None and event_relation is not None:
                        evt.case_count = int(metric_relation.cases or 0)
                        # A relation can carry cases without a death metric.
                        # Do not erase a stronger article-level death value
                        # during strict location projection.
                        if metric_relation.deaths is not None:
                            evt.death_count = int(metric_relation.deaths)
                        evt.time_frame = metric_relation.time_frame or evt.time_frame
                    else:
                        projection_cases = int(projection.reported_cases or 0)
                        if len(by_country) == 1:
                            projection_cases = max(projection_cases, case_count)
                        evt.case_count = projection_cases
                        # ``None`` means no death metric was attributed to this
                        # projection, not zero deaths. Preserve the source
                        # extraction in that case.
                        if projection.deaths is not None:
                            evt.death_count = int(projection.deaths)
                        evt.time_frame = projection.time_frame or evt.time_frame
                    if count_period and count_period != "unknown":
                        evt.temporal_context = count_period
                    evt.event_date_start = period.get("event_date_start") or evt.event_date_start
                    evt.event_date_end = period.get("event_date_end") or evt.event_date_end
                    projection_relation = max(
                        (
                            relation
                            for relation in relational_events
                            if relation.location.country.casefold() == str(projection.country or "").casefold()
                            and relation.time_frame == projection.time_frame
                            and relation.evidence
                        ),
                        key=lambda relation: (relation.cases or 0) + (relation.deaths or 0),
                        default=None,
                    )
                    if metric_relation or projection_relation:
                        projection_relation = metric_relation or projection_relation
                        evt.evidence = projection_relation.evidence
                        evt.source_evidence = projection_relation.evidence
                        evt.evidence_offset_start = projection_relation.evidence_offset_start
                        evt.evidence_offset_end = projection_relation.evidence_offset_end
                    if location_is_country:
                        # Country totals may coexist with a nearby regional
                        # breakdown relation. Prefer the original sentence
                        # containing the exact country total as the event
                        # evidence instead of exposing the smaller breakdown
                        # span as proof for the national number.
                        exact_evidence, exact_start, exact_end = evidence_for_metric_value(evt.case_count)
                        if exact_evidence:
                            evt.evidence = exact_evidence
                            evt.source_evidence = exact_evidence
                            evt.evidence_offset_start = exact_start
                            evt.evidence_offset_end = exact_end
                    country_hierarchy = extractors.resolve_location_hierarchy(
                        projection.country,
                        country_hint=projection.country,
                    )
                    evt.country_iso3 = evt.country_iso3 or country_hierarchy.get("country_iso3")
                    if str(evt.location_name or "").casefold() == str(projection.country or "").casefold():
                        # Parent and country-level child rows must use the same
                        # country centroid, never two different fallbacks.
                        evt.latitude = country_hierarchy.get("latitude")
                        evt.longitude = country_hierarchy.get("longitude")

                if not sub_events:
                    sub_events = [
                        SubEvent(
                            disease=projected_disease,
                            location_name=item.country,
                            country=item.country,
                            country_iso3=extractors.resolve_location_hierarchy(
                                item.country,
                                country_hint=item.country,
                            ).get("country_iso3"),
                            latitude=extractors.resolve_location_hierarchy(
                                item.country,
                                country_hint=item.country,
                            ).get("latitude"),
                            longitude=extractors.resolve_location_hierarchy(
                                item.country,
                                country_hint=item.country,
                            ).get("longitude"),
                            case_count=int(item.reported_cases or 0),
                            death_count=int(item.deaths or 0),
                            evidence=next(
                                (
                                    relation.evidence
                                    for relation in relational_events
                                    if relation.location.country.casefold() == item.country.casefold()
                                    and relation.evidence
                                ),
                                "",
                            ),
                            source_language=language,
                            source_script=str(language_profile.get("script") or "Latin"),
                            source_evidence=next(
                                (
                                    relation.evidence
                                    for relation in relational_events
                                    if relation.location.country.casefold() == item.country.casefold()
                                    and relation.evidence
                                ),
                                "",
                            ),
                            evidence_is_translated=False,
                            evidence_offset_space=evidence_offset_space,
                        )
                        for item in strict_output.locations
                    ]
    except Exception as exc:
        if str(exc) != "interactive_skip_strict_surveillance":
            logger.info("Strict surveillance projection unavailable in legacy path: %s", exc)
        else:
            logger.info("interactive_skip_strict_surveillance enabled")

    # The country projection is also the article-level fallback when the
    # classifier/rules path could not read a local-language disease or count.
    # It is still evidence-backed and never uses the publisher country.
    if strict_projection_locations and disease != "UNKNOWN" and not ncd_only:
        projected_cases = sum(int(item.reported_cases or 0) for item in strict_projection_locations)
        projected_deaths = sum(int(item.deaths or 0) for item in strict_projection_locations if item.deaths is not None)
        if projected_cases > 0 and (not explicit_case_count or case_count == 0):
            case_count = projected_cases
            explicit_case_count = True
        if projected_deaths > 0 and death_count == 0:
            death_count = projected_deaths

    # Some narrative forms expose the country total to the general count
    # extractor but not to the stricter location regex (for example,
    # "Thailand reported 100 dengue cases").  When the public projection has
    # exactly one country event, carry that already-evidence-backed total into
    # the event instead of leaving its cases at zero/unknown.
    event_countries = {str(evt.country or "").casefold() for evt in sub_events if evt.country}
    if len(sub_events) == 1 and len(event_countries) == 1:
        is_country_event = (
            not sub_events[0].location_name
            or str(sub_events[0].location_name).casefold() == str(sub_events[0].country).casefold()
        )
        if is_country_event:
            # Synchronize parent and single country child event exactly
            if sub_events[0].case_count > 0 and case_count > 0:
                unified_cases = max(case_count, sub_events[0].case_count)
                case_count = unified_cases
                sub_events[0].case_count = unified_cases
            elif explicit_case_count and case_count > sub_events[0].case_count:
                sub_events[0].case_count = case_count
            elif sub_events[0].case_count > case_count:
                case_count = sub_events[0].case_count
                explicit_case_count = True

            if death_count > sub_events[0].death_count:
                sub_events[0].death_count = death_count
            elif sub_events[0].death_count > death_count:
                death_count = sub_events[0].death_count
        else:
            # sub_events[0] is a regional mention. If it has no regional metric but there is a national total,
            # promote the event to country-level rather than pasting national total onto the region.
            if explicit_case_count and case_count > 0 and sub_events[0].case_count <= 0:
                sub_events[0].location_name = sub_events[0].country
                sub_events[0].admin1 = None
                sub_events[0].admin2 = None
                sub_events[0].case_count = case_count
                if death_count > 0:
                    sub_events[0].death_count = death_count

    # Identify aggregate country total vs regional breakdown events (e.g. Vietnam, Cambodia)
    country_sub_events = [
        evt for evt in sub_events
        if evt.country and str(evt.location_name or "").casefold() == str(evt.country).casefold()
    ]
    regional_sub_events = [
        evt for evt in sub_events
        if evt.country and str(evt.location_name or "").casefold() != str(evt.country).casefold()
    ]
    if country_sub_events and regional_sub_events:
        for c_evt in country_sub_events:
            c_evt.provenance.setdefault("role", "aggregate_total")
            c_evt.provenance["is_aggregate"] = True
            c_evt.provenance["breakdown_count"] = len(regional_sub_events)
            if c_evt.case_count > 0:
                case_count = c_evt.case_count
                explicit_case_count = True
            if c_evt.death_count > 0:
                death_count = max(death_count, c_evt.death_count)

        for r_evt in regional_sub_events:
            r_evt.provenance.setdefault("role", "regional_breakdown")
            r_evt.provenance["is_aggregate"] = False
            r_evt.provenance["aggregate_location"] = r_evt.country
            if "regional_breakdown_of_national_total" not in r_evt.validation_flags:
                r_evt.validation_flags.append("regional_breakdown_of_national_total")
            if not r_evt.disease or r_evt.disease.upper() == "UNKNOWN":
                matching_country_evt = next((ce for ce in country_sub_events if ce.country == r_evt.country), country_sub_events[0])
                if matching_country_evt.disease and matching_country_evt.disease.upper() != "UNKNOWN":
                    r_evt.disease = matching_country_evt.disease
                    r_evt.needs_review = True
            r_evt.relations.append({
                "type": "breakdown_of",
                "target": r_evt.country,
                "aggregate_cases": country_sub_events[0].case_count,
            })

    # Re-apply the source-first scalar metric after event composition. The
    # composer may have a historical or nested relation candidate, while the
    # deterministic source extractor already selected the article's focal
    # single-disease scope. Multi-disease articles continue through their
    # disease-specific relation rows below.
    source_disease_labels = {
        extractors.canonical_disease_name(value)
        for value in extracted
        if value and extractors.canonical_disease_name(value).upper() != "UNKNOWN"
    }
    if len(source_disease_labels) == 1 and source_case_count and explicit_case_count:
        case_count = source_case_count
        if len(sub_events) == 1:
            sub_events[0].case_count = source_case_count
    if len(source_disease_labels) == 1 and source_death_explicit:
        death_count = source_death_count
        if len(sub_events) == 1:
            sub_events[0].death_count = source_death_count

    # Split only when the source explicitly binds different counts to
    # different disease names. A shared phrase such as "measles and rubella
    # cases" remains one reviewable aggregate because its total cannot be
    # assigned to either disease safely.
    if len(article_disease_candidates) > 1 and sub_events:
        disease_metrics = extractors.extract_disease_case_metrics(
            text,
            article_disease_candidates,
        )
        metric_rows = [
            (label, metric)
            for label, metric in disease_metrics.items()
            if int(metric.get("case_count") or 0) > 0
        ]
        metric_values = {int(metric.get("case_count") or 0) for _, metric in metric_rows}
        if len(metric_rows) >= 2 and len(metric_values) >= 2:
            base_event = sub_events[0]
            split_events = []
            for label, metric in metric_rows:
                event = base_event.model_copy(deep=True)
                event.disease = label
                event.case_count = int(metric["case_count"] or 0)
                event.death_count = 0
                # A disease-specific metric row may refer to a different
                # country/locality than the first article event. Resolve its
                # location from the original evidence before creating the
                # child event; cloning the first event would attach every
                # disease to the same place in a multi-country roundup.
                metric_evidence = str(metric.get("evidence") or "").strip()
                metric_start = metric.get("evidence_offset_start")
                metric_end = metric.get("evidence_offset_end")
                metric_context = metric_evidence
                if isinstance(metric_start, int) and isinstance(metric_end, int):
                    metric_context = extractors._sentence_window(text, metric_start, metric_end)
                metric_locations = extractors.extract_all_locations(metric_context)
                metric_location = next(
                    (
                        item for item in metric_locations
                        if item.get("country") in config.ASEAN_COUNTRIES
                        and extractors.is_usable_place_name(str(item.get("name") or ""), metric_evidence)
                    ),
                    None,
                )
                if metric_location:
                    event.location_name = metric_location.get("name") or event.location_name
                    event.country = metric_location.get("country") or event.country
                    event.country_iso3 = metric_location.get("country_iso3") or event.country_iso3
                    event.admin1 = metric_location.get("admin1")
                    event.admin2 = metric_location.get("admin2")
                    event.latitude = metric_location.get("latitude")
                    event.longitude = metric_location.get("longitude")
                # Evidence must come from the original sentence that contains the exact number
                value_digits = re.sub(r"\D", "", str(event.case_count))
                sentence_evidence = None
                for sentence in re.split(r"(?<=[.!?。！？])\s+|\n+", text):
                    clean_s = " ".join(sentence.split()).strip()
                    if (
                        value_digits
                        and value_digits in re.sub(r"\D", "", clean_s)
                        and extractors.disease_has_textual_evidence(label, clean_s)
                    ):
                        sentence_evidence = clean_s
                        break
                if not sentence_evidence:
                    sentence_evidence = str(metric.get("evidence") or event.evidence)
                event.evidence = sentence_evidence
                event.source_evidence = sentence_evidence
                start = text.find(sentence_evidence)
                event.evidence_offset_start = start if start >= 0 else metric.get("evidence_offset_start")
                event.evidence_offset_end = start + len(sentence_evidence) if start >= 0 else metric.get("evidence_offset_end")
                event.needs_review = True
                if "disease_specific_metric_split" not in event.validation_flags:
                    event.validation_flags.append("disease_specific_metric_split")
                split_events.append(event)
            sub_events = split_events
            case_count = sum(event.case_count for event in sub_events)
            explicit_case_count = True

    # If the article identifies only a country, make that country the event
    # location and use its gazetteer centroid.  This is event geography, not
    # publisher/source geography.
    if country and (not location or str(location).strip().casefold() != str(country).strip().casefold()):
        location_hierarchy = extractors.resolve_location_hierarchy(country, country_hint=country)
        if not location:
            location = location_hierarchy.get("canonical_name") or country
        if lat is None and location.casefold() == str(country).casefold():
            lat = location_hierarchy.get("latitude")
            lon = location_hierarchy.get("longitude")
    elif country and lat is None:
        location_hierarchy = extractors.resolve_location_hierarchy(country, country_hint=country)
        lat = location_hierarchy.get("latitude")
        lon = location_hierarchy.get("longitude")

    # Country-level parent and child rows are the same geographic fact.  Keep
    # one coordinate source for both; otherwise an earlier gazetteer fallback
    # can leave the child at a different country centroid than the parent.
    if country and lat is not None and lon is not None:
        for evt in sub_events:
            if str(evt.location_name or "").casefold() == str(country).casefold():
                evt.latitude = lat
                evt.longitude = lon

    # Disease mentions without a metric/location/time relation remain
    # mentions.  They must not be promoted to phantom zero-count events.
    if ncd_only:
        sub_events = []

    # A scalar article row cannot safely pretend that the first country is the
    # only event in a multi-country report. Keep the country/event rows as the
    # source of truth and expose an explicit multi-country parent summary.
    event_country_values = list(dict.fromkeys(
        str(evt.country or "").strip()
        for evt in sub_events
        if str(evt.country or "").strip()
    ))
    multi_country_article = len(event_country_values) > 1
    if multi_country_article:
        country = "MULTI_COUNTRY"
        location = "MULTI_COUNTRY"
        lat = None
        lon = None
        case_count = sum(int(evt.case_count or 0) for evt in sub_events)
        death_count = sum(
            int(metric.get("value") or 0)
            for evt in sub_events
            for metric in (evt.metrics or [])
            if metric.get("metric_type") == "deaths"
        )
        explicit_case_count = bool(sub_events)

    # Regional events exist ONLY when metrics are truly bound to that region.
    # Bare location mentions belong in the location matrix, not as empty regional events.
    sub_events = [
        evt for evt in sub_events
        if (
            (evt.case_count or 0) > 0
            or (evt.death_count or 0) > 0
            or evt.metric_type == "negative_surveillance"
            or (evt.country and str(evt.location_name or "").casefold() == str(evt.country).casefold())
        )
    ]

    all_locations = _attach_location_provenance(all_locations, text)

    # Apply the same country-compatibility rule to the location matrix. A
    # conflicting gazetteer candidate may remain visible as source evidence,
    # but it must not expose the wrong admin hierarchy or coordinates.
    for item in all_locations:
        raw_item_country = item.get("country")
        target_item_country = country
        if raw_item_country and mentioned_countries:
            if any(raw_item_country.casefold() == mc.casefold() for mc in mentioned_countries):
                target_item_country = raw_item_country

        safe_hierarchy = extractors.resolve_event_location_hierarchy(
            item.get("name"), country_hint=target_item_country or country
        )
        if safe_hierarchy.get("country_conflict"):
            item["original_name"] = item.get("original_name") or item.get("name")
            item["name"] = safe_hierarchy.get("canonical_name") or target_item_country or item.get("name")
            item["country"] = safe_hierarchy.get("country") or target_item_country
            item["country_iso3"] = safe_hierarchy.get("country_iso3")
            item["admin1"] = None
            item["admin2"] = None
            item["latitude"] = safe_hierarchy.get("latitude")
            item["longitude"] = safe_hierarchy.get("longitude")
            item["geocode_needs_review"] = True

        norm_c = extractors.normalize_country(item.get("country"))
        if norm_c:
            item["country"] = norm_c
            item["country_iso3"] = config.COUNTRY_TO_ISO3.get(norm_c.casefold(), item.get("country_iso3"))
            if item.get("latitude") is not None and item.get("longitude") is not None:
                if not extractors.coords_in_country_bbox(item.get("latitude"), item.get("longitude"), norm_c):
                    item["latitude"] = None
                    item["longitude"] = None
                    item["admin1"] = None
                    item["admin2"] = None
                    item["geocode_needs_review"] = True

    if llm_verified_sub_events:
        # The rear-gate is allowed to repair low-confidence local relations,
        # but only with guardrail-verified source evidence. Keeping the noisy
        # local rows here would preserve false country/count associations even
        # after a successful DeepSeek review.
        reviewed_events = []
        for levt in llm_verified_sub_events:
            if not levt.get("evidence"):
                continue
            # A country-level event is valid even when the model has no
            # province/city. Keep the country as the canonical location so
            # the reviewed event is not discarded and the local noisy bundle
            # cannot be restored later in the pipeline.
            reviewed_location = levt.get("location_name") or levt.get("country")
            if not reviewed_location:
                continue
            reviewed_location = config.upsert_reviewed_location(
                reviewed_location if _location_is_source_grounded(reviewed_location, text) else None,
                levt.get("country") or country,
                alias=levt.get("location_name"),
                language=language,
            ) or reviewed_location
            local_specific = next(
                (
                    item.get("name")
                    for item in all_locations
                    if item.get("name")
                    and item.get("country") == (levt.get("country") or country)
                    and str(item.get("name")).casefold()
                    != str(levt.get("country") or country).casefold()
                ),
                None,
            )
            if local_specific and str(reviewed_location).casefold() == str(
                levt.get("country") or country
            ).casefold():
                reviewed_location = local_specific
            if not _location_is_source_grounded(reviewed_location, text):
                reviewed_location = payload.source_country or country or levt.get("country")
            reviewed_country = (
                payload.source_country
                if payload.source_country and not _location_is_source_grounded(
                    levt.get("location_name"), text
                )
                else levt.get("country") or country
            )
            reviewed_events.append(
                SubEvent(
                    disease=levt.get("disease") or disease,
                    location_name=reviewed_location,
                    country=reviewed_country,
                    admin1=levt.get("admin1"),
                    admin2=levt.get("admin2"),
                    case_count=int(levt.get("case_count") or 0),
                    death_count=int(levt.get("death_count") or 0),
                    evidence=levt.get("evidence") or "",
                    needs_review=False,
                )
            )
        boundary = _primary_article_boundary(text)
        if boundary is not None and source_case_count:
            # Do not let a verified quote from a concatenated second article
            # replace the primary source metric. If the review contains no
            # primary event after this filter, the deterministic local event
            # remains authoritative.
            primary_events = [
                event for event in reviewed_events
                if 0 <= (text or "").lower().find((event.evidence or "").lower()) < boundary
            ]
            if primary_events:
                reviewed_events = primary_events
            else:
                reviewed_events = []
        if reviewed_events:
            # A review can quote a current total and an older comparison for
            # the same place. Keep one authoritative period per
            # (disease, country, location) so the parent scalar cannot sum
            # historical context into the live surveillance figure.
            def _review_period_rank(event: SubEvent) -> tuple[int, int, int]:
                years = [int(value) for value in re.findall(r"\b20\d{2}\b", event.evidence or "")]
                evidence_lower = (event.evidence or "").casefold()
                cumulative = int(bool(re.search(
                    r"\b(?:cumulative|kumulatif|l[uù]y\s+k[eế]|so\s+far|hingga|sampai|"
                    r"year\s+to\s+date|ytd)\b",
                    evidence_lower,
                    re.IGNORECASE,
                )))
                return (max(years, default=-1), cumulative, int(event.case_count or 0))

            grouped_review: dict[tuple[str, str, str], list[SubEvent]] = {}
            for event in reviewed_events:
                key = (
                    str(event.disease or "").casefold(),
                    str(event.country or "").casefold(),
                    str(event.location_name or "").casefold(),
                )
                grouped_review.setdefault(key, []).append(event)
            sub_events = [
                max(group, key=_review_period_rank)
                for group in grouped_review.values()
            ]
            reviewed_cases = sum(int(event.case_count or 0) for event in sub_events)
            reviewed_deaths = sum(int(event.death_count or 0) for event in sub_events)
            source_case_count = reviewed_cases
            source_death_count = reviewed_deaths
            source_death_explicit = reviewed_deaths > 0
            explicit_case_count = reviewed_cases > 0
            case_count = reviewed_cases
            death_count = reviewed_deaths

    if llm_verified_sub_events and sub_events:
        # Parent totals must use country-level events only when a country total
        # exists. Province/city rows are valid detail but are subsets, not
        # additional cases to add to the parent aggregate.
        country_level = [
            evt for evt in sub_events
            if evt.country and str(evt.location_name or "").casefold()
            == str(evt.country or "").casefold()
        ]
        aggregate_events = country_level or sub_events
        if multi_country_article and source_case_count:
            # The source article's explicit cross-country total is authoritative
            # for the parent. Child rows are country facts and must not be
            # summed when one of them is a country total/subset pair.
            case_count = source_case_count
            death_count = source_death_count if source_death_explicit else sum(
                int(evt.death_count or 0) for evt in aggregate_events
            )
        else:
            case_count = sum(int(evt.case_count or 0) for evt in aggregate_events)
            death_count = sum(int(evt.death_count or 0) for evt in aggregate_events)

    for evt in sub_events:
        evt.evidence_offset_space = evidence_offset_space
        if evidence_offset_space != "original":
            evt.provenance["source_text"] = "repaired_original"
        resolved_sub = resolve_local_disease_term(evt.disease)
        if resolved_sub and resolved_sub.get("disease_id"):
            evt.disease = resolved_sub["canonical_name"]
            evt.disease_id = resolved_sub["disease_id"]

    coded_mentions = [
        mention for mention in disease_mentions
        if mention.disease_id
        and mention.canonical_name
        and mention.canonical_name.upper() != "UNKNOWN"
    ]
    if coded_mentions and (not disease or disease.strip().upper() == "UNKNOWN") and not ncd_only:
        primary_mention = next(
            (mention for mention in coded_mentions if mention.role == "primary"),
            coded_mentions[0],
        )
        disease = primary_mention.canonical_name
        extracted = list(dict.fromkeys(
            [mention.canonical_name for mention in coded_mentions] + list(extracted)
        ))
    else:
        resolved_primary = resolve_local_disease_term(disease)
        if resolved_primary and resolved_primary.get("disease_id"):
            disease = resolved_primary["canonical_name"]

    if llm_review_cleared_events:
        # DeepSeek returned a valid, evidence-checked review with no active
        # event. Its empty event decision overrides local false positives.
        sub_events = []
        case_count = 0
        death_count = 0
        explicit_case_count = False
        outbreak_alert = False
        location = None
        country = None
        lat = None
        lon = None
        all_locations = []
        event_type = "health update"

    if llm_review_non_health:
        disease = "UNKNOWN"
        extracted = []
        is_health_related = False

    if llm_review_applied and llm_review_disease and not llm_review_non_health:
        # Keep a valid DeepSeek disease correction authoritative through the
        # later local projection steps. If no verified LLM events exist, the
        # source-local metric event remains useful, but its disease identity
        # must follow the reviewed concept rather than the stale classifier.
        disease = llm_review_disease
        extracted = list(dict.fromkeys([llm_review_disease, *extracted]))
        is_health_related = True
        for evt in sub_events:
            if evt.disease and evt.disease.strip().upper() != "UNKNOWN":
                evt.disease = llm_review_disease

    # Final locality preference: a source-grounded city/province wins over a
    # country-only LLM answer. This is especially important for short RSS
    # titles where the model sees the country but the gazetteer sees Hanoi,
    # Dong Thap, or Da Nang in the original script.
    relation_location_names = list(dict.fromkeys(
        str(relation.location.name)
        for relation in relational_events
        if getattr(relation, "location", None)
        and getattr(relation.location, "name", None)
        and (int(getattr(relation, "cases", 0) or 0) > 0 or int(getattr(relation, "deaths", 0) or 0) > 0)
        and _location_is_source_grounded(relation.location.name, text)
    ))
    local_source_location = (
        relation_location_names[0]
        if len(relation_location_names) == 1
        else next(
            (
                item.get("name")
                for item in all_locations
                if item.get("name")
                and _location_is_source_grounded(item.get("name"), text)
                and str(item.get("name")).casefold() != str(country or "").casefold()
            ),
            None,
        )
    )
    if local_source_location and (
        len(relation_location_names) == 1
        or not location
        or str(location).casefold() == str(country or "").casefold()
        or not _location_is_source_grounded(location, text)
    ):
        location = local_source_location
        if source_country:
            country = source_country
        if len(sub_events) == 1:
            sub_events[0].location_name = local_source_location
            sub_events[0].country = country
        elif len(relation_location_names) == 1:
            for event in sub_events:
                if str(event.country or country).casefold() == str(country or "").casefold():
                    evidence_cf = str(event.evidence or "").casefold()
                    current_name = str(event.location_name or "")
                    # A count whose evidence already names its place keeps that
                    # place. Do not stamp the document's single city onto it.
                    if (
                        current_name
                        and current_name.casefold() != str(local_source_location).casefold()
                        and current_name.casefold() in evidence_cf
                    ):
                        continue
                    event.location_name = local_source_location
                    event.country = country

    summary = _build_article_summary(
        text,
        disease=disease,
        location=location,
        country=country,
        source_country=source_country,
        surveillance_scope=("MULTI_COUNTRY" if country == "MULTI_COUNTRY" else "ASEAN" if country in config.ASEAN_COUNTRIES else "Outside ASEAN" if country else None),
        case_count=case_count,
        death_count=death_count,
    )

    from .multi_fact_display import collapse_facts

    hierarchy_country = (
        raw_country
        if explicit_country
        and raw_country
        and raw_country.casefold() == explicit_country.casefold()
        else country
    )
    loc_hier = extractors.resolve_event_location_hierarchy(location, country_hint=hierarchy_country)
    admin_place = extractors.split_admin_place(location, country)
    final_province = loc_hier.get("admin1_name") or admin_place[0]
    final_city = loc_hier.get("admin2_name") or admin_place[1]
    final_iso3 = loc_hier.get("country_iso3")

    # A location can be a valid gazetteer name in another country. The event
    # country is the article's evidence-backed scope, so a conflicting
    # locality is retained only as provenance and cannot leak its hierarchy or
    # coordinates into the public response.
    if loc_hier.get("country_conflict"):
        original_location = original_location or loc_hier.get("original_location_name")
        location = loc_hier.get("canonical_name") or country or location
        final_province = None
        final_city = None
        lat = loc_hier.get("latitude")
        lon = loc_hier.get("longitude")
        final_iso3 = loc_hier.get("country_iso3")
        geocode_needs_review = True
        needs_review = True
        if "location_country_conflict" not in doc_validation_flags:
            doc_validation_flags.append("location_country_conflict")
    elif country:
        norm_country = extractors.normalize_country(country)
        final_iso3 = config.COUNTRY_TO_ISO3.get(norm_country.casefold(), final_iso3)
        if lat is not None and lon is not None:
            if not extractors.coords_in_country_bbox(lat, lon, norm_country):
                centroid = extractors.ASEAN_COUNTRY_CENTROIDS.get(norm_country)
                if centroid:
                    lat, lon = centroid[0], centroid[1]
                else:
                    lat, lon = None, None
                final_province = None
                final_city = None
                geocode_needs_review = True
                needs_review = True
                if "location_country_conflict" not in doc_validation_flags:
                    doc_validation_flags.append("location_country_conflict")

    # Do not collapse a multi-country article onto the largest/first event.
    # The parent is explicitly marked MULTI_COUNTRY and sub_events remain the
    # authoritative country-scoped facts.

    metric_countries = {
        str(item.country or "").strip()
        for item in strict_projection_locations
        if item.country
    }
    article_event_country = next(iter(metric_countries), None) if len(metric_countries) == 1 else None
    if article_event_country is None and len(mentioned_countries) == 1:
        article_event_country = next(iter(mentioned_countries))

    safe_parent_country = country if country != "MULTI_COUNTRY" else None
    for evt in sub_events:
        evt_country = evt.country or safe_parent_country
        target_country = article_event_country or safe_parent_country
        if (
            target_country
            and evt_country
            and str(evt_country).casefold() != target_country.casefold()
        ):
            if not any(str(evt_country).casefold() == mc.casefold() for mc in mentioned_countries):
                evt_country = target_country

        event_hier = extractors.resolve_event_location_hierarchy(
            evt.location_name,
            country_hint=evt_country,
        )
        if event_hier.get("country_conflict"):
            evt.provenance.setdefault("location_conflict", {})
            evt.provenance["location_conflict"].update(
                {
                    "original_location_name": event_hier.get("original_location_name") or evt.location_name,
                    "original_canonical_name": event_hier.get("original_canonical_name"),
                    "original_country": event_hier.get("original_country"),
                    "resolved_country": event_hier.get("country"),
                }
            )
            evt.location_name = event_hier.get("canonical_name") or evt_country or evt.location_name
            evt.country = event_hier.get("country") or evt_country
            evt.admin1 = None
            evt.admin2 = None
            evt.country_iso3 = event_hier.get("country_iso3")
            evt.latitude = event_hier.get("latitude")
            evt.longitude = event_hier.get("longitude")
            evt.needs_review = True
            if "location_country_conflict" not in evt.validation_flags:
                evt.validation_flags.append("location_country_conflict")

        if evt.country == "MULTI_COUNTRY":
            evt.country = None
        if evt.location_name == "MULTI_COUNTRY":
            evt.location_name = None
        norm_evt_country = extractors.normalize_country(evt.country)
        if norm_evt_country:
            evt.country = norm_evt_country
            evt.country_iso3 = config.COUNTRY_TO_ISO3.get(norm_evt_country.casefold(), evt.country_iso3)
            if evt.latitude is not None and evt.longitude is not None:
                if not extractors.coords_in_country_bbox(evt.latitude, evt.longitude, norm_evt_country):
                    centroid = extractors.ASEAN_COUNTRY_CENTROIDS.get(norm_evt_country)
                    if centroid:
                        evt.latitude, evt.longitude = centroid[0], centroid[1]
                    else:
                        evt.latitude, evt.longitude = None, None
                    evt.admin1 = None
                    evt.admin2 = None
                    evt.needs_review = True
                    if "location_country_conflict" not in evt.validation_flags:
                        evt.validation_flags.append("location_country_conflict")

            for admin_field in ("admin1", "admin2"):
                admin_val = getattr(evt, admin_field)
                if admin_val:
                    admin_h = extractors.resolve_location_hierarchy(admin_val)
                    if admin_h.get("country") and admin_h["country"].casefold() != norm_evt_country.casefold():
                        setattr(evt, admin_field, None)
                        evt.needs_review = True
                        if "location_country_conflict" not in evt.validation_flags:
                            evt.validation_flags.append("location_country_conflict")

    # The legacy scalar extractor remains the current-period authority for a
    # single disease/country event. A relation composer may also retain a
    # historical comparator in the same evidence bundle; do not let that
    # comparator become the visible sub-event count.
    if len(sub_events) == 1 and source_case_count and explicit_case_count:
        only_event = sub_events[0]
        if int(only_event.case_count or 0) != int(source_case_count):
            only_event.case_count = int(source_case_count)
            only_event.metric_type = "cases"
            only_event.temporal_context = "current"
            only_event.needs_review = bool(only_event.needs_review)

    # Country-safety normalization can turn a conflicting locality row into
    # the same country row as an existing aggregate. Deduplicate only when
    # disease, country, location, metric type, and temporal context all agree;
    # distinct diseases or periods remain separate events.
    unique_events = {}
    for evt in sub_events:
        event_key = (
            str(evt.disease or "").casefold(),
            str(evt.country or "").casefold(),
            str(evt.location_name or "").casefold(),
            str(evt.metric_type or ""),
            str(evt.time_frame or ""),
            str(evt.temporal_context or ""),
        )
        existing = unique_events.get(event_key)
        if existing is None:
            # A parser can emit the same original evidence twice with one
            # candidate carrying a document period and the other carrying a
            # local period. Exact evidence plus identical metric values is a
            # duplicate, not two surveillance events.
            evidence_key = (
                str(evt.disease or "").casefold(),
                str(evt.country or "").casefold(),
                str(evt.location_name or "").casefold(),
                str(evt.metric_type or ""),
                int(evt.case_count or 0),
                int(evt.death_count or 0),
                re.sub(r"\s+", " ", str(evt.evidence or "").casefold()).strip(),
            )
            existing = next(
                (
                    candidate for candidate in unique_events.values()
                    if (
                        str(candidate.disease or "").casefold(),
                        str(candidate.country or "").casefold(),
                        str(candidate.location_name or "").casefold(),
                        str(candidate.metric_type or ""),
                        int(candidate.case_count or 0),
                        int(candidate.death_count or 0),
                        re.sub(r"\s+", " ", str(candidate.evidence or "").casefold()).strip(),
                    ) == evidence_key
                ),
                None,
            )
        if existing is None:
            unique_events[event_key] = evt
            continue
        # Prefer the non-review aggregate when both rows carry the same
        # evidence-backed fact; preserve the largest explicit metric values.
        if existing.needs_review and not evt.needs_review:
            preferred, secondary = evt, existing
        else:
            preferred, secondary = existing, evt
        preferred.case_count = max(preferred.case_count, secondary.case_count)
        preferred.death_count = max(preferred.death_count, secondary.death_count)
        if secondary.evidence and secondary.evidence not in preferred.evidence:
            preferred.evidence = ". ".join(
                value for value in (preferred.evidence, secondary.evidence) if value
            )
        preferred.relations.extend(item for item in secondary.relations if item not in preferred.relations)
        preferred.metrics.extend(item for item in secondary.metrics if item not in preferred.metrics)
        preferred.provenance.setdefault("deduplicated_source_events", 0)
        preferred.provenance["deduplicated_source_events"] += 1
        preferred.validation_flags = list(dict.fromkeys(
            [*preferred.validation_flags, *secondary.validation_flags]
        ))
    sub_events = list(unique_events.values())

    # A disease/location mention without an incident metric is context, not a
    # zero-count event. Negative-surveillance language remains eligible via
    # article_states_zero_cases(). This prevents narrative articles such as
    # a local report saying disease activity is rising, but giving no count,
    # from becoming a phantom event with 0 cases and 0 deaths.
    has_incident_metric = (
        explicit_case_count
        or death_count > 0
        or any((evt.case_count or 0) > 0 or (evt.death_count or 0) > 0 for evt in sub_events)
        or extractors.article_states_zero_cases(text)
    )
    if not has_incident_metric and not ncd_only:
        sub_events = []

    # If a single disease owns the metric relations, an UNKNOWN event row is
    # an attribution gap rather than a second disease. Inherit that identity
    # only in the unambiguous one-disease case; multi-disease articles remain
    # reviewable instead of guessing.
    event_disease_candidates = list(dict.fromkeys(
        extractors.canonical_disease_name(value)
        for value in (relation_diseases or ([disease] if disease else []))
        if value and extractors.canonical_disease_name(value).upper() != "UNKNOWN"
    ))
    if not event_disease_candidates and disease and disease.upper() != "UNKNOWN":
        event_disease_candidates = [extractors.canonical_disease_name(disease)]

    if len(event_disease_candidates) == 1:
        inherited_disease = event_disease_candidates[0]
        for evt in sub_events:
            if (
                extractors.canonical_disease_name(evt.disease or "UNKNOWN").upper() == "UNKNOWN"
                and ((evt.case_count or 0) > 0 or (evt.death_count or 0) > 0)
            ):
                evt.disease = inherited_disease
                evt.needs_review = True
                if "disease_inherited_from_single_relation" not in evt.validation_flags:
                    evt.validation_flags.append("disease_inherited_from_single_relation")

    # Re-assert exact country-total evidence after all relation normalization.
    # This is intentionally based on the original evidence list, so a nearby
    # regional relation cannot remain the visible proof for a national total.
    for evt in sub_events:
        if (
            str(evt.location_name or "").casefold() != str(evt.country or "").casefold()
            or (evt.case_count or 0) <= 0
        ):
            continue
        value_digits = re.sub(r"\D", "", str(evt.case_count))
        for candidate in evidence:
            if value_digits and value_digits in re.sub(r"\D", "", str(candidate)):
                evt.evidence = candidate
                evt.source_evidence = candidate
                start = text.find(candidate)
                evt.evidence_offset_start = start if start >= 0 else None
                evt.evidence_offset_end = start + len(candidate) if start >= 0 else None
                break

    # Build the parent-row display only after event attribution is complete.
    # Otherwise an UNKNOWN event or a regional candidate can leak into the
    # semicolon fields before it is normalized to its country-level fact.
    shared_metric_disease_display = (
        "; ".join(article_disease_candidates)
        if len(sub_events) == 1 and len(article_disease_candidates) > 1
        else None
    )
    display_facts = [
        {
            "disease": shared_metric_disease_display or evt.disease,
            "location_name": evt.location_name,
            "country": evt.country,
            "province": evt.admin1 or extractors.split_admin_place(evt.location_name, evt.country)[0],
            "city": evt.admin2 or extractors.split_admin_place(evt.location_name, evt.country)[1],
            "case_count": evt.case_count,
            "death_count": evt.death_count,
        }
        for evt in sub_events
    ] or [
        {
            "disease": "; ".join(relation_diseases) if len(relation_diseases) > 1 else disease,
            "location_name": location,
            "country": country,
            "province": extractors.split_admin_place(location, country)[0],
            "city": extractors.split_admin_place(location, country)[1],
            "case_count": case_count,
            "death_count": death_count,
        }
    ]
    collapsed = collapse_facts(display_facts)
    if shared_metric_disease_display:
        # The total belongs to the combined source phrase, not separately to
        # every disease named in that phrase.
        collapsed["cases_display"] = None
        collapsed["deaths_display"] = None

    doc_epistemic = classify_epistemic_status(text, disease=disease, evidence=" ".join(evidence))
    conf_cases = typed_counts.get("confirmed_cases")
    susp_cases = typed_counts.get("suspected_cases")
    if conf_cases is None and doc_epistemic == "confirmed" and case_count > 0:
        conf_cases = case_count
    if susp_cases is None and doc_epistemic == "suspected" and case_count > 0:
        susp_cases = case_count

    v_needs_review, val_flags = validate_surveillance_facts(
        text=text,
        disease=disease,
        location=location,
        case_count=case_count,
        death_count=death_count,
        epistemic_status=doc_epistemic,
        count_period_type=count_period,
        sub_events=sub_events,
    )
    for vf in val_flags:
        if vf not in doc_validation_flags:
            doc_validation_flags.append(vf)
    if v_needs_review:
        needs_review = True
    metric_without_disease_relation = (
        disease.strip().upper() == "UNKNOWN"
        and (case_count > 0 or death_count > 0)
        and not relation_diseases
    )
    if metric_without_disease_relation:
        needs_review = True
        if "metric_without_disease_relation" not in doc_validation_flags:
            doc_validation_flags.append("metric_without_disease_relation")
    if location_country_conflict:
        needs_review = True
        if "location_country_conflict" not in doc_validation_flags:
            doc_validation_flags.append("location_country_conflict")

    # Final scalar invariant for a single source event. Relation composition
    # may temporarily promote a historical/comparator metric (for example
    # last year's 19 cases) while the source-first extractor selected the
    # current focal case (1 case). Keep the parent scalar aligned with the
    # authoritative source projection and the only child event.
    if len(sub_events) == 1 and source_case_count and explicit_case_count:
        if int(case_count or 0) != int(source_case_count):
            case_count = int(source_case_count)
    if len(sub_events) == 1 and source_death_explicit:
        if int(death_count or 0) != int(source_death_count):
            death_count = int(source_death_count)

    if is_challenge_page:
        disease = "NEGATIVE_NON_HEALTH"
        case_count = 0
        death_count = 0
        sub_events = []
        outbreak_alert = False
        is_health_related = False

    local_rows = [
        evt for evt in sub_events
        if int(evt.case_count or 0) > 0
        and str(evt.metric_qualifier or "") not in {"global_average", "other_url"}
        and str((evt.provenance or {}).get("source_scope") or "article_local") == "article_local"
    ]
    if local_rows:
        local_names = {str(evt.location_name or "").casefold() for evt in local_rows if evt.location_name}
        local_counts = {int(evt.case_count or 0) for evt in local_rows}
        if location and str(location).casefold() not in local_names:
            # The most frequent narrative place is not where the counts were reported.
            if len(local_names) == 1:
                location = next(evt.location_name for evt in local_rows if evt.location_name)
                loc_hier = extractors.resolve_event_location_hierarchy(location, country_hint=country)
                admin_place = extractors.split_admin_place(location, country)
                final_province = loc_hier.get("admin1_name") or admin_place[0]
                final_city = loc_hier.get("admin2_name") or admin_place[1]
            else:
                final_province = None
                final_city = None
                loc_hier = {
                    **loc_hier,
                    "admin1_name": None,
                    "admin2_name": None,
                }
        if case_count and int(case_count) not in local_counts and int(case_count) > max(local_counts):
            case_count = sum(int(evt.case_count or 0) for evt in local_rows)

    outbreak_alert = calibrate_outbreak_alert(
        disease=disease,
        case_count=case_count,
        death_count=death_count,
        epistemic_status=doc_epistemic,
        count_period_type=count_period,
        explicit_outbreak=explicit_outbreak,
        is_health_related=is_health_related,
        validation_flags=doc_validation_flags,
        base_alert=outbreak_alert,
        source_type=payload.source_type or "web",
    )
    if llm_review_applied and llm_review_outbreak is not None and is_health_related:
        # The rear-gate may override a false local outbreak classification,
        # but only after its evidence/location guardrails have passed.
        if (payload.source_type or "web").strip().casefold() == "social_media" and doc_epistemic not in {
            "confirmed", "official_report"
        }:
            outbreak_alert = False
        else:
            outbreak_alert = llm_review_outbreak

    # Social posts are retained as leads, never promoted to an alert without
    # source-level confirmation. This is deliberately after the LLM override
    # so a reviewer cannot accidentally bypass the source guardrail.
    if (payload.source_type or "web").strip().casefold() == "social_media" and doc_epistemic not in {
        "confirmed", "official_report"
    }:
        outbreak_alert = False
        needs_review = True
        event_type = "health update"

    # A statistical/prevention article can contain large numbers without
    # reporting an incident. DeepSeek may be over-conservative when the
    # source is official, so the local policy gate remains the final veto.
    if is_policy_content and not explicit_outbreak:
        outbreak_alert = False
        event_type = "health update"

    response_new_cases = sum(int(evt.new_cases or 0) for evt in sub_events)
    response_cumulative_cases = sum(int(evt.cumulative_cases or 0) for evt in sub_events)
    response_historical_cases = sum(int(evt.historical_cases or 0) for evt in sub_events)

    _stages["total"] = round(_time.monotonic() - _run_started, 3)
    logger.info(
        "pipeline_stage_timings stages=%s chars=%s interactive=%s rules_only=%s",
        _stages,
        len(text),
        payload.interactive,
        payload.rules_only,
    )
    _location_stats = extractors.get_location_resolution_stats()
    logger.info(
        "location_resolution_stats calls=%s cache_hits=%s duration_seconds=%.3f",
        _location_stats["calls"],
        _location_stats["cache_hits"],
        _location_stats["duration_seconds"],
    )
    extractors.reset_location_resolution_stats(_location_resolution_token)

    return AnalyzeResponse(
        language=language,
        language_confidence=float(language_profile.get("confidence") or 0.0),
        language_detection_method=str(language_profile.get("method") or "unknown"),
        script=str(language_profile.get("script") or "Latin"),
        original_text=original_text,
        evidence_offset_space=evidence_offset_space,
        normalized_text=extractors.normalize_text(text),
        summary=summary,
        published_at=published_at,
        publication_date=published_at,
        event_date=event_date,
        location_name=location,
        locations=all_locations,
        original_location_name=original_location,
        source_country=source_country,
        surveillance_scope=("MULTI_COUNTRY" if country == "MULTI_COUNTRY" else "ASEAN" if country in config.ASEAN_COUNTRIES else "Outside ASEAN" if country else None),
        translated=bool(translated_text),
        translation_provider=translation.get("provider") or "none",
        translation_status=translation.get("translation_status") or (
            "completed" if translated_text else "not_required"
        ),
        translated_text=translated_text or "",
        translation_alignment="sentence_id_only",
        country=country,
        latitude=lat,
        longitude=lon,
        symptoms=symptoms,
        disease_extracted=extracted,
        disease_mentions=disease_mentions,
        disease_classification=disease,
        case_count=case_count,
        new_cases=response_new_cases or None,
        cumulative_cases=response_cumulative_cases or None,
        historical_cases=response_historical_cases or None,
        death_count=death_count,
        confirmed_cases=conf_cases,
        suspected_cases=susp_cases,
        hospitalizations=typed_counts["hospitalizations"],
        epistemic_status=doc_epistemic,
        validation_flags=doc_validation_flags,
        evidence=evidence,
        epidemiological_evidence=[
            *evidence,
            *[
                {
                    "disease": evt.disease,
                    "location": evt.location_name,
                    "metrics": evt.metrics,
                    "time_frame": evt.time_frame,
                    "temporal_context": evt.temporal_context,
                    "epistemic_status": evt.epistemic_status,
                    "relations": evt.relations,
                    "provenance": evt.provenance,
                    "confidence": evt.confidence,
                }
                for evt in sub_events
            ],
        ],
        case_count_unknown=not explicit_case_count or metric_without_disease_relation,
        death_count_unknown=not source_death_explicit,
        country_iso3=final_iso3,
        admin1_name=loc_hier.get("admin1_name"),
        admin2_name=loc_hier.get("admin2_name"),
        province=final_province,
        city=final_city,
        geocode_confidence=geocode_confidence,
        geocode_needs_review=geocode_needs_review,
        confidence=confidence,
        outbreak_alert=bool(outbreak_alert),
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
        nlp_pipeline_version=config.NLP_PIPELINE_VERSION,
        count_period_type=count_period,
        event_date_start=period.get("event_date_start"),
        event_date_end=period.get("event_date_end"),
        date_needs_review=bool(period.get("date_needs_review")),
        disease_display=collapsed.get("disease_display") or None,
        location_display=collapsed.get("location_display") or None,
        cases_display=collapsed.get("cases_display"),
        deaths_display=collapsed.get("deaths_display"),
        display_dimension=collapsed.get("dimension"),
    )
