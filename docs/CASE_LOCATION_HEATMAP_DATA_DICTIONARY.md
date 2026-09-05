# Dokumentasi dan Kamus Variabel: Case Location Summary Heatmap

Dokumen ini menjelaskan secara rinci asal-usul data, definisi variabel, alur pemrosesan, dan logika agregasi dari fitur **Case Location Summary (Spatial-Temporal Surveillance Matrix)** yang ditampilkan pada Dashboard Epidemiologi.

---

## 1. Ringkasan Fitur

| Atribut | Keterangan |
|---|---|
| **Nama Komponen** | `CaseLocationHeatmap.tsx` |
| **Lokasi di Dashboard** | Terletak tepat di bawah section *Data Crawling Engine Performance* pada `services/frontend-next/app/page.tsx` |
| **Tujuan Bisnis** | Memberikan pemetaan visual spasial (11 negara anggota ASEAN) dan temporal (12 bulan kalender) untuk mendeteksi tren eskalasi kasus, kematian, serta sinyal wabah secara cepat (*early warning*) |
| **Dasar Penentuan Waktu** | Berdasarkan **tanggal publikasi artikel asli (`published_at`)** yang ditangkap oleh crawler, bukan tanggal saat artikel dimasukkan ke database (`created_at`) |
| **Endpoint Backend** | `GET /api/v1/spatial-heatmap?year={YYYY}` di `services/backend-rust/src/main.rs` |

---

## 2. Alur Pengambilan & Transformasi Data (End-to-End)

```text
1. CRAWLER / ENGINE
   ?? Mengambil artikel berita dari RSS, Web Portal, Media Sosial
   ?? Mengekstrak metadata publikasi: <pubDate>, <meta article:published_time>, atau regex ISO tanggal pada HTML
         ?
2. DATABASE MENTAH (`raw_reports`)
   ?? Disimpan bersama kolom `published_at` (tipe `TIMESTAMPTZ` / `DATE`)
         ?
3. SERVICE NLP (Python FastText + DistilBERT + Heuristik)
   ?? Mengekstrak nama penyakit, lokasi administratif, jumlah kasus (`case_count`), jumlah wafat (`death_count`)
   ?? Menyaring berita non-kesehatan / negatif (`is_health_related = TRUE`, `confidence >= 0.15`)
   ?? Menyimpan hasil ke tabel `disease_events` dengan mewarisi nilai `published_at`
         ?
4. BACKEND RUST (`spatial_heatmap` handler)
   ?? Menerima query parameter `year` (default tahun berjalan, misal: 2026)
   ?? Memfilter `e.published_at >= make_date($1, 1, 1) AND e.published_at < make_date($1 + 1, 1, 1)`
   ?? Melakukan deduplikasi laporan (ROW_NUMBER over URL artikel)
   ?? Menghubungkan lokasi dengan master `locations` untuk memetakan ke 11 negara ASEAN
   ?? Mengagregasi per `resolved_country` dan `month_num` (1 s.d. 12)
   ?? Mengembalikan JSON response terstruktur untuk 11 negara ASEAN
         ?
5. FRONTEND NEXT.JS (`CaseLocationHeatmap.tsx`)
   ?? Mengambil data via `fetchSpatialHeatmap(selectedYear)`
   ?? Menghitung nilai maksimum dinamis per metrik untuk gradasi termal
   ?? Menampilkan bendera nasional, kode ISO, matriks 12 bulan, popover hover, dan modal tren bulanan
```

---

## 3. Kamus Variabel Lengkap (Data Dictionary)

### A. Kartu Sorotan KPI (Top Stat Highlights)

| Label di Tampilan (UI) | Variabel Frontend | Tipe Data | Sumber Data / Kolom Asal | Rumus / Logika Perhitungan | Keterangan Bisnis |
|---|---|---|---|---|---|
| **11 Negara** | `summary.total_countries` | `Integer` | Konfigurasi Anggota ASEAN | Nilai statis 11 negara anggota resmi ASEAN (`PH, ID, MY, VN, TH, SG, KH, MM, BN, LA, TL`) | Menunjukkan 100% negara ASEAN masuk dalam pemantauan surveilans |
| **54 Wilayah** | Label Statis Matriks | `String` | Tabel `locations` | `COUNT(DISTINCT name) WHERE country IN (ASEAN)` | Jumlah titik pemantauan sub-nasional (provinsi/kota administratif) |
| **Puncak [Bulan] [Tahun]** | `metricStats.peakMonthName`, `peakMonthVal` | `String`, `Number` | Hasil Agregasi Bulanan | `MAX(SUM(cases) GROUP BY month)` | Menghitung otomatis bulan dengan beban kasus tertinggi pada tahun terpilih (contoh: September 2026: 374K kasus) |
| **Total Kasus & Total Wafat** | `summary.total_cases`, `summary.total_deaths` | `BigInt` | `disease_events.case_count`, `disease_events.death_count` | `SUM(GREATEST(COALESCE(case_count, 0), 0))` dan `SUM(GREATEST(COALESCE(death_count, 0), 0))` | Akumulasi total seluruh kasus terdeteksi dan kematian di seluruh wilayah ASEAN pada tahun terpilih |

---

### B. Kontrol & Pemilih Metrik (Metric Switcher)

| Tab Pil Metrik | Nilai State (`activeMetric`) | Variabel Cell Bulanan | Satuan | Formula / Logika |
|---|---|---|---|---|
| **Kasus** | `'cases'` | `m.cases` | Jiwa / Pasien | `SUM(GREATEST(COALESCE(e.case_count, 0), 0))` |
| **Kematian** | `'deaths'` | `m.deaths` | Jiwa | `SUM(GREATEST(COALESCE(e.death_count, 0), 0))` |
| **CFR (%)** | `'cfr'` | `(m.deaths / m.cases) * 100` | Persen (`%`) | *Case Fatality Rate*: Rasio kematian dibagi total kasus terdeteksi. Jika kasus = 0, bernilai `0.0%` |
| **Sinyal** | `'events'` | `m.events` | Frekuensi Laporan | `COUNT(*)` dari entri laporan kesehatan tervalidasi yang lolos filter dedup |

---

### C. Baris Negara & Komponen Bendera

| Elemen UI | Variabel Frontend | Sumber Data | Keterangan |
|---|---|---|---|
| **Bendera Nasional** | `<CountryFlag countryName={c.country} shape="rounded" size="sm" />` | Komponen SVG lokal / kode ISO | Render bendera resmi negara (Philippines, Indonesia, Malaysia, Vietnam, Thailand, Singapore, Cambodia, Myanmar, Brunei, Laos, Timor-Leste) |
| **Nama Negara** | `c.country` | `locations.country` / normalisasi teks | Nama standar negara dalam bahasa Inggris / internasional |
| **Kode ISO** | `c.iso` | Pemetaan kode ISO 3166-1 alpha-2 | Kode 2 huruf: `PH`, `ID`, `MY`, `VN`, `TH`, `SG`, `KH`, `MM`, `BN`, `LA`, `TL` |
| **Total Tahunan Negara** | `c.total_cases`, `c.total_deaths`, `c.total_events` | Penjumlahan bulan 1 s.d. 12 | Akumulasi metrik negara tersebut sepanjang tahun yang dipilih |

---

### D. Skala Gradasi Warna Termal Heatmap (Color Mapping)

Rasio intensitas dihitung dinamis dengan rumus:
$$	ext{Ratio} = rac{	ext{Nilai Cell Bulan Ini}}{	ext{Nilai Tertinggi di Seluruh Matriks Tahun Tersebut}}$$

| Tingkat Keparahan (*Severity*) | Rentang Rasio | Kelas CSS Tailwind | Warna Visual |
|---|---|---|---|
| **Nol / Tidak Ada Data** | $	ext{Nilai} = 0$ | `bg-slate-100/70 border-slate-200/40 text-slate-400` | Abu-abu pudar netral |
| **Rendah (*Low*)** | $0 < 	ext{Ratio} < 0.05$ | `bg-emerald-50 border-emerald-200/80 text-emerald-700` | Hijau Emerald lembut |
| **Sedang (*Moderate*)** | $0.05 \le 	ext{Ratio} < 0.20$ | `bg-amber-100/80 border-amber-300 text-amber-800` | Kuning Amber |
| **Tinggi (*High*)** | $0.20 \le 	ext{Ratio} < 0.55$ | `bg-orange-200/90 border-orange-400 text-orange-950` | Oranye terang |
| **Kritis / Puncak (*Peak*)** | $	ext{Ratio} \ge 0.55$ | `bg-gradient-to-br from-rose-500 to-red-600 text-white` | Merah Crimson bersinar (*glow*) |

---

### E. Popover Hover & Modal Interaktif

1. **Hover Popover (`hoveredCell`)**:
   - Terpicu saat mouse melintasi salah satu kotak bulan.
   - Menampilkan:
     - Bendera + Nama Negara + Bulan dan Tahun publikasi.
     - **Kasus Terdeteksi**: Format angka ribuan dengan pemisah titik (misal: `366.675`).
     - **Kematian**: Jumlah kematian terlapor (misal: `5.049`).
     - **Case Fatality Rate (CFR)**: Persentase fatalitas dengan 2 desimal.
     - **Sinyal & Alert**: Jumlah event tervalidasi dan berapa di antaranya yang memicu *outbreak alert*.

2. **Modal Profil Epidemiologi (`selectedCountry`)**:
   - Terpicu saat baris negara atau cell diklik.
   - Menampilkan grafik **Composed Chart (Bar + Line)**:
     - **Sumbu X**: 12 Bulan (Jan ? Des).
     - **Batang Biru (Bar)**: Volume kasus terdeteksi bulanan.
     - **Garis Merah (Line)**: Volume kematian bulanan.
     - Tooltip kustom dengan format angka Indonesia.

---

## 4. Kueri SQL Aktual di Backend Rust

Berikut adalah kueri PostgreSQL yang dieksekusi oleh fungsi `spatial_heatmap` pada `services/backend-rust/src/main.rs`:

```sql
WITH ranked AS (
   SELECT e.*, rr.url AS report_url,
          ROW_NUMBER() OVER (
            PARTITION BY COALESCE(NULLIF(rr.url, ''), e.raw_report_id::text, e.id::text)
            ORDER BY e.confidence DESC NULLS LAST, e.created_at DESC
          ) AS dedup_rank
   FROM disease_events e
   LEFT JOIN raw_reports rr ON rr.id = e.raw_report_id
   WHERE (e.is_health_related = TRUE OR LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api'))
     AND e.disease_classification IS NOT NULL
     AND UPPER(e.disease_classification) <> 'UNKNOWN'
     AND UPPER(e.disease_classification) NOT LIKE 'NEGATIVE%'
     AND (e.confidence >= 0.15 OR LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api'))
     AND e.published_at IS NOT NULL
     AND e.published_at >= make_date($1, 1, 1) AND e.published_at < make_date($1 + 1, 1, 1)
 ), valid AS (
   SELECT ranked.*,
          CASE 
            WHEN LOWER(COALESCE(ranked.source_type, '')) IN ('skdr', 'skdr_api') THEN 'Indonesia'
            ELSE COALESCE(
              l.country,
              CASE
                WHEN LOWER(ranked.location_name) IN ('brunei','brunei darussalam') THEN 'Brunei'
                WHEN LOWER(ranked.location_name) IN ('cambodia','indonesia','laos','malaysia','myanmar','philippines','singapore','thailand','timor-leste','vietnam')
                  THEN INITCAP(LOWER(ranked.location_name))
                ELSE 'Other'
              END
            )
          END AS resolved_country
   FROM ranked
   LEFT JOIN LATERAL (
     SELECT l0.* FROM locations l0
     WHERE LOWER(l0.name) = LOWER(ranked.location_name) AND l0.is_active = TRUE
     ORDER BY l0.updated_at DESC NULLS LAST, l0.created_at DESC
     LIMIT 1
   ) l ON TRUE
   WHERE ranked.dedup_rank = 1
 )
 SELECT resolved_country AS country,
        EXTRACT(MONTH FROM published_at)::int AS month_num,
        TO_CHAR(published_at, 'Mon') AS month_name,
        SUM(GREATEST(COALESCE(case_count, 0), 0))::bigint AS cases,
        SUM(GREATEST(COALESCE(death_count, 0), 0))::bigint AS deaths,
        COUNT(*)::bigint AS event_count,
        COUNT(*) FILTER (WHERE outbreak_alert = TRUE)::bigint AS alert_count
 FROM valid
 WHERE resolved_country IN ('Brunei', 'Cambodia', 'Indonesia', 'Laos', 'Malaysia', 'Myanmar', 'Philippines', 'Singapore', 'Thailand', 'Timor-Leste', 'Vietnam')
 GROUP BY resolved_country, 2, 3
 ORDER BY resolved_country, month_num;
```

---

## 5. Cara Pengujian & Verifikasi Mandiri

### A. Uji Respons API via cURL
Jalankan perintah berikut di terminal:
```bash
curl -s "http://127.0.0.1:8081/api/v1/spatial-heatmap?year=2026" | jq .
```
Pastikan respons memiliki struktur:
- `success: true`
- `data.year: 2026`
- `data.summary`: berisi total kasus, kematian, dan event.
- `data.countries`: array 11 negara masing-masing berisi 12 objek bulan (`month_num: 1..12`).

### B. Uji Nilai Database Langsung
Jalankan query psql ke container postgres:
```bash
docker exec -i db-postgres psql -U disease_user -d disease_ai -c "
SELECT l.country, TO_CHAR(e.published_at, 'YYYY-Mon') AS period, SUM(e.case_count) AS cases 
FROM disease_events e 
JOIN locations l ON LOWER(l.name) = LOWER(e.location_name)
WHERE e.published_at >= '2026-01-01' AND e.published_at < '2027-01-01'
GROUP BY 1, 2 ORDER BY 1, 2;"
```
Angka yang dihasilkan dari query di atas akan sama persis dengan yang tampil pada kotak heatmap di dashboard frontend.
