# Ringkasan Perubahan Sistem dan Status Audit

Tanggal: 2026-09-24  
Status: perubahan lokal, belum commit dan belum push

Dokumen ini merangkum perubahan yang dibahas dan dikerjakan pada alur
crawling, NLP, Disease Master, worker, collector, dan frontend. Detail
perbandingan jalur tetap tersedia di dokumen audit 001–004.

## 1. Tujuan perubahan

Fokus sistem dipindahkan ke kualitas data surveilans:

- satu core pipeline untuk tiga jalur analisis;
- artikel diproses dengan teks dan evidence sebanyak mungkin;
- penyakit, lokasi, dan metrik kasus tetap terikat pada evidence;
- Disease Master lokal menjadi sumber klasifikasi;
- tidak ada ketergantungan runtime pada API ICD-11/WHO.

## 2. Penyatuan tiga jalur analisis

Ketiga jalur tetap memiliki entry point dan persistence berbeda, tetapi setelah
artikel tersedia memakai profil analisis yang sama:

```text
continuous crawling  ─┐
manual URL           ─┼─> /nlp/analyze/raw -> pipeline.run -> event relations
crawl matrix         ─┘                                      -> persistence
```

Perubahan penting:

- `/nlp/analyze/url` diarahkan ke full `pipeline.run` dengan `interactive=false`.
- `/nlp/analyze-bounded` tetap ada sebagai mode eksplisit untuk kebutuhan budget
  dan latensi rendah.
- Worker manual URL menggunakan `/nlp/analyze/raw`.
- Timeout NLP worker dibuat configurable dengan batas minimum yang aman.
- Matrix adapter mempertahankan `sub_events`, evidence, confidence, dan
  `needs_review`, sehingga satu artikel multi-penyakit tidak dipaksa menjadi
  satu label datar.

File utama: `services/nlp-python/app/main.py`,
`services/nlp-python/app/pipeline.py`, `services/nlp-python/app/bounded_analysis.py`,
`services/worker-python/app/analysis_jobs.py`,
`services/worker-python/app/crawl_matrix_jobs.py`.

## 3. Profil kualitas data

Pipeline mempertahankan empat relasi utama:

```text
penyakit -> evidence -> lokasi -> metrik kasus/kematian
```

Aturan yang dipertahankan atau diperkuat:

- disease mention harus memiliki evidence tekstual;
- penyakit sekunder tidak menerima jumlah kasus utama secara otomatis;
- lokasi sumber berita dibedakan dari lokasi kejadian;
- angka historis, kumulatif, estimasi, dan angka non-kasus tidak langsung
  dianggap sebagai kasus baru;
- konflik lokasi/country atau metric tanpa relasi diberi `needs_review`;
- alias penyakit digabung berdasarkan identitas Disease Master, bukan sekadar
  string permukaan.

## 4. Migrasi dari ICD-11 ke Disease Master lokal

### Sebelum perubahan

Resolver lama memiliki kode untuk:

- OAuth token WHO;
- pencarian konsep ke API WHO ICD-11;
- discovery penyakit yang belum dikenal;
- auto-learning/upsert konsep dan alias baru ke database.

### Sesudah perubahan

Sumber keputusan hanya:

- `disease_concepts.disease_id`;
- `disease_concepts.canonical_name`;
- `disease_concepts.source`;
- alias aktif pada `disease_aliases`.

Alur baru:

```text
artikel
  -> extractor / optional DeepSeek candidate
  -> pencocokan canonical name dan alias lokal
  -> disease_id + canonical_name + master_source
  -> event, sub-event, matrix, dashboard
```

DeepSeek hanya boleh memilih konsep yang sudah ada. Jika tidak ada kecocokan,
hasil tetap menjadi `UNKNOWN` atau review; sistem tidak membuat kode atau
konsep eksternal secara otomatis.

Migration utama: `database/init/120_clean_and_inject_asean_master_diseases.sql`.

## 5. Komponen ICD/API yang dihapus

- `services/nlp-python/app/icd11.py` digantikan oleh
  `services/nlp-python/app/disease_master.py`.
- Worker `sync_who_unknowns.py` dihapus.
- Wrapper `scripts/sync_who_unknowns.sh` dihapus.
- Script bootstrap yang melakukan lookup eksternal dihapus.
- Exporter alias WHO dan helper konfigurasi yang hanya mendukung flow tersebut
  dihapus.
- Pipeline tidak lagi memanggil `resolve_and_learn_disease`.

Endpoint baru untuk resolusi lokal:

```text
POST /disease/resolve
```

`POST /icd11/resolve` masih tersedia sebagai alias tersembunyi sementara agar
klien lama tidak langsung gagal, tetapi alias tersebut hanya memakai resolver
lokal dan tidak melakukan request eksternal.

## 6. Perubahan collector dan worker

- Filter crawl collector dan matrix memakai konsep aktif Disease Master lokal.
- Query konsep mengambil `disease_id`, `canonical_name`, dan `source`.
- Nilai `ontology_code` tidak lagi dipakai untuk filter atau resolusi.
- Kolom database legacy tetap ditulis `NULL` oleh flow baru.
- `entity_relations` melakukan deduplikasi berdasarkan `disease_id`.
- Re-analysis tidak lagi menjalankan sinkronisasi katalog eksternal sebelum
  memproses ulang event lama.

## 7. Perubahan frontend

FE Disease Master sekarang menampilkan dan mengelola:

- Disease Master ID;
- nama canonical;
- kategori;
- alias;
- source;
- confidence;
- status aktif.

Perubahan tampilan dilakukan pada Disease Master, Disease Directory, Crawl
Matrix, Article Review, Correction Modal, Crawl History, dashboard analisis,
dashboard eksekutif, laporan, dan halaman web services.

Label dan badge ICD-11/ontology dihilangkan dari UI. Tipe response legacy tetap
boleh membaca field lama agar response historis tidak menyebabkan error parsing.

## 8. Kompatibilitas database

Kolom `icd11_code` dan `disease_icd11_code` belum di-drop. Keduanya nullable dan
hanya dipertahankan untuk membaca data historis atau menjaga kontrak lama.
Sumber keputusan baru adalah `disease_concept_id` dan `disease_id`.

## 9. Dokumentasi yang tersedia

- `001-alur-crawling-model-dan-akurasi-2026-09-24.md` — audit alur kode.
- `002-perbandingan-tiga-jalur-url-2026-09-24.md` — perbedaan tiga entry point.
- `003-matriks-kualitas-dan-unifikasi-flow-2026-09-24.md` — matriks kualitas.
- `004-migrasi-dari-icd11-ke-disease-master-lokal-2026-09-24.md` — keputusan
  migrasi lokal.
- Dokumen ini — ringkasan perubahan lintas komponen.

## 10. Verifikasi

Berhasil dijalankan:

- `compileall` untuk NLP, worker, dan collector;
- test resolver Disease Master lokal: 3 test lulus;
- test entity relation worker: 5 test lulus;
- `git diff --check` tidak menemukan whitespace error.

Belum dapat diverifikasi penuh pada host ini:

- full test suite membutuhkan `requests`, `pydantic`, `transformers`,
  `psycopg`, dan data database runtime;
- build Next.js tidak selesai pada workspace UNC karena proses build
  menggantung.

Tidak ada commit atau push yang dilakukan.
