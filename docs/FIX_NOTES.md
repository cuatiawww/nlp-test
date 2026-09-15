# Implementation notes — P0–P4 hardening

This branch replaces the docs-only audit (PR #9) with code fixes. Do not deploy from this PR without a staging pass.

## P0 Security

| Item | Status | Notes |
| --- | --- | --- |
| Open CORS | **Fixed** | `CorsLayer::permissive()` replaced with `CORS_ALLOWED_ORIGINS` allowlist (default `https://abvc-surveillance.org` + localhost:3010). |
| Unsalted SHA-256 passwords | **Fixed** | New hashes are Argon2id. Legacy SHA-256 rows still verify, then rehash on successful login. `password_hash VARCHAR(255)` is wide enough. |
| Unauthenticated `/users`, roles, admin CRUD | **Fixed** | Axum `auth_gate` middleware: public GET allowlist for dashboards/NLP config reads; `/users`, `/roles`, `cleanup-events`, console PUT/audit require admin; ingest requires `API_TOKEN` or admin; other mutations (including `analyze-url`) require a valid session. |
| analyze-url SSRF | **Fixed** | `validate_public_http_url` blocks non-http(s), credentials, localhost, private/link-local/metadata IPs, and `.internal` hosts before cache or collector fetch. |
| Secrets in client bundles | **Not found / deferred** | No `API_TOKEN` in Next.js client code. `NEXT_PUBLIC_*` values are public by design (base path). Console upload still proxies through Next to the collector; a Rust `/console/upload` admin route was **not** added in this PR to avoid a larger collector rewrite. |

Login is throttled (8 failures / 15 minutes per username).

## P1 Single source of truth for counts

Shared helpers in `main.rs`:

- `DASHBOARD_EVENT_PREDICATE` (health-related, classified, not UNKNOWN/NEGATIVE, confidence ≥ 0.15, `published_at` required, `source_type` not `test`/`skdr`/`skdr_api`)
- URL/raw-report dedupe
- Per-event caps: cases ≤ 2,000,000; deaths ≤ 200,000
- Country label `OUTSIDE ASEAN` (heatmap previously used `Other`)

`query_shared_kpis()` is the headline aggregation used by:

- `/api/v1/public-dashboard` → `data.kpis.*`
- `/api/v1/spatial-heatmap` → `data.summary.total_*` (ASEAN-11 grid remains in `countries[]`; `grid_*` is the 11-country sum)
- `/api/v1/disease-trend-overview` → `data.summary.total_cases_tracked` / `total_deaths` / `total_events`
- `/api/v1/morbidity-mortality` → `data.summary.total_morbidity` / `total_mortality`

`public-dashboard` no longer derives KPIs from the map `LIMIT` (now 250 clusters for the map only).

### Field semantics

- `kpis.cases` / `kpis.deaths` / `kpis.events` — uncapped row count of the shared event set (values themselves are per-event capped)
- `kpis.locations` **and** `kpis.active_locations` — `COUNT(DISTINCT location_name)` on that event set
- `kpis.location_master_count` — active rows in `locations` master data (do not mix with KPI locations)
- `kpis.active_alerts` — events with `outbreak_alert = TRUE` in the shared set
- `trends.*.current` — **current calendar month vs previous month**, not the same as full-period `kpis`

### How `/events` differs

`GET /api/v1/events` is a paginated raw table (optional `is_health_related` filter, default unfiltered). Its `total` is **not** a KPI. Disease-facing UI must use `public-dashboard` kpis, not `/events`.

## P2 Dummy / seed removal

- SitRep / bulletin seed arrays emptied; reports CMS localStorage no longer auto-seeds 7640-case documents
- `TEMPLATE_EVENT` (fake Jakarta copy) removed; regional detail loads `/public-dashboard`
- Homepage / filter-bar `endWeek` uses live ISO week (no cap at 36)
- AI summary is built from stored KPI aggregates (`provider: stored-nlp-aggregates`) or labelled `unavailable`
- Crawl stats omit `source_type = test`
- Executive report metrics/charts bind to dashboard API (no Jakarta/7640 placeholders)
- `/reports` surveillance table uses public-dashboard clusters only (no invented 0.88 confidence)

## P3 NLP engine health

- NLP startup already loads keywords, WHO concepts, outbreak rules, locations, credibility, language markers, extraction rules, and language models from DB (`nlp-python/app/main.py`)
- `DEFAULT_CASE_COUNT` default is **0**; billion multipliers are ignored; values above `MAX_EVENT_CASE_COUNT` become unknown/0
- Pipeline heuristics no longer treat `case_count == 1` as “defaulted”
- Shared dashboard predicate requires `is_health_related` (or SKDR)
- `GET /api/v1/pipeline-health` reports NLP `/health`, last event time, last collector run (no secrets), 24h run/failure counts

## P4 Performance

- Dashboard detail payload uses `LEFT(original_text, 400)` snippets, not full `JSONB_AGG(original_text)`
- Public dashboard JSON is cached in-process for 15 seconds per filter key

## Verify count parity (staging, same filters)

Use the same `start_year`, `start_week`, `end_year`, `end_week`, `country`, `disease`:

```
GET /nlp/api/v1/public-dashboard?...
GET /nlp/api/v1/spatial-heatmap?...
GET /nlp/api/v1/disease-trend-overview?...
GET /nlp/api/v1/morbidity-mortality?...
GET /nlp/api/v1/pipeline-health
```

Expect:

- `public-dashboard.data.kpis.cases` == `spatial-heatmap.data.summary.total_cases` == `disease-trend-overview.data.summary.total_cases_tracked` == `morbidity-mortality.data.summary.total_morbidity`
- same equality for deaths (`kpis.deaths` / `summary.total_deaths` / `summary.total_mortality`)
- same equality for events (`kpis.events` / `summary.total_events`)
- homepage and TV headline cards read `kpis.*`, not `trends.*.current`
- `GET /nlp/api/v1/users` without a bearer token returns 401
- `GET /nlp/api/v1/events` `total` may still differ (raw table vs health-filtered KPI set)

## Deferred

- Existing DB rows with already-stored ~2e9 case_count are capped at read time; they are not rewritten in this PR (a one-off SQL cleanup can follow after staging review).
- Authenticated Rust proxy for collector file upload.
- LLM-authored narrative with citation spans (summary is now explicitly an aggregate of stored NLP results, not a canned ASEAN paragraph).

## Round 2 — KPI snapshot, NLP quality, SKDR detach, continuous crawl

Live retest 2026-09-15 showed the four aggregate endpoints still disagreeing when called **without shared query params** (trend defaulted to last 7 days; heatmap/dashboard used calendar year; `country=all` included India/Pakistan). Map popup Cases vs Recent activity used different caps/windows. CIDRAP H5N1 Cambodia was stored as Indonesia province `"Were"`. Singapore measles bound a noise total instead of **43**.

### A. Materialized KPI snapshot

Table `kpi_snapshots` (`database/init/067_kpi_snapshots.sql`) stores one row per canonical filter:

`filter_key = start_date|end_date|country|disease|source`

Default **country/scope token is `asean11`**. Query aliases `country=ASEAN`, `country=all`, missing country, and `scope=asean11` all canonicalize to `asean11`. `country=global` / `scope=global` opts out.

**Canonical 11 jurisdictions** (storage labels; UI shows Lao PDR / Viet Nam):

Brunei, Cambodia, Indonesia, Laos (Lao PDR), Malaysia, Myanmar, Philippines, Singapore, Thailand, Viet Nam (Vietnam), **Timor-Leste**.

KPI/map/TV/reports totals on this default **count only events whose folded country is in that IN-list**. Gazetteer hits such as Utah/`United States`, India, DRC, Europe, Brazil are folded to `OUTSIDE ASEAN` and do **not** inflate cases/deaths/events/locations. A member with zero events is still padded into `by_country` (missing ≠ dropped from the 11).

The same fold (`asean11_fold_sql` / `resolved_country_expr`) is used by the KPI snapshot, public-dashboard map clusters, weekly trend, heatmap grid, disease-trend overview, and morbidity series. `country=all` is **not** an unfiltered global bypass; only `scope=global` / `country=global` opts out. Display aliases `Viet Nam` / `Lao PDR` fold to storage labels `Vietnam` / `Laos` before the IN-list, so they are not dropped.

Previously `country=ASEAN` meant `resolved_country <> 'OUTSIDE ASEAN'`, which let `locations.country = United States` through. That negation is gone.

**Refresh semantics**

1. Ingest / URL analysis marks existing rows `is_stale = TRUE`.
2. The next reader takes `pg_advisory_lock(hashtext(filter_key))`, recomputes `query_shared_kpis`, upserts, and clears stale.
3. Concurrent dashboard, heatmap, trend, morbidity, TV, and reports read **that same row** (`snapshot_id` + `computed_at`). They never invent totals.
4. Stale snapshots are still served for **90 seconds** after `computed_at` so a reload in the same session cannot drift. After that floor, the next reader refreshes under the lock; if the lock is busy, the previous row is returned.

`fetchPublicDashboard` (and heatmap/trend/morbidity/kpi-events) always sends `country=ASEAN` **and `scope=asean11`** plus week 1→current epi week unless the caller overrides. TV and Reports use that helper, so they cannot silently hit a different window than the homepage.

`GET /api/v1/kpi-events` pages the same `valid` event set as the snapshot. Reports ledger total is `snapshot.events`, not the 250 map clusters. Reports headlines bind `GET /api/v1/kpi-snapshot` (same default ASEAN week-1→current filter as dashboard/TV) and fall back to `public-dashboard` kpis only if that call fails. Reloads within 90s keep the same `snapshot_id`.

Map/TV markers drop `OUTSIDE ASEAN` / non-ASEAN-11 countries unless `country=global`. Filter control label: **ASEAN — all locations**. Banner: **Totals shown: ASEAN 11 jurisdictions**.

Default filter (missing query params, same as the homepage):

- scope = **`asean11`** (ASEAN + Timor-Leste, 11 jurisdictions); `global` opts into outside-ASEAN
- disease = all
- source = all (SKDR IBS/EBS ignored)
- dates = ISO week 1 of the current epi year through the current epi week

Public endpoints that expose the snapshot:

- `GET /api/v1/public-dashboard` → `data.kpis.snapshot_id`
- `GET /api/v1/spatial-heatmap` → `data.summary.snapshot_id`
- `GET /api/v1/disease-trend-overview` → `data.summary.snapshot_id`
- `GET /api/v1/morbidity-mortality` → `data.summary.snapshot_id`
- `GET /api/v1/kpi-snapshot` → same row, for reports/TV verification
- `/nlp/reports` headline totals bind `kpis.*`, not the 250 location clusters

Map popup `recent_cases` uses the same per-event cap as `cases` and a date (not timestamp) 7-day window. When every cluster event is in that window, `recent_cases = cases`.

### B. Invented counts

- Calendar years `19xx`/`20xx` are never case/death totals (`among 2026 cases` → not 2026 cases)
- Case regex prefers the sentence that names the disease (`43 cases of measles`)
- Extraction failure → `case_count=0`, `case_count_unknown=true`, `needs_review=true`
- `disease_events.case_count` default is NULL, not 1

### C. NLP / CIDRAP fixture

URL: `https://www.cidrap.umn.edu/avian-influenza-bird-flu/cambodia-confirms-human-h5n1-avian-flu-case-h5n1-hits-more-utah-egg-farms`

- Disease from title/lede: Avian influenza / H5N1 (not Measles)
- Country: Cambodia (Kampong Thom allowed). Utah/US is secondary and is stored/folded as `OUTSIDE ASEAN`, so it does **not** enter default `asean11` KPI totals.
- `"Were"` is a location stopword; never Indonesia province Were
- Multi-country headlines do not hard-filter the gazetteer to the language-default country

Tests: `services/nlp-python/tests/test_cidrap_cambodia.py`

### D. SKDR IBS & EBS detached

Sources search for SKDR/IBS/EBS returns no catalog rows (those feeds are not registered as `collector_sources`). Remaining processing hooks are also off:

- `POST /api/v1/ingest/skdr`, `GET /api/v1/skdr/ibs-summary`, `GET /api/v1/skdr/ebs-summary`, `GET /api/v1/skdr-reports` → **410**
- Dead `ingest_skdr` body removed; it only returns the same 410 payload
- Collector does not import, schedule, or publish `skdr_api` (RabbitMQ `disease.skdr` is not declared)
- Worker acks leftover `skdr_api` messages and never calls `/nlp/process/skdr`
- NLP `/nlp/process/skdr` → **410**
- Frontend `fetchIbsSummary` / `fetchEbsSummary` throw detached
- RSS/web/catalog sources are unchanged
- `skdr_reports` table is kept for a later reattach

### E. Continuous source crawl

Every **ACTIVE** (`enabled=true`) non-SKDR `rss`/`web`/`csv`/`social_media`/`api` source is worked:

- Empty schedules → due-source dispatcher (every 2 minutes, batch of 5, default `interval:60`)
- Explicit `interval:120` / `daily:` still get APScheduler jobs; the dispatcher is the backup if a tick is missed
- Stale `RUNNING` collector_runs older than 30 minutes are closed (`finalize_stale_runs`) so they cannot block the next due pick or fake a live crawl
- Failures back off 15m × 2^streak cap 6h
- `POST /collect/all` runs one dispatcher batch rather than every source at once

Sources page status is crawl state, not the Edit **ACTIVE** checkbox:

- **Running** only when `in_flight` (unfinished `RUNNING` started within 30 minutes)
- Otherwise Success / Failed / Never
- Null `last_run` JSON (never crawled) is **Never**, not Running
- Trigger All + per-source Trigger remain; there is no global cron UI (collector owns the interval)

### F. Manual crawler

analyze-url returns `evidence`, `province`, `case_count_unknown`, `needs_review`. Crawl matrix rejects non-geo province tokens and no longer defaults ASEAN-region articles to Indonesia. Start is disabled until at least one ICD-11 disease is selected. Article URL is optional (dedicated worker when provided). The job is on-demand and does not wait for the continuous pipeline.

Manual crawler NLP is **`POST /nlp/analyze/raw`** — the same ingest contract as the collector worker — then adapted into matrix rows. It no longer calls `/nlp/analyze/surveillance`. Shared facts come from `extractors.predict_surveillance_facts` (title/lede disease, ASEAN gazetteer country, disease-sentence case counts, no invented totals).

### G. Gold fixtures (20-article accuracy bar)

Official pack is `services/nlp-python/tests/nlp_gold/nlp-gold-20.json` + rubric `nlp-gold-20.md` (ASEAN + Timor-Leste). The scorer in `runner.py` uses **title + evidence_quote only** (no live HTTP).

**Score: 20/20 PASS** (bar ≥18/20). Critical fixtures:

| id | result | notes |
| --- | --- | --- |
| asean-001 CIDRAP | PASS | H5N1 + Cambodia; `cases=1` (focal girl); not Utah / Measles / Indonesia / `Were`; 2025 19/8 is background |
| asean-002 Singapore measles | PASS | `cases=43` exactly; not 27/152/802151/Americas |

Other scoped figures that the rubric allows (and that we currently take the preferred value for): asean-004 128634 YTD; asean-008 ~1900; asean-009 cases/deaths null (no vaccine-dose invention); asean-010 headline 2 not 7 YTD; asean-011 3029 not 4712; asean-014 ≥2000 + deaths 17; asean-018 73828/9; asean-019 288/20.

Manual crawler and ingest share `extractors.predict_surveillance_facts` (`POST /nlp/analyze/raw`). Extractor hardening that the pack required: WHO spaced thousands (`3 029`), current-year vs comparator ranking, focal singular human case → 1, `rose N per cent to TOTAL`, vaccine/animal-outbreak skip, sitrep `— Country section` heading.

```
cd services/nlp-python && python3 -m tests.nlp_gold.runner
cd services/nlp-python && python3 -m unittest tests.test_gold_set tests.test_cidrap_cambodia tests.test_extraction_counts tests.test_rules -v
```

`FAILURES.md` is rewritten by the test. Remaining misses: none on this pack. Province is often the country name when the quote is national (allowed: locality only if clearly stated).

Do not deploy from this PR without a staging pass. Stored junk counts (e.g. 802151) stay capped at read until re-analyze after deploy.

### Verify snapshot parity (staging)

Use the **same** query string on all five URLs (or omit params to use the ASEAN default window):

```
GET /nlp/api/v1/public-dashboard?country=ASEAN&start_year=2026&start_week=1&end_year=2026&end_week=<current>
GET /nlp/api/v1/spatial-heatmap?...same...
GET /nlp/api/v1/disease-trend-overview?...same...
GET /nlp/api/v1/morbidity-mortality?...same...
GET /nlp/api/v1/kpi-snapshot?...same...
GET /nlp/api/v1/kpi-events?page=1&per_page=10&...same...
```

Expect identical `snapshot_id` and:

`kpis.cases == summary.total_cases == summary.total_cases_tracked == summary.total_morbidity == kpi-snapshot.data.kpis.cases`

Same equality for deaths and events. `/nlp/reports` Total Cases matches that `snapshot_id`. Reloading Reports within 90s must keep the same totals. Ledger "total events" is `kpi-events.total` (== snapshot.events), not 250. TV KPIs use the same query string. Map/TV omit non-ASEAN markers unless `country=global`.

Same equality for deaths and events. Reports page Total Cases matches that `snapshot_id`.

CIDRAP fixture:

```
cd services/nlp-python && python3 -m unittest tests.test_cidrap_cambodia tests.test_geocode_bbox tests.test_llm_gate -v
```

## Round 3 — source coverage, credibility refresh, province/city, geocode, DeepSeek caps

Do **not** deploy this PR to production. Staging only.

### 1) Source country ≠ article event country

Live confusion (~27 ASEAN-tagged sources vs ~1471 “outside”) came from treating missing/non-member **outlet** labels as “bukan media ASEAN”, and from counting **only the top-level `country` column**.

**Audit (2026-09-15):** `docs/source-tagging-audit.md` (copied from live audit `/workspace/phase-compare/source-tagging-audit.md` / attached `source-tagging-audit.md`). Public GET of `/nlp/api/v1/sources/summary` + paginated list: 1,498 sources, 27 ASEAN, 1,471 “outside”. **~777 catalog rows already had an ASEAN-11 member name in `config.country` but top-level `country` was null**, so they were dumped into outside. Credibility was six static catalog-type buckets (gov 0.95, Local News 0.84, rss 0.78, Google/web 0.65, Facebook 0.35); ≥0.7 matched Official+Local News+rss+JSON, not live verification.

Must-fix from that audit:

- Summary/list **coalesce** `country`, `config.country`, and `config.source_country_original` via `abvc_source_country_raw` / `abvc_source_country_resolved` (aliases: Brunei Darussalam, Viet Nam, Lao PDR, Timor Leste, Kamboja, …).
- Migration `068` **backfills** top-level `country` when it is null.
- Google News / WHO / CIDRAP / CDC / ReliefWeb remain `GLOBAL` even if a feed locale is `gl=ID`. Locale is not outlet country.
- New fields: `coverage_scope` (`asean_outlet` | `global_outlet` | `unclassified`), `covers_asean` (health/ASEAN-focused catalogs used for ASEAN monitoring — not every global URL).
- Dashboard copy: “Sumber dengan negara ASEAN terisi (kolom country atau config.country)” vs “Sumber tanpa negara ASEAN terisi / sumber global”.
- API still returns `outside_sources` as an alias of `source_country_unfilled`.

After staging `068`, expect `asean_sources` to jump from 27 toward the ~777+ catalog ASEAN outlets (exact number depends on aliases and Google News aggregator retag).

### 2) Credibility refresh (≥ threshold)

Scores used to be a **static join** on `source_credibility` by catalog type (live: Google/web **0.65 forever**, Local News 0.84, rss 0.78, Official 0.95). Round 3 stores a refreshable score:

- `credibility_score`, `credibility_reason` (`catalog_heuristic` | `domain_boost` | `override`), `last_credibility_refresh`, optional `credibility_override`
- Admin `POST /api/v1/source-credibility/recompute` updates **only** those columns (migration-safe; does **not** wipe name/url/schedule/events)
- Domain rules replace frozen Google/web 0.65 for known hosts (`who.int`, ASEAN `.gov.*` / `.go.id`, wire agencies, major ASEAN dailies)
- Threshold: `SOURCE_CREDIBILITY_THRESHOLD` (default 0.70)
- **≥0.7 is a catalog-type heuristic unless an admin override is stored.** It is not live crawl quality and **bukan “sudah diverifikasi epidemiolog”**

### 3) Province / city

`disease_events.province` and `disease_events.city` are first-class (plus crawl-matrix `province` / `city`). Map popup, events list, URL analysis, and crawler export expose them instead of only free-text `location_name`.

### 4) Map lat/lon

ASEAN gazetteer lookup is bbox-validated. Country-level events use curated ASEAN-11 centroids (Singapore `1.3521, 103.8198`). Gazetteer rows that land outside the member bbox (Singapore in the Bay of Bengal) become **null coords + needs_review**. Token `Were` remains rejected. Migration 068 also:

- repairs `locations` Singapore rows to the island centroid
- nulls other ASEAN gazetteer coords outside the member bbox
- optional event backfill for existing pins outside the country bbox

Nominatim (opt-in) now sends ASEAN `countrycodes`.

### 5) Crawl ops (additive)

Sources page adds a failed-queue + recent-history panel (`GET /api/v1/crawl-ops`). Dispatcher/backoff/rate limits from Round 2 are unchanged. `GET /api/v1/runs` now includes `source_name`.

### 6) DeepSeek — re-enable path, save tokens

Rules NLP always runs first. DeepSeek/OpenAI only on UNKNOWN / low confidence / missing location / needs_review. **Multiple extracted diseases no longer trigger the LLM.**

Cost controls:

| Control | Default |
| --- | --- |
| `AGENT_ENABLED` | true (set false to disable) |
| `DEEPSEEK_DAILY_BUDGET` | 200 calls/day UTC (0 = kill switch) |
| `DEEPSEEK_PROMPT_CHARS` | 1800 |
| `DEEPSEEK_MAX_TOKENS` | 400 |
| `DEEPSEEK_LOCATION_MAX_CANDIDATES` | 80 ASEAN gazetteer names |
| Response cache | URL/prompt hash, 600s TTL |

Never send full dashboard payloads to the LLM. Cache hits do not consume the daily budget.

### Verify (staging)

```
GET /nlp/api/v1/sources/summary
POST /nlp/api/v1/source-credibility/recompute   # admin
GET /nlp/api/v1/crawl-ops
```

Expect `asean_outlet_sources` to include catalog rows whose **config.country** is an ASEAN-11 member (not only the 27 enabled RSS feeds). `credibility_meaning` must say ≥0.7 is a catalog heuristic. WHO `who.int` rows should leave the frozen 0.65 Google/web bucket after recompute (`domain_boost`).

