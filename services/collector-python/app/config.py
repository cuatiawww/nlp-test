import os

COLLECTOR_MAX_CONCURRENT_RUNS = max(
    1, int(os.getenv("COLLECTOR_MAX_CONCURRENT_RUNS", "2"))
)

DATABASE_URL = os.getenv("DATABASE_URL", "postgres://postgres:root@host.docker.internal:9898/disease_ai")
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/%2f")
RABBITMQ_QUEUE = os.getenv("RABBITMQ_QUEUE", "disease.raw")
RABBITMQ_SKDR_QUEUE = os.getenv("RABBITMQ_SKDR_QUEUE", "disease.skdr")
RABBITMQ_SOCIAL_QUEUE = os.getenv("RABBITMQ_SOCIAL_QUEUE", "disease.social")
RABBITMQ_ANALYSIS_URL_QUEUE = os.getenv("RABBITMQ_ANALYSIS_URL_QUEUE", "disease.analysis-url")
RABBITMQ_CRAWL_MATRIX_QUEUE = os.getenv("RABBITMQ_CRAWL_MATRIX_QUEUE", "disease.crawl-matrix")
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ROOT_USER", "minio_mci")
MINIO_SECRET_KEY = os.getenv("MINIO_ROOT_PASSWORD", "")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "disease-documents")
NLP_SERVICE_URL = os.getenv("NLP_SERVICE_URL", "http://localhost:8003")

# SKDR API collector. The credential is intentionally read only from the
# runtime environment and is never stored in collector_sources.config.
SKDR_API_URL = os.getenv("SKDR_API_URL", "https://skdr.kemkes.go.id")
SKDR_USER_KEY = os.getenv("SKDR_USER_KEY", "")
SKDR_EBS_LIMIT = max(1, int(os.getenv("SKDR_EBS_LIMIT", "100")))
SKDR_ALERT_LIMIT = max(1, int(os.getenv("SKDR_ALERT_LIMIT", "500")))
SKDR_REQUEST_DELAY_SECONDS = max(0.0, float(os.getenv("SKDR_REQUEST_DELAY_SECONDS", "2")))
SKDR_REQUEST_JITTER_SECONDS = max(0.0, float(os.getenv("SKDR_REQUEST_JITTER_SECONDS", "0.5")))
SKDR_MAX_RETRIES = max(0, int(os.getenv("SKDR_MAX_RETRIES", "5")))
SKDR_BACKOFF_BASE_SECONDS = max(0.1, float(os.getenv("SKDR_BACKOFF_BASE_SECONDS", "2")))
SKDR_BACKOFF_MAX_SECONDS = max(SKDR_BACKOFF_BASE_SECONDS, float(os.getenv("SKDR_BACKOFF_MAX_SECONDS", "60")))
SKDR_REQUEST_TIMEOUT_SECONDS = max(5, int(os.getenv("SKDR_REQUEST_TIMEOUT_SECONDS", "60")))
SKDR_MAX_CONCURRENT_REQUESTS = 1
SKDR_MAX_REQUESTS_PER_RUN = max(1, int(os.getenv("SKDR_MAX_REQUESTS_PER_RUN", "500")))
SKDR_ALERT_LOOKBACK_WEEKS = max(1, int(os.getenv("SKDR_ALERT_LOOKBACK_WEEKS", "3")))
COLLECTOR_TIMEZONE = os.getenv("COLLECTOR_TIMEZONE", "Asia/Jakarta")
SKDR_FETCH_TIME = os.getenv("SKDR_FETCH_TIME", "00:00")

# Shared crawler safety and reliability policy. These defaults remain modest
# so scheduled collection cannot become an uncontrolled crawler.
CRAWLER_TLS_VERIFY = os.getenv("CRAWLER_TLS_VERIFY", "true").lower() in ("true", "1", "yes", "on")
CRAWLER_MAX_HTML_MB = max(1, int(os.getenv("CRAWLER_MAX_HTML_MB", "10")))
CRAWLER_MAX_REDIRECTS = max(0, int(os.getenv("CRAWLER_MAX_REDIRECTS", "5")))
CRAWLER_MAX_RETRIES = max(0, min(5, int(os.getenv("CRAWLER_MAX_RETRIES", "2"))))
CRAWLER_BACKOFF_BASE_SECONDS = max(0.1, float(os.getenv("CRAWLER_BACKOFF_BASE_SECONDS", "1")))
CRAWLER_BACKOFF_MAX_SECONDS = max(
    CRAWLER_BACKOFF_BASE_SECONDS,
    float(os.getenv("CRAWLER_BACKOFF_MAX_SECONDS", "20")),
)
CRAWLER_DOMAIN_MIN_INTERVAL_SECONDS = max(
    0.0, float(os.getenv("CRAWLER_DOMAIN_MIN_INTERVAL_SECONDS", "0.25"))
)

# Interactive URL analysis must fail fast so reverse proxies do not return 504
# while Scrapling stealth/browser sessions ignore their configured timeout.
INTERACTIVE_HTML_TIMEOUT_SECONDS = max(
    1, min(int(os.getenv("INTERACTIVE_HTML_TIMEOUT_SECONDS", "12")), 20)
)
INTERACTIVE_HTML_MAX_BOUND_MS = max(
    1_000, min(int(os.getenv("INTERACTIVE_HTML_MAX_BOUND_MS", "20000")), 20_000)
)
INTERACTIVE_SKIP_STEALTH = os.getenv("INTERACTIVE_SKIP_STEALTH", "true").lower() in {
    "1", "true", "yes", "on",
}
