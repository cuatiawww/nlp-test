'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchCrawlOps, triggerCollect } from '@/lib/api'
import type { CrawlOps } from '@/types'
import { toast } from 'sonner'

export default function CrawlOpsPanel() {
  const [ops, setOps] = useState<CrawlOps | null>(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      setOps(await fetchCrawlOps())
    } catch {
      setOps(null)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const retry = async (id: string, name: string) => {
    toast.promise(triggerCollect(id), {
      loading: `Retrying ${name}…`,
      success: () => { void load(); return `${name} queued` },
      error: 'Retry failed',
    })
  }

  const failed = ops?.failed_queue ?? []
  const history = ops?.recent_history ?? []

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Crawl operations</p>
          <p className="mt-1 text-sm text-slate-700">
            Failed queue: {failed.length.toLocaleString()} · backoff sources: {(ops?.backoff_source_count ?? 0).toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {ops?.dispatcher || 'Due-source dispatcher every 2 minutes'}. Empty schedules default to {ops?.default_schedule || 'interval:60'}. Failures back off; rate limits are preserved.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold uppercase text-slate-600 hover:bg-slate-50"
        >
          {open ? 'Hide queue' : 'Show failed queue & history'}
        </button>
      </div>
      {open && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.06em] text-slate-600">Failed crawl queue</h3>
            {failed.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">No latest-run failures.</p>
            ) : (
              <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto text-xs">
                {failed.map((item) => (
                  <li key={item.run_id} className="rounded-xl border border-red-100 bg-red-50/60 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800">{item.source_name}</span>
                      <button
                        type="button"
                        onClick={() => retry(item.source_id, item.source_name)}
                        className="rounded-lg bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-[#0060A9]"
                      >
                        Retry
                      </button>
                    </div>
                    <p className="mt-1 text-slate-500">{item.schedule || 'interval:60'} · {item.started_at?.slice(0, 19) || '—'}</p>
                    <p className="mt-1 text-red-600">{item.error_message || 'Failed'}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.06em] text-slate-600">Recent crawl history</h3>
            {history.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">No runs yet.</p>
            ) : (
              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs">
                {history.map((run) => (
                  <li key={run.id} className="flex items-center justify-between gap-2 border-b border-slate-50 py-1">
                    <span className="truncate font-medium text-slate-700">{run.source_name || run.source_id}</span>
                    <span className={run.status === 'FAILED' ? 'font-semibold text-red-600' : run.status === 'SUCCESS' ? 'text-emerald-600' : 'text-amber-600'}>
                      {run.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
