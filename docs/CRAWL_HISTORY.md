# Crawl History / Matriks Hasil Crawl

Phase 2 module for stakeholders who need Phase 1-style **history of crawl results**, fed only from data already stored in PostgreSQL.

UI: `/nlp/crawl-history` (auth module `crawl_history`, also granted to existing `manual_crawler` roles).

This is **not** the Events dump. Default quality is **surveillance**: health-related, known disease (not `UNKNOWN` / `NEGATIVE*`), confidence ≥ 0.15. Political/economic RSS and other non-health rows stay stored for Events QA, but they do not appear in the default matrix.

## What it proves versus Phase 1

Open the page while signed in. The summary cards are live `COUNT(*)` values from this Phase 2 database:

| Card | Source |
| --- | --- |
| Manual jobs | `crawl_matrix_jobs` |
| Surveillance rows | deduped ledger rows with `quality_class = surveillance` |
| Continuous | surveillance `disease_events` not linked to a manual job, excluding analyze-url |
| Analyze URL | the same set when `analysis_jobs.event_id` / `source_name = 'URL Analyzer'` |
| Mapped / with geo | surveillance rows with known disease **and** coordinates (not merely a place name) |
| Noise excluded | non-health / `NEGATIVE*` articles still in the database, hidden by default |

Do **not** invent Phase 1 numbers. Phase 1 (`https://data.aseanbiosurveillance.org/dashboard`) is login-gated. Compare a Phase 1 export against these live Phase 2 **surveillance** counts and against field richness that Phase 2 stores per row:

`title`, `url`, `published_at`, `country`, `province`, `city`, `disease`, `cases`, `deaths`, `confidence`, `source`, `crawl_channel`, `job_id`, `mapped`, `needs_review`, `raw_report_id`, `evidence`, geo, `quality_class`, `is_health_related`.

Volume + those extra fields are the coverage argument. If a table is empty, the UI stays empty.

## Quality classes

| Quality | Meaning | Default matrix |
| --- | --- | --- |
| `surveillance` | Health-related, known disease, confidence ≥ 0.15 (manual jobs with a real disease name also qualify) | **shown** |
| `review` | Health-related but `UNKNOWN` / empty disease or confidence &lt; 0.15 | hidden unless Quality = review |
| `noise` | `is_health_related = false` or `NEGATIVE*` | hidden unless Quality = noise |
| `all` | Deduped stored rows of every class | opt-in |

Continuous / analyze-url rows are **one per article** (`DISTINCT ON` `normalized_url` / `url` / `raw_report_id`). When several events share an article, the surveillance row wins, then review, then newest.

Worker still INSERTs non-health `disease_events` (`is_health_related = FALSE`, `raw_reports.processing_status = NON_HEALTH`) so Events QA can inspect them. Crawl History just stops treating that inventory as the default ledger.

## Channels

- **Manual jobs** — every `crawl_matrix_rows` row joined to `crawl_matrix_jobs` + `raw_reports`, with `disease_events` when the same `raw_report_id` exists. Job history lists past `crawl_matrix_jobs` (status, counts, started/finished, disease/country filters). Opening a job filters the matrix to that `job_id`.
- **Continuous crawl** — `disease_events` / `raw_reports` that did **not** come from a manual matrix job (`raw_report_id` not in `crawl_matrix_rows`), excluding SKDR/test, after article dedupe.
- **Analyze URL** — the same non-manual set when an `analysis_jobs` row points at the event, or `source_name` is `URL Analyzer`.

## API (authenticated; not public)

```
GET /nlp/api/v1/crawl-history/summary
GET /nlp/api/v1/crawl-history/rows?page=1&per_page=20&quality=surveillance&channel=&country=&disease=&date_from=&date_to=&status=&has_geo=&job_id=&q=
GET /nlp/api/v1/crawl-history/rows/:id
GET /nlp/api/v1/crawl-history/jobs
GET /nlp/api/v1/crawl-history/jobs/:id
GET /nlp/api/v1/crawl-history/rows?format=csv|xlsx
```

`quality` omitted defaults to `surveillance`. Use `review`, `noise`, or `all` to inspect other stored classes.

Unauthenticated calls return **401**. Empty filters return `data: []` and `total: 0`.

## Verify

1. Sign in as a role that has Manual Crawler (`data_analyst`, `epidemiologi`, `skk`, or admin).
2. Open `/nlp/crawl-history`. Sidebar entry: **Crawl History**.
3. Default matrix must **not** list political/economic RSS with disease `UNKNOWN`. Those appear only under Quality = Noise or All stored.
4. Summary **Noise excluded** matches non-health / `NEGATIVE*` ledger rows. Channel cards are surveillance counts, not the raw Events inventory.
5. Mapped is Yes only when the row is health + known disease + coordinates.
6. Matrix tab lists stored rows; Job history lists `crawl_matrix_jobs`. Click a job → matrix filtered to that job. Click a row → snippet, NLP fields, `raw_report_id`, quality.
7. Export CSV / Excel uses the current filters including quality (cap 5,000).
8. `curl` without a bearer token against `/api/v1/crawl-history/rows` returns 401.
