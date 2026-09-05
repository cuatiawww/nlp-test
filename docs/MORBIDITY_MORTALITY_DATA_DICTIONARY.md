# Dokumentasi dan Kamus Variabel: Morbidity & Mortality

Dokumen ini menjelaskan secara rinci asal-usul data, definisi variabel, alur pemrosesan NLP, dan logika perhitungan dari fitur **Morbidity & Mortality (Morbiditas & Mortalitas)** pada Dashboard Epidemiologi.

---

## 1. Ringkasan Fitur

| Atribut | Keterangan |
|---|---|
| **Nama Komponen** | `MorbidityMortalitySection.tsx` |
| **Lokasi di Dashboard** | Terletak tepat di bawah section *Disease Trend Overview* pada `services/frontend-next/app/page.tsx` |
| **Tujuan Bisnis** | 1. Memantau perbandingan antara **Morbiditas (jumlah kasus kesakitan)** dan **Mortalitas (jumlah kematian)**.<br>2. Menghitung **Case Fatality Rate (CFR %)** secara otomatis baik secara agregat, deret waktu mingguan, maupun spesifik per jenis penyakit (misal: berapa kasus DBD dan berapa kematiannya).<br>3. Menyajikan komparasi horizontal *Butterfly Bar Chart* beban morbiditas vs mortalitas seluruh penyakit prioritas. |
| **Dasar Penentuan Data** | 100% data riil hasil crawling artikel berita/kesehatan publik yang diekstraksi oleh Service NLP ke kolom `case_count` dan `death_count` pada tabel `disease_events`. |
| **Endpoint Backend** | `GET /api/v1/morbidity-mortality?disease={DISEASE}&weeks={WEEKS}` di `services/backend-rust/src/main.rs`. |

---

## 2. Alur Pengambilan & Transformasi Data (End-to-End)

```text
1. DATA CRAWLING
   ?? Mengumpulkan artikel berita dan laporan surveilans berkala di ASEAN
   ?? Menangkap narasi teks berita beserta tanggal publikasi (`published_at`)
         ?
2. SERVICE NLP (Python FastText + DistilBERT + Heuristik)
   ?? Mengekstrak angka morbiditas (kasus positif/terkonfirmasi/rawat inap) -> `case_count`
   ?? Mengekstrak angka mortalitas (meninggal dunia/korban jiwa) -> `death_count`
   ?? Mengklasifikasikan nama penyakit (ICD-11) -> `disease_classification`
   ?? Menyimpan record terverifikasi ke tabel `disease_events`
         ?
3. BACKEND RUST (`morbidity_mortality_handler`)
   ?? Menerima query parameter `disease` (default: 'all', atau 'dbd', 'campak', dll.) dan `weeks` (default: 12)
   ?? Menghitung total morbiditas, total mortalitas, dan CFR agregat
   ?? Mengelompokkan deret waktu mingguan (`EXTRACT(WEEK FROM published_at)`) untuk 12 minggu terakhir
   ?? Mengagregasi per jenis penyakit standar (Dengue, HFMD, Campak, COVID-19, Influenza, Rabies, Kolera, dll.)
   ?? Mengembalikan respons JSON terstruktur
         ?
4. FRONTEND NEXT.JS (`MorbidityMortalitySection.tsx`)
   ?? Menampilkan 3 kartu KPI: Total Morbidity, Total Mortality, dan CFR (%)
   ?? Merender panel tengah: Grafik area + garis sumbu ganda (*Dual Y-Axis*) tren mingguan
   ?? Merender panel kanan: Diagram batang komparatif (*Butterfly Bar Chart*) kasus vs kematian per penyakit
```

---

## 3. Kamus Variabel Lengkap (Data Dictionary)

### A. 3 Kartu Sorotan KPI Utama

| Label di Tampilan (UI) | Variabel JSON | Tipe Data | Sumber Data / Kolom Asal | Rumus / Logika Perhitungan | Keterangan Bisnis |
|---|---|---|---|---|---|
| **TOTAL MORBIDITY** | `summary.total_morbidity` | `BigInt` | `disease_events.case_count` | `SUM(GREATEST(COALESCE(case_count, 0), 0))` | Akumulasi total pasien sakit / kasus terdeteksi untuk penyakit yang dipilih |
| **TOTAL MORTALITY** | `summary.total_mortality` | `BigInt` | `disease_events.death_count` | `SUM(GREATEST(COALESCE(death_count, 0), 0))` | Akumulasi total korban meninggal dunia yang terlapor untuk penyakit yang dipilih |
| **CASE FATALITY RATE (CFR)** | `summary.cfr_pct` | `Float` | Rasio `total_mortality` / `total_morbidity` | `ROUND((SUM(death_count) / NULLIF(SUM(case_count), 0)) * 100, 2)` | Tingkat keparahan fatalitas klinis penyakit (persentase pasien yang meninggal dari total kasus sakit) |

---

### B. Grafik Tren Mingguan (*Weekly Trend of Morbidity and Mortality*)

Grafik pada panel tengah menggunakan sumbu ganda (*Dual Y-Axis*) untuk membandingkan skala kasus (ribuan/jutaan) dengan skala kematian (puluhan/ribuan) tanpa kehilangan detail visual:

| Variabel Grafik | Key JSON | Posisi Sumbu | Warna Kurva | Definisi & Penjelasan |
|---|---|---|---|---|
| **Periode Minggu** | `week_label` | Sumbu X Bawah | Teks Abu-abu | Label format `W## Mon` (contoh: `W28 Jul`, `W32 Aug`, `W36 Aug`) |
| **Morbiditas (Kasus)** | `morbidity` | Sumbu Y Kiri | Area Biru Gradasi (`#0284c7`) | Jumlah kasus sakit yang dipublikasikan pada minggu tersebut |
| **Mortalitas (Kematian)** | `mortality` | Sumbu Y Kanan | Garis Merah Solid (`#e11d48`) | Jumlah kematian yang dipublikasikan pada minggu tersebut |
| **CFR Mingguan** | `cfr_pct` | Tooltip Popover | Badge Khusus | Tingkat fatalitas spesifik pada minggu tersebut: $rac{	ext{Kematian Minggu Ini}}{	ext{Kasus Minggu Ini}} 	imes 100\%$ |

---

### C. Komparasi Kasus & Kematian per Penyakit (*Top Diseases by Cases and Deaths*)

Panel kanan menyajikan rasio komparatif kasus vs kematian untuk setiap penyakit prioritas:

| Kolom Tampilan | Variabel JSON | Sumber Data | Logika Perhitungan |
|---|---|---|---|
| **Nama Penyakit** | `disease` | `standard_disease` | Normalisasi nama: `Demam Berdarah (DBD)`, `HFMD (Flu Singapura)`, `Campak (Measles)`, `COVID-19`, `Influenza`, `Rabies`, `Kolera (Cholera)`, dll. |
| **Total Cases (Batang Biru)** | `total_cases` | `disease_events.case_count` | Akumulasi kasus morbiditas penyakit tersebut |
| **Total Deaths (Batang Merah)** | `total_deaths` | `disease_events.death_count` | Akumulasi kematian mortalitas penyakit tersebut |
| **Badge CFR (%)** | `cfr_pct` | Rasio kasus & kematian | $rac{	ext{Total Deaths}}{	ext{Total Cases}} 	imes 100\%$ (Diberi warna merah jika $> 5\%$, kuning jika $> 0\%$, dan netral jika $0\%$) |

> ?? **Interaktivitas**: Mengklik salah satu baris penyakit pada panel kanan akan langsung mengubah filter dropdown dan memperbarui kurva tren mingguan khusus untuk penyakit tersebut (misal: klik DBD -> menampilkan tren mingguan DBD).

---

## 4. Kueri SQL Aktual di Backend Rust

Berikut adalah kueri PostgreSQL yang dieksekusi oleh fungsi `morbidity_mortality_handler` pada `services/backend-rust/src/main.rs`:

### A. Kueri Ringkasan Agregat (Summary):
```sql
SELECT 
  SUM(GREATEST(COALESCE(case_count, 0), 0))::bigint as total_morbidity,
  SUM(GREATEST(COALESCE(death_count, 0), 0))::bigint as total_mortality,
  COALESCE(ROUND((SUM(GREATEST(COALESCE(death_count, 0), 0))::numeric / NULLIF(SUM(GREATEST(COALESCE(case_count, 0)), 0)) * 100, 2), 0)::float8 as cfr_pct
FROM disease_events e
WHERE (e.is_health_related = TRUE OR LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api'))
  AND (
    $1 = 'all' OR
    ($1 = 'dbd' AND (LOWER(e.disease_classification) LIKE '%dengue%' OR UPPER(e.disease_classification) = 'DBD')) OR
    ($1 = 'campak' AND (LOWER(e.disease_classification) LIKE '%measles%' OR LOWER(e.disease_classification) LIKE '%campak%')) OR
    ($1 = 'hfmd' AND (LOWER(e.disease_classification) LIKE '%hand foot%' OR LOWER(e.disease_classification) LIKE '%hfmd%')) OR
    ($1 = 'covid' AND (LOWER(e.disease_classification) LIKE '%covid%' OR LOWER(e.disease_classification) LIKE '%corona%')) OR
    ($1 = 'rabies' AND LOWER(e.disease_classification) LIKE '%rabies%') OR
    ($1 = 'influenza' AND (LOWER(e.disease_classification) LIKE '%flu%' OR LOWER(e.disease_classification) LIKE '%influenza%')) OR
    ($1 = 'cholera' AND (LOWER(e.disease_classification) LIKE '%cholera%' OR LOWER(e.disease_classification) LIKE '%kolera%')) OR
    LOWER(e.disease_classification) LIKE '%' || $1 || '%'
  );
```

### B. Kueri Deret Waktu Mingguan (Weekly Trend):
```sql
WITH max_d AS (
  SELECT COALESCE(MAX(published_at), CURRENT_DATE) as end_date FROM disease_events WHERE published_at IS NOT NULL
), weekly AS (
  SELECT 
    EXTRACT(YEAR FROM e.published_at)::int as year_num,
    EXTRACT(WEEK FROM e.published_at)::int as week_num,
    'W' || EXTRACT(WEEK FROM e.published_at)::text || ' ' || TO_CHAR(MIN(e.published_at), 'Mon') as week_label,
    MIN(e.published_at) as week_start,
    SUM(GREATEST(COALESCE(e.case_count, 0), 0))::bigint as morbidity,
    SUM(GREATEST(COALESCE(e.death_count, 0), 0))::bigint as mortality
  FROM disease_events e, max_d
  WHERE e.published_at IS NOT NULL
    AND e.published_at >= (max_d.end_date - make_interval(weeks => $2))
    AND e.published_at <= max_d.end_date
    AND (e.is_health_related = TRUE OR LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api'))
    AND (
      $1 = 'all' OR
      ($1 = 'dbd' AND (LOWER(e.disease_classification) LIKE '%dengue%' OR UPPER(e.disease_classification) = 'DBD')) OR
      ($1 = 'campak' AND (LOWER(e.disease_classification) LIKE '%measles%' OR LOWER(e.disease_classification) LIKE '%campak%')) OR
      ($1 = 'hfmd' AND (LOWER(e.disease_classification) LIKE '%hand foot%' OR LOWER(e.disease_classification) LIKE '%hfmd%')) OR
      ($1 = 'covid' AND (LOWER(e.disease_classification) LIKE '%covid%' OR LOWER(e.disease_classification) LIKE '%corona%')) OR
      ($1 = 'rabies' AND LOWER(e.disease_classification) LIKE '%rabies%') OR
      ($1 = 'influenza' AND (LOWER(e.disease_classification) LIKE '%flu%' OR LOWER(e.disease_classification) LIKE '%influenza%')) OR
      ($1 = 'cholera' AND (LOWER(e.disease_classification) LIKE '%cholera%' OR LOWER(e.disease_classification) LIKE '%kolera%')) OR
      LOWER(e.disease_classification) LIKE '%' || $1 || '%'
    )
  GROUP BY 1, 2, EXTRACT(WEEK FROM e.published_at)
  ORDER BY 1, 2
)
SELECT year_num, week_num, week_label, morbidity, mortality,
       COALESCE(ROUND((mortality::numeric / NULLIF(morbidity, 0)) * 100, 2), 0)::float8 as cfr_pct
FROM weekly;
```

---

## 5. Cara Pengujian & Verifikasi Mandiri

### A. Uji Respons API via cURL
1. **Untuk Semua Penyakit**:
```bash
curl -s "http://127.0.0.1:8081/api/v1/morbidity-mortality?weeks=12" | jq .summary
```
2. **Khusus Demam Berdarah (DBD)**:
```bash
curl -s "http://127.0.0.1:8081/api/v1/morbidity-mortality?disease=dbd&weeks=12" | jq .summary
```
Respons akan menunjukkan:
- `total_morbidity: 2855550`
- `total_mortality: 427`
- `cfr_pct: 0.01`

### B. Uji Nilai Database PostgreSQL Langsung
Untuk membuktikan angka kasus dan kematian DBD:
```bash
docker exec -i db-postgres psql -U postgres -d disease_ai -c "
SELECT 
  SUM(case_count) as total_kasus_dbd, 
  SUM(death_count) as total_kematian_dbd,
  ROUND((SUM(death_count)::numeric / NULLIF(SUM(case_count), 0)) * 100, 2) as cfr_dbd
FROM disease_events 
WHERE LOWER(disease_classification) LIKE '%dengue%' OR UPPER(disease_classification) = 'DBD';
"
```
Nilai yang keluar dari database PostgreSQL sama persis dengan angka yang tampil pada kartu KPI dan tabel dashboard.
