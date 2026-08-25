import os

COLLECTOR_MAX_CONCURRENT_RUNS = max(
    1, int(os.getenv("COLLECTOR_MAX_CONCURRENT_RUNS", "2"))
)

DATABASE_URL = os.getenv("DATABASE_URL", "postgres://postgres:root@host.docker.internal:9898/disease_ai")
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/%2f")
RABBITMQ_QUEUE = os.getenv("RABBITMQ_QUEUE", "disease.raw")
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ROOT_USER", "minio_mci")
MINIO_SECRET_KEY = os.getenv("MINIO_ROOT_PASSWORD", "")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "disease-documents")
NLP_SERVICE_URL = os.getenv("NLP_SERVICE_URL", "http://localhost:8003")
