'use client'

import { useTranslation } from '@/lib/i18n/LanguageContext'
import { useEffect, useState } from 'react'
import { ArrowLeft, Play, Trash2 } from 'lucide-react'
import type { Source, Run } from '@/types'
import { fetchSources, fetchRuns, triggerCollect, updateSource, deleteSource } from '@/lib/api'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'

export default function SourceDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [source, setSource] = useState<Source | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', schedule: '' })

  const load = async () => {
    setLoading(true)
    try {
      const all = await fetchSources()
      const found = all.find((s: Source) => s.id === id)
      setSource(found || null)
      if (found) {
        setForm({ name: found.name, schedule: found.schedule || '' })
        setRuns(await fetchRuns(id))
      }
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  const handleTrigger = async () => {
    try {
      await triggerCollect(id)
      toast.success(t('pages.sources.processing', { name: source?.name || '' }))
      await load()
    } catch (e: any) {
      toast.error(e?.message || t('common.saveFailed'))
    }
  }

  const handleSave = async () => {
    try {
      await updateSource(id, form)
      setEditing(false)
      toast.success(t('common.savedSuccess'))
      await load()
    } catch (e: any) {
      toast.error(e?.message || t('common.saveFailed'))
    }
  }

  const handleDelete = async () => {
    if (!confirm(t('common.confirmDelete', { name: source?.name || '' }))) return
    try {
      await deleteSource(id)
      toast.success(t('common.deletedSuccess'))
      router.push('/sources')
    } catch (e: any) {
      toast.error(e?.message || t('common.deleteFailed'))
    }
  }

  if (loading) return <div className="p-8 text-center text-slate-400">{t("common.loading")}</div>
  if (!source) return <div className="p-8 text-center text-slate-400">{t("common.noData")}</div>

  return (
    <div className="px-4 md:px-6">
      <Link href="/sources" className="inline-flex items-center gap-1 text-sm font-semibold text-[#0060A9] hover:text-[#0060A9]">
        <ArrowLeft className="h-4 w-4" /> {t('common.back')}
      </Link>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">{source.name}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('common.type')}: {source.source_type} | {t('pages.sources.colFrequency')}: {source.schedule || 'manual'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleTrigger} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold uppercase text-[#0060A9] transition hover:bg-blue-100">
            <Play className="h-4 w-4" /> Trigger
          </button>
          <button onClick={handleDelete} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold uppercase text-red-600 transition hover:bg-red-100">
            <Trash2 className="h-4 w-4" /> {t('common.delete')}
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold uppercase tracking-[0.04em] text-slate-900">Configuration</h2>
          <button onClick={() => setEditing(!editing)}
            className="text-sm font-semibold text-[#0060A9] hover:text-[#0060A9]"
          >{editing ? t('common.cancel') : t('common.edit')}</button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{t('pages.sources.colName')}</label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              disabled={!editing}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{t('pages.sources.colFrequency')} (interval:minutes)</label>
            <input type="text" value={form.schedule} onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))}
              disabled={!editing} placeholder="e.g. interval:60"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Config (JSON)</label>
            <textarea value={JSON.stringify(source.config, null, 2)} readOnly
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono text-slate-600 bg-slate-50"
              rows={6} />
          </div>
        </div>

        {editing && (
          <div className="mt-4 flex justify-end">
            <button onClick={handleSave}
              className="rounded-xl bg-[#0060A9] px-6 py-2 text-sm font-bold uppercase text-white transition hover:bg-[#004b85]"
            >{t("common.save")}</button>
          </div>
        )}
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
          <h2 className="text-base font-bold uppercase tracking-[0.04em] text-slate-900">Collection History</h2>
        </div>
        {runs.length === 0 ? (
          <div className="p-8 text-center text-slate-400">{t("common.noData")}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">{t("common.date")}</th>
                <th className="px-4 py-3 font-semibold text-slate-600">{t("pages.events.colProcessed")}</th>
                <th className="px-4 py-3 font-semibold text-slate-600">{t("common.status")}</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">{t("common.total")}</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">{t("pages.events.colProcessed")}</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Error</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-blue-50/40">
                  <td className="px-4 py-3 text-slate-700">{r.started_at?.slice(0, 19)}</td>
                  <td className="px-4 py-3 text-slate-700">{r.finished_at?.slice(0, 19) || '—'}</td>
                  <td className="px-4 py-3">
                    {r.status === 'SUCCESS'
                      ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-600">SUCCESS</span>
                      : r.status === 'FAILED'
                      ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">FAILED</span>
                      : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-600">RUNNING</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">{r.records_found}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{r.records_ingested}</td>
                  <td className="px-4 py-3 text-xs text-red-500">{r.error_message || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
