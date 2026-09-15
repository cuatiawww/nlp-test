'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { listPublicReportIssues, formatEpiBadge } from '@/lib/sitrep-api'
import type { ReportIssueCard } from '@/types/sitrep'

export default function ReportsByDiseasePage() {
  const params = useParams<{ code: string }>()
  const code = decodeURIComponent(params.code || '')
  const [items, setItems] = useState<ReportIssueCard[]>([])
  useEffect(() => {
    listPublicReportIssues({ disease: code }).then(setItems).catch(() => setItems([]))
  }, [code])
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Reports · {code}</h1>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No published issues tagged with this disease.</p>
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
