'use client'

import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useState } from 'react'
import type { AspectScore } from './types'

type ScoreSectionProps = {
  aspectScores: AspectScore[]
  trend: Array<{
    year: string
    value: number
  }>
  starDistribution: Array<{
    label: string
    total: number
    percent: number
    tone: string
  }>
}

const toneToHex: Record<string, string> = {
  'bg-emerald-500': '#10b981',
  'bg-lime-500': '#84cc16',
  'bg-yellow-500': '#eab308',
  'bg-orange-500': '#f97316',
  'bg-red-500': '#ef4444',
  'bg-teal-600': '#0d9488',
  'bg-cyan-600': '#0891b2',
  'bg-green-600': '#16a34a',
  'bg-pink-600': '#db2777',
  'bg-sky-500': '#0ea5e9',
}

export default function ScoreSection({ aspectScores, starDistribution, trend }: ScoreSectionProps) {
  const [activePieIndex, setActivePieIndex] = useState<number | null>(null)
  const [activeBarIndex, setActiveBarIndex] = useState<number | null>(null)

  const pieData = starDistribution.map((item) => ({
    ...item,
    color: toneToHex[item.tone] ?? '#94a3b8',
  }))
  const totalCampus = starDistribution.reduce((acc, item) => acc + item.total, 0)
  const barData = aspectScores.map((item, idx) => ({
    id: idx,
    name: item.label,
    value: item.value,
    color: toneToHex[item.tone] ?? '#0ea5e9',
  }))
  const trendData = trend.map((item) => ({ ...item }))
  const maxTrend = Math.max(...trendData.map((item) => item.value))

  return (
    <section className="px-4 pb-5 md:px-6">
      <div className="grid gap-4 xl:grid-cols-3">
        <article className="rounded-2xl border border-[#d5e6e5] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold uppercase tracking-[0.04em] text-slate-900">Distribusi Level Aktivitas</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">Proporsi mingguan level aktivitas influenza.</p>
          <div className="mt-3 grid grid-cols-[168px_1fr] items-center gap-2">
            <div className="relative h-[168px] w-[168px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="total"
                    innerRadius={46}
                    outerRadius={62}
                    paddingAngle={2}
                    animationDuration={550}
                    onMouseEnter={(_, index) => setActivePieIndex(index)}
                    onMouseLeave={() => setActivePieIndex(null)}
                    onClick={(_, index) => setActivePieIndex((prev) => (prev === index ? null : index))}
                  >
                    {pieData.map((entry, index) => (
                      <Cell
                        key={entry.label}
                        fill={entry.color}
                        fillOpacity={activePieIndex === null || activePieIndex === index ? 1 : 0.25}
                        style={{ transition: 'opacity 220ms ease' }}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
                <p className="text-xs text-slate-500">Total</p>
                <p className="text-3xl font-bold leading-none text-slate-800">{totalCampus.toLocaleString('id-ID')}</p>
                <p className="text-xs text-slate-500">Minggu</p>
              </div>
            </div>
            <div className="space-y-2">
              {pieData.map((item, index) => (
                <button
                  key={item.label}
                  type="button"
                  onMouseEnter={() => setActivePieIndex(index)}
                  onMouseLeave={() => setActivePieIndex(null)}
                  onClick={() => setActivePieIndex((prev) => (prev === index ? null : index))}
                  className={`flex w-full items-center justify-between rounded-md px-1.5 py-1 text-xs transition ${
                    activePieIndex === index ? 'bg-slate-100' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="font-medium text-slate-700">{item.label}</span>
                  </div>
                  <span className="font-semibold text-slate-800">
                    {item.total} ({item.percent}%)
                  </span>
                </button>
              ))}
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-[#d5e6e5] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold uppercase tracking-[0.04em] text-slate-900">Rata-rata Skor per Aspek</h2>
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Lihat Detail
            </button>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">Perbandingan nilai setiap aspek penilaian utama.</p>

          <div className="mt-2 h-[190px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 20, right: 0, left: -24, bottom: 0 }}>
                <XAxis dataKey="name" hide />
                <YAxis domain={[0, 1000]} tick={{ fontSize: 10 }} />
                <Tooltip cursor={{ fill: 'rgba(15,23,42,0.05)' }} />
                <Bar
                  dataKey="value"
                  radius={[4, 4, 0, 0]}
                  animationDuration={650}
                  onMouseEnter={(_, index) => setActiveBarIndex(index)}
                  onMouseLeave={() => setActiveBarIndex(null)}
                  onClick={(_, index) => setActiveBarIndex((prev) => (prev === index ? null : index))}
                >
                  {barData.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={entry.color}
                      fillOpacity={activeBarIndex === null || activeBarIndex === index ? 1 : 0.28}
                      style={{ transition: 'opacity 220ms ease, transform 220ms ease' }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 grid grid-cols-4 gap-x-2 gap-y-1 text-[10px] text-slate-600">
            {barData.map((item, index) => (
              <button
                key={item.name}
                type="button"
                onMouseEnter={() => setActiveBarIndex(index)}
                onMouseLeave={() => setActiveBarIndex(null)}
                onClick={() => setActiveBarIndex((prev) => (prev === index ? null : index))}
                className={`truncate text-left transition ${
                  activeBarIndex === index ? 'font-semibold text-slate-900' : 'hover:text-slate-900'
                }`}
              >
                {item.name}
              </button>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-[#d5e6e5] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold uppercase tracking-[0.04em] text-slate-900">Tren Skor Rata-rata Nasional</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">Pergerakan skor nasional dari tahun ke tahun.</p>
          <div className="mt-4 flex h-[240px] items-end gap-3">
            {trendData.map((item) => (
              <div key={item.year} className="flex flex-1 flex-col items-center gap-2">
                <div className="text-xs font-semibold text-slate-700">{item.value}</div>
                <div className="flex h-36 w-full items-end rounded-md bg-slate-100">
                  <div
                    className="w-full rounded-md bg-gradient-to-t from-teal-600 to-cyan-500 transition-all duration-500"
                    style={{ height: `${(item.value / maxTrend) * 100}%` }}
                  />
                </div>
                <div className="text-xs text-slate-500">{item.year}</div>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  )
}
