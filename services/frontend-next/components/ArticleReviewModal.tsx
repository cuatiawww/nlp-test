'use client'

import React, { useState, useEffect, useMemo } from 'react'
import {
  X,
  ExternalLink,
  CheckCircle2,
  Clock,
  Sparkles,
  FileText,
  Loader2,
  Calendar,
  Radio,
  Globe,
  Activity,
  MapPin,
  Save,
  Edit3,
  Bug,
  ShieldCheck,
  Check,
  RotateCcw,
  Quote
} from 'lucide-react'
import { toast } from 'sonner'
import { markArticleReviewed, submitNLPCorrection } from '@/lib/api'
import CountryFlag from '@/components/CountryFlag'

export interface ReviewTarget {
  id?: string | null
  eventId?: string | null
  rawReportId?: string | null
  title?: string | null
  url?: string | null
  summary?: string | null
  content?: string | null
  snippet?: string | null
  evidence?: string | null
  disease?: string | null
  country?: string | null
  region?: string | null
  locationName?: string | null
  province?: string | null
  city?: string | null
  latitude?: number | null
  longitude?: number | null
  cases?: number | null
  deaths?: number | null
  language?: string | null
  crawlingDate?: string | null
  articleDate?: string | null
  dateCase?: string | null
  eventType?: string | null
  outbreakAlert?: boolean | null
  sourceType?: string | null
  sourceName?: string | null
  confidence?: number | null
  casesDisplay?: string | null
  deathsDisplay?: string | null
  eventCount?: number | null
  locationCount?: number | null
  originalText?: string | null
  needsReview?: boolean | null
  children?: any[] | null
}

interface ArticleReviewModalProps {
  open: boolean
  target: ReviewTarget | null
  onClose: () => void
  onReviewed?: (identifier: string, isReviewed: boolean) => void
  onCorrected?: () => void
}

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

// ─────────────────────────────────────────────────────────────
// Sub-Modal: Event Correction Modal
// ─────────────────────────────────────────────────────────────
interface EventCorrectionModalProps {
  open: boolean
  event: any | null
  index: number
  articleTitle?: string | null
  articleUrl?: string | null
  articleContent?: string | null
  rawReportId?: string | null
  language?: string | null
  onClose: () => void
  onSave: (updatedEvent: any) => Promise<void>
}

function EventCorrectionModal({
  open,
  event,
  index,
  articleTitle,
  articleUrl,
  articleContent,
  rawReportId,
  language,
  onClose,
  onSave,
}: EventCorrectionModalProps) {
  const [submitting, setSubmitting] = useState(false)
  const [draft, setDraft] = useState({
    disease: '',
    country: '',
    region: '',
    province: '',
    city: '',
    cases: '',
    deaths: '',
    dateCase: '',
    reviewReason: '',
  })

  useEffect(() => {
    if (event) {
      setDraft({
        disease: event.disease || event.disease_classification || '',
        country: (event.country !== 'MULTI_COUNTRY' ? event.country : '') || (event.case_country !== 'MULTI_COUNTRY' ? event.case_country : '') || '',
        region: (event.region !== 'MULTI_COUNTRY' ? event.region : '') || (event.surveillance_scope !== 'MULTI_COUNTRY' ? event.surveillance_scope : '') || '',
        province: event.province || '',
        city: (event.city !== 'MULTI_COUNTRY' ? event.city : '') || (event.location_name !== 'MULTI_COUNTRY' ? event.location_name : '') || (event.province_city_case !== 'MULTI_COUNTRY' ? event.province_city_case : '') || '',
        cases: event.cases != null ? String(event.cases) : event.case_count != null ? String(event.case_count) : '',
        deaths: event.deaths != null ? String(event.deaths) : event.death_count != null ? String(event.death_count) : '',
        dateCase: event.date_case || event.article_date || event.published_at || '',
        reviewReason: '',
      })
    }
  }, [event])

  if (!open || !event) return null

  const originalDisease = event.disease || event.disease_classification || 'Unknown'
  const originalCountry = event.country || event.case_country || 'Unknown'
  const originalRegion = event.region || event.surveillance_scope || '-'
  const originalProvince = event.province || '-'
  const originalCity = event.city || event.location_name || event.province_city_case || '-'
  const originalCases = event.cases != null ? Number(event.cases) : event.case_count != null ? Number(event.case_count) : 0
  const originalDeaths = event.deaths != null ? Number(event.deaths) : event.death_count != null ? Number(event.death_count) : 0
  const originalEvidence = event.evidence || '-'

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const eventId = event.disease_event_id || event.id || null
      const fieldsToSave: Array<{ field: 'disease' | 'country' | 'location' | 'case_count' | 'death_count'; orig: string; val: string }> = []

      if (draft.disease.trim() !== originalDisease) {
        fieldsToSave.push({ field: 'disease', orig: originalDisease, val: draft.disease.trim() })
      }
      if (draft.country.trim() !== originalCountry) {
        fieldsToSave.push({ field: 'country', orig: originalCountry, val: draft.country.trim() })
      }
      const combinedLoc = [draft.city.trim(), draft.province.trim()].filter(Boolean).join(', ')
      const origCombinedLoc = [originalCity !== '-' ? originalCity : '', originalProvince !== '-' ? originalProvince : ''].filter(Boolean).join(', ')
      if (combinedLoc && combinedLoc !== origCombinedLoc) {
        fieldsToSave.push({ field: 'location', orig: origCombinedLoc, val: combinedLoc })
      }
      if (draft.cases.trim() !== String(originalCases)) {
        fieldsToSave.push({ field: 'case_count', orig: String(originalCases), val: draft.cases.trim() || '0' })
      }
      if (draft.deaths.trim() !== String(originalDeaths)) {
        fieldsToSave.push({ field: 'death_count', orig: String(originalDeaths), val: draft.deaths.trim() || '0' })
      }

      if (fieldsToSave.length > 0) {
        await Promise.all(
          fieldsToSave.map((item) =>
            submitNLPCorrection({
              event_id: eventId || undefined,
              raw_report_id: event.raw_report_id || rawReportId || undefined,
              field_name: item.field,
              original_value: item.orig,
              corrected_value: item.val,
              correction_source: 'review_modal_matrix',
              text_snippet: originalEvidence !== '-' ? originalEvidence : undefined,
              language: language || undefined,
              corrected_by: 'operator_ui',
              review_reason: draft.reviewReason.trim() || undefined,
              prediction_version: 'crawl-history-review-matrix',
              review_action: 'corrected',
            })
          )
        )
      }

      const updatedEvent = {
        ...event,
        disease: draft.disease.trim(),
        disease_classification: draft.disease.trim(),
        country: draft.country.trim(),
        case_country: draft.country.trim(),
        region: draft.region.trim(),
        surveillance_scope: draft.region.trim(),
        province: draft.province.trim(),
        city: draft.city.trim(),
        province_city_case: combinedLoc || draft.city.trim(),
        location_name: draft.city.trim() || combinedLoc,
        cases: draft.cases ? parseInt(draft.cases, 10) : 0,
        case_count: draft.cases ? parseInt(draft.cases, 10) : 0,
        deaths: draft.deaths ? parseInt(draft.deaths, 10) : 0,
        death_count: draft.deaths ? parseInt(draft.deaths, 10) : 0,
        date_case: draft.dateCase.trim() || event.date_case,
        is_corrected: true,
      }

      await onSave(updatedEvent)
      toast.success(`Event correction #${index + 1} successfully saved to AI feedback database.`)
      onClose()
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save event correction.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-base font-bold text-slate-900">
                Edit Event Record #{index + 1}
              </h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-[#0060A9] border border-blue-200">
                Event Revision
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate max-w-xl mt-0.5">
              {stripHtml(articleTitle) || 'Article Event Review'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs text-slate-800">
          {/* Baseline vs Target Highlight */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 bg-slate-50/80 p-4 rounded-xl border border-slate-200">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                Baseline NLP Prediction
              </span>
              <div className="space-y-1 text-xs">
                <div><span className="text-slate-500">Disease:</span> <strong className="text-slate-900">{originalDisease}</strong></div>
                <div><span className="text-slate-500">Country / Region:</span> <strong className="text-slate-900">{originalCountry} ({originalRegion})</strong></div>
                <div><span className="text-slate-500">Province / City:</span> <strong className="text-slate-900">{originalProvince}, {originalCity}</strong></div>
                <div><span className="text-slate-500">Cases / Deaths:</span> <span className="font-mono font-bold text-emerald-700">{originalCases.toLocaleString()}</span> / <span className="font-mono font-bold text-rose-700">{originalDeaths.toLocaleString()}</span></div>
              </div>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                Evidence Excerpt
              </span>
              <div className="rounded-lg bg-white border border-slate-200 p-3 max-h-28 overflow-y-auto italic text-slate-600 text-xs leading-relaxed">
                "{originalEvidence}"
              </div>
            </div>
          </div>

          {/* Form Fields Grid */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Event Details & Corrections
              </h4>
              <span className="text-[11px] text-slate-500">
                All updated fields are recorded for this event
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Disease */}
              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-1">
                  Disease / Diagnosis <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={draft.disease}
                  onChange={(e) => setDraft((p) => ({ ...p, disease: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200"
                  placeholder="e.g. Measles, COVID-19, Pneumonia"
                />
              </div>

              {/* Country */}
              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-1">
                  Country <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={draft.country}
                  onChange={(e) => setDraft((p) => ({ ...p, country: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200"
                  placeholder="e.g. Indonesia, Bangladesh, Thailand"
                />
              </div>

              {/* Region */}
              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-1">
                  Region Scope
                </label>
                <input
                  type="text"
                  value={draft.region}
                  onChange={(e) => setDraft((p) => ({ ...p, region: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200"
                  placeholder="e.g. ASEAN, Outside ASEAN"
                />
              </div>

              {/* Province */}
              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-1">
                  Province / State (Admin Level 1)
                </label>
                <input
                  type="text"
                  value={draft.province}
                  onChange={(e) => setDraft((p) => ({ ...p, province: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200"
                  placeholder="e.g. Riau, West Java, Dhaka Division"
                />
              </div>

              {/* City / Locality */}
              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-1">
                  City / Specific Location (Admin Level 2)
                </label>
                <input
                  type="text"
                  value={draft.city}
                  onChange={(e) => setDraft((p) => ({ ...p, city: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200"
                  placeholder="e.g. Pekanbaru City, Dhaka, Bandung"
                />
              </div>

              {/* Cases */}
              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-1">
                  Case Count (Cases) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={draft.cases}
                  onChange={(e) => setDraft((p) => ({ ...p, cases: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono font-bold text-emerald-800 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200"
                  placeholder="0"
                />
              </div>

              {/* Deaths */}
              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-1">
                  Death Count (Deaths) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={draft.deaths}
                  onChange={(e) => setDraft((p) => ({ ...p, deaths: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono font-bold text-rose-800 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200"
                  placeholder="0"
                />
              </div>

              {/* Published Date */}
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-bold text-slate-700 mb-1">
                  Published Date
                </label>
                <input
                  type="text"
                  value={draft.dateCase}
                  onChange={(e) => setDraft((p) => ({ ...p, dateCase: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-800 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200"
                  placeholder="YYYY-MM-DD"
                />
              </div>
            </div>

            {/* Review Reason */}
            <div>
              <label className="block text-[10px] font-bold text-slate-700 mb-1">
                Correction Reason / Reviewer Notes (Optional)
              </label>
              <textarea
                rows={2}
                value={draft.reviewReason}
                onChange={(e) => setDraft((p) => ({ ...p, reviewReason: e.target.value }))}
                placeholder="e.g. The 1,000 figure is cumulative measles cases, not COVID-19."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200"
              />
            </div>
          </div>

          {/* Source Article Collapsible Excerpt */}
          {articleContent && (
            <details className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-[11px]">
              <summary className="font-bold text-slate-700 cursor-pointer select-none">
                View Full Source Article Text ({articleContent.length.toLocaleString()} characters)
              </summary>
              <div className="mt-2.5 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-white border border-slate-200 p-3 leading-relaxed text-slate-600 font-sans">
                {articleContent}
              </div>
            </details>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-3.5 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#0060A9] text-xs font-bold text-white hover:bg-[#004b85] shadow-xs transition disabled:opacity-50 cursor-pointer"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>{submitting ? 'Saving...' : 'Save Event Correction'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Main Modal: ArticleReviewModal
// ─────────────────────────────────────────────────────────────
export default function ArticleReviewModal({
  open,
  target,
  onClose,
  onReviewed,
  onCorrected,
}: ArticleReviewModalProps) {
  const [submitting, setSubmitting] = useState(false)
  const [isReviewed, setIsReviewed] = useState(target?.needsReview === false)
  const [eventsList, setEventsList] = useState<any[]>([])
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  // Initialize events list from target
  useEffect(() => {
    if (target) {
      setIsReviewed(target.needsReview === false)
      if (target.children && target.children.length > 0) {
        setEventsList(target.children.map((c) => ({ ...c })))
      } else {
        // Fallback to single primary event row
        setEventsList([
          {
            id: target.eventId || target.id,
            disease_event_id: target.eventId || target.id,
            raw_report_id: target.rawReportId,
            disease: target.disease,
            disease_classification: target.disease,
            country: target.country,
            region: target.region,
            province: target.province,
            city: target.city || target.locationName,
            location_name: target.locationName,
            province_city_case: target.locationName,
            latitude: target.latitude,
            longitude: target.longitude,
            cases: target.cases,
            case_count: target.cases,
            deaths: target.deaths,
            death_count: target.deaths,
            date_case: target.articleDate,
            evidence: target.evidence || target.snippet,
            confidence: target.confidence,
          },
        ])
      }
    }
  }, [target])

  // Computed totals across eventsList
  const totals = useMemo(() => {
    let totalCases = 0
    let totalDeaths = 0
    const casesByDisease: Record<string, number> = {}
    const deathsByDisease: Record<string, number> = {}

    eventsList.forEach((evt) => {
      const c = evt.cases != null ? Number(evt.cases) : evt.case_count != null ? Number(evt.case_count) : 0
      const d = evt.deaths != null ? Number(evt.deaths) : evt.death_count != null ? Number(evt.death_count) : 0
      totalCases += c
      totalDeaths += d
      const dis = evt.disease || evt.disease_classification || 'Unknown'
      casesByDisease[dis] = (casesByDisease[dis] || 0) + c
      if (d > 0) {
        deathsByDisease[dis] = (deathsByDisease[dis] || 0) + d
      }
    })

    const casesDisplay = Object.entries(casesByDisease)
      .map(([k, v]) => `${k}(${v.toLocaleString()})`)
      .join('; ')
    const deathsDisplay = Object.entries(deathsByDisease)
      .map(([k, v]) => `${k}(${v.toLocaleString()})`)
      .join('; ')

    return {
      cases: totalCases,
      deaths: totalDeaths,
      casesDisplay: casesDisplay || (target?.casesDisplay || '-'),
      deathsDisplay: deathsDisplay || (target?.deathsDisplay || '0'),
    }
  }, [eventsList, target])

  if (!open || !target) return null

  const handleToggleReviewed = async () => {
    setSubmitting(true)
    const newStatus = !isReviewed
    try {
      await markArticleReviewed({
        eventId: target.eventId || null,
        rawReportId: target.rawReportId || target.id || null,
        reviewed: newStatus,
        reviewedBy: 'epidemiologist_ui',
      })

      setIsReviewed(newStatus)
      const idKey = target.eventId || target.rawReportId || target.id || ''
      if (idKey && onReviewed) {
        onReviewed(idKey, newStatus)
      }

      toast.success(
        newStatus
          ? 'Article marked as Reviewed / Verified.'
          : 'Article marked as Needs Review.'
      )
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update review status.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdateEvent = async (updatedEvent: any) => {
    if (editingIndex == null) return
    setEventsList((prev) => {
      const next = [...prev]
      next[editingIndex] = updatedEvent
      return next
    })
    onCorrected?.()
  }

  const effectiveSummary = target.summary || target.snippet || target.evidence || 'Summary not available for this article.'
  const cleanContent = stripHtml(target.content || target.originalText)

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
        <div className="relative w-full max-w-7xl xl:max-w-[1440px] max-h-[94vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base font-bold text-slate-900">
                  Article Review & NLP Predictions Matrix
                </h2>
                {isReviewed ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Reviewed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    <Clock className="h-3.5 w-3.5" /> Needs Review
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Verify epidemiological facts, multi-disease, and multi-event extraction from NLP predictions
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5 text-slate-800 text-xs leading-relaxed">
            {/* Article Title & Source Metadata */}
            <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200">
              <h3 className="text-sm font-bold text-slate-900 leading-snug">
                {stripHtml(target.title) || 'Untitled Article'}
              </h3>
              {target.url && (
                <a
                  href={target.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#0060A9] hover:underline"
                >
                  <span className="truncate max-w-[650px]">{target.url}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                </a>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                {target.country && (
                  <span className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-md px-2 py-0.5 font-medium text-slate-700">
                    <CountryFlag countryName={target.country} size={14} />
                    <span>{target.country}</span>
                  </span>
                )}
                {target.sourceName && (
                  <span className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-md px-2 py-0.5 font-medium text-slate-700">
                    <Radio className="h-3 w-3 text-slate-400" />
                    <span>{target.sourceName}</span>
                  </span>
                )}
                {target.articleDate && (
                  <span className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-md px-2 py-0.5 font-medium text-slate-700">
                    <Calendar className="h-3 w-3 text-slate-400" />
                    <span>Published: {target.articleDate.slice(0, 10)}</span>
                  </span>
                )}
                {target.language && (
                  <span className="bg-white border border-slate-200 rounded-md px-2 py-0.5 font-medium uppercase text-[10px] text-slate-600">
                    Lang: {target.language}
                  </span>
                )}
              </div>
            </div>

            {/* AI / Article Summary Card */}
            <div className="rounded-xl border border-blue-200/90 bg-gradient-to-br from-blue-50/50 via-white to-sky-50/30 p-4 shadow-xs">
              <div className="flex items-center gap-2 text-blue-900 font-bold text-xs uppercase tracking-wider mb-2">
                <Sparkles className="h-4 w-4 text-[#0060A9]" />
                <span>Article Summary</span>
              </div>
              <p className="text-slate-700 whitespace-pre-wrap leading-relaxed text-xs">
                {effectiveSummary}
              </p>
            </div>

            {/* Aggregated Totals Card */}
            <section className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-indigo-900">
                    Article Totals (Agregasi Otomatis Seluruh Event)
                  </h4>
                  <p className="mt-0.5 text-[10px] text-indigo-900/60">
                    Nilai dihitung secara otomatis dari seluruh dekomposisi event di bawah.
                  </p>
                </div>
                <span className="rounded-full border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-bold text-indigo-700">
                  {eventsList.length} Event Terdekomposisi
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <span className="block text-[10px] font-medium text-slate-500">Total Cases</span>
                  <span className="mt-0.5 block font-mono text-sm font-bold text-emerald-700">
                    {totals.cases.toLocaleString()}
                  </span>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <span className="block text-[10px] font-medium text-slate-500">Total Deaths</span>
                  <span className="mt-0.5 block font-mono text-sm font-bold text-rose-700">
                    {totals.deaths.toLocaleString()}
                  </span>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <span className="block text-[10px] font-medium text-slate-500">Cases Breakdown</span>
                  <span className="mt-0.5 block truncate text-xs font-semibold text-slate-800" title={totals.casesDisplay}>
                    {totals.casesDisplay}
                  </span>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <span className="block text-[10px] font-medium text-slate-500">Deaths Breakdown</span>
                  <span className="mt-0.5 block truncate text-xs font-semibold text-rose-700" title={totals.deathsDisplay}>
                    {totals.deathsDisplay}
                  </span>
                </div>
              </div>
            </section>

            {/* ───────────────────────────────────────────────────────────── */}
            {/* EVENT PREDICTIONS MATRIX TABLE                                */}
            {/* ───────────────────────────────────────────────────────────── */}
            <section className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
              <div className="bg-slate-50/90 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    NLP Prediction Matrix & Event Corrections ({eventsList.length} Event{eventsList.length === 1 ? '' : 's'})
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Click <strong>Edit</strong> on any event row to correct disease, country, region, province, city, cases, or deaths.
                  </p>
                </div>
              </div>

              <div className="w-full overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-600 border-b border-slate-200">
                      <th className="px-3.5 py-2.5 text-center w-10">#</th>
                      <th className="px-3.5 py-2.5 w-44">Disease</th>
                      <th className="px-3.5 py-2.5 w-40">Country & Region</th>
                      <th className="px-3.5 py-2.5 w-48">Province & City</th>
                      <th className="px-3.5 py-2.5 text-right w-24">Cases</th>
                      <th className="px-3.5 py-2.5 text-right w-24">Deaths</th>
                      <th className="px-3.5 py-2.5 w-28">Published Date</th>
                      <th className="px-3.5 py-2.5">Evidence Excerpt</th>
                      <th className="px-3.5 py-2.5 text-center w-24">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {eventsList.map((evt, idx) => {
                      const diseaseName = evt.disease || evt.disease_classification || 'Unknown'
                      const rawCountry = evt.country || evt.case_country
                      const countryName = (rawCountry && rawCountry !== 'MULTI_COUNTRY') ? rawCountry : '-'
                      const rawRegion = evt.region || evt.surveillance_scope
                      const regionName = (rawRegion && rawRegion !== 'MULTI_COUNTRY') ? rawRegion : '-'
                      const provinceName = evt.province
                      const rawCity = evt.city || evt.location_name || evt.province_city_case
                      const cityName = (rawCity && rawCity !== 'MULTI_COUNTRY') ? rawCity : '-'
                      const casesVal = evt.cases != null ? Number(evt.cases) : evt.case_count != null ? Number(evt.case_count) : 0
                      const deathsVal = evt.deaths != null ? Number(evt.deaths) : evt.death_count != null ? Number(evt.death_count) : 0
                      const dateVal = evt.date_case || evt.article_date || evt.published_at || '-'
                      const evidenceVal = evt.evidence || '-'
                      const isCorrected = evt.is_corrected

                      return (
                        <tr
                          key={idx}
                          className={`hover:bg-blue-50/30 transition-colors ${
                            isCorrected ? 'bg-emerald-50/30' : idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'
                          }`}
                        >
                          {/* No / Badge */}
                          <td className="px-3 py-3 text-center font-mono font-bold text-slate-500">
                            {idx + 1}
                          </td>

                          {/* Disease */}
                          <td className="px-3 py-3">
                            <div className="flex items-start gap-1.5">
                              <Bug className="h-3.5 w-3.5 text-[#0060A9] shrink-0 mt-0.5" />
                              <div>
                                <span className="font-bold text-slate-900 block leading-tight">
                                  {diseaseName}
                                </span>
                                {isCorrected && (
                                  <span className="mt-1 inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                    <Check className="h-2.5 w-2.5" /> Corrected
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Country & Region */}
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1.5">
                              {countryName !== '-' && <CountryFlag countryName={countryName} size={14} />}
                              <div>
                                <span className="font-semibold text-slate-800 block">
                                  {countryName}
                                </span>
                                <span className="text-[10px] text-slate-500 font-medium">
                                  {regionName}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Province & City */}
                          <td className="px-3 py-3">
                            <div className="flex items-start gap-1.5">
                              <MapPin className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5" />
                              <div className="text-[11px]">
                                <span className="font-bold text-slate-900 block">
                                  {cityName || '-'}
                                </span>
                                {provinceName && (
                                  <span className="text-[10px] text-slate-500 block">
                                    Province: {provinceName}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Cases */}
                          <td className="px-3 py-3 text-right">
                            <span className="font-mono font-extrabold text-emerald-700 text-xs">
                              {casesVal.toLocaleString()}
                            </span>
                          </td>

                          {/* Deaths */}
                          <td className="px-3 py-3 text-right">
                            <span
                              className={`font-mono font-bold text-xs ${
                                deathsVal > 0 ? 'text-rose-700 font-extrabold' : 'text-slate-500'
                              }`}
                            >
                              {deathsVal.toLocaleString()}
                            </span>
                          </td>

                          {/* Published Date */}
                          <td className="px-3 py-3 font-mono text-[11px] text-slate-600">
                            {dateVal ? dateVal.slice(0, 10) : '-'}
                          </td>

                          {/* Evidence */}
                          <td className="px-3.5 py-3">
                            <span
                              className="block max-w-sm xl:max-w-md 2xl:max-w-xl truncate text-[11px] text-slate-600 italic cursor-help"
                              title={evidenceVal}
                            >
                              {evidenceVal !== '-' ? `"${evidenceVal}"` : '-'}
                            </span>
                          </td>

                          {/* Action Button */}
                          <td className="px-3 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => setEditingIndex(idx)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-[#0060A9] hover:bg-blue-50/60 hover:text-[#0060A9] text-[11px] font-bold transition shadow-2xs cursor-pointer"
                              title="Edit this event record"
                            >
                              <Edit3 className="h-3 w-3 text-[#0060A9]" />
                              <span>Edit</span>
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* Modal Footer Actions */}
          <div className="flex items-center justify-between px-6 py-3.5 bg-slate-50 border-t border-slate-200">
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
              {isReviewed ? (
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Verified by Epidemiologist
                </span>
              ) : (
                <span className="text-amber-700 font-medium flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> Pending Reviewer Confirmation
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                Close
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={handleToggleReviewed}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white transition shadow-2xs cursor-pointer ${
                  isReviewed
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                } disabled:opacity-50`}
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : isReviewed ? (
                  <RotateCcw className="h-3.5 w-3.5" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5" />
                )}
                <span>{isReviewed ? 'Mark Unreviewed' : 'Mark as Reviewed'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* SUB-MODAL: Event Correction Modal Popup                      */}
      {/* ───────────────────────────────────────────────────────────── */}
      {editingIndex != null && eventsList[editingIndex] && (
        <EventCorrectionModal
          open={true}
          event={eventsList[editingIndex]}
          index={editingIndex}
          articleTitle={target.title}
          articleUrl={target.url}
          articleContent={cleanContent || effectiveSummary}
          rawReportId={target.rawReportId}
          language={target.language}
          onClose={() => setEditingIndex(null)}
          onSave={handleUpdateEvent}
        />
      )}
    </>
  )
}
