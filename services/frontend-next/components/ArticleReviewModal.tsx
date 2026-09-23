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
  MapPin
} from 'lucide-react'
import { toast } from 'sonner'
import { markArticleReviewed } from '@/lib/api'
import CountryFlag from '@/components/CountryFlag'

export interface ReviewTarget {
  id?: string | null
  eventId?: string | null
  rawReportId?: string | null
  title?: string | null
  url?: string | null
  summary?: string | null
  snippet?: string | null
  evidence?: string | null
  disease?: string | null
  country?: string | null
  locationName?: string | null
  cases?: number | null
  deaths?: number | null
  language?: string | null
  crawlingDate?: string | null
  articleDate?: string | null
  eventType?: string | null
  outbreakAlert?: boolean | null
  sourceType?: string | null
  sourceName?: string | null
  needsReview?: boolean | null
  children?: any[] | null
}

interface ArticleReviewModalProps {
  open: boolean
  target: ReviewTarget | null
  onClose: () => void
  onReviewed?: (identifier: string, isReviewed: boolean) => void
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

export default function ArticleReviewModal({
  open,
  target,
  onClose,
  onReviewed,
}: ArticleReviewModalProps) {
  const [submitting, setSubmitting] = useState(false)
  const [isReviewed, setIsReviewed] = useState(target?.needsReview === false)

  // Sync review status when target updates
  React.useEffect(() => {
    if (target) {
      setIsReviewed(target.needsReview === false)
    }
  }, [target])

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

  // Determine cleanest summary text
  const cleanSummary = stripHtml(target.summary)
  const cleanSnippet = stripHtml(target.snippet)
  const effectiveSummary =
    cleanSummary ||
    (cleanSnippet
      ? cleanSnippet.slice(0, 500) + (cleanSnippet.length > 500 ? '...' : '')
      : null) ||
    target.evidence ||
    'No summary text available for this article.'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        
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

          {/* Structured Surveillance Findings */}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Key Epidemiological Facts
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              
              {/* Disease */}
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80">
                <span className="text-[10px] font-medium text-slate-500 block">Disease</span>
                <span className="text-xs font-bold text-slate-900 mt-0.5 block truncate">
                  {target.disease || 'Unknown'}
                </span>
              </div>

              {/* Location */}
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80">
                <span className="text-[10px] font-medium text-slate-500 block">Location</span>
                <span className="text-xs font-bold text-slate-900 mt-0.5 block truncate">
                  {[target.locationName, target.country].filter(Boolean).join(', ') || 'Not specified'}
                </span>
              </div>

              {/* Cases */}
              <div className="bg-emerald-50/60 rounded-xl p-3 border border-emerald-200/80">
                <span className="text-[10px] font-medium text-emerald-700 block">Reported Cases</span>
                <span className="text-sm font-extrabold text-emerald-900 mt-0.5 block">
                  {target.cases != null ? Number(target.cases).toLocaleString() : '0'}
                </span>
              </div>

              {/* Deaths */}
              <div className="bg-rose-50/60 rounded-xl p-3 border border-rose-200/80">
                <span className="text-[10px] font-medium text-rose-700 block">Reported Deaths</span>
                <span className="text-sm font-extrabold text-rose-900 mt-0.5 block">
                  {target.deaths != null ? Number(target.deaths).toLocaleString() : '0'}
                </span>
              </div>

            </div>
          </div>

          {/* Epidemiological Evidence Quote */}
          {target.evidence && (
            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/70">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 block mb-1">
                Extracted Epidemiological Evidence
              </span>
              <blockquote className="italic text-slate-600 border-l-2 border-blue-400 pl-3 py-0.5">
                "{target.evidence}"
              </blockquote>
            </div>
          )}

          {/* Multi-location children breakdown if available */}
          {target.children && target.children.length > 1 && (
            <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
              <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  Multiple Locations Extracted ({target.children.length} records)
                </span>
                <span className="text-[11px] text-slate-500 font-medium">Aggregated into this article</span>
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
                    {target.children.map((child: any, idx: number) => (
                      <tr key={child.id || idx} className="hover:bg-slate-50">
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
                    ))}
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
