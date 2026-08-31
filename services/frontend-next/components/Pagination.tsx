'use client'

import { useTranslation } from '@/lib/i18n/LanguageContext'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function Pagination({ page, totalPages, total, onPrev, onNext, onGoTo }: {
  page: number
  totalPages: number
  total: number
  onPrev: () => void
  onNext: () => void
  onGoTo: (p: number) => void
}) {
  const { t } = useTranslation()
  if (total <= 0) return null

  const pages: (number | string)[] = []
  const pg = Math.max(1, totalPages)
  const delta = 2
  const left = Math.max(2, page - delta)
  const right = Math.min(pg - 1, page + delta)

  pages.push(1)
  if (left > 2) pages.push('...')
  for (let i = left; i <= right; i++) pages.push(i)
  if (right < pg - 1) pages.push('...')
  if (pg > 1) pages.push(pg)

  return (
    <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-3">
      <span className="text-xs text-slate-500">
        {t('common.paginationInfo', { total, page, totalPages: pg })}
      </span>
      <div className="flex items-center gap-1">
        <button onClick={onPrev} disabled={page <= 1} aria-label={t('common.prev')}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed">
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pages.map((p, i) =>
          typeof p === 'string' ? (
            <span key={`e${i}`} className="px-1 text-xs text-slate-400">...</span>
          ) : (
            <button key={p} onClick={() => onGoTo(p)}
              className={`min-w-[28px] h-7 rounded-lg px-2 text-xs font-semibold transition ${
                p === page ? 'bg-teal-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
              }`}>
              {p}
            </button>
          )
        )}
        <button onClick={onNext} disabled={page >= pg} aria-label={t('common.next')}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
