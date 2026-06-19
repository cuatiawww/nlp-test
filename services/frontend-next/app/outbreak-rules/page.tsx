'use client'

import { useEffect, useState } from 'react'
import { Plus, Save } from 'lucide-react'

const API = '/nlp'

interface Rule {
  id: string; disease_name: string; display_label?: string; min_case_count: number; is_active: boolean; priority: number
}

export default function OutbreakRulesPage() {
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ disease_name: '', display_label: '', min_case_count: 25, is_active: true, priority: 0 })
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState({ disease_name: '', display_label: '', min_case_count: 25, is_active: true, priority: 0 })

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/v1/outbreak-rules`)
      const d = await res.json()
      setRules(d.data || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleEdit = (r: Rule) => {
    setEditId(r.id)
    setEditForm({ disease_name: r.disease_name, display_label: r.display_label || '', min_case_count: r.min_case_count, is_active: r.is_active, priority: r.priority })
  }

  const handleSave = async (id: string) => {
    try {
      await fetch(`${API}/api/v1/outbreak-rules/${id}/edit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      setEditId(null)
      await load()
    } catch {}
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await fetch(`${API}/api/v1/outbreak-rules`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newForm),
      })
      setShowNew(false)
      setNewForm({ disease_name: '', display_label: '', min_case_count: 25, is_active: true, priority: 0 })
      await load()
    } catch {}
  }

  return (
    <div className="px-4 md:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">Outbreak Alert Rules</h1>
          <p className="mt-1 text-sm text-slate-500">Atur ambang batas kasus untuk peringatan wabah per penyakit</p>
        </div>
        <button onClick={() => setShowNew(!showNew)}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-3 py-2 text-sm font-bold uppercase text-white transition hover:bg-teal-700">
          <Plus className="h-4 w-4" /> Tambah Rule
        </button>
      </div>

      {showNew && (
        <form onSubmit={handleCreate} className="mt-4 rounded-2xl border border-teal-200 bg-teal-50 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <input placeholder="Disease Name*" value={newForm.disease_name} onChange={e => setNewForm(f => ({ ...f, disease_name: e.target.value }))}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
            <input placeholder="Display Label" value={newForm.display_label} onChange={e => setNewForm(f => ({ ...f, display_label: e.target.value }))}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input type="number" placeholder="Min Case Count" value={newForm.min_case_count} onChange={e => setNewForm(f => ({ ...f, min_case_count: parseInt(e.target.value) || 25 }))}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input type="number" placeholder="Priority" value={newForm.priority} onChange={e => setNewForm(f => ({ ...f, priority: parseInt(e.target.value) || 0 }))}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setShowNew(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600">Batal</button>
            <button type="submit" className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold uppercase text-white">Simpan</button>
          </div>
        </form>
      )}

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? <div className="p-8 text-center text-slate-400">Memuat...</div> : rules.length === 0 ? (
          <div className="p-8 text-center text-slate-400">Belum ada rules</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">Penyakit</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Label</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Min Kasus</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Aktif</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Prioritas</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-teal-50/40">
                  {editId === r.id ? (
                    <>
                      <td className="px-4 py-2"><input value={editForm.disease_name} onChange={e => setEditForm(f => ({ ...f, disease_name: e.target.value }))} className="w-full rounded-lg border px-2 py-1 text-xs" /></td>
                      <td className="px-4 py-2"><input value={editForm.display_label} onChange={e => setEditForm(f => ({ ...f, display_label: e.target.value }))} className="w-full rounded-lg border px-2 py-1 text-xs" /></td>
                      <td className="px-4 py-2"><input type="number" value={editForm.min_case_count} onChange={e => setEditForm(f => ({ ...f, min_case_count: parseInt(e.target.value) || 25 }))} className="w-20 rounded-lg border px-2 py-1 text-xs text-right" /></td>
                      <td className="px-4 py-2 text-center">
                        <input type="checkbox" checked={editForm.is_active} onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked }))} className="h-4 w-4" />
                      </td>
                      <td className="px-4 py-2"><input type="number" value={editForm.priority} onChange={e => setEditForm(f => ({ ...f, priority: parseInt(e.target.value) || 0 }))} className="w-16 rounded-lg border px-2 py-1 text-xs text-center" /></td>
                      <td className="px-4 py-2 text-right">
                        <button onClick={() => handleSave(r.id)} className="rounded-lg p-1.5 text-teal-600 hover:bg-teal-50"><Save className="h-4 w-4" /></button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-medium text-slate-800">{r.disease_name}</td>
                      <td className="px-4 py-3 text-slate-700">{r.display_label || '-'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">{r.min_case_count}</td>
                      <td className="px-4 py-3 text-center">
                        {r.is_active
                          ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-600">Ya</span>
                          : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Tidak</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-center text-slate-700">{r.priority}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleEdit(r)} className="rounded-lg px-2 py-1 text-xs font-semibold text-teal-600 hover:bg-teal-50">Edit</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
