'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Download, ExternalLink, Loader2, Play, RefreshCw } from 'lucide-react'
import { createCrawlJob, fetchCrawlJob, fetchPaginated, reprocessCrawlJob } from '@/lib/api'
import type { CrawlJobStatus, CrawlMatrixRow } from '@/types'
import type { DiseaseConcept } from '@/lib/api'
import { ASEAN11_COUNTRY_NAMES, isAseanCountryName } from '@/lib/asean-scope'

type LocationOption = { country?: string | null; name?: string | null }
const ASEAN_COUNTRIES: string[] = [...ASEAN11_COUNTRY_NAMES]

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
    const timer = window.setInterval(poll, 2500)
    void poll()
    return () => { active = false; window.clearInterval(timer) }
  }, [job?.job_id, job?.status])

  const visibleDiseases = useMemo(() => {
    const query = diseaseSearch.trim().toLowerCase()
    return diseases.filter(item => !query || `${item.canonical_name} ${item.ontology_code || ''}`.toLowerCase().includes(query)).slice(0, 40)
  }, [diseases, diseaseSearch])

  function toggleDisease(id: string) {
    setSelectedDiseases(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }

  async function startCrawl() {
    if (!selectedDiseases.length) return toast.error('Select at least one disease from the ICD-11 master')
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
    const headers = ['No.', 'Crawling Date', 'Diseases', 'Region', 'Country', 'Province', 'City', 'Province / City Case', 'Article Date', 'Date Case', 'Number of Cases', 'Number of Deaths', 'Latitude', 'Longitude', 'Source Type']
    const values = rows.map((row, index) => [index + 1, row.crawling_date, row.disease_name, row.region, row.country, row.province || '', row.city || '', row.province_city_case, row.article_date, row.date_case, row.number_of_cases, row.number_of_deaths, row.latitude, row.longitude, row.source_type])
    if (format === 'json') return download(`crawl-matrix-${job?.job_id}.json`, JSON.stringify(rows, null, 2), 'application/json')
    download(`crawl-matrix-${job?.job_id}.csv`, '\ufeff' + [headers, ...values].map(row => row.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8')
  }

  const statusLabel = job?.status === 'processing' ? 'Fetching and analyzing' : job?.status === 'waiting_for_collector' ? 'Waiting for service' : job?.status || 'Not started'

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
            <p className="mt-1 text-xs text-slate-500">Run an on-demand crawl using active WHO ICD-11 diseases and review validated location, date, case, death, source, and evidence fields.</p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-[#0060A9]">{statusLabel}</span>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr_1fr]">
          <div>
            <label className="text-xs font-semibold text-slate-600">ICD-11 disease master</label>
            <input value={diseaseSearch} onChange={e => setDiseaseSearch(e.target.value)} placeholder="Search disease name or ICD-11 code" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
            <div className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {loadingMaster ? <span className="text-xs text-slate-400">Loading disease master...</span> : visibleDiseases.map(item => (
                <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-50">
                  <input type="checkbox" checked={selectedDiseases.includes(item.id)} onChange={() => toggleDisease(item.id)} />
                  <span className="font-medium text-slate-700">{item.canonical_name}</span><span className="ml-auto text-[10px] text-slate-400">{item.ontology_code || 'ICD-11'}</span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">{selectedDiseases.length} disease(s) selected — Start stays disabled until at least one ICD-11 disease is checked.</p>
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
        <div className="overflow-x-auto"><table className="min-w-[1250px] w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr>{['No.', 'Crawl Date', 'Diseases', 'Region', 'Country', 'Province', 'City', 'Province / City Case', 'Article Date', 'Case Date', 'Cases', 'Deaths', 'Latitude', 'Longitude', 'Source Type'].map(header => <th key={header} className="whitespace-nowrap px-3 py-3 font-semibold">{header}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{job.rows.map((row: CrawlMatrixRow, index) => <tr key={row.id} className="align-top hover:bg-slate-50"><td className="px-3 py-3">{index + 1}</td><td className="px-3 py-3">{row.crawling_date || '-'}</td><td className="max-w-[190px] px-3 py-3 font-semibold text-slate-800">{row.disease_name}<div className="text-[10px] font-normal text-slate-400">{row.icd11_code || 'ICD-11'}</div></td><td className="px-3 py-3">{row.region || '-'}</td><td className="px-3 py-3 font-semibold">{row.country}</td><td className="px-3 py-3">{row.province || '-'}</td><td className="px-3 py-3">{row.city || '-'}</td><td className="max-w-[180px] px-3 py-3">{row.province_city_case || '-'}</td><td className="px-3 py-3">{row.article_date || '-'}</td><td className="max-w-[190px] px-3 py-3">{row.date_case || '-'}</td><td className="px-3 py-3 font-bold text-slate-800">{row.number_of_cases.toLocaleString('en-US')}</td><td className="px-3 py-3 font-bold text-red-600">{row.number_of_deaths.toLocaleString('en-US')}</td><td className="px-3 py-3">{row.latitude ?? '-'}</td><td className="px-3 py-3">{row.longitude ?? '-'}</td><td className="px-3 py-3">{row.source_type || '-'}<div className="mt-1 text-[10px] text-slate-400">{row.source_name || ''}</div><details className="mt-1"><summary className="cursor-pointer text-[#0060A9]">Evidence</summary><p className="mt-1 min-w-[220px] whitespace-normal text-slate-600">{row.evidence || 'Needs review'}</p>{row.source_url && <a href={row.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[#0060A9] hover:underline">Article <ExternalLink className="h-3 w-3" /></a>}</details></td></tr>)}</tbody></table></div>
        {!job.rows.length && !['queued', 'processing', 'waiting_for_collector'].includes(job.status) && <div className="p-8 text-center text-sm text-slate-400">No validated rows matched the filters. Try a broader country or date range.</div>}
      </div>}
    </section>
  )
}
