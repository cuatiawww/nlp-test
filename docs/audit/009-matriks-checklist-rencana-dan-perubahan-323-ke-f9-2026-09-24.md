# Matriks Checklist Rencana dan Perubahan Sistem

Tanggal audit awal: 2026-09-24  
Tanggal pembaruan progres: 2026-09-25  
Rentang commit diaudit: `323ca26` sampai `bcd0402` (HEAD)  
Commit tonggak: `323ca26`, `b4b56d4`, `c248185`, `f9c736f`, `ad5d91b`, `b950b86`, `47d8905`, `64daa5f`, `bcd0402`  
Status: Audit berbasis Git, verifikasi schema database, dan pengujian endpoint langsung di runtime Docker.

## Legenda

| Tanda | Arti |
|---|---|
| ✅ | Implementasi selesai dan telah diverifikasi (kode + runtime/database) |
| ◐ | Implementasi sebagian; masih ada gap struktural atau konfigurasi |
| ❌ | Belum dikerjakan |
| ⚠️ | Kode tersedia, tetapi pembuktian metrik akurasi membutuhkan evaluasi berlabel |

---

## 1. Checklist Rencana Utama

| No. | Rencana | Bukti & Implementasi pada Sistem | Status | Kesimpulan Audit & Verifikasi |
|---:|---|---|:---:|---|
| 1 | Reset + inisiasi ulang data penyakit berdasarkan PPT | `database/init/120_clean_and_inject_asean_master_diseases.sql` menghapus konsep dan alias lama lalu menginjeksi master penyakit ASEAN. Runtime sinkron dengan `services/nlp-python/app/disease_master.py`. | ✅ | **Selesai**. Master penyakit lokal ASEAN telah terinjeksi di database dan runtime. Dropdown dan referensi UI tidak lagi bergantung pada hardcode usang atau WHO external API. |
| 2 | Reset + inisiasi ulang data source, hanya menyisakan Google News dan source Phase 1 | `database/init/125_reset_sources_to_phase1_and_google_news.sql` (commit `b950b86`) menghapus source di luar whitelist Phase 1 (`ABVC Master Source`) dan Google News (`^https?://(www\.)?news\.google\.com`). | ✅ | **Selesai**. Pembersihan selektif telah diimplementasikan dalam bentuk migrasi SQL otomatis. Source di luar Phase 1 dihapus dari tabel `collector_sources`. |
| 3 | Rapikan rule confidence `0.75` | `services/nlp-python/app/config.py` menetapkan `DEEPSEEK_TRIGGER_CONFIDENCE=0.75`; `services/nlp-python/app/llm_gate.py` memicu review saat confidence di bawah threshold. | ◐ | **Sebagian**. Threshold `0.75` sudah aktif sebagai trigger DeepSeek. Namun operator meminta `<=` sementara kode saat ini memakai `<` (`confidence < config.DEEPSEEK_TRIGGER_CONFIDENCE`). |
| 4 | Lepas semua kode API selain Review | `services/nlp-python/app/icd11.py` dihapus, konfigurasi WHO ICD-11 dihapus, provider OpenAI dilepas dari agent, dan resolusi penyakit diarahkan ke local disease master. DeepSeek dipertahankan sebagai review rear-gate. | ✅ | **Selesai**. Ketergantungan API ontology penyakit eksternal sudah dilepas sepenuhnya. Resolusi penyakit berjalan lokal secara otonom. |
| 5 | Perbaiki penetapan Health / Outbreak | Migrasi seluruh filter eksklusi/negatif ke tabel PostgreSQL `extraction_rules` (42 rules aktif mencakup `academic_study`, `non_health_topic`, `agricultural_disease`, `metaphorical_phrase`, `metric_exclusion`, dll). Engine NLP runtime memuat rule dinamis dari DB via endpoint reload real-time tanpa restart container. Modul UI `/extraction-rules` (`ExtractionRuleForm.tsx`) 100% dinamis terhubung ke DB. | ✅ | **Selesai Penuh**. False-positive skripsi mahasiswa, penyakit tanaman (ubi kayu/wereng), kiasan (judi online/pinjol), dan berita militer/politik tersaring otomatis (`is_health_related=False`, `case_count=0`). Lolos 100% pada 6 pengujian verifikasi kritis. |
| 6 | Cek hasil implementasi DeepSeek Review | `deepseek.py` memiliki schema prompt, guardrail zero-hallucination, validasi disease master, evidence, lokasi, dan sub-events. | ◐ ⚠️ | **Tersedia (Opt-in)**. Implementasi review terstruktur tersedia di codebase. Secara default `AGENT_ENABLED=false` sampai API key dan lingkungan produksi dikonfigurasi. |
| 7 | Hapus semua data analisa/reset event dan buat tombol reset | Backend Rust (`services/backend-rust/src/main.rs`) menyediakan `GET /api/v1/data/cleanup-stats` (metrik live database) dan `POST /api/v1/data/cleanup-events` dengan 3 opsi cakupan (`analysis_and_events`, `events_only`, `full_crawl_and_analysis`), guardrail admin, konfirmasi teks `RESET`, dan audit log. Frontend menyediakan `ResetDataModal.tsx` anti-slop, tombol di `/events`, dan tab di `/console/settings` (commit `bcd0402`). | ✅ | **Selesai Penuh**. Backend dan UI telah terintegrasi end-to-end. Memiliki kontrol scope terukur, konfirmasi proteksi ketat, live counter, dan pencatatan audit log permanen. |
| 8 | Buat trigger On/Off collector source | `collector_sources.enabled` didukung oleh scheduler, endpoint update source, dan kontrol sakelar UI di modul sumber data. | ✅ | **Selesai**. Kontrol per-source aktif/pause berfungsi, memungkinkan operator mengendalikan jadwal crawling tiap sumber data secara independen. |
| 9 | Implementasikan DeepSeek Review untuk confidence `<= 0.75` | `llm_gate.py` memicu eskalasi saat `confidence < DEEPSEEK_TRIGGER_CONFIDENCE`, `needs_review`, lokasi hilang, atau penyakit ambigu yang memiliki kandidat. | ◐ ⚠️ | **Sebagian**. Alur eskalasi gate sudah aktif. Operator perlu memastikan apakah batas threshold memerlukan operator `<=` atau cukup `<`. |

---

## 2. Catatan Penting Mengenai Threshold `0.75`

Kode pada `services/nlp-python/app/llm_gate.py` saat ini menggunakan kondisi:

```python
# 1. Disease is UNKNOWN or confidence < threshold
if unknown or confidence < config.DEEPSEEK_TRIGGER_CONFIDENCE:
    return True
```

- Jika confidence bernilai `0.749`, sistem akan mengeskalasikan ke review DeepSeek.
- Jika confidence bernilai tepat `0.750`, sistem menganggap confidence mencukupi (tidak dieskalasikan hanya karena skor confidence).
- Jika kebutuhan spesifikasi mewajibkan nilai tepat `0.75` ikut dieskalasikan, operator cukup menyesuaikan operator menjadi `<=` (`confidence <= config.DEEPSEEK_TRIGGER_CONFIDENCE`).

---

## 3. Pekerjaan Lanjutan yang Berhasil Diselesaikan

Di luar 9 checklist awal, beberapa peningkatan arsitektural dan antarmuka telah diselesaikan:

### 3.1 Implementasi Standar CDC MMWR Epi Weeks & Kalender Surveilans
- **Backend & Logic**: Implementasi kalkulasi minggu epidemiologi berbasis standar CDC MMWR (awal minggu hari Minggu, minggu ke-1 memuat minimal 4 hari pertama tahun kalender).
- **Frontend Anti-Slop**: Halaman `/epi-calendar` dan endpoint kalkulasi dinamis (`/api/v1/epiweeks/calculate`, `/api/v1/epiweeks/current`) terbebas dari dummy date-picker, terhubung langsung ke master tahun dan minggu epidemiologi.
- **Dokumentasi Audit**: Tercatat lengkap pada [010-implementasi-standar-mmwr-epi-weeks-dan-kalender-surveilans-2026-09-24.md](file:///home/aspire_5/app/NLP-PENYAKIT/docs/audit/010-implementasi-standar-mmwr-epi-weeks-dan-kalender-surveilans-2026-09-24.md).

### 3.2 Pembersihan UI Anti-Slop & Filter Regional
- **Pembersihan Hardcode Scope**: Menghilangkan banner teks statis ASEAN ("Showing all 11 ASEAN jurisdictions...") dan card AI situation summary hardcoded pada dashboard utama.
- **EpiFilterBar**: Mengelompokkan pilihan filter cakupan menjadi *Regional Scope (ASEAN / Global)* dan *ASEAN Countries* secara rapi dengan deskripsi kontekstual.
- **Konsistensi Bahasa**: Sinkronisasi kunci lokalisasi Bahasa Indonesia (`locales/id.json`) dan Bahasa Inggris (`locales/en.json`).

### 3.3 Unifikasi Jalur NLP
- **Penghapusan Jalur Ganda**: Endpoint redundan `/nlp/analyze/url` dan fallback rules-only yang mendegradasi kualitas telah dipangkas (`docs/audit/011`, `012`, `013`).
- Seluruh URL interaktif dan crawler worker kini berjalan pada shared source-first pipeline yang setara.

---

### 3.4 Eliminasi False-Positive Outbreak & Database-Driven Extraction Rules
- **Problem Statement**: Munculnya artikel karya ilmiah/skripsi mahasiswa (contoh: *"Pengaruh Edukasi terhadap DBD pada Mahasiswa"*), penyakit tanaman/pertanian (*hama wereng, ubi kayu*), istilah metafora sosial (*wabah judi online, kanker korupsi*), dan berita militer/politik yang sebelumnya keliru diklasifikasikan sebagai outbreak penyakit manusia dengan angka kasus halusinasi.
- **Solusi Database-Driven**: Seluruh pola eksklusi dan regex ekstraksi angka kasus dipindahkan ke database PostgreSQL (`extraction_rules`), dengan 42 rules aktif terbagi atas 8 kategori:
  1. `academic_study`: Mendeteksi skripsi, tesis, kuesioner, responden, dan sampel penelitian.
  2. `non_health_topic`: Menyaring berita olahraga, pemilu, saham, rudal militer, konflik.
  3. `agricultural_disease`: Menyaring hama wereng, penyakit tanaman ubi kayu, perkebunan.
  4. `metaphorical_phrase`: Menyaring judi online, pinjol, kanker korupsi, demam panggung.
  5. `metric_exclusion`: Mencegah nomor tips atau sampel kuesioner terambil sebagai case count.
  6. `general_prevention_tips`: Edukasi PHBS tanpa laporan kasus aktif.
  7. `case_count` & `death_count`: Regex ekstraksi metrik epidemiologi resmi.
- **Runtime Hot-Reload**: Saat operator menambah/mengubah rule di UI atau API Rust `/api/v1/extraction-rules`, backend Rust otomatis memanggil endpoint `/reload` pada engine Python NLP, sehingga rule aktif seketika tanpa perlu restart service atau container.
- **Frontend Management UI**: Tersedia pada rute `/extraction-rules` yang 100% dinamis membaca dari database (tanpa hardcoded dummy map/data), dilengkapi modal `ExtractionRuleForm.tsx` dengan live regex syntax validator.
- **Hasil Verifikasi**: 6 dari 6 skenario uji verifikasi e2e lulus 100% (skripsi DBD -> rejected, tanaman ubi kayu -> rejected, judi online -> rejected, militer rudal -> rejected, tips PHBS -> no case count, outbreak Sleman -> 142 kasus & 3 kematian tervalidasi).

---

## 4. Matriks Status Pekerjaan Lanjutan

| Pekerjaan Lanjutan | Status | Realisasi & Tindak Lanjut |
|---|:---:|---|
| Reset source selektif (Google News + Phase 1) | ✅ Selesai | Dikerjakan via migration `125_reset_sources_to_phase1_and_google_news.sql` (commit `b950b86`). |
| Tombol reset analisa yang aman & terukur | ✅ Selesai | Selesai di backend Rust & UI modal (`ResetDataModal.tsx`), commit `bcd0402`. |
| Unifikasi pipeline URL & Worker | ✅ Selesai | Bounded fallback dilepas; crawler dan URL memakai pipeline shared. |
| Provenance `source_id`/`run_id` hingga hasil NLP | ◐ Terbuka | `collector_runs` mencatat statistik collector, namun agregasi konsisten per-source/per-run pada `disease_events` masih perlu difinalisasi. |
| Metrik health/outbreak per source | ◐ Terbuka | Membutuhkan provenance run selesai agar metrik recall per-sumber berita dapat dihitung akurat. |
| Eliminasi False-Positive & Dynamic Extraction Rules | ✅ Selesai | 42 rules tersimpan di PostgreSQL (`extraction_rules`), engine NLP reload real-time, UI manajemen dinamis di `/extraction-rules`. |
| Pengujian dataset berlabel DeepSeek | ⚠️ Terbuka | Pengujian precision/recall formal dengan gold dataset untuk memvalidasi performa di lingkungan staging. |

---

## 5. Status Runtime & Uji Coba

- **Next.js Frontend**: Berhasil dikompilasi 100% (`✓ Generating static pages (70/70)`), dideploy ke container `disease-frontend-next`, dan melayani `HTTP 200 OK`.
- **Rust Backend**: Image Docker `nlp-penyakit-disease-backend-rust:latest` berhasil dikompilasi (`cargo build --release`), container aktif dan `healthy`.
- **Pengujian Endpoint Live**:
  - `GET /api/v1/data/cleanup-stats`: Mengembalikan 49.767 kejadian penyakit dan 54.800 artikel mentah secara real-time.
  - `POST /api/v1/data/cleanup-events`: Berhasil memverifikasi proteksi input konfirmasi (menolak input selain `RESET` dengan HTTP 400).
  - Sinkronisasi role otorisasi admin di database PostgreSQL (`disease_ai`) telah dinormalisasi.

---

## 6. Kesimpulan Singkat

Kemajuan signifikan telah dicapai:
1. **Pembersihan Data & Master Data**: Master penyakit ASEAN lokal dan sumber data Phase 1 + Google News telah bersih.
2. **Kontrol Data Analisa**: Fitur reset analisa data dengan 3 level cakupan dan proteksi audit log telah tersedia penuh baik di backend maupun UI anti-slop.
3. **Surveilans Terstandar**: Kalender epidemiologi MMWR CDC telah aktif menggantikan filter dummy.
4. **Fokus Berikutnya**: Mempertahankan kestabilan worker runtime NLP serta melengkapi pelacakan provenance `source_id`/`run_id` untuk evaluasi kualitas per-sumber berita.
