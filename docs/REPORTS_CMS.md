# Reports CMS — hybrid publications (data pull + draft narrative)

Phase 2 reports are **not** a copy of fully human-authored ASEAN-PHE PDFs. They are a hybrid:

1. **Auto-generate first from system data.** The analyst picks scope (All ASEAN or one AMS), an epi-week range, and a report type (for example Media monitoring bulletin). The backend pulls KPIs, events, sources, alerts, and disease×AMS cross-tabs from the same materialized snapshot / event aggregates used by the dashboard and TV wall. Charts, maps, and tables bind to that pull. Numbers are never invented by a language model.
2. **DeepSeek draft narrative, then humans.** DeepSeek may draft highlights, a short executive summary, and optional disease notes **from the truncated stats JSON only**. The request is cached by `(template, scope, date range, data hash)`, capped in tokens, and **never** includes `original_text` or crawl corpora. Output is draft-only.
3. **CMS review → cover → publish freeze.** Analysts edit the draft, then Draft → In review → Approved → Published. Public pages read `published_snapshot`.
4. **Live analysis stays.** The one-screen matrix / cross-tab / events ledger is retained as an operational mode. It is not replaced by the gallery.

## Workspace IA (three modes)

| Mode | Path | Who |
|------|------|-----|
| **A. Published bulletins** | `/nlp/reports` | Public gallery of frozen editions |
| **B. Generate draft** | `/nlp/reports/generate` (auth) | Scope + week range + type → KPI/matrix pull → optional DeepSeek draft → CMS editor |
| **C. Matrix & ledger** | `/nlp/reports/matrix` | Live filters, cross-tabs, events ledger (Phase 2 operational view) |

Sidebar MONITORING keeps **Reports** and **Matrix & ledger**. CMS queue remains at `/nlp/reports/cms`.

## Publication families

| Template | Family | Role | Outline (high level) |
|----------|--------|------|----------------------|
| `mmwr_bulletin_v1` (alias `media_monitoring_v1`) | Bulletin | **Primary** | Cover → publisher/editorial → TOC → exec summary → disease chapters → source notes → print page # |
| `situation_report_v1` (alias `weekly_sitrep_v1`) | SitRep | **Primary** | Glance KPIs → choropleth → AMS table → weekly chart → country updates → epidemiology → response → recommendations → refs |
| `epidemic_intelligence_v1` | EI | Secondary | Cover + map → editorial → definitions → 2-week summary → exec summary → disease-signal visual → summary table → refs |
| `focus_report_v1` | Focus | Secondary | Abstract → methods → results (small multiples + heatmap) → discussion → limitations → refs |

One **published** edition per `(template_id, epi_year, epi_week)`. A bulletin and a SitRep may both be live for the same week. Branding is ABVC’s own.

## Generate draft (auth)

`POST /api/v1/report-issues` accepts:

- `template_id`
- `epi_year`, `epi_week`, optional `epi_week_end`
- `scope` (`asean11` / All ASEAN, or an AMS name / ISO3)
- `assist_narrative` (default `true`)

The create path pulls the package immediately (KPIs + AMS table + disease series + `matrix` cross-tab + sources + alerts) and, if assist is on, drafts narrative via cache or DeepSeek.

`POST /api/v1/report-issues/:id/suggest-notes` with `{ apply: true }` re-runs that draft into empty human fields only (it does not overwrite notes the analyst already wrote).

## What is (and is not) AI

| Layer | Source |
|-------|--------|
| KPI tables, epi curves, AMS bars, choropleth, small multiples, heatmap, matrix cells | `kpi_snapshots` + ASEAN-11 event aggregates |
| Section order / figure slots | Code templates |
| Highlights / exec summary / short section notes | **DeepSeek draft from truncated stats**, or template bullets if no API key — always human-reviewed |
| Full bulletin body / crawl text | **Never sent to the model. Never LLM-authored as the published body.** |

## Token safety

- Prompt payload is stripped of `original_text`, `content`, `body`, `html`, `raw_text`.
- Caps: ~4500 input characters, 700 output tokens, 20s timeout.
- Cache table `report_narrative_cache` keyed by SHA-256 of template + scope + period + stats hash.
- Schema: `database/init/070_report_narrative_cache.sql`.

## Maps and missing data

Admin-0 ISO3 choropleth; No data / Not reported is never zero. Heatmap missing cells are hatched, not class 0.

## API

Public GET:

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

## Preservation

Dashboard, TV, KPI snapshot semantics, and the matrix/ledger live analysis view are unchanged. Reports read the snapshot; they do not invent numbers. Executive layout remains at `/nlp/reports/executive`.
