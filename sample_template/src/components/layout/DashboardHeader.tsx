'use client'

import Image from 'next/image'
import { Bell, ChevronDown, Download, Menu, Settings, UserCircle, LogOut, X, TrendingUp, TrendingDown, Info } from 'lucide-react'
import { useRef, useState } from 'react'
import headerData from '@/components/dashboard-campus/dashboard-data.json'

type HData = {
  metrics: Array<{ title: string; value: string }>
  aspectScores: Array<{ label: string; value: number }>
  notifications?: Array<{ text: string }>
  sourceInfo?: { dateValue: string }
  trend?: Array<{ year: string; value: number }>
  weeklyPositives?: Array<{ minggu: string; kasus: number; pemeriksaan: number }>
  weeklyPR_Influenza?: Array<{ minggu: string; value: number }>
  weeklyLevels?: Array<{ minggu: string; level: string }>
  weeklyRSV?: Array<{ minggu: string; value: number }>
  weeklyMultipatogen?: Array<{ minggu: string; value: number }>
  y2025avg?: Array<{ name: string; value: number }>
  y2026avg?: Array<{ name: string; value: number }>
}
const hd = headerData as unknown as HData

const notifs = hd.notifications ?? []
const notifDate = hd.sourceInfo?.dateValue ?? ''

const notifIcon = (text: string) => {
  if (text.includes('meningkat')) return TrendingUp
  if (text.includes('menurun')) return TrendingDown
  return Info
}

const downloadCSV = () => {
  const lines: string[] = ['Indikator,Nilai']
  hd.metrics.forEach(m => lines.push(`"${m.title}","${m.value}"`))
  hd.aspectScores.forEach(a => lines.push(`"${a.label}","${a.value.toFixed(1)}%"`))
  ;(hd.trend ?? []).forEach(t => lines.push(`"Trend PR COVID","${t.year}","${t.value}%"`))
  ;(hd.weeklyPositives ?? []).forEach(w => lines.push(`"Weekly Positif","${w.minggu}","${w.kasus} dari ${w.pemeriksaan}"`))
  ;(hd.weeklyPR_Influenza ?? []).forEach(w => lines.push(`"Weekly PR Influenza","${w.minggu}","${w.value}%"`))
  ;(hd.y2025avg ?? []).forEach(a => lines.push(`"2025 Avg","${a.name}","${a.value}%"`))
  ;(hd.y2026avg ?? []).forEach(a => lines.push(`"2026 Avg","${a.name}","${a.value}%"`))
  const csv = lines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'dashboard-raw-data.csv'
  a.click(); URL.revokeObjectURL(url)
}

export default function DashboardHeader({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const [profileOpen, setProfileOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLButtonElement>(null)

  return (
    <header className="sticky top-0 z-30 w-full border-b-2 border-teal-400/25 bg-white">
      <div className="relative flex min-h-[96px] items-center overflow-visible">
        <div className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-95" style={{ backgroundImage: "url('/bg header.png')" }} />
        <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/82 to-white/92" />
        <div className="relative grid w-full gap-3 px-4 py-3 md:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 items-center gap-4">
            <button type="button" aria-label="Buka menu" onClick={onToggleSidebar} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white/90 text-slate-600 shadow-sm transition hover:bg-white">
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:gap-5">
              <Image src="/Logo-Kemenkes.png" alt="Logo Kemenkes" width={170} height={62} className="h-auto w-[132px] shrink-0 md:w-[168px]" priority />
              <div className="min-w-0 border-teal-200/80 md:border-l md:pl-5">
                <h1 className="max-w-[720px] text-2xl font-extrabold leading-tight tracking-normal text-slate-900 md:text-3xl">DASHBOARD LAPORAN KIE</h1>
                <p className="mt-2 max-w-[760px] text-sm leading-relaxed text-slate-600 md:text-base">Laporan KIE — Pemantauan Pengawasan Kasus Influenza, COVID-19, RSV, dan Multipatogen.</p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex flex-wrap items-center gap-2 md:gap-3 lg:justify-end">
              <div className="relative">
                <button type="button" ref={notifRef} onClick={() => setNotifOpen(p => !p)} className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white/90 text-slate-600 shadow-sm transition hover:bg-white" aria-label="Notifikasi">
                  <Bell className="h-5 w-5" />
                  {notifs.length > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 rounded-full bg-teal-600 px-1.5 text-[10px] font-semibold text-white">{notifs.length}</span>
                  )}
                </button>
                {notifOpen ? (
                  <div className="absolute right-0 top-14 z-40 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
                    <p className="text-xs font-bold uppercase tracking-[0.08em] text-teal-700">Notifikasi</p>
                    <div className="mt-3 space-y-2">
                      {notifs.map((n) => {
                        const Icon = notifIcon(n.text)
                        return (
                          <div key={n.text} className="flex items-start gap-2 rounded-lg border border-slate-100 px-3 py-2">
                            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
                            <p className="text-[13px] text-slate-700">{n.text}</p>
                          </div>
                        )
                      })}
                    </div>
                    <div className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-400">Data per: {notifDate}</div>
                  </div>
                ) : null}
              </div>
              <button type="button" onClick={() => downloadCSV()} className="inline-flex h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-[13px] font-bold uppercase tracking-[0.03em] text-emerald-700 shadow-sm transition hover:bg-emerald-100">
                <Download className="h-4 w-4" />Unduh Data CSV
              </button>
              <div className="relative" ref={profileRef}>
                <button type="button" onClick={() => setProfileOpen((prev) => !prev)} className="inline-flex h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 px-3 text-left shadow-sm transition hover:bg-white">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 text-sm font-extrabold text-white shadow-sm">AP</div>
                  <div className="hidden sm:block">
                    <p className="text-[13px] font-bold uppercase tracking-[0.03em] leading-4 text-slate-900">Admin Pusat</p>
                    <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.03em] text-teal-700">Koordinator Surveilans</p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-slate-500" />
                </button>
                {profileOpen ? (
                  <div className="absolute right-0 top-16 z-30 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 text-sm font-extrabold text-white">AP</div>
                        <div><p className="text-sm font-semibold text-slate-800">Admin Surveilans</p><p className="text-xs text-slate-500">surveilans@kemkes.go.id</p></div>
                      </div>
                      <button type="button" onClick={() => setProfileOpen(false)} className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600" aria-label="Tutup"><X className="h-4 w-4" /></button>
                    </div>
                    <div className="mt-4 rounded-lg border border-teal-100 bg-teal-50 px-3 py-2">
                      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-teal-700">Akses</p>
                      <p className="mt-0.5 text-xs text-slate-600">Pusat pemantauan surveilans Influenza & COVID-19</p>
                    </div>
                    <div className="mt-3 space-y-2">
                      <button type="button" className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-[13px] font-bold uppercase tracking-[0.03em] text-slate-700 transition hover:bg-slate-50">
                        <UserCircle className="h-4 w-4 text-teal-600" />Profil Saya
                      </button>
                      <button type="button" className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-[13px] font-bold uppercase tracking-[0.03em] text-slate-700 transition hover:bg-slate-50">
                        <Settings className="h-4 w-4 text-teal-600" />Pengaturan Akun
                      </button>
                      <button type="button" className="flex w-full items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-left text-[13px] font-bold uppercase tracking-[0.03em] text-red-600 transition hover:bg-red-50">
                        <LogOut className="h-4 w-4" />Keluar
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="h-[3px] bg-gradient-to-r from-teal-400/80 via-teal-400/40 to-transparent" />
    </header>
  )
}
