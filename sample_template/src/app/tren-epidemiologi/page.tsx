'use client'

import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useState } from 'react'
import InfoButton from '@/components/layout/InfoButton'
import DataModal from '@/components/layout/DataModal'
import dashboardData from '@/components/dashboard-campus/dashboard-data.json'

type WP = { minggu: string; kasus: number; pemeriksaan: number }
type WPR = { minggu: string; value: number }
type YItem = { name: string; value: number }
type DData = {
  trend: Array<{ year: string; value: number }>
  metrics: Array<{ title: string; value: string; delta: string }>
  aspectScores: Array<{ label: string; value: number }>
  weeklyPositives?: WP[]
  weeklyPR_Influenza?: WPR[]
  y2025avg?: YItem[]
  y2026avg?: YItem[]
  [key: string]: unknown
}
const dd = dashboardData as unknown as DData

const normalizeMinggu = (m: string): string => {
  const m2 = m.match(/M(\d+)\/(\d+)/)
  if (!m2) return m
  return `M${m2[1].padStart(2, '0')}/${m2[2].length === 2 ? '20' + m2[2] : m2[2]}`
}

const trendData = dd.trend.map(t => ({ minggu: normalizeMinggu(t.year), prCovid: t.value }))
const prInflData = (dd.weeklyPR_Influenza ?? []).map(w => ({ minggu: normalizeMinggu(w.minggu), prInflu: w.value }))
const kasusData = (dd.weeklyPositives ?? []).map(w => ({ minggu: normalizeMinggu(w.minggu), kasus: w.kasus }))
const avgInfl = dd.aspectScores.find(a => a.label === 'Positivity Rate Influenza')?.value ?? 0

// Merge trend + PR influenza into one dataset for line chart
const allMinggu = new Set<string>()
const mergedMap = new Map<string, { minggu: string; prCovid: number; prInflu: number }>()
trendData.forEach(t => { allMinggu.add(t.minggu) })
prInflData.forEach(p => { allMinggu.add(p.minggu) })
allMinggu.forEach(m => {
  mergedMap.set(m, {
    minggu: m,
    prCovid: trendData.find(t => t.minggu === m)?.prCovid ?? 0,
    prInflu: prInflData.find(p => p.minggu === m)?.prInflu ?? 0,
  })
})
const mergedTrend = Array.from(mergedMap.values())

export default function TrenEpidemiologiPage() {
  const [yearFilter, setYearFilter] = useState('all')
  const [modalCard, setModalCard] = useState<string | null>(null)
  const latest = dd.metrics
  const covidMetric = latest.find(m => m.title === 'Positivity Rate COVID-19')
  const kasusMetric = latest.find(m => m.title === 'Kasus Positif COVID-19')
  const fluMetric = latest.find(m => m.title === 'Positivity Rate Influenza')

  const matchesFilter = (minggu: string) => {
    if (yearFilter === 'all') return true
    return minggu.includes(yearFilter)
  }

  const y25avg = (dd as any).y2025avg ?? []
  const y26avg = (dd as any).y2026avg ?? []
  const y25flu = y25avg.find((a: any) => a.name === 'PR Influenza')?.value ?? 0
  const y26flu = y26avg.find((a: any) => a.name === 'PR Influenza')?.value ?? 0
  const y25covid = y25avg.find((a: any) => a.name === 'PR COVID-19')?.value ?? 0
  const y26covid = y26avg.find((a: any) => a.name === 'PR COVID-19')?.value ?? 0
  const y25kasus = (dd as any).weeklyPositives?.filter((w: any) => w.minggu.includes('2025')).reduce((a: number, w: any) => a + w.kasus, 0) ?? 0
  const y26kasus = (dd as any).weeklyPositives?.filter((w: any) => w.minggu.includes('2026')).reduce((a: number, w: any) => a + w.kasus, 0) ?? 0
  const y25weeks = (dd as any).trend?.filter((t: any) => t.year.includes('2025')).length ?? 0
  const y26weeks = (dd as any).trend?.filter((t: any) => t.year.includes('2026')).length ?? 0

  const cardVals = yearFilter === '2025'
    ? [
        { t: 'PR Influenza (2025)', v: `${y25flu.toFixed(1)}%`, d: `Rata-rata ${y25weeks} minggu`, c: 'bg-amber-100 text-amber-700' },
        { t: 'PR COVID-19 (2025)', v: `${y25covid.toFixed(1)}%`, d: `Rata-rata ${y25weeks} minggu`, c: 'bg-teal-100 text-teal-700' },
        { t: 'Kasus Positif 2025', v: `${y25kasus}`, d: `Total ${y25weeks} minggu`, c: 'bg-violet-100 text-violet-700' },
        { t: 'Rentang 2025', v: `${y25weeks} mgg`, d: `M01/2025 – M53/2025`, c: 'bg-cyan-100 text-cyan-700' },
      ]
    : yearFilter === '2026'
    ? [
        { t: 'PR Influenza (2026)', v: `${y26flu.toFixed(1)}%`, d: `Rata-rata ${y26weeks} minggu`, c: 'bg-amber-100 text-amber-700' },
        { t: 'PR COVID-19 (2026)', v: `${y26covid.toFixed(1)}%`, d: `Rata-rata ${y26weeks} minggu`, c: 'bg-teal-100 text-teal-700' },
        { t: 'Kasus Positif 2026', v: `${y26kasus}`, d: `Total ${y26weeks} minggu`, c: 'bg-violet-100 text-violet-700' },
        { t: 'Rentang 2026', v: `${y26weeks} mgg`, d: `M01/2026 – M23/2026`, c: 'bg-cyan-100 text-cyan-700' },
      ]
    : [
        { t: 'PR Influenza (rata-rata)', v: `${avgInfl.toFixed(1)}%`, d: `Terkini: ${fluMetric?.value ?? '-'} | Rata-rata seluruh minggu`, c: 'bg-amber-100 text-amber-700' },
        { t: 'PR COVID-19 Terkini', v: covidMetric?.value ?? '-', d: covidMetric?.delta ?? '', c: 'bg-teal-100 text-teal-700' },
        { t: 'Kasus Positif Minggu Ini', v: kasusMetric?.value ?? '-', d: kasusMetric?.delta ?? '', c: 'bg-violet-100 text-violet-700' },
        { t: 'Rentang Data', v: `${mergedTrend.length} mgg`, d: `${mergedTrend[0]?.minggu ?? ''} – ${mergedTrend[mergedTrend.length - 1]?.minggu ?? ''}`, c: 'bg-cyan-100 text-cyan-700' },
      ]

  const filteredTrend = mergedTrend.filter(d => matchesFilter(d.minggu))
  const filteredKasus = kasusData.filter(d => matchesFilter(d.minggu))
  const wpi = dd.weeklyPR_Influenza ?? []

  const getModalRows = (cardTitle: string): Array<{ label: string; value: string | number; extra?: string }> => {
    if (cardTitle.includes('PR Influenza'))
      return wpi.filter(w => matchesFilter(w.minggu)).map(w => ({ label: w.minggu, value: `${w.value}%` }))
    if (cardTitle.includes('PR COVID-19'))
      return dd.trend.filter(t => matchesFilter(t.year)).map(t => ({ label: t.year, value: `${t.value}%` }))
    if (cardTitle.includes('Kasus Positif'))
      return (dd as any).weeklyPositives?.filter((w: any) => matchesFilter(w.minggu)).map((w: any) => ({ label: w.minggu, value: w.kasus, extra: `dari ${w.pemeriksaan} periksa` })) ?? []
    if (cardTitle.includes('Rentang'))
      return [
        { label: 'Total minggu pengawasan', value: `${mergedTrend.length} minggu` },
        { label: 'PR COVID-19', value: `${dd.trend.length} titik` },
        { label: 'PR Influenza', value: `${(dd.weeklyPR_Influenza ?? []).length} titik` },
        { label: 'Kasus Positif COVID-19', value: `${(dd as any).weeklyPositives?.length ?? 0} titik` },
        { label: 'Tahun 2025', value: `${dd.trend.filter(t => t.year.includes('2025')).length} minggu` },
        { label: 'Tahun 2026', value: `${dd.trend.filter(t => t.year.includes('2026')).length} minggu` },
        { label: 'Rentang', value: `${mergedTrend[0]?.minggu ?? ''} – ${mergedTrend[mergedTrend.length - 1]?.minggu ?? ''}` },
      ]
    return []
  }

  return (
    <section className="space-y-4 px-4 pb-8 md:px-6">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
        <p className="text-xs font-semibold text-amber-800">⚠️ Keterbatasan Data</p>
        <p className="text-xs leading-relaxed text-amber-700">
          Data kasus aktif, kasus sembuh, dan kasus kematian tidak tersedia dalam sumber laporan pengawasan.
          Dashboard ini menampilkan <strong>positivity rate</strong> dan <strong>jumlah kasus baru</strong>.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-[#d5e6e5] bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 text-lg">📈</span>
          <div className="min-w-0">
            <p className="text-sm font-bold uppercase tracking-[0.04em] text-slate-900">Ringkasan Eksekutif — Tren Epidemiologi</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              PR COVID-19 terkini {covidMetric?.value ?? '-'} | PR Influenza rata-rata <strong>{avgInfl.toFixed(1)}%</strong>.
              Data kasus aktif, sembuh, kematian tidak tersedia dari sumber.
            </p>
          </div>
        </div>
        <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none ring-teal-200 transition focus:ring-2">
          <option value="all">Semua Tahun</option>
          <option value="2025">2025</option>
          <option value="2026">2026</option>
        </select>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cardVals.map(card => (
          <article key={card.t} className="rounded-2xl border border-[#cfe3e2] bg-white p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">{card.t}</p>
            <button type="button" onClick={() => setModalCard(card.t)} className="mt-1 w-fit text-left text-3xl font-extrabold leading-[0.95] tracking-tight text-slate-800 transition hover:text-teal-700">{card.v}</button>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">{card.d}</p>
          </article>
        ))}
      </div>
      <DataModal open={modalCard !== null} onClose={() => setModalCard(null)} title={modalCard ?? ''} rows={getModalRows(modalCard ?? '')} />

      <article className="rounded-2xl border border-[#d5e6e5] bg-white p-5 shadow-sm">
        <h2 className="text-[22px] font-bold uppercase tracking-[0.04em] text-slate-900 inline-flex items-center gap-2">Tren Positivity Rate <InfoButton data={{source: 'Tabel Influenza + COVID-19 Activity → kolom Keterangan', calc: 'Nilai "menjadi X%" diekstrak dari teks per minggu'}} /></h2>
        <p className="mt-1 text-base leading-relaxed text-slate-500">PR COVID-19 dan PR Influenza per minggu ({mergedTrend.length} titik).</p>
        <p className="mt-1 text-xs text-amber-600">⚠️ Tidak ada data M02/2025 – M27/2025; garis langsung dari M01 ke M28.</p>
        <div className="mt-4 h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={filteredTrend} margin={{ top: 30, right: 30, left: 0, bottom: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="minggu" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} angle={-45} textAnchor="end" height={80} interval={0} />
              <YAxis domain={[0, 60]} tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Legend />
              <Line type="monotone" dataKey="prCovid" name="PR COVID-19" stroke="#0d9488" strokeWidth={2} dot={false} />{/* ponytail: blue-teal for COVID */}
              <Line type="monotone" dataKey="prInflu" name="PR Influenza" stroke="#f97316" strokeWidth={2} dot={false} />{/* ponytail: orange solid for flu */}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="rounded-2xl border border-[#d5e6e5] bg-white p-5 shadow-sm">
        <h2 className="text-[22px] font-bold uppercase tracking-[0.04em] text-slate-900 inline-flex items-center gap-2">Kasus Positif COVID-19 per Minggu <InfoButton data={{source: 'Poin Utama → "terdapat X kasus positif"', calc: 'Angka langsung dari laporan mingguan'}} /></h2>
        <p className="mt-1 text-base leading-relaxed text-slate-500">Jumlah kasus positif baru per minggu ({filteredKasus.length} minggu).</p>
        <div className="mt-4 h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={filteredKasus} margin={{ top: 20, right: 30, left: 0, bottom: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="minggu" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} angle={-45} textAnchor="end" height={80} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v) => `${v} kasus`} />
              <Bar dataKey="kasus" name="Kasus Positif" fill="#0d9488" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>

      <div className="grid gap-3 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">Kasus Aktif</p>
          <p className="mt-2 text-lg font-extrabold text-slate-400">Tidak Tersedia</p>
          <p className="mt-1 text-xs text-slate-300">Data tidak dirilis dalam laporan</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">Kasus Sembuh</p>
          <p className="mt-2 text-lg font-extrabold text-slate-400">Tidak Tersedia</p>
          <p className="mt-1 text-xs text-slate-300">Data tidak dirilis dalam laporan</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">Kasus Meninggal</p>
          <p className="mt-2 text-lg font-extrabold text-slate-400">Tidak Tersedia</p>
          <p className="mt-1 text-xs text-slate-300">Data tidak dirilis dalam laporan</p>
        </article>
      </div>
    </section>
  )
}
