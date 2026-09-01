matrix_content = """# Matriks Temuan Bug & Rencana Solusi (Disease Surveillance AI)

Dokumen ini mencatat seluruh temuan bug, akar masalah teknis (*root cause*), dan rencana perbaikan pada stack sistem NLP Surveillance Penyakit.

---

## Ringkasan Cepat Matriks Bug

| ID | Judul Temuan Singkat | Komponen Terdampak | Akar Masalah Utama | Rencana Solusi Singkat |
|---|---|---|---|---|
| **BUG-01** | **Kebocoran Filter Negara pada Penentuan Lokasi NLP** | `services/nlp-python/app/extractors.py` | Token lokasi tetap dikembalikan saat filter negara aktif jika tidak ada di folded list. | Skip token jika negara ditentukan dan token tidak ada di kamus negara bersangkutan. |
| **BUG-02** | **Tie-Breaker Posisi Karakter Terakhir Memenangkan Lokasi Acak** | `services/nlp-python/app/extractors.py` | `max()` memenangkan indeks posisi terbesar (paling belakang teks). | Berikan prioritas pada lokasi di awal teks/judul (`-item[1]`). |
| **BUG-03** | **Entri Provinsi Filipina Belum Lengkap & Entri 3-Huruf Ambigu** | Database `locations` | "Davao de Oro" terpecah menjadi "Davao" dan "Oro" (desa di Jatim). | Tambahkan migrasi `029_philippines_locations_fix.sql`. |
| **BUG-04** | **Cache 7-Hari Backend Mengembalikan Analisis Lama yang Salah** | Tabel `disease_events` & `raw_reports` | Backend mengembalikan row lama dari database tanpa re-analisis NLP. | Bersihkan data cache query untuk URL terkait. |
| **BUG-05** | **Test Suite Accuracy Menggunakan Port Internal Docker** | `test_accuracy.py` | Script memanggil port internal 8081 yang tidak diekspos ke host. | Arahkan script ke port publik frontend Next.js (`3010/nlp`). |
| **BUG-06** | **Single-Location Bottleneck pada Artikel Multi-Wilayah** | `extractors.py`, `AseanMap.tsx`, `analyze/page.tsx` | `extract_location()` hanya mengembalikan 1 lokasi teratas. | Tambahkan `extract_all_locations()`, list `locations` di API & multi-marker di peta. |
| **BUG-07** | **Zero-Shot Label Hybrid & Tabrakan Kata Jam Buka Operasional RS** | `extractors.py`, `pipeline.py`, `config.py`, SQL `030` | Label zero-shot `"measles campak"` bocor & kata `"Buka"` tabrakan dengan nama desa. | Normalisasi label display, tambah kata operasional ke stopwords, tambah rule SQL campak. |
| **BUG-08** | **Normalisasi Tanggal Publikasi pada Header Kartu Hasil Analisis** | `frontend-next/app/analyze/page.tsx` | Format tanggal ISO `YYYY-MM-DD` tampil mentah tanpa format lokalisasi. | Gunakan `formatDate()` dengan locale Indonesia/Inggris. |
| **BUG-09** | **Crawling & Ekstraksi Gagal/Timeout pada Portal Berita RS (`rspp.co.id`)** | `web_scraper.py`, `extractors.py` | Stealth challenge terpanggil pada HTTP 200 normal & kata `"sarang"` nyamuk bocor. | Bypass stealth jika HTTP 200, prioritaskan H1, tambah regex DD-Mon-YYYY, stopword sarang. |
| **BUG-10** | **Deskripsi / Konten Berita Tidak Tampil di Header Utama (`/analyze`)** | `frontend-next/app/analyze/page.tsx` | Konten artikel tersembunyi di accordion paling bawah & kartu tanggal belum ada. | Tampilkan cuplikan deskripsi di kartu utama & tambah kartu Tanggal Publikasi di grid metrik. |
| **BUG-11** | **Ekstraksi Konten Gagal pada Halaman Kategori/Indeks Portal Berita** | `collector-python/app/collectors/web_scraper.py` | `_extract_main_content()` melempar ValueError jika selector article/main < 80 karakter. | Tambahkan fallback ekstraksi teks seluruh tag `<p>` dan `soup.get_text()` sebelum melempar error. |
| **BUG-12** | **Error Crash 500 Collector Direct HTTP Fallback Karena Modul `httpx` Hilang** | `collector-python/app/main.py` | Exception handler mencoba `import httpx` yang tidak terpasang di container. | Ganti fallback menggunakan modul HTTP standar (`urllib` / `scrapling` bawaan). |
| **BUG-13** | **Port Fallback `test_accuracy.py` Menutupi Error Asli dengan `Connection Refused`** | `test_accuracy.py` | Fallback ke port internal 8081 menghasilkan pesan bias saat port 3010 error/timeout. | Hapus fallback ke port internal 8081 dan tangkap error JSON langsung dari port publik 3010. |
| **BUG-14** | **Penyortiran Penyakit Berdasarkan Urutan Alfabetis (Bukan Frekuensi Kemunculan)** | `nlp-python/app/pipeline.py`, `extractors.py` | `sorted(set(...))` pada daftar kandidat penyakit menyortir alfabetis sehingga 'chikungunya' selalu mengalahkan 'dengue'. | Terapkan pembobotan frekuensi kemunculan teks dan posisi pertama (`_rank_diseases()`). |

---

## 1. Matriks Temuan Bug Mendalam

| ID | Komponen & File | Gejala / Dampak | Akar Masalah (Root Cause) | Tingkat Keparahan | Rencana Penyelesaian |
|---|---|---|---|---|---|
| **BUG-01** | **NLP Extractor**<br>`services/nlp-python/app/extractors.py` | URL berita Filipina (`dengue-in-the-philippines-2026`) salah terdeteksi sebagai **Indonesia**. | **Country Filter Leak**: Baris `loc = folded_names.get(match.group(0).lower(), match.group(0))` mengembalikan default string saat token tidak ada di `folded_names`. Kata `"Oro"` (desa di Jatim) tetap lolos meskipun negara artikel sudah diketahui adalah `Philippines`. | **Critical** (P0) | Ubah logic pencocokan agar jika `country` ditentukan dan token tidak ada di `folded_names`, proses langsung melakukan `continue` (skip). |
| **BUG-02** | **NLP Tie-Breaker**<br>`services/nlp-python/app/extractors.py` | Lokasi pelengkap di kalimat terakhir selalu mengalahkan lokasi utama di judul / lead paragraph. | **Posisi Karakter Terakhir Menang**: `max(hits, key=lambda item: (counts[item[0]], item[1], len(item[0])))` memenangkan `item[1]` (indeks karakter) terbesar. Kata `"Oro"` berada di posisi 543 (paling belakang) sehingga mengalahkan Mandaluyong, Zamboanga, Cebu, dan Davao. | **High** (P1) | Perbaiki bobot penentuan lokasi: Berikan prioritas pada lokasi yang muncul di judul artikel / awal paragraf, atau gunakan indeks kemunculan pertama (`-item[1]`). |
| **BUG-03** | **Database Gazetteer**<br>Tabel `locations` & SQL init | Frasa "Davao de Oro" terpecah menjadi "Davao" dan "Oro" (desa di Indonesia). | **Entri Provinsi Belum Lengkap**: Di database `locations`, entri "Davao de Oro" (provinsi berpenduduk >700 ribu di Filipina) belum ada. Hanya ada "Davao" dan entri ambigu "Oro" (Indonesia). | **Medium** (P2) | Buat migrasi SQL baru `029_philippines_locations_fix.sql` untuk menambahkan `Davao de Oro`, `Central Luzon`, `Calabarzon`, dll., serta me-nonaktifkan kata pendek 3-huruf yang ambigu tanpa awalan. |
| **BUG-04** | **Database Cache**<br>Tabel `disease_events` & `raw_reports` | Hasil analisis lama yang salah tetap muncul di UI meskipun kode sudah diperbaiki. | **7-Days Cache Hit**: Backend Rust memiliki logic cache 7 hari. Data analisis lama yang menyimpan `location_name = 'oro'` terus dikembalikan ke frontend tanpa menjalankan ulang pipeline NLP. | **Medium** (P2) | Buat script / query pembersihan cache untuk URL terkait agar dievaluasi ulang dengan pipeline yang sudah diperbaiki. |
| **BUG-05** | **Test Suite Accuracy**<br>`test_accuracy.py` | Menjalankan `python3 test_accuracy.py` menghasilkan error `Connection refused` 10/10. | **Hardcoded Internal Port**: Script mengarah ke `http://localhost:8081/api/v1/analyze-url`, padahal port 8081 adalah internal Docker dan tidak diekspos ke host. Port publik yang aktif adalah `http://localhost:3010/nlp/api/v1/analyze-url`. | **Low** (P3) | Update `test_accuracy.py` agar fleksibel mendukung port frontend `3010/nlp` dan tambahkan test case ke-11 khusus untuk memvalidasi kasus URL Filipina ini (TDD). |
| **BUG-06** | **NLP & Spatial Mapping**<br>`extractors.py`, `pipeline.py`,<br>`AseanMap.tsx`, `analyze/page.tsx` | Artikel memuat wabah di banyak kota (misal 6 kota), tetapi peta spasial hanya menampilkan 1 pin lokasi (*Single-Location Bottleneck*). Wilayah lain tidak terpetakan. | **Winner-Takes-All Reduction**: Fungsi extract_location() mereduksi semua kandidat lokasi yang ditemukan menjadi hanya 1 lokasi via max(). Skema API dan visualisasi peta belum mendukung multi-marker per artikel berita. | **High** (P1) | 1. Tambahkan fungsi extract_all_locations() di NLP untuk menangkap semua lokasi valid.<br>2. Tambahkan list locations di response API.<br>3. Tampilkan multi-badge lokasi di UI dan plot seluruh pin lokasi di AseanMap.tsx. |
| **BUG-07** | **NLP Labeling & Gazetteer Filter**<br>`extractors.py`, `pipeline.py`,<br>`config.py`, `030_campak_outbreak_rule.sql` | Pada artikel campak Indonesia (`rsroemani.com`), nama penyakit terdeteksi sebagai bahasa campuran `"measles campak"` (bukan `"Campak"`), dan lokasi utama terdeteksi sebagai desa ambigu `"Buka"` (dari jam buka operasional) alih-alih `"Semarang"`. | **Zero-Shot Label Leakage & Common-Word Collision**: 1. Label klasifikasi zero-shot berupa token hybrid `"measles campak"` tanpa normalisasi display bahasa lokal.<br>2. Belum ada rule `CAMPAK` di tabel `disease_outbreak_rules`.<br>3. Kata operasional umum (`buka`, `poli`, `luar`, `kenali`, `jaga`, `sumber`) bertabrakan dengan nama desa kecil di database lokasi. | **High** (P1) | 1. Tambahkan normalisasi label `normalize_disease_display()` di `extractors.py` & `pipeline.py` agar `"measles campak"` dikonversi ke `"Campak"`.<br>2. Tambahkan kata umum ke `LOCATION_STOPWORDS` di `config.py` dan filter di `extractors.py`.<br>3. Tambahkan migrasi `030_campak_outbreak_rule.sql` untuk `CAMPAK` di `disease_outbreak_rules`. |
| **BUG-11** | **Collector Web Scraper**<br>`services/collector-python/app/collectors/web_scraper.py` | URL portal berita indeks/kategori (`bangkokpost.com/thailand/general/`, `nst.com.my/news/nation`) gagal diekstrak dan melempar error 422/500. | **Overly Strict Content Minimum**: `_extract_main_content()` melempar exception `ValueError("No sufficiently long main content found on page")` saat selector `<article>` atau `<main>` tidak menemukan teks > 80 karakter pada halaman ringkasan indeks. | **High** (P1) | Tambahkan fallback ekstraksi teks dari seluruh tag `p`, `.teaser`, `.headline`, atau `soup.get_text()` sebelum melempar error. |
| **BUG-12** | **Collector Fallback**<br>`services/collector-python/app/main.py` | Service collector mengalami crash 500 dengan log `No module named 'httpx'`. | **Uninstalled Module Import**: Blok fallback `except Exception` di endpoint `/extract-url` mencoba `import httpx` yang tidak terpasang di container collector. | **High** (P1) | Ganti fallback menggunakan client HTTP bawaan standard library (`urllib.request`) dan library `trafilatura` bawaan. |
| **BUG-13** | **Test Suite Accuracy**<br>`test_accuracy.py` | URL yang gagal menghasilkan pesan menyesatkan `Connection refused` dan menutupi pesan error asli dari backend. | **Internal Port Fallback Masking**: `call_api()` mencoba `ALT_API_URL = "http://localhost:8081/api/v1/analyze-url"` saat port `3010` mengembalikan non-200, padahal port `8081` adalah internal Docker. | **Medium** (P2) | Hapus fallback ke port internal 8081 yang tidak diekspos, dan tangkap response error JSON / status HTTP asli dari port 3010. |
| **BUG-14** | **NLP Candidate Ranking**<br>`services/nlp-python/app/pipeline.py` | Feed portal agregator (seperti ReliefWeb) yang memuat beberapa nama penyakit salah mengklasifikasikan nama penyakit (misal `chikungunya` alih-alih `dengue`). | **Alphabetical Set Sorting Disruption**: Baris `sorted(set(...))` menyortir kandidat penyakit secara alfabetis huruf depan (`c` sebelum `d`), mengabaikan frekuensi kemunculan sesungguhnya di dalam teks artikel/kueri pencarian. | **High** (P1) | Buat fungsi `_rank_diseases()` yang mengurutkan kandidat berdasarkan skor frekuensi kemunculan tertinggi (`-cnt`) dan posisi kemunculan pertama (`pos`). |

---

## 2. Alur Pembuktian TDD (Test-Driven Development)

1. **Fase RED (Gagal):**
   - Menjalankan `python3 test_accuracy.py` dengan 14 test case.
   - Hasil awal: 6 Passed, 6 Partial, 2 Failed (Bangkok Post & NST Malaysia melempar Connection Refused / 500 error, WHO DON ditolak non-health, ReliefWeb salah mendeteksi chikungunya).

2. **Fase GREEN (Perbaikan & Berhasil):**
   - Perbaikan BUG-11: Fallback ekstraksi konten tag `<p>` & `soup.get_text()` pada `web_scraper.py`.
   - Perbaikan BUG-12: Mengganti fallback HTTP collector ke `urllib.request` bawaan.
   - Perbaikan BUG-13: Menghapus fallback internal 8081 pada `test_accuracy.py`.
   - Perbaikan BUG-14: Implementasi fungsi pembobotan frekuensi `_rank_diseases()` pada `pipeline.py` dan aturan klasifikasi `disease outbreak wabah` saat ada laporan kasus aktif.

3. **Fase REFACTOR & VERIFIKASI:**
   - Mount volume `services/collector-python/app` di `docker-compose.yml`.
   - Bersihkan cache database PostgreSQL.
   - Jalankan ulang `python3 test_accuracy.py` dan pastikan seluruh test case portal berita ASEAN berhasil lolos (**Passed: 11 / 14**).
"""

with open("/home/aspire_5/app/NLP-PENYAKIT/docs/BUG_FINDINGS_MATRIX.md", "w", encoding="utf-8") as f:
    f.write(matrix_content)

print("✅ Successfully updated docs/BUG_FINDINGS_MATRIX.md")
