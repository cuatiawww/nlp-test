'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { fetchLatestPublicReport } from '@/lib/sitrep-api'

export default function LatestReportPage() {
  const router = useRouter()
  useEffect(() => {
    fetchLatestPublicReport()
      .then((row) => {
        if (row?.slug) router.replace(`/reports/${row.slug}`)
        else router.replace('/reports')
      })
      .catch(() => router.replace('/reports'))
  }, [router])
  return <p className="text-sm text-slate-500">Opening latest published sitrep…</p>
}
