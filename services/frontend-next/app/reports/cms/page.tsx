'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listCmsIssues, deleteReportIssue, formatEpiBadge } from '@/lib/sitrep-api'
import { toast } from 'sonner'
import type { ReportIssue, ReportIssueStatus } from '@/types/sitrep'
import ReportsModeNav from '@/components/reports/ReportsModeNav'

const FILTERS: Array<ReportIssueStatus | 'all'> = [
  'all',
  'draft',
  'in_review',
  'changes_requested',
  'approved',
  'published',
]

function statusClass(status: string) {
  if (status === 'published') return 'bg-emerald-50 text-emerald-800'
  if (status === 'approved') return 'bg-sky-50 text-sky-800'
  if (status === 'in_review') return 'bg-amber-50 text-amber-800'
  if (status === 'changes_requested') return 'bg-rose-50 text-rose-800'
  return 'bg-slate-100 text-slate-700'
}

export default function ReportsCmsQueuePage() {
  const [status, setStatus] = useState<ReportIssueStatus | 'all'>('all')
  const [items, setItems] = useState<ReportIssue[]>([])
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const handleDelete = async (item: ReportIssue) => {
    const isPublished = item.status === 'published'
    const warning = isPublished
      ? `PERINGATAN: Laporan "${item.title}" (${formatEpiBadge(item.epi_year, item.epi_week)}) berstatus PUBLISHED.\n\nJika dihapus, edisi ini akan ditarik permanen dari publikasi umum dan arsip publik.\n\nApakah Anda benar-benar yakin ingin menghapus edisi ini?`
      : `Hapus draf laporan "${item.title}" (${formatEpiBadge(item.epi_year, item.epi_week)})?\n\nTindakan ini tidak dapat dibatalkan.`

    if (!window.confirm(warning)) return

    setDeletingId(item.id)
    try {
      await deleteReportIssue(item.id)
      toast.success(`Laporan "${item.title}" berhasil dihapus`)
      load()
    } catch (err: any) {
      toast.error(err.message || 'Gagal menghapus laporan')
    } finally {
      setDeletingId(null)
    }
  }

  const load = () => {
    listCmsIssues(status)
      .then(setItems)
      .catch((err) => setError(err.message || 'Failed to load queue'))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  return (
    <div className="space-y-4 px-4 md:px-6">
      <ReportsModeNav />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Publication CMS</h1>
          <p className="text-sm text-slate-600">
            Review drafts generated from KPI/matrix pulls. DeepSeek notes are draft-only. Publish freezes the snapshot.
          </p>
        </div>
        <Link href="/reports/generate" className="rounded-xl bg-[#0060A9] px-4 py-2 text-sm font-bold text-white">
          Generate draft
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setStatus(item)}
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              status === item ? 'bg-[#0060A9] text-white' : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            {item.replace('_', ' ')}
          </button>
        ))}
        <Link href="/reports/cms/templates" className="rounded-full border border-slate-200 px-3 py-1 text-xs font-bold text-slate-600">
          Templates
        </Link>
        <Link href="/reports/cms/taxonomies" className="rounded-full border border-slate-200 px-3 py-1 text-xs font-bold text-slate-600">
          Taxonomies
        </Link>
      </div>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Week</th>
              <th className="px-3 py-2">Template</th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Updated</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-xs">{formatEpiBadge(item.epi_year, item.epi_week)}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-slate-500">{item.template_id}</td>
                <td className="px-3 py-2 font-semibold">{item.title}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusClass(item.status)}`}>
                    {item.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">{item.updated_at || '—'}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-3">
                    <Link href={`/reports/cms/issues/${item.id}`} className="text-xs font-bold text-[#0060A9] hover:underline">
                      Edit
                    </Link>
                    {item.status === 'in_review' || item.status === 'approved' ? (
                      <Link href={`/reports/cms/issues/${item.id}/review`} className="text-xs font-bold text-slate-600 hover:underline">
                        Review
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      disabled={deletingId === item.id}
                      onClick={() => handleDelete(item)}
                      className="text-xs font-bold text-rose-600 hover:text-rose-800 disabled:opacity-40 transition-colors"
                      title={item.status === 'published' ? 'Hapus edisi publikasi ini' : 'Hapus draf ini'}
                    >
                      {deletingId === item.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">
                  Queue is empty. Create a bulletin or SitRep from a template.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
