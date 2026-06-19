'use client'

import { Activity, Microscope, Thermometer, Network, Calendar, AlertTriangle } from 'lucide-react'
import React, { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import InfoButton from '@/components/layout/InfoButton'
import DataModal from '@/components/layout/DataModal'
import dashboardData from '@/components/dashboard-campus/dashboard-data.json'

type WeeklyLevel = { minggu: string; level: string; levelIdx: number }
type DData = { metrics: Array<{ title: string; value: string }>; aspectScores: Array<{ label: string; value: number }>; starDistribution: Array<{ label: string; total: number; percent: number; tone: string }>; trend: Array<{ year: string; value: number }>; weeklyLevels?: WeeklyLevel[] }
const dd = dashboardData as unknown as DData

const indikatorData = dd.aspectScores.map(a => ({ name: a.label.replace(/Positivity Rate /, 'PR ').replace(/^Proporsi /, 'Prop. '), value: a.value }))
const COLORS = ['#0d9488', '#06b6d4', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981']

const levelInfo = dd.starDistribution.map(s => ({
  label: s.label,
  total: s.total,
  percent: s.percent,
  tone: s.tone === 'bg-emerald-500' ? 'bg-emerald-100 text-emerald-700' : s.tone === 'bg-lime-500' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700',
}))

const totalLevels = levelInfo.reduce((acc, l) => acc + l.total, 0)
const weeklyLevels = (dd.weeklyLevels ?? []) as WeeklyLevel[]

const LEVEL_COLORS: Record<string, string> = {
  'Rendah': '#10b981',
  'Di Luar Musim': '#3b82f6',
  'Sedang': '#eab308',
  'Tinggi': '#ef4444',
}
const LEVEL_LABELS = ['Di Luar Musim', 'Rendah', 'Sedang', 'Tinggi']
const BASE_W = 44

function LevelTimeline() {
  const weekly = (dd.weeklyLevels ?? []) as WeeklyLevel[]
  const [zoom, setZoom] = useState(1)
  const bw = Math.max(20, BASE_W * zoom)
  const totalW = weekly.length * bw + 40
  const svgH = 210
  const rowH = 50
  const dotR = 7

  const yPos = (idx: number) => 16 + (3 - idx) * rowH + 6
  const xPos = (i: number) => 20 + i * bw + bw / 2

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm leading-relaxed text-slate-500">Timeline level aktivitas influenza per minggu ({weekly.length} minggu). <span className="text-slate-400">Scroll horizontal untuk navigasi.</span></p>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => setZoom(z => Math.max(0.4, z - 0.2))} className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30" disabled={zoom <= 0.4}>−</button>
          <span className="w-8 text-center text-[11px] font-semibold text-slate-500">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom(z => Math.min(2.4, z + 0.2))} className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30" disabled={zoom >= 2.4}>+</button>
        </div>
      </div>
      <div className="mt-2 overflow-x-auto rounded-xl border border-slate-100 bg-slate-50/40" style={{ maxHeight: svgH + 40 }}>
        <svg width={totalW} height={svgH} style={{ minWidth: totalW }}>
          {/* Y-axis labels */}
          <text x={6} y={yPos(3)} fontSize={10} fill="#64748b" textAnchor="start">Tinggi</text>
          <text x={6} y={yPos(2)} fontSize={10} fill="#64748b" textAnchor="start">Sedang</text>
          <text x={6} y={yPos(1)} fontSize={10} fill="#64748b" textAnchor="start">Rendah</text>
          <text x={6} y={yPos(0)} fontSize={10} fill="#64748b" textAnchor="start">Di Luar Musim</text>

          {/* Grid lines */}
          {LEVEL_LABELS.map((_, yi) => (
            <line key={`grid-${yi}`} x1={0} x2={totalW} y1={yPos(yi)} y2={yPos(yi)} stroke="#e2e8f0" strokeWidth={1} />
          ))}

          {/* Connector lines */}
          {weekly.map((w, i) => {
            if (i === 0) return null
            const prev = weekly[i - 1]
            const x1 = xPos(i - 1), x2 = xPos(i)
            const y1 = yPos(prev.levelIdx), y2 = yPos(w.levelIdx)
            return <line key={`line-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={LEVEL_COLORS[w.level] ?? '#94a3b8'} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.5} />
          })}

          {/* Dot + label per week */}
          {weekly.map((w, i) => (
            <g key={w.minggu}>
              <circle cx={xPos(i)} cy={yPos(w.levelIdx)} r={dotR} fill={LEVEL_COLORS[w.level] ?? '#94a3b8'} stroke="#ffffff" strokeWidth={2} />
              {/* Show label every ~5 weeks or first/last */}
              {(i % 5 === 0 || i === weekly.length - 1 || w.levelIdx !== (weekly[i - 1]?.levelIdx ?? w.levelIdx)) ? (
                <text x={xPos(i)} y={svgH - 8} fontSize={bw > 30 ? 9 : 7} fill="#94a3b8" textAnchor="middle" transform={`rotate(-45, ${xPos(i)}, ${svgH - 8})`}>
                  {w.minggu}
                </text>
              ) : null}
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}

export default function PositivitasPage() {
  const [modalCard, setModalCard] = useState<string | null>(null)
  const wpi = (dd as any).weeklyPR_Influenza ?? []
  const trend = (dd as any).trend ?? []
  const wl = (dd as any).weeklyLevels ?? []
  const wrsv = (dd as any).weeklyRSV ?? []
  const wmulti = (dd as any).weeklyMultipatogen ?? []
  const totalLevels = dd.starDistribution.reduce((a, s) => a + s.total, 0)

  const cardIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    'PR Influenza': Activity,
    'PR COVID-19': Microscope,
    'Proporsi RSV': Thermometer,
    'Multipatogen': Network,
    'Minggu Terkini': Calendar,
    'CFR': AlertTriangle,
  }

  const posModalRowsMap: Record<string, Array<{ label: string; value: string | number; extra?: string }>> = {
    'PR Influenza': wpi.map((w: any) => ({ label: w.minggu, value: `${w.value}%` })),
    'PR COVID-19': trend.map((t: any) => ({ label: t.year, value: `${t.value}%` })),
    'Proporsi RSV': wrsv.map((w: any) => ({ label: w.minggu, value: `${w.value}%` })),
    'Multipatogen': wmulti.map((w: any) => ({ label: w.minggu, value: `${w.value}%` })),
    'Minggu Terkini': wl.map((w: any) => ({ label: w.minggu, value: w.level })),
    'CFR': [],
  }

  return (
    <section className="space-y-4 px-4 pb-8 md:px-6">

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          {[
          { t: 'PR Influenza', v: `${(dd.aspectScores.find(a => a.label === 'Positivity Rate Influenza')?.value ?? 0).toFixed(1)}%`, d: `Rata-rata ${totalLevels} minggu`, c: 'bg-teal-100 text-teal-700', s: 'Tabel Influenza Activity → baris "Positivity rate influenza" → kolom Keterangan', calc: 'Spesimen positif influenza ÷ total diperiksa × 100%' },
          { t: 'PR COVID-19', v: `${(dd.aspectScores.find(a => a.label === 'Positivity Rate COVID-19')?.value ?? 0).toFixed(1)}%`, d: `Rata-rata ${totalLevels} minggu`, c: 'bg-sky-100 text-sky-700', s: 'Tabel COVID-19 Activity → baris "Positivity rate COVID-19" → kolom Keterangan', calc: 'Spesimen positif SARS-CoV-2 ÷ total diperiksa × 100%' },
          { t: 'Proporsi RSV', v: `${(dd.aspectScores.find(a => a.label === 'Proporsi RSV')?.value ?? 0).toFixed(1)}%`, d: `Rata-rata ${totalLevels} minggu`, c: 'bg-amber-100 text-amber-700', s: 'Tabel RSV ACTIVITY → baris "jumlah kasus RSV" → kolom Keterangan', calc: 'Proporsi RSV dari total spesimen multipatogen × 100%' },
          { t: 'Multipatogen', v: `${(dd.aspectScores.find(a => a.label === 'Multipatogen Lainnya')?.value ?? 0).toFixed(1)}%`, d: `Rata-rata ${totalLevels} minggu`, c: 'bg-violet-100 text-violet-700', s: 'Tabel RSV ACTIVITY → baris "Multipatogen Lainnya" → kolom Keterangan', calc: 'Proporsi multipatogen dari total spesimen × 100%' },
          { t: 'Minggu Terkini', v: `${totalLevels} mgg`, d: `${dd.trend?.[0]?.year ?? '-'} - ${dd.trend?.[dd.trend?.length - 1]?.year ?? '-'}`, c: 'bg-emerald-100 text-emerald-700', s: 'Seluruh halaman Ringkasan Kasus', calc: 'Total minggu yang tersedia dengan data tabel lengkap' },
          { t: 'CFR', v: 'Tidak Tersedia', d: '', c: 'bg-slate-100 text-slate-500', s: '', calc: '' },
        ].map(card => (
          <article key={card.t} className="rounded-2xl border border-[#cfe3e2] bg-white p-4 shadow-sm">
            <div className="flex min-h-[90px] items-center gap-3">
              <div className={`inline-flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-full ${card.c}`}>
                {React.createElement(cardIconMap[card.t] ?? Activity, { className: 'h-9 w-9' })}
              </div>
              <div className="flex flex-1 flex-col">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">{card.t} <InfoButton data={{source: card.s ?? '', calc: card.calc ?? ''}} /></p>
                <button type="button" onClick={() => setModalCard(card.t)} className="mt-1 w-fit text-left text-3xl font-extrabold leading-[0.95] tracking-tight text-slate-800 transition hover:text-teal-700">{card.v}</button>
                <p className="mt-auto pt-2 text-xs leading-relaxed text-slate-500">{card.d}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
      <DataModal open={modalCard !== null} onClose={() => setModalCard(null)} title={modalCard ?? ''} rows={posModalRowsMap[modalCard ?? ''] ?? []} />

      <article className="rounded-2xl border border-[#d5e6e5] bg-white p-5 shadow-sm">
        <h2 className="text-[22px] font-bold uppercase tracking-[0.04em] text-slate-900">Rata-rata Positivity Rate per Indikator <InfoButton data={{source: `Seluruh ${totalLevels} minggu → Tabel Influenza / COVID-19 / RSV Activity → kolom Keterangan pada halaman Ringkasan Kasus`, calc: `Σ(nilai per minggu) ÷ ${totalLevels} × 100%`}} /></h2>
        <p className="mt-1 text-base leading-relaxed text-slate-500">Perbandingan rata-rata positivity rate dan proporsi kasus per indikator selama {totalLevels} minggu pengawasan.</p>
        <div className="mt-4 h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={indikatorData} margin={{ top: 20, right: 30, left: 0, bottom: 40 }} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} domain={[0, 'auto']} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={90} />
              <Tooltip formatter={(v) => `${Number(v).toFixed(2)}%`} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} animationDuration={650}>
                {indikatorData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="rounded-2xl border border-[#d5e6e5] bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[22px] font-bold uppercase tracking-[0.04em] text-slate-900">Level Aktivitas Influenza — Timeline <InfoButton data={{source: 'Tabel Influenza Activity → kolom Level pada setiap minggu', calc: 'Level aktivitas per minggu dari tabel Influenza Activity, baris ILI'}} /></h2>
            <p className="mt-1 text-base leading-relaxed text-slate-500">Level aktivitas influenza tiap minggu ({weeklyLevels.length} minggu). Scroll untuk navigasi.</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-3">
          {levelInfo.map(l => (
            <span key={l.label} className={`rounded-full px-3 py-1 text-xs font-semibold ${l.tone}`}>
              {l.label}: {l.total} minggu ({l.percent}%)
            </span>
          ))}
        </div>

        <div className="mt-4">
          <LevelTimeline />
        </div>

        <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
          <p className="text-sm font-semibold text-orange-800">⚠️ Insight Penting</p>
          <p className="mt-1 text-sm leading-relaxed text-orange-700">
            Level aktivitas influenza didominasi {levelInfo.sort((a,b) => b.total - a.total)[0]?.label ?? '-'} ({levelInfo.sort((a,b) => b.total - a.total)[0]?.percent ?? 0}%).
            Dots: biru = Di Luar Musim, hijau = Rendah, kuning = Sedang, merah = Tinggi.
          </p>
        </div>

        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-xs font-semibold text-red-800">⚠️ Keterbatasan Data — Case Fatality Rate (CFR)</p>
          <p className="text-xs leading-relaxed text-red-700">
            Case Fatality Rate (CFR) / angka fatalitas kasus <strong>tidak dapat dihitung</strong> karena data kematian COVID-19 per minggu tidak tersedia dalam laporan pengawasan. 
            Indikator ini tidak dapat ditampilkan dalam dashboard.
          </p>
        </div>
      </article>
    </section>
  )
}
