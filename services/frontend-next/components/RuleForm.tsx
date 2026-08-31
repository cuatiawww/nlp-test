'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { createOutbreakRule, updateOutbreakRule } from '@/lib/api'

interface Props {
  rule?: any | null
  onSaved: () => void
  onCancel: () => void
}

export default function RuleForm({ rule, onSaved, onCancel }: Props) {
  const { t } = useTranslation();
  const [diseaseName, setDiseaseName] = useState('')
  const [displayLabel, setDisplayLabel] = useState('')
  const [minCaseCount, setMinCaseCount] = useState(25)
  const [priority, setPriority] = useState(0)
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (rule) {
      setDiseaseName(rule.disease_name || '')
      setDisplayLabel(rule.display_label || '')
      setMinCaseCount(rule.min_case_count || 25)
      setPriority(rule.priority || 0)
      setIsActive(rule.is_active !== false)
    } else {
      setDiseaseName(''); setDisplayLabel(''); setMinCaseCount(25); setPriority(0); setIsActive(true)
    }
  }, [rule])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!diseaseName) return
    setSaving(true)
    try {
      if (rule) {
        await updateOutbreakRule(rule.id, { disease_name: diseaseName, display_label: displayLabel, min_case_count: minCaseCount, is_active: isActive, priority })
      } else {
        await createOutbreakRule({ disease_name: diseaseName, display_label: displayLabel, min_case_count: minCaseCount, is_active: isActive, priority })
      }
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{t('pages.outbreakRules.colDisease')}</label>
        <input value={diseaseName} onChange={e => setDiseaseName(e.target.value)} required
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Display Label</label>
        <input value={displayLabel} onChange={e => setDisplayLabel(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{t('pages.outbreakRules.colMinCases')}</label>
        <input type="number" value={minCaseCount} onChange={e => setMinCaseCount(parseInt(e.target.value) || 25)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{t('pages.outbreakRules.colPriority')}</label>
        <input type="number" value={priority} onChange={e => setPriority(parseInt(e.target.value) || 0)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="ruleActive" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="h-4 w-4" />
        <label htmlFor="ruleActive" className="text-xs font-semibold uppercase text-slate-500">{t('common.active')}</label>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600">{t('common.cancel')}</button>
        <button type="submit" disabled={saving || !diseaseName}
          className="rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold uppercase text-white hover:bg-teal-700 disabled:opacity-50">
          {saving ? t('common.saving') : rule ? t('common.save') : t('common.add')}
        </button>
      </div>
    </form>
  )
}
