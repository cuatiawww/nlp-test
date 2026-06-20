'use client'

import { useEffect, useState } from 'react'

export default function SearchInput({ value, onChange, placeholder }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [local, setLocal] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      if (local !== value) onChange(local)
    }, 300)
    return () => clearTimeout(timer)
  }, [local, value, onChange])

  return (
    <input
      value={local}
      onChange={e => setLocal(e.target.value)}
      placeholder={placeholder || 'Cari...'}
      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 pl-10 text-sm placeholder-slate-400"
    />
  )
}
