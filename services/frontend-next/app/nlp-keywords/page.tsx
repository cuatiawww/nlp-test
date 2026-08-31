'use client'

import { useTranslation } from '@/lib/i18n/LanguageContext'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { deleteNlpKeyword } from '@/lib/api'
import { usePaginatedFetch } from '@/hooks/usePaginatedFetch'
import SearchInput from '@/components/SearchInput'
import Pagination from '@/components/Pagination'
import Modal from '@/components/Modal'
import KeywordForm from '@/components/KeywordForm'

interface Keyword {
  id: string; category: string; keyword: string; target_label: string; is_active: boolean; priority: number
}

const CATEGORIES = ['symptom', 'disease']
const CAT_LABELS: Record<string, string> = { symptom: 'Symptom Keywords', disease: 'Disease Keywords' }

export default function NlpKeywordsPage() {
  const { t } = useTranslation()
  const [activeCat, setActiveCat] = useState('symptom')
  const { data: items, loading, page, setPage, total, totalPages, search, setSearch, nextPage, prevPage, reload } = usePaginatedFetch<Keyword>(`/api/v1/nlp-keywords?category=${activeCat}`)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<any | null>(null)

  const handleDelete = async (id: string) => {
    if (!confirm(t('common.confirmDeleteGeneric'))) return
    try {
      await deleteNlpKeyword(id)
      toast.success(t('common.deletedSuccess')); reload()
    } catch { toast.error(t('common.deleteFailed')) }
  }

  return (
    <div className="px-4 md:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">{t('pages.nlpKeywords.title')}</h1>
        <button onClick={() => { setEditItem(null); setShowModal(true) }}
          className="rounded-xl bg-teal-600 px-3 py-2 text-xs font-bold uppercase text-white hover:bg-teal-700">{t('common.add')}</button>
      </div>
      <p className="mt-1 text-sm text-slate-500">{t('pages.nlpKeywords.subtitle')}</p>

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
          <SearchInput value={search} onChange={setSearch} placeholder={`${t('common.search')}...`} />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? <div className="p-8 text-center text-slate-400 text-sm">{t('common.loading')}</div> : items.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">{t('common.noData')}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">{t('pages.nlpKeywords.colKeyword')}</th>
                <th className="px-4 py-3 font-semibold text-slate-600">{t('pages.nlpKeywords.colTarget')}</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">{t('pages.nlpKeywords.colPriority')}</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">{t('common.active')}</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map(l => (
                <tr key={l.id} className="border-b border-slate-50 hover:bg-teal-50/40">
                  <td className="px-4 py-3 font-medium text-slate-800">{l.keyword}</td>
                  <td className="px-4 py-3"><span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-700">{l.target_label}</span></td>
                  <td className="px-4 py-3 text-right text-slate-600">{l.priority}</td>
                  <td className="px-4 py-3 text-center">{l.is_active ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-600">{t('common.yes')}</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{t('common.no')}</span>}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => { setEditItem(l); setShowModal(true) }}
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-teal-600 hover:bg-teal-50">{t('common.edit')}</button>
                    <button onClick={() => handleDelete(l.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={totalPages} total={total} onPrev={prevPage} onNext={nextPage} onGoTo={setPage} />
      </div>

      <Modal open={showModal} title={editItem ? t('pages.nlpKeywords.editTitle') : t('pages.nlpKeywords.addTitle')} onClose={() => setShowModal(false)}>
        <KeywordForm category={activeCat} keyword={editItem} onSaved={() => { setShowModal(false); reload() }} onCancel={() => setShowModal(false)} />
      </Modal>
    </div>
  )
}
