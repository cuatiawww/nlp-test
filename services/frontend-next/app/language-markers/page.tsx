'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { Plus, Trash2, Languages } from 'lucide-react'
import { toast } from 'sonner'
import { fetchLanguageMarkers, createLanguageMarker, updateLanguageMarker, deleteLanguageMarker } from '@/lib/api'
import Modal from '@/components/Modal'
import SearchInput from '@/components/SearchInput'

interface LangItem {
  id: string; word: string; language: string; is_active: boolean
}

export default function LanguageMarkersPage() {
  const { t } = useTranslation()
  const [data, setData] = useState<LangItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<any | null>(null)
  const [form, setForm] = useState({ word: '', language: 'en' })

  const load = async () => {
    setLoading(true)
    try { setData(await fetchLanguageMarkers()) }
    catch { setData([]) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = search
    ? data.filter(l => l.word.toLowerCase().includes(search.toLowerCase()) || l.language.includes(search.toLowerCase()))
    : data

  const handleSave = async () => {
    if (!form.word || !form.language) return
    try {
      if (editItem) await updateLanguageMarker(editItem.id, form)
      else await createLanguageMarker(form)
      setShowModal(false); load(); toast.success(editItem ? t('common.savedSuccess') : t('common.savedSuccess'))
    } catch { toast.error(t('common.saveFailed')) }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(t('common.confirmDelete', { name }))) return
    try { await deleteLanguageMarker(id); load(); toast.success(t('common.deletedSuccess')) }
    catch { toast.error(t('common.deleteFailed')) }
  }

  return (
    <div className="px-4 md:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">{t('pages.languageMarkers.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('pages.languageMarkers.subtitle')}</p>
        </div>
        <button onClick={() => { setEditItem(null); setForm({ word: '', language: 'en' }); setShowModal(true) }}
          className="inline-flex items-center gap-2 rounded-xl bg-[#0060A9] px-3 py-2 text-sm font-bold uppercase text-white hover:bg-[#004b85]">
          <Plus className="h-4 w-4" /> {t('common.add')}
        </button>
      </div>

      <div className="mt-4 flex gap-2">
        <div className="relative max-w-xs">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <SearchInput value={search} onChange={setSearch} placeholder={t('pages.languageMarkers.searchPlaceholder')} />
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-400">
          <Languages className="h-3.5 w-3.5" /> {new Set(data.filter(l=>l.is_active).map(l=>l.language)).size} {t('pages.languageMarkers.languagesCount')}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">{t('common.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">{t('common.noData')}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">{t('pages.languageMarkers.colWord')}</th>
                <th className="px-4 py-3 font-semibold text-slate-600">{t('pages.languageMarkers.colLanguage')}</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">{t('common.active')}</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l.id} className="border-b border-slate-50 hover:bg-blue-50/40">
                  <td className="px-4 py-3 font-mono text-sm text-slate-800">{l.word}</td>
                  <td className="px-4 py-3"><span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-600 uppercase">{l.language}</span></td>
                  <td className="px-4 py-3 text-center">
                    {l.is_active
                      ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-600">{t('common.yes')}</span>
                      : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{t('common.no')}</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => { setEditItem(l); setForm({ word: l.word, language: l.language }); setShowModal(true) }}
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-[#0060A9] hover:bg-blue-50">{t('common.edit')}</button>
                    <button onClick={() => handleDelete(l.id, l.word)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showModal} title={editItem ? t('pages.languageMarkers.editTitle') : t('pages.languageMarkers.addTitle')} onClose={() => setShowModal(false)}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{t('pages.languageMarkers.colWord')}</label>
            <input value={form.word} onChange={e => setForm(f => ({ ...f, word: e.target.value }))} required
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{t('pages.languageMarkers.colLanguage')} (code, e.g. en / id / th)</label>
            <input value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value }))} required
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowModal(false)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600">{t('common.cancel')}</button>
            <button onClick={handleSave}
              className="rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-bold uppercase text-white hover:bg-[#004b85]">{t('common.save')}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
