# Panduan Framework dan Pipeline NLP Disease Surveillance AI

Dokumen ini menjelaskan sistem yang berjalan di repository ini: framework,
fungsi setiap service, alur data dari sumber sampai dashboard, konfigurasi,
serta batasan yang perlu diketahui saat mengembangkan atau debugging.

> Status dokumen: dokumentasi as-is berdasarkan source code dan konfigurasi
> repository. README lama menyebut port NLP 8001, tetapi Docker saat ini
> menggunakan port internal 8000.

## 1. Gambaran besar

~~~text
RSS / Website / Social CSV / SKDR API
                 |
                 v
       collector-python (Python)
        - extract / normalize
        - MinIO raw document
        - RabbitMQ message
                 |
                 v
       RabbitMQ queues (durable)
                 |
                 v
       worker-python (Python)
        - consume message
        - panggil NLP service
        - simpan raw_reports + disease_events
                 |
                 v
       PostgreSQL 16 + PostGIS
                 ^
                 |
       backend-rust (REST API, Axum)
                 ^
                 |
       frontend-next (Next.js /nlp)
~~~

Prinsip utama:

1. Collector bukan NLP. Collector mengambil dan menyiapkan data; worker
   menjalankan proses NLP melalui service NLP.
2. raw_reports adalah bahan mentah dan status proses. disease_events adalah
   hasil analisis yang dipakai dashboard.
3. RabbitMQ memisahkan pengambilan dan analisis. Jika NLP lambat, data menunggu
   di queue dan collector tidak perlu menunggu hasil analisis.
4. Dashboard membaca database melalui backend, bukan website sumber secara
   langsung.
5. AI agent tidak boleh membuat kode ICD-11 sendiri. Agent membantu menemukan
   istilah; kode resmi harus divalidasi WHO ICD-11 atau konsep lokal.

## 2. Framework dan alat

| Lapisan | Teknologi | Pemakaian |
|---|---|---|
| Container | Docker Compose | Menjalankan seluruh service |
| Frontend | Next.js 15.1.3, React 19, TypeScript | Dashboard, TV, admin, proxy API |
| UI | Tailwind CSS 3.4, Lucide React | Styling dan icon |
| Map | OpenLayers 10.10, ol-wind | Map ASEAN, marker, polygon, wind |
| Chart | Recharts 2.15 | Grafik tren dan distribusi |
| State | React state, Zustand 5 | State halaman, bahasa, auth, filter |
| Backend | Rust, Axum 0.7, Tokio | REST API, query, auth, trigger |
| Database driver | tokio-postgres, deadpool-postgres | Pool dan query PostgreSQL |
| Queue | lapin (Rust), pika (Python) | Publish/consume RabbitMQ |
| NLP API | FastAPI 0.115.6, Pydantic 2.10 | Endpoint analisis |
| NLP model | Transformers 4.47, PyTorch 2.5 | XLM-RoBERTa, IndoBERT, fine-tuned |
| Translation | NLLB-200 lokal opsional | Translation view; bukan sumber evidence |
| Scraping | Scrapling, Trafilatura, BeautifulSoup, lxml | Fetch dan main-content extraction |
| Feed | feedparser | Membaca RSS |
| Storage | MinIO | Raw document dan asset |
| Spatial DB | PostgreSQL + PostGIS | Geometry dan spatial index |
| Scheduler | APScheduler | Jadwal collector dan SKDR |
| Training | Transformers, NumPy, notebook/Colab | Fine-tuning dan evaluasi |

### Port service Docker

| Service | Port | Fungsi |
|---|---:|---|
| disease-frontend-next | host 3010 → container 3000 | Web Next.js |
| disease-backend-rust | 8081 | REST API utama |
| disease-nlp-python | internal 8000 | Analisis NLP |
| disease-collector-python | internal 8002 | Collector dan URL extractor |
| disease-worker-python | none | Consumer RabbitMQ |
| disease-rabbitmq | 5672, management 15672 | Message broker |
| disease-minio | 9000, console 9001 | Object storage |
| PostgreSQL | sesuai DATABASE_URL | Database utama |

## 3. Fungsi setiap service

### frontend-next

Source berada di services/frontend-next/. Next.js memakai App Router dan
basePath /nlp. Route utama:

- /nlp/ — dashboard publik;
- /nlp/tv — command-center fullscreen;
- /nlp/analyze — analisis satu URL;
- /nlp/events — event hasil NLP;
- /nlp/processing — monitoring queue dan collector;
- /nlp/sources, /nlp/locations, /nlp/nlp-labels, /nlp/nlp-keywords —
  konfigurasi;
- /nlp/outbreak-rules dan /nlp/source-credibility — rules dan kualitas sumber.

lib/api.ts memanggil backend. Rewrite Next.js meneruskan /api/* ke
disease-backend-rust:8081, sehingga browser tidak perlu mengetahui alamat
internal backend.

### backend-rust

Backend Rust adalah pintu utama sistem. Axum menangani routing, Tokio menangani
runtime asynchronous, dan deadpool-postgres menyediakan connection pool.

Tugasnya menerima ingest dan analisis URL, membaca event/dashboard/tren/heatmap,
men-trigger collector, menyediakan CRUD konfigurasi, auth/admin guard, audit
log, ringkasan IBS/EBS, serta publish pekerjaan asynchronous ke RabbitMQ.

Endpoint penting:

| Endpoint | Kegunaan |
|---|---|
| GET /health | Health check |
| POST /api/v1/ingest | Masukkan teks/artikel ke pipeline |
| POST /api/v1/analyze-url | Fetch dan analisis satu URL |
| GET /api/v1/events | Event dengan filter dan pagination |
| GET /api/v1/public-dashboard | KPI, tren, lokasi, penyakit, sumber |
| GET /api/v1/crawling-stats | Statistik crawling dan NLP |
| GET /api/v1/spatial-heatmap | Agregasi spasial |
| GET /api/v1/disease-trend-overview | Tren penyakit |
| GET /api/v1/morbidity-mortality | Kasus dan kematian |
| GET /api/v1/skdr/ibs-summary | Ringkasan IBS |
| GET /api/v1/skdr/ebs-summary | Ringkasan EBS |
| GET/POST/PUT/DELETE /api/v1/... | CRUD console |

### collector-python

Collector memakai BaseCollector dan memilih implementasi berdasarkan
collector_sources.source_type:

| Type | Implementasi | Sumber |
|---|---|---|
| rss | RSSNewsCollector | RSS feed |
| web | WebScraperCollector | Website |
| csv | CSVIngestCollector | CSV |
| social_media / api | SocialMediaCollector | Feed sosial/API |
| skdr_api | SKDRCollector | SKDR EBS dan IBS |

Untuk website, urutannya HTTP biasa, pemeriksaan challenge/SPA, lalu fallback
Scrapling/stealth bila diizinkan. Trafilatura dan pembersihan DOM membuang menu,
footer, iklan, script, style, dan rekomendasi. Tanggal dicari dari metadata
HTML/JSON-LD, elemen tanggal, URL, dan dateline teks.

Setelah ekstraksi, collector menormalisasi data, menyimpan dokumen ke MinIO bila
diperlukan, membuat message JSON, melakukan deduplikasi, lalu publish ke queue
disease.raw, disease.social, atau disease.skdr.

### worker-python

Worker memakai pika dengan basic_qos prefetch_count 1. Alurnya:

1. consume message dari queue;
2. validasi tahun publikasi;
3. set raw_reports.processing_status menjadi PROCESSING;
4. POST teks ke disease-nlp-python/nlp/analyze;
5. update atau insert raw_reports;
6. insert hasil ke disease_events;
7. set status PROCESSED atau NON_HEALTH;
8. ACK message.

URL yang sama dilindungi advisory transaction lock dan di-update, bukan
ditambahkan berulang kali. Error NLP dicoba ulang terbatas; poison message yang
terus gagal ditandai FAILED agar queue tidak macet.

### disease-nlp-python

Service FastAPI menerima teks yang sudah dibersihkan dan mengembalikan struktur
analisis. Service ini bukan collector URL utama.

- GET /health — status dan model;
- POST /nlp/analyze — pipeline utama;
- POST /icd11/resolve — resolusi term WHO/local;
- POST /reload — reload cache runtime;
- GET/PUT /labels — label disease;
- PUT /labels/sentiment — label sentiment.

## 4. Pipeline NLP

~~~text
Teks/main content
  -> deteksi bahasa
  -> translasi jika perlu
  -> ekstraksi lokasi dan negara
  -> keyword symptom/disease
  -> WHO concept mentions
  -> classifier disease/sentiment/event/relevance
  -> agent fallback jika perlu
  -> ekstraksi kasus/kematian
  -> validasi reference/policy content
  -> aturan outbreak
  -> WHO resolve disease mentions
  -> source credibility + needs_review
  -> AnalyzeResponse
~~~

### Bahasa dan translasi

- English, Indonesia, dan Malay biasanya dianalisis langsung.
- Thai, Lao, Khmer, Myanmar, dan bahasa non-Latin dideteksi dari script atau
  langdetect.
- XLM-RoBERTa memahami teks asli untuk klasifikasi dan konteks multilingual.
- NLLB-200 dapat diaktifkan sebagai translation view opsional bila diperlukan.
- Hasil translasi, bila ada, disimpan di translation_cache dan tidak menggantikan evidence asli.
- Angka kasus, kematian, dan lokasi dibandingkan dengan teks asli.

### Rule-based extraction

Sebelum model, sistem memakai:

- keyword penyakit dan gejala dari nlp_keywords;
- alias dan konsep WHO dari database;
- regex angka kasus dan kematian;
- pola lokasi dari locations;
- tanggal publikasi dari payload atau teks;
- normalisasi negara ASEAN dan OUTSIDE ASEAN.

Rule lebih mudah diaudit. Jika keyword eksplisit ditemukan, hasil itu
diprioritaskan ketika prediksi model tidak sesuai.

### Model klasifikasi

| NLP_MODEL | Disease | Field lain |
|---|---|---|
| fine-tuned | fine-tuned model lokal | XLM-RoBERTa zero-shot |
| xlm-roberta | XLM-RoBERTa zero-shot | XLM-RoBERTa zero-shot |
| indobert | IndoBERT zero-shot | IndoBERT zero-shot |
| dual | mapping bahasa dari DB | mapping bahasa dari DB |
| none | tanpa model | rule/regex tetap berjalan |

### Agent dan WHO ICD-11

Agent mengikuti AGENT_PROVIDER_ORDER, misalnya deepseek,openai. Agent dipanggil
ketika disease UNKNOWN, confidence rendah, ada beberapa kandidat, atau istilah
multilingual belum terpetakan.

Alurnya:

1. agent mengambil istilah penyakit dari artikel;
2. sistem mencari canonical term di konsep lokal;
3. jika belum ada, sistem mencari WHO ICD-11 MMS;
4. hanya hasil WHO yang memiliki kode resmi yang diterima;
5. konsep, alias, keyword, label, dan default rule disimpan secara atomic;
6. istilah tanpa validasi masuk disease_discovery_candidates sebagai pending.

AI tidak boleh menebak kode ICD-11. Konsep baru harus tervalidasi sebelum aktif.

### Lokasi, kasus, dan reference content

Lokasi dicari dari teks asli, teks translasi, lalu fallback agent terbatas.
Jika hanya negara yang terverifikasi, sistem menyimpan level negara dan tidak
mengarang ibu kota. Koordinat hanya berasal dari locations.

Angka artikel tidak selalu berarti kasus baru. Pipeline mencoba membedakan kasus
aktual, fact sheet, program pencegahan, kebijakan, statistik nasional, dan
proyeksi. Untuk reference/policy content, angka default 1 dapat dinormalisasi
menjadi 0 bila tidak ada kasus eksplisit. Tanda -, n/a, dan “tidak tersedia”
bukan nol faktual.

## 5. Database

| Tabel | Isi | Pemakai |
|---|---|---|
| raw_reports | Teks mentah, URL, tanggal, status | Collector/worker/audit |
| disease_events | Hasil NLP per report | Dashboard, events, map |
| collector_sources | Sumber, config, schedule, enabled | Collector/console |
| collector_runs | Riwayat run dan error | Monitoring |
| locations | Nama, negara, latitude/longitude | NLP/map |
| nlp_labels | Label disease, event type, sentiment, relevance | Classifier |
| nlp_keywords | Keyword disease/symptom | Rule extraction |
| disease_concepts | Canonical disease + WHO code | ICD resolution |
| disease_aliases | Alias multilingual | Mention resolution |
| disease_mentions | Evidence, role, code | Audit |
| disease_discovery_candidates | Term belum tervalidasi | Review |
| disease_outbreak_rules | Minimum case per penyakit | Rule |
| source_credibility | Skor tipe sumber | NLP/dashboard |
| translation_cache | Hasil translasi/provider | NLP latency |
| language_markers | Penanda bahasa | Fallback detection |
| extraction_rules | Regex configurable | Extraction |
| language_models | Bahasa → model | Mode dual |
| skdr_reports | Payload EBS/IBS dan dedupe key | SKDR |
| system_settings | Pengaturan aplikasi | Console |
| audit_logs | Jejak perubahan admin | Audit |
| nlp_training_examples | Data untuk training | Retraining |
| peta_provinsi2023, peta_kab2023 | Geometry Indonesia | Polygon map |

### Arti angka pipeline

- **Total Crawled All-Time**: total kumulatif counter collector, termasuk item
  yang kemudian gagal.
- **Current Live Crawl**: item yang sedang ditemukan/diambil dalam run aktif.
- **NLP Processing**: item yang sedang dianalisis worker.
- **Stored in DB**: hasil yang sudah tersimpan sebagai report/event.

Angka tersebut tidak sama dengan event dashboard karena dashboard menerapkan
filter tanggal, kesehatan, confidence, deduplikasi, dan agregasi.

## 6. SKDR EBS dan IBS

SKDRCollector membaca credential dari environment runtime, bukan dari tabel
source. Data dinormalisasi ke skdr_reports, diberi payload_hash dan dedupe_key,
lalu dapat dikirim ke worker untuk menghasilkan event NLP.

Ada dua jalur:

1. **SKDR summary** membaca skdr_reports langsung untuk laporan teknis IBS/EBS.
2. **NLP event** mengirim payload ke RabbitMQ, menganalisisnya, lalu menyimpan
   hasil di disease_events.

Karena jalurnya berbeda, jumlah summary SKDR dan dashboard NLP tidak harus sama.

## 7. Aturan dashboard publik

public-dashboard memakai event kesehatan dengan tanggal publikasi valid, disease
dikenal, bukan UNKNOWN/negative, dan memenuhi confidence minimum. Event yang
tidak memenuhi filter tetap dapat disimpan untuk audit.

- published_at dipakai sebagai waktu publikasi; created_at tidak menggantikannya.
- URL duplikat tidak boleh menggandakan event.
- kpis adalah snapshot berdasarkan filter tahun/negara.
- trends.current adalah periode berjalan, biasanya bulan berjalan.
- trends.previous adalah periode sebelumnya.
- map, heatmap, dan panel memakai agregasi event valid dari backend.
- severity/outbreak adalah rule internal, bukan bukti resmi wabah.

## 8. Environment penting

Credential nyata tidak boleh masuk repository. Gunakan .env lokal/server.

| Variable | Fungsi |
|---|---|
| DATABASE_URL | Koneksi PostgreSQL |
| RABBITMQ_URL | Koneksi RabbitMQ |
| NLP_MODEL | Mode model NLP |
| NLP_SERVICE_URL | URL service NLP |
| COLLECTOR_URL | URL collector |
| OPENAI_API_KEY | Provider OpenAI, optional |
| DEEPSEEK_API_KEY | Provider DeepSeek, optional |
| AGENT_ENABLED | Agent fallback |
| AGENT_PROVIDER_ORDER | Urutan provider |
| WHO_ICD_CLIENT_ID/SECRET | OAuth WHO ICD-11 |
| WHO_DISCOVERY_ENABLED | Discovery term baru |
| WHO_TERM_RESOLUTION_ENABLED | Resolusi WHO/local |
| TRANSLATION_LOCAL_ENABLED | Mengaktifkan translation view NLLB secara opsional |
| LOW_CONFIDENCE_THRESHOLD | Batas needs_review |
| NEXT_PUBLIC_API_BASE_URL | Base URL API frontend |
| BACKEND_INTERNAL_URL | Rewrite API Next.js |
| SKDR_USER_KEY | Credential SKDR runtime only |
| SKDR_FETCH_TIME | Jadwal SKDR |
| COLLECTOR_TIMEZONE | Zona waktu scheduler |

Setelah mengubah environment, recreate service terkait. Perubahan label, keyword,
konsep, atau rule membutuhkan POST /reload atau restart NLP agar cache runtime
diperbarui.

## 9. Operasional dan troubleshooting

~~~bash
docker compose up -d --build
docker compose ps

docker compose logs -f disease-collector-python
docker compose logs -f disease-worker-python
docker compose logs -f disease-nlp-python
docker compose logs -f disease-backend-rust

docker compose build disease-frontend-next
curl http://localhost:8081/health

sh scripts/reanalyze_health.sh --dry-run --limit 20
~~~

Urutan troubleshooting:

1. cek status container dan healthcheck;
2. cek collector_runs.error_message;
3. cek RabbitMQ queue depth;
4. cek raw_reports.processing_status;
5. cek log worker saat POST ke NLP;
6. cek disease_events dan published_at;
7. baru cek query dashboard/frontend.

## 10. Testing dan training

Area test:

- services/nlp-python/tests/ — rules, content quality, extraction count;
- services/nlp-python/app/tests/ — pipeline/rules;
- services/collector-python/tests/ — web scraper;
- test_accuracy.py — akurasi berbasis dataset;
- scripts/train_classifier.py — training classifier;
- scripts/export_training_data.py — export confidence tinggi;
- scripts/retrain_from_db.py — dry-run/evaluasi/promosi;
- notebooks/fine_tune*.ipynb — fine-tuning.

Model baru sebaiknya melalui export dataset, training kandidat, evaluasi macro-F1,
dry-run, penyimpanan model lama untuk rollback, lalu rebuild NLP.

## 11. Kekurangan dan risiko

1. Zero-shot dapat memilih penyakit yang salah jika artikel menyebut banyak
   penyakit atau label terlalu mirip.
2. Lokasi sumber tidak sama dengan lokasi kejadian; domain penerbit tidak boleh
   otomatis menjadi lokasi penyakit.
3. Artikel program/pencegahan dapat memiliki angka besar yang bukan kasus baru.
4. Tanggal publikasi bisa tidak tersedia atau salah markup.
5. Koordinat hanya akurat jika nama cocok dengan gazetteer database.
6. Agent eksternal bergantung pada API, timeout, dan biaya.
7. NLP event dan SKDR summary adalah dua representasi berbeda.
8. Counter crawling, queue, processing, stored, dan dashboard memiliki definisi
   serta waktu pengukuran berbeda.

## 12. Prioritas pembaruan

1. Tambahkan provenance setiap output: rule, model, agent, WHO, confidence.
2. Buat evaluation set untuk artikel program, travel advisory, statistik, dan
   artikel dengan banyak penyakit.
3. Pisahkan disease mention, disease classification, dan event claim.
4. Validasi tanggal, lokasi, angka, dan kredibilitas sebelum agregasi.
5. Buat review queue untuk confidence rendah dan term WHO pending.
6. Ukur precision/recall per penyakit dan per bahasa.
7. Tambahkan observability: queue depth, latency, error rate, duplicate rate, dan
   extraction completeness.
8. Simpan raw content dan versi model untuk re-analysis serta rollback.

## 13. File rujukan

- README.md — quick start, API, dan operasi umum;
- docker-compose.yml — wiring service dan environment;
- services/collector-python/app/collectors/ — sumber data;
- services/worker-python/app/worker.py — consumer dan persist;
- services/nlp-python/app/pipeline.py — urutan NLP;
- services/nlp-python/app/extractors.py — rule extraction;
- services/nlp-python/app/icd11.py — WHO resolution/discovery;
- services/nlp-python/app/agent.py — provider DeepSeek/OpenAI;
- services/backend-rust/src/main.rs — REST API dan agregasi;
- services/frontend-next/lib/api.ts — client API frontend;
- database/init/*.sql — schema, index, seed, migration;
- docs/PANDUAN_METRIK_DASHBOARD.md — arti metric dashboard;
- docs/PRODUCTION_TRAINING.md — training production;
- docs/ICD11_AGENT_WALKTHROUGH.md — alur WHO/agent.
