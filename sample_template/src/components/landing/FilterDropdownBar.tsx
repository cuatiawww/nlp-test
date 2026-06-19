'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Globe, MapPin, MapPinned } from 'lucide-react'

export type DropdownOption = { value: string; label: string }

type FilterItem = {
  id: 'cakupan' | 'provinsi' | 'kabkota'
  icon: 'globe' | 'pin' | 'map'
  options: DropdownOption[]
}

function FilterIcon({ icon }: { icon: FilterItem['icon'] }) {
  if (icon === 'globe') return <Globe className="h-5 w-5 text-[#1f1f1f] sm:h-6 sm:w-6" />
  if (icon === 'pin') return <MapPin className="h-5 w-5 text-[#1f1f1f] sm:h-6 sm:w-6" />
  return <MapPinned className="h-5 w-5 text-[#1f1f1f] sm:h-6 sm:w-6" />
}

export default function FilterDropdownBar({
  selectedCakupan,
  selectedProvinsi,
  selectedKabupaten,
  cakupanOptions,
  provinsiOptions,
  kabupatenOptions,
  onChangeCakupan,
  onChangeProvinsi,
  onChangeKabupaten,
  disableProvinsi = false,
  disableKabupaten = false,
}: {
  selectedCakupan: string
  selectedProvinsi: string
  selectedKabupaten: string
  cakupanOptions: DropdownOption[]
  provinsiOptions: DropdownOption[]
  kabupatenOptions: DropdownOption[]
  onChangeCakupan: (value: string) => void
  onChangeProvinsi: (value: string) => void
  onChangeKabupaten: (value: string) => void
  disableProvinsi?: boolean
  disableKabupaten?: boolean
}) {
  const selected: Record<FilterItem['id'], string> = {
    cakupan: selectedCakupan,
    provinsi: selectedProvinsi,
    kabkota: selectedKabupaten,
  }
  const [openId, setOpenId] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const filterData: FilterItem[] = [
    {
      id: 'cakupan',
      icon: 'globe',
      options: cakupanOptions,
    },
    {
      id: 'provinsi',
      icon: 'pin',
      options: provinsiOptions,
    },
    {
      id: 'kabkota',
      icon: 'map',
      options: kabupatenOptions,
    },
  ]

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
        const isDisabled =
          (filter.id === 'provinsi' && disableProvinsi) ||
          (filter.id === 'kabkota' && disableKabupaten)

        return (
          <div key={filter.id} className="relative">
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => setOpenId(isOpen ? null : filter.id)}
              className={`group flex h-[52px] w-full items-center justify-between rounded-2xl border border-[#b9dedd] bg-white px-3.5 transition-all focus:outline-none focus:ring-2 focus:ring-[#75d7d4] sm:h-[58px] sm:px-4 ${
                isDisabled
                  ? 'cursor-not-allowed opacity-55'
                  : 'hover:border-[#17b7b2] hover:shadow-[0_8px_20px_rgba(23,183,178,0.16)]'
              }`}
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
                        if (filter.id === 'cakupan') onChangeCakupan(opt.value)
                        if (filter.id === 'provinsi') onChangeProvinsi(opt.value)
                        if (filter.id === 'kabkota') onChangeKabupaten(opt.value)
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
