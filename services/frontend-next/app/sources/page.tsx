'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  Database,
  Globe2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import type { Source, SourceSummary } from '@/types'
import { usePaginatedFetch } from '@/hooks/usePaginatedFetch'
import SearchInput from '@/components/SearchInput'
import Pagination from '@/components/Pagination'
import Modal from '@/components/Modal'
import SourceForm from '@/components/SourceForm'
import CountryFlag from '@/components/CountryFlag'
import { fetchSourceSummary, triggerCollect, deleteSource, updateSource } from '@/lib/api'
import { resolveSourceCountry } from '@/lib/source-country'
import { sourceCatalogType } from '@/lib/source-catalog.mjs'

type SourceFilters = {
  status: string
  sourceType: string
  coverage: string
}

const SOURCE_TYPES = [
  { value: 'rss', label: 'RSS' },
  { value: 'web', label: 'Web' },
  { value: 'api', label: 'API' },
  { value: 'csv', label: 'CSV' },
  { value: 'social_media', label: 'Social media' },
]

function sourcePath(filters: SourceFilters) {
  const params = new URLSearchParams()
  if (filters.status === 'active') params.set('enabled', 'true')
  if (filters.status === 'paused') params.set('enabled', 'false')
  if (filters.sourceType) params.set('source_type', filters.sourceType)
  if (filters.coverage === 'asean') params.set('coverage_scope', 'asean_outlet')
  if (filters.coverage === 'global') params.set('coverage_scope', 'global_outlet')
  if (filters.coverage === 'covers_asean') params.set('covers_asean', 'true')
  const query = params.toString()
  return `/api/v1/sources${query ? `?${query}` : ''}`
}

function formatDate(value?: string | null) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 16)
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function scheduleLabel(source: Source) {
  return source.schedule?.trim() || source.effective_schedule || 'Manual only'
}

function crawlState(source: Source, t: (path: string) => string) {
  const last = source.last_run
  const status = String(last?.status || '').toUpperCase()
  const running = source.in_flight || (status === 'RUNNING' && !last?.finished_at)
  if (running) return { label: t('common.running'), className: 'bg-amber-50 text-amber-700' }
  if (status === 'SUCCESS') return { label: t('common.success'), className: 'bg-emerald-50 text-emerald-700' }
  if (status === 'FAILED') return { label: t('common.failed'), className: 'bg-red-50 text-red-700' }
  return { label: 'Never run', className: 'bg-slate-100 text-slate-600' }
}

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string
  value: number | string
  detail: string
  icon: LucideIcon
  tone: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </div>
        <span className={`rounded-lg p-2 ${tone}`} aria-hidden="true">
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  )
}

export default function SourcesPage() {
  const { t } = useTranslation()
  const [filters, setFilters] = useState<SourceFilters>({ status: '', sourceType: '', coverage: '' })
  const [showModal, setShowModal] = useState(false)
  const [editSource, setEditSource] = useState<Source | null>(null)
  const [summary, setSummary] = useState<SourceSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [updatingSourceId, setUpdatingSourceId] = useState<string | null>(null)

  const path = useMemo(() => sourcePath(filters), [filters])
  const {
    data,
    loading,
    error,
    page,
    setPage,
    total,
    totalPages,
    search,
    setSearch,
    nextPage,
    prevPage,
    reload,
  } = usePaginatedFetch<Source>(path)

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true)
    try {
      setSummary(await fetchSourceSummary())
    } catch {
      setSummary(null)
    } finally {
      setSummaryLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  const refresh = () => {
    void reload()
    void loadSummary()
  }

  const handleTrigger = (source: Source) => {
    toast.promise(triggerCollect(source.id), {
      loading: `Starting ${source.name}`,
      success: () => {
        window.setTimeout(refresh, 500)
        return `${source.name} started`
      },
      error: t('common.error'),
    })
  }

  const handleToggle = async (source: Source) => {
    setUpdatingSourceId(source.id)
    try {
      await updateSource(source.id, { enabled: !source.enabled })
      toast.success(`${source.name}: ${source.enabled ? 'paused' : 'active'}`)
      refresh()
    } catch (error: any) {
      toast.error(error?.message || t('common.error'))
    } finally {
      setUpdatingSourceId(null)
    }
  }

  const handleDelete = async (source: Source) => {
    if (!window.confirm(`Delete “${source.name}”?`)) return
    try {
      await deleteSource(source.id)
      toast.success(`${source.name} deleted`)
      refresh()
    } catch (error: any) {
      toast.error(error?.message || t('common.error'))
    }
  }

  const clearFilters = () => {
    setFilters({ status: '', sourceType: '', coverage: '' })
    setSearch('')
  }

  const hasFilters = Boolean(filters.status || filters.sourceType || filters.coverage || search)
  const displayValue = (value?: number) => summaryLoading ? '...' : (value ?? 0).toLocaleString()

  return (
    <div className="px-4 pb-8 md:px-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('pages.sources.title')}</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">Manage the sources used by the collector and run them when needed.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={refresh} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0060A9]">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button type="button" onClick={() => { setEditSource(null); setShowModal(true) }} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#0060A9] px-3 text-sm font-medium text-white transition hover:bg-[#004b85] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0060A9]">
            <Plus className="h-4 w-4" /> Add source
          </button>
        </div>
      </header>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Source summary">
        <SummaryCard label="Total sources" value={displayValue(summary?.total_sources)} detail="Registered in the collector" icon={Database} tone="bg-blue-50 text-[#0060A9]" />
        <SummaryCard label="Active" value={displayValue(summary?.enabled_sources)} detail="Available to the scheduler" icon={Activity} tone="bg-emerald-50 text-emerald-700" />
        <SummaryCard label="Running now" value={displayValue(summary?.active_run_count)} detail="Collector runs in progress" icon={Play} tone="bg-amber-50 text-amber-700" />
        <SummaryCard label="ASEAN outlets" value={displayValue(summary?.asean_sources)} detail="Outlet country is assigned" icon={Globe2} tone="bg-slate-100 text-slate-700" />
      </section>

      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4" aria-label="Source filters">
        <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_170px_170px_190px_auto] lg:items-end">
          <div>
            <label htmlFor="source-search" className="mb-1.5 block text-xs font-medium text-slate-600">Search sources</label>
            <SearchInput id="source-search" ariaLabel="Search sources" value={search} onChange={setSearch} placeholder="Search by source name" />
          </div>
          <div>
            <label htmlFor="source-status" className="mb-1.5 block text-xs font-medium text-slate-600">Status</label>
            <select id="source-status" value={filters.status} onChange={event => setFilters(value => ({ ...value, status: event.target.value }))} className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-[#0060A9] focus:outline-none focus:ring-2 focus:ring-blue-100">
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
            </select>
          </div>
          <div>
            <label htmlFor="source-type" className="mb-1.5 block text-xs font-medium text-slate-600">Type</label>
            <select id="source-type" value={filters.sourceType} onChange={event => setFilters(value => ({ ...value, sourceType: event.target.value }))} className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-[#0060A9] focus:outline-none focus:ring-2 focus:ring-blue-100">
              <option value="">All types</option>
              {SOURCE_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="source-coverage" className="mb-1.5 block text-xs font-medium text-slate-600">Coverage</label>
            <select id="source-coverage" value={filters.coverage} onChange={event => setFilters(value => ({ ...value, coverage: event.target.value }))} className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-[#0060A9] focus:outline-none focus:ring-2 focus:ring-blue-100">
              <option value="">All coverage</option>
              <option value="asean">ASEAN outlet</option>
              <option value="global">Global outlet</option>
              <option value="covers_asean">Covers ASEAN</option>
            </select>
          </div>
          {hasFilters ? <button type="button" onClick={clearFilters} className="min-h-10 rounded-lg px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0060A9]">Clear filters</button> : <span className="hidden lg:block" aria-hidden="true" />}
        </div>
      </section>

      <section className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white" aria-labelledby="source-list-title">
        <div className="flex flex-col gap-1 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="source-list-title" className="text-base font-semibold text-slate-900">Source list</h2>
            <p className="mt-0.5 text-xs text-slate-500">{total.toLocaleString()} source{total === 1 ? '' : 's'} match the current view.</p>
          </div>
          <span className="text-xs text-slate-400">Run now works for paused sources too.</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">Loading sources...</div>
        ) : error ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-700">Sources could not be loaded.</p>
            <p className="mt-1 text-xs text-slate-500">Check the backend connection and try again.</p>
            <button type="button" onClick={refresh} className="mt-4 rounded-lg bg-[#0060A9] px-3 py-2 text-sm font-medium text-white hover:bg-[#004b85] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0060A9]">Try again</button>
          </div>
        ) : data.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-700">No sources found.</p>
            <p className="mt-1 text-xs text-slate-500">{hasFilters ? 'Try a different filter or add a new source.' : 'Add a source to start collecting articles.'}</p>
            {hasFilters ? <button type="button" onClick={clearFilters} className="mt-4 text-sm font-medium text-[#0060A9] hover:underline">Clear filters</button> : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Outlet</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Schedule</th>
                  <th className="px-4 py-3">Last crawl</th>
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map(source => {
                  const country = resolveSourceCountry(source)
                  const state = crawlState(source, t)
                  const sourceUrl = source.config?.url || source.config?.rss_url || source.config?.urls?.[0]
                  return (
                    <tr key={source.id} className="align-top hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link href={`/sources/${source.id}`} className="font-medium text-slate-900 hover:text-[#0060A9] hover:underline">{source.name}</Link>
                        {sourceUrl ? <div className="mt-1 max-w-[250px] truncate text-xs text-slate-400" title={sourceUrl}>{sourceUrl}</div> : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 whitespace-nowrap text-slate-700">
                          {country.code ? <CountryFlag countryCode={country.code} countryName={country.name} shape="rounded" size="xs" /> : null}
                          <span>{country.name || 'Unassigned'}</span>
                        </div>
                        {source.covers_asean && country.name === 'GLOBAL' ? <div className="mt-1 text-xs text-slate-400">Covers ASEAN</div> : null}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{sourceCatalogType(source)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{scheduleLabel(source)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(source.last_run?.finished_at || source.last_run?.started_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1.5">
                          <span className={`rounded-md px-2 py-1 text-xs font-medium ${source.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{source.enabled ? 'Active' : 'Paused'}</span>
                          <span className={`rounded-md px-2 py-1 text-xs font-medium ${state.className}`}>{state.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <button type="button" onClick={() => handleTrigger(source)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0060A9]" aria-label={`Run ${source.name} now`}>
                            <Play className="h-3.5 w-3.5" /> Run now
                          </button>
                          <button type="button" onClick={() => handleToggle(source)} disabled={updatingSourceId === source.id} className="min-h-9 rounded-lg px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-wait disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0060A9]" aria-label={`${source.enabled ? 'Pause' : 'Activate'} ${source.name}`}>
                            {updatingSourceId === source.id ? 'Saving...' : source.enabled ? 'Pause' : 'Activate'}
                          </button>
                          <Link href={`/sources/${source.id}`} className="inline-flex min-h-9 items-center rounded-lg px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0060A9]">View</Link>
                          <button type="button" onClick={() => { setEditSource(source); setShowModal(true) }} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-[#0060A9] hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0060A9]" aria-label={`Edit ${source.name}`}>
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </button>
                          <button type="button" onClick={() => handleDelete(source)} className="inline-flex min-h-9 items-center rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600" aria-label={`Delete ${source.name}`} title={`Delete ${source.name}`}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} total={total} onPrev={prevPage} onNext={nextPage} onGoTo={setPage} />
      </section>

      <Modal open={showModal} title={editSource ? 'Edit source' : 'Add source'} onClose={() => setShowModal(false)}>
        <SourceForm source={editSource} onSaved={() => { setShowModal(false); refresh() }} onCancel={() => setShowModal(false)} />
      </Modal>
    </div>
  )
}
