'use client'

import { useTranslation } from '@/lib/i18n/LanguageContext'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { createOutbreakRule, deleteOutbreakRule } from '@/lib/api'
import { usePaginatedFetch } from '@/hooks/usePaginatedFetch'
import SearchInput from '@/components/SearchInput'
import Pagination from '@/components/Pagination'
import Modal from '@/components/Modal'
import RuleForm from '@/components/RuleForm'
import { toast } from 'sonner'

interface Rule {
  id: string; disease_name: string; display_label?: string; min_case_count: number; is_active: boolean; priority: number
}

export default function OutbreakRulesPage() {
  const { t, translateDisease, translateSeverity } = useTranslation()
  const { data: rules, loading, page, setPage, total, totalPages, search, setSearch, nextPage, prevPage, reload } = usePaginatedFetch<Rule>('/api/v1/outbreak-rules')
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<any | null>(null)

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Hapus rule "${name}"?`)) return
    try {
      await deleteOutbreakRule(id)
      toast.success('Rule dihapus')
      reload()
    } catch { toast.error('Gagal menghapus') }
  }

  return (
    <div className="px-4 md:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">{t('pages.outbreakRules.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">Atur ambang batas kasus untuk peringatan wabah per penyakit</p>
        </div>
        <button onClick={() => { setEditItem(null); setShowModal(true) }}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-3 py-2 text-sm font-bold uppercase text-white hover:bg-teal-700">
          <Plus className="h-4 w-4" /> Tambah Rule
        </button>
      </div>

      <div className="mt-4 flex gap-2">
        <div className="relative max-w-xs">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <SearchInput value={search} onChange={setSearch} placeholder="Cari penyakit..." />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? <div className="p-8 text-center text-slate-400 text-sm">{t('common.loading')}</div> : rules.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">Belum ada rules</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">{t('pages.outbreakRules.colDisease')}</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Label</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Min Kasus</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Aktif</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Prioritas</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-teal-50/40">
                  <td className="px-4 py-3 font-medium text-slate-800">{r.disease_name}</td>
                  <td className="px-4 py-3 text-slate-700">{r.display_label || '-'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">{r.min_case_count}</td>
                  <td className="px-4 py-3 text-center">
                    {r.is_active
                      ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-600">{t('common.yes')}</span>
                      : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{t('common.no')}</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-center text-slate-700">{r.priority}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => { setEditItem(r); setShowModal(true) }}
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-teal-600 hover:bg-teal-50">{t('common.edit')}</button>
                    <button onClick={() => handleDelete(r.id, r.disease_name)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={totalPages} total={total} onPrev={prevPage} onNext={nextPage} onGoTo={setPage} />
      </div>

      <Modal open={showModal} title={editItem ? 'Edit Rule' : 'Tambah Rule'} onClose={() => setShowModal(false)}>
        <RuleForm rule={editItem} onSaved={() => { setShowModal(false); reload() }} onCancel={() => setShowModal(false)} />
      </Modal>
    </div>
  )
}
