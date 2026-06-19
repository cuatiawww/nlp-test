'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Globe, MapPin, MapPinned } from 'lucide-react'

type FilterItem = {
  id: string
  icon: 'globe' | 'pin' | 'map'
  defaultValue: string
  options: Array<{ value: string; label: string }>
}

const filterData: FilterItem[] = [
  {
    id: 'cakupan',
    icon: 'globe',
    defaultValue: 'nasional',
    options: [
      { value: 'nasional', label: 'Nasional' },
      { value: 'regional-1', label: 'Regional 1' },
      { value: 'regional-2', label: 'Regional 2' },
    ],
  },
  {
    id: 'provinsi',
    icon: 'pin',
    defaultValue: 'semua-provinsi',
    options: [
      { value: 'semua-provinsi', label: 'Semua Provinsi' },
      { value: 'jawa-barat', label: 'Jawa Barat' },
      { value: 'dki-jakarta', label: 'DKI Jakarta' },
      { value: 'jawa-tengah', label: 'Jawa Tengah' },
    ],
  },
  {
    id: 'kabkota',
    icon: 'map',
    defaultValue: 'semua-kabkota',
    options: [
      { value: 'semua-kabkota', label: 'Semua Kab/Kota' },
      { value: 'kota-bandung', label: 'Kota Bandung' },
      { value: 'kota-bekasi', label: 'Kota Bekasi' },
      { value: 'kota-semarang', label: 'Kota Semarang' },
    ],
  },
]

function FilterIcon({ icon }: { icon: FilterItem['icon'] }) {
  if (icon === 'globe') return <Globe className="h-5 w-5 text-[#1f1f1f] sm:h-6 sm:w-6" />
  if (icon === 'pin') return <MapPin className="h-5 w-5 text-[#1f1f1f] sm:h-6 sm:w-6" />
  return <MapPinned className="h-5 w-5 text-[#1f1f1f] sm:h-6 sm:w-6" />
}

export default function FilterDropdownBar() {
  const [selected, setSelected] = useState<Record<string, string>>(
    Object.fromEntries(filterData.map((f) => [f.id, f.defaultValue]))
  )
  const [openId, setOpenId] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(event.target as Node)) setOpenId(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={rootRef} className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">
      {filterData.map((filter) => {
        const activeValue = selected[filter.id]
        const activeOption = filter.options.find((opt) => opt.value === activeValue) ?? filter.options[0]
        const isOpen = openId === filter.id

        return (
          <div key={filter.id} className="relative">
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : filter.id)}
              className="group flex h-[52px] w-full items-center justify-between rounded-2xl border border-[#b9dedd] bg-white px-3.5 transition-all hover:border-[#17b7b2] hover:shadow-[0_8px_20px_rgba(23,183,178,0.16)] focus:outline-none focus:ring-2 focus:ring-[#75d7d4] sm:h-[58px] sm:px-4"
            >
              <span className="flex items-center gap-3">
                <FilterIcon icon={filter.icon} />
                <span className="text-[14px] font-medium leading-none text-[#2f2f2f] sm:text-[18px]">{activeOption.label}</span>
              </span>
              <ChevronDown
                className={`h-5 w-5 text-[#10b9b4] transition-transform ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {isOpen && (
              <div className="absolute left-0 top-[56px] z-30 w-full overflow-hidden rounded-2xl border border-[#b9dedd] bg-white shadow-[0_16px_30px_rgba(8,110,110,0.2)] sm:top-[62px]">
                {filter.options.map((opt) => {
                  const isSelected = opt.value === activeValue
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setSelected((prev) => ({ ...prev, [filter.id]: opt.value }))
                        setOpenId(null)
                      }}
                      className={`block w-full px-4 py-2.5 text-left text-[14px] leading-none transition-colors sm:text-[16px] ${
                        isSelected
                          ? 'bg-[#e8f8f7] text-[#0d8f8a]'
                          : 'text-[#2f2f2f] hover:bg-[#e8f8f7] hover:text-[#0d8f8a]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
