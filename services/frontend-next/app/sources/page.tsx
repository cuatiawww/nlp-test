'use client'

import { Plus, Play } from 'lucide-react'
import { toast } from 'sonner'
import type { Source } from '@/types'
import Link from 'next/link'
import { usePaginatedFetch } from '@/hooks/usePaginatedFetch'
import SearchInput from '@/components/SearchInput'
import Pagination from '@/components/Pagination'
import { triggerCollect } from '@/lib/api'

export default function SourcesPage() {
  const { data, loading, page, total, totalPages, search, setSearch, nextPage, prevPage, reload } = usePaginatedFetch<Source>('/api/v1/sources')

  const handleTrigger = async (id: string, name: string) => {
    toast.promise(
      triggerCollect(id),
      {
        loading: `Memproses ${name}...`,
        success: () => { setTimeout(reload, 500); return `${name} selesai` },
        error: `Gagal memproses ${name}`,
      }
    )
  }

  const statusBadge = (s: Source) => {
    const last = s.last_run
    if (!last) return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Belum pernah</span>
    if (last.status === 'SUCCESS') return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-600">Berhasil</span>
    if (last.status === 'FAILED') return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">Gagal</span>
    return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-600">Berjalan</span>
  }

  return (
    <div className="px-4 md:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">Sumber Data</h1>
          <p className="mt-1 text-sm text-slate-500">Kelola sumber data untuk koleksi berita dan laporan</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={reload} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold uppercase text-slate-600 transition hover:bg-slate-50">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Refresh
          </button>
          <Link href="/sources/new"
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-3 py-2 text-sm font-bold uppercase text-white transition hover:bg-teal-700">
            <Plus className="h-4 w-4" /> Tambah
          </Link>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <SearchInput value={search} onChange={setSearch} placeholder="Cari sumber data..." />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Memuat...</div>
        ) : data.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">Belum ada sumber data</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">Nama</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Tipe</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Jadwal</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id} className="border-b border-slate-50 hover:bg-teal-50/40">
                  <td className="px-4 py-3">
                    <span className="font-semibold text-teal-700">{s.name}</span>
                    <div className="mt-0.5 text-xs text-slate-400">{s.schedule || 'manual'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600">{s.source_type}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{s.schedule || '—'}</td>
                  <td className="px-4 py-3">{statusBadge(s)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleTrigger(s.id, s.name)}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-teal-50 hover:text-teal-600"
                      title="Trigger collection">
                      <Play className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={totalPages} total={total} onPrev={prevPage} onNext={nextPage} />
      </div>
    </div>
  )
}
