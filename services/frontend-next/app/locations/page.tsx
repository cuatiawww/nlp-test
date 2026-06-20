'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { fetchLocations, createLocation, updateLocation, deleteLocation } from '@/lib/api'
import Modal from '@/components/Modal'
import SearchInput from '@/components/SearchInput'

interface Location {
  id: string; name: string; latitude: number; longitude: number; country?: string; is_active: boolean
}

export default function LocationsPage() {
  const [data, setData] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<any | null>(null)
  const [form, setForm] = useState({ name: '', latitude: 0, longitude: 0, country: 'Indonesia' })

  const load = async () => {
    setLoading(true)
    try { setData(await fetchLocations()) } catch { setData([]) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = search
    ? data.filter(l => l.name.toLowerCase().includes(search.toLowerCase()) || (l.country || '').toLowerCase().includes(search.toLowerCase()))
    : data

  const handleSave = async () => {
    if (!form.name) return
    try {
      if (editItem) {
        await updateLocation(editItem.id, form)
      } else {
        await createLocation(form)
      }
      setShowModal(false); load(); toast.success(editItem ? 'Updated' : 'Added')
    } catch { toast.error('Failed') }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Hapus lokasi "${name}"?`)) return
    try { await deleteLocation(id); load(); toast.success('Deleted') }
    catch { toast.error('Failed') }
  }

  return (
    <div className="px-4 md:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">Location Master Data</h1>
          <p className="mt-1 text-sm text-slate-500">Kelola data koordinat lokasi untuk NLP extraction</p>
        </div>
        <button onClick={() => { setEditItem(null); setForm({ name: '', latitude: 0, longitude: 0, country: 'Indonesia' }); setShowModal(true) }}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-3 py-2 text-sm font-bold uppercase text-white hover:bg-teal-700">
          <Plus className="h-4 w-4" /> Tambah
        </button>
      </div>

      <div className="mt-4 flex gap-2">
        <div className="relative max-w-xs">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <SearchInput value={search} onChange={setSearch} placeholder="Cari lokasi..." />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">Memuat...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">Belum ada data</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">Nama</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Latitude</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Longitude</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Country</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Active</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l.id} className="border-b border-slate-50 hover:bg-teal-50/40">
                  <td className="px-4 py-3 font-medium text-slate-800">{l.name}</td>
                  <td className="px-4 py-3 text-slate-600">{l.latitude}</td>
                  <td className="px-4 py-3 text-slate-600">{l.longitude}</td>
                  <td className="px-4 py-3 text-slate-600">{l.country || 'Indonesia'}</td>
                  <td className="px-4 py-3 text-center">
                    {l.is_active
                      ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-600">Ya</span>
                      : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Tidak</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => { setEditItem(l); setForm({ name: l.name, latitude: l.latitude, longitude: l.longitude, country: l.country || 'Indonesia' }); setShowModal(true) }}
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-teal-600 hover:bg-teal-50">Edit</button>
                    <button onClick={() => handleDelete(l.id, l.name)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showModal} title={editItem ? 'Edit Lokasi' : 'Tambah Lokasi'} onClose={() => setShowModal(false)}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Nama</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Latitude</label>
              <input type="number" step="any" value={form.latitude} onChange={e => setForm(f => ({ ...f, latitude: parseFloat(e.target.value) || 0 }))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Longitude</label>
              <input type="number" step="any" value={form.longitude} onChange={e => setForm(f => ({ ...f, longitude: parseFloat(e.target.value) || 0 }))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Country</label>
            <input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowModal(false)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600">Batal</button>
            <button onClick={handleSave}
              className="rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold uppercase text-white hover:bg-teal-700">Simpan</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
