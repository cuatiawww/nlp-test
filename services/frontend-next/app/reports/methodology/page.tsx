export default function ReportsMethodologyPage() {
  return (
    <article className="prose prose-slate max-w-none space-y-4 text-sm text-slate-700">
      <h1 className="text-2xl font-black text-slate-900">Methodology</h1>
      <p>
        ABVC weekly sitreps are generated from a versioned code template (<code>weekly_sitrep_v1</code>) bound to the
        same ASEAN-11 materialized KPI snapshot used by the dashboard, TV wall, and event matrix. Language models are
        not used to write the body of a bulletin. Optional draft bullets are filled from KPI fields and must be
        human-reviewed.
      </p>
      <h2 className="text-lg font-extrabold text-slate-900">Scope</h2>
      <p>
        Default geography is 11 jurisdictions: Brunei, Cambodia, Indonesia, Lao PDR, Malaysia, Myanmar, Philippines,
        Singapore, Thailand, Viet Nam, and Timor-Leste. Join keys for maps are ISO 3166-1 alpha-3.
      </p>
      <h2 className="text-lg font-extrabold text-slate-900">Missing data</h2>
      <p>
        An AMS with no matching events in the reporting window is shown as <strong>No data / Not reported</strong>.
        That state is never painted as zero on the choropleth and never uses the lightest sequential class. A true zero
        appears only when the AMS had matching events and extracted counts summed to 0.
      </p>
      <h2 className="text-lg font-extrabold text-slate-900" id="sources">
        Sources
      </h2>
      <p>
        Event extracts come from publicly available news, official, and partner feeds processed by the NLP pipeline
        (health-related, non-UNKNOWN disease, confidence ≥ 0.15, SKDR detached). Official national surveillance totals
        may differ. See also WHO SEAR epidemiological bulletins and ASEAN BioDiaspora sitrep practice for the
        highlights → tables/charts/maps → notes structure.
      </p>
      <h2 className="text-lg font-extrabold text-slate-900">Maps</h2>
      <p>
        Choropleths use Admin-0 polygons keyed by ISO3 with a color-blind-safer sequential blue scale (ColorBrewer Blues)
        and quantile classes among AMS that have data. Subnational pins are not used on sitrep maps.
      </p>
    </article>
  )
}
