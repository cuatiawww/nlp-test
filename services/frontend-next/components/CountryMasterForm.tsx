'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { createMasterCountry, updateMasterCountry, type MasterCountry } from '@/lib/api'
import { toast } from 'sonner'

interface Props {
  country?: MasterCountry | null
  onSaved: () => void
  onCancel: () => void
}

export default function CountryMasterForm({ country, onSaved, onCancel }: Props) {
  const { t } = useTranslation()
  const isEdit = !!country
  const [name, setName] = useState('')
  const [iso2, setIso2] = useState('')
  const [iso3, setIso3] = useState('')
  const [flagCode, setFlagCode] = useState('')
  const [displayOrder, setDisplayOrder] = useState(0)
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (country) {
      setName(country.name || '')
      setIso2(country.iso2 || '')
      setIso3(country.iso3 || '')
      setFlagCode(country.flag_code || '')
      setDisplayOrder(country.display_order ?? 0)
      setIsActive(country.is_active !== false)
    } else {
      setName('')
      setIso2('')
      setIso3('')
      setFlagCode('')
      setDisplayOrder(0)
      setIsActive(true)
    }
  }, [country])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !iso2 || !iso3) {
      toast.error('Name, ISO2, and ISO3 are required')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        iso2: iso2.trim().toUpperCase(),
        iso3: iso3.trim().toUpperCase(),
        flag_code: (flagCode || iso2).trim().toLowerCase(),
        display_order: Number(displayOrder) || 0,
        is_active: isActive,
      }
      if (isEdit) {
        await updateMasterCountry(country.id, payload)
        toast.success(t('common.savedSuccess') || 'Country updated successfully')
      } else {
        await createMasterCountry(payload)
        toast.success(t('common.createdSuccess') || 'Country created successfully')
      }
      onSaved()
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save country')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Country Name</label>
        <input
          value={name}
          onChange={e => {
            setName(e.target.value)
            if (!flagCode && e.target.value.length === 2) setFlagCode(e.target.value.toLowerCase())
          }}
          required
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0060A9] focus:outline-none"
          placeholder="e.g. Indonesia"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">ISO-2 Code</label>
          <input
            value={iso2}
            onChange={e => {
              const val = e.target.value.toUpperCase().slice(0, 2)
              setIso2(val)
              if (!flagCode) setFlagCode(val.toLowerCase())
            }}
            maxLength={2}
            required
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono uppercase focus:border-[#0060A9] focus:outline-none"
            placeholder="ID"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">ISO-3 Code</label>
          <input
            value={iso3}
            onChange={e => setIso3(e.target.value.toUpperCase().slice(0, 3))}
            maxLength={3}
            required
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono uppercase focus:border-[#0060A9] focus:outline-none"
            placeholder="IDN"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Flag Code</label>
          <input
            value={flagCode}
            onChange={e => setFlagCode(e.target.value.toLowerCase())}
            maxLength={10}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono lowercase focus:border-[#0060A9] focus:outline-none"
            placeholder="id"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Display Order</label>
        <input
          type="number"
          value={displayOrder}
          onChange={e => setDisplayOrder(parseInt(e.target.value) || 0)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0060A9] focus:outline-none"
          placeholder="0"
        />
        <p className="mt-1 text-[11px] text-slate-400">Lower numbers appear first in lists and filters.</p>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <input
          type="checkbox"
          id="countryActive"
          checked={isActive}
          onChange={e => setIsActive(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-[#0060A9] focus:ring-[#0060A9]"
        />
        <label htmlFor="countryActive" className="text-xs font-semibold text-slate-700">Active (Included in surveillance lists)</label>
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
        >
          {t('common.cancel') || 'Cancel'}
        </button>
        <button
          type="submit"
          disabled={saving || !name || !iso2 || !iso3}
          className="rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-bold uppercase text-white hover:bg-[#004b85] disabled:opacity-50"
        >
          {saving ? (t('common.saving') || 'Saving...') : isEdit ? (t('common.save') || 'Save') : (t('common.add') || 'Add Country')}
        </button>
      </div>
    </form>
  )
}
