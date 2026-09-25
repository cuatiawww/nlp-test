# Audit 012 — DB re-analysis, multilingual review, and worker isolation

Date: 2026-09-25  
Environment: Docker production compose on the local/staging host  
Scope: five existing health-related events with confidence `<= 0.85`, prioritizing Vietnamese and Thai records.

## Result

The five selected records were reviewed through the shared `pipeline.run` path and the corrected values were persisted to `disease_events`.

| Event | Language/source | Before | After | Action |
|---|---|---|---|---|
| `2ac97c74-6636-42b9-925e-481e704f7b43` | Vietnamese RSS | Dengue, Dien Bien, 349 cases, 0 deaths, confidence 0.85 | Dengue, Hanoi/VNM, 349 cases, 0 deaths, confidence 0.85 | Removed wrong province; retained health update because no explicit outbreak |
| `7346ca9a-403b-43e1-9ded-55eb0e370a53` | Vietnamese RSS | UNKNOWN, Dien Bien, 6,900 cases, 1 death, confidence 0.85 | Dengue, Dong Thap/VNM, 6,900 cases, 1 death, confidence 0.90 | DeepSeek/local evidence agreed; outbreak retained |
| `ee2b4f3b-820c-4435-83a7-f620af51942e` | Thai RSS | UNKNOWN, no reliable location, 3,576 cases, 0 deaths, confidence 0.85 | Dengue, Da Nang/VNM, 3,576 cases, 0 deaths, confidence 0.90 | Thai alias resolved to the Vietnamese locality; outbreak retained |
| `f1f3a1a4-4bda-4ecf-aae0-85a41dd01320` | Vietnamese RSS | UNKNOWN, Hanoi, 7 cases, 0 deaths, confidence 0.85 | Dengue, Hanoi/VNM, 7 cases, 0 deaths, confidence 0.90 | Trip-context location conflict reviewed; kept Hanoi as the event location |
| `1d11f132-dfd3-4294-8baa-3920697899e5` | Vietnamese web | HFMD, Thắng, 100,000 cases, 0 deaths, confidence 0.85 | HFMD, Vietnam/VNM, 100,000 cases, 0 deaths, confidence 0.85 | Ignored an appended secondary article block; no explicit outbreak signal |

The current DB values were checked after the update. All five are `is_health_related=true`; the two explicit outbreak records have `outbreak_alert=true`. The two informational/statistical records and the cleaned HFMD article have `outbreak_alert=false` and remain available for review where appropriate.

## DeepSeek review and location persistence

DeepSeek is a bounded rear-gate reviewer, not the canonical disease dictionary. It is called only for health-related candidates that meet the review gate (unknown/low-confidence, unresolved location, conflicting metrics, or explicit outbreak validation). Its output is accepted only when the evidence guardrails pass.

When a verified DeepSeek event contains a source-grounded location that is not already in `locations`, `config.upsert_reviewed_location()` inserts it with the normalized country and ISO3 code, then inserts a non-preferred alias in `location_aliases` and refreshes the in-process location cache. Unverifiable or hallucinated locations are not inserted.

The location master now contains the relevant multilingual forms, including:

- `Dong Thap / Đồng Tháp` — Vietnam
- `Da Nang / Đà Nẵng / ดานัง` — Vietnam
- `Hanoi / Hà Nội / Ha Noi` — Vietnam

The same shared location and evidence rules are used by URL analysis, manual/continuous crawl, collector ingestion, re-analysis, and social-media worker ingestion.

DeepSeek quota exhaustion is fail-open: a daily budget of `0` skips the call immediately, while HTTP `401/402/403` and quota/billing `429` responses place the provider in a 24-hour cooldown. Transient errors use a short cooldown. In both cases the local rules/XLM result is returned and the article is not blocked by the external provider.

## Token usage

The Docker log window recorded three DeepSeek provider responses:

| Metric | Tokens |
|---|---:|
| Prompt | 6,038 |
| Completion | 674 |
| Total | 6,712 |

Repeated test calls served from the local response cache and therefore did not create additional provider usage records. No token estimate was invented for cache hits.

## Social-media validation

An unverified social-media claim (`500` dengue cases and `12` deaths) was classified as health-related but not as an outbreak: `outbreak_alert=false`, `needs_review=true`, and low source credibility. This prevents a social post from independently creating a confirmed outbreak event. Officially confirmed social-source records can still pass the outbreak gate.

## Docker and queue verification

The production override was corrected so `disease-worker-social` uses the disease stack RabbitMQ service instead of the unrelated `rabbitmq` hostname from the shared DB network. The following consumers are now active on the correct broker:

- `disease.raw` — regular worker
- `disease.social` — social worker
- `disease.analysis-url` — analysis job worker
- `disease.crawl-matrix` and `disease.translation` — their existing consumers

Both NLP replicas are healthy. The measured resource snapshot was low: each NLP replica used about 285 MiB RAM and 0.10% CPU; RabbitMQ used about 129 MiB RAM and 0.18% CPU; the worker processes used about 31 MiB RAM each.

Multi-event LLM fallback is disabled in production, and multi-event extraction is bounded by `MULTI_EVENT_STAGE_TIMEOUT_SECONDS=20`. NLP concurrency is limited to one inference per replica with two CPU threads, preventing queue saturation from turning into unbounded parallel inference. The final five-record run completed without a request timeout; observed per-record runtime was approximately 8–26 seconds.

## Verification performed

- Python compilation of the modified NLP and re-analysis modules: passed.
- `git diff --check`: passed.
- Focused NLP regression suite: `35 passed, 1 deselected`, including quota fail-open coverage.
- Backend Rust Docker build: passed without compiler errors. The unused `patch` import and two unnecessary `mut` bindings were removed; remaining warnings are pre-existing dead-code/unused-API-field warnings, not unused variables.
- RabbitMQ consumer and queue checks: passed after fixing the social worker broker URL.

This is a targeted correction of five existing records, not a claim that every historical event is now correct. A full re-analysis should be run in controlled batches after this version is deployed if the entire historical dataset must be repaired.
