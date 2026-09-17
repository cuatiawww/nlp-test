# Crawl History / Matriks Hasil Crawl

Phase 2 module for stakeholders who need Phase 1-style **history of crawl results**, fed only from data already stored in PostgreSQL.

UI: `/nlp/crawl-history` (auth module `crawl_history`, also granted to existing `manual_crawler` roles).

This is **not** the Events dump. Default quality is **surveillance**: health-related, known disease (not `UNKNOWN` / `NEGATIVE*`), confidence ≥ 0.15. Default country is **ASEAN-11 + Timor-Leste** when a country can be resolved. Political/economic RSS stays stored for Events QA and is hidden unless Quality is Noise / All stored.

## Matrix columns (Phase 1 sheet order)

Visible columns match the QA export (`No, Country, Language, Source URL, …, Needs Review`). Empty cell if the stored field is null — nothing is invented.

| Column | Stored source |
| --- | --- |
| No | page offset + row index |
| Country | `crawl_matrix_rows.country` or `locations.country` / `disease_events.location_name` (ASEAN fold) |
| Language | `disease_events.language` |
| Source URL | `crawl_matrix_rows.source_url` or `raw_reports.url` / `disease_events.source_url` (rendered as a link) |
| Article Title | `article_title` or first 220 chars of `raw_reports.original_text` |
| Disease Name | `disease_name` / `disease_classification` |
| Crawling Date | `crawling_date` or `disease_events.created_at` |
| Region | `region` or `location_name` |
| Province / City Case | `province_city_case` or `province` / `city` |
| Article Date | `article_date` / `published_at` |
| Date Case | `date_case` / `event_date` |
| Number of Cases / Deaths | `number_of_cases` / `case_count`, `number_of_deaths` / `death_count` |
| Latitude / Longitude | matrix coords or `ST_Y`/`ST_X(geom)` |
| Source Type / Name | event or matrix fields |
| Evidence | matrix `evidence`, or first JSON evidence item — **not** the full article body |
| Confidence | stored confidence |
| Processing Status | `crawl_matrix_rows.processing_status` or `raw_reports.processing_status` |
| Event ID | `disease_events.id` |
| Is Health Related, Event Type, Source Credibility, Credibility Label, Sentiment, Relevance Score, Outbreak Alert, Needs Review | `disease_events` columns |

CSV / Excel export uses the same header names as the QA sheet.

## Performance

List is a **paginated SQL ledger** (default **25** rows, max 100). Each channel branch applies quality / country / date filters **before** `ORDER BY created_at DESC LIMIT`. When both manual and pipeline rows are requested, each branch is capped at `offset+limit` then merged — the full `disease_events` table is not materialized.

- Search (`q`) and disease text are **debounced 400ms**. Summary cards load once from cheap `COUNT(*)` subqueries; they do not rescan the matrix on each keystroke.
- Row detail is a primary-key lookup (`crawl_matrix_rows.id` or `disease_events.id`), not the union.
- Title / evidence in the list are `LEFT(...)` truncated. Full evidence is loaded only in the detail modal.

### Indexes (`database/init/085_crawl_history_ledger.sql`)

| Index | Use |
| --- | --- |
| `idx_disease_events_crawl_history_surveillance_created` | default newest-surveillance page |
| `idx_disease_events_crawl_history_review_created` | Quality = review |
| `idx_disease_events_crawl_history_noise_created` | Quality = noise |
| `idx_crawl_matrix_rows_crawling_created` | manual-job newest page |
| `idx_disease_events_source_name_lower` | analyze-url vs continuous split |

`idx_locations_lower_name_active` (from `028_dashboard_ews_indexes.sql`) supports the ASEAN country `EXISTS` lookup.

## Quality classes

| Quality | Meaning | Default matrix |
| --- | --- | --- |
| `surveillance` | Health-related, known disease, confidence ≥ 0.15 (manual jobs with a real disease name also qualify) | **shown** |
| `review` | Health-related but `UNKNOWN` / empty disease or confidence &lt; 0.15 | hidden unless Quality = review |
| `noise` | `is_health_related = false` or `NEGATIVE*` | hidden unless Quality = noise |
| `all` | Stored rows of every class (still paginated) | opt-in |

Worker still INSERTs non-health `disease_events` so Events QA can inspect them.

## Channels

- **Manual jobs** — `crawl_matrix_rows` for a `crawl_matrix_jobs` row.
- **Continuous crawl** — `disease_events` not linked to a matrix `raw_report_id`, excluding SKDR/test / URL Analyzer.
- **Analyze URL** — `source_name = 'URL Analyzer'` or an `analysis_jobs.event_id` pointer.

## API (authenticated; not public)

```
GET /nlp/api/v1/crawl-history/summary
GET /nlp/api/v1/crawl-history/rows?page=1&per_page=25&quality=surveillance&country=ASEAN&channel=&disease=&date_from=&date_to=&status=&has_geo=&job_id=&q=
GET /nlp/api/v1/crawl-history/rows/:id
GET /nlp/api/v1/crawl-history/jobs
GET /nlp/api/v1/crawl-history/jobs/:id
GET /nlp/api/v1/crawl-history/rows?format=csv|xlsx
```

`quality` omitted defaults to `surveillance`. `per_page` omitted defaults to **25**. Unauthenticated calls return **401**.

## Verify

1. Sign in as a role that has Manual Crawler (`data_analyst`, `epidemiologi`, `skk`, or admin).
2. Open `/nlp/crawl-history`. Default matrix columns match the QA sheet; Source URL is a clickable link; headers stay put while scrolling.
3. First page is a 25-row SQL page (not thousands of DOM rows). Changing search does not fire until ~400ms idle.
4. Default must **not** list political/economic RSS with disease `UNKNOWN`.
5. Summary cards still load if you type in the search box (they are a separate cheap endpoint).
6. Export CSV headers equal: `No,Country,Language,Source URL,Article Title,...Needs Review`.
7. `curl` without a bearer token against `/api/v1/crawl-history/rows` returns 401.
