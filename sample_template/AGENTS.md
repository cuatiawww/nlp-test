# AGENTS.md — Dashboard Laporan KIE

Pedoman untuk OpenCode agent dan kontributor.

## Identitas

Dashboard pemantauan mingguan **Influenza, COVID-19, RSV, Multipatogen** dari surkarkes.kemkes.go.id.
Multi-page Next.js App Router. Data dari `dashboard-data.json`. Font: Manrope.

## Aturan Wajib

### 1. JANGAN UBAH STYLE APAPUN
Zero changes to Tailwind classes, inline styles, CSS files, font config, etc.
Hanya content (teks, data, chart values) yang boleh berubah.

### 2. Semua dari JSON
Setiap angka di dashboard HARUS bersumber dari `dashboard-data.json`.
DILARANG keras hardcode nilai numerik di komponen React.

```tsx
// ✅ BENAR
data.metrics[0].value

// ❌ SALAH
'13183'
```

### 3. Data Pipeline
```
surkarkes.kemkes.go.id  →  update-data.py (Python scrape)
→  dashboard-data.json  →  React pages render
→  dashboard-data-backup.xlsx
```

Update data: `python3 update-data.py` → commit + push.

## Cara Run

```bash
docker compose up -d      # port 3510
npm run dev               # port 3000 (alternatif)
```

## Struktur Halaman

| Route | Componen | File |
|-------|----------|------|
| `/` | Beranda | `src/app/page.tsx` (~680 baris) |
| `/rekapitulasi` | Rekapitulasi Mingguan & Tahunan | `src/app/rekapitulasi/page.tsx` |
| `/tren-epidemiologi` | line chart | `src/app/tren-epidemiologi/page.tsx` |
| `/positivitas` | bar chart | `src/app/positivitas/page.tsx` |
| `/peta-nasional` | OpenLayers map | `src/app/peta-nasional/page.tsx` |
| `/perbandingan-tahunan` | perbandingan YoY | `src/app/perbandingan-tahunan/page.tsx` |

Semua halaman di-wrap oleh `AppShell` (header + sidebar) dari `src/components/layout/`.

## Komponen Penting

| Komponen | Path | Fungsi |
|----------|------|--------|
| `AppShell` | `components/layout/AppShell.tsx` | Wrapper sidebar + header |
| `DashboardHeader` | `components/layout/DashboardHeader.tsx` | Header tetap |
| `DashboardSidebar` | `components/layout/DashboardSidebar.tsx` | Sidebar navigasi |
| `DataModal` | `components/layout/DataModal.tsx` | Modal popup scrollable |
| `InfoButton` | `components/layout/InfoButton.tsx` | Popover ℹ️ sumber data |
| `ProvinceMapOlClient` | `components/dashboard-campus/ProvinceMapOlClient.tsx` | Peta OpenLayers |

## dashboard-data.json — Schema

```typescript
{
  greeting:     { title, subtitle }
  metrics:      5 cards  (Total Pemeriksaan, PR COVID, Kasus Positif, PR Influenza, Aktivitas)
  summary:      { average, category, delta, latest }
  aspectScores: 6 indicators  (PR Influenza, PR COVID, RSV, Multipatogen, ILI, SARI)
  starDistribution: 3 levels  (Rendah, Di Luar Musim, Sedang)
  trend:        Array<{ year, value }>  — PR COVID per minggu (50 minggu)
  topCampuses:  5 indikator terendah (nilai terbaik)
  processStatus: 6 current values
  lowestAspects: 5 terendah
  notifications: 4 alerts
  provinces:    39 nama provinsi
  sourceInfo:   { sourceLabel, sourceValue, dateLabel, dateValue }
  sidebarMenu:  array menu items
  weeklyPositives:  Array<{ minggu, kasus, pemeriksaan }>
  weeklyPR_Influenza: Array<{ minggu, value }>
  weeklyLevels:  Array<{ minggu, level, levelIdx }>
  weeklyRSV:  Array<{ minggu, value }>
  weeklyMultipatogen: Array<{ minggu, value }>
  y2025avg:  Array<{ name, value }>
  y2026avg:  Array<{ name, value }>
}
```

## Cara Kerja Scraper

`update-data.py`:

1. Scan 2025 M01-M55 dan 2026 M01-M55
2. Tiap halaman: ekstrak 3 tabel + Poin Utama
3. Simpan `poin_numbers` (examinations, positive_cases, positivity_rate)
4. Compute metrics dari semua minggu
5. Output: `dashboard-data.json` + `.xlsx`

### Ketergantungan Python
- `requests`, `beautifulsoup4`, `openpyxl`
- Handle `&nbsp;` HTML entities: `re.sub(r'&nbsp;', ' ', text)`
- Gunakan `re.findall` + `[-1]` untuk mengambil match TERAKHIR (handle M29 copypaste)
- level dihitung per MINGGU (bukan per baris tabel) — deduplikasi di update-data.py:521

## Known Issues

| Issue | Detail |
|-------|--------|
| **M01/2025** | Halaman template — Poin Utama "Lorem ipsum", tidak ada data pemeriksaan |
| **M28-M30/2025** | Hanya narasi (tanpa tabel) — data terbatas dari Poin Utama |
| **M29/2025** | Website copypaste data M28 → 427 (seharusnya 205). Teratasi dengan `re.findall[-1]` |
| **M49/2025, M06/2026** | `&nbsp;` entity bikin regex gagal. Teratasi dengan full-page scan |
| **CFR** | Tidak dapat dihitung — data kematian tidak dirilis |
| **Data per provinsi** | Hanya 10 provinsi disebut dalam laporan, tanpa data per minggu |
| **Data per kab/kota** | Tidak tersedia |
| **Perbandingan tahunan** | Data dari 2025 dan 2026 digabung, tidak bisa dipisah per tahun |

## Jika Ingin Menambah Halaman Baru

1. Buat folder `src/app/halaman-baru/page.tsx`
2. Tambah item di `sidebarMenu` pada `dashboard-data.json`
3. Pastikan komponen di-wrap oleh `AppShell` (otomatis dari `layout.tsx`)

## Jika Ingin Menambah Indikator Baru

1. Ubah `compute_metrics()` di `update-data.py`
2. Tambah field di skema JSON
3. Tampilkan di komponen React dengan `dashboardData.field`
4. Jalankan `python3 update-data.py` untuk regenerate JSON

## Testing

- `docker compose up -d` → cek tiap halaman render dengan benar
- `python3 update-data.py` → pastikan scrape berjalan tanpa error
- Cek `dashboard-data.json` — semua angka harus wajar (tidak 0 atau ekstrem)
- Hard refresh browser (Ctrl+Shift+R) setelah update data
