'use client'

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Bug, ChevronDown, ChevronRight, Download, ExternalLink, Loader2, MapPin, Play, RefreshCw } from 'lucide-react'
import { createCrawlJob, fetchCrawlJob, fetchMasterRegions, fetchPaginated, reprocessCrawlJob } from '@/lib/api'
import type { CrawlJobStatus, CrawlMatrixRow } from '@/types'
import type { DiseaseConcept, MasterRegion } from '@/lib/api'

const MATRIX_COLUMNS: { key: string; label: string; width: number; sticky?: boolean }[] = [
  { key: 'no', label: 'No', width: 68, sticky: true },
  { key: 'country', label: 'Country', width: 130 },
  { key: 'language', label: 'Language', width: 75 },
  { key: 'url', label: 'Source URL', width: 200 },
  { key: 'title', label: 'Article Title', width: 240 },
  { key: 'disease', label: 'Disease Name', width: 190 },
  { key: 'location_case', label: 'Location Case', width: 170 },
  { key: 'latitude', label: 'Latitude', width: 105 },
  { key: 'longitude', label: 'Longitude', width: 105 },
  { key: 'location_precision', label: 'Location Precision', width: 135 },
  { key: 'published_at', label: 'Published Date', width: 120 },
  { key: 'date_case', label: 'Date Case', width: 140 },
  { key: 'cases', label: 'Number of Cases', width: 180 },
  { key: 'deaths', label: 'Number of Deaths', width: 150 },
  { key: 'event_type', label: 'Event Type', width: 130 },
  { key: 'sentiment', label: 'Sentiment', width: 110 },
  { key: 'relevance_score', label: 'Health Relevance', width: 130 },
  { key: 'source_credibility', label: 'Source Reliability', width: 130 },
  { key: 'is_health_related', label: 'Health Related', width: 110 },
  { key: 'evidence', label: 'Evidence', width: 240 },
  { key: 'action', label: 'Action', width: 95 },
]

type PlaceOption = { id: string; name: string; country?: string | null; admin_level?: number | null }

function eventPlace(row: CrawlMatrixRow) {
  const city = row.city && row.city !== row.country ? row.city : ''
  const province = row.province && row.province !== row.country && row.province !== city ? row.province : ''
  if (city && province) return `${city} · ${province}`
  return city || province || row.province_city_case || '—'
}

function fmtCount(value?: number | null) {
  return (value || 0).toLocaleString('en-US')
}

function formatCoordinate(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(4) : '—'
}

function locationPrecision(row: CrawlMatrixRow, manyPlaces: boolean) {
  if (manyPlaces) return 'multiple event locations'
  if (row.latitude == null || row.longitude == null) return 'unknown'
  const place = eventPlace(row).trim().toLowerCase()
  const country = (row.country || '').trim().toLowerCase()
  return place && place === country ? 'country centroid' : 'locality/admin'
}

function sentimentBadge(value?: string | null) {
  const tone = (value || '').toLowerCase()
  if (tone === 'positive') return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Positive</span>
  if (tone === 'negative') return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">Negative</span>
  if (tone === 'neutral') return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Neutral</span>
  return <span className="text-slate-400">{value || '—'}</span>
}

function relevanceBadge(value?: string | number | null) {
  const tone = String(value || '').toLowerCase()
  if (!tone) return <span className="text-slate-400">—</span>
  if (tone === 'high') return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">High</span>
  if (tone === 'low') return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Low</span>
  return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{tone === 'medium' ? 'Medium' : tone}</span>
}

function healthBadge(value?: boolean | null) {
  if (value === true) return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Yes</span>
  if (value === false) return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">No</span>
  return <span className="text-slate-400">—</span>
}

function reliabilityLabel(row: CrawlMatrixRow) {
  const raw = row.source_credibility ?? row.confidence
  if (raw == null || Number.isNaN(Number(raw))) return '—'
  const value = Number(raw)
  const percent = value <= 1 ? value * 100 : value
  return `${percent.toFixed(0)}%`
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
  summary?: { disease: string; country: string; cases: number; deaths: number; title: string }
  manyPlaces?: boolean
  child?: boolean
}) {
  const bg = input.shaded ? 'bg-blue-50/40' : 'bg-white'
  const row = input.row
  const summary = input.summary
  const manyPlaces = Boolean(input.manyPlaces)
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
    } else if (col.key === 'country') {
      const name = summary?.country || row.country || '—'
      node = <span className="block max-w-[110px] truncate font-medium" title={name}>{name}</span>
    } else if (col.key === 'language') {
      node = <span className="font-mono uppercase text-slate-600">{row.language || '—'}</span>
    } else if (col.key === 'url') {
      node = row.source_url ? (
        <a href={row.source_url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="inline-flex max-w-[180px] items-center gap-1 truncate text-[#0060A9] hover:underline" title={row.source_url}>
          <ExternalLink className="h-3 w-3 shrink-0" />
          <span className="truncate">{row.source_url}</span>
        </a>
      ) : '—'
    } else if (col.key === 'title') {
      const title = summary?.title || row.article_title || row.source_url || '—'
      node = <span className="block max-w-[220px] truncate font-medium" title={title}>{title}</span>
    } else if (col.key === 'disease') {
      const disease = summary?.disease || row.disease_name || '—'
      node = (
        <span className="inline-flex max-w-[170px] items-center gap-1.5 font-bold" title={disease}>
          <Bug className="h-3.5 w-3.5 shrink-0 text-[#0060A9]" />
          <span className="truncate">{disease}</span>
        </span>
      )
    } else if (col.key === 'location_case') {
      node = input.toggle && input.eventCount ? (
        <EventsButton count={input.eventCount} open={Boolean(input.open)} onToggle={input.toggle} />
      ) : (
        <span className="inline-flex max-w-[150px] items-center gap-1 font-medium">
          <MapPin className="h-3 w-3 shrink-0 text-rose-500" />
          <span className="truncate" title={eventPlace(row)}>{eventPlace(row)}</span>
        </span>
      )
    } else if (col.key === 'latitude') {
      node = <span className="font-mono text-slate-600">{manyPlaces ? '—' : formatCoordinate(row.latitude)}</span>
    } else if (col.key === 'longitude') {
      node = <span className="font-mono text-slate-600">{manyPlaces ? '—' : formatCoordinate(row.longitude)}</span>
    } else if (col.key === 'location_precision') {
      node = <span className="text-slate-600">{locationPrecision(row, manyPlaces)}</span>
    } else if (col.key === 'published_at') {
      node = <span className="font-mono text-[10px]">{row.article_date || '—'}</span>
    } else if (col.key === 'date_case') {
      node = <span className="font-mono text-[10px]">{row.date_case || row.article_date || '—'}</span>
    } else if (col.key === 'cases') {
      node = <span className="font-extrabold">{fmtCount(summary ? summary.cases : row.number_of_cases)}</span>
    } else if (col.key === 'deaths') {
      const deaths = summary ? summary.deaths : row.number_of_deaths
      node = <span className={deaths ? 'font-extrabold text-red-600' : 'font-bold text-slate-600'}>{fmtCount(deaths)}</span>
    } else if (col.key === 'event_type') {
      node = <span className="capitalize">{(row.event_type || '—').replace(/_/g, ' ')}</span>
    } else if (col.key === 'sentiment') {
      node = input.child ? '—' : sentimentBadge(row.sentiment)
    } else if (col.key === 'relevance_score') {
      node = input.child ? '—' : relevanceBadge(row.relevance_score)
    } else if (col.key === 'source_credibility') {
      node = input.child ? '—' : <span className="font-mono font-semibold">{reliabilityLabel(row)}</span>
    } else if (col.key === 'is_health_related') {
      node = input.child ? '—' : healthBadge(row.is_health_related)
    } else if (col.key === 'evidence') {
      node = <span className="block max-w-[220px] truncate text-slate-600" title={row.evidence || ''}>{row.evidence || '—'}</span>
    } else if (col.key === 'action') {
      node = row.source_url ? (
        <a
          href={row.source_url}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
        >
          <ExternalLink className="h-3 w-3 text-blue-600" />
          Article
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
  const [regions, setRegions] = useState<MasterRegion[]>([])
  const [places, setPlaces] = useState<PlaceOption[]>([])
  const [placesLoading, setPlacesLoading] = useState(false)
  const [placeSearch, setPlaceSearch] = useState('')
  const [selectedDiseases, setSelectedDiseases] = useState<string[]>([])
  const [diseaseSearch, setDiseaseSearch] = useState('')
  const [articleUrl, setArticleUrl] = useState('')
  const [regionId, setRegionId] = useState('')
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
      fetchMasterRegions({ per_page: 100 }),
    ]).then(([diseaseResult, regionRows]) => {
      if (!active) return
      setDiseases(diseaseResult.data.filter(item => item.is_active))
      const activeRegions = (regionRows || []).filter(item => item.is_active)
      setRegions(activeRegions)
      const asean = activeRegions.find(item => item.code === 'ASEAN') || activeRegions[0]
      if (asean) setRegionId(asean.id)
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

  const selectedRegion = regions.find(item => item.id === regionId) || null
  const regionCountries = selectedRegion?.countries || []

  useEffect(() => {
    if (!country) {
      setPlaces([])
      setPlaceSearch('')
      return
    }
    let active = true
    setPlacesLoading(true)
    const path = `/api/v1/locations?snapshot=true&is_active=true&country=${encodeURIComponent(country)}`
    fetchPaginated<PlaceOption>(path).then(result => {
      if (!active) return
      const rows = result.data.filter(item => {
        const name = (item.name || '').trim()
        if (!name || name.toLowerCase() === country.toLowerCase()) return false
        return item.admin_level == null || item.admin_level <= 2
      })
      const unique = Array.from(new Map(rows.map(item => [item.name.toLowerCase(), item])).values())
      unique.sort((a, b) => a.name.localeCompare(b.name))
      setPlaces(unique)
    }).catch(() => {
      if (active) setPlaces([])
    }).finally(() => {
      if (active) setPlacesLoading(false)
    })
    return () => { active = false }
  }, [country])

  const visiblePlaces = useMemo(() => {
    const query = placeSearch.trim().toLowerCase()
    const matched = query ? places.filter(item => item.name.toLowerCase().includes(query)) : places
    return matched.slice(0, 200)
  }, [places, placeSearch])

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
        region: selectedRegion?.name || null,
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
    const headers = MATRIX_COLUMNS.map((col) => col.label)
    const values = rows.map((row, index) => [
      index + 1, row.country, row.language, row.source_url, row.article_title, row.disease_name,
      eventPlace(row), row.latitude, row.longitude, locationPrecision(row, false),
      row.article_date, row.date_case || row.article_date, row.number_of_cases, row.number_of_deaths,
      row.event_type, row.sentiment, row.relevance_score, reliabilityLabel(row),
      row.is_health_related == null ? '' : row.is_health_related ? 'Yes' : 'No',
      row.evidence, row.source_url,
    ])
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

  function handleRegionChange(nextRegionId: string) {
    setRegionId(nextRegionId)
    const next = regions.find(item => item.id === nextRegionId)
    const names = new Set((next?.countries || []).map(item => item.name))
    if (country && !names.has(country)) {
      setCountry('')
      setProvinceCity('')
      setPlaceSearch('')
    }
  }

  function handleCountryChange(nextCountry: string) {
    setCountry(nextCountry)
    setProvinceCity('')
    setPlaceSearch('')
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
            <select value={regionId} onChange={e => handleRegionChange(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              {regions.length === 0 && <option value="">No regions in master data</option>}
              {regions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <label className="mt-3 block text-xs font-semibold text-slate-600">Country{selectedRegion ? ` in ${selectedRegion.name}` : ''}</label>
            <select value={country} onChange={e => handleCountryChange(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">{regionCountries.length ? `All countries in ${selectedRegion?.name}` : 'Select a region first'}</option>
              {regionCountries.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
            </select>
            <label className="mt-3 block text-xs font-semibold text-slate-600">Location</label>
            <input value={placeSearch} onChange={e => setPlaceSearch(e.target.value)} disabled={!country} placeholder={country ? 'Search province or city' : 'Select a country first'} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50" />
            <select value={provinceCity} onChange={e => setProvinceCity(e.target.value)} disabled={!country} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-50">
              <option value="">{!country ? 'Select a country first' : placesLoading ? 'Loading locations...' : 'All locations in this country'}</option>
              {visiblePlaces.map(item => <option key={item.id || item.name} value={item.name}>{item.name}</option>)}
            </select>
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
                const places = new Set(group.rows.map((row) => eventPlace(row).trim().toLowerCase()))
                const manyPlaces = countries.length > 1 || places.size > 1
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
                        manyPlaces,
                        summary: many ? {
                          disease: diseases.length === 1 ? diseases[0] : `${diseases.length} diseases`,
                          country: countries.length === 1 ? countries[0] : `${countries.length} countries`,
                          cases,
                          deaths,
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
                          child: true,
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
