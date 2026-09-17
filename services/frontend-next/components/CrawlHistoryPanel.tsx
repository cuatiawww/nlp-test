'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import Pagination from '@/components/Pagination'
import Modal from '@/components/Modal'
import {
  downloadCrawlHistoryExport,
  fetchCrawlHistoryJobs,
  fetchCrawlHistoryRow,
  fetchCrawlHistoryRows,
  fetchCrawlHistorySummary,
} from '@/lib/api'
import type { CrawlHistoryJob, CrawlHistoryRow, CrawlHistorySummary } from '@/types'
import { ASEAN11_DISPLAY } from '@/lib/asean-scope'
import { useTranslation } from '@/lib/i18n/LanguageContext'

type Tab = 'matrix' | 'jobs'
type ChannelFilter = 'all' | 'manual' | 'continuous' | 'analyze-url'
type QualityFilter = 'surveillance' | 'review' | 'noise' | 'all'

const PAGE_SIZE = 25
const FILTER_DEBOUNCE_MS = 400

const CHANNELS: { id: ChannelFilter; label: string }[] = [
  { id: 'all', label: 'All stored results' },
  { id: 'manual', label: 'Manual jobs' },
  { id: 'continuous', label: 'Continuous crawl' },
  { id: 'analyze-url', label: 'Analyze URL' },
]

const PHASE1_COLUMNS: { key: string; label: string; width: number; sticky?: boolean }[] = [
  { key: 'no', label: 'No', width: 52, sticky: true },
  { key: 'country', label: 'Country', width: 140 },
  { key: 'language', label: 'Language', width: 78 },
  { key: 'url', label: 'Source URL', width: 220 },
  { key: 'title', label: 'Article Title', width: 260 },
  { key: 'disease', label: 'Disease Name', width: 180 },
  { key: 'crawling_date', label: 'Crawling Date', width: 140 },
  { key: 'region', label: 'Region', width: 140 },
  { key: 'province_city_case', label: 'Province / City Case', width: 160 },
  { key: 'article_date', label: 'Article Date', width: 110 },
  { key: 'date_case', label: 'Date Case', width: 110 },
  { key: 'cases', label: 'Number of Cases', width: 180 },
  { key: 'deaths', label: 'Number of Deaths', width: 180 },
  { key: 'latitude', label: 'Latitude', width: 90 },
  { key: 'longitude', label: 'Longitude', width: 90 },
  { key: 'source_type', label: 'Source Type', width: 100 },
  { key: 'source_name', label: 'Source Name', width: 140 },
  { key: 'evidence', label: 'Evidence', width: 200 },
  { key: 'confidence', label: 'Confidence', width: 90 },
  { key: 'status', label: 'Processing Status', width: 130 },
  { key: 'disease_event_id', label: 'Event ID', width: 140 },
  { key: 'is_health_related', label: 'Is Health Related', width: 110 },
  { key: 'event_type', label: 'Event Type', width: 140 },
  { key: 'source_credibility', label: 'Source Credibility', width: 110 },
  { key: 'source_credibility_label', label: 'Credibility Label', width: 120 },
  { key: 'sentiment', label: 'Sentiment', width: 90 },
  { key: 'relevance_score', label: 'Relevance Score', width: 110 },
  { key: 'outbreak_alert', label: 'Outbreak Alert', width: 110 },
  { key: 'needs_review', label: 'Needs Review', width: 110 },
]

function fmtNum(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return ''
  return Number(value).toLocaleString('en-US')
}

function fmtBool(value?: boolean | null) {
  if (value === true) return 'True'
  if (value === false) return 'False'
  return ''
}

function fmtText(value?: string | number | null) {
  if (value == null || value === '') return ''
  return String(value)
}

function fmtTrunc(value?: string | number | null, className = 'max-w-[150px]') {
  const text = fmtText(value)
  if (!text) return ''
  return (
    <span className={`block truncate ${className}`} title={text}>
      {text}
    </span>
  )
}

function casesCell(row: CrawlHistoryRow) {
  return fmtTrunc(row.cases_display || fmtNum(row.cases), 'max-w-[170px]')
}

function deathsCell(row: CrawlHistoryRow) {
  return fmtTrunc(row.deaths_display || fmtNum(row.deaths), 'max-w-[170px]')
}

function latCell(row: CrawlHistoryRow) {
  if (row.geo_summary) return fmtTrunc(row.geo_summary, 'max-w-[80px]')
  if (row.latitude == null) return ''
  return String(row.latitude)
}

function lonCell(row: CrawlHistoryRow) {
  if (row.geo_summary) return ''
  if (row.longitude == null) return ''
  return String(row.longitude)
}

function fmtDate(value?: string | null) {
  if (!value) return ''
  return value.length > 19 ? value.slice(0, 19).replace('T', ' ') : value.replace('T', ' ')
}

function diseaseNames(value: CrawlHistoryJob['disease_names']) {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ')
  return value ? String(value) : ''
}

function channelLabel(channel?: string | null) {
  if (channel === 'manual') return 'Manual'
  if (channel === 'continuous') return 'Continuous'
  if (channel === 'analyze-url') return 'Analyze URL'
  return channel || ''
}

function rowCell(row: CrawlHistoryRow, key: string, index: number, page: number): ReactNode {
  switch (key) {
    case 'no':
      return (page - 1) * PAGE_SIZE + index + 1
    case 'url':
      return row.url ? (
        <a
          href={row.url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex max-w-[200px] items-center gap-1 truncate text-[#0060A9] hover:underline"
          title={row.url}
        >
          {row.url} <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      ) : ''
    case 'title':
      return fmtTrunc(row.title || row.article_title, 'max-w-[240px]')
    case 'disease':
      return (
        <span className="block max-w-[170px] truncate font-medium" title={row.disease || ''}>
          {fmtText(row.disease)}
        </span>
      )
    case 'crawling_date':
      return fmtDate(row.crawling_date)
    case 'article_date':
      return fmtDate(row.article_date || row.published_at)
    case 'date_case':
      return fmtDate(row.date_case)
    case 'cases':
      return casesCell(row)
    case 'deaths':
      return deathsCell(row)
    case 'latitude':
      return latCell(row)
    case 'longitude':
      return lonCell(row)
    case 'confidence':
    case 'source_credibility': {
      const raw = row[key as keyof CrawlHistoryRow]
      if (raw == null || raw === '') return ''
      const n = Number(raw)
      return Number.isNaN(n) ? '' : String(n)
    }
    case 'is_health_related':
      return fmtBool(row.is_health_related)
    case 'outbreak_alert':
      return fmtBool(row.outbreak_alert)
    case 'needs_review':
      return fmtBool(row.needs_review)
    case 'disease_event_id':
      return (
        <span className="block max-w-[130px] truncate font-mono text-[10px]" title={row.disease_event_id || ''}>
          {fmtText(row.disease_event_id)}
        </span>
      )
    case 'evidence':
      return (
        <span className="block max-w-[180px] truncate" title={row.evidence || ''}>
          {fmtText(row.evidence)}
        </span>
      )
    case 'country':
      return fmtTrunc(row.country, 'max-w-[130px]')
    case 'language':
      return fmtText(row.language)
    case 'region':
      return fmtTrunc(row.region, 'max-w-[130px]')
    case 'province_city_case':
      return fmtTrunc(row.province_city_case, 'max-w-[150px]')
    case 'source_type':
      return fmtText(row.source_type)
    case 'source_name':
      return (
        <span className="block max-w-[130px] truncate" title={row.source_name || ''}>
          {fmtText(row.source_name)}
        </span>
      )
    case 'status':
      return fmtText(row.status)
    case 'event_type':
      return (
        <span className="block max-w-[130px] truncate" title={row.event_type || ''}>
          {fmtText(row.event_type)}
        </span>
      )
    case 'source_credibility_label':
      return fmtText(row.source_credibility_label)
    case 'sentiment':
      return fmtText(row.sentiment)
    case 'relevance_score':
      return fmtText(row.relevance_score)
    default:
      return ''
  }
}

export default function CrawlHistoryPanel({ initialJobId }: { initialJobId?: string }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('matrix')
  const [channel, setChannel] = useState<ChannelFilter>('all')
  const [quality, setQuality] = useState<QualityFilter>('surveillance')
  const [country, setCountry] = useState('ASEAN')
  const [diseaseInput, setDiseaseInput] = useState('')
  const [disease, setDisease] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [status, setStatus] = useState('all')
  const [geo, setGeo] = useState('all')
  const [jobId, setJobId] = useState(initialJobId || '')
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [jobPage, setJobPage] = useState(1)
  const [rows, setRows] = useState<CrawlHistoryRow[]>([])
  const [jobs, setJobs] = useState<CrawlHistoryJob[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [jobTotal, setJobTotal] = useState(0)
  const [jobTotalPages, setJobTotalPages] = useState(1)
  const [summary, setSummary] = useState<CrawlHistorySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [detail, setDetail] = useState<CrawlHistoryRow | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(qInput.trim()), FILTER_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [qInput])

  useEffect(() => {
    const timer = window.setTimeout(() => setDisease(diseaseInput.trim()), FILTER_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [diseaseInput])

  const filters = useMemo(
    () => ({
      q: q || undefined,
      channel: channel === 'all' ? undefined : channel,
      country: country || undefined,
      disease: disease || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      status: status === 'all' ? undefined : status,
      has_geo: geo === 'yes' ? true : geo === 'no' ? false : undefined,
      job_id: jobId.trim() || undefined,
      quality,
    }),
    [q, channel, country, disease, dateFrom, dateTo, status, geo, jobId, quality],
  )

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await fetchCrawlHistorySummary())
    } catch (error: any) {
      setSummary(null)
      toast.error(error?.message || 'Crawl history totals could not be loaded')
    }
  }, [])

  const loadRows = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const result = await fetchCrawlHistoryRows({ ...filters, page, per_page: PAGE_SIZE })
      setRows(result.data || [])
      setTotal(result.total || 0)
      setTotalPages(result.totalPages || 1)
    } catch (error: any) {
      setRows([])
      setTotal(0)
      setTotalPages(1)
      const message = error?.message || 'Stored crawl results could not be loaded'
      setLoadError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [filters, page])

  const loadJobs = useCallback(async () => {
    setLoading(true)
    try {
      const result = await fetchCrawlHistoryJobs({
        q: q || undefined,
        country: country === 'ASEAN' ? undefined : country || undefined,
        disease: disease || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        status: status === 'all' ? undefined : status,
        page: jobPage,
        per_page: PAGE_SIZE,
      })
      setJobs(result.data || [])
      setJobTotal(result.total || 0)
      setJobTotalPages(result.totalPages || 1)
    } catch (error: any) {
      setJobs([])
      setJobTotal(0)
      setJobTotalPages(1)
      toast.error(error?.message || 'Crawl job history could not be loaded')
    } finally {
      setLoading(false)
    }
  }, [q, country, disease, dateFrom, dateTo, status, jobPage])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  useEffect(() => {
    if (tab === 'matrix') void loadRows()
    else void loadJobs()
  }, [tab, loadRows, loadJobs])

  useEffect(() => {
    setPage(1)
    setJobPage(1)
  }, [channel, quality, country, disease, dateFrom, dateTo, status, geo, jobId, q])

  async function openRow(row: CrawlHistoryRow) {
    setDetail(row)
    setDetailLoading(true)
    try {
      const full = await fetchCrawlHistoryRow(row.id, row.crawl_channel)
      setDetail(full)
    } catch (error: any) {
      toast.error(error?.message || 'Row detail could not be loaded')
    } finally {
      setDetailLoading(false)
    }
  }

  function openJob(job: CrawlHistoryJob) {
    setJobId(job.job_id)
    setChannel('manual')
    setCountry('')
    setTab('matrix')
  }

  async function exportRows(format: 'csv' | 'xlsx') {
    setExporting(true)
    try {
      await downloadCrawlHistoryExport(filters, format)
      toast.success(format === 'csv' ? 'CSV export started' : 'Excel export started')
    } catch (error: any) {
      toast.error(error?.message || 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const cards = [
    { label: 'Manual jobs', value: summary ? fmtNum(summary.jobs) || '0' : '—' },
    { label: 'Surveillance rows', value: summary ? fmtNum(summary.quality?.surveillance ?? summary.matrix_rows) || '0' : '—' },
    { label: 'Continuous', value: summary ? fmtNum(summary.by_channel?.continuous) || '0' : '—' },
    { label: 'Analyze URL', value: summary ? fmtNum(summary.by_channel?.analyze_url) || '0' : '—' },
    { label: 'Mapped / with geo', value: summary ? `${fmtNum(summary.mapped) || '0'} / ${fmtNum(summary.with_geo) || '0'}` : '—' },
    { label: 'Noise excluded', value: summary ? fmtNum(summary.noise_excluded ?? summary.quality?.noise) || '0' : '—' },
  ]

  const tableMinWidth = PHASE1_COLUMNS.reduce((sum, col) => sum + col.width, 0)

  return (
    <section className="mt-5 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{card.label}</div>
            <div className="mt-1 text-lg font-bold text-slate-900">{card.value}</div>
          </div>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">
        {summary?.note || t('pages.crawlHistory.qualityHint')}
      </p>
      {summary?.quality ? (
        <p className="text-[11px] text-slate-500">
          Surveillance {fmtNum(summary.quality.surveillance) || '0'} · Review {fmtNum(summary.quality.review) || '0'} · Noise {fmtNum(summary.quality.noise) || '0'}
          {typeof summary.disease_events === 'number' ? ` · Stored events ${fmtNum(summary.disease_events) || '0'}` : ''}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {([
          { id: 'matrix' as Tab, label: t('pages.crawlHistory.matrixTab') },
          { id: 'jobs' as Tab, label: t('pages.crawlHistory.jobsTab') },
        ]).map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setStatus('all')
              setTab(item.id)
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${
              tab === item.id ? 'bg-[#0060A9] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {item.label}
          </button>
        ))}
        <button
          onClick={() => (tab === 'matrix' ? loadRows() : loadJobs())}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {tab === 'matrix' && (
          <div className="mb-3 flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
            {CHANNELS.map((item) => (
              <button
                key={item.id}
                onClick={() => setChannel(item.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                  channel === item.id ? 'bg-white text-[#0060A9] shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder={t('pages.crawlHistory.searchPlaceholder')}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm xl:col-span-2"
          />
          <select value={country} onChange={(e) => setCountry(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="">{t('pages.crawlHistory.allCountries')}</option>
            <option value="ASEAN">ASEAN-11 + Timor-Leste</option>
            {ASEAN11_DISPLAY.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
            <option value="OUTSIDE ASEAN">OUTSIDE ASEAN</option>
          </select>
          <input
            value={diseaseInput}
            onChange={(e) => setDiseaseInput(e.target.value)}
            placeholder={t('pages.crawlHistory.diseasePlaceholder')}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="all">{t('pages.crawlHistory.allStatuses')}</option>
            {tab === 'jobs' ? (
              <>
                <option value="queued">Queued</option>
                <option value="processing">Processing</option>
                <option value="completed">Completed</option>
                <option value="partial">Partial</option>
                <option value="failed">Failed</option>
              </>
            ) : (
              <>
                <option value="processed">Processed</option>
                <option value="needs_review">Needs review</option>
                <option value="failed">Failed</option>
              </>
            )}
          </select>
          {tab === 'matrix' && (
            <select value={quality} onChange={(e) => setQuality(e.target.value as QualityFilter)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="surveillance">{t('pages.crawlHistory.qualitySurveillance')}</option>
              <option value="review">{t('pages.crawlHistory.qualityReview')}</option>
              <option value="noise">{t('pages.crawlHistory.qualityNoise')}</option>
              <option value="all">{t('pages.crawlHistory.qualityAll')}</option>
            </select>
          )}
          {tab === 'matrix' && (
            <select value={geo} onChange={(e) => setGeo(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="all">{t('pages.crawlHistory.allGeo')}</option>
              <option value="yes">Has geo</option>
              <option value="no">No geo</option>
            </select>
          )}
        </div>
        {jobId && tab === 'matrix' && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="rounded-full bg-blue-50 px-3 py-1 font-medium text-[#0060A9]">
              Job {jobId}
            </span>
            <button onClick={() => setJobId('')} className="text-slate-500 underline hover:text-slate-800">
              Clear job filter
            </button>
          </div>
        )}
        {tab === 'matrix' && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => exportRows('csv')}
              disabled={exporting || total === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
            <button
              onClick={() => exportRows('xlsx')}
              disabled={exporting || total === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" /> Excel
            </button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {tab === 'matrix' && loadError && !loading ? (
          <div className="p-10 text-center text-sm text-rose-600">
            <p className="font-semibold">{t('pages.crawlHistory.loadError')}</p>
            <p className="mt-2 text-xs text-slate-500">{loadError}</p>
          </div>
        ) : tab === 'matrix' && rows.length === 0 && !loading ? (
          <div className="p-10 text-center text-sm text-slate-400">{t('pages.crawlHistory.emptyRows')}</div>
        ) : tab === 'jobs' && jobs.length === 0 && !loading ? (
          <div className="p-10 text-center text-sm text-slate-400">{t('pages.crawlHistory.emptyJobs')}</div>
        ) : tab === 'jobs' && loading && jobs.length === 0 ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> {t('common.loading')}
          </div>
        ) : tab === 'matrix' && loading && rows.length === 0 ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> {t('common.loading')}
          </div>
        ) : tab === 'matrix' ? (
          <>
            <div className="relative max-h-[70vh] overflow-auto">
              {loading ? (
                <div className="pointer-events-none absolute inset-0 z-20 flex items-start justify-center bg-white/50 pt-16">
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 shadow-sm">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading page {page}
                  </span>
                </div>
              ) : null}
              <table className="border-separate border-spacing-0 text-left text-[11px]" style={{ minWidth: tableMinWidth }}>
                <colgroup>
                  {PHASE1_COLUMNS.map((col) => (
                    <col key={col.key} style={{ width: col.width }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {PHASE1_COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        className={`sticky top-0 z-10 whitespace-nowrap border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600 ${
                          col.sticky ? 'left-0 z-20 shadow-[2px_0_0_#e2e8f0]' : ''
                        }`}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr
                      key={`${row.crawl_channel}-${row.article_key || row.id}`}
                      className="cursor-pointer hover:bg-blue-50/40"
                      onClick={() => void openRow(row)}
                    >
                      {PHASE1_COLUMNS.map((col) => (
                        <td
                          key={col.key}
                          className={`whitespace-nowrap border-b border-r border-slate-100 bg-white px-2 py-1.5 align-middle text-slate-800 ${
                            col.sticky ? 'sticky left-0 z-[1]' : ''
                          }`}
                        >
                          {rowCell(row, col.key, index, page)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} total={total} onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => p + 1)} onGoTo={setPage} />
          </>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] w-full border-separate border-spacing-0 text-left text-xs">
                <thead>
                  <tr>
                    {['Job', 'Status', 'Diseases', 'Country / region', 'Dates', 'Discovered', 'Processed', 'Rows', 'Started', 'Finished'].map((header) => (
                      <th key={header} className="sticky top-0 whitespace-nowrap border-b border-r border-slate-200 bg-slate-50 px-3 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.job_id} className="cursor-pointer hover:bg-blue-50/40" onClick={() => openJob(job)}>
                      <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-3 font-mono text-[11px] text-slate-700">{job.job_id.slice(0, 8)}</td>
                      <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-3 font-semibold capitalize">{job.status}</td>
                      <td className="max-w-[220px] truncate border-b border-r border-slate-100 px-3 py-3">{diseaseNames(job.disease_names)}</td>
                      <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-3">{[job.country, job.region, job.province_city].filter(Boolean).join(' · ') || ''}</td>
                      <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-3">{[job.date_from, job.date_to].filter(Boolean).join(' → ') || ''}</td>
                      <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-3">{fmtNum(job.discovered_count)}</td>
                      <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-3">{fmtNum(job.processed_count)}</td>
                      <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-3 font-bold">{fmtNum(job.row_count)}</td>
                      <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-3">{job.created_at?.slice(0, 16) || ''}</td>
                      <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3">{job.completed_at?.slice(0, 16) || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={jobPage} totalPages={jobTotalPages} total={jobTotal} onPrev={() => setJobPage((p) => Math.max(1, p - 1))} onNext={() => setJobPage((p) => p + 1)} onGoTo={setJobPage} />
          </>
        )}
      </div>

      <Modal open={!!detail || detailLoading} title={t('pages.crawlHistory.detailTitle')} onClose={() => setDetail(null)} maxWidth="max-w-4xl">
        {detailLoading && !detail ? (
          <div className="flex items-center gap-2 py-8 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> {t('common.loading')}</div>
        ) : detail ? (
          <div className="space-y-4 text-sm">
            <div>
              <div className="text-base font-semibold text-slate-900">{detail.title || 'Untitled article'}</div>
              {detail.url ? (
                <a href={detail.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-[#0060A9] hover:underline">
                  {detail.url} <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
              {(detail.event_count && detail.event_count > 1) || (detail.location_count && detail.location_count > 1) ? (
                <p className="mt-1 text-[11px] text-slate-500">
                  {fmtNum(detail.event_count) || '—'} location events collapsed into this article row
                  {detail.location_count && detail.location_count > 1 ? ` · ${fmtNum(detail.location_count)} places` : ''}
                </p>
              ) : null}
            </div>
            <dl className="grid grid-cols-2 gap-3 text-xs md:grid-cols-3">
              <div><dt className="text-slate-400">Country</dt><dd className="font-medium">{fmtText(detail.country) || '—'}</dd></div>
              <div><dt className="text-slate-400">Language</dt><dd className="font-medium">{fmtText(detail.language) || '—'}</dd></div>
              <div><dt className="text-slate-400">Disease</dt><dd className="font-medium">{fmtText(detail.disease) || '—'}</dd></div>
              <div><dt className="text-slate-400">Crawling date</dt><dd className="font-medium">{fmtDate(detail.crawling_date) || '—'}</dd></div>
              <div><dt className="text-slate-400">Article date</dt><dd className="font-medium">{fmtDate(detail.article_date || detail.published_at) || '—'}</dd></div>
              <div><dt className="text-slate-400">Date case</dt><dd className="font-medium">{fmtDate(detail.date_case) || '—'}</dd></div>
              <div><dt className="text-slate-400">Region</dt><dd className="font-medium">{fmtText(detail.region) || '—'}</dd></div>
              <div><dt className="text-slate-400">Province / city case</dt><dd className="font-medium">{fmtText(detail.province_city_case) || '—'}</dd></div>
              <div><dt className="text-slate-400">Cases</dt><dd className="font-medium">{fmtText(detail.cases_display) || fmtNum(detail.cases) || '—'}</dd></div>
              <div><dt className="text-slate-400">Deaths</dt><dd className="font-medium">{fmtText(detail.deaths_display) || fmtNum(detail.deaths) || '—'}</dd></div>
              <div><dt className="text-slate-400">Lat / lon</dt><dd className="font-medium">{detail.geo_summary || `${detail.latitude ?? '—'} / ${detail.longitude ?? '—'}`}</dd></div>
              <div><dt className="text-slate-400">Source</dt><dd className="font-medium">{[detail.source_type, detail.source_name].filter(Boolean).join(' · ') || '—'}</dd></div>
              <div><dt className="text-slate-400">Confidence (max)</dt><dd className="font-medium">{detail.confidence ?? '—'}</dd></div>
              <div><dt className="text-slate-400">Status</dt><dd className="font-medium">{fmtText(detail.status) || '—'}</dd></div>
              <div><dt className="text-slate-400">Channel</dt><dd className="font-medium">{channelLabel(detail.crawl_channel) || '—'}</dd></div>
              <div><dt className="text-slate-400">Health related</dt><dd className="font-medium">{fmtBool(detail.is_health_related) || '—'}</dd></div>
              <div><dt className="text-slate-400">Event type</dt><dd className="font-medium">{fmtText(detail.event_type) || '—'}</dd></div>
              <div><dt className="text-slate-400">Credibility (max)</dt><dd className="font-medium">{detail.source_credibility ?? '—'} {fmtText(detail.source_credibility_label)}</dd></div>
              <div><dt className="text-slate-400">Sentiment / relevance</dt><dd className="font-medium">{fmtText(detail.sentiment) || '—'} / {fmtText(detail.relevance_score) || '—'}</dd></div>
              <div><dt className="text-slate-400">Outbreak alert</dt><dd className="font-medium">{fmtBool(detail.outbreak_alert) || '—'}</dd></div>
              <div><dt className="text-slate-400">Needs review</dt><dd className="font-medium">{fmtBool(detail.needs_review) || '—'}</dd></div>
              <div className="col-span-2 md:col-span-3"><dt className="text-slate-400">Event id</dt><dd className="font-mono text-[11px]">{detail.disease_event_id || '—'}</dd></div>
              <div className="col-span-2 md:col-span-3"><dt className="text-slate-400">Raw report id</dt><dd className="font-mono text-[11px]">{detail.raw_report_id || '—'}</dd></div>
              {detail.job_id ? <div className="col-span-2 md:col-span-3"><dt className="text-slate-400">Job id</dt><dd className="font-mono text-[11px]">{detail.job_id}</dd></div> : null}
            </dl>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence</div>
              <p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{detail.evidence || '—'}</p>
            </div>
            {detail.snippet ? (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Article snippet</div>
                <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{detail.snippet}</p>
              </div>
            ) : null}
            {detail.children && detail.children.length > 1 ? (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Location events ({detail.children.length}{detail.event_count && detail.event_count > detail.children.length ? ` of ${fmtNum(detail.event_count)}` : ''})
                </div>
                <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-full text-left text-[11px]">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                        <th className="px-2 py-1.5 font-semibold">Country</th>
                        <th className="px-2 py-1.5 font-semibold">Place</th>
                        <th className="px-2 py-1.5 font-semibold">Disease</th>
                        <th className="px-2 py-1.5 font-semibold">Cases</th>
                        <th className="px-2 py-1.5 font-semibold">Deaths</th>
                        <th className="px-2 py-1.5 font-semibold">Lat / lon</th>
                        <th className="px-2 py-1.5 font-semibold">Event id</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.children.map((child) => (
                        <tr key={child.id} className="border-t border-slate-100">
                          <td className="px-2 py-1.5">{fmtText(child.country) || '—'}</td>
                          <td className="px-2 py-1.5">{fmtText(child.province_city_case || child.province || child.city || child.region) || '—'}</td>
                          <td className="px-2 py-1.5">{fmtText(child.disease) || '—'}</td>
                          <td className="px-2 py-1.5">{fmtNum(child.cases) || '—'}</td>
                          <td className="px-2 py-1.5">{fmtNum(child.deaths) || '—'}</td>
                          <td className="px-2 py-1.5">{child.latitude ?? '—'} / {child.longitude ?? '—'}</td>
                          <td className="px-2 py-1.5 font-mono text-[10px]">{child.disease_event_id || child.id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </section>
  )
}
