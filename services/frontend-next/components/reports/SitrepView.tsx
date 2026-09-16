'use client'

import Link from 'next/link'
import { Download, Printer } from 'lucide-react'
import AseanChoropleth from '@/components/reports/AseanChoropleth'
import PublicationCover from '@/components/reports/PublicationCover'
import BulletinSections from '@/components/reports/BulletinSections'
import {
  AmsBarChart,
  AmsWeekHeatmap,
  DiseaseSmallMultiples,
  EpiCurveChart,
  WeeklyLineChart,
} from '@/components/reports/SitrepCharts'
import { formatEpiBadge, snapshotOf } from '@/lib/sitrep-api'
import { NARRATIVE_LABELS, templateById } from '@/lib/report-templates'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import type { AmsKpiRow, ReportIssue, SitrepKpiPackage } from '@/types/sitrep'

function fmt(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return Number(n).toLocaleString()
}

function narrativeOf(issue: ReportIssue, key: string) {
  const raw = issue.narrative?.[key]
  return typeof raw === 'string' ? raw.trim() : ''
}

function narrativeDraftMeta(issue: ReportIssue) {
  const raw = issue.narrative?.['_draft']
  if (!raw || typeof raw === 'string') return null
  return raw as { llm_used?: boolean; cached?: boolean; model?: string }
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

function ProseSection({
  id,
  title,
  body,
  empty,
}: {
  id: string
  title: string
  body?: string
  empty?: string
}) {
  return (
    <section id={id} className="sitrep-card sitrep-print-page break-inside-avoid rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
      <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-700">{title}</h2>
      {body ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{body}</p>
      ) : (
        <p className="text-sm italic text-slate-500">{empty || 'Not recorded (human field).'}</p>
      )}
    </section>
  )
}

function GlanceKpis({ issue, snap }: { issue: ReportIssue; snap: SitrepKpiPackage | null }) {
  const ytd = snap?.kpis?.ytd || {}
  const week = snap?.kpis?.week || {}
  return (
    <section id="glance" className="sitrep-print-page">
      <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-700">Glance KPIs</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="YTD cases" value={fmt(ytd.cases == null ? null : Number(ytd.cases))} hint="Extracted counts" />
        <KpiCard label="YTD deaths" value={fmt(ytd.deaths == null ? null : Number(ytd.deaths))} />
        <KpiCard
          label="YTD CFR"
          value={snap?.kpis?.cfr_ytd == null ? '—' : `${snap.kpis.cfr_ytd}%`}
          hint="Blank if no case denominator"
        />
        <KpiCard
          label="AMS with data"
          value={`${(snap?.by_ams || []).filter((r) => r.has_data).length} / 11`}
          hint="Missing is not zero"
        />
        <KpiCard label={`Week ${issue.epi_week} cases`} value={fmt(week.cases == null ? null : Number(week.cases))} />
        <KpiCard label={`Week ${issue.epi_week} deaths`} value={fmt(week.deaths == null ? null : Number(week.deaths))} />
        <KpiCard label="Week CFR" value={snap?.kpis?.cfr_week == null ? '—' : `${snap.kpis.cfr_week}%`} />
        <KpiCard label="Disease chapters" value={String((issue.sections || []).length)} />
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Source of truth: materialized KPI snapshot {String(ytd.snapshot_id || snap?.snapshot?.['snapshot_id'] || '—')}.
        Numbers are not generated by language models.
      </p>
    </section>
  )
}

function DiseaseChapters({ issue, snap }: { issue: ReportIssue; snap: SitrepKpiPackage | null }) {
  const byDisease = snap?.series_by_disease || []
  return (
    <section id="chapters" className="space-y-4">
      <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">Disease chapters</h2>
      {(issue.sections || []).length === 0 ? (
        <p className="text-sm text-slate-500">No disease chapters in this KPI pull.</p>
      ) : (
        (issue.sections || []).map((section) => {
          const series =
            byDisease.find((d) => d.disease_code === section.disease_code)?.series ||
            section.series_weekly ||
            []
          return (
            <div
              key={section.disease_code}
              id={`chapter-${section.disease_code}`}
              className="sitrep-print-page space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-black text-slate-900">{section.name}</h3>
                <p className="text-xs text-slate-500">
                  Cases {fmt(section.kpis?.cases)} · Deaths {fmt(section.kpis?.deaths)}
                  {section.kpis?.cfr == null ? '' : ` · CFR ${section.kpis.cfr}%`}
                </p>
              </div>
              {section.analyst_note ? (
                <p className="text-sm leading-relaxed text-slate-700">{section.analyst_note}</p>
              ) : (
                <p className="text-xs italic text-slate-400">No analyst note (optional; human-reviewed if present).</p>
              )}
              <div className="grid gap-3 lg:grid-cols-2">
                <WeeklyLineChart series={series} title={`${section.name} weekly`} />
                <AmsBarChart
                  rows={section.by_ams || snap?.by_ams || []}
                  indicator="cases"
                  title={`${section.name} · AMS cases`}
                />
              </div>
            </div>
          )
        })
      )}
    </section>
  )
}

function AlertsTable({ snap }: { snap: SitrepKpiPackage | null }) {
  return (
    <section id="alerts">
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
                <th className="px-3 py-2 text-right">Cases</th>
                <th className="px-3 py-2 text-right">Deaths</th>
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
                  <td className="px-3 py-2 text-right">{fmt(alert.cases)}</td>
                  <td className="px-3 py-2 text-right">{fmt(alert.deaths)}</td>
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
  )
}

function SourcesBlock({ issue, snap }: { issue: ReportIssue; snap: SitrepKpiPackage | null }) {
  return (
    <section id="sources" className="sitrep-print-page rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
      <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-700">Notes, limitations & sources</h2>
      <p className="leading-relaxed">{issue.limitations}</p>
      <ul className="mt-3 list-disc space-y-1 px-4 text-xs text-slate-600">
        {(issue.sources || snap?.sources || []).map((src) => (
          <li key={`${src.name}-${src.source_type}`}>
            {src.name} ({src.source_type}) — {src.events} events
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-slate-500">
        Publicly available sources processed by the ABVC NLP pipeline. Official national surveillance totals may differ.
        Template {issue.template_id} {issue.template_version}. LLM is not the body of this report.
      </p>
    </section>
  )
}

function Toc({ items }: { items: { href: string; label: string }[] }) {
  return (
    <section id="toc" className="sitrep-print-page rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-700">Contents</h2>
      <ol className="list-decimal space-y-1 px-5 text-sm">
        {items.map((item) => (
          <li key={item.href}>
            <a href={item.href} className="font-semibold text-[#0060A9] hover:underline">
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </section>
  )
}

function TwoWeekSummary({ snap }: { snap: SitrepKpiPackage | null }) {
  const weeks = (snap?.series_weekly || []).slice(-2)
  return (
    <section id="two-week" className="sitrep-print-page">
      <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-700">Two-week cases and deaths</h2>
      {weeks.length ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Week</th>
                <th className="px-3 py-2 text-right">Cases</th>
                <th className="px-3 py-2 text-right">Deaths</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((row) => (
                <tr key={`${row.year}-${row.week}`} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-semibold">EW {String(row.week).padStart(2, '0')} / {row.year}</td>
                  <td className="px-3 py-2 text-right">{fmt(row.cases)}</td>
                  <td className="px-3 py-2 text-right">{fmt(row.deaths)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
          No weekly points in this snapshot.
        </p>
      )}
    </section>
  )
}

function MmwrBody({
  issue,
  snap,
  indicator,
  epi,
  highlights,
}: {
  issue: ReportIssue
  snap: SitrepKpiPackage | null
  indicator: 'events' | 'cases' | 'deaths'
  epi: string
  highlights: string[]
}) {
  return (
    <>
      <div id="cover">
        <PublicationCover
          variant="page"
          templateId={issue.template_id}
          title={issue.title}
          period={`${issue.period_start} – ${issue.period_end}`}
          epiLabel={epi}
        />
      </div>
      <ProseSection
        id="publisher"
        title={NARRATIVE_LABELS.publisher}
        body={[narrativeOf(issue, 'publisher'), narrativeOf(issue, 'editorial')].filter(Boolean).join('\n\n')}
        empty="Publisher / editorial board not yet entered."
      />
      <Toc
        items={[
          { href: '#exec-summary', label: 'Executive summary' },
          { href: '#chapters', label: 'Disease chapters' },
          { href: '#figures', label: 'Maps, tables, and small multiples' },
          { href: '#sources', label: 'Source notes' },
        ]}
      />
      <section id="exec-summary" className="sitrep-print-page">
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-700">Executive summary</h2>
        {highlights.length ? (
          <ul className="list-disc space-y-1 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-800">
            {highlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">
            No analyst highlights yet. KPI figures below remain authoritative.
          </p>
        )}
        <div className="mt-4">
          <GlanceKpis issue={issue} snap={snap} />
        </div>
      </section>
      <DiseaseChapters issue={issue} snap={snap} />
      <section id="figures" className="space-y-4 sitrep-print-page">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">Maps, tables, and small multiples</h2>
        <AmsTable rows={snap?.by_ams || []} />
        <AseanChoropleth
          rows={snap?.by_ams || []}
          indicator={indicator}
          epiLabel={epi}
          title={`Map: ${indicator} by AMS (Admin-0 polygons)`}
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <WeeklyLineChart series={snap?.series_weekly || []} epiLabel={epi} />
          <EpiCurveChart series={snap?.series_weekly || []} epiLabel={epi} />
        </div>
        <AmsBarChart rows={snap?.by_ams || []} indicator={indicator} epiLabel={epi} />
        <DiseaseSmallMultiples series={snap?.series_by_disease || []} />
      </section>
      <SourcesBlock issue={issue} snap={snap} />
    </>
  )
}

function SitrepBody({
  issue,
  snap,
  indicator,
  epi,
  highlights,
}: {
  issue: ReportIssue
  snap: SitrepKpiPackage | null
  indicator: 'events' | 'cases' | 'deaths'
  epi: string
  highlights: string[]
}) {
  return (
    <>
      {highlights.length ? (
        <section id="exec-summary">
          <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-700">Key highlights</h2>
          <ul className="list-disc space-y-1 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-800">
            {highlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <GlanceKpis issue={issue} snap={snap} />
      <section id="map" className="sitrep-print-page">
        <AseanChoropleth
          rows={snap?.by_ams || []}
          indicator={indicator}
          epiLabel={epi}
          title={`Health-zone map: ${indicator} by AMS (Admin-0)`}
        />
      </section>
      <section id="ams-table" className="sitrep-print-page space-y-3">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">AMS cases / deaths / CFR</h2>
        <AmsTable rows={snap?.by_ams || []} />
      </section>
      <section id="weekly-chart" className="sitrep-print-page">
        <EpiCurveChart series={snap?.series_weekly || []} epiLabel={epi} title="Weekly chart (ASEAN-11)" />
      </section>
      <ProseSection
        id="country-updates"
        title="Country updates"
        body={narrativeOf(issue, 'country_updates')}
        empty="No country-update notes for this edition."
      />
      <section id="epidemiology" className="space-y-4 sitrep-print-page">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">Epidemiology</h2>
        {(issue.sections || []).map((section) => (
          <div key={section.disease_code} className="break-inside-avoid rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-base font-black text-slate-900">{section.name}</h3>
              <p className="text-xs text-slate-500">
                Cases {fmt(section.kpis?.cases)} · Deaths {fmt(section.kpis?.deaths)}
                {section.kpis?.cfr == null ? '' : ` · CFR ${section.kpis.cfr}%`}
              </p>
            </div>
            {section.analyst_note ? (
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{section.analyst_note}</p>
            ) : null}
          </div>
        ))}
        <AlertsTable snap={snap} />
      </section>
      <ProseSection id="response" title="Response" body={narrativeOf(issue, 'response')} />
      <ProseSection id="recommendations" title="Recommendations" body={narrativeOf(issue, 'recommendations')} />
      <SourcesBlock issue={issue} snap={snap} />
    </>
  )
}

function EiBody({
  issue,
  snap,
  indicator,
  epi,
  highlights,
}: {
  issue: ReportIssue
  snap: SitrepKpiPackage | null
  indicator: 'events' | 'cases' | 'deaths'
  epi: string
  highlights: string[]
}) {
  return (
    <>
      <div id="cover" className="space-y-4">
        <PublicationCover
          variant="page"
          templateId={issue.template_id}
          title={issue.title}
          period={`${issue.period_start} – ${issue.period_end}`}
          epiLabel={epi}
        />
        <AseanChoropleth
          rows={snap?.by_ams || []}
          indicator={indicator}
          epiLabel={epi}
          title="Regional map (Admin-0)"
        />
      </div>
      <ProseSection id="editorial" title="Editorial" body={narrativeOf(issue, 'editorial')} />
      <ProseSection id="definitions" title="Definitions" body={narrativeOf(issue, 'definitions')} />
      <TwoWeekSummary snap={snap} />
      <section id="exec-summary">
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-700">Executive summary</h2>
        {highlights.length ? (
          <ul className="list-disc space-y-1 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm">
            {highlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No executive bullets yet.</p>
        )}
      </section>
      <section id="disease-signal" className="sitrep-print-page">
        <DiseaseSmallMultiples series={snap?.series_by_disease || []} title="Disease-signal visual" />
      </section>
      <section id="summary-table" className="sitrep-print-page space-y-3">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">Summary table</h2>
        <AmsTable rows={snap?.by_ams || []} />
      </section>
      <SourcesBlock issue={issue} snap={snap} />
    </>
  )
}

function FocusBody({
  issue,
  snap,
}: {
  issue: ReportIssue
  snap: SitrepKpiPackage | null
}) {
  return (
    <>
      <ProseSection id="abstract" title="Abstract" body={narrativeOf(issue, 'abstract')} />
      <ProseSection id="methods" title="Methods" body={narrativeOf(issue, 'methods')} />
      <section id="results" className="space-y-4 sitrep-print-page">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">Results</h2>
        <GlanceKpis issue={issue} snap={snap} />
        <DiseaseSmallMultiples series={snap?.series_by_disease || []} />
        <AmsWeekHeatmap rows={snap?.ams_weekly} fallbackWeeks={snap?.series_weekly} />
        <AmsTable rows={snap?.by_ams || []} />
      </section>
      <ProseSection id="discussion" title="Discussion" body={narrativeOf(issue, 'discussion')} />
      <section id="limitations" className="sitrep-print-page rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-amber-900">Limitations</h2>
        <p className="text-sm leading-relaxed text-amber-950">{issue.limitations}</p>
        <p className="mt-3 text-xs text-amber-900">
          Strong caveat: extracted media counts are not official national surveillance totals. AMS without matching
          events must be read as No data / Not reported, never as zero incidence.
        </p>
      </section>
      <SourcesBlock issue={issue} snap={snap} />
    </>
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
  const tpl = templateById(issue.template_id)
  const rawIndicator = issue.map?.indicator || snap?.map?.indicator || 'cases'
  const indicator = (rawIndicator === 'deaths' ? 'deaths' : 'cases') as 'cases' | 'deaths'
  const epi = formatEpiBadge(issue.epi_year, issue.epi_week)
  const highlights = (issue.highlights || []).filter((h) => h && h.trim())
  const cutoff = snap?.pulled_at || issue.published_at || issue.updated_at

  return (
    <article id="printable-sitrep" className="sitrep-document print-area mx-auto max-w-[210mm] space-y-8 bg-white px-6 py-8 text-slate-900 sm:px-10 sm:py-10">
      {preview ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 no-print">
          Preview — not a published edition. KPI tables are data-bound; narrative slots require human review.
          {narrativeDraftMeta(issue)?.llm_used
            ? ` DeepSeek draft (${narrativeDraftMeta(issue)?.cached ? 'cached' : 'fresh'}) — edit before publish.`
            : ''}
        </p>
      ) : null}

      <header data-pdf-page="" className="sitrep-masthead sitrep-card sitrep-print-page break-inside-avoid rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#0060A9]">
              ABVC · {tpl.label} · {tpl.id} {issue.template_version}
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

      {tpl.family === 'mmwr' || tpl.family === 'sitrep' ? (
        <BulletinSections issue={issue} snap={snap} epi={epi} highlights={highlights} />
      ) : tpl.family === 'ei' ? (
        <EiBody issue={issue} snap={snap} indicator={indicator} epi={epi} highlights={highlights} />
      ) : tpl.family === 'focus' ? (
        <FocusBody issue={issue} snap={snap} />
      ) : (
        <BulletinSections issue={issue} snap={snap} epi={epi} highlights={highlights} />
      )}
    </article>
  )
}
