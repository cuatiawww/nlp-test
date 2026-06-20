# Disease Surveillance AI

**Multilingual NLP Disease Monitoring** — Platform deteksi, klasifikasi, dan pemantauan wabah penyakit dari berita online, RSS, dan laporan kesehatan. Fokus wilayah ASEAN.

## Arsitektur

```
┌──────────┐     ┌──────────┐     ┌───────────┐
│ Frontend │     │  Rust    │     │ Collector │
│ Next.js  │◀───▶│ Backend  │◀────│  Python   │
│ :3010    │     │ :8081    │     │ :8002     │
│ /nlp/*   │     └────┬─────┘     └─────┬─────┘
└──────────┘          │                 │ RabbitMQ
                      │         ┌───────▼──────┐
              ┌───────▼──────┐  │    Worker    │
              │  PostgreSQL  │  │   Python     │
              │  + PostGIS   │◀─│   Consumer   │
              │  :9876       │  └───────┬──────┘
              └──────────────┘          │
                                ┌───────▼──────┐
                                │  NLP Python  │
                                │ fine-tuned + │
                                │ zero-shot    │
                                │ :8001        │
                                └──────────────┘
```

## Services

| Service | Port Host | Fungsi |
|---------|-----------|--------|
| `frontend-next` | 3010 | Dashboard Next.js (basePath `/nlp`) |
| `backend-rust` | 8081 | REST API CRUD + proxy ke collector |
| `nlp-python` | 8001 | NLP: disease classification + sentiment + event type |
| `worker-python` | — | Async consumer: RabbitMQ → NLP → DB |
| `collector-python` | — | RSS, Web scraper, CSV ingest → publish ke queue |
| `postgres` | 9876 | PostgreSQL 16 + PostGIS |
| `minio` | 9002/9003 | Object storage dokumen mentah |
| `rabbitmq` | 5672/15672 | Message queue |

## Quick Start

```bash
cp .env.example .env
# Edit .env sesuai lingkungan

docker compose up -d --build

# Seed user webmaster
docker compose --profile init run --rm init

# Jalankan migration DB (lokasi + credibility + column fix)
docker compose exec -T postgres psql -U postgres -d disease_ai < database/init/011_locations.sql
docker compose exec -T postgres psql -U postgres -d disease_ai < database/init/012_source_credibility.sql
docker compose exec -T postgres psql -U postgres -d disease_ai -c "ALTER TABLE disease_events ALTER COLUMN relevance_score TYPE TEXT;"
```

Akses: **http://localhost:3010/nlp/**

## Frontend Pages

Semua halaman diakses via prefix **`/nlp/`** (Next.js basePath).

| Route | Fitur |
|-------|-------|
| `/` | Dashboard: KPI cards + summary table |
| `/sources` | CRUD sumber data (modal popup), Trigger per-source + Trigger All |
| `/events` | Data events hasil NLP — filter Semua/Health/Non Health, search, pagination angka, kolom Diproses |
| `/nlp-keywords` | CRUD keyword dictionary (symptom/disease), search, pagination, modal popup |
| `/nlp-labels` | CRUD label classification (disease/event_type/sentiment/relevance), modal popup |
| `/outbreak-rules` | CRUD ambang batas wabah per penyakit, modal popup |
| `/locations` | CRUD koordinat lokasi (digunakan NLP untuk geolokasi) |
| `/source-credibility` | CRUD skor kredibilitas per tipe sumber |
| `/users` | Manajemen user, modal popup |
| `/processing` | Monitoring real-time: queue depth, collector runs, auto-refresh 10 detik |

Semua halaman CRUD menggunakan **modal popup** (bukan inline form). Semua tabel punya **search** + **pagination** (20 per halaman).

## API Documentation

### Backend API (:8081) — melalui Next.js proxy (`/nlp/api/*`)

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/health` | Health check |
| `POST` | `/api/v1/ingest` | Submit teks → antrian async |
| `GET` | `/api/v1/events` | List events + pagination + filter |
| `POST` | `/api/v1/sources` | CRUD sumber data |
| `GET` | `/api/v1/sources?q=cari&page=1&per_page=20` | List sumber + search + pagination |
| `DELETE` | `/api/v1/sources/{id}` | Hapus sumber |
| `POST` | `/api/v1/sources/{id}/collect` | Trigger collect satu sumber |
| `POST` | `/api/v1/sources/collect-all` | Trigger ALL sources (fire-and-forget) |
| `GET` | `/api/v1/runs?source_id=&page=&per_page=` | Riwayat collector runs |
| `GET/POST/PUT/DELETE` | `/api/v1/locations` | CRUD lokasi |
| `GET/POST/PUT/DELETE` | `/api/v1/source-credibility` | CRUD skor kredibilitas |
| `GET/POST/PUT` | `/api/v1/nlp-labels` | CRUD label NLP |
| `GET/POST/PUT` | `/api/v1/nlp-keywords` | CRUD keyword NLP |
| `GET/POST` | `/api/v1/outbreak-rules` | CRUD aturan wabah |
| `POST` | `/api/v1/data/cleanup-events` | Hapus semua events |

**Pagination response:**
```json
{
  "success": true,
  "data": [...],
  "total": 150,
  "page": 1,
  "per_page": 20,
  "total_pages": 8
}
```

### NLP API Internal (:8001)

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/health` | Health + model info |
| `POST` | `/nlp/analyze` | Analisis teks → disease + sentiment + event_type |
| `GET` | `/labels` | Lihat labels saat ini |
| `PUT` | `/labels` | Update disease labels |
| `PUT` | `/labels/sentiment` | Update sentiment labels |

## NLP Pipeline

### Arsitektur Model

| Mode | Model Digunakan | Fungsi |
|------|----------------|--------|
| `fine-tuned` | Fine-tuned XLM-RoBERTa | **Disease classification** |
| `fine-tuned` | XLM-RoBERTa (zero-shot) | Sentiment, Event Type, Relevance |
| `xlm-roberta` | XLM-RoBERTa (zero-shot) | Semua klasifikasi |
| `indobert` | IndoBERT (zero-shot) | Semua klasifikasi (ID only) |

Konfigurasi model di `docker-compose.yml`:
```yaml
environment:
  - NLP_MODEL=fine-tuned   # default: fine-tuned untuk disease, zero-shot untuk lainnya
```

### Alur Pipeline

```
Input Text → Keyword Extraction (DISEASE_DICT / SYMPTOM_DICT dari DB)
           → Jika keyword cocok → Model klasifikasi
           → Jika tidak → UNKNOWN, is_health_related=False, confidence rendah
           → Hitung outbreak alert dari DB rules
           → Hitung source credibility dari DB
```

### DB-Driven Configuration (semua bisa diedit via frontend)

| Item | Tabel DB | Halaman Frontend |
|------|----------|------------------|
| Disease labels | `nlp_labels` | `/nlp/nlp-labels` |
| Event type labels | `nlp_labels` | `/nlp/nlp-labels` |
| Sentiment labels | `nlp_labels` | `/nlp/nlp-labels` |
| Relevance labels | `nlp_labels` | `/nlp/nlp-labels` |
| Symptom keywords | `nlp_keywords` | `/nlp/nlp-keywords` |
| Disease keywords | `nlp_keywords` | `/nlp/nlp-keywords` |
| Outbreak rules | `disease_outbreak_rules` | `/nlp/outbreak-rules` |
| Location coordinates | `locations` | `/nlp/locations` |
| Source credibility | `source_credibility` | `/nlp/source-credibility` |

## Data Flow

### Collection Pipeline
```
Scheduler / Trigger → Collector (RSS feed) → Upload ke MinIO
                                           → Publish ke RabbitMQ
                                           ↓
Worker consume → POST /nlp/analyze
              → INSERT disease_events (health / non-health)
              → UPDATE raw_reports status
```

### Async Ingest (default)
```
POST /api/v1/ingest → INSERT raw_reports (NEW)
                    → Publish RabbitMQ → Return "queued"
                    ↓
Worker → NLP → INSERT disease_events
```

### Sync Ingest (fallback — jika RabbitMQ down)
```
POST /api/v1/ingest → INSERT raw_reports
                    → POST /nlp/analyze langsung
                    → INSERT disease_events
                    → Return "processed_sync"
```

## Environment Variables

| Variable | Default | Deskripsi |
|----------|---------|-----------|
| `NLP_MODEL` | `fine-tuned` | `fine-tuned`, `xlm-roberta`, `indobert`, `none` |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3010/nlp` | Base URL frontend (build-time) |
| `BACKEND_PORT` | `8081` | Port Rust backend |
| `DATABASE_URL` | `postgres://postgres:root@postgres:5432/disease_ai` | PostgreSQL |
| `RABBITMQ_URL` | `amqp://guest:guest@rabbitmq:5672/%2f` | RabbitMQ |
| `COLLECTOR_URL` | `http://collector-python:8002` | Collector service |
| `LOW_CONFIDENCE_THRESHOLD` | `0.5` | Threshold `needs_review` |

## Fine-Tuning Model

Lihat `FINE_TUNING_PLAN.md` untuk panduan fine-tuning lengkap.

### Deploy Model ke Server

```bash
# Copy model files
mkdir -p services/nlp-python/models/fine-tuned
cp -r /path/to/model/* services/nlp-python/models/fine-tuned/

# Rebuild NLP service
docker compose build nlp-python && docker compose up -d nlp-python

# Verifikasi
curl -s http://localhost:8001/health | python3 -m json.tool
```

## Docker Management

```bash
# Build & start
docker compose up -d --build

# Build & start service tertentu
docker compose build frontend-next && docker compose up -d frontend-next

# Logs
docker compose logs -f backend-rust
docker compose logs -f worker-python

# Restart
docker compose restart backend-rust

# Stop
docker compose down
```

## Troubleshooting

### Model download gagal / lambat
Model XLM-RoBERTa (~1.1GB) di-download otomatis saat startup pertama. Cache di `services/nlp-python/models/`. Hapus folder untuk reset.

### Trigger All error 405 / timeout
Pastikan backend sudah rebuild dengan route `collect-all`. Cek log:
```bash
docker compose logs backend-rust --tail 10
```

### Data event tidak muncul
Cek queue dan worker:
```bash
curl -s http://guest:password@localhost:15672/api/queues/%2f/disease.raw
docker compose logs worker-python --tail 20
```

### Port bentrok
Ubah port di docker-compose.yml, update .env sesuai.
