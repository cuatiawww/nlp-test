# Dokumentasi dan Kamus Variabel: Disease Trend Overview

Dokumen ini menjelaskan secara rinci asal-usul data, definisi variabel, alur pemrosesan NLP, dan logika agregasi dari fitur **Disease Trend Overview (Peringatan & Tren Penyakit Per Negara)** pada Dashboard Epidemiologi.

---

## 1. Ringkasan Fitur

| Atribut | Keterangan |
|---|---|
| **Nama Komponen** | `DiseaseTrendOverview.tsx` |
| **Lokasi di Dashboard** | Terletak tepat di bawah section *Case Location Summary (Heatmap)* pada `services/frontend-next/app/page.tsx` |
| **Tujuan Bisnis** | 1. Mengidentifikasi penyakit prioritas dan **negara mana yang memiliki beban kasus terbanyak** untuk masing-masing penyakit hasil klasifikasi NLP.<br>2. Menampilkan kurva tren multi-hari kasus terdeteksi (DBD, Campak, COVID-19, Rabies, HFMD) untuk analisis dinamika transmisi. |
| **Dasar Penentuan Data** | 100% data riil hasil crawling artikel berita/kesehatan publik yang diekstraksi oleh Service NLP ke tabel `disease_events`. |
| **Endpoint Backend** | `GET /api/v1/disease-trend-overview?days={N}` di `services/backend-rust/src/main.rs` (default `days=7`). |

---

## 2. Alur Pengambilan & Transformasi Data (End-to-End)

```text
1. DATA CRAWLING
   ?? Mengumpulkan artikel berita dari RSS, Web Portal, Media Sosial di kawasan ASEAN
   ?? Menangkap metadata artikel: judul, isi berita, URL, dan tanggal publikasi (`published_at`)
         ?
2. SERVICE NLP (Python FastText + DistilBERT + Heuristik)
   ?? Mengklasifikasikan nama penyakit ke standar WHO ICD-11 (misal: "dengue fever" / "DBD" -> Demam Berdarah)
   ?? Mengekstrak entitas numerik: jumlah kasus (`case_count`) dan kematian (`death_count`)
   ?? Mengekstrak entitas geospasial: lokasi kota/provinsi/negara (`location_name`)
   ?? Menyimpan record terverifikasi ke tabel `disease_events` (hanya jika `is_health_related = TRUE` dan `confidence >= 0.15`)
         ?
3. BACKEND RUST (`disease_trend_overview` handler)
   ?? Menjalankan CTE deduplikasi (ROW_NUMBER over URL) agar artikel kutipan ulang tidak dihitung ganda
   ?? Menghubungkan ke tabel master `locations` untuk memetakan lokasi ke 11 negara ASEAN
   ?? Mengelompokkan data per jenis penyakit standar (`standard_disease`) dan per negara (`resolved_country`)
   ?? Menentukan **negara dengan beban kasus tertinggi (`top_country`)** untuk setiap penyakit
   ?? Menghitung agregat multi-hari deret waktu untuk grafik tren (`daily_trends`)
   ?? Mengembalikan respons JSON terstruktur
         ?
4. FRONTEND NEXT.JS (`DiseaseTrendOverview.tsx`)
   ?? Memanggil `fetchDiseaseTrendOverview(selectedDays)`
   ?? Menampilkan 4 kartu KPI sorotan tren
   ?? Merender panel kiri: Daftar Peringatan Prioritas (dengan bendera negara terbanyak, tanggal, severity tag, dan accordion sebaran antar negara)
   ?? Merender panel kanan: Grafik garis multi-kurva (*Line Chart*) interaktif 7/14/30 hari dengan tombol isolasi legenda
```

---

## 3. Kamus Variabel Lengkap (Data Dictionary)

### A. Kartu Sorotan KPI (Top Stat Highlights)

| Label di Tampilan (UI) | Variabel Frontend | Tipe Data | Sumber Data / Kolom Asal | Rumus / Logika Perhitungan | Keterangan Bisnis |
|---|---|---|---|---|---|
| **Total Penyakit Terpantau** | `data.summary.total_diseases` | `Integer` | Agregasi `disease_events.disease_classification` | `COUNT(DISTINCT standard_disease)` | Jumlah penyakit unik yang terdeteksi dalam database |
| **Beban Kasus Tertinggi** | `data.summary.top_burden_disease`, `top_burden_country` | `String` | Agregasi `case_count` per penyakit | Penyakit dengan akumulasi `SUM(case_count)` terbesar di seluruh ASEAN (DBD, dengan Filipina sebagai negara tertinggi) | Identifikasi ancaman wabah terbesar saat ini |
| **Konsentrasi Transmisi** | HFMD (Malaysia) | `String` | Agregasi `case_count` HFMD | Menampilkan penyakit klaster tertentu yang terkonsentrasi tinggi di satu negara | Menyorot fenomena lokal spesifik (misal: KLB HFMD) |
| **Dominasi Sinyal** | Campak & COVID-19 | `String` | Agregasi event count Indonesia | Penyakit dengan frekuensi pelaporan terbanyak di Indonesia | Memberikan konteks nasional pengguna sistem |

---

### B. Panel Peringatan Prioritas (Priority Alerts List)

Setiap entri penyakit pada panel kiri memuat variabel-variabel berikut:

| Label di Tampilan (UI) | Variabel JSON | Tipe Data | Sumber Kolom Database | Logika / Penentuan Nilai | Keterangan |
|---|---|---|---|---|---|
| **Nama Penyakit** | `disease` | `String` | `disease_events.disease_classification` | Normalisasi nama: `Demam Berdarah (DBD)`, `HFMD (Flu Singapura)`, `COVID-19`, `Campak (Measles)`, `Rabies`, dll. | Nama penyakit yang mudah dipahami |
| **Negara Terbanyak** | `top_country` | `String` | Master `locations.country` | Negara dengan nilai `SUM(case_count)` tertinggi untuk penyakit ini | **Menjawab kebutuhan utama pengguna: melihat negara mana yang paling banyak kasusnya** |
| **Bendera Negara** | `<CountryFlag countryName={item.top_country} />` | Komponen | Kode ISO `top_country_iso` | Merender bendera resmi negara terbanyak (`PH`, `MY`, `ID`, `VN`, `TH`, dll.) | Mempermudah identifikasi visual |
| **Kasus di Negara Terbanyak** | `top_country_cases` | `BigInt` | `disease_events.case_count` | `MAX(SUM(case_count) GROUP BY country)` | Angka kasus spesifik di negara pemuncak tersebut |
| **Total Kasus ASEAN** | `total_asean_cases` | `BigInt` | `disease_events.case_count` | `SUM(GREATEST(COALESCE(case_count, 0), 0))` | Akumulasi kasus dari seluruh negara ASEAN untuk penyakit ini |
| **Tanggal Deteksi Terkini** | `latest_published_label` | `String` | `disease_events.published_at` | `TO_CHAR(MAX(published_at), 'DD Mon YYYY')` | Tanggal artikel berita terbaru yang memuat laporan penyakit ini |
| **Tingkat Keparahan (Badge)** | `severity` | `Enum ('TINGGI', 'SEDANG', 'RENDAH')` | Gabungan `total_asean_cases` & `outbreak_alert` | ? `TINGGI`: Kasus $\ge 50.000$ atau ada pemicu *alert*<br>? `SEDANG`: Kasus $500 - 49.999$<br>? `RENDAH`: Kasus $< 500$ | Label peringatan visual dengan warna merah/kuning/hijau |

#### Detail Accordion Rincian Antar Negara (`country_breakdown`):
Saat baris penyakit diklik, muncul rincian seluruh negara yang terpapar penyakit tersebut:
- **`country`**: Nama negara.
- **`iso`**: Kode ISO negara.
- **`cases`**: Jumlah kasus di negara tersebut.
- **`deaths`**: Jumlah kematian di negara tersebut.
- **`pct`**: Persentase kontribusi negara tersebut terhadap total kasus ASEAN: $rac{	ext{Kasus Negara}}{	ext{Total Kasus ASEAN}} 	imes 100\%$.
- **Badge 'Terbanyak'**: Menandai negara peringkat pertama dengan warna merah khusus.

---

### C. Panel Grafik Tren Multi-Hari (Multi-Day Line Chart)

| Variabel Grafik | Key JSON | Warna Garis | Definisi / Sumber Data |
|---|---|---|---|
| **Sumbu X (Tanggal)** | `date_label` | Abu-abu (`#64748b`) | Tanggal publikasi (`DD Mon`), contoh: `29 Aug`, `30 Aug`, ..., `05 Sep` |
| **Sumbu Y (Kasus)** | Nilai Kasus | Abu-abu (`#64748b`) | Skala dinamis format ringkas (`0`, `1K`, `5K`, `100K`, `500K`, dll.) |
| **Kurva DBD** | `dbd` | Biru Langit (`#0284c7`) | Akumulasi kasus harian Demam Berdarah Dengue di seluruh ASEAN |
| **Kurva Campak** | `campak` | Oranye Amber (`#f59e0b`) | Akumulasi kasus harian Campak / Measles di seluruh ASEAN |
| **Kurva COVID-19** | `covid` | Hijau Emerald (`#10b981`) | Akumulasi kasus harian COVID-19 di seluruh ASEAN |
| **Kurva Rabies** | `rabies` | Merah Rose (`#f43f5e`) | Akumulasi kasus harian Rabies di seluruh ASEAN |
| **Kurva HFMD** | `hfmd` | Ungu Purple (`#a855f7`) | Akumulasi kasus harian Hand, Foot, and Mouth Disease |

---

## 4. Kueri SQL Aktual di Backend Rust

### A. Kueri Peringatan Prioritas dan Negara Terbanyak:
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
     AND UPPER(e.disease_classification) NOT IN ('UNKNOWN')
     AND UPPER(e.disease_classification) NOT LIKE 'NEGATIVE%'
     AND (e.confidence >= 0.15 OR LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api'))
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
          END AS resolved_country,
          CASE
            WHEN LOWER(ranked.disease_classification) LIKE '%dengue%' OR UPPER(ranked.disease_classification) = 'DBD' THEN 'Demam Berdarah (DBD)'
            WHEN LOWER(ranked.disease_classification) LIKE '%hand foot%' OR LOWER(ranked.disease_classification) LIKE '%hfmd%' THEN 'HFMD (Flu Singapura)'
            WHEN LOWER(ranked.disease_classification) LIKE '%covid%' OR LOWER(ranked.disease_classification) LIKE '%corona%' THEN 'COVID-19'
            WHEN LOWER(ranked.disease_classification) LIKE '%measles%' OR LOWER(ranked.disease_classification) LIKE '%campak%' THEN 'Campak (Measles)'
            WHEN LOWER(ranked.disease_classification) LIKE '%rabies%' THEN 'Rabies'
            WHEN LOWER(ranked.disease_classification) LIKE '%chikungunya%' THEN 'Chikungunya'
            WHEN LOWER(ranked.disease_classification) LIKE '%avian%' OR LOWER(ranked.disease_classification) LIKE '%h5n1%' THEN 'Flu Burung (H5N1)'
            WHEN LOWER(ranked.disease_classification) LIKE '%flu%' OR LOWER(ranked.disease_classification) LIKE '%influenza%' THEN 'Influenza'
            WHEN LOWER(ranked.disease_classification) LIKE '%filariasis%' THEN 'Filariasis'
            WHEN LOWER(ranked.disease_classification) LIKE '%leptospirosis%' THEN 'Leptospirosis'
            WHEN LOWER(ranked.disease_classification) LIKE '%tbc%' OR LOWER(ranked.disease_classification) LIKE '%tuberkulosis%' OR LOWER(ranked.disease_classification) LIKE '%tuberculosis%' THEN 'Tuberkulosis (TBC)'
            WHEN LOWER(ranked.disease_classification) LIKE '%cholera%' OR LOWER(ranked.disease_classification) LIKE '%kolera%' THEN 'Kolera (Cholera)'
            WHEN LOWER(ranked.disease_classification) LIKE '%mpox%' OR LOWER(ranked.disease_classification) LIKE '%cacar monyet%' THEN 'Mpox'
            WHEN LOWER(ranked.disease_classification) LIKE '%zika%' THEN 'Zika'
            ELSE INITCAP(ranked.disease_classification)
          END AS standard_disease
   FROM ranked
   LEFT JOIN LATERAL (
     SELECT l0.* FROM locations l0
     WHERE LOWER(l0.name) = LOWER(ranked.location_name) AND l0.is_active = TRUE
     ORDER BY l0.updated_at DESC NULLS LAST, l0.created_at DESC
     LIMIT 1
   ) l ON TRUE
   WHERE ranked.dedup_rank = 1
 )
 SELECT standard_disease,
        resolved_country,
        COUNT(*)::bigint as event_count,
        SUM(GREATEST(COALESCE(case_count, 0), 0))::bigint as total_cases,
        SUM(GREATEST(COALESCE(death_count, 0), 0))::bigint as total_deaths,
        COALESCE(TO_CHAR(MAX(published_at), 'YYYY-MM-DD'), '') as latest_published,
        COALESCE(TO_CHAR(MAX(published_at), 'DD Mon YYYY'), '') as latest_published_label,
        COUNT(*) FILTER (WHERE outbreak_alert = TRUE)::bigint as alert_count
 FROM valid
 WHERE resolved_country IN ('Brunei', 'Cambodia', 'Indonesia', 'Laos', 'Malaysia', 'Myanmar', 'Philippines', 'Singapore', 'Thailand', 'Timor-Leste', 'Vietnam')
 GROUP BY standard_disease, resolved_country
 ORDER BY standard_disease, total_cases DESC, event_count DESC;
```

### B. Kueri Deret Waktu Tren Harian:
```sql
WITH max_d AS (
  SELECT COALESCE(MAX(published_at::date), CURRENT_DATE) as end_date FROM disease_events
)
SELECT (published_at::date)::text as date_str,
       TO_CHAR(published_at, 'DD Mon') as date_label,
       SUM(CASE WHEN LOWER(disease_classification) LIKE '%dengue%' OR UPPER(disease_classification) = 'DBD' THEN GREATEST(COALESCE(case_count, 0), 0) ELSE 0 END)::bigint as dbd,
       SUM(CASE WHEN LOWER(disease_classification) LIKE '%measles%' OR LOWER(disease_classification) LIKE '%campak%' THEN GREATEST(COALESCE(case_count, 0), 0) ELSE 0 END)::bigint as campak,
       SUM(CASE WHEN LOWER(disease_classification) LIKE '%covid%' OR LOWER(disease_classification) LIKE '%corona%' THEN GREATEST(COALESCE(case_count, 0), 0) ELSE 0 END)::bigint as covid,
       SUM(CASE WHEN LOWER(disease_classification) LIKE '%rabies%' THEN GREATEST(COALESCE(case_count, 0), 0) ELSE 0 END)::bigint as rabies,
       SUM(CASE WHEN LOWER(disease_classification) LIKE '%hand foot%' OR LOWER(disease_classification) LIKE '%hfmd%' THEN GREATEST(COALESCE(case_count, 0), 0) ELSE 0 END)::bigint as hfmd
FROM disease_events, max_d
WHERE published_at::date >= (max_d.end_date - make_interval(days => $1))
  AND published_at::date <= max_d.end_date
  AND (is_health_related = TRUE OR LOWER(COALESCE(source_type, '')) IN ('skdr', 'skdr_api'))
GROUP BY (published_at::date)::text, TO_CHAR(published_at, 'DD Mon')
ORDER BY date_str ASC;
```

---

## 5. Cara Pengujian & Verifikasi Mandiri

### A. Uji Respons API via cURL
```bash
curl -s "http://127.0.0.1:8081/api/v1/disease-trend-overview?days=7" | jq .
```
Struktur respons yang diharapkan:
- `data.summary`: ringkasan total penyakit terpantau dan penyakit beban tertinggi.
- `data.priority_alerts`: daftar penyakit terurut dari kasus terbanyak, lengkap dengan `top_country` dan array `country_breakdown`.
- `data.daily_trends`: array data harian untuk DBD, Campak, COVID, Rabies, dan HFMD.

### B. Uji Nilai Database PostgreSQL Langsung
Untuk membuktikan bahwa DBD paling banyak berasal dari Filipina:
```bash
docker exec -i db-postgres psql -U postgres -d disease_ai -c "
SELECT l.country, SUM(e.case_count) AS total_cases 
FROM disease_events e 
JOIN locations l ON LOWER(l.name) = LOWER(e.location_name)
WHERE LOWER(e.disease_classification) LIKE '%dengue%' OR UPPER(e.disease_classification) = 'DBD'
GROUP BY l.country ORDER BY total_cases DESC LIMIT 5;
"
```
Hasil akan menunjukkan Filipina (*Philippines*) di urutan nomor 1 dengan lebih dari 2 juta kasus terdeteksi.
