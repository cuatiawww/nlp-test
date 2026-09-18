# ASEAN Disease Surveillance Intelligence Engine Architecture & Roadmap
**Project:** `NLP-PENYAKIT`  
**Role:** Intelligence Architect  
**Audience:** Development Team & Autonomous Coding Agent (Codex)  
**Document Version:** 1.0.0 (Production Roadmap)

---

## Table of Contents
1. [Executive Summary & Architectural Vision](#executive-summary--architectural-vision)
2. [Current Intelligence Capability Assessment](#1-current-intelligence-capability-assessment)
3. [Intelligence Gaps Analysis](#2-intelligence-gaps-analysis)
4. [Analysis of the 40K Training Dataset](#3-analysis-of-the-40k-training-dataset)
5. [Model & AI Strategy (Hybrid Architecture)](#4-model--ai-strategy-hybrid-architecture)
6. [Target Surveillance Event Schema & Relational DDL](#5-target-surveillance-event-schema--relational-ddl)
7. [Implementation Roadmap & Phased Progression](#6-implementation-roadmap--phased-progression)
8. [Implementation Plan for Codex](#7-implementation-plan-for-codex)
9. [Risks & Anti-Patterns (Things We Should NOT Do)](#8-risks--anti-patterns-things-we-should-not-do)

---

## Executive Summary & Architectural Vision

The current `NLP-PENYAKIT` pipeline operates primarily as a **document-level classifier with rule-augmented entity extraction**. When an article mentions multiple locations, diseases, and figures (e.g., *"Indonesia reported 304 malaria cases, including 90 in West Java and 200 in Jakarta. Vietnam reported 402 cases."*), a document-level pipeline risks flattening the data into unstructured entity lists or assigning aggregated counts to arbitrary locations.

While recent additions introduced a two-layer multi-event decomposition (`multi_event_extractor.py`, `multi_event_persist.py`, and `parent_event_id` in PostgreSQL), the system still relies on hardcoded patterns, restricts events to `(cases, deaths)` integers, lacks spatial administrative hierarchies (`admin1` $\rightarrow$ `admin2` $\rightarrow$ `admin3`), collapses temporal windows onto the document publication date, and conflates historical baselines with active outbreaks.

The **Intelligence Engine** evolves `NLP-PENYAKIT` from:
$$\text{Crawler} \longrightarrow \text{Document Classification} \longrightarrow \text{Flat Entities}$$
to:
$$\text{Crawler} \longrightarrow \text{Document Ingest} \longrightarrow \text{Atomic Surveillance Events} \left[ \text{Disease} \times \text{Location} \times \text{Metric} \times \text{Temporal} \times \text{Epistemic Context} \times \text{Evidence} \right]$$

---

## 1. Current Intelligence Capability Assessment

Each capability is classified based on the actual codebase inspection (`services/nlp-python`, `services/worker-python`, `services/collector-python`, `database/init`, `services/backend-rust`):

| Capability / Domain | Status | Current Codebase Implementation | Technical Limitation / Gap |
| :--- | :--- | :--- | :--- |
| **Pipeline & Queue Architecture** | **EXISTS** | RabbitMQ (`disease.raw`, `disease.social`, `disease.skdr`), durable queues, prefetch=1 in `worker.py`. Advisory locks on URLs. | Single and multi-events are handled conditionally rather than through a single unified event model. |
| **Crawler & Document Identity** | **EXISTS** | `crawler_identity.py` with URL normalization, tracking param stripping, `content_hash`, `url_hash`, safe SSRF validation. | Metadata (author, publisher country) is extracted at document level, not linked to individual event claims. |
| **Disease Classification (Document)** | **EXISTS** | `pipeline.py` with `NLP_MODEL` options (`xlm-roberta`, `indobert`, `fine-tuned`, `none`), fallback to keywords in `nlp_keywords`. | Assigns one primary disease per document; secondary diseases are stored in JSONB mentions without guaranteed metric linkage. |
| **WHO ICD-11 Dynamic Discovery** | **EXISTS** | `icd11.py` with WHO OAuth API integration, `disease_concepts` (60 rows), `disease_aliases` (294 rows), local token cache. | Focuses on single concepts and exact aliases; does not resolve sub-clades (e.g., Mpox Clade Ib vs IIb) or co-infections. |
| **Multilingual Translation** | **EXISTS** | `translator.py` with NLLB-200 local and DeepSeek fallback, stored in `translation_cache` (hash-keyed). | Translation is applied to head text (first 7,000 chars); cross-lingual entity span alignment back to original text is heuristic. |
| **Multi-Event Decomposition** | **PARTIAL** | `multi_event_extractor.py` decomposes articles with $\ge 2$ location-count pairs; `persist_child_facts` inserts child rows in `disease_events`. | Decomposes only if $\ge 2$ pairs exist. If an article has 1 event, it returns `[]` and uses document-level fallback. Only handles cases & deaths. |
| **Location Extraction & Geocoding** | **PARTIAL** | Flat `locations` table (13,563 rows), regex matching in `extractors.py`, title/dateline scoring, Indonesian PostGIS polygons (`peta_provinsi2023`, `peta_kab2023`). | **No administrative hierarchy** (`admin1`/`admin2`/`admin3`); flat coordinates only. No ASEAN polygons outside Indonesia; homonyms cause false positives. |
| **Numeric Attribution** | **PARTIAL** | Adjacency regex in `epidemiology.py` (`extract_labeled_counts`), regex pair matching in `multi_event_extractor.py`, Vietnamese breakdown parser. | Limited to `cases` and `deaths`. No coverage for `hospitalizations`, `vaccinations`, `positivity_rate`, `incidence`, or `CFR` in child events. Fragile against complex syntax. |
| **Temporal Intelligence** | **PARTIAL** | `epidemiology.py` extracts `event_date`, `event_date_start`, `event_date_end`, and `count_period_type` (`incident` vs `cumulative`). | Temporal fields are attached at the document level. Child events inherit parent dates; historical comparisons are not stored in database relations. |
| **Source & Context Credibility** | **PARTIAL** | `source_reliability_score` in `surveillance_extraction.py` with domain mapping (`who.int`, `kemenkes.go.id`, etc.) and `source_type` weights. | Epistemic status (confirmed vs suspected vs rumor vs projection) is not attached to individual events. No speaker attribution ("Ministry stated..."). |
| **Location Disambiguation & Hierarchy** | **MISSING** | Flat table lookups with string folding. No parent-child relations (`province_id`, `country_iso`). | Ambiguous names (e.g., "Victoria", "San Fernando", "Banten") cannot be resolved using country/provincial context. |
| **Token-Level Relational Extraction** | **MISSING** | Pure regex matching followed by whole-prompt LLM fallback. | No token-level NER or dependency-graph parser linking `[Metric Number] -> [Metric Type] -> [Location Entity] -> [Disease Entity]`. |
| **Auditable Evidence Spans (Offsets)** | **MISSING** | Substring evidence is captured, but character offsets (`start_char`, `end_char`) are not tracked. | Cannot highlight exact sentences/spans on the frontend or verify provenance programmatically. |
| **40K Dataset for Relational Tasks** | **MISSING** | 22,223 rows in `nlp_training_examples` are formatted as sequence-level text-to-label pairs. | **Contains zero token-level or relation annotations.** It cannot train an NER or Relation Extraction model without re-annotation. |

---

## 2. Intelligence Gaps Analysis

### 2.1 Location Intelligence Gap
1. **Lack of Administrative Hierarchy:**  
   The `locations` table stores `(id, name, latitude, longitude, country, is_active)`. When `multi_event_extractor` extracts "West Java" and "Jakarta", it has no knowledge that "West Java" is an `admin1` (Province) and "Jakarta" is a Special Capital Region (`admin1`/`city`), or that "Bandung" is inside "West Java".
2. **GeoNames Downsampling Loss:**  
   `scripts/bootstrap_asean_locations.py` discarded `admin1_code`, `admin2_code`, and feature codes (`PPLC`, `PPLA`, `ADM1`, `ADM2`) during download, reducing rich topological data into flat strings.
3. **Disambiguation Fragility:**  
   Matching relies on substring inclusion (`gf in folded or folded in gf`). Short location names easily collide with common prose in Indonesian, Vietnamese, Tagalog, and English.
4. **Publisher vs Event Location:**  
   While `extractors.py` penalizes datelines (e.g. *"KUALA LUMPUR, Aug 4 —"*), it does not systematically separate the *reporting location* from the *outbreak location*.

### 2.2 Disease Intelligence Gap
1. **Sub-Clade & Variant Blindness:**  
   Current disease concepts are coarse (e.g., "Mpox", "Avian Influenza"). Real-world surveillance demands distinguishing "Mpox Clade Ib" from "Mpox Clade IIb", or "H5N1" from "H5N6", as their public health severity differs fundamentally.
2. **Co-infections & Multi-Disease Conflation:**  
   When articles report syndromic co-occurrences (e.g., "Dengue and Chikungunya co-infection"), the current system either picks one as primary or generates disjoint events with identical metric totals.

### 2.3 Event & Numeric Attribution Gap
1. **The Single-Event vs Multi-Event Divide:**  
   The architecture maintains two code paths: single-event articles generate one `disease_events` row, while multi-event articles generate a parent row with `NULL` counts and $N$ child rows. This causes schema drift and requires complex handling in Rust (`backend-rust/src/main.rs`).
2. **Metric Scope Limitation:**  
   Only `case_count` and `death_count` exist as integer columns on `disease_events`. Epidemiological metrics like `suspected_cases`, `hospitalizations`, `icu_admissions`, `vaccinations`, `positivity_rate`, and `case_fatality_rate (CFR)` are either dropped or stored in unindexed JSONB.
3. **Syntactic Binding Failure:**  
   In sentences with complex syntax (e.g., *"Of the 500 suspected cases in Region X, 120 were confirmed in City A, while City B recorded 30 deaths"*), regex proximity binding links 30 deaths to Region X or 500 to City A.

### 2.4 Temporal & Epistemic Gap
1. **Temporal Conflation:**  
   If an article published in September 2026 states *"In 2025, Thailand recorded 12,000 cases"*, `published_at` (2026-09) is often used in downstream queries instead of the reporting window (2025). Although `epidemiology.py` parses date ranges, child events do not store individual date windows.
2. **Factuality / Epistemic Blindness:**  
   Rumors, official ministerial bulletins, unverified social media posts, and predictive model forecasts are all stored with the same `event_type`. The surveillance dashboard cannot filter by verification status.

---

## 3. Analysis of the 40K Training Dataset

The database currently holds **22,223 records in `nlp_training_examples`** (with historical exports and raw data totaling ~40,000 records).

### 3.1 What the Data Actually Represents
Schema inspection of `nlp_training_examples`:
```sql
(id UUID, raw_report_id UUID, text TEXT, disease_label TEXT, event_type TEXT, 
 relevance_score TEXT, is_health_related BOOLEAN, case_count INT, death_count INT, 
 confidence FLOAT8, split TEXT, source TEXT, language TEXT)
```
- **Granularity:** Document-level only.
- **Input:** Full raw article text ($300 - 5,000+$ characters).
- **Target Labels:** Single multiclass string per article:
  - `disease_label`: e.g., "dengue fever DBD", "malaria", "COVID-19 coronavirus".
  - `event_type`: e.g., "disease outbreak wabah", "flood banjir".
  - `relevance_score`: e.g., "health related medical disease outbreak".

### 3.2 Task Feasibility Matrix for the 40K Dataset

| NLP / Intelligence Task | Can 40K Dataset Support It? | Rationale & Codebase Evidence |
| :--- | :---: | :--- |
| **Document Classification** | **YES (100%)** | Already used by `scripts/train_classifier.py` for XLM-RoBERTa document-level classification. |
| **Health Relevance Filtering** | **YES (100%)** | `is_health_related` binary flag is well-populated across the records. |
| **Event Category Classification** | **YES (90%)** | `event_type` provides document-level classification. |
| **Token-level Named Entity Recognition (NER)** | **NO (0%)** | **Zero token spans or character offsets exist.** The data does not record where diseases, locations, or numbers occur in the text. |
| **Relation Extraction (Disease $\leftrightarrow$ Location $\leftrightarrow$ Metric)** | **NO (0%)** | No relational tuples, syntactic dependencies, or entity-linking targets are annotated. |
| **Structured Multi-Event Extraction** | **NO (0%)** | The dataset flattens all counts to a single document-level `case_count` and `death_count`. |
| **Disease Normalization / ICD-11 Mapping** | **PARTIAL (30%)** | Can act as an unaligned text corpus to evaluate coverage of canonical terms, but lacks span-level ICD-11 mapping. |
| **Numeric Attribution** | **NO (0%)** | No alignment exists between numbers in the text and the specific location/disease to which they belong. |

### 3.3 Data Engineering Strategy: How to Leverage the 40K Dataset
1. **Do NOT blindly re-train XLM-RoBERTa sequence classification.** Document classification is already a solved baseline in this repository. Retraining it will not extract multi-event relations.
2. **Distant Supervision / Weak Labeling Engine:**  
   Run the 40K raw text records through an automated weak-supervision pipeline (combining the local gazetteer, ICD-11 dictionary, and deterministic relational parser) to generate **candidate token spans and relation triples**.
3. **Silver Annotation via Bounded LLM:**  
   Sample 3,000–5,000 diverse multilingual articles from the 40K pool and use DeepSeek/GPT to generate silver-standard event triples:
   $$\{ \text{text}, \text{entities}: [\dots], \text{relations}: [\dots], \text{events}: [\dots] \}$$
4. **Token-Level Span / Relation Training:**  
   Use the resulting silver/gold dataset to fine-tune lightweight token models (e.g., GLiNER or multilingual token classifiers) specifically for ASEAN disease surveillance.

---

## 4. Model & AI Strategy (Hybrid Architecture)

To satisfy production latency ($< 3$ seconds per document), zero operational API runaway costs, high throughput for 1,500 continuous sources, and auditable public health outputs, the system must avoid relying entirely on LLMs:

```
                          Raw Cleaned Article Text
                                    │
                                    ▼
                 ┌──────────────────────────────────────┐
                 │  Language Detection & Script Check   │
                 │  (FastText / Language Markers)       │
                 └──────────────────┬───────────────────┘
                                    │
       ┌────────────────────────────┴────────────────────────────┐
       ▼ (Non-Latin: Thai, Lao, Khmer, Burmese)                  ▼ (Latin: ID, MS, EN, VI)
┌──────────────────────────────────────┐                         │
│ Translation Engine (NLLB-200 / Cache)│                         │
└──────────────────┬───────────────────┘                         │
                   └──────────────────────┬──────────────────────┘
                                          │
                                          ▼
                 ┌──────────────────────────────────────┐
                 │   XLM-RoBERTa Document Filter        │
                 │   (Health Relevance & Outbreak Gate) │
                 └──────────────────┬───────────────────┘
                                    │ (If Health-Related)
                                    ▼
     ┌──────────────────────────────────────────────────────────────┐
     │           Deterministic Intelligence Extraction Core          │
     │  ┌──────────────────────┐      ┌───────────────────────────┐ │
     │  │ Hierarchical Admin   │      │ Dynamic WHO ICD-11        │ │
     │  │ Gazetteer (PostGIS)  │      │ Concept Resolver          │ │
     │  └──────────┬───────────┘      └─────────────┬─────────────┘ │
     │             │                                │               │
     │             ▼                                ▼               │
     │  ┌─────────────────────────────────────────────────────────┐ │
     │  │ Syntactic Dependency & Breakdown Relational Parser      │ │
     │  │ - "Location (N cases)"      - "N cases in Location"     │ │
     │  │ - "Breakdown: N total, including N1 in D1 and N2 in D2" │ │
     │  │ - Metric Window Binding (Cases, Deaths, Hospitalized)   │ │
     │  └───────────────────────────┬─────────────────────────────┘ │
     └──────────────────────────────┼───────────────────────────────┘
                                    │
                      Ambiguity / Multi-Event Signal?
                                    │
                     ┌──────────────┴──────────────┐
     [Low Ambiguity / High Confidence]  [High Ambiguity / Complex Narrative]
                     │                             │
                     │                             ▼
                     │              ┌─────────────────────────────┐
                     │              │ Bounded LLM Structured Gate │
                     │              │ (DeepSeek / OpenAI JSON)    │
                     │              │ - Pydantic Schema Enforced  │
                     │              │ - Gazetteer Canonicalized   │
                     │              └──────────────┬──────────────┘
                     │                             │
                     └──────────────┬──────────────┘
                                    │
                                    ▼
                 ┌──────────────────────────────────────┐
                 │ Composite Event Resolution & Linking │
                 │ - Geocoding & Admin Hierarchy Link   │
                 │ - ICD-11 MMS Verification            │
                 │ - Temporal Window Normalization      │
                 │ - Epistemic Modality Tagging         │
                 └──────────────────┬───────────────────┘
                                    │
                                    ▼
                 ┌──────────────────────────────────────┐
                 │ Relational Event Persistence         │
                 │ - Parent Article Record              │
                 │ - 1..N Atomic Surveillance Events    │
                 └──────────────────────────────────────┘
```

### Assignment of Techniques by Component

| System Component | Recommended Technique | Latency | Cost | Deterministic / Auditable |
| :--- | :--- | :---: | :---: | :---: |
| **Relevance & Broad Disease** | Fine-tuned XLM-RoBERTa (Local ONNX/PyTorch) | $15\text{ms}$ | $0$ | High (Fixed weights) |
| **Location Extraction & Hierarchy** | Hierarchical Gazetteer + PostGIS spatial index | $5\text{ms}$ | $0$ | 100% Deterministic |
| **Disease Canonicalization** | WHO ICD-11 SQLite/DB index + OAuth Cache | $<2\text{ms}$ | $0$ | 100% Official Standard |
| **Numeric & Relation Extraction (Standard)** | Syntactic Dependency Patterns & Breakdown Automata | $5\text{ms}$ | $0$ | 100% Auditable with Offsets |
| **Complex Narrative & Breakdown Disambiguation** | Bounded LLM (DeepSeek-V3 / GPT-4o-mini JSON mode) | $800\text{ms}$ | Low | Gated: Only invoked when signals $\ge 2$ and regex confidence $< 0.8$ |
| **Epistemic Modality & Factuality** | Rule-based lexicon + dependency triggers | $2\text{ms}$ | $0$ | 100% Deterministic |

---

## 5. Target Surveillance Event Schema & Relational DDL

The target architecture replaces unstructured entity lists with an **Atomic Surveillance Event model**. Every article generates $1 \dots N$ structured events. Even a single-location article produces exactly one atomic event in this structure.

### 5.1 Target JSON Contract (`SurveillanceEventPayload`)

```json
{
  "document_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "source_url": "https://kemkes.go.id/id/rilis-kesehatan/surveilans-malaria-2026",
  "source_name": "Kemenkes RI",
  "source_type": "government",
  "source_country": "Indonesia",
  "source_reliability_score": 0.98,
  "published_at": "2026-09-18T00:00:00Z",
  "primary_language": "id",
  "nlp_pipeline_version": "2026.10.0-intel-engine",
  "events": [
    {
      "event_index": 0,
      "disease": {
        "surface_form": "malaria",
        "canonical_name": "Malaria",
        "icd11_code": "1F40",
        "category": "infectious",
        "confidence": 0.98
      },
      "location": {
        "raw_mention": "Indonesia",
        "country": "Indonesia",
        "country_iso3": "IDN",
        "admin1": null,
        "admin2": null,
        "admin3": null,
        "locality": null,
        "admin_level": 0,
        "geoname_id": 1643084,
        "latitude": -0.789275,
        "longitude": 113.921327,
        "confidence": 0.99,
        "resolution_method": "gazetteer_exact"
      },
      "metrics": [
        {
          "metric_type": "cases",
          "metric_status": "reported",
          "value": 304,
          "unit": "persons",
          "is_cumulative": true,
          "evidence_span": {
            "text": "Indonesia reported 304 malaria cases",
            "start_char": 0,
            "end_char": 36
          },
          "confidence": 0.95
        }
      ],
      "temporal": {
        "period_type": "cumulative",
        "event_date": "2026-09-17",
        "date_start": "2026-01-01",
        "date_end": "2026-09-17",
        "is_historical_comparison": false,
        "temporal_confidence": 0.90
      },
      "context": {
        "epistemic_status": "official_report",
        "verification_status": "confirmed",
        "speaker": "Kementerian Kesehatan",
        "outbreak_signal": true
      }
    },
    {
      "event_index": 1,
      "disease": {
        "surface_form": "malaria",
        "canonical_name": "Malaria",
        "icd11_code": "1F40",
        "category": "infectious",
        "confidence": 0.98
      },
      "location": {
        "raw_mention": "West Java",
        "country": "Indonesia",
        "country_iso3": "IDN",
        "admin1": "Jawa Barat",
        "admin2": null,
        "admin3": null,
        "locality": null,
        "admin_level": 1,
        "geoname_id": 1621177,
        "latitude": -6.88917,
        "longitude": 107.64047,
        "confidence": 0.95,
        "resolution_method": "gazetteer_hierarchy"
      },
      "metrics": [
        {
          "metric_type": "cases",
          "metric_status": "reported",
          "value": 90,
          "unit": "persons",
          "is_cumulative": true,
          "evidence_span": {
            "text": "including 90 cases in West Java",
            "start_char": 38,
            "end_char": 69
          },
          "confidence": 0.94
        }
      ],
      "temporal": {
        "period_type": "cumulative",
        "event_date": "2026-09-17",
        "date_start": "2026-01-01",
        "date_end": "2026-09-17",
        "is_historical_comparison": false,
        "temporal_confidence": 0.90
      },
      "context": {
        "epistemic_status": "official_report",
        "verification_status": "confirmed",
        "speaker": "Kementerian Kesehatan",
        "outbreak_signal": true
      }
    },
    {
      "event_index": 2,
      "disease": {
        "surface_form": "malaria",
        "canonical_name": "Malaria",
        "icd11_code": "1F40",
        "category": "infectious",
        "confidence": 0.98
      },
      "location": {
        "raw_mention": "Jakarta",
        "country": "Indonesia",
        "country_iso3": "IDN",
        "admin1": "DKI Jakarta",
        "admin2": "Jakarta",
        "admin3": null,
        "locality": null,
        "admin_level": 2,
        "geoname_id": 1642911,
        "latitude": -6.2088,
        "longitude": 106.8456,
        "confidence": 0.98,
        "resolution_method": "gazetteer_hierarchy"
      },
      "metrics": [
        {
          "metric_type": "cases",
          "metric_status": "reported",
          "value": 200,
          "unit": "persons",
          "is_cumulative": true,
          "evidence_span": {
            "text": "and 200 in Jakarta",
            "start_char": 70,
            "end_char": 88
          },
          "confidence": 0.95
        }
      ],
      "temporal": {
        "period_type": "cumulative",
        "event_date": "2026-09-17",
        "date_start": "2026-01-01",
        "date_end": "2026-09-17",
        "is_historical_comparison": false,
        "temporal_confidence": 0.90
      },
      "context": {
        "epistemic_status": "official_report",
        "verification_status": "confirmed",
        "speaker": "Kementerian Kesehatan",
        "outbreak_signal": true
      }
    },
    {
      "event_index": 3,
      "disease": {
        "surface_form": "malaria",
        "canonical_name": "Malaria",
        "icd11_code": "1F40",
        "category": "infectious",
        "confidence": 0.98
      },
      "location": {
        "raw_mention": "Vietnam",
        "country": "Vietnam",
        "country_iso3": "VNM",
        "admin1": null,
        "admin2": null,
        "admin3": null,
        "locality": null,
        "admin_level": 0,
        "geoname_id": 1562822,
        "latitude": 14.058324,
        "longitude": 108.277199,
        "confidence": 0.99,
        "resolution_method": "gazetteer_exact"
      },
      "metrics": [
        {
          "metric_type": "cases",
          "metric_status": "reported",
          "value": 402,
          "unit": "persons",
          "is_cumulative": false,
          "evidence_span": {
            "text": "Vietnam reported 402 cases.",
            "start_char": 90,
            "end_char": 117
          },
          "confidence": 0.95
        }
      ],
      "temporal": {
        "period_type": "incident",
        "event_date": "2026-09-17",
        "date_start": null,
        "date_end": null,
        "is_historical_comparison": false,
        "temporal_confidence": 0.85
      },
      "context": {
        "epistemic_status": "news_report",
        "verification_status": "reported",
        "speaker": "Media",
        "outbreak_signal": true
      }
    }
  ]
}
```

### 5.2 PostgreSQL Relational Target Architecture

To maintain backward compatibility with existing dashboard queries (such as `SUM(case_count)` in `backend-rust`), the database schema evolves additively:

```sql
-- Migration: 090_intelligence_engine_schema.sql

-- 1. Enhanced Locations Hierarchy Table
ALTER TABLE locations
    ADD COLUMN IF NOT EXISTS geoname_id BIGINT,
    ADD COLUMN IF NOT EXISTS country_iso3 VARCHAR(3),
    ADD COLUMN IF NOT EXISTS admin1_name TEXT,
    ADD COLUMN IF NOT EXISTS admin1_code TEXT,
    ADD COLUMN IF NOT EXISTS admin2_name TEXT,
    ADD COLUMN IF NOT EXISTS admin2_code TEXT,
    ADD COLUMN IF NOT EXISTS admin_level SMALLINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS parent_location_id UUID REFERENCES locations(id);

CREATE INDEX IF NOT EXISTS idx_locations_hierarchy 
    ON locations(country, admin1_name, admin2_name);

-- 2. Multilingual Location Aliases
CREATE TABLE IF NOT EXISTS location_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    alias_name TEXT NOT NULL,
    language VARCHAR(12) NOT NULL,
    is_preferred BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    UNIQUE(location_id, alias_name, language)
);
CREATE INDEX IF NOT EXISTS idx_location_aliases_lookup 
    ON location_aliases(LOWER(alias_name));

-- 3. Surveillance Event Metrics Table (Granular Metric Decomposition)
CREATE TABLE IF NOT EXISTS disease_event_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    disease_event_id UUID NOT NULL REFERENCES disease_events(id) ON DELETE CASCADE,
    metric_type VARCHAR(40) NOT NULL, -- 'cases', 'deaths', 'hospitalizations', 'suspected', 'vaccinations', 'icu'
    metric_status VARCHAR(30) NOT NULL DEFAULT 'confirmed', -- 'confirmed', 'suspected', 'estimated'
    metric_value BIGINT NOT NULL,
    unit VARCHAR(30) DEFAULT 'persons',
    evidence_text TEXT,
    start_char INT,
    end_char INT,
    confidence DOUBLE PRECISION DEFAULT 0.90,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_metrics_type ON disease_event_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_event_metrics_event ON disease_event_metrics(disease_event_id);

-- 4. Epistemic Context and Temporal Enhancement on disease_events
ALTER TABLE disease_events
    ADD COLUMN IF NOT EXISTS epistemic_status VARCHAR(30) DEFAULT 'official_report', -- 'official_report', 'news', 'rumor', 'academic'
    ADD COLUMN IF NOT EXISTS verification_status VARCHAR(30) DEFAULT 'reported',      -- 'confirmed', 'suspected', 'disputed'
    ADD COLUMN IF NOT EXISTS reporting_speaker TEXT,                                 -- 'Kemenkes RI', 'WHO', etc.
    ADD COLUMN IF NOT EXISTS is_historical_comparison BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS admin1_name TEXT,
    ADD COLUMN IF NOT EXISTS admin2_name TEXT,
    ADD COLUMN IF NOT EXISTS country_iso3 VARCHAR(3);
```

---

## 6. Implementation Roadmap & Phased Progression

Grounding the phases directly in the existing codebase:

```
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 1: Unified Multi-Event Foundation & Persistence Harmonization    │
│ (Refactor schemas.py, worker.py, and multi_event_persist.py)           │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│ Phase 2: Hierarchical ASEAN Location Intelligence Engine               │
│ (Upgrade locations schema, GeoNames ingestion, alias resolution)       │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│ Phase 3: Dynamic Disease Intelligence & WHO ICD-11 Refinement          │
│ (Variant/clade support, syndromic co-infection resolution)             │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│ Phase 4: Deterministic Syntactic Relation & Numeric Attribution Engine │
│ (Adjacency windows, multi-metric typing, breakdown parser)             │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│ Phase 5: Temporal Window & Epistemic Context Intelligence              │
│ (Historical baseline isolation, speaker attribution, factuality)       │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│ Phase 6: Bounded AI Hybrid Fallback & Calibrated Confidence            │
│ (DeepSeek/OpenAI structured extraction gate, offset auditing)          │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│ Phase 7: Backend-Rust & Surveillance Dashboard API Integration         │
│ (Drill-down queries, spatial rollup, export ledger, UI display)        │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Phase 1: Unified Multi-Event Foundation & Persistence Harmonization
- **Goal:** Unify event handling so that **every** article produces $1 \dots N$ structured atomic events. Eliminate the architectural bifurcation where single-event articles bypass the child decomposition model.
- **Existing Capability:** `multi_event_extractor.py` only activates when $\ge 2$ pairs exist. `worker.py` conditionally creates child rows.
- **Gap:** Inconsistent data modeling: single-event articles have all metrics on parent row; multi-event articles have `NULL` parent metrics and populated child rows.
- **Files/Modules Involved:**
  - `services/nlp-python/app/schemas.py`
  - `services/nlp-python/app/multi_event_extractor.py`
  - `services/nlp-python/app/pipeline.py`
  - `services/worker-python/app/worker.py`
  - `services/worker-python/app/multi_event_persist.py`
- **Architecture Change:** 
  - Change `compose_structured_events()` to always emit at least 1 canonical event tuple.
  - Update `multi_event_persist.py` so the persistence lifecycle consistently manages parent metadata (article level) and child events (atomic surveillance facts).
- **Data/Model Required:** Pure Python refactoring; no new models.
- **Output Schema:** Uniform `sub_events` array in `AnalyzeResponse` with $N \ge 1$.
- **Test Scenarios:**
  - Article with single location/disease: produces 1 event in `sub_events`.
  - Article with 4 location-disease pairs: produces 4 distinct events in `sub_events`.
- **Acceptance Criteria:** `len(response.sub_events) >= 1` for all valid health articles; parent rows maintain article-level metadata without corrupting aggregate counts.

---

### Phase 2: Hierarchical ASEAN Location Intelligence Engine
- **Goal:** Enable multi-level location resolution: `country -> admin1 (province) -> admin2 (city/district) -> admin3` with multilingual aliases and parent-child linking.
- **Existing Capability:** Flat `locations` table with 13,563 rows. PostGIS geometry point.
- **Gap:** No administrative hierarchy, no parent IDs, no ASEAN admin polygons outside Indonesia. Collisions with common prose terms.
- **Files/Modules Involved:**
  - `database/init/090_hierarchical_locations.sql` (new migration)
  - `scripts/bootstrap_asean_locations.py`
  - `services/nlp-python/app/extractors.py`
  - `services/nlp-python/app/config.py`
  - `services/worker-python/app/geo.py`
- **Architecture Change:**
  - Ingest GeoNames ASEAN dumps preserving `feature_code` (`PPLC`, `PPLA`, `ADM1`, `ADM2`), `admin1_code`, and `admin2_code`.
  - Build hierarchical gazetteer index in memory (`config.py`) that matches child locations within their enclosing country/province scope.
  - Separate dateline publisher locations from in-text event locations.
- **Data/Model Required:** Public GeoNames `allCountries.zip` or ASEAN-filtered dumps (`ID.zip`, `MY.zip`, `TH.zip`, `VN.zip`, `PH.zip`, `KH.zip`, `LA.zip`, `MM.zip`, `SG.zip`, `BN.zip`, `TL.zip`).
- **Output Schema:** Extended `LocationItem` with `admin1`, `admin2`, `country_iso3`, `admin_level`, `geoname_id`.
- **Test Scenarios:**
  - "Bogor, West Java, Indonesia" resolves `admin1="Jawa Barat"`, `admin2="Kabupaten/Kota Bogor"`, `country="Indonesia"`.
  - "Victoria, Tarlac, Philippines" resolves to Tarlac Province, Philippines, rather than Victoria, Australia.
- **Acceptance Criteria:** Zero hardcoded city lists; hierarchical resolution yields accurate `admin1` and `country` mappings across all 10 ASEAN nations + Timor-Leste.

---

### Phase 3: Dynamic Disease Intelligence & WHO ICD-11 Refinement
- **Goal:** Expand disease intelligence to support sub-clades/variants, multi-disease syndromic reports, and calibrated per-mention ICD-11 resolution.
- **Existing Capability:** `icd11.py` with OAuth token caching; `disease_concepts` and `disease_aliases`.
- **Gap:** Document-level primary disease classification overrides secondary mentions; variants (e.g. Clade Ib) are stripped to coarse categories.
- **Files/Modules Involved:**
  - `services/nlp-python/app/icd11.py`
  - `services/nlp-python/app/extractors.py`
  - `services/nlp-python/app/config.py`
  - `database/init/044_disease_event_diseases.sql`
- **Architecture Change:**
  - Enhance `canonicalize_who_disease_labels()` to preserve sub-clades and genetic lineages where present in WHO ICD-11 extensions.
  - Store multiple distinct diseases in the atomic event tuple when distinct metric numbers are attached.
- **Data/Model Required:** WHO ICD-11 MMS API (already configured in `.env`).
- **Output Schema:** `DiseaseMention` includes `icd11_code`, `sub_clade`, `is_co_infection`, and calibrated `confidence`.
- **Test Scenarios:**
  - "Mpox Clade Ib confirmed in Thailand" resolves to Mpox with specific clade metadata.
  - "Patient tested positive for both Dengue and Chikungunya" creates two distinct disease event associations with matched evidence.
- **Acceptance Criteria:** WHO ICD-11 verification remains mandatory; no AI-generated hallucinated ICD codes.

---

### Phase 4: Deterministic Syntactic Relation & Numeric Attribution Engine
- **Goal:** Bind numbers directly to their associated disease, location, and metric type (`cases`, `deaths`, `hospitalizations`, `suspected`, `vaccinations`, `positivity`).
- **Existing Capability:** Proximity regex in `multi_event_extractor.py` and `epidemiology.py`.
- **Gap:** Numbers extracted in isolation; no typed metrics beyond cases and deaths; syntactic clauses confuse attribution.
- **Files/Modules Involved:**
  - `services/nlp-python/app/epidemiology.py`
  - `services/nlp-python/app/multi_event_extractor.py`
  - `services/nlp-python/app/surveillance_extraction.py`
- **Architecture Change:**
  - Implement a token-distance and syntactic clause dependency parser (sentence splitting + clause boundary detection).
  - Extract multi-metric tuples: `(metric_type, count_value, location_target, disease_target, evidence_span)`.
  - Enhance breakdown parsing (e.g. *"Total 500 cases, consisting of 300 in X and 200 in Y"*).
- **Data/Model Required:** Deterministic dependency automata / regex windowing; optional spaCy multilingual sentencizer.
- **Output Schema:** `metrics: list[SurveillanceMetricItem]` on each event tuple.
- **Test Scenarios:**
  - *"Indonesia reported 304 malaria cases, including 90 in West Java and 200 in Jakarta. Vietnam reported 402 cases."*  
    $\rightarrow 304 \to \text{Indonesia}$, $90 \to \text{West Java}$, $200 \to \text{Jakarta}$, $402 \to \text{Vietnam}$.
  - *"15 patients were hospitalized out of 100 confirmed cases"*  
    $\rightarrow \text{cases}=100, \text{hospitalizations}=15$.
- **Acceptance Criteria:** Numbers are never extracted as free-floating scalars. Every metric must be attributed to an entity pair.

---

### Phase 5: Temporal Window & Epistemic Context Intelligence
- **Goal:** Disentangle publication timestamp from reporting periods, identify cumulative vs incident counts, isolate historical comparisons, and assign epistemic verification status.
- **Existing Capability:** `extract_event_period()` in `epidemiology.py`.
- **Gap:** Date attributes exist only at document level; child events inherit publication date; historical baselines contaminate active metrics.
- **Files/Modules Involved:**
  - `services/nlp-python/app/epidemiology.py`
  - `services/nlp-python/app/schemas.py`
  - `services/nlp-python/app/surveillance_extraction.py`
  - `services/worker-python/app/worker.py`
- **Architecture Change:**
  - Extract per-event temporal windows (`date_start`, `date_end`, `is_cumulative`).
  - Flag historical comparisons (e.g., *"Compared to 500 cases last year"*) with `is_historical_comparison = true` to exclude them from live outbreak aggregations.
  - Classify epistemic context: `official_report`, `news_claim`, `unverified_rumor`, `projection_model`.
- **Data/Model Required:** Regex date parser with multilingual ASEAN calendar support (Buddhist calendar $+543$ offset, Gregorian, Indonesian/Malay/Vietnamese months).
- **Output Schema:** `temporal: TemporalContext` and `context: EpistemicContext` inside each event.
- **Test Scenarios:**
  - "Last year Indonesia recorded 500 cases" published in 2026 $\rightarrow$ tagged as historical baseline; active 2026 count is 0.
  - "Cumulative cases from 1 Jan to 15 Sep 2026" $\rightarrow$ `is_cumulative=true`, `date_start="2026-01-01"`, `date_end="2026-09-15"`.
- **Acceptance Criteria:** Historical numbers never overwrite or sum into current surveillance period metrics.

---

### Phase 6: Bounded AI Hybrid Fallback & Calibrated Confidence
- **Goal:** Provide a fallback for complex, unstructured narrative texts while keeping latency, cost, and hallucination risk strictly bounded.
- **Existing Capability:** `_llm_extract_events()` in `multi_event_extractor.py` using DeepSeek/OpenAI.
- **Gap:** Prompt is unconstrained; output does not include character offsets; confidence scores are uncalibrated heuristics.
- **Files/Modules Involved:**
  - `services/nlp-python/app/llm_gate.py`
  - `services/nlp-python/app/agent.py`
  - `services/nlp-python/app/multi_event_extractor.py`
  - `services/nlp-python/app/bounded_analysis.py`
- **Architecture Change:**
  - Formalize the LLM Gate: The LLM is triggered **only** when deterministic parsing detects relational ambiguity (multiple metric mentions, unstructured prose, low regex confidence).
  - Enforce strict JSON output matching Pydantic `SurveillanceEventPayload`.
  - Post-validate all LLM-extracted locations and diseases against local PostGIS and WHO ICD-11 databases (no direct LLM insertions).
  - Compute calibrated confidence based on extraction method and evidence overlap.
- **Data/Model Required:** DeepSeek-V3 / OpenAI API via existing keys; Pydantic schema validation.
- **Output Schema:** Full event schema with exact `evidence_span` (`start_char`, `end_char`, `confidence`).
- **Test Scenarios:**
  - Complex journalistic paragraph with varied sentence structures properly decomposes into structured tuples.
  - LLM hallucinated place names (e.g., "Atlantis") are rejected during gazetteer validation.
- **Acceptance Criteria:** Over 85% of standard articles process purely deterministically without LLM calls; LLM fallbacks complete within budget timeouts.

---

### Phase 7: Backend-Rust & Surveillance Dashboard API Integration
- **Goal:** Expose granular multi-event surveillance intelligence via the Rust API and Next.js dashboard without breaking existing consumers.
- **Existing Capability:** `backend-rust/src/main.rs` serves `/api/v1/events`, `/api/v1/public-dashboard`, and `/api/v1/analyze-url`. Sibling facts are collapsed into semicolon displays.
- **Gap:** Dashboard aggregates only `case_count` and `death_count`. No API filtering by administrative level (`admin1`/`admin2`) or verification status.
- **Files/Modules Involved:**
  - `services/backend-rust/src/main.rs`
  - `services/backend-rust/src/crawl_history.rs`
  - `services/backend-rust/src/reports_cms.rs`
  - `services/frontend-next/components/ManualCrawlerPanel.tsx`
  - `services/frontend-next/app/nlp/events/page.tsx`
- **Architecture Change:**
  - Update Axum handlers to serve both collapsed view (for high-level tables) and atomic event list (for drill-down and map layers).
  - Add spatial aggregation endpoints grouped by `admin1` and `country_iso3`.
  - Provide filter by `verification_status` and `is_historical_comparison`.
- **Data/Model Required:** Rust `serde` DTOs and `tokio-postgres` query updates.
- **Output Schema:** Extended `/api/v1/events` JSON response containing `events` array and administrative hierarchy.
- **Test Scenarios:**
  - Public dashboard shows correct province-level breakdown on hover.
  - URL Analysis returns complete interactive event graph with clickable evidence spans.
- **Acceptance Criteria:** Backward compatible with existing Next.js frontend; zero regression in existing test suite.

---

## 7. Implementation Plan for Codex

A targeted guide for the coding agent (Codex) to implement these changes across the codebase:

### Step 1: Database Migration (`database/init/090_intelligence_engine_schema.sql`)
1. Extend `locations` with `geoname_id`, `country_iso3`, `admin1_name`, `admin1_code`, `admin2_name`, `admin2_code`, `admin_level`.
2. Create `location_aliases` table with foreign key to `locations(id)`.
3. Create `disease_event_metrics` table with `(disease_event_id, metric_type, metric_value, unit, evidence_text, start_char, end_char)`.
4. Add columns to `disease_events`: `epistemic_status`, `verification_status`, `reporting_speaker`, `is_historical_comparison`, `admin1_name`, `admin2_name`.

### Step 2: Location Ingestion (`scripts/bootstrap_asean_locations.py`)
1. Modify `bootstrap_asean_locations.py` to parse GeoNames fields:
   - Field 1: `geonameid`
   - Field 7: `feature_code` (`PPLC`, `PPLA`, `ADM1`, `ADM2`)
   - Field 8: `country_code`
   - Field 10: `admin1_code`
   - Field 11: `admin2_code`
2. Generate idempotent SQL that populates `admin1_name`, `admin2_name`, and `admin_level`.
3. Populate `location_aliases` with alternate names (`alternateNames` column).

### Step 3: NLP Schemas & Pipeline (`services/nlp-python/app/`)
1. In `schemas.py`:
   - Update `SubEvent` to include `admin1`, `admin2`, `country_iso3`, `metric_type`, `unit`, `event_date_start`, `event_date_end`, `epistemic_status`, `evidence_span`.
2. In `extractors.py`:
   - Refactor `extract_location()` and `extract_all_locations()` to query the hierarchical gazetteer loaded in `config.py`.
   - Implement `resolve_location_hierarchy(name, country_context)`.
3. In `epidemiology.py`:
   - Add syntactic window-based count extractor supporting `hospitalizations`, `suspected`, `vaccinations`.
   - Capture character start and end offsets for matched spans.
4. In `multi_event_extractor.py`:
   - Refactor `extract_multi_events()` to always return atomic events even for single-event documents.
   - Integrate breakdown regex parser with administrative hierarchy resolver.
   - Update `_llm_extract_events()` prompt to output the full `SurveillanceEventPayload`.

### Step 4: Worker Persistence (`services/worker-python/app/`)
1. In `multi_event_persist.py`:
   - Update `persist_child_facts()` to insert into both `disease_events` and `disease_event_metrics`.
   - Store administrative hierarchy (`admin1_name`, `admin2_name`) and epistemic status on child rows.
2. In `worker.py`:
   - Ensure the transaction locks and document identity checks in `callback()` pass the structured events to `multi_event_persist.py`.

### Step 5: Rust Backend DTOs (`services/backend-rust/src/`)
1. In `main.rs`:
   - Update `ArticleFact` and event serialization to include `admin1`, `admin2`, and detailed metrics.
   - Adjust aggregate queries to filter `WHERE is_historical_comparison IS FALSE`.
   - Expose hierarchical filters (`?country=Indonesia&admin1=West+Java`) on `/api/v1/events`.

---

## 8. Risks & Anti-Patterns (Things We Should NOT Do)

1. **DO NOT replace the entire extraction pipeline with an unconstrained LLM call.**  
   *Risk:* At 1,500 continuous sources and thousands of crawled pages per hour, calling an LLM for every document will breach rate limits, incur prohibitive API costs, cause HTTP 408 timeouts, and introduce stochastic non-deterministic outputs.  
   *Rule:* Use the LLM strictly as a bounded fallback when deterministic relational parsing signals ambiguity.

2. **DO NOT attempt to fine-tune XLM-RoBERTa on the 40K classification dataset for relation extraction.**  
   *Risk:* The existing 40K records only map full text to a single document label. They contain zero token-level slot annotations. Training a relation extractor on this data will fail completely.  
   *Rule:* Retain the 40K dataset for document-level relevance and broad topic routing; build silver relational datasets via weak supervision.

3. **DO NOT invent or allow AI agents to generate ICD-11 codes.**  
   *Risk:* LLMs frequently hallucinate plausible-looking medical codes.  
   *Rule:* Maintain the strict invariant established in `icd11.py`: every public disease label must resolve to an official code verified via the local concept table or the official WHO ICD-11 MMS API.

4. **DO NOT hardcode static ASEAN city lists in Python code.**  
   *Risk:* Unmaintainable, incomplete, and misses administrative hierarchy, spelling variants, and local diacritics (e.g. Vietnamese accents, Thai scripts).  
   *Rule:* Maintain the gazetteer within PostgreSQL / PostGIS, loaded on startup and refreshed dynamically from GeoNames dumps.

5. **DO NOT sum historical baseline numbers into active outbreak totals.**  
   *Risk:* Sentences like *"Compared to 10,000 cases in 2024, only 200 cases were detected this month"* will report 10,200 active cases, generating false-positive epidemic alerts.  
   *Rule:* Explicitly isolate `is_historical_comparison = true` and keep them separate from current incident counts.

6. **DO NOT destroy the existing document identity and advisory lock mechanisms.**  
   *Risk:* Multiple workers consuming the same URL feed will race, producing duplicate events and corrupted dashboard counts.  
   *Rule:* Preserve the URL normalization, content hashing, and transaction advisory locking in `worker.py` and `crawler_identity.py`.
