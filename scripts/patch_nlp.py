import os
import re

print("=== Starting NLP Patch Fixes ===")

# 1. Patch extractors.py
ext_path = "/home/aspire_5/app/NLP-PENYAKIT/services/nlp-python/app/extractors.py"
with open(ext_path, "r", encoding="utf-8") as f:
    ext_code = f.read()

# Update extract_diseases ranking
target_extract_diseases = '''def extract_diseases(text: str) -> list[str]:
    diseases = set(extract_terms(text, config.DISEASE_DICT))
    lower_text = text.lower()
    diseases.update(value for key, value in DISEASE_ALIASES.items() if key in lower_text)
    return sorted(diseases)'''

replacement_extract_diseases = '''def extract_diseases(text: str) -> list[str]:
    diseases = set(extract_terms(text, config.DISEASE_DICT))
    lower_text = text.lower()
    diseases.update(value for key, value in DISEASE_ALIASES.items() if key in lower_text)
    
    def disease_score(d: str) -> tuple[int, int]:
        d_lower = d.lower()
        cnt = lower_text.count(d_lower)
        pos = lower_text.find(d_lower)
        if pos == -1:
            pos = 999999
        return (-cnt, pos)

    return sorted(diseases, key=disease_score)'''

if target_extract_diseases in ext_code:
    ext_code = ext_code.replace(target_extract_diseases, replacement_extract_diseases, 1)
    print("✅ Successfully patched extract_diseases in extractors.py")

# Update explicit incident regex in extractors.py
target_incident = '''    explicit_incident = re.search(
        r"(?:\b(?:outbreak|epidemic|wabah)\b\s*(?:detected|declared|reported|occurred|confirmed|terjadi|dilaporkan|ditetapkan)?|"
        r"\b(?:klb|kejadian luar biasa|cluster|klaster|local transmission|community transmission|"
        r"penularan lokal|transmisi lokal)\b|"
        r"\b(?:surge|spike|melonjak|lonjakan|meningkat tajam)\b.{0,80}\b(?:case|cases|kasus)\b)",
        value,
        re.IGNORECASE,
    )'''

replacement_incident = '''    explicit_incident = re.search(
        r"(?:\b(?:outbreak|epidemic|wabah)\b\s*(?:detected|declared|reported|occurred|confirmed|terjadi|dilaporkan|ditetapkan)?|"
        r"\b(?:klb|kejadian luar biasa|cluster|klaster|local transmission|community transmission|"
        r"penularan lokal|transmisi lokal)\b|"
        r"\b(?:cases linked|cases associated|response to|kasus terkait)\b.{0,80}\b(?:cases?|kasus)?\b|"
        r"\b(?:surge|spike|melonjak|lonjakan|meningkat tajam)\b.{0,80}\b(?:case|cases|kasus)\b)",
        value,
        re.IGNORECASE,
    )'''

if target_incident in ext_code:
    ext_code = ext_code.replace(target_incident, replacement_incident, 1)
    print("✅ Successfully patched explicit_incident in extractors.py")

with open(ext_path, "w", encoding="utf-8") as f:
    f.write(ext_code)

# 2. Patch pipeline.py
pipe_path = "/home/aspire_5/app/NLP-PENYAKIT/services/nlp-python/app/pipeline.py"
with open(pipe_path, "r", encoding="utf-8") as f:
    pipe_code = f.read()

# Update UNKNOWN is_health_related logic at end of pipeline.py
target_unknown_block = '''    # UNKNOWN is not a confirmed disease entity. Keep the record for audit,
    # but exclude it from health analytics and outbreak monitoring in both the
    # collector worker and the URL analyzer.
    if not disease or disease.strip().upper() == "UNKNOWN":
        is_health_related = False
        outbreak_alert = False
        event_type = "unknown"
        event_confidence = 0.0'''

replacement_unknown_block = '''    health_indicator_words = (
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
            event_confidence = 0.0'''

if target_unknown_block in pipe_code:
    pipe_code = pipe_code.replace(target_unknown_block, replacement_unknown_block, 1)
    print("✅ Successfully patched UNKNOWN block in pipeline.py")

with open(pipe_path, "w", encoding="utf-8") as f:
    f.write(pipe_code)

print("=== NLP Patches completed ===")
