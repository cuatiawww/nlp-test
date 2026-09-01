'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { createNlpLabel, updateNlpLabel } from '@/lib/api'

interface Props {
  category: string
  label?: any | null
  onSaved: () => void
  onCancel: () => void
}

export default function LabelForm({ category, label, onSaved, onCancel }: Props) {
  const { t } = useTranslation();
  const [lab, setLab] = useState('')
  const [priority, setPriority] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (label) {
      setLab(label.label || '')
      setPriority(label.priority || 0)
    } else {
      setLab(''); setPriority(0)
    }
  }, [label])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!lab) return
    setSaving(true)
    try {
      if (label) {
        await updateNlpLabel(label.id, { label: lab, priority, is_active: label.is_active })
      } else {
        await createNlpLabel({ category, label: lab, priority, is_active: true })
      }
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Label</label>
        <input value={lab} onChange={e => setLab(e.target.value)} required
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Priority</label>
        <input type="number" value={priority} onChange={e => setPriority(parseInt(e.target.value) || 0)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600">{t('common.cancel')}</button>
        <button type="submit" disabled={saving || !lab}
          className="rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-bold uppercase text-white hover:bg-[#004b85] disabled:opacity-50">
          {saving ? t('common.saving') : label ? t('common.save') : t('common.add')}
        </button>
      </div>
    </form>
  )
}
