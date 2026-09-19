# NLP-PENYAKIT CURRENT NLP INTELLIGENCE STATE AUDIT

Audit read-only terhadap source code dan runtime lokal. Tidak ada source code, schema, konfigurasi aplikasi, atau deployment yang diubah untuk audit ini.

Runtime menggunakan source melalui bind mount, sehingga hasil mencerminkan working tree saat audit, termasuk perubahan lokal yang belum committed.

## 1. CURRENT PIPELINE

Alur aktual:

```text
HTTP request
  -> services/nlp-python/app/main.py
  -> pipeline.run()
  -> normalisasi teks + deteksi bahasa
  -> translation/extraction
  -> surveillance fact detection
  -> location extraction + hierarchy + geocoding
  -> disease extraction + normalization
  -> optional classifier / DeepSeek / WHO
  -> case/death/typed metric extraction
  -> temporal + epistemic classification
  -> ICD-11 resolution
  -> compose_structured_events()
  -> build_atomic_events() dan build_surveillance_output()
  -> AnalyzeResponse
  -> Python worker atau Rust persistence
  -> disease_events / evidence / child events
  -> Rust API dan dashboard
```

File utama:

- Entry API: `services/nlp-python/app/main.py`
- Orchestrator: `services/nlp-python/app/pipeline.py:79`
- Bounded URL analysis: `services/nlp-python/app/bounded_analysis.py`
- Atomic relation logic: `services/nlp-python/app/intelligence.py`
- Surveillance extraction: `services/nlp-python/app/surveillance_extraction.py`
- Generic extraction: `services/nlp-python/app/extractors.py`
- Temporal/context: `services/nlp-python/app/epidemiology.py`
- Multi-event: `services/nlp-python/app/multi_event_extractor.py`
- Runtime schema: `services/nlp-python/app/schemas.py`
- Python persistence: `services/worker-python/app/worker.py`
- URL job persistence: `services/worker-python/app/analysis_jobs.py`
- Child event persistence: `services/worker-python/app/multi_event_persist.py`
- Rust persistence/API: `services/backend-rust/src/main.rs`

## 2. EXTRACTION

| Data | Kondisi aktual | Metode |
|---|---|---|
| Disease | EXISTS, tetapi masih keyword/alias-heavy | Gazetteer, alias, WHO concept, optional classifier/LLM |
| Location | EXISTS | Gazetteer, alias, regex, hierarchy, optional geocoder |
| Country | EXISTS | Country aliases, frequency, opening/context scoring |
| Province/admin | PARTIAL | Local hierarchy dan aliases |
| Cases/deaths | EXISTS | Regex dan heuristic |
| Hospitalized/recovered/tests/vaccinated | PARTIAL | Generic observation parser, tidak konsisten di seluruh pipeline |
| Percentage/rate/ratio | PARTIAL | Ada helper, tetapi belum stabil masuk ke event |
| Date/time | PARTIAL | Range, year, relative date, epi week, cumulative period |
| Context | PARTIAL | Rule-based epistemic/context classification |
| Evidence | EXISTS | Sentence evidence, offsets, provenance |
| Source metadata | EXISTS | URL, publisher, publication date, source country |
| Relations | PARTIAL | Terutama location-cases/deaths |

Keterbatasan penting: `MetricRelation` di `surveillance_extraction.py` hanya memiliki `location`, `cases`, `deaths`, `time_frame`, dan `evidence`. Belum ada disease, metric type lengkap, qualifier, confidence, atau evidence span sebagai bagian wajib dari relation.

## 3. RELATION INTELLIGENCE

### Disease -> metric

`extract_metric_relations()` menemukan angka berdasarkan pola teks dan lokasi. `intelligence.py` kemudian mencoba menghubungkan metric ke disease terdekat. Jika tidak jelas, digunakan disease dari sentence, paragraph, atau primary disease.

Status: **WEAK**. Metodenya regex, sentence/paragraph proximity, nearest-disease heuristic, dan optional LLM supplement. Belum ada dependency parsing atau relation model khusus.

### Disease -> location

Menggunakan nearest location, sentence context, paragraph fallback, primary location, dan hierarchy resolver.

Status: **PARTIAL**. Masih ada kebocoran antara lokasi parent, child, dan lokasi sumber artikel.

### Metric -> location

Pola sederhana berjalan, tetapi kalimat multi-lokasi atau multi-country dapat menukar angka.

Status: **PARTIAL**.

### Metric -> time

Time frame diambil dari sentence, explicit year, date range, cumulative phrase, epi week, dan relative date.

Status: **PARTIAL**. Temporal relation dapat benar di projection layer, tetapi event object belum selalu terpisah berdasarkan periode.

### Entity -> event

Event dibentuk setelah extraction, tetapi keputusan masih dipengaruhi jumlah metric, jumlah location, nearest relation, dan fallback primary disease/location.

Status: **PARTIAL**.

## 4. EVENT INTELLIGENCE

- **Single event:** `compose_structured_events()` dan `build_atomic_events()` dapat menghasilkan satu `SubEvent` untuk pola sederhana.
- **Multiple events:** dibuat dari beberapa location/metric relation, breakdown parser, atau legacy fallback.
- **Sub-event:** tersedia di `services/nlp-python/app/schemas.py` dan dapat dipersist oleh worker maupun Rust.
- **Parent/child:** tersedia secara dasar melalui parent event, child events, evidence JSON, relations, provenance, dan validation flags.
- **Event ID:** UUID dibuat pada persistence/database. NLP layer belum menghasilkan identity yang konsisten untuk cross-source deduplication.

Status keseluruhan: **PARTIAL**. Belum ada pembuktian semantik yang kuat bahwa dua fakta adalah dua peristiwa berbeda. Relasi seperti `breakdown_of`, `aggregate_of`, `historical_to`, dan `comparison_with` belum menjadi kontrak yang konsisten.

## 5. LOCATION INTELLIGENCE

File utama:

- `services/nlp-python/app/extractors.py`
- `services/nlp-python/app/config.py`
- `services/nlp-python/app/surveillance_extraction.py`

Kemampuan yang EXISTS:

- Country aliases
- Province/admin hierarchy
- City/locality matching
- Local gazetteer
- Country ISO3
- Parent country lookup
- Sebagian latitude/longitude
- Conflict flag
- `needs_review`
- Optional remote Nominatim

Alurnya:

```text
location mention
  -> candidate gazetteer match
  -> hierarchy resolution
  -> country compatibility check
  -> confidence/review flag
```

Masalah aktual:

- Ambiguous location belum selalu ditolak.
- Source country masih dapat menjadi fallback.
- Child dan parent location dapat muncul pada event berbeda secara tidak konsisten.
- Lokasi pada kalimat berbeda dapat tertukar.
- Event country dan publisher/source country belum sepenuhnya terpisah pada semua projection.

Status: **PARTIAL**.

## 6. DISEASE + ICD-11

File utama:

- `services/nlp-python/app/extractors.py`
- `services/nlp-python/app/icd11.py`
- `services/nlp-python/app/models/classifier.py`
- `services/nlp-python/app/pipeline.py`

Alur aktual:

```text
surface mention
  -> alias/keyword matching
  -> canonical disease name
  -> local disease concept
  -> ICD-11 candidate
  -> optional WHO lookup
  -> confidence/review
```

Yang sudah ada: surface form, canonical disease name, aliases, WHO concept catalog, ICD-11 code, `resolution_source`, disease confidence, `pending_icd11`, optional WHO discovery, dan optional classifier.

Status: **PARTIAL**.

Local resolver relatif conservative untuk istilah unresolved, tetapi keyword disease masih dapat masuk ke top-level output walaupun hubungan dengan metric belum kuat. Parent disease, subtype, synonym, dan co-mentioned disease belum sepenuhnya memiliki role/event semantics berbeda.

## 7. CONTEXT + TEMPORAL

File utama: `services/nlp-python/app/epidemiology.py`.

Yang tersedia:

- Confirmed, suspected, rumor, retracted, negative surveillance
- Official report dan reported
- New, cumulative, active
- Historical period
- Date range, epi week, relative date
- Event date dan publication date
- `date_needs_review`

Status: **PARTIAL**.

Masalah utama:

- Publication date dan event date sudah berbeda di schema, tetapi belum selalu konsisten di persistence.
- Historical year dapat diperlakukan sebagai full-year event tanpa konteks cukup.
- “First” dan “second” belum menjadi event sequence.
- Negative statement dapat menghasilkan zero-count event dengan evidence kosong.
- Cumulative metric masih dapat muncul sebagai outbreak signal.
- Current dan historical metric dapat berada dalam satu event projection.

## 8. ATOMIC EVENT

Struktur runtime yang benar-benar dipakai adalah `SubEvent`:

```text
SubEvent
├── disease
├── disease_icd11_code
├── location_name
├── country / country_iso3
├── admin1 / admin2
├── latitude / longitude
├── case_count / death_count
├── metric_type / unit
├── evidence / evidence_offset_start / evidence_offset_end
├── event_date_start / event_date_end
├── epistemic_status
├── metric_qualifier / time_frame / temporal_context
├── disease_confidence / location_confidence / relation_confidence
├── needs_review
├── relations / metrics / provenance
├── validation_flags
└── confidence
```

Namun `AnalyzeResponse` masih mengeluarkan legacy top-level fields sekaligus `sub_events`. Keduanya tidak selalu identik.

Status canonical event: **PARTIAL**.

## 9. INTELLIGENCE MATURITY

| Area | Status |
|---|---|
| Pipeline orchestration | READY |
| Basic disease extraction | PARTIAL |
| Disease normalization | PARTIAL |
| ICD-11 mapping | PARTIAL |
| Basic location extraction | PARTIAL |
| Location hierarchy | PARTIAL |
| Basic cases/deaths extraction | PARTIAL |
| General metric extraction | WEAK |
| Disease-metric relation | WEAK |
| Disease-location relation | PARTIAL |
| Metric-location relation | PARTIAL |
| Metric-time relation | PARTIAL |
| Temporal context | PARTIAL |
| Epistemic context | PARTIAL |
| Evidence capture | PARTIAL |
| Single event | PARTIAL |
| Multiple event | PARTIAL |
| Parent/child breakdown | PARTIAL |
| Same underlying event linking | MISSING |
| Atomic event contract | PARTIAL |
| Persistence consistency | WEAK |
| Model-based classification | PARTIAL |
| LLM reasoning | PARTIAL, optional |
| Runtime regression coverage | PARTIAL |

Runtime audit menggunakan `NLP_MODEL=none`, sehingga sebagian besar hasil berasal dari deterministic rules, regex, gazetteer, dan heuristic. Optional LLM/agent tersedia tetapi tidak stabil karena request external mengalami HTTP 429.

## 10. BIGGEST LIMITATIONS

1. `MetricRelation` tidak menyimpan disease, sehingga angka mudah berpindah antar disease.
2. Metric-location relation dapat tertukar pada kalimat multi-country.
3. Top-level output dan `sub_events` dapat berisi nilai berbeda.
4. Numeric grammar belum lengkap untuk angka tulisan, range, qualifier, dan metric non-case.
5. Historical, current, cumulative, dan new metric belum selalu menjadi event terpisah.
6. Negative surveillance belum selalu membawa evidence yang memadai.
7. “First”, “second”, dan sequence kasus belum dimodelkan sebagai atribut event.
8. Parent/child location dan aggregate/breakdown belum memiliki semantics kuat.
9. Python worker dan Rust tidak menyimpan seluruh atomic event contract secara seragam.
10. Belum ada linking untuk dua artikel yang melaporkan underlying event yang sama.

## 11. CONTOH RUNTIME — 35 OUTPUT

Probe dijalankan terhadap source aktif di container NLP. Hasil berasal dari extraction/intelligence runtime.

| # | Input ringkas | Output aktual | Penilaian | Penyebab |
|---:|---|---|---|---|
| 1 | Dengue, 12 cases, Jakarta | Dengue-Jakarta-12 | BENAR | Pola sederhana bekerja |
| 2 | Bandung, 30 cases, 2 deaths | Bandung-30 cases-2 deaths | BENAR | Regex relation dasar |
| 3 | Jakarta 10 dengue + 4 malaria | Satu `UNKNOWN`, 10 cases | SALAH | Metric tidak memiliki disease field |
| 4 | Jakarta 10, Bandung 5 | Tidak ada event | SALAH | Grammar multi-location tidak cocok |
| 5 | Thailand 20, Cambodia 5 | Thailand mendapat 5, Cambodia 20 | SALAH | Nearest/upsert relation tertukar |
| 6 | Indonesia 100 sejak Januari | 100, period 2026 | PARTIAL | Period ada, event time tidak konsisten |
| 7 | 10 new cases this week | 10 cases, incident context | PARTIAL | Qualifier `new` tidak konsisten dipersist |
| 8 | Five suspected cases | Tidak ada metric | SALAH | Angka tulisan dan suspected tidak terhubung |
| 9 | Three confirmed cases | Tidak ada metric | SALAH | Angka tulisan tidak diparse |
| 10 | No Nipah cases in Brunei | Negative event 0 pada full pipeline | PARTIAL | Evidence negative kosong |
| 11 | 8 patients hospitalized | Dianggap 8 cases | SALAH | Hospitalized dipetakan ke case regex |
| 12 | 20 patients recovered | Tidak ada recovered metric | SALAH | Generic metric belum terhubung |
| 13 | 500 vaccinated against measles | Tidak ada event | SALAH | Vaccinated belum masuk atomic event |
| 14 | 300 dengue tests | Tidak ada event | SALAH | Tests belum masuk relation |
| 15 | Positivity rate 12 percent | Tidak ada event | SALAH | Percentage tidak dipersist |
| 16 | Fatality rate 2 percent | Tidak ada event | SALAH | Rate tidak dipersist |
| 17 | More than 20 cases | 20 cases tanpa qualifier | PARTIAL | `more_than` hilang |
| 18 | Between 10 and 20 cases | Nilai menjadi 20 | SALAH | Range dikonversi menjadi single value |
| 19 | 12-year-old tested positive | Tidak dihitung sebagai case | PARTIAL | Age guard benar, positive case hilang |
| 20 | First human H5N1 case | Low-level menjadi 5 cases | SALAH | Digit `5` dari H5N1 terbaca sebagai count |
| 21 | Sumatera Utara 40 cases | Province Indonesia-40 | BENAR | Alias/hierarchy lokal bekerja |
| 22 | Depok 12, West Java | Event Depok, relation Jawa Barat | PARTIAL | Location projection tidak konsisten |
| 23 | Cases rose after West/Central Java | Tidak ada event | BENAR/PARTIAL | Tidak mengarang angka, comparison hilang |
| 24 | Indonesia 100, including Jakarta 40/Bandung 20 | Hanya Indonesia 100 | SALAH | Breakdown grammar tidak diproses |
| 25 | 2024:100, 2026:5 | Satu event 2024; relation mengenali dua periode | SALAH | Event split dan projection berbeda |
| 26 | Dengue prevention discussion | Tidak ada case event | BENAR | Context filter bekerja |
| 27 | Vaccination campaign | Tidak ada disease event | BENAR/PARTIAL | Tidak salah membuat outbreak, intervention belum dimodelkan |
| 28 | First H5N1 case Cambodia 2026 | Sub-event 1 confirmed | PARTIAL | First/year belum dimodelkan penuh |
| 29 | Second H5N1 case Cambodia 2026 | Sama seperti first | SALAH | Sequence event hilang |
| 30 | WHO first H5N1 case Cambodia | Low-level membaca 5 cases | SALAH | Digit H5N1 salah diparse |
| 31 | Riau respiratory cases + hotspots | 11.370 respiratory/UNKNOWN; hotspots diabaikan | PARTIAL | Metric benar, disease mapping lemah |
| 32 | 20 cases with no deaths | Cases 20, death 0 | PARTIAL | Event 0, relation death null |
| 33 | 36 H5 infections since 2023 | Cumulative 36 | PARTIAL | Period ada, signal/alert semantics membingungkan |
| 34 | 15 kasus demam berdarah di Jakarta | Dengue-Jakarta-15 | BENAR | Indonesian alias bekerja |
| 35 | Ten dengue cases, no location | Tidak ada event | BENAR/PARTIAL | Tidak mengarang lokasi, unresolved event tidak direpresentasikan |

### Full pipeline HTTP observations

Lima probe melalui `/nlp/analyze` menunjukkan:

- Riau article: top-level disease `UNKNOWN`, walaupun text mengandung ISPA/respiratory context.
- Negative Nipah: top-level dan child sama-sama zero-count, tetapi evidence child kosong.
- Thailand/Cambodia: nilai cases tertukar antar negara.
- First H5N1: top-level `case_count=0`, child `case_count=1`.
- Artikel 2024/2026: top-level mempertahankan 2024/100, sementara relation layer mengenali 2026/5.

## 12. NEXT INTELLIGENCE NEED

### Sudah cukup

- Pipeline orchestration dasar
- Basic disease/location extraction
- Basic cases/deaths
- Local ICD concept lookup
- Basic temporal dan epistemic flags
- Evidence sentence capture
- Basic atomic event schema
- Parent/child persistence foundation

### Harus diperkuat

Prioritas terbesar adalah relation dan contract consistency, bukan menambah keyword:

- Metric perlu membawa disease, location, time, qualifier, type, evidence, dan confidence.
- Metric harus terhubung ke sentence/clause context.
- Top-level dan `SubEvent` harus berasal dari semantic result yang sama.
- Historical/current/cumulative/new perlu dipisahkan pada event level.
- Breakdown dan aggregate perlu mempertahankan relasi parent-child.
- Negative/suspected/confirmed perlu membawa evidence.
- Sequence seperti first/second perlu disimpan.
- Worker dan Rust perlu mempersist canonical event secara seragam.
- Same underlying event antar sumber belum tersedia.

### Apakah perlu LLM reasoning layer?

Belum terbukti perlu menjadi core engine.

Masalah utama saat ini berasal dari relation schema yang sempit, regex coverage yang tidak lengkap, nearest-entity heuristic, projection yang berbeda, dan persistence contract yang tidak seragam. LLM sudah tersedia sebagai optional fallback, tetapi tidak selalu dipanggil, mengalami rate limit, dan belum menjadi semantic authority.

Arsitektur yang ada masih cukup untuk tahap berikutnya tanpa model baru, selama relation dan atomic-event contract diperkuat terlebih dahulu.

## KESIMPULAN

Current system bukan lagi sekadar entity extraction; sudah memiliki fondasi event intelligence. Namun secara nyata masih berada pada tahap:

```text
basic extraction
+ partial relation attribution
+ partial event construction
+ inconsistent persistence projection
```

Status keseluruhan: **PARTIAL**.

Validasi runtime:

- 145 unittest berhasil dijalankan.
- Optional LLM/translation call mendapat HTTP 429.
- `pytest` tidak tersedia di container.
- Belum ditemukan regression suite real-article end-to-end yang cukup kuat.
