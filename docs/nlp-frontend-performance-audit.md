# Audit Performa Web NLP-PENYAKIT

**Tanggal:** 2026-09-23 WIB  
**Target:** `disease-frontend-next` + `disease-backend-rust`  
**Metode:** Network timing via Chrome DevTools Protocol, `curl`, source-code tracing, dan pemeriksaan log container.  
**Perubahan:** Tidak ada code, konfigurasi, database, container, atau service yang diubah.

## Ringkasan

Masalah loading saat pindah menu terutama berasal dari kombinasi:

1. Sidebar melakukan full browser navigation melalui `<a href>`, bukan navigasi Next.js client-side.
2. `SettingsProvider` memanggil API settings ulang pada setiap halaman dengan `no-store` dan timestamp cache-buster.
3. Halaman dashboard menunggu API paling lambat sebelum keluar dari state loading.
4. `public-dashboard` mengirim payload sekitar 1.5 MB.
5. Query `morbidity-mortality` dan `crawling-stats` memerlukan sekitar 1.4–1.6 detik secara lokal.
6. `crawling-stats` dipanggil dua kali saat initial load Main Dashboard.

HTML route Next.js sendiri cepat pada pengukuran lokal: TTFB sekitar 10–23 ms. Bottleneck utama berada pada lifecycle navigasi, client-side fetch, ukuran payload, dan query database.

---

## Matriks bottleneck

| ID | Bottleneck | Prioritas | Bagian lambat | Durasi/request terukur | Penyebab | Bukti source/network/log | Solusi yang disarankan |
|---|---|---:|---|---:|---|---|---|
| B-01 | Full reload saat pindah menu | P0 | Sidebar internal | Route load lokal 118–200 ms; lebih tinggi melalui domain publik | Sidebar memakai `<a href>` sehingga dokumen, layout, settings, dan chunk dimuat ulang | `DashboardSidebar.tsx:144–145` dan `209–210`; setiap route menghasilkan navigation baru | Ganti internal anchor dengan Next.js `<Link>`; gunakan `<a>` hanya untuk eksternal |
| B-02 | Settings selalu diambil ulang | P1 | `/api/v1/console/settings` | 25–39 ms normal; pernah 260 ms; 43.9 KB transfer / 65.9 KB decoded | `Date.now()`, `cache: no-store`, dan `Cache-Control: no-store` | `settings-context.tsx:48–53`, root `app/layout.tsx:35–37`; request terlihat di setiap route | Session/memory cache, TTL 5–15 menit, refetch hanya setelah perubahan settings |
| B-03 | `morbidity-mortality` memblokir Disease Dashboard | P0 | `/api/v1/morbidity-mortality` | 1.375 s via curl; 1.610 s via browser | UI menunggu `Promise.all`; backend menjalankan snapshot + monthly query + top disease query | `disease-dashboard/page.tsx:142–149`, `164–166`; `main.rs:5516–5731` | Render shell/panel ringan lebih dulu; lazy panel morbidity; optimalkan snapshot/index/query |
| B-04 | Payload `public-dashboard` terlalu besar | P1 | `/api/v1/public-dashboard` | 215 ms browser; 0.093 s curl; 515 KB transfer / 1.55 MB decoded | Satu response mengirim KPI, lokasi, alert, trend, disease, country, dan detail sekaligus | `api.ts:737–740`; response aktual 1,542,532 bytes | Pecah endpoint atau tambah projection `include`; load data map/detail setelah first paint |
| B-05 | Bundle JavaScript/CSS besar | P1 | Initial assets Disease Dashboard | 440 KB transfer; 1.565 MB decoded; 31 assets | Chart/map/common chunks ikut dimuat pada initial render | Chunk terbesar: 370 KB, 201 KB, 167 KB, CSS 158 KB; `main-dashboard/page.tsx:30–61` | Lazy-load chart/map/modal; bundle analyzer; pastikan Brotli/gzip aktif |
| B-06 | `crawling-stats` dipanggil ganda | P0 | `/api/v1/crawling-stats` | 1.427 s/request | Dipanggil di `Promise.all`, lalu langsung dipanggil lagi pada effect polling | `main-dashboard/page.tsx:884–887`, `907–912`; `main.rs:4824–4971` | Gunakan hasil request pertama; hapus initial duplicate; polling hanya bila diperlukan |
| B-07 | Client-side loading menahan tampilan | P0 | Initial render dashboard | UI menunggu request terlama | Halaman memakai `'use client'`, data diambil dalam `useEffect`, lalu `loading` false setelah semua request selesai | `disease-dashboard/page.tsx:1`, `123–125`, `171–175`; `main-dashboard/page.tsx:879–899`, `942–947` | Render shell dan panel independen dengan skeleton per panel; jangan blokir seluruh halaman |
| B-08 | Caching GET terlalu agresif dinonaktifkan | P1 | Semua `fetchFrom` GET | Tidak ada reuse response browser | `fetchFrom` memakai `cache: "no-store"`; settings memakai timestamp | `lib/api.ts:97–119`; `settings-context.tsx:48–53` | Terapkan TTL/SWR berdasarkan tipe data: settings panjang, dashboard 15–60 detik, detail on-demand |

---

## Detail bukti Network

### Disease Dashboard, cache browser dikosongkan

| Request | Durasi | Transfer | Decoded |
|---|---:|---:|---:|
| `/api/v1/console/settings` | 39 ms | 43,919 B | 65,938 B |
| `/api/v1/public-dashboard` | 215 ms | 515,008 B | 1,552,308 B |
| `/api/v1/morbidity-mortality` | 1,610 ms | 1,288 B | 2,910 B |
| `/api/v1/disease-concepts` | 40 ms | 2,853 B | 12,115 B |
| Static assets, total 31 file | — | 440,089 B | 1,565,499 B |

### Endpoint timing via curl

```text
/api/v1/console/settings       0.012 s   65,938 B
/api/v1/morbidity-mortality    1.375 s    2,909 B
/api/v1/disease-concepts       0.012 s   12,115 B
/api/v1/public/report-issues   0.021 s      844 B
/api/v1/crawling-stats         1.427 s      871 B
/api/v1/kpi-snapshot           0.016 s    1,168 B
/api/v1/public-dashboard       0.093 s 1,542,532 B
```

Ukuran response tidak selalu mencerminkan durasi. `morbidity-mortality` dan `crawling-stats` response-nya kecil, tetapi query database di server tetap mahal.

---

## Detail source code

### Navigasi

```text
services/frontend-next/components/layout/DashboardSidebar.tsx:144–145
services/frontend-next/components/layout/DashboardSidebar.tsx:209–210
```

Internal route dibentuk menjadi URL dan diberikan ke `<a href>`. Ini memicu full document navigation.

### Settings global

```text
services/frontend-next/app/layout.tsx:35–37
services/frontend-next/lib/settings-context.tsx:46–54
services/frontend-next/lib/settings-context.tsx:93–95
```

Provider global melakukan fetch settings pada setiap mount. Request menggunakan timestamp dan `no-store`, sehingga tidak dapat memakai cache browser.

### Dashboard loading

```text
services/frontend-next/app/disease-dashboard/page.tsx:142–149
services/frontend-next/app/disease-dashboard/page.tsx:164–175
```

Tiga API berjalan paralel, tetapi seluruh halaman tetap menunggu request terlama.

### Duplicate crawling stats

```text
services/frontend-next/app/main-dashboard/page.tsx:884–887
services/frontend-next/app/main-dashboard/page.tsx:901–905
services/frontend-next/app/main-dashboard/page.tsx:907–912
```

`fetchCrawlingStats()` masuk ke initial `Promise.all`, lalu dipanggil lagi pada effect terpisah.

### Query backend berat

```text
services/backend-rust/src/main.rs:5516–5731
services/backend-rust/src/main.rs:4824–4971
```

`morbidity_mortality_handler` melakukan snapshot loading dan beberapa query agregasi. `crawling_stats` memakai CTE, `LEFT JOIN LATERAL` ke `locations`, agregasi `raw_reports`, dan query `by_source_type` terpisah.

---

## Next.js rendering/loading

Sebagian besar halaman dashboard menggunakan `'use client'` dan mengambil data melalui `useEffect`. Pola ini menyebabkan:

1. HTML shell awal tampil.
2. React hydration berjalan.
3. API baru dipanggil.
4. Halaman tetap berada pada state `Loading`.
5. Tampilan penuh muncul setelah request paling lambat selesai.

Jadi bottleneck utama bukan server-side HTML generation, melainkan client-side data loading setelah hydration dan full reload antar-menu.

---

## Log

Pemeriksaan log 20 menit terakhir:

- Tidak ada error frontend.
- Tidak ada `502`, `503`, `504`, timeout, atau panic backend.
- Log backend terutama berisi startup dan migration yang sudah applied.
- Belum ada structured request timing per endpoint atau per SQL query.

Akibatnya, Network dapat membuktikan durasi request, tetapi belum dapat memisahkan durasi database connection, query execution, dan JSON serialization. Instrumentation backend diperlukan sebelum optimasi query yang lebih spesifik.

---

## Urutan perbaikan yang disarankan

### P0

1. Ubah sidebar internal dari `<a>` menjadi `<Link>`.
2. Hilangkan duplicate `crawling-stats` initial request.
3. Jangan menahan seluruh halaman karena satu API lambat.
4. Gunakan skeleton per panel.

### P1

1. Cache `console/settings` dengan TTL.
2. Hilangkan `no-store` dari GET yang aman dicache.
3. Pecah atau ringkas response `public-dashboard`.
4. Optimalkan query `morbidity-mortality` dan `crawling-stats`.
5. Audit index dan query plan PostgreSQL.

### P2

1. Audit bundle Next.js.
2. Lazy-load chart/map/modal.
3. Aktifkan Brotli/gzip di reverse proxy.
4. Tambahkan request timing terstruktur di backend.

---

## Acceptance criteria setelah perbaikan

- Klik menu internal tidak membuat full document reload.
- `console/settings` tidak dipanggil ulang pada setiap perpindahan menu.
- `crawling-stats` hanya satu request saat initial load.
- UI shell tampil tanpa menunggu `morbidity-mortality`.
- `public-dashboard` initial response turun signifikan dari sekitar 1.5 MB.
- Disease Dashboard tidak menampilkan loading penuh selama query panel sekunder berjalan.
- Network log memiliki timing endpoint dan backend memiliki query duration.

## Status audit

- Tidak ada perubahan pada repository atau runtime.
- Tidak ada restart service.
- Tidak ada migration.
- Tidak ada commit atau push.
- File laporan: `/home/nlpdev/nlp-frontend-performance-audit.md`
