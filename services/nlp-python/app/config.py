import os
import re
import unicodedata
from typing import Any

NLP_MODEL = os.getenv("NLP_MODEL", "xlm-roberta")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.6-luna")

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "").strip()
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1").rstrip("/")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
DEEPSEEK_MAX_TOKENS = int(os.getenv("DEEPSEEK_MAX_TOKENS", os.getenv("OPENAI_MAX_TOKENS", "2000")))
DEEPSEEK_TIMEOUT_SECONDS = int(os.getenv("DEEPSEEK_TIMEOUT_SECONDS", "20"))
DEEPSEEK_MIN_CONFIDENCE = float(os.getenv("DEEPSEEK_MIN_CONFIDENCE", "0.85"))
DEEPSEEK_TRIGGER_CONFIDENCE = float(os.getenv("DEEPSEEK_TRIGGER_CONFIDENCE", "0.75"))
DEEPSEEK_LOCATION_MIN_CONFIDENCE = float(os.getenv("DEEPSEEK_LOCATION_MIN_CONFIDENCE", "0.80"))
AGENT_ENABLED = os.getenv("AGENT_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
AGENT_PROVIDER_ORDER = os.getenv("AGENT_PROVIDER_ORDER", "deepseek,openai")
AGENT_TIMEOUT_SECONDS = int(os.getenv("AGENT_TIMEOUT_SECONDS", str(DEEPSEEK_TIMEOUT_SECONDS)))

# WHO ICD-11 MMS Configuration
WHO_ICD_CLIENT_ID = os.getenv("WHO_ICD_CLIENT_ID", "").strip()
WHO_ICD_CLIENT_SECRET = os.getenv("WHO_ICD_CLIENT_SECRET", "").strip()
WHO_ICD_TOKEN_URL = os.getenv("WHO_ICD_TOKEN_URL", "https://icdaccessmanagement.who.int/connect/token")
WHO_ICD_API_URL = os.getenv("WHO_ICD_API_URL", "https://id.who.int").rstrip("/")
WHO_ICD_RELEASE = os.getenv("WHO_ICD_RELEASE", "11/2026-01/mms").strip("/")
WHO_ICD_LANGUAGE = os.getenv("WHO_ICD_LANGUAGE", "en")
WHO_ICD_API_VERSION = os.getenv("WHO_ICD_API_VERSION", "v2")
WHO_DISCOVERY_ENABLED = os.getenv("WHO_DISCOVERY_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
WHO_DISCOVERY_MIN_CONFIDENCE = float(os.getenv("WHO_DISCOVERY_MIN_CONFIDENCE", "0.70"))
WHO_TERM_RESOLUTION_ENABLED = os.getenv("WHO_TERM_RESOLUTION_ENABLED", "true").lower() in {"1", "true", "yes", "on"}

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
EXPLICIT_KNOWN_DISEASE_MIN_CASES = int(os.getenv("EXPLICIT_KNOWN_DISEASE_MIN_CASES", "25"))

DATABASE_URL = os.getenv("DATABASE_URL", "postgres://postgres:root@host.docker.internal:9898/disease_ai")
SYMPTOM_DICT: dict[str, str] = {}
DISEASE_DICT: dict[str, str] = {}
OUTBREAK_RULES: dict[str, int] = {}
LOCATION_COORDS: dict[str, tuple[float, float]] = {}
LOCATION_COUNTRIES: dict[str, str] = {}
LOCATION_PATTERNS: list[tuple[str, re.Pattern[str]]] = []
LOCATION_STOPWORDS = {
    "ada", "and", "as", "at", "bao", "baru", "bukan", "by", "dan", "dari",
    "dalam", "for", "from", "here", "hoi", "in", "into", "it", "main",
    "nam", "new", "no", "not", "of", "on", "or", "pada", "same", "satu",
    "that", "the", "this", "to", "trong", "tai", "with", "yang", "yes",
    "buka", "tutup", "poli", "jaga", "kenali", "luar", "sumber",
    "senin", "selasa", "rabu", "kamis", "jumat", "sabtu", "minggu",
    "kasus", "pasien", "rumah", "sakit", "anak", "umum", "sehat",
    "pagi", "siang", "sore", "malam", "hari", "bulan", "tahun",
    "pos", "posko", "kantor", "dinas", "kementerian", "badan",
    "pusat", "daerah", "wilayah", "provinsi", "kabupaten", "kota",
    "kecamatan", "kelurahan", "desa", "dusun", "kampung", "rt", "rw",
    "jalan", "gang", "blok", "nomor", "no", "lantai", "gedung",
}
LANGUAGE_MARKERS: dict[str, list[str]] = {}
EXTRACTION_RULES: dict[str, list[str]] = {}
LANGUAGE_MODEL_MAP: dict[str, str] = {}
WHO_DISEASE_CONCEPTS: list[dict[str, Any]] = []

ASEAN_COUNTRIES = frozenset({
    "Brunei", "Cambodia", "Indonesia", "Laos", "Malaysia", "Myanmar",
    "Philippines", "Singapore", "Thailand", "Timor-Leste", "Vietnam",
})
OUTSIDE_ASEAN_COUNTRY = "OUTSIDE ASEAN"


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


def load_who_disease_concepts_from_db():
    global WHO_DISEASE_CONCEPTS
    try:
        import psycopg
        from psycopg.rows import dict_row
        conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
        rows = conn.execute(
            """SELECT c.canonical_name, c.english_name, c.ontology_code, c.ontology_uri,
                      COALESCE(
                        json_agg(
                          json_build_object('alias', a.alias, 'language', a.language)
                          ORDER BY a.confidence DESC, a.alias
                        ) FILTER (WHERE a.id IS NOT NULL),
                        '[]'::json
                      ) AS aliases
               FROM disease_concepts c
               LEFT JOIN disease_aliases a
                 ON a.concept_id = c.id AND a.is_active = TRUE
               WHERE c.is_active = TRUE AND c.ontology_system = 'WHO ICD-11 MMS'
               GROUP BY c.id, c.canonical_name, c.english_name, c.ontology_code, c.ontology_uri
               ORDER BY c.canonical_name"""
        ).fetchall()
        conn.close()
        WHO_DISEASE_CONCEPTS = list(rows)
        import logging
        logging.getLogger(__name__).info("Loaded %d WHO ICD-11 disease concepts", len(rows))
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Failed to load WHO concepts: %s", e)


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


def build_location_patterns():
    global LOCATION_PATTERNS
    alternatives = sorted(
        (
            "".join(
                char for char in unicodedata.normalize("NFKD", name.lower())
                if not unicodedata.combining(char)
            )
            for name in LOCATION_COORDS
        ),
        key=len,
        reverse=True,
    )
    if alternatives:
        combined = re.compile(
            r"\b(?:" + "|".join(re.escape(a) for a in alternatives) + r")\b",
            re.IGNORECASE,
        )
        LOCATION_PATTERNS = [(combined.pattern, combined)]
    else:
        LOCATION_PATTERNS = []


def load_locations_from_db():
    global LOCATION_COORDS, LOCATION_COUNTRIES, LOCATION_PATTERNS
    try:
        import psycopg
        from psycopg.rows import dict_row
        conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
        rows = conn.execute(
            "SELECT name, latitude, longitude, country FROM locations WHERE is_active = TRUE"
        ).fetchall()
        conn.close()
        usable_rows = [
            r for r in rows
            if r["name"].strip().casefold() not in LOCATION_STOPWORDS
        ]
        LOCATION_COORDS = {r["name"]: (r["latitude"], r["longitude"]) for r in usable_rows}
        LOCATION_COUNTRIES = {r["name"]: r["country"] for r in usable_rows if r.get("country")}
        alternatives = sorted(
            (
                "".join(
                    char for char in unicodedata.normalize("NFKD", name.lower())
                    if not unicodedata.combining(char)
                )
                for name in LOCATION_COORDS
            ),
            key=len,
            reverse=True,
        )
        if alternatives:
            combined = re.compile(
                rf"(?<![A-Za-z])(?:{'|'.join(re.escape(name) for name in alternatives)})(?![A-Za-z])",
                re.IGNORECASE,
            )
            LOCATION_PATTERNS = [(combined.pattern, combined)]
        else:
            LOCATION_PATTERNS = []
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


def upsert_discovered_disease_concept(
    canonical_name: str,
    english_name: str,
    ontology_code: str,
    ontology_uri: str,
    ontology_release: str = WHO_ICD_RELEASE,
    aliases: list[dict[str, Any]] | None = None,
) -> bool:
    """Atomic upsert of a validated WHO ICD-11 disease concept, aliases, keywords, and labels."""
    if not canonical_name or not ontology_code:
        return False
    try:
        import psycopg
        from psycopg.rows import dict_row

        def _norm(s: str) -> str:
            return re.sub(r"\s+", " ", re.sub(r"[^\w\s-]", " ", (s or "").lower())).strip()

        with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
            with conn.transaction():
                # 1. Upsert into disease_concepts
                row = conn.execute(
                    """
                    INSERT INTO disease_concepts
                      (canonical_name, english_name, ontology_system, ontology_code,
                       ontology_uri, ontology_release, source, confidence, is_active, updated_at)
                    VALUES (%s, %s, 'WHO ICD-11 MMS', %s, %s, %s, 'who_icd11_discovery', 1.0, TRUE, NOW())
                    ON CONFLICT (canonical_name) DO UPDATE SET
                      english_name = EXCLUDED.english_name,
                      ontology_system = 'WHO ICD-11 MMS',
                      ontology_code = EXCLUDED.ontology_code,
                      ontology_uri = EXCLUDED.ontology_uri,
                      ontology_release = EXCLUDED.ontology_release,
                      is_active = TRUE,
                      updated_at = NOW()
                    RETURNING id
                    """,
                    (canonical_name, english_name or canonical_name, ontology_code, ontology_uri, ontology_release),
                ).fetchone()
                concept_id = row["id"]

                # 2. Add aliases
                all_aliases = list(aliases or [])
                all_aliases.append({"surface_form": canonical_name, "language": "en", "confidence": 1.0})
                if english_name and english_name != canonical_name:
                    all_aliases.append({"surface_form": english_name, "language": "en", "confidence": 1.0})

                for item in all_aliases:
                    surface = str(item.get("surface_form") or "").strip()
                    if not surface:
                        continue
                    lang = str(item.get("language") or "unknown")
                    conf = float(item.get("confidence") or 1.0)
                    norm_alias = _norm(surface)
                    conn.execute(
                        """
                        INSERT INTO disease_aliases
                          (concept_id, alias, normalized_alias, language, source, confidence, is_active, updated_at)
                        VALUES (%s, %s, %s, %s, 'who_icd11_discovery', %s, TRUE, NOW())
                        ON CONFLICT (concept_id, normalized_alias, language) DO UPDATE SET
                          confidence = GREATEST(disease_aliases.confidence, EXCLUDED.confidence),
                          is_active = TRUE,
                          updated_at = NOW()
                        """,
                        (concept_id, surface, norm_alias, lang, conf),
                    )
                    # 3. Add to nlp_keywords
                    conn.execute(
                        """
                        INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active, updated_at)
                        VALUES ('disease', %s, %s, 350, TRUE, NOW())
                        ON CONFLICT (category, keyword) DO UPDATE SET
                          target_label = EXCLUDED.target_label,
                          is_active = TRUE,
                          priority = LEAST(nlp_keywords.priority, EXCLUDED.priority),
                          updated_at = NOW()
                        """,
                        (norm_alias, canonical_name),
                    )

                # 4. Add to nlp_labels
                conn.execute(
                    """
                    INSERT INTO nlp_labels (category, label, priority, is_active, updated_at)
                    VALUES ('disease', %s, 50, TRUE, NOW())
                    ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE, updated_at = NOW()
                    """,
                    (canonical_name,),
                )

                # 5. Add default outbreak rule if missing
                conn.execute(
                    """
                    INSERT INTO disease_outbreak_rules (disease_name, display_label, min_case_count, priority, is_active, updated_at)
                    VALUES (%s, %s, %s, 50, TRUE, NOW())
                    ON CONFLICT (disease_name) DO NOTHING
                    """,
                    (canonical_name.upper(), canonical_name, EXPLICIT_KNOWN_DISEASE_MIN_CASES),
                )

        # 6. Hot reload in-memory cache
        load_keywords_from_db()
        load_who_disease_concepts_from_db()
        load_outbreak_rules_from_db()
        try:
            from .models.classifier import refresh_labels_from_db
            refresh_labels_from_db()
        except Exception:
            pass
        return True
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Failed to upsert discovered WHO disease concept '%s': %s", canonical_name, e)
        return False


def upsert_disease_discovery_candidate(
    surface_form: str,
    sample_text: str = "",
    language: str = "unknown",
    provider: str = "",
    confidence: float = 0.0,
) -> bool:
    """Quarantine terminology that an agent found but WHO did not validate."""
    if not surface_form or not surface_form.strip():
        return False
    normalized = re.sub(r"\s+", " ", re.sub(r"[^\w\s-]", " ", surface_form.lower())).strip()
    if not normalized:
        return False
    try:
        import psycopg
        with psycopg.connect(DATABASE_URL) as conn:
            conn.execute(
                """INSERT INTO disease_discovery_candidates
                   (surface_form, normalized_form, language, sample_text, provider, confidence)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   ON CONFLICT (normalized_form) DO UPDATE SET
                     occurrences = disease_discovery_candidates.occurrences + 1,
                     sample_text = COALESCE(EXCLUDED.sample_text, disease_discovery_candidates.sample_text),
                     provider = COALESCE(NULLIF(EXCLUDED.provider, ''), disease_discovery_candidates.provider),
                     confidence = GREATEST(COALESCE(disease_discovery_candidates.confidence, 0), EXCLUDED.confidence),
                     updated_at = NOW()""",
                (surface_form.strip(), normalized, language or "unknown", sample_text[:5000], provider, confidence),
            )
        return True
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(
            "Failed to store unresolved disease candidate '%s': %s", surface_form, e,
        )
        return False
