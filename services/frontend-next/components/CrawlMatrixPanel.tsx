'use client'

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, ChevronDown, ChevronRight, Clock, Download, ExternalLink, Loader2, MapPin, Play, RefreshCw } from 'lucide-react'
import { createCrawlJob, fetchCrawlJob, fetchPaginated, reprocessCrawlJob } from '@/lib/api'
import type { CrawlJobStatus, CrawlMatrixRow } from '@/types'
import type { DiseaseConcept } from '@/lib/api'
import { ASEAN11_COUNTRY_NAMES, isAseanCountryName } from '@/lib/asean-scope'
import CountryFlag from '@/components/CountryFlag'

const MATRIX_COLUMNS: { key: string; label: string; width: number; sticky?: boolean }[] = [
  { key: 'no', label: 'No', width: 68, sticky: true },
  { key: 'source_info', label: 'Source & Channel', width: 160 },
  { key: 'needs_review', label: 'Status', width: 155 },
  { key: 'title', label: 'Article Title & Link', width: 320 },
  { key: 'country', label: 'Country & Region', width: 160 },
  { key: 'province_city_case', label: 'Province & City', width: 180 },
  { key: 'lat_long', label: 'Lat / Long', width: 125 },
  { key: 'disease', label: 'Disease', width: 160 },
  { key: 'cases', label: 'Cases', width: 90 },
  { key: 'deaths', label: 'Deaths', width: 90 },
  { key: 'language', label: 'Language', width: 80 },
  { key: 'article_date', label: 'Published Date', width: 120 },
  { key: 'crawling_date', label: 'Crawling Date', width: 130 },
  { key: 'action', label: 'Action', width: 110 },
]

type LocationOption = { country?: string | null; name?: string | null }
const ASEAN_COUNTRIES: string[] = [...ASEAN11_COUNTRY_NAMES]

function eventPlace(row: CrawlMatrixRow) {
  const city = row.city && row.city !== row.country ? row.city : ''
  const province = row.province && row.province !== row.country && row.province !== city ? row.province : ''
  if (city && province) return `${city} · ${province}`
  return city || province || row.province_city_case || '—'
}

function fmtCount(value?: number | null) {
  return (value || 0).toLocaleString('en-US')
}

function statusBadge(status?: string | null) {
  if (status === 'processed' || status === 'reviewed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
        <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Reviewed
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
        Failed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
      <Clock className="h-3 w-3 text-amber-600" /> Needs Review
    </span>
  )
}

function EventsButton({ count, open, onToggle }: { count: number; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => { event.stopPropagation(); onToggle() }}
      className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-bold text-[#0060A9] hover:bg-blue-100"
      title={open ? 'Tutup event' : 'Buka event'}
      aria-expanded={open}
    >
      {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      {count} events
    </button>
  )
}

function matrixCells(input: {
  label: string
  row: CrawlMatrixRow
  shaded?: boolean
  toggle?: () => void
  open?: boolean
  eventCount?: number
  summary?: { disease: string; country: string; cases: number; deaths: number; status: string; title: string }
}) {
  const bg = input.shaded ? 'bg-blue-50/40' : 'bg-white'
  const row = input.row
  const summary = input.summary
  return MATRIX_COLUMNS.map((col) => {
    let node: ReactNode = '—'
    if (col.key === 'no') {
      node = (
        <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-[#0060A9]">
          {input.toggle ? (
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); input.toggle?.() }}
              className="rounded p-0.5 text-slate-500 hover:bg-slate-100"
              title={input.open ? 'Tutup event' : 'Buka event'}
              aria-expanded={Boolean(input.open)}
            >
              {input.open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : null}
          {input.label}
        </span>
      )
    } else if (col.key === 'source_info') {
      node = (
        <div className="flex flex-col">
          <span className="max-w-[150px] truncate font-medium" title={row.source_name || ''}>{row.source_name || row.source_type || '—'}</span>
          <span className="font-mono text-[10px] uppercase text-slate-400">Manual</span>
        </div>
      )
    } else if (col.key === 'needs_review') {
      node = statusBadge(summary?.status || row.processing_status)
    } else if (col.key === 'title') {
      const title = summary?.title || row.article_title || row.source_url || '—'
      node = (
        <div className="max-w-[300px]">
          <div className="flex items-start gap-1">
            <span className="line-clamp-2 text-xs font-medium leading-snug" title={title}>{title}</span>
            {row.source_url ? (
              <a href={row.source_url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="mt-0.5 shrink-0 text-[#0060A9]" title={row.source_url}>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
          {!summary && row.evidence ? (
            <details className="mt-1" onClick={(event) => event.stopPropagation()}>
              <summary className="cursor-pointer text-[#0060A9]">Evidence</summary>
              <p className="mt-1 whitespace-normal text-slate-600">{row.evidence}</p>
            </details>
          ) : null}
        </div>
      )
    } else if (col.key === 'country') {
      const name = summary?.country || row.country || '—'
      const showFlag = name !== '—' && !/countries|multi_country/i.test(name)
      node = (
        <div className="flex items-center gap-1.5">
          {showFlag ? <CountryFlag countryCode={name} size="xs" shape="rounded" /> : null}
          <div className="min-w-0">
            <span className="block max-w-[130px] truncate font-semibold" title={name}>{name}</span>
            {!summary && row.region ? (
              <span className="inline-flex rounded border border-slate-200 bg-slate-100 px-1.5 text-[9px] font-bold uppercase tracking-tight text-slate-600">{row.region}</span>
            ) : null}
          </div>
        </div>
      )
    } else if (col.key === 'province_city_case') {
      node = input.toggle && input.eventCount ? (
        <EventsButton count={input.eventCount} open={Boolean(input.open)} onToggle={input.toggle} />
      ) : (
        <div className="flex max-w-[170px] items-start gap-1.5">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
          <span className="block truncate text-[11px] font-bold" title={eventPlace(row)}>{eventPlace(row)}</span>
        </div>
      )
    } else if (col.key === 'lat_long') {
      const text = !summary && row.latitude != null && row.longitude != null ? `${row.latitude}, ${row.longitude}` : '—'
      node = <span className="font-mono text-[10px] text-slate-700">{text}</span>
    } else if (col.key === 'disease') {
      const disease = summary?.disease || row.disease_name || '—'
      node = <span className="block max-w-[140px] truncate font-semibold" title={disease}>{disease}</span>
    } else if (col.key === 'cases') {
      node = <span className="font-bold">{fmtCount(summary ? summary.cases : row.number_of_cases)}</span>
    } else if (col.key === 'deaths') {
      const deaths = summary ? summary.deaths : row.number_of_deaths
      node = <span className={deaths ? 'font-bold text-red-600' : 'font-bold text-slate-600'}>{fmtCount(deaths)}</span>
    } else if (col.key === 'article_date') {
      node = row.article_date || '—'
    } else if (col.key === 'crawling_date') {
      node = row.crawling_date || '—'
    } else if (col.key === 'action') {
      node = row.source_url ? (
        <a
          href={row.source_url}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:border-[#0060A9] hover:bg-blue-50/60 hover:text-[#0060A9]"
        >
          <ExternalLink className="h-3.5 w-3.5 text-[#0060A9]" /> Article
        </a>
      ) : '—'
    }
    return (
      <td
        key={col.key}
        className={`whitespace-nowrap border-b border-r border-slate-100 px-2 py-1.5 align-middle text-slate-800 ${bg} ${col.sticky ? 'sticky left-0 z-[1]' : ''}`}
      >
        {node}
      </td>
    )
  })
}

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function CrawlMatrixPanel() {
  const [diseases, setDiseases] = useState<DiseaseConcept[]>([])
  const [countries, setCountries] = useState<string[]>([])
  const [selectedDiseases, setSelectedDiseases] = useState<string[]>([])
  const [diseaseSearch, setDiseaseSearch] = useState('')
  const [articleUrl, setArticleUrl] = useState('')
  const [region, setRegion] = useState('ASEAN')
  const [country, setCountry] = useState('')
  const [provinceCity, setProvinceCity] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [maxArticles, setMaxArticles] = useState(20)
  const [job, setJob] = useState<CrawlJobStatus | null>(null)
  const [openArticles, setOpenArticles] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [loadingMaster, setLoadingMaster] = useState(true)

  useEffect(() => {
    let active = true
    Promise.all([
      fetchPaginated<DiseaseConcept>('/api/v1/disease-concepts?is_active=true&per_page=100'),
      fetchPaginated<LocationOption>('/api/v1/locations?per_page=100'),
    ]).then(([diseaseResult, locationResult]) => {
      if (!active) return
      setDiseases(diseaseResult.data.filter(item => item.is_active))
      setCountries(Array.from(new Set([...ASEAN_COUNTRIES, ...locationResult.data.map(item => item.country).filter(Boolean) as string[]])).sort())
    }).catch(error => toast.error(error?.message || 'Master data could not be loaded'))
      .finally(() => active && setLoadingMaster(false))
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!job?.job_id || !['queued', 'processing', 'waiting_for_collector'].includes(job.status)) return
    let active = true
    const poll = async () => {
      try {
        const next = await fetchCrawlJob(job.job_id)
        if (active) setJob(next)
      } catch (error: any) {
        if (active) toast.error(error?.message || 'Crawler status could not be loaded')
      }
    }
    const timer = window.setInterval(poll, 1200)
    void poll()
    return () => { active = false; window.clearInterval(timer) }
  }, [job?.job_id, job?.status])

  const visibleDiseases = useMemo(() => {
    const query = diseaseSearch.trim().toLowerCase()
    return diseases.filter(item => !query || `${item.disease_id || ''} ${item.canonical_name} ${item.category || ''}`.toLowerCase().includes(query)).slice(0, 40)
  }, [diseases, diseaseSearch])

  function toggleDisease(id: string) {
    setSelectedDiseases(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }

  async function startCrawl() {
    if (!selectedDiseases.length) return toast.error('Select at least one disease from the local master')
    setBusy(true)
    try {
      const created = await createCrawlJob({
        disease_concept_ids: selectedDiseases,
        url: articleUrl.trim() || null,
        region: region || null,
        country: country || null,
        province_city: provinceCity || null,
        date_from: dateFrom || null,
        date_to: dateTo || null,
        max_articles: maxArticles,
      })
      setJob({ job_id: created.job_id, status: created.status, disease_names: [], discovered_count: 0, processed_count: 0, row_count: 0, rows: [] })
      toast.success('Manual crawl started; results will refresh automatically')
    } catch (error: any) {
      toast.error(error?.message || 'Manual crawl could not be started')
    } finally {
      setBusy(false)
    }
  }

  async function reprocess() {
    if (!job) return
    setBusy(true)
    try {
      await reprocessCrawlJob(job.job_id)
      setJob({ ...job, status: 'queued', rows: [], row_count: 0, processed_count: 0 })
      toast.success('Reprocessing started from stored articles')
    } catch (error: any) {
      toast.error(error?.message || 'Reprocessing could not be started')
    } finally {
      setBusy(false)
    }
  }

  function exportRows(format: 'csv' | 'json') {
    const rows = job?.rows || []
    if (!rows.length) return toast.error('There are no result rows to export')
    const headers = ['No.', 'Crawling Date', 'Diseases', 'Region', 'Country', 'Province', 'City', 'Province & City', 'Published Date', 'Date Case', 'Number of Cases', 'Number of Deaths', 'Latitude', 'Longitude', 'Source Type']
    const values = rows.map((row, index) => [index + 1, row.crawling_date, row.disease_name, row.region, row.country, row.province || '', row.city || '', row.province_city_case, row.article_date, row.date_case, row.number_of_cases, row.number_of_deaths, row.latitude, row.longitude, row.source_type])
    if (format === 'json') return download(`crawl-matrix-${job?.job_id}.json`, JSON.stringify(rows, null, 2), 'application/json')
    download(`crawl-matrix-${job?.job_id}.csv`, '\ufeff' + [headers, ...values].map(row => row.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8')
  }

  const statusLabel = job?.status === 'processing' ? 'Fetching and analyzing' : job?.status === 'waiting_for_collector' ? 'Waiting for service' : job?.status || 'Not started'

  const articleGroups = useMemo(() => {
    const groups: { key: string; title: string; rows: CrawlMatrixRow[] }[] = []
    const index = new Map<string, number>()
    for (const row of job?.rows || []) {
      const key = row.source_url || row.article_title || row.id
      const found = index.get(key)
      if (found == null) {
        index.set(key, groups.length)
        groups.push({ key, title: row.article_title || row.source_url || 'Article', rows: [row] })
      } else {
        groups[found].rows.push(row)
      }
    }
    return groups
  }, [job?.rows])

  const displayedCountries = region === 'ASEAN' ? ASEAN_COUNTRIES : countries

  const handleRegionChange = (newRegion: string) => {
    setRegion(newRegion)
    if (newRegion === 'ASEAN' && country && !isAseanCountryName(country)) {
      setCountry('')
    }
  }

  return (
    <section className="mt-5 space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Manual disease surveillance crawler</h2>
            <p className="mt-1 text-xs text-slate-500">Run an on-demand crawl using active diseases from the local database master and review location, date, case, death, source, and evidence fields.</p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-[#0060A9]">{statusLabel}</span>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr_1fr]">
          <div>
            <label className="text-xs font-semibold text-slate-600">Local disease master</label>
            <input value={diseaseSearch} onChange={e => setDiseaseSearch(e.target.value)} placeholder="Search disease ID or name" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
            <div className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {loadingMaster ? <span className="text-xs text-slate-400">Loading disease master...</span> : visibleDiseases.map(item => (
                <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-50">
                  <input type="checkbox" checked={selectedDiseases.includes(item.id)} onChange={() => toggleDisease(item.id)} />
                  <span className="font-medium text-slate-700">{item.canonical_name}</span><span className="ml-auto text-[10px] text-slate-400">{item.disease_id || item.source || 'database'}</span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">{selectedDiseases.length} disease(s) selected — Start stays disabled until at least one local disease is checked.</p>
            <label className="mt-3 block text-xs font-semibold text-slate-600">Article URL (optional)</label>
            <input value={articleUrl} onChange={e => setArticleUrl(e.target.value)} placeholder="Leave empty for multi-source discovery" type="url" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
            <p className="mt-1 text-[11px] text-slate-400">When provided, the dedicated worker analyzes this URL directly.</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Region</label>
            <select value={region} onChange={e => handleRegionChange(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="ASEAN">ASEAN (All Member Countries)</option>
              <option value="Global">Global</option>
            </select>
            <label className="mt-3 block text-xs font-semibold text-slate-600">Country (optional {region === 'ASEAN' ? '- defaults to all ASEAN' : ''})</label>
            <select value={country} onChange={e => setCountry(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">{region === 'ASEAN' ? 'All ASEAN countries (auto)' : 'All countries'}</option>
              {displayedCountries.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
            <input value={provinceCity} onChange={e => setProvinceCity(e.target.value)} placeholder="Province or city (optional)" className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Article date range</label>
            <div className="mt-1 grid grid-cols-2 gap-2"><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-2 text-xs" /><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-2 text-xs" /></div>
            <label className="mt-3 block text-xs font-semibold text-slate-600">Maximum articles</label>
            <input type="number" min={1} max={500} value={maxArticles} onChange={e => setMaxArticles(Math.min(500, Math.max(1, Number(e.target.value) || 1)))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <button onClick={startCrawl} disabled={busy || loadingMaster || selectedDiseases.length === 0 || ['queued', 'processing', 'waiting_for_collector'].includes(job?.status || '')} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#0060A9] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#004b85] disabled:opacity-50"><Play className="h-4 w-4" />{busy ? 'Preparing...' : 'Start manual crawl'}</button>
          </div>
        </div>
      </div>

      {job && <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div className="text-xs text-slate-500">
            <div>Job <span className="font-mono text-slate-700">{job.job_id}</span> · {job.discovered_count} discovered · {job.processed_count} processed · {job.row_count} rows</div>
            <div className="mt-1 text-[11px] text-slate-400">{job.query?.url ? `Direct URL: ${job.query.url}` : 'Sources: Google News plus matching catalog sites (including disabled scheduler rows). Official/Main sources are tried first; the interval crawler stays unchanged.'}</div>
          </div>
          <div className="flex gap-2"><button onClick={() => exportRows('csv')} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Download className="h-3.5 w-3.5" />CSV</button><button onClick={() => exportRows('json')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">JSON</button><button onClick={reprocess} disabled={busy || ['queued', 'processing'].includes(job.status)} className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" />Reprocess</button></div>
        </div>
        {['queued', 'processing', 'waiting_for_collector'].includes(job.status) && <div className="flex items-center gap-2 p-4 text-xs text-[#0060A9]"><Loader2 className="h-4 w-4 animate-spin" />{job.status === 'waiting_for_collector' ? 'The service is starting; the system will retry automatically.' : 'The dedicated worker is fetching articles and mapping cases to countries and dates.'}</div>}
        {job.error && <div className="p-4 text-xs text-red-600">{job.error}</div>}
        {!!job.warnings?.length && (
          <details className="mx-4 mb-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800">
            <summary className="cursor-pointer font-medium hover:text-amber-900">{job.warnings.length} processing warning(s)</summary>
            <ul className="mt-2 space-y-1.5 list-disc pl-5 max-h-48 overflow-y-auto break-all">
              {job.warnings.slice(0, 30).map((warning, index) => {
                const separatorIndex = warning.indexOf(': ')
                if (separatorIndex !== -1 && (warning.startsWith('http://') || warning.startsWith('https://'))) {
                  const urlPart = warning.substring(0, separatorIndex)
                  const reasonPart = warning.substring(separatorIndex + 2)
                  return (
                    <li key={index} className="break-all">
                      <a href={urlPart} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-blue-600 hover:underline inline-block max-w-[280px] sm:max-w-md truncate align-bottom">
                        {urlPart}
                      </a>
                      <span className="text-amber-800 font-medium">: {reasonPart}</span>
                    </li>
                  )
                }
                return <li key={index} className="break-all font-medium text-amber-800">{warning}</li>
              })}
            </ul>
          </details>
        )}
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-left text-[11px]" style={{ minWidth: MATRIX_COLUMNS.reduce((sum, col) => sum + col.width, 0) }}>
            <colgroup>
              {MATRIX_COLUMNS.map((col) => <col key={col.key} style={{ width: col.width }} />)}
            </colgroup>
            <thead>
              <tr>
                {MATRIX_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={`sticky top-0 z-10 whitespace-nowrap border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600 ${col.sticky ? 'left-0 z-20 shadow-[2px_0_0_#e2e8f0]' : ''}`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {articleGroups.map((group, groupIndex) => {
                const many = group.rows.length > 1
                const open = Boolean(openArticles[group.key])
                const toggle = () => setOpenArticles((current) => ({ ...current, [group.key]: !current[group.key] }))
                const cases = group.rows.reduce((sum, row) => sum + (row.number_of_cases || 0), 0)
                const deaths = group.rows.reduce((sum, row) => sum + (row.number_of_deaths || 0), 0)
                const diseases = Array.from(new Set(group.rows.map((row) => row.disease_name).filter(Boolean)))
                const countries = Array.from(new Set(group.rows.map((row) => row.country).filter(Boolean)))
                const status = group.rows.some((row) => row.processing_status === 'failed')
                  ? 'failed'
                  : group.rows.every((row) => row.processing_status === 'processed')
                    ? 'processed'
                    : 'needs_review'
                const lead = group.rows[0]
                return (
                  <Fragment key={group.key}>
                    <tr className={many ? 'cursor-pointer hover:bg-blue-50/40' : 'hover:bg-slate-50'} onClick={many ? toggle : undefined}>
                      {matrixCells({
                        label: String(groupIndex + 1),
                        row: lead,
                        toggle: many ? toggle : undefined,
                        open,
                        eventCount: many ? group.rows.length : undefined,
                        summary: many ? {
                          disease: diseases.length === 1 ? diseases[0] : `${diseases.length} diseases`,
                          country: countries.length === 1 ? countries[0] : `${countries.length} countries`,
                          cases,
                          deaths,
                          status,
                          title: group.title,
                        } : undefined,
                      })}
                    </tr>
                    {many && open && group.rows.map((row, eventIndex) => (
                      <tr key={row.id} className="bg-blue-50/30 hover:bg-blue-50/50">
                        {matrixCells({
                          label: `${groupIndex + 1}.${eventIndex + 1}`,
                          row,
                          shaded: true,
                        })}
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        {!job.rows.length && !['queued', 'processing', 'waiting_for_collector'].includes(job.status) && <div className="p-8 text-center text-sm text-slate-400">No validated rows matched the filters. Try a broader country or date range.</div>}
      </div>}
    </section>
  )
}
