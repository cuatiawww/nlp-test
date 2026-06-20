'use client'

import { useState } from 'react'
import { Play, Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Source } from '@/types'
import { usePaginatedFetch } from '@/hooks/usePaginatedFetch'
import SearchInput from '@/components/SearchInput'
import Pagination from '@/components/Pagination'
import { triggerCollect, createSource, updateSource, deleteSource } from '@/lib/api'

export default function SourcesPage() {
  const { data, loading, page, setPage, total, totalPages, search, setSearch, nextPage, prevPage, reload } = usePaginatedFetch<Source>('/api/v1/sources')
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState({ name: '', source_type: 'rss', config: '{}', schedule: '' })
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', source_type: 'rss', config: '{}', schedule: '', enabled: true })

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      let config: any = {}
      try { config = JSON.parse(newForm.config) } catch { config = { url: newForm.config } }
      await createSource({ name: newForm.name, source_type: newForm.source_type, config, schedule: newForm.schedule || null } as any)
      setShowNew(false)
      setNewForm({ name: '', source_type: 'rss', config: '{}', schedule: '' })
      toast.success('Sumber data ditambahkan')
      reload()
    } catch { toast.error('Gagal menambah') }
  }

  const handleUpdate = async () => {
    if (!editId) return
    try {
      let config: any = {}
      try { config = JSON.parse(editForm.config) } catch { config = { url: editForm.config } }
      await updateSource(editId, { name: editForm.name, source_type: editForm.source_type, config, schedule: editForm.schedule || null, enabled: editForm.enabled } as any)
      setEditId(null)
      toast.success('Sumber data diupdate')
      reload()
    } catch { toast.error('Gagal mengupdate') }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Hapus sumber data "${name}"?`)) return
    try {
      await deleteSource(id)
      toast.success(`${name} dihapus`)
      reload()
    } catch { toast.error('Gagal menghapus') }
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
          <button onClick={() => setShowNew(!showNew)}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-3 py-2 text-sm font-bold uppercase text-white transition hover:bg-teal-700">
            <Plus className="h-4 w-4" /> Tambah
          </button>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <SearchInput value={search} onChange={setSearch} placeholder="Cari sumber data..." />
        </div>
      </div>

      {showNew && (
        <form onSubmit={handleCreate} className="mt-4 rounded-2xl border border-teal-200 bg-teal-50 p-5">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.04em] text-teal-700">Tambah Sumber Data Baru</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <input placeholder="Nama*" value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
            <select value={newForm.source_type} onChange={e => setNewForm(f => ({ ...f, source_type: e.target.value }))}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="rss">RSS</option>
              <option value="web">Web</option>
              <option value="csv">CSV</option>
              <option value="social_media">Social Media</option>
              <option value="api">API</option>
            </select>
            <input placeholder="URL / Config JSON" value={newForm.config} onChange={e => setNewForm(f => ({ ...f, config: e.target.value }))}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input placeholder="Schedule (e.g. interval:60)" value={newForm.schedule} onChange={e => setNewForm(f => ({ ...f, schedule: e.target.value }))}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setShowNew(false)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600">Batal</button>
            <button type="submit"
              className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold uppercase text-white">Simpan</button>
          </div>
        </form>
      )}

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
                  {editId === s.id ? (
                    <>
                      <td className="px-4 py-2"><input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="w-full rounded border px-2 py-1 text-xs" /></td>
                      <td className="px-4 py-2">
                        <select value={editForm.source_type} onChange={e => setEditForm(f => ({ ...f, source_type: e.target.value }))} className="rounded border px-2 py-1 text-xs">
                          <option value="rss">RSS</option>
                          <option value="web">Web</option>
                          <option value="csv">CSV</option>
                          <option value="social_media">Social Media</option>
                          <option value="api">API</option>
                        </select>
                      </td>
                      <td className="px-4 py-2"><input value={editForm.schedule} onChange={e => setEditForm(f => ({ ...f, schedule: e.target.value }))} className="w-full rounded border px-2 py-1 text-xs" /></td>
                      <td className="px-4 py-2 text-center">
                        <label className="flex items-center gap-1 justify-center text-xs text-slate-600">
                          <input type="checkbox" checked={editForm.enabled} onChange={e => setEditForm(f => ({ ...f, enabled: e.target.checked }))} />
                          Aktif
                        </label>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button onClick={handleUpdate} className="rounded p-1.5 text-teal-600 hover:bg-teal-50"><Save className="h-4 w-4" /></button>
                        <button onClick={() => setEditId(null)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100"><span className="text-xs font-medium">Batal</span></button>
                      </td>
                    </>
                  ) : (
                    <>
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
                        <button onClick={() => {
                          setEditId(s.id)
                          setEditForm({
                            name: s.name,
                            source_type: s.source_type,
                            config: typeof s.config === 'object' ? JSON.stringify(s.config) : String(s.config || ''),
                            schedule: s.schedule || '',
                            enabled: s.enabled !== false,
                          })
                        }}
                          className="rounded-lg px-2 py-1 text-xs font-semibold text-teal-600 hover:bg-teal-50"
                          title="Edit">
                          Edit
                        </button>
                        <button onClick={() => handleDelete(s.id, s.name)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          title="Hapus">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={totalPages} total={total} onPrev={prevPage} onNext={nextPage} onGoTo={setPage} />
      </div>
    </div>
  )
}
