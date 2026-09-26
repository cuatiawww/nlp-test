'use client'

function stripHtml(text?: string | null): string {
  if (!text) return ''
  return text
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Activity,
  MapPin,
  Radio,
  Layers,
  FileText,
  Filter,
  LayoutGrid,
  ListFilter,
  Edit3,
  Eye,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock,
} from 'lucide-react'
import Pagination from '@/components/Pagination'
import Modal from '@/components/Modal'
import CorrectionModal, { CorrectionTarget } from '@/components/CorrectionModal'
import ArticleReviewModal, { ReviewTarget } from '@/components/ArticleReviewModal'
import CountryFlag from '@/components/CountryFlag'
import {
  downloadCrawlHistoryExport,
  fetchCrawlHistoryJobs,
  fetchCrawlHistoryRow,
  fetchCrawlHistoryRows,
  fetchCrawlHistorySummary,
  isAuthFailureMessage,
  isTimeoutFailureMessage,
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
  { id: 'all', label: 'All Sources' },
  { id: 'continuous', label: 'Continuous Feed' },
  { id: 'analyze-url', label: 'Analyzed URLs' },
  { id: 'manual', label: 'Manual Crawl' },
]

export const SURVEILLANCE_COLUMNS: { key: string; label: string; width: number; sticky?: boolean }[] = [
  { key: 'no', label: 'No', width: 50, sticky: true },
  { key: 'source_info', label: 'Source & Channel', width: 160 },
  { key: 'needs_review', label: 'Status', width: 155 },
  { key: 'title', label: 'Article Title & Link', width: 320 },
  { key: 'country', label: 'Country & Region', width: 160 },
  { key: 'province_city_case', label: 'Province & City', width: 170 },
  { key: 'lat_long', label: 'Lat / Long', width: 125 },
  { key: 'disease', label: 'Disease', width: 160 },
  { key: 'cases', label: 'Cases', width: 90 },
  { key: 'deaths', label: 'Deaths', width: 90 },
  { key: 'language', label: 'Language', width: 80 },
  { key: 'article_date', label: 'Published Date', width: 120 },
  { key: 'crawling_date', label: 'Crawling Date', width: 130 },
  { key: 'action', label: 'Action', width: 90 },
]

export const ALL_LOG_COLUMNS: { key: string; label: string; width: number; sticky?: boolean }[] = [
  { key: 'no', label: 'No', width: 52, sticky: true },
  { key: 'surveillance_scope', label: 'Scope', width: 110 },
  { key: 'country', label: 'Case Country', width: 150 },
  { key: 'disease', label: 'Disease Name', width: 180 },
  { key: 'title', label: 'Article Title', width: 280 },
  { key: 'cases', label: 'Cases', width: 90 },
  { key: 'deaths', label: 'Deaths', width: 90 },
  { key: 'crawling_date', label: 'Crawling Date', width: 140 },
  { key: 'province_city_case', label: 'Province & City', width: 180 },
  { key: 'language', label: 'Language', width: 78 },
  { key: 'url', label: 'Source URL', width: 220 },
  { key: 'article_date', label: 'Published Date', width: 120 },
  { key: 'date_case', label: 'Date Case', width: 110 },
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
  { key: 'needs_review', label: 'Review Status', width: 125 },
  { key: 'action', label: 'Actions', width: 105 },
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

function asEventRow(row: CrawlHistoryRow): CrawlHistoryRow {
  return { ...row, cases_display: null, deaths_display: null, geo_summary: null }
}

function factKey(row: CrawlHistoryRow) {
  const place = (row.city || row.province_city_case || row.province || '').trim().toLowerCase()
  return [row.disease || '', row.country || '', place, row.cases ?? '', row.deaths ?? ''].join('|').toLowerCase()
}

function decomposedEvents(_parent: CrawlHistoryRow, kids: CrawlHistoryRow[] | undefined) {
  const rows = kids || []
  const children = rows.filter((row) => row.parent_event_id)
  const events = children.length >= 2 ? children : rows
  const seen = new Set<string>()
  const unique = events.filter((row) => {
    const key = factKey(row)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return unique.length >= 2 ? unique : []
}

function casesCell(row: CrawlHistoryRow) {
  return fmtTrunc(row.cases_display || fmtNum(row.cases), 'max-w-[170px]')
}

function deathsCell(row: CrawlHistoryRow) {
  return fmtTrunc(row.deaths_display || fmtNum(row.deaths), 'max-w-[170px]')
}

function fmtCoord(val: number | string | null | undefined): string {
  if (val == null || val === '') return ''
  const num = typeof val === 'number' ? val : parseFloat(String(val))
  if (isNaN(num)) return String(val)
  return parseFloat(num.toFixed(4)).toString()
}

function latLongCell(row: CrawlHistoryRow) {
  if (row.geo_summary) {
    return <span className="text-[10px] text-slate-500 font-medium" title={row.geo_summary}>{row.geo_summary}</span>
  }
  const latStr = fmtCoord(row.latitude)
  const lonStr = fmtCoord(row.longitude)
  if (!latStr && !lonStr) {
    return <span className="text-slate-400">—</span>
  }
  if (latStr && lonStr) {
    return (
      <span className="font-mono text-[10px] text-slate-700 whitespace-nowrap" title={`${row.latitude}, ${row.longitude}`}>
        {latStr}, {lonStr}
      </span>
    )
  }
  return (
    <span className="font-mono text-[10px] text-slate-700">
      {latStr || lonStr}
    </span>
  )
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
    case 'source_info':
      return (
        <div className="flex flex-col">
          <span className="font-medium text-slate-800 truncate max-w-[150px]" title={row.source_name || row.source_type || ''}>
            {row.source_name || row.source_type || '—'}
          </span>
          <span className="text-[10px] font-mono text-slate-400 uppercase">
            {channelLabel(row.crawl_channel)}
          </span>
        </div>
      )
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
      return (
        <div className="flex items-start gap-1">
          <span className="line-clamp-2 max-w-[300px] text-xs font-medium text-slate-800 leading-snug" title={stripHtml(row.title || row.article_title)}>
            {stripHtml(row.title || row.article_title || row.url)}
          </span>
          {row.url ? (
            <a
              href={row.url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[#0060A9] hover:text-blue-700 shrink-0 mt-0.5"
              title={row.url}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>
      )
    case 'disease':
      return (
        <div className="flex flex-col">
          <span className="font-semibold text-slate-900 truncate max-w-[140px]" title={row.disease || ''}>
            {fmtText(row.disease) || '—'}
          </span>
        </div>
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
    case 'lat_long':
      return latLongCell(row)
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
    case 'needs_review': {
      const isRev = row.needs_review === false || row.status === 'reviewed';
      if (isRev) {
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700 w-fit">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Reviewed
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700 w-fit">
          <Clock className="h-3 w-3 text-amber-600" /> Needs Review
        </span>
      );
    }
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
    case 'country_region':
    case 'country': {
      const countryName = (row.country && row.country !== 'MULTI_COUNTRY') ? row.country : '-'
      const reg = row.region || row.surveillance_scope
      return (
        <div className="flex items-center gap-1.5 flex-wrap">
          {countryName !== '-' && <CountryFlag countryCode={row.country} size="xs" shape="rounded" />}
          <div className="min-w-0">
            <span className="font-semibold text-slate-800 truncate max-w-[130px] block" title={row.country || ''}>
              {row.country || '—'}
            </span>
            {reg ? (
              <span className="inline-flex items-center rounded bg-slate-100 border border-slate-200 px-1.5 py-0.2 text-[9px] font-bold text-slate-600 uppercase tracking-tight" title={`Region: ${reg}`}>
                {reg}
              </span>
            ) : null}
          </div>
        </div>
      )
    }
    case 'source_country':
      return fmtTrunc(row.source_country, 'max-w-[130px]')
    case 'surveillance_scope':
      return fmtTrunc(row.surveillance_scope || row.region, 'max-w-[110px]')
    case 'language':
      return fmtText(row.language)
    case 'region':
      return fmtTrunc(row.region, 'max-w-[130px]')
    case 'province_city':
    case 'province_city_case': {
      const cityName = row.city || (row.province_city_case && row.province && row.province_city_case !== row.province ? row.province_city_case : '')
      const provinceName = row.province
      const locationDisplay = row.province_city_case || row.location_name || [provinceName, cityName].filter(Boolean).join(', ')

      if (!locationDisplay && !provinceName && !cityName) {
        return <span className="text-slate-400 text-[10px]">—</span>
      }

      return (
        <div className="flex items-start gap-1.5 max-w-[170px]">
          <MapPin className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5" />
          <div className="text-[11px] min-w-0">
            {provinceName && cityName && cityName !== provinceName ? (
              <>
                <span className="font-bold text-slate-900 block truncate" title={cityName}>
                  {cityName}
                </span>
                <span className="text-[10px] text-slate-500 block truncate" title={`Province: ${provinceName}`}>
                  {provinceName}
                </span>
              </>
            ) : (
              <span className="font-bold text-slate-900 block truncate" title={locationDisplay}>
                {locationDisplay}
              </span>
            )}
          </div>
        </div>
      )
    }
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
  const [viewMode, setViewMode] = useState<'surveillance' | 'all'>('surveillance')
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
  const [showAdvanced, setShowAdvanced] = useState(false)

  const activeAdvancedCount = useMemo(() => {
    let count = 0
    if (country) count++
    if (disease) count++
    if (dateFrom || dateTo) count++
    if (status !== 'all') count++
    if (geo !== 'all') count++
    return count
  }, [country, disease, dateFrom, dateTo, status, geo])
  const [rows, setRows] = useState<CrawlHistoryRow[]>([])
  const [eventRows, setEventRows] = useState<Record<string, CrawlHistoryRow[]>>({})
  const [openArticles, setOpenArticles] = useState<Record<string, boolean>>({})
  const [jobs, setJobs] = useState<CrawlHistoryJob[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [jobTotal, setJobTotal] = useState(0)
  const [jobTotalPages, setJobTotalPages] = useState(1)
  const [summary, setSummary] = useState<CrawlHistorySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [detail, setDetail] = useState<CrawlHistoryRow | null>(null)
  const [correctionTarget, setCorrectionTarget] = useState<CorrectionTarget | null>(null)
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null)
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
    let active = true
    const multi = rows.filter((row) => (row.event_count || 0) > 1 && row.id)
    if (!multi.length) {
      setEventRows({})
      return
    }
    Promise.all(multi.map(async (row) => {
      try {
        const full = await fetchCrawlHistoryRow(row.id, row.crawl_channel)
        return [row.id, full?.children || []] as const
      } catch {
        return [row.id, []] as const
      }
    })).then((pairs) => {
      if (active) setEventRows(Object.fromEntries(pairs))
    })
    return () => { active = false }
  }, [rows])

  useEffect(() => {
    setPage(1)
    setJobPage(1)
  }, [channel, quality, country, disease, dateFrom, dateTo, status, geo, jobId, q])

  async function openRow(row: CrawlHistoryRow) {
    setReviewTarget({
      id: row.id,
      eventId: row.disease_event_id,
      rawReportId: row.raw_report_id || row.id,
      title: row.title || row.article_title,
      url: row.url,
      summary: (row as any).summary,
      content: (row as any).content,
      snippet: row.snippet,
      evidence: row.evidence,
      disease: row.disease,
      country: row.country,
      region: row.region || row.surveillance_scope,
      locationName: row.province_city_case || row.province || row.city || row.location_name,
      latitude: row.latitude,
      longitude: row.longitude,
      cases: row.cases,
      deaths: row.deaths,
      casesDisplay: row.cases_display,
      deathsDisplay: row.deaths_display,
      eventCount: row.event_count,
      locationCount: row.location_count,
      language: row.language,
      crawlingDate: row.crawling_date,
      articleDate: row.article_date || row.published_at,
      eventType: row.event_type,
      outbreakAlert: row.outbreak_alert,
      sourceType: row.source_type,
      sourceName: row.source_name,
      confidence: row.confidence,
      needsReview: row.needs_review,
    })

    try {
      const full = await fetchCrawlHistoryRow(row.id, row.crawl_channel)
      if (full) {
        setReviewTarget((prev) => (prev && prev.id === row.id ? {
          ...prev,
          summary: (full as any).summary || prev.summary,
          content: (full as any).content || prev.content,
          snippet: full.snippet || prev.snippet,
          evidence: full.evidence || prev.evidence,
          disease: full.disease || prev.disease,
          latitude: full.latitude ?? prev.latitude,
          longitude: full.longitude ?? prev.longitude,
          country: full.country || prev.country,
          region: full.region || prev.region,
          locationName: full.province_city_case || full.location_name || prev.locationName,
          cases: full.cases != null ? full.cases : prev.cases,
          deaths: full.deaths != null ? full.deaths : prev.deaths,
          casesDisplay: full.cases_display || prev.casesDisplay,
          deathsDisplay: full.deaths_display || prev.deathsDisplay,
          eventCount: full.event_count ?? prev.eventCount,
          locationCount: full.location_count ?? prev.locationCount,
          confidence: full.confidence ?? prev.confidence,
          children: full.children,
        } : prev))
      }
    } catch {
      // Row data already present
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
    {
      label: 'Health Events',
      value: quality === 'surveillance' ? (fmtNum(total) || '0') : (summary ? fmtNum(summary.quality?.surveillance ?? summary.matrix_rows) || '0' : '—'),
      subtext: quality === 'surveillance' && country ? `Filtered (${country})` : undefined,
      icon: Activity,
      color: 'text-[#0060A9] bg-blue-50 border-blue-200',
    },
    {
      label: 'Continuous Feed',
      value: summary ? fmtNum(summary.by_channel?.continuous) || '0' : '—',
      icon: Radio,
      color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    },
    {
      label: 'Analyzed URLs',
      value: summary ? fmtNum(summary.by_channel?.analyze_url) || '0' : '—',
      icon: ExternalLink,
      color: 'text-indigo-700 bg-indigo-50 border-indigo-200',
    },
    {
      label: 'Mapped Locations',
      value: summary ? `${fmtNum(summary.with_geo || summary.mapped) || '0'}` : '—',
      icon: MapPin,
      color: 'text-rose-700 bg-rose-50 border-rose-200',
    },
    {
      label: 'Non Health',
      value: quality === 'noise' ? (fmtNum(total) || '0') : (summary ? fmtNum(summary.noise_excluded ?? summary.quality?.noise) || '0' : '—'),
      subtext: quality === 'noise' && country ? `Filtered (${country})` : undefined,
      icon: Filter,
      color: 'text-slate-600 bg-slate-50 border-slate-200',
    },
    {
      label: 'Filtered Matrix Records',
      value: fmtNum(total) || '0',
      subtext: 'Active Matrix View Total',
      icon: FileText,
      color: 'text-amber-700 bg-amber-50 border-amber-200',
    },
  ]

  const activeColumns = viewMode === 'surveillance' ? SURVEILLANCE_COLUMNS : ALL_LOG_COLUMNS
  const tableMinWidth = activeColumns.reduce((sum, col) => sum + col.width, 0)

  return (
    <section className="mt-5 space-y-4">
      {/* KPI Stat Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <div
              key={card.label}
              className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs transition-all hover:shadow-xs hover:border-slate-300"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {card.label}
                </span>
                <span className={`flex h-6 w-6 items-center justify-center rounded-lg border ${card.color}`}>
                  <Icon className="h-3 w-3" />
                </span>
              </div>
              <div className="mt-2 text-xl font-extrabold text-slate-900 tracking-tight">
                {card.value}
              </div>
            </div>
          )
        })}
      </div>

      {/* Quality Summary Distribution Bar */}
      {summary?.quality ? (
        <div className="flex flex-wrap items-center justify-end gap-3 text-[11px] text-slate-500 px-1 py-0.5">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Health: <strong className="text-slate-800">{fmtNum(summary.quality.surveillance) || '0'}</strong>
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="h-2 w-2 rounded-full bg-slate-400" />
            Non Health: <strong className="text-slate-800">{fmtNum(summary.quality.noise) || '0'}</strong>
          </span>
          {typeof summary.disease_events === 'number' && (
            <span className="inline-flex items-center gap-1.5 text-slate-400">
              (Total events: <strong className="text-slate-700">{fmtNum(summary.disease_events) || '0'}</strong>)
            </span>
          )}
        </div>
      ) : null}

      {/* Main Filter & Navigation Card */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs space-y-3.5">
        {/* Top Control Bar: Tab Switcher + View Mode Switcher + Exports + Refresh */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          {/* Main Tabs: Articles & Events vs Crawl Tasks */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            {([
              { id: 'matrix' as Tab, label: t('pages.crawlHistory.matrixTab'), icon: FileText },
              { id: 'jobs' as Tab, label: t('pages.crawlHistory.jobsTab'), icon: Layers },
            ]).map((item) => {
              const Icon = item.icon
              const isActive = tab === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setStatus('all')
                    setTab(item.id)
                  }}
                  className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white text-[#0060A9] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>

          {/* Right Toolbar Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {tab === 'matrix' && (
              <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode('surveillance')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                    viewMode === 'surveillance'
                      ? 'bg-white text-[#0060A9] shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Clean epidemiological surveillance view"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span>Standard View</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('all')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                    viewMode === 'all'
                      ? 'bg-white text-[#0060A9] shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Full data table with all 31 columns"
                >
                  <ListFilter className="h-3.5 w-3.5" />
                  <span>Detailed Table</span>
                </button>
              </div>
            )}

            {tab === 'matrix' && (
              <>
                <button
                  type="button"
                  onClick={() => exportRows('csv')}
                  disabled={exporting || total === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs disabled:opacity-50 cursor-pointer"
                  title="Export filtered records to CSV"
                >
                  <Download className="h-3.5 w-3.5 text-slate-500" />
                  <span>CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => exportRows('xlsx')}
                  disabled={exporting || total === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs disabled:opacity-50 cursor-pointer"
                  title="Export filtered records to Excel"
                >
                  <Download className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Excel</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => (tab === 'matrix' ? loadRows() : loadJobs())}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs cursor-pointer"
              title="Refresh data"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Row 2: Channel Selector & Quick Quality Filter Pills */}
        {tab === 'matrix' && (
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100/90 p-1">
              {CHANNELS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setChannel(item.id)
                    setPage(1)
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                    channel === item.id
                      ? 'bg-white text-[#0060A9] shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Quick Quality Filter Pills (Mirrors Events Page: All, Health, Non Health) */}
            <div className="flex items-center gap-1 rounded-xl bg-slate-100/90 p-1 text-xs">
              <span className="px-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Filter:
              </span>
              {[
                { id: 'all' as QualityFilter, label: t('pages.events.filterAll') || 'All' },
                { id: 'surveillance' as QualityFilter, label: t('pages.events.filterHealth') || 'Health' },
                { id: 'noise' as QualityFilter, label: t('pages.events.filterNonHealth') || 'Non Health' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setQuality(opt.id)
                    setPage(1)
                  }}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${
                    quality === opt.id
                      ? 'bg-white text-[#0060A9] shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Row 3: Main Search Input + Advanced Filter Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Unified Search Input */}
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setQ(e.currentTarget.value.trim())
                  setPage(1)
                }
              }}
              placeholder={t('pages.crawlHistory.searchPlaceholder')}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-9 pr-10 text-xs font-medium text-slate-800 placeholder-slate-400 outline-none transition focus:border-[#0060A9] focus:bg-white focus:ring-1 focus:ring-[#0060A9]"
            />
            {qInput && (
              <button
                type="button"
                onClick={() => {
                  setQInput('')
                  setQ('')
                  setPage(1)
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setQ(qInput.trim())
              setPage(1)
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0060A9] px-4 py-2.5 text-xs font-bold text-white shadow-2xs hover:bg-[#004b85] transition cursor-pointer"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search</span>
          </button>

          {/* Advanced Filter Toggle Button */}
          {tab === 'matrix' && (
            <button
              type="button"
              onClick={() => setShowAdvanced((prev) => !prev)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-bold transition shadow-2xs cursor-pointer ${
                showAdvanced || activeAdvancedCount > 0
                  ? 'border-[#0060A9] bg-blue-50/60 text-[#0060A9]'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Filters</span>
              {activeAdvancedCount > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0060A9] text-[10px] font-extrabold text-white">
                  {activeAdvancedCount}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Collapsible Advanced Filters Panel */}
        {tab === 'matrix' && showAdvanced && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 pt-3 text-xs space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-[#0060A9]" />
                Filter Options
              </span>
              {activeAdvancedCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setCountry('')
                    setDiseaseInput('')
                    setDisease('')
                    setDateFrom('')
                    setDateTo('')
                    setStatus('all')
                    setGeo('all')
                    setPage(1)
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-800 cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset Filters</span>
                </button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* Country Selection */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-600 mb-1">
                  Country / Region
                </label>
                <select
                  value={country}
                  onChange={(e) => {
                    setCountry(e.target.value)
                    setPage(1)
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-[#0060A9]"
                >
                  <option value="">{t('pages.crawlHistory.allCountries')}</option>
                  <option value="ASEAN">ASEAN Region (All)</option>
                  {ASEAN11_DISPLAY.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                  <option value="OUTSIDE ASEAN">OUTSIDE ASEAN</option>
                </select>
              </div>

              {/* Disease Name */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-600 mb-1">
                  Disease Name
                </label>
                <input
                  type="text"
                  value={diseaseInput}
                  onChange={(e) => setDiseaseInput(e.target.value)}
                  placeholder={t('pages.crawlHistory.diseasePlaceholder')}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-[#0060A9]"
                />
              </div>

              {/* Date From */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-600 mb-1">
                  Date From
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value)
                    setPage(1)
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-[#0060A9]"
                />
              </div>

              {/* Date To */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-600 mb-1">
                  Date To
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value)
                    setPage(1)
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-[#0060A9]"
                />
              </div>
            </div>
          </div>
        )}

        {/* Active Task Filter Banner */}
        {jobId && tab === 'matrix' && (
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-600">
            <span className="rounded-full bg-blue-50 border border-blue-200 px-3 py-1 font-semibold text-[#0060A9]">
              Task ID: {jobId}
            </span>
            <button
              type="button"
              onClick={() => setJobId('')}
              className="text-slate-500 underline hover:text-slate-800 text-[11px]"
            >
              Clear Task Filter
            </button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {tab === 'matrix' && loadError && !loading ? (
          <div className="p-10 text-center text-sm text-rose-600">
            <p className="font-semibold">
              {isAuthFailureMessage(loadError)
                ? t('pages.crawlHistory.loadErrorAuth')
                : isTimeoutFailureMessage(loadError)
                  ? t('pages.crawlHistory.loadErrorTimeout')
                  : t('pages.crawlHistory.loadError')}
            </p>
            <p className="mt-2 text-xs text-slate-500">{loadError}</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => void loadRows()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Retry
              </button>
              {isAuthFailureMessage(loadError) ? (
                <Link
                  href={`/login?redirect=${encodeURIComponent('/crawl-history')}`}
                  className="inline-flex items-center rounded-lg bg-[#0060A9] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#004b85]"
                >
                  {t('pages.crawlHistory.signInAgain')}
                </Link>
              ) : null}
            </div>
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
              <table className="w-full border-separate border-spacing-0 text-left text-[11px]" style={{ minWidth: tableMinWidth }}>
                <colgroup>
                  {activeColumns.map((col) => (
                    <col key={col.key} style={viewMode === 'surveillance' ? {} : { width: col.width }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {activeColumns.map((col) => (
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
                  {rows.map((row, index) => {
                    const events = decomposedEvents(row, eventRows[row.id])
                    const articleKey = row.id
                    const eventsOpen = Boolean(openArticles[articleKey])
                    const renderCells = (item: CrawlHistoryRow, label: string | number, open: () => void, toggle?: () => void) => activeColumns.map((col) => {
                      if (col.key === 'action') {
                        return (
                          <td
                            key={col.key}
                            className="whitespace-nowrap border-b border-r border-slate-100 bg-white px-2 py-1 text-center align-middle"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={open}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:border-[#0060A9] hover:bg-blue-50/60 hover:text-[#0060A9] transition shadow-2xs cursor-pointer"
                              title="Review article & extracted disease events"
                            >
                              <Eye className="h-3.5 w-3.5 text-[#0060A9]" />
                              <span>Review</span>
                            </button>
                          </td>
                        )
                      }
                      return (
                        <td
                          key={col.key}
                          className={`whitespace-nowrap border-b border-r border-slate-100 bg-white px-2 py-1.5 align-middle text-slate-800 ${
                            col.sticky ? 'sticky left-0 z-[1]' : ''
                          }`}
                        >
                          {col.key === 'no' ? (
                            <span className="inline-flex items-center gap-1">
                              {toggle ? (
                                <button
                                  type="button"
                                  onClick={(event) => { event.stopPropagation(); toggle() }}
                                  className="rounded p-0.5 text-slate-500 hover:bg-slate-100"
                                  title={eventsOpen ? 'Tutup event' : 'Buka event'}
                                >
                                  {eventsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                </button>
                              ) : null}
                              {label}
                            </span>
                          ) : rowCell(item, col.key, index, page)}
                        </td>
                      )
                    })
                    return (
                      <Fragment key={`${row.crawl_channel}-${row.article_key || row.id}`}>
                        <tr className="cursor-pointer hover:bg-blue-50/40" onClick={() => void openRow(row)}>
                          {renderCells(
                            row,
                            (page - 1) * PAGE_SIZE + index + 1,
                            () => void openRow(row),
                            events.length > 1 ? () => setOpenArticles((current) => ({ ...current, [articleKey]: !current[articleKey] })) : undefined,
                          )}
                        </tr>
                        {eventsOpen && events.map((event, eventIndex) => (
                          <tr
                            key={`${event.id || eventIndex}`}
                            className="cursor-pointer bg-blue-50/30 hover:bg-blue-50/50"
                            onClick={() => void openRow(row)}
                          >
                            {renderCells(asEventRow(event), `${index + 1}.${eventIndex + 1}`, () => void openRow({ ...row, ...asEventRow(event) }))}
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
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

      

      <CorrectionModal
        open={!!correctionTarget}
        target={correctionTarget}
        onClose={() => setCorrectionTarget(null)}
        onSuccess={() => {
          void loadRows()
        }}
      />
      <ArticleReviewModal
        open={!!reviewTarget}
        target={reviewTarget}
        onClose={() => setReviewTarget(null)}
        onReviewed={(idKey, isRev) => {
          setRows((prev) =>
            prev.map((r) => {
              if (r.id === idKey || r.disease_event_id === idKey || r.raw_report_id === idKey) {
                return { ...r, needs_review: !isRev, status: isRev ? 'reviewed' : r.status }
              }
              return r
            })
          )
          if (detail && (detail.id === idKey || detail.disease_event_id === idKey || detail.raw_report_id === idKey)) {
            setDetail({ ...detail, needs_review: !isRev, status: isRev ? 'reviewed' : detail.status })
          }
        }}
        onCorrected={() => {
          void loadRows()
        }}
      />

    </section>
  )
}
