'use client'

import { useState } from 'react'
import { Save, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createNlpKeyword, updateNlpKeyword, deleteNlpKeyword } from '@/lib/api'
import { usePaginatedFetch } from '@/hooks/usePaginatedFetch'
import SearchInput from '@/components/SearchInput'
import Pagination from '@/components/Pagination'

interface Keyword {
  id: string; category: string; keyword: string; target_label: string; is_active: boolean; priority: number
}

const CATEGORIES = ['symptom', 'disease']
const CAT_LABELS: Record<string, string> = { symptom: 'Symptom Keywords', disease: 'Disease Keywords' }

export default function NlpKeywordsPage() {
  const [activeCat, setActiveCat] = useState('symptom')
  const { data: items, loading, page, setPage, total, totalPages, search, setSearch, nextPage, prevPage, reload } = usePaginatedFetch<Keyword>(`/api/v1/nlp-keywords?category=${activeCat}`)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ keyword: '', target_label: '', priority: 0, is_active: true })
  const [newForm, setNewForm] = useState<Record<string, { keyword: string; target_label: string; priority: number }>>({})

  const handleSave = async (id: string) => {
    try {
      await updateNlpKeyword(id, editForm)
      setEditId(null); toast.success('Updated'); reload()
    } catch { toast.error('Failed') }
  }

  const handleCreate = async () => {
    const f = newForm[activeCat]
    if (!f?.keyword) return
    try {
      await createNlpKeyword({ category: activeCat, ...f, is_active: true })
      setNewForm(f2 => ({ ...f2, [activeCat]: { keyword: '', target_label: '', priority: 0 } }))
      toast.success('Added'); reload()
    } catch { toast.error('Failed') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus keyword ini?')) return
    try {
      await deleteNlpKeyword(id)
      toast.success('Deleted'); reload()
    } catch { toast.error('Failed') }
  }

  return (
    <div className="px-4 md:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">NLP Keywords</h1>
      </div>
      <p className="mt-1 text-sm text-slate-500">Keyword dictionary untuk ekstraksi penyakit & gejala</p>

      <div className="mt-4 flex items-center gap-4">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setActiveCat(cat)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase transition ${activeCat === cat ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {CAT_LABELS[cat]}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <SearchInput value={search} onChange={setSearch} placeholder="Cari keyword..." />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? <div className="p-8 text-center text-slate-400 text-sm">Memuat...</div> : items.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">Belum ada keyword</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">Keyword</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Target Label</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Priority</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Active</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {items.map(l => (
                <tr key={l.id} className="border-b border-slate-50 hover:bg-teal-50/40">
                  {editId === l.id ? (
                    <>
                      <td className="px-4 py-2"><input value={editForm.keyword} onChange={e => setEditForm(f => ({ ...f, keyword: e.target.value }))} className="w-full rounded border px-2 py-1 text-xs" /></td>
                      <td className="px-4 py-2"><input value={editForm.target_label} onChange={e => setEditForm(f => ({ ...f, target_label: e.target.value }))} className="w-full rounded border px-2 py-1 text-xs" /></td>
                      <td className="px-4 py-2 text-right"><input type="number" value={editForm.priority} onChange={e => setEditForm(f => ({ ...f, priority: parseInt(e.target.value) || 0 }))} className="w-16 rounded border px-2 py-1 text-xs text-right" /></td>
                      <td className="px-4 py-2 text-center"><input type="checkbox" checked={editForm.is_active} onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked }))} /></td>
                      <td className="px-4 py-2 text-right"><button onClick={() => handleSave(l.id)} className="rounded p-1.5 text-teal-600 hover:bg-teal-50"><Save className="h-4 w-4" /></button></td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-medium text-slate-800">{l.keyword}</td>
                      <td className="px-4 py-3"><span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-700">{l.target_label}</span></td>
                      <td className="px-4 py-3 text-right text-slate-600">{l.priority}</td>
                      <td className="px-4 py-3 text-center">{l.is_active ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-600">Ya</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Tidak</span>}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => { setEditId(l.id); setEditForm({ keyword: l.keyword, target_label: l.target_label, priority: l.priority, is_active: l.is_active }) }} className="rounded px-2 py-1 text-xs font-semibold text-teal-600 hover:bg-teal-50">Edit</button>
                        <button onClick={() => handleDelete(l.id)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
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

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-xs font-bold uppercase tracking-[0.04em] text-slate-600">Tambah Keyword Baru</h3>
        <div className="mt-3 flex items-center gap-2">
          <input placeholder="New keyword..." value={newForm[activeCat]?.keyword || ''} onChange={e => setNewForm(f => ({ ...f, [activeCat]: { ...f[activeCat], keyword: e.target.value, target_label: '', priority: 0 } }))} className="rounded border border-slate-200 px-3 py-1.5 text-xs flex-1" />
          <input placeholder="Target label" value={newForm[activeCat]?.target_label || ''} onChange={e => setNewForm(f => ({ ...f, [activeCat]: { ...f[activeCat], target_label: e.target.value.toUpperCase().replace(/ /g, '_'), priority: 0 } }))} className="w-32 rounded border border-slate-200 px-3 py-1.5 text-xs" />
          <button onClick={handleCreate} className="inline-flex items-center gap-1 rounded bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"><Plus className="h-3 w-3" /> Add</button>
        </div>
      </div>
    </div>
  )
}
