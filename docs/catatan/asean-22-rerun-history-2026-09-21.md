# Histori rerun uji 22 URL ASEAN

Tanggal pencatatan: 21 September 2026, Asia/Jakarta
Runner: `scripts/asean_22_terminal_test.py`
Endpoint: `http://localhost:3010/nlp`
Scope: 22 URL, dua URL per negara, termasuk Latin, Thai, Lao, Burmese, Khmer,
Malay, Vietnamese, Filipino, dan Portuguese.

Dokumen ini mencatat perubahan antar-run. Ini bukan gold-standard accuracy
benchmark dan tidak boleh dibaca sebagai klaim akurasi 99%.

## 1. Ringkasan tiga run

| Run | Kondisi pipeline | Full NLP | Partial/weak | Failed | Temuan utama |
|---|---|---:|---:|---:|---|
| Run 1 - 19 Sep | Baseline sebelum pemisahan status translation dan NLP | 14/22 (63,6%) | 7 | 1 | Translation timeout menurunkan status job; Malay sering terbaca sebagai Indonesian; relasi metric dan lokasi belum stabil. |
| Run 2 - 21 Sep | Source-first, native-script extraction, metric context, country guard | 19/22 (86,4%) | 0 | 3 | Translation timeout tidak lagi menghapus hasil extraction; angka Thai dan Vietnamese membaik; fetch/fallback masih gagal pada tiga URL. |
| Run 3 - 21 Sep | Async translation queue dan model guard terbaru | 19/22 (86,4%) | 0 | 3 | Translation tidak menghambat Full NLP; 6 translation queued dan 2 memakai cache; ditemukan konflik hierarchy Brunei pada event detail. |

### Perubahan antar-run

| Indikator | Run 1 | Run 2 | Run 3 | Makna |
|---|---:|---:|---:|---|
| Full NLP | 14 | 19 | 19 | Naik setelah extraction dibuat source-first dan status translation dipisah. |
| Partial/weak | 7 | 0 | 0 | Timeout translation tidak lagi menentukan status NLP utama. |
| Failed | 1 | 3 | 3 | Sisa masalah bergeser ke fetch/fallback, bukan ke translation. |
| Translation yang menahan job | Ya | Tidak, tetapi timeout masih tercatat | Tidak | Run 3 memakai queue background. |
| Original text sebagai authority | Belum konsisten | Ya | Ya | Translation hanya semantic enrichment. |
| Evidence offset | Tidak stabil pada hasil translated | Original text | Original text | Offset palsu dari hasil translation tidak digunakan. |

## 2. Run 1 - baseline, 19 September 2026

### Masalah yang terlihat

1. Tujuh job menjadi `partial/weak` karena translation tidak selesai dalam
   budget 20 detik, meskipun extraction dari teks asli kadang sudah memiliki
   angka dan disease.
2. VNM-02 mengambil `11` sebagai cases dari frasa `11 new outbreaks`, bukan
   `316 dengue cases`. Ini adalah false association antara angka dan label.
3. IDN-02 menggabungkan data lintas periode sehingga `69 deaths` dapat terbaca
   bersama cases dari periode lain.
4. BRN-01 menghasilkan hierarchy `Brunei / Bali / Jembrana` dengan geocode
   confidence nol. Ini menunjukkan lokasi publisher atau kandidat lokasi belum
   cukup dikontrol oleh country compatibility.
5. Malay pada BRN-01 dan MYS-01 terdeteksi sebagai `id`, walaupun artikelnya
   berbahasa Malay.
6. PHL-01 memproses halaman challenge sebagai artikel dan mendapat bahasa
   `fr`; PHL-02 mengalami kegagalan storage/job.
7. `0` dan field kosong belum selalu dibedakan dengan jelas antara tidak ada
   data, artikel non-surveillance, dan extractor gagal.

### Dampak surveillance

Hasil `FULL` belum cukup menjadi indikator kualitas. Sebagian hasil memiliki
angka, tetapi disease, time period, location, atau metric relation belum tentu
berasal dari konteks kalimat yang sama.

Detail matriks awal tetap tersedia di
[asean-22-url-test-2026-09-19.md](asean-22-url-test-2026-09-19.md).

## 3. Run 2 - source-first dan multilingual increment, 21 September 2026

### Perubahan yang sudah bekerja

- Original article tetap menjadi sumber extraction dan evidence.
- Native-script processing untuk Thai, Lao, Burmese, dan Khmer tidak lagi
  bergantung pada hasil translation untuk mempertahankan evidence.
- Metric non-case seperti `outbreaks` tidak lagi otomatis dianggap cases.
- Status `translation` dipisahkan dari status `analysis_status`.
- Country compatibility guard mulai menolak lokasi yang tidak cocok dengan
  negara event.
- Bahasa Indonesia tidak lagi dipaksa menunggu translation.

### Hasil penting

- Full NLP naik dari 14 menjadi 19 URL.
- THA-01 mempertahankan `99.691 cases` dan `15 deaths` dari teks Thai.
- VNM-02 berubah dari `11` menjadi `316 cases`.
- Lao dan Vietnamese tetap dapat menghasilkan source extraction walaupun
  translation mengalami timeout.
- MYS-01 masih `UNKNOWN` dan hanya menangkap sebagian metric.
- KHM-01 serta PHL-01/02 tetap gagal di fetch/fallback.

### Batasan run 2

Translation masih berjalan di jalur analisis yang sama dan timeout masih muncul
sebagai status tambahan. Jadi hasil extraction sudah lebih tahan terhadap
translation failure, tetapi resource translation belum sepenuhnya terisolasi.

Detail matriks run ini tersedia di
[asean-22-url-rerun-2026-09-21.md](asean-22-url-rerun-2026-09-21.md).

## 4. Run 3 - rerun setelah async translation, 21 September 2026

Perintah yang digunakan:

```bash
python3 scripts/asean_22_terminal_test.py \
  --poll-timeout 240 \
  --json-out /tmp/asean-22-rerun-2026-09-21-final.json
```

### Matriks hasil aktual

| ID | Negara | Target bahasa | NLP | Translation | Disease | Country | Cases | Deaths | Events | Review |
|---|---|---|---|---|---|---|---:|---:|---:|---|
| BRN-01 | Brunei | Malay | FULL | queued | Cholera | Brunei | 5 | 0 | 1 | Ya |
| BRN-02 | Brunei | English | FULL | not_required | Nipah virus disease | Brunei | 0 | 0 | 1 | Tidak |
| KHM-01 | Cambodia | Khmer | FAILED | - | - | - | - | - | 0 | - |
| KHM-02 | Cambodia | English | FULL | not_required | Avian influenza | Cambodia | 27 | 12 | 4 | Ya |
| IDN-01 | Indonesia | Indonesian | FULL | not_required | Measles | Indonesia | 8.372 | 6 | 1 | Tidak |
| IDN-02 | Indonesia | English | FULL | not_required | Measles | Indonesia | 8.224 | 69 | 1 | Tidak |
| LAO-01 | Laos | Lao | FULL | queued | Dengue | Laos | 1 | 0 | 1 | Ya |
| LAO-02 | Laos | English route | FULL | queued | Dengue | Laos | 214 | 0 | 1 | Ya |
| MYS-01 | Malaysia | Malay | FULL | queued | UNKNOWN | Malaysia | 32 | 0 | 0 | Ya |
| MYS-02 | Malaysia | English | FULL | not_required | Dengue | Malaysia | 65.979 | 62 | 1 | Tidak |
| MMR-01 | Myanmar | Burmese | FULL | completed/cache | UNKNOWN | Myanmar | 0 | 0 | 0 | Ya |
| MMR-02 | Myanmar | English | FULL | not_required | Cholera | Myanmar | 0 | 0 | 1 | Ya |
| PHL-01 | Philippines | Filipino | FAILED | - | - | - | - | - | 0 | - |
| PHL-02 | Philippines | English | FAILED | - | - | - | - | - | 0 | - |
| SGP-01 | Singapore | English | FULL | not_required | Measles | Singapore | 50 | 0 | 1 | Ya |
| SGP-02 | Singapore | English | FULL | not_required | Mpox | Singapore | 2 | 0 | 1 | Tidak |
| THA-01 | Thailand | Thai | FULL | completed/cache | COVID-19 | Thailand | 99.691 | 15 | 1 | Ya |
| THA-02 | Thailand | English | FULL | not_required | Dengue | Thailand | 19.000 | 17 | 1 | Ya |
| VNM-01 | Vietnam | Vietnamese | FULL | queued | Dengue | Vietnam | 146 | 0 | 1 | Tidak |
| VNM-02 | Vietnam | English | FULL | not_required | Dengue | Vietnam | 316 | 0 | 1 | Tidak |
| TLS-01 | Timor-Leste | Portuguese | FULL | queued | Dengue | Timor-Leste | 0 | 0 | 1 | Ya |
| TLS-02 | Timor-Leste | English | FULL | not_required | Dengue | Timor-Leste | 288 | 20 | 2 | Tidak |

Catatan: tanda titik pada angka mengikuti format matriks ini sebagai pemisah
ribuan, bukan pembulatan nilai asli. Nilai exact pada evidence asli tetap
disimpan oleh pipeline.

### Status translation run 3

| Status | Jumlah | Arti |
|---|---:|---|
| `queued` | 6 | Source extraction selesai; semantic translation menunggu worker background. |
| `completed` | 2 | Translation tersedia dari cache lokal. |
| `not_required` | 11 | Bahasa tidak membutuhkan translation untuk jalur ini. |

Tidak ada `503 Interactive NLP is busy` pada run ini. Translation tidak lagi
menjadi syarat untuk mengembalikan disease, metric, location, time, dan event
dari teks asli.

### Masalah yang terkonfirmasi pada run 3

1. Tiga URL tetap gagal walaupun HTTP fetch awal bernilai 200:
   `KHM-01`, `PHL-01`, dan `PHL-02`. Error aplikasi adalah `Fetch failed` dengan
   warning `Primary fetch failed; used HTTP fallback`. Ini harus dipisahkan dari
   `NLP failed` dan dari `translation failed`.
2. Pada `BRN-01`, kolom ringkas menunjukkan country Brunei, tetapi event detail
   masih memuat `country_iso3=IDN`, `admin1=Bali`, `admin2=Jembrana`, serta
   koordinat Bali. Ini adalah konflik hierarchy yang belum selesai dan harus
   ditolak atau diberi review sebelum persistence event.
3. `MYS-01` masih `UNKNOWN` walaupun 32 cases terdeteksi. Disease-to-metric
   relation Malay belum cukup kuat.
4. `MMR-01` selesai tetapi tetap `UNKNOWN` dan tanpa metric. Ini dapat merupakan
   artikel non-surveillance, sehingga tidak boleh diisi dengan disease dummy.
5. `KHM-02` menghasilkan empat event dari aggregate/breakdown dan tetap perlu
   review relation antar-event.
6. Translation cache untuk Thai dan Burmese berhasil, tetapi keberhasilan
   translation tidak digunakan sebagai bukti bahwa extraction surveillance
   benar. Bukti tetap berasal dari teks asli.

## 5. Diagnosis per lapisan

| Lapisan | Run 1 | Run 2 | Run 3 | Status sekarang |
|---|---|---|---|---|
| Collector/fetch | Challenge dan storage failure tercampur dengan NLP | Tiga URL gagal fallback | Masih tiga URL gagal, tetapi error lebih jelas | Perlu quality gate untuk challenge/empty shell dan retry/fetch policy per sumber. |
| Language/script | Malay sering menjadi `id`; beberapa route English berisi teks lokal | Native-script lebih stabil | Thai, Lao, Burmese, Vietnamese terdeteksi dan diproses | Malay/Indonesian dan route-language masih perlu evaluasi. |
| Translation | Menahan status menjadi partial | Timeout dipisahkan dari NLP | Async queue, cache, dan source-first | Tidak lagi menjadi bottleneck Full NLP. |
| Disease | UNKNOWN atau disease context tercampur | Thai/Vietnamese membaik | Burmese/Malay masih lemah | Perlu relation/context classifier yang tidak bergantung pada translation. |
| Metric | False case dari `outbreaks`; period tercampur | Metric non-case guard membantu | Angka native-script terbaca | Temporal attribution dan disease-metric pairing masih perlu diperbaiki. |
| Location | Brunei dapat Bali/Jembrana | Country guard mulai tersedia | Konflik nested event BRN-01 masih terlihat | Validasi country, hierarchy, dan geocode harus dilakukan sebelum event commit. |
| Event | Full belum berarti konteks koheren | Source evidence dipertahankan | Aggregate/breakdown masih perlu review | Event decision harus menunggu relation attribution. |

## 6. Prioritas setelah run 3

1. Perbaiki fetch quality gate untuk challenge page, empty article shell, dan
   fallback HTML; jangan mengubahnya menjadi `UNKNOWN` disease.
2. Tambahkan hard validation pada event detail: `country_iso3`, admin hierarchy,
   latitude, dan longitude harus kompatibel dengan country event. Jika tidak,
   event diberi review atau lokasi diturunkan ke country centroid.
3. Perbaiki Malay/Indonesian language disambiguation dan disease-metric
   attribution tanpa menunggu translation.
4. Tambahkan evaluasi temporal untuk memisahkan historical, cumulative, new,
   suspected, dan confirmed pada setiap metric.
5. Buat gold set beranotasi untuk menghitung precision/recall field-level.
   Sebelum itu, jangan menyebut angka 99% sebagai capaian.

## 7. Artefak dan status repository

- JSON run 3: `/tmp/asean-22-rerun-2026-09-21-final.json`
- Detail run 1: [asean-22-url-test-2026-09-19.md](asean-22-url-test-2026-09-19.md)
- Detail run 2: [asean-22-url-rerun-2026-09-21.md](asean-22-url-rerun-2026-09-21.md)
- Tidak ada perubahan yang dipush ke Gitea pada pencatatan ini.
