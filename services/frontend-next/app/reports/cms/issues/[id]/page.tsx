'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import SitrepView from '@/components/reports/SitrepView'
import {
  fetchCmsIssue,
  patchReportIssue,
  pullReportKpis,
  publishReportIssue,
  suggestReportNotes,
  transitionReportIssue,
  uploadReportAsset,
} from '@/lib/sitrep-api'
import type { ReportIssue, ReportIssueStatus, ReportSectionOrderItem } from '@/types/sitrep'
import { NARRATIVE_LABELS, templateById } from '@/lib/report-templates'
import { buildSectionOrder } from '@/lib/report-outline.mjs'

const NarrativeEditor = dynamic(() => import('@/components/reports/NarrativeEditor'), { ssr: false })

const NEXT: Partial<Record<ReportIssueStatus, ReportIssueStatus>> = {
  draft: 'in_review',
  in_review: 'approved',
  changes_requested: 'in_review',
  approved: 'published',
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (file.size > 1_800_000) {
      reject(new Error('Image must be under 1.8 MB'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

export default function CmsIssueEditorPage() {
  const params = useParams<{ id: string }>()
  const id = Number(params.id)
  const [issue, setIssue] = useState<ReportIssue | null>(null)
  const [highlightsText, setHighlightsText] = useState('')
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')

  const load = () =>
    fetchCmsIssue(id)
      .then((row) => {
        setIssue(row)
        setHighlightsText((row.highlights || []).join('\n'))
      })
      .catch((err) => toast.error(err.message))

  useEffect(() => {
    if (Number.isFinite(id)) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const frozen = useMemo(
    () => issue && ['published', 'superseded', 'archived'].includes(issue.status),
    [issue],
  )

  const order = useMemo<ReportSectionOrderItem[]>(() => {
    if (!issue) return []
    if (issue.section_order?.length) return issue.section_order
    return buildSectionOrder(
      issue.template_id,
      (issue.sections || []).map((s) => ({ disease_code: s.disease_code, name: s.name })),
    )
  }, [issue])

  if (!issue) return <p className="px-6 text-sm text-slate-500">Loading issue…</p>
  const tpl = templateById(issue.template_id)

  const saveNotes = async (nextIssue = issue, nextHighlights = highlightsText) => {
    setBusy(true)
    try {
      const highlights = nextHighlights
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 12)
      const saved = await patchReportIssue(id, {
        title: nextIssue.title,
        highlights,
        sections: nextIssue.sections,
        cover_url: nextIssue.cover_url,
        limitations: nextIssue.limitations,
        map_indicator: nextIssue.map?.indicator === 'deaths' ? 'deaths' : 'cases',
        narrative: nextIssue.narrative || {},
        section_order: nextIssue.section_order || order,
        assets: nextIssue.assets || {},
      })
      setIssue(saved)
      toast.success('Saved analyst fields (KPIs unchanged)')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const moveSection = (index: number, dir: -1 | 1) => {
    const next = [...order]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    const tmp = next[index]
    next[index] = next[target]
    next[target] = tmp
    setIssue({ ...issue, section_order: next })
  }

  return (
    <div className="grid gap-4 px-4 md:px-6 lg:grid-cols-[minmax(0,24rem)_1fr]">
      <aside className="space-y-4 no-print">
        <div className="flex items-center justify-between">
          <Link href="/reports/cms" className="text-xs font-bold text-[#0060A9]">← Queue</Link>
          <Link href={`/reports/cms/issues/${id}/review`} className="text-xs font-bold text-slate-600">Review checklist</Link>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            {issue.status.replace('_', ' ')} · {tpl.short} · {issue.template_id} {issue.template_version}
          </p>
          <p className="text-[11px] text-slate-500">
            Diseases: {(issue.selected_diseases || issue.sections || []).map((d) => d.name).join(', ') || '—'}
          </p>
          <label className="block text-xs font-semibold">
            Title
            <input
              disabled={!!frozen}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={issue.title}
              onChange={(e) => setIssue({ ...issue, title: e.target.value })}
            />
          </label>
          <label className="block text-xs font-semibold">
            Map indicator
            <select
              disabled={!!frozen}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={issue.map?.indicator === 'deaths' ? 'deaths' : 'cases'}
              onChange={(e) =>
                setIssue({ ...issue, map: { ...issue.map, indicator: e.target.value } })
              }
            >
              <option value="cases">Cases</option>
              <option value="deaths">Deaths</option>
            </select>
          </label>
          <label className="block text-xs font-semibold">
            Cover image
            <input
              disabled={!!frozen}
              type="file"
              accept="image/*"
              className="mt-1 block w-full text-xs"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                try {
                  const data_url = await readFileAsDataUrl(file)
                  const next = await uploadReportAsset(id, { kind: 'cover', data_url })
                  setIssue(next)
                  toast.success('Cover uploaded')
                } catch (err: any) {
                  toast.error(err.message)
                }
              }}
            />
          </label>
          <label className="block text-xs font-semibold">
            Extra page
            <input
              disabled={!!frozen}
              type="file"
              accept="image/*"
              className="mt-1 block w-full text-xs"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                try {
                  const data_url = await readFileAsDataUrl(file)
                  const next = await uploadReportAsset(id, { kind: 'page', data_url, caption: file.name })
                  setIssue(next)
                  toast.success('Page inserted')
                } catch (err: any) {
                  toast.error(err.message)
                }
              }}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !!frozen}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold"
              onClick={async () => {
                setBusy(true)
                try {
                  const next = await pullReportKpis(id)
                  setIssue(next)
                  toast.success('KPI snapshot refreshed for this epi week')
                } catch (err: any) {
                  toast.error(err.message)
                } finally {
                  setBusy(false)
                }
              }}
            >
              Pull KPIs for week {issue.epi_week}
            </button>
            <button
              type="button"
              disabled={busy || !!frozen}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold"
              onClick={async () => {
                try {
                  const draft = await suggestReportNotes(id, true)
                  const next = await fetchCmsIssue(id)
                  setIssue(next)
                  setHighlightsText((next.highlights || []).join('\n'))
                  toast.message(
                    draft.llm_used
                      ? 'DeepSeek draft applied — human review required'
                      : 'Template bullets from KPIs — human review required',
                    { description: draft.disclaimer },
                  )
                } catch (err: any) {
                  toast.error(err.message)
                }
              }}
            >
              Draft with DeepSeek
            </button>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Highlights (≤12, human)</p>
          <textarea
            disabled={!!frozen}
            rows={6}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            value={highlightsText}
            onChange={(e) => setHighlightsText(e.target.value)}
          />
          {tpl.narrativeKeys.map((key) => (
            <label key={key} className="block text-xs font-semibold">
              {NARRATIVE_LABELS[key] || key}
              <div className="mt-1">
                <NarrativeEditor
                  disabled={!!frozen}
                  value={typeof issue.narrative?.[key] === 'string' ? String(issue.narrative[key]) : ''}
                  onChange={(html) =>
                    setIssue({
                      ...issue,
                      narrative: { ...(issue.narrative || {}), [key]: html },
                    })
                  }
                />
              </div>
            </label>
          ))}
          {(issue.sections || []).map((section, idx) => (
            <label key={section.disease_code} className="block text-xs font-semibold">
              Note · {section.name}
              <div className="mt-1">
                <NarrativeEditor
                  disabled={!!frozen}
                  minHeight={100}
                  value={section.analyst_note || ''}
                  onChange={(html) => {
                    const sections = [...issue.sections]
                    sections[idx] = { ...section, analyst_note: html, analyst_note_status: 'human' }
                    setIssue({ ...issue, sections })
                  }}
                />
              </div>
            </label>
          ))}
          <label className="block text-xs font-semibold">
            Limitations
            <textarea
              disabled={!!frozen}
              rows={4}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-normal"
              value={issue.limitations || ''}
              onChange={(e) => setIssue({ ...issue, limitations: e.target.value })}
            />
          </label>
          <button
            type="button"
            disabled={busy || !!frozen}
            onClick={() => saveNotes()}
            className="rounded-lg bg-[#0060A9] px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
          >
            Save notes & narrative
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {issue.status !== 'approved' && NEXT[issue.status] && NEXT[issue.status] !== 'published' ? (
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold"
              onClick={async () => {
                try {
                  const next = await transitionReportIssue(id, NEXT[issue.status] as ReportIssueStatus)
                  setIssue(next)
                  toast.success(`Moved to ${next.status}`)
                } catch (err: any) {
                  toast.error(err.message)
                }
              }}
            >
              Send to {NEXT[issue.status]?.replace('_', ' ')}
            </button>
          ) : null}
          {issue.status === 'in_review' ? (
            <button
              type="button"
              className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700"
              onClick={async () => {
                const next = await transitionReportIssue(id, 'changes_requested', 'Changes requested from editor')
                setIssue(next)
              }}
            >
              Request changes
            </button>
          ) : null}
          {issue.status === 'approved' ? (
            <button
              type="button"
              className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white"
              onClick={async () => {
                try {
                  const next = await publishReportIssue(id, { visibility: 'public' })
                  setIssue(next)
                  toast.success('Published and frozen')
                } catch (err: any) {
                  toast.error(err.message)
                }
              }}
            >
              Publish (freeze snapshot)
            </button>
          ) : null}
        </div>
      </aside>
      <section>
        <div className="no-print mb-3 flex gap-2">
          <button type="button" onClick={() => setTab('edit')} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${tab === 'edit' ? 'bg-slate-900 text-white' : 'bg-white border'}`}>
            Section order
          </button>
          <button type="button" onClick={() => setTab('preview')} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${tab === 'preview' ? 'bg-slate-900 text-white' : 'bg-white border'}`}>
            Live preview
          </button>
        </div>
        {tab === 'edit' ? (
          <ol className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
            {order.map((item, idx) => (
              <li key={`${item.id}-${idx}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2">
                <span>
                  <span className="mr-2 font-mono text-[10px] text-slate-400">{idx + 1}</span>
                  {item.label}
                </span>
                <span className="flex gap-1">
                  <button type="button" disabled={!!frozen || idx === 0} className="rounded border px-2 py-0.5 text-[10px] font-bold disabled:opacity-30" onClick={() => moveSection(idx, -1)}>Up</button>
                  <button type="button" disabled={!!frozen || idx === order.length - 1} className="rounded border px-2 py-0.5 text-[10px] font-bold disabled:opacity-30" onClick={() => moveSection(idx, 1)}>Down</button>
                </span>
              </li>
            ))}
            <li className="pt-2">
              <button
                type="button"
                disabled={busy || !!frozen}
                onClick={() => saveNotes({ ...issue, section_order: order })}
                className="rounded-lg bg-[#0060A9] px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                Save section order
              </button>
            </li>
          </ol>
        ) : (
          <SitrepView issue={issue} preview={issue.status !== 'published'} />
        )}
      </section>
    </div>
  )
}
