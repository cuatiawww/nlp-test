'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { analyzeUrl } from '@/lib/api'
import AnalyzeResultCard from '@/components/AnalyzeResultCard'
import Modal from '@/components/Modal'
import AseanMap from '@/components/AseanMap'
import ArticleReviewModal, { ReviewTarget } from '@/components/ArticleReviewModal'
import { Eye } from 'lucide-react'
import type { AnalyzeResponse } from '@/types'
import { collapseAnalyzeResult } from '@/lib/multiFactDisplay.mjs'
import { isCachedAnalyzeResult } from '@/lib/analysis-job.mjs'
import { toast } from 'sonner'
import {
  Search, Globe, MapPin, Bug, Activity, Heart, MessageSquare,
  Shield, Languages, Users, Skull, TrendingUp,
  FileText, ExternalLink, Layers, CheckCircle, Loader2, Calendar,
  Database, RefreshCw, ChevronDown, ChevronRight
} from 'lucide-react'

// Disease labels can arrive from old records, keyword aliases, and WHO
// canonical names. They must share one UI identity before the matrix counts
// them as different diseases.
function diseaseIdentity(raw?: string | null): string {
  const value = (raw || '').trim().toLowerCase()
  if (!value) return ''
  if (value.includes('covid') || value.includes('coronavirus') || value.includes('sars-cov')) return 'covid-19'
  if (value.includes('dengue') || value === 'dbd' || value.includes('demam berdarah')) return 'dengue'
  if (value.includes('hand foot') || value.includes('hfmd') || value.includes('tangan kaki') || value.includes('flu singapura')) return 'hfmd'
  if (value.includes('rsv') || value.includes('syncytial')) return 'rsv'
  if (value.includes('influenza') || value === 'flu' || value.includes('flu burung') || value.includes('avian influenza')) return 'influenza'
  if (value.includes('mpox') || value.includes('monkeypox') || value.includes('cacar monyet')) return 'mpox'
  if (value.includes('malaria')) return 'malaria'
  if (value.includes('leptospiro')) return 'leptospirosis'
  if (value.includes('chikungunya')) return 'chikungunya'
  if (value.includes('cholera') || value.includes('kolera')) return 'cholera'
  if (value.includes('typhoid') || value.includes('tifoid')) return 'typhoid'
  if (value.includes('measles') || value.includes('campak')) return 'measles'
  return value.replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim()
}

function uniqueDiseaseLabels(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  values.forEach((value) => {
    const label = (value || '').trim()
    const key = diseaseIdentity(label)
    if (!label || !key || seen.has(key)) return
    seen.add(key)
    result.push(label)
  })
  return result
}

function findEvidence(result: AnalyzeResponse, disease?: string | null, location?: string | null, direct?: string | null): string {
  if (direct?.trim()) return direct.trim()

  const diseaseKey = diseaseIdentity(disease)
  const mentionEvidence = result.disease_mentions?.find((mention) =>
    diseaseIdentity(mention.canonical_name || mention.surface_form) === diseaseKey
  )?.evidence?.trim()
  if (mentionEvidence) return mentionEvidence

  const source = (result.content || '').trim()
  if (!source) return ''
  const sentences = source.split(/(?<=[.!?])\s+|\n+/).map((item) => item.trim()).filter(Boolean)
  const locationKey = (location || '').trim().toLowerCase()
  return sentences.find((sentence) =>
    (!locationKey || sentence.toLowerCase().includes(locationKey)) &&
    (!diseaseKey || diseaseIdentity(sentence).includes(diseaseKey) || /kasus|cases?|infeksi|kematian|deaths?/i.test(sentence))
  ) || ''
}

function formatCoordinate(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(4) : '-'
}

export default function AnalyzePage() {
  const { t, translateDisease } = useTranslation()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [error, setError] = useState('')
  const [partial, setPartial] = useState<{content?: string; job_id?: string} | null>(null)
  const [stage, setStage] = useState('')
  const [diseaseMatrixOpen, setDiseaseMatrixOpen] = useState(false)
  const [forceRefresh, setForceRefresh] = useState(false)
  const [matrixExpanded, setMatrixExpanded] = useState(true)
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null)

  useEffect(() => {
    const initialUrl = new URLSearchParams(window.location.search).get('url')?.trim()
    if (initialUrl) {
      setUrl(initialUrl)
      void handleSubmit(initialUrl)
    }
  }, [])

  const getSource = (key: string, rawSource?: string): string => {
    if (!rawSource) return ''
    if (
      rawSource.includes('Data diambil dari database') ||
      rawSource.includes('Data retrieved from database')
    ) {
      return t('pages.analyze.sources.cached')
    }
    const translated = t(`pages.analyze.sources.${key}`)
    if (translated && translated !== `pages.analyze.sources.${key}`) {
      return translated
    }
    return rawSource
  }

  function sentimentBadge(s?: string | null) {
    if (!s || s.toLowerCase() === 'neutral') return <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">{t('sentiment.neutral')}</span>
    if (s.toLowerCase() === 'positive') return <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">{t('sentiment.positive')}</span>
    if (s.toLowerCase() === 'negative') return <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-600">{t('sentiment.negative')}</span>
    return <span className="text-xs text-slate-400">{s}</span>
  }

  function relevanceBadge(s?: string | null) {
    if (!s || s.toLowerCase() === 'low') return <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">{t('relevance.low')}</span>
    if (s.toLowerCase() === 'high') return <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">{t('relevance.high')}</span>
    return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-600">{t('relevance.medium')}</span>
  }

  function healthBadge(h?: boolean | null) {
    if (h === true) return <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">✅ {t('common.yes')}</span>
    if (h === false) return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-600">{t('common.no')}</span>
    return <span className="text-xs text-slate-400">-</span>
  }

  const fromCache = Boolean(result && isCachedAnalyzeResult(result))

  async function handleSubmit(value = url.trim(), forceRefresh = false) {
    if (!value) {
      toast.error(t('pages.analyze.urlRequired'))
      return
    }
    setLoading(true)
    setError('')
    setResult(null)
    setPartial(null)
    setStage(forceRefresh ? 'nlp' : 'queued')
    try {
      const data = await analyzeUrl(value, {
        forceRefresh,
        onProgress: (job) => setStage(job.stage || job.status || ''),
      })
      if (data.analysis_status === 'partial') {
        setPartial(data)
        setError((data.analysis_warnings || ['Analysis incomplete; please retry']).join('. '))
        toast.warning('Partial analysis retained for review')
        return
      }
      setResult(data)
      toast.success(
        isCachedAnalyzeResult(data) ? t('pages.analyze.cachedToast') : t('pages.analyze.freshToast'),
      )
    } catch (e: any) {
      const msg = e?.message || t('pages.analyze.failed')
      setError(msg)
      if (e?.result?.content) {
        setPartial({ content: e.result.content, job_id: e.job_id })
      }
      toast.error(msg)
    } finally {
      setLoading(false)
      setStage('')
    }
  }

  return (
    <div className="px-4 md:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">{t('pages.analyze.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('pages.analyze.subtitle')}</p>
        </div>
      </div>

      <div className="mt-4 flex gap-3">
        <div className="relative flex-1">
          <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit(url.trim(), forceRefresh)}
            placeholder={t('pages.analyze.placeholder')}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <button
          onClick={() => handleSubmit(url.trim(), forceRefresh)}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl bg-[#0060A9] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#004b85] disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {loading ? t('pages.analyze.analyzing') : t('pages.analyze.submit')}
        </button>
      </div>

      <label className="mt-3 flex items-start gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={forceRefresh}
          onChange={e => setForceRefresh(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#0060A9] focus:ring-[#0060A9]"
        />
        <span>
          <span className="font-medium text-slate-800">{t('pages.analyze.forceRefresh')}</span>
          <span className="block text-xs text-slate-500">{t('pages.analyze.forceRefreshHint')}</span>
        </span>
      </label>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="mt-8 flex flex-col items-center justify-center py-16 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-[#0060A9]" />
          <p className="mt-3 text-sm">
            {stage === 'fetch'
              ? 'Fetching article…'
              : stage === 'nlp'
                ? 'Running Full NLP…'
                : t('pages.analyze.analyzing')}
          </p>
        </div>
      )}

      {partial && (
        <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-semibold">Source retained — Full NLP did not finish</h2>
          <p className="text-xs">Job: {partial.job_id}</p>
          <p className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-sm">{partial.content}</p>
          <button
            type="button"
            onClick={() => handleSubmit(url.trim(), true)}
            disabled={loading}
            className="mt-3 rounded-lg bg-[#0060A9] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            Try analysis again
          </button>
        </section>
      )}
      {result && (
        <div className="mt-8 space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold uppercase tracking-[0.04em] text-slate-700">{t('dashboard.eventModal.title')}</h2>
            {fromCache ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200">
                <Database className="h-3 w-3" />
                {t('pages.analyze.cachedBadge')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-800 ring-1 ring-emerald-200">
                <CheckCircle className="h-3 w-3" />
                {t('pages.analyze.freshBadge')}
              </span>
            )}
          </div>

          {fromCache && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 shrink-0 text-amber-700" />
                    <p className="text-sm font-bold text-amber-900">{t('pages.analyze.cachedBannerTitle')}</p>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-amber-800">{t('pages.analyze.cachedBannerBody')}</p>
                  <p className="mt-1 text-[11px] text-amber-700">{t('pages.analyze.reanalyzeNowHint')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleSubmit(url.trim(), true)}
                  disabled={loading}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#0060A9] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#004b85] disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {t('pages.analyze.reanalyzeNow')}
                </button>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-5 w-5 text-[#0060A9] shrink-0" />
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-slate-900 leading-snug">{result.title || url}</h3>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Globe className="h-3.5 w-3.5 text-slate-400" />
                    {(result as any).source_name || new URL(url).hostname}
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-semibold text-[#0060A9] bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-200">
                    <Calendar className="h-3.5 w-3.5 text-[#0060A9]" />
                    <span>{t('pages.analyze.publishedDate')}: {result.published_at || '- (' + t('common.noData') + ')'}</span>
                  </span>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[#0060A9] hover:text-[#0060A9] hover:underline font-medium"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {t('dashboard.labelOpenOriginal')}
                  </a>
                </div>

                {(result.summary || result.content) && (
                  <div className="mt-4 rounded-lg bg-slate-50 p-4 border border-slate-200/80">
                    <div className="flex items-center gap-1.5 mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                      <FileText className="h-3.5 w-3.5 text-[#0060A9]" />
                      <span>{t('pages.analyze.articleDescription')}</span>
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line line-clamp-4 hover:line-clamp-none transition-all cursor-pointer" title="Click to view full news article excerpt">
                      {result.summary || result.content}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {(() => {
            const subEvents = (result as any)?.sub_events || []
            const diseaseExtracted = result?.disease_extracted || []
            const collapsed = collapseAnalyzeResult(result)
            const diseaseTopics = uniqueDiseaseLabels([
              result?.disease_classification,
              ...diseaseExtracted,
              ...subEvents.map((evt: { disease?: string }) => evt.disease),
              ...(collapsed.diseaseDisplay ? collapsed.diseaseDisplay.split('; ') : []),
            ])
            const hasMultiDisease = diseaseTopics.length > 1
            const indicatedCount = diseaseTopics.length
            const diseaseValue = collapsed.diseaseDisplay
              ? collapsed.diseaseDisplay.split('; ').map((name) => translateDisease(name)).join('; ')
              : (translateDisease(result.disease_classification) || '-')
            const evidenceSnippet = ((result as any)?.evidence || [])[0] || ''
            const eventCountries = Array.from(new Set(
              subEvents
                .map((evt: { country?: string }) => (evt.country || '').trim())
                .filter(Boolean),
            ))
            const matrixCountry = eventCountries.length > 0
              ? eventCountries.join('; ')
              : (result.country || '-')
            const hasScopedMetrics = subEvents.length >= 2
            const matrixCases = hasScopedMetrics
              ? 'See event rows'
              : ((result as any).case_count_unknown
                ? 'unknown'
                : result.case_count != null ? result.case_count.toLocaleString() : '0')
            const matrixDeaths = hasScopedMetrics
              ? 'See event rows'
              : (result.death_count != null ? result.death_count.toLocaleString() : '0')
            const resultLatitude = (result as any)?.latitude
            const resultLongitude = (result as any)?.longitude
            const resultPrecision = eventCountries.length > 1
              ? 'multiple event locations'
              : resultLatitude != null && resultLongitude != null
                ? ((result.location_name || '').trim().toLowerCase() === (result.country || '').trim().toLowerCase()
                  ? 'country centroid'
                  : 'locality/admin')
                : 'unknown'

            const ANALYZE_COLUMNS: { key: string; label: string; width: number; sticky?: boolean }[] = [
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
            const tableMinWidth = ANALYZE_COLUMNS.reduce((sum, col) => sum + col.width, 0)

            return (
              <div className="space-y-4">
                {/* KPI Overview Pills */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3.5 shadow-xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#0060A9]">Primary Disease</span>
                    <p className="mt-1 text-sm font-black text-slate-900 truncate" title={diseaseValue}>
                      {diseaseValue}
                    </p>
                    {hasMultiDisease && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded bg-blue-100/70 px-1.5 py-0.5 text-[10px] font-semibold text-[#0060A9]">
                        <Layers className="h-2.5 w-2.5" />
                        {indicatedCount} diseases
                      </span>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 shadow-xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Location / Country</span>
                    <p className="mt-1 text-sm font-black text-slate-900 truncate" title={matrixCountry}>
                      {eventCountries.length > 1 ? matrixCountry : (result.location_name || result.province || result.country || '-')}
                    </p>
                    {eventCountries.length <= 1 && result.country && (result.location_name || result.province) !== result.country && (
                      <span className="text-[11px] text-slate-500 font-medium">({result.country})</span>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 shadow-xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Number of Cases</span>
                    <p className="mt-1 text-lg font-black text-slate-900 leading-snug truncate">
                      {matrixCases}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 shadow-xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Recorded Deaths</span>
                    <p className={`mt-1 text-lg font-black ${result.death_count > 0 ? 'text-red-600' : 'text-slate-900'} leading-snug truncate`}>
                      {matrixDeaths}
                    </p>
                  </div>
                </div>

                {/* Surveillance Extraction Matrix Table */}
                <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
                  <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bug className="h-4 w-4 text-[#0060A9]" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                        Surveillance Extraction Matrix
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      {subEvents.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setMatrixExpanded((prev) => !prev)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
                        >
                          {matrixExpanded ? (
                            <>
                              <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                              Collapse Sub-Events ({subEvents.length})
                            </>
                          ) : (
                            <>
                              <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
                              Expand Sub-Events ({subEvents.length})
                            </>
                          )}
                        </button>
                      )}
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-[#0060A9] ring-1 ring-blue-200">
                        <Layers className="h-3 w-3" />
                        {subEvents.length > 0 ? `${subEvents.length} Decomposed Events` : '1 Event'}
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="border-separate border-spacing-0 text-left text-[11px] w-full" style={{ minWidth: tableMinWidth }}>
                      <colgroup>
                        {ANALYZE_COLUMNS.map((col) => (
                          <col key={col.key} style={{ width: col.width }} />
                        ))}
                      </colgroup>
                      <thead>
                        <tr>
                          {ANALYZE_COLUMNS.map((col) => (
                            <th
                              key={col.key}
                              className={`sticky top-0 z-10 whitespace-nowrap border-b border-r border-slate-200 bg-slate-50 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 ${
                                col.sticky ? 'left-0 z-20 shadow-[2px_0_0_#e2e8f0]' : ''
                              }`}
                            >
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {/* Parent Collapsed Article Row */}
                        <tr className="hover:bg-blue-50/30 transition-colors">
                          <td className="sticky left-0 z-[1] whitespace-nowrap border-b border-r border-slate-100 bg-white px-3 py-2.5 font-bold text-slate-800 shadow-[2px_0_0_#f1f5f9]">
                            <div className="flex items-center gap-1.5">
                              {subEvents.length > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => setMatrixExpanded((prev) => !prev)}
                                  className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                  title="Toggle child events"
                                >
                                  {matrixExpanded ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-[#0060A9]" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
                                  )}
                                </button>
                              ) : null}
                              <span>1</span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap border-b border-r border-slate-100 bg-white px-3 py-2.5 text-slate-800 font-medium">
                            {matrixCountry}
                          </td>
                          <td className="whitespace-nowrap border-b border-r border-slate-100 bg-white px-3 py-2.5 text-slate-600 font-mono uppercase">
                            {result.language || '-'}
                          </td>
                          <td className="whitespace-nowrap border-b border-r border-slate-100 bg-white px-3 py-2.5 text-slate-700">
                            {url ? (
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 max-w-[180px] truncate text-[#0060A9] hover:underline"
                                title={url}
                              >
                                <ExternalLink className="h-3 w-3 shrink-0" />
                                <span className="truncate">{url}</span>
                              </a>
                            ) : '-'}
                          </td>
                          <td className="whitespace-nowrap border-b border-r border-slate-100 bg-white px-3 py-2.5 font-medium text-slate-900">
                            <span className="block max-w-[220px] truncate" title={(result as any).title || (result as any).article_title || url}>
                              {(result as any).title || (result as any).article_title || url || 'Analysis Result'}
                            </span>
                          </td>
                          <td className="whitespace-nowrap border-b border-r border-slate-100 bg-white px-3 py-2.5 font-bold text-slate-900">
                            <div className="flex items-center gap-1.5">
                              <Bug className="h-3.5 w-3.5 text-[#0060A9] shrink-0" />
                              <span className="truncate max-w-[160px]" title={diseaseValue}>{diseaseValue}</span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap border-b border-r border-slate-100 bg-white px-3 py-2.5 text-slate-800 font-medium">
                            <span className="block max-w-[150px] truncate" title={matrixCountry}>
                              {eventCountries.length > 1 ? matrixCountry : (result.location_name || result.province || result.country || '-')}
                            </span>
                          </td>
                          <td className="whitespace-nowrap border-b border-r border-slate-100 bg-white px-3 py-2.5 font-mono text-slate-600">
                            {eventCountries.length > 1 ? '-' : formatCoordinate(resultLatitude)}
                          </td>
                          <td className="whitespace-nowrap border-b border-r border-slate-100 bg-white px-3 py-2.5 font-mono text-slate-600">
                            {eventCountries.length > 1 ? '-' : formatCoordinate(resultLongitude)}
                          </td>
                          <td className="whitespace-nowrap border-b border-r border-slate-100 bg-white px-3 py-2.5 text-slate-600">
                            {resultPrecision}
                          </td>
                          <td className="whitespace-nowrap border-b border-r border-slate-100 bg-white px-3 py-2.5 text-slate-600 font-mono text-[10px]">
                            {result.published_at || '-'}
                          </td>
                          <td className="whitespace-nowrap border-b border-r border-slate-100 bg-white px-3 py-2.5 text-slate-600 font-mono text-[10px]">
                            {result.event_date_start && result.event_date_end
                              ? `${result.event_date_start} – ${result.event_date_end}`
                              : result.event_date || result.published_at || '-'}
                          </td>
                          <td className="whitespace-nowrap border-b border-r border-slate-100 bg-white px-3 py-2.5 font-extrabold text-slate-900">
                            <span className="block max-w-[160px] truncate" title={String(matrixCases)}>
                              {matrixCases}
                            </span>
                          </td>
                          <td className="whitespace-nowrap border-b border-r border-slate-100 bg-white px-3 py-2.5 font-bold">
                            <span className={`block max-w-[130px] truncate ${result.death_count > 0 ? 'text-red-600 font-extrabold' : 'text-slate-600'}`}>
                              {matrixDeaths}
                            </span>
                          </td>
                          <td className="whitespace-nowrap border-b border-r border-slate-100 bg-white px-3 py-2.5 text-slate-700 capitalize font-medium">
                            {result.event_type?.replace(/_/g, ' ') || '-'}
                          </td>
                          <td className="whitespace-nowrap border-b border-r border-slate-100 bg-white px-3 py-2.5">
                            {sentimentBadge(result.sentiment)}
                          </td>
                          <td className="whitespace-nowrap border-b border-r border-slate-100 bg-white px-3 py-2.5">
                            {relevanceBadge(result.relevance_score)}
                          </td>
                          <td className="whitespace-nowrap border-b border-r border-slate-100 bg-white px-3 py-2.5 font-mono text-slate-700 font-semibold">
                            {result.source_credibility != null ? `${(result.source_credibility * 100).toFixed(0)}%` : '-'}
                          </td>
                          <td className="whitespace-nowrap border-b border-r border-slate-100 bg-white px-3 py-2.5">
                            {healthBadge(result.is_health_related)}
                          </td>
                          <td className="whitespace-nowrap border-b border-r border-slate-100 bg-white px-3 py-2.5 text-slate-600">
                            <span className="block max-w-[220px] truncate" title={evidenceSnippet}>
                              {evidenceSnippet || '-'}
                            </span>
                          </td>
                          <td className="whitespace-nowrap border-b border-r border-slate-100 bg-white px-2.5 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => setReviewTarget({
                                eventId: (result as any)?.id,
                                rawReportId: (result as any)?.raw_report_id,
                                title: (result as any)?.title || url,
                                url: url,
                                summary: (result as any)?.summary,
                                snippet: evidenceSnippet || ((result as any)?.text || '').slice(0, 300),
                                evidence: evidenceSnippet,
                                disease: result?.disease_extracted || (result as any)?.disease,
                                country: result?.country,
                                locationName: result?.location_name,
                                cases: result?.case_count,
                                deaths: result?.death_count,
                                language: result?.language,
                                needsReview: (result as any)?.needs_review,
                              })}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition"
                              title="Review article summary & facts"
                            >
                              <Eye className="h-3 w-3 text-blue-600" />
                              <span>Review</span>
                            </button>
                          </td>
                        </tr>

                        {/* Expandable Child Decomposed Rows */}
                        {matrixExpanded && subEvents.length > 0 && subEvents.map((evt: any, sIdx: number) => {
                          const childEvtSnippet = findEvidence(
                            result,
                            evt.disease || result.disease_classification,
                            evt.location_name,
                            evt.evidence,
                          )
                          return (
                            <tr key={sIdx} className="bg-blue-50/20 hover:bg-blue-50/40 transition-colors text-slate-700">
                              <td className="sticky left-0 z-[1] whitespace-nowrap border-b border-r border-slate-100 bg-blue-50/20 px-3 py-2 pl-6 font-mono text-[10px] text-[#0060A9] font-bold shadow-[2px_0_0_#f1f5f9]">
                                1.{sIdx + 1}
                              </td>
                              <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-2 text-slate-700 font-medium">
                                {evt.country || result.country || '-'}
                              </td>
                              <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-2 text-slate-400 font-mono text-[10px]">
                                {result.language || '-'}
                              </td>
                              <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-2 text-slate-400">
                                —
                              </td>
                              <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-2 text-slate-400">
                                —
                              </td>
                              <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-2 font-bold text-slate-900">
                                <div className="flex items-center gap-1.5">
                                  <Bug className="h-3 w-3 text-[#0060A9] shrink-0" />
                                  <span>{evt.disease || result.disease_classification}</span>
                                  {evt.disease_icd11_code && (
                                    <span className="text-[9px] text-slate-400 font-mono">
                                      ({evt.disease_icd11_code})
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-2 font-semibold text-slate-800">
                                <div className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3 text-red-500 shrink-0" />
                                  <span>{evt.location_name || evt.province || evt.city || result.location_name || result.province || result.country || '-'}</span>
                                </div>
                              </td>
                              <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-2 font-mono text-slate-600">
                                {formatCoordinate(evt.latitude)}
                              </td>
                              <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-2 font-mono text-slate-600">
                                {formatCoordinate(evt.longitude)}
                              </td>
                              <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-2 text-slate-600">
                                {evt.latitude != null && evt.longitude != null
                                  ? ((evt.location_name || '').trim().toLowerCase() === (evt.country || result.country || '').trim().toLowerCase()
                                    ? 'country centroid'
                                    : 'locality/admin')
                                  : 'unknown'}
                              </td>
                              <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-2 text-slate-500 font-mono text-[10px]">
                                {result.published_at || '-'}
                              </td>
                              <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-2 text-slate-500 font-mono text-[10px]">
                                {evt.event_date || result.event_date || result.published_at || '-'}
                              </td>
                              <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-2 font-extrabold text-[#0060A9]">
                                {evt.case_count != null ? evt.case_count.toLocaleString() : '-'}
                              </td>
                              <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-2 font-bold">
                                <span className={evt.death_count > 0 ? 'text-red-600' : 'text-slate-600'}>
                                  {evt.death_count != null ? evt.death_count.toLocaleString() : '0'}
                                </span>
                              </td>
                              <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-2 text-slate-600 capitalize">
                                {evt.event_type || result.event_type || '-'}
                              </td>
                              <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-2 text-slate-400">
                                —
                              </td>
                              <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-2 text-slate-400">
                                —
                              </td>
                              <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-2 text-slate-400">
                                —
                              </td>
                              <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-2 text-slate-400">
                                —
                              </td>
                              <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-2 text-slate-600">
                                <span className="block max-w-[220px] truncate" title={childEvtSnippet || evt.evidence}>
                                  {childEvtSnippet || evt.evidence || '-'}
                                </span>
                              </td>
                              <td className="whitespace-nowrap border-b border-r border-slate-100 px-2.5 py-1.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => setReviewTarget({
                                    eventId: (evt as any)?.id || (result as any)?.id,
                                    rawReportId: (result as any)?.raw_report_id,
                                    title: (result as any)?.title || url,
                                    url,
                                    summary: (result as any)?.summary,
                                    snippet: childEvtSnippet || evt.evidence || evidenceSnippet,
                                    evidence: childEvtSnippet || evt.evidence,
                                    disease: evt.disease || result?.disease_classification,
                                    country: evt.country || result?.country,
                                    locationName: evt.location_name || result?.location_name,
                                    cases: evt.case_count,
                                    deaths: evt.death_count,
                                    language: result?.language,
                                    needsReview: evt.needs_review || (result as any)?.needs_review,
                                  })}
                                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 transition"
                                  title="Review sub-event ini"
                                >
                                  <Eye className="h-3 w-3 text-blue-600" />
                                  <span>Review</span>
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )
          })()}

          <AseanMap result={result} hideLegend />

          {(((result as { evidence?: string[] }).evidence || []).length > 0 || result.needs_review) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-slate-700">
              {result.needs_review ? (
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-800">Needs review</p>
              ) : null}
              {((result as { evidence?: string[] }).evidence || []).slice(0, 4).map((span, idx) => (
                <p key={idx} className="mt-1 text-xs leading-5 text-slate-600">“{span}”</p>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-slate-500" />
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('pages.analyze.analysisContent')}</span>
            </div>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <div><span className="text-slate-500">{t('pages.analyze.originalLanguage')}</span><p className="font-semibold">{result.language || '-'}</p></div>
              <div><span className="text-slate-500">{t('pages.analyze.translated')}</span><p className="font-semibold">{result.translated ? t('common.yes') : t('common.no')}</p></div>
              <div><span className="text-slate-500">Provider</span><p className="font-semibold">{result.translation_provider || 'none'}</p></div>
            </div>
            {result.original_location_name && <p className="mt-3 text-xs text-slate-500">{t('pages.analyze.originalLocation')}: <span className="font-semibold">{result.original_location_name}</span> → {result.location_name}</p>}
            <details className="mt-4 rounded-lg border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">{t('pages.analyze.viewOriginalContent')}</summary>
              <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{result.content}</p>
            </details>
            {result.translated_text && <details className="mt-2 rounded-lg border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">{t('pages.analyze.viewTranslatedContent')}</summary>
              <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{result.translated_text}</p>
            </details>}
          </div>

          {result.symptoms && result.symptoms.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-slate-500"><Users className="h-4 w-4" /></span>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('pages.analyze.detectedSymptoms')}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {result.symptoms.map((s, i) => (
                  <span key={i} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                    {s}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-start gap-1.5">
                <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0060A9]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs leading-relaxed text-slate-500">{getSource('symptoms', result.sources?.symptoms)}</p>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-slate-500" />
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('pages.analyze.additionalInfo')}</span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <span className="text-xs text-slate-500">{t('pages.analyze.language')}</span>
                <p className="text-sm font-semibold text-slate-900">{result.language || '-'}</p>
                <p className="mt-0.5 text-xs text-slate-400">{getSource('language', result.sources?.language)}</p>
              </div>
              {result.disease_extracted && result.disease_extracted.length > 0 && (
                <div>
                  <span className="text-xs text-slate-500">{t('pages.analyze.diseaseKeyword')}</span>
                  <p className="text-sm font-semibold text-slate-900">{result.disease_extracted.join('; ')}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{getSource('disease_extracted', result.sources?.disease_extracted)}</p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              <span className="text-sm font-semibold text-emerald-800">{t('pages.analyze.dataSaved')}</span>
            </div>
            <p className="mt-2 text-xs text-emerald-700 leading-relaxed">
              {t('pages.analyze.savedDescription')}
            </p>
            <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-emerald-600">
              <span>Event ID: <code className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono">{result.event_id}</code></span>
              <span>Raw Report ID: <code className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono">{result.raw_report_id}</code></span>
            </div>
          </div>

          {/* Disease classification and multi-event modal */}
          <Modal
            open={diseaseMatrixOpen}
            onClose={() => setDiseaseMatrixOpen(false)}
            title="Disease Classification & Multi-Event Decomposition"
            maxWidth="max-w-4xl"
          >
            {(() => {
              const subEvents = (result as any)?.sub_events || []
              const diseaseExtracted = result?.disease_extracted || []
              const diseaseTopics = uniqueDiseaseLabels([
                result?.disease_classification,
                ...diseaseExtracted,
              ])
              const indicatedCount = subEvents.length > 0 ? subEvents.length : diseaseTopics.length

              return (
                <div className="space-y-6">
                  <div>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      All diseases, affected locations, and case details detected from this source through NLP analysis and multi-event decomposition.
                    </p>
                  </div>

                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#0060A9]">Primary Disease</span>
                      <p className="mt-1 text-sm font-black text-slate-900 truncate" title={result.disease_classification}>
                        {translateDisease(result.disease_classification)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Detected</span>
                      <p className="mt-1 text-lg font-black text-slate-900">
                        {indicatedCount} <span className="text-xs font-normal text-slate-500">Disease / Event</span>
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Primary Cases</span>
                      <p className="mt-1 text-lg font-black text-slate-900">
                        {result.case_count.toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Recorded Deaths</span>
                      <p className={`mt-1 text-lg font-black ${result.death_count > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                        {result.death_count.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Matrix Table */}
                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                    <div className="border-b border-slate-100 bg-slate-50/75 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Bug className="h-4 w-4 text-[#0060A9]" />
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                          Disease, Location & Case Matrix
                        </h3>
                      </div>
                      <span className="text-[11px] font-medium text-slate-500">
                        {subEvents.length > 0 ? `${subEvents.length} decomposed event(s)` : `${diseaseTopics.length} detected topic(s)`}
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200/80 bg-slate-50/40 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            <th className="py-2.5 px-3.5">Disease</th>
                            <th className="py-2.5 px-3.5">Country / Location</th>
                            <th className="py-2.5 px-3.5 text-right">Cases</th>
                            <th className="py-2.5 px-3.5 text-right">Deaths</th>
                            <th className="py-2.5 px-3.5">Role</th>
                            <th className="py-2.5 px-3.5">Context / Evidence</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {subEvents.length > 0 ? (
                            subEvents.map((evt: any, idx: number) => {
                              // All rows may share the same disease but still
                              // represent different location events. The
                              // disease label is not a reason to mark every
                              // location as the primary event.
                              const isPrimary = idx === 0;
                              const eventEvidence = findEvidence(
                                result,
                                evt.disease || result.disease_classification,
                                evt.location_name,
                                evt.evidence,
                              );
                              return (
                                <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                                  <td className="py-3 px-3.5 font-bold text-slate-900">
                                    <div className="flex items-center gap-1.5">
                                      <Bug className="h-3.5 w-3.5 text-[#0060A9] shrink-0" />
                                      <span>{evt.disease || result.disease_classification}</span>
                                    </div>
                                    {evt.disease_icd11_code && (
                                      <span className="mt-0.5 inline-block text-[10px] text-slate-400 font-mono">
                                        ICD-11: {evt.disease_icd11_code}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-3.5 text-slate-700">
                                    <div className="flex items-center gap-1">
                                      <MapPin className="h-3 w-3 text-red-500 shrink-0" />
                                      <span className="font-semibold">{evt.location_name || result.location_name}</span>
                                      {evt.country && <span className="text-slate-400 font-normal">({evt.country})</span>}
                                    </div>
                                  </td>
                                  <td className="py-3 px-3.5 text-right">
                                    <span className="inline-flex items-center font-extrabold text-slate-900">
                                      {evt.case_count != null ? evt.case_count.toLocaleString() : '-'}
                                    </span>
                                  </td>
                                  <td className="py-3 px-3.5 text-right">
                                    <span className={`inline-flex items-center font-semibold ${evt.death_count > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                      {evt.death_count || 0}
                                    </span>
                                  </td>
                                  <td className="py-3 px-3.5">
                                    {isPrimary ? (
                                      <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                                        Primary
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-[#0060A9] ring-1 ring-blue-200">
                                        Sub-Event
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-3.5 text-slate-600 max-w-xs">
                                    {eventEvidence ? (
                                      <div className="rounded bg-slate-50 p-2 text-[11px] italic text-slate-700 border border-slate-100 line-clamp-3 hover:line-clamp-none transition-all">
                                        &ldquo;{eventEvidence}&rdquo;
                                      </div>
                                    ) : (
                                      <span className="text-slate-400">Sentence evidence is unavailable</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            diseaseTopics.map((dis: string, idx: number) => {
                              // diseaseTopics is ordered with the classified
                              // disease first, so role is positional here;
                              // aliases have already been deduplicated.
                              const isPrimary = idx === 0;
                              const mentionEvidence = findEvidence(result, dis, result.location_name);
                              return (
                                <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                                  <td className="py-3 px-3.5 font-bold text-slate-900">
                                    <div className="flex items-center gap-1.5">
                                      <Bug className="h-3.5 w-3.5 text-[#0060A9] shrink-0" />
                                      <span>{dis}</span>
                                    </div>
                                  </td>
                                  <td className="py-3 px-3.5 text-slate-700">
                                    <div className="flex items-center gap-1">
                                      <MapPin className="h-3 w-3 text-red-500 shrink-0" />
                                      <span>{result.location_name || '-'}</span>
                                    </div>
                                  </td>
                                  <td className="py-3 px-3.5 text-right font-bold text-slate-900">
                                    {isPrimary ? result.case_count.toLocaleString() : '-'}
                                  </td>
                                  <td className="py-3 px-3.5 text-right font-semibold text-slate-700">
                                    {isPrimary ? result.death_count.toLocaleString() : '-'}
                                  </td>
                                  <td className="py-3 px-3.5">
                                    {isPrimary ? (
                                      <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                                        Primary
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                                        Detected
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-3.5 text-slate-500 text-[11px]">
                                    {mentionEvidence ? (
                                      <div className="rounded bg-slate-50 p-2 text-[11px] italic text-slate-700 border border-slate-100 line-clamp-3 hover:line-clamp-none transition-all">
                                        &ldquo;{mentionEvidence}&rdquo;
                                      </div>
                                    ) : (
                                      <span className="text-slate-400">Sentence evidence is unavailable</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* All Extracted Health Keywords */}
                  {diseaseTopics.length > 0 && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                      <div className="flex items-center gap-2 mb-2.5">
                        <Activity className="h-4 w-4 text-[#0060A9]" />
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                          Canonical Diseases Detected ({diseaseTopics.length})
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {diseaseTopics.map((d: string, i: number) => {
                          const isPrimary = diseaseIdentity(d) === diseaseIdentity(result.disease_classification);
                          return (
                            <span
                              key={i}
                              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                                isPrimary
                                  ? 'bg-[#0060A9] text-white shadow-xs'
                                  : 'bg-white text-slate-700 border border-slate-200'
                              }`}
                            >
                              <Bug className="h-3 w-3" />
                              {d}
                              {isPrimary && <span className="ml-1 text-[10px] opacity-80">(Primary)</span>}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Modal Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                      <span>Data was decomposed and saved to the disease_events table</span>
                    </div>
                    <button
                      onClick={() => setDiseaseMatrixOpen(false)}
                      className="rounded-xl bg-slate-100 px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 transition cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>
              );
            })()}
          </Modal>
        </div>
      )}

      <ArticleReviewModal
        open={!!reviewTarget}
        target={reviewTarget}
        onClose={() => setReviewTarget(null)}
      />

    </div>
  )
}
