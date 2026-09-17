'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Download,
  ExternalLink,
  Loader2,
  MapPin,
  RefreshCw,
} from 'lucide-react'
import Pagination from '@/components/Pagination'
import Modal from '@/components/Modal'
import {
  downloadCrawlHistoryExport,
  fetchCrawlHistoryJob,
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

const CHANNELS: { id: ChannelFilter; label: string }[] = [
  { id: 'all', label: 'All stored results' },
  { id: 'manual', label: 'Manual jobs' },
  { id: 'continuous', label: 'Continuous crawl' },
  { id: 'analyze-url', label: 'Analyze URL' },
]

function fmtNum(value?: number | null) {
  return Number(value || 0).toLocaleString('en-US')
}

function fmtPct(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return `${Math.round(Number(value) * 100)}%`
}

function diseaseNames(value: CrawlHistoryJob['disease_names']) {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ')
  return value ? String(value) : '—'
}

function channelLabel(channel?: string | null) {
  if (channel === 'manual') return 'Manual'
  if (channel === 'continuous') return 'Continuous'
  if (channel === 'analyze-url') return 'Analyze URL'
  return channel || '—'
}

export default function CrawlHistoryPanel({ initialJobId }: { initialJobId?: string }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('matrix')
  const [channel, setChannel] = useState<ChannelFilter>('all')
  const [country, setCountry] = useState('')
  const [disease, setDisease] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [status, setStatus] = useState('all')
  const [geo, setGeo] = useState('all')
  const [jobId, setJobId] = useState(initialJobId || '')
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

  const filters = useMemo(
    () => ({
      q: q.trim() || undefined,
      channel: channel === 'all' ? undefined : channel,
      country: country || undefined,
      disease: disease.trim() || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      status: status === 'all' ? undefined : status,
      has_geo: geo === 'yes' ? true : geo === 'no' ? false : undefined,
      job_id: jobId.trim() || undefined,
    }),
    [q, channel, country, disease, dateFrom, dateTo, status, geo, jobId],
  )

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await fetchCrawlHistorySummary())
    } catch (error: any) {
      toast.error(error?.message || 'Crawl history totals could not be loaded')
    }
  }, [])

  const loadRows = useCallback(async () => {
    setLoading(true)
    try {
      const result = await fetchCrawlHistoryRows({ ...filters, page, per_page: 20 })
      setRows(result.data || [])
      setTotal(result.total || 0)
      setTotalPages(result.totalPages || 1)
    } catch (error: any) {
      setRows([])
      setTotal(0)
      setTotalPages(1)
      toast.error(error?.message || 'Stored crawl results could not be loaded')
    } finally {
      setLoading(false)
    }
  }, [filters, page])

  const loadJobs = useCallback(async () => {
    setLoading(true)
    try {
      const result = await fetchCrawlHistoryJobs({
        q: q.trim() || undefined,
        country: country || undefined,
        disease: disease.trim() || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        status: status === 'all' ? undefined : status,
        page: jobPage,
        per_page: 20,
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
  }, [channel, country, disease, dateFrom, dateTo, status, geo, jobId, q])

  async function openRow(row: CrawlHistoryRow) {
    setDetailLoading(true)
    try {
      const full = await fetchCrawlHistoryRow(row.id, row.crawl_channel)
      setDetail(full)
    } catch (error: any) {
      toast.error(error?.message || 'Row detail could not be loaded')
      setDetail(row)
    } finally {
      setDetailLoading(false)
    }
  }

  async function openJob(job: CrawlHistoryJob) {
    setJobId(job.job_id)
    setChannel('manual')
    setTab('matrix')
    try {
      await fetchCrawlHistoryJob(job.job_id)
    } catch {
      // Matrix filter is enough; job fetch is only a prefetch.
    }
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
    { label: 'Manual jobs', value: summary?.jobs ?? 0 },
    { label: 'Matrix rows', value: summary?.matrix_rows ?? 0 },
    { label: 'Continuous', value: summary?.by_channel?.continuous ?? 0 },
    { label: 'Analyze URL', value: summary?.by_channel?.analyze_url ?? 0 },
    { label: 'Mapped / with geo', value: `${fmtNum(summary?.mapped)} / ${fmtNum(summary?.with_geo)}` },
    { label: 'Needs review', value: summary?.needs_review ?? 0 },
  ]

  return (
    <section className="mt-5 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{card.label}</div>
            <div className="mt-1 text-lg font-bold text-slate-900">{typeof card.value === 'number' ? fmtNum(card.value) : card.value}</div>
          </div>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">
        {summary?.note ||
          'Live Phase 2 stored counts from the database. Phase 1 totals are not invented here — compare volume and field richness (province/city, geo, confidence, channel, job id, mapped) against a Phase 1 export when that system is reachable.'}
      </p>

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
            value={q}
            onChange={(e) => setQ(e.target.value)}
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
            value={disease}
            onChange={(e) => setDisease(e.target.value)}
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
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> {t('common.loading')}
          </div>
        ) : tab === 'matrix' && rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">{t('pages.crawlHistory.emptyRows')}</div>
        ) : tab === 'jobs' && jobs.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">{t('pages.crawlHistory.emptyJobs')}</div>
        ) : tab === 'matrix' ? (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-[1400px] w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    {['Title / URL', 'Published', 'Country', 'Province / City', 'Disease', 'Cases', 'Deaths', 'Confidence', 'Source', 'Channel', 'Job', 'Mapped', 'Review'].map((header) => (
                      <th key={header} className="whitespace-nowrap px-3 py-3 font-semibold">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr key={`${row.crawl_channel}-${row.id}`} className="cursor-pointer align-top hover:bg-blue-50/40" onClick={() => void openRow(row)}>
                      <td className="max-w-[240px] px-3 py-3">
                        <div className="truncate font-medium text-slate-800" title={row.title || ''}>{row.title || '—'}</div>
                        {row.url ? (
                          <a href={row.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-[10px] text-[#0060A9] hover:underline">
                            {row.url} <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">{row.published_at || '—'}</td>
                      <td className="px-3 py-3 font-semibold">{row.country || '—'}</td>
                      <td className="max-w-[160px] px-3 py-3">{[row.province, row.city].filter(Boolean).join(' / ') || '—'}</td>
                      <td className="max-w-[160px] px-3 py-3 font-medium text-slate-800">
                        {row.disease || '—'}
                        {row.icd11_code ? <div className="text-[10px] font-normal text-slate-400">{row.icd11_code}</div> : null}
                      </td>
                      <td className="px-3 py-3 font-bold">{fmtNum(row.cases)}</td>
                      <td className="px-3 py-3 font-bold text-red-600">{fmtNum(row.deaths)}</td>
                      <td className="px-3 py-3">{fmtPct(row.confidence)}</td>
                      <td className="max-w-[140px] px-3 py-3">
                        {row.source_name || row.source_type || '—'}
                        <div className="text-[10px] text-slate-400">{row.source_type || ''}</div>
                      </td>
                      <td className="px-3 py-3">{channelLabel(row.crawl_channel)}</td>
                      <td className="px-3 py-3 font-mono text-[10px]">{row.job_id ? row.job_id.slice(0, 8) : '—'}</td>
                      <td className="px-3 py-3">
                        {row.mapped ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700"><MapPin className="h-3 w-3" /> Yes</span>
                        ) : 'No'}
                      </td>
                      <td className="px-3 py-3">
                        {row.needs_review ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Needs review</span>
                        ) : (
                          <span className="text-slate-500">{row.status || 'processed'}</span>
                        )}
                      </td>
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
              <table className="min-w-[1100px] w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    {['Job', 'Status', 'Diseases', 'Country / region', 'Dates', 'Discovered', 'Processed', 'Rows', 'Started', 'Finished'].map((header) => (
                      <th key={header} className="whitespace-nowrap px-3 py-3 font-semibold">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {jobs.map((job) => (
                    <tr key={job.job_id} className="cursor-pointer hover:bg-blue-50/40" onClick={() => void openJob(job)}>
                      <td className="px-3 py-3 font-mono text-[11px] text-slate-700">{job.job_id.slice(0, 8)}</td>
                      <td className="px-3 py-3 font-semibold capitalize">{job.status}</td>
                      <td className="max-w-[220px] px-3 py-3">{diseaseNames(job.disease_names)}</td>
                      <td className="px-3 py-3">{[job.country, job.region, job.province_city].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-3">{[job.date_from, job.date_to].filter(Boolean).join(' → ') || '—'}</td>
                      <td className="px-3 py-3">{fmtNum(job.discovered_count)}</td>
                      <td className="px-3 py-3">{fmtNum(job.processed_count)}</td>
                      <td className="px-3 py-3 font-bold">{fmtNum(job.row_count)}</td>
                      <td className="whitespace-nowrap px-3 py-3">{job.created_at?.slice(0, 16) || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-3">{job.completed_at?.slice(0, 16) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={jobPage} totalPages={jobTotalPages} total={jobTotal} onPrev={() => setJobPage((p) => Math.max(1, p - 1))} onNext={() => setJobPage((p) => p + 1)} onGoTo={setJobPage} />
          </>
        )}
      </div>

      <Modal open={!!detail || detailLoading} title={t('pages.crawlHistory.detailTitle')} onClose={() => setDetail(null)} maxWidth="max-w-3xl">
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
            </div>
            <dl className="grid grid-cols-2 gap-3 text-xs md:grid-cols-3">
              <div><dt className="text-slate-400">Published</dt><dd className="font-medium">{detail.published_at || '—'}</dd></div>
              <div><dt className="text-slate-400">Country</dt><dd className="font-medium">{detail.country || '—'}</dd></div>
              <div><dt className="text-slate-400">Province / city</dt><dd className="font-medium">{[detail.province, detail.city].filter(Boolean).join(' / ') || '—'}</dd></div>
              <div><dt className="text-slate-400">Disease</dt><dd className="font-medium">{detail.disease || '—'}</dd></div>
              <div><dt className="text-slate-400">Cases / deaths</dt><dd className="font-medium">{fmtNum(detail.cases)} / {fmtNum(detail.deaths)}</dd></div>
              <div><dt className="text-slate-400">Confidence</dt><dd className="font-medium">{fmtPct(detail.confidence)}</dd></div>
              <div><dt className="text-slate-400">Channel</dt><dd className="font-medium">{channelLabel(detail.crawl_channel)}</dd></div>
              <div><dt className="text-slate-400">Mapped / geo</dt><dd className="font-medium">{detail.mapped ? 'Yes' : 'No'}{detail.has_geo ? ` · ${detail.latitude}, ${detail.longitude}` : ''}</dd></div>
              <div><dt className="text-slate-400">Needs review</dt><dd className="font-medium">{detail.needs_review ? 'Yes' : 'No'}</dd></div>
              <div className="col-span-2 md:col-span-3"><dt className="text-slate-400">Raw report id</dt><dd className="font-mono text-[11px]">{detail.raw_report_id || '—'}</dd></div>
              <div className="col-span-2 md:col-span-3"><dt className="text-slate-400">Disease event id</dt><dd className="font-mono text-[11px]">{detail.disease_event_id || '—'}</dd></div>
              {detail.job_id ? <div className="col-span-2 md:col-span-3"><dt className="text-slate-400">Job id</dt><dd className="font-mono text-[11px]">{detail.job_id}</dd></div> : null}
            </dl>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Article snippet</div>
              <p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{detail.snippet || detail.evidence || 'No stored snippet.'}</p>
            </div>
            {detail.evidence && detail.evidence !== detail.snippet ? (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">NLP evidence</div>
                <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{detail.evidence}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </section>
  )
}
