'use client'

import { Info } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export type InfoData = {
  source: string
  calc: string
}

export default function InfoButton({ data }: { data: InfoData }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    <span ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center justify-center rounded-full p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-teal-600"
        aria-label="Info"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-50 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Sumber Data</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-700">{data.source}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Cara Perhitungan</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-700">{data.calc}</p>
          </div>
        </div>
      )}
    </span>
  )
}
