# Crawl History / Matriks Hasil Crawl

Phase 2 module for stakeholders who need Phase 1-style **history of crawl results**, fed only from data already stored in PostgreSQL.

UI: `/nlp/crawl-history` (auth module `crawl_history`, also granted to existing `manual_crawler` roles).

## What it proves versus Phase 1

Open the page while signed in. The summary cards are live `COUNT(*)` values from this Phase 2 database:

| Card | Source |
| --- | --- |
| Manual jobs | `crawl_matrix_jobs` |
| Matrix rows | `crawl_matrix_rows` |
| Continuous | `disease_events` not linked to a manual job, excluding analyze-url |
| Analyze URL | `analysis_jobs.event_id` / `source_name = 'URL Analyzer'` |
| Mapped / with geo | rows with a disease event or coordinates |
| Needs review | `processing_status = needs_review` or `disease_events.needs_review` |

Do **not** invent Phase 1 numbers. Phase 1 (`https://data.aseanbiosurveillance.org/dashboard`) is login-gated. Compare a Phase 1 export against these live Phase 2 counts and against field richness that Phase 2 stores per row:

`title`, `url`, `published_at`, `country`, `province`, `city`, `disease`, `cases`, `deaths`, `confidence`, `source`, `crawl_channel`, `job_id`, `mapped`, `needs_review`, `raw_report_id`, `evidence`, geo.

Volume + those extra fields are the coverage argument. If a table is empty, the UI stays empty.

## Channels

- **Manual jobs** — every `crawl_matrix_rows` row joined to `crawl_matrix_jobs` + `raw_reports`, with `disease_events` when the same `raw_report_id` exists. Job history lists past `crawl_matrix_jobs` (status, counts, started/finished, disease/country filters). Opening a job filters the matrix to that `job_id`.
- **Continuous crawl** — `disease_events` / `raw_reports` that did **not** come from a manual matrix job (`raw_report_id` not in `crawl_matrix_rows`), excluding SKDR/test.
- **Analyze URL** — the same non-manual set when an `analysis_jobs` row points at the event, or `source_name` is `URL Analyzer`.

## API (authenticated; not public)

```
GET /nlp/api/v1/crawl-history/summary
GET /nlp/api/v1/crawl-history/rows?page=1&per_page=20&channel=&country=&disease=&date_from=&date_to=&status=&has_geo=&job_id=&q=
GET /nlp/api/v1/crawl-history/rows/:id
GET /nlp/api/v1/crawl-history/jobs
GET /nlp/api/v1/crawl-history/jobs/:id
GET /nlp/api/v1/crawl-history/rows?format=csv|xlsx
```

Unauthenticated calls return **401**. Empty filters return `data: []` and `total: 0`.

## Verify

1. Sign in as a role that has Manual Crawler (`data_analyst`, `epidemiologi`, `skk`, or admin).
2. Open `/nlp/crawl-history`. Sidebar entry: **Crawl History**.
3. Summary cards match SQL counts on the same database.
4. Matrix tab lists stored rows; Job history lists `crawl_matrix_jobs`. Click a job → matrix filtered to that job. Click a row → snippet, NLP fields, `raw_report_id`.
5. Export CSV / Excel uses the current filters (cap 5,000).
6. `curl` without a bearer token against `/api/v1/crawl-history/rows` returns 401.
