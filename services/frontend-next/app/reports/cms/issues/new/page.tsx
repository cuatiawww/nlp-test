'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentEpiWeek } from '@/lib/epi-week'
import { createReportIssue } from '@/lib/sitrep-api'
import { REPORT_TEMPLATES, defaultTitleForTemplate } from '@/lib/report-templates'

export default function NewReportIssuePage() {
  const epi = getCurrentEpiWeek()
  const router = useRouter()
  const [year, setYear] = useState(epi.year)
  const [week, setWeek] = useState(epi.week)
  const [title, setTitle] = useState('')
  const [templateId, setTemplateId] = useState('mmwr_bulletin_v1')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const selected = REPORT_TEMPLATES.find((t) => t.id === templateId) || REPORT_TEMPLATES[0]

  return (
    <form
      className="mx-auto max-w-2xl space-y-4 px-4 py-6"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError(null)
        try {
          const issue = await createReportIssue({
            epi_year: Number(year),
            epi_week: Number(week),
            title: title.trim() || undefined,
            template_id: templateId,
          })
          router.push(`/reports/cms/issues/${issue.id}`)
        } catch (err: any) {
          setError(err.message || 'Create failed')
        } finally {
          setBusy(false)
        }
      }}
    >
      <h1 className="text-2xl font-black">Create publication from template</h1>
      <p className="text-sm text-slate-600">
        Primary packages are the epidemiological bulletin (MMWR-style section order) and the situation report.
        Epidemic intelligence and focus reports are secondary. KPI tables are pulled immediately; the body is not an AI essay.
      </p>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Template</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {REPORT_TEMPLATES.map((tpl) => (
            <label
              key={tpl.id}
              className={`cursor-pointer rounded-2xl border p-3 text-sm ${
                templateId === tpl.id ? 'border-[#0060A9] bg-[#0060A9]/5' : 'border-slate-200 bg-white'
              }`}
            >
              <input
                type="radio"
                className="sr-only"
                name="template"
                value={tpl.id}
                checked={templateId === tpl.id}
                onChange={() => {
                  setTemplateId(tpl.id)
                  setTitle('')
                }}
              />
              <p className="font-black text-slate-900">
                {tpl.label} {tpl.primary ? <span className="text-[10px] font-bold uppercase text-[#0060A9]">Primary</span> : null}
              </p>
              <p className="text-[11px] text-slate-500">{tpl.cadence} · {tpl.id}</p>
            </label>
          ))}
        </div>
      </fieldset>
      <ol className="list-decimal rounded-2xl border border-slate-200 bg-white px-6 py-3 text-xs text-slate-600">
        {selected.outline.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
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
        <input
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={defaultTitleForTemplate(templateId, Number(year), Number(week))}
        />
      </label>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <button disabled={busy} className="rounded-xl bg-[#0060A9] px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
        {busy ? 'Pulling KPIs…' : 'Create draft'}
      </button>
    </form>
  )
}
