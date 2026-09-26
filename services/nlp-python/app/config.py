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

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "").strip()
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1").rstrip("/")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
DEEPSEEK_MAX_TOKENS = int(os.getenv("DEEPSEEK_MAX_TOKENS", "1500"))
DEEPSEEK_TIMEOUT_SECONDS = int(os.getenv("DEEPSEEK_TIMEOUT_SECONDS", "20"))
DEEPSEEK_MIN_CONFIDENCE = float(os.getenv("DEEPSEEK_MIN_CONFIDENCE", "0.85"))
DEEPSEEK_TRIGGER_CONFIDENCE = float(os.getenv("DEEPSEEK_TRIGGER_CONFIDENCE", "0.85"))
DEEPSEEK_LOCATION_MIN_CONFIDENCE = float(os.getenv("DEEPSEEK_LOCATION_MIN_CONFIDENCE", "0.80"))
DEEPSEEK_PROMPT_CHARS = max(200, int(os.getenv("DEEPSEEK_PROMPT_CHARS", "4500")))
DEEPSEEK_RESPONSE_MAX_TOKENS = max(256, int(os.getenv("DEEPSEEK_RESPONSE_MAX_TOKENS", "800")))
DEEPSEEK_DAILY_BUDGET = int(os.getenv("DEEPSEEK_DAILY_BUDGET", "200"))
DEEPSEEK_FAILURE_COOLDOWN_SECONDS = max(30, int(os.getenv("DEEPSEEK_FAILURE_COOLDOWN_SECONDS", "120")))
DEEPSEEK_QUOTA_COOLDOWN_SECONDS = max(
    DEEPSEEK_FAILURE_COOLDOWN_SECONDS,
    int(os.getenv("DEEPSEEK_QUOTA_COOLDOWN_SECONDS", "86400")),
)
DEEPSEEK_LOCATION_MAX_CANDIDATES = int(os.getenv("DEEPSEEK_LOCATION_MAX_CANDIDATES", "80"))
# External LLM review is opt-in. Default false (Fase 0 rules-first baseline).
# When false, no pipeline path may call DeepSeek/agent HTTP — status is
# reported as agent_invocation_status="disabled". It must never be an
# implicit dependency of high-volume crawling or synchronous extraction.
AGENT_ENABLED = os.getenv("AGENT_ENABLED", "false").lower() in {"1", "true", "yes", "on"}
AGENT_PROVIDER_ORDER = os.getenv("AGENT_PROVIDER_ORDER", "deepseek")
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
MULTI_EVENT_STAGE_TIMEOUT_SECONDS = env_seconds_at_least("MULTI_EVENT_STAGE_TIMEOUT_SECONDS", 20)
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
    # Indonesian discourse / hedge words that collide with rare gazetteer rows
    # (live: Tantangan->Philippines, Mungkin->Indonesia from prose).
    "tantangan", "mungkin", "misalnya", "misal", "padahal", "justru",
    "sekaligus", "bahkan", "adapun", "namun", "walaupun", "meskipun",
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
DISEASE_MASTER_LOAD_ATTEMPTED = False
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
    """Refresh symptom/disease keywords from GET /api/v1/nlp-keywords?snapshot=true."""
    global SYMPTOM_DICT, DISEASE_DICT, KEYWORDS_LOAD_ATTEMPTED
    KEYWORDS_LOAD_ATTEMPTED = True
    try:
        from .registry_client import load_rows
        rows = load_rows(
            "/api/v1/nlp-keywords?is_active=true&snapshot=true",
            "SELECT category, keyword, target_label, is_active FROM nlp_keywords "
            "WHERE is_active = TRUE ORDER BY priority",
        )
        symptom = {}
        disease = {}
        for r in rows:
            if not r.get("is_active", True):
                continue
            if r["category"] not in {"symptom", "disease"}:
                logging.getLogger(__name__).warning(
                    "Ignoring unsupported keyword category from app API: %s", r["category"]
                )
                continue
            d = symptom if r["category"] == "symptom" else disease
            d[r["keyword"]] = r["target_label"]
        SYMPTOM_DICT = symptom
        DISEASE_DICT = disease
        logging.getLogger(__name__).info(
            "Loaded %d symptom keywords and %d disease keywords from app API",
            len(symptom), len(disease),
        )
    except Exception as e:
        SYMPTOM_DICT = {}
        DISEASE_DICT = {}
        logging.getLogger(__name__).warning(
            "Failed to load keywords from app API, using empty dicts: %s", e
        )


def load_disease_master_from_db():
    """Refresh disease concepts and aliases from GET /api/v1/disease-concepts?snapshot=true."""
    global DISEASE_MASTER_CONCEPTS, DISEASE_MASTER_LOAD_ATTEMPTED
    DISEASE_MASTER_LOAD_ATTEMPTED = True
    try:
        from .registry_client import load_rows
        rows = load_rows(
            "/api/v1/disease-concepts?is_active=true&snapshot=true&include=aliases",
            """SELECT c.disease_id, c.canonical_name, c.english_name, c.ontology_system,
                      c.source, c.is_active,
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
               GROUP BY c.id
               ORDER BY c.canonical_name""",
        )
        DISEASE_MASTER_CONCEPTS = [row for row in rows if row.get("is_active", True)]
        import json as _json
        for concept in DISEASE_MASTER_CONCEPTS:
            aliases = concept.get("aliases")
            if isinstance(aliases, str):
                try:
                    concept["aliases"] = _json.loads(aliases)
                except _json.JSONDecodeError:
                    concept["aliases"] = []
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
        logging.getLogger(__name__).info(
            "Loaded %d local disease-master concepts from app API", len(DISEASE_MASTER_CONCEPTS)
        )
    except Exception as e:
        DISEASE_MASTER_CONCEPTS = []
        logging.getLogger(__name__).warning("Failed to load local disease-master concepts: %s", e)


def load_outbreak_rules_from_db():
    """Refresh outbreak thresholds from GET /api/v1/outbreak-rules?snapshot=true."""
    global OUTBREAK_RULES
    try:
        from .registry_client import load_rows
        rows = load_rows(
            "/api/v1/outbreak-rules?is_active=true&snapshot=true",
            "SELECT disease_name, min_case_count, is_active FROM disease_outbreak_rules "
            "WHERE is_active = TRUE",
        )
        OUTBREAK_RULES = {
            r["disease_name"].upper(): r["min_case_count"]
            for r in rows
            if r.get("is_active", True)
        }
        logging.getLogger(__name__).info(
            "Loaded %d outbreak rules from app API", len(OUTBREAK_RULES),
        )
    except Exception as e:
        logging.getLogger(__name__).warning(
            "Failed to load outbreak rules from app API, using defaults: %s", e
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


def _flatten_location_aliases(rows: list[dict]) -> list[dict]:
    alias_rows = []
    for row in rows:
        for alias in row.get("aliases") or []:
            if not isinstance(alias, dict):
                continue
            alias_name = alias.get("alias_name")
            if not alias_name:
                continue
            alias_rows.append({
                "alias_name": str(alias_name),
                "canonical_name": alias.get("canonical_name") or row.get("name"),
                "country": alias.get("country", row.get("country")),
                "admin_level": alias.get("admin_level", row.get("admin_level")),
            })
    return alias_rows


def _fetch_location_rows() -> tuple[list[dict], list[dict]]:
    from .registry_client import fetch_collection, http_registry_enabled, query_db

    path = "/api/v1/locations?is_active=true&snapshot=true&include=aliases"
    if http_registry_enabled():
        try:
            rows = [
                row for row in fetch_collection(path)
                if row.get("is_active", True)
            ]
            return rows, _flatten_location_aliases(rows)
        except Exception as exc:
            logging.getLogger(__name__).warning(
                "Location API failed, using database: %s", exc
            )
    rows = query_db(
        """SELECT name, latitude, longitude, country, country_iso3,
                  admin1_name, admin2_name, admin_level
           FROM locations
           WHERE is_active = TRUE"""
    )
    alias_rows: list[dict] = []
    try:
        alias_rows = query_db(
            """SELECT a.alias_name, l.name as canonical_name, l.country, l.admin_level
               FROM location_aliases a
               JOIN locations l ON a.location_id = l.id
               WHERE l.is_active = TRUE"""
        )
    except Exception as exc:
        logging.getLogger(__name__).warning("Could not load location_aliases: %s", exc)
    return rows, alias_rows


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
        rows, alias_rows = _fetch_location_rows()
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
        logging.getLogger(__name__).info(
            "Loaded %d locations, %d aliases from app API", len(LOCATION_COORDS), len(LOCATION_ALIASES),
        )
        LOCATION_REGISTRY_REFERENCE_ID = id(LOCATION_COORDS)
        try:
            from .extractors import invalidate_location_alias_cache
            invalidate_location_alias_cache()
        except Exception:
            pass
    except Exception as e:
        LOCATION_COORDS = {}
        LOCATION_COUNTRIES = {}
        LOCATION_ALIASES = {}
        LOCATION_REGISTRY_REFERENCE_ID = None
        logging.getLogger(__name__).warning(
            "Location registry unavailable; location alias matching is disabled: %s", e
        )


def upsert_reviewed_location(
    location_name: str | None,
    country: str | None,
    *,
    alias: str | None = None,
    language: str = "und",
) -> str | None:
    """Persist an evidence-backed DeepSeek location and refresh the cache."""
    name = " ".join(str(location_name or "").split()).strip()
    nation = " ".join(str(country or "").split()).strip()
    if not name or not nation or len(name) > 180 or len(nation) > 120:
        return None
    if name.casefold() in {"unknown", "multi_country", "multiple countries"}:
        return None
    try:
        import psycopg
        from psycopg.rows import dict_row

        with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
            row = conn.execute(
                """
                SELECT id, name FROM locations
                WHERE lower(name) = lower(%s) AND lower(country) = lower(%s)
                LIMIT 1
                """,
                (name, nation),
            ).fetchone()
            if row is None:
                row = conn.execute(
                    """
                    INSERT INTO locations
                        (id, name, country, is_active, country_iso3, admin_level)
                    VALUES
                        (gen_random_uuid(), %s, %s, true, %s, 3)
                    RETURNING id, name
                    """,
                    (name, nation, COUNTRY_TO_ISO3.get(nation.casefold())),
                ).fetchone()
            alias_value = " ".join(str(alias or "").split()).strip()
            if alias_value and alias_value.casefold() != str(row["name"]).casefold():
                conn.execute(
                    """
                    INSERT INTO location_aliases
                        (location_id, alias_name, language, is_preferred)
                    VALUES (%s, %s, %s, false)
                    ON CONFLICT (location_id, alias_name, language) DO NOTHING
                    """,
                    (row["id"], alias_value, language[:12] or "und"),
                )
            conn.commit()
            load_locations_from_db()
            return str(row["name"])
    except Exception as exc:
        logging.getLogger(__name__).warning("Reviewed location upsert skipped: %s", exc)
        return name


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
    """Refresh source scores from GET /api/v1/source-credibility."""
    global SOURCE_CREDIBILITY_MAP
    try:
        from .registry_client import load_rows
        rows = load_rows(
            "/api/v1/source-credibility",
            "SELECT source_type, score, is_active FROM source_credibility WHERE is_active = TRUE",
        )
        SOURCE_CREDIBILITY_MAP = {
            r["source_type"]: r["score"]
            for r in rows
            if r.get("is_active", True)
        }
        logging.getLogger(__name__).info(
            "Loaded %d credibility scores from app API", len(SOURCE_CREDIBILITY_MAP),
        )
    except Exception as e:
        logging.getLogger(__name__).warning(
            "Failed to load credibility from app API: %s", e
        )


def _fetch_language_marker_rows() -> list[dict]:
    from .registry_client import fetch_collection, http_registry_enabled, query_db

    if http_registry_enabled():
        try:
            return fetch_collection("/api/v1/language-markers")
        except Exception as exc:
            logging.getLogger(__name__).warning(
                "Language marker API failed, using database: %s", exc
            )
    try:
        return query_db(
            """SELECT word, language, marker_type, canonical_value, priority, is_active
               FROM language_markers
               WHERE is_active = TRUE
               ORDER BY marker_type, language, priority, word"""
        )
    except Exception:
        # Databases that predate migration 095 only have word and language.
        return query_db(
            "SELECT word, language, is_active FROM language_markers "
            "WHERE is_active = TRUE ORDER BY language, word"
        )


def load_language_markers_from_db():
    global LANGUAGE_MARKERS, LEXICON_TERMS, LEXICON_VALUES, TEMPORAL_MONTH_MAP, LEXICON_READY, LEXICON_LOAD_ATTEMPTED
    LEXICON_LOAD_ATTEMPTED = True
    try:
        rows = [
            row for row in _fetch_language_marker_rows()
            if row.get("is_active", True)
        ]
        rows.sort(key=lambda row: (
            str(row.get("marker_type") or ""),
            str(row.get("language") or ""),
            int(row.get("priority") or 0),
            str(row.get("word") or ""),
        ))
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
        logging.getLogger(__name__).info(
            "Loaded %d lexicon terms (%d language markers, %d languages) from app API",
            sum(len(items) for by_language in lexicon.values() for items in by_language.values()),
            sum(len(v) for v in markers.values()), len(markers),
        )
    except Exception as e:
        LANGUAGE_MARKERS = {k: list(v) for k, v in DEFAULT_LANGUAGE_MARKERS.items()}
        LEXICON_TERMS = {}
        LEXICON_VALUES = {}
        TEMPORAL_MONTH_MAP = {}
        LEXICON_READY = False
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
    """Refresh regex rules from GET /api/v1/extraction-rules."""
    global EXTRACTION_RULES
    try:
        from .registry_client import load_rows
        rows = [
            row for row in load_rows(
                "/api/v1/extraction-rules",
                "SELECT field_name, regex_pattern, priority, is_active FROM extraction_rules "
                "WHERE is_active = TRUE ORDER BY field_name, priority",
            )
            if row.get("is_active", True)
        ]
        rows.sort(key=lambda row: (
            str(row.get("field_name") or ""),
            int(row.get("priority") or 0),
        ))
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
        logging.getLogger(__name__).info(
            "Loaded %d extraction rules (%d fields) from app API",
            sum(len(v) for v in rules.values()), len(rules),
        )
    except Exception as e:
        logging.getLogger(__name__).warning(
            "Failed to load extraction rules from app API, using defaults: %s", e
        )


def load_language_models_from_db():
    """Refresh per-language model keys from GET /api/v1/language-models."""
    global LANGUAGE_MODEL_MAP
    try:
        from .registry_client import load_rows
        rows = load_rows(
            "/api/v1/language-models",
            "SELECT language, model_key, is_active FROM language_models "
            "WHERE is_active = TRUE ORDER BY language",
        )
        LANGUAGE_MODEL_MAP = {
            r["language"]: r["model_key"]
            for r in rows
            if r.get("is_active", True)
        }
        logging.getLogger(__name__).info(
            "Loaded %d language-to-model mappings from app API", len(LANGUAGE_MODEL_MAP),
        )
    except Exception as e:
        logging.getLogger(__name__).warning(
            "Failed to load language models from app API: %s", e
        )


def _normalize_discovery_form(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s-]", " ", (value or "").lower())).strip()


def _reload_discovery_caches() -> None:
    load_keywords_from_db()
    load_disease_master_from_db()
    load_outbreak_rules_from_db()
    try:
        from .models.classifier import refresh_labels_from_db
        refresh_labels_from_db()
    except Exception:
        pass


def upsert_discovered_disease_concept(
    canonical_name: str,
    english_name: str,
    ontology_code: str,
    ontology_uri: str,
    ontology_release: str | None = None,
    aliases: list[dict[str, Any]] | None = None,
) -> bool:
    """Persist a validated concept plus aliases, keywords, and an outbreak rule.

    Not called by the rules-first extract path. HTTP when ``NLP_SERVICE_URL``
    is set, otherwise the same write against Postgres.
    """
    if not canonical_name or not ontology_code:
        return False
    release = (ontology_release or os.getenv("WHO_ICD_RELEASE", "11/2026-01/mms")).strip("/")
    body = {
        "canonical_name": canonical_name,
        "english_name": english_name,
        "ontology_code": ontology_code,
        "ontology_uri": ontology_uri,
        "ontology_release": release,
        "min_case_count": EXPLICIT_KNOWN_DISEASE_MIN_CASES,
        "aliases": aliases or [],
    }
    from .registry_client import RegistryApiError, http_registry_enabled, request_json

    if http_registry_enabled():
        try:
            request_json("POST", "/api/v1/disease-concepts/upsert", body)
            _reload_discovery_caches()
            return True
        except RegistryApiError as exc:
            if exc.status == 409:
                return False
            logging.getLogger(__name__).warning(
                "Disease concept upsert API failed, using database: %s", exc
            )
        except Exception as exc:
            logging.getLogger(__name__).warning(
                "Disease concept upsert API failed, using database: %s", exc
            )
    try:
        return _upsert_discovered_disease_concept_db(
            canonical_name, english_name, ontology_code, ontology_uri, release, aliases or []
        )
    except Exception as exc:
        logging.getLogger(__name__).warning(
            "Failed to upsert discovered disease concept '%s': %s", canonical_name, exc
        )
        return False


def _upsert_discovered_disease_concept_db(
    canonical_name: str,
    english_name: str,
    ontology_code: str,
    ontology_uri: str,
    ontology_release: str,
    aliases: list[dict[str, Any]],
) -> bool:
    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        with conn.transaction():
            row = conn.execute(
                """
                SELECT id, canonical_name
                FROM disease_concepts
                WHERE ontology_code = %s AND is_active = TRUE
                ORDER BY created_at ASC
                LIMIT 1
                """,
                (ontology_code,),
            ).fetchone()
            if row:
                concept_id = row["id"]
                concept_name = row["canonical_name"]
                conn.execute(
                    """
                    UPDATE disease_concepts
                    SET english_name = COALESCE(NULLIF(%s, ''), english_name),
                        ontology_system = 'WHO ICD-11 MMS',
                        ontology_uri = COALESCE(NULLIF(%s, ''), ontology_uri),
                        ontology_release = COALESCE(NULLIF(%s, ''), ontology_release),
                        canonicalization_status = 'validated',
                        is_active = TRUE,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (english_name or concept_name, ontology_uri, ontology_release, concept_id),
                )
            else:
                name_conflict = conn.execute(
                    """
                    SELECT id, ontology_code
                    FROM disease_concepts
                    WHERE canonical_name = %s
                    LIMIT 1
                    """,
                    (canonical_name,),
                ).fetchone()
                if name_conflict and name_conflict["ontology_code"] not in (None, ontology_code):
                    logging.getLogger(__name__).warning(
                        "Disease canonical name conflict requires review: name=%s existing_code=%s new_code=%s",
                        canonical_name, name_conflict["ontology_code"], ontology_code,
                    )
                    return False
                row = conn.execute(
                    """
                    INSERT INTO disease_concepts
                      (canonical_name, english_name, ontology_system, ontology_code,
                       ontology_uri, ontology_release, source, confidence, is_active,
                       canonicalization_status, disease_id, updated_at)
                    VALUES (%s, %s, 'WHO ICD-11 MMS', %s, %s, %s, 'who_icd11_discovery', 1.0, TRUE,
                            'validated', %s, NOW())
                    ON CONFLICT (canonical_name) DO UPDATE SET
                      english_name = EXCLUDED.english_name,
                      ontology_system = 'WHO ICD-11 MMS',
                      ontology_code = COALESCE(disease_concepts.ontology_code, EXCLUDED.ontology_code),
                      ontology_uri = COALESCE(disease_concepts.ontology_uri, EXCLUDED.ontology_uri),
                      ontology_release = COALESCE(disease_concepts.ontology_release, EXCLUDED.ontology_release),
                      is_active = TRUE,
                      updated_at = NOW()
                    RETURNING id, canonical_name
                    """,
                    (
                        canonical_name,
                        english_name or canonical_name,
                        ontology_code,
                        ontology_uri,
                        ontology_release,
                        ontology_code,
                    ),
                ).fetchone()
                concept_id = row["id"]
                concept_name = row["canonical_name"]

            all_aliases = list(aliases)
            all_aliases.append({"surface_form": concept_name, "language": "en", "confidence": 1.0})
            if english_name and english_name != canonical_name:
                all_aliases.append({"surface_form": english_name, "language": "en", "confidence": 1.0})
            for item in all_aliases:
                surface = str(item.get("surface_form") or "").strip()
                if not surface:
                    continue
                lang = str(item.get("language") or "unknown")
                conf = float(item.get("confidence") or 1.0)
                norm_alias = _normalize_discovery_form(surface)
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
                    (norm_alias, concept_name),
                )
            conn.execute(
                """
                INSERT INTO nlp_labels (category, label, priority, is_active, updated_at)
                VALUES ('disease', %s, 50, TRUE, NOW())
                ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE, updated_at = NOW()
                """,
                (concept_name,),
            )
            conn.execute(
                """
                INSERT INTO disease_outbreak_rules
                  (disease_name, display_label, min_case_count, priority, is_active, updated_at)
                VALUES (%s, %s, %s, 50, TRUE, NOW())
                ON CONFLICT (disease_name) DO NOTHING
                """,
                (concept_name.upper(), concept_name, EXPLICIT_KNOWN_DISEASE_MIN_CASES),
            )
    _reload_discovery_caches()
    return True


def upsert_disease_discovery_candidate(
    surface_form: str,
    sample_text: str = "",
    language: str = "unknown",
    provider: str = "",
    confidence: float = 0.0,
) -> bool:
    """Quarantine an unresolved disease term. Not used by rules-first extract."""
    if not surface_form or not surface_form.strip():
        return False
    normalized = _normalize_discovery_form(surface_form)
    if not normalized:
        return False
    body = {
        "surface_form": surface_form.strip(),
        "language": language or "unknown",
        "sample_text": sample_text[:5000],
        "provider": provider,
        "confidence": confidence,
    }
    from .registry_client import http_registry_enabled, request_json

    if http_registry_enabled():
        try:
            request_json("POST", "/api/v1/disease-discovery-candidates", body)
            return True
        except Exception as exc:
            logging.getLogger(__name__).warning(
                "Discovery candidate API failed, using database: %s", exc
            )
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
    except Exception as exc:
        logging.getLogger(__name__).warning(
            "Failed to store unresolved disease candidate '%s': %s", surface_form, exc
        )
        return False
