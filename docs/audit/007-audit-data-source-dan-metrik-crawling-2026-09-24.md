# Audit Data Source dan Metrik Crawling

Tanggal: 2026-09-24  
Status: audit dan implementasi tahap kontrol source. Metrik NLP per source masih menjadi pekerjaan lanjutan.

Dokumen terkait:

- [Audit tiga jalur](006-audit-empat-pilar-tiga-jalur-2026-09-24.md)
- [Audit matriks kualitas](003-matriks-kualitas-dan-unifikasi-flow-2026-09-24.md)
- [Audit alur crawling](001-alur-crawling-model-dan-akurasi-2026-09-24.md)

## 1. Tujuan

Data source harus dapat dikendalikan dari UI:

1. Source baru default nonaktif.
2. User dapat mengaktifkan atau menonaktifkan source.
3. Source aktif dapat berjalan otomatis melalui scheduler.
4. Source nonaktif dilewati scheduler.
5. Setiap crawling run menghasilkan statistik.
6. Satu source dapat diuji secara terisolasi.
7. Retry dan duplikat tidak boleh menggandakan jumlah artikel.

## 2. Perilaku yang diinginkan

### Source nonaktif

~~~text
enabled = false
status = idle
~~~

Alur:

~~~text
UI menyimpan source
-> backend menyimpan enabled=false
-> scheduler membaca source
-> source dilewati
-> collector tidak melakukan crawling
~~~

### Source aktif

~~~text
enabled = true
status = scheduled atau running
~~~

Alur:

~~~text
UI mengaktifkan source
-> backend menyimpan enabled=true
-> scheduler membaca source aktif
-> collector menjalankan source sesuai jadwal
-> run menyimpan hasil dan metrik
~~~

Aktivasi dapat memiliki dua mode:

| Mode | Perilaku |
|---|---|
| Aktifkan saja | Menunggu jadwal scheduler berikutnya |
| Aktifkan dan jalankan sekarang | Membuat satu run segera lalu mengikuti jadwal |

Rekomendasi: sediakan tombol terpisah Aktifkan dan Jalankan sekarang agar tidak terjadi crawling besar tanpa sengaja.

## 3. Alur end-to-end

~~~text
UI data source
-> Backend API
-> source registry
-> Scheduler
-> Collector adapter
-> Discovery URL
-> Canonical URL dan deduplication
-> Fetch artikel
-> Raw article storage
-> Queue atau worker
-> NLP /nlp/analyze/raw
-> pipeline.run
-> Filter kesehatan, penyakit, lokasi, metrik, sub_events
-> PostgreSQL persistence
-> Statistik crawling dan kualitas data
~~~

Tahap yang perlu dibedakan:

- discovered: URL ditemukan;
- fetched: halaman berhasil diambil;
- stored: artikel baru tersimpan;
- processed: NLP selesai;
- accepted: hasil lolos validasi;
- needs_review: hasil ambigu atau confidence rendah.

## 4. Konfigurasi data source

Field minimum:

| Field | Fungsi |
|---|---|
| id | Identitas source |
| name | Nama source |
| source_type | RSS, web, API, CSV, atau tipe lain |
| url atau endpoint | Alamat source |
| enabled | Saklar aktif/nonaktif |
| schedule | Interval atau jadwal crawling |
| max_articles_per_run | Batas artikel per run |
| request_timeout | Batas waktu request |
| rate_limit | Batas request per source |
| last_run_at | Waktu run terakhir |
| next_run_at | Jadwal berikutnya |
| status | idle, scheduled, running, completed, failed |
| last_error | Error terakhir |

Default source baru:

~~~text
enabled = false
status = idle
~~~

Default nonaktif harus ditegakkan backend atau database, bukan hanya UI.

## 5. Kontrol UI

| Kontrol | Fungsi |
|---|---|
| Toggle Active | Mengubah enabled |
| Edit source | Mengubah URL, tipe, jadwal, dan batas |
| Run now | Menjalankan satu run |
| Pause | Menghentikan penjadwalan berikutnya |
| View history | Melihat riwayat run |
| View metrics | Melihat statistik |
| View errors | Melihat error fetch, queue, atau NLP |

Jika source dinonaktifkan saat sedang running, perilaku aman adalah menghentikan penjadwalan berikutnya. Request yang sedang berjalan tidak perlu diputus paksa kecuali sistem sudah memiliki cancellation yang aman.

## 6. Metrik per crawling run

| Metrik | Arti |
|---|---|
| discovered_count | URL yang ditemukan |
| fetch_attempted_count | URL yang dicoba |
| fetch_success_count | Fetch berhasil |
| fetch_failed_count | Fetch gagal |
| duplicate_count | URL atau content hash sudah ada |
| raw_saved_count | Artikel baru tersimpan |
| nlp_processed_count | Artikel selesai dianalisis |
| nlp_failed_count | Analisis NLP gagal |
| health_related_count | Artikel dengan is_health_related=true |
| non_health_count | Artikel tidak relevan |
| needs_review_count | Artikel perlu review |
| disease_event_count | Jumlah disease event |
| sub_event_count | Jumlah event atomik dari sub_events |
| timeout_count | Timeout fetch atau NLP |
| error_count | Error lain |
| duration_seconds | Durasi run |

Contoh:

~~~text
Source                 : ZNews
Run status             : completed
URL ditemukan          : 40
Fetch berhasil         : 32
Fetch gagal            : 8
Duplikat               : 12
Artikel baru           : 20
NLP selesai            : 20
Artikel kesehatan      : 7
Artikel non-kesehatan  : 10
Needs review           : 3
Disease events         : 9
Sub-events             : 12
~~~

## 7. Definisi jumlah

Jumlah crawling tidak boleh dihitung dari percobaan request. Gunakan:

~~~text
discovered_count
fetch_success_count
raw_saved_count
~~~

Jumlah artikel kesehatan menggunakan hasil NLP:

~~~text
is_health_related = true
~~~

Satu artikel dihitung satu kali setelah deduplication.

Bedakan tiga level berikut:

| Level | Arti |
|---|---|
| article_count | Jumlah artikel |
| disease_event_count | Jumlah event penyakit |
| sub_event_count | Jumlah relasi atomik penyakit-lokasi-metrik |

Satu artikel dapat menghasilkan beberapa disease event dan sub-event.

## 8. Deduplication dan retry

Identitas artikel menggunakan:

~~~text
canonical URL + content hash
~~~

Aturan:

1. URL sama tidak membuat raw article baru.
2. Retry worker tidak menambah jumlah artikel.
3. Reprocessing tidak menggandakan disease event.
4. Run baru berstatus completed setelah persistence berhasil.
5. Kegagalan menyimpan stage dan alasan error.

Error sebaiknya dibedakan menjadi:

~~~text
discovery_error
fetch_error
parse_error
dedup_skipped
storage_error
queue_error
nlp_error
timeout
~~~

## 9. Uji satu source

Konfigurasi pengujian:

~~~text
Semua source lain : disabled
Source target     : enabled
Max articles/run  : 10
Mode              : run now
~~~

Hasil yang perlu dilihat:

- jumlah URL ditemukan;
- artikel berhasil di-fetch;
- artikel baru;
- artikel duplikat;
- artikel kesehatan;
- artikel non-kesehatan;
- needs_review;
- penyakit yang terdeteksi;
- lokasi yang terdeteksi;
- jumlah sub-events.

## 10. Implementasi tahap kontrol source

Yang sudah diterapkan:

- Source baru default `enabled=false` pada database dan endpoint create.
- Migration `122_data_source_controls.sql` mengubah default dan mematikan source lama saat migrasi dijalankan.
- Halaman Sources memiliki aksi per source: `Aktifkan/Pause`, `Jalankan`, dan `Hasil`.
- Halaman detail source menampilkan riwayat run, URL ditemukan, artikel masuk, dan ringkasan ingest.
- Scheduler tetap hanya membaca source aktif; tombol `Jalankan` tetap dapat menguji satu source secara eksplisit.
- Tabel dibuat dapat digeser secara horizontal pada layar kecil.

Catatan interpretasi: angka pada UI saat ini berasal dari `collector_runs` (`records_found` dan `records_ingested`). Angka tersebut belum membuktikan akurasi NLP, jumlah artikel kesehatan, `needs_review`, penyakit, atau `sub_events` per source. Untuk itu provenance `source_id`/`run_id` perlu diteruskan sampai penyimpanan hasil NLP.

Metrik kesehatan tidak boleh hanya berupa jumlah URL. Yang ingin diukur adalah:

~~~text
URL ditemukan
-> artikel berhasil diambil
-> artikel baru
-> NLP berhasil
-> artikel kesehatan
-> disease event
-> sub-event valid
~~~

## 10. Hubungan dengan tiga jalur

| Jalur | Fungsi source control | Statistik utama |
|---|---|---|
| Crawling kontinu | Scheduler membaca source enabled | Run, fetch, NLP, health count |
| URL manual | Trigger langsung tanpa menunggu scheduler | Job result dan NLP result |
| Crawl matrix | Trigger dengan filter source, penyakit, wilayah, atau tanggal | Run, rows, filter rejection |

Toggle data source terutama mengendalikan crawling kontinu. URL manual dan crawl matrix dapat memiliki trigger sendiri, tetapi hasil NLP tetap perlu memakai kontrak shared pipeline.

## 11. Guardrail kualitas

Source aktif tidak berarti semua hasil valid. Setiap artikel tetap melewati:

~~~text
filter relevansi kesehatan
-> disease extraction
-> evidence validation
-> location hierarchy
-> metric relation
-> multi-event composition
-> needs_review decision
-> persistence
~~~

Translation atau NLLB tidak boleh menjadi authority utama untuk penyakit, lokasi, atau angka. Evidence bahasa asli tetap menjadi sumber keputusan.

## 12. Status audit

Dokumen ini belum menyatakan fitur sudah tersedia. Belum dilakukan:

- perubahan UI;
- perubahan backend API;
- perubahan schema atau migration;
- perubahan default source;
- perubahan scheduler;
- perubahan collector;
- crawling live;
- pengujian source eksternal.

Sebelum implementasi perlu diaudit:

1. source registry yang sudah tersedia;
2. API backend data source;
3. halaman UI data source;
4. field enabled atau status yang sudah ada;
5. scheduler yang membaca source;
6. tabel riwayat crawling;
7. endpoint atau tabel statistik;
8. mekanisme collector mengirim hasil ke worker.

## 13. Kriteria selesai implementasi

Implementasi dianggap selesai jika:

- source baru default disabled;
- toggle UI mengubah status source;
- scheduler hanya mengambil source enabled;
- source aktif dapat berjalan otomatis;
- run dapat dibatasi jumlah artikelnya;
- URL dan artikel duplikat tidak dihitung ulang;
- statistik fetch dan NLP tersimpan;
- jumlah artikel kesehatan dapat ditampilkan;
- disease event dan sub-event dapat ditelusuri ke artikel;
- error dan timeout memiliki status jelas;
- menonaktifkan source menghentikan run berikutnya;
- focused tests dan regression tests lulus.
