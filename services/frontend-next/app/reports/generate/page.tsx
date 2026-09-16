'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentEpiWeek } from '@/lib/epi-week'
import { createReportIssue, fetchReportTaxonomies } from '@/lib/sitrep-api'
import { REPORT_TEMPLATES, defaultTitleForTemplate, templateById } from '@/lib/report-templates'
import ReportsModeNav from '@/components/reports/ReportsModeNav'
import {
  PRIORITY_DISEASES,
  buildToc,
  normalizeSelectedDiseases,
} from '@/lib/report-outline.mjs'

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

type DiseaseOpt = { name: string; disease_code: string }

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
  const [query, setQuery] = useState('')
  const [catalog, setCatalog] = useState<DiseaseOpt[]>(PRIORITY_DISEASES)
  const [selected, setSelected] = useState<DiseaseOpt[]>([
    PRIORITY_DISEASES[0],
    PRIORITY_DISEASES[1],
  ])
  const tpl = templateById(templateId)

  useEffect(() => {
    fetchReportTaxonomies()
      .then((data) => {
        const fromApi = (data.diseases || []).map((d) => ({
          name: d.name,
          disease_code: d.disease_code,
        }))
        const merged = [...PRIORITY_DISEASES]
        for (const item of fromApi) {
          if (!merged.some((m) => m.disease_code === item.disease_code || m.name.toLowerCase() === item.name.toLowerCase())) {
            merged.push(item)
          }
        }
        setCatalog(merged)
      })
      .catch(() => setCatalog(PRIORITY_DISEASES))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return catalog.slice(0, 16)
    return catalog.filter((d) => d.name.toLowerCase().includes(q) || d.disease_code.includes(q)).slice(0, 16)
  }, [catalog, query])

  const toc = useMemo(() => buildToc(templateId, selected), [templateId, selected])

  const toggle = (item: DiseaseOpt) => {
    setSelected((prev) => {
      if (prev.some((p) => p.disease_code === item.disease_code)) {
        return prev.filter((p) => p.disease_code !== item.disease_code)
      }
      return [...prev, item]
    })
  }

  return (
    <form
      className="mx-auto max-w-3xl space-y-4 px-4 py-6"
      onSubmit={async (e) => {
        e.preventDefault()
        if (selected.length < 1) {
          setError('Select at least one disease chapter')
          return
        }
        setBusy(true)
        setError(null)
        try {
          const diseases = normalizeSelectedDiseases(selected)
          const issue = await createReportIssue({
            epi_year: Number(year),
            epi_week: Number(week),
            epi_week_end: Number(weekEnd),
            title: title.trim() || undefined,
            template_id: templateId,
            scope,
            assist_narrative: assist,
            selected_diseases: diseases,
            disease_ids: diseases.map((d) => d.disease_code),
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
        Choose template, epi-week range, ASEAN-11 or one AMS, and one or more diseases. The system pulls cases,
        deaths, and CFR from KPI snapshots, builds a TOC with per-disease chapters, draws polygon maps and epidemic
        curves, and may draft narrative from truncated stats only. Charts never show crawler or scrape volume.
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
          {REPORT_TEMPLATES.map((item) => (
            <label
              key={item.id}
              className={`cursor-pointer rounded-2xl border p-3 text-sm ${
                templateId === item.id ? 'border-[#0060A9] bg-[#0060A9]/5' : 'border-slate-200 bg-white'
              }`}
            >
              <input
                type="radio"
                className="sr-only"
                name="template"
                value={item.id}
                checked={templateId === item.id}
                onChange={() => {
                  setTemplateId(item.id)
                  setTitle('')
                }}
              />
              <p className="font-black text-slate-900">
                {item.label} {item.primary ? <span className="text-[10px] font-bold uppercase text-[#0060A9]">Primary</span> : null}
              </p>
              <p className="text-[11px] text-slate-500">{item.cadence} · {item.id}</p>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Diseases (1–N chapters)</p>
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{selected.length} selected</span>
        </div>
        <input
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          placeholder="Search COVID-19, Mpox, dengue…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {selected.map((item) => (
            <button
              key={item.disease_code}
              type="button"
              className="rounded-full bg-[#0060A9] px-3 py-1 text-xs font-bold text-white"
              onClick={() => toggle(item)}
            >
              {item.name} ×
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {filtered.map((item) => {
            const on = selected.some((s) => s.disease_code === item.disease_code)
            return (
              <button
                key={item.disease_code}
                type="button"
                onClick={() => toggle(item)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  on ? 'border-[#0060A9] bg-[#0060A9]/10 text-[#0060A9]' : 'border-slate-200 text-slate-700'
                }`}
              >
                {item.name}
              </button>
            )
          })}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold">Preview outline</p>
        <p className="mb-2 text-[11px] text-slate-500">{tpl.label} · {scope === 'asean11' ? 'ASEAN-11 + Timor-Leste' : scope}</p>
        <ol className="list-decimal space-y-1 px-5 text-sm text-slate-700">
          {toc.map((item) => (
            <li key={item.href}>
              {item.label}
              {item.children?.length ? (
                <ol className="mt-1 list-disc px-4 text-xs text-slate-500">
                  {item.children.map((child) => (
                    <li key={child.href}>{child.label}</li>
                  ))}
                </ol>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
      <label className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-sm">
        <input type="checkbox" className="mt-1" checked={assist} onChange={(e) => setAssist(e.target.checked)} />
        <span>
          <span className="font-semibold">Draft narrative with DeepSeek</span>
          <span className="block text-xs text-slate-500">
            Sends truncated KPI/matrix tables only (cached by type + scope + date range + data hash). Output is
            draft-only and must be edited before publish. Numbers are never invented.
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
      <button disabled={busy || selected.length < 1} className="rounded-xl bg-[#0060A9] px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
        {busy ? 'Pulling KPIs and drafting…' : 'Generate draft'}
      </button>
    </form>
  )
}
