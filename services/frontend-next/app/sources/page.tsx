'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { ChevronDown, Database, Globe2, Plus, Play, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Source, SourceSummary } from '@/types'
import { usePaginatedFetch } from '@/hooks/usePaginatedFetch'
import SearchInput from '@/components/SearchInput'
import Pagination from '@/components/Pagination'
import Modal from '@/components/Modal'
import SourceForm from '@/components/SourceForm'
import { fetchSourceSummary, triggerCollect, deleteSource, updateSource } from '@/lib/api'
import CountryFlag from '@/components/CountryFlag'
import { resolveSourceCountry, credibilityReasonLabel } from '@/lib/source-country'
import { sourceCatalogType, sourceOrigin, sourceValidityStatus } from '@/lib/source-catalog.mjs'
import Link from 'next/link'

function coveragePath(filter: string) {
  if (filter === 'asean_outlet') return '/api/v1/sources?coverage_scope=asean_outlet'
  if (filter === 'global_outlet') return '/api/v1/sources?coverage_scope=global_outlet'
  if (filter === 'covers_asean') return '/api/v1/sources?covers_asean=true'
  return '/api/v1/sources'
}

export default function SourcesPage() {
  const { t } = useTranslation()
  const [coverageFilter, setCoverageFilter] = useState('')
  const { data, loading, page, setPage, total, totalPages, search, setSearch, nextPage, prevPage, reload } = usePaginatedFetch<Source>(
    coveragePath(coverageFilter)
  )
  const [showModal, setShowModal] = useState(false)
  const [editSource, setEditSource] = useState<any | null>(null)
  const [summary, setSummary] = useState<SourceSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [showCoverage, setShowCoverage] = useState(false)
  const [updatingSourceId, setUpdatingSourceId] = useState<string | null>(null)

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true)
    try { setSummary(await fetchSourceSummary()) } catch { setSummary(null) }
    finally { setSummaryLoading(false) }
  }, [])

  useEffect(() => { loadSummary() }, [loadSummary])

  const refreshSources = () => { reload(); void loadSummary() }

  const handleTrigger = async (id: string, name: string) => {
    toast.promise(triggerCollect(id), {
      loading: t('pages.sources.processing', { name }),
      success: () => { setTimeout(refreshSources, 500); return `${name} ${t('common.done') || 'done'}` },
      error: t('common.error'),
    })
  }

  const handleToggle = async (source: Source) => {
    setUpdatingSourceId(source.id)
    try {
      await updateSource(source.id, { enabled: !source.enabled })
      toast.success(`${source.name}: ${!source.enabled ? 'aktif' : 'nonaktif'}`)
      refreshSources()
    } catch (error: any) {
      toast.error(error?.message || t('common.error'))
    } finally {
      setUpdatingSourceId(null)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(t('common.confirmDelete', { name }))) return
    try {
      await deleteSource(id)
      toast.success(t('common.deletedSuccess'))
      refreshSources()
    } catch { toast.error(t('common.deleteFailed')) }
  }

  const statusBadge = (s: Source) => {
    // ACTIVE (enabled) is not the same as an in-flight crawl. Running is only
    // shown when the latest collector_run is actually RUNNING and unfinished.
    const last = s.last_run
    const status = String(last?.status || '').toUpperCase()
    const inFlight = typeof s.in_flight === 'boolean'
      ? s.in_flight
      : status === 'RUNNING' && !last?.finished_at
    if (inFlight) {
      return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-600">{t('common.running')}</span>
    }
    if (status === 'SUCCESS') {
      return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-600">{t('common.success')}</span>
    }
    if (status === 'FAILED') {
      return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">{t('common.failed')}</span>
    }
    return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{t('common.never')}</span>
  }

  const credibilityBadge = (score?: number, reason?: string | null, refreshed?: string | null) => {
    const s = score ?? 0.50
    const tone = s >= 0.7 ? 'bg-emerald-100 text-emerald-600' : s >= 0.5 ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'
    return (
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}
        title={`${credibilityReasonLabel(reason)}${refreshed ? ` · refreshed ${refreshed}` : ''}. ≥0.7 is a catalog heuristic unless domain refresh or admin override. Not epidemiologist verification.`}
      >
        {`${(s * 100).toFixed(0)}%`}
      </span>
    )
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
          <button onClick={() => { setEditSource(null); setShowModal(true) }}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0060A9] px-3 py-2 text-sm font-bold uppercase text-white transition hover:bg-[#004b85]">
            <Plus className="h-4 w-4" /> {t("common.add")}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {[
          { key: '', label: 'All outlets' },
          { key: 'asean_outlet', label: '11 ASEAN jurisdiction outlets' },
          { key: 'global_outlet', label: 'Global outlets' },
          { key: 'covers_asean', label: 'Covers ASEAN stories' },
        ].map((item) => (
          <button
            key={item.key || 'all'}
            type="button"
            onClick={() => setCoverageFilter(item.key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${coverageFilter === item.key ? 'bg-[#0060A9] text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <SearchInput value={search} onChange={setSearch} placeholder={`${t("common.search")}...`} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-4">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Continuous crawl</p>
          <p className="mt-1 text-sm text-slate-700">
            Enabled sources: {(summary?.enabled_sources ?? 0).toLocaleString()} · scheduled: {(summary?.scheduled_sources ?? 0).toLocaleString()} · in flight: {(summary?.active_run_count ?? 0).toLocaleString()}
            {summary?.last_run_at ? ` · last run ${summary.last_run_at}` : ''}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Due-source dispatcher every 2 minutes (small batches) plus explicit cron/interval jobs. Failures back off; rate limits are preserved. Empty schedules default to interval:60 via the dispatcher. Status is the last crawl, not the Edit ACTIVE checkbox.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Source Inventory</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{summaryLoading ? '—' : (summary?.total_sources ?? 0).toLocaleString()}</p>
              <p className="mt-1 text-xs text-slate-500">Total registered sources</p>
            </div>
            <span className="rounded-xl bg-blue-50 p-2.5 text-[#0060A9]"><Database className="h-5 w-5" /></span>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-600">
            <span className="font-semibold text-[#0060A9]">{summaryLoading ? '—' : (summary?.web_sources ?? 0).toLocaleString()}</span> crawler web
            {!summaryLoading && summary?.by_catalog_type?.length ? (
              <div className="mt-2 space-y-0.5 text-[11px] leading-4 text-slate-500">
                {summary.by_catalog_type.slice(0, 6).map((item) => (
                  <div key={item.catalog_type}>
                    <span className="font-semibold text-slate-700">{item.source_count.toLocaleString()}</span> {item.catalog_type}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Source Credibility</p>
              <p className="mt-2 text-3xl font-bold text-emerald-600">{summaryLoading ? '—' : (summary?.credible_sources ?? 0).toLocaleString()}</p>
              <p className="mt-1 text-xs text-slate-500">≥ {Math.round((summary?.credibility_threshold ?? 0.7) * 100)}% is a catalog-type heuristic unless refreshed / overridden — not live verification</p>
              {summary?.last_credibility_refresh ? (
                <p className="mt-1 text-[11px] text-slate-400">Last refresh {summary.last_credibility_refresh.slice(0, 19)}</p>
              ) : (
                <p className="mt-1 text-[11px] text-slate-400">Belum ada refresh skor katalog</p>
              )}
            </div>
            <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600"><ShieldCheck className="h-5 w-5" /></span>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
            <span className="text-slate-500">Needs review</span>
            <span className="font-semibold text-amber-600">{summaryLoading ? '—' : (summary?.needs_review_sources ?? 0).toLocaleString()}</span>
          </div>
        </div>

        <button type="button" onClick={() => setShowCoverage(value => !value)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-[#0060A9]/40 hover:shadow-md">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Outlet country (11 ASEAN jurisdictions)</p>
              <p className="mt-2 text-3xl font-bold text-[#0060A9]">{summaryLoading ? '—' : (summary?.asean_sources ?? 0).toLocaleString()}</p>
              <p className="mt-1 text-xs text-slate-500">Sumber dengan negara ASEAN terisi (kolom country atau config.country)</p>
            </div>
            <span className="rounded-xl bg-blue-50 p-2.5 text-[#0060A9]"><Globe2 className="h-5 w-5" /></span>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
            <span className="text-slate-500">Sumber tanpa negara ASEAN terisi / sumber global</span>
            <span className="flex items-center gap-1 font-semibold text-slate-700">{summaryLoading ? '—' : (summary?.source_country_unfilled ?? summary?.outside_sources ?? 0).toLocaleString()} <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showCoverage ? 'rotate-180' : ''}`} /></span>
          </div>
        </button>
      </div>

      {showCoverage && summary && (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-[0.06em] text-slate-800">ASEAN outlet distribution</h2>
              <p className="mt-1 text-xs text-slate-500">
                Source country coalesces the top-level country column with config.country / source_country_original (ASEAN-11 aliases). It is not the article event country. Catalog rows with Indonesia/Vietnam/… only in config.country now count as ASEAN outlets. Google News / WHO / CIDRAP stay GLOBAL while still covering ASEAN stories.
                {typeof summary.global_covering_asean === 'number' ? ` Global outlets covering ASEAN: ${summary.global_covering_asean.toLocaleString()}.` : ''}
              </p>
            </div>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-[#0060A9]">{summary.asean_sources.toLocaleString()} total</span>
          </div>
          <div className="mt-4 grid gap-x-8 gap-y-3 md:grid-cols-2">
            {summary.asean_by_country.map((item) => {
              const share = summary.asean_sources ? Math.round((item.source_count / summary.asean_sources) * 100) : 0
              return (
                <div key={item.country}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">{item.country}</span>
                    <span className="text-slate-500">{item.source_count.toLocaleString()} · {share}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#0060A9]" style={{ width: `${Math.max(share, item.source_count > 0 ? 1 : 0)}%` }} /></div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">{t("common.loading")}</div>
        ) : data.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">{t("common.noData")}</div>
        ) : (
          <table className="min-w-[980px] w-full text-sm">
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
                    <Link href={`/sources/${s.id}`} className="font-semibold text-[#0060A9] hover:underline">{s.name}</Link>
                    <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase ${s.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {s.enabled ? 'Active' : 'Off'}
                    </span>
                    <div className="mt-0.5 text-xs text-slate-400">{s.effective_schedule || s.schedule || 'interval:60'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 whitespace-nowrap" title={`Detected from ${s.config?.country ? 'source configuration' : 'source URL or name'}`}>
                      {country.code ? <CountryFlag countryCode={country.code} countryName={country.name} shape="rounded" size="xs" /> : null}
                      <span className="text-slate-700">{country.name}</span>
                    </div>
                    {s.covers_asean && country.name === 'GLOBAL' ? (
                      <div className="mt-0.5 text-[10px] text-slate-400">covers ASEAN stories</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600">{sourceCatalogType(s)}</span>
                    {(sourceValidityStatus(s) || sourceOrigin(s)) ? (
                      <div className="mt-1 text-[11px] text-slate-400">
                        {[sourceValidityStatus(s), sourceOrigin(s)].filter(Boolean).join(' · ')}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-center">{credibilityBadge(s.source_credibility, s.credibility_reason, s.last_credibility_refresh)}</td>
                  <td className="px-4 py-3 text-slate-700">{s.schedule || s.effective_schedule || 'interval:60'}</td>
                  <td className="px-4 py-3">{statusBadge(s)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleTrigger(s.id, s.name)}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-blue-50 hover:text-[#0060A9]" title={t("common.trigger")}>
                      <Play className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleToggle(s)}
                      disabled={updatingSourceId === s.id}
                      className={`rounded-lg px-2 py-1 text-xs font-semibold disabled:cursor-wait disabled:opacity-50 ${s.enabled ? 'text-amber-700 hover:bg-amber-50' : 'text-emerald-700 hover:bg-emerald-50'}`}
                      title={s.enabled ? 'Nonaktifkan source' : 'Aktifkan source'}
                    >
                      {updatingSourceId === s.id ? '...' : s.enabled ? 'Pause' : 'Aktifkan'}
                    </button>
                    <Link href={`/sources/${s.id}`} className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">Hasil</Link>
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
        <SourceForm source={editSource} onSaved={() => { setShowModal(false); refreshSources() }} onCancel={() => setShowModal(false)} />
      </Modal>
    </div>
  )
}
