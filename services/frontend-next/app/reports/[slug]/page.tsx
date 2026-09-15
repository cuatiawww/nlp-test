'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import SitrepView from '@/components/reports/SitrepView'
import { fetchPublicReportIssue } from '@/lib/sitrep-api'
import type { ReportIssue } from '@/types/sitrep'

export default function ReportIssuePage() {
  const params = useParams<{ slug: string }>()
  const slug = decodeURIComponent(params.slug || '')
  const [issue, setIssue] = useState<ReportIssue | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    fetchPublicReportIssue(slug)
      .then(setIssue)
      .catch((err) => setError(err.message || 'Not found'))
  }, [slug])

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-white p-6 text-sm text-rose-700">
        {error}
      </div>
    )
  }
  if (!issue) return <p className="text-sm text-slate-500">Loading sitrep…</p>
  return <SitrepView issue={issue} />
}
