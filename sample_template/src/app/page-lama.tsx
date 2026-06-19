'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import {
  Building2,
  ChevronDown,
  ChevronUp,
  HeartPulse,
  Stethoscope,
  LayoutDashboard,
  Building,
  HousePlus,
  ShieldPlus,
  FileText,
  Sparkles,
  Download,
  Loader2,
} from 'lucide-react'
import IndonesiaStatusMapClient from '@/components/landing/IndonesiaStatusMapClient'
import FilterDropdownBar, { type DropdownOption } from '@/components/landing/FilterDropdownBar'
import ChartCardsSection from '@/components/landing/ChartCardsSection'
import FacilityProvinceSection, { type FacilityKey } from '@/components/landing/FacilityProvinceSection'
import InsightModal, { type ModalTab, type InsightData } from '@/components/landing/InsightModal'

const assets = {
  logo: '/Logo-Kemenkes.png',
  headerBackground: '/bg header.png',
  insightBackground: '/bg insght.png',
}

const summaryCards = [
  { id: 'total-rs', facility: 'rumahSakit', title: 'TOTAL RUMAH SAKIT', keyName: 'total_rs', icon: '/rumah%20sakit.svg' },
  { id: 'total-puskesmas', facility: 'puskesmas', title: 'TOTAL PUSKESMAS', keyName: 'total_puskesmas', icon: '/puskesmas.svg' },
  { id: 'total-pustu', facility: 'pustu', title: 'TOTAL PUSTU', keyName: 'total_pustu', icon: '/puskesmas.svg' },
  { id: 'total-klinik', facility: 'klinik', title: 'TOTAL KLINIK', keyName: 'total_klinik', icon: '/rumah%20sakit.svg' },
  { id: 'total-posyandu', facility: 'posyandu', title: 'TOTAL POSYANDU', keyName: 'total_posyandu', icon: '/posyandu.svg' },
  { id: 'total-bbkk', facility: 'bbkk', title: 'TOTAL BBKK/BKK/LKK', keyName: 'total_bkk', icon: '/faskes.svg' },
] as const

type RekapTotalResponse = {
  total_rs: string | number
  total_puskesmas: string | number
  total_posyandu: string | number
  total_klinik: string | number
  total_pustu: string | number
  total_bkk: string | number
} & Record<string, string | number | undefined>

type ApiListItem = {
  kode_provinsi?: string
  nama_provinsi?: string
  kode_kabupaten?: string
  nama_kabupaten?: string
}

function formatWibDate(date: Date) {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(date)
}

function formatWibTime(date: Date) {
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta',
  }).format(date).replace(':', '.')
}

export default function HomePage() {
  type QuickLinkKey = 'dashboard' | 'rumahSakit' | 'puskesmas' | 'pustu' | 'klinik' | 'posyandu' | 'bbkk'

  const [activeQuickLink, setActiveQuickLink] = useState<QuickLinkKey>('dashboard')
  const [activeFacility, setActiveFacility] = useState<FacilityKey>('puskesmas')
  const [selectedCakupan, setSelectedCakupan] = useState('nasional')
  const [selectedProvinsi, setSelectedProvinsi] = useState('')
  const [selectedKabupaten, setSelectedKabupaten] = useState('')
  const cakupanOptions: DropdownOption[] = [
    { value: 'nasional', label: 'Nasional' },
    { value: 'provinsi', label: 'Provinsi' },
    { value: 'kabupaten', label: 'Kabupaten/Kota' },
  ]
  const [provinsiOptions, setProvinsiOptions] = useState<DropdownOption[]>([
    { value: '', label: 'Semua Provinsi' },
  ])
  const [kabupatenOptions, setKabupatenOptions] = useState<DropdownOption[]>([
    { value: '', label: 'Semua Kab/Kota' },
  ])
  const [rekapTotal, setRekapTotal] = useState<RekapTotalResponse | null>(null)
  const [loadingRekap, setLoadingRekap] = useState(false)
  const [loadingKabupaten, setLoadingKabupaten] = useState(false)
  const rekapRequestIdRef = useRef(0)
  const [aiInsight, setAiInsight] = useState<InsightData | null>(null)
  const [generatingAi, setGeneratingAi] = useState(false)
  const [downloadingInfo, setDownloadingInfo] = useState(false)
  const [generatedAt] = useState(() => new Date())

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTab, setModalTab] = useState<ModalTab>('ringkasan')
  const wibDateLabel = formatWibDate(generatedAt)
  const wibTimeLabel = formatWibTime(generatedAt)
  const dataPerLabel = `${wibDateLabel} ${wibTimeLabel} WIB`
  const sourceDataLabel = `Data per ${wibDateLabel} - Sumber: Kemenkes RI`
  const exportDataLabel = `Data per ${wibDateLabel} - Kemenkes RI`
  const updatedAtLabel = `Diperbarui ${wibDateLabel}, ${wibTimeLabel.replace('.', ':')} WIB`

  const formatNumber = (value: string | number | undefined) => {
    const numericValue =
      typeof value === 'number'
        ? value
        : Number.parseInt((value ?? '0').toString().replace(/[^\d-]/g, ''), 10)
    if (Number.isNaN(numericValue)) return '0'
    return numericValue.toLocaleString('id-ID')
  }

  const formatPercent = (value: number) => {
    return `${Math.abs(value).toLocaleString('id-ID', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}%`
  }

  const toNumber = (value: string | number | undefined) => {
    if (typeof value === 'number') return value
    const parsed = Number.parseFloat((value ?? '0').toString().replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : 0
  }

  const getTrendForCard = (cardKeyName: string) => {
    const data = rekapTotal
    if (!data) return null

    const base = cardKeyName.replace(/^total_/, '')
    const directTrendCandidates = [
      `persen_${base}`,
      `persentase_${base}`,
      `${cardKeyName}_persen`,
      `${cardKeyName}_persentase`,
      `growth_${base}`,
      `trend_${base}`,
    ]

    for (const key of directTrendCandidates) {
      if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
        return toNumber(data[key] as string | number)
      }
    }

    const previousCandidates = [
      `${cardKeyName}_prev`,
      `${cardKeyName}_sebelumnya`,
      `${cardKeyName}_bulan_lalu`,
      `total_${base}_prev`,
      `total_${base}_sebelumnya`,
      `total_${base}_bulan_lalu`,
    ]

    for (const key of previousCandidates) {
      if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
        const current = toNumber(data[cardKeyName])
        const previous = toNumber(data[key] as string | number)
        if (previous === 0) return null
        return ((current - previous) / previous) * 100
      }
    }

    return null
  }

  const loadRekapTotal = async (kodeProvinsi: string, kodeKabupaten: string) => {
    const requestId = rekapRequestIdRef.current + 1
    rekapRequestIdRef.current = requestId
    setLoadingRekap(true)
    try {
      const response = await fetch('/api/dashboard-faskes/rekap-total', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kode_provinsi: kodeProvinsi,
          kode_kabupaten: kodeKabupaten,
        }),
      })

      if (!response.ok) return
      const payload = (await response.json()) as { data?: RekapTotalResponse }
      if (payload.data && requestId === rekapRequestIdRef.current) {
        setRekapTotal(payload.data)
      }
    } finally {
      if (requestId === rekapRequestIdRef.current) {
        setLoadingRekap(false)
      }
    }
  }

  const loadKabupaten = async (kodeProvinsi: string) => {
    setLoadingKabupaten(true)
    try {
      const response = await fetch('/api/dashboard-faskes/kabupaten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kode_provinsi: kodeProvinsi }),
      })
      if (!response.ok) return
      const payload = (await response.json()) as { data?: ApiListItem[] }
      const nextOptions: DropdownOption[] = [
        { value: '', label: 'Semua Kab/Kota' },
        ...((payload.data ?? []).map((item) => ({
          value: item.kode_kabupaten ?? '',
          label: item.nama_kabupaten ?? '-',
        }))),
      ]
      setKabupatenOptions(nextOptions)
    } finally {
      setLoadingKabupaten(false)
    }
  }

  useEffect(() => {
    void (async () => {
      const response = await fetch('/api/dashboard-faskes/provinsi', {
        method: 'POST',
      })
      if (response.ok) {
        const payload = (await response.json()) as { data?: ApiListItem[] }
        const nextOptions: DropdownOption[] = [
          { value: '', label: 'Semua Provinsi' },
          ...((payload.data ?? []).map((item) => ({
            value: item.kode_provinsi ?? '',
            label: item.nama_provinsi ?? '-',
          }))),
        ]
        setProvinsiOptions(nextOptions)
      }
      await loadRekapTotal('', '')
    })()
  }, [])

  const handleChangeProvinsi = (value: string) => {
    setSelectedProvinsi(value)
    setSelectedKabupaten('')
    if (!value) {
      setKabupatenOptions([{ value: '', label: 'Semua Kab/Kota' }])
      void loadRekapTotal('', '')
      return
    }
    void loadKabupaten(value)
    void loadRekapTotal(value, '')
  }

  const handleChangeKabupaten = (value: string) => {
    setSelectedKabupaten(value)
    void loadRekapTotal(selectedProvinsi, value)
  }

  const handleChangeCakupan = (value: string) => {
    setSelectedCakupan(value)

    if (value === 'nasional') {
      setSelectedProvinsi('')
      setSelectedKabupaten('')
      setKabupatenOptions([{ value: '', label: 'Semua Kab/Kota' }])
      void loadRekapTotal('', '')
      return
    }

    if (value === 'provinsi') {
      setSelectedKabupaten('')
      setKabupatenOptions([{ value: '', label: 'Semua Kab/Kota' }])
      void loadRekapTotal(selectedProvinsi, '')
      return
    }

    void loadRekapTotal(selectedProvinsi, selectedKabupaten)
  }

  const openModal = (tab: ModalTab) => {
    setModalTab(tab)
    setModalOpen(true)
  }

  const quickLinks = [
    { key: 'dashboard' as const, label: 'DASHBOARD', icon: LayoutDashboard },
    { key: 'rumahSakit' as const, label: 'RUMAH SAKIT', icon: Building2 },
    { key: 'puskesmas' as const, label: 'PUSKESMAS', icon: Stethoscope },
    { key: 'pustu' as const, label: 'PUSTU', icon: HousePlus },
    { key: 'klinik' as const, label: 'KLINIK', icon: Building },
    { key: 'posyandu' as const, label: 'POSYANDU', icon: HeartPulse },
    { key: 'bbkk' as const, label: 'BBKK/BKK/LKK', icon: ShieldPlus },
  ]

  const handleQuickLinkClick = (key: QuickLinkKey) => {
    setActiveQuickLink(key)
    if (key === 'dashboard') {
      setActiveFacility('puskesmas')
      return
    }
    if (key === 'rumahSakit' || key === 'puskesmas' || key === 'pustu' || key === 'klinik' || key === 'posyandu') {
      setActiveFacility(key)
      return
    }
    setActiveFacility('bbkk')
  }

  const generateAiInsight = async () => {
    if (generatingAi) return
    setGeneratingAi(true)
    try {
      const res = await fetch('/api/ai-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gaps: [
            { rank: 1, name: 'Ketersediaan Alat Kesehatan', pct: 82 },
            { rank: 2, name: 'Layanan Kesehatan Anak (MTBS)', pct: 67 },
            { rank: 3, name: 'Tenaga Gizi di Wilayah Terpencil', pct: 61 },
            { rank: 4, name: 'Sarana Air Bersih Faskes', pct: 54 },
            { rank: 5, name: 'Sistem Rujukan Berjenjang', pct: 48 },
          ],
          stats: [
            { num: '72%', label: 'Tingkat Kepatuhan Nasional' },
            { num: '10.123', label: 'Total Faskes Terdaftar' },
            { num: '34', label: 'Provinsi Terevaluasi' },
          ],
          criticalProvinces: ['Papua Pegunungan', 'Papua Selatan', 'Maluku Utara'],
        }),
      })

      if (!res.ok) {
        const payload = await res.json().catch(() => null)
        throw new Error(payload?.error || 'Gagal generate AI')
      }

      const data = (await res.json()) as InsightData
      setAiInsight(data)
      openModal('ringkasan')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal generate AI insight')
    } finally {
      setGeneratingAi(false)
    }
  }

  const ensureHtml2Canvas = async () => {
    if (typeof window === 'undefined') return null
    type Html2CanvasFn = (el: HTMLElement, opts?: Record<string, unknown>) => Promise<HTMLCanvasElement>
    const win = window as Window & { html2canvas?: Html2CanvasFn }
    if (win.html2canvas) return win.html2canvas
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Gagal memuat library export'))
      document.head.appendChild(script)
    })
    return win.html2canvas ?? null
  }

  const downloadAiInfografis = async () => {
    if (!aiInsight || downloadingInfo) return
    setDownloadingInfo(true)
    try {
      const container = document.createElement('div')
      container.style.position = 'fixed'
      container.style.left = '-99999px'
      container.style.top = '0'
      container.style.width = '1080px'
      container.style.background = 'linear-gradient(180deg,#ecfbfb 0%,#dff5f4 100%)'
      container.style.padding = '44px'
      container.style.fontFamily = 'Manrope, Arial, sans-serif'
      container.style.color = '#163e3e'
      container.innerHTML = `
        <div style="background:#ffffff;border:2px solid #bfe4e2;border-radius:24px;padding:28px;box-shadow:0 14px 36px rgba(15,143,150,.14);">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px;">
            <div>
              <div style="font-size:31px;font-weight:800;line-height:1.2;">AI Insight - Kinerja Fasilitas Kesehatan</div>
              <div style="font-size:15px;color:#4d7676;margin-top:5px;">${exportDataLabel}</div>
            </div>
            <div style="font-size:12px;color:#0f8f96;background:#e6f7f6;padding:6px 10px;border-radius:999px;font-weight:700;">Generated</div>
          </div>
          <div style="border-left:4px solid #16b7b2;background:#f1fcfb;border-radius:12px;padding:14px 16px;margin-bottom:18px;font-size:17px;line-height:1.6;">
            ${aiInsight.summary}
          </div>
          <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#6a8f8f;font-weight:700;margin-bottom:8px;">Rekomendasi Tindakan</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            ${aiInsight.recommendations
              .slice(0, 4)
              .map(
                (r, i) => `
              <div style="background:#fff;border:1px solid #cfe9e8;border-left:4px solid #16b7b2;border-radius:12px;padding:10px 12px;font-size:14px;line-height:1.5;">
                <div style="font-size:11px;color:#0f8f96;font-weight:700;margin-bottom:3px;">REKOM ${i + 1}</div>
                ${r}
              </div>`
              )
              .join('')}
          </div>
        </div>
      `
      document.body.appendChild(container)

      const html2canvas = await ensureHtml2Canvas()
      if (!html2canvas) throw new Error('Library export tidak tersedia')
      const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: '#ecfbfb' })
      container.remove()

      const link = document.createElement('a')
      link.download = `ai-insight-kemenkes-${new Date().toISOString().slice(0, 10)}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal download infografis')
    } finally {
      setDownloadingInfo(false)
    }
  }

  const insightPreviewText =
    aiInsight?.summary ??
    'Berada pada alat kesehatan, layanan anak, dan ketersediaan tenaga gizi di wilayah terpencil.'

  return (
    <div className="min-h-screen bg-[#fbffff] text-slate-800">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <section className="w-full">
        <div className="relative overflow-x-visible overflow-y-hidden border-y border-[#cfeeed] bg-[#eefdfd]">
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url('${assets.headerBackground}')` }}
          />
          <div className="absolute inset-0 bg-[rgba(245,255,255,0.34)]" />

          <div className="relative flex min-h-[219px] w-full flex-col gap-4 px-4 py-4 sm:gap-5 sm:px-5 sm:py-6 lg:px-6 lg:py-7">
            <div className="flex flex-col items-center justify-center gap-3">
              <div className="flex h-[58px] w-[160px] flex-shrink-0 items-center justify-center sm:h-[84px] sm:w-[238px]">
                <Image
                  src={assets.logo}
                  alt="Logo Kemenkes"
                  width={238}
                  height={84}
                  className="h-[58px] w-auto sm:h-[84px]"
                  priority
                />
              </div>

              <div className="w-full text-center">
                <h1 className="text-[24px] font-black uppercase leading-[1.25] tracking-[-0.02em] text-[#008c95] sm:text-[30px] lg:text-[40px] lg:leading-[1.2]">
                  <span className="hidden whitespace-nowrap lg:inline">
                    Dashboard Indikator Penilaian Kinerja Fasilitas Kesehatan
                  </span>
                  <span className="lg:hidden">Dashboard Indikator Penilaian Kinerja Fasilitas Kesehatan</span>
                </h1>
              </div>
            </div>

            <div className="-mx-1 flex w-full items-center gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:justify-center lg:px-0">
              {quickLinks.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => handleQuickLinkClick(item.key)}
                  className={`inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[16px] px-3.5 py-2 text-[14px] font-bold tracking-[0.08em] uppercase transition-all sm:gap-3 sm:rounded-[18px] sm:px-5 sm:py-2.5 sm:text-[15px] sm:tracking-[0.11em] ${
                    item.key === activeQuickLink
                      ? 'border border-[#10b9b4] bg-[#1dc7bf] text-white shadow-[0_10px_24px_rgba(29,199,191,0.24)]'
                      : 'border border-[#cfe4e3] bg-white/95 text-[#3f5a5a] hover:-translate-y-0.5 hover:border-[#9fdedb] hover:bg-[#f7fcfc] hover:text-[#0f8f96]'
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full border ${
                      item.key === activeQuickLink ? 'border-white/20 bg-white/20' : 'border-[#dbeaea] bg-[#eef7f7]'
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                  </span>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Summary Cards ────────────────────────────────────────────────────── */}
      <section className="w-full bg-[#fbffff] py-3">
        <div className="w-full px-4 sm:px-5 lg:px-6">
          <FilterDropdownBar
            selectedCakupan={selectedCakupan}
            selectedProvinsi={selectedProvinsi}
            selectedKabupaten={selectedKabupaten}
            cakupanOptions={cakupanOptions}
            provinsiOptions={provinsiOptions}
            kabupatenOptions={kabupatenOptions}
            onChangeCakupan={handleChangeCakupan}
            onChangeProvinsi={handleChangeProvinsi}
            onChangeKabupaten={handleChangeKabupaten}
            disableProvinsi={selectedCakupan === 'nasional'}
            disableKabupaten={selectedCakupan !== 'kabupaten' || !selectedProvinsi}
          />

          <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {summaryCards.map((card) => (
              (() => {
                const trend = getTrendForCard(card.keyName)
                const isUp = (trend ?? 0) >= 0
                const trendColor = isUp ? '#17b7b2' : '#e25555'
                return (
              <article
                key={card.id}
                className={`flex min-h-[118px] w-full items-center gap-3 border border-[#bedbda] bg-white px-4 py-3 shadow-[0_6px_18px_rgba(20,120,116,0.06)] transition-all sm:px-5 sm:py-3.5 ${
                  loadingRekap ? 'opacity-80' : 'opacity-100'
                }`}
                style={{
                  borderTopLeftRadius: '17px',
                  borderTopRightRadius: '17px',
                  borderBottomRightRadius: '22px',
                  borderBottomLeftRadius: '17px',
                }}
              >
                <div className="flex h-[58px] w-[58px] flex-shrink-0 items-center justify-center rounded-full bg-[#e8efef]">
                  <Image src={card.icon} alt={card.title} width={44} height={44} className="h-11 w-11" />
                </div>
                <div>
                  <p className="text-[12px] font-bold leading-none text-[#4f4f4f] sm:text-[13px]">
                    {card.title}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <p
                      className={`text-[42px] font-bold leading-[0.92] tracking-[-0.02em] text-[#454545] sm:text-[52px] ${
                        loadingRekap ? 'animate-pulse' : ''
                      }`}
                    >
                      {formatNumber(rekapTotal?.[card.keyName])}
                    </p>
                    {loadingRekap && <Loader2 className="h-5 w-5 animate-spin text-[#10b9b4]" />}
                  </div>
                  <p className="mt-2.5 text-[12px] text-[#383838] sm:text-[13px]">
                    {trend === null ? (
                      <span className="text-[#6e7d7d]">Data perubahan belum tersedia</span>
                    ) : (
                      <>
                        <span className="inline-flex items-center gap-1 font-bold" style={{ color: trendColor }}>
                          {isUp ? (
                            <ChevronUp className="h-3.5 w-3.5 stroke-[2.8]" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 stroke-[2.8]" />
                          )}
                          {formatPercent(trend)}
                        </span>{' '}
                        dari bulan sebelumnya
                      </>
                    )}
                  </p>
                </div>
              </article>
                )
              })()
            ))}
          </div>
          {loadingKabupaten && (
            <div className="mt-2 inline-flex items-center gap-2 text-[12px] text-[#0f8f96]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Memuat daftar kabupaten/kota...
            </div>
          )}
        </div>
      </section>

      {/* ── Insight + Map Section ────────────────────────────────────────────── */}
      <section className="w-full bg-[#fbffff] pb-5">
        <div className="grid w-full grid-cols-1 gap-4 px-4 sm:px-5 lg:px-6 xl:grid-cols-[381px_minmax(0,1fr)] xl:items-start">

          <div className="space-y-3">

            {/* ── Insight Card (IMPROVED) ─────────────────────────────────── */}
            <article
              className="relative overflow-hidden border border-[#b7d9d8] p-5 xl:h-[415px] xl:w-[381px]"
              style={{
                backgroundImage: `url('${assets.insightBackground}')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center bottom',
                backgroundRepeat: 'no-repeat',
                borderTopLeftRadius: '17px',
                borderTopRightRadius: '17px',
                borderBottomRightRadius: '22px',
                borderBottomLeftRadius: '17px',
              }}
            >
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(237,251,250,0.72)_0%,rgba(231,247,246,0.60)_100%)]" />

              <div className="relative z-10 flex h-full flex-col">
                {/* Icon + Title */}
                <div className="flex items-start gap-3">
                  <Image
                    src="/insight.svg"
                    alt="Insight"
                    width={52}
                    height={52}
                    className="h-13 w-13 flex-shrink-0"
                  />
                  <h3 className="text-[15px] font-extrabold uppercase leading-[1.22] text-[#1a3535] sm:text-[17px]">
                    ANALISIS PENILAIAN INDIKATOR SECARA NASIONAL
                  </h3>
                </div>

                {/* Body text */}
                <div className="mt-4 rounded-xl border-l-[4px] border-l-[#16b7b2] bg-white/68 px-3.5 py-3 backdrop-blur-[2px]">
                  <p className="text-[18px] font-extrabold leading-tight text-[#0f6e73] sm:text-[20px]">
                    Gap Terbesar Nasional
                  </p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-[#2f4040] sm:text-[14px]">
                    {insightPreviewText}
                  </p>
                </div>

                {/* Divider */}
                <div className="my-4 h-px bg-[rgba(0,0,0,0.08)]" />

                {/* ── Action Buttons (IMPROVED) ────────────────────────── */}
                <div className="mt-auto grid grid-cols-3 gap-2.5">

                  {/* Download */}
                  <button
                    onClick={downloadAiInfografis}
                    className="group flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-[14px] bg-[#16b7b2] px-2.5 py-2 text-white shadow-[0_4px_14px_rgba(22,183,178,0.32)] transition-all hover:-translate-y-0.5 hover:bg-[#10a09c] hover:shadow-[0_6px_20px_rgba(22,183,178,0.42)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                    disabled={!aiInsight || downloadingInfo}
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 transition-transform group-hover:scale-110">
                      {downloadingInfo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    </div>
                    <span className="text-center text-[10px] font-extrabold uppercase leading-tight tracking-[0.03em] sm:text-[12px]">
                      {downloadingInfo ? 'Proses...' : 'Download'}
                    </span>
                  </button>

                  {/* Rekomendasi AI */}
                  <button
                    onClick={generateAiInsight}
                    className="group flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-[14px] bg-gradient-to-br from-[#5067d8] to-[#7c4dff] px-2.5 py-2 text-white shadow-[0_4px_14px_rgba(80,103,216,0.32)] transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(124,77,255,0.42)] active:scale-95"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 transition-transform group-hover:scale-110">
                      {generatingAi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    </div>
                    <span className="text-center text-[9px] font-extrabold uppercase leading-tight tracking-[0.02em] sm:text-[11px]">
                      {generatingAi ? 'Loading...' : 'Rekomendasi'}
                    </span>
                    <span className="hidden text-center text-[9px] font-extrabold uppercase leading-tight tracking-[0.02em] sm:hidden lg:inline sm:text-[11px]">
                      AI
                    </span>
                  </button>

                  {/* Detail */}
                  <button
                    onClick={() => openModal('ringkasan')}
                    disabled={!aiInsight}
                    className="group flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-[14px] bg-[#f59e0b] px-2.5 py-2 text-white shadow-[0_4px_14px_rgba(245,158,11,0.34)] transition-all hover:-translate-y-0.5 hover:bg-[#d97706] hover:shadow-[0_6px_20px_rgba(245,158,11,0.44)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:bg-[#f59e0b] disabled:hover:shadow-[0_4px_14px_rgba(245,158,11,0.34)]"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 transition-transform group-hover:scale-110">
                      <FileText className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-center text-[10px] font-extrabold uppercase leading-tight tracking-[0.03em] sm:text-[12px]">
                      Detail
                    </span>
                  </button>
                </div>
              </div>
            </article>

            {/* Source card */}
            <article
              className="border border-[#b7c8c9] bg-[#e9f1f2] p-4 xl:h-[183px] xl:w-[381px]"
              style={{
                borderTopLeftRadius: '17px',
                borderTopRightRadius: '17px',
                borderBottomRightRadius: '22px',
                borderBottomLeftRadius: '17px',
              }}
            >
              <h4 className="text-[18px] font-bold text-[#2f3a3a] sm:text-[22px]">Sumber Data:</h4>
              <p className="mt-1 text-[14px] text-[#3f4a4a] sm:text-[16px]">
                Kementerian Kesehatan Republik Indonesia
              </p>
              <h4 className="mt-4 text-[18px] font-bold text-[#2f3a3a] sm:text-[22px]">Data per:</h4>
              <p className="mt-1 text-[14px] text-[#3f4a4a] sm:text-[16px]">{dataPerLabel}</p>
            </article>
          </div>

          {/* Map Card */}
          <article
            className="border border-[#cdcdcd] bg-white p-4 xl:h-[615px]"
            style={{
              borderTopLeftRadius: '17px',
              borderTopRightRadius: '17px',
              borderBottomRightRadius: '22px',
              borderBottomLeftRadius: '17px',
            }}
          >
            <h3 className="text-[18px] font-bold uppercase leading-tight text-[#2f2f2f] sm:text-[20px]">
              KEPADATAN / JUMLAH TOTAL FASKES
            </h3>
            <p className="mt-2 text-[15px] leading-relaxed text-[#4b4b4b] sm:text-[16px]">
              Pemetaan ini menyajikan gambaran komprehensif mengenai distribusi geografis dan klasifikasi status Fasilitas Kesehatan di seluruh wilayah Indonesia.
            </p>
            <div className="mt-4 h-[300px] sm:h-[350px] md:h-[420px] xl:h-[470px]">
              <IndonesiaStatusMapClient
                selectedProvinsi={selectedProvinsi}
                selectedKabupaten={selectedKabupaten}
              />
            </div>
          </article>
        </div>
      </section>

      {/* ── Chart Cards ──────────────────────────────────────────────────────── */}
      <ChartCardsSection rekapTotal={rekapTotal} loading={loadingRekap} />
      <FacilityProvinceSection
        key={activeFacility}
        activeFacility={activeFacility}
        selectedProvinsi={selectedProvinsi}
        selectedKabupaten={selectedKabupaten}
      />

      {/* ── Insight Modal ────────────────────────────────────────────────────── */}
      <InsightModal
        key={modalTab}
        open={modalOpen}
        defaultTab={modalTab}
        aiInsight={aiInsight}
        sourceDataLabel={sourceDataLabel}
        updatedAtLabel={updatedAtLabel}
        onClose={() => setModalOpen(false)}
      />
    </div>
  )
}
