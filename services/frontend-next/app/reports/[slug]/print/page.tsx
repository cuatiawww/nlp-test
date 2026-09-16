'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import SitrepView from '@/components/reports/SitrepView'
import { fetchPublicReportIssue } from '@/lib/sitrep-api'
import { exportReportToPdf } from '@/lib/pdf-export'
import type { ReportIssue } from '@/types/sitrep'

export default function ReportPrintPage() {
  const params = useParams<{ slug: string }>()
  const slug = decodeURIComponent(params.slug || '')
  const [issue, setIssue] = useState<ReportIssue | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!slug) return
    fetchPublicReportIssue(slug).then(setIssue).catch(() => setIssue(null))
  }, [slug])

  if (!issue) return <p className="p-6 text-sm text-slate-500">Preparing print layout…</p>

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-6 sm:p-10 print:max-w-none print:p-0">
      <div className="no-print mb-4 flex gap-2">
        <button
          type="button"
          className="rounded-lg bg-[#0060A9] px-3 py-2 text-xs font-bold text-white"
          onClick={() => window.print()}
        >
          Print / Save as PDF
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"
          onClick={async () => {
            setBusy(true)
            try {
              await exportReportToPdf({
                filename: `${issue.slug}.pdf`,
                elementId: 'printable-sitrep',
              })
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'Rendering…' : 'Download PDF artifact'}
        </button>
      </div>
      <SitrepView issue={issue} showPrintActions={false} />
    </div>
  )
}
