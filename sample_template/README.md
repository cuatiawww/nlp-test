# Dashboard Laporan KIE

Dashboard pemantauan mingguan kasus **Influenza, COVID-19, RSV, dan Multipatogen** di Indonesia.
Data bersumber dari [surkarkes.kemkes.go.id](https://surkarkes.kemkes.go.id/ringkasan-kasus).

---

## Cara Menjalankan

```bash
cd project-folder
docker compose up -d
# Buka http://localhost:3510
```

Atau tanpa Docker:

```bash
npm install
npm run dev -- -H 0.0.0.0
# Buka http://localhost:3000
```

## Update Data

```bash
python3 update-data.py
```

Script akan:
  1. Scan semua minggu tersedia di website (2025–2026)
  2. Ekstrak 3 tabel + Poin Utama per minggu
  3. Generate ulang `dashboard-data.json`
  4. Generate `dashboard-data-backup.xlsx`

## Halaman

| Route | Menu | Isi |
|-------|------|-----|
| `/` | Beranda | 3 card imbang (Influenza, COVID, RSV-Multi), peta, insight, prioritas |
| `/rekapitulasi` | Rekapitulasi Mingguan & Tahunan | 6 card, tabel 4 minggu, perbandingan tahunan |
| `/tren-epidemiologi` | Tren Epidemiologi | Line chart PR COVID + PR Influenza, tahun filter |
| `/positivitas` | Tingkat Positivitas & CFR | Bar chart 6 indikator, timeline level |
| `/peta-nasional` | Peta Distribusi | Peta 10 provinsi, tabel data |
| `/perbandingan-tahunan` | Perbandingan YoY | Rata-rata tahunan, card memburuk/membaik |

## Arsitektur

```
src/
├── app/                      # Next.js App Router pages
│   ├── layout.tsx            # Root layout → AppShell wrapper
│   ├── page.tsx              # Beranda (~680 baris)
│   ├── rekapitulasi/         # Halaman rekapitulasi mingguan & tahunan
│   ├── tren-epidemiologi/    # Halaman tren
│   ├── positivitas/          # Halaman positivitas
│   ├── peta-nasional/        # Halaman peta
│   └── perbandingan-tahunan/ # Halaman perbandingan
├── components/
│   ├── layout/               # AppShell, DashboardHeader, DashboardSidebar, InfoButton, DataModal
│   └── dashboard-campus/     # ProvinceMapOlClient, dashboard-data.json
└── types/ lib/               # Legacy — tidak dipakai
```

## Tech Stack

- **Next.js 16** — App Router (multi-page)
- **React 19** — Server & Client components
- **TypeScript** — Strict mode
- **Recharts** — Bar, Line, Pie chart
- **OpenLayers** — Peta provinsi Indonesia
- **Tailwind CSS** — Semua styling
- **Manrope** — Font utama (via next/font/google)
- **Lucide React** — Icon library
- **BeautifulSoup + openpyxl** — Scraping + Excel (Python)

## Data Pipeline

```
surkarkes.kemkes.go.id/ringkasan-kasus/{minggu}/{tahun}
        │
        ▼
  update-data.py  (Python scraper)
        │
        ▼
  dashboard-data.json  (source of truth for React)
        │
        ▼
  React pages render charts & tables
```

## Sumber Data per Minggu

| Jenis | Tabel | Baris |
|-------|-------|-------|
| Influenza Activity | 1st `<table>` | ILI%, SARI%, PR Influenza, Level |
| COVID-19 Activity | 2nd `<table>` | PR COVID-19 |
| RSV ACTIVITY | 3rd `<table>` | RSV%, Multipatogen% |
| Poin Utama | Paragraf naratif | "dari X pemeriksaan", "Y kasus positif" |

Cakupan: **50 minggu** — M01-M53/2025 (27 minggu) + M01-M23/2026 (23 minggu).
3 minggu hanya narasi (M28-M30/2025 — tanpa tabel). M01/2025 = Lorem ipsum.

## Catatan Penting

- **Jangan ubah style/Tailwind** — desain final sudah disetujui
- **Semua angka harus dari `dashboard-data.json`** — jangan hardcode
- **Data kasus aktif/sembuh/meninggal tidak tersedia** dari sumber
- **CFR tidak dapat dihitung** — data kematian tidak dirilis
- **Per-provinsi per-minggu tidak tersedia** — hanya nama provinsi dalam laporan
- **Font Manrope** — via `next/font/google`, variable `--font-manrope`
- **Update data** → jalankan `python3 update-data.py` → commit + push

## File Penting

| File | Fungsi |
|------|--------|
| `update-data.py` | Scraper + generator JSON + Excel |
| `src/components/dashboard-campus/dashboard-data.json` | Sumber data dashboard |
| `docker-compose.yml` | Docker service (port 3510) |
| `sumber-data.html` | Dokumentasi sumber data lengkap |
| `dashboard-data-backup.xlsx` | Backup Excel data mentah |
| `data-pipeline.md` | Dokumentasi alur data detail |
