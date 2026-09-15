# Reports CMS — publication gallery from templates + KPI snapshots

ABVC public reports at `/nlp/reports` are a **publication gallery**, not a live event-matrix mashup and not AI essay pages. Each issue is created from a versioned code template, filled with the same ASEAN-11 materialized KPI snapshot used by the dashboard / TV / event matrix, then edited and published by the report team.

Section order follows public epidemiological bulletin practice (MMWR-style chapters; operational SitRep glance → map → table → chart). Branding is ABVC’s own. Do not copy third-party logos or cover art.

## Publication families

| Template | Family | Role | Outline (high level) |
|----------|--------|------|----------------------|
| `mmwr_bulletin_v1` | Bulletin | **Primary** | Cover → publisher/editorial → TOC (linked) → exec summary → disease chapters (tables, Admin-0 maps, line/bar, small multiples) → source notes → print page # |
| `situation_report_v1` | SitRep | **Primary** (alias `weekly_sitrep_v1`) | Glance KPIs → health-zone choropleth → AMS cases/deaths/CFR table → weekly chart → country updates → epidemiology → response → recommendations → refs |
| `epidemic_intelligence_v1` | EI | Secondary | Cover + regional map → editorial → definitions → 2-week event summary → exec summary → disease-signal visual → summary table → refs |
| `focus_report_v1` | Focus | Secondary | Abstract → methods → results (small multiples + AMS×week heatmap) → discussion → limitations → refs |

One **published** edition is allowed per `(template_id, epi_year, epi_week)`. A bulletin and a SitRep may both be live for the same week.

Human narrative slots (never LLM body): publisher/editorial, response/recommendations/country updates, definitions, abstract/methods/discussion.

## Public information architecture

| Path | Purpose |
|------|---------|
| `/nlp/reports` | Publication gallery (cover cards, family chips). Empty state is honest: 0 published editions until CMS publish. |
| `/nlp/reports/latest` | Newest published issue |
| `/nlp/reports/w/{year}-{week}` | Canonical epi-week lookup |
| `/nlp/reports/{slug}` | Stable HTML edition (`mmwr-YYYY-wWW`, `sitrep-YYYY-wWW`, …) |
| `/nlp/reports/{slug}.pdf` | Print/PDF artifact (rewritten to `/reports/{slug}/print`) |
| `/nlp/reports/disease/{code}` | Filtered archive |
| `/nlp/reports/country/{iso3}` | Filtered archive by AMS |
| `/nlp/reports/archive` | Year / week browser |
| `/nlp/reports/methodology` | Sources, definitions, missing-data policy |

Public chrome is short (Home / Dashboard / Reports / Sources / About). The live **event matrix** remains at `/nlp/reports/matrix` (Phase 2 ledger) and is linked quietly from the gallery footer — it is not a sidebar MONITORING item. Executive layout remains at `/nlp/reports/executive`.

## CMS workflow (auth, `reports` module)

```
Draft → In review → Changes requested → Approved → Published → (Superseded / Archived)
```

| Path | Purpose |
|------|---------|
| `/nlp/reports/cms` | Issue queue |
| `/nlp/reports/cms/issues/new` | Create from MMWR or SitRep (primary) or EI/Focus + KPI pull |
| `/nlp/reports/cms/issues/{id}` | Editor + live preview (narrative slots by template) |
| `/nlp/reports/cms/issues/{id}/review` | Checklist + comments |
| `/nlp/reports/cms/templates` | Template versions and outlines |
| `/nlp/reports/cms/taxonomies` | ASEAN-11 AMS + ISO3 |

**Publish freeze:** `published_snapshot` is an immutable copy of the last KPI pull. Public pages read that JSON. They do not recompute live totals. Editing a published issue is blocked; correct via a new issue or supersede (same template + week only).

## What is (and is not) AI

| Layer | Source |
|-------|--------|
| KPI tables, epi curves, AMS bars, choropleth, small multiples, heatmap | `kpi_snapshots` + ASEAN-11 event aggregates (`kpi_source=materialized_kpi_snapshot`) |
| Section order / headings / figure slots | Code templates listed above |
| Highlights, disease notes, narrative slots | Human CMS fields (≤5 bullets; notes and narrative capped) |
| “Draft highlight bullets” | **Template strings from KPI fields**, not an LLM. Must be human-reviewed. |

There is no “write the bulletin with AI” path.

## Maps and heatmaps

- Admin-0 polygons for the 11 jurisdictions, joined on **ISO 3166-1 alpha-3** (`BRN, KHM, IDN, LAO, MYS, MMR, PHL, SGP, THA, VNM, TLS`).
- Sequential ColorBrewer Blues; quantile classes among AMS **with data**.
- **No data / Not reported** is gray + hatch. It is never mapped as zero and never uses the lightest sequential class.
- AMS×week heatmap cells with no matching events are missing, not zero.
- Publication maps do not use event pins.

## API

Public GET (no auth):

- `GET /api/v1/public/report-issues` (`?template=` optional)
- `GET /api/v1/public/report-issues/latest`
- `GET /api/v1/public/report-issues/:slug`

CMS (session):

- `GET|POST /api/v1/report-issues` (POST accepts `template_id`)
- `GET|PATCH /api/v1/report-issues/:id` (PATCH accepts `narrative`)
- `POST /api/v1/report-issues/:id/pull-kpi`
- `POST /api/v1/report-issues/:id/transition`
- `POST /api/v1/report-issues/:id/publish`
- `POST /api/v1/report-issues/:id/suggest-notes`
- `GET /api/v1/report-issues/templates`
- `GET /api/v1/report-issues/taxonomies`

Schema: `database/init/068_report_issues.sql`, `database/init/069_report_publication_templates.sql`.

## Preservation

Phase 2 monitoring (dashboard, TV, KPI snapshot semantics, event matrix, localStorage media-upload CMS at `/console/reports-cms`) is unchanged. Reports read the snapshot; they do not invent numbers.
