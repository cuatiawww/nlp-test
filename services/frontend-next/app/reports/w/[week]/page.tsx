'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { listPublicReportIssues } from '@/lib/sitrep-api'

export default function ReportByWeekPage() {
  const params = useParams<{ week: string }>()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const raw = decodeURIComponent(params.week || '')

  useEffect(() => {
    const match = raw.match(/^(\d{4})-w?(\d{1,2})$/i)
    if (!match) {
      setError('Use /reports/w/{epi_year}-{epi_week}')
      return
    }
    const year = Number(match[1])
    const week = Number(match[2])
    listPublicReportIssues({ epi_year: year, epi_week: week })
      .then((rows) => {
        if (rows[0]?.slug) router.replace(`/reports/${rows[0].slug}`)
        else setError(`No published sitrep for epi week ${week}/${year}.`)
      })
      .catch((err) => setError(err.message))
  }, [raw, router])

  return <p className="text-sm text-slate-500">{error || 'Opening sitrep for this epi week…'}</p>
}
