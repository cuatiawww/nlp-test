# Audit tahap 1: alur crawling, model NLP, NLLB, dan matriks surveilans

Tanggal: 2026-09-24  
Status: audit baca-kode, belum melakukan perubahan perilaku sistem  
Ruang lingkup: collector, worker, NLP core, queue, persistence, schema, konfigurasi, dan test yang terkait.

## Ringkasan hasil

1. Ada tiga jalur utama: crawling kontinu, analisis URL manual, dan crawl matrix. Ketiganya akhirnya memanggil core yang sama, yaitu `services/nlp-python/app/pipeline.py::run`.
2. NLLB bukan sumber keputusan utama. Teks asli tetap menjadi sumber bukti untuk penyakit, lokasi, jumlah kasus, kematian, dan event.
3. XLM-R hanya dipakai jika mode runtime mengizinkannya. Pada URL interaktif, mode bounded secara eksplisit mengubah `NLP_MODEL` menjadi `none`, sehingga URL Analyzer saat ini berjalan terutama dengan rule, lexicon, gazetteer, dan relation extraction.
4. Konfigurasi repository tidak sepenuhnya konsisten: `.env` memilih `fine-tuned`, default compose memilih `xlm-roberta`, dan `config.py` juga default ke `xlm-roberta`. Checkpoint `xlm-roberta-base` ditolak sebagai zero-shot/NLI oleh guard model. Ini harus dipastikan dari `/health` dan log container, bukan dari dokumentasi saja.
5. Test translation source-first lulus. Regression penuh belum dapat dinyatakan lulus karena environment host tidak memiliki `pytest`, `transformers`, `pydantic`, dan `psycopg`. Docker tidak tersedia dari shell ini.

## 1. Peta alur aktual

```text
Sumber terjadwal
  -> scheduler collector
  -> RSS / web / CSV / social collector
  -> fetch, parse, normalisasi metadata, identity hash
  -> MinIO untuk artefak mentah
  -> RabbitMQ disease.raw atau disease.social
  -> worker.py
  -> POST /nlp/analyze/raw
  -> pipeline.run
  -> raw_reports + disease_events + relation rows

URL manual
  -> POST /analysis-jobs
  -> RabbitMQ disease.analysis-url
  -> analysis_jobs.process_job
  -> POST collector /extract-url
  -> POST NLP /nlp/analyze/url
  -> /nlp/analyze-bounded
  -> bounded child process
  -> pipeline.run
  -> raw_reports + disease_events + crawl cleanup

Crawl matrix
  -> POST /crawl-jobs
  -> PostgreSQL crawl_matrix_jobs + RabbitMQ disease.crawl-matrix
  -> crawl_matrix_jobs worker
  -> Google News RSS / source catalog / direct URL
  -> collector extraction
  -> POST /nlp/analyze/raw
  -> pipeline_analysis_to_matrix
  -> country/province metric filter
  -> crawl_matrix_rows + crawler_nlp_cache
```

### 1.1 Crawling kontinu

Scheduler memilih collector berdasarkan `source_type` dan menjalankan source dengan batas concurrency (`services/collector-python/app/scheduler.py:45-78`). Web collector mengambil halaman, menolak redirect/host yang tidak aman, mendeteksi challenge atau SPA shell, mengekstrak title/content/date, menyimpan HTML/PDF ke MinIO, lalu publish payload ke RabbitMQ (`services/collector-python/app/collectors/web_scraper.py:668-804,806-905`).

Worker mengambil pesan, melakukan identity lock dan duplicate check, memanggil NLP `/nlp/analyze/raw`, lalu menyimpan event. Retry dan DLQ ditangani di worker, bukan di pipeline (`services/worker-python/app/worker.py:531-606`).

Konsekuensi akurasi: artikel yang gagal diekstrak tidak pernah masuk NLP; artikel yang lolos ekstraksi tetapi salah memilih body selector dapat menghasilkan bukti yang tidak lengkap. Karena itu kualitas crawler harus diaudit sebelum menyalahkan model.

### 1.2 Analisis URL manual

Job dibuat di collector dan dipublish ke queue terisolasi (`services/collector-python/app/analysis_jobs.py:24-66`). Worker menjalankan fetch dengan retry/fallback, menyimpan raw lebih dulu melalui `before_nlp`, lalu memanggil URL NLP (`services/worker-python/app/analysis_jobs.py:139-238,260-373,924-969`).

URL NLP memakai bounded process dan satu slot interactive. `bounded_analysis.inference_stage` memaksa `NLP_MODEL=none` untuk request interactive dan mematikan agent/WHO discovery agar tidak melewati budget (`services/nlp-python/app/bounded_analysis.py:35-81`). Jadi jalur ini tidak boleh didokumentasikan sebagai inference XLM penuh.

### 1.3 Crawl matrix

`POST /crawl-jobs` hanya membuat job dan mengirim ID ke queue (`services/collector-python/app/crawl_jobs.py:405-439`). Worker matrix memiliki lease PostgreSQL, discovery, extraction, cache berdasarkan identity dan pipeline version, lalu persistence (`services/worker-python/app/crawl_matrix_jobs.py:339-444,921-1012,1123-1160`).

Matrix memakai kontrak NLP raw yang sama, bukan endpoint surveillance yang berbeda (`services/worker-python/app/crawl_matrix_jobs.py:767-783`). Adapter `pipeline_analysis_to_matrix` mengubah response pipeline menjadi kumpulan lokasi/country yang dipakai persistence. Data yang akhirnya dipersist adalah baris relasi country-disease-metric, bukan hanya satu label dokumen.

## 2. Apa yang terjadi di `pipeline.run`

Urutan pentingnya adalah:

1. Memperbaiki mojibake dan, pada mode interactive, memotong teks ke batas analisis (`pipeline.py:157-169`).
2. Mendeteksi bahasa dan script menggunakan caller hint, Unicode script, language marker, lalu `langdetect` (`multilingual.py:80-179`).
3. Memanggil `translate_and_extract`, tetapi translation adalah view tambahan. `analysis_text` tetap teks asli (`pipeline.py:170-187`).
4. Mengambil fakta awal: topic health, negara/lokasi, penyakit, dan sinyal metric (`pipeline.py:189-285`).
5. Mengambil disease aliases, keyword, dan WHO concepts. Untuk interactive, scan WHO dipersempit untuk menjaga waktu (`pipeline.py:288-347`).
6. Jika model aktif, classifier dapat memberi label penyakit. Hasil model diturunkan atau ditolak bila tidak punya evidence textual di artikel (`pipeline.py:374-454`).
7. Mengekstrak tanggal event, period, count, evidence, lalu membangun `sub_events` melalui `compose_structured_events` (`pipeline.py:856-960`).
8. Untuk batch, menjalankan strict surveillance relation pass dan `extract_metric_relations`; pada interactive pass ini sengaja dilewati secara default karena mahal (`pipeline.py:988-1035`).
9. Menghasilkan `AnalyzeResponse` (`pipeline.py:2146-2180`).

Decision authority saat ini:

```text
Teks asli
  -> rule/lexicon/gazetteer/relation extraction  = authoritative evidence
  -> XLM classifier                              = conditional document label
  -> NLLB translation                            = semantic/enrichment view
  -> DeepSeek/agent                              = optional fallback/review
```

## 3. Model yang benar-benar digunakan

| Komponen | Konfigurasi / checkpoint | Fungsi aktual | Jalur |
|---|---|---|---|
| Fine-tuned XLM-R | `NLP_MODEL=fine-tuned`, `/app/models/fine-tuned` | text classification untuk disease label | batch bila model aktif |
| XLM-R base | `xlm-roberta-base` | dimaksudkan untuk zero-shot, tetapi guard menolak checkpoint encoder tanpa sequence-classification/NLI head | fallback konfigurasi, bukan prediksi valid |
| IndoBERT | `indolem/indobert-base-uncased` | opsi model map | hanya jika dipilih, perlu checkpoint/kontrak tervalidasi |
| NLLB-200 | `facebook/nllb-200-distilled-600M` | terjemahan ke English, chunked dan cached | enrichment |
| Rule/lexicon/gazetteer | DB-backed aliases, keywords, locations, extraction rules | entity, metric, location, evidence, validation | semua jalur |
| DeepSeek/agent | opt-in, default `AGENT_ENABLED=false` | fallback/review terbatas | bukan dependency crawling |

Guard classifier memang mencegah penggunaan `xlm-roberta-base` sebagai NLI palsu (`services/nlp-python/app/models/classifier.py:62-81,230-269`). Dengan `NLP_MODEL=fine-tuned`, disease classification memakai checkpoint lokal; auxiliary classifier juga dilewati untuk interactive atau fine-tuned (`pipeline.py:383-415`).

Catatan konfigurasi: file `.env` saat ini memilih `NLP_MODEL=fine-tuned`, sedangkan `docker-compose.yml` memiliki default `xlm-roberta` dan komentar yang menyatakan fine-tuned tidak ter-mount. Folder repository memang berisi `services/nlp-python/models/fine-tuned/model.safetensors`. Ini adalah drift dokumentasi/runtime yang perlu dibereskan pada tahap perbaikan berikutnya.

## 4. Jalur NLLB dan statusnya

`translate_and_extract` melakukan langkah berikut (`services/nlp-python/app/translator.py:219-272`):

1. Jika provider bukan `nllb`, status `disabled`.
2. Bahasa `en` atau bahasa yang berada di `TRANSLATION_NATIVE_FIRST_LANGS` tidak wajib diterjemahkan. Default native-first hanya `id` (`services/nlp-python/app/config.py:69-86`).
3. Cache translation dicari lebih dulu.
4. Dengan `TRANSLATION_ASYNC_ENABLED=true`, bahasa lain mengembalikan `translation_status=pending`; model tidak dimuat dalam request utama.
5. Worker URL manual kemudian dapat enqueue `disease.translation` dan memanggil `/nlp/translate` secara terpisah (`services/worker-python/app/analysis_jobs.py:1068-1078,1110-1142,1145-1190`).

Implikasi jalur:

| Jalur | NLLB synchronous? | Enrichment queue? | Dampak |
|---|---:|---:|---|
| URL manual | tidak, kecuali translation cache sudah ada | ya | hasil source-first dapat selesai sebelum translation |
| crawl matrix | tidak | tidak terlihat pada worker matrix | matrix bergantung pada extraction native/rules dan classifier batch |
| crawling kontinu | tidak | tidak terlihat pada worker raw | NLLB bukan bagian dari hasil awal raw ingest |
| explicit `/nlp/translate` | ya | dipanggil langsung | hanya menghasilkan translation view dan structured auxiliary |

## 5. Bentuk pecahan data dan matriks

`AnalyzeResponse` memisahkan beberapa tingkat data:

| Tingkat | Field | Isi |
|---|---|---|
| Dokumen | `language`, `script`, `source_country`, `published_at`, `event_date` | metadata artikel dan provenance sumber |
| Penyakit | `disease_extracted`, `disease_mentions`, `disease_classification` | kandidat, mention dengan evidence/role/ICD-11, dan label utama |
| Lokasi | `location_name`, `locations[]` | country, admin1/admin2, koordinat, evidence, offset |
| Event atomik | `sub_events[]` | pasangan disease-location-metric-date, status epistemik, confidence, relation, provenance |
| Metric | `case_count`, `death_count`, `confirmed_cases`, `suspected_cases`, `hospitalizations` | ringkasan dokumen dan nilai yang telah divalidasi |
| Bukti | `evidence`, `epidemiological_evidence`, offset | teks sumber yang mendukung keputusan |
| Enrichment | `translated_text`, `translation_status`, `translation_provider` | view terjemahan, bukan sumber evidence |

Untuk matriks crawl, worker memproyeksikan hasil menjadi baris dengan key konseptual:

```text
(crawl_job_id, raw_report_id, disease, icd11_code,
 region, country, province_city_case, article_date, date_case,
 number_of_cases, number_of_deaths, source_url, evidence,
 confidence, processing_status)
```

Definisi penting: satu artikel dapat menghasilkan beberapa `sub_events` dan beberapa baris country/province. `disease_classification` saja tidak cukup untuk mengisi matriks karena tidak mengikat angka ke lokasi. Pengikatan itu dilakukan oleh `compose_structured_events` dan `extract_metric_relations`, dengan evidence window dan offset (`pipeline.py:895-960,1001-1119`; `surveillance_extraction.py:1897-2048`).

## 6. Pintu akurasi yang harus dilalui setiap URL

```text
URL valid/public?
  -> fetch benar-benar artikel, bukan challenge/shell?
  -> title/content/date/source identity lengkap?
  -> duplicate identity aman di database?
  -> bahasa dan script benar?
  -> disease punya evidence tekstual?
  -> location tervalidasi oleh gazetteer/country?
  -> angka terikat ke disease + location + period?
  -> event/sub-event lolos validation flags?
  -> filter crawl cocok dengan disease/country/date/province?
  -> raw, event, matrix row committed?
```

Jika salah satu pintu awal gagal, masalahnya bukan akurasi model. Contoh: HTML challenge akan ditolak di collector; isi terlalu pendek ditandai noisy; lokasi yang konflik dengan country diturunkan ke country-level; metric tanpa disease relation diberi `needs_review` (`pipeline.py:2113-2120`).

## 7. Temuan trouble tahap pertama

Status `confirmed` berarti terlihat langsung dari kode/config. Status `needs-runtime-check` berarti perlu diuji di container resmi sebelum patch.

| Prioritas | Status | Temuan | Dampak |
|---|---|---|---|
| P0 | confirmed | URL interactive memaksa `NLP_MODEL=none` | Manual URL tidak menjalankan XLM classifier walaupun UI atau dokumentasi dapat memberi kesan sebaliknya |
| P0 | confirmed | NLLB async hanya di-enqueue oleh analysis-job worker | crawl kontinu dan crawl matrix tidak memperoleh translation enrichment pada hasil awal |
| P0 | needs-runtime-check | `.env` memilih `fine-tuned`, compose/config menyediakan default `xlm-roberta`, dan komentar compose menyatakan checkpoint fine-tuned tidak mounted | Model aktif dapat berbeda dari yang dipahami operator; hasil classifier sulit direproduksi |
| P1 | confirmed | Ada legacy in-process matrix runner di `collector/crawl_jobs.py` dan worker matrix khusus di `worker/crawl_matrix_jobs.py` | Dua persistence/orchestration path dapat drift walaupun production diarahkan ke worker khusus |
| P1 | confirmed | Matrix queue di-ACK setelah job berhasil di-claim, bukan setelah job selesai | Lease poller memulihkan crash, tetapi delivery RabbitMQ tidak lagi merepresentasikan selesai proses |
| P1 | needs-runtime-check | Loader DB dan test tertentu tetap dapat berjalan dengan data lexicon/location tidak tersedia, sementara `/health` tetap lokal | Service bisa terlihat healthy tetapi akurasi location/metric turun karena data runtime belum termuat |
| P1 | confirmed | Interactive melewati strict surveillance relation pass untuk memenuhi budget | Hasil URL cepat, tetapi detail relasi metric dapat berbeda dari batch untuk artikel yang sama |
| P2 | confirmed | Collector melakukan precheck dedup sebelum publish dan fail-open saat database tidak tersedia; worker/database menjadi guard akhir | Saat gangguan DB, pesan duplikat dapat masuk queue lebih banyak, walau unique index/worker lock menahan sebagian duplikasi |

Catatan: migration `088_crawler_identity_constraints.sql` sudah memiliki unique partial indexes untuk URL, normalized URL, canonical URL, final URL, URL hash, dan content hash. Temuan dedup di atas bukan “tidak ada constraint”, melainkan adanya beberapa lapis precheck dan fallback sebelum constraint/database guard akhir.

## 8. Verifikasi yang sudah dilakukan

Perintah yang berhasil:

```text
PYTHONPATH=services/nlp-python python3 -m unittest discover \
  -s services/nlp-python/app/tests -p "test_translation_budget.py" -v
Ran 5 tests in 0.104s - OK
```

Perintah yang belum dapat menjadi regression suite:

- `pytest` tidak tersedia di WSL host.
- `test_classifier_checkpoint.py` gagal import karena `transformers` tidak tersedia.
- Sebagian `test_multilingual_intelligence.py` gagal import karena `pydantic` tidak tersedia; satu assertion tanggal gagal di environment dependency-minimal.
- Docker CLI tidak tersedia dari shell ini, sehingga container resmi belum dijalankan.

## 9. Urutan perombakan yang aman untuk tahap berikutnya

1. Kunci dulu runtime truth: catat output `/health`, model id, pipeline version, model architecture, dan status NLLB dari container resmi.
2. Buat satu golden trace untuk satu URL: raw HTML/content, NLP request, response penuh, `sub_events`, dan row matrix.
3. Bandingkan URL yang sama melalui tiga jalur: raw ingest, URL manual, dan crawl matrix. Target pertama adalah membuktikan apakah perbedaan berasal dari fetch, cap teks, mode model, atau persistence.
4. Setelah trace stabil, pilih satu perbaikan kecil P0. Jangan mengubah model dan relation extraction bersamaan.
5. Baru lanjutkan audit field-level: disease, country, province/city, case/death, date, evidence, confidence, dan `needs_review`.

Dokumen ini adalah baseline audit, bukan persetujuan bahwa seluruh hasil ekstraksi sudah akurat.
