'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import Pagination from '@/components/Pagination'
import { fetchCrawlHistoryJobs } from '@/lib/api'
import type { CrawlHistoryJob } from '@/types'
import { useTranslation } from '@/lib/i18n/LanguageContext'

const PAGE_SIZE = 25

function fmtNum(val?: number | null) {
  if (val == null || Number.isNaN(Number(val))) return '0'
  return Number(val).toLocaleString('en-US')
}

function diseaseNames(value: CrawlHistoryJob['disease_names']) {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ')
  return value ? String(value) : '—'
}

function statusBadge(status?: string | null) {
  const st = (status || '').toLowerCase()
  if (st === 'completed' || st === 'success') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 capitalize">
        <CheckCircle2 className="h-3 w-3 text-emerald-600" /> {st}
      </span>
    )
  }
  if (st === 'running' || st === 'processing') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-[10px] font-bold text-[#0060A9] capitalize">
        <Loader2 className="h-3 w-3 animate-spin text-[#0060A9]" /> {st}
      </span>
    )
  }
  if (st === 'failed' || st === 'error') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 capitalize">
        <AlertTriangle className="h-3 w-3 text-rose-600" /> {st}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 capitalize">
      <Clock className="h-3 w-3 text-slate-500" /> {st || 'pending'}
    </span>
  )
}

export default function CrawlingLogPanel() {
  const { t } = useTranslation()
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [jobs, setJobs] = useState<CrawlHistoryJob[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)

  const loadJobs = useCallback(async () => {
    setLoading(true)
    try {
      const result = await fetchCrawlHistoryJobs({
        q: q || undefined,
        status: status === 'all' ? undefined : status,
        page,
        per_page: PAGE_SIZE,
      })
      setJobs(result.data || [])
      setTotal(result.total || 0)
      setTotalPages(result.totalPages || 1)
    } catch (error: any) {
      setJobs([])
      setTotal(0)
      setTotalPages(1)
      toast.error(error?.message || 'Collector run jobs could not be loaded')
    } finally {
      setLoading(false)
    }
  }, [q, status, page])

  useEffect(() => {
    void loadJobs()
  }, [loadJobs])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Layers className="h-4 w-4 text-[#0060A9]" />
            Batch Crawl Tasks & Collector Execution Jobs
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Detailed log of scheduled background crawlers, batch tasks, and item processing counts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-[#0060A9]"
          >
            <option value="all">All Job Statuses</option>
            <option value="completed">Completed</option>
            <option value="running">Running / Active</option>
            <option value="failed">Failed</option>
          </select>

          <button
            type="button"
            onClick={() => void loadJobs()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setQ(e.currentTarget.value.trim())
              setPage(1)
            }
          }}
          placeholder="Search batch task ID, disease, country, or status..."
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-10 text-xs font-medium text-slate-800 placeholder-slate-400 outline-none transition focus:border-[#0060A9] focus:ring-1 focus:ring-[#0060A9] shadow-2xs"
        />
        {qInput && (
          <button
            type="button"
            onClick={() => {
              setQInput('')
              setQ('')
              setPage(1)
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {loading && jobs.length === 0 ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin text-[#0060A9]" /> Loading collector jobs...
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-400">
            No collector execution jobs found matching current filter.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 text-left text-xs min-w-[1000px]">
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <th className="sticky top-0 border-b border-r border-slate-200 bg-slate-50 px-3 py-3">Task ID</th>
                    <th className="sticky top-0 border-b border-r border-slate-200 bg-slate-50 px-3 py-3">Status</th>
                    <th className="sticky top-0 border-b border-r border-slate-200 bg-slate-50 px-3 py-3">Target Disease</th>
                    <th className="sticky top-0 border-b border-r border-slate-200 bg-slate-50 px-3 py-3">Country / Region</th>
                    <th className="sticky top-0 border-b border-r border-slate-200 bg-slate-50 px-3 py-3">Discovered</th>
                    <th className="sticky top-0 border-b border-r border-slate-200 bg-slate-50 px-3 py-3">Processed</th>
                    <th className="sticky top-0 border-b border-r border-slate-200 bg-slate-50 px-3 py-3 font-extrabold text-slate-700">Rows Stored</th>
                    <th className="sticky top-0 border-b border-r border-slate-200 bg-slate-50 px-3 py-3">Started</th>
                    <th className="sticky top-0 border-b border-r border-slate-200 bg-slate-50 px-3 py-3">Completed</th>
                    <th className="sticky top-0 border-b border-slate-200 bg-slate-50 px-3 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {jobs.map((job) => (
                    <tr key={job.job_id} className="hover:bg-blue-50/40 transition">
                      <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-3 font-mono text-[11px] font-bold text-slate-800">
                        {job.job_id.length > 12 ? `${job.job_id.slice(0, 10)}...` : job.job_id}
                      </td>
                      <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-3">
                        {statusBadge(job.status)}
                      </td>
                      <td className="max-w-[200px] truncate border-b border-r border-slate-100 px-3 py-3 font-medium text-slate-800" title={diseaseNames(job.disease_names)}>
                        {diseaseNames(job.disease_names)}
                      </td>
                      <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-3 text-slate-700">
                        {[job.country, job.region, job.province_city].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-3 font-mono text-slate-700">
                        {fmtNum(job.discovered_count)}
                      </td>
                      <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-3 font-mono text-slate-700">
                        {fmtNum(job.processed_count)}
                      </td>
                      <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-3 font-mono font-bold text-[#0060A9]">
                        {fmtNum(job.row_count)}
                      </td>
                      <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-3 text-[11px] text-slate-500">
                        {job.created_at ? job.created_at.slice(0, 16).replace('T', ' ') : '—'}
                      </td>
                      <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-3 text-[11px] text-slate-500">
                        {job.completed_at ? job.completed_at.slice(0, 16).replace('T', ' ') : '—'}
                      </td>
                      <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3 text-center">
                        <Link
                          href={`/crawl-history?job_id=${encodeURIComponent(job.job_id)}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-[#0060A9] hover:bg-blue-50 transition shadow-2xs"
                          title="View extracted rows for this task"
                        >
                          <span>View Matrix</span>
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => p + 1)}
              onGoTo={setPage}
            />
          </>
        )}
      </div>
    </div>
  )
}
