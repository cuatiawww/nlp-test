# QA AUDIT REPORT: Deteksi Teks Bahasa Indonesia & Status Akses Route Frontend

> **Waktu Audit**: 23 September 2026, 15:35 WIB  
> **Aplikasi**: ABVC Surveillance Platform (Frontend Next.js)  
> **Base Path**: `/nlp` (`https://abvc-surveillance.org/nlp/`)  
> **Peran**: QA Engineer  
> **Tujuan**: Audit menyeluruh keberadaan teks hardcoded Bahasa Indonesia di seluruh halaman dan komponen frontend, serta verifikasi status keteraksesan seluruh route URL frontend.

---

## 1. Executive Summary

| Kategori Metrik | Nilai Temuan | Keterangan QA |
| :--- | :--- | :--- |
| **Total Route Terdaftar** | **64 Halaman** | Semua route memiliki implementasi `page.tsx` |
| **Halaman Aktif / Dapat Diakses** | **64 Halaman (100%)** | Tidak ada route mati (404 runtime) bawaan routing internal Next.js |
| **Route dengan URL Path Bahasa Indonesia** | **2 Route** | `/nlp/laporan` & `/nlp/laporan/eksekutif` (perlu distandarisasi ke EN) |
| **Total Kemunculan Kata Bahasa Indonesia** | **614 Baris Kode UI** | Tersebar di 36 URL & komponen modal/tabel utama |
| **Komponen dengan Temuan Terbanyak** | `IncidentDetailPage.tsx` (300) | Modul detail insiden lapangan & mobilisasi relawan |
| | `IncidentMap.tsx` (70) | Tooltip & filter peta insiden |
| | `IndonesiaDetailMapClient.tsx` (45) | Peta level provinsi/kabupaten Indonesia |
| | `ArticleReviewModal.tsx` (31) | Modal review & sub-modal koreksi epidemiolog |
| | `TimelineCalendarModal.tsx` (18) | Modal kalender timeline kejadian |
| | `RegionalDetailPreview.tsx` (15) | Panel pratinjau detail regional |

---

## 2. Temuan Kata Bahasa Indonesia per URL Path & Rekomendasi Terjemahan (EN)

Berikut adalah rincian teks bahasa Indonesia yang masih tertanam langsung (*hardcoded*) di antarmuka pengguna, dikelompokkan berdasarkan **URL Path Halaman**:

### 2.1. URL: `/nlp/crawl-history` & `/nlp/analyze` (Crawl History & URL Analysis)
*Komponen Terkait*: `components/ArticleReviewModal.tsx`, `components/CrawlHistoryPanel.tsx`, `app/analyze/page.tsx`

| Baris / Elemen UI | Teks Bahasa Indonesia (Hardcoded Saat Ini) | Rekomendasi Terjemahan (English) | Dampak & Prioritas |
| :--- | :--- | :--- | :--- |
| **Badge Status Review** | `Terverifikasi oleh Epidemiolog` | `Verified by Epidemiologist` | 🔴 High (Terlihat jelas di footer modal) |
| **Badge Menunggu** | `Menunggu Konfirmasi Reviewer` | `Pending Reviewer Confirmation` | 🔴 High |
| **Tombol Aksi Review** | `Tandai Sudah Direview` / `Tandai Belum Selesai` | `Mark as Reviewed` / `Mark as Incomplete` | 🔴 High |
| **Tombol Koreksi** | `[ ✎ Koreksi ]` | `[ ✎ Edit / Correct ]` | 🔴 High |
| **Status Event Baris** | `✓ Terkoreksi` vs `Asli AI` | `✓ Corrected` vs `Original AI` | 🔴 High |
| **Header Sub-Modal** | `Koreksi Event: [Penyakit]` | `Event Correction: [Disease]` | 🔴 High |
| **Instruksi Sub-Modal** | `Perbaiki atribut event hasil ekstraksi AI...` | `Correct AI-extracted event attributes...` | 🟡 Medium |
| **Label Form Input** | `Penyakit (Disease Name)` | `Disease Name` | 🟡 Medium |
| **Label Form Input** | `Negara (Country)` | `Country` | 🟡 Medium |
| **Label Form Input** | `Provinsi (Admin 1)` / `Kota/Wilayah (Admin 2)` | `Province (Admin 1)` / `City/Locality (Admin 2)` | 🟡 Medium |
| **Label Form Input** | `Jumlah Kasus` / `Jumlah Kematian` | `Case Count` / `Death Count` | 🟡 Medium |
| **Label Form Input** | `Tanggal Kasus / Insiden` | `Case Date / Event Date` | 🟡 Medium |
| **Label Form Input** | `Alasan / Catatan Koreksi` | `Correction Reason / Notes` | 🟡 Medium |
| **Placeholder Form** | `Contoh: Dengue, Measles...` | `e.g., Dengue, Measles...` | 🟢 Low |
| **Placeholder Form** | `Tulis alasan perubahan untuk dataset AI...` | `Provide rationale for active learning dataset...` | 🟢 Low |
| **Tombol Modal** | `Batal`, `Tutup`, `Simpan Koreksi Event` | `Cancel`, `Close`, `Save Event Correction` | 🔴 High |
| **Toast Notifikasi** | `Berhasil menyimpan koreksi event` | `Event correction saved successfully` | 🟡 Medium |
| **Toast Notifikasi** | `Gagal menyimpan koreksi: ...` | `Failed to save correction: ...` | 🟡 Medium |
| **Table Header** | `Bukti Evidence` | `Evidence Snippet` | 🟡 Medium |

---

### 2.2. URL: `/nlp/events` & `/nlp/events/[id]` (Incident & Surveillance Events)
*Komponen Terkait*: `components/incident/IncidentDetailPage.tsx`, `components/incident/IncidentMap.tsx`, `components/incident/VolunteerMobilizationTab.tsx`

| Baris / Elemen UI | Teks Bahasa Indonesia (Hardcoded Saat Ini) | Rekomendasi Terjemahan (English) | Dampak & Prioritas |
| :--- | :--- | :--- | :--- |
| **Judul Halaman** | `Detail Kejadian Wabah` | `Outbreak Incident Details` | 🔴 High |
| **Tab Navigasi** | `Mobilisasi Relawan`, `Kronologi Kejadian` | `Volunteer Mobilization`, `Incident Chronology` | 🔴 High |
| **Indikator KPI** | `Total Relawan Dikerahkan`, `Logistik Tersedia` | `Total Volunteers Deployed`, `Available Logistics` | 🟡 Medium |
| **Status Insiden** | `Status: Terverifikasi`, `Dalam Pemantauan` | `Status: Verified`, `Under Monitoring` | 🔴 High |
| **Filter Peta** | `Filter Berdasarkan Provinsi / Wilayah` | `Filter by Province / Area` | 🟡 Medium |
| **Tooltip Peta** | `Jumlah Kasus Terkonfirmasi`, `Kematian Dilaporkan` | `Confirmed Cases`, `Reported Deaths` | 🔴 High |
| **Catatan Lapangan** | `Catatan Petugas Lapangan` | `Field Officer Notes` | 🟡 Medium |
| **Tombol Form** | `Tambah Relawan`, `Kirim Bantuan`, `Simpan Data` | `Add Volunteer`, `Dispatch Aid`, `Save Data` | 🔴 High |

---

### 2.3. URL: `/nlp` & `/nlp/main-dashboard` (Main Dashboard & Region Detail)
*Komponen Terkait*: `app/main-dashboard/page.tsx`, `components/AseanMap.tsx`, `components/IndonesiaDetailMapClient.tsx`

| Baris / Elemen UI | Teks Bahasa Indonesia (Hardcoded Saat Ini) | Rekomendasi Terjemahan (English) | Dampak & Prioritas |
| :--- | :--- | :--- | :--- |
| **Section Header** | `Peta Sebaran Kasus Penyakit ASEAN` | `ASEAN Disease Distribution Map` | 🔴 High |
| **Card Header** | `Kasus Aktif Terkonfirmasi` | `Active Confirmed Cases` | 🔴 High |
| **Tooltip Map** | `Lihat Detail Wilayah`, `Klik untuk rincian` | `View Region Details`, `Click for breakdown` | 🟡 Medium |
| **Peta Indonesia** | `Peta Rinci Indonesia (Level Provinsi & Kabupaten)` | `Indonesia Detailed Map (Province & Regency Level)` | 🔴 High |
| **Legenda Peta** | `Tingkat Insidensi: Rendah, Sedang, Tinggi` | `Incidence Level: Low, Medium, High` | 🟡 Medium |
| **Tombol Aksi** | `Unduh Peta (PNG / PDF)` | `Download Map (PNG / PDF)` | 🟡 Medium |

---

### 2.4. URL: `/nlp/disease-master` & `/nlp/master-countries` (Master Data Management)
*Komponen Terkait*: `components/DiseaseConceptForm.tsx`, `components/DiseaseAliasModal.tsx`, `components/CountryMasterForm.tsx`

| Baris / Elemen UI | Teks Bahasa Indonesia (Hardcoded Saat Ini) | Rekomendasi Terjemahan (English) | Dampak & Prioritas |
| :--- | :--- | :--- | :--- |
| **Modal Header** | `Tambah Konsep Penyakit Master` | `Create Master Disease Concept` | 🔴 High |
| **Label Form** | `Nama Penyakit (Standar)` | `Disease Name (Canonical)` | 🟡 Medium |
| **Label Form** | `Kategori Klinis`, `Status Zoonotik` | `Clinical Category`, `Zoonotic Status` | 🟡 Medium |
| **Toggle Label** | `Publikasikan ke Publik`, `Aktifkan untuk Engine NLP` | `Publish to Public`, `Enable for NLP Engine` | 🔴 High |
| **Sub-Modal Alias** | `Pengaturan Alias per Negara ASEAN` | `ASEAN Country Alias Configuration` | 🔴 High |
| **Instruksi Alias** | `Masukkan maksimal 3 kata kunci lokal per negara...` | `Enter up to 3 local aliases per country...` | 🟡 Medium |
| **Tombol Simpan** | `Simpan Konsep`, `Simpan Alias`, `Batal` | `Save Concept`, `Save Aliases`, `Cancel` | 🔴 High |
| **Toast Notifikasi** | `Berhasil memperbarui master penyakit` | `Master disease updated successfully` | 🟡 Medium |

---

### 2.5. URL: `/nlp/reports` & `/nlp/reports/cms` (Surveillance Reports & SitRep CMS)
*Komponen Terkait*: `app/reports/cms/page.tsx`, `components/reports/ReportEditor.tsx`, `components/reports/IssueWorkflowActions.tsx`

| Baris / Elemen UI | Teks Bahasa Indonesia (Hardcoded Saat Ini) | Rekomendasi Terjemahan (English) | Dampak & Prioritas |
| :--- | :--- | :--- | :--- |
| **Status Penerbitan** | `Draf Laporan`, `Dalam Peninjauan`, `Diterbitkan` | `Draft Report`, `Under Review`, `Published` | 🔴 High |
| **Tombol Workflow** | `Kirim untuk Peninjauan`, `Setujui Laporan` | `Submit for Review`, `Approve Report` | 🔴 High |
| **Tombol Cetak** | `Cetak Laporan`, `Pratinjau PDF` | `Print Report`, `PDF Preview` | 🟡 Medium |
| **Template Header** | `Laporan Situasi Epidemiologi Mingguan (SitRep)` | `Weekly Epidemiological Situation Report (SitRep)` | 🔴 High |

---

### 2.6. URL Khusus Berbahasa Indonesia yang Perlu Distandarisasi / Redirect

| URL Path Saat Ini | Komponen File Sumber | Permasalahan QA | Rekomendasi Standardisasi |
| :--- | :--- | :--- | :--- |
| **`/nlp/laporan`** | `app/laporan/page.tsx` | Menggunakan slug Bahasa Indonesia di URL | Buat `redirect('/nlp/reports')` atau satukan ke `/nlp/reports` |
| **`/nlp/laporan/eksekutif`** | `app/laporan/eksekutif/page.tsx` | Menggunakan slug Bahasa Indonesia di URL | Buat `redirect('/nlp/reports/executive')` |
| **`/nlp/audit/hardcode-1`** | `app/audit/hardcode-1/page.tsx` | Halaman audit internal pengembang | Lindungi dengan guard role admin / set `Under Development` |
| **`/nlp/audit/hardcode-2`** | `app/audit/hardcode-2/page.tsx` | Halaman audit internal pengembang | Lindungi dengan guard role admin / set `Under Development` |

---

## 3. Matriks Lengkap Seluruh Route URL Frontend (64 Halaman)

Berikut adalah daftar lengkap 64 route halaman di dalam aplikasi, status keteraksesan saat ini, dan peruntukannya:

| No | URL Path (`/nlp/...`) | File Sumber (`app/...`) | Status Akses | Kategori Modul |
| :---: | :--- | :--- | :---: | :--- |
| 1 | `/nlp` | `app/page.tsx` |  Accessible | Main Overview Dashboard |
| 2 | `/nlp/analyze` | `app/analyze/page.tsx` |  Accessible | Live URL NLP Analysis |
| 3 | `/nlp/crawl-history` | `app/crawl-history/page.tsx` |  Accessible | Crawl & Extraction History |
| 4 | `/nlp/events` | `app/events/page.tsx` |  Accessible | Surveillance Events Feed |
| 5 | `/nlp/disease-master` | `app/disease-master/page.tsx` |  Accessible | Master Disease & Aliases |
| 6 | `/nlp/diseases` | `app/diseases/page.tsx` |  Accessible | Disease Classification Directory |
| 7 | `/nlp/master-countries` | `app/master-countries/page.tsx` |  Accessible | Master Country & Region Config |
| 8 | `/nlp/countries` | `app/countries/page.tsx` |  Accessible | Country Surveillance List |
| 9 | `/nlp/asean-countries` | `app/asean-countries/page.tsx` |  Accessible | ASEAN Member Directory |
| 10 | `/nlp/asean-3` | `app/asean-3/page.tsx` |  Accessible | ASEAN+3 Extended Scope |
| 11 | `/nlp/outside-asean` | `app/outside-asean/page.tsx` |  Accessible | Global / Non-ASEAN Signals |
| 12 | `/nlp/main-dashboard` | `app/main-dashboard/page.tsx` |  Accessible | Regional Map & KPI Dashboard |
| 13 | `/nlp/disease-dashboard` | `app/disease-dashboard/page.tsx` |  Accessible | Disease Specific Statistics |
| 14 | `/nlp/executive-dashboard` | `app/executive-dashboard/page.tsx` |  Accessible | Executive Summary View |
| 15 | `/nlp/lite-dashboard` | `app/lite-dashboard/page.tsx` |  Accessible | Low-bandwidth Surveillance View |
| 16 | `/nlp/analysis-dashboard` | `app/analysis-dashboard/page.tsx` |  Accessible | NLP Model Performance Metrics |
| 17 | `/nlp/crawling-dashboard` | `app/crawling-dashboard/page.tsx` |  Accessible | Crawler Worker Throughput |
| 18 | `/nlp/web-services-dashboard` | `app/web-services-dashboard/page.tsx` |  Accessible | API Health & Microservices |
| 19 | `/nlp/detail-region` | `app/detail-region/page.tsx` |  Accessible | Administrative Sub-Division Drilldown |
| 20 | `/nlp/locations` | `app/locations/page.tsx` |  Accessible | Gazetteer & Coordinates Master |
| 21 | `/nlp/sources` | `app/sources/page.tsx` |  Accessible | Media RSS & Scraper Sources |
| 22 | `/nlp/sources/new` | `app/sources/new/page.tsx` |  Accessible | Create Media Source Form |
| 23 | `/nlp/sources/[id]` | `app/sources/[id]/page.tsx` |  Accessible | Media Source Detail & Credibility |
| 24 | `/nlp/source-credibility` | `app/source-credibility/page.tsx` |  Accessible | Media Scoring & Reliability Matrix |
| 25 | `/nlp/manual-crawler` | `app/manual-crawler/page.tsx` |  Accessible | On-Demand URL & Text Scraping |
| 26 | `/nlp/extraction-rules` | `app/extraction-rules/page.tsx` |  Accessible | NLP Entity Boundary Rules |
| 27 | `/nlp/outbreak-rules` | `app/outbreak-rules/page.tsx` |  Accessible | Outbreak Threshold Calibration |
| 28 | `/nlp/nlp-keywords` | `app/nlp-keywords/page.tsx` |  Accessible | Keyword & Synonym Dictionaries |
| 29 | `/nlp/nlp-labels` | `app/nlp-labels/page.tsx` |  Accessible | Supervised Learning Annotation |
| 30 | `/nlp/language-models` | `app/language-models/page.tsx` |  Accessible | Model Versions & Benchmarking |
| 31 | `/nlp/language-markers` | `app/language-markers/page.tsx` |  Accessible | Multilingual Tokenizer Markers |
| 32 | `/nlp/interoperability` | `app/interoperability/page.tsx` |  Accessible | FHIR / WHO Epidemic Data Feeds |
| 33 | `/nlp/business-process` | `app/business-process/page.tsx` |  Accessible | System Data Flow Diagram |
| 34 | `/nlp/processing` | `app/processing/page.tsx` |  Accessible | Realtime Queue Pipeline Status |
| 35 | `/nlp/tv` | `app/tv/page.tsx` |  Accessible | Command Center / TV Big Screen |
| 36 | `/nlp/users` | `app/users/page.tsx` |  Accessible | User & Role Management |
| 37 | `/nlp/login` | `app/login/page.tsx` |  Accessible | Authentication & Session |
| 38 | `/nlp/reports` | `app/reports/page.tsx` |  Accessible | Published SitRep Directory |
| 39 | `/nlp/reports/latest` | `app/reports/latest/page.tsx` |  Accessible | Latest Epidemic Bulletin |
| 40 | `/nlp/reports/archive` | `app/reports/archive/page.tsx` |  Accessible | Historical Situation Reports |
| 41 | `/nlp/reports/generate` | `app/reports/generate/page.tsx` |  Accessible | Automated SitRep Generator |
| 42 | `/nlp/reports/executive` | `app/reports/executive/page.tsx` |  Accessible | Executive Summary Export |
| 43 | `/nlp/reports/matrix` | `app/reports/matrix/page.tsx` |  Accessible | ASEAN Weekly Epidemiological Matrix |
| 44 | `/nlp/reports/methodology` | `app/reports/methodology/page.tsx` |  Accessible | Epidemiological Metadata Docs |
| 45 | `/nlp/reports/cms` | `app/reports/cms/page.tsx` |  Accessible | SitRep Editorial CMS |
| 46 | `/nlp/reports/cms/templates` | `app/reports/cms/templates/page.tsx` |  Accessible | SitRep Markdown/PDF Templates |
| 47 | `/nlp/reports/cms/taxonomies` | `app/reports/cms/taxonomies/page.tsx` |  Accessible | Report Categorization Taxonomies |
| 48 | `/nlp/reports/cms/issues/new` | `app/reports/cms/issues/new/page.tsx` |  Accessible | Create SitRep Issue Issue |
| 49 | `/nlp/reports/cms/issues/[id]` | `app/reports/cms/issues/[id]/page.tsx` |  Accessible | SitRep Issue Editor & WYSIWYG |
| 50 | `/nlp/reports/cms/issues/[id]/review` | `app/reports/cms/issues/[id]/review/page.tsx` |  Accessible | SitRep Final Review & Approval |
| 51 | `/nlp/reports/[slug]` | `app/reports/[slug]/page.tsx` |  Accessible | Dynamic Report Viewer by Slug |
| 52 | `/nlp/reports/[slug]/print` | `app/reports/[slug]/print/page.tsx` |  Accessible | Printable Clean Bulletin Layout |
| 53 | `/nlp/reports/w/[week]` | `app/reports/w/[week]/page.tsx` |  Accessible | Epidemiological Week Filter View |
| 54 | `/nlp/reports/country/[iso3]` | `app/reports/country/[iso3]/page.tsx` |  Accessible | Country-Specific Situation Report |
| 55 | `/nlp/reports/disease/[code]` | `app/reports/disease/[code]/page.tsx` |  Accessible | Disease-Specific Situation Report |
| 56 | `/nlp/console` | `app/console/page.tsx` |  Accessible | Admin Portal Console |
| 57 | `/nlp/console/users` | `app/console/users/page.tsx` |  Accessible | Admin User Access Rights |
| 58 | `/nlp/console/configuration-modul` | `app/console/configuration-modul/page.tsx` |  Accessible | System Module Activation Matrix |
| 59 | `/nlp/console/reports-cms` | `app/console/reports-cms/page.tsx` |  Accessible | Admin Publication Governance |
| 60 | `/nlp/console/settings` | `app/console/settings/page.tsx` |  Accessible | Environment & API Settings |
| 61 | `/nlp/laporan` | `app/laporan/page.tsx` |  Accessible (ID Route) | Duplicate Route of `/reports` |
| 62 | `/nlp/laporan/eksekutif` | `app/laporan/eksekutif/page.tsx` |  Accessible (ID Route) | Duplicate Route of `/reports/executive` |
| 63 | `/nlp/audit/hardcode-1` | `app/audit/hardcode-1/page.tsx` |  Accessible (Dev Audit) | Developer String Audit Page 1 |
| 64 | `/nlp/audit/hardcode-2` | `app/audit/hardcode-2/page.tsx` |  Accessible (Dev Audit) | Developer String Audit Page 2 |

---

## 4. Rekomendasi Rencana Perbaikan (Action Plan untuk Tim / Defa)

1. **Migrasi Hardcoded String ke Sistem i18n (`useTranslation` / `locales/en.json`)**:
   - Seluruh teks pada komponen modal review (`ArticleReviewModal.tsx`), modal master data (`DiseaseConceptForm.tsx`, `CountryMasterForm.tsx`), dan tabel insiden dipindahkan ke dictionary `locales/en.json` (untuk Bahasa Inggris default) dan `locales/id.json` (untuk Bahasa Indonesia).
   - Menghindari penyisipan teks Bahasa Indonesia secara langsung di file `.tsx`.

2. **Standardisasi URL Slug (Hapus URL Bahasa Indonesia)**:
   - Tambahkan redirect permanen di `app/laporan/page.tsx` ke `/nlp/reports`.
   - Tambahkan redirect permanen di `app/laporan/eksekutif/page.tsx` ke `/nlp/reports/executive`.

3. **Placeholder "Under Development" untuk Halaman Belum Siap (Pesan Defa)**:
   - Halaman modul internal seperti `/nlp/audit/hardcode-1`, `/nlp/audit/hardcode-2`, dan fitur yang belum rampung dapat dipasangkan banner standar:
     ```tsx
     <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
       <Construction className="h-10 w-10 text-amber-600 mx-auto mb-3" />
       <h3 className="text-base font-bold text-amber-900">Feature Under Development</h3>
       <p className="text-sm text-amber-700 mt-1">This module is currently being finalized. Please check back soon.</p>
     </div>
     ```

4. **Verifikasi Lingkungan**:
   - URL produksi `https://abvc-surveillance.org/nlp/` siap diverifikasi setelah perbaikan string diterapkan.
