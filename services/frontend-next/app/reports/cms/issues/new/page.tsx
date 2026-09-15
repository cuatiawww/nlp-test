'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentEpiWeek } from '@/lib/epi-week'
import { createReportIssue } from '@/lib/sitrep-api'

export default function NewReportIssuePage() {
  const epi = getCurrentEpiWeek()
  const router = useRouter()
  const [year, setYear] = useState(epi.year)
  const [week, setWeek] = useState(epi.week)
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <form
      className="mx-auto max-w-xl space-y-4 px-4 py-6"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError(null)
        try {
          const issue = await createReportIssue({
            epi_year: Number(year),
            epi_week: Number(week),
            title: title.trim() || undefined,
          })
          router.push(`/reports/cms/issues/${issue.id}`)
        } catch (err: any) {
          setError(err.message || 'Create failed')
        } finally {
          setBusy(false)
        }
      }}
    >
      <h1 className="text-2xl font-black">Create sitrep from template</h1>
      <p className="text-sm text-slate-600">
        Uses <code>weekly_sitrep_v1</code> and immediately pulls the ASEAN-11 KPI snapshot for the selected epi week.
        This does not generate an AI essay.
      </p>
      <label className="block text-sm font-semibold">
        Epi year
        <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
      </label>
      <label className="block text-sm font-semibold">
        Epi week
        <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" type="number" min={1} max={53} value={week} onChange={(e) => setWeek(Number(e.target.value))} />
      </label>
      <label className="block text-sm font-semibold">
        Title (optional)
        <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ASEAN Epidemiological Situation Report — …" />
      </label>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <button disabled={busy} className="rounded-xl bg-[#0060A9] px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
        {busy ? 'Pulling KPIs…' : 'Create draft'}
      </button>
    </form>
  )
}
