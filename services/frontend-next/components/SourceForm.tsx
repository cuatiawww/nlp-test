'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { createSource, updateSource } from '@/lib/api'

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
  const [schedule, setSchedule] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (source) {
      setName(source.name || '')
      setSourceType(source.source_type || 'rss')
      const cfg = source.config || {}
      setUrl(cfg.url || cfg.urls?.[0] || JSON.stringify(cfg))
      setSchedule(source.schedule || '')
      setEnabled(source.enabled !== false)
    } else {
      setName(''); setSourceType('rss'); setUrl(''); setSchedule(''); setEnabled(true)
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
      } else {
        config = { url }
      }
      if (isEdit) {
        await updateSource(source.id, { name, source_type: sourceType, config, schedule: schedule || null, enabled })
      } else {
        await createSource({ name, source_type: sourceType, config, schedule: schedule || null } as any)
      }
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{t('pages.sources.colName')}</label>
        <input value={name} onChange={e => setName(e.target.value)} required
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{t('pages.sources.colType')}</label>
        <select value={sourceType} onChange={e => setSourceType(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
          <option value="rss">RSS</option>
          <option value="web">Web</option>
          <option value="csv">CSV</option>
          <option value="social_media">Social Media</option>
          <option value="api">API</option>
        </select>
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">
          URL / Config
        </label>
        <input value={url} onChange={e => setUrl(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono text-xs"
          placeholder={sourceType === 'web' ? 'URL or {"url":"...","title_selector":"h1","body_selector":"article"}' : 'https://...'} />
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{t('pages.sources.colFrequency')}</label>
        <input value={schedule} onChange={e => setSchedule(e.target.value)} placeholder="interval:60"
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      </div>
      {isEdit && (
        <div className="flex items-center gap-2">
          <input type="checkbox" id="enabled" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="h-4 w-4" />
          <label htmlFor="enabled" className="text-xs font-semibold uppercase text-slate-500">{t('common.active')}</label>
        </div>
      )}
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
