'use client'

import { useState, useRef, useEffect, type ComponentType } from 'react'
import Link from 'next/link'
import { Star } from 'lucide-react'

export type FacilityKey = 'bintang1' | 'bintang2' | 'bintang3' | 'bintang4' | 'bintang5'
type FacilityFocus = FacilityKey | 'all'

type ProvinceRow = {
  name: string
  bintang1: number
  bintang2: number
  bintang3: number
  bintang4: number
  bintang5: number
}

const rows: ProvinceRow[] = [
  { name: 'Kepulauan Riau', bintang1: 6, bintang2: 10, bintang3: 18, bintang4: 12, bintang5: 4 },
  { name: 'DKI Jakarta', bintang1: 3, bintang2: 7, bintang3: 20, bintang4: 19, bintang5: 8 },
  { name: 'Jawa Barat', bintang1: 12, bintang2: 26, bintang3: 33, bintang4: 22, bintang5: 9 },
  { name: 'Jawa Tengah', bintang1: 11, bintang2: 23, bintang3: 29, bintang4: 20, bintang5: 7 },
  { name: 'Jawa Timur', bintang1: 9, bintang2: 19, bintang3: 28, bintang4: 24, bintang5: 10 },
]

const FACILITY_KEYS: FacilityKey[] = ['bintang1', 'bintang2', 'bintang3', 'bintang4', 'bintang5']

const FACILITY_META: Record<FacilityKey, { label: string; color: string }> = {
  bintang1: { label: 'Risiko Rendah', color: '#0ea5e9' },
  bintang2: { label: 'Risiko Sedang', color: '#14b8a6' },
  bintang3: { label: 'Waspada', color: '#f59e0b' },
  bintang4: { label: 'Risiko Tinggi', color: '#f97316' },
  bintang5: { label: 'Kritis', color: '#ef4444' },
}
const FACILITY_ICON: Record<FacilityKey, ComponentType<{ className?: string }>> = {
  bintang1: Star,
  bintang2: Star,
  bintang3: Star,
  bintang4: Star,
  bintang5: Star,
}

type TooltipState = {
  visible: boolean
  x: number
  y: number
  province: string
  key: FacilityKey
  value: number
  pct: number
}

export default function FacilityProvinceSection({
  activeFacility = 'all',
}: {
  activeFacility?: FacilityFocus
}) {
  const [activeKeys, setActiveKeys] = useState<Set<FacilityKey>>(() =>
    activeFacility === 'all' ? new Set(FACILITY_KEYS) : new Set([activeFacility])
  )
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false, x: 0, y: 0, province: '', key: 'bintang3', value: 0, pct: 0,
  })
  const [panel, setPanel] = useState<{ visible: boolean; province: ProvinceRow | null }>({
    visible: false, province: null,
  })
  const [mounted] = useState(true)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanel({ visible: false, province: null })
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setPanel({ visible: false, province: null })
    }
    if (panel.visible) document.addEventListener('mousedown', handleClickOutside)
    if (panel.visible) document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [panel.visible])

  function toggleKey(key: FacilityKey) {
    setActiveKeys(prev => {
      if (prev.size === FACILITY_KEYS.length) return new Set([key])
      if (prev.has(key) && prev.size === 1) return new Set(FACILITY_KEYS)
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      if (next.size === 0) return new Set(FACILITY_KEYS)
      return next
    })
  }

  const allActive = activeKeys.size === FACILITY_KEYS.length
  const totalCampusNasional = rows.reduce((sum, row) => (
    sum + FACILITY_KEYS.reduce((subtotal, key) => subtotal + row[key], 0)
  ), 0)

  // Max total among all rows for currently active keys — determines longest bar
  const maxVisTotal = Math.max(
    ...rows.map(row =>
      FACILITY_KEYS.filter(k => activeKeys.has(k)).reduce((s, k) => s + row[k], 0)
    )
  )

  return (
    <section className="w-full bg-white pb-6">
      <div className="w-full ">

        {/* Floating tooltip */}
        {tooltip.visible && (
          <div
            className="pointer-events-none fixed z-50 rounded-xl border border-[#d7eaea] bg-white px-3 py-2 text-[12px] leading-relaxed shadow-md"
            style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}
          >
            <p className="font-semibold text-[#2f2f2f]">{tooltip.province}</p>
            <p className="text-[#4b4b4b]">
              <span
                className="mr-1.5 inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: FACILITY_META[tooltip.key].color }}
              />
              {FACILITY_META[tooltip.key].label}: <strong>{tooltip.value}</strong> ({tooltip.pct}%)
            </p>
          </div>
        )}

        {/* Detail modal */}
        {panel.visible && panel.province && (
          <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-[#0f172a]/25 backdrop-blur-[2px]"
            onClick={() => setPanel({ visible: false, province: null })}
          >
            <div
              ref={panelRef}
              className="mx-4 w-full max-w-sm rounded-[24px] border border-[#d7eaea] bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.22)]"
              style={{ animation: 'panelIn 0.28s cubic-bezier(0.34,1.56,0.64,1) both' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[#8aabab]">Total Sentinel</p>
                  <h4 className="text-[22px] font-bold text-[#2f2f2f]">{panel.province.name}</h4>
                </div>
                <button
                  onClick={() => setPanel({ visible: false, province: null })}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eff7f7] text-[#3a5050] transition hover:bg-[#d7eaea]"
                  aria-label="Tutup"
                >
                  ✕
                </button>
              </div>

              <div className="mb-5 flex items-center justify-center rounded-[14px] bg-[#eff7f7] py-4">
                <div className="text-center">
                  <p className="text-[13px] text-[#8aabab]">Total Keseluruhan</p>
                  <p className="text-[40px] font-bold leading-none text-[#0b7b86]">
                    {FACILITY_KEYS.reduce((s, k) => s + panel.province![k], 0)}
                  </p>
                  <p className="text-[12px] text-[#8aabab]">sentinel terdaftar</p>
                </div>
              </div>

              <div className="space-y-3">
                {FACILITY_KEYS.map(k => {
                  const val = panel.province![k]
                  const total = FACILITY_KEYS.reduce((s, kk) => s + panel.province![kk], 0)
                  const pct = Math.round((val / total) * 100)
                  return (
                    <div key={k}>
                      <div className="mb-1 flex items-center justify-between text-[13px]">
                        <span className="flex items-center gap-2 text-[#3a4040]">
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: FACILITY_META[k].color }} />
                          {FACILITY_META[k].label}
                        </span>
                        <span className="font-semibold text-[#2f2f2f]">
                          {val} <span className="font-normal text-[#8aabab]">({pct}%)</span>
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[#eff7f7]">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: mounted ? `${pct}%` : '0%',
                            backgroundColor: FACILITY_META[k].color,
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        <style>{`
          @keyframes panelIn {
            from { opacity: 0; transform: scale(0.9) translateY(10px); }
            to   { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}</style>

        <article className="rounded-[22px] border border-[#d7eaea] bg-white px-5 py-5 shadow-[0_10px_30px_rgba(14,119,117,0.05)] sm:px-6 sm:py-6">
          {/* Header + legend */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-[20px] font-bold uppercase leading-tight text-[#2f2f2f] sm:text-[24px]">
                Distribusi Sentinel ILI/SARI Per Provinsi
              </h3>
              <p className="mt-1 text-[13px] leading-relaxed text-[#4b4b4b] sm:text-[14px]">
                Menampilkan distribusi fasilitas sentinel ILI/SARI berdasarkan tingkat risiko per provinsi.
              </p>
              <p className="mt-2 inline-flex rounded-full bg-[#e8f6f8] px-3 py-1 text-[12px] font-semibold text-[#0b7b86]">
                Total sentinel terdaftar: {totalCampusNasional}
              </p>

            </div>

            <div className="flex flex-wrap items-center gap-2 lg:pt-1">
              {FACILITY_KEYS.map(k => {
                const isActive = activeKeys.has(k)
                const isDimmed = !allActive && !isActive
                return (
                  <button
                    key={k}
                    onClick={() => toggleKey(k)}
                    className="flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] transition-all duration-200"
                    style={{
                      borderColor: isActive || allActive ? FACILITY_META[k].color : '#d7eaea',
                      backgroundColor: isActive && !allActive ? `${FACILITY_META[k].color}18` : '#ffffff',
                      color: isActive && !allActive ? '#2e4444' : '#4a6060',
                      opacity: isDimmed ? 0.4 : 1,
                    }}
                  >
                    <span
                      className="flex h-5 w-5 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${FACILITY_META[k].color}22`, color: FACILITY_META[k].color }}
                    >
                      {(() => {
                        const Icon = FACILITY_ICON[k]
                        return <Icon className="h-3 w-3" />
                      })()}
                    </span>
                    {FACILITY_META[k].label.toUpperCase()}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Chart rows */}
          <div className="mt-6 space-y-3">
            {rows.map(row => {
              const visKeys = FACILITY_KEYS.filter(k => activeKeys.has(k))
              const visTotal = visKeys.reduce((s, k) => s + row[k], 0)
              // Bar width is proportional to the row with the highest total
              const barWidthPct = maxVisTotal > 0 ? (visTotal / maxVisTotal) * 100 : 0

              return (
                <div
                  key={row.name}
                  className="group grid cursor-pointer grid-cols-[120px_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[140px_minmax(0,1fr)]"
                  onClick={() => setPanel({ visible: true, province: row })}
                >
                  {/* Province name */}
                  <div className="text-[13px] text-[#3a4040] transition-colors group-hover:text-[#0b7b86] sm:text-[14px]">
                    {row.name}
                  </div>

                  {/* Track (full width, grey) — bar inside is proportional */}
                  <div className="relative h-10 rounded-[10px] bg-[#eff7f7] p-1">
                    {/* Proportional bar */}
                    <div
                      className="flex h-full overflow-hidden rounded-[7px] transition-[width] duration-[650ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]"
                      style={{ width: mounted ? `${barWidthPct}%` : '0%' }}
                    >
                      {visKeys.map((k, ki) => {
                        const segPct = visTotal > 0 ? (row[k] / visTotal) * 100 : 0
                        const isFirst = ki === 0
                        const isLast  = ki === visKeys.length - 1
                        return (
                          <div
                            key={k}
                            className="flex items-center justify-center overflow-hidden whitespace-nowrap text-[11px] font-medium text-white transition-[flex] duration-[650ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:brightness-110"
                            style={{
                              flex: segPct,
                              minWidth: segPct > 12 ? 26 : 0,
                              backgroundColor: FACILITY_META[k].color,
                              borderTopLeftRadius:     isFirst ? 6 : 0,
                              borderBottomLeftRadius:  isFirst ? 6 : 0,
                              borderTopRightRadius:    isLast  ? 6 : 0,
                              borderBottomRightRadius: isLast  ? 6 : 0,
                            }}
                            onMouseEnter={e => {
                              e.stopPropagation()
                              const pct = Math.round((row[k] / visTotal) * 100)
                              setTooltip({ visible: true, x: e.clientX, y: e.clientY, province: row.name, key: k, value: row[k], pct })
                            }}
                            onMouseMove={e => { e.stopPropagation(); setTooltip(p => ({ ...p, x: e.clientX, y: e.clientY })) }}
                            onMouseLeave={e => { e.stopPropagation(); setTooltip(p => ({ ...p, visible: false })) }}
                            onClick={e => {
                              e.stopPropagation()
                              setPanel({ visible: true, province: row })
                            }}
                          >
                            {segPct > 12 ? row[k] : ''}
                          </div>
                        )
                      })}
                    </div>

                    {/* Total count shown at end of bar */}
                    <span
                      className="pointer-events-none absolute top-1/2 -translate-y-1/2 pl-1.5 text-[11px] font-medium text-[#6a9090] transition-[left] duration-[650ms]"
                      style={{ left: `calc(${barWidthPct}% - 4px)` }}
                    >
                      {visTotal}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-5 flex justify-end">
            <Link href="#" className="text-[14px] text-[#3a4040] underline underline-offset-4 hover:text-[#0f8f96]">
              Lihat detail sentinel
            </Link>
          </div>
        </article>
      </div>
    </section>
  )
}
