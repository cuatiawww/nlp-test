'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { fetchExtractionRules, createExtractionRule, updateExtractionRule, deleteExtractionRule } from '@/lib/api'
import Modal from '@/components/Modal'

interface RuleItem {
  id: string; field_name: string; regex_pattern: string; priority: number; is_active: boolean
}

export default function ExtractionRulesPage() {
  const { t } = useTranslation()
  const [data, setData] = useState<RuleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<any | null>(null)
  const [form, setForm] = useState({ field_name: 'case_count', regex_pattern: '', priority: 0 })

  const load = async () => {
    setLoading(true)
    try { setData(await fetchExtractionRules()) }
    catch { setData([]) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleSave = async () => {
    if (!form.field_name || !form.regex_pattern) return
    try {
      if (editItem) await updateExtractionRule(editItem.id, form)
      else await createExtractionRule(form)
      setShowModal(false); load(); toast.success(editItem ? t('common.savedSuccess') : t('common.savedSuccess'))
    } catch { toast.error(t('common.saveFailed')) }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(t('common.confirmDelete', { name }))) return
    try { await deleteExtractionRule(id); load(); toast.success(t('common.deletedSuccess')) }
    catch { toast.error(t('common.deleteFailed')) }
  }

  return (
    <div className="px-4 md:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">{t('pages.extractionRules.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('pages.extractionRules.subtitle')}</p>
        </div>
        <button onClick={() => { setEditItem(null); setForm({ field_name: 'case_count', regex_pattern: '', priority: 0 }); setShowModal(true) }}
          className="inline-flex items-center gap-2 rounded-xl bg-[#0060A9] px-3 py-2 text-sm font-bold uppercase text-white hover:bg-[#004b85]">
          <Plus className="h-4 w-4" /> {t('common.add')}
        </button>
      </div>

      <div className="mt-4 max-w-[600px] rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 leading-relaxed">
        {t('pages.extractionRules.helperNote')}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">{t('common.loading')}</div>
        ) : data.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">{t('common.noData')}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">{t('pages.extractionRules.colField')}</th>
                <th className="px-4 py-3 font-semibold text-slate-600">{t('pages.extractionRules.colRegex')}</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">{t('pages.extractionRules.colPriority')}</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">{t('common.active')}</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {data.map(l => (
                <tr key={l.id} className="border-b border-slate-50 hover:bg-blue-50/40">
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${l.field_name === 'case_count' ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'}`}>
                      {l.field_name}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700 max-w-[300px] truncate" title={l.regex_pattern}>{l.regex_pattern}</td>
                  <td className="px-4 py-3 text-center text-xs text-slate-500">{l.priority}</td>
                  <td className="px-4 py-3 text-center">
                    {l.is_active
                      ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-600">{t('common.yes')}</span>
                      : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{t('common.no')}</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => { setEditItem(l); setForm({ field_name: l.field_name, regex_pattern: l.regex_pattern, priority: l.priority }); setShowModal(true) }}
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-[#0060A9] hover:bg-blue-50">{t('common.edit')}</button>
                    <button onClick={() => handleDelete(l.id, l.field_name)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showModal} title={editItem ? t('pages.extractionRules.editTitle') : t('pages.extractionRules.addTitle')} onClose={() => setShowModal(false)}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{t('pages.extractionRules.colField')}</label>
            <select value={form.field_name} onChange={e => setForm(f => ({ ...f, field_name: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="case_count">case_count</option>
              <option value="death_count">death_count</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{t('pages.extractionRules.colRegex')}</label>
            <textarea value={form.regex_pattern} onChange={e => setForm(f => ({ ...f, regex_pattern: e.target.value }))} required rows={2}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono" />
            <p className="mt-1 text-xs text-slate-400">{t('pages.extractionRules.modalHelper')}</p>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{t('pages.extractionRules.colPriority')} (lower = first)</label>
            <input type="number" min="0" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: parseInt(e.target.value) || 0 }))}
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
