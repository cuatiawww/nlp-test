---
name: disease-surveillance-ops
description: >-
  Operational runbook and debugging workflows for the ABVC / NLP Penyakit multi-service architecture
  (FastAPI NLP pipeline, worker-python, collector, Next.js, Rust backend, RabbitMQ, PostgreSQL).
  Use when diagnosing pipeline timeouts, service crashes, crawling jobs, or running regression tests.
---

# Disease Surveillance Operations Runbook

## Service Architecture Quick Map
- `disease-nlp-python` (Port 8000): Core NLP extraction (FastAPI, spaCy, transformer models, bounded pipeline).
- `disease-worker-python`: Background RabbitMQ consumer executing analysis jobs.
- `disease-collector-python`: Web scraper and RSS collector.
- `disease-backend-rust` (Port 8080): High-performance core API and auth service.
- `disease-frontend-next` (Port 3000): Next.js web application.
- `db-postgres` (Port 5432): Relational storage for surveillance signals, raw reports, and events.
- `disease-rabbitmq` (Port 5672/15672): Durable message broker.

## Common Operations

### 1. Inspecting Pipeline & Service Health
```bash
# Check container CPU and memory usage
docker stats --no-stream

# View real-time NLP logs
docker logs disease-nlp-python --tail 100

# Check worker status
docker logs disease-worker-python --tail 50
```

### 2. Recovering from NLP Overload / Timeout
If `disease-nlp-python` hits 100% CPU or requests encounter `Read timed out`:
```bash
docker restart disease-nlp-python
```

### 3. Running Surveillance Regression Tests
Inside the python container:
```bash
docker exec -i disease-nlp-python pytest /app/tests/ -v
```
Or execute slice-specific test suites in `services/nlp-python/app/tests/`.
