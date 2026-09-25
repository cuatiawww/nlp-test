'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Database, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import Modal from '@/components/Modal'
import { authHeaders, getAuthUser } from '@/lib/auth'

type CleanupScope = 'crawler_history'

interface CleanupStats {
  total_events: number
  total_raw_reports: number
  reanalyzable_reports: number
  cached_nlp: number
  collector_runs: number
  active_collector_runs: number
  historical_records_found: number
}

interface ScopeRow {
  scope: CleanupScope
  label: string
  deletes: string
  keeps: string
  counter: string
  risk: 'low' | 'medium' | 'high'
}

const SCOPE_ROWS: ScopeRow[] = [
  {
    scope: 'crawler_history',
    label: 'Completed collector run log',
    deletes: 'Completed/failed collector run log entries',
    keeps: 'Stored crawl results, raw articles, NLP results, disease events, and sources',
    counter: 'Historical Total Crawled returns to 0; active crawl remains visible',
    risk: 'low',
  },
]

function formatNumber(value?: number | null) {
  return typeof value === 'number' ? value.toLocaleString('en-US') : '—'
}

function riskClass(risk: ScopeRow['risk']) {
  if (risk === 'high') return 'bg-red-50 text-red-700'
  if (risk === 'medium') return 'bg-amber-50 text-amber-700'
  return 'bg-emerald-50 text-emerald-700'
}

export default function CrawlerHistoryCleanupPanel({ onCleaned }: { onCleaned?: () => void }) {
  const [stats, setStats] = useState<CleanupStats | null>(null)
  const [loadingStats, setLoadingStats] = useState(true)
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadStats = async () => {
    setLoadingStats(true)
    try {
      const response = await fetch('/nlp/api/v1/data/cleanup-stats', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to load cleanup statistics.')
      setStats(payload.data)
    } catch (err: any) {
      setError(err?.message || 'Unable to load cleanup statistics.')
    } finally {
      setLoadingStats(false)
    }
  }

  useEffect(() => {
    void loadStats()
  }, [])

  const selected = SCOPE_ROWS[0]
  const scope: CleanupScope = 'crawler_history'

  const openCleanup = () => {
    setConfirmation('')
    setReason('')
    setError(null)
    setOpen(true)
  }

  const executeCleanup = async () => {
    if (confirmation.trim() !== 'RESET') {
      setError('Ketik RESET untuk melanjutkan.')
      return
    }
    if (!getAuthUser()) {
      setError('Sesi admin diperlukan untuk membersihkan history crawler.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/nlp/api/v1/data/cleanup-events', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          scope,
          confirmation: 'RESET',
          reason: reason.trim() || `Cleanup ${selected.label.toLowerCase()} dari Crawl History`,
        }),
      })
      const payload = await response.json()
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Cleanup gagal dijalankan.')
      toast.success(payload.data?.message || 'Cleanup selesai.')
      setOpen(false)
      await loadStats()
      onCleaned?.()
    } catch (err: any) {
      const message = err?.message || 'Cleanup gagal dijalankan.'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section id="collector-run-log" className="mt-5 scroll-mt-4 rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-4">
        <div>
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-[#0060A9]" />
            <h2 className="text-sm font-bold uppercase tracking-[0.04em] text-slate-900">Collector run log</h2>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
            Kontrol administratif untuk log proses crawling. Ini tidak menghapus hasil crawling yang dipakai untuk monitoring akurasi.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadStats()}
          disabled={loadingStats}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loadingStats ? 'animate-spin' : ''}`} />
          Refresh stats
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 border-b border-slate-100 p-4 md:grid-cols-4">
        {[
          ['Historical records', stats?.historical_records_found],
          ['Completed runs', stats?.collector_runs],
          ['Active runs', stats?.active_collector_runs],
          ['Stored raw articles', stats?.total_raw_reports],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <p className="text-[11px] font-medium text-slate-500">{label as string}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
              {loadingStats ? '…' : formatNumber(value as number | undefined)}
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto p-4">
        <table className="w-full min-w-[920px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2 font-bold">Scope</th>
              <th className="px-3 py-2 font-bold">Deletes</th>
              <th className="px-3 py-2 font-bold">Keeps</th>
              <th className="px-3 py-2 font-bold">Counter impact</th>
              <th className="px-3 py-2 font-bold">Risk</th>
              <th className="px-3 py-2 font-bold">Protection</th>
            </tr>
          </thead>
          <tbody>
            {SCOPE_ROWS.map((row) => (
              <tr key={row.scope} className="border-b border-slate-100 bg-blue-50/50 align-top">
                <td className="px-3 py-3 font-semibold text-slate-900">{row.label}</td>
                <td className="px-3 py-3 text-slate-600">{row.deletes}</td>
                <td className="px-3 py-3 text-slate-600">{row.keeps}</td>
                <td className="px-3 py-3 text-slate-600">{row.counter}</td>
                <td className="px-3 py-3">
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${riskClass(row.risk)}`}>{row.risk}</span>
                </td>
                <td className="px-3 py-3 text-emerald-700">Active runs are never deleted</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && !open && <p className="px-4 pb-3 text-xs font-medium text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-4 py-3">
        <p className="text-xs text-slate-500">
          Scope: <span className="font-semibold text-slate-800">{selected.label}</span>
          {stats?.active_collector_runs ? ' — tunggu active run selesai sebelum menghapus history.' : ''}
        </p>
        <button
          type="button"
          onClick={openCleanup}
          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-red-700"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear completed run log
        </button>
      </div>

      <Modal open={open} onClose={() => !loading && setOpen(false)} title="Clear completed collector run log" maxWidth="max-w-xl">
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>{selected.deletes}. {selected.keeps} tetap dipertahankan.</span>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700">Audit note (optional)</label>
            <input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-500" placeholder="Alasan cleanup" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700">Ketik <span className="font-mono text-red-600">RESET</span> untuk konfirmasi</label>
            <input value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setError(null) }} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs font-bold tracking-widest outline-none focus:border-red-500" placeholder="RESET" />
          </div>
          {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button type="button" onClick={() => setOpen(false)} disabled={loading} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button type="button" onClick={() => void executeCleanup()} disabled={loading || confirmation.trim() !== 'RESET'} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {loading ? 'Cleaning…' : 'Execute cleanup'}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  )
}
