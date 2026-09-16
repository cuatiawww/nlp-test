# Pelaksanaan direktif NLP v-final

Implementasi mengikuti lima tahap berurutan: async URL, PDF, review WHO,
relasi lokasi, lalu relasi penyakit. Perubahan ini masih lokal/staging dan
tidak ada push atau deploy produksi.
Perubahan lokal Crawl Mode, panduan framework, dan Dockerfile rekan kerja
tidak termasuk commit direktif.

## 1. Async analyze URL

- API lama tetap sinkron hanya jika klien mengirim `async: false` atau
  `ANALYZE_URL_ASYNC_ENABLED=false`. Default request adalah **async**:
  `data.job_id` + poll `GET /api/v1/analysis-jobs/{id}`.
- Tabel `analysis_jobs` adalah penyimpanan job sekaligus outbox. Collector
  langsung publish ke RabbitMQ `disease.analysis-url`; worker juga
  menerbitkan ulang job stale. Broker offline tidak menghilangkan submission.
- `python -m app.analysis_jobs` (service Compose yang sudah ada) tetap
  menjalankan Manual Crawler sebagai child process. Mereka memakai queue
  terpisah `disease.analysis-url` dan `disease.crawl-matrix`, prefetch 1,
  dan tidak acknowledge pesan satu sama lain. Tidak perlu service Compose baru.
- Fetch maksimal 18 detik per panggilan dengan satu HTTP fallback; NLP HTTP
  maksimal 25 detik per panggilan. Endpoint NLP baru memisahkan translasi
  (6 detik) dan inference (14 detik) dalam subprocess yang dihentikan saat
  timeout. Batas ini perlu diselaraskan dengan gateway aktual saat staging.
- Jika NLP gagal, worker mencoba rules-only. Status partial mempertahankan
  artikel/warnings di job untuk review; tidak membuat event NON_HEALTH palsu.
- Partial tidak dimasukkan agregasi disease_events. Frontend menampilkan
  sumber yang berhasil diambil dan job ID.
- Polling frontend maksimal lima menit. Job tetap dapat dicari lewat endpoint
  status menggunakan job ID setelah polling berakhir.

### Aktivasi setelah review staging

1. Terapkan migration additive `database/init/041_analysis_jobs.sql`,
   `042_asean_disease_aliases.sql`, `043_disease_event_locations.sql`, dan
   `044_disease_event_diseases.sql`.
2. Siapkan image/source backend, collector, NLP, dan worker hasil perubahan.
3. Recreate worker/collector/backend yang sudah ada (tanpa edit Compose):
   `docker compose up -d --build --force-recreate analysis-job-worker disease-collector-python disease-backend-rust`.
4. Aktifkan flag backend dan relation storage di lingkungan staging:
   `ANALYZE_URL_ASYNC_ENABLED=true`,
   `ENTITY_LOCATION_STORAGE_ENABLED=true`, dan
   `ENTITY_DISEASE_STORAGE_ENABLED=true`.
5. Uji satu URL, broker offline, kegagalan NLP, replay job, dan client lama.

Flag default mati. Rollback: matikan flag backend dan stop worker interaktif;
script di `database/rollback/041_analysis_jobs.sql` menutup job queued tanpa
menghapus tabel/data. Simpan hasil audit dan raw reports.

## 2. PDF routing

PDF dikenali dari Content-Type, ekstensi, atau magic bytes sebelum jalur HTML.
File asli disimpan melalui MinIO, teks naratif dan tabel disimpan sebagai
hasil terpisah, dan PDF scan menghasilkan status review OCR. Aktifkan setelah
staging dengan `PDF_ROUTING_ENABLED=true`; default tetap mati agar sumber
HTML lama tidak berubah.

## 3. Disease review queue

Kandidat disease yang belum tervalidasi tetap berada di
`disease_discovery_candidates` dengan status `pending`. Endpoint baru:

- `GET /api/v1/disease-discovery-candidates`
- `GET /api/v1/disease-discovery-candidates/metrics`
- `POST /api/v1/disease-discovery-candidates/{id}/review`

Status `resolved` wajib membawa `resolved_concept_id`; kode ICD-11 tidak
boleh dikarang. Metrik mengembalikan pending/resolved/rejected per bahasa,
persentase status, dan UNKNOWN event per bahasa. Kegagalan OAuth WHO dicatat
dengan alasan eksplisit, dan alias lokal ASEAN ditambahkan secara idempotent.

## 4. Multi-location dan multi-disease storage

Pipeline sudah memiliki ekstraksi `locations[]` dan
`disease_mentions[]`. Migration `043` dan `044` menambahkan relasi
one-to-many tanpa mengubah kolom legacy. Primary event/disease membawa angka
kasus dan kematian; lokasi atau penyakit yang hanya disebutkan tidak menerima
angka global yang sama. Data lama di-backfill secara idempotent.

### Batasan operasional yang harus diperhatikan

- Subprocess spawn memberi batas waktu yang benar, tetapi menambah biaya
  pemuatan model/dictionary. Endpoint ini dibatasi satu pekerjaan concurrent
  per proses API. Profiling staging perlu dilakukan sebelum memilih budget.
- Failure/partial adalah hasil eksplisit, bukan jaminan seluruh URL berhasil.
- UUID job adalah referensi akses; endpoint ditujukan untuk artikel publik.
  Jangan gunakan URL yang berisi credential atau dokumen privat.
- Test menggunakan DB disposable dengan network tersendiri; DB aplikasi
  tidak dimigrasikan oleh sesi pengembangan ini.

## Catatan validasi

Baseline sebelum perubahan: 30 test NLP dan 11 test scraper lulus.
Test tambahan mencakup fallback, partial, kontrak polling lama, job failure,
deadline polling, penghentian subprocess, dan replay penyimpanan PostgreSQL.
Hasil final tiap tahap dicatat setelah verifikasi selesai.
