import os

# 1. Update pipeline.py
pipe_path = "/home/aspire_5/app/NLP-PENYAKIT/services/nlp-python/app/pipeline.py"
with open(pipe_path, "r", encoding="utf-8") as f:
    pipe_code = f.read()

# Replace alphabetical sorting of extracted diseases
target_extracted_sort = '''    primary_extracted = sorted(set(primary_aliases + keyword_diseases + who_mentions))
    extracted = primary_extracted or sorted(set(
        extractors.extract_diseases(analysis_text) + who_mentions
    ))
    for value in structured.get("diseases") or []:
        if isinstance(value, str) and value.strip():
            extracted.append(value.strip().upper().replace("-", ""))
    extracted = sorted(set(extracted))'''

replacement_extracted_sort = '''    def _rank_diseases(candidates: list[str], sample: str) -> list[str]:
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
    extracted = _rank_diseases(extracted, text + " " + analysis_text)'''

if target_extracted_sort in pipe_code:
    pipe_code = pipe_code.replace(target_extracted_sort, replacement_extracted_sort, 1)
    print("✅ Successfully patched extracted disease ranking in pipeline.py")

# Event type outbreak classification enhancement
target_event_assign = '''    if explicit_outbreak and disease != "UNKNOWN":
        event_type = "disease outbreak wabah"
        event_confidence = max(event_confidence, 0.85)
    elif is_reference_content or (
        extractors.is_policy_or_statistical_health_content(analysis_text)
        and not explicit_outbreak
    ):
        outbreak_alert = False
        if is_health_related:
            event_type = "health update"
            event_confidence = max(event_confidence, 0.85)'''

replacement_event_assign = '''    if (explicit_outbreak or case_count > 0 or death_count > 0) and disease != "UNKNOWN":
        event_type = "disease outbreak wabah"
        event_confidence = max(event_confidence, 0.85)
    elif is_reference_content or (
        extractors.is_policy_or_statistical_health_content(analysis_text)
        and not explicit_outbreak
    ):
        outbreak_alert = False
        if is_health_related:
            event_type = "health update"
            event_confidence = max(event_confidence, 0.85)'''

if target_event_assign in pipe_code:
    pipe_code = pipe_code.replace(target_event_assign, replacement_event_assign, 1)
    print("✅ Successfully patched event_type assignment in pipeline.py")

with open(pipe_path, "w", encoding="utf-8") as f:
    f.write(pipe_code)

print("=== Applied pipeline updates ===")
