# Arsitektur Disease Surveillance AI

## Alur utama

1. Sumber Data: berita online, media sosial, laporan rumah sakit, laporan puskesmas, website pemerintah.
2. Data Collection: crawler/API/manual upload memasukkan raw report dan dokumen ke MinIO.
3. Message Queue: RabbitMQ untuk POC; Kafka dapat dipakai saat volume event tinggi.
4. NLP Service: Python FastAPI menjalankan deteksi bahasa, normalisasi, NER, disease extraction, dan klasifikasi.
5. Backend API: Rust Axum menjadi API gateway untuk dashboard, ingest, query, dan agregasi.
6. Database: PostgreSQL + PostGIS menyimpan raw report, hasil NLP, lokasi, dan agregasi spasial.
7. Frontend: Next.js menampilkan peta, grafik, timeline, dan alert.

## Strategi implementasi bertahap

### Tahap 1 - POC Docker Compose
- Rust API memanggil NLP service secara sinkron.
- Output disimpan ke PostgreSQL + PostGIS.
- Dashboard Next.js membaca API summary.

### Tahap 2 - Real-time Processing
- Collector mempublish pesan ke RabbitMQ.
- Worker consume queue dan memanggil NLP service.
- Backend hanya menyajikan API dan dashboard.

### Tahap 3 - Production Kubernetes
- Pisahkan deployment API, NLP, worker, frontend.
- Tambahkan HPA, ingress, secret management, observability, backup database, dan model registry.
