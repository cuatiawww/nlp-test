'use client'

import { useEffect, useState } from 'react'
import { usePaginatedFetch } from '@/hooks/usePaginatedFetch'
import SearchInput from '@/components/SearchInput'
import Pagination from '@/components/Pagination'
import CleanupButton from './CleanupButton'

function sentimentBadge(s?: string) {
  if (!s || s === 'neutral') return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Netral</span>
  if (s === 'positive') return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-600">Positif</span>
  if (s === 'negative') return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">Negatif</span>
  return <span className="text-xs text-slate-400">{s}</span>
}

function extractTitle(text: string) {
  return text.split('\n')[0].slice(0, 80) || text.slice(0, 80)
}

function relevanceBadge(score?: string) {
  if (!score || score === 'low')
    return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Rendah</span>
  if (score === 'high')
    return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-600">Tinggi</span>
  return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-600">Sedang</span>
}

export default function EventsPage() {
  const { data, loading, page, total, totalPages, search, setSearch, nextPage, prevPage } = usePaginatedFetch<any[]>('/api/v1/events')

  return (
    <div className="px-4 md:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">Data Events</h1>
          <p className="mt-1 text-sm text-slate-500">Daftar hasil NLP yang sudah diproses</p>
        </div>
        <CleanupButton />
      </div>

      <div className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <SearchInput value={search} onChange={setSearch} placeholder="Cari penyakit, lokasi, sumber..." />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">Memuat...</div>
          ) : data.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">Belum ada data</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-600">Judul</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Sumber</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Tanggal</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Lokasi</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Penyakit</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Kasus</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600">Sentimen</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600">Relevansi</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600">Kredibilitas</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600">Alert</th>
                </tr>
              </thead>
              <tbody>
                {data.map((e: any, idx: number) => (
                  <tr key={idx} className="border-b border-slate-50 hover:bg-teal-50/40">
                    <td className="px-4 py-3 max-w-[220px]">
                      <div className="truncate text-sm font-medium text-slate-800" title={e.title || ''}>
                        {e.title ? extractTitle(e.title) : '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-[140px] truncate">
                      {e.url
                        ? <a href={e.url} target="_blank" rel="noopener noreferrer"
                            className="text-teal-600 hover:text-teal-700 hover:underline">{e.source_name || e.source_type || 'link'}</a>
                        : <span className="text-xs text-slate-600">{e.source_name || e.source_type || '-'}</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{e.published_at || e.created_at?.slice(0, 10) || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{e.location_name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{e.disease_classification || '-'}</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700">{e.case_count}</td>
                    <td className="px-4 py-3 text-center">{sentimentBadge(e.sentiment)}</td>
                    <td className="px-4 py-3 text-center">{relevanceBadge(e.relevance_score)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs font-medium text-slate-600">
                        {e.source_credibility ? `${(e.source_credibility * 100).toFixed(0)}%` : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {e.outbreak_alert
                        ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">Ya</span>
                        : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">Tidak</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <Pagination page={page} totalPages={totalPages} total={total} onPrev={prevPage} onNext={nextPage} />
      </div>
    </div>
  )
}
