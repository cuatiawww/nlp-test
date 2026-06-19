'use client'

import { useState } from 'react'
import dashboardData from '@/components/dashboard-campus/dashboard-data.json'

type TData = {
  metrics: Array<{ title: string; value: string; delta: string }>
  sourceInfo: { sourceLabel: string; sourceValue: string; dateLabel: string; dateValue: string }
  trend: Array<{ year: string; value: number }>
  weeklyPositives?: Array<{ minggu: string; kasus: number; pemeriksaan: number }>
  weeklyPR_Influenza?: Array<{ minggu: string; value: number }>
  weeklyLevels?: Array<{ minggu: string; level: string }>
  y2025avg?: Array<{ name: string; value: number }>
  y2026avg?: Array<{ name: string; value: number }>
  [key: string]: unknown
}
const dd = dashboardData as unknown as TData
const m = dd.metrics
const y25 = dd.y2025avg ?? []
const y26 = dd.y2026avg ?? []
const wp = dd.weeklyPositives ?? []
const trend = dd.trend ?? []
const wpi = dd.weeklyPR_Influenza ?? []
const wl = dd.weeklyLevels ?? []

const last4 = wp.slice(-4).map(w => {
  const minggu = w.minggu
  const t = trend.find(x => x.year === minggu)
  const p = wpi.find(x => x.minggu === minggu)
  const l = wl.find(x => x.minggu === minggu)
  return { minggu, kasus: w.kasus, pemeriksaan: w.pemeriksaan, prCovid: t?.value ?? 0, prFlu: p?.value ?? 0, level: l?.level ?? '?' }
})

const total25 = wp.filter(w => w.minggu.includes('2025')).reduce((a, w) => a + w.kasus, 0)
const total26 = wp.filter(w => w.minggu.includes('2026')).reduce((a, w) => a + w.kasus, 0)
const weeks25 = wp.filter(w => w.minggu.includes('2025')).length
const weeks26 = wp.filter(w => w.minggu.includes('2026')).length

export default function RekapitulasiPage() {
  return (
    <section className="space-y-4 px-4 pb-8 md:px-6">

      <div className="rounded-2xl border border-[#d5e6e5] bg-gradient-to-br from-blue-50 to-white p-5 shadow-sm">
        <h1 className="text-[28px] font-extrabold uppercase tracking-normal text-slate-900">Rekapitulasi Mingguan & Tahunan</h1>
        <p className="mt-1 text-base text-slate-600">{dd.sourceInfo.sourceValue} — {dd.sourceInfo.dateValue}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <article className="rounded-2xl border border-[#cfe3e2] bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Total Pemeriksaan</p>
          <p className="mt-1 text-3xl font-extrabold text-slate-800">{m.find(x => x.title === 'Total Pemeriksaan COVID-19')?.value ?? '-'}</p>
          <p className="mt-1 text-xs text-slate-500">{m.find(x => x.title === 'Total Pemeriksaan COVID-19')?.delta ?? ''}</p>
        </article>
        <article className="rounded-2xl border border-[#cfe3e2] bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Kasus Positif COVID-19</p>
          <p className="mt-1 text-3xl font-extrabold text-slate-800">{m.find(x => x.title === 'Kasus Positif COVID-19')?.value ?? '-'}</p>
          <p className="mt-1 text-xs text-slate-500">{m.find(x => x.title === 'Kasus Positif COVID-19')?.delta ?? ''}</p>
        </article>
        <article className="rounded-2xl border border-[#cfe3e2] bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">PR COVID-19</p>
          <p className="mt-1 text-3xl font-extrabold text-slate-800">{m.find(x => x.title === 'Positivity Rate COVID-19')?.value ?? '-'}</p>
          <p className="mt-1 text-xs text-slate-500">{m.find(x => x.title === 'Positivity Rate COVID-19')?.delta ?? ''}</p>
        </article>
        <article className="rounded-2xl border border-[#cfe3e2] bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">PR Influenza</p>
          <p className="mt-1 text-3xl font-extrabold text-slate-800">{m.find(x => x.title === 'Positivity Rate Influenza')?.value ?? '-'}</p>
          <p className="mt-1 text-xs text-slate-500">{m.find(x => x.title === 'Positivity Rate Influenza')?.delta ?? ''}</p>
        </article>
        <article className="rounded-2xl border border-[#cfe3e2] bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Level Aktivitas</p>
          <p className="mt-1 text-3xl font-extrabold text-slate-800">{m.find(x => x.title === 'Aktivitas Influenza')?.value ?? '-'}</p>
          <p className="mt-1 text-xs text-slate-500">{m.find(x => x.title === 'Aktivitas Influenza')?.delta ?? ''}</p>
        </article>
        <article className="rounded-2xl border border-[#cfe3e2] bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Data per</p>
          <p className="mt-1 text-3xl font-extrabold text-slate-800">{dd.sourceInfo.dateValue}</p>
          <p className="mt-1 text-xs text-slate-500">Sumber terbaru</p>
        </article>
      </div>

      <article className="rounded-2xl border border-[#d5e6e5] bg-white p-5 shadow-sm">
        <h2 className="text-[22px] font-bold uppercase tracking-[0.04em] text-slate-900">4 Minggu Terakhir</h2>
        <p className="mt-1 text-base text-slate-500">Perkembangan mingguan dalam satu bulan terakhir.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="px-3 py-2 text-left">Minggu</th>
                <th className="px-3 py-2 text-right">Pemeriksaan</th>
                <th className="px-3 py-2 text-right">Kasus</th>
                <th className="px-3 py-2 text-right">PR COVID</th>
                <th className="px-3 py-2 text-right">PR Influenza</th>
                <th className="px-3 py-2 text-center">Level</th>
              </tr>
            </thead>
            <tbody>
              {last4.map(r => (
                <tr key={r.minggu} className="border-b hover:bg-teal-50/40">
                  <td className="px-3 py-2 font-medium">{r.minggu}</td>
                  <td className="px-3 py-2 text-right">{r.pemeriksaan}</td>
                  <td className="px-3 py-2 text-right font-semibold">{r.kasus}</td>
                  <td className="px-3 py-2 text-right">{r.prCovid.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right">{r.prFlu.toFixed(0)}%</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      r.level === 'Rendah' ? 'bg-emerald-100 text-emerald-700' :
                      r.level === 'Di Luar Musim' ? 'bg-blue-100 text-blue-700' :
                      r.level === 'Sedang' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>{r.level}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <h2 className="text-[22px] font-bold uppercase tracking-[0.04em] text-slate-900 px-1">Ringkasan Tahunan</h2>

      <div className="grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 to-white p-5 shadow-sm">
          <p className="text-sm font-bold uppercase tracking-[0.08em] text-teal-700">📅 2025</p>
          <p className="mt-3 text-sm text-slate-500">{weeks25} minggu pengawasan</p>
          <div className="mt-3 space-y-2">
            {y25.map(i => (
              <div key={i.name} className="flex justify-between border-b border-teal-100/50 pb-1">
                <span className="text-sm text-slate-600">{i.name.replace(/^PR /, '').replace(/^Proporsi /, '')}</span>
                <span className="text-sm font-bold text-slate-800">{i.value.toFixed(1)}%</span>
              </div>
            ))}
            <div className="flex justify-between pt-1">
              <span className="text-sm font-semibold text-slate-600">Total Kasus Positif</span>
              <span className="text-sm font-bold text-teal-800">{total25}</span>
            </div>
          </div>
        </article>
        <article className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-5 shadow-sm">
          <p className="text-sm font-bold uppercase tracking-[0.08em] text-orange-700">📅 2026</p>
          <p className="mt-3 text-sm text-slate-500">{weeks26} minggu pengawasan</p>
          <div className="mt-3 space-y-2">
            {y26.map(i => (
              <div key={i.name} className="flex justify-between border-b border-orange-100/50 pb-1">
                <span className="text-sm text-slate-600">{i.name.replace(/^PR /, '').replace(/^Proporsi /, '')}</span>
                <span className="text-sm font-bold text-slate-800">{i.value.toFixed(1)}%</span>
              </div>
            ))}
            <div className="flex justify-between pt-1">
              <span className="text-sm font-semibold text-slate-600">Total Kasus Positif</span>
              <span className="text-sm font-bold text-orange-800">{total26}</span>
            </div>
          </div>
        </article>
      </div>

      <article className="rounded-2xl border border-[#d5e6e5] bg-white p-5 shadow-sm">
        <h2 className="text-[22px] font-bold uppercase tracking-[0.04em] text-slate-900">Tabel Perbandingan Tahunan</h2>
        <p className="mt-1 text-base text-slate-500">Detail perbandingan 2025 vs 2026 per indikator.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="px-3 py-2 text-left">Indikator</th>
                <th className="px-3 py-2 text-right">2025</th>
                <th className="px-3 py-2 text-right">2026</th>
                <th className="px-3 py-2 text-right">Perubahan</th>
              </tr>
            </thead>
            <tbody>
              {y25.map((i, idx) => {
                const v26 = y26[idx]?.value ?? 0
                const change = i.value > 0 ? (v26 - i.value) / i.value * 100 : 0
                const isNaik = change > 0
                return (
                  <tr key={i.name} className="border-b hover:bg-teal-50/40">
                    <td className="px-3 py-2">{i.name.replace(/^PR /, '').replace(/^Proporsi /, '')}</td>
                    <td className="px-3 py-2 text-right">{i.value.toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right">{v26.toFixed(1)}%</td>
                    <td className={`px-3 py-2 text-right font-semibold ${isNaik ? 'text-red-600' : 'text-emerald-600'}`}>
                      {change === 0 ? '-' : `${isNaik ? '+' : ''}${change.toFixed(0)}%`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs text-amber-800">⚠️ Perbandingan terbatas pada minggu yang tersedia. Bukan full year — interpretasi hati-hati.</p>
        </div>
      </article>

    </section>
  )
}
