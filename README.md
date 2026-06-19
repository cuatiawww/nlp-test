# Disease Surveillance AI

**Multilingual NLP Disease Monitoring** — ASEAN-focused platform untuk mendeteksi, mengklasifikasi, dan memantau wabah penyakit dari berita online, media sosial, dan laporan kesehatan.

## Arsitektur

```
┌─────────┐  ┌──────────┐  ┌──────────┐
│Frontend │  │ Backend  │  │Collector │
│ Next.js │─▶│ Rust API │◀─│  Python  │
│ :3001   │  │ :8080    │  │          │
└─────────┘  └────┬─────┘  └────┬─────┘
                  │             │ RabbitMQ
          ┌───────▼──────┐  ┌───▼──────┐
          │  PostgreSQL  │  │  Worker  │
          │  + PostGIS   │◀─│  Python  │
          │  :9876       │  │          │
          └──────────────┘  └────┬─────┘
                                 │
                         ┌──────▼──────┐
                         │  NLP Python │
                         │  XLM-RoBERTa│
                         │  :8001      │
                         └─────────────┘
```

## Services

| Service | Port | Image | Fungsi |
|---------|------|-------|--------|
| `frontend-next` | 3001 | `nlp-frontend-next` | Dashboard + manajemen sumber data |
| `backend-rust` | 8080 | `nlp-backend-rust` | REST API, CRUD sumber data, ingest async |
| `nlp-python` | 8001 | `nlp-nlp-python` | NLP zero-shot classification + sentiment |
| `worker-python` | — | `nlp-worker-python` | Async consumer RabbitMQ → NLP → DB |
| `collector-python` | 8002 | `nlp-collector-python` | RSS, web scraping, CSV ingest |
| `postgres` | **9876** | `postgis/postgis:16-3.4` | Database + PostGIS spatial |
| `minio` | 9002 (API) / 9003 (Console) | `minio/minio` | Object storage dokumen |
| `rabbitmq` | 5672 / 15672 | `rabbitmq:3-management` | Message queue |

## Quick Start

```bash
cp .env.example .env
# Edit .env jika perlu (password, dll)
docker compose up -d --build

# First-time setup: seed user webmaster
docker compose --profile init run --rm init
```

Cek semua service:

```bash
docker compose ps
```

## Tahap Pengembangan

### ✅ Tahap 1 — Docker Compose POC
- Frontend → Rust API → NLP → PostgreSQL
- Rule-based NLP placeholder
- Basic dashboard (stat cards + summary table)

### ✅ Tahap 2 — Data Collection
- **Collector Service**: RSS, Web Scraper, CSV Ingest, Social Media
- **MinIO**: Object storage untuk dokumen mentah
- **Worker Enhancement**: Async consumer RabbitMQ → NLP → DB
- **Backend API**: CRUD `collector_sources`, `collector_runs`, trigger collect
- **Frontend**: Manajemen sumber data (+Tambah, +Edit, Trigger, Riwayat runs)

### ✅ Tahap 3 — Queue Processing (Async)
- **Rust backend** publish ke RabbitMQ via `lapin`
- **Worker** consume → NLP → write to DB
- Sync fallback jika RabbitMQ unavailable
- `POST /api/v1/ingest` returns `"status": "queued"` (async)

### ✅ Tahap 4 — XLM-RoBERTa NLP
- **Zero-shot classification** untuk penyakit + sentimen
- **Dual model ready**: XLM-RoBERTa (default) / IndoBERT
- Labels dinamis via API + env var
- `langdetect` untuk deteksi bahasa (55 bahasa)
- `needs_review: true/false` untuk kasus low-confidence

## NLP Model Configuration

### Pilih Model

Edit `docker-compose.yml` → environment `nlp-python`:

```yaml
environment:
  - NLP_MODEL=xlm-roberta   # default: XLM-RoBERTa (ASEAN multilingual)
  # - NLP_MODEL=indobert    # Indonesia only
  # - NLP_MODEL=dual        # BOTH: IndoBERT untuk ID, XLM-R untuk lainnya
  # - NLP_MODEL=none        # rule-based only (no ML)
```

| Model | RAM | Disk | Cakupan Bahasa |
|-------|-----|------|---------------|
| `xlm-roberta` | ~2GB | 1.1GB | 100+ bahasa (ASEAN) |
| `indobert` | ~1.2GB | 500MB | Indonesia |
| `dual` | ~3.2GB | 1.6GB | Indo untuk ID, XLM-R untuk lainnya |
| `none` | ~50MB | 0 | Rule-based fallback |

### Dynamic Disease Labels

Label penyakit bisa diubah runtime via API:

```bash
# Lihat labels saat ini
curl http://localhost:8001/labels

# Update labels
curl -X PUT http://localhost:8001/labels \
  -H "Content-Type: application/json" \
  -d '{"labels":["dengue fever DBD","acute diarrhea","leptospirosis","influenza flu","COVID-19 coronavirus","malaria"]}'

# Update sentiment labels
curl -X PUT http://localhost:8001/labels/sentiment \
  -H "Content-Type: application/json" \
  -d '{"labels":["positive","negative","neutral"]}'
```

Atau via environment variable:

```yaml
# docker-compose.yml
environment:
  - DISEASE_LABELS=DBD,diare akut,leptospirosis,influenza,COVID-19,malaria
```

## API Documentation

### Public API (Backend Rust — :8080)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/v1/ingest` | Submit text → async queue (return `"status":"queued"`) |
| `GET` | `/api/v1/events` | List disease events (NLP results) |
| `GET` | `/api/v1/summary` | Aggregated dashboard summary |
| `GET` | `/api/v1/sources` | List collector sources |
| `POST` | `/api/v1/sources` | Create data source |
| `GET` | `/api/v1/sources/{id}` | Get source detail |
| `PUT` | `/api/v1/sources/{id}` | Update source config |
| `DELETE` | `/api/v1/sources/{id}` | Delete source |
| `POST` | `/api/v1/sources/{id}/collect` | Trigger collection |
| `GET` | `/api/v1/runs` | List collection runs |

### NLP API (Internal — :8001)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health + model info |
| `POST` | `/nlp/analyze` | Analyze text (disease + sentiment) |
| `GET` | `/labels` | View current labels |
| `PUT` | `/labels` | Update disease labels |
| `PUT` | `/labels/sentiment` | Update sentiment labels |

### Ingest Example

```bash
curl -X POST http://localhost:8080/api/v1/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "source_type":"Berita Online",
    "source_name":"Portal Demo",
    "published_at":"2026-06-18",
    "text":"Di Jakarta terdapat 25 warga demam tinggi dan diare setelah banjir.",
    "url":"https://example.local/demo"
  }'
```

Response (async):
```json
{"success":true,"data":{"raw_report_id":"...","status":"queued"}}
```

Worker akan memproses dalam beberapa detik. Cek hasil:

```bash
curl http://localhost:8080/api/v1/events
```

## Port Mapping

### Service Ports

| Service | Internal | Host | Keterangan |
|---------|----------|------|------------|
| Postgres | 5432 | **9876** | Beda dengan Windows postgres (9898) |
| MinIO API | 9000 | **9002** | Beda dengan external minio (9000) |
| MinIO Console | 9001 | **9003** | Beda dengan external minio (9001) |
| RabbitMQ AMQP | 5672 | 5672 | |
| RabbitMQ UI | 15672 | 15672 | |
| NLP Python | 8000 | 8001 | |
| Backend Rust | 8080 | 8080 | |
| Frontend Next | 3000 | 3001 | |

### Akses dari Host (Windows)

Semua port host bisa diakses dari Windows via `http://localhost:{port}` karena Docker Desktop port forwarding.

Postgres bisa diakses dari tool eksternal:
```
Host: localhost
Port: 9876
User: postgres
Password: root
Database: disease_ai
```

## Data Flow

### Async (default)
```
POST /api/v1/ingest → INSERT raw_reports (NEW)
                    → Publish RabbitMQ
                    → Return "queued"
                    ↓
  Worker consume → POST /nlp/analyze
                 → UPDATE raw_reports (PROCESSED)
                 → INSERT disease_events
```

### Sync (fallback — jika RabbitMQ down)
```
POST /api/v1/ingest → INSERT raw_reports
                    → POST /nlp/analyze (langsung)
                    → INSERT disease_events
                    → Return "processed_sync"
```

### Collection Pipeline
```
Scheduler → Collector (RSS/Web/CSV) → RabbitMQ → Worker → NLP → DB
                                              ↘ MinIO (dokumen)
```

## Frontend Pages

| Route | Deskripsi |
|-------|-----------|
| `/` | Dashboard: stat cards + summary table |
| `/sources` | Manajemen sumber data (CRUD + trigger) |
| `/sources/new` | Tambah sumber data (RSS/Web/CSV/Social) |
| `/sources/{id}` | Detail sumber + riwayat collection |
| `/events` | Daftar hasil NLP yang sudah diproses |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NLP_MODEL` | `xlm-roberta` | Model selection: `xlm-roberta`, `indobert`, `dual`, `none` |
| `DISEASE_LABELS` | default list | Comma-separated disease labels for zero-shot |
| `LOW_CONFIDENCE_THRESHOLD` | `0.5` | Threshold for `needs_review` flag |
| `DATABASE_URL` | `postgres://postgres:root@postgres:5432/disease_ai` | PostgreSQL connection |
| `RABBITMQ_URL` | `amqp://guest:guest@rabbitmq:5672/%2f` | RabbitMQ connection |
| `NLP_SERVICE_URL` | `http://nlp-python:8000` | NLP service internal URL |
| `MINIO_ENDPOINT` | `http://minio:9000` | MinIO internal URL |
| `BACKEND_PORT` | `8080` | Rust backend port |

## Docker Compose Management

```bash
# Start semua service
docker compose up -d

# Start specific service
docker compose up -d nlp-python

# Rebuild specific service
docker compose up -d --build nlp-python

# Stop (tidak auto-restart setelah WSL reboot)
docker compose down

# Manual start setelah WSL restart
docker compose up -d

# Lihat logs
docker compose logs -f backend-rust
docker compose logs -f worker-python
```

> **Note**: Semua service menggunakan `restart: no`. Tidak ada yang auto-start setelah WSL reboot. Jalankan `docker compose up -d` secara manual.

## Troubleshooting

### Model download gagal / lambat

Model XLM-RoBERTa (~1.1 GB) di-download otomatis saat startup pertama.
- Pastikan koneksi internet stabil
- Model di-cache di `./services/nlp-python/models/` (Docker volume)
- Jika ingin reset cache: hapus folder `models/` dan restart

### Port bentrok

Jika ada service lain yang menggunakan port yang sama:
- Postgres: ubah port di `docker-compose.yml` `ports: - "XXXX:5432"`
- Update `DATABASE_URL` di `.env` dengan port baru

### Postgres tidak bisa diakses dari tool eksternal

```bash
# Test koneksi dari WSL
timeout 3 bash -c 'echo >/dev/tcp/127.0.0.1/9876' && echo "OK" || echo "FAIL"
```

## Social Media Monitoring

### RSS-based (No API Key)
Sumber sosial media via RSS (default):

| Source | Platform | URL |
|--------|----------|-----|
| `Mastodon Health` | Mastodon | `https://mastodon.social/tags/health.rss` |
| `Mastodon Disease` | Mastodon | `https://mastodon.social/tags/disease.rss` |
| `Reddit Health News` | Reddit | `https://www.reddit.com/r/health/.rss` |
| `Reddit World News` | Reddit | `https://www.reddit.com/r/worldnews/.rss` |

### X/Twitter (API Key)
Untuk koleksi dari X/Twitter, perlu API key:

1. Daftar di [developer.twitter.com](https://developer.twitter.com)
2. Buat project → dapatkan Bearer Token
3. Tambah source via API:

```bash
curl -X POST http://localhost:8080/api/v1/sources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "X Dengue Monitoring",
    "source_type": "social_media",
    "config": {
      "platform": "twitter",
      "api_key": "YOUR_BEARER_TOKEN",
      "keywords": ["dbd", "demam berdarah", "dengue", "jentik"]
    },
    "schedule": "interval:60"
  }'
```

### Instagram / TikTok
Saat ini belum ada connector untuk Instagram/TikTok karena memerlukan API business access.

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Frontend | Next.js 15, React 19, Tailwind CSS, Lucide Icons |
| Backend | Rust, Axum, tokio-postgres, deadpool, lapin |
| NLP | Python, FastAPI, HuggingFace Transformers, XLM-RoBERTa |
| Worker | Python, Pika, psycopg3 |
| Collector | Python, FastAPI, feedparser, BeautifulSoup4, APScheduler |
| Database | PostgreSQL 16 + PostGIS |
| Storage | MinIO |
| Queue | RabbitMQ |

## Google Colab Fine-Tuning Guide

Gunakan Google Colab T4 GPU (gratis) untuk fine-tuning XLM-RoBERTa dengan data dari sistem. Accuracy naik dari ~10-30% (zero-shot) menjadi >85% (fine-tuned).

### 1. Export Training Data

```bash
# Export dari database
python3 scripts/export_training_data.py

# Output: training/train.jsonl, training/test.jsonl
```

### 2. Upload ke Google Drive

Buat folder `disease-nlp/` di Google Drive, upload file berikut:
```
Google Drive/
  └── disease-nlp/
      ├── train.jsonl
      ├── test.jsonl
      └── fine_tune.ipynb   (dari notebooks/fine_tune.ipynb)
```

### 3. Buka Google Colab

1. Buka [colab.research.google.com](https://colab.research.google.com)
2. `File → Upload notebook → fine_tune.ipynb`
3. `Runtime → Change runtime type → T4 GPU`
4. Jalankan cell satu per satu dari atas ke bawah

### 4. Training (5 epoch, ~30-60 menit)

| Dataset size | Training time |
|-------------|---------------|
| 500 samples | ~20 menit |
| 1000 samples | ~40 menit |
| 5000 samples | ~3 jam |

### 5. Download Model

Setelah training selesai (Cell 8), model otomatis tersimpan di:
```
Google Drive/disease-nlp/model/
```

Download folder `model/` ke lokal.

### 6. Deploy ke Server

```bash
# Di WSL
mkdir -p services/nlp-python/models/fine-tuned

# Copy file model dari hasil download ke folder tersebut
# Misal file ada di /mnt/c/Users/.../Downloads/model/
cp -r /mnt/c/Users/.../Downloads/model/* services/nlp-python/models/fine-tuned/

# Set env dan rebuild
echo "NLP_MODEL=fine-tuned" >> .env
docker compose up -d nlp-python
```

### 7. Verifikasi

```bash
curl -s -X POST http://localhost:8001/nlp/analyze \
  -H "Content-Type: application/json" \
  -d '{"text":"50 warga Jakarta terkena DBD"}' | python3 -m json.tool
```

Akurasi jauh lebih tinggi dari zero-shot.

### Fine-Tuning Tips

| Tips | Keterangan |
|------|------------|
| **Data quality > quantity** | 200 sample bagus lebih baik dari 1000 sample berisik |
| **Balance classes** | Pastikan tiap penyakit punya minimal 20 sampel |
| **NEGATIVE class penting** | Sertakan berita non-kesehatan agar model bisa membedakan |
| **Max 5 epoch** | Lebih dari 5 epoch bisa overfit untuk dataset kecil |
| **Batch size 16** | Cukup untuk T4 GPU 16GB VRAM |
| **Notebook shortcut** | Runtime → Run all → selesai |
