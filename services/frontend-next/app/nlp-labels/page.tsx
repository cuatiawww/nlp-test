'use client'

import { useEffect, useState } from 'react'
import { Save, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

const API = ''

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
  const [labels, setLabels] = useState<Record<string, Label[]>>({})
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ label: '', priority: 0, is_active: true })
  const [newForm, setNewForm] = useState<Record<string, { label: string; priority: number }>>({})

  const load = async () => {
    setLoading(true)
    const result: Record<string, Label[]> = {}
    for (const cat of CATEGORIES) {
      try {
        const res = await fetch(`${API}/api/v1/nlp-labels?category=${cat}`)
        const d = await res.json()
        result[cat] = d.data || []
      } catch { result[cat] = [] }
    }
    setLabels(result)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleSave = async (id: string) => {
    try {
      await fetch(`${API}/api/v1/nlp-labels/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      setEditId(null)
      toast.success('Label updated')
      load()
    } catch { toast.error('Failed to update') }
  }

  const handleCreate = async (category: string) => {
    const form = newForm[category]
    if (!form?.label) return
    try {
      await fetch(`${API}/api/v1/nlp-labels`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, ...form, is_active: true }),
      })
      setNewForm(f => ({ ...f, [category]: { label: '', priority: 0 } }))
      toast.success('Label added')
      load()
    } catch { toast.error('Failed to add') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus label ini?')) return
    try {
      await fetch(`${API}/api/v1/nlp-labels/${id}`, { method: 'DELETE' })
      toast.success('Label deleted')
      load()
    } catch { toast.error('Failed to delete') }
  }

  return (
    <div className="px-4 md:px-6">
      <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">NLP Labels</h1>
      <p className="mt-1 text-sm text-slate-500">Kelola label untuk klasifikasi NLP (auto-refresh ke NLP service tiap 60 detik)</p>

      {loading ? <div className="mt-4 text-center text-slate-400">Memuat...</div> : (
        CATEGORIES.map(cat => (
          <div key={cat} className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
              <h2 className="text-base font-bold uppercase tracking-[0.04em] text-slate-900">{CAT_LABELS[cat]}</h2>
            </div>

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
                {(labels[cat] || []).map(l => (
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

            <div className="border-t border-slate-100 bg-slate-50 px-5 py-3">
              <div className="flex items-center gap-2">
                <input placeholder="New label..." value={newForm[cat]?.label || ''}
                  onChange={e => setNewForm(f => ({ ...f, [cat]: { ...f[cat], label: e.target.value, priority: 0 } }))}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs flex-1" />
                <button onClick={() => handleCreate(cat)}
                  className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700">
                  <Plus className="h-3 w-3" /> Add
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
