export default function ReportsMethodologyPage() {
  return (
    <article className="prose prose-slate max-w-none space-y-4 text-sm text-slate-700">
      <h1 className="text-2xl font-black text-slate-900">Methodology</h1>
      <p>
        ABVC publications at <code>/nlp/reports</code> are versioned template packages bound to the ASEAN-11
        materialized KPI snapshot (the same snapshot used by the dashboard, TV wall, and event matrix). Language
        models are not used to write the body of a bulletin. Optional draft bullets are filled from KPI fields and
        must be human-reviewed.
      </p>
      <h2 className="text-lg font-extrabold text-slate-900">Publication families</h2>
      <p>
        Section order follows public epidemiological bulletin practice (MMWR-style chapters; operational SitRep
        glance KPIs → map → table → weekly chart → updates → response). Branding, logos, and publisher identity are
        ABVC’s own — not copied from third-party PDF covers.
      </p>
      <ul>
        <li>
          <strong>Epidemiological bulletin</strong> (<code>mmwr_bulletin_v1</code>, primary): cover → publisher /
          editorial → linked contents → executive summary → disease chapters (tables, Admin-0 maps, line/bar, small
          multiples) → source notes → print page numbers.
        </li>
        <li>
          <strong>Situation report</strong> (<code>situation_report_v1</code>, primary; legacy alias{' '}
          <code>weekly_sitrep_v1</code>): glance KPIs → health-zone choropleth → AMS cases/deaths/CFR table → weekly
          chart → country updates → epidemiology → response → recommendations → references.
        </li>
        <li>
          <strong>Epidemic intelligence</strong> (<code>epidemic_intelligence_v1</code>): cover + regional map →
          editorial → definitions → two-week event summary → executive summary → disease-signal visual → summary
          table → references.
        </li>
        <li>
          <strong>Focus report</strong> (<code>focus_report_v1</code>): abstract → methods → results (small multiples
          + AMS×week heatmap) → discussion → limitations → references.
        </li>
      </ul>
      <p>
        One published edition is allowed per template per epi week. A bulletin and a SitRep may both exist for the
        same week. The public gallery lists frozen editions only; it is not the live event matrix.
      </p>
      <h2 className="text-lg font-extrabold text-slate-900">Scope</h2>
      <p>
        Default geography is 11 jurisdictions: Brunei, Cambodia, Indonesia, Lao PDR, Malaysia, Myanmar, Philippines,
        Singapore, Thailand, Viet Nam, and Timor-Leste. Join keys for maps are ISO 3166-1 alpha-3.
      </p>
      <h2 className="text-lg font-extrabold text-slate-900">Missing data</h2>
      <p>
        An AMS with no matching events in the reporting window is shown as <strong>No data / Not reported</strong>.
        That state is never painted as zero on the choropleth or heatmap and never uses the lightest sequential class.
        A true zero appears only when the AMS had matching events and extracted counts summed to 0.
      </p>
      <h2 className="text-lg font-extrabold text-slate-900" id="sources">
        Sources
      </h2>
      <p>
        Event extracts come from publicly available news, official, and partner feeds processed by the NLP pipeline
        (health-related, non-UNKNOWN disease, confidence ≥ 0.15, SKDR detached). Official national surveillance totals
        may differ.
      </p>
      <h2 className="text-lg font-extrabold text-slate-900">Maps</h2>
      <p>
        Choropleths use Admin-0 polygons keyed by ISO3 with a color-blind-safer sequential blue scale (ColorBrewer Blues)
        and quantile classes among AMS that have data. Subnational pins are not used on publication maps.
      </p>
    </article>
  )
}
