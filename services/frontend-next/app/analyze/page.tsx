'use client'

import { useState } from 'react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { analyzeUrl } from '@/lib/api'
import AnalyzeResultCard from '@/components/AnalyzeResultCard'
import AseanMap from '@/components/AseanMap'
import type { AnalyzeResponse } from '@/types'
import { toast } from 'sonner'
import {
  Search, Globe, MapPin, Bug, Activity, Heart, MessageSquare,
  AlertTriangle, Shield, Languages, Users, Skull, TrendingUp,
  FileText, ExternalLink, CheckCircle, Loader2, Calendar
} from 'lucide-react'

export default function AnalyzePage() {
  const { t, translateDisease } = useTranslation()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [error, setError] = useState('')

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

  async function handleSubmit() {
    if (!url.trim()) {
      toast.error(t('pages.analyze.urlRequired'))
      return
    }
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const data = await analyzeUrl(url.trim())
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
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50"
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
          <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
          <p className="mt-3 text-sm">{t('pages.analyze.analyzing')}</p>
        </div>
      )}

      {result && (
        <div className="mt-8 space-y-6">
          <h2 className="text-base font-bold uppercase tracking-[0.04em] text-slate-700">{t('dashboard.eventModal.title')}</h2>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-5 w-5 text-teal-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-slate-900 leading-snug">{result.title || url}</h3>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Globe className="h-3.5 w-3.5 text-slate-400" />
                    {(result as any).source_name || new URL(url).hostname}
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-semibold text-teal-800 bg-teal-50 px-2.5 py-0.5 rounded-md border border-teal-200">
                    <Calendar className="h-3.5 w-3.5 text-teal-600" />
                    <span>{t('pages.analyze.publishedDate')}: {result.published_at || '- (' + t('common.noData') + ')'}</span>
                  </span>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-teal-600 hover:text-teal-700 hover:underline font-medium"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {t('dashboard.labelOpenOriginal')}
                  </a>
                </div>

                {result.content && (
                  <div className="mt-4 rounded-lg bg-slate-50 p-4 border border-slate-200/80">
                    <div className="flex items-center gap-1.5 mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                      <FileText className="h-3.5 w-3.5 text-teal-600" />
                      <span>{t('pages.analyze.articleDescription')}</span>
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line line-clamp-4 hover:line-clamp-none transition-all cursor-pointer" title="Klik untuk melihat seluruh cuplikan teks berita">
                      {result.content}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <AnalyzeResultCard
              icon={<Bug className="h-4 w-4" />}
              label={t('pages.analyze.diseaseClassification')}
              value={translateDisease(result.disease_classification) || '-'}
              source={result.sources?.disease_classification || result.sources?.disease || ''}
            />

            <AnalyzeResultCard
              icon={<Calendar className="h-4 w-4" />}
              label={t('pages.analyze.publishedDate')}
              value={
                <span className="font-semibold text-slate-900">
                  {result.published_at || '- (' + t('common.noData') + ')'}
                </span>
              }
              source={result.sources?.published_at || ''}
            />

            <AnalyzeResultCard
              icon={<MapPin className="h-4 w-4" />}
              label={t("dashboard.labelLocation")}
              value={
                <div className="space-y-1">
                  <div className="font-semibold text-slate-900">
                    {result.location_name || '-'}
                    {result.country && <span className="ml-1 text-xs text-slate-500 font-normal">({result.country})</span>}
                  </div>
                  {result.locations && result.locations.length > 1 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {result.locations
                        .filter((l) => l.name !== result.location_name)
                        .slice(0, 6)
                        .map((loc, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200"
                            title={`Lat: ${loc.latitude?.toFixed(4)}, Lon: ${loc.longitude?.toFixed(4)}`}
                          >
                            <MapPin className="h-2.5 w-2.5 text-teal-600" />
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
              source={result.sources?.location_name || ''}
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
              source={result.sources?.case_count || ''}
            />

            <AnalyzeResultCard
              icon={<MessageSquare className="h-4 w-4" />}
              label={t("dashboard.labelSentiment")}
              value={sentimentBadge(result.sentiment)}
              source={result.sources?.sentiment || ''}
            />

            <AnalyzeResultCard
              icon={<Activity className="h-4 w-4" />}
              label={t("dashboard.labelEventType")}
              value={
                <span className="capitalize">{result.event_type?.replace(/_/g, ' ') || '-'}</span>
              }
              source={result.sources?.event_type || ''}
            />

            <AnalyzeResultCard
              icon={<TrendingUp className="h-4 w-4" />}
              label={t('pages.analyze.healthRelevance')}
              value={relevanceBadge(result.relevance_score)}
              source={result.sources?.relevance_score || ''}
            />

            <AnalyzeResultCard
              icon={<AlertTriangle className="h-4 w-4" />}
              label={t('pages.analyze.outbreakAlert')}
              value={alertBadge(result.outbreak_alert)}
              source={result.sources?.outbreak_alert || ''}
            />

            <AnalyzeResultCard
              icon={<Shield className="h-4 w-4" />}
              label={t("dashboard.labelCredibility")}
              value={
                <span>
                  {result.source_credibility != null ? `${(result.source_credibility * 100).toFixed(0)}%` : '-'}
                </span>
              }
              source={result.sources?.source_credibility || ''}
            />

            <AnalyzeResultCard
              icon={<Heart className="h-4 w-4" />}
              label={t('pages.analyze.healthRelated')}
              value={healthBadge(result.is_health_related)}
              source={result.sources?.is_health_related || ''}
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
                <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs leading-relaxed text-slate-500">{result.sources?.symptoms || ''}</p>
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
                <p className="mt-0.5 text-xs text-slate-400">{result.sources?.language || ''}</p>
              </div>
              {result.disease_extracted && result.disease_extracted.length > 0 && (
                <div>
                  <span className="text-xs text-slate-500">{t('pages.analyze.diseaseKeyword')}</span>
                  <p className="text-sm font-semibold text-slate-900">{result.disease_extracted.join(', ')}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{result.sources?.disease_extracted || ''}</p>
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
        </div>
      )}
    </div>
  )
}
