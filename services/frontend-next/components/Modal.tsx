'use client'

import { ReactNode, useEffect } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/LanguageContext'

export default function Modal({ open, title, children, onClose }: {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
}) {
  const { t } = useTranslation()

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.04em] text-slate-900">{title}</h2>
          <button onClick={onClose} aria-label={t('common.close')} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-4">
          {children}
        </div>
      </div>
    </div>
  )
}
