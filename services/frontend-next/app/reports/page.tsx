'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { listPublicReportIssues, formatEpiBadge, fetchLatestPublicReport } from '@/lib/sitrep-api'
import type { ReportIssueCard } from '@/types/sitrep'
import PublicationCover from '@/components/reports/PublicationCover'
import ReportsModeNav from '@/components/reports/ReportsModeNav'
import { templateById, type TemplateFamily } from '@/lib/report-templates'

const FILTERS: Array<{ id: 'all' | TemplateFamily; label: string }> = [
  { id: 'all', label: 'All editions' },
  { id: 'mmwr', label: 'Bulletin' },
  { id: 'sitrep', label: 'SitRep' },
  { id: 'ei', label: 'Epidemic intelligence' },
  { id: 'focus', label: 'Focus' },
]

function IssueCard({ item }: { item: ReportIssueCard }) {
  const tpl = templateById(item.template_id)
  return (
    <Link
      href={`/reports/${item.slug}`}
      className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:-translate-y-0.5 hover:shadow-md"
    >
      {item.cover_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.cover_url} alt="" className="h-32 w-24 shrink-0 rounded-lg object-cover" />
      ) : (
        <PublicationCover
          templateId={item.template_id}
          title={item.title}
          period={formatEpiBadge(item.epi_year, item.epi_week)}
          epiLabel={formatEpiBadge(item.epi_year, item.epi_week)}
        />
      )}
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#0060A9]">
          {tpl.short} · {formatEpiBadge(item.epi_year, item.epi_week)}
        </p>
        <h2 className="mt-1 text-base font-black leading-snug text-slate-900">{item.title}</h2>
        <p className="mt-1 text-xs text-slate-500">
          {item.period_start} – {item.period_end}
          {item.diseases?.length ? ` · ${item.diseases.slice(0, 3).join(', ')}` : ''}
        </p>
        <p className="mt-2 text-xs font-semibold text-slate-600">
          Events {item.kpis?.events ?? '—'} · Cases {item.kpis?.cases ?? '—'} · Deaths {item.kpis?.deaths ?? '—'}
        </p>
      </div>
    </Link>
  )
}

export default function ReportsGalleryPage() {
  const [items, setItems] = useState<ReportIssueCard[]>([])
  const [q, setQ] = useState('')
  const [family, setFamily] = useState<'all' | TemplateFamily>('all')
  const [error, setError] = useState<string | null>(null)
  const [latestSlug, setLatestSlug] = useState<string | null>(null)

  useEffect(() => {
    listPublicReportIssues()
      .then(setItems)
      .catch((err) => setError(err.message || 'Failed to load reports'))
    fetchLatestPublicReport()
      .then((row) => setLatestSlug(row?.slug || null))
      .catch(() => setLatestSlug(null))
  }, [])

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const tpl = templateById(item.template_id)
      if (family !== 'all' && tpl.family !== family) return false
      const hay = `${item.title} ${item.slug} ${(item.diseases || []).join(' ')} ${tpl.label}`.toLowerCase()
      return hay.includes(q.toLowerCase())
    })
  }, [items, q, family])

  return (
    <div className="space-y-5">
      <ReportsModeNav />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Publications</h1>
          <p className="text-sm text-slate-600">
            Published bulletins and situation reports. Each edition is a versioned template filled from the ASEAN-11 KPI
            snapshot, then frozen on publish.
          </p>
        </div>
        <div className="flex gap-2">
          {latestSlug ? (
            <Link href="/reports/latest" className="rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-bold text-white">
              Latest edition
            </Link>
          ) : null}
          <Link href="/reports/archive" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700">
            Archive
          </Link>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setFamily(chip.id)}
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              family === chip.id ? 'bg-[#0060A9] text-white' : 'border border-slate-200 bg-white text-slate-600'
            }`}
            aria-pressed={family === chip.id}
          >
            {chip.label}
          </button>
        ))}
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter by title or disease"
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm"
      />
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {!error && items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-lg font-black text-slate-900">
            {family === 'all'
              ? '0 published bulletin / SitRep editions'
              : `0 published ${FILTERS.find((chip) => chip.id === family)?.label || family} editions`}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            This gallery lists frozen publications only. Analysts generate a draft from KPIs (Generate draft), review
            in CMS, then publish. Live filters stay on Matrix &amp; ledger.
          </p>
        </div>
      ) : !error && filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
          No editions match this filter.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">{filtered.map((item) => <IssueCard key={item.slug} item={item} />)}</div>
      )}
      <p className="text-[11px] text-slate-500">
        Operational live view:{' '}
        <Link href="/reports/matrix" className="font-semibold text-slate-600 underline">
          Matrix &amp; ledger
        </Link>
        {' · '}
        <Link href="/reports/generate" className="font-semibold text-slate-600 underline">
          Generate draft
        </Link>
        .
      </p>
    </div>
  )
}
