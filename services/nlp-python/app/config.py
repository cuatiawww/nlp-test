import os
import re
import logging
import unicodedata
from typing import Any, Optional


def _repair_legacy_lexicon_text(value: str) -> str:
    """Repair legacy mojibake in seeded lexicon words at read time."""
    text = str(value or "")
    markers = (
        "\u00c3", "\u00c2", "\u00e2\x80", "\u00e0\u00b8", "\u00e0\u00b9",
        "\u00e0\u00ba", "\u00e0\u00bb", "\u00e1\u20ac", "\u00e1\u009e", "\ufffd",
    )

    def score(candidate: str) -> int:
        return sum(candidate.count(marker) for marker in markers)

    if score(text) == 0:
        return text
    candidates = [text]
    for encoding in ("latin-1", "cp1252"):
        try:
            candidates.append(text.encode(encoding).decode("utf-8"))
        except (UnicodeEncodeError, UnicodeDecodeError):
            continue
    return min(candidates, key=score)

NLP_MODEL = os.getenv("NLP_MODEL", "xlm-roberta")
# Bump this when analyze-url extraction rules change so cached disease_events
# rows are not silently returned after a pipeline fix.
NLP_PIPELINE_VERSION = os.getenv("NLP_PIPELINE_VERSION", "2026.09.19.multilingual-source-first")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.6-luna")

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "").strip()
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1").rstrip("/")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
DEEPSEEK_MAX_TOKENS = int(os.getenv("DEEPSEEK_MAX_TOKENS", os.getenv("OPENAI_MAX_TOKENS", "400")))
DEEPSEEK_TIMEOUT_SECONDS = int(os.getenv("DEEPSEEK_TIMEOUT_SECONDS", "20"))
DEEPSEEK_MIN_CONFIDENCE = float(os.getenv("DEEPSEEK_MIN_CONFIDENCE", "0.85"))
DEEPSEEK_TRIGGER_CONFIDENCE = float(os.getenv("DEEPSEEK_TRIGGER_CONFIDENCE", "0.75"))
DEEPSEEK_LOCATION_MIN_CONFIDENCE = float(os.getenv("DEEPSEEK_LOCATION_MIN_CONFIDENCE", "0.80"))
DEEPSEEK_PROMPT_CHARS = max(200, int(os.getenv("DEEPSEEK_PROMPT_CHARS", "1800")))
DEEPSEEK_DAILY_BUDGET = int(os.getenv("DEEPSEEK_DAILY_BUDGET", "200"))
DEEPSEEK_LOCATION_MAX_CANDIDATES = int(os.getenv("DEEPSEEK_LOCATION_MAX_CANDIDATES", "80"))
# External LLM review is opt-in. It must never be an implicit dependency of
# high-volume crawling or a synchronous source extraction request.
AGENT_ENABLED = os.getenv("AGENT_ENABLED", "false").lower() in {"1", "true", "yes", "on"}
AGENT_PROVIDER_ORDER = os.getenv("AGENT_PROVIDER_ORDER", "deepseek,openai")
AGENT_TIMEOUT_SECONDS = int(os.getenv("AGENT_TIMEOUT_SECONDS", str(DEEPSEEK_TIMEOUT_SECONDS)))


def env_seconds_at_least(name, default):
    """Read an optional timeout override, but never go below the code default.

    Production `.env` still has the old 45/90/180 knobs. Those values caused
    NLP HTTP 408. Floors live in code so deploy does not require compose/.env
    edits; env may only raise the budget.
    """
    try:
        value = int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        value = int(default)
    return max(int(default), value)


TRANSLATION_STAGE_TIMEOUT_SECONDS = env_seconds_at_least("TRANSLATION_STAGE_TIMEOUT_SECONDS", 60)
TRANSLATION_PROVIDER = os.getenv("TRANSLATION_PROVIDER", "nllb").strip().lower() or "nllb"
# Translation is an enrichment view, not a prerequisite for surveillance
# extraction. In deferred mode the source-language pipeline returns first;
# an already cached translation may still be used immediately.
TRANSLATION_ASYNC_ENABLED = os.getenv("TRANSLATION_ASYNC_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
MODEL_FAILURE_COOLDOWN_SECONDS = max(30, int(os.getenv("MODEL_FAILURE_COOLDOWN_SECONDS", "300")))
# Source-language extraction is authoritative.  These languages do not need
# a translation just to produce a first surveillance result; translation can
# still be enabled explicitly by removing a language from this setting.
TRANSLATION_NATIVE_FIRST_LANGS = frozenset(
    item.strip().lower()
    for item in os.getenv("TRANSLATION_NATIVE_FIRST_LANGS", "id").split(",")
    if item.strip()
)
TRANSLATION_MAX_CHARS = max(500, int(os.getenv("TRANSLATION_MAX_CHARS", "4000")))
TRANSLATION_CHUNK_CHARS = max(200, int(os.getenv("TRANSLATION_CHUNK_CHARS", "450")))
TRANSLATION_MAX_CHUNKS = max(1, int(os.getenv("TRANSLATION_MAX_CHUNKS", "8")))
# Interactive URL analysis only needs a semantic aid.  It must not translate
# an entire article before source-language extraction can return.  Batch jobs
# may use the larger TRANSLATION_* budget above.
TRANSLATION_INTERACTIVE_MAX_CHARS = max(
    500, int(os.getenv("TRANSLATION_INTERACTIVE_MAX_CHARS", "1200"))
)
TRANSLATION_INTERACTIVE_CHUNK_CHARS = max(
    200, int(os.getenv("TRANSLATION_INTERACTIVE_CHUNK_CHARS", "600"))
)
TRANSLATION_INTERACTIVE_MAX_CHUNKS = max(
    1, int(os.getenv("TRANSLATION_INTERACTIVE_MAX_CHUNKS", "1"))
)
TRANSLATION_INTERACTIVE_TIMEOUT_SECONDS = max(
    5, int(os.getenv("TRANSLATION_INTERACTIVE_TIMEOUT_SECONDS", "20"))
)
# Interactive URL analysis: hard cap on source text fed to extractors /
# surveillance. Typical ASEAN news lede+body fits; long crawls must not
# multiply full-document scans into multi-minute CPU.
INTERACTIVE_ANALYSIS_MAX_CHARS = max(
    1500, int(os.getenv("INTERACTIVE_ANALYSIS_MAX_CHARS", "6000"))
)
INTERACTIVE_LOCATION_SCAN_MAX_CHARS = max(
    800, int(os.getenv("INTERACTIVE_LOCATION_SCAN_MAX_CHARS", "4000"))
)
INTERACTIVE_SKIP_STRICT_SURVEILLANCE = os.getenv(
    "INTERACTIVE_SKIP_STRICT_SURVEILLANCE", "true"
).lower() in {"1", "true", "yes", "on"}

INFERENCE_STAGE_TIMEOUT_SECONDS = env_seconds_at_least("INFERENCE_STAGE_TIMEOUT_SECONDS", 180)
NLP_REQUEST_TIMEOUT_SECONDS = env_seconds_at_least("NLP_REQUEST_TIMEOUT_SECONDS", 270)
NLP_STAGE_OVERHEAD_SECONDS = env_seconds_at_least("NLP_STAGE_OVERHEAD_SECONDS", 15)
NLP_STAGE_ISOLATION = os.getenv("NLP_STAGE_ISOLATION", "inprocess").strip().lower() or "inprocess"
# Keep optional LLM fallbacks bounded.  These defaults reduce burst traffic
# without disabling the deterministic NLP pipeline or the explicit URL flow.
AGENT_MAX_CONCURRENT_REQUESTS = max(1, int(os.getenv("AGENT_MAX_CONCURRENT_REQUESTS", "1")))
AGENT_MIN_INTERVAL_SECONDS = max(0.0, float(os.getenv("AGENT_MIN_INTERVAL_SECONDS", "0.20")))
AGENT_RESPONSE_CACHE_TTL_SECONDS = max(0, int(os.getenv("AGENT_RESPONSE_CACHE_TTL_SECONDS", "600")))
AGENT_RESPONSE_CACHE_SIZE = max(16, int(os.getenv("AGENT_RESPONSE_CACHE_SIZE", "256")))

# Disease resolution is local-master only. The legacy ICD settings are no
# longer read by the runtime and are intentionally not loaded here.
DISEASE_MASTER_RESOLUTION_ENABLED = os.getenv("DISEASE_MASTER_RESOLUTION_ENABLED", "true").lower() in {"1", "true", "yes", "on"}

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

# Only used when the DB is unavailable. The active runtime normally loads the
# binary classifier labels from nlp_labels, just like the other categories.
BINARY_HEALTH_LABELS = [
    "health related disease medical",
    "general news other topic",
]

SOURCE_CREDIBILITY_MAP = {
    "government": 0.95,
    "who": 0.95,
    "cdc": 0.97,
    "hospital": 0.90,
    "research": 0.88,
    "news": 0.84,
    "rss": 0.78,
    "web": 0.65,
    "social_media": 0.35,
    "csv": 0.60,
    "api": 0.70,
}

# Domain-level values are applied before the generic source_type score. This
# keeps DW/BBC/Detik/Antara articles from inheriting a low generic web score.
SOURCE_DOMAIN_RELIABILITY = {
    "who.int": 0.98,
    "cdc.gov": 0.97,
    "kemenkes.go.id": 0.98,
    "kemkes.go.id": 0.98,
    "antaranews.com": 0.90,
    "detik.com": 0.90,
    "dw.com": 0.92,
    "bbc.com": 0.94,
    "bbc.co.uk": 0.94,
    "reuters.com": 0.94,
    "apnews.com": 0.92,
    "kompas.com": 0.88,
    "cnnindonesia.com": 0.88,
    "channelnewsasia.com": 0.88,
}

LOW_CONFIDENCE_THRESHOLD = float(os.getenv("LOW_CONFIDENCE_THRESHOLD", "0.5"))
EXPLICIT_KNOWN_DISEASE_MIN_CASES = int(os.getenv("EXPLICIT_KNOWN_DISEASE_MIN_CASES", "25"))

DATABASE_URL = os.getenv("DATABASE_URL", "postgres://postgres:root@host.docker.internal:9898/disease_ai")
SYMPTOM_DICT: dict[str, str] = {}
DISEASE_DICT: dict[str, str] = {}
KEYWORDS_LOAD_ATTEMPTED = False
OUTBREAK_RULES: dict[str, int] = {}
LOCATION_COORDS: dict[str, tuple[float, float]] = {
    "Tuy Đức": (12.18, 107.50),
    "Tuy Duc": (12.18, 107.50),
    "Sangatta": (0.49, 117.55),
}
LOCATION_COUNTRIES: dict[str, str] = {
    "Tuy Đức": "Vietnam",
    "Tuy Duc": "Vietnam",
    "Sangatta": "Indonesia",
}
LOCATION_ADMIN1: dict[str, str] = {}
LOCATION_ADMIN2: dict[str, str] = {}
LOCATION_ISO3: dict[str, str] = {}
LOCATION_ADMIN_LEVEL: dict[str, int] = {}
COUNTRY_TO_ISO3: dict[str, str] = {
    "indonesia": "IDN",
    "philippines": "PHL",
    "vietnam": "VNM",
    "thailand": "THA",
    "malaysia": "MYS",
    "myanmar": "MMR",
    "cambodia": "KHM",
    "laos": "LAO",
    "singapore": "SGP",
    "brunei": "BRN",
    "timor-leste": "TLS",
}
# Location aliases are authoritative in location_aliases.
# Empty before DB bootstrap: no code-owned fallback vocabulary.
LOCATION_ALIASES: dict[str, str] = {}
LOCATION_LOAD_ATTEMPTED = False
LOCATION_REGISTRY_REFERENCE_ID: int | None = None
LOCATION_PATTERNS: list[tuple[str, re.Pattern[str]]] = []
LOCATION_STOPWORDS = {
    # Indonesian time/grammatical words that collide with foreign/rare gazetteer entries
    "selama", "hingga", "sejak", "menjelang", "antara", "sejumlah", "tercatat", "banyaknya", "sepanjang",
    # Vietnamese common discourse markers that collide with gazetteer entries
    "lien quan", "liên quan", "lien quan den", "liên quan đến", "thang", "thắng", "chien thang", "chiến thắng",
    "trong do", "trong đó", "tu dau nam", "từ đầu năm", "tong so", "tổng số",
    "ada", "and", "as", "at", "bao", "baru", "bukan", "by", "dan", "dari",
    "dalam", "for", "from", "here", "hoi", "in", "into", "it", "main",
    "nam", "new", "no", "not", "of", "on", "or", "pada", "same", "satu",
    "that", "the", "this", "to", "trong", "tai", "with", "yang", "yes",
    "buka", "tutup", "poli", "jaga", "kenali", "luar", "sumber",
    "senin", "selasa", "rabu", "kamis", "jumat", "sabtu", "minggu",
    "kasus", "pasien", "rumah", "sakit", "anak", "umum", "sehat",
    "pagi", "siang", "sore", "malam", "hari", "bulan", "tahun",
    # Indonesian/English/Malay month names — "Juli" is a real village but
    # virtually always means the month in news articles.
    # Compass directions and temporal collision words (e.g. "Kivu Utara" -> "Utara", "dua pekan")
    "utara", "selatan", "timur", "barat", "tengah", "pusat", "tenggara", "barat daya", "barat laut", "timur laut",
    "north", "south", "east", "west", "central", "pekan", "pekan lalu", "pekan depan", "minggu lalu",
    "januari", "februari", "maret", "april", "mei", "juni",
    "juli", "agustus", "september", "oktober", "november", "desember",
    "january", "february", "march", "may", "june",
    "july", "august", "october", "december",
    "pos", "posko", "kantor", "dinas", "kementerian", "badan",
    "pusat", "daerah", "wilayah", "provinsi", "kabupaten", "kota",
    "kecamatan", "kelurahan", "desa", "dusun", "kampung", "rt", "rw",
    "jalan", "gang", "blok", "nomor", "no", "lantai", "gedung",
    # Common statistical/prose tokens that may also appear as gazetteer rows.
    # They are never accepted as article locations without an explicit curated
    # disambiguation rule.
    "puncak", "sudah", "rekor", "tertinggi", "terendah", "rata-rata",
    # Continents/regions are not article event places. "Asia News Network"
    # must not beat a country such as Malaysia.
    "asia", "africa", "europe", "oceania", "antarctica",
    # English auxiliaries/function words that collide with short gazetteer rows
    # (live bug: province="Were" from "Were monitoring…").
    "were", "was", "been", "be", "being", "am", "is", "are",
    "have", "has", "had", "having", "do", "did", "does", "done",
    "would", "could", "should", "might", "must", "shall", "will",
    "may", "can", "need", "dare", "ought",
    # Media / calendar / statistic filler that collides with gazetteer rows
    # (live: province=Harian/Persen/Tak/Pesisir from RSS prose).
    "harian", "persen", "percent", "tak", "pesisir", "pantai",
    "antara", "detik", "tempo", "tribun", "kompas", "wib",
    "opsi", "ambang", "batas", "parlemen", "pemilu", "ruu",
    "merebak", "khawatir", "perlukah",
    "long",
}
DEFAULT_LANGUAGE_MARKERS: dict[str, list[str]] = {
    "ms": [
        "kes", "kesihatan", "pesakit", "wabak", "jangkitan", "kkm",
        "kementerian kesihatan", "kerajaan madani", "kanak-kanak",
        "ogos", "disember", "julai", "mac", "maut", "bilangan", "negeri", "demam denggi",
    ],
    "id": [
        "kasus", "kesehatan", "pasien", "wabah", "infeksi", "kemenkes",
        "kementerian kesehatan", "agustus", "desember", "juli", "maret",
        "meninggal dunia", "jumlah", "provinsi", "demam berdarah",
    ],
    "tl": ["kaso", "pasyente", "kamatayan", "kalusugan", "kagawaran ng kalusugan"],
    "vi": ["ca mắc", "ca nhiễm", "bệnh nhân", "tử vong", "bộ y tế"],
    "th": ["ผู้ป่วย", "ติดเชื้อ", "ผู้เสียชีวิต", "กระทรวงสาธารณสุข"],
    "lo": ["ກໍລະນີ", "ຄົນເຈັບ", "ເສຍຊີວິດ", "ກະຊວງສາທາລະນະສຸກ"],
    "km": ["ករណី", "អ្នកឆ្លង", "ស្លាប់", "ក្រសួងសុខាភិបាល"],
    "my": ["လူနာ", "ကူးစက်သူ", "သေဆုံး", "ကျန်းမာရေးဝန်ကြီးဌာန"],
    "en": ["cases", "infections", "patients", "deaths", "health department", "ministry of health"],
}
# Minimal offline lexical registry for native-script articles. The database
# remains authoritative when available; these terms keep source-first
# extraction functional during startup, tests, and temporary DB outages.
DEFAULT_LEXICON_TERMS: dict[str, dict[str, list[str]]] = {
    "metric_case": {
        "lo": ["ກໍລະນີ", "ກໍລະນີສະສົມ"],
        "th": ["ราย", "กรณี"],
        "km": ["ករណី"],
        "my": ["လူနာ", "ကူးစက်သူ"],
        "vi": ["ca mắc", "ca nhiễm"],
        "tl": ["kaso"],
    },
    "metric_death": {
        "lo": ["ເສຍຊີວິດ"],
        "th": ["เสียชีวิต"],
        "km": ["ស្លាប់"],
        "my": ["သေဆုံး"],
        "vi": ["tử vong"],
        "tl": ["kamatayan"],
    },
    "count_unit": {
        "lo": ["ກໍລະນີ", "ຄົນ"],
        "th": ["ราย", "คน"],
        "km": ["នាក់", "ករណី"],
        "my": ["ဦး", "ယောက်"],
        "vi": ["ca", "người"],
        "tl": ["kaso", "katao"],
    },
}
LANGUAGE_MARKERS: dict[str, list[str]] = {k: list(v) for k, v in DEFAULT_LANGUAGE_MARKERS.items()}
EXTRACTION_RULES: dict[str, list[str]] = {}
LANGUAGE_MODEL_MAP: dict[str, str] = {}
DISEASE_MASTER_CONCEPTS: list[dict[str, Any]] = []
# Shared DB-backed lexical registry.  The legacy language_markers name is
# retained for API compatibility, but its marker_type now separates language
# detection from metric and temporal vocabulary.
LEXICON_TERMS: dict[str, dict[str, list[str]]] = {}
LEXICON_VALUES: dict[str, dict[str, int]] = {}
TEMPORAL_MONTH_MAP: dict[str, int] = {}
LEXICON_READY = False
LEXICON_LOAD_ATTEMPTED = False

ASEAN_COUNTRIES = frozenset({
    "Brunei", "Cambodia", "Indonesia", "Laos", "Malaysia", "Myanmar",
    "Philippines", "Singapore", "Thailand", "Timor-Leste", "Vietnam",
})
OUTSIDE_ASEAN_COUNTRY = "OUTSIDE ASEAN"


def load_keywords_from_db():
    global SYMPTOM_DICT, DISEASE_DICT, KEYWORDS_LOAD_ATTEMPTED
    KEYWORDS_LOAD_ATTEMPTED = True
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
            if r["category"] not in {"symptom", "disease"}:
                logging.getLogger(__name__).warning(
                    "Ignoring unsupported keyword category from DB: %s", r["category"]
                )
                continue
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
        SYMPTOM_DICT = {}
        DISEASE_DICT = {}
        import logging
        logging.getLogger(__name__).warning(
            "Failed to load keywords from DB, using empty dicts: %s", e
        )


def load_disease_master_from_db():
    global DISEASE_MASTER_CONCEPTS
    try:
        import psycopg
        from psycopg.rows import dict_row
        conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
        rows = conn.execute(
            """SELECT c.disease_id, c.canonical_name, c.english_name, c.ontology_system,
                      c.source,
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
               WHERE c.is_active = TRUE
               GROUP BY c.id, c.disease_id, c.canonical_name, c.english_name, c.ontology_system, c.source
               ORDER BY c.canonical_name"""
        ).fetchall()
        conn.close()
        DISEASE_MASTER_CONCEPTS = list(rows)
        # The database concept/alias catalog is authoritative when it knows a
        # surface form. Keep the legacy map as a fallback for concepts that
        # have not been migrated yet, but let DB aliases win on collisions.
        try:
            from . import extractors
            for concept in DISEASE_MASTER_CONCEPTS:
                canonical = str(concept.get("canonical_name") or "").strip()
                if not canonical:
                    continue
                for alias_item in concept.get("aliases") or []:
                    alias = alias_item.get("alias") if isinstance(alias_item, dict) else alias_item
                    alias = str(alias or "").strip().casefold()
                    if alias:
                        extractors.DISEASE_ALIASES[alias] = canonical
        except Exception:
            # Import order during isolated unit tests must not prevent the DB
            # catalog itself from loading.
            pass
        import logging
        logging.getLogger(__name__).info("Loaded %d local disease-master concepts", len(rows))
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Failed to load local disease-master concepts: %s", e)


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
    global LOCATION_LOAD_ATTEMPTED, LOCATION_REGISTRY_REFERENCE_ID
    LOCATION_LOAD_ATTEMPTED = True
    global LOCATION_COORDS, LOCATION_COUNTRIES, LOCATION_PATTERNS
    global LOCATION_ADMIN1, LOCATION_ADMIN2, LOCATION_ISO3, LOCATION_ADMIN_LEVEL, LOCATION_ALIASES
    LOCATION_ALIASES = {}
    try:
        from . import extractors
        extractors.COUNTRY_ALIASES = dict(
            getattr(extractors, "DEFAULT_COUNTRY_ALIASES", {})
        )
    except Exception:
        extractors = None
    try:
        import psycopg
        from psycopg.rows import dict_row
        conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
        rows = conn.execute(
            """SELECT name, latitude, longitude, country, country_iso3,
                      admin1_name, admin2_name, admin_level
               FROM locations
               WHERE is_active = TRUE"""
        ).fetchall()

        alias_rows = []
        try:
            alias_rows = conn.execute(
                """SELECT a.alias_name, l.name as canonical_name, l.country, l.admin_level
                   FROM location_aliases a
                   JOIN locations l ON a.location_id = l.id
                   WHERE l.is_active = TRUE"""
            ).fetchall()
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("Could not load location_aliases: %s", e)

        conn.close()
        usable_rows = [
            r for r in rows
            if r["name"].strip().casefold() not in LOCATION_STOPWORDS
        ]
        LOCATION_COORDS.update({r["name"]: (r["latitude"], r["longitude"]) for r in usable_rows})
        LOCATION_COUNTRIES.update({r["name"]: r["country"] for r in usable_rows if r.get("country")})
        for r in usable_rows:
            name = r["name"]
            if r.get("admin1_name"):
                LOCATION_ADMIN1[name] = r["admin1_name"]
            if r.get("admin2_name"):
                LOCATION_ADMIN2[name] = r["admin2_name"]
            if r.get("country_iso3"):
                LOCATION_ISO3[name] = r["country_iso3"]
            if r.get("admin_level") is not None:
                LOCATION_ADMIN_LEVEL[name] = r["admin_level"]

        db_country_aliases: dict[str, str] = {}
        for ar in alias_rows:
            alias = ar["alias_name"].strip().casefold()
            canon = ar["canonical_name"]
            if alias and canon:
                LOCATION_ALIASES[alias] = canon
                if (
                    str(ar.get("country") or "").casefold() == str(canon).casefold()
                    or ar.get("admin_level") == 0
                ):
                    db_country_aliases[alias] = canon

        try:
            from . import extractors
            # Country aliases live in the same location master and therefore
            # follow the same DB-over-fallback precedence as place aliases.
            # Seed EXTERNAL_COUNTRY_ALIASES first so DB rows can still override.
            extractors.COUNTRY_ALIASES.update(
                getattr(extractors, "EXTERNAL_COUNTRY_ALIASES", {})
            )
            extractors.COUNTRY_ALIASES.update(db_country_aliases)
        except Exception:
            pass

        # Curated additions for verified surveillance localities
        if "Tuy Đức" not in LOCATION_COORDS and "Tuy Duc" not in LOCATION_COORDS:
            LOCATION_COORDS["Tuy Đức"] = (12.18, 107.50)
            LOCATION_COORDS["Tuy Duc"] = (12.18, 107.50)
            LOCATION_COUNTRIES["Tuy Đức"] = "Vietnam"
            LOCATION_COUNTRIES["Tuy Duc"] = "Vietnam"
            LOCATION_ISO3["Tuy Đức"] = "VNM"
            LOCATION_ISO3["Tuy Duc"] = "VNM"
        if "Sangatta" not in LOCATION_COORDS:
            LOCATION_COORDS["Sangatta"] = (0.49, 117.55)
            LOCATION_COUNTRIES["Sangatta"] = "Indonesia"
            LOCATION_ISO3["Sangatta"] = "IDN"
        # Prioritize major territories/states over minor duplicate names
        LOCATION_COORDS["Penang"] = (5.4141, 100.3288)
        LOCATION_COUNTRIES["Penang"] = "Malaysia"
        LOCATION_ISO3["Penang"] = "MYS"
        LOCATION_COORDS["Pulau Pinang"] = (5.4141, 100.3288)
        LOCATION_COUNTRIES["Pulau Pinang"] = "Malaysia"
        LOCATION_ISO3["Pulau Pinang"] = "MYS"
        LOCATION_COORDS["Gunungkidul"] = (-7.97, 110.60)
        LOCATION_COUNTRIES["Gunungkidul"] = "Indonesia"
        LOCATION_ISO3["Gunungkidul"] = "IDN"
        LOCATION_COORDS["Gunung Kidul"] = (-7.97, 110.60)
        LOCATION_COUNTRIES["Gunung Kidul"] = "Indonesia"
        LOCATION_ISO3["Gunung Kidul"] = "IDN"
        if "Sumatra Utara" not in LOCATION_COORDS:
            LOCATION_COORDS["Sumatra Utara"] = (3.5853, 98.6746)
            LOCATION_COUNTRIES["Sumatra Utara"] = "Indonesia"
            LOCATION_ADMIN1["Sumatra Utara"] = "Sumatera Utara"
            LOCATION_ISO3["Sumatra Utara"] = "IDN"
        if "Sumatra Barat" not in LOCATION_COORDS:
            LOCATION_COORDS["Sumatra Barat"] = (-0.9492, 100.3543)
            LOCATION_COUNTRIES["Sumatra Barat"] = "Indonesia"
            LOCATION_ADMIN1["Sumatra Barat"] = "Sumatera Barat"
            LOCATION_ISO3["Sumatra Barat"] = "IDN"
        if "Sumatra Selatan" not in LOCATION_COORDS:
            LOCATION_COORDS["Sumatra Selatan"] = (-2.9909, 104.7565)
            LOCATION_COUNTRIES["Sumatra Selatan"] = "Indonesia"
            LOCATION_ADMIN1["Sumatra Selatan"] = "Sumatera Selatan"
            LOCATION_ISO3["Sumatra Selatan"] = "IDN"

        all_names_to_match = set(LOCATION_COORDS.keys()) | {
            alias for alias, canon in LOCATION_ALIASES.items() if canon in LOCATION_COORDS
        }
        alternatives = sorted(
            (
                "".join(
                    char for char in unicodedata.normalize("NFKD", name.lower())
                    if not unicodedata.combining(char)
                )
                for name in all_names_to_match
                if name.casefold() not in LOCATION_STOPWORDS
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
            "Loaded %d locations, %d aliases from DB", len(LOCATION_COORDS), len(LOCATION_ALIASES),
        )
        LOCATION_REGISTRY_REFERENCE_ID = id(LOCATION_COORDS)
        try:
            from .extractors import invalidate_location_alias_cache
            invalidate_location_alias_cache()
        except Exception:
            pass
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(
            "Location registry unavailable; location alias matching is disabled: %s", e
        )


def ensure_location_registry_loaded() -> None:
    """Lazily load DB-owned locations for direct library/test callers."""

    # A caller may temporarily replace the registries (for example an
    # isolated unit test). If that replacement is restored after the first
    # lazy load, the attempted flag alone would leave the next caller with an
    # empty registry forever.
    if (
        not LOCATION_LOAD_ATTEMPTED
        or (not LOCATION_COORDS and not LOCATION_COUNTRIES)
        or (
            LOCATION_REGISTRY_REFERENCE_ID is not None
            and id(LOCATION_COORDS) != LOCATION_REGISTRY_REFERENCE_ID
        )
    ):
        load_locations_from_db()


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
    global LANGUAGE_MARKERS, LEXICON_TERMS, LEXICON_VALUES, TEMPORAL_MONTH_MAP, LEXICON_READY, LEXICON_LOAD_ATTEMPTED
    LEXICON_LOAD_ATTEMPTED = True
    try:
        import psycopg
        from psycopg.rows import dict_row
        conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
        try:
            rows = conn.execute(
                """SELECT word, language, marker_type, canonical_value
                   FROM language_markers
                   WHERE is_active = TRUE
                   ORDER BY marker_type, language, priority, word"""
            ).fetchall()
        except Exception:
            # Keep older development databases usable until migration 095 is
            # applied. They expose the original two-column marker contract.
            conn.rollback()
            rows = conn.execute(
                "SELECT word, language FROM language_markers WHERE is_active = TRUE ORDER BY language, word"
            ).fetchall()
        conn.close()
        markers: dict[str, list[str]] = {}
        lexicon: dict[str, dict[str, list[str]]] = {}
        lexicon_values: dict[str, dict[str, int]] = {}
        month_map: dict[str, int] = {}
        for r in rows:
            word = str(r["word"] or "").strip()
            lang = str(r["language"] or "unknown").strip().casefold()
            marker_type = str(r.get("marker_type") or "language_marker").strip().casefold()
            if not word:
                continue
            lexicon.setdefault(marker_type, {}).setdefault(lang, []).append(word)
            if marker_type == "language_marker":
                markers.setdefault(lang, []).append(word)
            if marker_type == "temporal_month":
                try:
                    month_map[word.casefold()] = int(r.get("canonical_value"))
                except (TypeError, ValueError):
                    logging.getLogger(__name__).warning(
                        "Ignoring invalid temporal month lexicon value for %s/%s", lang, word
                    )
            if marker_type in {"metric_magnitude", "number_word"}:
                try:
                    lexicon_values.setdefault(marker_type, {})[word.casefold()] = int(float(r.get("canonical_value")))
                except (TypeError, ValueError):
                    logging.getLogger(__name__).warning(
                        "Ignoring invalid metric magnitude lexicon value for %s/%s", lang, word
                    )
        for lang, words in DEFAULT_LANGUAGE_MARKERS.items():
            if lang not in markers:
                markers[lang] = list(words)
            else:
                for w in words:
                    if w not in markers[lang]:
                        markers[lang].append(w)
        LANGUAGE_MARKERS = markers
        LEXICON_TERMS = lexicon
        LEXICON_VALUES = lexicon_values
        TEMPORAL_MONTH_MAP = month_map
        LEXICON_READY = bool(lexicon)
        import logging
        logging.getLogger(__name__).info(
            "Loaded %d lexicon terms (%d language markers, %d languages) from DB",
            sum(len(items) for by_language in lexicon.values() for items in by_language.values()),
            sum(len(v) for v in markers.values()), len(markers),
        )
    except Exception as e:
        LANGUAGE_MARKERS = {k: list(v) for k, v in DEFAULT_LANGUAGE_MARKERS.items()}
        LEXICON_TERMS = {}
        LEXICON_VALUES = {}
        TEMPORAL_MONTH_MAP = {}
        LEXICON_READY = False
        import logging
        logging.getLogger(__name__).warning(
            "Lexicon registry unavailable; lexical metric/date extraction is disabled: %s", e
        )


def get_language_markers() -> dict[str, list[str]]:
    global LANGUAGE_MARKERS
    if not LEXICON_LOAD_ATTEMPTED:
        load_language_markers_from_db()
    source = LANGUAGE_MARKERS or DEFAULT_LANGUAGE_MARKERS
    return {
        language: list(dict.fromkeys(_repair_legacy_lexicon_text(word) for word in words))
        for language, words in source.items()
    }


def get_lexicon_terms(marker_type: str, language: Optional[str] = None) -> list[str]:
    """Return DB terms plus the small offline native-script safety registry."""

    if not LEXICON_LOAD_ATTEMPTED:
        load_language_markers_from_db()
    marker_key = str(marker_type or "").strip().casefold()
    by_language = LEXICON_TERMS.get(marker_key, {})
    defaults = DEFAULT_LEXICON_TERMS.get(marker_key, {})
    if language:
        lang = str(language).strip().casefold()
        return list(dict.fromkeys(
            _repair_legacy_lexicon_text(term)
            for term in [*by_language.get(lang, []), *defaults.get(lang, [])]
        ))
    return list(dict.fromkeys(
        _repair_legacy_lexicon_text(term)
        for values in [*by_language.values(), *defaults.values()]
        for term in values
    ))


def get_location_stopwords() -> set[str]:
    """Return the static and DB-reviewed non-geographic location terms."""

    terms = {str(term).strip().casefold() for term in LOCATION_STOPWORDS if str(term).strip()}
    terms.update(
        str(term).strip().casefold()
        for term in get_lexicon_terms("location_stopword")
        if str(term).strip()
    )
    return terms


def get_temporal_month_map() -> dict[str, int]:
    """Return only reviewed month aliases loaded from the database."""

    if not LEXICON_LOAD_ATTEMPTED:
        load_language_markers_from_db()
    return {
        _repair_legacy_lexicon_text(month): value
        for month, value in TEMPORAL_MONTH_MAP.items()
    }


def get_lexicon_values(marker_type: str) -> dict[str, int]:
    """Return canonical numeric values from the active DB lexicon."""

    if not LEXICON_LOAD_ATTEMPTED:
        load_language_markers_from_db()
    return {
        _repair_legacy_lexicon_text(word): value
        for word, value in LEXICON_VALUES.get(str(marker_type or "").strip().casefold(), {}).items()
    }


def get_temporal_month_pattern() -> str:
    """Build an escaped Unicode month pattern from the DB registry."""

    aliases = sorted(get_temporal_month_map(), key=len, reverse=True)
    return "(?:" + "|".join(re.escape(alias) for alias in aliases) + ")" if aliases else r"(?!)"


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
            try:
                re.compile(r["regex_pattern"])
            except re.error as exc:
                logging.getLogger(__name__).warning(
                    "Ignoring invalid extraction rule %s: %s", field, exc
                )
                continue
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
