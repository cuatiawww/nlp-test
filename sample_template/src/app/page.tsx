'use client'

import { useEffect, useState } from 'react'
import { Line, LineChart, ResponsiveContainer } from 'recharts'
import { AlertTriangle, Bell, Eye, FileText, MapPinned, Sparkles, Star, TrendingUp, X } from 'lucide-react'
import rawData from '@/components/dashboard-campus/dashboard-data.json'
import ProvinceMapOlComponent from '@/components/dashboard-campus/ProvinceMapOl'
import InfoButton from '@/components/layout/InfoButton'
import DataModal from '@/components/layout/DataModal'

type MetricCard = {
  title: string
  value: string
  delta: string
  icon: string
  iconTone: string
}

type SidebarMenuGroup = {
  title: string
  items: Array<{
    label: string
    iconKey: string
    active?: boolean
  }>
}

type AspectScore = {
  label: string
  value: number
  tone: string
}

type DashboardData = {
  greeting: { title: string; subtitle: string }
  metrics: Array<{ title: string; value: string; delta: string; iconKey: string; iconTone: string }>
  summary: { average: string; category: string; delta: string; latest?: string }
  aspectScores: AspectScore[]
  starDistribution: Array<{ label: string; total: number; percent: number; tone: string }>
  trend: Array<{ year: string; value: number }>
  provinces: string[]
  sourceInfo: { sourceLabel: string; sourceValue: string; dateLabel: string; dateValue: string }
  sidebarMenu: SidebarMenuGroup[]
  notifications: Array<{ text: string }>
  weeklyPositives?: Array<{ minggu: string; kasus: number; pemeriksaan: number }>
  weeklyPR_Influenza?: Array<{ minggu: string; value: number }>
  weeklyLevels?: Array<{ minggu: string; level: string }>
  y2025avg?: Array<{ name: string; value: number }>
  y2026avg?: Array<{ name: string; value: number }>
}

type ProvinceMapDetail = {
  province: string
  totalCampus: number
  averageScore: number
  category: string
  verified: number
  reportCompletion: number
  priorityCampus: number
  recommendation: string
}

type PtCategoryItem = {
  label: string
  total: number
  description: string
  color: string
}

const dashboardData = rawData as DashboardData

const outlineActionButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold uppercase tracking-[0.03em] text-slate-600 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700'

function getAiRecommendationSections(data: DashboardData) {
  const fluPR = data.aspectScores.find(a => a.label === 'Positivity Rate Influenza')?.value ?? 0
  const covidPR = data.aspectScores.find(a => a.label === 'Positivity Rate COVID-19')?.value ?? 0
  const rsvPct = data.aspectScores.find(a => a.label === 'Proporsi RSV')?.value ?? 0
  const multiPct = data.aspectScores.find(a => a.label === 'Multipatogen Lainnya')?.value ?? 0
  const latestFluPR = data.metrics.find(m => m.title === 'Positivity Rate Influenza')?.value ?? ''
  const latestCovidPR = data.metrics.find(m => m.title === 'Positivity Rate COVID-19')?.value ?? ''
  return [
    {
      eyebrow: 'GAP ANALISIS MINGGUAN',
      title: 'Positivity Rate Influenza dan COVID-19 fluktuatif antar minggu.',
      body:
        `Pemantauan mingguan menunjukkan bahwa positivity rate influenza mengalami fluktuasi antara 0% hingga 55% sepanjang periode pengawasan, dengan rata-rata nasional ${fluPR.toFixed(1)}%. COVID-19 positivity rate lebih stabil di kisaran 0-18% dengan rata-rata ${covidPR.toFixed(1)}%. Pola musiman dan peningkatan kasus pada kelompok usia tertentu perlu menjadi perhatian dalam perencanaan intervensi kesehatan masyarakat.`,
    },
    {
      eyebrow: 'TEMUAN UTAMA',
      title: 'Multipatogen dan RSV menunjukkan tren peningkatan perlu diwaspadai.',
      body:
        `Proporsi Multipatogen Lainnya tercatat ${multiPct.toFixed(0)}% rata-rata, menunjukkan sirkulasi multipatogen yang tinggi di masyarakat. Sementara itu, proporsi RSV fluktuatif antara 0%-57% dengan rata-rata ${rsvPct.toFixed(0)}%. Aktivitas influenza secara nasional masih dalam kategori rendah, namun positivity rate influenza meningkat menjadi ${latestFluPR} dalam sepekan terakhir yang perlu diantisipasi.`,
    },
  ]
}

const aiInstitutionRecommendations = [
  {
    label: 'Dinas Kesehatan Provinsi',
    text:
      'Dinkes provinsi perlu memperkuat surveilans influenza dan COVID-19 di sentinel-sentinel fasilitas pelayanan kesehatan yaitu di 39 Puskesmas, 35 Rumah Sakit dan 14 Balai Karantina Kesehatan. Pemantauan dilakukan untuk monitoring kasus dan karakteristik virus serta gejala keparahannya secara berkesinambungan.',
  },
  {
    label: 'Laboratorium Kesehatan Masyarakat',
    text:
      'Laboratorium perlu memastikan konsistensi pemeriksaan multipatogen untuk mendeteksi Influenza, SARS-CoV-2, RSV, dan patogen pernapasan lainnya. Pemeriksaan molekuler dan identifikasi varian sangat penting untuk memahami dinamika epidemiologi dan memberikan rekomendasi berbasis bukti.',
  },
]

const ptCategoryBreakdown: PtCategoryItem[] = dashboardData.starDistribution.map((s) => ({
  label: s.label,
  total: s.total,
  description:
    s.label === 'Aktivitas Rendah'
      ? 'Tingkat aktivitas influenza rendah, situasi terkendali.'
      : s.label === 'Di Luar Musim'
        ? 'Aktivitas influenza di luar musim, tidak ada peningkatan signifikan.'
        : 'Aktivitas influenza pada level sedang, perlu pemantauan.',
  color: s.tone === 'bg-emerald-500' ? '#10b981' : s.tone === 'bg-lime-500' ? '#84cc16' : '#eab308',
}))

function getProvinceName(properties: Record<string, unknown>) {
  const candidates = ['name', 'NAME_1', 'PROPINSI', 'PROVINSI', 'province', 'WADMPR']
  for (const key of candidates) {
    const value = properties[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

const KNOWN_MAP_PROVINCES = new Set([
  'jawa timur', 'kalimantan selatan', 'dki jakarta', 'jakarta',
  'jawa barat', 'banten', 'sumatera selatan', 'di yogyakarta',
  'yogyakarta', 'jawa tengah', 'kepulauan riau', 'bali',
])

function getProvinceMapDetail(province: string, _index: number): ProvinceMapDetail {
  const known = KNOWN_MAP_PROVINCES.has(province.toLowerCase().trim())
  return {
    province,
    totalCampus: 0,
    averageScore: 0,
    category: known ? 'DATA TERSEDIA' : 'TIDAK ADA DATA',
    verified: 0,
    reportCompletion: 0,
    priorityCampus: 0,
    recommendation: known
      ? 'Provinsi tercatat dalam laporan pengawasan nasional.'
      : 'Data surveilans untuk provinsi ini belum tersedia.',
  }
}

// ─────────────────────────────────────────────
// DSS DATA
// ─────────────────────────────────────────────
const ds = dashboardData.metrics
const latestFluPR = ds.find((m) => m.title === 'Positivity Rate Influenza')?.value ?? ''
const latestCovidPR = ds.find((m) => m.title === 'Positivity Rate COVID-19')?.value ?? ''
const latestExams = ds.find((m) => m.title === 'Total Pemeriksaan COVID-19')?.value ?? ''
const latestPositive = ds.find((m) => m.title === 'Kasus Positif COVID-19')?.value ?? ''
const dssMeta = dashboardData.aspectScores.reduce<Record<string, number>>((acc, a) => {
  acc[a.label] = a.value; return acc
}, {})
const dssNotifications = dashboardData.notifications.map((n) => n.text).filter(Boolean)
const multiPct = dssMeta['Multipatogen Lainnya'] ?? 0
const fluPct = dssMeta['Positivity Rate Influenza'] ?? 0
const iliPct = dssMeta['Proporsi ILI'] ?? 0

const dssInsights = [
  {
    id: 1,
    type: 'warning',
    icon: AlertTriangle,
    iconColor: 'text-orange-500',
    iconBg: 'bg-orange-50',
    title: 'Positivity Rate Influenza minggu ini',
    highlight: latestFluPR,
    action: 'Perlu pemantauan ketat.',
  },
  {
    id: 2,
    type: 'info',
    icon: Star,
    iconColor: 'text-yellow-500',
    iconBg: 'bg-yellow-50',
    title: 'Rata-rata Multipatogen',
    highlight: `${multiPct.toFixed(1)}%`,
    action: 'Waspada sirkulasi multipatogen.',
  },
  {
    id: 3,
    type: 'alert',
    icon: MapPinned,
    iconColor: 'text-red-500',
    iconBg: 'bg-red-50',
    title: 'Total kasus positif COVID-19 kumulatif',
    highlight: `${latestPositive} dari ${latestExams} pemeriksaan`,
    action: 'Lanjutkan testing dan tracing.',
  },
  {
    id: 4,
    type: 'trend',
    icon: TrendingUp,
    iconColor: 'text-teal-600',
    iconBg: 'bg-teal-50',
    title: 'Rata-rata Proporsi ILI keseluruhan',
    highlight: `${iliPct.toFixed(2)}%`,
    action: 'Pantau perkembangan kasus ILI mingguan.',
  },
  {
    id: 5,
    type: 'info',
    icon: FileText,
    iconColor: 'text-indigo-600',
    iconBg: 'bg-indigo-50',
    title: 'Rata-rata Insidens Influenza',
    highlight: `PR COVID-19: ${latestCovidPR}, PR Influenza: ${latestFluPR}`,
    action: 'Lanjutkan surveilans.',
  },
  {
    id: 6,
    type: 'info',
    icon: FileText,
    iconColor: 'text-indigo-600',
    iconBg: 'bg-indigo-50',
    title: 'Peringatan terbaru',
    highlight: dssNotifications[0] ?? 'Tidak ada peringatan aktif',
    action: 'Pantau dashboard secara berkala.',
  },
]

const ewMultiPct = dssMeta['Multipatogen Lainnya'] ?? 0
const ewFluPct = dssMeta['Positivity Rate Influenza'] ?? 0
const ewRsvPct = dssMeta['Proporsi RSV'] ?? 0
const earlyWarnings = [
  { label: `PR Influenza (rata-rata ${ewFluPct.toFixed(1)}%)`, value: Math.round(ewFluPct), color: ewFluPct > 20 ? '#ef4444' : '#22c55e' },
  { label: `Multipatogen (rata-rata ${ewMultiPct.toFixed(0)}%)`, value: Math.round(ewMultiPct), color: ewMultiPct > 100 ? '#ef4444' : '#22c55e' },
  { label: `RSV (rata-rata ${ewRsvPct.toFixed(0)}%)`, value: Math.round(ewRsvPct), color: ewRsvPct > 0 ? '#eab308' : '#22c55e' },
  { label: 'ILI Proporsi', value: Math.round(iliPct * 100), color: '#0891b2' },
]

const rekomendasiPrioritas = dashboardData.aspectScores.map((a, i) => ({
  label: a.label,
  value: a.value,
  priority: a.value > 50 ? 'WASPADA' : a.value > 10 ? 'NORMAL' : 'RENDAH',
  impact: Math.max(1, Math.min(100, Math.round(Math.abs(a.value) * 2))),
  color: a.value > 50 ? '#ef4444' : a.value > 10 ? '#f59e0b' : '#22c55e',
  tone: a.value > 50 ? 'text-red-600' : a.value > 10 ? 'text-amber-600' : 'text-emerald-600',
}))

// ─────────────────────────────────────────────
// DATA INDIKATOR UTAMA
// ─────────────────────────────────────────────
const indikatorUtamaData = dashboardData.aspectScores.map((a, i) => ({
  no: i + 1,
  name: a.label,
  skor: a.value,
  kategori: a.label,
  prioritas: a.value > 50 ? 'WASPADA' : a.value > 10 ? 'NORMAL' : 'RENDAH',
}))

function DecisionSupportSection() {
  const [activeTab, setActiveTab] = useState<'insight' | 'warning'>('insight')

  return (
    <article className="rounded-2xl border border-[#d5e6e5] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[20px] font-bold uppercase tracking-[0.04em] text-slate-900">Insight Positivity Rate</h2>
        </div>
        <button type="button" className={`${outlineActionButtonClass} shrink-0 whitespace-nowrap`}>
          <Eye className="h-4 w-4" />LIHAT DETAIL
        </button>
      </div>
      <p className="mt-1 text-[15px] leading-relaxed text-slate-500">Ringkasan insight dan peringatan dini dari data surveilans mingguan.</p>

      {/* Tabs */}
      <div className="mt-3 flex gap-1 rounded-xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setActiveTab('insight')}
          className={`inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[13px] font-bold uppercase tracking-[0.02em] transition ${activeTab === 'insight' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          <span className="whitespace-nowrap">Insight Terkini</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('warning')}
          className={`inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[13px] font-bold uppercase tracking-[0.02em] transition ${activeTab === 'warning' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Bell className="h-4 w-4 shrink-0" />
          <span className="whitespace-nowrap">Peringatan Dini</span>
        </button>
      </div>

      {activeTab === 'insight' ? (
        <div className="mt-3 space-y-2">
          {dssInsights.slice(0, 4).map((item) => {
            const Icon = item.icon
            return (
              <div key={item.id} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${item.iconBg}`}>
                  <Icon className={`h-4 w-4 ${item.iconColor}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] leading-relaxed text-slate-700">
                    {item.title}
                    {item.highlight ? <span className="font-semibold text-slate-900"> {item.highlight}</span> : null}
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-teal-700">{item.action}</p>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {earlyWarnings.map((item) => (
            <div key={item.label} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-3">
              <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
              <p className="flex-1 text-[15px] text-slate-700">{item.label}</p>
              <span className="rounded-full px-2 py-0.5 text-[13px] font-bold text-white" style={{ backgroundColor: item.color }}>
                {item.value}%
              </span>
            </div>
          ))}
          <p className="mt-1 text-[13px] text-slate-400">*Data diperbarui secara berkala berdasarkan laporan masuk.</p>
        </div>
      )}
    </article>
  )
}

// ─────────────────────────────────────────────
// NEW: KAMPUS PRIORITAS PENDAMPINGAN SECTION
// ─────────────────────────────────────────────
function KampusPrioritasSection({ onDetail }: { onDetail?: () => void }) {
  return (
    <article className="rounded-2xl border border-[#d5e6e5] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-[20px] font-bold uppercase tracking-[0.04em] text-slate-900">Minggu dengan Perubahan Signifikan</h2>
        </div>
        <button type="button" onClick={onDetail} className={`${outlineActionButtonClass} shrink-0 whitespace-nowrap`}>
          <Eye className="h-4 w-4" />LIHAT DETAIL
        </button>
      </div>
      <p className="mt-1 text-[15px] leading-relaxed text-slate-500">Minggu-minggu dengan nilai positivity rate atau proporsi tertinggi yang perlu diwaspadai.</p>

      <div className="mt-3 overflow-hidden rounded-xl border border-slate-100">
        <table className="w-full text-[15px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-2.5 py-2 text-left text-sm font-semibold text-slate-500">Indikator / Minggu</th>
              <th className="px-2.5 py-2 text-center text-sm font-semibold text-slate-500">Nilai</th>
              <th className="px-2.5 py-2 text-center text-sm font-semibold text-slate-500">Indikator</th>
              <th className="px-2.5 py-2 text-center text-sm font-semibold text-slate-500">Status</th>
            </tr>
          </thead>
          <tbody>
            {indikatorUtamaData.slice(0, 6).map((row, i) => (
              <tr key={row.no} className={`border-b border-slate-50 transition hover:bg-teal-50/40 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                <td className="px-2.5 py-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[12px] font-bold text-slate-500">{row.no}</span>
                    <span className="font-medium leading-snug text-slate-800">{row.name}</span>
                  </div>
                </td>
                <td className="px-2.5 py-2 text-center font-bold text-slate-800">{row.skor}</td>
                <td className="px-2.5 py-2 text-center">
                  <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-yellow-200 bg-yellow-50 px-1.5 py-0.5 text-[12px] font-semibold leading-none text-yellow-700">
                    {row.kategori}
                  </span>
                </td>
                <td className="px-2.5 py-2 text-center">
                  <span className={`inline-block rounded-full px-1.5 py-0.5 text-[12px] font-bold leading-none ${row.prioritas === 'WASPADA' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                    {row.prioritas}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  )
}

// ─────────────────────────────────────────────
// INDEPENDEN: CARD BARU — REKOMENDASI PRIORITAS
// ─────────────────────────────────────────────
function RekomendasiPrioritasSection({ onDetail }: { onDetail?: () => void }) {
  return (
    <article className="rounded-2xl border border-[#d5e6e5] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-[20px] font-bold uppercase tracking-[0.04em] text-slate-900">Indikator Prioritas Pemantauan</h2>
        </div>
        <button type="button" onClick={onDetail} className={`${outlineActionButtonClass} shrink-0 whitespace-nowrap`}>
          <Eye className="h-4 w-4" />DETAIL
        </button>
      </div>
      <p className="mt-1 text-[15px] leading-relaxed text-slate-500">Indikator surveilans dengan dampak terbesar yang perlu dipantau secara ketat.</p>

      <div className="mt-3 space-y-2">
        {rekomendasiPrioritas.map((item, index) => (
          <div key={item.label} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-[0_1px_8px_rgba(15,23,42,0.04)]">
            <div className="flex items-start gap-3">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-extrabold"
                style={{ backgroundColor: `${item.color}12`, color: item.color }}
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-800">{item.label}</p>
                <div className="mt-1 flex items-center gap-3 text-[13px]">
                  <span className="text-slate-500">
                    Prioritas: <strong className={item.tone}>{item.priority}</strong>
                  </span>
                  <span className="text-slate-500">Dampak</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[#0f8f7f] transition-[width] duration-700"
                      style={{ width: `${item.impact}%` }}
                    />
                  </div>
                  <span className="w-9 text-right text-[13px] font-bold text-teal-700">{item.impact}%</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </article>
  )
}

function DecisionSupportSystemIntro() {
  return (
    <section className="px-4 pb-5 md:px-6">
      <div className="relative overflow-hidden rounded-2xl border border-[#bfe3e2] bg-white shadow-sm">
        <div className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-95" style={{ backgroundImage: "url('/bg header.png')" }} />
        <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/84 to-white/92" />
        <div className="relative px-5 py-5 md:px-6">
          <div className="max-w-5xl">
            <h2 className="mt-1 text-[28px] font-extrabold uppercase leading-tight tracking-normal text-slate-900">
              Temuan Utama Surveilans
            </h2>
            <p className="mt-2 max-w-4xl text-base leading-relaxed text-slate-600">
              Ringkasan insight, minggu signifikan, dan proyeksi tren untuk pemantauan kasus Influenza dan COVID-19.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function AnalyticsSection({ onSignifikanDetail, onRekomendasiDetail }: { onSignifikanDetail?: () => void; onRekomendasiDetail?: () => void }) {
  return (
    <section className="px-4 pb-8 md:px-6">
      <div className="grid gap-4 md:grid-cols-1 xl:grid-cols-3">
        <DecisionSupportSection />
        <KampusPrioritasSection onDetail={onSignifikanDetail} />
        <RekomendasiPrioritasSection onDetail={onRekomendasiDetail} />
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// NEW: Detail modals
// ─────────────────────────────────────────────
function DetailModal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(8,36,36,0.38)] p-4 backdrop-blur-[2px]" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-[640px] max-h-[85vh] overflow-y-auto rounded-[24px] border border-[#d7eaea] bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.22)]" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h4 className="text-lg font-bold text-slate-900">{title}</h4>
          <button onClick={onClose} className="rounded-full bg-[#eff7f7] p-2 text-[#3a5050] hover:bg-[#d7eaea]" aria-label="Tutup"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// NEW: CSV download helper
// ─────────────────────────────────────────────
function downloadCSV(filename: string) {
  const headers = ['Indikator','Rata-rata','Status']
  const rows = dashboardData.aspectScores.map(a => [
    a.label,
    a.value.toFixed(1) + '%',
    a.value > 50 ? 'Waspada' : a.value > 10 ? 'Sedang' : 'Rendah',
  ])
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  a.click(); URL.revokeObjectURL(url)
}

// ─────────────────────────────────────────────
// NEW: Tren Epidemiologi section
// ─────────────────────────────────────────────
export default function HomePage() {
  const [selectedProvince, setSelectedProvince] = useState(dashboardData.provinces[0] ?? 'Semua Provinsi')
  const [modalCard, setModalCard] = useState<string | null>(null)
  const [signifikanDetailOpen, setSignifikanDetailOpen] = useState(false)
  const [rekomendasiDetailOpen, setRekomendasiDetailOpen] = useState(false)

  const dm = dashboardData.metrics
  const ds = dashboardData.aspectScores
  const fluAvg = ds.find(a => a.label === 'Positivity Rate Influenza')?.value ?? 0
  const covidAvg = ds.find(a => a.label === 'Positivity Rate COVID-19')?.value ?? 0
  const rsvAvg = ds.find(a => a.label === 'Proporsi RSV')?.value ?? 0
  const multiAvg = ds.find(a => a.label === 'Multipatogen Lainnya')?.value ?? 0
  const fluMetric = dm.find(m => m.title === 'Positivity Rate Influenza')
  const covidMetric = dm.find(m => m.title === 'Positivity Rate COVID-19')
  const aktivitasMetric = dm.find(m => m.title === 'Aktivitas Influenza')

  const wpi = (dashboardData as unknown as { weeklyPR_Influenza?: Array<{ minggu: string; value: number }> }).weeklyPR_Influenza ?? []
  const trend = (dashboardData as unknown as { trend: Array<{ year: string; value: number }> }).trend ?? []
  const wrsv = (dashboardData as unknown as { weeklyRSV?: Array<{ minggu: string; value: number }> }).weeklyRSV ?? []
  const wmulti = (dashboardData as unknown as { weeklyMultipatogen?: Array<{ minggu: string; value: number }> }).weeklyMultipatogen ?? []

  const getModalRows = (title: string): Array<{ label: string; value: string | number; extra?: string }> => {
    if (title === 'INFLUENZA') return wpi.map(w => ({ label: w.minggu, value: `${w.value}%` }))
    if (title === 'COVID-19') return trend.map(t => ({ label: t.year, value: `${t.value}%` }))
    if (title === 'RSV & MULTIPATOGEN') {
      const rows: Array<{ label: string; value: string | number; extra?: string }> = []
      wrsv.forEach(w => rows.push({ label: `RSV ${w.minggu}`, value: `${w.value}%` }))
      wmulti.forEach(w => rows.push({ label: `Multi ${w.minggu}`, value: `${w.value}%` }))
      return rows
    }
    return []
  }

  const starLevel: Record<string, number> = { 'RENDAH': 1, 'NORMAL': 2, 'SEDANG': 3, 'WASPADA': 4, 'TINGGI': 5 }
  const filled = starLevel[dashboardData.summary.category] ?? 3

  const SparkFlu = () => (
    <ResponsiveContainer width="100%" height={32}>
      <LineChart data={wpi} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <Line type="monotone" dataKey="value" stroke="#f97316" strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
  const SparkCovid = () => (
    <ResponsiveContainer width="100%" height={32}>
      <LineChart data={trend} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <Line type="monotone" dataKey="value" stroke="#0d9488" strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
  const SparkRSV = () => (
    <ResponsiveContainer width="100%" height={32}>
      <LineChart data={wrsv} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <Line type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )

  return (
    <>
      {/* ── 3 Balanced Cards ── */}
      <section className="px-4 pt-5 pb-1 md:px-6">
        <div className="grid gap-3 md:grid-cols-3">

          <article className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-orange-600">INFLUENZA</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-800">{fluAvg.toFixed(1)}%</span>
              <span className="text-sm text-slate-500">rata-rata</span>
            </div>
            <p className="text-sm text-slate-600">Terkini: <strong>{fluMetric?.value ?? '-'}</strong></p>
            <p className="text-sm text-slate-600">Level: <strong>{aktivitasMetric?.value ?? '-'}</strong></p>
            <div className="mt-2"><SparkFlu /></div>
            <p className="mt-0.5 text-[11px] text-slate-400">Tren 50 minggu</p>
            <button type="button" onClick={() => setModalCard('INFLUENZA')} className="mt-2 w-fit text-xs font-semibold text-orange-600 hover:text-orange-800 transition">Detail ▸</button>
          </article>

          <article className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 to-white p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-teal-600">COVID-19</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-800">{covidAvg.toFixed(1)}%</span>
              <span className="text-sm text-slate-500">rata-rata</span>
            </div>
            <p className="text-sm text-slate-600">Terkini: <strong>{covidMetric?.value ?? '-'}</strong></p>
            <p className="text-sm text-slate-600">Total Periksa: <strong>{dm.find(m => m.title === 'Total Pemeriksaan COVID-19')?.value ?? 0}</strong></p>
            <div className="mt-2"><SparkCovid /></div>
            <p className="mt-0.5 text-[11px] text-slate-400">Tren 50 minggu</p>
            <button type="button" onClick={() => setModalCard('COVID-19')} className="mt-2 w-fit text-xs font-semibold text-teal-600 hover:text-teal-800 transition">Detail ▸</button>
          </article>

          <article className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-violet-600">RSV &amp; MULTIPATOGEN</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-800">{rsvAvg.toFixed(1)}%</span>
              <span className="text-sm text-slate-500">RSV</span>
            </div>
            <p className="text-sm text-slate-600">Multipatogen: <strong>{multiAvg.toFixed(1)}%</strong></p>
            <p className="text-sm text-slate-600">{dashboardData.sourceInfo.dateValue}</p>
            <div className="mt-2"><SparkRSV /></div>
            <p className="mt-0.5 text-[11px] text-slate-400">Tren 50 minggu</p>
            <button type="button" onClick={() => setModalCard('RSV & MULTIPATOGEN')} className="mt-2 w-fit text-xs font-semibold text-violet-600 hover:text-violet-800 transition">Detail ▸</button>
          </article>

        </div>
      </section>

      {/* ── Green Card + Map ── */}
      <section className="px-4 pb-3 md:px-6">
        <div className="grid gap-3 xl:grid-cols-[280px_1fr]">
          <article className="rounded-xl bg-gradient-to-br from-teal-700 to-cyan-700 p-5 text-white shadow-md">
            <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-teal-100">Positivity Rate COVID-19 Terkini</p>
            <p className="mt-3 text-5xl font-bold leading-none text-white">{dashboardData.summary.latest ?? dashboardData.summary.average}%</p>
            <p className="mt-1 text-sm text-teal-100">{dashboardData.sourceInfo.dateValue}</p>
            <div className="mt-4 h-px bg-white/30" />
            <div className="mt-4 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map(i => (
                <Star key={i} className={`h-4 w-4 ${i <= filled ? 'fill-yellow-300 text-yellow-300' : 'text-teal-200'}`} />
              ))}
              <span className="ml-1 text-sm font-semibold">{dashboardData.summary.category}</span>
            </div>
            <p className="mt-2 text-xs text-teal-200">{dashboardData.sourceInfo.sourceLabel}: {dashboardData.sourceInfo.sourceValue}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[15px] font-bold uppercase tracking-[0.04em] text-slate-900">Peta Provinsi</h3>
              <select value={selectedProvince} onChange={e => setSelectedProvince(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
                {dashboardData.provinces.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="h-[320px] overflow-hidden rounded-xl border border-dashed border-teal-200 bg-[#e6f5f3]">
              <ProvinceMapOlComponent selectedProvince={selectedProvince} />
            </div>
          </article>
        </div>
      </section>

      <DecisionSupportSystemIntro />
      <AnalyticsSection
        onSignifikanDetail={() => setSignifikanDetailOpen(true)}
        onRekomendasiDetail={() => setRekomendasiDetailOpen(true)}
      />

      <DataModal open={modalCard !== null} onClose={() => setModalCard(null)} title={modalCard ?? ''} rows={getModalRows(modalCard ?? '')} />

      <DetailModal open={signifikanDetailOpen} onClose={() => setSignifikanDetailOpen(false)} title="Minggu dengan Perubahan Signifikan">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-slate-50"><th className="px-3 py-2 text-left">No</th><th className="px-3 py-2 text-left">Indikator</th><th className="px-3 py-2 text-right">Nilai</th><th className="px-3 py-2 text-right">Perubahan</th><th className="px-3 py-2 text-center">Status</th></tr></thead>
            <tbody>
              {indikatorUtamaData.map((r,i) => (
                <tr key={i} className="border-b hover:bg-teal-50/40">
                  <td className="px-3 py-2">{r.no}</td>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-right">{r.skor}</td>
                  <td className="px-3 py-2 text-right text-slate-400">{r.prioritas === 'WASPADA' ? 'waspada' : 'normal'}</td>
                  <td className="px-3 py-2 text-center"><span className={`rounded-full px-2 py-0.5 text-xs ${r.prioritas==='WASPADA'?'bg-red-100 text-red-600':'bg-green-100 text-green-600'}`}>{r.prioritas}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DetailModal>

      <DetailModal open={rekomendasiDetailOpen} onClose={() => setRekomendasiDetailOpen(false)} title="Prioritas Pemantauan Lengkap">
        <div className="space-y-3">
          {rekomendasiPrioritas.map((item,i) => (
            <div key={i} className="rounded-xl border border-slate-100 p-3">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-extrabold" style={{backgroundColor:`${item.color}18`,color:item.color}}>{i+1}</span>
                <div>
                  <p className="text-sm font-bold text-slate-800">{item.label}</p>
                  <p className="text-xs text-slate-500">Prioritas: <span className={item.tone}>{item.priority}</span> | Dampak: {item.impact}%</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </DetailModal>
    </>
  )
}
