'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { createNlpKeyword, updateNlpKeyword } from '@/lib/api'

interface Props {
  category: string
  keyword?: any | null
  onSaved: () => void
  onCancel: () => void
}

export default function KeywordForm({ category, keyword, onSaved, onCancel }: Props) {
  const { t } = useTranslation();
  const [key, setKey] = useState('')
  const [targetLabel, setTargetLabel] = useState('')
  const [priority, setPriority] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (keyword) {
      setKey(keyword.keyword || '')
      setTargetLabel(keyword.target_label || '')
      setPriority(keyword.priority || 0)
    } else {
      setKey(''); setTargetLabel(''); setPriority(0)
    }
  }, [keyword])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!key) return
    setSaving(true)
    try {
      if (keyword) {
        await updateNlpKeyword(keyword.id, { keyword: key, target_label: targetLabel, priority, is_active: keyword.is_active })
      } else {
        await createNlpKeyword({ category, keyword: key, target_label: targetLabel, priority, is_active: true })
      }
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Keyword</label>
        <input value={key} onChange={e => setKey(e.target.value)} required
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Target Label</label>
        <input value={targetLabel} onChange={e => setTargetLabel(e.target.value.toUpperCase().replace(/ /g, '_'))}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono text-xs" />
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Priority</label>
        <input type="number" value={priority} onChange={e => setPriority(parseInt(e.target.value) || 0)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600">{t('common.cancel')}</button>
        <button type="submit" disabled={saving || !key}
          className="rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-bold uppercase text-white hover:bg-[#004b85] disabled:opacity-50">
          {saving ? t('common.saving') : keyword ? t('common.save') : t('common.add')}
        </button>
      </div>
    </form>
  )
}
