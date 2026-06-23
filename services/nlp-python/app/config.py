import os

NLP_MODEL = os.getenv("NLP_MODEL", "xlm-roberta")

MODEL_MAP = {
    "xlm-roberta": "xlm-roberta-base",
    "indobert": "indolem/indobert-base-uncased",
    "fine-tuned": "/app/models/fine-tuned",
}

DISEASE_LABELS = [
    s.strip()
    for s in os.getenv("DISEASE_LABELS", "dengue fever DBD,acute diarrhea,leptospirosis,influenza flu,COVID-19 coronavirus,malaria,tuberculosis TB,chikungunya,pneumonia,typhoid fever,no disease not health relevant").split(",")
    if s.strip()
]

SENTIMENT_LABELS = ["positive", "negative", "neutral"]

EVENT_TYPE_LABELS = [
    "flood banjir flash flood", "earthquake gempa", "landslide tanah longsor",
    "disease outbreak wabah", "fire kebakaran",
    "conflict konflik kerusuhan", "volcanic eruption gunung meletus",
    "tsunami", "extreme weather cuaca ekstrim",
    "industrial accident kecelakaan industri", "drought kekeringan",
]

RELEVANCE_LABELS = [
    "health related medical disease outbreak",
    "general news not health related",
]

SOURCE_CREDIBILITY_MAP = {
    "government": 0.95,
    "who": 0.95,
    "hospital": 0.90,
    "research": 0.85,
    "news": 0.70,
    "rss": 0.65,
    "web": 0.50,
    "social_media": 0.35,
    "csv": 0.60,
    "api": 0.55,
}

LOW_CONFIDENCE_THRESHOLD = float(os.getenv("LOW_CONFIDENCE_THRESHOLD", "0.5"))

DATABASE_URL = os.getenv("DATABASE_URL", "postgres://postgres:root@host.docker.internal:9898/disease_ai")
SYMPTOM_DICT: dict[str, str] = {}
DISEASE_DICT: dict[str, str] = {}
OUTBREAK_RULES: dict[str, int] = {}
LOCATION_COORDS: dict[str, tuple[float, float]] = {}
LANGUAGE_MARKERS: dict[str, list[str]] = {}
EXTRACTION_RULES: dict[str, list[str]] = {}
LANGUAGE_MODEL_MAP: dict[str, str] = {}


def load_keywords_from_db():
    global SYMPTOM_DICT, DISEASE_DICT
    try:
        import psycopg
        from psycopg.rows import dict_row
        conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
        rows = conn.execute(
            "SELECT category, keyword, target_label FROM nlp_keywords WHERE is_active = TRUE ORDER BY priority"
        ).fetchall()
        conn.close()
        symptom = {}
        disease = {}
        for r in rows:
            d = symptom if r["category"] == "symptom" else disease
            d[r["keyword"]] = r["target_label"]
        SYMPTOM_DICT = symptom
        DISEASE_DICT = disease
        import logging
        logging.getLogger(__name__).info(
            "Loaded %d symptom keywords and %d disease keywords from DB",
            len(symptom), len(disease),
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(
            "Failed to load keywords from DB, using empty dicts: %s", e
        )


def load_outbreak_rules_from_db():
    global OUTBREAK_RULES
    try:
        import psycopg
        from psycopg.rows import dict_row
        conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
        rows = conn.execute(
            "SELECT disease_name, min_case_count FROM disease_outbreak_rules WHERE is_active = TRUE"
        ).fetchall()
        conn.close()
        OUTBREAK_RULES = {r["disease_name"].upper(): r["min_case_count"] for r in rows}
        import logging
        logging.getLogger(__name__).info(
            "Loaded %d outbreak rules from DB", len(OUTBREAK_RULES),
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(
            "Failed to load outbreak rules from DB, using defaults: %s", e
        )


def load_locations_from_db():
    global LOCATION_COORDS
    try:
        import psycopg
        from psycopg.rows import dict_row
        conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
        rows = conn.execute(
            "SELECT name, latitude, longitude FROM locations WHERE is_active = TRUE"
        ).fetchall()
        conn.close()
        LOCATION_COORDS = {r["name"]: (r["latitude"], r["longitude"]) for r in rows}
        import logging
        logging.getLogger(__name__).info(
            "Loaded %d locations from DB", len(LOCATION_COORDS),
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(
            "Failed to load locations from DB, using defaults: %s", e
        )


def load_credibility_from_db():
    global SOURCE_CREDIBILITY_MAP
    try:
        import psycopg
        from psycopg.rows import dict_row
        conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
        rows = conn.execute(
            "SELECT source_type, score FROM source_credibility WHERE is_active = TRUE"
        ).fetchall()
        conn.close()
        SOURCE_CREDIBILITY_MAP = {r["source_type"]: r["score"] for r in rows}
        import logging
        logging.getLogger(__name__).info(
            "Loaded %d credibility scores from DB", len(SOURCE_CREDIBILITY_MAP),
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(
            "Failed to load credibility from DB: %s", e
        )


def load_language_markers_from_db():
    global LANGUAGE_MARKERS
    try:
        import psycopg
        from psycopg.rows import dict_row
        conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
        rows = conn.execute(
            "SELECT word, language FROM language_markers WHERE is_active = TRUE ORDER BY language"
        ).fetchall()
        conn.close()
        markers: dict[str, list[str]] = {}
        for r in rows:
            lang = r["language"]
            if lang not in markers:
                markers[lang] = []
            markers[lang].append(r["word"])
        LANGUAGE_MARKERS = markers
        import logging
        logging.getLogger(__name__).info(
            "Loaded %d language markers (%d languages) from DB",
            sum(len(v) for v in markers.values()), len(markers),
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(
            "Failed to load language markers from DB, using defaults: %s", e
        )


def load_extraction_rules_from_db():
    global EXTRACTION_RULES
    try:
        import psycopg
        from psycopg.rows import dict_row
        conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
        rows = conn.execute(
            "SELECT field_name, regex_pattern FROM extraction_rules WHERE is_active = TRUE ORDER BY field_name, priority"
        ).fetchall()
        conn.close()
        rules: dict[str, list[str]] = {}
        for r in rows:
            field = r["field_name"]
            if field not in rules:
                rules[field] = []
            rules[field].append(r["regex_pattern"])
        EXTRACTION_RULES = rules
        import logging
        logging.getLogger(__name__).info(
            "Loaded %d extraction rules (%d fields) from DB",
            sum(len(v) for v in rules.values()), len(rules),
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(
            "Failed to load extraction rules from DB, using defaults: %s", e
        )


def load_language_models_from_db():
    global LANGUAGE_MODEL_MAP
    try:
        import psycopg
        from psycopg.rows import dict_row
        conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
        rows = conn.execute(
            "SELECT language, model_key FROM language_models WHERE is_active = TRUE ORDER BY language"
        ).fetchall()
        conn.close()
        LANGUAGE_MODEL_MAP = {r["language"]: r["model_key"] for r in rows}
        import logging
        logging.getLogger(__name__).info(
            "Loaded %d language-to-model mappings from DB", len(LANGUAGE_MODEL_MAP),
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(
            "Failed to load language models from DB: %s", e
        )
