'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CloudRain,
  Download,
  FileText,
  HeartPulse,
  Info,
  LayoutDashboard,
  MapPin,
  Package,
  Phone,
  Radio,
  Share2,
  ShieldAlert,
  Siren,
  Stethoscope,
  TentTree,
  Users,
  Waves,
  XCircle,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { OutbreakLocation } from '@/types'

const SpatialOutbreakMap = dynamic(() => import('@/components/SpatialOutbreakMap'), { ssr: false })

type TabKey = 'ringkasan' | 'korban' | 'faskes' | 'pengungsian' | 'logistik' | 'timeline'

const impactLocations: OutbreakLocation[] = [
  { location_name: 'Nagekeo', disease: 'Gempa Bumi', country: 'Indonesia', latitude: -8.56, longitude: 121.28, cases: 1280, deaths: 0, event_count: 1, confidence: 0.98, threshold: 0, severity: 'AWAS', has_alert: true, latest_date: '2026-08-22' },
  { location_name: 'Flores Timur', disease: 'Gempa Bumi', country: 'Indonesia', latitude: -8.35, longitude: 122.98, cases: 860, deaths: 0, event_count: 1, confidence: 0.96, threshold: 0, severity: 'SIAGA', has_alert: true, latest_date: '2026-08-22' },
  { location_name: 'Manggarai Timur', disease: 'Gempa Bumi', country: 'Indonesia', latitude: -8.62, longitude: 120.61, cases: 640, deaths: 0, event_count: 1, confidence: 0.94, threshold: 0, severity: 'SIAGA', has_alert: true, latest_date: '2026-08-22' },
  { location_name: 'Ngada', disease: 'Gempa Bumi', country: 'Indonesia', latitude: -8.79, longitude: 120.96, cases: 410, deaths: 0, event_count: 1, confidence: 0.92, threshold: 0, severity: 'WASPADA', has_alert: true, latest_date: '2026-08-22' },
  { location_name: 'Sikka', disease: 'Gempa Bumi', country: 'Indonesia', latitude: -8.62, longitude: 122.21, cases: 380, deaths: 0, event_count: 1, confidence: 0.91, threshold: 0, severity: 'WASPADA', has_alert: true, latest_date: '2026-08-22' },
  { location_name: 'Ende', disease: 'Gempa Bumi', country: 'Indonesia', latitude: -8.84, longitude: 121.66, cases: 290, deaths: 0, event_count: 1, confidence: 0.9, threshold: 0, severity: 'WASPADA', has_alert: true, latest_date: '2026-08-22' },
  { location_name: 'Manggarai Barat', disease: 'Gempa Bumi', country: 'Indonesia', latitude: -8.5, longitude: 119.88, cases: 165, deaths: 0, event_count: 1, confidence: 0.88, threshold: 0, severity: 'NORMAL', has_alert: false, latest_date: '2026-08-22' },
]

const trendData = [
  { date: '15 Agu', meninggal: 0, luka: 12, pengungsi: 340, terdampak: 640 },
  { date: '16 Agu', meninggal: 2, luka: 38, pengungsi: 860, terdampak: 1210 },
  { date: '17 Agu', meninggal: 4, luka: 75, pengungsi: 1420, terdampak: 2080 },
  { date: '18 Agu', meninggal: 4, luka: 108, pengungsi: 1970, terdampak: 2860 },
  { date: '19 Agu', meninggal: 5, luka: 132, pengungsi: 2410, terdampak: 3510 },
  { date: '20 Agu', meninggal: 5, luka: 148, pengungsi: 2730, terdampak: 3970 },
  { date: '21 Agu', meninggal: 5, luka: 156, pengungsi: 2890, terdampak: 4210 },
  { date: '22 Agu', meninggal: 5, luka: 164, pengungsi: 3140, terdampak: 4280 },
]

const districtData = [
  { name: 'Nagekeo', affected: 1280, injured: 64, displaced: 920, status: 'AWAS' },
  { name: 'Flores Timur', affected: 860, injured: 42, displaced: 640, status: 'SIAGA' },
  { name: 'Manggarai Timur', affected: 640, injured: 27, displaced: 480, status: 'SIAGA' },
  { name: 'Ngada', affected: 410, injured: 15, displaced: 295, status: 'WASPADA' },
  { name: 'Sikka', affected: 380, injured: 9, displaced: 240, status: 'WASPADA' },
  { name: 'Ende', affected: 290, injured: 7, displaced: 210, status: 'WASPADA' },
]

const facilityData = [
  { name: 'RSUD Mbay', type: 'Rumah Sakit', location: 'Nagekeo', condition: 'Beroperasi sebagian', patients: 38, tone: 'warning' },
  { name: 'RSUD dr. Hendrik Fernandez', type: 'Rumah Sakit', location: 'Flores Timur', condition: 'Beroperasi normal', patients: 26, tone: 'good' },
  { name: 'Puskesmas Boawae', type: 'Puskesmas', location: 'Nagekeo', condition: 'Beroperasi normal', patients: 18, tone: 'good' },
  { name: 'Puskesmas Borong', type: 'Puskesmas', location: 'Manggarai Timur', condition: 'Beroperasi sebagian', patients: 15, tone: 'warning' },
  { name: 'Puskesmas Aimere', type: 'Puskesmas', location: 'Ngada', condition: 'Tidak beroperasi', patients: 0, tone: 'danger' },
]

const timelineData = [
  ['22 Agu 2026 · 01:47 WIB', 'Pembaruan data terakhir', 'Rekapitulasi korban, pengungsi, dan kesiapan fasilitas kesehatan diperbarui oleh operator EOC.'],
  ['21 Agu 2026 · 14:30 WITA', 'Distribusi logistik tahap II', 'Obat-obatan, tenda keluarga, dan paket kebersihan dikirim ke tiga kabupaten prioritas.'],
  ['19 Agu 2026 · 09:00 WITA', 'Tim kesehatan bergerak', 'Tim medis gabungan mulai memberikan pelayanan di pos pengungsian Mbay dan Borong.'],
  ['15 Agu 2026 · 09:18 WITA', 'Kejadian awal', 'Gempa bumi magnitudo 7.7 terjadi di Laut Flores, 30 km timur laut Mbay-Nagekeo.'],
]

const tabItems: { key: TabKey; label: string; icon: typeof Activity }[] = [
  { key: 'ringkasan', label: 'Ringkasan', icon: LayoutDashboard },
  { key: 'korban', label: 'Korban & Dampak', icon: Users },
  { key: 'faskes', label: 'Fasilitas Kesehatan', icon: Building2 },
  { key: 'pengungsian', label: 'Pengungsian', icon: TentTree },
  { key: 'logistik', label: 'Logistik', icon: Package },
  { key: 'timeline', label: 'Timeline Aktivitas', icon: Clock3 },
]

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    AWAS: 'bg-[#ED2939] text-white',
    SIAGA: 'bg-[#B49B58] text-white',
    WASPADA: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
    NORMAL: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
  }
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${classes[status] || classes.NORMAL}`}>{status}</span>
}

function MetricCard({ label, value, caption, icon, tone = 'blue' }: { label: string; value: string; caption: string; icon: React.ReactNode; tone?: 'blue' | 'red' | 'gold' | 'teal' }) {
  const tones = {
    blue: 'border-blue-200 bg-blue-50/70 text-[#0060A9]',
    red: 'border-red-200 bg-red-50/70 text-[#ED2939]',
    gold: 'border-[#B49B58]/30 bg-[#fbf8ee] text-[#8c763e]',
    teal: 'border-teal-200 bg-teal-50/70 text-teal-700',
  }
  return (
    <article className={`rounded-2xl border p-4 shadow-[0_6px_18px_rgba(0,96,169,.05)] ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-wider opacity-75">{label}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/75">{icon}</span>
      </div>
      <p className="mt-3 text-3xl font-black leading-none">{value}</p>
      <p className="mt-2 text-[10px] font-semibold opacity-75">{caption}</p>
    </article>
  )
}

function Panel({ title, subtitle, icon, children, className = '' }: { title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-[#cfe0f1] bg-white shadow-[0_6px_18px_rgba(0,96,169,.05)] ${className}`}>
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        {icon && <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#0060A9]">{icon}</span>}
        <div>
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function InfoItem({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3"><span className="mt-0.5 text-[#0060A9]">{icon}</span><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-xs font-bold text-slate-800">{value}</p></div></div>
}

export default function GempaNttDetailPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('ringkasan')
  const [shareLabel, setShareLabel] = useState('Bagikan')

  const handleShare = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Detail Kejadian Gempa Bumi NTT', url: window.location.href })
      else { await navigator.clipboard.writeText(window.location.href); setShareLabel('Tautan disalin'); window.setTimeout(() => setShareLabel('Bagikan'), 2200) }
    } catch { /* user cancelled the native share dialog */ }
  }

  const handleDownload = () => {
    const content = 'RINGKASAN KEJADIAN GEMPA BUMI NTT\n\nKejadian: Gempa Bumi M 7.7 Laut Flores\nLokasi: 30 km Timur Laut Mbay-Nagekeo-NTT\nTanggal: 15 Agustus 2026, 09:18 WITA\nStatus: Tanggap Darurat\n\nData ringkasan: 5 meninggal, 164 luka-luka, 3.140 pengungsi.'
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = 'ringkasan-gempa-ntt.txt'; link.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="w-full space-y-5 bg-[#f8fafc] px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-slate-500">
        <div className="flex items-center gap-2"><Link href="/" className="inline-flex items-center gap-1.5 text-[#0060A9] hover:underline"><ArrowLeft className="h-3.5 w-3.5" /> Dashboard</Link><ChevronRight className="h-3.5 w-3.5 text-slate-300" /><span>Detail Kejadian</span></div>
        <span className="inline-flex items-center gap-1.5"><span className="live-dot" /> Data statis · pembaruan 22 Agustus 2026</span>
      </div>

      <section className="relative overflow-hidden rounded-[22px] border border-[#0060A9]/20 bg-gradient-to-br from-[#eaf3fb] via-white to-[#fbf8ee] p-5 shadow-[0_10px_28px_rgba(0,96,169,.08)] sm:p-7">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#0060A9]/5" /><div className="absolute -bottom-24 right-28 h-48 w-48 rounded-full bg-[#B49B58]/10" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex gap-4"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#ED2939] text-white shadow-lg shadow-red-200"><Siren className="h-7 w-7" /></div><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#ED2939]">Kejadian Prioritas</span><StatusBadge status="AWAS" /></div><h1 className="mt-2 text-2xl font-black uppercase leading-tight tracking-tight text-slate-900 sm:text-4xl">Gempa Bumi M 7.7</h1><p className="mt-1 text-sm font-semibold text-slate-600 sm:text-base">Laut Flores · 30 km Timur Laut Mbay-Nagekeo-NTT</p><p className="mt-3 max-w-3xl text-xs leading-5 text-slate-500">Pemantauan komprehensif dampak krisis kesehatan, sebaran korban, kerusakan fasilitas kesehatan, pengungsian, dan kesiapan respons darurat di Provinsi Nusa Tenggara Timur.</p></div></div>
          <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end"><button onClick={handleShare} className="inline-flex items-center gap-2 rounded-xl border border-[#0060A9]/20 bg-white px-3.5 py-2.5 text-xs font-black text-[#0060A9] shadow-sm hover:bg-blue-50"><Share2 className="h-4 w-4" />{shareLabel}</button><button onClick={handleDownload} className="inline-flex items-center gap-2 rounded-xl bg-[#0060A9] px-3.5 py-2.5 text-xs font-black text-white shadow-sm hover:bg-[#004b85]"><Download className="h-4 w-4" />Unduh Ringkasan</button></div>
        </div>
        <div className="relative mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><InfoItem label="Waktu kejadian" value="15 Agu 2026 · 09:18:22 WITA" icon={<CalendarDays className="h-4 w-4" />} /><InfoItem label="Koordinat episentrum" value="-8.3421, 122.9814" icon={<MapPin className="h-4 w-4" />} /><InfoItem label="Kedalaman" value="15 km" icon={<Activity className="h-4 w-4" />} /><InfoItem label="Potensi tsunami" value="Siaga & Waspada" icon={<Waves className="h-4 w-4" />} /></div>
      </section>

      <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-red-800 shadow-sm"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#ED2939]" /><div><p className="text-xs font-black uppercase tracking-wider">Peringatan situasi darurat</p><p className="mt-1 text-xs leading-5 text-red-700">Status siaga berlaku untuk Manggarai, Ngada, Manggarai Barat, Selayar, Ende, Sikka, Jeneponto, dan Bantaeng. Status waspada berlaku untuk wilayah sekitar Flores Timur, Bima, Dompu, Takalar, Bone, Wajo, Luwu, dan Kota Palopo.</p></div></div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"><MetricCard label="Total korban" value="5" caption="meninggal dunia" icon={<HeartPulse className="h-5 w-5" />} tone="red" /><MetricCard label="Luka-luka" value="164" caption="42 berat · 122 ringan" icon={<Stethoscope className="h-5 w-5" />} tone="blue" /><MetricCard label="Pengungsi" value="3.140" caption="tersebar di 28 posko" icon={<TentTree className="h-5 w-5" />} tone="gold" /><MetricCard label="Penduduk terdampak" value="4.280" caption="di 6 kabupaten prioritas" icon={<Users className="h-5 w-5" />} tone="teal" /></div>

      <div className="sticky top-0 z-20 -mx-4 overflow-x-auto border-y border-slate-200 bg-[#f8fafc]/95 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"><div className="flex min-w-max gap-1 rounded-2xl border border-[#cfe0f1] bg-white p-1.5 shadow-sm">{tabItems.map(({ key, label, icon: Icon }) => <button key={key} onClick={() => setActiveTab(key)} className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-black transition sm:px-4 ${activeTab === key ? 'bg-[#0060A9] text-white shadow-sm' : 'text-slate-500 hover:bg-blue-50 hover:text-[#0060A9]'}`}><Icon className="h-4 w-4" />{label}</button>)}</div></div>

      {activeTab === 'ringkasan' && <>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,1fr)]"><Panel title="Tren korban & penduduk terdampak" subtitle="Akumulasi laporan harian · 15–22 Agustus 2026" icon={<BarChart3 className="h-4 w-4" />}><div className="h-[310px] p-4"><ResponsiveContainer width="100%" height="100%"><LineChart data={trendData} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="date" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #cfe0f1', fontSize: 11 }} /><Legend wrapperStyle={{ fontSize: 10 }} /><Line type="monotone" dataKey="pengungsi" name="Pengungsi" stroke="#B49B58" strokeWidth={3} dot={{ r: 3 }} /><Line type="monotone" dataKey="luka" name="Luka-luka" stroke="#0060A9" strokeWidth={2.5} dot={{ r: 3 }} /><Line type="monotone" dataKey="terdampak" name="Penduduk terdampak" stroke="#14b8a6" strokeWidth={2.5} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div></Panel><Panel title="Parameter seismik" subtitle="Ringkasan informasi kejadian" icon={<Activity className="h-4 w-4" />}><div className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-1"><InfoItem label="Magnitudo" value="7.7 SR" icon={<Activity className="h-4 w-4" />} /><InfoItem label="Skala dirasakan" value="VII–VIII MMI" icon={<Radio className="h-4 w-4" />} /><InfoItem label="Status tanggap darurat" value="Level provinsi & nasional" icon={<ShieldAlert className="h-4 w-4" />} /><InfoItem label="Sumber" value="BMKG · SIPKK Kemenkes RI" icon={<FileText className="h-4 w-4" />} /></div><div className="mx-4 mb-4 flex gap-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-[11px] leading-5 text-slate-600"><Info className="mt-0.5 h-4 w-4 shrink-0 text-[#0060A9]" />Angka pada halaman ini merupakan data statis untuk validasi layout dan alur detail kejadian.</div></Panel></div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]"><Panel title="Peta sebaran wilayah terdampak" subtitle="Kabupaten prioritas di Provinsi Nusa Tenggara Timur" icon={<MapPin className="h-4 w-4" />}><div className="h-[480px] p-3"><SpatialOutbreakMap countries={[{ name: 'Indonesia', cases: 4280 }]} locations={impactLocations} embedded /></div></Panel><Panel title="Ringkasan per kabupaten" subtitle="Populasi dan pengungsi terdata" icon={<MapPin className="h-4 w-4" />}><div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Kabupaten</th><th className="px-3 py-3 text-right">Terdampak</th><th className="px-3 py-3 text-right">Pengungsi</th><th className="px-4 py-3 text-center">Status</th></tr></thead><tbody>{districtData.map((row) => <tr key={row.name} className="border-t border-slate-100"><td className="px-4 py-3 font-bold text-slate-800">{row.name}<span className="block text-[10px] font-normal text-slate-400">{row.injured} luka</span></td><td className="px-3 py-3 text-right font-semibold">{row.affected.toLocaleString('id-ID')}</td><td className="px-3 py-3 text-right font-semibold">{row.displaced.toLocaleString('id-ID')}</td><td className="px-4 py-3 text-center"><StatusBadge status={row.status} /></td></tr>)}</tbody></table></div><div className="border-t border-slate-100 p-4"><button onClick={() => setActiveTab('korban')} className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 py-2.5 text-xs font-black text-[#0060A9] hover:bg-blue-100">Lihat matriks dampak lengkap <ChevronRight className="h-4 w-4" /></button></div></Panel></div>
      </>}

      {activeTab === 'korban' && <div className="space-y-4"><div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,1fr)]"><Panel title="Komposisi korban" subtitle="Proporsi berdasarkan laporan terakhir" icon={<Users className="h-4 w-4" />}><div className="grid items-center gap-3 p-5 md:grid-cols-2"><div className="h-64"><ResponsiveContainer><PieChart><Pie data={[{ name: 'Luka ringan', value: 122 }, { name: 'Luka berat', value: 42 }, { name: 'Meninggal', value: 5 }]} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={3}>{['#0060A9', '#B49B58', '#ED2939'].map((color) => <Cell key={color} fill={color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div><div className="space-y-3">{[['Meninggal', '5', '#ED2939'], ['Luka berat', '42', '#B49B58'], ['Luka ringan', '122', '#0060A9']].map(([label, value, color]) => <div key={label} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3"><span className="flex items-center gap-2 text-xs font-bold text-slate-600"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />{label}</span><b className="text-lg text-slate-900">{value}</b></div>)}</div></div></Panel><Panel title="Kelompok rentan" subtitle="Estimasi dari data posko" icon={<HeartPulse className="h-4 w-4" />}><div className="grid grid-cols-2 gap-3 p-5"><MetricCard label="Balita" value="286" caption="6,7% terdampak" icon={<Users className="h-4 w-4" />} tone="blue" /><MetricCard label="Lansia" value="318" caption="7,4% terdampak" icon={<Users className="h-4 w-4" />} tone="gold" /><MetricCard label="Ibu hamil" value="74" caption="terdata di posko" icon={<HeartPulse className="h-4 w-4" />} tone="teal" /><MetricCard label="Disabilitas" value="31" caption="butuh pendampingan" icon={<Users className="h-4 w-4" />} tone="red" /></div></Panel></div><Panel title="Matriks korban per kabupaten" subtitle="Data agregat statis untuk kebutuhan tampilan" icon={<FileText className="h-4 w-4" />}><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-xs"><thead className="bg-slate-50 text-left text-[10px] uppercase text-slate-500"><tr><th className="px-5 py-3">Kabupaten</th><th className="px-4 py-3 text-right">Meninggal</th><th className="px-4 py-3 text-right">Luka berat</th><th className="px-4 py-3 text-right">Luka ringan</th><th className="px-4 py-3 text-right">Pengungsi</th><th className="px-5 py-3 text-center">Status</th></tr></thead><tbody>{districtData.map((row, i) => <tr key={row.name} className="border-t border-slate-100"><td className="px-5 py-3 font-bold">{row.name}</td><td className="px-4 py-3 text-right">{i < 2 ? 1 : i === 2 ? 2 : 0}</td><td className="px-4 py-3 text-right">{Math.max(2, Math.round(row.injured * .25))}</td><td className="px-4 py-3 text-right">{Math.max(5, Math.round(row.injured * .75))}</td><td className="px-4 py-3 text-right font-bold">{row.displaced.toLocaleString('id-ID')}</td><td className="px-5 py-3 text-center"><StatusBadge status={row.status} /></td></tr>)}</tbody></table></div></Panel></div>}

      {activeTab === 'faskes' && <div className="space-y-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><MetricCard label="Total faskes" value="181" caption="RS, puskesmas, klinik" icon={<Building2 className="h-5 w-5" />} tone="blue" /><MetricCard label="Beroperasi normal" value="176" caption="97,2% dari terpantau" icon={<CheckCircle2 className="h-5 w-5" />} tone="teal" /><MetricCard label="Terdampak" value="5" caption="perlu pemulihan" icon={<AlertTriangle className="h-5 w-5" />} tone="gold" /><MetricCard label="Tidak beroperasi" value="1" caption="prioritas dukungan" icon={<XCircle className="h-5 w-5" />} tone="red" /></div><Panel title="Status fasilitas kesehatan terdampak" subtitle="Pembaruan kondisi operasional fasilitas di wilayah kejadian" icon={<Building2 className="h-4 w-4" />}><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-xs"><thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Nama fasilitas</th><th className="px-4 py-3">Jenis</th><th className="px-4 py-3">Kabupaten</th><th className="px-4 py-3">Status operasional</th><th className="px-5 py-3 text-right">Pasien dirawat</th></tr></thead><tbody>{facilityData.map((row) => <tr key={row.name} className="border-t border-slate-100"><td className="px-5 py-4 font-bold text-slate-800">{row.name}</td><td className="px-4 py-4 text-slate-600">{row.type}</td><td className="px-4 py-4 text-slate-600">{row.location}</td><td className="px-4 py-4"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${row.tone === 'good' ? 'bg-emerald-50 text-emerald-700' : row.tone === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{row.condition}</span></td><td className="px-5 py-4 text-right font-bold">{row.patients}</td></tr>)}</tbody></table></div></Panel><div className="grid gap-4 md:grid-cols-2"><Panel title="Kebutuhan pemulihan" icon={<ShieldAlert className="h-4 w-4" />}><div className="grid grid-cols-2 gap-2 p-4 text-xs font-bold"><div className="rounded-xl bg-red-50 p-3 text-red-700">1 fasilitas perlu tenda</div><div className="rounded-xl bg-amber-50 p-3 text-amber-700">3 fasilitas perlu air bersih</div><div className="rounded-xl bg-blue-50 p-3 text-[#0060A9]">2 fasilitas perlu obat</div><div className="rounded-xl bg-teal-50 p-3 text-teal-700">7 ambulans siaga</div></div></Panel><Panel title="Kapasitas tenaga kesehatan" icon={<Stethoscope className="h-4 w-4" />}><div className="space-y-3 p-4"><div className="flex items-center justify-between text-xs"><span className="font-semibold text-slate-600">Dokter</span><b>28 orang</b></div><div className="h-2 rounded-full bg-slate-100"><div className="h-full w-[70%] rounded-full bg-[#0060A9]" /></div><div className="flex items-center justify-between text-xs"><span className="font-semibold text-slate-600">Perawat & bidan</span><b>86 orang</b></div><div className="h-2 rounded-full bg-slate-100"><div className="h-full w-[85%] rounded-full bg-[#B49B58]" /></div></div></Panel></div></div>}

      {activeTab === 'pengungsian' && <div className="space-y-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><MetricCard label="Total pengungsi" value="3.140" caption="2.018 keluarga" icon={<Users className="h-5 w-5" />} tone="gold" /><MetricCard label="Titik pengungsian" value="28" caption="6 kabupaten" icon={<TentTree className="h-5 w-5" />} tone="blue" /><MetricCard label="Kapasitas tersisa" value="1.260" caption="ruang tersedia" icon={<HomeIcon className="h-5 w-5" />} tone="teal" /><MetricCard label="Posko kesehatan" value="14" caption="aktif 24 jam" icon={<HeartPulse className="h-5 w-5" />} tone="red" /></div><Panel title="Sebaran titik pengungsian" subtitle="Prioritas distribusi pelayanan dasar dan kesehatan" icon={<TentTree className="h-4 w-4" />}><div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">{districtData.slice(0, 6).map((row, i) => <article key={row.name} className="rounded-xl border border-slate-100 bg-slate-50 p-4"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-black text-slate-800">Posko {row.name}</p><p className="mt-1 text-[10px] text-slate-500">{i + 3} titik aktif · koordinasi BPBD</p></div><span className="rounded-lg bg-white px-2 py-1 text-[10px] font-black text-[#0060A9]">{row.displaced.toLocaleString('id-ID')}</span></div><div className="mt-3 flex items-center justify-between text-[10px] font-semibold text-slate-500"><span>Kapasitas terpakai</span><span>{58 + i * 5}%</span></div><div className="mt-1.5 h-1.5 rounded-full bg-slate-200"><div className="h-full rounded-full bg-[#B49B58]" style={{ width: `${58 + i * 5}%` }} /></div></article>)}</div></Panel><Panel title="Kebutuhan layanan dasar" icon={<HeartPulse className="h-4 w-4" />}><div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">{[['Air bersih', '18.400 L', 'cukup 2 hari', 'blue'], ['Paket higiene', '1.200 paket', 'perlu tambahan', 'gold'], ['Layanan kesehatan', '14 posko', 'aktif', 'teal'], ['Dukungan psikososial', '6 tim', 'berjalan', 'red']].map(([label, value, caption, tone]) => <div key={label} className={`rounded-xl border p-4 ${tone === 'red' ? 'border-red-100 bg-red-50' : tone === 'gold' ? 'border-amber-100 bg-amber-50' : tone === 'teal' ? 'border-teal-100 bg-teal-50' : 'border-blue-100 bg-blue-50'}`}><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-xl font-black text-slate-800">{value}</p><p className="mt-1 text-[10px] font-semibold text-slate-500">{caption}</p></div>)}</div></Panel></div>}

      {activeTab === 'logistik' && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MetricCard label="Obat-obatan" value="86%" caption="ketersediaan gudang" icon={<Package className="h-5 w-5" />} tone="blue" /><MetricCard label="Paket keluarga" value="1.240" caption="sudah terdistribusi" icon={<Package className="h-5 w-5" />} tone="gold" /><MetricCard label="Ambulans" value="7" caption="siaga operasional" icon={<HeartPulse className="h-5 w-5" />} tone="teal" /><MetricCard label="Kebutuhan prioritas" value="12" caption="item perlu dikirim" icon={<AlertTriangle className="h-5 w-5" />} tone="red" /></div><Panel title="Status distribusi logistik" subtitle="Rekap dukungan tanggap darurat per kebutuhan" icon={<Package className="h-4 w-4" />}><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-xs"><thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Kebutuhan</th><th className="px-4 py-3">Sasaran</th><th className="px-4 py-3 text-right">Diterima</th><th className="px-4 py-3 text-right">Kekurangan</th><th className="px-5 py-3">Status</th></tr></thead><tbody>{[['Obat esensial', 'Puskesmas & posko', '86%', '14%', 'Cukup'], ['Tenda keluarga', '28 titik pengungsian', '72%', '28%', 'Perlu dikirim'], ['Paket higiene', '3.140 pengungsi', '61%', '39%', 'Perlu dikirim'], ['Air bersih', '6 kabupaten', '88%', '12%', 'Cukup'], ['Bahan bakar ambulans', '7 armada', '93%', '7%', 'Cukup']].map(([item, target, received, shortage, status]) => <tr key={item} className="border-t border-slate-100"><td className="px-5 py-4 font-bold">{item}</td><td className="px-4 py-4 text-slate-500">{target}</td><td className="px-4 py-4 text-right font-bold text-emerald-700">{received}</td><td className="px-4 py-4 text-right font-semibold text-amber-700">{shortage}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${status === 'Cukup' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{status}</span></td></tr>)}</tbody></table></div></Panel></div>}

      {activeTab === 'timeline' && <Panel title="Timeline aktivitas kejadian" subtitle="Catatan kronologis pembaruan respons krisis kesehatan" icon={<Clock3 className="h-4 w-4" />}><div className="relative p-5 sm:p-8"><div className="absolute bottom-8 left-[30px] top-8 w-px bg-blue-100 sm:left-[43px]" />{timelineData.map(([date, title, description], index) => <div key={date} className="relative mb-7 flex gap-4 last:mb-0 sm:gap-6"><div className={`z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-4 border-white shadow-sm ${index === 0 ? 'bg-[#0060A9] text-white' : 'bg-blue-100 text-[#0060A9]'}`}><span className="text-[10px] font-black">{timelineData.length - index}</span></div><div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-[#0060A9]">{date}</p><h3 className="mt-1 text-sm font-black text-slate-800">{title}</h3><p className="mt-1.5 text-xs leading-5 text-slate-600">{description}</p></div></div>)}</div></Panel>}

      <footer className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-white px-5 py-4 text-xs text-slate-500 shadow-sm sm:flex-row sm:items-center sm:justify-between"><p className="flex items-center gap-2"><Info className="h-4 w-4 text-[#0060A9]" />Halaman detail kejadian · Versi statis untuk validasi layout</p><Link href="/" className="inline-flex items-center gap-2 font-black text-[#0060A9] hover:underline"><LayoutDashboard className="h-4 w-4" />Kembali ke Dashboard</Link></footer>
    </div>
  )
}

function HomeIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10Z" /><path d="M9 21v-6h6v6" /></svg>
}
