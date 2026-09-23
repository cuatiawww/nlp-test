'use client'

import React, { useState } from 'react'
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
  Edit3
} from 'lucide-react'
import { toast } from 'sonner'
import { markArticleReviewed, submitNLPCorrection } from '@/lib/api'
import CountryFlag from '@/components/CountryFlag'

type EditableField = 'disease' | 'country' | 'location' | 'cases' | 'deaths'

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
  latitude?: number | null
  longitude?: number | null
  cases?: number | null
  deaths?: number | null
  language?: string | null
  crawlingDate?: string | null
  articleDate?: string | null
  eventType?: string | null
  outbreakAlert?: boolean | null
  sourceType?: string | null
  sourceName?: string | null
  confidence?: number | null
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

function ReviewValue({
  label,
  value,
  tone,
  field,
  selected,
  onClick,
}: {
  label: string
  value: string
  tone?: 'cases' | 'deaths'
  field?: EditableField
  selected?: boolean
  onClick?: (field: EditableField) => void
}) {
  const toneClass = tone === 'cases'
    ? 'text-emerald-800'
    : tone === 'deaths'
      ? 'text-rose-800'
      : 'text-slate-900'
  return (
    <button
      type="button"
      onClick={() => field && onClick?.(field)}
      className={`w-full rounded-lg border bg-white p-2.5 text-left transition ${
        selected ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-200 hover:border-emerald-300'
      } ${field ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <span className="block text-[10px] font-medium text-slate-500">{label}</span>
      <span className={`mt-0.5 block truncate text-xs font-bold ${toneClass}`}>{value}</span>
      {field ? <span className="mt-1 block text-[9px] font-medium text-emerald-700">Klik untuk koreksi</span> : null}
    </button>
  )
}

function ReviewInput({
  label,
  value,
  onChange,
  inputMode,
  active,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  inputMode?: 'numeric'
  active?: boolean
}) {
  return (
    <label className="block text-[10px] font-semibold text-slate-600">
      {label}
      <input
        type={inputMode === 'numeric' ? 'number' : 'text'}
        min={inputMode === 'numeric' ? 0 : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        className={`mt-1 w-full rounded-lg border bg-white px-2.5 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-100 ${active ? 'border-emerald-500 ring-1 ring-emerald-100' : 'border-emerald-200'}`}
      />
    </label>
  )
}

export default function ArticleReviewModal({
  open,
  target,
  onClose,
  onReviewed,
  onCorrected,
}: ArticleReviewModalProps) {
  const [submitting, setSubmitting] = useState(false)
  const [savingCorrections, setSavingCorrections] = useState(false)
  const [isReviewed, setIsReviewed] = useState(target?.needsReview === false)
  const [reviewReason, setReviewReason] = useState('')
  const [selectedField, setSelectedField] = useState<EditableField | null>(null)
  const [activeChildId, setActiveChildId] = useState<string | null>(null)

  const activeChild = React.useMemo(() => {
    if (!target || !activeChildId) return null
    return (target.children || []).find((child: any) =>
      String(child.disease_event_id || child.id || '') === activeChildId,
    ) || null
  }, [target, activeChildId])

  const currentTarget = React.useMemo<ReviewTarget | null>(() => {
    if (!target) return null
    if (!activeChild) return target
    return {
      ...target,
      eventId: activeChild.disease_event_id || activeChild.id || target.eventId,
      rawReportId: activeChild.raw_report_id || target.rawReportId,
      disease: activeChild.disease || activeChild.disease_classification || target.disease,
      country: activeChild.country || target.country,
      locationName: activeChild.province_city_case || activeChild.location_name || target.locationName,
      latitude: activeChild.latitude ?? target.latitude,
      longitude: activeChild.longitude ?? target.longitude,
      cases: activeChild.cases ?? activeChild.case_count ?? target.cases,
      deaths: activeChild.deaths ?? activeChild.death_count ?? target.deaths,
      evidence: activeChild.evidence || target.evidence,
    }
  }, [target, activeChild])
  const [draft, setDraft] = useState({
    disease: '',
    country: '',
    location: '',
    cases: '',
    deaths: '',
  })

  // Sync review status when target updates
  React.useEffect(() => {
    if (target) {
      setIsReviewed(target.needsReview === false)
      setDraft({
        disease: target.disease || '',
        country: target.country || '',
        location: target.locationName || '',
        cases: target.cases == null ? '' : String(target.cases),
        deaths: target.deaths == null ? '' : String(target.deaths),
      })
      setReviewReason('')
      setSelectedField(null)
      setActiveChildId(null)
    }
  }, [target])

  React.useEffect(() => {
    if (!currentTarget) return
    setDraft({
      disease: currentTarget.disease || '',
      country: currentTarget.country || '',
      location: currentTarget.locationName || '',
      cases: currentTarget.cases == null ? '' : String(currentTarget.cases),
      deaths: currentTarget.deaths == null ? '' : String(currentTarget.deaths),
    })
    setReviewReason('')
    setSelectedField(null)
  }, [currentTarget])

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
          ? 'Article marked as Reviewed / Read.'
          : 'Article marked as Pending Review.'
      )
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update review status.')
    } finally {
      setSubmitting(false)
    }
  }

  const saveCorrections = async () => {
    if (!currentTarget) return
    const fields = [
      ['disease', currentTarget.disease || '', draft.disease],
      ['country', currentTarget.country || '', draft.country],
      ['location', currentTarget.locationName || '', draft.location],
      ['case_count', currentTarget.cases == null ? '' : String(currentTarget.cases), draft.cases],
      ['death_count', currentTarget.deaths == null ? '' : String(currentTarget.deaths), draft.deaths],
    ] as const
    const changed = fields.filter(([, original, corrected]) => corrected.trim() !== original.trim())
    if (changed.length === 0) {
      toast.info('Belum ada perubahan nilai untuk disimpan.')
      return
    }
    if (changed.some(([, , corrected]) => !corrected.trim())) {
      toast.error('Nilai koreksi tidak boleh kosong. Gunakan 0 untuk metrik yang memang nol.')
      return
    }

    setSavingCorrections(true)
    try {
      await Promise.all(changed.map(([fieldName, originalValue, correctedValue]) =>
        submitNLPCorrection({
          event_id: currentTarget.eventId || undefined,
          raw_report_id: currentTarget.rawReportId || currentTarget.id || undefined,
          field_name: fieldName,
          original_value: originalValue,
          corrected_value: correctedValue.trim(),
          correction_source: 'review_modal',
          text_snippet: currentTarget.evidence || currentTarget.snippet || currentTarget.summary || undefined,
          language: currentTarget.language || undefined,
          corrected_by: 'operator_ui',
          review_reason: reviewReason.trim() || undefined,
          prediction_version: 'crawl-history-review',
          review_action: 'corrected',
        })
      ))
      toast.success(`${changed.length} koreksi disimpan sebagai audit human review.`)
      onCorrected?.()
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menyimpan koreksi.')
    } finally {
      setSavingCorrections(false)
    }
  }

  // Determine cleanest summary text
  const displayed = currentTarget || target
  const cleanSummary = stripHtml(target.summary)
  const cleanSnippet = stripHtml(target.snippet)
  const cleanContent = stripHtml(target.content)
  const effectiveSummary =
    cleanSummary ||
    (cleanSnippet
      ? cleanSnippet.slice(0, 500) + (cleanSnippet.length > 500 ? '...' : '')
      : null) ||
    target.evidence ||
    'No summary text available for this article.'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-[1500px] max-h-[94vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-100 text-[#0060A9]">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Article Summary
                </h2>
                {isReviewed ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    <CheckCircle2 className="h-3 w-3" /> Reviewed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    <Clock className="h-3 w-3" /> Needs Review
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Surveillance article summary and verified epidemiological indicators
              </p>
            </div>
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
          
          {/* Article Title & Source Link */}
          <div className="bg-slate-50/70 rounded-xl p-4 border border-slate-200/80">
            <h3 className="text-sm font-bold text-slate-900 leading-snug">
              {stripHtml(target.title) || 'Untitled Article'}
            </h3>
            {target.url ? (
              <a
                href={target.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#0060A9] hover:underline"
              >
                <span className="truncate max-w-[550px]">{target.url}</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              </a>
            ) : null}

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

          {/* Human review: keep the left prediction immutable and edit only the review copy. */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">NLP prediction</h4>
                <span className="text-[10px] text-slate-500">{activeChild ? 'Selected child event · read-only baseline' : 'Parent event · read-only baseline'}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <ReviewValue label="Disease" field="disease" selected={selectedField === 'disease'} onClick={setSelectedField} value={displayed.disease || 'Unknown'} />
                <ReviewValue label="Country" field="country" selected={selectedField === 'country'} onClick={setSelectedField} value={displayed.country || 'Unknown'} />
                <ReviewValue label="Location" field="location" selected={selectedField === 'location'} onClick={setSelectedField} value={[displayed.locationName, displayed.region].filter(Boolean).join(', ') || 'Not specified'} />
                <ReviewValue label="Cases" field="cases" selected={selectedField === 'cases'} onClick={setSelectedField} value={displayed.cases == null ? 'Not detected' : Number(displayed.cases).toLocaleString()} tone="cases" />
                <ReviewValue label="Deaths" field="deaths" selected={selectedField === 'deaths'} onClick={setSelectedField} value={displayed.deaths == null ? 'Not detected' : Number(displayed.deaths).toLocaleString()} tone="deaths" />
                <ReviewValue label="Confidence" value={displayed.confidence == null ? 'Not available' : `${(Number(displayed.confidence) * 100).toFixed(1)}%`} />
              </div>
              <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Evidence asli</span>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-700 whitespace-pre-wrap max-h-36 overflow-y-auto">
                  {displayed.evidence || displayed.snippet || 'Evidence asli belum tersedia pada row ini.'}
                </p>
              </div>
              {displayed.latitude != null && displayed.longitude != null ? (
                <p className="mt-3 text-[10px] font-mono text-slate-500">Coordinates: {displayed.latitude.toFixed(4)}, {displayed.longitude.toFixed(4)}</p>
              ) : null}
            </section>

            <section className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Human review / koreksi</h4>
                <Edit3 className="h-4 w-4 text-emerald-700" />
              </div>
              <div className="mb-3 rounded-lg border border-emerald-200 bg-white p-3">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Korelasi artikel sumber</span>
                {target.url ? (
                  <a href={target.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-[11px] font-semibold text-[#0060A9] hover:underline">
                    {target.url}
                  </a>
                ) : null}
                <p className="mt-1 max-h-[42vh] overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-slate-700">
                  {cleanContent || effectiveSummary}
                </p>
                {cleanContent ? <span className="mt-2 block text-[9px] text-slate-400">Full captured article · {cleanContent.length.toLocaleString()} characters</span> : null}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ReviewInput label="Disease" value={draft.disease} active={selectedField === 'disease'} onChange={(value) => setDraft((p) => ({ ...p, disease: value }))} />
                <ReviewInput label="Country" value={draft.country} active={selectedField === 'country'} onChange={(value) => setDraft((p) => ({ ...p, country: value }))} />
                <ReviewInput label="Location / city / region" value={draft.location} active={selectedField === 'location'} onChange={(value) => setDraft((p) => ({ ...p, location: value }))} />
                <ReviewInput label="Cases" value={draft.cases} active={selectedField === 'cases'} onChange={(value) => setDraft((p) => ({ ...p, cases: value }))} inputMode="numeric" />
                <ReviewInput label="Deaths" value={draft.deaths} active={selectedField === 'deaths'} onChange={(value) => setDraft((p) => ({ ...p, deaths: value }))} inputMode="numeric" />
              </div>
              <label className="block mt-3 text-[10px] font-semibold text-slate-600">
                Alasan / korelasi dengan artikel (opsional)
                <textarea value={reviewReason} onChange={(e) => setReviewReason(e.target.value)} rows={3} placeholder="Contoh: angka 4 adalah kematian, bukan total kasus." className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-2.5 py-2 text-[11px] font-normal text-slate-800 outline-none focus:border-emerald-500" />
              </label>
              <p className="mt-2 text-[10px] leading-relaxed text-emerald-900/70">Nilai kiri tetap tersimpan sebagai prediksi awal. Setiap perubahan disimpan sebagai audit correction untuk review dan dataset berikutnya.</p>
              <button type="button" onClick={() => void saveCorrections()} disabled={savingCorrections} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                {savingCorrections ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {savingCorrections ? 'Menyimpan...' : 'Simpan koreksi & audit'}
              </button>
            </section>
          </div>

          {/* Epidemiological Evidence Quote */}
          {displayed.evidence && (
            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/70">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 block mb-1">
                Extracted Epidemiological Evidence
              </span>
              <blockquote className="italic text-slate-600 border-l-2 border-blue-400 pl-3 py-0.5">
                "{displayed.evidence}"
              </blockquote>
            </div>
          )}

          {/* Multi-location children breakdown if available */}
          {target.children && target.children.length > 1 && (
            <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
              <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  Event Breakdown ({target.children.length} records)
                </span>
                <span className="text-[11px] text-slate-500 font-medium">Klik event untuk mengoreksi event tersebut</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100 text-[10px] uppercase font-semibold text-slate-500">
                      <th className="px-3 py-2">Location</th>
                      <th className="px-3 py-2">Disease</th>
                      <th className="px-3 py-2 text-right">Cases</th>
                      <th className="px-3 py-2 text-right">Deaths</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {target.children.map((child: any, idx: number) => {
                      const childEventId = child.disease_event_id || child.id
                      const childId = String(childEventId || `row-${idx}`)
                      const canEditChild = Boolean(childEventId)
                      const isActive = childId === activeChildId
                      return (
                      <tr key={childId} onClick={() => canEditChild && setActiveChildId(childId)} className={`${canEditChild ? 'cursor-pointer hover:bg-emerald-50' : 'opacity-80'} ${isActive ? 'bg-emerald-50 ring-1 ring-inset ring-emerald-300' : ''}`}>
                        <td className="px-3 py-2 font-medium text-slate-800">
                          {[child.province_city_case || child.province || child.city || child.location_name, child.country].filter(Boolean).join(', ') || '—'}
                        </td>
                        <td className="px-3 py-2 text-slate-700">{child.disease || child.disease_classification || '—'}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-700">
                          {child.cases != null ? Number(child.cases).toLocaleString() : '0'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-rose-700">
                          {child.deaths != null ? Number(child.deaths).toLocaleString() : '0'}
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer Actions */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-slate-50 border-t border-slate-200">
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            {isReviewed ? (
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Verified by surveillance reviewer
              </span>
            ) : (
              <span className="text-amber-700 font-medium flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> Awaiting reviewer confirmation
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              Close
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={handleToggleReviewed}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-bold transition shadow-xs cursor-pointer ${
                isReviewed
                  ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/20'
              }`}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Updating...</span>
                </>
              ) : isReviewed ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Mark as Unread</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                  <span>Mark as Read / Reviewed</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
