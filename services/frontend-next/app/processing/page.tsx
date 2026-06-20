'use client'

import { useEffect, useState } from 'react'
import { fetchPaginated } from '@/lib/api'

export default function ProcessingPage() {
  const [runs, setRuns] = useState<any[]>([])
  const [events, setEvents] = useState({ total: 0, health: 0, nonHealth: 0 })
  const [time, setTime] = useState(new Date())
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const [runsRes, eventsRes, healthRes, nonHealthRes] = await Promise.all([
        fetch('/nlp/api/v1/runs?per_page=10'),
        fetch('/nlp/api/v1/events'),
        fetch('/nlp/api/v1/events?is_health_related=true'),
        fetch('/nlp/api/v1/events?is_health_related=false'),
      ])
      setRuns((await runsRes.json()).data || [])
      const ev = (await eventsRes.json())
      const hl = (await healthRes.json())
      const nh = (await nonHealthRes.json())
      setEvents({ total: ev.total || 0, health: hl.total || 0, nonHealth: nh.total || 0 })
    } catch {}
    setLoading(false)
    setTime(new Date())
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 10000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="px-4 md:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">Processing Monitor</h1>
        <span className="text-xs text-slate-400">Auto-refresh 10 detik • {time.toLocaleTimeString()}</span>
      </div>
      <p className="mt-1 text-sm text-slate-500">Status pemrosesan data secara real-time</p>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-3xl font-bold text-teal-600">{events.total}</div>
          <div className="mt-1 text-xs font-semibold uppercase text-slate-500">Total Events</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="text-3xl font-bold text-emerald-600">{events.health}</div>
          <div className="mt-1 text-xs font-semibold uppercase text-emerald-600">Health</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="text-3xl font-bold text-amber-600">{events.nonHealth}</div>
          <div className="mt-1 text-xs font-semibold uppercase text-amber-600">Non Health</div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.04em] text-slate-600">Recent Collector Runs</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">Memuat...</div>
        ) : runs.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">Belum ada data</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Found</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Ingested</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Error</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Started</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r: any) => (
                  <tr key={r.id} className="border-b border-slate-50">
                    <td className="px-4 py-3">
                      {r.status === 'SUCCESS' ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-600">{r.status}</span>
                      ) : r.status === 'RUNNING' ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-600">{r.status}</span>
                      ) : (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">{r.status}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">{r.records_found}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{r.records_ingested}</td>
                    <td className="px-4 py-3 max-w-[200px] truncate text-xs text-red-500">{r.error_message || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{r.started_at?.slice(0, 19) || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
