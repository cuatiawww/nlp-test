'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, Shield } from 'lucide-react'


const API = process.env.NEXT_PUBLIC_API_BASE_URL || ''

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : ''
  return token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
}

interface User {
  id: string; username: string; display_name?: string; role: string; email?: string; is_active: boolean; created_at?: string
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ username: '', password: '', display_name: '', role: 'operator', email: '' })
  const [editId, setEditId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/v1/users`, { headers: authHeaders() })
      const d = await res.json()
      setUsers(d.data || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await fetch(`${API}/api/v1/users`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify(form),
      })
      setForm({ username: '', password: '', display_name: '', role: 'operator', email: '' })
      setShowForm(false)
      await load()
    } catch {}
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus user ini?')) return
    try {
      await fetch(`${API}/api/v1/users/${id}`, { method: 'DELETE', headers: authHeaders() })
      await load()
    } catch {}
  }

  return (
    <div className="px-4 md:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">User Management</h1>
          <p className="mt-1 text-sm text-slate-500">Kelola akun pengguna sistem</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-3 py-2 text-sm font-bold uppercase text-white transition hover:bg-teal-700">
          <Plus className="h-4 w-4" /> Tambah User
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mt-4 rounded-2xl border border-teal-200 bg-teal-50 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <input placeholder="Username*" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
            <input type="password" placeholder="Password*" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
            <input placeholder="Display Name" value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="operator">Operator</option>
              <option value="admin">Admin</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600">Batal</button>
            <button type="submit"
              className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold uppercase text-white">Simpan</button>
          </div>
        </form>
      )}

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? <div className="p-8 text-center text-slate-400">Memuat...</div> : users.length === 0 ? (
          <div className="p-8 text-center text-slate-400">Belum ada user</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">Username</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Display Name</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Role</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Email</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Active</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-slate-50 hover:bg-teal-50/40">
                  <td className="px-4 py-3 font-semibold text-slate-800">{u.username}</td>
                  <td className="px-4 py-3 text-slate-700">{u.display_name || '-'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
                      <Shield className="h-3 w-3" /> {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{u.email || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    {u.is_active
                      ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-600">Aktif</span>
                      : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Nonaktif</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(u.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
