'use client'

import { X } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from '@/lib/i18n/LanguageContext'

type DataRow = { label: string; value: string | number; extra?: string }

type Props = {
  open: boolean
  onClose: () => void
  title: string
  rows: DataRow[]
}

export default function DataModal({ open, onClose, title, rows }: Props) {
  const { t } = useTranslation()

  useEffect(() => {
    if (!open) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[3px]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="presentation"
    >
      <div
        className="flex max-h-[80vh] w-full max-w-[600px] flex-col overflow-hidden rounded-[20px] border border-[#cfe0f1] bg-[#f8fbff] shadow-[0_28px_72px_rgba(0,40,90,0.2)]"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-[#cfe0f1] bg-gradient-to-br from-[#f0f6fc] to-[#e4eef9] px-5 py-4 shrink-0">
          <h3 className="text-base font-bold uppercase tracking-[0.04em] text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/20 hover:text-slate-600 transition" aria-label={t('common.close')}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="px-3 py-2 text-left font-semibold text-slate-600">{t('common.item')}</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-600">{t('common.value')}</th>
                {rows.some(r => r.extra) && <th className="px-3 py-2 text-right font-semibold text-slate-600">{t('common.notes')}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-blue-50/50">
                  <td className="px-3 py-2 text-slate-700">{r.label}</td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-800">{r.value}</td>
                  {rows.some(x => x.extra) && <td className="px-3 py-2 text-xs text-slate-400">{r.extra ?? '-'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
