import Image from 'next/image'
import { Bell, CalendarDays, Check, ChevronDown, Download, Menu, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

type DashboardHeaderProps = {
  onToggleSidebar: () => void
}

export default function DashboardHeader({ onToggleSidebar }: DashboardHeaderProps) {
  const [profileOpen, setProfileOpen] = useState(false)
  const [yearPickerOpen, setYearPickerOpen] = useState(false)
  const [periodeOpen, setPeriodeOpen] = useState(false)
  const [selectedYear, setSelectedYear] = useState(2025)
  const [selectedPeriode, setSelectedPeriode] = useState('2025 - 2026')
  const profileRef = useRef<HTMLDivElement>(null)
  const yearPickerRef = useRef<HTMLDivElement>(null)
  const periodeRef = useRef<HTMLDivElement>(null)

  const periodeOptions = Array.from({ length: 4 }, (_, index) => {
    const startYear = selectedYear - 1 + index
    return `${startYear} - ${startYear + 1}`
  })

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!profileRef.current) return
      if (!profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false)
      }
      if (yearPickerRef.current && !yearPickerRef.current.contains(event.target as Node)) setYearPickerOpen(false)
      if (periodeRef.current && !periodeRef.current.contains(event.target as Node)) setPeriodeOpen(false)
    }

    if (profileOpen || yearPickerOpen || periodeOpen) {
      document.addEventListener('mousedown', onClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', onClickOutside)
    }
  }, [profileOpen, yearPickerOpen, periodeOpen])

  return (
    <header className="overflow-hidden rounded-2xl border border-[#cfeeed] bg-[#eefdfd]">
      <div className="relative px-4 py-4 md:px-6 md:py-5">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-95"
          style={{ backgroundImage: "url('/bg header.png')" }}
        />
        <div className="absolute inset-0 bg-[rgba(245,255,255,0.42)]" />

        <div className="relative grid gap-4 lg:grid-cols-[1.05fr_1.35fr] lg:items-center">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Buka menu"
              onClick={onToggleSidebar}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/80 text-slate-600 transition hover:bg-white"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Image src="/Logo-Kemenkes.png" alt="Logo Kemenkes" width={170} height={62} className="h-auto w-[130px] md:w-[170px]" priority />
            <h1 className="max-w-[620px] text-sm font-extrabold uppercase leading-tight tracking-wide text-[#008c95] md:text-lg lg:text-xl">
              Dashboard Laporan KIE
            </h1>
          </div>

          <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end md:gap-3">
            <div className="relative" ref={yearPickerRef}>
              <button
                type="button"
                onClick={() => {
                  setYearPickerOpen((prev) => !prev)
                  setPeriodeOpen(false)
                }}
                className="flex min-w-[180px] items-center justify-between rounded-xl border border-slate-200 bg-white/75 px-3 py-2 text-left transition hover:border-teal-300"
              >
                <span>
                  <span className="block text-xs text-slate-500">Tahun Pengawasan</span>
                  <span className="text-sm font-semibold">{selectedYear}</span>
                </span>
                <CalendarDays className="h-4 w-4 text-slate-500" />
              </button>
              {yearPickerOpen ? (
                <div className="absolute right-0 top-14 z-30 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                  <label className="text-xs font-semibold text-slate-500">Pilih Tahun</label>
                  <input
                    type="month"
                    value={`${selectedYear}-01`}
                    onChange={(event) => {
                      const [pickedYear] = event.target.value.split('-')
                      const yearValue = Number(pickedYear)
                      if (!Number.isNaN(yearValue)) {
                        setSelectedYear(yearValue)
                        const nextPeriodeOptions = Array.from({ length: 4 }, (_, index) => {
                          const startYear = yearValue - 1 + index
                          return `${startYear} - ${startYear + 1}`
                        })
                        const fallbackPeriode = `${yearValue} - ${yearValue + 1}`
                        if (!nextPeriodeOptions.includes(selectedPeriode)) setSelectedPeriode(fallbackPeriode)
                      }
                    }}
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none ring-teal-200 transition focus:ring-2"
                  />
                </div>
              ) : null}
            </div>

            <div className="relative" ref={periodeRef}>
              <button
                type="button"
                onClick={() => {
                  setPeriodeOpen((prev) => !prev)
                  setYearPickerOpen(false)
                }}
                className="flex min-w-[200px] items-center justify-between rounded-xl border border-slate-200 bg-white/75 px-3 py-2 text-left transition hover:border-teal-300"
              >
                <span>
                  <span className="block text-xs text-slate-500">Periode Pengawasan</span>
                  <span className="text-sm font-semibold">{selectedPeriode}</span>
                </span>
                <ChevronDown className={`h-4 w-4 text-slate-500 transition ${periodeOpen ? 'rotate-180' : ''}`} />
              </button>
              {periodeOpen ? (
                <div className="absolute right-0 top-14 z-30 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                  {periodeOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setSelectedPeriode(option)
                        setPeriodeOpen(false)
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                        selectedPeriode === option ? 'bg-teal-50 font-semibold text-teal-700' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>{option}</span>
                      {selectedPeriode === option ? <Check className="h-4 w-4" /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/75 text-slate-600 transition hover:bg-white"
              aria-label="Notifikasi"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute -right-0.5 -top-0.5 rounded-full bg-teal-600 px-1.5 text-[10px] font-semibold text-white">5</span>
            </button>

            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
            >
              <Download className="h-4 w-4" />
              Unduh Laporan
            </button>

            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => setProfileOpen((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/75 px-2 py-1.5 text-left transition hover:bg-white"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-700">AP</div>
                <div className="hidden sm:block">
                  <p className="text-sm font-semibold leading-4">Admin Pusat</p>
                  <p className="text-xs text-slate-500">Super Admin</p>
                </div>
                <ChevronDown className="h-4 w-4 text-slate-500" />
              </button>

              {profileOpen ? (
                <div className="absolute right-0 top-14 z-30 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Admin Pusat</p>
                      <p className="text-xs text-slate-500">surveilans@kemkes.go.id</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProfileOpen(false)}
                      className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                      aria-label="Tutup"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 space-y-2 text-sm">
                    <button type="button" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left transition hover:bg-slate-50">
                      Profil Saya
                    </button>
                    <button type="button" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left transition hover:bg-slate-50">
                      Pengaturan Akun
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-lg border border-red-200 px-3 py-2 text-left text-red-600 transition hover:bg-red-50"
                    >
                      Keluar
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
