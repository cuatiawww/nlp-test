# AUDIT ARSITEKTUR: PEMBERSIHAN HARDCODED DUMMY FRONTEND & UNIFIKASI MASTER DATA BACKEND

**Tanggal Audit:** 24 September 2026  
**Status Target:** Handover ke Tim Frontend & Refactor Backend Rust  
**Tujuan:** Menghilangkan seluruh fallback data sintetis/dummy, typo hardcoded, dan menstandarkan filter penyakit 100% dinamis ke Master Catalog Database.

---

## BAGIAN I: DOKUMEN AUDIT & HANDOVER UNTUK REKAN TIM FRONTEND

Dokumen ini ditujukan untuk tim developer frontend Next.js (`services/frontend-next`). Ditemukan beberapa komponen yang masih menggunakan data sintetis (dummy) atau array hardcoded yang menimpa/mengabaikan API backend.

### 1. `services/frontend-next/app/disease-dashboard/page.tsx`
* **Masalah (Kritis):** Grafik Tren Mingguan Menghasilkan Angka Kasus Palsu (5.400 s/d 12.400 kasus) saat API kosong.
* **Baris Kode:** Baris 290 – 302
* **Kode Eksisting:**
  ```typescript
  // Default 8-week synthetic trajectory if empty
  return [
    { weekLabel: 'W31', cases: 5400, deaths: 62, cfr: 1.15 },
    { weekLabel: 'W32', cases: 6200, deaths: 70, cfr: 1.13 },
    { weekLabel: 'W33', cases: 7100, deaths: 81, cfr: 1.14 },
    { weekLabel: 'W34', cases: 8300, deaths: 95, cfr: 1.14 },
    { weekLabel: 'W35', cases: 9600, deaths: 108, cfr: 1.13 },
    { weekLabel: 'W36', cases: 10400, deaths: 119, cfr: 1.14 },
    { weekLabel: 'W37', cases: 11200, deaths: 128, cfr: 1.14 },
    { weekLabel: `W${currentEpi.week}`, cases: macroStats.cases || 12400, deaths: macroStats.deaths || 140, cfr: macroStats.cfr || 1.13 },
  ]
  ```
* **Tindakan Perbaikan:**
  - Hapus seluruh array `synthetic trajectory` tersebut.
  - Jika `data?.weekly_trend` kosong atau tidak ada data, kembalikan array kosong `[]`.
  - Tampilkan Empty State UI (misal: `"Belum ada tren kasus untuk filter minggu/wilayah yang dipilih"`), bukan mengarang angka 12.400 kasus.
  - Di baris 308, hapus fallback hardcoded: `['Dengue', 'Malaria', 'Tuberculosis', 'Mpox', 'COVID-19', 'Cholera']`. Cukup gunakan `data?.available_diseases || []`.

---

### 2. `services/frontend-next/components/IndonesiaDetailMapClient.tsx`
* **Masalah (Kritis):** Peta Detail Provinsi Menggunakan Data Hardcoded Statis.
* **Baris Kode:** Baris 55 – 75, Baris 194, Baris 357
* **Kode Eksisting:**
  ```typescript
  const KNOWN_ACTIVE_REGIONS: Record<string, { distribusi: string; cases: number }> = {
    'jawa barat': { distribusi: '14.8%', cases: 41250 },
    'dki jakarta': { distribusi: '18.2%', cases: 52100 },
    'jakarta': { distribusi: '18.2%', cases: 52100 },
    'jawa timur': { distribusi: '24.0%', cases: 68400 },
    'jawa tengah': { distribusi: '12.5%', cases: 35600 },
    'banten': { distribusi: '8.4%', cases: 23900 },
    'bandung': { distribusi: '8.2%', cases: 14200 },
    // ...
  }
  ```
* **Tindakan Perbaikan:**
  - Hapus konstanta `KNOWN_ACTIVE_REGIONS`.
  - Hubungkan pewarnaan peta dan popup statistik provinsi ke prop `data` agregasi yang diterima dari endpoint backend (`/api/v1/public-dashboard` atau event clustering per provinsi).
  - Jika suatu provinsi belum memiliki event di database, tampilkan status `"Belum Ada Laporan Kasus"` dengan kasus `0`.

---

### 3. `services/frontend-next/app/analysis-dashboard/page.tsx`
* **Masalah:** Top Extracted Diseases & Confidence Chart Mengarang Angka saat Data Kosong.
* **Baris Kode:** Baris 192 – 197 & Baris 210 – 225
* **Kode Eksisting:**
  ```typescript
  // Baris 192: Fallback ke angka 45 jika rows kosong
  { tier: '90 - 100%', articles: Math.round((rows.length || 45) * 0.62), benchmark: 'High Precision' },

  // Baris 210: Dummy top extracted diseases
  if (dMap.size === 0) {
    return [
      { name: 'Dengue', count: 184, cases: 12450, precision: 98.2 },
      { name: 'Avian Influenza', count: 89, cases: 412, precision: 96.5 },
      { name: 'Acute Diarrhea', count: 72, cases: 3820, precision: 95.1 },
      { name: 'Mpox', count: 48, cases: 145, precision: 97.4 },
      { name: 'Malaria', count: 36, cases: 890, precision: 94.8 },
    ]
  }
  ```
* **Tindakan Perbaikan:**
  - Hapus `|| 45` pada `confidenceChartData`. Jika `rows.length === 0`, maka `articles: 0`.
  - Hapus dummy list `if (dMap.size === 0)`. Kembalikan array kosong `[]` dan tampilkan pesan informatif `"Tidak ada data ekstraksi penyakit pada periode ini"`.

---

### 4. `services/frontend-next/components/EpiFilterBar.tsx`
* **Masalah:** Dropdown Filter Utama Menggabungkan Array Statis dengan Typo & Gado-Gado Bahasa.
* **Baris Kode:** Baris 124 – 135
* **Kode Eksisting:**
  ```typescript
  const standardPriority = [
    'COVID-19',
    'dengue fever DBD',          // Typo & tidak standar
    'Campak',                    // Duplikat 'Measles'
    'RABIES',                    // Huruf kapital semua
    'hand foot mouth disease',   // Huruf kecil semua
    'Kolera',                    // Duplikat 'Cholera'
    'Malaria',
    'Flu Burung',                // Duplikat 'Avian Influenza'
  ];
  ```
* **Tindakan Perbaikan:**
  - Hapus seluruh array `standardPriority`.
  - `diseaseOptions` cukup menggunakan langsung `availableDiseases` yang dikirim dari prop (yang kini sudah dibersihkan oleh backend sehingga berisi 30 penyakit kanonik resmi ASEAN).

---

## BAGIAN II: PERBAIKAN ARSITEKTUR BACKEND (BACKEND-RUST)

Di sisi backend Rust, dilakukan 3 perbaikan utama agar data yang disajikan 100% murni dari Master Catalog:

1. **Unifikasi `available_diseases` ke Master Catalog `disease_concepts`**:
   - **File:** `services/backend-rust/src/main.rs:6252`
   - **Sebelum:** Melakukan query `SELECT DISTINCT disease_classification FROM disease_events` yang menampung string kotor crawler lama (`Acute periodontitis`, `Colitis due to HPV`, `Cyclosporiasis`).
   - **Sesudah:** Mengambil langsung dari tabel master:
     ```sql
     SELECT canonical_name
     FROM disease_concepts
     WHERE is_active = TRUE
       AND NULLIF(BTRIM(canonical_name), '') IS NOT NULL
       AND LOWER(canonical_name) <> 'unknown disease'
     ORDER BY canonical_name ASC
     ```
   - **Hasil:** Dropdown penyakit di web kini menyajikan tepat 30 penyakit resmi ASEAN dengan penulisan Title Case yang rapi dan seragam.

2. **Resolusi Semantik Alias pada Filter Pencarian (`dashboard_valid_cte`)**:
   - **File:** `services/backend-rust/src/main.rs:423`
   - **Perbaikan:** Menambahkan pengecekan relasi ke `disease_aliases` & `disease_concepts`.
   - **Hasil:** Jika pengguna memilih `"Measles"`, sistem secara otomatis mencocokkan event dengan label `"Measles"` maupun variasi aliasnya seperti `"Campak"`. Jika pengguna memilih `"Dengue"`, event `"DBD"` atau `"Demam Berdarah"` otomatis terfilter dengan tepat.

3. **Eliminasi Hardcoded `CASE WHEN` Penyakit di SQL Tren**:
   - **File:** `services/backend-rust/src/main.rs:5280` & `5650`
   - Menggantikan hardcoding statis 5–14 penyakit agar dinamis terhadap resolusi konsep master catalog di database.
