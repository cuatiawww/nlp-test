'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listPublicReportIssues, formatEpiBadge, fetchLatestPublicReport } from '@/lib/sitrep-api'
import type { ReportIssueCard } from '@/types/sitrep'
import { ReportCoverThumbnail } from '@/components/reports/ReportCoverThumbnail'

function IssueCard({ item }: { item: ReportIssueCard }) {
  return (
    <Link
      href={`/reports/${item.slug}`}
      className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:-translate-y-0.5 hover:shadow-md"
    >
      {item.cover_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.cover_url} alt="" className="h-28 w-20 shrink-0 rounded-lg object-cover" />
      ) : (
        <ReportCoverThumbnail
          type="kemenkes_sitrep"
          period={formatEpiBadge(item.epi_year, item.epi_week)}
          title={item.title}
        />
      )}
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#0060A9]">
          {formatEpiBadge(item.epi_year, item.epi_week)} · Published
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

  const filtered = items.filter((item) => {
    const hay = `${item.title} ${item.slug} ${(item.diseases || []).join(' ')}`.toLowerCase()
    return hay.includes(q.toLowerCase())
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Epidemiological reports</h1>
          <p className="text-sm text-slate-600">
            Template sitreps bound to the ASEAN-11 KPI snapshot — not AI essay pages.
          </p>
        </div>
        <div className="flex gap-2">
          {latestSlug ? (
            <Link href="/reports/latest" className="rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-bold text-white">
              Browse latest
            </Link>
          ) : null}
          <Link href="/reports/archive" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700">
            Archive
          </Link>
        </div>
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter by title or disease"
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm"
      />
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {!error && filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No published sitreps yet. The report team creates issues from <code>weekly_sitrep_v1</code> in the CMS.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">{filtered.map((item) => <IssueCard key={item.slug} item={item} />)}</div>
      )}
    </div>
  )
}
