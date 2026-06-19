# Data Pipeline — Dashboard Laporan KIE

Dokumentasi alur data dari sumber website ke dashboard.

---

## Diagram

```
surkarkes.kemkes.go.id
  /ringkasan-kasus/{week}/{year}
        │
        ▼
  update-data.py  [Python]
        │
        ├── scrape_all_weeks()     → /tmp/dashboard-raw-data.json
        ├── compute_metrics()      → dashboard-data.json
        └── generate_excel()       → dashboard-data-backup.xlsx
        │
        ▼
  dashboard-data.json
        │
        ├── page.tsx (Beranda)
        ├── tren-epidemiologi/page.tsx
        ├── positivitas/page.tsx
        ├── peta-nasional/page.tsx
        └── perbandingan-tahunan/page.tsx
```

---

## 1. Sumber Data: `surkarkes.kemkes.go.id`

### URL Pattern

```
https://surkarkes.kemkes.go.id/ringkasan-kasus/{week:02d}/{year}
```

`week` = dua digit (example: `01`, `31`, `53`)  
`year` = empat digit (`2025`, `2026`)

> **PENTING**: format dua digit. `01/2026` OK, `1/2026` = 404.

### Per Halaman: 3 Tabel + 1 Poin Utama

#### Tabel 1 — Influenza Activity (4 baris)
| Baris | Indikator | Kolom: Indikator, Tren, Level, Keterangan |
|-------|-----------|-------------------------------------------|
| 1 | Kasus ILI dari total kunjungan Puskesmas Sentinel | ILI% dari keterangan |
| 2 | Kasus SARI dari Total rawat inap rumah sakit Sentinel | SARI% dari keterangan |
| 3 | Positivity rate influenza | PR Influenza dari keterangan |

#### Tabel 2 — COVID-19 Activity (2 baris)
| Baris | Indikator |
|-------|-----------|
| 1 | Positivity rate COVID-19 | PR COVID-19 dari keterangan |

#### Tabel 3 — RSV ACTIVITY (3 baris)
| Baris | Indikator |
|-------|-----------|
| 1 | Jumlah kasus RSV | RSV% dari keterangan |
| 2 | Multipatogen Lainnya | Multipatogen% dari keterangan |

Setiap keterangan mengandung teks seperti:
`"Proporsi positif COVID-19 menurun menjadi 1.9% dari 1.5% di minggu sebelumnya."`

Ekstraksi: `re.search(r'menjadi\s*([\d.,]+)%', keterangan)`

#### Poin Utama (Naratif)

Paragraf mengandung data eksaminasi:

```
"... dari 444 pemeriksaan, terdapat 22 kasus positif dengan positivity rate sebesar 5%"
```

Ekstraksi:
- `re.findall(r'dari\s+([\d.,]+)\s*pemeriksaan', full_page)` — ambil LAST match
- `re.findall(r'terdapat\s+([\d.,]+)\s*kasus\s*positif', full_page)` — ambil LAST match
- `re.findall(r'positivity\s*rate...', text)` — ambil LAST match

### Halaman Tersedia

| Periode | Jumlah | Tipe |
|---------|--------|------|
| 2025 M01 | 1 | Template — Poin Utama "Lorem ipsum", tabel real |
| 2025 M28-M30 | 3 | Narasi saja, tidak ada tabel |
| 2025 M31-M53 | 23 | Tabel lengkap |
| 2026 M01-M23 | 23 | Tabel lengkap |
| **Total** | **50** | — |

3 minggu M02-M27/2025 dan 2026 M24+ tidak tersedia di website.

---

## 2. Scraper: `update-data.py`

### Mode operasi

```bash
python3 update-data.py              # scrape + generate (default)
python3 update-data.py --fetch      # scrape only → /tmp/dashboard-raw-data.json
python3 update-data.py --gen         # generate from cache only
```

### Algoritma Scrape

```
for each year in [2025, 2026]:
  for week in 1..55:
    fetch page
    if not_found: continue
    extract_title()
    extract_tables(html)         # BeautifulSoup → 3 tables
    extract_poin_utama(html)     # cari <h2 id="poin_utama"> → narasi
    extract_exams_from_full_page(html)  # full-page scan for numbers
    store in raw_data
```

### Algoritma Metrics

Dari `all_weeks` (50 entries):

| Metric | Cara Hitung |
|--------|-------------|
| Total Pemeriksaan | Σ examinations dari semua minggu |
| PR COVID-19 | nilai terakhir dari tabel COVID-19 |
| Kasus Positif | nilai terakhir dari Poin Utama |
| PR Influenza | nilai terakhir dari tabel Influenza |
| Aktivitas Influenza | level terakhir dari tabel Influenza |
| aspectScores | rata-rata per indikator dari semua minggu |
| starDistribution | count per MINGGU (deduplikasi) (Rendah/Luar Musim/Sedang) |
| trend | PR COVID per minggu (50 titik) |
| notifications | deteksi delta per indikator |
| weeklyPositives | per minggu: kasus + pemeriksaan (50 entries) |
| weeklyPR_Influenza | per minggu: PR Influenza (50 entries) |
| weeklyRSV | per minggu: Proporsi RSV (50 entries) |
| weeklyMultipatogen | per minggu: Multipatogen (50 entries) |
| y2025avg | rata-rata tiap indikator tahun 2025 |
| y2026avg | rata-rata tiap indikator tahun 2026 |

### Fallback

Untuk mengatasi `&nbsp;` (HTML entities) di halaman:

```python
text = html
text = re.sub(r'&nbsp;', ' ', text)    # convert entities
text = re.sub(r'<[^>]+>', ' ', text)   # strip tags
text = re.sub(r'\s+', ' ', text)       # collapse whitespace
```

Untuk mengatasi M29/2025 (copypaste data M28):

```python
exams = re.findall(r'dari\s+([\d.,]+)\s*pemeriksaan', full_text)
value = parse_number(exams[-1])  # last match, not first
```

---

## 3. `dashboard-data.json` — Schema Lengkap

```json
{
  "greeting": {
    "title": "Selamat datang di Dashboard Rekapitulasi Influenza & COVID-19",
    "subtitle": "Pemantauan tren pengawasan kasus..."
  },
  "metrics": [
    {
      "title": "Total Pemeriksaan COVID-19",
      "value": "13183",
      "delta": "Minggu 23: 444 pemeriksaan",
      "iconKey": "school",
      "iconTone": "bg-teal-100 text-teal-700"
    },
    {...}  // 4 more: PR COVID, Kasus Positif, PR Influenza, Aktivitas
  ],
  "summary": {
    "average": "1.9",
    "category": "RENDAH",
    "delta": "Positivity rate COVID-19 minggu ini"
  },
  "aspectScores": [
    {"label": "Positivity Rate Influenza", "value": 19.7, "tone": "bg-teal-600"},
    {"label": "Positivity Rate COVID-19", "value": 5.7, "tone": "bg-cyan-600"},
    {"label": "Proporsi RSV", "value": 19.4, "tone": "bg-lime-500"},
    {"label": "Multipatogen Lainnya", "value": 52.5, "tone": "bg-green-600"},
    {"label": "Proporsi ILI", "value": 0.2, "tone": "bg-pink-600"},
    {"label": "Proporsi SARI", "value": 1.0, "tone": "bg-sky-500"}
  ],
  "starDistribution": [
    {"label": "Aktivitas Rendah", "total": 28, "percent": 56.0, "tone": "bg-emerald-500"},
    {"label": "Di Luar Musim", "total": 14, "percent": 28.0, "tone": "bg-lime-500"},
    {"label": "Aktivitas Sedang", "total": 8, "percent": 16.0, "tone": "bg-yellow-500"}
  ],
  "trend": [
    {"year": "M01/2025", "value": 18.0},
    {"year": "M23/26", "value": 1.9}
  ],  // PR COVID-19 sampled
  "topCampuses": [...],  // 5 lowest indicators
  "processStatus": [...],  // 6 current values
  "lowestAspects": [...],  // 5 lowest averages
  "notifications": [...],  // 4 alerts
  "provinces": ["Semua Provinsi", "Aceh", ...],  // 39 items
  "sourceInfo": {
    "sourceLabel": "Sumber Data",
    "sourceValue": "Surkarkes Kemkes...",
    "dateLabel": "Data per",
    "dateValue": "13 Jun (Minggu 23)"
  },
  "sidebarMenu": [
    {"title": "Menu Utama", "items": [5 items]},
    {"title": "Integrasi API", "items": []}
  ],
  "weeklyLevels": [
    {"minggu": "M01/2025", "level": "Di Luar Musim", "levelIdx": 0},
    {"minggu": "M31/2025", "level": "Di Luar Musim", "levelIdx": 0},
    {"minggu": "M44/2025", "level": "Sedang", "levelIdx": 1},
    ...
  ]  // levelIdx: 0=Di Luar Musim, 1=Rendah, 2=Sedang, 3=Tinggi
}
```

---

## 4. Excel Backup: `dashboard-data-backup.xlsx`

### Sheet 1: Ringkasan

| Kolom | Isi |
|-------|-----|
| Minggu | Label (M01/2025 dst) |
| Tahun | 2025 / 2026 |
| Tanggal | "13 Jun" dst |
| Tipe | TABEL / NARASI |
| ILI%, SARI%, PR Influenza | Dari tabel Influenza Activity |
| PR COVID-19 | Dari tabel COVID-19 Activity |
| RSV%, Multipatogen% | Dari tabel RSV ACTIVITY |
| Pemeriksaan, Kasus Positif, PR | Dari Poin Utama (full-page scan) |
| Sumber Data | "Poin Utama (full page scan)" / "Poin Utama (narasi)" |
| Source URL | Link ke halaman website |
| Poin Utama Text | Teks lengkap narasi |

### Sheet 2: Detail Tabel

Setiap baris = 1 row dari 3 activity tables (50 weeks × 6 rows ≈ 300 baris).

---

## 5. Cara Update Data (Step-by-Step)

```bash
# 1. Hapus cache lama (kalau ada)
rm -f /tmp/dashboard-raw-data.json

# 2. Jalankan scraper + generator
python3 update-data.py

# 3. Cek hasil
cat src/components/dashboard-campus/dashboard-data.json  # lihat sourceInfo.dateValue
ls -la dashboard-data-backup.xlsx

# 4. Commit dan push
git add src/components/dashboard-campus/dashboard-data.json dashboard-data-backup.xlsx update-data.py
git commit -m "feat: update data $(date +%Y-%m-%d)"
git push

# 5. Restart Docker di server lain (kalau ada)
ssh server 'cd /path/to/project && git pull && docker compose restart'
```

---

## 6. Data Gaps & Limitations

| Gap | Penyebab | Dampak |
|-----|----------|--------|
| M01/2025 — 0 pemeriksaan | Lorem ipsum template | Total pemeriksaan kurang ~200 |
| M28-M30/2025 — tanpa tabel | Website tidak punya tabel untuk minggu tersebut | Tidak ada ILI%, SARI%, PR Influenza per minggu |
| M29/2025 — data copypaste M28 | Website copypaste error | Examinations 427 bukan 205 (< 2% dari total) |
| M49/2025, M06/2026 — Poin Utama | HTML `&nbsp;` entity bikin parsing gagal | Teratasi dengan full-page scan |
| Tidak ada kasus aktif/sembuh/meninggal | Sumber data tidak menyediakan | Tidak bisa hitung CFR |
| Tidak ada data per provinsi per minggu | Laporan hanya agregat nasional | Peta hanya menunjukkan provinsi yang disebut |
| Perbandingan tahunan | Data gabung, tidak bisa dipisah per tahun | Halaman perbandingan hanya tampilkan rata-rata |
