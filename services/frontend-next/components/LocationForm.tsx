'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { createLocation, updateLocation } from '@/lib/api'

interface Props {
  location?: any | null
  onSaved: () => void
  onCancel: () => void
}

export default function LocationForm({ location, onSaved, onCancel }: Props) {
  const { t } = useTranslation()
  const isEdit = !!location
  const [name, setName] = useState('')
  const [latitude, setLatitude] = useState(0)
  const [longitude, setLongitude] = useState(0)
  const [country, setCountry] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (location) {
      setName(location.name || '')
      setLatitude(location.latitude || 0)
      setLongitude(location.longitude || 0)
      setCountry(location.country || '')
      setIsActive(location.is_active !== false)
    } else {
      setName(''); setLatitude(0); setLongitude(0); setCountry(''); setIsActive(true)
    }
  }, [location])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name) return
    setSaving(true)
    try {
      if (isEdit) {
        await updateLocation(location.id, { name, latitude, longitude, country: country || null, is_active: isActive })
      } else {
        await createLocation({ name, latitude, longitude, country: country || null, is_active: isActive })
      }
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{t('pages.locations.colName')}</label>
        <input value={name} onChange={e => setName(e.target.value)} required
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Jakarta" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{t('pages.locations.colLat')}</label>
          <input type="number" step="any" value={latitude} onChange={e => setLatitude(parseFloat(e.target.value) || 0)} required
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono" />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{t('pages.locations.colLon')}</label>
          <input type="number" step="any" value={longitude} onChange={e => setLongitude(parseFloat(e.target.value) || 0)} required
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono" />
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{t('pages.locations.colCountry')}</label>
        <input value={country} onChange={e => setCountry(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Indonesia" />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="locActive" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="h-4 w-4" />
        <label htmlFor="locActive" className="text-xs font-semibold uppercase text-slate-500">{t('common.active')}</label>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600">{t('common.cancel')}</button>
        <button type="submit" disabled={saving || !name}
          className="rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-bold uppercase text-white hover:bg-[#004b85] disabled:opacity-50">
          {saving ? t('common.saving') : isEdit ? t('common.save') : t('common.add')}
        </button>
      </div>
    </form>
  )
}
