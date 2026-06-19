'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useState } from 'react'
import InfoButton from '@/components/layout/InfoButton'
import DataModal from '@/components/layout/DataModal'
import dashboardData from '@/components/dashboard-campus/dashboard-data.json'

type YItem = { name: string; value: number }
type DData = { y2025avg?: YItem[]; y2026avg?: YItem[] }
const dd = dashboardData as unknown as DData

const y25 = (dd.y2025avg ?? []).map(i => ({ name: i.name.replace(/^PR /, '').replace(/^Proporsi /, ''), value: i.value }))
const y26 = (dd.y2026avg ?? []).map(i => ({ name: i.name.replace(/^PR /, '').replace(/^Proporsi /, ''), value: i.value }))
const merged = y25.map((i, idx) => ({
  name: i.name,
  '2025': i.value,
  '2026': y26[idx]?.value ?? 0,
}))

const terbesarNaik = [...merged].sort((a, b) =>
  (b['2026'] - b['2025']) / b['2025'] * 100 - (a['2026'] - a['2025']) / a['2025'] * 100
)[0]
const terbesarTurun = [...merged].sort((a, b) =>
  (a['2026'] - a['2025']) / a['2025'] * 100 - (b['2026'] - b['2025']) / b['2025'] * 100
)[0]

export default function PerbandinganTahunanPage() {
  const [modalCard, setModalCard] = useState<string | null>(null)
  const yRows = y25.map((item, idx) => ({
    label: item.name,
    value: `${item.value}% (2025) → ${y26[idx]?.value.toFixed(1) ?? '-'}% (2026)`,
  }))

  return (
    <section className="space-y-4 px-4 pb-8 md:px-6">
      <div className="rounded-2xl border border-[#d5e6e5] bg-gradient-to-br from-blue-50 to-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-lg">📊</span>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.04em] text-slate-900">Ringkasan Eksekutif — Perbandingan Tahunan</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Rata-rata indikator 2025 ({y25.length} indikator) vs 2026 ({y26.length} indikator).
              Peningkatan tertinggi: <strong className="text-red-600">{terbesarNaik?.name ?? '-'}</strong>.
              Penurunan terbesar: <strong className="text-emerald-600">{terbesarTurun?.name ?? '-'}</strong>.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-emerald-700">🏆 Membaik (Penurunan) <InfoButton data={{source: 'Tabel Influenza, COVID-19, RSV → keterangan', calc: 'Rata-rata per indikator: 2025 vs 2026'}} /></p>
          <button type="button" onClick={() => setModalCard('best')} className="mt-2 w-fit text-left text-xl font-extrabold text-emerald-800 transition hover:text-emerald-600">{terbesarTurun?.name ?? '-'}</button>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-lg font-bold text-emerald-600">{terbesarTurun?.['2025']?.toFixed(1) ?? '-'}%</span>
            <span className="text-sm text-emerald-500">→</span>
            <span className="text-lg font-bold text-emerald-600">{terbesarTurun?.['2026']?.toFixed(1) ?? '-'}%</span>
          </div>
        </article>
        <article className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-red-700">⚠️ Memburuk (Kenaikan) <InfoButton data={{source: 'Tabel Influenza, COVID-19, RSV → keterangan', calc: 'Rata-rata per indikator: 2025 vs 2026'}} /></p>
          <button type="button" onClick={() => setModalCard('worst')} className="mt-2 w-fit text-left text-xl font-extrabold text-red-800 transition hover:text-red-600">{terbesarNaik?.name ?? '-'}</button>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-lg font-bold text-red-600">{terbesarNaik?.['2025']?.toFixed(1) ?? '-'}%</span>
            <span className="text-sm text-red-500">→</span>
            <span className="text-lg font-bold text-red-600">{terbesarNaik?.['2026']?.toFixed(1) ?? '-'}%</span>
          </div>
        </article>
      </div>

      <article className="rounded-2xl border border-[#d5e6e5] bg-white p-5 shadow-sm">
        <h2 className="text-[22px] font-bold uppercase tracking-[0.04em] text-slate-900">Perbandingan YoY 2025 vs 2026 <InfoButton data={{source: 'Tabel Influenza, COVID-19, RSV → kolom Keterangan', calc: 'Rata-rata per indikator per tahun'}} /></h2>
        <p className="mt-1 text-base leading-relaxed text-slate-500">Rata-rata indikator 2025 vs 2026 untuk minggu yang tersedia.</p>
        <div className="mt-4 h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={merged} margin={{ top: 20, right: 30, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v) => `${Number(v).toFixed(2)}%`} />
              <Legend />
              <Bar dataKey="2025" name="Tahun 2025" fill="#0d9488" radius={[4, 4, 0, 0]} />
              <Bar dataKey="2026" name="Tahun 2026" fill="#f97316" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="rounded-2xl border border-[#d5e6e5] bg-white p-5 shadow-sm">
        <h2 className="text-[22px] font-bold uppercase tracking-[0.04em] text-slate-900">Tabel Perbandingan Tahunan <InfoButton data={{source: 'Tabel Influenza, COVID-19, RSV → keterangan', calc: 'Rata-rata per indikator: 2025 vs 2026'}} /></h2>
        <p className="mt-1 text-base leading-relaxed text-slate-500">Detail perbandingan per indikator.</p>
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
              {merged.map(r => {
                const change = r['2025'] > 0 ? ((r['2026'] - r['2025']) / r['2025'] * 100) : 0
                const isNaik = change > 0
                return (
                  <tr key={r.name} className="border-b hover:bg-teal-50/40">
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2 text-right">{r['2025'].toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right">{r['2026'].toFixed(1)}%</td>
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
          <p className="text-xs text-amber-800">
            ⚠️ Perbandingan terbatas pada minggu yang tersedia. Bukan full year — interpretasi hati-hati.
          </p>
        </div>
      </article>
      <DataModal
        open={modalCard !== null}
        onClose={() => setModalCard(null)}
        title={modalCard === 'best' ? 'Semua Indikator' : 'Semua Indikator'}
        rows={yRows}
      />
    </section>
  )
}
