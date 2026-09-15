# Reports CMS — weekly sitreps from templates + KPI snapshots

ABVC public reports at `/nlp/reports` are **epidemiological sitreps**, not AI essay pages. Each issue is created from a versioned code template, filled with the same ASEAN-11 materialized KPI snapshot used by the dashboard / TV / event matrix, then edited and published by the report team.

## Public information architecture

| Path | Purpose |
|------|---------|
| `/nlp/reports` | Issue gallery (published cards) |
| `/nlp/reports/latest` | Newest published issue |
| `/nlp/reports/w/{year}-{week}` | Canonical epi-week lookup |
| `/nlp/reports/{slug}` | Stable HTML sitrep |
| `/nlp/reports/{slug}.pdf` | Print/PDF artifact (rewritten to `/reports/{slug}/print`) |
| `/nlp/reports/disease/{code}` | Filtered archive |
| `/nlp/reports/country/{iso3}` | Filtered archive by AMS |
| `/nlp/reports/archive` | Year / week browser |
| `/nlp/reports/methodology` | Sources, definitions, missing-data policy |

Public chrome is intentionally short (Home / Dashboard / Reports / Sources / About) with the current epi week and last-published badge. The live **event matrix** remains at `/nlp/reports/matrix` (Phase 2). Executive layout remains at `/nlp/reports/executive`.

## CMS workflow (auth, `reports` module)

```
Draft → In review → Changes requested → Approved → Published → (Superseded / Archived)
```

| Path | Purpose |
|------|---------|
| `/nlp/reports/cms` | Issue queue |
| `/nlp/reports/cms/issues/new` | Create from `weekly_sitrep_v1` + KPI pull |
| `/nlp/reports/cms/issues/{id}` | Editor + live preview |
| `/nlp/reports/cms/issues/{id}/review` | Checklist + comments |
| `/nlp/reports/cms/templates` | Template versions |
| `/nlp/reports/cms/taxonomies` | ASEAN-11 AMS + ISO3 |

**Publish freeze:** `published_snapshot` is an immutable copy of the last KPI pull. Public pages read that JSON. They do not recompute live totals. Editing a published issue is blocked; correct via a new issue or supersede.

## What is (and is not) AI

| Layer | Source |
|-------|--------|
| KPI tables, epi curves, AMS bars, choropleth | `kpi_snapshots` + ASEAN-11 event aggregates (`kpi_source=materialized_kpi_snapshot`) |
| Section order / headings / figure slots | Code template `weekly_sitrep_v1` / `1.0.0` |
| Highlights and disease notes | Human CMS fields (≤5 bullets; notes capped) |
| “Draft highlight bullets” | **Template strings from KPI fields**, not an LLM. Must be human-reviewed. |

There is no “write the bulletin with AI” path.

## Maps

- Admin-0 polygons for the 11 jurisdictions, joined on **ISO 3166-1 alpha-3** (`BRN, KHM, IDN, LAO, MYS, MMR, PHL, SGP, THA, VNM, TLS`).
- Sequential ColorBrewer Blues; quantile classes among AMS **with data**.
- **No data / Not reported** is gray + hatch. It is never mapped as zero and never uses the lightest sequential class.
- Sitrep maps do not use event pins.

## API

Public GET (no auth):

- `GET /api/v1/public/report-issues`
- `GET /api/v1/public/report-issues/latest`
- `GET /api/v1/public/report-issues/:slug`

CMS (session):

- `GET|POST /api/v1/report-issues`
- `GET|PATCH /api/v1/report-issues/:id`
- `POST /api/v1/report-issues/:id/pull-kpi`
- `POST /api/v1/report-issues/:id/transition`
- `POST /api/v1/report-issues/:id/publish`
- `POST /api/v1/report-issues/:id/suggest-notes`
- `GET /api/v1/report-issues/templates`
- `GET /api/v1/report-issues/taxonomies`

Schema: `database/init/068_report_issues.sql`.

## Preservation

Phase 2 monitoring (dashboard, TV, KPI snapshot semantics, event matrix, localStorage media-upload CMS at `/console/reports-cms`) is unchanged. Reports read the snapshot; they do not invent numbers.
