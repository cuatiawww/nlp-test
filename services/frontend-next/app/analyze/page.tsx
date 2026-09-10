'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { analyzeUrl } from '@/lib/api'
import AnalyzeResultCard from '@/components/AnalyzeResultCard'
import Modal from '@/components/Modal'
import AseanMap from '@/components/AseanMap'
import type { AnalyzeResponse } from '@/types'
import { toast } from 'sonner'
import {
  Search, Globe, MapPin, Bug, Activity, Heart, MessageSquare,
  AlertTriangle, Shield, Languages, Users, Skull, TrendingUp,
  FileText, ExternalLink, Layers, CheckCircle, Loader2, Calendar
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

export default function AnalyzePage() {
  const { t, translateDisease } = useTranslation()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [error, setError] = useState('')
  const [partial, setPartial] = useState<{content?: string; job_id?: string} | null>(null)
  const [diseaseMatrixOpen, setDiseaseMatrixOpen] = useState(false)

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

  function alertBadge(alert: boolean) {
    return alert
      ? <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-600">🔴 {t('common.yes')}</span>
      : <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">{t('common.no')}</span>
  }

  function healthBadge(h?: boolean | null) {
    if (h === true) return <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">✅ {t('common.yes')}</span>
    if (h === false) return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-600">{t('common.no')}</span>
    return <span className="text-xs text-slate-400">-</span>
  }

  async function handleSubmit(value = url.trim()) {
    if (!value) {
      toast.error(t('pages.analyze.urlRequired'))
      return
    }
    setLoading(true)
    setError('')
    setResult(null)
    setPartial(null)
    try {
      const data = await analyzeUrl(value)
      if (data.analysis_status === 'partial') {
        setPartial(data)
        setError((data.analysis_warnings || ['Analysis incomplete; please retry']).join('. '))
        toast.warning('Partial analysis retained for review')
        return
      }
      setResult(data)
      toast.success(t('pages.analyze.done'))
    } catch (e: any) {
      const msg = e?.message || t('pages.analyze.failed')
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
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
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder={t('pages.analyze.placeholder')}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <button
          onClick={() => handleSubmit()}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl bg-[#0060A9] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#004b85] disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {loading ? t('pages.analyze.analyzing') : t('pages.analyze.submit')}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="mt-8 flex flex-col items-center justify-center py-16 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-[#0060A9]" />
          <p className="mt-3 text-sm">{t('pages.analyze.analyzing')}</p>
        </div>
      )}

      {partial && (
        <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-semibold">Source retained — analysis needs review</h2>
          <p className="text-xs">Job: {partial.job_id}</p>
          <p className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-sm">{partial.content}</p>
        </section>
      )}
      {result && (
        <div className="mt-8 space-y-6">
          <h2 className="text-base font-bold uppercase tracking-[0.04em] text-slate-700">{t('dashboard.eventModal.title')}</h2>

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

                {result.content && (
                  <div className="mt-4 rounded-lg bg-slate-50 p-4 border border-slate-200/80">
                    <div className="flex items-center gap-1.5 mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                      <FileText className="h-3.5 w-3.5 text-[#0060A9]" />
                      <span>{t('pages.analyze.articleDescription')}</span>
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line line-clamp-4 hover:line-clamp-none transition-all cursor-pointer" title="Click to view full news article excerpt">
                      {result.content}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {(() => {
              const subEvents = (result as any)?.sub_events || []
              const diseaseExtracted = result?.disease_extracted || []
              const diseaseTopics = uniqueDiseaseLabels([
                result?.disease_classification,
                ...diseaseExtracted,
              ])
              const hasMultiDisease = diseaseTopics.length > 1
              const indicatedCount = diseaseTopics.length

              return (
                <AnalyzeResultCard
                  icon={<Bug className="h-4 w-4" />}
                  label={t('pages.analyze.diseaseClassification')}
                  value={
                    <div className="space-y-1">
                      <span className="font-bold text-slate-900">{translateDisease(result.disease_classification) || '-'}</span>
                      {hasMultiDisease && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-[#0060A9] ring-1 ring-inset ring-[#0060A9]/20">
                            <Layers className="h-2.5 w-2.5 text-[#0060A9]" />
                            +{indicatedCount - 1} Penyakit Lain Terindikasi
                          </span>
                        </div>
                      )}
                    </div>
                  }
                  source={getSource('disease_classification', result.sources?.disease_classification || result.sources?.disease)}
                  onClick={hasMultiDisease ? () => setDiseaseMatrixOpen(true) : undefined}
                  actionBadge={
                    hasMultiDisease ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-[#0060A9] ring-1 ring-blue-200">
                        <Layers className="h-2.5 w-2.5" />
                        Matriks
                      </span>
                    ) : undefined
                  }
                  actionHint={hasMultiDisease ? "Klik untuk melihat matriks klasifikasi" : undefined}
                />
              )
            })()}

            <AnalyzeResultCard
              icon={<Calendar className="h-4 w-4" />}
              label={t('pages.analyze.publishedDate')}
              value={
                <span className="font-semibold text-slate-900">
                  {result.published_at || '-'}
                </span>
              }
              source={getSource('published_at', result.sources?.published_at)}
            />

            <AnalyzeResultCard
              icon={<MapPin className="h-4 w-4" />}
              label={t("dashboard.labelLocation")}
              value={
                <div className="space-y-1">
                  <div>
                    <span className="font-bold text-slate-900">{result.location_name || '-'}</span>
                    {result.country && <span className="ml-1 text-xs font-normal text-slate-400">({result.country})</span>}
                  </div>
                  {result.locations && result.locations.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {result.locations
                        .filter((l) => l.name !== result.location_name)
                        .slice(0, 6)
                        .map((loc, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-[#0060A9] ring-1 ring-inset ring-[#0060A9]/20"
                            title={`Lat: ${loc.latitude?.toFixed(4)}, Lon: ${loc.longitude?.toFixed(4)}`}
                          >
                            <MapPin className="h-2.5 w-2.5 text-[#0060A9]" />
                            {loc.name}
                          </span>
                        ))}
                      {result.locations.filter((l) => l.name !== result.location_name).length > 6 && (
                        <span className="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-400">
                          +{result.locations.filter((l) => l.name !== result.location_name).length - 6}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              }
              source={getSource('location_name', result.sources?.location_name)}
            />

            <AnalyzeResultCard
              icon={<Users className="h-4 w-4" />}
              label={t("dashboard.labelTotalCases")}
              value={
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-extrabold text-slate-900">{result.case_count}</span>
                  <span className="flex items-center gap-1 text-sm font-medium text-red-500">
                    <Skull className="h-3.5 w-3.5" /> {result.death_count}
                  </span>
                </div>
              }
              source={getSource('case_count', result.sources?.case_count)}
            />

            <AnalyzeResultCard
              icon={<MessageSquare className="h-4 w-4" />}
              label={t("dashboard.labelSentiment")}
              value={sentimentBadge(result.sentiment)}
              source={getSource('sentiment', result.sources?.sentiment)}
            />

            <AnalyzeResultCard
              icon={<Activity className="h-4 w-4" />}
              label={t("dashboard.labelEventType")}
              value={
                <span className="capitalize">{result.event_type?.replace(/_/g, ' ') || '-'}</span>
              }
              source={getSource('event_type', result.sources?.event_type)}
            />

            <AnalyzeResultCard
              icon={<TrendingUp className="h-4 w-4" />}
              label={t('pages.analyze.healthRelevance')}
              value={relevanceBadge(result.relevance_score)}
              source={getSource('relevance_score', result.sources?.relevance_score)}
            />

            <AnalyzeResultCard
              icon={<AlertTriangle className="h-4 w-4" />}
              label={t('pages.analyze.outbreakAlert')}
              value={alertBadge(result.outbreak_alert)}
              source={getSource('outbreak_alert', result.sources?.outbreak_alert)}
            />

            <AnalyzeResultCard
              icon={<Shield className="h-4 w-4" />}
              label={t("dashboard.labelCredibility")}
              value={
                <span>
                  {result.source_credibility != null ? `${(result.source_credibility * 100).toFixed(0)}%` : '-'}
                </span>
              }
              source={getSource('source_credibility', result.sources?.source_credibility)}
            />

            <AnalyzeResultCard
              icon={<Heart className="h-4 w-4" />}
              label={t('pages.analyze.healthRelated')}
              value={healthBadge(result.is_health_related)}
              source={getSource('is_health_related', result.sources?.is_health_related)}
            />
          </div>

          <AseanMap result={result} hideLegend />

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
                  <p className="text-sm font-semibold text-slate-900">{result.disease_extracted.join(', ')}</p>
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

          {/* Modal Matriks Klasifikasi Penyakit & Multi-Event */}
          <Modal
            open={diseaseMatrixOpen}
            onClose={() => setDiseaseMatrixOpen(false)}
            title="Matriks Klasifikasi Penyakit & Dekomposisi Multi-Event"
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
                      Daftar seluruh penyakit, wilayah persebaran, dan rincian data kasus yang terdeteksi dari dokumen ini melalui analisis NLP & Dekomposisi Multi-Event.
                    </p>
                  </div>

                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#0060A9]">Penyakit Utama</span>
                      <p className="mt-1 text-sm font-black text-slate-900 truncate" title={result.disease_classification}>
                        {translateDisease(result.disease_classification)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Terindikasi</span>
                      <p className="mt-1 text-lg font-black text-slate-900">
                        {indicatedCount} <span className="text-xs font-normal text-slate-500">Penyakit / Event</span>
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Kasus Primer</span>
                      <p className="mt-1 text-lg font-black text-slate-900">
                        {result.case_count.toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Kematian Tercatat</span>
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
                          Matriks Pasangan Penyakit, Wilayah & Kasus
                        </h3>
                      </div>
                      <span className="text-[11px] font-medium text-slate-500">
                        {subEvents.length > 0 ? `${subEvents.length} kejadian didekomposisi` : `${diseaseTopics.length} topik teridentifikasi`}
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200/80 bg-slate-50/40 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            <th className="py-2.5 px-3.5">Penyakit</th>
                            <th className="py-2.5 px-3.5">Wilayah / Lokasi</th>
                            <th className="py-2.5 px-3.5 text-right">Kasus</th>
                            <th className="py-2.5 px-3.5 text-right">Kematian</th>
                            <th className="py-2.5 px-3.5">Peran</th>
                            <th className="py-2.5 px-3.5">Konteks / Bukti Kalimat</th>
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
                                        Utama (Primary)
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
                                      <span className="text-slate-400">Bukti kalimat tidak tersedia</span>
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
                                        Utama (Primary)
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                                        Terindikasi
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-3.5 text-slate-500 text-[11px]">
                                    {mentionEvidence ? (
                                      <div className="rounded bg-slate-50 p-2 text-[11px] italic text-slate-700 border border-slate-100 line-clamp-3 hover:line-clamp-none transition-all">
                                        &ldquo;{mentionEvidence}&rdquo;
                                      </div>
                                    ) : (
                                      <span className="text-slate-400">Bukti kalimat tidak tersedia</span>
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
                          Daftar Penyakit Kanonik Terdeteksi ({diseaseTopics.length})
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
                              {isPrimary && <span className="ml-1 text-[10px] opacity-80">(Utama)</span>}
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
                      <span>Data otomatis didekomposisi dan disimpan ke tabel disease_events</span>
                    </div>
                    <button
                      onClick={() => setDiseaseMatrixOpen(false)}
                      className="rounded-xl bg-slate-100 px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 transition cursor-pointer"
                    >
                      Tutup
                    </button>
                  </div>
                </div>
              );
            })()}
          </Modal>
        </div>
      )}
    </div>
  )
}
