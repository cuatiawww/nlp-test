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

- `DASHBOARD_EVENT_PREDICATE` (health-related or SKDR, classified, not UNKNOWN/NEGATIVE, confidence ≥ 0.15 or SKDR, `published_at` required, `source_type <> test`)
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
