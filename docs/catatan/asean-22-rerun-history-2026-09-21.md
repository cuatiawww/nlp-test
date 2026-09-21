# Histori rerun uji 22 URL ASEAN

Tanggal pencatatan: 21 September 2026, Asia/Jakarta
Runner: `scripts/asean_22_terminal_test.py`
Endpoint: `http://localhost:3010/nlp`
Scope: 22 URL, dua URL per negara, termasuk Latin, Thai, Lao, Burmese, Khmer,
Malay, Vietnamese, Filipino, dan Portuguese.

Dokumen ini mencatat perubahan antar-run. Ini bukan gold-standard accuracy
benchmark dan tidak boleh dibaca sebagai klaim akurasi 99%.

## 1. Ringkasan empat run

| Run | Kondisi pipeline | Full NLP | Partial/weak | Failed | Temuan utama |
|---|---|---:|---:|---:|---|
| Run 1 - 19 Sep | Baseline sebelum pemisahan status translation dan NLP | 14/22 (63,6%) | 7 | 1 | Translation timeout menurunkan status job; Malay sering terbaca sebagai Indonesian; relasi metric dan lokasi belum stabil. |
| Run 2 - 21 Sep | Source-first, native-script extraction, metric context, country guard | 19/22 (86,4%) | 0 | 3 | Translation timeout tidak lagi menghapus hasil extraction; angka Thai dan Vietnamese membaik; fetch/fallback masih gagal pada tiga URL. |
| Run 3 - 21 Sep | Async translation queue dan model guard terbaru | 19/22 (86,4%) | 0 | 3 | Translation tidak menghambat Full NLP; 6 translation queued dan 2 memakai cache; ditemukan konflik hierarchy Brunei pada event detail. |
| Run 4 - 21 Sep | 10 URL baru dari sumber resmi/media ASEAN, diuji melalui terminal | 9/10 (90,0%) | 0 | 1 | Fetch challenge BERNAMA; disease-metric dan parent/event attribution masih berbeda pada beberapa artikel; country conflict Thailand terdeteksi dan diamankan. |

### Perubahan antar-run

| Indikator | Run 1 | Run 2 | Run 3 | Run 4 | Makna |
|---|---:|---:|---:|---:|---|
| Full NLP | 14/22 | 19/22 | 19/22 | 9/10 | Run 4 memakai sampel URL baru, bukan pengganti suite 22 URL. |
| Partial/weak | 7 | 0 | 0 | 0 | Timeout translation tidak lagi menentukan status NLP utama. |
| Failed | 1 | 3 | 3 | 1 | Sisa masalah utama berada pada fetch challenge. |
| Translation yang menahan job | Ya | Tidak, tetapi timeout masih tercatat | Tidak | Tidak | Translation tetap auxiliary dan tidak menghalangi extraction. |
| Original text sebagai authority | Belum konsisten | Ya | Ya | Ya | Translation hanya semantic enrichment. |
| Evidence offset | Tidak stabil pada hasil translated | Original text | Original text | Original text | Offset palsu dari hasil translation tidak digunakan. |

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

## 5. Run 4 - 10 URL baru, 21 September 2026

Run ini menggunakan 10 URL baru dari Indonesia, Philippines, Malaysia,
Vietnam, Thailand, Singapore, Myanmar, Cambodia, Laos, dan Brunei. Pengujian
dijalankan dari terminal melalui helper async yang sama dengan `analyze_one`,
`force_refresh=true`, dan polling maksimum 240 detik per URL.

### Matriks hasil aktual

| ID | Negara target | Bahasa terdeteksi | NLP | Translation | Disease parent | Country parent | Cases parent | Deaths parent | Events | Review |
|---|---|---|---|---|---|---|---:|---:|---:|---|
| IDN-NEW | Indonesia | `id` | FULL | not_required | Measles | Indonesia | 8.224 | 4 | 1 | Ya |
| PHL-NEW | Philippines | `en` | FULL | not_required | Measles | Philippines | 1.627 | 0 | 2 | Ya |
| MYS-NEW | Malaysia | - | FAILED | - | - | - | - | - | 0 | - |
| VNM-NEW | Vietnam | `en` | FULL | not_required | Hand, foot and mouth disease | Vietnam | 25.000 | 4 | 2 | Tidak |
| THA-NEW | Thailand | `en` | FULL | not_required | Leptospirosis | Myanmar | 2.190 | 2 | 1 | Ya |
| SGP-NEW | Singapore | `en` | FULL | not_required | Measles | Singapore | 3 | 0 | 1 | Ya |
| MMR-NEW | Myanmar | `en` | FULL | not_required | Malaria | Myanmar | 0 | 0 | 1 | Ya |
| KHM-NEW | Cambodia | `en` | FULL | not_required | Avian influenza | Cambodia | 1 | 6 | 2 | Ya |
| LAO-NEW | Laos | `en` | FULL | not_required | Rabies | Laos | 837 | 59 | 1 | Tidak |
| BRN-NEW | Brunei | `en` | FULL | not_required | Ebola disease, virus unspecified | Brunei | 246 | 80 | 1 | Tidak |

Full NLP selesai pada 9/10 URL. BERNAMA gagal sebelum NLP karena source
browser challenge HTTP 403:

`https://www.bernama.com/bm/news.php/news.php?id=2526093`

Semua URL yang berhasil pada run ini berstatus `translation=not_required`.
Dengan demikian Run 4 terutama menguji fetch, extraction, disease-metric
relation, country attribution, dan event grouping; run ini belum menjadi
validasi NLLB untuk aksara lokal.

### Event dan attribution yang perlu ditindaklanjuti

1. Artikel Indonesia menghasilkan parent `8.224 cases`, tetapi event detail
   memiliki `8.245 cases` di Sumatera Barat. Parent dan event belum memakai
   metric relation yang sama.
2. Rappler menghasilkan dua event, tetapi disease pada kedua sub-event menjadi
   `UNKNOWN` walaupun parent disease terbaca sebagai Measles.
3. Artikel roundup Thailand memilih Myanmar sebagai country parent karena
   artikel memuat beberapa konteks negara. Event Thailand sudah diberi flag
   `location_country_conflict`, tetapi pemilihan parent country tetap perlu
   memakai konteks metric utama.
4. Artikel CDA Singapore memiliki parent Measles dengan 3 cases, sedangkan
   event detail menjadi `UNKNOWN` dengan 12 cases. Ini adalah mismatch
   disease-metric yang harus masuk review.
5. Artikel Vietnam dan Cambodia masih menghasilkan aggregate/breakdown rows.
   Hubungan parent dan breakdown perlu ditampilkan sebagai provenance yang
   jelas, bukan dianggap dua outbreak independen.
6. Artikel Brunei menghasilkan angka Ebola `246 cases` dan `80 deaths` tanpa
   review flag. Angka ini perlu diuji dengan temporal/context evidence agar
   data historis atau konteks lain tidak dianggap event aktif.

### Kesimpulan Run 4

- Collector berhasil mengambil 9/10 URL; satu kegagalan adalah challenge
  source, bukan timeout translation atau NLP.
- Full NLP selesai pada 9/10 URL, tetapi Full NLP tidak otomatis berarti
  disease, metric, location, dan context sudah koheren.
- Perbaikan berikutnya harus memprioritaskan disease-to-metric attribution,
  parent-versus-event metric consistency, dan historical/context filtering.
- Tidak ada angka akurasi 99% yang diklaim dari run ini.

## 6. Diagnosis per lapisan

| Lapisan | Run 1 | Run 2 | Run 3 | Run 4 | Status sekarang |
|---|---|---|---|---|---|
| Collector/fetch | Challenge dan storage failure tercampur dengan NLP | Tiga URL gagal fallback | Masih tiga URL gagal, tetapi error lebih jelas | 1 source challenge 403, 9 URL berhasil diambil | Quality gate dan retry/fetch policy per sumber tetap perlu diperkuat. |
| Language/script | Malay sering menjadi `id`; beberapa route English berisi teks lokal | Native-script lebih stabil | Thai, Lao, Burmese, Vietnamese terdeteksi dan diproses | 9 URL English/Latin atau Indonesian; Malay gagal sebelum NLP | Malay/Indonesian dan route-language masih perlu evaluasi. |
| Translation | Menahan status menjadi partial | Timeout dipisahkan dari NLP | Async queue, cache, dan source-first | Semua hasil berhasil `not_required` | Tidak lagi menjadi bottleneck Full NLP, tetapi aksara lokal belum tervalidasi pada run ini. |
| Disease | UNKNOWN atau disease context tercampur | Thai/Vietnamese membaik | Burmese/Malay masih lemah | Disease hilang pada beberapa sub-event | Perlu relation/context classifier yang tidak bergantung pada translation. |
| Metric | False case dari `outbreaks`; period tercampur | Metric non-case guard membantu | Angka native-script terbaca | Parent/event cases dan historical context masih berbeda | Temporal attribution dan disease-metric pairing masih perlu diperbaiki. |
| Location | Brunei dapat Bali/Jembrana | Country guard mulai tersedia | Konflik nested event BRN-01 masih terlihat | Konflik Thailand ditandai, tetapi parent country masih salah | Validasi country, hierarchy, dan geocode harus dilakukan sebelum event commit. |
| Event | Full belum berarti konteks koheren | Source evidence dipertahankan | Aggregate/breakdown masih perlu review | Aggregate/breakdown dan duplicate disease attribution terlihat | Event decision harus menunggu relation attribution. |

## 7. Prioritas setelah run 4

1. Pertahankan fetch quality gate untuk challenge page, empty article shell,
   dan fallback HTML; jangan mengubahnya menjadi `UNKNOWN` disease.
2. Perbaiki disease-metric attribution pada sub-event agar disease parent tidak
   hilang ketika metric sudah ditemukan.
3. Tambahkan konsistensi metric parent/event dan provenance aggregate-versus-
   breakdown sebelum persistence.
4. Pertahankan hard validation pada event detail: `country_iso3`, admin
   hierarchy, latitude, dan longitude harus kompatibel dengan country event.
5. Tambahkan evaluasi temporal untuk historical, cumulative, new, suspected,
   dan confirmed pada setiap metric.
6. Buat gold set beranotasi untuk menghitung precision/recall field-level.
   Sebelum itu, jangan menyebut angka 99% sebagai capaian.

## 8. Artefak dan status repository

- JSON run 3: `/tmp/asean-22-rerun-2026-09-21-final.json`
- Detail run 1: [asean-22-url-test-2026-09-19.md](asean-22-url-test-2026-09-19.md)
- Detail run 2: [asean-22-url-rerun-2026-09-21.md](asean-22-url-rerun-2026-09-21.md)
- Commit sebelum pull: `4f2a520` telah tersedia di Gitea.
- Run 4 diuji langsung dari terminal dan belum memiliki JSON artifact tersimpan.

## 9. Koreksi lokal setelah review Run 4

Perubahan lokal yang belum dipush:

- Total nasional tidak lagi ditempelkan ke provinsi/kota yang hanya disebut
  sebagai daftar breakdown. Parent dan event utama memakai country, sedangkan
  wilayah tetap dipertahankan di matrix locations beserta hierarchy dan
  evidence.
- Event regional hanya dibuat jika sumber memiliki metric yang benar-benar
  terikat ke wilayah tersebut. Artikel yang hanya menyebut disease/lokasi
  tanpa angka tidak menghasilkan event `1.1` kosong.
- Disease event `UNKNOWN` dapat mewarisi disease parent hanya jika relasinya
  tunggal dan punya metric. Jika beberapa disease memiliki count berbeda,
  event dipecah dan parent menampilkan format `Dengue; Influenza` serta
  `Dengue(361); Influenza(10)`. Shared total seperti “measles and rubella
  cases” tetap satu aggregate reviewable; count tidak diduplikasi.
- Evidence untuk event country-level dipilih dari sentence asli yang memuat
  nilai exact, bukan dari angka breakdown terdekat.

Validasi lokal: contoh Indonesia menghasilkan `Indonesia / 8.224 / 4` dengan
1 event dan lima provinsi tetap muncul sebagai location mentions; contoh
Myanmar tanpa angka menghasilkan 0 event; contoh dua disease dengan count
berbeda menghasilkan 2 event. Suite NLP berjalan `171 tests: OK`.
