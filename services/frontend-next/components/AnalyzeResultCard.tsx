'use client'

import React from 'react'

type Props = {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  source: string
  bad?: boolean
  onClick?: () => void
  actionBadge?: React.ReactNode
  actionHint?: string
}

export default function AnalyzeResultCard({
  icon,
  label,
  value,
  source,
  bad,
  onClick,
  actionBadge,
  actionHint,
}: Props) {
  const isClickable = Boolean(onClick)

  return (
    <div
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick?.()
        }
      }}
      className={`group relative flex flex-col justify-between rounded-xl border p-4 shadow-sm transition-all duration-200 ${
        isClickable
          ? 'cursor-pointer border-blue-200 bg-white hover:border-[#0060A9] hover:shadow-md hover:ring-2 hover:ring-blue-100 active:scale-[0.99]'
          : 'border-slate-200 bg-white hover:shadow-md'
      }`}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`shrink-0 transition-colors ${isClickable ? 'text-blue-600 group-hover:text-[#0060A9]' : 'text-slate-500'}`}>
              {icon}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 truncate">
              {label}
            </span>
          </div>
          {actionBadge && <div className="shrink-0">{actionBadge}</div>}
        </div>

        <div className="mt-2 text-lg font-bold text-slate-900 leading-snug">
          {value}
        </div>
      </div>

      <div className="mt-2 pt-2 border-t border-slate-100/80">
        <div className="flex items-start gap-1.5">
          <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0060A9]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs leading-relaxed text-slate-500 truncate">{source}</p>
        </div>

        {actionHint && (
          <div className="mt-2 flex items-center justify-between text-[11px] font-semibold text-[#0060A9] group-hover:underline">
            <span>{actionHint}</span>
            <span className="text-xs transition-transform group-hover:translate-x-0.5">↗</span>
          </div>
        )}
      </div>
    </div>
  )
}
