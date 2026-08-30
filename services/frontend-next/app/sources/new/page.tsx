'use client'

import { useState } from 'react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { ArrowLeft, Save } from 'lucide-react'
import { createSource } from '@/lib/api'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const SOURCE_TYPES = [
  { value: 'rss', label: 'RSS Feed' },
  { value: 'web', label: 'Web Scraper' },
  { value: 'csv', label: 'CSV Ingestion' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'api', label: 'API' },
]

export default function NewSourcePage() {
  const { t } = useTranslation()
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    name: '',
    source_type: 'rss',
    schedule: '',
    config_url: '',
    config_title_selector: 'h1',
    config_body_selector: 'article',
  })

  const buildConfig = () => {
    const config: any = {}
    if (form.source_type === 'rss' || form.source_type === 'api') {
      config.url = form.config_url
    } else if (form.source_type === 'web') {
      config.urls = [form.config_url]
      config.title_selector = form.config_title_selector
      config.body_selector = form.config_body_selector
    } else if (form.source_type === 'csv') {
      config.url = form.config_url
      config.column_mapping = { text: 'text', title: 'title', source: 'source', date: 'date', url: 'url' }
    } else if (form.source_type === 'social_media') {
      config.platform = 'twitter'
      config.keywords = []
      config.api_key = ''
    }
    return config
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const payload = {
        name: form.name,
        source_type: form.source_type,
        config: buildConfig(),
        schedule: form.schedule || null,
      }
      await createSource(payload)
      router.push('/sources')
    } catch (err: any) {
      alert(`Gagal: ${err.message}`)
    }
    setSubmitting(false)
  }

  return (
    <div className="px-4 md:px-6">
      <Link href="/sources" className="inline-flex items-center gap-1 text-sm font-semibold text-teal-600 hover:text-teal-700">
        <ArrowLeft className="h-4 w-4" /> {t('common.back')}
      </Link>

      <h1 className="mt-4 text-xl font-bold uppercase tracking-[0.04em] text-slate-900">{t('pages.sources.add')} {t('pages.sources.title')}</h1>

      <form onSubmit={handleSubmit} className="mt-6 max-w-2xl space-y-4">
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{t('pages.sources.colName')}</label>
          <input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Antara Health RSS" />
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{t('pages.sources.colType')}</label>
          <select value={form.source_type} onChange={e => setForm(f => ({ ...f, source_type: e.target.value }))}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            {SOURCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{t('pages.sources.colUrl')}</label>
          <input type="url" value={form.config_url} onChange={e => setForm(f => ({ ...f, config_url: e.target.value }))}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder={form.source_type === 'rss' ? 'https://www.antaranews.com/rss/terkini.xml' : 'https://...'} />
        </div>

        {form.source_type === 'web' && (
          <>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">CSS Selector Judul</label>
              <input type="text" value={form.config_title_selector} onChange={e => setForm(f => ({ ...f, config_title_selector: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">CSS Selector Body</label>
              <input type="text" value={form.config_body_selector} onChange={e => setForm(f => ({ ...f, config_body_selector: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
          </>
        )}

        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Jadwal (interval:menit)</label>
          <input type="text" value={form.schedule} onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Kosongkan untuk manual" />
        </div>

        <div className="flex justify-end pt-2">
          <button type="submit" disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-6 py-2.5 text-sm font-bold uppercase text-white transition hover:bg-teal-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {submitting ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </div>
  )
}
