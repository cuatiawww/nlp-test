'use client'

import { templateById, type TemplateFamily } from '@/lib/report-templates'

const FAMILY_LABEL: Record<TemplateFamily, string> = {
  mmwr: 'Epidemiological bulletin',
  sitrep: 'Situation report',
  ei: 'Epidemic intelligence',
  focus: 'Focus report',
}

export default function PublicationCover({
  templateId,
  title,
  period,
  epiLabel,
  variant = 'card',
}: {
  templateId?: string | null
  title: string
  period?: string
  epiLabel?: string
  variant?: 'card' | 'page'
}) {
  const tpl = templateById(templateId)
  const family = tpl.family
  const dark = family === 'mmwr' || family === 'ei'
  const card = variant === 'card'
  const box = card
    ? 'relative shrink-0 overflow-hidden rounded-lg border select-none flex flex-col justify-between p-2.5 w-20 h-28 sm:w-24 sm:h-32'
    : 'relative overflow-hidden rounded-2xl border p-8 sm:p-10 min-h-[280px] flex flex-col justify-between sitrep-print-page sitrep-card sitrep-major sitrep-keep'

  const style =
    family === 'mmwr'
      ? {
          background: 'linear-gradient(145deg, #021a44 0%, #063970 50%, #0060A9 100%)',
          color: '#fff',
          borderColor: 'rgba(2,26,68,0.4)',
        }
      : family === 'ei'
        ? {
            background: 'linear-gradient(145deg, #0f172a 0%, #1e3a5f 55%, #334155 100%)',
            color: '#fff',
            borderColor: 'rgba(15,23,42,0.35)',
          }
        : family === 'focus'
          ? {
              background: 'linear-gradient(145deg, #fffbeb 0%, #f8fafc 60%, #e2e8f0 100%)',
              color: '#0f172a',
              borderColor: '#e2e8f0',
            }
          : {
              background: 'linear-gradient(145deg, #ffffff 0%, #f0f6fc 55%, #dbeafe 100%)',
              color: '#0f172a',
              borderColor: '#cbd5e1',
            }

  return (
    <div className={box} style={style} aria-hidden={card ? true : undefined}>
      <div className="absolute left-0 inset-y-0 w-1 bg-black/25" />
      <div>
        <p className={`${card ? 'text-[7px]' : 'text-[11px]'} font-black uppercase tracking-[0.16em] ${dark ? 'text-sky-200' : 'text-[#0060A9]'}`}>
          ABVC · ASEAN-11
        </p>
        <p className={`${card ? 'mt-1 text-[8px]' : 'mt-2 text-sm'} font-extrabold uppercase tracking-wide`}>
          {FAMILY_LABEL[family]}
        </p>
        {!card ? (
          <h1 className="mt-4 max-w-3xl text-2xl font-black leading-tight sm:text-3xl">{title}</h1>
        ) : null}
      </div>
      <div className={`border-t ${dark ? 'border-white/25' : 'border-slate-300/80'} ${card ? 'pt-1.5' : 'pt-4'}`}>
        <p className={`${card ? 'text-[7px] line-clamp-3' : 'text-sm'} font-bold leading-tight`}>
          {card ? title : period}
        </p>
        <p className={`${card ? 'mt-1 text-[6.5px]' : 'mt-1 text-xs'} font-semibold ${dark ? 'text-sky-100' : 'text-slate-600'}`}>
          {epiLabel || period}
        </p>
      </div>
    </div>
  )
}
