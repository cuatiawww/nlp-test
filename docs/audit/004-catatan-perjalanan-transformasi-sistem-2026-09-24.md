# Catatan Perjalanan Transformasi Sistem & Unifikasi Kualitas Data

**Tanggal**: 24 September 2026  
**Status**: Dokumentasi Resmi Audit & Progress Reformasi Sistem  
**Target Sistem**: Platform Surveilans Intelijen Epidemiologi & Penyakit Menular ASEAN (`NLP-PENYAKIT`)  
**Dokumen Terkait**:
- `001-alur-crawling-model-dan-akurasi-2026-09-24.md`
- `002-perbandingan-tiga-jalur-url-2026-09-24.md`
- `003-matriks-kualitas-dan-unifikasi-flow-2026-09-24.md`

---

## 1. Ekosistem & Sinkronisasi Agent Capabilities

Sebagai langkah awal transformasi, seluruh kapabilitas dan skill agen pengembang (**Codex Agent Skills**) telah disinkronkan 100% ke dalam ekosistem **Antigravity IDE Customizations**:

* **Lokasi Global**: `C:\Users\aspire 5\.gemini\config\skills\`
* **Lokasi Workspace**: `.agents/skills/`
* **Total Skill Terinstal**: **35 Skills**, mencakup:
  1. `nlp-crawler-engine`: Kapabilitas spesifik untuk crawler, NLP workers, PostgreSQL, & Rust API.
  2. `disease-surveillance-ops`: Operasional & monitoring pipeline surveilans penyakit.
  3. `cli-creator`, `review-agent`, `skill-creator`, `skill-installer`: Perangkat metaprogramming & audit kualitas kode.
  4. Paket **Anti-Slop Suite** (`antislop`, `antislop-code`, `antislop-ui`, `antislop-layoutmobile`, `antislop-human`, `antislop-copywriting`): Menjamin higiene kode & standar visual UI/UX tanpa *AI slop*.
  5. **20 Artifact Templates**: Templat standar industri untuk desain sistem, laporan eksekutif, dan analisis data.

---

## 2. Reformasi Master Data (Penyakit & Geografi)

### A. Master Data Penyakit ASEAN CDC (Migrasi 120)
- **Pembersihan Total**: Membuang data penyakit legacy yang tidak terstruktur dan menggantikannya secara bersih (*purge & inject*).
- **31 Penyakit Utama ASEAN**: Menginjeksi 31 penyakit resmi CDC ASEAN (Dengue, COVID-19, Mpox, Rabies, Malaria, Zika, Ebola, Marburg, Nipah, TB, Pertussis, MERS, HFMD, Avian Flu, Anthrax, dll).
- **Dukungan Multilingual 11 Negara ASEAN**: 
  - **982 Alias Penyakit** dalam aksara asli & bahasa lokal 11 negara ASEAN (Indonesia, Melayu, Tagalog, Thai, Vietnam, Myanmar, Khmer, Lao, Tetum, Mandarin, Tamil).
  - **812 Kata Kunci NLP** yang memicu ekstraksi akurat.
- **Dekopling API Eksternal (WHO ICD-11)**:
  - Melepaskan ketergantungan wajib pada API eksternal WHO ICD-11 tanpa memicu error.
  - Resolusi penyakit beralih ke katalog lokal mandiri (*offline-first*).

### B. Ekspansi Master Data Negara & Region (Migrasi 121)
- **Ekspansi Master Negara**: Menambah 61 negara strategis dunia sehingga total master data negara berukuran **78 Negara** (11 Anggota ASEAN + 67 Negara Luar ASEAN / Global).
- **Pengelompokan Region & Sub-Region**:
  - `ASEAN` (11 Negara)
  - `OUTSIDE_ASEAN` (67 Negara Non-ASEAN)
  - `GLOBAL` (78 Negara)
  - `ASEAN_PLUS_THREE` (14 Negara)
  - Sub-Region Geografis: `EAST_ASIA_PACIFIC` (10), `SUB_SAHARAN_AFRICA` (14), `MIDDLE_EAST_NORTH_AFRICA` (13), `EUROPE` (12), `LATIN_AMERICA` (8), `SOUTH_ASIA` (6), `NORTH_AMERICA` (2), `CENTRAL_ASIA` (2).
- **Centroid & Geocoding Fallback (`locations` & `location_aliases`)**:
  - Menginjeksi titik koordinat centroid negara ke tabel `locations` (`admin_level = 0`).
  - Menyiapkan alias nama negara dalam Bahasa Inggris & Bahasa Indonesia (misal: *Arab Saudi*, *Inggris*, *Jerman*, *Prancis*, *Selandia Baru*, *Brasil*, *Afrika Selatan*, dll) untuk pengenalan geotagging NLP.

---

## 3. Unifikasi Flow NLP 3 Jalur (Single Core Profile)

Terdapat 3 jalur akuisisi berita/artikel di platform kita:
1. **Crawling Kontinu**: Scheduler ➔ Collector ➔ RabbitMQ ➔ Worker ➔ `/nlp/analyze/raw`.
2. **URL Manual**: API/UI ➔ Worker ➔ `/nlp/analyze/raw`.
3. **Crawl Matrix**: Matrix Jobs ➔ Worker ➔ `/nlp/analyze/raw` ➔ Matrix Row Projection.

### Prinsip Unifikasi (Single Core Profile):
- Entry point dan cara simpan (*persistence projection*) boleh berbeda sesuai kebutuhan tabel.
- **Engine Analisis NLP setelah artikel di-fetch Wajib 100% Konsisten**:
  - Menggunakan profil `/nlp/analyze/raw` secara seragam (`interactive=false`, `rules_only=false`).
  - Membaca teks artikel utuh.
  - Menjalankan *Strict Disease-Location-Metric Relation Pass* tanpa pemotongan fitur.

---

## 4. Empat Pilar Utama Kualitas Data Epidemiologi

Keempat pilar kualitas data surveilans yang menjadi standar sistem:

```text
               ┌─────────────────────────────────────────────────────────┐
               │          INPUT ARTIKEL BERITA / LAPORAN                 │
               └────────────────────────────┬────────────────────────────┘
                                            │
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ PILAR 1: FILTER RELEVANSI KESEHATAN (is_health_related)                                  │
│ - Memisahkan artikel edukasi/informasi umum dari artikel kejadian wabah aktual.          │
│ - Jika tidak ada bukti kasus/outbreak, artikel tidak dijadikan event wabah.             │
└───────────────────────────────────────────┬─────────────────────────────────────────────┘
                                            │
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ PILAR 2: DETEKSI KASUS & HIRARKI LOKASI (GazetteerLinker)                                │
│ - Ekstraksi metrik: case_count, death_count, new_cases, hospitalizations.               │
│ - Hirarki Wilayah: ADM0 (Country), ADM1 (Provinsi/State), ADM2 (Kota/Kabupaten), Lat/Long.│
└───────────────────────────────────────────┬─────────────────────────────────────────────┘
                                            │
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ PILAR 3: MULTI-PENYAKIT & MULTI-LOKASI (compose_structured_events)                       │
│ - Memecah 1 artikel multi-topik menjadi entitas kejadian atomik terpisah di sub_events[].│
│ - Contoh: Dengue di Jakarta (50 kasus) & Malaria di Papua (10 kasus) dipisah rapi.       │
└───────────────────────────────────────────┬─────────────────────────────────────────────┘
                                            │
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ PILAR 4: PENGIKATAN RELASI KOMPLEKS (extract_metric_relations)                           │
│ - Sentence Window Offset: Mengikat [Penyakit] <-> [Lokasi] <-> [Jumlah Kasus].           │
│ - Memisahkan angka total Nasional (Aggregate) dari breakdown Provinsi/Kota (Regional).  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Ringkasan Status Verifikasi & Kesehatan Sistem

| Komponen | Status | Pengujian / Verifikasi |
| :--- | :---: | :--- |
| **PostgreSQL Database** | 🟢 Healthy | Migrasi `120` & `121` terverifikasi di `schema_migrations`. |
| **Python NLP Engine** | 🟢 Healthy | Test suite `test_asean_disease_resolution.py` PASSED (4/4). |
| **Rust Backend Service** | 🟢 Healthy | Healthcheck `:8081/health` mengembalikan `{"status":"ok"}`. |
| **RabbitMQ Queue** | 🟢 Healthy | Queue `disease.raw`, `disease.analysis-url`, & `disease.matrix` terhubung. |
| **Next.js Frontend** | 🟢 Healthy | Rute `/analysis-dashboard` & `/nlp/crawl-history` terintegrasi. |

---

*Dokumen ini menjadi rujukan resmi perjalanan perbaikan arsitektur dan standar kualitas data pada sistem NLP-PENYAKIT.*
