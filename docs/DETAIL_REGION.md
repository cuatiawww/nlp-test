# Detail Region

`/nlp/detail-region?country=Indonesia` is the country surveillance profile. It keeps the live `RegionalDetailPreview` card/section template and binds every block to ASEAN-scoped APIs. It does not invent weather, AQI, disease, news, or seasonal values.

## Scope

- Query `country` must be one of the ASEAN 11 jurisdictions (ASEAN 10 + Timor-Leste). Storage labels remain `Laos` / `Vietnam`; the header shows **Lao PDR** / **Viet Nam**.
- KPI, events, news, and the monthly heatmap use the same materialized snapshot path as Home / TV / Reports (`kpi_source=materialized_kpi_snapshot`).
- Outside-ASEAN country names are rejected. Empty observations render as empty states or `—`, not placeholder numbers.

## Layout

The page is near full-width (`px-2` / `sm:px-3` / `md:px-4`, no `max-w-[1600px]`). The static design-preview, illustrative-context, and CSS blob-map placeholders are omitted whenever a live snapshot is present; a **Live** chip shows the KPI source instead.

## Sections and sources

| Block | Source |
|---|---|
| Header country / year | `?country=` via `aseanStorageName` + `GET /api/v1/public-dashboard` years |
| Cases / deaths / CFR / alerts | `GET /api/v1/public-dashboard` + `GET /api/v1/kpi-snapshot` |
| Disease cards | `by_disease` (CFR from cases/deaths; empty when no rows) |
| News ticker | `GET /api/v1/kpi-events` |
| Monthly trend chart | `GET /api/v1/spatial-heatmap` months (weekly trend fallback) |
| Seasonal intensity grid | Per-disease `public-dashboard` weekly series, scaled to heatmap columns |
| Weather, precipitation, AQI, PM2.5 | `GET /api/v1/region-context` → Open-Meteo forecast + air-quality |
| 7-day climate means | Same proxy → NASA POWER daily `T2M`, `RH2M`, `PRECTOTCORR` |
| Map province choropleth | OpenLayers stack (`SpatialOutbreakMap` / `AseanMap`). Indonesia ADM1 from `/wilayah-data`; other members from `/boundaries` (geoBoundaries gbOpen ADM1) |
| Env layer toggles | Existing InaRISK / wind / basemap controls, plus USGS and GDACS pins from region-context |
| InaRISK rasters | BNPB ArcGIS ImageServer, Indonesia only |

`GET /api/v1/region-context?country=` is a public backend proxy. The browser does not call Open-Meteo, NASA, GDACS, or USGS directly (CSP stays same-origin for those reads). Responses are cached for 10 minutes per country. Each upstream call has an 8s timeout; a failed provider returns `status: error` and `—` in the UI.

## Interoperability

Migration `database/init/071_detail_region_interoperability.sql` registers or updates:

- Open-Meteo weather, precipitation, and air quality
- NASA POWER Daily
- USGS Earthquake FDSN
- GDACS multi-hazard
- BNPB InaRISK ArcGIS REST

The catalog is administrative. It does not store API keys. Live values still come from region-context and the map layers.

## Map notes

Province polygons load from `highlightCountry` as well as a click selection, so `/detail-region?country=Indonesia` shows ADM1 choropleth without requiring a map click. Point-in-polygon using outbreak locations fills each province. No data is not drawn as zero. The CSS abstract-shape preview (`rounded-[48%_52%_45%_55%]` pins) is not used on this page.

## Related files

- `services/frontend-next/components/incident/RegionalDetailPreview.tsx`
- `services/frontend-next/app/detail-region/page.tsx`
- `services/frontend-next/components/AseanMap.tsx`
- `services/frontend-next/components/SpatialOutbreakMap.tsx`
- `services/backend-rust/src/region_context.rs`
- `services/backend-rust/src/main.rs` (`GET /api/v1/region-context`)
