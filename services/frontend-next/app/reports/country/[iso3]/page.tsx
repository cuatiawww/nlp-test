'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { listPublicReportIssues, formatEpiBadge } from '@/lib/sitrep-api'
import { ISO3_DISPLAY } from '@/lib/asean-iso3'
import type { ReportIssueCard } from '@/types/sitrep'

export default function ReportsByCountryPage() {
  const params = useParams<{ iso3: string }>()
  const iso3 = decodeURIComponent(params.iso3 || '').toUpperCase()
  const [items, setItems] = useState<ReportIssueCard[]>([])
  useEffect(() => {
    listPublicReportIssues({ country: iso3 }).then(setItems).catch(() => setItems([]))
  }, [iso3])
  const label = ISO3_DISPLAY[iso3 as keyof typeof ISO3_DISPLAY] || iso3
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Reports · {label}</h1>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No published issues for this AMS.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.slug}>
              <Link href={`/reports/${item.slug}`} className="font-semibold text-[#0060A9]">
                {formatEpiBadge(item.epi_year, item.epi_week)} — {item.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
