'use client'

import { useEffect, useState } from 'react'
import { Save, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'


const API = process.env.NEXT_PUBLIC_API_BASE_URL || ''

interface Keyword {
  id: string; category: string; keyword: string; target_label: string; is_active: boolean; priority: number
}

const CATEGORIES = ['symptom', 'disease']
const CAT_LABELS: Record<string, string> = { symptom: 'Symptom Keywords', disease: 'Disease Keywords' }

export default function NlpKeywordsPage() {
  const [data, setData] = useState<Record<string, Keyword[]>>({})
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ keyword: '', target_label: '', priority: 0, is_active: true })
  const [newForm, setNewForm] = useState<Record<string, { keyword: string; target_label: string; priority: number }>>({})

  const load = async () => {
    setLoading(true)
    const result: Record<string, Keyword[]> = {}
    for (const cat of CATEGORIES) {
      try {
        const res = await fetch(`${API}/api/v1/nlp-keywords?category=${cat}`)
        const d = await res.json()
        result[cat] = d.data || []
      } catch { result[cat] = [] }
    }
    setData(result)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleSave = async (id: string) => {
    try {
      await fetch(`${API}/api/v1/nlp-keywords/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      setEditId(null); toast.success('Updated'); load()
    } catch { toast.error('Failed') }
  }

  const handleCreate = async (cat: string) => {
    const f = newForm[cat]
    if (!f?.keyword) return
    try {
      await fetch(`${API}/api/v1/nlp-keywords`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: cat, ...f, is_active: true }),
      })
      setNewForm(f2 => ({ ...f2, [cat]: { keyword: '', target_label: '', priority: 0 } }))
      toast.success('Added'); load()
    } catch { toast.error('Failed') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus keyword ini?')) return
    try {
      await fetch(`${API}/api/v1/nlp-keywords/${id}`, { method: 'DELETE' })
      toast.success('Deleted'); load()
    } catch { toast.error('Failed') }
  }

  return (
    <div className="px-4 md:px-6">
      <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">NLP Keywords</h1>
      <p className="mt-1 text-sm text-slate-500">Keyword dictionary untuk ekstraksi penyakit & gejala (auto-refresh tiap 60 detik)</p>

      {loading ? <div className="mt-4 text-center text-slate-400">Memuat...</div> : CATEGORIES.map(cat => (
        <div key={cat} className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
            <h2 className="text-base font-bold uppercase tracking-[0.04em] text-slate-900">{CAT_LABELS[cat]}</h2>
          </div>
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
              {(data[cat] || []).map(l => (
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
          <div className="border-t border-slate-100 bg-slate-50 px-5 py-3">
            <div className="flex items-center gap-2">
              <input placeholder="New keyword..." value={newForm[cat]?.keyword || ''} onChange={e => setNewForm(f => ({ ...f, [cat]: { ...f[cat], keyword: e.target.value, target_label: '', priority: 0 } }))} className="rounded border border-slate-200 px-3 py-1.5 text-xs flex-1" />
              <input placeholder="Target label" value={newForm[cat]?.target_label || ''} onChange={e => setNewForm(f => ({ ...f, [cat]: { ...f[cat], target_label: e.target.value.toUpperCase().replace(/ /g, '_'), priority: 0 } }))} className="w-32 rounded border border-slate-200 px-3 py-1.5 text-xs" />
              <button onClick={() => handleCreate(cat)} className="inline-flex items-center gap-1 rounded bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"><Plus className="h-3 w-3" /> Add</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
