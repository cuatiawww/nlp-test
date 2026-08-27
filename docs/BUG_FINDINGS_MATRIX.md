# Matriks Temuan Bug & Rencana Penyelesaian
**Sistem:** Disease Surveillance AI (NLP-PENYAKIT)  
**Dokumen:** Hasil Analisis Bug Pipeline Analisis URL & Ekstraksi Lokasi  
**Tanggal:** 27 Agustus 2026  
**Status:** Siap Diimplementasikan (TDD)

---

## 1. Matriks Temuan Bug

| ID | Komponen & File | Gejala / Dampak | Akar Masalah (Root Cause) | Tingkat Keparahan | Rencana Penyelesaian |
|---|---|---|---|---|---|
| **BUG-01** | **NLP Extractor**<br>`services/nlp-python/app/extractors.py`<br>*(Line 158)* | URL berita Filipina (`dengue-in-the-philippines-2026`) salah terdeteksi sebagai **Indonesia**. | **Country Filter Leak**: Baris `loc = folded_names.get(match.group(0).lower(), match.group(0))` mengembalikan default string saat token tidak ada di `folded_names`. Kata `"Oro"` (desa di Jatim) tetap lolos meskipun negara artikel sudah diketahui adalah `Philippines`. | **Critical** (P0) | Ubah logic pencocokan agar jika `country` ditentukan dan token tidak ada di `folded_names`, proses langsung melakukan `continue` (skip). |
| **BUG-02** | **NLP Tie-Breaker**<br>`services/nlp-python/app/extractors.py`<br>*(Line 200)* | Lokasi pelengkap di kalimat terakhir selalu mengalahkan lokasi utama di judul / lead paragraph. | **Posisi Karakter Terakhir Menang**: `max(hits, key=lambda item: (counts[item[0]], item[1], len(item[0])))` memenangkan `item[1]` (indeks karakter) terbesar. Kata `"Oro"` berada di posisi 543 (paling belakang) sehingga mengalahkan Mandaluyong, Zamboanga, Cebu, dan Davao. | **High** (P1) | Perbaiki bobot penentuan lokasi: Berikan prioritas pada lokasi yang muncul di judul artikel / awal paragraf, atau gunakan indeks kemunculan pertama (`-item[1]`). |
| **BUG-03** | **Database Gazetteer**<br>Tabel `locations` & SQL init | Frasa "Davao de Oro" terpecah menjadi "Davao" dan "Oro" (desa di Indonesia). | **Entri Provinsi Belum Lengkap**: Di database `locations`, entri "Davao de Oro" (provinsi berpenduduk >700 ribu di Filipina) belum ada. Hanya ada "Davao" dan entri ambigu "Oro" (Indonesia). | **Medium** (P2) | Buat migrasi SQL baru `029_philippines_locations_fix.sql` untuk menambahkan `Davao de Oro`, `Central Luzon`, `Calabarzon`, dll., serta me-nonaktifkan kata pendek 3-huruf yang ambigu tanpa awalan. |
| **BUG-04** | **Database Cache**<br>Tabel `disease_events` & `raw_reports` | Hasil analisis lama yang salah tetap muncul di UI meskipun kode sudah diperbaiki. | **7-Days Cache Hit**: Backend Rust memiliki logic cache 7 hari. Data analisis lama yang menyimpan `location_name = 'oro'` terus dikembalikan ke frontend tanpa menjalankan ulang pipeline NLP. | **Medium** (P2) | Buat script / query pembersihan cache untuk URL terkait (`dengue-in-the-philippines-2026`) agar dievaluasi ulang dengan pipeline yang sudah diperbaiki. |
| **BUG-05** | **Test Suite Accuracy**<br>`test_accuracy.py`<br>*(Line 11)* | Menjalankan `python3 test_accuracy.py` menghasilkan error `Connection refused` 10/10. | **Hardcoded Internal Port**: Script mengarah ke `http://localhost:8081/api/v1/analyze-url`, padahal port 8081 adalah internal Docker dan tidak diekspos ke host. Port publik yang aktif adalah `http://localhost:3010/nlp/api/v1/analyze-url`. | **Low** (P3) | Update `test_accuracy.py` agar fleksibel mendukung port frontend `3010/nlp` dan tambahkan test case ke-11 khusus untuk memvalidasi kasus URL Filipina ini (TDD). |

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
