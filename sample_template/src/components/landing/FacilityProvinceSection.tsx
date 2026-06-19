'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

export type FacilityKey = 'rumahSakit' | 'puskesmas' | 'pustu' | 'klinik' | 'posyandu' | 'bbkk'
type FacilityFocus = FacilityKey | 'all'

type ProvinceRow = {
  id: string
  name: string
  rumahSakit: number
  puskesmas: number
  pustu: number
  klinik: number
  posyandu: number
  bbkk: number
}

type SebaranApiItem = {
  kode?: string
  nama?: string
  kode_provinsi?: string
  nama_provinsi?: string
  kode_kabupaten?: string
  nama_kabupaten?: string
  total_rs?: string | number
  total_puskesmas?: string | number
  total_pustu?: string | number
  total_klinik?: string | number
  total_posyandu?: string | number
  total_bkk?: string | number
} & Record<string, string | number | undefined>

const FACILITY_KEYS: FacilityKey[] = ['rumahSakit', 'puskesmas', 'pustu', 'klinik', 'posyandu', 'bbkk']

const FACILITY_META: Record<FacilityKey, { label: string; color: string }> = {
  rumahSakit: { label: 'Rumah Sakit', color: '#2db9bb' },
  puskesmas: { label: 'Puskesmas', color: '#0b7b86' },
  pustu: { label: 'Pustu', color: '#3e8ed0' },
  klinik: { label: 'Klinik', color: '#2a9d8f' },
  posyandu: { label: 'Posyandu', color: '#5c9bd5' },
  bbkk: { label: 'BBKK/BKK/LKK', color: '#f2a93b' },
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
  selectedProvinsi = '',
  selectedKabupaten = '',
}: {
  activeFacility?: FacilityFocus
  selectedProvinsi?: string
  selectedKabupaten?: string
}) {
  void activeFacility
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false, x: 0, y: 0, province: '', key: 'rumahSakit', value: 0, pct: 0,
  })
  const [panel, setPanel] = useState<{ visible: boolean; province: ProvinceRow | null }>({
    visible: false, province: null,
  })
  const [mounted] = useState(true)
  const [rows, setRows] = useState<ProvinceRow[]>([])
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const toNumber = (value: string | number | undefined) => {
    if (typeof value === 'number') return value
    const parsed = Number.parseInt((value ?? '0').toString().replace(/[^\d-]/g, ''), 10)
    return Number.isNaN(parsed) ? 0 : parsed
  }

  const mapApiRowToProvinceRow = (item: SebaranApiItem, index: number): ProvinceRow => {
    const id =
      item.kode ??
      item.kode_kabupaten ??
      item.kode_provinsi ??
      `row-${index}`
    const name =
      item.nama ??
      item.nama_kabupaten ??
      item.nama_provinsi ??
      `Wilayah ${index + 1}`
    return {
      id,
      name,
      rumahSakit: toNumber(item.total_rs ?? item.total_rumah_sakit),
      puskesmas: toNumber(item.total_puskesmas),
      pustu: toNumber(item.total_pustu),
      klinik: toNumber(item.total_klinik),
      posyandu: toNumber(item.total_posyandu),
      bbkk: toNumber(item.total_bkk ?? item.total_bbkk),
    }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanel({ visible: false, province: null })
      }
    }
    if (panel.visible) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [panel.visible])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        const response = await fetch('/api/dashboard-faskes/sebaran-faskes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kode_provinsi: selectedProvinsi,
            kode_kabupaten: selectedKabupaten,
          }),
        })
        if (!response.ok) return
        const payload = (await response.json()) as { data?: SebaranApiItem[] }
        const mapped = (payload.data ?? []).map(mapApiRowToProvinceRow)
        setRows(mapped)
      } finally {
        setLoading(false)
      }
    })()
  }, [selectedProvinsi, selectedKabupaten])

  // Max total among all rows for currently active keys — determines longest bar
  const maxVisTotal = Math.max(1, ...rows.map(row => FACILITY_KEYS.reduce((s, k) => s + row[k], 0)))

  return (
    <section className="w-full bg-[#f4f7fb] pb-6">
      <div className="w-full px-4 sm:px-5 lg:px-6">

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
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
            <div
              ref={panelRef}
              className="mx-4 w-full max-w-sm rounded-[22px] border border-[#d7eaea] bg-white p-6 shadow-2xl"
              style={{ animation: 'panelIn 0.28s cubic-bezier(0.34,1.56,0.64,1) both' }}
            >
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[#8aabab]">Total Fasilitas</p>
                  <h4 className="text-[22px] font-bold text-[#2f2f2f]">{panel.province.name}</h4>
                </div>
                <button
                  onClick={() => setPanel({ visible: false, province: null })}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eff7f7] text-[#3a5050] transition hover:bg-[#d7eaea]"
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
                  <p className="text-[12px] text-[#8aabab]">fasilitas kesehatan</p>
                </div>
              </div>

              <div className="space-y-3">
                {FACILITY_KEYS.map(k => {
                  const val = panel.province![k]
                  const total = FACILITY_KEYS.reduce((s, kk) => s + panel.province![kk], 0)
                  if (val <= 0) return null
                  const pct = total > 0 ? Math.round((val / total) * 100) : 0
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
              <h3 className="text-[18px] font-bold uppercase leading-tight text-[#2f2f2f] sm:text-[20px]">
                Sebaran Fasilitas Kesehatan per Provinsi
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-[#4b4b4b] sm:text-[16px]">
               Menampilkan pemetaan distribusi dan jumlah fasilitas kesehatan yang tersebar di setiap provinsi.
              </p>
              {loading && (
                <p className="mt-2 text-[12px] font-medium text-[#0f8f96]">Memuat data sebaran faskes...</p>
              )}

            </div>

            <div className="hidden lg:block" />
          </div>

          {/* Chart rows */}
          <div className="mt-6 space-y-3">
            {rows.map(row => {
              const visKeys = FACILITY_KEYS.filter(k => row[k] > 0)
              const visTotal = visKeys.reduce((s, k) => s + row[k], 0)
              if (visTotal <= 0) return null
              // Bar width is proportional to the row with the highest total
              const barWidthPct = maxVisTotal > 0 ? (visTotal / maxVisTotal) * 100 : 0

              return (
                <div
                  key={row.id}
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
                        const isLast = ki === visKeys.length - 1
                        return (
                          <div
                            key={k}
                            className="flex items-center justify-center overflow-hidden whitespace-nowrap text-[11px] font-semibold text-white transition-[flex] duration-[650ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:brightness-110"
                            style={{
                              flex: segPct,
                              minWidth: 26,
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
                            onClick={e => e.stopPropagation()}
                          >
                            <span className="px-1 leading-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.18)]">
                              {row[k]}
                            </span>
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

          {!loading && rows.length === 0 && (
            <div className="mt-6 rounded-xl border border-dashed border-[#cde3e2] bg-[#f7fbfb] p-4 text-sm text-[#5d7575]">
              Data sebaran belum tersedia untuk filter ini.
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <Link href="#" className="text-[14px] text-[#3a4040] underline underline-offset-4 hover:text-[#0f8f96]">
              Selengkapnya
            </Link>
          </div>
        </article>
      </div>
    </section>
  )
}
