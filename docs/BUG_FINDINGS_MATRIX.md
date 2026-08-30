# Matriks Temuan Bug & Rencana Penyelesaian
**Sistem:** Disease Surveillance AI (NLP-PENYAKIT)  
**Dokumen:** Hasil Analisis Bug Pipeline Analisis URL & Ekstraksi Lokasi  
**Tanggal:** 27 Agustus 2026  
**Status:** Siap Diimplementasikan (TDD)


| **BUG-08** | **Collector, NLP, Backend & Frontend**<br>`web_scraper.py`, `pipeline.py`,<br>`main.rs`, `analyze/page.tsx` | Tanggal publikasi (*published date*) tidak tampil pada kartu hasil analisis di UI `/nlp/analyze`, payload NLP belum menerima `published_at`, dan belum ada fallback ekstraksi tanggal jika metadata HTML kosong. | **Missing Published Date UI & Pipeline Integration**: 1. Frontend `analyze/page.tsx` belum memiliki kartu visual untuk `published_at`.<br>2. `backend-rust` tidak meneruskan `published_at` ke endpoint `/nlp/analyze`.<br>3. `collector-python` & `nlp-python` belum memiliki regex fallback untuk URL path date atau dateline teks saat tag `<meta>` kosong.<br>4. Map `sources` belum memuat penjelasan sumber tanggal. | **High** (P1) | 1. Tambahkan fallback ekstraksi tanggal dari URL path & dateline teks di collector & NLP.<br>2. Teruskan `published_at` dari backend-rust ke NLP payload.<br>3. Tambahkan sumber tanggal ke map `sources`.<br>4. Tambahkan kartu visual "Tanggal Publikasi" di `services/frontend-next/app/analyze/page.tsx`. |

---

## 1. Matriks Temuan Bug

| ID | Komponen & File | Gejala / Dampak | Akar Masalah (Root Cause) | Tingkat Keparahan | Rencana Penyelesaian |
|---|---|---|---|---|---|
| **BUG-01** | **NLP Extractor**<br>`services/nlp-python/app/extractors.py`<br>*(Line 158)* | URL berita Filipina (`dengue-in-the-philippines-2026`) salah terdeteksi sebagai **Indonesia**. | **Country Filter Leak**: Baris `loc = folded_names.get(match.group(0).lower(), match.group(0))` mengembalikan default string saat token tidak ada di `folded_names`. Kata `"Oro"` (desa di Jatim) tetap lolos meskipun negara artikel sudah diketahui adalah `Philippines`. | **Critical** (P0) | Ubah logic pencocokan agar jika `country` ditentukan dan token tidak ada di `folded_names`, proses langsung melakukan `continue` (skip). |
| **BUG-02** | **NLP Tie-Breaker**<br>`services/nlp-python/app/extractors.py`<br>*(Line 200)* | Lokasi pelengkap di kalimat terakhir selalu mengalahkan lokasi utama di judul / lead paragraph. | **Posisi Karakter Terakhir Menang**: `max(hits, key=lambda item: (counts[item[0]], item[1], len(item[0])))` memenangkan `item[1]` (indeks karakter) terbesar. Kata `"Oro"` berada di posisi 543 (paling belakang) sehingga mengalahkan Mandaluyong, Zamboanga, Cebu, dan Davao. | **High** (P1) | Perbaiki bobot penentuan lokasi: Berikan prioritas pada lokasi yang muncul di judul artikel / awal paragraf, atau gunakan indeks kemunculan pertama (`-item[1]`). |
| **BUG-03** | **Database Gazetteer**<br>Tabel `locations` & SQL init | Frasa "Davao de Oro" terpecah menjadi "Davao" dan "Oro" (desa di Indonesia). | **Entri Provinsi Belum Lengkap**: Di database `locations`, entri "Davao de Oro" (provinsi berpenduduk >700 ribu di Filipina) belum ada. Hanya ada "Davao" dan entri ambigu "Oro" (Indonesia). | **Medium** (P2) | Buat migrasi SQL baru `029_philippines_locations_fix.sql` untuk menambahkan `Davao de Oro`, `Central Luzon`, `Calabarzon`, dll., serta me-nonaktifkan kata pendek 3-huruf yang ambigu tanpa awalan. |
| **BUG-04** | **Database Cache**<br>Tabel `disease_events` & `raw_reports` | Hasil analisis lama yang salah tetap muncul di UI meskipun kode sudah diperbaiki. | **7-Days Cache Hit**: Backend Rust memiliki logic cache 7 hari. Data analisis lama yang menyimpan `location_name = 'oro'` terus dikembalikan ke frontend tanpa menjalankan ulang pipeline NLP. | **Medium** (P2) | Buat script / query pembersihan cache untuk URL terkait (`dengue-in-the-philippines-2026`) agar dievaluasi ulang dengan pipeline yang sudah diperbaiki. |
| **BUG-05** | **Test Suite Accuracy**<br>`test_accuracy.py`<br>*(Line 11)* | Menjalankan `python3 test_accuracy.py` menghasilkan error `Connection refused` 10/10. | **Hardcoded Internal Port**: Script mengarah ke `http://localhost:8081/api/v1/analyze-url`, padahal port 8081 adalah internal Docker dan tidak diekspos ke host. Port publik yang aktif adalah `http://localhost:3010/nlp/api/v1/analyze-url`. | **Low** (P3) | Update `test_accuracy.py` agar fleksibel mendukung port frontend `3010/nlp` dan tambahkan test case ke-11 khusus untuk memvalidasi kasus URL Filipina ini (TDD). |

| **BUG-06** | **NLP & Spatial Mapping**<br>`extractors.py`, `pipeline.py`,<br>`AseanMap.tsx`, `analyze/page.tsx` | Artikel memuat wabah di banyak kota (misal 6 kota), tetapi peta spasial hanya menampilkan 1 pin lokasi (*Single-Location Bottleneck*). Wilayah lain tidak terpetakan. | **Winner-Takes-All Reduction**: Fungsi extract_location() mereduksi semua kandidat lokasi yang ditemukan menjadi hanya 1 lokasi via max(). Skema API dan visualisasi peta belum mendukung multi-marker per artikel berita. | **High** (P1) | 1. Tambahkan fungsi extract_all_locations() di NLP untuk menangkap semua lokasi valid.<br>2. Tambahkan list locations di response API.<br>3. Tampilkan multi-badge lokasi di UI dan plot seluruh pin lokasi di AseanMap.tsx. |
| **BUG-07** | **NLP Labeling & Gazetteer Filter**<br>`extractors.py`, `pipeline.py`,<br>`config.py`, `030_campak_outbreak_rule.sql` | Pada artikel campak Indonesia (`rsroemani.com`), nama penyakit terdeteksi sebagai bahasa campuran `"measles campak"` (bukan `"Campak"`), dan lokasi utama terdeteksi sebagai desa ambigu `"Buka"` (dari jam buka operasional) alih-alih `"Semarang"`. | **Zero-Shot Label Leakage & Common-Word Collision**: 1. Label klasifikasi zero-shot berupa token hybrid `"measles campak"` tanpa normalisasi display bahasa lokal.<br>2. Belum ada rule `CAMPAK` di tabel `disease_outbreak_rules`.<br>3. Kata operasional umum (`buka`, `poli`, `luar`, `kenali`, `jaga`, `sumber`) bertabrakan dengan nama desa kecil di database lokasi. | **High** (P1) | 1. Tambahkan normalisasi label `normalize_disease_display()` di `extractors.py` & `pipeline.py` agar `"measles campak"` dikonversi ke `"Campak"`.<br>2. Tambahkan kata umum ke `LOCATION_STOPWORDS` di `config.py` dan filter di `extractors.py`.<br>3. Tambahkan migrasi `030_campak_outbreak_rule.sql` untuk `CAMPAK` di `disease_outbreak_rules`. |

---

## 2. Alur Pembuktian TDD (Test-Driven Development)

1. **Fase RED (Gagal):**
   - Menambahkan test case baru di `test_accuracy.py`:
     - **URL:** `https://denguevisualatlas.com/en/dengue-in-the-philippines-2026/`
     - **Expected Country:** `Philippines`
     - **Expected Location:** `Davao` atau `Davao de Oro` atau `Central Luzon`
     - **Expected Disease:** `dengue fever DBD`
   - Menjalankan test case dan memastikan test **FAIL** (saat ini terdeteksi Indonesia / Oro).

2. **Fase GREEN (Perbaikan & Berhasil):**
   - Terapkan perbaikan BUG-01 (Filter kebocoran negara) dan BUG-02 (Tie-breaker).
   - Terapkan perbaikan BUG-03 (Migrasi DB gazetteer lokasi Filipina).
   - Jalankan ulang test case dan pastikan hasilnya **PASS** (`country: Philippines`).

3. **Fase REFACTOR:**
   - Bersihkan cache database lama.
   - Restart service NLP dan verifikasi tampilan di browser (`http://localhost:3010/nlp/analyze`).
