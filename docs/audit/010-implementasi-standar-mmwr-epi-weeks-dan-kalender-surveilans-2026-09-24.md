# 010. Implementasi Standar CDC/WHO MMWR Epi Weeks & Konsol Kalender Surveilans Interaktif (Anti-Slop)

**Tanggal:** 24 September 2026  
**Status:** IMPLEMENTED & DEPLOYED  
**Standar Baku:** CDC Morbidity and Mortality Weekly Report (MMWR) / WHO Epidemiological Week Standard ([epiweek.com/docs](http://epiweek.com/docs/))  
**Lingkup:** Database PostgreSQL, Backend Rust API, Engine Komputasi Pekan MMWR, Frontend Next.js Filter & Konsol Kalender Surveilans (`/epi-calendar`).

---

## 1. Latar Belakang & Masalah Sebelumnya

Sebelum implementasi ini, penanganan Pekan Epidemiologi (*Epi Week*) di aplikasi memiliki kelemahan kritis:
1. **Hardcoded 52 Pekan:** Di komponen filter (`EpiFilterBar.tsx`), pekan epidemiologi di-hardcode kaku menggunakan `const WEEKS_LIST = Array.from({ length: 52 }, (_, i) => i + 1);`. Padahal menurut standar MMWR, tahun tertentu (seperti 2015, 2020, 2025, 2031) memiliki **53 pekan epidemiologi** (*leap epi-year*). Akibatnya, data pekan 53 tidak dapat dipilih sama sekali dari filter.
2. **Ketiadaan API Kalender & Konversi MMWR Terpusat:** Tidak tersedia endpoint resmi bagi klien atau field epidemiologist untuk mengonversi sembarang tanggal ke pekan MMWR atau mengambil rentang baku awal (Minggu) dan akhir (Sabtu) pekan.
3. **Ketiadaan Registri Operasional Surveilans Pekan (CRUD):** Tim epidemiologi lapangan dan analis intelijen penyakit tidak memiliki antarmuka untuk mencatat fokus sasaran pekan (misal: "Pekan Gerakan 3M Plus DBD"), menetapkan tingkat kewaspadaan (*Normal*, *Waspada*, *Siaga*, *KLB*), maupun menautkan catatan instruksi lapangan ke nomor pekan MMWR.

---

## 2. Standar Baku Epidemiologi MMWR (CDC / WHO)

Sistem mengadopsi spesifikasi formal MMWR (sesuai rujukan CDC dan [epiweek.com/docs](http://epiweek.com/docs/)):
- **Awal & Akhir Pekan:** Pekan epidemiologi dimulai pada hari **Minggu** (Sunday, 00:00:00) dan berakhir pada hari **Sabtu** (Saturday, 23:59:59).
- **Pekan 1 (Week 1):** Pekan 1 dalam suatu tahun kalender didefinisikan sebagai pekan pertama yang memiliki minimal 4 hari dalam tahun kalender bersangkutan, yang secara matematis ekuivalen dengan **pekan yang memuat tanggal 4 Januari**.
- **Jumlah Pekan (52 vs 53 Pekan):** Dihitung secara matematis eksak:
  $$\text{Total Weeks}(Y) = \frac{\text{Sunday}(\text{Week 1 of } Y+1) - \text{Sunday}(\text{Week 1 of } Y)}{7 \text{ hari}}$$
  - 2020: 53 pekan (29 Des 2019 — 02 Jan 2021)
  - 2025: 53 pekan (29 Des 2024 — 03 Jan 2026)
  - 2026: 52 pekan (04 Jan 2026 — 02 Jan 2027)

---

## 3. Perubahan & Arsitektur yang Diterapkan

### A. Database Migration 124 (`124_create_epi_week_configs.sql`)
Membuat tabel registri konfigurasi dan anotasi surveilans:
```sql
CREATE TABLE IF NOT EXISTS epi_week_configs (
    id SERIAL PRIMARY KEY,
    epi_year INTEGER NOT NULL,
    epi_week INTEGER NOT NULL CHECK (epi_week BETWEEN 1 AND 53),
    title VARCHAR(255),
    alert_level VARCHAR(50) DEFAULT 'normal', -- 'normal', 'watch', 'alert', 'epidemic'
    primary_disease VARCHAR(255),
    notes TEXT,
    surveillance_status VARCHAR(50) DEFAULT 'active', -- 'active', 'archived', 'planned'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_epi_year_week UNIQUE (epi_year, epi_week)
);
CREATE INDEX IF NOT EXISTS idx_epi_week_configs_year_week ON epi_week_configs(epi_year, epi_week);
```

### B. Endpoint API Terpusat (`services/backend-rust/src/main.rs`)
1. **`GET /api/v1/epiweeks?year=YYYY`**:
   - Menghasilkan jadwal pekan MMWR lengkap (1..52 atau 1..53) untuk tahun yang dipilih.
   - Mengembalikan rentang tanggal ISO (`start_date`, `end_date`), label formal (`formatted_range`), nama bulan, flag `is_current`, jumlah laporan (`report_count`), dan metadata konfigurasi dari database.
2. **`GET /api/v1/epiweeks/current`**:
   - Mengembalikan pekan epidemiologi aktif hari ini, tanggal batas awal/akhir, dan sisa hari dalam pekan.
3. **`GET /api/v1/epiweeks/calculate?date=YYYY-MM-DD`**:
   - Mengonversi sembarang tanggal kalender menjadi Tahun MMWR, Pekan MMWR, Hari dalam Pekan, dan batas Minggu–Sabtu.
4. **`POST /api/v1/epiweeks`**:
   - Menyimpan atau memperbarui konfigurasi/anotasi pekan (`upsert`).
5. **`DELETE /api/v1/epiweeks/config/:id`**:
   - Menghapus/mereset konfigurasi pekan kembali ke default.

### C. Pemutakhiran Komputasi & Filter Dinamis (`services/frontend-next`)
1. **`lib/epi-week.ts`**:
   - Menambahkan fungsi eksak `getWeeksInYear(year: number): number` (mengembalikan 52 atau 53).
   - Menambahkan generator kalender offline `getAllEpiWeeksForYear(year, locale)`.
   - Mengintegrasikan fungsi pemanggil API: `fetchEpiWeeks`, `fetchCurrentEpiWeekApi`, `calculateEpiWeekApi`, `saveEpiWeekConfig`, `deleteEpiWeekConfig`.
2. **`components/EpiFilterBar.tsx`**:
   - Menghapus konstanta statis `WEEKS_LIST = 52`.
   - Menjadikan dropdown daftar pekan dinamis (`startWeeksList` dan `endWeeksList`) berbasis tahun yang sedang dipilih oleh pengguna.
3. **`app/main-dashboard/page.tsx`**:
   - Mendukung inisialisasi filter dari query parameter URL (`?startYear=...&startWeek=...&endYear=...&endWeek=...`).

### D. Halaman Konsol Kalender Surveilans Baru (`app/epi-calendar/page.tsx`)
Halaman interaktif berbasis prinsip **Anti-Slop UI**:
- **Desain Otentik & Bersih:** Tanpa gradien ungu/neon klise AI, tipografi proporsional dengan aksen biru korporat surveilans (`#0060A9`), angka tabular mono untuk kode pekan (`EW-01`), dan kontras warna standar aksesibilitas WCAG.
- **Pekan Berjalan Real-time:** Menampilkan status langsung pekan aktif hari ini beserta indikator kalender.
- **Kalkulator Konversi Tanggal Interaktif:** Alat bantu konversi tanggal ke pekan MMWR secara langsung di browser dengan tombol pintas ke dashboard.
- **Matriks Bulanan & Tabel Registry:** Dua mode tampilan (Grid 12 bulan dan Tabel Daftar Lengkap).
- **CRUD Modal Surveilans:** Formulir penetapan agenda pekan, level kewaspadaan (*Normal*, *Waspada*, *Siaga*, *KLB*), penyakit pantauan prioritas, dan catatan arahan lapangan.
- **Ekspor CSV:** Kemampuan unduh jadwal lengkap MMWR ke format CSV bagi petugas lapangan.
- **Integrasi Langsung ke Outbreak Dashboard:** Setiap kartu pekan menyediakan tombol "Data" yang langsung membuka Main Dashboard dengan filter terkunci ke pekan bersangkutan.

---

## 4. Matriks Verifikasi

| Komponen | Status | Hasil Pengujian |
| :--- | :--- | :--- |
| **Matematika MMWR 2020** | Valid | Menghasilkan tepat 53 pekan (2020-01-04 adalah pekan 1, akhir pekan 53 adalah 2021-01-02). |
| **Matematika MMWR 2025** | Valid | Menghasilkan tepat 53 pekan (akhir pekan 53 adalah 2026-01-03). |
| **Matematika MMWR 2026** | Valid | Menghasilkan tepat 52 pekan (pekan 1 dimulai Minggu 04 Jan 2026). |
| **Tabel `epi_week_configs`** | Terpasang | Skema PostgreSQL terindeks `(epi_year, epi_week)` dengan constraint unique. |
| **EpiFilterBar Dinamis** | Valid | Dropdown pekan start/end otomatis menyesuaikan 52 atau 53 sesuai tahun. |
| **Navigasi Menu** | Terhubung | Ditambahkan ke grup modul dan grup sitrep di `menu.ts`. |
| **Rute `/epi-calendar`** | Siap | Antarmuka interaktif, CRUD modal, kalkulator, dan ekspor CSV berfungsi penuh. |
