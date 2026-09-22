# Audit & Telaah Arsitektur Sistem Legacy ABVC Data Crawling Platform

**Tanggal Audit**: 22 September 2026  
**URL Target**: [data.aseanbiosurveillance.org](https://data.aseanbiosurveillance.org)  
**Lingkup Telaah**: Struktur Modul, Parameter Data, Master Data, dan Alur Kerja Operasional (*End-to-End Workflow*)  
**Akun Audit**: `fachri.mediacipta@gmail.com`

---

## 1. Identitas & Latar Belakang Sistem

Platform **ASEAN Biological Threats Surveillance Centre (ABVC) Data Crawling Platform** merupakan sistem akuisisi data intelijen biologis dan epidemiologi yang dikembangkan dalam kerangka program kemitraan **ASEAN–Canada** (*Mitigating Biological Threats in the ASEAN Region*).

* **Pengelola**: Tim Manajemen Proyek (PMT) Indonesia / Kementerian Kesehatan RI bekerja sama dengan **BlueDot Inc.** sebagai penyedia keahlian teknis intelijen penyakit.
* **Mandat Lembaga**: Di bawah koordinasi *ASEAN Expert Group on Communicable Diseases (AEGCD)* dan *Senior Officials Meeting on Health Development (SOMHD)*.
* **Tujuan Utama**: Penarikan data otomatis (*crawling/scraping*) dan pemantauan berita/media untuk mendeteksi potensi wabah, penyakit menular, jumlah kasus, kematian, serta sebaran geografis di kawasan ASEAN dan negara-negara mitra global secara dini (*Early Warning Outbreak System*).

---

## 2. Struktur Modul & Menu Sistem

Sistem legacy ini terbagi ke dalam 4 pilar modul utama:

```
data.aseanbiosurveillance.org
├── Dashboard (/dashboard)
│   ├── KPI Operasional (Active Users, Visits, Crawl Count)
│   └── Log Activity (Audit Trail Scraping)
├── Data Crawling
│   ├── Crawling Now (/)
│   ├── Auto Crawling / Schedule (/schedule)
│   ├── Crawling History (/history)
│   ├── History Monitoring (/data-crawling)
│   ├── Failed Crawling (/failed-crawling)
│   └── List Queue (/list-queue)
├── Master Data
│   ├── Disease (/master/disease & Alias Penyakit)
│   ├── Region (/master/region)
│   ├── Country (/master/country)
│   ├── Source Data (/master/source)
│   ├── Source Data Type (/master/source-data-type)
│   ├── User Management (/master/user)
│   └── User Approval (/master/user-approval)
└── About Us (/about-us)
```

---

## 3. Rincian Modul & Fungsinya

### A. Dashboard (`/dashboard`)
* **KPI Operasional**:
  * *Active Users*: 14 pengguna terdaftar aktif.
  * *Visit Count*: 675 kali kunjungan sistem.
  * *Manual Crawl Operations*: 118 kali eksekusi manual.
  * *Auto Crawl Operations*: 4.452 kali eksekusi otomatis.
* **Log Activity**:
  * Menampilkan riwayat aksi pengguna dan log cron scheduler crawling secara berurutan.
  * Memiliki arsip data yang sangat besar (lebih dari 4.200 halaman pagination log aktivitas).

---

### B. Modul Operasional Data Crawling

| Sub-Modul | Rute URL | Fungsi & Fitur Utama |
| :--- | :--- | :--- |
| **Crawling Now** | `/` | Menampilkan tabel ekstraksi sinyal kejadian wabah terbaru. Dilengkapi tombol *Export Data* (Excel/CSV) dan *Copy Data*. Entitas yang dicatat per baris: `Crawling Date`, `Disease`, `Region`, `Country`, `Province/City`, `Article Date`, `Case Date`, `Case Count`, `Death Count`, `Coordinate (Lat/Long)`, `Source Type`, dan status `Read/Unread`. |
| **Auto Crawling** | `/schedule` | Manajemen jadwal crawling berkala berbasis cron. Pengguna dapat menambah jadwal baru (`/schedule/create`) dengan menentukan frekuensi (Harian), jam eksekusi (GMT+7), kombinasi penyakit target, region/negara, dan toggle aktif/nonaktif. |
| **Crawling History**| `/history` | Log riwayat proses batch crawling (tipe Auto vs Manual, status *Done/Failed/Running*, jumlah data yang diekstrak, serta tautan ke detail per batch di `/history/detail/{id}`). |
| **History Monitoring** | `/data-crawling` | Basis data historis seluruh sinyal wabah yang telah berhasil ditarik dan diverifikasi (mencakup 1.485+ rekor data kasus penyakit ASEAN dan global). |
| **Failed Crawling** | `/failed-crawling` | Daftar URL atau artikel yang mengalami kegagalan penarikan (akibat HTTP 403, domain down, struktur HTML berubah, atau kegagalan parsing) untuk evaluasi teknis. |
| **List Queue** | `/list-queue` | Antrean proses penarikan data (*task queue*) yang sedang berjalan (*in-progress*) atau menunggu antrean mesin crawler. |

---

### C. Modul Master Data (Konfigurasi Referensi)

| Master Data | Rute URL | Rincian & Konfigurasi |
| :--- | :--- | :--- |
| **Disease** | `/master/disease` | Katalog penyakit menular yang dipantau (Dengue, COVID-19, Mpox, Zika, Rabies, Typhoid, Tuberculosis, Anthrax, Ebola, Avian Influenza, dll.). |
| **Disease Alias** | `/master/disease/alias/{id}` | **Fitur Kunci Multilingual**: Pengaturan sinonim/kata kunci lokal nama penyakit per negara (maksimal 3 alias per negara, misal: penamaan lokal dalam Bahasa Melayu, Tagalog, Thai, Vietnam) agar mesin scraper dapat menangkap berita lokal non-Inggris. |
| **Region** | `/master/region` | Pengelompokan kawasan geopolitik: `ASEAN`, `GLOBAL`, `Global_+3_Oceania`, `Global_Asia1`, `Global_Asia2`, `Global_Europe1`, `Global_Europe2`, `Global_Africa_NorthAmerica`. |
| **Country** | `/master/country` | Daftar master negara lengkap dengan kode ISO-2 (ID, MY, TH, SG, PH, VN, dll.). |
| **Source Data** | `/master/source` | Master direktori 1.290+ URL sumber media (terbagi menjadi 605 *Main Sources* dan 687 *Other Sources*). Setiap sumber ditandai tingkat keaslian: *Official* (portal Kemenkes/pemerintah) vs *Unofficial* (media massa/portal berita umum). |
| **Source Data Type** | `/master/source-data-type` | Format target media: *Google News, Local News, Official Government Sites, X (Twitter), Facebook, PDF, XML, JSON, HTML Table*. |
| **User Management & Approval** | `/master/user` & `/master/user-approval` | Pengaturan hak akses peran (Admin/User), asal negara instansi, dan verifikasi persetujuan akun baru. |

---

## 4. Alur Kerja Sistem (*End-to-End Workflow*)

```text
┌────────────────────────────────────────────────────────┐
│                   1. MASTER DATA SETUP                 │
│  Penyakit + Alias Bahasa + Sumber Media URL + Lokasi   │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│              2. PENJADWALAN & PICU ANTREAN             │
│   Auto Crawl (Cron GMT+7) atau Manual Crawl masuk ke   │
│                 List Queue (/list-queue)               │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│             3. MESIN CRAWLING & PENGAMBILAN            │
│   Pengambilan konten via HTTP/RSS/API sesuai format    │
│    (Google News, Local News, Web Resmi, PDF, XML)      │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│          4. PENYARINGAN KATA KUNCI & ALIAS             │
│   Pencocokan nama penyakit dan alias lokal bahasa      │
│   (ID/MY/TH/VN/PH) pada judul dan teks artikel         │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│            5. EKSTRAKSI ENTITAS EPIDEMIOLOGI           │
│   Ekstraksi: Kasus, Kematian, Tanggal Artikel/Kasus,   │
│    Lokasi Administrasi (Provinsi/Kota), Titik GPS      │
└──────────────────────────┬─────────────────────────────┘
                           │
            ┌──────────────┴──────────────┐
            ▼                             ▼
┌───────────────────────┐     ┌────────────────────────┐
│    SUKSES EKSTRAKSI   │     │    GAGAL / TIMEOUT     │
│   - Masuk Crawling Now│     │  - Masuk Failed Crawl  │
│   - Arsip di History  │     │  - Evaluasi URL/format │
│     Monitoring        │     └────────────────────────┘
└───────────────────────┘
```

---

## 5. Komparasi dengan Sistem Baru (`NLP-PENYAKIT`)

| Aspek | Sistem Legacy (`data.aseanbiosurveillance.org`) | Sistem Baru (`NLP-PENYAKIT`) |
| :--- | :--- | :--- |
| **Metode Ekstraksi** | Berbasis pencocokan kata kunci (*keyword-based regex*) & alias 3 kata per negara. | Pipeline AI/NLP terpadu (*Transformer XLM-RoBERTa, SpaCy NER, Bounded Analysis, Multi-event Extractor*). |
| **Resolusi Wilayah** | Flat text (*Country, Province/City*) + manual static lat/long. | *Location Guard, Hierarchy Validation (ADM0/ADM1/ADM2), Bounding-box verification, Overpass API*. |
| **Atribusi Metrik** | Sering menggabungkan angka agregat nasional ke pecahan wilayah. | *Surgical Disease-Metric Attribution (§10)*: Parent metric country-level exact, child event isolated. |
| **Arsitektur Backend** | PHP / Monolithic MVC + RDBMS klasik. | *Microservices modern*: Next.js 15 App Router, Rust Actix/Axum Backend, Python FastAPI NLP, RabbitMQ durable queue, PostgreSQL, Docker. |
| **Multilingual** | Tabel manual *Disease Alias* (3 slot per negara). | *Multilingual Language Markers, Lexicon SQL migrations (Slice 6), Native-script NLLB translation*. |
