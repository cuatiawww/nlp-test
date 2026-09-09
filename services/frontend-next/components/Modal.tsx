'use client'

import { ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/LanguageContext'

export default function Modal({
  open,
  title,
  children,
  onClose,
  maxWidth = 'max-w-lg',
}: {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
  maxWidth?: string
}) {
  const { t } = useTranslation()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  if (!open || !mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-all duration-300 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidth} max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-xl transition-all duration-300 animate-in zoom-in-95 overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0 bg-slate-50/50">
          <h2 className="text-sm font-bold uppercase tracking-[0.04em] text-slate-900">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-4 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
