'use client'

import { useState } from 'react'
import { Save, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createNlpLabel, updateNlpLabel, deleteNlpLabel } from '@/lib/api'
import { usePaginatedFetch } from '@/hooks/usePaginatedFetch'
import SearchInput from '@/components/SearchInput'
import Pagination from '@/components/Pagination'

interface Label {
  id: string; category: string; label: string; is_active: boolean; priority: number
}

const CATEGORIES = ['disease', 'event_type', 'sentiment', 'relevance']
const CAT_LABELS: Record<string, string> = {
  disease: 'Disease Labels',
  event_type: 'Event Type Labels',
  sentiment: 'Sentiment Labels',
  relevance: 'Relevance Labels',
}

export default function NlpLabelsPage() {
  const [activeCat, setActiveCat] = useState('disease')
  const { data: items, loading, page, total, totalPages, search, setSearch, nextPage, prevPage, reload } = usePaginatedFetch<Label>(`/api/v1/nlp-labels?category=${activeCat}`)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ label: '', priority: 0, is_active: true })
  const [newForm, setNewForm] = useState<Record<string, { label: string; priority: number }>>({})

  const handleSave = async (id: string) => {
    try {
      await updateNlpLabel(id, editForm)
      setEditId(null)
      toast.success('Label updated')
      reload()
    } catch { toast.error('Failed to update') }
  }

  const handleCreate = async () => {
    const form = newForm[activeCat]
    if (!form?.label) return
    try {
      await createNlpLabel({ category: activeCat, ...form, is_active: true })
      setNewForm(f => ({ ...f, [activeCat]: { label: '', priority: 0 } }))
      toast.success('Label added')
      reload()
    } catch { toast.error('Failed to add') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus label ini?')) return
    try {
      await deleteNlpLabel(id)
      toast.success('Label deleted')
      reload()
    } catch { toast.error('Failed to delete') }
  }

  return (
    <div className="px-4 md:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">NLP Labels</h1>
      </div>
      <p className="mt-1 text-sm text-slate-500">Kelola label untuk klasifikasi NLP</p>

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
          <SearchInput value={search} onChange={setSearch} placeholder="Cari label..." />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? <div className="p-8 text-center text-slate-400 text-sm">Memuat...</div> : items.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">Belum ada label</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">Label</th>
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
                      <td className="px-4 py-2">
                        <input value={editForm.label} onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))}
                          className="w-full rounded-lg border px-2 py-1 text-xs" />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input type="number" value={editForm.priority} onChange={e => setEditForm(f => ({ ...f, priority: parseInt(e.target.value) || 0 }))}
                          className="w-16 rounded-lg border px-2 py-1 text-xs text-right" />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input type="checkbox" checked={editForm.is_active} onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked }))} />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button onClick={() => handleSave(l.id)} className="rounded-lg p-1.5 text-teal-600 hover:bg-teal-50">
                          <Save className="h-4 w-4" />
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-slate-800">{l.label}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{l.priority}</td>
                      <td className="px-4 py-3 text-center">
                        {l.is_active
                          ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-600">Ya</span>
                          : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Tidak</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => { setEditId(l.id); setEditForm({ label: l.label, priority: l.priority, is_active: l.is_active }) }}
                          className="rounded-lg px-2 py-1 text-xs font-semibold text-teal-600 hover:bg-teal-50">Edit</button>
                        <button onClick={() => handleDelete(l.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
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
        <Pagination page={page} totalPages={totalPages} total={total} onPrev={prevPage} onNext={nextPage} />
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-xs font-bold uppercase tracking-[0.04em] text-slate-600">Tambah Label Baru</h3>
        <div className="mt-3 flex items-center gap-2">
          <input placeholder="New label..." value={newForm[activeCat]?.label || ''}
            onChange={e => setNewForm(f => ({ ...f, [activeCat]: { ...f[activeCat], label: e.target.value, priority: 0 } }))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs flex-1" />
          <button onClick={handleCreate}
            className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700">
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
      </div>
    </div>
  )
}
