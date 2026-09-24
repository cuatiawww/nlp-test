'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n/LanguageContext'

export default function SearchInput({ value, onChange, placeholder, id, ariaLabel }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  id?: string
  ariaLabel?: string
}) {
  const { t } = useTranslation()
  const [local, setLocal] = useState(value)

  useEffect(() => {
    setLocal(value)
  }, [value])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (local !== value) onChange(local)
    }, 300)
    return () => clearTimeout(timer)
  }, [local, value, onChange])

  return (
    <input
      id={id}
      value={local}
      onChange={e => setLocal(e.target.value)}
      placeholder={placeholder || `${t('common.search')}...`}
      aria-label={ariaLabel || placeholder || t('common.search')}
      className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-4 py-2 pl-10 text-sm placeholder-slate-400 focus:border-[#0060A9] focus:outline-none focus:ring-2 focus:ring-blue-100"
    />
  )
}
