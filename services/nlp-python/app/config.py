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
SOURCE_CREDIBILITY_MAP: dict[str, float] = {}


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
