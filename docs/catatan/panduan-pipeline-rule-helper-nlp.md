# Panduan Sederhana Pipeline, Rule, dan Helper NLP-PENYAKIT

Dokumen ini menjelaskan bentuk sistem NLP yang sedang berjalan sekarang dengan bahasa sederhana.

Tujuannya membedakan pipeline, helper, rule, model, worker, dan proses penyimpanan hasil. Dokumen ini menggambarkan kondisi kode saat ini, bukan rancangan sistem baru.

## 1. Ringkasan paling singkat

Sistem kita memiliki satu inti analisis utama:

```text
pipeline.run()
```

Banyak file bukan berarti ada banyak analisis yang berjalan bersamaan. Sebagian besar file adalah bagian kecil dari alur yang sama.

```text
Artikel
  ↓
Pembersihan dan bahasa
  ↓
Pengenalan penyakit, lokasi, angka, dan tanggal
  ↓
Pencarian hubungan antar informasi
  ↓
Penentuan konteks
  ↓
Pembentukan satu atau beberapa event
  ↓
Validasi
  ↓
Penyimpanan
```

## 2. Pipeline utama

### 2.1 Jalur URL Analyzer

Ketika pengguna memasukkan URL artikel dari halaman web, alurnya secara sederhana adalah:

```text
Halaman web
  ↓
Backend menerima permintaan
  ↓
Analysis worker membuat pekerjaan
  ↓
Collector mengambil isi artikel
  ↓
NLP service menganalisis isi artikel
  ↓
Hasil disimpan ke database
  ↓
Frontend menampilkan hasil
```

Bagian yang menjalankan tahap tersebut:

| Tahap | Lokasi | Peran sederhananya |
|---|---|---|
| Endpoint NLP | `services/nlp-python/app/main.py` | Menerima permintaan analisis |
| Pembatas URL interaktif | `services/nlp-python/app/bounded_analysis.py` | Mengatur batas waktu dan mencegah terlalu banyak analisis interaktif sekaligus |
| Analisis utama | `services/nlp-python/app/pipeline.py` | Mengatur seluruh analisis NLP |
| Pengambilan URL | `services/worker-python/app/analysis_jobs.py` | Meminta collector mengambil artikel |
| Penyimpanan hasil | `services/worker-python/app/analysis_jobs.py` dan `multi_event_persist.py` | Menyimpan hasil artikel dan event |
| Tampilan | `services/frontend-next/app/analyze/page.tsx` | Menampilkan status dan hasil kepada pengguna |

URL Analyzer menggunakan `pipeline.run()` yang sama. `bounded_analysis.py` hanya menjadi pembungkus untuk mengatur waktu dan beban, bukan pipeline NLP kedua.

### 2.2 Jalur artikel dari RabbitMQ

Artikel yang masuk otomatis melalui collector menggunakan alur berbeda pada bagian awal, tetapi memakai inti NLP yang sama:

```text
Collector atau backend Rust
  ↓
RabbitMQ
  ↓
Worker Python
  ↓
NLP service
  ↓
pipeline.run()
  ↓
Database
```

Bagian utama:

- `services/worker-python/app/worker.py`: mengambil dan memproses pesan artikel.
- `services/worker-python/app/analysis_jobs.py`: menjalankan pekerjaan analisis URL.
- `services/worker-python/app/crawl_matrix_jobs.py`: menjalankan pekerjaan crawl matrix.
- `services/nlp-python/app/main.py`: menerima permintaan NLP.
- `services/nlp-python/app/pipeline.py`: menjalankan analisis utama.

Perbedaannya adalah cara artikel masuk, bukan adanya mesin NLP yang sama sekali berbeda.

## 3. Perbedaan pipeline, helper, rule, model, dan worker

| Istilah | Arti mudah | Contoh di sistem |
|---|---|---|
| Pipeline | Urutan kerja dari awal sampai hasil akhir | `pipeline.run()` |
| Helper | Alat kecil untuk satu tugas tertentu | mencari tanggal, lokasi, atau angka |
| Rule | Ketentuan untuk menilai atau menghubungkan informasi | angka dengan kata “kasus” dianggap metric kasus |
| Model | Komponen yang mengenali pola bahasa berdasarkan model NLP | classifier di `models/classifier.py` |
| Worker | Proses yang mengambil pekerjaan dan menjalankannya | `worker.py`, `analysis_jobs.py` |
| Persistence | Proses menyimpan hasil ke database | `multi_event_persist.py` dan backend Rust |
| Endpoint | Pintu masuk permintaan | `/nlp/analyze`, `/nlp/analyze/url` |

Jadi, `extract_case_count()` bukan pipeline. Ia hanya helper yang membantu pipeline menemukan angka kasus.

## 4. Kelompok rule yang sudah ada

### 4.1 Rule pembersihan teks dan bahasa

Lokasi utama: `services/nlp-python/app/extractors.py` dan `translator.py`.

Fungsinya:

- memperbaiki karakter teks yang rusak;
- mendeteksi bahasa artikel;
- menyiapkan teks untuk dianalisis;
- menerjemahkan teks jika dibutuhkan;
- menghindari teks yang terlalu pendek atau penuh noise.

Rule ini tidak menentukan apakah ada wabah. Rule ini hanya menyiapkan bahan yang lebih bersih.

### 4.2 Rule penyakit

Lokasi utama: `extractors.py`, `config.py`, `icd11.py`, dan `models/classifier.py`.

Fungsinya:

- mencari nama penyakit;
- mengenali alias atau sinonim;
- menormalkan nama penyakit;
- memakai konsep penyakit yang sudah dimuat dari database;
- memakai classifier ketika model tersedia;
- menjaga agar penyakit yang hanya disebut sebagai latar belakang tidak otomatis dianggap event.

Hasilnya tidak hanya berupa nama penyakit. Sistem juga perlu mempertimbangkan apakah penyakit tersebut adalah penyakit yang sedang dilaporkan, hanya pembanding, sejarah, atau bagian dari intervensi.

### 4.3 Rule lokasi

Lokasi utama: `extractors.py`, `config.py`, dan `surveillance_extraction.py`.

Fungsinya:

- mengenali negara;
- mengenali provinsi, kabupaten, kota, atau tempat lain yang tersedia;
- mencocokkan nama lokal dan alias;
- memeriksa hubungan lokasi anak dengan negara atau wilayah induknya;
- mencegah negara sumber berita otomatis menjadi negara kejadian;
- menyimpan lokasi hanya jika ada dukungan dari teks atau hierarki lokasi.

Contoh prinsipnya: artikel dari Indonesia yang melaporkan kejadian di Kamboja tidak boleh otomatis diberi lokasi Indonesia.

### 4.4 Rule angka dan metric

Lokasi utama: `extractors.py` dan `surveillance_extraction.py`.

Fungsinya:

- menemukan angka kasus atau infeksi;
- menemukan angka kematian;
- membedakan pasien, rawat inap, sembuh, vaksinasi, tes, hotspot, dan persentase;
- mengenali kata seperti “baru”, “total”, “sejak”, “lebih dari”, atau “sekitar”;
- membedakan angka penyakit dari angka lain seperti kualitas udara atau jumlah hotspot;
- mencari kalimat yang menjadi evidence angka tersebut.

Angka tidak boleh langsung menjadi event hanya karena berada di artikel yang sama dengan nama penyakit. Hubungannya harus didukung oleh konteks kalimat atau bagian artikel.

### 4.5 Rule waktu dan periode

Lokasi utama: `services/nlp-python/app/epidemiology.py` dan `surveillance_extraction.py`.

Fungsinya:

- membedakan tanggal publikasi dengan tanggal kejadian;
- mengenali periode pelaporan;
- membedakan angka baru dan angka kumulatif;
- mengenali informasi historis;
- mengenali urutan seperti kasus pertama atau kedua;
- mempertahankan periode epidemiologis jika disebutkan.

Tanggal publikasi tidak seharusnya otomatis dianggap sebagai tanggal kejadian.

### 4.6 Rule konteks dan status informasi

Lokasi utama: `epidemiology.py`, `surveillance_extraction.py`, dan `intelligence.py`.

Fungsinya:

- membedakan confirmed dan suspected;
- mengenali pernyataan negatif seperti “tidak ada kasus”;
- membedakan informasi saat ini dan historis;
- mengenali peringatan atau prediksi;
- membedakan intervensi dari kejadian penyakit;
- menandai hasil yang ambigu untuk review.

Pernyataan “tidak ada kasus” tidak sama dengan event kasus biasa. Konteks negatifnya harus tetap dipertahankan.

### 4.7 Rule hubungan antar-informasi

Lokasi utama: `services/nlp-python/app/surveillance_extraction.py`.

Ini adalah bagian yang mengubah sistem dari sekadar mencari entity menjadi mencoba memahami hubungan.

Pertanyaan yang dijawab:

- angka ini terkait penyakit apa?
- angka ini terjadi di lokasi mana?
- angka ini berlaku untuk periode apa?
- apakah penyakit, lokasi, angka, dan waktu menggambarkan event yang sama?
- apakah informasi tersebut current, historical, cumulative, confirmed, atau suspected?

Hubungan dicari dari evidence, kalimat, paragraf, struktur artikel, dan kecocokan lokasi. Nama yang muncul berdekatan saja belum cukup.

### 4.8 Rule pembentukan event

Lokasi utama: `services/nlp-python/app/intelligence.py` dan `multi_event_extractor.py`.

Fungsinya:

- membuat satu event yang dapat dipahami sendiri;
- membuat beberapa event jika memang ada pemisahan yang jelas;
- tidak membuat event baru hanya karena ada banyak nama penyakit;
- tidak membuat event baru hanya karena ada banyak angka;
- menghubungkan event dengan disease, location, metric, waktu, evidence, dan confidence;
- mengurangi event duplikat.

`build_atomic_events()` menjadi bagian penting untuk membentuk event berbasis evidence. `compose_structured_events()` menjadi pengatur hasil akhir event terstruktur.

## 5. Helper yang ada sekarang

Helper adalah fungsi kecil. Ia bukan keputusan akhir sendirian.

### `services/nlp-python/app/extractors.py`

Helper di file ini terutama mencari atau menormalkan informasi dasar:

- bahasa;
- penyakit;
- negara;
- lokasi;
- tanggal;
- angka kasus dan kematian;
- alias penyakit dan lokasi;
- teks yang tidak relevan atau terlalu noisy.

File ini seperti kotak alat pencarian informasi dasar.

### `services/nlp-python/app/epidemiology.py`

Helper di file ini terutama menilai:

- periode kejadian;
- jenis metric;
- status epistemik;
- tanggal event;
- evidence dan posisi teks;
- validasi fakta surveillance.

File ini membantu menjawab “informasi ini memiliki arti epidemiologis apa?”.

### `services/nlp-python/app/surveillance_extraction.py`

Helper di file ini terutama menghubungkan informasi:

- lokasi dengan hierarkinya;
- penyakit dengan metric;
- metric dengan lokasi;
- metric dengan waktu;
- evidence dengan hasil ekstraksi;
- sumber dengan hasil surveillance.

File ini bukan hanya pencari entity. Ia menjadi lapisan hubungan dan evidence.

### `services/nlp-python/app/intelligence.py`

Helper di file ini membentuk representasi event yang lebih lengkap.

Informasi yang dapat dibawa event antara lain penyakit, lokasi, metric, waktu, status konteks, evidence, confidence, relations, provenance, dan tanda perlu review.

### `services/nlp-python/app/multi_event_extractor.py`

Helper di file ini menentukan apakah artikel lebih tepat menjadi satu event atau beberapa event berdasarkan lokasi, penyakit, periode, atau fakta yang memang berbeda.

File ini juga membantu menggabungkan dan mengurangi event yang sama.

### `services/nlp-python/app/pipeline.py`

File ini bukan kumpulan helper biasa. Ini adalah pengatur utama yang memanggil helper-helper lain sesuai urutan.

Secara sederhana, `pipeline.run()`:

1. membersihkan teks;
2. menentukan bahasa;
3. menyiapkan terjemahan;
4. mencari penyakit, lokasi, angka, dan tanggal;
5. menjalankan hubungan metric dan evidence;
6. membentuk event;
7. memvalidasi hasil;
8. mengembalikan response NLP.

## 6. Mana yang aktif untuk URL Analyzer?

Untuk URL Analyzer, jalur utamanya adalah:

```text
main.py
  → bounded_analysis.py
  → pipeline.py: run()
  → extractors.py
  → surveillance_extraction.py
  → multi_event_extractor.py
  → intelligence.py
  → epidemiology.py
```

Tidak semua helper dipakai pada setiap artikel. Helper dipanggil sesuai kondisi artikel.

Contohnya:

- jika tidak ada lokasi, resolver lokasi dapat dicoba;
- jika ada beberapa lokasi dan metric, multi-event logic dapat bekerja;
- jika artikel tidak memiliki informasi kesehatan, beberapa tahap dapat dilewati;
- jika model atau translation sedang sibuk, URL Analyzer dapat mengembalikan status gagal atau meminta retry.

## 7. Jalur khusus yang perlu dibedakan

Selain jalur utama, ada beberapa pintu masuk lain:

| Jalur | Fungsi |
|---|---|
| `/nlp/analyze` | Analisis umum menggunakan pipeline utama |
| `/nlp/analyze/raw` | Analisis artikel raw menggunakan pipeline utama |
| `/nlp/analyze/url` | Analisis URL interaktif melalui pembatas waktu |
| `/nlp/analyze-bounded` | Pembungkus yang membatasi beban dan durasi analisis |
| `/nlp/analyze/surveillance` | Output structured surveillance khusus |
| `worker.py` | Pemrosesan pesan raw dari antrean |
| `analysis_jobs.py` | Pekerjaan URL, fetch, retry, dan penyimpanan |
| `crawl_matrix_jobs.py` | Pemrosesan crawl matrix |

Jalur structured surveillance memiliki bentuk output tersendiri. Karena itu hasilnya perlu dijaga agar keputusan semantiknya tidak berbeda dari pipeline utama.

## 8. Rule yang aman dan rule yang berisiko

### Rule yang aman

Rule cenderung aman jika:

- berbasis pola bahasa umum;
- berlaku untuk banyak penyakit dan negara;
- menyimpan evidence asalnya;
- tidak memaksa nilai jika informasinya tidak jelas;
- dapat menghasilkan `unknown`, `needs_review`, atau confidence rendah;
- memiliki test positif dan negatif;
- tidak bergantung pada satu publisher atau satu artikel.

Contoh:

> Jika kalimat menyatakan “tidak ada laporan kasus”, simpan sebagai informasi negatif dan jangan mengubahnya menjadi kasus positif.

### Rule yang berisiko

Rule berisiko jika:

- hanya mencari nama artikel tertentu;
- hanya berlaku untuk satu negara atau penyakit;
- memaksa lokasi karena nama tersebut pernah muncul sebelumnya;
- mengambil angka terbesar tanpa melihat konteks;
- menganggap semua angka sebagai kasus;
- menggunakan negara publisher sebagai negara kejadian;
- mengubah hasil tanpa evidence;
- menimpa hasil dari tahap lain tanpa alasan dan confidence.

Contoh yang tidak aman:

```text
Jika publisher Detik dan ada Riau, maka penyakit ISPA dan kasus 11.370.
```

Itu bukan rule surveillance umum. Itu patch untuk satu artikel.

## 9. Mengapa file dan helper terlihat banyak?

Ada beberapa alasan:

1. Sistem harus menerima beberapa jenis input: URL, raw article, crawl matrix, dan queue.
2. Analisis memiliki beberapa tahap berbeda: bahasa, entity, relation, context, event, dan validation.
3. Sistem lama masih dipertahankan agar worker dan API yang ada tetap berjalan.
4. Beberapa output membutuhkan format berbeda, seperti response umum dan structured surveillance.
5. Helper memisahkan pekerjaan kecil agar tidak semua logika menumpuk di satu file besar.

Namun banyak file tetap harus diawasi. Jika keputusan yang sama dibuat dengan cara berbeda di banyak tempat, hasilnya dapat tidak konsisten.

## 10. Cara memahami perubahan rule dari kasus baru

Ketika ditemukan hasil yang salah, jangan langsung menambah rule berdasarkan nama artikel. Gunakan urutan sederhana:

```text
Hasil salah
  ↓
Tentukan yang salah:
penyakit, lokasi, angka, waktu, konteks, atau event
  ↓
Cari pola umum penyebabnya
  ↓
Tambahkan rule di kelompok yang tepat
  ↓
Simpan evidence dan confidence
  ↓
Tambahkan test untuk pola tersebut
  ↓
Pastikan artikel lama tidak rusak
```

Contoh:

- masalah angka hotspot ikut dianggap sebagai kasus → perbaiki aturan metric dan konteks, bukan menambah rule untuk satu artikel;
- masalah lokasi provinsi dianggap negara → perbaiki validasi hierarki lokasi;
- masalah angka historis dianggap current → perbaiki rule periode dan temporal context;
- masalah dua penyakit saling berbagi angka → perbaiki hubungan disease–metric.

## 11. Kesimpulan

Kondisi sekarang dapat diringkas seperti ini:

```text
Satu pipeline utama
  + beberapa endpoint masuk
  + helper untuk tugas kecil
  + rule untuk keputusan bahasa dan surveillance
  + model NLP untuk pengenalan pola
  + worker untuk menjalankan pekerjaan
  + persistence untuk menyimpan hasil
```

Jadi, kita tidak memiliki banyak pipeline intelligence yang sepenuhnya terpisah. Kita memiliki satu inti analisis dengan beberapa jalur masuk dan beberapa lapisan pembantu.

Prinsip terpenting saat menambah rule:

> Tambahkan aturan berdasarkan pola umum dan hubungan informasi, bukan berdasarkan satu artikel tertentu.
