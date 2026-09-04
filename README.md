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

Walkthrough implementasi agent WHO ICD-11, fallback DeepSeek/OpenAI, disease
mentions, dan verifikasi hasil tersedia di
[`docs/ICD11_AGENT_WALKTHROUGH.md`](docs/ICD11_AGENT_WALKTHROUGH.md).

## Frontend Pages

Semua halaman diakses via prefix **`/nlp/`** (Next.js basePath).

| Route | Fitur |
|-------|-------|
| `/` | Dashboard publik fullscreen: KPI tren bulanan, filter negara/tahun, EWS, peta spasial, grafik, tabel lokasi, dan ringkasan AI lokal |
| `/tv` | Command-center fullscreen untuk pemantauan outbreak; KPI memakai tren bulan berjalan yang sama dengan `/nlp/`, sedangkan peta dan analitik menampilkan snapshot tahun terpilih |
| `/analyze` | Analisis URL: main content bersih, translasi lokal, detail NLP, sumber lengkap, dan peta |
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
| `GET` | `/api/v1/public-dashboard?country=&year=` | Snapshot dashboard publik terfilter, tahun tersedia, detail sumber, dan EWS |
| `POST` | `/api/auth/login` | Login admin; guest tetap dapat mengakses dashboard publik |
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

**Definisi angka dashboard:** `kpis` adalah snapshot akumulasi tahun dan filter
yang dipilih, sedangkan `trends.*.current` adalah bulan berjalan dan
`trends.*.previous` adalah bulan sebelumnya. Kartu KPI pada `/nlp/` dan
`/nlp/tv` menggunakan `trends.*.current`; data snapshot pada peta, grafik, dan
panel analitik menggunakan `kpis`/agregasi tahunan. URL yang sama hanya dihitung
satu kali setelah proses NLP ulang.

### NLP API Internal (:8001)

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/health` | Health + model info |
| `POST` | `/nlp/analyze` | Analisis teks → disease + sentiment + event_type |
| `GET` | `/labels` | Lihat labels saat ini |
| `PUT` | `/labels` | Update disease labels |
| `PUT` | `/labels/sentiment` | Update sentiment labels |

## NLP Pipeline

### Pengambilan main content dan bahasa non-Latin

- Collector mencoba HTTP biasa terlebih dahulu dan memakai Scrapling/stealth
  sebagai fallback untuk situs yang memblokir scraper atau memakai Cloudflare.
- Trafilatura dan pembersihan DOM membuang menu, footer, iklan, rekomendasi,
  script, style, serta boilerplate. Hanya judul, tanggal publikasi, dan main
  content yang diteruskan ke NLP.
- Analisis URL menggunakan jalur ekstraksi yang sama agar hasil manual dan
  collector konsisten.
- Aksara Thai, Khmer, Lao, Myanmar, dan bahasa non-Latin lain diterjemahkan
  menggunakan NLLB-200 lokal. Model dan classifier dimuat saat service startup,
  bukan pada request pertama. Hasil terjemahan disimpan di cache.
- DeepSeek hanya fallback akurasi jika resolusi lokal gagal; jalur normal tidak
  membutuhkan API berbayar.
- Angka kasus/kematian dan lokasi diperiksa terhadap teks asli agar terjemahan
  tidak mengubah nilai faktual.
- Lokasi di luar 11 negara ASEAN tetap disimpan sebagai wilayah aslinya,
  sedangkan nama country untuk filter/API dinormalisasi menjadi `OUTSIDE ASEAN`.
- Jika penyakit akhir tidak dapat dipetakan (`UNKNOWN`), event tetap disimpan
  untuk audit tetapi `is_health_related` menjadi `FALSE`.

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

### Aturan data dashboard dan EWS

- Dashboard umum menerima event kesehatan dengan `published_at` valid,
  penyakit dikenal, bukan label `UNKNOWN/NEGATIVE`, dan confidence minimal
  `0.15`. Event non-outbreak tetap tampil dengan status `NORMAL`.
- `created_at` tidak pernah dipakai sebagai pengganti `published_at`; artikel
  lama yang baru dikoleksi tidak boleh terlihat sebagai kejadian baru.
- URL duplikat dihitung sekali. Master lokasi juga dipilih satu baris agar
  agregasi tidak berlipat.
- EWS lebih ketat: confidence minimal `0.35`, koordinat lokasi harus tersedia,
  tanggal publikasi valid, dan event harus melewati aturan outbreak penyakit.
- Dropdown tahun berasal dari tahun yang benar-benar memiliki data valid.
- Card EWS dan tabel lokasi dapat dibuka untuk melihat detail analisis, main
  content bersih, nama/tipe sumber, dan URL lengkap ke tab baru.
Input Text → Keyword Extraction (DISEASE_DICT / SYMPTOM_DICT dari DB)
           → Jika keyword cocok → Model klasifikasi
           → Jika penyakit tidak dikenali → UNKNOWN, is_health_related=False
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

### Analisis URL dan aturan outbreak

`POST /api/v1/analyze-url` mengambil main content yang sudah dibersihkan oleh
collector, membaca negara dari konteks URL/teks, serta mengambil `published_at`
dari metadata publikasi artikel. Report tingkat nasional disimpan sebagai nama
negara, bukan dipaksa menjadi ibu kota. Negara non-ASEAN diberi scope
`OUTSIDE ASEAN`.

Angka kumulatif, suspek, estimasi, proyeksi, artikel kebijakan, program
pencegahan, dan statistik nasional tidak otomatis menjadi outbreak. `outbreak_alert`
hanya aktif jika ada sinyal kejadian eksplisit seperti outbreak/wabah/KLB,
cluster/klaster, transmisi lokal, atau lonjakan yang terkait kasus; penyakitnya
juga harus berhasil dipetakan. Nilai `-`/`n/a` tetap diperlakukan sebagai data
tidak tersedia, bukan nol.

### Re-analysis Data Health Lama

Untuk menerapkan aturan NLP, WHO ICD-11, lokasi, dan deteksi outbreak terbaru
ke data yang sudah tersimpan, gunakan command berikut. Proses ini membaca
`disease_events.original_text` dan tidak mengambil ulang URL sumber.

Pastikan service NLP aktif dan image worker sudah dibuild setelah update kode:

```bash
docker compose build disease-worker-python
docker compose up -d disease-nlp-python
```

Jalankan simulasi terlebih dahulu tanpa mengubah database:

```bash
sh scripts/reanalyze_health.sh --dry-run --limit 20
```

Secara default command ini juga mencoba menemukan istilah pada event `UNKNOWN`,
memvalidasinya ke WHO ICD-11, menyimpan konsep yang valid, lalu me-reload
runtime NLP sebelum analisis event. Batasi pemindaian WHO dengan
`--who-limit 500`, atau gunakan `--skip-who-sync` jika hanya ingin mengulang
inferensi dari konsep yang sudah ada.

Jika hasil sudah sesuai, proses seluruh event dengan `is_health_related = TRUE`:

```bash
sh scripts/reanalyze_health.sh --batch-size 50
```

Opsi yang tersedia:

```bash
# Batasi jumlah data yang diproses
sh scripts/reanalyze_health.sh --limit 100

# Lewati data awal berdasarkan urutan created_at/id
sh scripts/reanalyze_health.sh --offset 1000 --batch-size 50

# Hentikan seluruh proses jika satu data gagal
sh scripts/reanalyze_health.sh --stop-on-error
```

Untuk compose production, gunakan nama service worker production:

```bash
COMPOSE_FILE=docker-compose-prod.yml \
WORKER_SERVICE=worker-python \
sh scripts/reanalyze_health.sh --dry-run --limit 20
```

Untuk STG/production yang menggunakan `docker-compose.yml` dengan service
`worker-python`, jalankan re-analysis seluruh data tanpa batas jumlah event:

```bash
COMPOSE_FILE=docker-compose.yml   WORKER_SERVICE=worker-python sh scripts/reanalyze_health.sh --batch-size 50
```

Jika container `disease-worker-python` sudah berjalan, gunakan command berikut
agar tidak membuat container worker sementara. Sinkronisasi DeepSeek/WHO
dilewati dan seluruh event health diproses:

```bash
docker exec disease-worker-python \
  python -m app.reanalyze_health \
  --skip-who-sync \
  --batch-size 50 \
  --stop-on-error
```

Setiap event diperbarui dalam transaksi terpisah. Jika satu event gagal,
event lainnya tetap diproses; gunakan `--stop-on-error` jika diperlukan.

Catatan: hasil dengan `disease_classification = UNKNOWN` tetap disimpan untuk
audit, tetapi otomatis diberi `is_health_related = FALSE` dan tidak dihitung
sebagai data health maupun outbreak. Aturan ini berlaku untuk collector,
worker, `analyze-url`, dan re-analysis.

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

Untuk deployment production, gunakan compose yang menyertakan RabbitMQ:

```bash
make prod-up
```

Pipeline fine-tuning yang menangani dataset besar dan self-training bulanan
tersedia di [`docs/PRODUCTION_TRAINING.md`](docs/PRODUCTION_TRAINING.md),
[`scripts/train_classifier.py`](scripts/train_classifier.py), dan notebook
[`notebooks/fine_tune_production.ipynb`](notebooks/fine_tune_production.ipynb).
Trigger command:

```bash
make retrain-dry-run
make retrain
```

### Cara training model

1. Pasang dependency training pada host atau Google Colab:

```bash
python3 -m pip install -r scripts/requirements-training.txt
```

2. Ekspor dataset tervalidasi secara streaming. Jangan memakai password contoh;
   isi URL database dari secret environment host:

```bash
export TRAINING_DATABASE_URL='postgres://USER:PASSWORD@HOST:PORT/disease_ai'
python3 scripts/export_training_data.py \
  --output-dir /tmp/disease-training \
  --min-confidence 0.90 \
  --max-per-label 100000
```

Jika database hanya dapat diakses dari jaringan Docker STG dan container
`disease-worker-python` sudah berjalan, jalankan dari folder training dan
ambil script dari repository aplikasi:

```bash
cd ~/docker/nlp-penyakit-training

EXPORT_DIR="disease-training-$(date +%Y%m%d-%H%M%S)"

docker exec -i disease-worker-python \
  python - --all-years \
  --output-dir "/tmp/${EXPORT_DIR}" \
  --min-confidence 0.85 \
  --max-per-label 100000 \
  < ../nlp-penyakit-git/scripts/export_training_data.py

mkdir -p "$EXPORT_DIR"
docker cp \
  "disease-worker-python:/tmp/${EXPORT_DIR}/." \
  "$EXPORT_DIR/"

cat "$EXPORT_DIR/manifest.json"
wc -l "$EXPORT_DIR"/train.jsonl "$EXPORT_DIR"/test.jsonl
```

Upload `train.jsonl`, `test.jsonl`, dan `manifest.json` ke folder Google Drive
`disease-nlp/all-years/` sebelum membuka notebook fine-tuning.

Untuk membuat satu paket Colab lengkap dari STG, termasuk notebook dan script
training:

```bash
cd /home/nlpdev/docker/nlp-penyakit-training

REPO_DIR="/home/nlpdev/docker/nlp-penyakit-git"
PACKAGE_DIR="colab_export"
EXPORT_DIR="disease-training-$(date +%Y%m%d-%H%M%S)"

mkdir -p "$PACKAGE_DIR/all-years" "$PACKAGE_DIR/scripts"

cp "$REPO_DIR/training/fine_tune.ipynb" \
  "$PACKAGE_DIR/fine_tune.ipynb"

cp "$REPO_DIR/scripts/train_classifier.py" \
  "$PACKAGE_DIR/scripts/train_classifier.py"

docker exec -i disease-worker-python \
  python - --all-years \
  --output-dir "/tmp/${EXPORT_DIR}" \
  --min-confidence 0.85 \
  --max-per-label 100000 \
  < "$REPO_DIR/scripts/export_training_data.py"

docker cp \
  "disease-worker-python:/tmp/${EXPORT_DIR}/." \
  "$PACKAGE_DIR/all-years/"

cat "$PACKAGE_DIR/all-years/manifest.json"
```

Paket siap upload ke Google Drive sebagai folder `disease-nlp/`:

```text
colab_export/
├── fine_tune.ipynb
├── all-years/
│   ├── train.jsonl
│   ├── test.jsonl
│   └── manifest.json
└── scripts/
```

3. Latih kandidat XLM-RoBERTa (gunakan GPU/Colab untuk dataset besar):

```bash
python3 scripts/train_classifier.py \
  --train /tmp/disease-training/train.jsonl \
  --eval /tmp/disease-training/test.jsonl \
  --label-field disease \
  --model-name xlm-roberta-base \
  --output-dir /tmp/disease-model \
  --epochs 3 \
  --train-batch-size 16 \
  --gradient-accumulation-steps 2 \
  --fp16
```

4. Untuk pipeline otomatis production, selalu mulai dengan dry-run:

```bash
python3 scripts/retrain_from_db.py --dry-run
python3 scripts/retrain_from_db.py \
  --task disease \
  --min-confidence 0.90 \
  --min-macro-f1 0.80 \
  --min-eval-samples 100 \
  --max-steps 30000 \
  --fp16 \
  --restart-service
```

Kandidat hanya dipromosikan jika evaluasi memenuhi ambang macro-F1. Model lama
disimpan untuk rollback. Rincian Colab, self-training bulanan, dataset besar,
dan deploy release tersedia di
[`docs/PRODUCTION_TRAINING.md`](docs/PRODUCTION_TRAINING.md).

### Cron training otomatis

Siapkan virtualenv dan dependency sekali saja:

```bash
cd /home/mci/app/SCRIPT/NLP
python3 -m venv .venv-training
.venv-training/bin/pip install -r scripts/requirements-training.txt
```

Simpan credential training di luar repository:

```bash
sudo install -m 600 /dev/null /etc/disease-nlp-training.env
sudo editor /etc/disease-nlp-training.env
```

Isi minimal file tersebut (ganti nilainya sesuai server):

```bash
TRAINING_DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/disease_ai
TRAINING_MIN_CONFIDENCE=0.90
TRAINING_MAX_PER_LABEL=100000
TRAINING_MIN_MACRO_F1=0.80
TRAINING_MIN_EVAL_SAMPLES=100
```

Buka crontab user deployment dengan `crontab -e`, lalu tambahkan:

```cron
# Dry-run setiap Minggu pukul 01:30 untuk memeriksa kesiapan dataset
30 1 * * 0 cd /home/mci/app/SCRIPT/NLP && /usr/bin/flock -n /tmp/disease-nlp-training.lock /usr/bin/env bash -lc 'set -a; source /etc/disease-nlp-training.env; set +a; .venv-training/bin/python scripts/retrain_from_db.py --dry-run >> /var/log/disease-nlp-training-dry-run.log 2>&1'

# Training tanggal 1 setiap bulan pukul 02:00; promosi/restart hanya jika evaluasi lolos
0 2 1 * * cd /home/mci/app/SCRIPT/NLP && /usr/bin/flock -n /tmp/disease-nlp-training.lock /usr/bin/env bash -lc 'set -a; source /etc/disease-nlp-training.env; set +a; .venv-training/bin/python scripts/retrain_from_db.py --task disease --min-confidence 0.90 --max-per-label 100000 --min-macro-f1 0.80 --min-eval-samples 100 --max-steps 30000 --fp16 --restart-service >> /var/log/disease-nlp-training.log 2>&1'
```

Catatan operasional:

- Jalankan command dry-run secara manual sebelum mengaktifkan cron.
- Pastikan user cron memiliki akses Docker jika memakai `--restart-service`.
- Hapus `--fp16` bila training hanya menggunakan CPU.
- Pantau log dengan `tail -f /var/log/disease-nlp-training.log`.
- `flock` mencegah job baru dimulai jika training sebelumnya belum selesai.
- Jangan menyimpan credential database di crontab atau repository.

Retraining hanya menggunakan data ber-confidence tinggi, mengevaluasi kandidat
terlebih dahulu, dan menyimpan model lama untuk rollback.

### Bootstrap Data Multilingual dari Data Existing

Data existing dapat dipakai untuk mengisi konsep penyakit, alias multilingual,
dan training examples tanpa input manual. Jalankan migration `021` terlebih
dahulu, kemudian:

```bash
python3 scripts/bootstrap_multilingual_data.py --dry-run
python3 scripts/bootstrap_multilingual_data.py --no-llm

# Optional: normalisasi alias dan report UNKNOWN dengan DeepSeek
DEEPSEEK_API_KEY=... python3 scripts/bootstrap_multilingual_data.py
```

Untuk mengisi kode canonical WHO ICD-11 MMS secara otomatis, tambahkan
`WHO_ICD_CLIENT_ID` dan `WHO_ICD_CLIENT_SECRET`. Script menggunakan OAuth
client-credentials WHO, mencari istilah pada linearization MMS, dan menyimpan
kode/URI hanya jika WHO mengembalikan hasil yang valid. Jika kredensial WHO
tidak tersedia, `ontology_code` dibiarkan kosong—tidak pernah ditebak.

Script bersifat idempotent dan tidak menghapus data lama. Bootstrap memproses
`raw_reports`, `disease_events`, `nlp_labels`, dan `nlp_keywords` yang sudah ada
serta melakukan resolusi istilah ke WHO ICD-11. Bootstrap tidak membutuhkan
DeepSeek.

Hasil otomatis disimpan di `disease_concepts`, `disease_aliases`, dan
`nlp_training_examples`. `disease_concepts.english_name`, `ontology_code`, dan
`ontology_uri` berasal dari WHO bila istilah berhasil ditemukan. DeepSeek hanya
dipanggil oleh NLP runtime sebagai fallback saat laporan belum dapat dipetakan;
hasilnya harus cocok dengan concept WHO yang sudah ada.

### Melengkapi Penyakit UNKNOWN dari WHO

Jika report memiliki `disease_classification = UNKNOWN`, gunakan importer berikut
untuk menemukan nama penyakit yang tertulis dan memvalidasinya ke WHO ICD-11.
DeepSeek hanya dipakai untuk mengambil surface name; canonical name, kode, dan
URI selalu berasal dari WHO. Pastikan `DEEPSEEK_API_KEY`,
`WHO_ICD_CLIENT_ID`, dan `WHO_ICD_CLIENT_SECRET` tersedia di `.env`.

Uji kasus tertentu tanpa menulis database:

```bash
sh scripts/sync_who_unknowns.sh --term Ebola --dry-run
```

Jika hasilnya benar, simpan konsep WHO tersebut:

```bash
sh scripts/sync_who_unknowns.sh --term Ebola
```

Untuk memindai report UNKNOWN secara otomatis:

```bash
sh scripts/sync_who_unknowns.sh --limit 500 --dry-run
sh scripts/sync_who_unknowns.sh --limit 500
```

Secara default hanya UNKNOWN yang sudah berstatus non-health yang dipindai.
Gunakan `--include-health` untuk data lama yang masih memiliki kombinasi
`UNKNOWN` dan `is_health_related = TRUE`:

```bash
sh scripts/sync_who_unknowns.sh --include-health --limit 500 --dry-run
```

Setelah konsep baru masuk, restart NLP agar cache konsep WHO dan keyword
dimuat ulang:

```bash
docker compose up -d --force-recreate disease-nlp-python
```

Untuk production, gunakan `COMPOSE_FILE=docker-compose-prod.yml` dan
`WORKER_SERVICE=worker-python`.

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

# Migration database berjalan otomatis saat backend startup.
# Model translasi dan classifier dipreload saat NLP startup; tunggu status sehat.
docker compose ps

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

## SKDR EBS dan IBS

Collector SKDR EBS dan IBS berjalan otomatis setiap hari pukul 00:00 WIB.
IBS adalah label aplikasi untuk endpoint teknis `/api/Alert`. Credential API
harus disimpan hanya di `.env` lokal pada host/container collector:

```env
SKDR_USER_KEY=isi_user_key_lokal
SKDR_FETCH_TIME=00:00
COLLECTOR_TIMEZONE=Asia/Jakarta
```

Jam dapat diubah tanpa mengubah database, misalnya `SKDR_FETCH_TIME=23:30`.
Setelah mengubah `.env`, recreate collector agar scheduler membaca konfigurasi
baru:

```bash
docker compose up -d --force-recreate disease-collector-python
```

Dengan `SKDR_RUN_ON_START=true`, collector menjalankan sinkronisasi SKDR
sekali setelah startup. Jika endpoint belum memiliki data, Alert melakukan
backfill minggu pertama sampai minggu terakhir; restart berikutnya hanya
menjalankan sinkronisasi minggu terbaru sesuai konfigurasi.

Aktifkan dua source SKDR setelah key terisi agar scheduler tengah malam
menjalankannya:

```bash
docker exec db-postgres psql -U postgres -d disease_ai -c \
  "UPDATE collector_sources SET enabled=TRUE, updated_at=NOW() WHERE source_type='skdr_api';"
```

Jalankan sinkronisasi manual dari container collector:

```bash
docker exec disease-collector-python \
  python -m app.skdr_sync \
  --endpoint all \
  --year 2026
```

Backfill Alert dari minggu pertama sampai minggu terakhir:

```bash
docker exec disease-collector-python \
  python -m app.skdr_sync \
  --endpoint ibs \
  --year 2026 \
  --from-week 1 \
  --to-week latest
```

Simulasi tanpa insert database atau publish RabbitMQ:

```bash
docker exec disease-collector-python \
  python -m app.skdr_sync \
  --endpoint all \
  --year 2026 \
  --dry-run
```

Collector menggunakan request berurutan, jeda, retry exponential backoff,
dukungan `Retry-After`, dan deduplikasi lintas endpoint EBS/Alert.
