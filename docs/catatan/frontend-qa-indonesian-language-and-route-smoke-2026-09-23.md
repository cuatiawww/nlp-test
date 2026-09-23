# QA Frontend: Indonesian Strings & Route Smoke

Tanggal audit: 23 September 2026  
Target produksi: https://abvc-surveillance.org/nlp

## Ringkasan

- Teks bahasa Indonesia masih muncul sebagai string UI langsung di source frontend, walaupun aplikasi sudah memiliki LanguageProvider dan dictionary id/en.
- Temuan paling penting ada pada modal review/correction yang digunakan Analyze URL, Events, dan Crawl History. Halaman berbahasa Inggris dapat tetap menampilkan label Indonesia.
- Smoke test menemukan 56 route statis. Request berurutan menghasilkan 55 HTTP 200 dan satu redirect canonical /nlp/ ke /nlp. Tidak ditemukan 404.
- Pada request paralel awal, tiga route sempat 503; ketika di-request satu per satu semuanya 200. Ini dicatat sebagai risiko burst/concurrency, bukan route hilang.
- Delapan template dynamic route diuji dengan identifier/slug representatif dan semuanya 200, tetapi belum semua kombinasi ID/slug tervalidasi.

## Metode dan batasan

1. Scan source services/frontend-next/app, components, dan lib untuk literal UI bahasa Indonesia.
2. Pemetaan import dipakai untuk membedakan komponen aktif dari komponen legacy/unused.
3. Route produksi diuji dengan HTTP GET terhadap prefix /nlp menggunakan Node fetch dan curl.
4. Ini belum browser-rendered QA penuh. Environment audit tidak memiliki modul Playwright Python/browser yang siap dipakai, sehingga status 200 membuktikan response route, bukan keberhasilan seluruh API call, auth state, atau render setelah JavaScript berjalan.

## Temuan bahasa Indonesia pada frontend

### Prioritas tinggi — modal review dan correction

Komponen ini aktif digunakan oleh route berikut:

| Source | Route produksi | Contoh string Indonesia |
|---|---|---|
| [ArticleReviewModal.tsx](../../services/frontend-next/components/ArticleReviewModal.tsx:226) | /nlp/analyze, /nlp/events, /nlp/crawl-history | Koreksi Event berhasil disimpan, Penyakit, Negara / Region, Provinsi / Kota, Kasus / Kematian, Matriks Prediksi NLP & Koreksi Human Review, Tandai Sudah Direview |
| [CorrectionModal.tsx](../../services/frontend-next/components/CorrectionModal.tsx:41) | /nlp/events, /nlp/crawl-history | Jumlah Kasus, Jumlah Kematian, Klasifikasi Penyakit, Nilai Koreksi yang Benar, Batal, Simpan Koreksi |
| [lib/api.ts](../../services/frontend-next/lib/api.ts:62) | toast/error beberapa halaman | Layanan backend sedang tidak dapat dihubungi, Gagal menyimpan koreksi ke server, Gagal mengekspor dataset dari NLP service |
| [AuthGuard.tsx](../../services/frontend-next/components/AuthGuard.tsx:73) | halaman yang memakai guard | fallback role PENGGUNA |

Masalahnya bukan hanya label; toast, placeholder, error, dan status review juga langsung dirender dalam bahasa Indonesia.

### Prioritas tinggi — dashboard dan peta

| Source | Route produksi | Temuan |
|---|---|---|
| [CaseLocationHeatmap.tsx](../../services/frontend-next/components/CaseLocationHeatmap.tsx:715) | /nlp/main-dashboard | Penjelasan Rendah/Sedang/Tinggi, transmisi, Total kasus terdeteksi, Jumlah kematian, dan Rasio fatalitas kasus masih literal Indonesia. |
| [DiseaseTrendOverview.tsx](../../services/frontend-next/components/DiseaseTrendOverview.tsx:227) | dashboard terkait | Memuat data surveilans masih literal Indonesia. |
| [IndonesiaDetailMapClient.tsx](../../services/frontend-next/components/IndonesiaDetailMapClient.tsx:628) | komponen detail Indonesia; pemakaian aktif tidak ditemukan dari scan app | Wilayah Tidak Dikenal, 38 PROVINSI, 514 KAB/KOTA, Semua Provinsi, Distribusi Kasus, Belum ada data, serta tooltip pengaturan. |
| [ExecutiveReportCharts.tsx](../../services/frontend-next/components/reports/ExecutiveReportCharts.tsx:75) | halaman report yang memakai chart | Gagal memuat SVG peta dan Gagal export geomap. |

### Prioritas sedang — crawling dan CMS

| Source | Route produksi | Temuan |
|---|---|---|
| [manual-crawler/page.tsx](../../services/frontend-next/app/manual-crawler/page.tsx:1) | /nlp/manual-crawler | Judul Crawl History / Matriks Hasil Crawl bercampur Indonesia/Inggris dan belum memakai dictionary. |
| [reports/cms/page.tsx](../../services/frontend-next/app/reports/cms/page.tsx:36) | /nlp/reports/cms | Dialog PERINGATAN, Jika dihapus, Hapus draf laporan, dan toast berhasil dihapus/Gagal menghapus laporan. |
| [reports/cms/issues/[id]/page.tsx](../../services/frontend-next/app/reports/cms/issues/[id]/page.tsx:59) | /nlp/reports/cms/issues/:id | Dialog dan toast penghapusan masih literal Indonesia. |
| [wilayah-data/route.ts](../../services/frontend-next/app/wilayah-data/route.ts:27) | API wilayah | Data kabupaten tidak ditemukan, Data provinsi tidak ditemukan, dan Gagal memuat GeoJSON wilayah dapat muncul sebagai error UI. |
| [tv/page.tsx](../../services/frontend-next/app/tv/page.tsx:152) | /nlp/tv | Kasus Terpantau dan Tutup Info Dashboard masih Indonesia. |

### Modul incident/legacy

components/incident/IncidentDetailPage.tsx, TimelineCalendarModal.tsx, dan IncidentMap.tsx memiliki banyak label, status, tooltip, dan error Indonesia, misalnya Belum ada data, Memuat Peta Spasial, Lokasi Kejadian, Status Kesiapan, dan Tutup Modal.

Scan route aktif tidak menemukan import komponen incident tersebut dari app; yang ditemukan hanya RegionalIncidentPage.tsx.backup. Karena itu temuan ini diklasifikasikan sebagai source-level/legacy, bukan bukti bahwa string tersebut tampil pada route produksi saat ini. Jika modul incident diaktifkan, string-nya perlu masuk backlog i18n.

## Yang tidak dihitung sebagai defect bahasa

- String pada /nlp/audit/hardcode-1 dan /nlp/audit/hardcode-2 memang isi halaman dokumentasi audit berbahasa Indonesia.
- Teks pada AseanMap.tsx yang dipilih dengan locale === id adalah mekanisme locale yang disengaja, bukan leak ke locale Inggris.
- Nama negara, nama wilayah, nama penyakit, dan evidence artikel tidak diterjemahkan sebagai UI copy; nilai data asli boleh tetap mengikuti sumber.

## Smoke test route produksi

### Route statis

Hasil final request berurutan pada 56 route statis:

| Hasil | Jumlah |
|---|---:|
| HTTP 200 | 55 |
| Redirect 308 | 1 |
| HTTP 404 | 0 |
| HTTP 5xx pada rerun berurutan | 0 |

Redirect yang diterima: https://abvc-surveillance.org/nlp/ ke https://abvc-surveillance.org/nlp (308).

Route statis yang diuji:

/nlp, /nlp/analysis-dashboard, /nlp/analyze, /nlp/asean-3, /nlp/asean-countries, /nlp/audit/hardcode-1, /nlp/audit/hardcode-2, /nlp/business-process, /nlp/console, /nlp/console/configuration-modul, /nlp/console/reports-cms, /nlp/console/settings, /nlp/console/users, /nlp/countries, /nlp/crawl-history, /nlp/crawling-dashboard, /nlp/detail-region, /nlp/disease-dashboard, /nlp/disease-master, /nlp/diseases, /nlp/events, /nlp/executive-dashboard, /nlp/extraction-rules, /nlp/interoperability, /nlp/language-markers, /nlp/language-models, /nlp/laporan, /nlp/laporan/eksekutif, /nlp/lite-dashboard, /nlp/locations, /nlp/login, /nlp/main-dashboard, /nlp/manual-crawler, /nlp/master-countries, /nlp/nlp-keywords, /nlp/nlp-labels, /nlp/outbreak-rules, /nlp/outside-asean, /nlp/processing, /nlp/reports, /nlp/reports/archive, /nlp/reports/cms, /nlp/reports/cms/issues/new, /nlp/reports/cms/taxonomies, /nlp/reports/cms/templates, /nlp/reports/executive, /nlp/reports/generate, /nlp/reports/latest, /nlp/reports/matrix, /nlp/reports/methodology, /nlp/source-credibility, /nlp/sources, /nlp/sources/new, /nlp/tv, /nlp/users, /nlp/web-services-dashboard.

### Dynamic route representative

Delapan template dynamic route diuji dan berhasil HTTP 200:

- /nlp/reports/test
- /nlp/reports/test/print
- /nlp/reports/country/THA
- /nlp/reports/disease/1D22
- /nlp/reports/w/2026-39
- /nlp/sources/1
- /nlp/reports/cms/issues/1
- /nlp/reports/cms/issues/1/review

Template dynamic lain tetap membutuhkan identifier valid dari database dan tidak dapat dibuktikan seluruh kombinasi parameternya dari smoke test ini.

### Catatan 503 saat burst

Request paralel pertama menghasilkan 503 pada /nlp/diseases, /nlp/reports/cms/taxonomies, dan /nlp/reports/methodology. Request individual sesudahnya menghasilkan 200 untuk ketiganya, dan rerun semua route secara berurutan juga bersih.

Kesimpulan route QA: tidak ada bukti route permanen 404, tetapi production perlu dipantau terhadap burst request atau cold-start karena response paralel sempat 503.

## Kesimpulan dan rekomendasi

Frontend belum bersih dari bahasa Indonesia. Akar masalahnya adalah sebagian halaman sudah memakai i18n, tetapi komponen baru atau yang diperbarui masih menulis string langsung di JSX, toast, placeholder, dan error handler.

Urutan perbaikan yang aman:

1. Pindahkan string ArticleReviewModal, CorrectionModal, dan error lib/api.ts ke dictionary en/id. Dampaknya langsung ke Analyze URL, Events, dan Crawl History.
2. Pindahkan teks CaseLocationHeatmap, DiseaseTrendOverview, dan manual-crawler ke dictionary; jangan menerjemahkan nilai evidence/data asli.
3. Pindahkan dialog dan toast CMS ke i18n.
4. Putuskan status IndonesiaDetailMapClient dan modul incident: aktifkan dengan i18n penuh, atau tandai legacy dan keluarkan dari bundle/route yang dipublikasikan.
5. Tambahkan CI check untuk literal bahasa Indonesia di komponen UI, dengan allowlist untuk locale id, halaman audit, nama geografis, dan evidence asli.
6. Tambahkan smoke test production berurutan dan burst ringan; status 200 saja belum memeriksa error API setelah hydration.

Tidak ada perubahan source code atau push yang dilakukan dalam audit ini.
