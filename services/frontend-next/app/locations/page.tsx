'use client'

import { useState } from 'react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { usePaginatedFetch } from '@/hooks/usePaginatedFetch'
import { createLocation, updateLocation, deleteLocation } from '@/lib/api'
import Modal from '@/components/Modal'
import SearchInput from '@/components/SearchInput'
import Pagination from '@/components/Pagination'

const COUNTRIES = [
  'Indonesia', 'Malaysia', 'Thailand', 'Philippines', 'Vietnam',
  'Singapore', 'Brunei', 'Myanmar', 'Cambodia', 'Laos', 'Timor-Leste',
]

export default function LocationsPage() {
  const { t } = useTranslation()
  const [countryFilter, setCountryFilter] = useState('')
  const apiPath = countryFilter
    ? `/api/v1/locations?country=${encodeURIComponent(countryFilter)}`
    : '/api/v1/locations'
  const { data, loading, page, setPage, total, totalPages, search, setSearch, nextPage, prevPage, reload } = usePaginatedFetch<any[]>(apiPath)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<any | null>(null)
  const [form, setForm] = useState({ name: '', latitude: 0, longitude: 0, country: 'Indonesia' })

  const handleSave = async () => {
    if (!form.name) return
    try {
      if (editItem) await updateLocation(editItem.id, form)
      else await createLocation(form)
      setShowModal(false); reload(); toast.success(editItem ? 'Updated' : 'Added')
    } catch { toast.error('Failed') }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Hapus lokasi "${name}"?`)) return
    try { await deleteLocation(id); reload(); toast.success('Deleted') }
    catch { toast.error('Failed') }
  }

  return (
    <div className="px-4 md:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">{t('pages.locations.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('pages.locations.subtitle')}</p>
        </div>
        <button onClick={() => { setEditItem(null); setForm({ name: '', latitude: 0, longitude: 0, country: 'Indonesia' }); setShowModal(true) }}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-3 py-2 text-sm font-bold uppercase text-white hover:bg-teal-700">
          <Plus className="h-4 w-4" /> Tambah
        </button>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          <button onClick={() => setCountryFilter('')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase transition ${countryFilter === '' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            Semua
          </button>
          {COUNTRIES.map(c => (
            <button key={c} onClick={() => setCountryFilter(c)}
              className={`rounded-md px-2.5 py-1.5 text-[10px] font-semibold uppercase transition ${countryFilter === c ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {c}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs ml-auto">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <SearchInput value={search} onChange={setSearch} placeholder={`${t('common.search')}...`} />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">{t('common.loading')}</div>
          ) : data.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">{t('common.noData')}</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-600">{t('pages.locations.colName')}</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">{t('pages.locations.colLat')}</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">{t('pages.locations.colLon')}</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">{t('pages.locations.colCountry')}</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600">{t('common.active')}</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((l: any) => (
                  <tr key={l.id} className="border-b border-slate-50 hover:bg-teal-50/40">
                    <td className="px-4 py-3 font-medium text-slate-800">{l.name}</td>
                    <td className="px-4 py-3 text-slate-600 font-mono text-xs">{l.latitude.toFixed(4)}</td>
                    <td className="px-4 py-3 text-slate-600 font-mono text-xs">{l.longitude.toFixed(4)}</td>
                    <td className="px-4 py-3"><span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-600">{l.country || 'Indonesia'}</span></td>
                    <td className="px-4 py-3 text-center">
                      {l.is_active
                        ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-600">{t('common.yes')}</span>
                        : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{t('common.no')}</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => { setEditItem(l); setForm({ name: l.name, latitude: l.latitude, longitude: l.longitude, country: l.country || 'Indonesia' }); setShowModal(true) }}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-teal-600 hover:bg-teal-50">{t('common.edit')}</button>
                      <button onClick={() => handleDelete(l.id, l.name)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <Pagination page={page} totalPages={totalPages} total={total} onPrev={prevPage} onNext={nextPage} onGoTo={setPage} />
      </div>

      <Modal open={showModal} title={editItem ? `${t('common.edit')} ${t('pages.locations.title')}` : `${t('common.add')} ${t('pages.locations.title')}`} onClose={() => setShowModal(false)}>
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
            <select value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowModal(false)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600">{t('common.cancel')}</button>
            <button onClick={handleSave}
              className="rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold uppercase text-white hover:bg-teal-700">{t('common.save')}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
