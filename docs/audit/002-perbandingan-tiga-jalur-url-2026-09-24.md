# Audit tahap 2: perbandingan satu URL pada tiga jalur

Tanggal: 2026-09-24  
Status: baseline perilaku sebelum unifikasi flow; lihat audit 003 untuk status setelah perubahan  
Dokumen terkait: `docs/audit/001-alur-crawling-model-dan-akurasi-2026-09-24.md`

## Kesimpulan singkat

Satu URL tidak dijamin menghasilkan output yang sama ketika diproses melalui:

1. crawling kontinu;
2. analisis URL manual;
3. crawl matrix.

Core `pipeline.run` memang sama, tetapi input, konfigurasi model, batas teks, tahap yang dilewati, cache, dan bentuk persistence berbeda.

## Mengapa NLP model dimatikan?

Model tidak dimatikan secara global. Model hanya dimatikan pada request yang ditandai `interactive` atau `rules_only`.

Lokasi kode:

```text
services/nlp-python/app/bounded_analysis.py:35-81
```

Alasannya:

- URL manual memiliki budget sekitar 30 detik (`INTERACTIVE_STAGE_BUDGET_SECONDS`).
- Loading model Transformer dapat lambat pada cold start.
- Inference model dapat menggunakan CPU dan menghambat request lain.
- URL manual ditargetkan memberi respons cepat, bukan menjalankan seluruh analisis batch.
- Jika model, agent, dan strict relation dijalankan sekaligus, risiko timeout `408` meningkat.

Karena itu mode interactive melakukan hal berikut:

```text
NLP_MODEL = none
AGENT_ENABLED = false
WHO_DISCOVERY_ENABLED = false
WHO_TERM_RESOLUTION_ENABLED = false
teks dipotong ke sekitar 6.000 karakter
```

Pipeline tetap berjalan menggunakan:

- normalisasi teks;
- deteksi bahasa dan script;
- keyword dan alias penyakit;
- location alias dan gazetteer;
- ekstraksi angka dan tanggal;
- evidence window;
- `compose_structured_events`.

Jadi alasan utamanya adalah batas waktu dan stabilitas interactive endpoint. Ini merupakan trade-off desain saat ini, bukan bukti bahwa model XLM tidak diperlukan.

## Perbandingan tiga jalur

| Aspek | Crawling kontinu | URL manual | Crawl matrix |
|---|---|---|---|
| Entry point | scheduler dan source collector | `POST /analysis-jobs` | `POST /crawl-jobs` |
| Queue | `disease.raw` / `disease.social` | `disease.analysis-url` | `disease.crawl-matrix` |
| Fetch | RSS/web/CSV/social collector | collector `/extract-url` | worker matrix memanggil collector extraction |
| NLP endpoint | `/nlp/analyze/raw` | `/nlp/analyze/url` lalu bounded | `/nlp/analyze/raw` |
| `interactive` | false | true | false |
| XLM | dicoba aktif | dimatikan | dicoba aktif |
| Batas teks | payload raw collector | sekitar 6.000 karakter | sekitar 35.000 karakter |
| NLLB | bukan dependency hasil awal | dapat di-enqueue setelah job selesai | tidak otomatis di-enqueue |
| Strict relation pass | aktif | dilewati default | aktif |
| Filter matrix | tidak | tidak | disease/country/date/province |
| Persistence | `raw_reports`, `disease_events` | `analysis_jobs`, `raw_reports`, `disease_events` | `raw_reports`, cache, `crawl_matrix_rows` |

## Jalur 1: crawling kontinu

```text
URL
 -> scheduler
 -> web/RSS collector
 -> raw content + metadata
 -> MinIO
 -> RabbitMQ disease.raw
 -> worker.py
 -> /nlp/analyze/raw
 -> pipeline.run(interactive=false)
 -> model + rule extraction + relation extraction
 -> raw_reports dan disease_events
```

Rujukan kode:

- `services/collector-python/app/scheduler.py:45-102`
- `services/collector-python/app/collectors/web_scraper.py:668-804,806-905`
- `services/worker-python/app/worker.py:531-606`
- `services/nlp-python/app/main.py:97-116`

Pada jalur ini, `pipeline.run` boleh memanggil classifier apabila `NLP_MODEL` bukan `none`. Dengan `.env` saat ini, nilai yang dipilih adalah `fine-tuned`. Jika model gagal dimuat, pipeline dapat melanjutkan dengan hasil extraction berbasis rule dan memberi warning.

Strict surveillance relation tetap dijalankan karena request bukan interactive. Ini penting untuk mengikat angka kepada disease, lokasi, dan evidence.

## Jalur 2: URL manual

```text
URL
 -> POST /analysis-jobs
 -> disease.analysis-url
 -> analysis_jobs.process_job
 -> collector /extract-url
 -> NLP /nlp/analyze/url
 -> /nlp/analyze-bounded
 -> child process
 -> pipeline.run(interactive=true)
 -> hasil analysis job
```

Rujukan kode:

- `services/collector-python/app/analysis_jobs.py:24-66`
- `services/worker-python/app/analysis_jobs.py:139-253`
- `services/worker-python/app/analysis_jobs.py:260-373`
- `services/nlp-python/app/main.py:157-183`
- `services/nlp-python/app/bounded_analysis.py:84-166`

Perbedaan utama dari batch:

1. model dimatikan;
2. teks dipotong lebih agresif;
3. external agent dimatikan;
4. WHO discovery dan resolution dimatikan;
5. strict surveillance projection dilewati default oleh `pipeline.py:1006-1013`;
6. hasil disimpan sebagai hasil URL manual, bukan langsung sebagai matrix row.

NLLB pada jalur ini bukan bagian blocking dari inference. Jika translation belum ada di cache, hasil awal dapat memiliki status `pending`. Analysis worker dapat mengirim enrichment ke `disease.translation` setelah hasil source-first selesai.

## Jalur 3: crawl matrix

```text
URL langsung atau discovery
 -> crawl_matrix_jobs
 -> collector extraction
 -> /nlp/analyze/raw
 -> pipeline.run(interactive=false)
 -> pipeline_analysis_to_matrix
 -> filter penyakit/country/date/province
 -> crawl_matrix_rows
```

Rujukan kode:

- `services/collector-python/app/crawl_jobs.py:405-439`
- `services/worker-python/app/crawl_matrix_jobs.py:767-783`
- `services/worker-python/app/crawl_matrix_jobs.py:921-1012`
- `services/worker-python/app/crawl_matrix_jobs.py:1123-1160`

Matrix memakai mode raw, sehingga model dan strict relation dapat aktif. Namun output akhirnya bukan response NLP mentah. Hasil diubah menjadi baris matrix dan bisa dibuang jika tidak cocok dengan filter job.

Contoh filter tambahan:

```text
penyakit harus cocok dengan disease_concept_ids
country harus cocok
province/city harus cocok bila dipilih
tanggal harus masuk date_from/date_to
metric dan lokasi harus tervalidasi
```

## Apakah output tiga jalur sama?

### Secara bentuk: pasti berbeda

- URL manual mengembalikan hasil `AnalyzeResponse` untuk satu job.
- Crawling kontinu menyimpan raw report dan event.
- Crawl matrix menyimpan satu atau beberapa `crawl_matrix_rows`.

Jadi bentuk persistence tidak sama walaupun artikel dan core NLP sama.

### Secara nilai: bisa sama, tetapi tidak dijamin

Untuk artikel pendek dan eksplisit, hasil inti kemungkinan sama:

```text
disease = Dengue
country = Indonesia
location = Jakarta
cases = 25
deaths = 2
```

Tetapi untuk artikel panjang, multilingual, multi-country, atau ambigu, nilainya dapat berbeda.

## Penyebab perbedaan output

### 1. Tahap model tidak dilewati pada URL manual

Batch:

```text
keyword/entity extraction
 -> XLM classifier jika aktif
 -> evidence validation
```

URL manual:

```text
keyword/entity extraction
 -> evidence validation
```

Jika penyakit tidak ditemukan secara eksplisit oleh rule, batch masih dapat mencoba classifier. URL manual dapat menghasilkan `UNKNOWN`.

### 2. Panjang teks berbeda

Contoh artikel:

```text
karakter 1-6.000   = judul dan lead
karakter 6.001-8.000 = angka kasus utama
```

URL manual bisa kehilangan angka tersebut. Batch dan matrix kemungkinan masih membacanya.

### 3. Strict relation berbeda

Strict relation mengikat metric ke lokasi dan evidence. Pada batch, tahap ini dijalankan. Pada interactive, tahap ini dilewati default untuk menjaga budget.

Akibatnya artikel seperti berikut bisa berbeda:

```text
Indonesia melaporkan 20 kasus, sedangkan Malaysia melaporkan 8 kasus.
```

Batch lebih berpeluang menghasilkan dua relasi country-metric dengan benar. URL manual dapat hanya memperoleh summary atau relasi yang lebih sederhana.

### 4. NLLB tidak sinkron pada semua jalur

NLLB berlaku sebagai semantic/enrichment view:

- bahasa Inggris tidak perlu diterjemahkan;
- Bahasa Indonesia default native-first;
- bahasa lain biasanya mengembalikan `pending` jika async aktif;
- analysis-job worker dapat menjalankan queue translation;
- raw worker dan matrix worker tidak otomatis menjalankan queue tersebut.

Karena itu `translated_text`, `translation_status`, dan `translation_structured` dapat berbeda antarjalur.

### 5. Fetch dan payload tidak selalu identik

URL sama belum tentu content payload sama. Perbedaan dapat berasal dari:

- title yang ikut atau tidak ikut digabung;
- body extraction selector;
- fallback HTTP atau browser;
- canonical/final URL;
- PDF versus HTML routing;
- metadata `source_type`, `source_country`, dan `published_at`;
- cache identity.

### 6. Matrix melakukan filter setelah NLP

Matrix dapat menghapus hasil yang sebenarnya ada di response NLP jika tidak cocok dengan filter job. Sebaliknya, satu article dapat menghasilkan beberapa row karena memiliki beberapa country atau metric.

## Matriks tahap yang dilewati

| Tahap | Kontinu | Manual URL | Matrix |
|---|---:|---:|---:|
| URL public validation | ya | ya | ya |
| HTML/PDF extraction | ya | ya | ya |
| Raw identity/dedup | ya | ya | ya |
| Language/script detection | ya | ya | ya |
| Rule disease extraction | ya | ya | ya |
| XLM classifier | ya, jika model valid | tidak | ya, jika model valid |
| NLLB synchronous | tidak sebagai prerequisite | tidak sebagai prerequisite | tidak sebagai prerequisite |
| NLLB async enrichment | tidak otomatis | ya melalui analysis worker | tidak otomatis |
| DeepSeek/agent | optional | tidak | optional sesuai konfigurasi batch |
| `compose_structured_events` | ya | ya | ya |
| strict surveillance relation | ya | tidak default | ya |
| matrix filter | tidak | tidak | ya |
| persistence matrix rows | tidak | tidak | ya |

## Kesimpulan operasional

Saat ini kontraknya adalah:

```text
core NLP sama
tetapi execution profile berbeda
dan persistence projection berbeda
```

Karena itu kita tidak boleh menyebut tiga jalur sebagai hasil yang identik sebelum menjalankan golden trace URL yang sama dan membandingkan:

1. content hasil fetch;
2. payload ke NLP;
3. `language` dan `translation_status`;
4. `disease_extracted` dan `disease_classification`;
5. `locations`;
6. `sub_events`;
7. evidence dan offset;
8. case/death metrics;
9. validation flags;
10. row persistence akhir.

Perbaikan berikutnya sebaiknya dimulai dari golden trace tersebut, bukan langsung mengganti model. Dengan begitu kita bisa memastikan perbedaan berasal dari fetch, cap teks, model, relation stage, filter, atau persistence.
