'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { listPublicReportIssues, formatEpiBadge } from '@/lib/sitrep-api'
import type { ReportIssueCard } from '@/types/sitrep'

export default function ReportsArchivePage() {
  const [items, setItems] = useState<ReportIssueCard[]>([])
  useEffect(() => {
    listPublicReportIssues().then(setItems).catch(() => setItems([]))
  }, [])
  const byYear = useMemo(() => {
    const map = new Map<number, ReportIssueCard[]>()
    for (const item of items) {
      const list = map.get(item.epi_year) || []
      list.push(item)
      map.set(item.epi_year, list)
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0])
  }, [items])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black">Archive</h1>
      {byYear.length === 0 ? <p className="text-sm text-slate-500">No published issues.</p> : null}
      {byYear.map(([year, rows]) => (
        <section key={year}>
          <h2 className="mb-2 text-lg font-extrabold">{year}</h2>
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
            {rows.map((item) => (
              <li key={item.slug} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <Link href={`/reports/${item.slug}`} className="font-semibold text-[#0060A9]">
                  {item.title}
                </Link>
                <span className="shrink-0 text-xs text-slate-500">
                  {item.template_id ? `${item.template_id} · ` : ''}
                  {formatEpiBadge(item.epi_year, item.epi_week)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
