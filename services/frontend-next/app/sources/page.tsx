'use client'

import { useState } from 'react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { Plus, Play, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Source } from '@/types'
import { usePaginatedFetch } from '@/hooks/usePaginatedFetch'
import SearchInput from '@/components/SearchInput'
import Pagination from '@/components/Pagination'
import Modal from '@/components/Modal'
import SourceForm from '@/components/SourceForm'
import { triggerCollect, triggerCollectAll, deleteSource } from '@/lib/api'
import CountryFlag from '@/components/CountryFlag'
import { resolveSourceCountry } from '@/lib/source-country'

export default function SourcesPage() {
  const { t } = useTranslation()
  const { data, loading, page, setPage, total, totalPages, search, setSearch, nextPage, prevPage, reload } = usePaginatedFetch<Source>('/api/v1/sources')
  const [showModal, setShowModal] = useState(false)
  const [editSource, setEditSource] = useState<any | null>(null)

  const handleTrigger = async (id: string, name: string) => {
    toast.promise(triggerCollect(id), {
      loading: t('pages.sources.processing', { name }),
      success: () => { setTimeout(reload, 500); return `${name} ${t('common.done') || 'done'}` },
      error: t('common.error'),
    })
  }

  const handleTriggerAll = () => {
    toast.promise(triggerCollectAll(), {
      loading: t('pages.sources.processingAll'),
      success: () => { setTimeout(reload, 1000); return t('pages.sources.allDone') },
      error: t('common.error'),
    })
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(t('common.confirmDelete', { name }))) return
    try {
      await deleteSource(id)
      toast.success(t('common.deletedSuccess'))
      reload()
    } catch { toast.error(t('common.deleteFailed')) }
  }

  const statusBadge = (s: Source) => {
    const last = s.last_run
    if (!last) return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{t('common.never')}</span>
    if (last.status === 'SUCCESS') return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-600">{t('common.success')}</span>
    if (last.status === 'FAILED') return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">{t('common.failed')}</span>
    return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-600">{t('common.running')}</span>
  }

  const credibilityBadge = (score?: number) => {
    const s = score ?? 0.50
    if (s >= 0.7) return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-600">{`${(s * 100).toFixed(0)}%`}</span>
    if (s >= 0.5) return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-600">{`${(s * 100).toFixed(0)}%`}</span>
    return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">{`${(s * 100).toFixed(0)}%`}</span>
  }

  return (
    <div className="px-4 md:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">{t("pages.sources.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("pages.sources.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={reload} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold uppercase text-slate-600 transition hover:bg-slate-50">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            {t("common.refresh")}
          </button>
          <button onClick={handleTriggerAll}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-3 py-2 text-sm font-bold uppercase text-white transition hover:bg-amber-700">
            <Play className="h-4 w-4" /> Trigger All
          </button>
          <button onClick={() => { setEditSource(null); setShowModal(true) }}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0060A9] px-3 py-2 text-sm font-bold uppercase text-white transition hover:bg-[#004b85]">
            <Plus className="h-4 w-4" /> {t("common.add")}
          </button>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <SearchInput value={search} onChange={setSearch} placeholder={`${t("common.search")}...`} />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">{t("common.loading")}</div>
        ) : data.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">{t("common.noData")}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">{t("pages.sources.colName")}</th>
                <th className="px-4 py-3 font-semibold text-slate-600">{t("pages.sources.colCountry")}</th>
                <th className="px-4 py-3 font-semibold text-slate-600">{t("pages.sources.colType")}</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">{t("pages.sources.colCredibility")}</th>
                <th className="px-4 py-3 font-semibold text-slate-600">{t("pages.sources.colFrequency")}</th>
                <th className="px-4 py-3 font-semibold text-slate-600">{t("pages.sources.colStatus")}</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">{t("pages.sources.colAction")}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id} className="border-b border-slate-50 hover:bg-blue-50/40">
                  {(() => {
                    const country = resolveSourceCountry(s)
                    return (
                      <>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-[#0060A9]">{s.name}</span>
                    <div className="mt-0.5 text-xs text-slate-400">{s.schedule || 'manual'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 whitespace-nowrap" title={`Detected from ${s.config?.country ? 'source configuration' : 'source URL or name'}`}>
                      {country.code ? <CountryFlag countryCode={country.code} countryName={country.name} shape="rounded" size="xs" /> : null}
                      <span className="text-slate-700">{country.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600">{s.source_type}</span>
                  </td>
                  <td className="px-4 py-3 text-center">{credibilityBadge(s.source_credibility)}</td>
                  <td className="px-4 py-3 text-slate-700">{s.schedule || '—'}</td>
                  <td className="px-4 py-3">{statusBadge(s)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleTrigger(s.id, s.name)}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-blue-50 hover:text-[#0060A9]" title={t("common.trigger")}>
                      <Play className="h-4 w-4" />
                    </button>
                    <button onClick={() => { setEditSource(s); setShowModal(true) }}
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-[#0060A9] hover:bg-blue-50">{t("common.edit")}</button>
                    <button onClick={() => handleDelete(s.id, s.name)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title={t("common.delete")}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                      </>
                    )
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={totalPages} total={total} onPrev={prevPage} onNext={nextPage} onGoTo={setPage} />
      </div>

      <Modal open={showModal} title={editSource ? `${t('common.edit')} ${t('pages.sources.title')}` : `${t('common.add')} ${t('pages.sources.title')}`} onClose={() => setShowModal(false)}>
        <SourceForm source={editSource} onSaved={() => { setShowModal(false); reload() }} onCancel={() => setShowModal(false)} />
      </Modal>
    </div>
  )
}
