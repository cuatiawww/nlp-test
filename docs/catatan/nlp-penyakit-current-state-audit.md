# NLP-PENYAKIT CURRENT STATE AUDIT

Audit read-only terhadap current state NLP-PENYAKIT. Audit ini mengikuti call chain aktual dari source code, schema, test, dan runtime lokal. Tidak ada source code, schema, atau konfigurasi aplikasi yang diubah untuk audit ini. File ini dibuat atas permintaan pengguna sebagai salinan laporan audit dalam format Markdown.

Worktree saat audit memiliki perubahan lokal yang sudah ada sebelumnya pada frontend dan NLP, serta dua file untracked terkait native-script aliases. Karena itu, hasil runtime merefleksikan worktree lokal, bukan jaminan bahwa seluruh hasil sudah sama dengan deployment terakhir.

## A. Architecture

Alur aktual yang ditemukan:

```text
Scheduled/manual URL
  -> services/collector-python/app/main.py
  -> article extraction + identity metadata
  -> RabbitMQ disease.raw / disease.social
  -> services/worker-python/app/worker.py
  -> services/nlp-python/app/main.py
  -> PostgreSQL raw_reports / disease_events / relation tables
  -> services/backend-rust/src/main.rs
  -> frontend dashboard
```

URL analysis memiliki dua jalur:

1. Frontend memanggil Rust `/api/v1/analyze-url`. Rust membuat job; collector mengambil dan mengekstrak artikel; job dikirim ke `disease.analysis-url`; analysis worker menjalankan pipeline lalu menyimpan hasil.
2. Jalur sinkron Rust memanggil collector `/extract-url`, kemudian NLP `/nlp/analyze/url`, lalu menyimpan hasil pada sisi Rust. Jalur ini tidak identik dengan persistence path worker.

Crawl matrix berjalan dari frontend/API crawl-job, masuk ke `disease.crawl-matrix`, lalu diproses matrix worker dan disimpan ke `crawl_matrix_rows`.

Topology lokal yang diverifikasi berisi queue utama, retry, dan DLQ untuk `disease.raw`, `disease.social`, `disease.analysis-url`, dan `disease.crawl-matrix`. Queue tersebut durable dan memiliki consumer aktif pada worker terkait.

## B. Component Map

| Component | File | Main Function/Class | Input | Output |
|---|---|---|---|---|
| URL page | `services/frontend-next/app/analyze/page.tsx` | `handleSubmit()` | URL pengguna | request API |
| Frontend API client | `services/frontend-next/lib/api.ts` | `analyzeUrl()` | URL/options | response/job ID |
| Rust URL API | `services/backend-rust/src/main.rs` | `analyze_url()` | request URL | job atau hasil analisis |
| Collector API | `services/collector-python/app/main.py` | `extract_url()` | URL | extracted article |
| Web extraction | `services/collector-python/app/collectors/web_scraper.py` | `_extract_main_content()` | HTTP document | title, body, metadata |
| Article metadata | `services/collector-python/app/crawler_identity.py` | `extract_document_metadata()` | URL/article | canonical/final/source metadata |
| Document identity | `services/collector-python/app/crawler_identity.py` | `normalize_url()`, `url_hash()`, `content_fingerprint()` | URL/content | normalized identity hashes |
| Rabbit publisher | `services/collector-python/app/rabbitmq.py` | `publish()` | job payload | RabbitMQ message |
| Raw worker | `services/worker-python/app/worker.py` | `callback()` | raw message | NLP result/persistence |
| URL analysis worker | `services/worker-python/app/analysis_jobs.py` | `process_job()` | analysis job | extracted/NLP result |
| Matrix worker | `services/worker-python/app/crawl_matrix_jobs.py` | matrix job handlers | matrix job | matrix rows/events |
| NLP API | `services/nlp-python/app/main.py` | `/nlp/analyze`, `/nlp/analyze/raw` | article text | `AnalyzeResponse` |
| Surveillance NLP | `services/nlp-python/app/main.py` | `/nlp/analyze/surveillance` | article text | structured surveillance result |
| NLP pipeline | `services/nlp-python/app/pipeline.py` | `run()` | article/document | normalized analysis object |
| Metric relations | `services/nlp-python/app/surveillance_extraction.py` | `extract_metric_relations()` | text + entities | metric/location relations |
| Multi-event | `services/nlp-python/app/multi_event_extractor.py` | `compose_structured_events()` | article/result | `SubEvent[]` |
| Event persistence | `services/worker-python/app/analysis_jobs.py` | `save_completed()` | analysis result | PostgreSQL event rows |
| Child facts persistence | `services/worker-python/app/multi_event_persist.py` | `persist_child_facts()` | subevents | child event/fact rows |
| Rust persistence | `services/backend-rust/src/main.rs` | sync analysis persistence path | NLP result | PostgreSQL |
| Dashboard API | `services/backend-rust/src/main.rs` | `list_events()`, `dashboard_stats()` | database | API response |

## C. NLP Pipeline

| Capability | File/function | Method | Scope | Actually used |
|---|---|---|---|---|
| Text normalization | `services/nlp-python/app/extractors.py`: `repair_mojibake()`, `normalize_text()` | rule-based | document | yes |
| Language detection | `extractors.py`: `detect_language()` | script/heuristic | document | yes |
| Translation | `services/nlp-python/app/translator.py`: `translate_and_extract()` | local NLLB plus optional LLM | document, conditional | yes when enabled |
| Disease aliases | `extractors.py`: `extract_alias_diseases()`, `extract_diseases()` | gazetteer/rule | title, lede, document | yes |
| Disease classification | `services/nlp-python/app/models/classifier.py`: `classify_disease()` | transformer zero-shot | document, conditional | conditional |
| Disease ontology | `extractors.py`: `canonical_disease_name()`; `icd11.py` | WHO/ICD mapping | mention/document | yes |
| LLM disease detection | `deepseek.detect_disease()` | LLM | document, conditional | optional |
| Location extraction | `extractors.py`: `extract_location()`, `extract_all_locations()` | rules/gazetteer | document/sentence | yes |
| Location hierarchy | `surveillance_extraction.py`: `resolve_location_hierarchy()` | aliases/gazetteer | location mention | yes for recognized places |
| Country hint | `extractors.py`: `extract_country_hint()` | regex/scoring | document | yes |
| Admin/province split | `extractors.py`: `split_admin_place()` | rules/gazetteer | location string | limited |
| Numeric extraction | `extractors.py`: `_extract_count()`, `extract_case_count()` | regex/scoring | mostly document/sentence | yes |
| Metric relations | `surveillance_extraction.py`: `extract_metric_relations()` | regex + proximity, optional LLM | sentence/clause-ish | yes in surveillance path |
| Date/period | `extract_event_period()` and date helpers | regex/calendar | document/sentence | yes |
| Epistemic status | `classify_epistemic_status()` | regex/context rules | document/evidence | yes |
| Validation | `validate_surveillance_facts()` | rule-based consistency checks | structured result | yes in surveillance path |
| Context filters | epidemiology/extractor helpers | rules | document | partial |
| Sentiment/relevance | transformer helpers | ML, conditional | document | conditional |
| LLM location | `deepseek.detect_location()` | LLM | document | optional |
| Persistence preparation | Pydantic response models | schema projection | document/event | yes |

The implementation is hybrid, but not a unified semantic graph. It combines legacy extraction, strict surveillance extraction, and multi-event extraction. In the Docker rules-only configuration, optional ML/LLM components are not guaranteed to run. An LLM call in the local audit received HTTP 429, while the deterministic suite completed.

There is a response projection gap: `pipeline.py` constructs `AnalyzeResponse` without consistently forwarding fields that exist in the schema, including `source_country`, `surveillance_scope`, `translated`, `translation_provider`, `translated_text`, and `original_location_name`.

Not found in the active pipeline: general dependency parsing, general semantic similarity, a formal disease hierarchy graph, or a complete structured model for patient, exposure, intervention, vaccine, test, rate, and ratio facts.

## D. Data Model

| Database/model | NLP object | Event/API relationship |
|---|---|---|
| `raw_reports` | article, identity, raw document | document parent and source record |
| `disease_events` | `AnalyzeResponse`/primary or child result | event/API item |
| `disease_event_locations` | `LocationItem` | event-to-location relation |
| `disease_event_diseases` | `DiseaseMention` | event-to-disease relation |
| `disease_mentions` | disease JSONB/mention data | document/event mention storage |
| `locations` | normalized location/gazetteer object | hierarchy and geometry |
| `location_aliases` | alias/native-script names | lookup support |
| `disease_concepts` | canonical disease/ICD concept | ontology lookup |
| `disease_discovery_candidates` | discovered candidate disease | candidate/learning path |
| `analysis_jobs` | URL analysis job state | durable job record |
| `crawl_matrix_jobs` | matrix job state | matrix execution state |
| `crawl_matrix_rows` | matrix article/result row | matrix output |
| `raw_report_outbox` | pending raw processing publication | durable message handoff |
| `crawler_nlp_cache` | cached analysis result | URL/content cache |

`AnalyzeResponse` contains language, normalized text, publication/event dates, location/country/admin fields, disease and mentions, counts, evidence/review state, confidence/relevance/source data, sub-events, and period fields. `SubEvent` contains disease/location/counts/metric/evidence offsets/date, epistemic, validation, and confidence data.

There is no separate stable cross-source underlying-event identity in the current model. Document identity and event identity are different concepts, but cross-document event linking is not implemented as a durable relation.

## E. Event Engine

`multi_event_extractor.py::compose_structured_events()` identifies candidate event blocks using location and metric patterns, optional LLM assistance, then enriches hierarchy, dates, epistemic status, validation flags, and confidence. It de-duplicates candidates primarily by `(disease, location_name)`.

`multi_event_persist.py::persist_child_facts()` inserts child facts and uses `parent_event_id`; in some flows parent counts are cleared when child facts exist.

Answers to the concrete event questions:

- **A. Can one article produce N events?** Yes, when the multi-event path finds at least two valid structured events.
- **B. Is each event fully atomic?** No. Disease, location, and some metrics are atomic enough for common cases, but patient, exposure, intervention, independent stable IDs, and per-field provenance are not complete.
- **C. Same persistence path?** No. URL analysis uses child-fact persistence; the raw worker has an inline persistence path; Rust synchronous analysis has another projection. Tables overlap, but field completeness and parent/child semantics differ.
- **D. Disease-to-event relation?** Primary disease is on the primary result and relation table; child events use the subevent disease. Non-primary diseases are only represented when explicit extraction produces them.
- **E. Location-to-event relation?** Location name/geometry and relation rows are used; child events may have their own location. Raw and Rust paths may inherit document-level values.
- **F. Numeric-to-event relation?** Parent counts are document/result values; child counts use subevent values when explicitly attributed. This is not complete for every metric.
- **G. Date-to-event relation?** Parent dates and some child dates exist, but child date persistence and event-period semantics are not uniform.

Single-event and multi-event handling therefore share conceptual tables but do not have one fully uniform persistence contract. Event IDs are database IDs; there is no cross-source stable event key that would connect independent reports of the same outbreak event.

## F. Numeric Attribution

The legacy path uses `_extract_count()`, `extract_case_count()`, `extract_death_count()`, and `has_explicit_case_count()`. These are regex/scoring based and reject common false-positive forms such as years, ages, dates, percentages, and vaccine doses. Approximate numbers may be reduced to a representative value.

The stricter path in `surveillance_extraction.py` uses `_metric_context()`, `_nearest_location()`, `extract_metric_relations()`, and `MetricRelation`. It recognizes cases, deaths, confirmed/suspected cases, hospitalization, cumulative/new/active metrics, and some period context. It links metrics to the nearest recognized location using text proximity and patterns.

The current relationship is therefore mostly:

```text
number -> metric label -> nearest location/event candidate
```

It is regex/proximity-based, with optional LLM help. It is not dependency parsing, general semantic similarity, or a complete clause-level semantic graph. Document-level fallback remains active when relation extraction cannot confidently attribute a metric.

Not first-class in the current model: vaccinated, tests, percentages, rates, ratios, explicit ranges, approximate qualifiers, and complete cumulative semantics. These can remain in text or generic evidence rather than becoming a normalized metric relation.

## G. Disease Intelligence

Disease extraction combines aliases, canonicalization, WHO/ICD mappings, and optional classification. Examples such as H5N1, avian influenza, and bird flu can map to a canonical avian-influenza concept.

The current model has disease mentions and primary/mentioned roles, but does not implement a complete parent/subtype graph. `Dengue`, `Dengue fever`, and `Severe dengue` may canonicalize or alias together in some paths, but the system does not reliably represent “same disease concept with subtype” versus “separate clinical event.”

Disease mention, reported disease, contextual disease, intervention target, historical disease, and disease with a surveillance metric are not consistently separated into distinct semantic roles. Co-mentioned diseases can remain document mentions without becoming separate atomic events.

## H. Location Intelligence

The implementation can recognize country, province/admin1, district/admin2, city, and generic locality/village forms when present in the configured aliases/gazetteer. It includes ASEAN aliases, local/native-script aliases, some transliteration support, ISO country values, coordinates, and hierarchy resolution.

Relevant files include `extractors.py`, `surveillance_extraction.py`, `config.py`, migrations `011`, `090`, and the local native-script seed migration `093` present in the worktree.

The actual runtime is more limited than the schema suggests:

- no explicit robust admin3 model was found;
- no runtime GeoNames integration was found;
- no general runtime OSM/PostGIS geocoding loop was found;
- location resolution depends strongly on known aliases/gazetteer entries;
- event location and publisher/source location are only partially separated;
- patient location is not a separate field.

The real-output audit showed location failures or omissions for some source articles, including missing/incorrect resolution around Bato, Koh Kong, Ebola-related output, and several ASEAN gold cases.

## I. Temporal Intelligence

The pipeline handles publication input, event dates, event periods, date ranges, epidemiological-week-like patterns, cumulative/new/active labels, and some historical wording. `extract_event_period()` and date helpers are used by surveillance extraction and event composition.

The current model does not consistently distinguish publication date, event date, confirmation date, reporting period, historical period, and cumulative-since-year at persistence level. There is no dedicated confirmation-date field in the audited event flow. Ordinal language such as “first,” “second,” and “fourth” is not represented as an event sequence.

Therefore, “36 human H5 infections since 2023” and “first human H5N1 case in 2026” are not guaranteed to become distinct temporal/event semantics. Same disease/location keys can also collapse distinct periods in the multi-event de-duplication path.

## J. Context Intelligence

The implementation has heuristics for confirmed, suspected, rumor, retracted, official, reported, zero/no cases, historical/cumulative text, vaccine/statistical context, and some negative-case detection. It also has outbreak/validation helpers.

It does not have complete structured objects for patient, exposure, intervention, risk factor, hypothetical statement, warning, or historical event. Current versus historical, suspected versus confirmed, and “no cases detected” versus an ordinary count are not all persisted as independent semantic dimensions.

Migrations `091_epistemic_status.sql` and `092_validation_layer.sql` add database support, but write paths do not populate them consistently. In the local database snapshot, `disease_events` had 19,091 rows with `confirmed` and zero rows with non-empty validation flags, which indicates schema support is ahead of effective persistence behavior.

## K. Source Intelligence

The system stores source URL, publisher/source name, publication information, source type, source country where available, credibility/source metadata, raw object paths, raw content, and document identity fields. Source categories include RSS/web/CSV/social/API paths.

Document identity includes URL, normalized URL, canonical/final URL, URL hash, content fingerprint, and duplicate linkage fields. This supports document deduplication and already-processed checks.

However, two documents reporting the same case are not currently linked through a durable “same underlying event” cluster. The system can recognize duplicate documents more readily than it can infer that two non-duplicate sources describe one event.

## L. Real Output Samples

The runtime pipeline was exercised in the running NLP container using deterministic/rules-only paths. The following summarizes actual outputs, not desired behavior:

| Sample | Current output | Works | Missing/wrong |
|---|---|---|---|
| Brunei: “No Nipah virus cases detected” | Nipah, Brunei, cases/deaths 0 | disease and country | no dedicated persisted negative status; evidence empty; review still needed |
| Cambodia: “first human H5N1 case” | avian influenza, Cambodia, cases 0 | disease, country, confirmed-like context | first ordinal not 1; province/context lost |
| Cambodia: “second human H5N1 case” | avian influenza, Cambodia, cases 1 | disease, country, count-like signal | ordinal and sequence not stored; province lost |
| Cambodia: “fourth human H5N1 case” | avian influenza, Cambodia, cases 0 | disease and country | fourth ordinal not modeled |
| CIDRAP Cambodia H5N1 with another location mention | avian influenza, Cambodia, cases 1 | main country selection and disease | patient/exposure are not structured; no same-underlying-event link |

Recent database samples also showed source-dependent output variation, including ReliefWeb Pakistan with unknown/no location, a Rappler fact-check resolving Bato, a Phnom Penh scam resolving Koh Kong, Reuters Ebola with missing location/classification, and a Mastodon ADHD item with unknown/no location.

The local database snapshot used for inspection contained approximately 18,777 `raw_reports`, 19,095 `disease_events`, 322 child events, 10,319 locations, 4,710 disease records, and 10 matrix rows. These counts demonstrate active persistence, not complete semantic correctness.

## M. Test Coverage

| Capability | Implemented | Tested | Real Article Tested | Known Failure |
|---|---:|---:|---:|---|
| NLP normalization/extraction | yes | yes | partial | edge-language and context gaps |
| Disease aliases/ICD | yes | yes | partial | parent/subtype can collapse |
| Location hierarchy | yes | yes | partial | missing/incorrect source locations |
| Multi-event extraction | yes | yes | partial | atomicity and persistence incomplete |
| Numeric extraction | yes | yes | partial | document-level fallback and metric gaps |
| Temporal extraction | yes | yes | partial | ordinal/confirmation/history gaps |
| Epistemic/validation | yes | yes | partial | persistence defaults are inconsistent |
| Worker persistence | yes | yes | limited | paths differ by worker/API |
| Rabbit reliability/topology | yes | yes | no live crash test | production crash windows not fully exercised |
| Frontend | yes | 57/59 | no browser run | 2 local display expectation failures |
| Database migrations | yes | 2/3 contract tests | no production run | one test still expected old migration-088 pattern |
| Gold/benchmark suite | yes | 16/20 | yes, fixture-driven | 4 ASEAN location cases failed |

Tests and validations actually run during the audit included 135 NLP application tests, 66 worker tests, 57 of 59 frontend tests, the direct gold runner with 16 of 20 passing, 2 of 3 database migration contract tests, Docker Compose health checks, RabbitMQ topology inspection, and `git diff --check`.

The frontend failures were in `multi-fact-display.test.mjs`: current local display includes disease labels, while the old assertions expected only `Indonesia(8278)` or equivalent. The four gold failures were `asean-004` through `asean-007`, where expected Philippines/Malaysia/Indonesia country attribution was missing although disease/count outputs passed.

Browser UI tests were not run because the Playwright Python package was unavailable in the environment. Live external article fetch evaluation was not run as a separate reproducible test.

## N. Benchmark Analysis

| Benchmark | Current capability | Current limitation |
|---|---|---|
| Brunei: no Nipah cases | disease, country, zero count | no durable negative-case object; patient/exposure/intervention/source relation absent |
| Cambodia: first human H5N1 | disease, country, some confirmed context | case count may be 0; province and ordinal are lost; patient/exposure are text only |
| Cambodia: second human H5N1 | disease, country, count-like result | sequence/ordinal and relation to first case are absent |
| CIDRAP same first case | document-level disease/location/count extraction | no same-underlying-event identity or cross-source cluster |
| Cambodia: fourth human H5N1 | disease and country | ordinal, event sequence, patient/exposure, and cross-source relation absent |

For all five cases, intervention and structured patient/exposure fields are not reliably produced. Temporal and historical context is partial, not a stable event chronology.

## O. Current vs Target

### Current

The system currently provides multi-source crawling, article extraction and metadata normalization, RabbitMQ worker processing, raw storage, URL/content document deduplication, multilingual disease aliases, ICD/WHO-style disease mapping, gazetteer-based location extraction, regex metric extraction, partial metric/location relations, partial multi-event decomposition, context heuristics, PostgreSQL persistence, Rust APIs, and a dashboard.

### Target

The desired surveillance intelligence engine still requires stable atomic event identity, explicit patient/exposure/intervention facts, per-metric evidence and provenance, event chronology and ordinal sequencing, historical/current separation, structured negative/suspected/confirmed semantics, robust admin3 and source-versus-event location modeling, cross-source same-event linking, one consistent persistence contract, and complete API/dashboard projection of the intelligence objects.

## P. Critical Findings

1. Context and epistemic semantics are not persisted consistently; the database defaults toward `confirmed` while validation flags remain empty.
2. Numeric attribution still falls back to document-level values when relation extraction is incomplete.
3. Multi-event persistence diverges between URL analysis, raw worker, and Rust synchronous paths.
4. Event atomicity is incomplete for patient, exposure, intervention, and per-field evidence.
5. Historical, cumulative, and ordinal context is only partially extracted and not consistently stored.
6. There is no durable same-underlying-event link across independent source documents.
7. Location extraction remains error-prone or missing on real articles and ASEAN benchmark cases.
8. The gold suite currently passes 16/20 in direct execution, while an older `FAILURES.md` state claimed 20/20; the two states are inconsistent.
9. Rust synchronous persistence/API projection can omit fields and subevent semantics available from NLP.
10. Two frontend tests do not match the current local display behavior, so regression status is not clean.

## Q. Dependency Order

The technical dependency order indicated by the current state is:

1. Establish a stable raw-document/source provenance contract.
2. Define one article-to-document persistence contract.
3. Normalize disease, location, metric, and temporal relations.
4. Define a complete atomic event representation.
5. Make worker and Rust persistence use the same event contract.
6. Persist temporal, epistemic, negative, and historical context explicitly.
7. Add cross-source underlying-event linking separately from document deduplication.
8. Align Rust API and dashboard projections with the complete intelligence model.
9. Expand real-article regression and production evaluation coverage.

This is a current-state dependency description, not an implementation plan.
