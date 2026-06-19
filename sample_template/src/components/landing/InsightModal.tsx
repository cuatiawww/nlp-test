'use client'

import { useEffect, useState } from 'react'
import {
  X,
  LayoutDashboard,
  AlertTriangle,
  Map,
  Sparkles,
  Stethoscope,
  Baby,
  Salad,
  TrendingUp,
  Clock,
  Share2,
  Download,
  ChartBar,
  Radar,
} from 'lucide-react'

export type ModalTab = 'ringkasan' | 'gap' | 'provinsi'

export type InsightData = {
  summary: string
  recommendations: string[]
}

interface InsightModalProps {
  open: boolean
  defaultTab?: ModalTab
  aiInsight?: InsightData | null
  sourceDataLabel: string
  updatedAtLabel: string
  onClose: () => void
}

const STAT_CARDS = [
  { num: '72%', label: 'Tingkat Kepatuhan Nasional', badge: { text: '+2,1%', type: 'up' as const } },
  { num: '10.123', label: 'Total Faskes Terdaftar', badge: { text: '+312', type: 'up' as const } },
  { num: '34', label: 'Provinsi Terevaluasi', badge: { text: '8 kritis', type: 'warn' as const } },
]

const FINDINGS = [
  {
    icon: Stethoscope,
    color: 'red' as const,
    title: 'Defisit Alat Kesehatan',
    desc: '38% puskesmas di wilayah 3T kekurangan peralatan medis dasar. Menjadi GAP terbesar yang mempengaruhi kualitas layanan primer.',
  },
  {
    icon: Baby,
    color: 'amber' as const,
    title: 'Layanan Kesehatan Anak Terbatas',
    desc: 'Cakupan layanan MTBS belum merata. 5 provinsi mencatat nilai di bawah ambang minimal 60%.',
  },
  {
    icon: Salad,
    color: 'teal' as const,
    title: 'Kekurangan Tenaga Gizi',
    desc: 'Rasio ahli gizi di faskes terpencil jauh di bawah standar WHO. Berisiko tinggi terhadap kasus stunting berkelanjutan.',
  },
]

const GAP_ITEMS = [
  { rank: 1, name: 'Ketersediaan Alat Kesehatan', pct: 82, color: '#e24b4a' },
  { rank: 2, name: 'Layanan Kesehatan Anak (MTBS)', pct: 67, color: '#ba7517' },
  { rank: 3, name: 'Tenaga Gizi di Wilayah Terpencil', pct: 61, color: '#185fa5' },
  { rank: 4, name: 'Sarana Air Bersih Faskes', pct: 54, color: '#639922' },
  { rank: 5, name: 'Sistem Rujukan Berjenjang', pct: 48, color: '#7f77dd' },
]

const PROVINCES = [
  { name: 'DKI Jakarta', faskes: '842', score: 91, status: 'Baik' as const },
  { name: 'Jawa Barat', faskes: '1.234', score: 84, status: 'Baik' as const },
  { name: 'Jawa Tengah', faskes: '1.102', score: 79, status: 'Baik' as const },
  { name: 'Sulawesi Tengah', faskes: '312', score: 58, status: 'Sedang' as const },
  { name: 'Nusa Tenggara Timur', faskes: '287', score: 51, status: 'Sedang' as const },
  { name: 'Papua Pegunungan', faskes: '98', score: 37, status: 'Kritis' as const },
  { name: 'Papua Selatan', faskes: '76', score: 33, status: 'Kritis' as const },
  { name: 'Maluku Utara', faskes: '143', score: 44, status: 'Kritis' as const },
]

function BadgeUp({ text }: { text: string }) {
  return (
    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
      <TrendingUp className="h-2.5 w-2.5" />
      {text}
    </span>
  )
}

function BadgeWarn({ text }: { text: string }) {
  return (
    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">
      {text}
    </span>
  )
}

function ScorePill({ status }: { status: 'Baik' | 'Sedang' | 'Kritis' }) {
  const map = {
    Baik: 'bg-emerald-100 text-emerald-800',
    Sedang: 'bg-amber-100 text-amber-800',
    Kritis: 'bg-red-100 text-red-800',
  }
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${map[status]}`}>{status}</span>
}

const rankStyle: Record<number, string> = {
  1: 'bg-red-100 text-red-700',
  2: 'bg-amber-100 text-amber-700',
  3: 'bg-blue-100 text-blue-700',
}

const findingIconStyle: Record<string, string> = {
  red: 'bg-red-50 text-red-600',
  amber: 'bg-amber-50 text-amber-600',
  teal: 'bg-teal-50 text-teal-600',
}

function TabRingkasan({ aiInsight }: { aiInsight?: InsightData | null }) {
  return (
    <div className="space-y-5">
      {aiInsight ? (
        <div className="rounded-2xl border border-[#cfe9e8] bg-gradient-to-br from-[#f2fbfb] to-[#e8f6f6] p-4">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#0f8f96]" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#0f8f96]">Insight AI</span>
            </div>
            <span className="rounded-full bg-white px-2.5 py-0.5 text-[10px] font-bold text-[#0f8f96] shadow-sm">Generated</span>
          </div>
          <p className="text-[13px] leading-relaxed text-[#2a4a4a]">{aiInsight.summary}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {aiInsight.recommendations.slice(0, 4).map((rec, i) => (
              <div
                key={i}
                className="rounded-xl border border-[#d6ebea] bg-white px-3 py-2 text-[12px] leading-relaxed text-[#2a4a4a]"
                dangerouslySetInnerHTML={{ __html: rec }}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[#bfdedd] bg-white/70 p-4 text-[13px] leading-relaxed text-[#5a8080]">
          Klik <span className="font-bold text-[#0f8f96]">Generate AI</span> di halaman utama untuk mengisi ringkasan otomatis di sini.
        </div>
      )}

      <div>
        <p className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-[#8aabab]">Statistik Utama</p>
        <div className="grid grid-cols-3 gap-2.5">
          {STAT_CARDS.map((c) => (
            <div key={c.label} className="flex flex-col items-center rounded-xl border border-[#d4e8e8] bg-white p-3 text-center">
              <span className="text-[28px] font-bold leading-none text-[#0f6e6e]">{c.num}</span>
              <span className="mt-1.5 text-[11px] leading-tight text-[#6a8888]">{c.label}</span>
              {c.badge.type === 'up' ? <BadgeUp text={c.badge.text} /> : <BadgeWarn text={c.badge.text} />}
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-[#8aabab]">Temuan Kritis</p>
        <div className="space-y-2">
          {FINDINGS.map((f) => (
            <div key={f.title} className="flex items-start gap-3 rounded-xl border border-[#d4e8e8] bg-white p-3.5">
              <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] ${findingIconStyle[f.color]}`}>
                <f.icon className="h-[18px] w-[18px]" />
              </div>
              <div>
                <p className="text-[13px] font-bold text-[#1a3535]">{f.title}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-[#4f7070]">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex h-[160px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#a0d0ce] bg-gradient-to-br from-[#e8f5f5] to-[#d4efee] text-[#5a9090]">
        <ChartBar className="h-8 w-8 opacity-40" />
        <span className="text-[12px] opacity-60">Visualisasi tren 12 bulan terakhir</span>
      </div>
    </div>
  )
}

function TabGap() {
  const [animated, setAnimated] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 80)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-[#8aabab]">Urutan GAP Terbesar</p>
        <div className="space-y-2">
          {GAP_ITEMS.map((g) => (
            <div key={g.name} className="flex items-center gap-3 rounded-xl border border-[#d4e8e8] bg-white px-4 py-3">
              <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[13px] font-bold ${rankStyle[g.rank] ?? 'bg-[#e8eeee] text-[#4a7070]'}`}>
                {g.rank}
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-[13px] font-semibold text-[#1a3535]">{g.name}</p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#e4efef]">
                  <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: animated ? `${g.pct}%` : '0%', background: g.color }} />
                </div>
              </div>
              <span className="flex-shrink-0 text-[13px] font-bold" style={{ color: g.color }}>{g.pct}%</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex h-[160px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#a0d0ce] bg-gradient-to-br from-[#e8f5f5] to-[#d4efee] text-[#5a9090]">
        <Radar className="h-8 w-8 opacity-40" />
        <span className="text-[12px] opacity-60">Radar chart perbandingan indikator</span>
      </div>
    </div>
  )
}

function TabProvinsi() {
  return (
    <div>
      <p className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-[#8aabab]">Performa Per Provinsi</p>
      <div className="overflow-hidden rounded-xl border border-[#d4e8e8]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#d0e8e8] bg-[#f2fafa]">
              <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-[#7a9898]">Provinsi</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-[#7a9898]">Faskes</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-[#7a9898]">Skor</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-[#7a9898]">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {PROVINCES.map((p, i) => (
              <tr key={p.name} className={i < PROVINCES.length - 1 ? 'border-b border-[#e8f2f2]' : ''}>
                <td className="px-4 py-2.5 text-[12px] font-medium text-[#2a3a3a]">{p.name}</td>
                <td className="px-4 py-2.5 text-[12px] text-[#4a6060]">{p.faskes}</td>
                <td className="px-4 py-2.5 text-[12px] font-bold text-[#2a3a3a]">{p.score}%</td>
                <td className="px-4 py-2.5"><ScorePill status={p.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const TABS: { key: ModalTab; label: string; Icon: React.ElementType }[] = [
  { key: 'ringkasan', label: 'Ringkasan', Icon: LayoutDashboard },
  { key: 'gap', label: 'Analisis GAP', Icon: AlertTriangle },
  { key: 'provinsi', label: 'Per Provinsi', Icon: Map },
]

export default function InsightModal({
  open,
  defaultTab = 'ringkasan',
  aiInsight,
  sourceDataLabel,
  updatedAtLabel,
  onClose,
}: InsightModalProps) {
  const [activeTab, setActiveTab] = useState<ModalTab>(defaultTab)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(8,36,36,0.56)] p-4 backdrop-blur-[3px]" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="flex w-full max-w-[820px] flex-col overflow-hidden rounded-[20px_20px_26px_20px] border border-[#b7d9d8] bg-[#f7fffe] shadow-[0_28px_72px_rgba(0,60,60,0.26)]" style={{ maxHeight: '88vh', animation: 'modalIn 0.22s ease-out' }}>
        <style>{`
          @keyframes modalIn {
            from { opacity: 0; transform: translateY(16px) scale(0.97); }
            to   { opacity: 1; transform: none; }
          }
        `}</style>

        <div className="flex flex-shrink-0 items-start gap-3.5 border-b border-[#cde8e7] bg-gradient-to-r from-[#dcf6f5] to-[#c8eceb] px-6 py-5">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[13px] bg-gradient-to-br from-[#16b7b2] to-[#0f8f96] shadow-[0_8px_20px_rgba(15,143,150,0.24)]">
            <LayoutDashboard className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-[17px] font-bold leading-tight text-[#0f3535]">Analisis Kinerja Fasilitas Kesehatan Nasional</h2>
            <p className="mt-0.5 text-[12px] text-[#4f7070]">{sourceDataLabel}</p>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-[#bad9d8] bg-white/95 transition-colors hover:border-[#85c5c2] hover:bg-[#f4fbfb]" aria-label="Tutup modal">
            <X className="h-4 w-4 text-[#5a7070]" />
          </button>
        </div>

        <div className="flex flex-shrink-0 gap-1 overflow-x-auto border-b border-[#d0eceb] bg-[#f6fbfb] px-4 sm:px-6">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 whitespace-nowrap border-b-[2.5px] px-3.5 py-3 text-[12px] font-bold uppercase tracking-wider transition-all ${activeTab === key ? 'border-b-[#16b7b2] bg-white text-[#0f8f96]' : 'border-b-transparent text-[#7a9898] hover:bg-white/70 hover:text-[#3a7070]'}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto bg-[#f3fbfb] px-6 py-5">
          {activeTab === 'ringkasan' && <TabRingkasan aiInsight={aiInsight} />}
          {activeTab === 'gap' && <TabGap />}
          {activeTab === 'provinsi' && <TabProvinsi />}
        </div>

        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-[#cde8e7] bg-[#f7fdfd] px-6 py-3.5">
          <div className="flex items-center gap-1.5 text-[11px] text-[#7a9898]">
            <Clock className="h-3.5 w-3.5" />
            {updatedAtLabel}
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-1.5 rounded-[10px] border border-[#c0e0e0] bg-[#e8f5f5] px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-[#0f8f96] transition-all hover:-translate-y-0.5">
              <Share2 className="h-3.5 w-3.5" />
              Bagikan
            </button>
            <button className="flex items-center gap-1.5 rounded-[10px] bg-[#16b7b2] px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-white shadow-[0_3px_10px_rgba(22,183,178,0.28)] transition-all hover:-translate-y-0.5 hover:bg-[#10a09c]">
              <Download className="h-3.5 w-3.5" />
              Download Laporan
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
