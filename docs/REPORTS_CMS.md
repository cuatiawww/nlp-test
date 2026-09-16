# Reports CMS — hybrid publications (data pull + draft narrative)

Phase 2 reports are **not** a copy of fully human-authored ASEAN-PHE PDFs. They are a hybrid:

1. **Auto-generate first from system data.** The analyst picks template (`situation_report_v1` or `mmwr_bulletin_v1` / media monitoring), an epi-week range, scope (ASEAN-11 default, including Timor-Leste, or one AMS), and **one or more diseases**. The backend pulls KPIs, AMS tables, per-disease epidemic series, and a Disease×Country matrix from the same materialized snapshot / event aggregates used by the dashboard and TV wall. Charts, maps, and tables bind to that pull. Numbers are never invented by a language model and are never dummy/hardcoded counts.
2. **DeepSeek draft narrative, then humans.** DeepSeek may draft highlights, a short executive summary, and optional disease notes **from the truncated stats JSON only**. The request is cached by `(template, scope, date range, data hash)` (the hash includes the selected-disease package), capped in tokens, and **never** includes `original_text` or crawl corpora. Output is draft-only.
3. **CMS review → Word-like edit → cover → reorder → publish freeze.** Analysts edit narratives in a TipTap/ProseMirror WYSIWYG, upload a cover and optional interstitial pages, reorder sections, then Draft → In review → Approved → Published. Public pages read `published_snapshot`.
4. **Live analysis stays.** The one-screen matrix / cross-tab / events ledger is retained as an operational mode. It is not replaced by the gallery.

Bulletin charts and maps show **cases, deaths, and CFR / disease burden by AMS** only. They never plot crawler job counts or scrape volume.

## Workspace IA (three modes)

| Mode | Path | Who |
|------|------|-----|
| **A. Published bulletins** | `/nlp/reports` | Public gallery of frozen editions |
| **B. Generate draft** | `/nlp/reports/generate` (auth) | Template + week range + scope + multi-select diseases → KPI/matrix pull → optional DeepSeek draft → CMS editor |
| **C. Matrix & ledger** | `/nlp/reports/matrix` | Live filters, cross-tabs, events ledger (Phase 2 operational view) |

Sidebar MONITORING keeps **Reports** and **Matrix & ledger**. CMS queue remains at `/nlp/reports/cms`.

## Publication families

| Template | Family | Role | Outline (high level) |
|----------|--------|------|----------------------|
| `mmwr_bulletin_v1` (alias `media_monitoring_v1`) | Bulletin | **Primary** | Cover → publisher/editorial → TOC (nested per disease) → exec summary → Situation at a Glance → Disease×Country matrix → ASEAN choropleth → per-disease chapters → source notes → print page # |
| `situation_report_v1` (alias `weekly_sitrep_v1`) | SitRep | **Primary** | Cover → TOC → glance KPIs (cases/deaths/CFR) → choropleth → matrix → AMS table → weekly cases/deaths → per-disease chapters → country updates → response → recommendations → refs |
| `epidemic_intelligence_v1` | EI | Secondary | Cover + map → editorial → definitions → 2-week summary → exec summary → disease-signal visual → summary table → refs |
| `focus_report_v1` | Focus | Secondary | Abstract → methods → results (small multiples + heatmap) → discussion → limitations → refs |

One **published** edition per `(template_id, epi_year, epi_week)`. A bulletin and a SitRep may both be live for the same week. Branding is ABVC’s own.

Disease chapters follow the Phase 1 TOC depth: Highlights / Situation Overview → ASEAN cases & deaths table → epidemic curve → weekly new cases & deaths → polygon choropleth. Vaccination or travel-advisory blocks appear only when those fields exist in the snapshot.

## Generate draft (auth)

`POST /api/v1/report-issues` accepts:

- `template_id`
- `epi_year`, `epi_week`, optional `epi_week_end`
- `scope` (`asean11` / All ASEAN, or an AMS name / ISO3)
- `selected_diseases` (array of names or `{name, disease_code}`) and/or `disease_ids[]`
- `assist_narrative` (default `true`)

The create path pulls the package immediately (KPIs + AMS table + **per-selected-disease** series + `matrix` with cases/deaths/CFR + sources + alerts) and, if assist is on, drafts narrative via cache or DeepSeek. Empty `selected_diseases` falls back to the top diseases **by cases** in the window (not event/crawler counts). A selected disease with no matching extracts still gets a chapter whose cells are **No data / Not reported**, never dummy zeros.

`POST /api/v1/report-issues/:id/suggest-notes` with `{ apply: true }` re-runs that draft into empty human fields only (it does not overwrite notes the analyst already wrote).

`POST /api/v1/report-issues/:id/assets` stores a cover (`kind: cover`) or interstitial page (`kind: page`) as a `data:image/*;base64` URL on `assets` and keeps `cover_url` in sync.

## Draft CMS editor

`/nlp/reports/cms/issues/:id`:

- TipTap WYSIWYG for narrative slots and per-disease notes (headings, lists, emphasis, images)
- Cover + extra page upload
- Section reorder (persisted as `section_order`)
- Status Draft → In review → Approved → Publish (freezes `published_snapshot`)

## What is (and is not) AI

| Layer | Source |
|-------|--------|
| KPI tables, epi curves, AMS bars, choropleth, matrix cells | `kpi_snapshots` + ASEAN-11 event aggregates, **filtered to selected diseases** |
| Section order / figure slots | Code templates + analyst reorder |
| Highlights / exec summary / short section notes | **DeepSeek draft from truncated stats**, or template bullets if no API key — always human-reviewed |
| Full bulletin body / crawl text | **Never sent to the model. Never LLM-authored as the published body.** |
| Crawler/scrape volume | **Never charted on SitRep or MMWR bulletin views** |

## Token safety

- Prompt payload is stripped of `original_text`, `content`, `body`, `html`, `raw_text`.
- Caps: ~4500 input characters, 700 output tokens, 20s timeout.
- Cache table `report_narrative_cache` keyed by SHA-256 of template + scope + period + stats hash.
- Schema: `database/init/070_report_narrative_cache.sql`.
- Multi-disease columns: `database/init/072_report_cms_multidisease.sql` (`selected_diseases`, `section_order`, `assets`).

## Maps and missing data

Admin-0 ISO3 choropleth (default indicator: **cases**; deaths is the other allowed map color). Click or hover a country (or the Singapore inset, or the AMS list) for a popup of **cases, deaths, and CFR**. No data / Not reported is hatched gray and still opens the popup with em dashes — never a dummy zero. Heatmap missing cells are hatched, not class 0. When a single AMS is in scope, the same Admin-0 join is used; ADM1 is not invented.

## Print / PDF

Live preview, `/reports/{slug}/print`, and **Download PDF artifact** share the same SitRep/MMWR layout. Cards use inner padding; `@page` is A4 with ~16–18 mm margins. Choropleth, tables, and chapter blocks use `break-inside: avoid`; the ASEAN map and each disease chapter start on a new page. html2canvas/jsPDF packs `[data-pdf-page]` blocks with those margins and **never slices** a map or table — a block taller than the page is scaled to fit.

Verify: open a bulletin → Print / PDF → browser print preview (A4) **and** Download PDF artifact. Confirm padding around CONTENTS / publisher / cover, and that the choropleth + AMS list are not cut by a page boundary.

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
- `POST /api/v1/report-issues/:id/assets`
- `GET /api/v1/report-issues/templates`
- `GET /api/v1/report-issues/taxonomies` (AMS + searchable disease catalog)

PATCH may update `section_order`, `assets`, `selected_diseases`, narrative HTML, and map indicator (`cases` or `deaths` only).

## Preservation

Dashboard, TV, KPI snapshot semantics, and the matrix/ledger live analysis view are unchanged. Reports read the snapshot; they do not invent numbers. Executive layout remains at `/nlp/reports/executive`. See `docs/PHASE1_REPORT_BENCHMARK.md` for how this beats the Phase 1 Word PDFs.
