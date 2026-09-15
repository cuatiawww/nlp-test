'use client'

import Link from 'next/link'
import { Download, Printer } from 'lucide-react'
import AseanChoropleth from '@/components/reports/AseanChoropleth'
import { AmsBarChart, EpiCurveChart } from '@/components/reports/SitrepCharts'
import { formatEpiBadge, snapshotOf } from '@/lib/sitrep-api'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import type { AmsKpiRow, ReportIssue } from '@/types/sitrep'

function fmt(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return Number(n).toLocaleString()
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

function AmsTable({ rows }: { rows: AmsKpiRow[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="min-w-full text-left text-xs">
        <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">AMS</th>
            <th className="px-3 py-2">ISO3</th>
            <th className="px-3 py-2 text-right">Events</th>
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
                  <td className="px-3 py-2 text-right">{fmt(row.events)}</td>
                  <td className="px-3 py-2 text-right">{fmt(row.cases)}</td>
                  <td className="px-3 py-2 text-right">{fmt(row.deaths)}</td>
                  <td className="px-3 py-2 text-right">{row.cfr == null ? '—' : row.cfr}</td>
                </>
              ) : (
                <td className="px-3 py-2 text-slate-500" colSpan={4}>
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

export default function SitrepView({
  issue,
  preview = false,
  showPrintActions = true,
}: {
  issue: ReportIssue
  preview?: boolean
  showPrintActions?: boolean
}) {
  const snap = snapshotOf(issue)
  const indicator = (issue.map?.indicator || snap?.map?.indicator || 'events') as 'events' | 'cases' | 'deaths'
  const epi = formatEpiBadge(issue.epi_year, issue.epi_week)
  const ytd = snap?.kpis?.ytd || {}
  const week = snap?.kpis?.week || {}
  const highlights = (issue.highlights || []).filter((h) => h && h.trim())
  const cutoff = snap?.pulled_at || issue.published_at || issue.updated_at

  return (
    <article id="printable-sitrep" className="sitrep-document print-area space-y-6 text-slate-900">
      {preview ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 no-print">
          Preview — not a published bulletin. KPI tables are data-bound; notes require human review.
        </p>
      ) : null}

      <header className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#0060A9]">
              ABVC · Weekly situation report · {issue.template_id} {issue.template_version}
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">{issue.title}</h1>
            <p className="mt-2 text-sm text-slate-600">
              Reporting period {issue.period_start} – {issue.period_end} · {epi}
              {cutoff ? ` · Data cutoff ${new Date(cutoff).toLocaleString()}` : ''}
            </p>
          </div>
          {showPrintActions ? (
            <div className="no-print flex gap-2">
              <Link
                href={`/reports/${issue.slug}/print`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
              >
                <Printer className="h-3.5 w-3.5" /> Print / PDF
              </Link>
              <a
                href={`${PUBLIC_BASE_PATH}/reports/${issue.slug}.pdf`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0060A9] px-3 py-2 text-xs font-semibold text-white"
              >
                <Download className="h-3.5 w-3.5" /> {issue.slug}.pdf
              </a>
            </div>
          ) : null}
        </div>
      </header>

      <section>
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-700">Key highlights</h2>
        {highlights.length ? (
          <ul className="list-disc space-y-1 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-800">
            {highlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">
            No analyst highlights yet. KPI figures below are still authoritative.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-700">Regional overview</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="YTD events" value={fmt(Number(ytd.events))} hint="ASEAN-11 snapshot" />
          <KpiCard label="YTD cases" value={fmt(Number(ytd.cases))} hint="Extracted counts" />
          <KpiCard label="YTD deaths" value={fmt(Number(ytd.deaths))} />
          <KpiCard
            label="YTD CFR"
            value={snap?.kpis?.cfr_ytd == null ? '—' : `${snap.kpis.cfr_ytd}%`}
            hint="Blank if no case denominator"
          />
          <KpiCard label={`Week ${issue.epi_week} events`} value={fmt(Number(week.events))} />
          <KpiCard label={`Week ${issue.epi_week} cases`} value={fmt(Number(week.cases))} />
          <KpiCard label={`Week ${issue.epi_week} deaths`} value={fmt(Number(week.deaths))} />
          <KpiCard
            label="Week CFR"
            value={snap?.kpis?.cfr_week == null ? '—' : `${snap.kpis.cfr_week}%`}
          />
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Source of truth: materialized KPI snapshot {String(ytd.snapshot_id || snap?.snapshot?.['snapshot_id'] || '—')}.
          Numbers are not generated by language models.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">AMS table</h2>
        <AmsTable rows={snap?.by_ams || []} />
      </section>

      <AseanChoropleth
        rows={snap?.by_ams || []}
        indicator={indicator}
        epiLabel={epi}
        title={`Map: ${indicator} by AMS (Admin-0 polygons)`}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <EpiCurveChart series={snap?.series_weekly || []} epiLabel={epi} />
        <AmsBarChart rows={snap?.by_ams || []} indicator={indicator} epiLabel={epi} title={`AMS bar chart (${indicator})`} />
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">Disease blocks</h2>
        {(issue.sections || []).length === 0 ? (
          <p className="text-sm text-slate-500">No disease sections in this template pull.</p>
        ) : (
          (issue.sections || []).map((section) => (
            <div key={section.disease_code} className="break-inside-avoid rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-black text-slate-900">{section.name}</h3>
                <p className="text-xs text-slate-500">
                  Events {fmt(section.kpis?.events)} · Cases {fmt(section.kpis?.cases)} · Deaths {fmt(section.kpis?.deaths)}
                  {section.kpis?.cfr == null ? '' : ` · CFR ${section.kpis.cfr}%`}
                </p>
              </div>
              {section.analyst_note ? (
                <p className="mt-2 text-sm leading-relaxed text-slate-700">{section.analyst_note}</p>
              ) : (
                <p className="mt-2 text-xs italic text-slate-400">No analyst note (optional; human-reviewed if present).</p>
              )}
            </div>
          ))
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-700">Other alerts / events</h2>
        {(snap?.alerts || []).length ? (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Disease</th>
                  <th className="px-3 py-2">AMS</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2 text-right">Events</th>
                </tr>
              </thead>
              <tbody>
                {snap!.alerts.map((alert, i) => (
                  <tr key={`${alert.disease}-${alert.location_name}-${i}`} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                        {alert.status || 'Active'}
                      </span>
                    </td>
                    <td className="px-3 py-2">{alert.disease}</td>
                    <td className="px-3 py-2">{alert.display_name || alert.country}</td>
                    <td className="px-3 py-2">{alert.location_name}</td>
                    <td className="px-3 py-2 text-right">{fmt(alert.events)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
            No outbreak-alert flags in this snapshot.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-700">Notes, limitations & sources</h2>
        <p className="leading-relaxed">{issue.limitations}</p>
        <ul className="mt-3 list-disc space-y-1 px-4 text-xs text-slate-600">
          {(issue.sources || snap?.sources || []).map((src) => (
            <li key={`${src.name}-${src.source_type}`}>
              {src.name} ({src.source_type}) — {src.events} events
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-slate-500" id="sources">
          Publicly available sources processed by the ABVC NLP pipeline. Official national surveillance totals may differ.
          Template {issue.template_id} {issue.template_version}. LLM is not the body of this report.
        </p>
      </section>
    </article>
  )
}
