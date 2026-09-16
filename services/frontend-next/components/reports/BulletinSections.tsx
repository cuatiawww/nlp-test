'use client'

import AseanChoropleth from '@/components/reports/AseanChoropleth'
import PublicationCover from '@/components/reports/PublicationCover'
import {
  AmsBarChart,
  EpiCurveChart,
  WeeklyLineChart,
} from '@/components/reports/SitrepCharts'
import { NARRATIVE_LABELS, templateById } from '@/lib/report-templates'
import { buildSectionOrder, buildToc, looksLikeHtml } from '@/lib/report-outline.mjs'
import type { AmsKpiRow, ReportIssue, ReportSection, SitrepKpiPackage } from '@/types/sitrep'

function fmt(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return Number(n).toLocaleString()
}

function narrativeOf(issue: ReportIssue, key: string) {
  const raw = issue.narrative?.[key]
  return typeof raw === 'string' ? raw.trim() : ''
}

function HtmlOrText({ html, empty }: { html?: string; empty?: string }) {
  if (!html) {
    return <p className="text-sm italic text-slate-500">{empty || 'Not recorded (human field).'}</p>
  }
  if (looksLikeHtml(html)) {
    return <div className="sitrep-prose text-sm leading-relaxed text-slate-800" dangerouslySetInnerHTML={{ __html: html }} />
  }
  return <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{html}</p>
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-900">{value}</p>
      {hint ? <p className="text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  )
}

export function AmsTable({ rows, caption }: { rows: AmsKpiRow[]; caption?: string }) {
  return (
    <div className="sitrep-table-wrap overflow-x-auto rounded-2xl border border-slate-200 bg-white print:overflow-visible">
      {caption ? <p className="border-b border-slate-100 px-4 py-3 text-[11px] font-semibold text-slate-500" data-pdf-caption="">{caption}</p> : null}
      <table className="min-w-full text-left text-xs">
        <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">AMS</th>
            <th className="px-3 py-2">ISO3</th>
            <th className="px-3 py-2 text-right">Cases</th>
            <th className="px-3 py-2 text-right">Deaths</th>
            <th className="px-3 py-2 text-right">CFR %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.iso3 || row.country} className="border-t border-slate-100">
              <td className="px-3 py-2 font-semibold text-slate-800">{row.display_name}</td>
              <td className="px-3 py-2 font-mono text-slate-500">{row.iso3}</td>
              {row.has_data ? (
                <>
                  <td className="px-3 py-2 text-right">{fmt(row.cases)}</td>
                  <td className="px-3 py-2 text-right">{fmt(row.deaths)}</td>
                  <td className="px-3 py-2 text-right">{row.cfr == null ? '—' : row.cfr}</td>
                </>
              ) : (
                <td className="px-3 py-2 text-slate-500" colSpan={3}>
                  No data / Not reported
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DiseaseMatrix({ snap }: { snap: SitrepKpiPackage | null }) {
  const diseases = snap?.by_disease || []
  const matrix = snap?.matrix || []
  const ams = snap?.by_ams || []
  if (!diseases.length) {
    return <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">No disease×country cells in this snapshot.</p>
  }
  const cell = (code: string, iso3: string | null) =>
    matrix.find((row) => row.disease_code === code && row.iso3 === iso3)
  return (
    <div className="sitrep-table-wrap overflow-x-auto rounded-2xl border border-slate-200 bg-white print:overflow-visible">
      <table className="min-w-full text-left text-[11px]">
        <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="sticky left-0 bg-slate-50 px-3 py-2">Disease</th>
            {ams.map((row) => (
              <th key={row.iso3 || row.country} className="px-2 py-2 text-right">{row.display_name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {diseases.map((disease) => (
            <tr key={disease.disease_code} className="border-t border-slate-100">
              <th className="sticky left-0 bg-white px-3 py-2 text-left font-semibold text-slate-800">{disease.name}</th>
              {ams.map((row) => {
                const hit = cell(disease.disease_code, row.iso3)
                const missing = !hit || hit.has_data === false
                return (
                  <td key={`${disease.disease_code}-${row.iso3}`} className="px-2 py-2 text-right font-mono">
                    {missing ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span>
                        {fmt(hit!.cases)}
                        <span className="block text-[10px] text-slate-500">{fmt(hit!.deaths)} d</span>
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 py-2 text-[10px] text-slate-500" data-pdf-note="">
        Cases (deaths). Em dash is No data / Not reported — never a zero-filled missing cell. Source: KPI snapshot / event aggregates.
      </p>
    </div>
  )
}

function GlanceKpis({ issue, snap }: { issue: ReportIssue; snap: SitrepKpiPackage | null }) {
  const ytd = snap?.kpis?.ytd || {}
  const week = snap?.kpis?.week || {}
  const reported = (snap?.by_ams || []).filter((r) => r.has_data).length
  return (
    <section id="glance" data-pdf-page="" className="sitrep-card sitrep-major sitrep-keep sitrep-print-page break-inside-avoid rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
      <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-700">Situation at a Glance</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="YTD cases" value={fmt(ytd.cases == null ? null : Number(ytd.cases))} hint="Extracted counts" />
        <KpiCard label="YTD deaths" value={fmt(ytd.deaths == null ? null : Number(ytd.deaths))} />
        <KpiCard label="YTD CFR" value={snap?.kpis?.cfr_ytd == null ? '—' : `${snap.kpis.cfr_ytd}%`} hint="Blank if no case denominator" />
        <KpiCard label="AMS with data" value={`${reported} / 11`} hint="Missing is not zero" />
        <KpiCard label={`Week ${issue.epi_week} cases`} value={fmt(week.cases == null ? null : Number(week.cases))} />
        <KpiCard label={`Week ${issue.epi_week} deaths`} value={fmt(week.deaths == null ? null : Number(week.deaths))} />
        <KpiCard label="Week CFR" value={snap?.kpis?.cfr_week == null ? '—' : `${snap.kpis.cfr_week}%`} />
        <KpiCard label="Disease chapters" value={String((issue.sections || []).length)} />
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Source of truth: materialized KPI snapshot {String(ytd.snapshot_id || snap?.snapshot?.['snapshot_id'] || '—')}.
        Numbers are not generated by language models. Maps and charts show cases, deaths, and CFR only.
      </p>
    </section>
  )
}

function DiseaseChapter({
  section,
  epi,
}: {
  section: ReportSection
  epi: string
}) {
  const code = section.disease_code
  const series = section.series_weekly || []
  return (
    <section id={`chapter-${code}`} data-pdf-page="" data-pdf-break="before" data-pdf-split="" className="sitrep-chapter sitrep-page-start sitrep-card sitrep-print-page space-y-4 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
      <div className="sitrep-keep space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-black text-slate-900">{section.name}</h2>
          <p className="text-xs text-slate-500">
            {section.has_data === false
              ? 'No data / Not reported in this window'
              : `Cases ${fmt(section.kpis?.cases)} · Deaths ${fmt(section.kpis?.deaths)}${section.kpis?.cfr == null ? '' : ` · CFR ${section.kpis.cfr}%`}`}
          </p>
        </div>
        <div id={`chapter-${code}-highlights`}>
          <h3 className="mb-1 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Highlights and Situation Overview</h3>
          <HtmlOrText html={section.analyst_note} empty="No analyst note yet (optional; human-reviewed if present)." />
        </div>
      </div>
      <div id={`chapter-${code}-table`} className="sitrep-table-wrap">
        <AmsTable rows={section.by_ams || []} caption={`${section.name} cases and deaths in ASEAN`} />
      </div>
      <div id={`chapter-${code}-curve`} data-pdf-split="" className="grid gap-3 print:grid-cols-1 lg:grid-cols-2">
        <EpiCurveChart series={series} title={`${section.name} epidemic curve`} epiLabel={epi} />
        <WeeklyLineChart series={series} title={`${section.name} weekly new cases and deaths`} epiLabel={epi} />
      </div>
      <div id={`chapter-${code}-map`} className="sitrep-page-start sitrep-keep" data-pdf-break="before">
        <AseanChoropleth
          rows={section.by_ams || []}
          indicator="cases"
          epiLabel={epi}
          title={`${section.name} · cases by AMS (Admin-0 polygons)`}
        />
      </div>
      <div id={`chapter-${code}-ams-bar`} className="sitrep-keep">
        <AmsBarChart rows={section.by_ams || []} indicator="cases" title={`${section.name} · AMS cases`} epiLabel={epi} />
      </div>
    </section>
  )
}

function CoverBlock({ issue, epi }: { issue: ReportIssue; epi: string }) {
  const cover = issue.cover_url || issue.assets?.cover_url
  if (cover) {
    return (
      <figure id="cover" data-pdf-page="" className="sitrep-card sitrep-major sitrep-keep sitrep-print-page break-inside-avoid overflow-hidden rounded-2xl border border-slate-200 bg-white p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cover} alt="" className="max-h-[320px] w-full object-cover" />
        <figcaption className="px-6 py-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#0060A9]">ABVC · {templateById(issue.template_id).label}</p>
          <h1 className="text-xl font-black">{issue.title}</h1>
          <p className="text-sm text-slate-600">{issue.period_start} – {issue.period_end} · {epi}</p>
        </figcaption>
      </figure>
    )
  }
  return (
    <div id="cover" data-pdf-page="" className="sitrep-major sitrep-keep sitrep-print-page break-inside-avoid">
      <PublicationCover
        variant="page"
        templateId={issue.template_id}
        title={issue.title}
        period={`${issue.period_start} – ${issue.period_end}`}
        epiLabel={epi}
      />
    </div>
  )
}

function ExtraPage({ id, url, caption }: { id: string; url: string; caption?: string }) {
  return (
    <figure id={id} data-pdf-page="" className="sitrep-card sitrep-keep sitrep-print-page break-inside-avoid overflow-hidden rounded-2xl border border-slate-200 bg-white p-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={caption || ''} className="w-full object-contain" />
      {caption ? <figcaption className="px-4 py-2 text-xs text-slate-600">{caption}</figcaption> : null}
    </figure>
  )
}

export default function BulletinSections({
  issue,
  snap,
  epi,
  highlights,
}: {
  issue: ReportIssue
  snap: SitrepKpiPackage | null
  epi: string
  highlights: string[]
}) {
  const tpl = templateById(issue.template_id)
  const indicator = ((issue.map?.indicator === 'deaths' ? 'deaths' : 'cases') as 'cases' | 'deaths')
  const diseases = (issue.sections || []).map((s) => ({ disease_code: s.disease_code, name: s.name }))
  const order = (issue.section_order && issue.section_order.length
    ? issue.section_order
    : buildSectionOrder(issue.template_id, diseases)) as { id: string; label: string }[]
  const toc = buildToc(issue.template_id, diseases)
  const pages = issue.assets?.pages || []

  const render = (id: string) => {
    if (id === 'cover') return <CoverBlock key={id} issue={issue} epi={epi} />
    if (id === 'publisher') {
      return (
        <section key={id} id="publisher" data-pdf-page="" className="sitrep-card sitrep-major sitrep-keep sitrep-print-page break-inside-avoid rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-700">{NARRATIVE_LABELS.publisher}</h2>
          <HtmlOrText html={[narrativeOf(issue, 'publisher'), narrativeOf(issue, 'editorial')].filter(Boolean).join('\n\n')} empty="Publisher / editorial board not yet entered." />
        </section>
      )
    }
    if (id === 'toc') {
      return (
        <section key={id} id="toc" data-pdf-page="" className="sitrep-card sitrep-major sitrep-keep sitrep-print-page break-inside-avoid rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-700">Contents</h2>
          <ol className="list-decimal space-y-1 px-5 text-sm">
            {toc.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="font-semibold text-[#0060A9] hover:underline">{item.label}</a>
                {item.children?.length ? (
                  <ol className="mt-1 list-disc px-4 text-xs text-slate-600">
                    {item.children.map((child) => (
                      <li key={child.href}><a href={child.href} className="hover:underline">{child.label}</a></li>
                    ))}
                  </ol>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      )
    }
    if (id === 'exec_summary') {
      return (
        <section key={id} id="exec-summary" data-pdf-page="" className="sitrep-card sitrep-major sitrep-keep sitrep-print-page break-inside-avoid rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-700">
            {tpl.family === 'sitrep' ? 'Key highlights' : 'Executive summary'}
          </h2>
          {highlights.length ? (
            <ul className="list-disc space-y-1 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-800">
              {highlights.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">
              No analyst highlights yet. KPI figures below remain authoritative.
            </p>
          )}
        </section>
      )
    }
    if (id === 'glance') return <GlanceKpis key={id} issue={issue} snap={snap} />
    if (id === 'matrix') {
      return (
        <section key={id} id="matrix" data-pdf-page="" className="sitrep-card sitrep-major sitrep-table-page sitrep-print-page space-y-3 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-700" data-pdf-caption="">Disease × Country matrix</h2>
          <DiseaseMatrix snap={snap} />
        </section>
      )
    }
    if (id === 'map') {
      return (
        <section key={id} id="map" data-pdf-page="" data-pdf-break="before" className="sitrep-page-start sitrep-major sitrep-keep sitrep-print-page break-inside-avoid">
          <AseanChoropleth
            rows={snap?.by_ams || []}
            indicator={indicator}
            epiLabel={epi}
            title={`ASEAN choropleth: ${indicator} by AMS (Admin-0 polygons)`}
          />
        </section>
      )
    }
    if (id === 'ams_table') {
      return (
        <section key={id} id="ams-table" data-pdf-page="" className="sitrep-card sitrep-major sitrep-table-page sitrep-print-page space-y-3 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">AMS cases / deaths / CFR</h2>
          <AmsTable rows={snap?.by_ams || []} />
        </section>
      )
    }
    if (id === 'weekly_chart') {
      return (
        <section key={id} id="weekly-chart" data-pdf-page="" data-pdf-split="" className="sitrep-print-page grid gap-3 print:grid-cols-1 lg:grid-cols-2">
          <EpiCurveChart series={snap?.series_weekly || []} epiLabel={epi} title="Weekly new cases and deaths (ASEAN-11)" />
          <WeeklyLineChart series={snap?.series_weekly || []} epiLabel={epi} title="Weekly trend (cases and deaths)" />
        </section>
      )
    }
    if (id.startsWith('chapter:')) {
      const code = id.slice('chapter:'.length)
      const section = (issue.sections || []).find((s) => s.disease_code === code)
      if (!section) return null
      return <DiseaseChapter key={id} section={section} epi={epi} />
    }
    if (id === 'country_updates' || id === 'response' || id === 'recommendations' || id === 'definitions' || id === 'abstract' || id === 'methods' || id === 'discussion') {
      return (
        <section key={id} id={id} data-pdf-page="" className="sitrep-card sitrep-major sitrep-keep sitrep-print-page break-inside-avoid rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-700">{NARRATIVE_LABELS[id] || id}</h2>
          <HtmlOrText html={narrativeOf(issue, id)} />
        </section>
      )
    }
    if (id === 'sources') {
      return (
        <section key={id} id="sources" data-pdf-page="" className="sitrep-card sitrep-major sitrep-keep sitrep-print-page break-inside-avoid rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 text-sm text-slate-700">
          <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-700">Notes, limitations & sources</h2>
          <p className="leading-relaxed">{issue.limitations}</p>
          <ul className="mt-3 list-disc space-y-1 px-4 text-xs text-slate-600">
            {(issue.sources || snap?.sources || []).map((src) => (
              <li key={`${src.name}-${src.source_type}`}>{src.name} ({src.source_type})</li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-slate-500">
            Publicly available sources processed by the ABVC NLP pipeline. Official national surveillance totals may differ.
            Template {issue.template_id} {issue.template_version}. LLM is not the body of this report.
          </p>
        </section>
      )
    }
    if (id.startsWith('extra:')) {
      const pageId = id.slice('extra:'.length)
      const page = pages.find((p) => p.id === pageId)
      if (!page) return null
      return <ExtraPage key={id} id={id} url={page.url} caption={page.caption} />
    }
    return null
  }

  return <>{order.map((item) => render(item.id))}</>
}
