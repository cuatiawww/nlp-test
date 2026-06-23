'use client'

type Props = {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  source: string
  bad?: boolean
}

export default function AnalyzeResultCard({ icon, label, value, source, bad }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">{icon}</span>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        </div>
      </div>
      <div className="mt-2 text-lg font-bold text-slate-900">{value}</div>
      <div className="mt-1.5 flex items-start gap-1.5">
        <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs leading-relaxed text-slate-500">{source}</p>
      </div>
    </div>
  )
}
