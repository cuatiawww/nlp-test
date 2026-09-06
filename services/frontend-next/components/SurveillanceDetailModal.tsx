'use client'

import { ExternalLink, X } from 'lucide-react'
import type { OutbreakLocation } from '@/types'

type Props = {
  event: OutbreakLocation | null
  onClose: () => void
  translateDisease: (name?: string | null) => string
  numLocale?: string
}

function formatNumber(value: number | null | undefined, locale: string) {
  return Number(value ?? 0).toLocaleString(locale)
}

function formatDate(value: string | null | undefined, locale: string) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10)
  return parsed.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function SurveillanceDetailModal({
  event,
  onClose,
  translateDisease,
  numLocale = 'en-US',
}: Props) {
  if (!event) return null

  const detail = event.detail
  const detailRows: [string, string][] = [
    ['Disease', translateDisease(event.disease)],
    ['Location', `${event.location_name || '-'}, ${event.country || '-'}`],
    ['Total Cases', formatNumber(event.cases, numLocale)],
    ['Deaths', formatNumber(event.deaths, numLocale)],
    ['Event Count', formatNumber(event.event_count, numLocale)],
    ['NLP Confidence', event.confidence == null ? '-' : `${Math.round(event.confidence * 100)}%`],
    ['Event Type', detail?.event_type?.replace(/_/g, ' ') || '-'],
    ['Relevance', detail?.relevance_score || '-'],
    ['Sentiment', detail?.sentiment || '-'],
    ['Health Related', detail?.is_health_related == null ? '-' : detail.is_health_related ? 'Yes' : 'No'],
    ['Needs Review', detail?.needs_review == null ? '-' : detail.needs_review ? 'Yes' : 'No'],
    [
      'Source Credibility',
      detail?.source_credibility == null
        ? '-'
        : `${Math.round(Number(detail.source_credibility) * 100)}%`,
    ],
  ]

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <section
        className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-slate-200 bg-[#f8fbff] shadow-2xl animate-in fade-in zoom-in-95"
        onClick={(eventClick) => eventClick.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Surveillance event details"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-5 py-4 backdrop-blur-md sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#0060A9]">
              Surveillance Event Details
            </p>
            <h2 className="truncate text-lg font-black uppercase text-slate-900 sm:text-xl">
              {translateDisease(event.disease)} — {event.location_name || event.country}
            </h2>
            <p className="truncate text-xs text-slate-500">
              {detail?.source_name || detail?.source_type || 'Surveillance Pipeline'}{' '}
              • {formatDate(event.latest_date || detail?.published_at, numLocale)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50"
            aria-label="Close details"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-5 p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {detailRows.map(([label, value]) => (
              <article key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
                <p className="mt-2 break-words text-sm font-bold capitalize text-slate-800">{value}</p>
              </article>
            ))}
          </div>

          {(detail?.symptoms?.length || detail?.disease_extracted?.length) ? (
            <div className="grid gap-3 md:grid-cols-2">
              {detail?.symptoms?.length ? (
                <article className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-500">Detected Symptoms</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {detail.symptoms.map((item) => (
                      <span key={item} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                        {item}
                      </span>
                    ))}
                  </div>
                </article>
              ) : null}
              {detail?.disease_extracted?.length ? (
                <article className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-500">Extracted Health Topics</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {detail.disease_extracted.map((item) => (
                      <span key={item} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200">
                        {item}
                      </span>
                    ))}
                  </div>
                </article>
              ) : null}
            </div>
          ) : null}

          <article className="rounded-xl border border-blue-200 bg-blue-50/50 p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wider text-blue-900">Data Source</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Source Name</p>
                <p className="mt-1 text-sm font-bold text-slate-800">{detail?.source_name || '-'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Source Type</p>
                <p className="mt-1 text-sm font-bold text-slate-800">{detail?.source_type || '-'}</p>
              </div>
            </div>
            {detail?.url ? (
              <a
                href={detail.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-start gap-2 break-all border-t border-blue-100 pt-3 text-xs font-semibold leading-5 text-[#0060A9] hover:text-[#004b85] hover:underline"
              >
                <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {detail.url}
              </a>
            ) : null}
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black uppercase tracking-wider text-slate-500">Original Content</p>
              {detail?.url ? (
                <a href={detail.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-[#0060A9] hover:underline">
                  <ExternalLink className="h-3.5 w-3.5" /> Open Source
                </a>
              ) : null}
            </div>
            <p className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap text-xs leading-6 text-slate-600">
              {detail?.content || 'No source content available.'}
            </p>
          </article>
        </div>
      </section>
    </div>
  )
}
