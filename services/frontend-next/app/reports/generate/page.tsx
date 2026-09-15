'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentEpiWeek } from '@/lib/epi-week'
import { createReportIssue } from '@/lib/sitrep-api'
import { REPORT_TEMPLATES, defaultTitleForTemplate } from '@/lib/report-templates'
import ReportsModeNav from '@/components/reports/ReportsModeNav'

const SCOPES = [
  { id: 'asean11', label: 'All ASEAN (11 jurisdictions)' },
  { id: 'Brunei', label: 'Brunei' },
  { id: 'Cambodia', label: 'Cambodia' },
  { id: 'Indonesia', label: 'Indonesia' },
  { id: 'Laos', label: 'Lao PDR' },
  { id: 'Malaysia', label: 'Malaysia' },
  { id: 'Myanmar', label: 'Myanmar' },
  { id: 'Philippines', label: 'Philippines' },
  { id: 'Singapore', label: 'Singapore' },
  { id: 'Thailand', label: 'Thailand' },
  { id: 'Vietnam', label: 'Viet Nam' },
  { id: 'Timor-Leste', label: 'Timor-Leste' },
]

export default function GenerateDraftPage() {
  const epi = getCurrentEpiWeek()
  const router = useRouter()
  const [year, setYear] = useState(epi.year)
  const [week, setWeek] = useState(epi.week)
  const [weekEnd, setWeekEnd] = useState(epi.week)
  const [title, setTitle] = useState('')
  const [templateId, setTemplateId] = useState('mmwr_bulletin_v1')
  const [scope, setScope] = useState('asean11')
  const [assist, setAssist] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const selected = REPORT_TEMPLATES.find((t) => t.id === templateId) || REPORT_TEMPLATES[0]

  return (
    <form
      className="mx-auto max-w-3xl space-y-4 px-4 py-6"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError(null)
        try {
          const issue = await createReportIssue({
            epi_year: Number(year),
            epi_week: Number(week),
            epi_week_end: Number(weekEnd),
            title: title.trim() || undefined,
            template_id: templateId,
            scope,
            assist_narrative: assist,
          })
          router.push(`/reports/cms/issues/${issue.id}`)
        } catch (err: any) {
          setError(err.message || 'Generate failed')
        } finally {
          setBusy(false)
        }
      }}
    >
      <ReportsModeNav />
      <h1 className="text-2xl font-black">Generate draft from system data</h1>
      <p className="text-sm text-slate-600">
        Pick scope, epi-week range, and report type. The system pulls KPIs, sources, alerts, and disease×AMS
        cross-tabs into a draft package. Charts and tables bind to that pull. DeepSeek may draft highlights and
        short notes from truncated stats — never from full article text. Everything stays a draft until CMS review
        and publish.
      </p>
      <label className="block text-sm font-semibold">
        Scope
        <select
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          {SCOPES.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm font-semibold">
          Epi year
          <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
        </label>
        <label className="block text-sm font-semibold">
          Week from
          <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" type="number" min={1} max={53} value={week} onChange={(e) => setWeek(Number(e.target.value))} />
        </label>
        <label className="block text-sm font-semibold">
          Week to
          <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" type="number" min={1} max={53} value={weekEnd} onChange={(e) => setWeekEnd(Number(e.target.value))} />
        </label>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Report type</legend>
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
      <label className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-sm">
        <input type="checkbox" className="mt-1" checked={assist} onChange={(e) => setAssist(e.target.checked)} />
        <span>
          <span className="font-semibold">Draft narrative with DeepSeek</span>
          <span className="block text-xs text-slate-500">
            Sends truncated KPI/matrix tables only (cached by type + scope + date range + data hash). Output is
            draft-only and must be edited before publish. If the API key is missing, template bullets from KPIs are used.
          </span>
        </span>
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
        {busy ? 'Pulling KPIs and drafting…' : 'Generate draft'}
      </button>
    </form>
  )
}
