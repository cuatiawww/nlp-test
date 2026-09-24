# Implementation Plan NLP-PENYAKIT

**Tanggal:** 2026-09-25 WIB  
**Status:** planning only; belum ada coding atau perubahan runtime.  
**Scope:** runtime audit, root-cause verification, performance, disease/location/metric extraction, relation, multi-event, route consistency, dan regression.

## 1. Guardrails

Tahap ini tidak mencakup:

- pembuatan dataset baru;
- fine-tuning model;
- penggantian checkpoint XLM-R production;
- penghapusan Disease Master, Alias, Country, Location, Gazetteer, atau rules;
- LLM di production;
- migration database sebelum terbukti diperlukan;
- rewrite arsitektur.

Semua route tetap harus menggunakan shared core pipeline.run().

Model XLMRobertaForSequenceClassification tetap digunakan sebagai classifier/fallback disease. Model tidak diperlakukan sebagai NER, location extractor, metric extractor, atau relation extractor.

## 2. Current baseline

Model runtime:

~~~text
NLP_MODEL=fine-tuned
/app/models/fine-tuned
XLMRobertaForSequenceClassification
23 label
~~~

Komponen existing yang dipertahankan:

- services/nlp-python/app/pipeline.py
- services/nlp-python/app/extractors.py
- services/nlp-python/app/surveillance_extraction.py
- services/nlp-python/app/multi_event_extractor.py
- services/nlp-python/app/epidemiology.py
- services/nlp-python/app/disease_master.py
- services/nlp-python/app/models/classifier.py
- Disease Master dan Disease Alias dari database
- Country/Location database dan Gazetteer
- disease_events, raw_reports, sub_events, dan output fields existing

Baseline performance dari investigasi sebelumnya pada artikel WHO sekitar 17.934 karakter:

~~~text
predict_surveillance_facts : sekitar 26 detik
disease_entity_extract    : sekitar 93 detik
~~~

Angka tersebut menjadi baseline investigasi dan harus diukur ulang pada runtime sebelum perubahan. Belum boleh dianggap sebagai root cause final.

## 3. Recommended target architecture

~~~text
Crawler / Manual URL / Crawl Matrix
              ↓
        Shared pipeline.run()
              ↓
Preprocessing dan normalized text sekali
              ↓
Disease candidates
  Master + Alias + Keywords + Rules
              ↓
Location candidates
  Country + Location DB + Gazetteer
              ↓
Dates / periods / metrics
              ↓
Evidence dan sentence/clause context
              ↓
Disease–Location–Metric relations
              ↓
Multi-event / sub_events
              ↓
Backward-compatible response projection
              ↓
Persistence ke raw_reports / disease_events
~~~

XLM-R tetap menjadi classifier/fallback disease. Structured extraction tetap menggunakan existing extraction pipeline.

## 4. Phase 0 — Runtime audit dan root-cause proof

### Tujuan

Mengetahui alur aktual yang berjalan di container, bukan hanya struktur folder.

### Execution path yang harus ditrace

~~~text
continuous crawling
  → collector
  → queue/worker
  → NLP endpoint
  → pipeline.run()
  → persistence

manual URL analysis
  → backend endpoint
  → NLP endpoint
  → pipeline.run()
  → response / persistence

crawl matrix
  → matrix job
  → worker
  → NLP endpoint
  → pipeline.run()
  → persistence
~~~

### Area yang diperiksa

- collector route dan job dispatch;
- services/nlp-python/app/main.py;
- pipeline.run();
- translate_and_extract();
- predict_surveillance_facts();
- extract_disease_mentions();
- extract_location() dan extract_all_locations();
- case/death extractors;
- date/period extractors;
- extract_metric_relations();
- compose_structured_events();
- response schema dan persistence worker;
- model loading dan XLM-R input/truncation;
- timeout, concurrency, cache, dan environment.

### Output audit

- execution profile tiga route;
- stage timing tiap route;
- input text comparison;
- model inference timing;
- daftar full-article scan;
- daftar overwrite/collapse yang menghilangkan disease atau event;
- root-cause matrix dengan status confirmed, suspected, atau not reproduced.

### Gate

Tidak ada production coding sebelum Phase 0 selesai dan root cause serta file/function yang bermasalah sudah direview.

## 5. Phase 1 — Performance foundation

### Tujuan

Mempercepat artikel panjang tanpa memotong extraction menjadi bounded/truncated mode permanen.

### File/function yang berpotensi diubah setelah root cause terkonfirmasi

| File/area | Tujuan |
|---|---|
| pipeline.py | reuse preprocessing dan context index dalam satu run() |
| extractors.py | mengurangi normalisasi dan full-text scan berulang |
| extractors.py | cache compiled pattern dan immutable master snapshot |
| surveillance_extraction.py | menjalankan relation mahal hanya pada candidate/context window |
| classifier.py | maksimal satu inference XLM-R per artikel |
| translator.py | tetap enrichment, bukan blocking authority |
| config/runtime | verifikasi timeout dan concurrency |

### Prinsip

- normalisasi text satu kali;
- sentence/clause segmentation satu kali;
- snapshot Disease Master/Alias/Location digunakan ulang;
- lookup database tidak dilakukan per candidate;
- full article tetap dipertahankan untuk evidence;
- expensive operation dibatasi berdasarkan candidate/context;
- NLLB tidak dijalankan berulang untuk setiap event;
- tidak mematikan disease, location, metric, atau relation extraction.

### Risiko

- cache stale;
- candidate terlewat jika window terlalu sempit;
- evidence offset berubah;
- route berbeda karena context preparation tidak shared.

### Expected output

Extraction tetap penuh, dengan:

- stage timing lebih rendah;
- artikel panjang tidak timeout;
- jumlah full scan berkurang;
- evidence dan offset tetap valid.

## 6. Phase 2 — Disease extraction dan multi-disease retention

### Tujuan

Memisahkan:

~~~text
disease candidate extraction
disease normalization
primary disease classification
~~~

### File/function

- extractors.py: candidate dan evidence extraction;
- disease_master.py: canonical name dan disease_id;
- pipeline.py: candidate retention dan primary selection;
- classifier.py: XLM-R tetap fallback.

### Aturan

Input:

~~~text
Dengue and chikungunya cases were reported in Thailand.
~~~

Expected:

~~~text
disease_extracted = [Dengue, Chikungunya]
disease_mentions = [Dengue, Chikungunya]
disease_classification = Dengue
~~~

XLM-R tidak boleh menghapus candidate kedua hanya karena output modelnya satu label.

### Risiko

- alias generic menjadi false positive;
- disease background dianggap current;
- primary disease berubah dan memengaruhi consumer lama.

## 7. Phase 3 — Location extraction dan normalization

### Tujuan

Mempertahankan lokasi valid tanpa menganggap semua nama tempat sebagai event location.

### File/function

- extractors.py: location candidate extraction;
- surveillance_extraction.py: GazetteerLinker dan hierarchy validation;
- Country/Location database;
- location aliases dan coordinate validation.

### Aturan

- source country tidak otomatis menjadi event location;
- lokasi comparison/background tidak otomatis menjadi event location;
- hierarchy country/province/city/district/region/facility dipertahankan;
- lokasi tanpa metric tetap menjadi mention, bukan otomatis incident event;
- country compatibility dan koordinat tetap divalidasi.

Expected:

~~~text
locations:
- Bangkok / Thailand
- Chiang Mai / Thailand
~~~

## 8. Phase 4 — Metric dan date extraction

### Tujuan

Mengambil cases/deaths/metrics berdasarkan evidence context.

### File/function

- extractors.py: case/death/count helpers;
- epidemiology.py: event date, period, labeled counts;
- surveillance_extraction.py: metric relation candidates;
- pipeline.py: current/historical/cumulative projection.

Input:

~~~text
6,757 confirmed cases and 3,267 deaths in DRC.
~~~

Expected:

~~~text
cases = 6757
deaths = 3267
location = DRC
~~~

Angka background, denominator, persentase, target vaksinasi, nomor dokumen, dan angka unrelated tidak boleh menjadi cases/deaths tanpa metric evidence.

## 9. Phase 5 — Disease–Location–Metric relation

### Tujuan

Membentuk relation berdasarkan sentence/clause/evidence window, bukan Cartesian product.

### File/function

- surveillance_extraction.py: metric relation extraction;
- multi_event_extractor.py: relation-to-event composition;
- pipeline.py: relation validation dan projection.

### Aturan

1. Disease, location, dan metric harus memiliki evidence context.
2. Relation diprioritaskan pada clause yang sama.
3. Metric national tidak otomatis diberikan ke semua province.
4. Metric historical tidak diberikan ke current event.
5. Satu metric tidak diduplikasi tanpa bukti eksplisit.
6. Relation tidak aman diberi needs_review atau tetap sebagai unbound evidence.
7. Tidak dibuat kombinasi semua disease dengan semua location.

Input:

~~~text
Ebola outbreaks were reported in North Kivu and South Kivu.

North Kivu recorded 100 cases and 20 deaths.
South Kivu recorded 50 cases and 5 deaths.
~~~

Expected:

~~~text
Ebola / North Kivu / 100 cases / 20 deaths
Ebola / South Kivu / 50 cases / 5 deaths
~~~

## 10. Phase 6 — Multi-event dan backward compatibility

### Tujuan

Satu artikel dapat memiliki beberapa structured events tanpa memutus consumer lama.

Single event tetap menggunakan:

~~~text
disease_classification
location_name
case_count
death_count
~~~

Multiple events menggunakan:

~~~text
disease_extracted
disease_mentions
locations
sub_events
evidence
relations
~~~

Untuk multi-event, sub_events menjadi source of truth. Parent scalar tidak boleh berpura-pura menjadi satu event jika terdapat beberapa event.

### File/function

- schemas.py: gunakan response field existing;
- multi_event_extractor.py: pertahankan event terpisah;
- pipeline.py: parent/child projection;
- services/worker-python/app/entity_relations.py: persistence relation/event;
- frontend/API hanya disentuh jika test membuktikan field existing tidak cukup.

Tidak ada migration pada fase ini. Migration hanya dipertimbangkan jika benar-benar ada schema gap.

## 11. Phase 7 — Konsistensi tiga route

### Tujuan

Continuous crawling, manual URL analysis, dan crawl matrix menggunakan core NLP logic yang sama.

### Aturan

- ketiganya memanggil pipeline.run();
- execution profile boleh berbeda;
- disease/location/metric/relation extractor tidak boleh berbeda;
- input article dibandingkan pada level text;
- perbedaan hasil harus dapat dijelaskan oleh config, input, model setting, atau persistence projection.

Expected:

~~~text
core extraction result = sama
route-specific wrapper/persistence = dapat berbeda dan terdokumentasi
~~~

## 12. Phase 8 — Regression dan performance testing

### Functional cases

| Case | Input pattern | Expected |
|---|---|---|
| 1 | 1 disease + 1 location | 1 event valid |
| 2 | 2 diseases + 1 location | 2 disease mentions; metric hanya jika attribution jelas |
| 3 | 1 disease + 2 locations | event terpisah bila metric terpisah |
| 4 | 2 diseases + 2 locations + metrics | disease/location/metric tetap terpisah |
| 5 | 2 diseases + cases/deaths berbeda | cases/deaths tidak tertukar |
| 6 | historical/background disease | tidak menjadi current event |
| 7 | artikel panjang | full extraction tanpa timeout |
| 8 | WHO Disease Outbreak News | disease/location/date/metric/relation tervalidasi |
| 9 | existing behavior | regression tidak rusak |
| 10 | tiga route | core extraction konsisten |

### Performance metrics

~~~text
total processing time
per-stage duration
timeout / non-timeout
model inference time
number of full-text scans jika tersedia
number of DB/config lookups jika tersedia
output event count
validation flags
~~~

Tidak boleh mengklaim akurasi meningkat karena belum ada golden dataset. Hanya boleh melaporkan:

~~~text
regression pass/fail
output comparison
before/after runtime
timeout/non-timeout
relation correctness pada test case
~~~

## 13. Files/functions affected summary

| File | Area | Tujuan |
|---|---|---|
| services/nlp-python/app/pipeline.py | run() dan orchestration | shared flow, retention, projection, timing |
| services/nlp-python/app/extractors.py | disease/location/metric helpers | mengurangi repeated scan |
| services/nlp-python/app/disease_master.py | normalization | canonical disease dan alias |
| services/nlp-python/app/surveillance_extraction.py | Gazetteer dan metric relations | location validation dan relation |
| services/nlp-python/app/multi_event_extractor.py | event composition | event tetap terpisah |
| services/nlp-python/app/epidemiology.py | date/period/count context | current versus historical |
| services/nlp-python/app/models/classifier.py | model invocation | classifier tetap fallback |
| services/nlp-python/app/schemas.py | response model | backward compatibility |
| services/worker-python/app/entity_relations.py | persistence | relation/sub-event storage |
| services/nlp-python/app/tests/ | NLP regression | extraction dan multi-event |
| services/worker-python/tests/ | worker regression | route dan persistence |

Tidak ada file model, dataset, migration, atau arsitektur baru yang direncanakan.

## 14. Risiko dan rollback

### Risiko

- alias terlalu luas;
- location comparison menjadi event location;
- cases/deaths salah terikat;
- metric diduplikasi;
- background disease menjadi current event;
- parent scalar menyembunyikan multi-event;
- worker/dashboard hanya membaca primary disease;
- route menggunakan input/config berbeda;
- cache stale;
- relation terlalu ketat sehingga event valid hilang.

### Rollback

1. Satu concern per fase.
2. Shared pipeline.run() tetap dipertahankan.
3. Gunakan NLP_PIPELINE_VERSION.
4. Jalankan shadow comparison sebelum persistence utama.
5. Pertahankan output lama untuk single-event.
6. Rollback relation composer jika terjadi regresi.
7. Jangan menghapus Disease Master, Alias, Gazetteer, atau rules.
8. Jangan mengganti checkpoint XLM-R.
9. Jangan migration tanpa bukti schema gap.

## 15. Stop points

### Stop point 1

Selesaikan runtime audit dan tampilkan:

- execution path tiga route;
- root-cause matrix;
- stage timing;
- file/function yang benar-benar bermasalah;
- perubahan minimal yang diperlukan.

Berhenti untuk review sebelum coding.

### Stop point 2

Setelah patch pertama:

- jalankan regression;
- bandingkan output lama dan baru;
- ukur artikel panjang;
- pastikan disease/location/metric tidak hilang.

### Stop point 3

Sebelum persistence/schema change:

- pastikan field existing tidak cukup;
- tampilkan impact table;
- tunggu persetujuan migration jika diperlukan.

## Final implementation order

~~~text
Phase 0  Runtime audit dan root-cause proof
Phase 1  Performance foundation
Phase 2  Disease candidate retention
Phase 3  Location normalization
Phase 4  Metric/date context
Phase 5  Disease-location-metric relation
Phase 6  Multi-event projection dan compatibility
Phase 7  Three-route consistency
Phase 8  Regression dan performance verification
~~~

Tahap pertama yang boleh dilakukan adalah Phase 0 runtime audit. Coding baru dimulai setelah root cause dan file/function yang akan diubah sudah jelas serta direview.
