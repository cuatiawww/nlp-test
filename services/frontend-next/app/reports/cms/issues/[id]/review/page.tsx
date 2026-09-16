'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import { fetchCmsIssue, publishReportIssue, transitionReportIssue } from '@/lib/sitrep-api'
import type { ReportIssue } from '@/types/sitrep'

const CHECKS = [
  'CFR only shown when cases > 0',
  'Map legend includes No data / Not reported',
  'ISO3 join used; no name-only matching',
  'Highlights edited by a human',
  'KPI snapshot pulled for the correct epi week and selected diseases',
  'Sources and limitations present',
  'No LLM essay pasted as the body',
  'Charts/maps show cases, deaths, or CFR — never crawler/scrape volume',
  'Each selected disease has a chapter (empty chapters are No data, not dummy counts)',
  'Cover uploaded or default cover accepted; section order reviewed',
  'Heatmap / map missing cells are No data, not zero',
]

export default function CmsIssueReviewPage() {
  const params = useParams<{ id: string }>()
  const id = Number(params.id)
  const [issue, setIssue] = useState<ReportIssue | null>(null)
  const [ticks, setTicks] = useState<boolean[]>(() => CHECKS.map(() => false))
  const [comment, setComment] = useState('')

  useEffect(() => {
    if (!Number.isFinite(id)) return
    fetchCmsIssue(id).then(setIssue).catch((err) => toast.error(err.message))
  }, [id])

  if (!issue) return <p className="px-6 text-sm text-slate-500">Loading review…</p>
  const allTicked = ticks.every(Boolean)

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <Link href={`/reports/cms/issues/${id}`} className="text-xs font-bold text-[#0060A9]">← Editor</Link>
      <h1 className="text-2xl font-black">Review · {issue.title}</h1>
      <p className="text-sm text-slate-600">Status: {issue.status.replace('_', ' ')}</p>
      <ul className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
        {CHECKS.map((label, i) => (
          <li key={label}>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={ticks[i]}
                onChange={(e) => {
                  const next = [...ticks]
                  next[i] = e.target.checked
                  setTicks(next)
                }}
              />
              {label}
            </label>
          </li>
        ))}
      </ul>
      <textarea
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        rows={3}
        placeholder="Review comment"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <div className="flex gap-2">
        {issue.status === 'in_review' ? (
          <button
            type="button"
            className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-bold text-rose-700"
            onClick={async () => {
              const next = await transitionReportIssue(id, 'changes_requested', comment || 'Changes requested')
              setIssue(next)
              toast.success('Returned for changes')
            }}
          >
            Changes requested
          </button>
        ) : null}
        {issue.status === 'in_review' ? (
          <button
            type="button"
            disabled={!allTicked}
            className="rounded-xl bg-[#0060A9] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            onClick={async () => {
              const next = await transitionReportIssue(id, 'approved', comment || 'Checklist complete')
              setIssue(next)
              toast.success('Approved')
            }}
          >
            Approve
          </button>
        ) : null}
        {issue.status === 'approved' ? (
          <button
            type="button"
            className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white"
            onClick={async () => {
              const next = await publishReportIssue(id, { comment: comment || 'Published from review' })
              setIssue(next)
              toast.success('Published and frozen')
            }}
          >
            Publish
          </button>
        ) : null}
      </div>
    </div>
  )
}
