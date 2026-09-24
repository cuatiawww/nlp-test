'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { createSource, updateSource } from '@/lib/api'
import { resolveSourceCountry, SOURCE_COUNTRY_OPTIONS } from '@/lib/source-country'

interface Props {
  source?: any | null
  onSaved: () => void
  onCancel: () => void
}

export default function SourceForm({ source, onSaved, onCancel }: Props) {
  const { t } = useTranslation();
  const isEdit = !!source
  const [name, setName] = useState('')
  const [sourceType, setSourceType] = useState('rss')
  const [url, setUrl] = useState('')
  const [country, setCountry] = useState('')
  const [schedule, setSchedule] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (source) {
      setName(source.name || '')
      setSourceType(source.source_type || 'rss')
      const cfg = source.config || {}
      setUrl(cfg.url || cfg.rss_url || cfg.urls?.[0] || JSON.stringify(cfg))
      const detectedCountry = resolveSourceCountry(source)
      setCountry(source.country || cfg.country || (detectedCountry.code ? detectedCountry.name : ''))
      setSchedule(source.schedule || '')
      setEnabled(source.enabled !== false)
    } else {
      setName(''); setSourceType('rss'); setUrl(''); setCountry(''); setSchedule(''); setEnabled(false)
    }
  }, [source])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name) return
    setSaving(true)
    try {
      let config: any = {}
      if (sourceType === 'web') {
        try { config = JSON.parse(url) } catch { config = { url } }
      } else if (sourceType === 'social_media') {
        // Keep both keys for compatibility with old and new social RSS
        // collector configurations.
        config = { url, rss_url: url }
      } else {
        config = { url }
      }
      if (country.trim()) config.country = country.trim()
      if (isEdit && source?.config) {
        for (const key of ['catalog_type', 'catalog_type_id', 'validity_status', 'from_engine', 'source_origin', 'source_catalog', 'source_country_original']) {
          if (source.config[key] != null && config[key] == null) config[key] = source.config[key]
        }
      }
      if (isEdit) {
        await updateSource(source.id, { name, source_type: sourceType, config, country: country.trim() || null, schedule: schedule || null, enabled })
      } else {
        await createSource({ name, source_type: sourceType, config, country: country.trim() || null, schedule: schedule || null, enabled } as any)
      }
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium text-slate-700">Source name</label>
        <input value={name} onChange={e => setName(e.target.value)} required
          className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#0060A9] focus:outline-none focus:ring-2 focus:ring-blue-100" />
      </div>
      <div>
        <label className="text-sm font-medium text-slate-700">Type</label>
        <select value={sourceType} onChange={e => setSourceType(e.target.value)}
          className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#0060A9] focus:outline-none focus:ring-2 focus:ring-blue-100">
          <option value="rss">RSS</option>
          <option value="web">Web</option>
          <option value="csv">CSV</option>
          <option value="social_media">Social Media</option>
          <option value="api">API</option>
        </select>
      </div>
      <div>
        <label className="text-sm font-medium text-slate-700">
          Source URL
        </label>
        <input value={url} onChange={e => setUrl(e.target.value)}
          className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs focus:border-[#0060A9] focus:outline-none focus:ring-2 focus:ring-blue-100"
          placeholder={sourceType === 'web' ? 'URL or JSON config' : 'https://...'} />
      </div>
      <div>
        <label className="text-sm font-medium text-slate-700">Outlet country</label>
        <select value={country} onChange={e => setCountry(e.target.value)} required
          className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#0060A9] focus:outline-none focus:ring-2 focus:ring-blue-100">
          <option value="">Select outlet country</option>
          {SOURCE_COUNTRY_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>
      <div>
        <label className="text-sm font-medium text-slate-700">Schedule</label>
        <input value={schedule} onChange={e => setSchedule(e.target.value)} placeholder="interval:60"
          className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#0060A9] focus:outline-none focus:ring-2 focus:ring-blue-100" />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="enabled" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="h-4 w-4" />
        <label htmlFor="enabled" className="text-sm font-medium text-slate-700">Enable automatic crawling</label>
        {!isEdit && <span className="text-xs text-slate-400">New sources start paused.</span>}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel}
          className="min-h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0060A9]">{t('common.cancel')}</button>
        <button type="submit" disabled={saving || !name}
          className="min-h-10 rounded-lg bg-[#0060A9] px-4 text-sm font-medium text-white hover:bg-[#004b85] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0060A9]">
          {saving ? t('common.saving') : isEdit ? t('common.save') : t('common.add')}
        </button>
      </div>
    </form>
  )
}
