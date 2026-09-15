'use client'

import { useEffect, useMemo, useState } from 'react'
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
} from '@/lib/sitrep-api'
import type { ReportIssue, ReportIssueStatus } from '@/types/sitrep'
import { NARRATIVE_LABELS, templateById } from '@/lib/report-templates'

const NEXT: Partial<Record<ReportIssueStatus, ReportIssueStatus>> = {
  draft: 'in_review',
  in_review: 'approved',
  changes_requested: 'in_review',
  approved: 'published',
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

  if (!issue) return <p className="px-6 text-sm text-slate-500">Loading issue…</p>
  const tpl = templateById(issue.template_id)

  const saveNotes = async () => {
    setBusy(true)
    try {
      const highlights = highlightsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 5)
      const saved = await patchReportIssue(id, {
        title: issue.title,
        highlights,
        sections: issue.sections,
        cover_url: issue.cover_url,
        limitations: issue.limitations,
        map_indicator: issue.map?.indicator,
        narrative: issue.narrative || {},
      })
      setIssue(saved)
      toast.success('Saved analyst fields (KPIs unchanged)')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const onCover = (file: File) => {
    if (file.size > 1_500_000) {
      toast.error('Cover must be under 1.5 MB')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setIssue({ ...issue, cover_url: String(reader.result || '') })
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="grid gap-4 px-4 md:px-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <aside className="space-y-4 no-print">
        <div className="flex items-center justify-between">
          <Link href="/reports/cms" className="text-xs font-bold text-[#0060A9]">← Queue</Link>
          <Link href={`/reports/cms/issues/${id}/review`} className="text-xs font-bold text-slate-600">Review checklist</Link>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            {issue.status.replace('_', ' ')} · {tpl.short} · {issue.template_id} {issue.template_version}
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
              value={issue.map?.indicator || 'events'}
              onChange={(e) =>
                setIssue({ ...issue, map: { ...issue.map, indicator: e.target.value } })
              }
            >
              <option value="events">Events</option>
              <option value="cases">Cases</option>
              <option value="deaths">Deaths</option>
            </select>
          </label>
          <label className="block text-xs font-semibold">
            Cover image
            <input disabled={!!frozen} type="file" accept="image/*" className="mt-1 block w-full text-xs" onChange={(e) => e.target.files?.[0] && onCover(e.target.files[0])} />
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
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Highlights (≤5, human)</p>
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
              <textarea
                disabled={!!frozen}
                rows={4}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-normal"
                value={typeof issue.narrative?.[key] === 'string' ? String(issue.narrative[key]) : ''}
                onChange={(e) =>
                  setIssue({
                    ...issue,
                    narrative: { ...(issue.narrative || {}), [key]: e.target.value },
                  })
                }
              />
            </label>
          ))}
          {(issue.sections || []).map((section, idx) => (
            <label key={section.disease_code} className="block text-xs font-semibold">
              Note · {section.name}
              <textarea
                disabled={!!frozen}
                rows={3}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-normal"
                value={section.analyst_note || ''}
                onChange={(e) => {
                  const sections = [...issue.sections]
                  sections[idx] = { ...section, analyst_note: e.target.value, analyst_note_status: 'human' }
                  setIssue({ ...issue, sections })
                }}
              />
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
            onClick={saveNotes}
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
            Section checklist
          </button>
          <button type="button" onClick={() => setTab('preview')} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${tab === 'preview' ? 'bg-slate-900 text-white' : 'bg-white border'}`}>
            Live preview
          </button>
        </div>
        {tab === 'edit' ? (
          <ol className="list-decimal space-y-2 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm">
            {tpl.outline.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        ) : (
          <SitrepView issue={issue} preview={issue.status !== 'published'} />
        )}
      </section>
    </div>
  )
}
