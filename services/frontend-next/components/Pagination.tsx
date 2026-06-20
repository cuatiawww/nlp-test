'use client'

export default function Pagination({ page, totalPages, total, onPrev, onNext }: {
  page: number
  totalPages: number
  total: number
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-3">
      <span className="text-xs text-slate-500">
        Total {total} data — Halaman {page} dari {totalPages}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          disabled={page <= 1}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          « Prev
        </button>
        <button
          onClick={onNext}
          disabled={page >= totalPages}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next »
        </button>
      </div>
    </div>
  )
}
