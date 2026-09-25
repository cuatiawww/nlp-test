'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { createExtractionRule, updateExtractionRule } from '@/lib/api'
import { CheckCircle2, AlertCircle } from 'lucide-react'

export interface ExtractionRuleItem {
  id: string
  field_name: string
  regex_pattern: string
  priority: number
  is_active: boolean
  created_at?: string
  updated_at?: string
}

interface Props {
  rule?: ExtractionRuleItem | null
  existingCategories?: string[]
  defaultCategory?: string
  onSaved: () => void
  onCancel: () => void
}

export default function ExtractionRuleForm({
  rule,
  existingCategories = [],
  defaultCategory = '',
  onSaved,
  onCancel,
}: Props) {
  const { t } = useTranslation()
  const [fieldName, setFieldName] = useState('')
  const [regexPattern, setRegexPattern] = useState('')
  const [priority, setPriority] = useState(10)
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [customCategory, setCustomCategory] = useState(false)

  useEffect(() => {
    if (rule) {
      setFieldName(rule.field_name || '')
      setRegexPattern(rule.regex_pattern || '')
      setPriority(rule.priority ?? 10)
      setIsActive(rule.is_active !== false)
      setCustomCategory(
        Boolean(rule.field_name && !existingCategories.includes(rule.field_name))
      )
    } else {
      const initialCat =
        defaultCategory && defaultCategory !== 'all'
          ? defaultCategory
          : existingCategories[0] || ''
      setFieldName(initialCat)
      setRegexPattern('')
      setPriority(10)
      setIsActive(true)
      setCustomCategory(existingCategories.length === 0)
    }
  }, [rule, defaultCategory, existingCategories])

  const regexValidation = useMemo(() => {
    if (!regexPattern.trim()) return null
    try {
      new RegExp(regexPattern)
      return { valid: true, error: null }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid regex syntax'
      return { valid: false, error: msg }
    }
  }, [regexPattern])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanField = fieldName.trim()
    const cleanPattern = regexPattern.trim()

    if (!cleanField || !cleanPattern) return
    if (regexValidation && !regexValidation.valid) return

    setSaving(true)
    try {
      if (rule) {
        await updateExtractionRule(rule.id, {
          field_name: cleanField,
          regex_pattern: cleanPattern,
          priority,
          is_active: isActive,
        })
      } else {
        await createExtractionRule({
          field_name: cleanField,
          regex_pattern: cleanPattern,
          priority,
          is_active: isActive,
        })
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">
            Category / Field Name
          </label>
          {existingCategories.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setCustomCategory(!customCategory)
                if (customCategory) {
                  setFieldName(existingCategories[0] || '')
                } else {
                  setFieldName('')
                }
              }}
              className="text-xs font-medium text-[#0060A9] hover:underline"
            >
              {customCategory ? 'Pilih dari Kategori Ada' : '+ Kategori Baru'}
            </button>
          )}
        </div>

        {customCategory || existingCategories.length === 0 ? (
          <input
            type="text"
            value={fieldName}
            onChange={(e) => setFieldName(e.target.value)}
            required
            placeholder="e.g. academic_study, non_health_topic, case_count"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-[#0060A9] focus:outline-none focus:ring-1 focus:ring-[#0060A9]"
          />
        ) : (
          <select
            value={fieldName}
            onChange={(e) => setFieldName(e.target.value)}
            required
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#0060A9] focus:outline-none focus:ring-1 focus:ring-[#0060A9]"
          >
            {existingCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        )}
        <p className="mt-1 text-[11px] text-slate-400">
          Kategori target filter/metrik yang diekstraksi oleh engine NLP.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">
            Regex Pattern
          </label>
          {regexValidation && (
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                regexValidation.valid ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {regexValidation.valid ? (
                <>
                  <CheckCircle2 className="h-3 w-3" /> Syntax Valid
                </>
              ) : (
                <>
                  <AlertCircle className="h-3 w-3" /> Syntax Error
                </>
              )}
            </span>
          )}
        </div>
        <textarea
          value={regexPattern}
          onChange={(e) => setRegexPattern(e.target.value)}
          required
          rows={3}
          placeholder="e.g. (?i)\b(?:skripsi|tesis|disertasi)\b"
          className="mt-1 w-full rounded-xl border border-slate-200 font-mono text-xs text-slate-800 placeholder-slate-400 focus:border-[#0060A9] focus:outline-none focus:ring-1 focus:ring-[#0060A9]"
        />
        {regexValidation && !regexValidation.valid && (
          <p className="mt-1 text-[11px] text-rose-500">{regexValidation.error}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">
            Priority
          </label>
          <input
            type="number"
            value={priority}
            onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-[#0060A9] focus:outline-none focus:ring-1 focus:ring-[#0060A9]"
          />
          <p className="mt-1 text-[11px] text-slate-400">Prioritas evaluasi (nilai lebih kecil dievaluasi awal).</p>
        </div>

        <div className="flex items-center pt-5">
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-[#0060A9] focus:ring-[#0060A9]"
            />
            <span className="text-xs font-semibold uppercase tracking-[0.04em] text-slate-700">
              Active Rule
            </span>
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={saving || !fieldName.trim() || !regexPattern.trim() || (regexValidation !== null && !regexValidation.valid)}
          className="rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-bold uppercase text-white hover:bg-[#004b85] disabled:opacity-50"
        >
          {saving ? t('common.saving') : rule ? t('common.save') : t('common.add')}
        </button>
      </div>
    </form>
  )
}
