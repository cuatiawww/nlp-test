# Phase 1 report benchmark — what Phase 2 beats

Phase 1 SitRep and MMWR/media-monitoring PDFs were polished Word documents. Phase 2 keeps that editorial shape and replaces the slow, manual production path with a live-data CMS.

## SitRep (Phase 1 sample: Bundibugyo Ebola, 6 pp A4)

**Phase 1 did well:** Situation at a Glance bullets, a pasted distribution map, an admin-unit cases/deaths/CFR table, chronological narrative, an epidemic curve with interpretation, professional headings and figure sources.

**Phase 1 gaps:** fully human-authored (slow); one disease / one geography in the sample; static map; no draft→review→publish CMS; no cover/page reorder UI.

**Phase 2 beats it by:**

- Generating a complete draft from KPI snapshots and ASEAN-11 event aggregates in one click (scope + epi-week + **multi-select diseases**).
- Building **separate chapters** for every selected disease, including empty “No data / Not reported” chapters instead of dummy counts.
- Binding an **Admin-0 polygon choropleth** (ISO3, cases/deaths) instead of a pasted screenshot.
- Disease×Country matrix + per-disease epidemic curves and weekly cases/deaths charts.
- Word-like TipTap editing, cover upload, section reorder, and a frozen `published_snapshot` on publish.

## MMWR / media monitoring (Phase 1 sample: MMWR 2026-35, 23 pp)

**Phase 1 did well:** institutional cover, TOC with disease hierarchy (COVID-19, Mpox, …), executive summary, per-disease tables/figures, epi-week branding, print layout.

**Phase 1 gaps:** Wednesday human drafting; numbers typed by hand; no multi-select wizard; no WYSIWYG CMS.

**Phase 2 beats it by:**

- Auto TOC from the selected disease list, nested to Phase 1 depth (Highlights → tables → epidemic curve → weekly cases/deaths → map).
- Executive summary drafted from truncated stats JSON (cached/capped; never crawl text; never invented counts), then human-edited.
- Live AMS cases/deaths/CFR tables and choropleths per chapter.
- Same CMS workflow: Draft → In review → Approved → Published gallery at `/nlp/reports`.

## Hard quality rules carried forward

- Bulletin charts/maps are **cases, deaths, CFR, burden by country** — never crawler or scrape-volume widgets.
- Missing AMS is **No data / Not reported**, never class-0 / zero-filled.
- Default geography is ASEAN-11 including Timor-Leste.
- Matrix & ledger remains the operational live view; published bulletins stay frozen editions.

See `docs/REPORTS_CMS.md` for the hybrid model (data pull + DeepSeek draft + CMS freeze).
