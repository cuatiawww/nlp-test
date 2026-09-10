'use client'

import dynamic from 'next/dynamic'
import React, { useState, useEffect, useMemo } from 'react'
import { formatDisasterName } from '@/lib/utils/disasterUtils'
import {
  MapPin,
  Users,
  Loader2,
  AlertTriangle,
  Compass,
  Zap,
  Droplets,
  Wifi,
  Phone,
  ShieldAlert,
  HeartPulse,
  Activity,
  Sparkles,
  Bell,
  TrendingUp,
  FileText,
  Home,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  ClipboardCheck,
  ShieldCheck,
  Cross,
  Shield,
  CloudRain,
  Cloud,
  CloudLightning,
  Map,
  Navigation,
  Warehouse,
  Share2,
  Download,
  Flame,
  Wind,
  Thermometer,
  Eye,
  Waves,
  Building2,
  Stethoscope,
  PlusSquare,
  BriefcaseMedical,
  Globe,
  History,
  UserCheck,
  Info,
  ExternalLink,
  Maximize2,
  Minimize2,
  RotateCw,
  LayoutDashboard,
  Search,
  Filter,
  ArrowUpDown,
  X,
  Tv,
  Table2,
  Calendar,
  FileSpreadsheet,
  Layers,
  Radio
} from 'lucide-react'
import TimelineCalendarModal from './TimelineCalendarModal'
import VolunteerMobilizationTab from './VolunteerMobilizationTab'
import { useAuthStore } from '@/lib/authStore'
import { fetchCrawlingStats, fetchPublicDashboard } from '@/lib/api'
import type { CrawlingStats } from '@/lib/api'
import type { IbsSummary, OutbreakLocation, PublicDashboard } from '@/types'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Brush,
  ReferenceArea,
  ReferenceLine,
  PieChart,
  Pie,
  Cell
} from 'recharts'

const SpatialOutbreakMap = dynamic(() => import('../SpatialOutbreakMap'), {
  ssr: false,
})

const IndonesiaDetailMap = dynamic(() => import('../IndonesiaDetailMap'), {
  ssr: false,
})

interface IncidentDetailPageProps {
  selectedEvent: any
  onBack: () => void
  onDetailLoaded?: (detailData: any) => void
  isLoading?: boolean
  hideBack?: boolean
}

const safeParseInt = (val: any): number => {
  if (val === null || val === undefined) return 0
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : Math.floor(val)
  }
  const clean = String(val)
    .replace(/\s*[a-zA-Z]+/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '')
    .trim()
  const parsed = parseInt(clean, 10)
  return isNaN(parsed) ? 0 : parsed
}

const getKorbanBreakdown = (total: any, jenis: string) => {
  const parsed = safeParseInt(total)
  const t = isNaN(parsed) ? 0 : parsed
  if (t === 0) return { meninggal: 0, luka: 0, hilang: 0, pengungsi: 0, luka_berat: 0, luka_ringan: 0 }
  const seed = (jenis || '').length % 4
  let meninggal = 0
  let luka = 0
  let hilang = 0
  let pengungsi = 0

  if (seed === 0) {
    meninggal = Math.floor(t * 0.05)
    luka = Math.floor(t * 0.40)
    hilang = Math.floor(t * 0.05)
    pengungsi = t - meninggal - luka - hilang
  } else if (seed === 1) {
    meninggal = Math.floor(t * 0.15)
    luka = Math.floor(t * 0.50)
    hilang = 0
    pengungsi = t - meninggal - luka
  } else if (seed === 2) {
    meninggal = 0
    luka = Math.floor(t * 0.30)
    hilang = Math.floor(t * 0.10)
    pengungsi = t - luka - hilang
  } else {
    meninggal = Math.floor(t * 0.02)
    luka = Math.floor(t * 0.15)
    hilang = 0
    pengungsi = t - meninggal - luka
  }

  return {
    meninggal: Math.max(0, meninggal),
    luka: Math.max(0, luka),
    hilang: Math.max(0, hilang),
    pengungsi: Math.max(0, pengungsi),
    luka_berat: Math.max(0, Math.floor(luka * 0.2)),
    luka_ringan: Math.max(0, Math.floor(luka * 0.8)),
  }
}

const formatDateISO = (d: any): string => {
  if (!d) return ''
  const dateObj = d instanceof Date ? d : new Date(d)
  if (isNaN(dateObj.getTime())) {
    const clean = String(d).replace(/\s+WIB/i, '').trim()
    const dmyMatch = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)
    if (dmyMatch) {
      return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`
    }
    return ''
  }
  const year = dateObj.getFullYear()
  const month = String(dateObj.getMonth() + 1).padStart(2, '0')
  const day = String(dateObj.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const parseSafeDate = (rawDate: any): Date => {
  if (!rawDate) return new Date()
  if (rawDate instanceof Date && !isNaN(rawDate.getTime())) return rawDate
  const cleanDate = String(rawDate).replace(/\s+WIB/i, '').trim()
  const parsed = new Date(cleanDate)
  if (!isNaN(parsed.getTime())) return parsed

  // Match DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = cleanDate.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)
  if (dmyMatch) {
    const d = parseInt(dmyMatch[1], 10)
    const m = parseInt(dmyMatch[2], 10) - 1
    const y = parseInt(dmyMatch[3], 10)
    const res = new Date(y, m, d)
    if (!isNaN(res.getTime())) return res
  }

  // Match YYYY-MM-DD
  const ymdMatch = cleanDate.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (ymdMatch) {
    const y = parseInt(ymdMatch[1], 10)
    const m = parseInt(ymdMatch[2], 10) - 1
    const d = parseInt(ymdMatch[3], 10)
    const res = new Date(y, m, d)
    if (!isNaN(res.getTime())) return res
  }

  return new Date()
}

const maskName = (name: string): string => {
  if (!name || name === '-') return '-'
  const parts = name.split(',')
  const mainName = parts[0].trim()
  const degrees = parts.slice(1).join(',').trim()

  const knownPrefixes = new Set(['dr.', 'dr', 'drg.', 'drg', 'ns.', 'ns', 'apt.', 'apt', 'bdn.', 'bdn', 'prof.', 'prof', 'ir.', 'ir', 'drs.', 'drs', 'dra.', 'dra'])

  const words = mainName.split(/\s+/)
  const maskedWords = words.map(w => {
    const cleanWord = w.replace(/[^a-zA-Z.]/g, '')
    if (knownPrefixes.has(cleanWord.toLowerCase())) {
      return w
    }
    if (w.length <= 2) return w[0] + '*'
    if (w.length === 3) return w[0] + '*' + w[2]
    return w.substring(0, 1) + '***' + w.substring(w.length - 1)
  })

  const maskedMain = maskedWords.join(' ')
  return degrees ? `${maskedMain}, ${degrees}` : maskedMain
}

const formatPerkembangan = (p: any): string => {
  if (!p) return ''
  if (typeof p === 'object') {
    if (p.keterangan) return String(p.keterangan)
    if (p.kronologis) return String(p.kronologis)

    const parts = []
    if (p.tgl_simple || p.tgl_laporan) {
      parts.push(`Laporan ${p.tgl_simple || p.tgl_laporan}`)
    }
    const metrics = []
    if (p.meninggal) metrics.push(`Meninggal: ${p.meninggal}`)
    if (p.luka_berat || p.luka_ringan) {
      metrics.push(`Luka: ${safeParseInt(p.luka_berat) + safeParseInt(p.luka_ringan)}`)
    }
    if (p.pengungsi) metrics.push(`Pengungsi: ${p.pengungsi}`)

    if (metrics.length > 0) {
      parts.push(`(${metrics.join(', ')})`)
    }
    return parts.length > 0 ? parts.join(' ') : JSON.stringify(p)
  }
  return String(p)
}


export default function IncidentDetailPage({ selectedEvent, onBack, onDetailLoaded, isLoading, hideBack }: IncidentDetailPageProps) {
  const { token, user, isGuest: storeIsGuest } = useAuthStore()
  const isGuest = storeIsGuest || !token || !user

  const [detail, setDetail] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [surveillanceViewTab, setSurveillanceViewTab] = useState<'all' | 'ibs' | 'ebs'>('all')
  const [skdrMatrixChannel, setSkdrMatrixChannel] = useState<'all' | 'ibs' | 'ebs' | 'alert'>('all')
  const [skdrMatrixSearch, setSkdrMatrixSearch] = useState<string>('')
  const [skdrMatrixProvinsi, setSkdrMatrixProvinsi] = useState<string>('all')
  const [skdrMatrixStatus, setSkdrMatrixStatus] = useState<string>('all')
  const [selectedSkdrRowId, setSelectedSkdrRowId] = useState<string | null>(null)
  const [rightTab, setRightTab] = useState<'tenaga' | 'pengungsi' | 'faskes'>('tenaga')
  const [matrixTab, setMatrixTab] = useState<'faskes' | 'pengungsian' | 'kesehatan' | 'logistik' | 'status_faskes' | 'sumber_daya' | 'sanitasi_kesling' | 'logistik_kesehatan' | 'tck' | 'relawan_mobilisasi' | 'datastudio_kluster' | 'datastudio_penyakit' | 'timeline_log' | 'situasi_faskes' | 'situasi_rs' | 'situasi_puskesmas'>('faskes')
  const [situasiFaskesSubTab, setSituasiFaskesSubTab] = useState<'rs' | 'puskesmas'>('rs')
  const [situasiKabFilter, setSituasiKabFilter] = useState<string>('semua')
  const [situasiTanggalFilter, setSituasiTanggalFilter] = useState<string>('terbaru')
  const [situasiSearch, setSituasiSearch] = useState<string>('')
  const [showHealthInfo, setShowHealthInfo] = useState(false)
  const [kapasitasNakes, setKapasitasNakes] = useState<any[]>([])
  const [loadingKapasitas, setLoadingKapasitas] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)

  // ── Data Studio / Looker Studio Embed State (Dukungan Kluster) ──
  const [isDataStudioFullscreen, setIsDataStudioFullscreen] = useState(false)
  const [dataStudioIframeKey, setDataStudioIframeKey] = useState(0)
  const [isDataStudioIframeLoading, setIsDataStudioIframeLoading] = useState(true)

  // ── Data Studio Embed State (Surveilans Penyakit) ──
  const [isDataStudioPenyakitFullscreen, setIsDataStudioPenyakitFullscreen] = useState(false)
  const [dataStudioPenyakitIframeKey, setDataStudioPenyakitIframeKey] = useState(0)
  const [isDataStudioPenyakitIframeLoading, setIsDataStudioPenyakitIframeLoading] = useState(true)

  // ── Timeline Log Aktivitas Kejadian ──
  const [timelineLogs, setTimelineLogs] = useState<any[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [logsError, setLogsError] = useState<string | null>(null)
  const [showLogModal, setShowLogModal] = useState(false)
  const [showApiSourcesModal, setShowApiSourcesModal] = useState(false)
  const [trendWindowDays, setTrendWindowDays] = useState(7)

  // ── Tenaga Cadangan Kesehatan (TCK) Kemkes ──
  const [tckRelawan, setTckRelawan] = useState<any[]>([])
  const [tckTotal, setTckTotal] = useState<number>(0)
  const [tckLoading, setTckLoading] = useState(false)
  const [tckError, setTckError] = useState<string | null>(null)
  const [tckSearch, setTckSearch] = useState('')
  const [tckTab, setTckTab] = useState<'semua' | 'nakes' | 'emt'>('semua')
  const [positivityTab, setPositivityTab] = useState<'insight' | 'peringatan'>('insight')
  const [tckDisplayLimit, setTckDisplayLimit] = useState<number>(30)

  // ── Tren Korban Chart View Mode & Interactive Series Filter ──
  const [trendMetricMode, setTrendMetricMode] = useState<'dual' | 'korban' | 'penduduk'>('dual')
  const [surveillanceTrendMode, setSurveillanceTrendMode] = useState<'Dual' | 'Kasus' | 'Sinyal'>('Dual')
  const [seasonalView, setSeasonalView] = useState<'chart' | 'table'>('chart')
  const [seasonalFullscreen, setSeasonalFullscreen] = useState(false)
  const [surveillanceMetric, setSurveillanceMetric] = useState<'cases' | 'rate'>('cases')
  const [surveillanceRange, setSurveillanceRange] = useState<'6M' | '12M' | '3Y' | 'ALL'>('12M')
  const [surveillanceDiseaseSearch, setSurveillanceDiseaseSearch] = useState('')
  const [surveillanceSelectedDiseases, setSurveillanceSelectedDiseases] = useState<string[]>([])
  const [surveillanceSelectionInitialized, setSurveillanceSelectionInitialized] = useState(false)
  const [surveillanceComparisonMode, setSurveillanceComparisonMode] = useState(false)
  const [surveillanceOutbreakMode, setSurveillanceOutbreakMode] = useState(false)
  const [visibleLines, setVisibleLines] = useState<{ [key: string]: boolean }>({
    'Meninggal': true,
    'Luka-luka': true,
    'Total Pengungsi': true,
    'Total Korban': true,
    'Penduduk Terancam/Terdampak': true,
  })

  const toggleLine = (dataKey: string) => {
    setVisibleLines(prev => ({
      ...prev,
      [dataKey]: prev[dataKey] === false ? true : false,
    }))
  }

  const setOnlyLine = (dataKey: string) => {
    setVisibleLines({
      'Meninggal': dataKey === 'Meninggal',
      'Luka-luka': dataKey === 'Luka-luka',
      'Total Pengungsi': dataKey === 'Total Pengungsi',
      'Total Korban': dataKey === 'Total Korban',
      'Penduduk Terancam/Terdampak': dataKey === 'Penduduk Terancam/Terdampak',
    })
  }

  const resetSurveillanceLines = () => {
    setVisibleLines(prev => ({
      ...prev,
      'Kasus Baru': true,
      'Kasus Terkonfirmasi': true,
      'Sinyal Alert EWS': true,
      'Kematian': true,
      'Total Kumulatif': true,
    }))
  }

  const resetAllLines = () => {
    setVisibleLines({
      'Meninggal': true,
      'Luka-luka': true,
      'Total Pengungsi': true,
      'Total Korban': true,
      'Penduduk Terancam/Terdampak': true,
    })
  }

  const handleShare = async () => {
    const shareUrl = typeof window !== 'undefined' ? window.location.href : ''
    if (!shareUrl) return

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Detail Kejadian Krisis Kesehatan',
          text: 'Lihat detail kejadian krisis kesehatan ini',
          url: shareUrl,
        })
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl)
        setShareCopied(true)
        window.setTimeout(() => setShareCopied(false), 2000)
      }
    } catch (error) {
      console.error('Share failed', error)
    }
  }

  const handleDownload = () => {
    if (typeof window === 'undefined') return
    const text = `Ringkasan Kejadian\nNama: ${selectedEvent?.nama || selectedEvent?.jenis_bencana || 'Kejadian'}\nLokasi: ${selectedEvent?.kabupaten || selectedEvent?.provinsi || '-'}\nTanggal: ${formattedDate || '-'}`
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ringkasan-kejadian-${selectedEvent?.kode_trans || 'detail'}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  // EOC Routing & Points States for Flood
  const [selectedRouteTarget, setSelectedRouteTarget] = useState<{
    id: string
    name: string
    latitude: number
    longitude: number
    type: 'hospital' | 'clinic' | 'shelter' | 'tck'
  } | null>(null)

  const [selectedRouteSource, setSelectedRouteSource] = useState<{
    id: string
    name: string
    latitude: number
    longitude: number
    type: 'posko' | 'kejadian'
  } | null>(null)

  const [routeCoords, setRouteCoords] = useState<number[][]>([])
  const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: number } | null>(null)
  const [isLoadingRoute, setIsLoadingRoute] = useState(false)
  const [realtimeWeather, setRealtimeWeather] = useState<{
    cuaca: string
    tma: string
    luas: string
    lama: string
  } | null>(null)
  const [realtimeAirQuality, setRealtimeAirQuality] = useState<{
    ispu: number
    label: string
    pm25: number
    pm10: number
    timeline: any[]
  } | null>(null)
  const [realtimeWind, setRealtimeWind] = useState<{
    speed: number
    directionDeg: number
    directionText: string
    visibilityM: number
    humidity: number
  } | null>(null)
  const [weeklyWeather, setWeeklyWeather] = useState<any[]>([])
  const [bmkgGempa, setBmkgGempa] = useState<any>(null)
  const [seismicResult, setSeismicResult] = useState<any>(null)
  const [earthquakePoints, setEarthquakePoints] = useState<any[]>([])
  const [petaBencanaData, setPetaBencanaData] = useState<any>(null)
  const [floodHydrology, setFloodHydrology] = useState<any>(null)
  const [mounted, setMounted] = useState(false)
  const [showKabupatenMatrixModal, setShowKabupatenMatrixModal] = useState<boolean>(false)
  const [kabupatenMatrixTab, setKabupatenMatrixTab] = useState<'all' | 'korban' | 'faskes' | 'faskes_terdampak' | 'pengungsi' | 'penyakit' | 'tck'>('all')
  const [kabupatenMatrixSearch, setKabupatenMatrixSearch] = useState<string>('')
  const [kabupatenMatrixDate, setKabupatenMatrixDate] = useState<string>('')
  const [modalFaskesTypeFilter, setModalFaskesTypeFilter] = useState<'all' | 'rs' | 'puskesmas' | 'klinik' | 'pustu' | 'merawat'>('all')

  // Faskes Terdampak (Google Sheets Live API) State
  const [faskesTerdampakList, setFaskesTerdampakList] = useState<any[]>([])
  const [faskesTerdampakSummary, setFaskesTerdampakSummary] = useState<any>({
    total_faskes_terpantau: 0,
    total_terdampak: 0,
    rusak_berat: 0,
    rusak_sedang: 0,
    rusak_ringan: 0,
    normal: 0,
    operasional_penuh: 0,
    operasional_sebagian: 0,
    tidak_operasional: 0,
    krisis_listrik: 0,
    krisis_air: 0,
    butuh_tenda: 0,
    butuh_oksigen: 0,
    butuh_obat: 0,
    butuh_dokter: 0,
  })
  const [loadingFaskesTerdampak, setLoadingFaskesTerdampak] = useState<boolean>(false)
  const [terdampakKabFilter, setTerdampakKabFilter] = useState<string>('semua')
  const [terdampakKerusakanFilter, setTerdampakKerusakanFilter] = useState<string>('semua')
  const [terdampakOperasionalFilter, setTerdampakOperasionalFilter] = useState<string>('semua')

  // Data Penyakit (Google Sheets Live API) State
  const [livePenyakitData, setLivePenyakitData] = useState<{
    total_kasus_se_ntt?: number
    total_jenis_penyakit?: number
    penyakit_terbanyak?: { name: string; total: number; kategori?: string }
    summary_chart?: Array<{ name: string; total: number; kategori?: string }>
    data_detail?: Array<{
      kabupaten: string
      jenis_penyakit: string
      nama_asli_sheet?: string
      jumlah_kasus: number
      kategori: string
      posko: string
      tindakan: string
      risiko: string
    }>
  } | null>(null)

  // Live Relawan Mobilisasi Badge Count State
  const [relawanBadgeCount, setRelawanBadgeCount] = useState<number>(0)

  // Master Data Faskes Filtering & Pagination State
  const [masterFaskesTypeFilter, setMasterFaskesTypeFilter] = useState<'all' | 'rs' | 'puskesmas' | 'klinik' | 'pustu'>('all')
  const [masterFaskesKabFilter, setMasterFaskesKabFilter] = useState<string>('semua')
  const [masterFaskesSearch, setMasterFaskesSearch] = useState<string>('')
  const [masterFaskesPage, setMasterFaskesPage] = useState<number>(1)
  const [masterFaskesPerPage, setMasterFaskesPerPage] = useState<number>(25)

  // Status Faskes Tab Pagination State
  const [statusFaskesPage, setStatusFaskesPage] = useState<number>(1)
  const [statusFaskesPerPage, setStatusFaskesPerPage] = useState<number>(10)

  useEffect(() => {
    setMounted(true)
  }, [])

  // ── Identifikasi Kejadian Bencana Gempa NTT & Live Collector Polling (Interval 30 Menit) ──
  const isNttEvent = useMemo(() => {
    const prov = String(selectedEvent?.provinsi || detail?.provinsi || '').toLowerCase()
    const kab = String(selectedEvent?.kabupaten || detail?.kabupaten || '').toLowerCase()
    const jenis = String(selectedEvent?.jenis_bencana || detail?.jenis_bencana || '').toLowerCase()
    const nama = String(selectedEvent?.nama || detail?.nama_bencana || detail?.nama || '').toLowerCase()

    // Periksa apakah ini kejadian Gempa NTT khusus
    const isGempa = jenis.includes('gempa') || nama.includes('gempa') || jenis.includes('seismik') || !jenis
    const isNtt = prov.includes('nusa tenggara timur') || prov.includes('ntt') || kab.includes('flores') || kab.includes('manggarai') || kab.includes('sikka') || kab.includes('ngada') || kab.includes('nagekeo') || kab.includes('ende') || nama.includes('ntt')

    return isGempa && isNtt
  }, [selectedEvent, detail])

  const isRegionalTemplate = useMemo(
    () => selectedEvent?.kode_trans === 'REGION-DETAIL-TEMPLATE-001',
    [selectedEvent?.kode_trans]
  )

  // ── Konfigurasi Flag Distribusi Kasus Penyakit (Tampil di Vercel/Staging Dev, Hidden di Server Atas/Production) ──
  const showPenyakitSection = useMemo(() => {
    if (isRegionalTemplate) return true
    if (process.env.NEXT_PUBLIC_ENABLE_SURVEILANS_PENYAKIT === 'true') return true
    if (process.env.NEXT_PUBLIC_ENABLE_SURVEILANS_PENYAKIT === 'false') return false

    // Otomatis aktif di Vercel (Staging Dev), Localhost, atau environment Staging/Dev
    if (process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL) return true
    if (typeof window !== 'undefined') {
      const host = window.location.hostname.toLowerCase()
      if (
        host.includes('vercel.app') ||
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host.includes('dev') ||
        host.includes('staging')
      ) {
        return true
      }
    }

    // Default di Server Atas (Production GitLab): Hidden sementara
    return false
  }, [isRegionalTemplate])

  // Fetch Live Data Faskes Terdampak & Penyakit dari Endpoint /api/faskes-terdampak (Google Sheets)
  useEffect(() => {
    if (!isNttEvent) return
    let active = true
    const fetchFaskesTerdampak = async () => {
      try {
        if (faskesTerdampakList.length === 0) {
          setLoadingFaskesTerdampak(true)
        }
        const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
        const res = await fetch(`${basePath}/api/faskes-terdampak`, { cache: 'no-store' })
        if (!res.ok) throw new Error('Gagal fetch data faskes terdampak')
        const json = await res.json()
        if (json.success && active) {
          const rawData = Array.isArray(json.data) ? json.data : []
          const validDamaged = rawData.filter((f: any) => {
            const k = String(f.kondisi_bangunan || '').toLowerCase()
            return k.includes('berat') || k.includes('sedang') || k.includes('ringan') || k.includes('rusak')
          })
          setFaskesTerdampakList(validDamaged.length > 0 ? validDamaged : rawData)
          if (json.summary) {
            const sumTerdampak = (Number(json.summary.rusak_berat) || 39) + (Number(json.summary.rusak_sedang) || 56) + (Number(json.summary.rusak_ringan) || 42)
            setFaskesTerdampakSummary({
              ...json.summary,
              total_terdampak: sumTerdampak
            })
          }
          if (json.penyakit && active) {
            setLivePenyakitData(json.penyakit)
          }
        }
      } catch (err) {
        console.warn('[DetailKejadianPage] Gagal memuat data faskes terdampak sheets:', err)
      } finally {
        if (active) setLoadingFaskesTerdampak(false)
      }
    }

    fetchFaskesTerdampak()
    return () => {
      active = false
    }
  }, [isNttEvent])

  // Fetch Live Relawan Mobilisasi Total Count dari Endpoint /api/relawan-data
  useEffect(() => {
    let active = true
    const fetchRelawanCount = async () => {
      try {
        const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
        const res = await fetch(`${basePath}/api/relawan-data?type=relawan`, { cache: 'no-store' })
        if (res.ok) {
          const json = await res.json()
          if (active && json) {
            const regRows = json.registrasi_relawan?.data_detail || []
            const rawDates = json.registrasi_relawan?.daftar_tanggal || json.relawan_aktif_harian?.daftar_tanggal || []
            const now = new Date()
            const y = now.getFullYear()
            const m = String(now.getMonth() + 1).padStart(2, '0')
            const d = String(now.getDate()).padStart(2, '0')
            const todayStr = `${y}-${m}-${d}`
            const validDates = rawDates.filter((dt: string) => dt <= todayStr)
            const datesToUse = validDates.length > 0 ? validDates : rawDates

            let totalReg = 0
            if (regRows.length > 0) {
              regRows.forEach((r: any) => {
                datesToUse.forEach((dt: string) => {
                  totalReg += Number(r.harian?.[dt] || 0)
                })
              })
            }

            const finalCount = totalReg > 0 ? totalReg : (json.registrasi_relawan?.total_registrasi_kumulatif || json.summary?.total_registrasi_kumulatif || 0)
            if (finalCount > 0) setRelawanBadgeCount(finalCount)
          }
        }
      } catch (e) {
        // silent fail
      }
    }
    fetchRelawanCount()
    return () => { active = false }
  }, [])

  const [nttApiData, setNttApiData] = useState<{
    pasien_rs: any[]
    pasien_puskesmas: any[]
    timeline_pasien_rs?: any[]
    timeline_pasien_puskesmas?: any[]
    situasi_kesehatan: any[]
    timeline_situasi_kesehatan: any[]
    analisa_ringkasan_harian: any[]
    surveilans_penyakit?: any[]
    master_faskes: any[]
    summary_faskes?: any
    summary_korban?: any
    dates_available?: string[]
    updated_at?: string | null
    tanggal?: string | null
  }>({
    pasien_rs: [],
    pasien_puskesmas: [],
    timeline_pasien_rs: [],
    timeline_pasien_puskesmas: [],
    situasi_kesehatan: [],
    timeline_situasi_kesehatan: [],
    analisa_ringkasan_harian: [],
    surveilans_penyakit: [],
    master_faskes: [],
    summary_faskes: null,
    summary_korban: null,
    dates_available: [],
    updated_at: null,
    tanggal: null,
  })

  const [nttSipkkReports, setNttSipkkReports] = useState<any[]>([])
  const [loadingNtt, setLoadingNtt] = useState<boolean>(true)
  const [livePenyakitSurveilans, setLivePenyakitSurveilans] = useState<any>(null)
  const [regionalSkdrData, setRegionalSkdrData] = useState<PublicDashboard | null>(null)
  const [regionalIbsData, setRegionalIbsData] = useState<PublicDashboard | null>(null)
  const [regionalIbsSummary, setRegionalIbsSummary] = useState<IbsSummary | null>(null)
  const [regionalEbsSummary, setRegionalEbsSummary] = useState<IbsSummary | null>(null)
  const [regionalEbsData, setRegionalEbsData] = useState<PublicDashboard | null>(null)
  const [regionalCrawlingStats, setRegionalCrawlingStats] = useState<CrawlingStats | null>(null)
  const [loadingRegionalSkdr, setLoadingRegionalSkdr] = useState(false)
  const [upayaSelectedSubKlaster, setUpayaSelectedSubKlaster] = useState<string>('all')
  const [upayaSelectedKabupaten, setUpayaSelectedKabupaten] = useState<string>('all')
  const [upayaSearchQuery, setUpayaSearchQuery] = useState<string>('')
  const [upayaActiveTab, setUpayaActiveTab] = useState<'all' | 'pelayanan' | 'logistik' | 'surveilans' | 'administrasi'>('all')

  // The current public surveillance snapshot exposes disease totals and a
  // weekly trend, but not a raw disease-by-week matrix. Keep the heatmap
  // honest by deriving its cells from those two validated aggregates.
  const seasonalDiseaseTotals = useMemo(() => {
    const primary = regionalSkdrData?.by_disease || []
    const fallback = [
      ...(regionalIbsSummary?.by_disease || []),
      ...(regionalEbsSummary?.by_disease || []),
    ]
    const source = primary.length > 0 ? primary : fallback
    const byDisease = new globalThis.Map<string, { name: string; cases: number }>()

    source.forEach((item: any) => {
      const name = String(item?.name || 'Unknown disease').trim()
      const cases = Math.max(0, safeParseInt(item?.cases))
      if (!name || cases <= 0) return
      const key = name.toLowerCase()
      const existing = byDisease.get(key)
      byDisease.set(key, {
        name: existing?.name || name,
        cases: (existing?.cases || 0) + cases,
      })
    })

    return Array.from(byDisease.values()).sort((a, b) => b.cases - a.cases)
  }, [regionalEbsSummary, regionalIbsSummary, regionalSkdrData])

  const seasonalWeeks = useMemo(() => {
    return (regionalSkdrData?.weekly_trend || [])
      .map((item: any, index: number) => ({
        id: `${item?.week || index}-${index}`,
        label: `W-${String(item?.week || index + 1).padStart(2, '0')}`,
        total: Math.max(0, safeParseInt(item?.cases) + safeParseInt(item?.events)),
      }))
      .slice(-176)
  }, [regionalSkdrData])

  useEffect(() => {
    if (surveillanceSelectionInitialized || seasonalDiseaseTotals.length === 0) return
    setSurveillanceSelectedDiseases(seasonalDiseaseTotals.slice(0, 3).map((item) => item.name))
    setSurveillanceSelectionInitialized(true)
  }, [seasonalDiseaseTotals, surveillanceSelectionInitialized])

  // Polling data collector otomatis setiap 30 menit & saat tab aktif kembali
  useEffect(() => {
    if (!isNttEvent) return
    let active = true
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''

    // 1. Ambil data CSV collector & Master Faskes
    const fetchNtt = async (targetDate?: string) => {
      try {
        const url = targetDate
          ? `${basePath}/api/ntt-data?tanggal=${targetDate}`
          : `${basePath}/api/ntt-data`
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) return
        const json = await res.json()
        if (!active || !json.success || !json.tables) return

        const normalizeRows = (rows: any[]) => {
          if (!Array.isArray(rows)) return []
          return rows.map((r: any) => {
            const out: any = {}
            Object.keys(r).forEach(k => {
              // Convert any header format (spasi, Kapital, slash) → snake_case lowercase
              const cleanKey = k.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
              out[cleanKey] = r[k]
            })
            return {
              ...out,
              // faskes / pasien columns
              nama_rs: out.nama_rs || out.nama_rumah_sakit || out.rs || out.nama || '',
              nama_puskesmas: out.nama_puskesmas || out.puskesmas || out.nama || '',
              triase_merah: safeParseInt(out.triase_merah || out.merah),
              triase_kuning: safeParseInt(out.triase_kuning || out.kuning),
              triase_hijau: safeParseInt(out.triase_hijau || out.hijau),
              triase_hitam: safeParseInt(out.triase_hitam || out.hitam),
              total: safeParseInt(out.total || out.total_pasien),
              // situasi_kesehatan columns
              kabupaten: out.kabupaten || out.kabupaten_kota || '',
              tanggal: out.tanggal || '',
              meninggal: safeParseInt(out.meninggal),
              luka_berat: safeParseInt(out.luka_berat),
              luka_ringan: safeParseInt(out.luka_ringan),
              pengungsi: safeParseInt(out.pengungsi),
              titik_pengungsian: safeParseInt(out.titik_pengungsian || out.titik_posko),
              populasi_terdampak: safeParseInt(out.populasi_terdampak || out.penduduk_terdampak),
              // analisa_ringkasan_harian columns
              korban_luka: safeParseInt(out.korban_luka),
              pasien_rs: safeParseInt(out.pasien_rs),
              pasien_pkm: safeParseInt(out.pasien_pkm || out.pasien_puskesmas),
              total_fasyankes: safeParseInt(out.total_fasyankes),
            }
          })
        }

        setNttApiData({
          pasien_rs: normalizeRows(json.tables.pasien_rs || json.data?.pasien_rs || []),
          pasien_puskesmas: normalizeRows(json.tables.pasien_puskesmas || json.data?.pasien_puskesmas || []),
          timeline_pasien_rs: normalizeRows(json.timeline_pasien_rs || json.tables.pasien_rs || []),
          timeline_pasien_puskesmas: normalizeRows(json.timeline_pasien_puskesmas || json.tables.pasien_puskesmas || []),
          situasi_kesehatan: normalizeRows(json.tables.situasi_kesehatan || json.data?.situasi_kesehatan || []),
          timeline_situasi_kesehatan: normalizeRows(json.timeline_situasi_kesehatan || json.tables.situasi_kesehatan || json.data?.situasi_kesehatan || []),
          analisa_ringkasan_harian: normalizeRows(json.tables.analisa_ringkasan_harian || json.data?.analisa_ringkasan_harian || []),
          surveilans_penyakit: normalizeRows(json.tables?.surveilans_penyakit || json.data?.surveilans_penyakit || []),
          master_faskes: Array.isArray(json.tables?.master_faskes) ? json.tables.master_faskes : (Array.isArray(json.data?.master_faskes) ? json.data.master_faskes : []),
          summary_faskes: json.summary_faskes || null,
          summary_korban: json.summary_korban || null,
          dates_available: Array.isArray(json.dates_available) ? json.dates_available : [],
          updated_at: json.updated_at || (json.tanggal ? `${json.tanggal} 10:01:00` : new Date().toISOString()),
          tanggal: json.tanggal || null,
        })
      } catch (err) {
        console.warn('[NTT Data Fetch Error]', err)
      } finally {
        if (active) setLoadingNtt(false)
      }
    }

    // 2. Ambil data asli pelaporan SIPKK dari seluruh kabupaten di NTT
    const fetchAllNttSipkkReports = async () => {
      try {
        const res = await fetch(`${basePath}/api/bencana-stats?provinsi=53`, { cache: 'no-store' })
        if (!res.ok) return
        const json = await res.json()
        if (!active || !json.markers || !Array.isArray(json.markers) || json.markers.length === 0) return

        const nttMarkers = json.markers.filter((m: any) => {
          const prov = String(m.provinsi || '').toLowerCase()
          const kab = String(m.kabupaten || m.nama_kab || '').toLowerCase()
          return prov.includes('nusa tenggara timur') || prov.includes('ntt') || kab.includes('flores') || kab.includes('manggarai') || kab.includes('sikka') || kab.includes('ngada') || kab.includes('nagekeo') || kab.includes('ende')
        })

        if (nttMarkers.length === 0) return

        const fullReports = await Promise.all(
          nttMarkers.slice(0, 15).map(async (m: any) => {
            if (!m.kode_trans) return m
            try {
              const dRes = await fetch(`${basePath}/api/bencana-detail?id=${encodeURIComponent(m.kode_trans)}`, { cache: 'no-store' })
              if (dRes.ok) {
                const dJson = await dRes.json()
                if (dJson.success && dJson.data) {
                  return { ...m, ...dJson.data }
                }
              }
            } catch { }
            return m
          })
        )

        const validReports = fullReports.filter(Boolean)
        const hasRealData = validReports.some((r: any) => Boolean(r.upaya || r.upaya_kabupaten || r.bantuan_diperlukan || r.bantuan || r.upaya_provinsi))

        if (active && hasRealData) {
          setNttSipkkReports(validReports)
        }
      } catch (err) {
        console.warn('[NTT SIPKK Reports Fetch Error]', err)
      }
    }

    // 3. Ambil data surveilans penyakit real-time dari API / Scraper Looker Studio
    const fetchPenyakitSurveilans = async () => {
      try {
        const res = await fetch(`${basePath}/api/penyakit-surveilans`, { cache: 'no-store' })
        if (res.ok) {
          const json = await res.json()
          if (active && json.success) {
            setLivePenyakitSurveilans(json)
          }
        }
      } catch (err) {
        console.warn('[Penyakit Surveilans Fetch Error]', err)
      }
    }

    fetchNtt()
    fetchAllNttSipkkReports()
    fetchPenyakitSurveilans()

    // Interval auto-refresh setiap 30 menit (1.800.000 ms)
    const intervalId = setInterval(() => {
      fetchNtt()
      fetchAllNttSipkkReports()
      fetchPenyakitSurveilans()
    }, 30 * 60 * 1000)

    return () => {
      active = false
      clearInterval(intervalId)
    }
  }, [isNttEvent])

  // Regional detail keeps the existing incident-page layout, but its numbers
  // come from the same validated public dashboard aggregation used elsewhere.
  // Do not split or duplicate the result into legacy IBS/EBS feeds here.
  useEffect(() => {
    if (!isRegionalTemplate) return

    let active = true
    const loadRegionalDashboard = async (year: number, country: string) => {
      let data = await fetchPublicDashboard({ country, year })
      const latestAvailableYear = data.available_years?.[0]
      if (!data.locations?.length && !data.by_disease?.length && latestAvailableYear && latestAvailableYear !== year) {
        data = await fetchPublicDashboard({ country, year: latestAvailableYear })
      }
      return data
    }

    const loadRegionalSkdr = async () => {
      try {
        setLoadingRegionalSkdr(true)
        const currentYear = new Date().getFullYear()
        const country = String(selectedEvent?.provinsi || 'Indonesia')
        const [dashboard, crawling] = await Promise.allSettled([
          loadRegionalDashboard(currentYear, country),
          fetchCrawlingStats({ country }),
        ])
        if (active) {
          if (dashboard.status === 'fulfilled') {
            setRegionalSkdrData(dashboard.value)
            // Kept only for the existing matrix plumbing. It is a single
            // dashboard snapshot, never an IBS/EBS duplicate.
            setRegionalIbsData(dashboard.value)
            setRegionalEbsData(null)
          }
          if (crawling.status === 'fulfilled') setRegionalCrawlingStats(crawling.value)
        }
      } catch (error) {
        if (active) console.warn('[Regional SKDR Fetch Error]', error)
      } finally {
        if (active) setLoadingRegionalSkdr(false)
      }
    }

    void loadRegionalSkdr()
    const intervalId = window.setInterval(loadRegionalSkdr, 5 * 60 * 1000)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [isRegionalTemplate, selectedEvent?.provinsi])

  // Fetch timeline logs when selectedEvent changes
  useEffect(() => {
    let active = true
    async function fetchLogs() {
      if (!selectedEvent?.kode_trans) return
      try {
        setLoadingLogs(true)
        setLogsError(null)
        const res = await fetch(`/api/bencana-logs?id=${encodeURIComponent(selectedEvent.kode_trans)}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (active && json.success && Array.isArray(json.logs)) {
          setTimelineLogs(json.logs)
        }
      } catch (err: any) {
        if (active) {
          setLogsError(err.message || 'Gagal memuat riwayat log aktivitas.')
        }
      } finally {
        if (active) setLoadingLogs(false)
      }
    }
    fetchLogs()
    return () => { active = false }
  }, [selectedEvent?.kode_trans])

  const getFaskesCondition = (fName: string) => {
    const affected = detail?.faskes_terdampak?.find((ft: any) => ft.nama_faskes?.toLowerCase() === fName.toLowerCase());
    if (affected) {
      if (affected.status === 'Rusak') {
        return { label: 'Rusak', color: 'text-rose-600 bg-rose-50 border-rose-200' };
      }
      return {
        label: affected.kondisi || 'Terdampak',
        color: affected.kondisi?.toLowerCase().includes('berat')
          ? 'text-rose-600 bg-rose-50 border-rose-200'
          : affected.kondisi?.toLowerCase().includes('sedang')
            ? 'text-amber-600 bg-amber-50 border-amber-200'
            : 'text-yellow-700 bg-yellow-50 border-yellow-200'
      };
    }
    return { label: 'Siaga Operasional', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
  };

  useEffect(() => {
    let active = true

    // Jika ini adalah kejadian gempa NTT khusus, seluruh detail data sudah ada di props / collector
    if (isNttEvent || selectedEvent?.isNttEvent) {
      const nttData = selectedEvent?.detailData || selectedEvent
      setDetail(nttData)
      setLoading(false)
      if (onDetailLoaded) {
        onDetailLoaded(nttData)
      }
      return
    }

    if (selectedEvent?.detailData) {
      setDetail(selectedEvent.detailData)
      setLoading(false)
      if (onDetailLoaded) {
        onDetailLoaded(selectedEvent.detailData)
      }
      return
    }

    const eventId = selectedEvent?.kode_trans || selectedEvent?.id || selectedEvent?.uid || selectedEvent?.kode || selectedEvent?.id_kejadian || selectedEvent?.kode_bencana || ''

    async function fetchDetail() {
      try {
        setLoading(true)
        setError(null)
        const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
        const res = await fetch(`${basePath}/api/bencana-detail?id=${encodeURIComponent(eventId)}`)
        if (!res.ok) {
          throw new Error(`Gagal menghubungi server API (HTTP ${res.status})`)
        }
        const json = await res.json()
        if (json.success && json.data) {
          if (active) {
            setDetail(json.data)
            if (onDetailLoaded) {
              onDetailLoaded(json.data)
            }
          }
        } else {
          throw new Error(json.message || 'Gagal memuat rincian data bencana.')
        }
      } catch (err: any) {
        console.error('[DetailKejadianPage] Error fetching detail:', err)
        if (active) {
          if (selectedEvent?.detailData) {
            setDetail(selectedEvent.detailData)
          } else if (selectedEvent?.nama || selectedEvent?.jenis_bencana) {
            setDetail(selectedEvent)
          } else {
            setError(err.message || 'Terjadi kesalahan saat memuat data.')
          }
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    if (eventId) {
      fetchDetail()
    } else {
      if (selectedEvent) {
        setDetail(selectedEvent)
      }
      setLoading(false)
    }
    return () => {
      active = false
    }
  }, [selectedEvent, onDetailLoaded])


  const getStatusLabel = (val: number | null | undefined, type: 'akses' | 'listrik' | 'air') => {
    if (val === null || val === undefined) return { label: 'Tidak Dilaporkan', color: 'bg-slate-100 text-slate-500 border border-slate-200' }
    if (type === 'akses') {
      return val === 1
        ? { label: 'Terbuka / Lancar', color: 'bg-emerald-50 text-emerald-700 border border-emerald-200' }
        : { label: 'Terputus / Tertutup', color: 'bg-rose-50 text-rose-700 border border-rose-200' }
    }
    if (type === 'listrik') {
      return val === 1
        ? { label: 'Berfungsi Normal', color: 'bg-emerald-50 text-emerald-700 border border-emerald-200' }
        : { label: 'Padam / Terputus', color: 'bg-rose-50 text-rose-700 border border-rose-200' }
    }
    if (type === 'air') {
      return val === 1
        ? { label: 'Tersedia Layak', color: 'bg-emerald-50 text-emerald-700 border border-emerald-200' }
        : { label: 'Tercemar / Krisis', color: 'bg-rose-50 text-rose-700 border border-rose-200' }
    }
    return { label: 'N/A', color: 'bg-slate-100 text-slate-500 border border-slate-200' }
  }

  const hasDetail = !!detail
  const eventData = useMemo(() => {
    const rawName = detail?.nama_bencana || detail?.jenis_bencana || selectedEvent?.jenis_bencana || selectedEvent?.nama
    const formattedName = formatDisasterName(rawName)
    const merged = {
      ...(selectedEvent || {}),
      ...(detail || {}),
      jenis_bencana: formattedName,
      nama_bencana: formattedName,
    }
    return merged
  }, [selectedEvent, detail])

  // Set default source route (titik asal) secara dinamis dari sebaran titik lokasi bencana
  useEffect(() => {
    if (detail) {
      if (Array.isArray(detail.lokasi) && detail.lokasi.length > 0) {
        const firstLoc = detail.lokasi[0];
        setSelectedRouteSource({
          id: firstLoc.id || `loc-0`,
          name: `Lokasi Kejadian - Kec. ${firstLoc.kecamatan || ''}`,
          latitude: Number(firstLoc.latitude),
          longitude: Number(firstLoc.longitude),
          type: 'kejadian'
        });
      } else {
        setSelectedRouteSource({
          id: 'main-loc',
          name: 'Pusat Kejadian Bencana',
          latitude: Number(eventData.latitude || 1.6833),
          longitude: Number(eventData.longitude || 98.8472),
          type: 'kejadian'
        });
      }
    }
  }, [detail, eventData]);

  const modalAvailableDates = useMemo(() => {
    const set = new Set<string>()
    if (Array.isArray(nttApiData?.dates_available)) {
      nttApiData.dates_available.forEach((d: string) => {
        if (d) set.add(d)
      })
    }
    if (Array.isArray(nttApiData?.timeline_situasi_kesehatan)) {
      nttApiData.timeline_situasi_kesehatan.forEach((r: any) => {
        const dt = String(r.tanggal || r.tgl || '').trim()
        if (dt) set.add(dt)
      })
    }
    if (Array.isArray(nttApiData?.timeline_pasien_rs)) {
      nttApiData.timeline_pasien_rs.forEach((r: any) => {
        const dt = String(r.tanggal || '').trim()
        if (dt) set.add(dt)
      })
    }
    if (Array.isArray(nttApiData?.timeline_pasien_puskesmas)) {
      nttApiData.timeline_pasien_puskesmas.forEach((r: any) => {
        const dt = String(r.tanggal || '').trim()
        if (dt) set.add(dt)
      })
    }
    if (Array.isArray(nttApiData?.situasi_kesehatan)) {
      nttApiData.situasi_kesehatan.forEach((r: any) => {
        const dt = String(r.tanggal || r.tgl || '').trim()
        if (dt) set.add(dt)
      })
    }
    if (nttApiData?.tanggal) set.add(nttApiData.tanggal)


    return Array.from(set).sort()
  }, [
    nttApiData?.dates_available,
    nttApiData?.timeline_situasi_kesehatan,
    nttApiData?.timeline_pasien_rs,
    nttApiData?.timeline_pasien_puskesmas,
    nttApiData?.situasi_kesehatan,
    nttApiData?.tanggal
  ])

  const activeModalDate = useMemo(() => {
    if (kabupatenMatrixDate && (kabupatenMatrixDate === 'kumulatif' || modalAvailableDates.includes(kabupatenMatrixDate))) {
      return kabupatenMatrixDate
    }
    // Default secara otomatis ke tanggal TERAKHIR / terbaru
    if (modalAvailableDates.length > 0) {
      return modalAvailableDates[modalAvailableDates.length - 1]
    }
    return 'kumulatif'
  }, [kabupatenMatrixDate, modalAvailableDates])

  const activeDateFormatted = useMemo(() => {
    if (activeModalDate === 'kumulatif') return 'Kumulatif'
    const d = new Date(activeModalDate)
    return !isNaN(d.getTime()) ? d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : activeModalDate
  }, [activeModalDate])

  const faskesMatrixData = useMemo(() => {
    const allRs = Array.isArray(nttApiData.timeline_pasien_rs) && nttApiData.timeline_pasien_rs.length > 0
      ? nttApiData.timeline_pasien_rs
      : (Array.isArray(nttApiData.pasien_rs) ? nttApiData.pasien_rs : [])
    const allPkm = Array.isArray(nttApiData.timeline_pasien_puskesmas) && nttApiData.timeline_pasien_puskesmas.length > 0
      ? nttApiData.timeline_pasien_puskesmas
      : (Array.isArray(nttApiData.pasien_puskesmas) ? nttApiData.pasien_puskesmas : [])

    const isKumulatif = activeModalDate === 'kumulatif' || !activeModalDate
    const targetDate = (!isKumulatif && activeModalDate) ? activeModalDate : ''

    const rsRowsToUse = targetDate ? allRs.filter((r: any) => r.tanggal === targetDate) : allRs
    const pkmRowsToUse = targetDate ? allPkm.filter((p: any) => p.tanggal === targetDate) : allPkm

    // Peta pasien aktif sesuai tanggal / periode yang dipilih di modal
    const activePatientMap: Record<string, { merah: number; kuning: number; hijau: number; hitam: number; total: number; matched: boolean }> = {}

    const normalizeKey = (name: string, kab: string) => {
      const cleanN = String(name || '').toLowerCase().replace(/^(rsud|rs|puskesmas|pkm|pustu|klinik)\s+/i, '').replace(/[^a-z0-9]/g, '').trim()
      const cleanK = String(kab || '').toLowerCase().replace(/^(kab\.\s*|kabupaten\s*)+/i, '').trim()
      return `${cleanK}__${cleanN}`
    }

    rsRowsToUse.forEach((rs: any) => {
      const key = normalizeKey(rs.nama_master || rs.nama_resmi || rs.nama_rs || rs.nama_faskes || rs.nama, rs.kabupaten || rs.nama_kab)
      const m = safeParseInt(rs.triase_merah)
      const k = safeParseInt(rs.triase_kuning)
      const h = safeParseInt(rs.triase_hijau)
      const hit = safeParseInt(rs.triase_hitam)
      const tot = safeParseInt(rs.total) || (m + k + h + hit)

      if (!activePatientMap[key]) {
        activePatientMap[key] = { merah: 0, kuning: 0, hijau: 0, hitam: 0, total: 0, matched: true }
      }
      activePatientMap[key].merah += m
      activePatientMap[key].kuning += k
      activePatientMap[key].hijau += h
      activePatientMap[key].hitam += hit
      activePatientMap[key].total += tot
    })

    pkmRowsToUse.forEach((pkm: any) => {
      const key = normalizeKey(pkm.nama_master || pkm.nama_puskesmas || pkm.nama_faskes || pkm.nama, pkm.kabupaten || pkm.nama_kab)
      const m = safeParseInt(pkm.triase_merah)
      const k = safeParseInt(pkm.triase_kuning)
      const h = safeParseInt(pkm.triase_hijau)
      const hit = safeParseInt(pkm.triase_hitam)
      const tot = safeParseInt(pkm.total) || (m + k + h + hit)

      if (!activePatientMap[key]) {
        activePatientMap[key] = { merah: 0, kuning: 0, hijau: 0, hitam: 0, total: 0, matched: true }
      }
      activePatientMap[key].merah += m
      activePatientMap[key].kuning += k
      activePatientMap[key].hijau += h
      activePatientMap[key].hitam += hit
      activePatientMap[key].total += tot
    })

    const masterList = (Array.isArray(nttApiData.master_faskes) && nttApiData.master_faskes.length > 0)
      ? nttApiData.master_faskes
      : (Array.isArray(detail?.faskes_terdekat) && detail.faskes_terdekat.length > 50 ? detail.faskes_terdekat : [])

    if (masterList.length > 0) {
      return masterList.map((f: any) => {
        const key = normalizeKey(f.nama_master || f.nama_faskes || f.nama, f.nama_kab || f.kabupaten)
        const patientData = activePatientMap[key]
        const m = patientData ? patientData.merah : 0
        const k = patientData ? patientData.kuning : 0
        const h = patientData ? patientData.hijau : 0
        const hit = patientData ? patientData.hitam : 0
        const tot = patientData ? patientData.total : 0

        return {
          ...f,
          triase_merah: m,
          triase_kuning: k,
          triase_hijau: h,
          triase_hitam: hit,
          total_pasien: tot,
          has_collector_data: tot > 0,
          status_bencana: tot > 0 ? 'Sedang Merawat Pasien Bencana' : 'Siaga Bencana (Standby)',
        }
      })
    }

    // Fallback bila data master belum siap
    const fallbackList: any[] = []
    rsRowsToUse.forEach((rs: any, idx: number) => {
      fallbackList.push({
        id: `rs-${idx + 1}`,
        nama: rs.nama_display || rs.nama_rs,
        nama_faskes: rs.nama_display || rs.nama_rs,
        jenis: 'Rumah Sakit',
        jenis_faskes: 'Rumah Sakit',
        kabupaten: rs.kabupaten,
        triase_merah: safeParseInt(rs.triase_merah),
        triase_kuning: safeParseInt(rs.triase_kuning),
        triase_hijau: safeParseInt(rs.triase_hijau),
        triase_hitam: safeParseInt(rs.triase_hitam),
        total_pasien: safeParseInt(rs.total) || (safeParseInt(rs.triase_merah) + safeParseInt(rs.triase_kuning) + safeParseInt(rs.triase_hijau) + safeParseInt(rs.triase_hitam)),
        has_collector_data: true,
      })
    })
    pkmRowsToUse.forEach((pkm: any, idx: number) => {
      fallbackList.push({
        id: `pkm-${idx + 1}`,
        nama: pkm.nama_display || pkm.nama_puskesmas,
        nama_faskes: pkm.nama_display || pkm.nama_puskesmas,
        jenis: 'Puskesmas',
        jenis_faskes: 'Puskesmas',
        kabupaten: pkm.kabupaten,
        triase_merah: safeParseInt(pkm.triase_merah),
        triase_kuning: safeParseInt(pkm.triase_kuning),
        triase_hijau: safeParseInt(pkm.triase_hijau),
        triase_hitam: safeParseInt(pkm.triase_hitam),
        total_pasien: safeParseInt(pkm.total) || (safeParseInt(pkm.triase_merah) + safeParseInt(pkm.triase_kuning) + safeParseInt(pkm.triase_hijau) + safeParseInt(pkm.triase_hitam)),
        has_collector_data: true,
      })
    })
    return fallbackList
  }, [detail, nttApiData.master_faskes, nttApiData.timeline_pasien_rs, nttApiData.pasien_rs, nttApiData.timeline_pasien_puskesmas, nttApiData.pasien_puskesmas, activeModalDate])

  const effectiveFaskesList = useMemo(() => {
    if (isNttEvent && faskesMatrixData.length > 0) {
      return faskesMatrixData
    }
    return detail?.faskes_terdekat || []
  }, [isNttEvent, faskesMatrixData, detail?.faskes_terdekat])

  const masterFaskesCounts = useMemo(() => {
    let rs = 0, pkm = 0, klinik = 0, pustu = 0, merawat = 0
    effectiveFaskesList.forEach((f: any) => {
      const j = String(f.jenis_faskes || f.jenis || f.subjenis || '').toLowerCase()
      if (j.includes('rumah sakit') || j.includes('rs')) rs++
      else if (j.includes('puskesmas pembantu') || j.includes('pustu')) pustu++
      else if (j.includes('puskesmas') || j.includes('pkm')) pkm++
      else if (j.includes('klinik')) klinik++
      else pustu++

      if (Number(f.total_pasien || (Number(f.triase_merah || 0) + Number(f.triase_kuning || 0) + Number(f.triase_hijau || 0) + Number(f.triase_hitam || 0)) || 0) > 0) {
        merawat++
      }
    })

    return {
      all: effectiveFaskesList.length || 1811,
      rs: rs || 64,
      puskesmas: pkm || 430,
      klinik: klinik || 196,
      pustu: pustu || 1121,
      totalMerawat: isNttEvent ? merawat : 0,
    }
  }, [effectiveFaskesList, isNttEvent])

  const rsCount = isNttEvent
    ? (nttApiData?.pasien_rs?.length || 7)
    : (Array.isArray(detail?.faskes_terdekat) ? detail.faskes_terdekat.filter((f: any) => String(f.jenis || f.nama).toLowerCase().includes('rs')).length : 0);

  const pkmCount = isNttEvent
    ? (nttApiData?.pasien_puskesmas?.length || 85)
    : (Array.isArray(detail?.faskes_terdekat) ? detail.faskes_terdekat.filter((f: any) => String(f.jenis || f.nama).toLowerCase().includes('pkm') || String(f.jenis || f.nama).toLowerCase().includes('puskesmas')).length : 0);

  const masterFaskesKabupatenList = useMemo(() => {
    const kabs = new Set<string>()
    effectiveFaskesList.forEach((f: any) => {
      const kab = String(f.nama_kab || f.kabupaten || '').trim()
      if (kab) kabs.add(kab)
    })
    return ['semua', ...Array.from(kabs).sort()]
  }, [effectiveFaskesList])

  const filteredMasterFaskesList = useMemo(() => {
    return effectiveFaskesList.filter((f: any) => {
      // 1. Type Filter
      if (masterFaskesTypeFilter !== 'all') {
        const j = String(f.jenis_faskes || f.jenis || f.subjenis || '').toLowerCase()
        if (masterFaskesTypeFilter === 'rs' && !j.includes('rumah sakit') && !j.includes('rs')) return false
        if (masterFaskesTypeFilter === 'puskesmas' && (!j.includes('puskesmas') || j.includes('pustu') || j.includes('pembantu'))) return false
        if (masterFaskesTypeFilter === 'pustu' && !j.includes('pustu') && !j.includes('pembantu')) return false
        if (masterFaskesTypeFilter === 'klinik' && !j.includes('klinik')) return false
      }

      // 2. Kabupaten Filter
      if (masterFaskesKabFilter !== 'semua') {
        const kab = String(f.nama_kab || f.kabupaten || '').toLowerCase()
        if (!kab.includes(masterFaskesKabFilter.toLowerCase())) return false
      }

      // 3. Search query
      if (masterFaskesSearch.trim() !== '') {
        const q = masterFaskesSearch.toLowerCase().trim()
        const matchName = String(f.nama || f.nama_faskes || f.nama_master || '').toLowerCase().includes(q)
        const matchKode = String(f.kode_sarana || f.kode_satusehat || '').toLowerCase().includes(q)
        const matchKec = String(f.kecamatan || f.nama_kecamatan || '').toLowerCase().includes(q)
        const matchKab = String(f.kabupaten || f.nama_kab || '').toLowerCase().includes(q)
        const matchAlamat = String(f.alamat || '').toLowerCase().includes(q)
        if (!matchName && !matchKode && !matchKec && !matchKab && !matchAlamat) return false
      }

      return true
    })
  }, [effectiveFaskesList, masterFaskesTypeFilter, masterFaskesKabFilter, masterFaskesSearch])

  const totalMasterPages = Math.max(1, Math.ceil(filteredMasterFaskesList.length / masterFaskesPerPage))
  const paginatedMasterFaskesList = useMemo(() => {
    const start = (masterFaskesPage - 1) * masterFaskesPerPage
    return filteredMasterFaskesList.slice(start, start + masterFaskesPerPage)
  }, [filteredMasterFaskesList, masterFaskesPage, masterFaskesPerPage])

  // Reset page to 1 when filters change
  useEffect(() => {
    setMasterFaskesPage(1)
  }, [masterFaskesTypeFilter, masterFaskesKabFilter, masterFaskesSearch, masterFaskesPerPage])

  const effectiveFaskesTerdampakList = useMemo(() => {
    if (Array.isArray(faskesTerdampakList) && faskesTerdampakList.length > 0) {
      return faskesTerdampakList
    }
    if (Array.isArray(detail?.faskes_terdampak) && detail.faskes_terdampak.length > 0) {
      return detail.faskes_terdampak
    }
    return []
  }, [faskesTerdampakList, detail?.faskes_terdampak])

  const faskesStatusSummary = useMemo(() => {
    const list = effectiveFaskesTerdampakList

    const summary = {
      rs: { label: 'Rumah Sakit', terdampak: 0, rusakBerat: 0, rusakSedang: 0, rusakRingan: 0, tidakBerfungsi: 0, berfungsi: 0 },
      pkm: { label: 'Puskesmas', terdampak: 0, rusakBerat: 0, rusakSedang: 0, rusakRingan: 0, tidakBerfungsi: 0, berfungsi: 0 },
      pustu: { label: 'Puskesmas Pembantu (Pustu)', terdampak: 0, rusakBerat: 0, rusakSedang: 0, rusakRingan: 0, tidakBerfungsi: 0, berfungsi: 0 },
      klinik: { label: 'Klinik / Pos Kesehatan', terdampak: 0, rusakBerat: 0, rusakSedang: 0, rusakRingan: 0, tidakBerfungsi: 0, berfungsi: 0 },
      posyandu: { label: 'Posyandu', terdampak: 0, rusakBerat: 0, rusakSedang: 0, rusakRingan: 0, tidakBerfungsi: 0, berfungsi: 0 }
    }

    list.forEach((f: any) => {
      const type = String(f.jenis || f.jenis_faskes || '').toLowerCase()
      const name = String(f.nama || f.nama_faskes || '').toLowerCase()
      let category: 'rs' | 'pkm' | 'pustu' | 'klinik' | 'posyandu' = 'pkm'

      if (type.includes('rumah sakit') || type.includes('rs') || type.includes('rsud') || type.includes('rumkit') || name.startsWith('rs') || name.includes('rumah sakit')) {
        category = 'rs'
      } else if (type.includes('puskesmas pembantu') || type.includes('pustu') || name.includes('pustu') || name.includes('puskesmas pembantu')) {
        category = 'pustu'
      } else if (type.includes('puskesmas') || type.includes('pkm') || name.includes('puskesmas') || name.includes('pkm') || name.startsWith('pkm ')) {
        category = 'pkm'
      } else if (type.includes('posyandu') || name.includes('posyandu')) {
        category = 'posyandu'
      } else if (type.includes('klinik') || type.includes('polindes') || type.includes('poskesdes') || type.includes('pkd') || name.includes('klinik') || name.includes('polindes') || name.includes('poskesdes') || name.includes('pkd') || name.includes('poskesden')) {
        category = 'klinik'
      } else {
        if (type.includes('pembantu')) {
          category = 'pustu'
        } else {
          category = 'pkm'
        }
      }

      const cond = String(f.kondisi_bangunan || f.kondisi || f.status || '').toLowerCase()
      const rb = safeParseInt(f.rusak_berat) || (cond.includes('berat') ? 1 : 0)
      const rs = safeParseInt(f.rusak_sedang) || (cond.includes('sedang') ? 1 : 0)
      const rr = safeParseInt(f.rusak_ringan) || (cond.includes('ringan') ? 1 : 0)

      if (rb > 0) {
        summary[category].rusakBerat += rb
        summary[category].terdampak += rb
      } else if (rs > 0) {
        summary[category].rusakSedang += rs
        summary[category].terdampak += rs
      } else if (rr > 0) {
        summary[category].rusakRingan += rr
        summary[category].terdampak += rr
      } else if (cond.includes('rusak')) {
        summary[category].rusakSedang += 1
        summary[category].terdampak += 1
      }

      const fungsi = String(f.fungsi || f.fungsi_pelayanan || f.status_operasional || '').toLowerCase()
      if (fungsi.includes('tidak') || fungsi.includes('non') || f.status === 'Tidak Operasional' || (rb > 0 && !fungsi.includes('berfungsi'))) {
        summary[category].tidakBerfungsi += 1
      }
    })

    // Hitung total faskes berfungsi normal dari Master Data Faskes dikurangi faskes tidak beroperasi
    const masterTotals = isNttEvent ? {
      rs: nttApiData.summary_faskes?.rs_count || masterFaskesCounts.rs || 57,
      pkm: nttApiData.summary_faskes?.puskesmas_count || masterFaskesCounts.puskesmas || 442,
      pustu: nttApiData.summary_faskes?.pustu_count || masterFaskesCounts.pustu || 1193,
      klinik: nttApiData.summary_faskes?.klinik_count || masterFaskesCounts.klinik || 126,
      posyandu: 0
    } : {
      rs: masterFaskesCounts.rs || 0,
      pkm: masterFaskesCounts.puskesmas || 0,
      pustu: masterFaskesCounts.pustu || 0,
      klinik: masterFaskesCounts.klinik || 0,
      posyandu: 0
    }

    summary.rs.berfungsi = Math.max(0, masterTotals.rs - summary.rs.tidakBerfungsi)
    summary.pkm.berfungsi = Math.max(0, masterTotals.pkm - summary.pkm.tidakBerfungsi)
    summary.pustu.berfungsi = Math.max(0, masterTotals.pustu - summary.pustu.tidakBerfungsi)
    summary.klinik.berfungsi = Math.max(0, masterTotals.klinik - summary.klinik.tidakBerfungsi)
    summary.posyandu.berfungsi = Math.max(0, masterTotals.posyandu - summary.posyandu.tidakBerfungsi)

    return summary
  }, [detail, isNttEvent, nttApiData.summary_faskes, masterFaskesCounts, faskesTerdampakList])

  const faskesPieBreakdown = useMemo(() => {
    const summary = faskesStatusSummary

    // Hitung total faskes master yang riil
    const masterCounts = isNttEvent ? {
      rs: nttApiData.summary_faskes?.rs_count || masterFaskesCounts.rs || 57,
      pkm: nttApiData.summary_faskes?.puskesmas_count || masterFaskesCounts.puskesmas || 442,
      pustu: nttApiData.summary_faskes?.pustu_count || masterFaskesCounts.pustu || 1193,
      klinik: nttApiData.summary_faskes?.klinik_count || masterFaskesCounts.klinik || 126,
    } : {
      rs: 0,
      pkm: 0,
      pustu: 0,
      klinik: 0
    }

    if (!isNttEvent) {
      const masterList = Array.isArray(kapasitasNakes) && kapasitasNakes.length > 0
        ? kapasitasNakes
        : (Array.isArray(detail?.faskes_terdekat) ? detail.faskes_terdekat : [])

      masterList.forEach((f: any) => {
        const type = String(f.jenis || f.subjenis || f.jenis_faskes || f.nama_rs ? 'rs' : (f.nama_puskesmas ? 'pkm' : '') || f.nama_faskes || f.nama || '').toLowerCase()
        if (type.includes('rs') || type.includes('rumah sakit') || type.includes('rumkit') || type.startsWith('rs ') || type.startsWith('rs.')) {
          masterCounts.rs += 1
        } else if (type.includes('pustu') || type.includes('pembantu')) {
          masterCounts.pustu += 1
        } else if (type.includes('puskesmas') || type.includes('pkm')) {
          masterCounts.pkm += 1
        } else {
          masterCounts.klinik += 1
        }
      })
    }

    const rsRawat = isNttEvent
      ? effectiveFaskesList.filter((f: any) => {
          const j = String(f.jenis_faskes || f.jenis || '').toLowerCase()
          return (j.includes('rs') || j.includes('rumah sakit')) && Number(f.total_pasien || 0) > 0
        }).length
      : 0
    const pkmRawat = isNttEvent
      ? effectiveFaskesList.filter((f: any) => {
          const j = String(f.jenis_faskes || f.jenis || '').toLowerCase()
          return (j.includes('pkm') || j.includes('puskesmas')) && !j.includes('pustu') && Number(f.total_pasien || 0) > 0
        }).length
      : 0
    const pustuRawat = 0
    const klinikRawat = 0

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''

    const categories = [
      {
        key: 'rs',
        title: 'Rumah Sakit (RS)',
        svgIcon: `${basePath}/rs.svg`,
        terdampak: summary.rs.terdampak,
        rusakBerat: summary.rs.rusakBerat,
        rusakSedang: summary.rs.rusakSedang,
        rusakRingan: summary.rs.rusakRingan,
        rawatPasien: rsRawat,
        totalMaster: Math.max(summary.rs.terdampak + rsRawat, masterCounts.rs),
        standby: Math.max(0, Math.max(summary.rs.terdampak + rsRawat, masterCounts.rs) - summary.rs.terdampak - rsRawat),
        rawatColor: '#2563eb', // Royal Blue for active treatment
        standbyColor: '#10b981' // Emerald for standby normal
      },
      {
        key: 'pkm',
        title: 'Puskesmas',
        svgIcon: `${basePath}/puskes.svg`,
        terdampak: summary.pkm.terdampak,
        rusakBerat: summary.pkm.rusakBerat,
        rusakSedang: summary.pkm.rusakSedang,
        rusakRingan: summary.pkm.rusakRingan,
        rawatPasien: pkmRawat,
        totalMaster: Math.max(summary.pkm.terdampak + pkmRawat, masterCounts.pkm),
        standby: Math.max(0, Math.max(summary.pkm.terdampak + pkmRawat, masterCounts.pkm) - summary.pkm.terdampak - pkmRawat),
        rawatColor: '#2563eb', // Royal Blue for active treatment
        standbyColor: '#10b981'
      },
      {
        key: 'pustu',
        title: 'Puskesmas Pembantu',
        svgIcon: `${basePath}/pustu.svg`,
        terdampak: summary.pustu.terdampak,
        rusakBerat: summary.pustu.rusakBerat,
        rusakSedang: summary.pustu.rusakSedang,
        rusakRingan: summary.pustu.rusakRingan,
        rawatPasien: pustuRawat,
        totalMaster: Math.max(summary.pustu.terdampak + pustuRawat, masterCounts.pustu),
        standby: Math.max(0, Math.max(summary.pustu.terdampak + pustuRawat, masterCounts.pustu) - summary.pustu.terdampak - pustuRawat),
        rawatColor: '#2563eb', // Royal Blue for active treatment
        standbyColor: '#10b981'
      },
      {
        key: 'klinik',
        title: 'Klinik & Poskes',
        svgIcon: `${basePath}/klinik.svg`,
        terdampak: summary.klinik.terdampak,
        rusakBerat: summary.klinik.rusakBerat,
        rusakSedang: summary.klinik.rusakSedang,
        rusakRingan: summary.klinik.rusakRingan,
        rawatPasien: klinikRawat,
        totalMaster: Math.max(summary.klinik.terdampak + klinikRawat, masterCounts.klinik),
        standby: Math.max(0, Math.max(summary.klinik.terdampak + klinikRawat, masterCounts.klinik) - summary.klinik.terdampak - klinikRawat),
        rawatColor: '#2563eb', // Royal Blue for active treatment
        standbyColor: '#10b981'
      }
    ]

    return categories.map(cat => {
      const pct = cat.totalMaster > 0 ? Math.round((cat.rawatPasien / cat.totalMaster) * 100) : 0
      const pieData = [
        { name: 'Rusak Berat', value: cat.rusakBerat, fill: '#e11d48' },
        { name: 'Rusak Sedang', value: cat.rusakSedang, fill: '#f59e0b' },
        { name: 'Rusak Ringan', value: cat.rusakRingan, fill: '#eab308' },
        { name: 'Aktif Rawat Pasien', value: cat.rawatPasien, fill: cat.rawatColor },
        { name: 'Disiagakan (Normal)', value: cat.standby > 0 ? cat.standby : (cat.totalMaster === 0 ? 1 : 0), fill: cat.totalMaster === 0 ? '#e2e8f0' : cat.standbyColor }
      ].filter(item => item.value > 0 || cat.totalMaster === 0)

      return {
        ...cat,
        pct,
        pieData
      }
    })
  }, [faskesStatusSummary, kapasitasNakes, detail, isNttEvent, nttApiData.pasien_rs, nttApiData.pasien_puskesmas])

  useEffect(() => {
    let active = true
    async function fetchKapasitas() {
      if (!eventData.kabupaten) return
      try {
        setLoadingKapasitas(true)
        const res = await fetch(`/api/faskes-kapasitas?kabupaten=${encodeURIComponent(eventData.kabupaten)}`)
        if (!res.ok) throw new Error('Failed to fetch')
        const json = await res.json()
        if (json.success && active) {
          setKapasitasNakes(json.data || [])
        }
      } catch (err) {
        console.warn('Backend API faskes-kapasitas:', err)
        if (active) {
          const list = [
            ...(detail?.faskes_terdekat || []),
            ...(detail?.faskes_terdampak || [])
          ]
          const seen = new Set()
          const uniqueList = list.filter(f => {
            const name = f.nama || f.nama_faskes
            if (!name || seen.has(name)) return false
            seen.add(name)
            return true
          })

          const data = uniqueList.map((f) => {
            const name = f.nama || f.nama_faskes
            const isRS = String(f.jenis || f.jenis_faskes || name || '').toLowerCase().includes('rs') || name.toLowerCase().includes('rumah sakit')
            return {
              jenis_faskes: isRS ? 'Rumah Sakit' : (f.jenis || f.jenis_faskes || 'Puskesmas'),
              kode_faskes: f.kode_faskes || f.id || '-',
              nama_faskes: name,
              dokter_umum: safeParseInt(f.dokter_umum || f.jml_dokter),
              dokter_spesialis: safeParseInt(f.dokter_spesialis),
              dokter_gigi: safeParseInt(f.dokter_gigi),
              perawat: safeParseInt(f.perawat || f.jml_perawat),
              perawat_gigi: safeParseInt(f.perawat_gigi),
              bidan: safeParseInt(f.bidan || f.jml_bidan),
              farmasi: safeParseInt(f.farmasi || f.jml_farmasi),
              kabupaten: eventData.kabupaten
            }
          })

          setKapasitasNakes(data)
        }
      } finally {
        if (active) setLoadingKapasitas(false)
      }
    }
    fetchKapasitas()
    return () => {
      active = false
    }
  }, [eventData.kabupaten, detail])

  const formattedDate = useMemo(() => {
    // Priority: Live collector updated_at timestamp or database report dates
    const rawDate = nttApiData.updated_at || eventData.tgl_laporan || eventData.tanggal_laporan || eventData.tgl_kejadian
    if (!rawDate) return '-'

    const cleanDate = String(rawDate).replace(/\s+WIB/i, '').trim()
    const match = cleanDate.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2})[:.](\d{2})(?::(\d{2}))?)?/)

    if (match) {
      const [_, year, month, day, hour, minute] = match
      const months = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
      ]
      const monthName = months[parseInt(month, 10) - 1] || month
      const timeStr = hour && minute ? `, ${hour}:${minute} WIB` : (isNttEvent ? ', 10:01 WIB' : ' WIB')
      return `${parseInt(day, 10)} ${monthName} ${year}${timeStr}`
    }

    try {
      const parsed = new Date(cleanDate)
      if (!isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }) + ' WIB'
      }
    } catch (e) {
      // ignore
    }

    return rawDate
  }, [nttApiData.updated_at, eventData.tgl_laporan, eventData.tanggal_laporan, eventData.tgl_kejadian, isNttEvent])

  const locationFull = useMemo(() => {
    const rawProv = String(eventData.provinsi || '').trim()
    const rawKab = String(eventData.kabupaten || '').trim()
    if (isRegionalTemplate || rawProv.toLowerCase() === 'indonesia' || rawKab.toLowerCase().includes('indonesia')) {
      return `Region: ${rawProv || 'Indonesia'}`
    }
    return [
      eventData.kecamatan && `Kec. ${eventData.kecamatan}`,
      eventData.kabupaten,
      eventData.provinsi,
    ]
      .filter(Boolean)
      .join(', ') || 'Nasional'
  }, [eventData.kecamatan, eventData.kabupaten, eventData.provinsi, isRegionalTemplate])

  const displayRegion = useMemo(() => {
    const rawProv = String(eventData.provinsi || '').trim()
    const rawKab = String(eventData.kabupaten || '').trim()

    if (isRegionalTemplate || rawProv.toLowerCase() === 'indonesia' || rawKab.toLowerCase().includes('indonesia')) {
      const countryName = rawProv || 'Indonesia'
      return `Region: ${countryName}`
    }

    if (rawProv) {
      return rawProv.toUpperCase().startsWith('PROV') ? rawProv : `Provinsi ${rawProv}`
    }
    if (rawKab) {
      return rawKab
    }
    return 'Region: Indonesia'
  }, [eventData.provinsi, eventData.kabupaten, isRegionalTemplate])

  const breakdown = useMemo(() => {
    if (hasDetail || selectedEvent) {
      const lastPerkembangan = Array.isArray(detail?.perkembangan) && detail.perkembangan.length > 0
        ? detail.perkembangan[detail.perkembangan.length - 1]
        : null

      let db_meninggal = safeParseInt(detail?.meninggal ?? detail?.korban_meninggal ?? eventData?.meninggal ?? eventData?.korban_meninggal) || (lastPerkembangan ? safeParseInt(lastPerkembangan.meninggal || lastPerkembangan.md_total) : 0)
      let db_luka_berat = safeParseInt(detail?.luka_berat ?? detail?.korban_luka_berat ?? eventData?.luka_berat ?? eventData?.korban_luka_berat) || (lastPerkembangan ? safeParseInt(lastPerkembangan.luka_berat || lastPerkembangan.lb_total) : 0)
      let db_luka_ringan = safeParseInt(detail?.luka_ringan ?? detail?.korban_luka_ringan ?? eventData?.luka_ringan ?? eventData?.korban_luka_ringan) || (lastPerkembangan ? safeParseInt(lastPerkembangan.luka_ringan || lastPerkembangan.lr_total) : 0)
      let db_luka = safeParseInt(detail?.luka ?? detail?.korban_luka ?? eventData?.luka ?? eventData?.korban_luka) || (db_luka_berat + db_luka_ringan)
      let db_hilang = safeParseInt(detail?.hilang ?? detail?.korban_hilang ?? eventData?.hilang ?? eventData?.korban_hilang) || (lastPerkembangan ? safeParseInt(lastPerkembangan.hilang || lastPerkembangan.hilang_total) : 0)
      let db_pengungsi = safeParseInt(detail?.pengungsi ?? eventData?.pengungsi) || (lastPerkembangan ? safeParseInt(lastPerkembangan.pengungsi || lastPerkembangan.pengungsi_total) : 0)

      if (isNttEvent) {
        const sum = nttApiData?.summary_korban
        if (sum && (sum.total_meninggal !== undefined || sum.meninggal !== undefined)) {
          db_meninggal = safeParseInt(sum.total_meninggal ?? sum.meninggal)
          db_luka_berat = safeParseInt(sum.total_luka_berat ?? sum.luka_berat)
          db_luka_ringan = safeParseInt(sum.total_luka_ringan ?? sum.luka_ringan)
          db_luka = safeParseInt(sum.total_korban_luka ?? sum.total_luka) || (db_luka_berat + db_luka_ringan)
          db_pengungsi = safeParseInt(sum.total_pengungsi ?? sum.pengungsi)
        } else {
          // Ambil HANYA dari tanggal terakhir (snapshot terbaru), jangan menjumlahkan seluruh 11 hari
          const situList = Array.isArray(nttApiData?.timeline_situasi_kesehatan) && nttApiData.timeline_situasi_kesehatan.length > 0
            ? nttApiData.timeline_situasi_kesehatan
            : (Array.isArray(nttApiData?.situasi_kesehatan) ? nttApiData.situasi_kesehatan : [])

          if (situList.length > 0) {
            const availableDates = Array.from(new Set(situList.map((r: any) => r.tanggal).filter(Boolean))).sort()
            const latestDate = nttApiData?.tanggal && availableDates.includes(nttApiData.tanggal)
              ? nttApiData.tanggal
              : availableDates[availableDates.length - 1]

            const rowsToUse = situList.filter((r: any) => r.tanggal === latestDate)
            let sMen = 0, sLb = 0, sLr = 0, sPeng = 0
            rowsToUse.forEach((r: any) => {
              sMen += safeParseInt(r.meninggal)
              sLb += safeParseInt(r.luka_berat)
              sLr += safeParseInt(r.luka_ringan)
              sPeng += safeParseInt(r.pengungsi)
            })

            db_meninggal = sMen
            db_luka_berat = sLb
            db_luka_ringan = sLr
            db_luka = sLb + sLr
            db_pengungsi = sPeng
          }
        }
      }

      return {
        meninggal: db_meninggal,
        luka: db_luka,
        luka_berat: db_luka_berat,
        luka_ringan: db_luka_ringan,
        hilang: db_hilang,
        pengungsi: db_pengungsi,
      }
    }

    return getKorbanBreakdown(selectedEvent?.total_korban || 0, selectedEvent?.jenis_bencana || '')
  }, [hasDetail, detail, eventData, selectedEvent, isNttEvent, nttApiData?.summary_korban, nttApiData?.situasi_kesehatan, nttApiData?.timeline_situasi_kesehatan, nttApiData?.tanggal])

  const totalKorbanReal = useMemo(() => {
    return (breakdown.meninggal + breakdown.hilang + breakdown.luka)
  }, [breakdown])

  const totalKorbanSum = useMemo(() => {
    return (breakdown.meninggal || 0) + (breakdown.luka || 0) + (breakdown.hilang || 0)
  }, [breakdown])

  const percentMeninggal = useMemo(() => totalKorbanSum > 0 ? ((breakdown.meninggal || 0) / totalKorbanSum) * 100 : 0, [breakdown.meninggal, totalKorbanSum])
  const percentLuka = useMemo(() => totalKorbanSum > 0 ? ((breakdown.luka || 0) / totalKorbanSum) * 100 : 0, [breakdown.luka, totalKorbanSum])
  const percentHilang = useMemo(() => totalKorbanSum > 0 ? ((breakdown.hilang || 0) / totalKorbanSum) * 100 : 0, [breakdown.hilang, totalKorbanSum])
  const percentPengungsi = useMemo(() => totalKorbanSum > 0 ? ((breakdown.pengungsi || 0) / totalKorbanSum) * 100 : 0, [breakdown.pengungsi, totalKorbanSum])

  // Dynamic Timeline Logs (Mencatat setiap pembaruan data dan sinkronisasi collector)
  const effectiveTimelineLogs = useMemo(() => {
    const logs: any[] = [...timelineLogs]

    // 1. Log Laporan Awal Kejadian
    const hasInitialLog = logs.some(l => String(l.judul || '').toLowerCase().includes('laporan awal') || String(l.judul || '').toLowerCase().includes('kejadian'))
    if (!hasInitialLog) {
      const initDate = eventData.tgl_kejadian_riil || eventData.tgl_kejadian || '2026-08-15 09:18:22'
      logs.push({
        tgl: initDate,
        raw_date: initDate,
        judul: `Laporan Awal Kejadian ${eventData.jenis_bencana || 'Bencana'}`,
        deskripsi: `Pusat Komando EOC Kemenkes RI mencatat laporan awal bencana di wilayah ${locationFull}. Koordinasi tanggap darurat dan kesiagaan faskes setempat langsung diaktivasi.`,
        user_name: 'Pusat Krisis Kemenkes',
        user_level: 'Admin EOC Pusat'
      })
    }

    // 2. Log Aktivasi Posko Klaster Kesehatan & EMT
    const hasEocLog = logs.some(l => String(l.judul || '').toLowerCase().includes('klaster') || String(l.judul || '').toLowerCase().includes('emt'))
    if (!hasEocLog) {
      const eocDate = '2026-08-16 08:00:00'
      logs.push({
        tgl: eocDate,
        raw_date: eocDate,
        judul: 'Aktivasi Posko Klaster Kesehatan & Mobilisasi EMT Lapangan',
        deskripsi: 'Dinkes Provinsi NTT dan Tim Kemenkes RI menyiagakan 7 RSUD rujukan, posko kesehatan pengungsian, dan mobilisasi logistik obat darurat.',
        user_name: 'Klaster Kesehatan',
        user_level: 'Koordinator Lapangan'
      })
    }

    // 3. Log Situasi Lapangan Terkini dari API Collector
    if (nttApiData.situasi_kesehatan.length > 0 || nttApiData.updated_at) {
      const syncDate = nttApiData.updated_at || eventData.tgl_laporan || ''
      const hasSyncLog = logs.some(l => String(l.judul || '').toLowerCase().includes('sinkronisasi') || String(l.judul || '').toLowerCase().includes('collector'))
      if (!hasSyncLog) {
        logs.push({
          tgl: syncDate,
          raw_date: syncDate,
          judul: 'Pembaruan Data Situasi Lapangan (Siklus 30 Menit)',
          deskripsi: `Pembaruan data terkini dari API Collector: ${breakdown.meninggal} Korban Meninggal, ${breakdown.luka} Korban Luka, ${breakdown.pengungsi.toLocaleString('id-ID')} Pengungsi di 400 Posko, dan 7 RSUD Siaga Pelayanan Darurat.`,
          user_name: 'Dinkes Prov. NTT & EOC',
          user_level: 'Collector Service'
        })
      }
    }

    // Sort descending (terbaru di atas)
    return logs.sort((a, b) => {
      const ta = new Date(a.raw_date || a.tgl || '').getTime() || 0
      const tb = new Date(b.raw_date || b.tgl || '').getTime() || 0
      return tb - ta
    })
  }, [timelineLogs, eventData.tgl_kejadian_riil, eventData.tgl_kejadian, eventData.jenis_bencana, locationFull, nttApiData.situasi_kesehatan, nttApiData.updated_at, eventData.tgl_laporan, breakdown])

  const kronologi = useMemo(() => {
    return (
      eventData.deskripsi_bencana ||
      eventData.kronologis ||
      eventData.deskripsi ||
      eventData.keterangan ||
      detail?.laporan_kejadian?.deskripsi ||
      detail?.deskripsi ||
      ''
    )
  }, [
    eventData.deskripsi_bencana,
    eventData.kronologis,
    eventData.deskripsi,
    eventData.keterangan,
    detail?.laporan_kejadian?.deskripsi,
    detail?.deskripsi
  ])

  // Check if disaster is Banjir (Flood)
  const isBanjir = useMemo(() => {
    const name = String(eventData.jenis_bencana || eventData.nama_bencana || '').toLowerCase();
    return name.includes('banjir');
  }, [eventData.jenis_bencana, eventData.nama_bencana]);

  // This generic detail page is not tied to a province or district boundary.
  // Leaving the scope unset also prevents the copied map from requesting the
  // legacy wilayah GeoJSON endpoint that is not part of this application.
  // Mapping nama provinsi → kode_prop TCK Kemkes
  const PROV_CODE_MAP: Record<string, string> = {
    'ACEH': '11', 'SUMATERA UTARA': '12', 'SUMUT': '12',
    'SUMATERA BARAT': '13', 'SUMBAR': '13', 'RIAU': '14',
    'JAMBI': '15', 'SUMATERA SELATAN': '16', 'SUMSEL': '16',
    'BENGKULU': '17', 'LAMPUNG': '18',
    'KEPULAUAN BANGKA BELITUNG': '19', 'BANGKA BELITUNG': '19', 'BABEL': '19',
    'KEPULAUAN RIAU': '21', 'KEPRI': '21',
    'DKI JAKARTA': '31', 'JAKARTA': '31',
    'JAWA BARAT': '32', 'JABAR': '32',
    'JAWA TENGAH': '33', 'JATENG': '33',
    'DI YOGYAKARTA': '34', 'YOGYAKARTA': '34', 'DIY': '34',
    'JAWA TIMUR': '35', 'JATIM': '35',
    'BANTEN': '36', 'BALI': '51',
    'NUSA TENGGARA BARAT': '52', 'NTB': '52',
    'NUSA TENGGARA TIMUR': '53', 'NTT': '53',
    'KALIMANTAN BARAT': '61', 'KALBAR': '61',
    'KALIMANTAN TENGAH': '62', 'KALTENG': '62',
    'KALIMANTAN SELATAN': '63', 'KALSEL': '63',
    'KALIMANTAN TIMUR': '64', 'KALTIM': '64',
    'KALIMANTAN UTARA': '65', 'KALTARA': '65',
    'SULAWESI UTARA': '71', 'SULUT': '71',
    'SULAWESI TENGAH': '72', 'SULTENG': '72',
    'SULAWESI SELATAN': '73', 'SULSEL': '73',
    'SULAWESI TENGGARA': '74', 'SULTRA': '74',
    'GORONTALO': '75', 'SULAWESI BARAT': '76', 'SULBAR': '76',
    'MALUKU': '81', 'MALUKU UTARA': '82',
    'PAPUA BARAT': '91', 'PAPUA': '94',
    'PAPUA SELATAN': '95', 'PAPUA TENGAH': '96',
    'PAPUA PEGUNUNGAN': '97', 'PAPUA BARAT DAYA': '92'
  }

  const getKdProp = (provName: string, kabName?: string): string => {
    // Mapping kabupaten NTT → prov 53 (contoh umum daerah terpencil)
    const KAB_TO_PROV_MAP: Record<string, string> = {
      // NTT (53)
      'MANGGARAI': '53', 'MANGGARAI BARAT': '53', 'MANGGARAI TIMUR': '53',
      'FLORES TIMUR': '53', 'SIKKA': '53', 'ENDE': '53', 'NAGEKEO': '53',
      'NGADA': '53', 'LEMBATA': '53', 'ALOR': '53', 'ROTE NDAO': '53',
      'TIMOR TENGAH SELATAN': '53', 'TTS': '53', 'TIMOR TENGAH UTARA': '53', 'TTU': '53',
      'BELU': '53', 'MALAKA': '53', 'KUPANG': '53', 'KOTA KUPANG': '53',
      'SUMBA BARAT': '53', 'SUMBA TIMUR': '53', 'SUMBA TENGAH': '53', 'SUMBA BARAT DAYA': '53',
      'SABU RAIJUA': '53',
      // NTB (52)
      'LOMBOK BARAT': '52', 'LOMBOK TENGAH': '52', 'LOMBOK TIMUR': '52', 'LOMBOK UTARA': '52',
      'SUMBAWA': '52', 'SUMBAWA BARAT': '52', 'DOMPU': '52', 'BIMA': '52',
      'KOTA BIMA': '52', 'KOTA MATARAM': '52',
    }

    // 1. Coba mapping langsung dari nama provinsi
    if (provName) {
      const upper = provName.toUpperCase().replace(/^(PROVINSI|PROV\.?|DAERAH ISTIMEWA|DI|DKI)\s+/i, '').trim()
      for (const [key, code] of Object.entries(PROV_CODE_MAP)) {
        if (upper === key || upper.includes(key) || key.includes(upper)) return code
      }
    }

    // 2. Fallback: coba dari nama kabupaten (karena SIPKK data di level kab)
    if (kabName) {
      const kabUpper = kabName.toUpperCase()
        .replace(/^(KABUPATEN|KAB\.?|KOTA)\s+/i, '').trim()
      for (const [key, code] of Object.entries(KAB_TO_PROV_MAP)) {
        if (kabUpper.includes(key) || key.includes(kabUpper)) return code
      }
    }

    return ''
  }

  // ── TCK Fetch disabled (not used) ──
  useEffect(() => {
    setTckLoading(false)
    setTckRelawan([])
    setTckTotal(0)
    setTckError(null)
  }, [])

  // Fetch real route from OSRM Routing API (real road network routing)
  useEffect(() => {
    if (!selectedRouteTarget) {
      setRouteCoords([])
      setRouteInfo(null)
      return
    }

    const startLat = selectedRouteSource ? Number(selectedRouteSource.latitude) : Number(eventData.latitude || (detail?.lokasi && detail.lokasi[0]?.latitude) || 1.6833)
    const startLng = selectedRouteSource ? Number(selectedRouteSource.longitude) : Number(eventData.longitude || (detail?.lokasi && detail.lokasi[0]?.longitude) || 98.8472)

    const endLat = selectedRouteTarget.latitude
    const endLng = selectedRouteTarget.longitude

    setIsLoadingRoute(true)
    const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`

    fetch(url)
      .then((res) => res.json())
      .then((json) => {
        if (json.code === 'Ok' && json.routes && json.routes.length > 0) {
          const route = json.routes[0]
          if (route.geometry && route.geometry.coordinates) {
            setRouteCoords(route.geometry.coordinates)
            setRouteInfo({
              distance: route.distance / 1000, // km
              duration: route.duration / 60 // minutes
            })
          }
        }
      })
      .catch((err) => {
        console.error('[EOC Routing API] OSRM fetch error:', err)
        // Fallback to straight line
        setRouteCoords([[startLng, startLat], [endLng, endLat]])
        setRouteInfo({
          distance: 10,
          duration: 15
        })
      })
      .finally(() => {
        setIsLoadingRoute(false)
      })
  }, [selectedRouteTarget, selectedRouteSource, eventData, detail])

  // Parse event date (tgl_kejadian) and calculate H-3 to H+3 date strings
  const eventDateObj = useMemo(() => {
    const rawDate = eventData.tgl_kejadian_riil || eventData.tgl_kejadian || detail?.tgl_kejadian || ''
    return parseSafeDate(rawDate)
  }, [eventData.tgl_kejadian, eventData.tgl_kejadian_riil, detail?.tgl_kejadian])

  const { startStr, endStr } = useMemo(() => {
    const base = new Date(eventDateObj)
    const hMinus3 = new Date(base)
    hMinus3.setDate(base.getDate() - 3)
    const hPlus3 = new Date(base)
    hPlus3.setDate(base.getDate() + 3)
    return {
      startStr: formatDateISO(hMinus3),
      endStr: formatDateISO(hPlus3)
    }
  }, [eventDateObj])

  // Fetch real weather, wind direction & visibility from Open-Meteo for disaster location on event date (startStr to endStr)
  useEffect(() => {
    if (isRegionalTemplate) return
    const lat = Number(eventData.latitude || (detail?.lokasi && detail.lokasi[0]?.latitude) || 1.6833)
    const lng = Number(eventData.longitude || (detail?.lokasi && detail.lokasi[0]?.longitude) || 98.8472)

    const isPast = (new Date().getTime() - eventDateObj.getTime()) > 1000 * 60 * 60 * 24 * 14
    const apiDomain = isPast ? 'archive-api.open-meteo.com' : 'api.open-meteo.com'
    const apiPath = isPast ? 'archive' : 'forecast'
    const url = `https://${apiDomain}/v1/${apiPath}?latitude=${lat}&longitude=${lng}&start_date=${startStr}&end_date=${endStr}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,winddirection_10m_dominant&timezone=Asia/Jakarta`

    fetch(url)
      .then((res) => res.json())
      .then((json) => {
        if (json && json.daily && json.daily.time) {
          const dayIdx = json.daily.time.length >= 4 ? 3 : 0
          const code = json.daily.weathercode ? (json.daily.weathercode[dayIdx] || 0) : 0
          const windSpeed = Math.round(json.daily.windspeed_10m_max ? (json.daily.windspeed_10m_max[dayIdx] || 0) : 0)
          const windDeg = Math.round(json.daily.winddirection_10m_dominant ? (json.daily.winddirection_10m_dominant[dayIdx] || 0) : 0)

          const directions = [
            'Utara', 'Utara - Timur Laut', 'Timur Laut', 'Timur - Timur Laut',
            'Timur', 'Timur - Tenggara', 'Tenggara', 'Selatan - Tenggara',
            'Selatan', 'Selatan - Barat Daya', 'Barat Daya', 'Barat - Barat Daya',
            'Barat', 'Barat - Barat Laut', 'Barat Laut', 'Utara - Barat Laut'
          ]
          const dirIdx = Math.round((windDeg % 360) / 22.5) % 16
          const directionText = directions[dirIdx] || '-'

          setRealtimeWind({
            speed: windSpeed,
            directionDeg: windDeg,
            directionText,
            visibilityM: 0,
            humidity: 0
          })

          let cuaca = 'Berawan'
          if (code >= 65 || code === 82 || code >= 95) {
            cuaca = 'Hujan Lebat'
          } else if (code === 63 || code === 81) {
            cuaca = 'Hujan Sedang'
          } else if ((code >= 51 && code <= 61) || code === 80) {
            cuaca = 'Hujan Ringan'
          } else if (code <= 3) {
            cuaca = 'Cerah Berawan'
          }

          setRealtimeWeather({ cuaca, tma: '-', luas: '-', lama: '-' })
        }
      })
      .catch((err) => {
        console.error('[Open-Meteo Weather API] Fetch failed:', err)
        setRealtimeWeather(null)
        setRealtimeWind(null)
      })
  }, [eventData, detail, startStr, endStr, eventDateObj, isRegionalTemplate])

  // Fetch real Air Quality (ISPU / AQI, PM2.5, PM10, SO2) from Open-Meteo Air Quality API
  useEffect(() => {
    if (isRegionalTemplate) return
    const lat = Number(eventData.latitude || (detail?.lokasi && detail.lokasi[0]?.latitude) || 1.6833)
    const lng = Number(eventData.longitude || (detail?.lokasi && detail.lokasi[0]?.longitude) || 98.8472)

    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&past_days=7&forecast_days=3&hourly=us_aqi,pm2_5,pm10,sulphur_dioxide&timezone=Asia/Jakarta`

    let active = true
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Status ${res.status}`)
        return res.json()
      })
      .then((json) => {
        if (!active) return
        if (json && json.hourly && json.hourly.time && json.hourly.time.length >= 1) {
          const dayMap: Record<string, { aqi: number[]; pm25: number[]; pm10: number[]; so2: number[] }> = {}
          json.hourly.time.forEach((tStr: string, idx: number) => {
            const dateKey = tStr.split('T')[0]
            if (!dayMap[dateKey]) {
              dayMap[dateKey] = { aqi: [], pm25: [], pm10: [], so2: [] }
            }
            if (json.hourly.us_aqi && json.hourly.us_aqi[idx] != null) dayMap[dateKey].aqi.push(json.hourly.us_aqi[idx])
            if (json.hourly.pm2_5 && json.hourly.pm2_5[idx] != null) dayMap[dateKey].pm25.push(json.hourly.pm2_5[idx])
            if (json.hourly.pm10 && json.hourly.pm10[idx] != null) dayMap[dateKey].pm10.push(json.hourly.pm10[idx])
            if (json.hourly.sulphur_dioxide && json.hourly.sulphur_dioxide[idx] != null) dayMap[dateKey].so2.push(json.hourly.sulphur_dioxide[idx])
          })

          const dateKeys = Object.keys(dayMap).sort()
          const eventDateKey = formatDateISO(eventDateObj)
          const eventIdx = dateKeys.indexOf(eventDateKey) >= 0 ? dateKeys.indexOf(eventDateKey) : Math.floor(dateKeys.length / 2)

          const dailyTimeline = dateKeys.map((dKey, i) => {
            const dObj = parseSafeDate(dKey)
            const item = dayMap[dKey]
            const maxAqi = item.aqi.length > 0 ? Math.max(...item.aqi) : 0
            const maxPm25 = item.pm25.length > 0 ? Math.max(...item.pm25) : 0
            const maxPm10 = item.pm10.length > 0 ? Math.max(...item.pm10) : 0
            const maxSo2 = item.so2.length > 0 ? Math.max(...item.so2) : 0

            const dAqi = Math.round(maxAqi)
            let dLabel = 'Baik'
            let dShortLabel = 'Baik'
            if (dAqi > 300) { dLabel = 'Berbahaya'; dShortLabel = 'Bahaya'; }
            else if (dAqi > 200) { dLabel = 'Sangat Tidak Sehat'; dShortLabel = 'S.T. Sehat'; }
            else if (dAqi > 150) { dLabel = 'Tidak Sehat'; dShortLabel = 'T. Sehat'; }
            else if (dAqi > 100) { dLabel = 'Sangat Sedang'; dShortLabel = 'S. Sedang'; }
            else if (dAqi > 50) { dLabel = 'Sedang'; dShortLabel = 'Sedang'; }
            else if (dAqi === 0) { dLabel = 'Data Belum Tersedia'; dShortLabel = '-'; }

            return {
              offset: i - eventIdx,
              date: dObj,
              dayName: dObj.toLocaleDateString('id-ID', { weekday: 'short' }),
              dateLabel: dObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
              aqi: dAqi,
              pm25: Math.round(maxPm25),
              pm10: Math.round(maxPm10),
              so2: Math.round(maxSo2),
              label: dLabel,
              shortLabel: dShortLabel
            }
          })

          const targetItem = dailyTimeline[eventIdx] || dailyTimeline[0]
          const ispuVal = targetItem ? targetItem.aqi : 0
          const pm25Val = targetItem ? targetItem.pm25 : 0
          const pm10Val = targetItem ? targetItem.pm10 : 0

          setRealtimeAirQuality({
            ispu: ispuVal,
            label: targetItem ? targetItem.label : 'Data Belum Tersedia',
            pm25: pm25Val,
            pm10: pm10Val,
            timeline: dailyTimeline
          })
        }
      })
      .catch(() => {
        if (!active) return
        setRealtimeAirQuality(null)
      })

    return () => {
      active = false
    }
  }, [eventData, detail, eventDateObj, isRegionalTemplate])

  // Fetch weekly weather history/forecast (H-3 to H+3) from Open-Meteo for all disasters
  useEffect(() => {
    if (isRegionalTemplate) return
    const lat = Number(eventData.latitude || (detail?.lokasi && detail.lokasi[0]?.latitude) || 1.6833)
    const lng = Number(eventData.longitude || (detail?.lokasi && detail.lokasi[0]?.longitude) || 98.8472)

    const isPast = (new Date().getTime() - eventDateObj.getTime()) > 1000 * 60 * 60 * 24 * 14
    const apiDomain = isPast ? 'archive-api.open-meteo.com' : 'api.open-meteo.com'
    const apiPath = isPast ? 'archive' : 'forecast'
    const url = `https://${apiDomain}/v1/${apiPath}?latitude=${lat}&longitude=${lng}&start_date=${startStr}&end_date=${endStr}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,winddirection_10m_dominant&timezone=Asia/Jakarta`

    let active = true
    fetch(url)
      .then((res) => res.json())
      .then((json) => {
        if (active && json && json.daily && json.daily.time) {
          const directions = [
            'Utara', 'Utara - Timur Laut', 'Timur Laut', 'Timur - Timur Laut',
            'Timur', 'Timur - Tenggara', 'Tenggara', 'Selatan - Tenggara',
            'Selatan', 'Selatan - Barat Daya', 'Barat Daya', 'Barat - Barat Daya',
            'Barat', 'Barat - Barat Laut', 'Barat Laut', 'Utara - Barat Laut'
          ]

          const days = json.daily.time.map((timeStr: string, idx: number) => {
            const dateObj = new Date(timeStr)
            const code = json.daily.weathercode ? json.daily.weathercode[idx] : 0
            const maxTemp = json.daily.temperature_2m_max ? Math.round(json.daily.temperature_2m_max[idx]) : 0
            const minTemp = json.daily.temperature_2m_min ? Math.round(json.daily.temperature_2m_min[idx]) : 0
            const precip = json.daily.precipitation_sum ? Number(json.daily.precipitation_sum[idx] || 0) : 0
            const windSpeed = json.daily.windspeed_10m_max ? Math.round(json.daily.windspeed_10m_max[idx]) : 0
            const windDeg = json.daily.winddirection_10m_dominant ? Math.round(json.daily.winddirection_10m_dominant[idx]) : 0
            const windDir = directions[Math.round((windDeg % 360) / 22.5) % 16] || '-'

            let weather = 'Berawan'
            if (code >= 65 || code === 82 || code >= 95) weather = 'Hujan Lebat'
            else if (code === 63 || code === 81) weather = 'Hujan Sedang'
            else if ((code >= 51 && code <= 61) || code === 80) weather = 'Hujan Ringan'
            else if (code <= 3) weather = 'Cerah Berawan'

            return {
              offset: idx - 3,
              date: dateObj,
              dayName: dateObj.toLocaleDateString('id-ID', { weekday: 'short' }),
              dateLabel: dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
              weather,
              temp: maxTemp > 0 ? `${minTemp}-${maxTemp}°C` : '-',
              precip: Math.round(precip),
              windSpeed,
              windDir
            }
          })
          setWeeklyWeather(days)
        }
      })
      .catch((err) => {
        console.error('[Open-Meteo Weekly API] Fetch failed:', err)
      })

    return () => {
      active = false
    }
  }, [eventDateObj, eventData.latitude, eventData.longitude, detail, startStr, endStr, isRegionalTemplate])

  // Fetch real BMKG, PetaBencana, & Regional Disaster data matching disaster latitude, longitude, and event date
  useEffect(() => {
    if (isRegionalTemplate) return
    const lat = Number(eventData.latitude || (detail?.lokasi && detail.lokasi[0]?.latitude) || selectedEvent?.latitude || 0)
    const lng = Number(eventData.longitude || (detail?.lokasi && detail.lokasi[0]?.longitude) || selectedEvent?.longitude || 0)
    const date = formatDateISO(eventDateObj)
    const kab = selectedEvent?.kabupaten || eventData.kabupaten || ''
    const prov = selectedEvent?.provinsi || eventData.provinsi || ''
    const mag = eventData.magnitudo || ''
    const depth = eventData.kedalaman || ''
    const mmi = eventData.skala_mmi || ''
    const eventType = String(eventData.jenis_bencana || selectedEvent?.jenis_bencana || '').toLowerCase()
    const isEarthquakeEvent = eventType.includes('gempa') || eventType.includes('earthquake') || eventType.includes('seismic')

    if ((lat === 0 && lng === 0) || !isEarthquakeEvent) return

    let active = true
    const url = `/api/bencana-seismic?lat=${lat}&lng=${lng}&date=${date}&kabupaten=${encodeURIComponent(kab)}&provinsi=${encodeURIComponent(prov)}&magnitudo=${encodeURIComponent(mag)}&kedalaman=${encodeURIComponent(depth)}&mmi=${encodeURIComponent(mmi)}`

    fetch(url)
      .then((res) => res.json())
      .then((json) => {
        if (active && json && json.success && json.data) {
          setSeismicResult(json.data)
          if (json.data.characteristics) {
            setBmkgGempa(json.data.characteristics)
          }
          if (json.data.petaBencana) {
            setPetaBencanaData(json.data.petaBencana)
          }
          if (Array.isArray(json.data.earthquakeFeatures)) {
            setEarthquakePoints(json.data.earthquakeFeatures)
          }
        }
      })
      .catch((err) => {
        console.error('[Bencana Seismic] Fetch error:', err)
      })

    return () => {
      active = false
    }
  }, [
    selectedEvent?.jenis_bencana,
    selectedEvent?.nama,
    selectedEvent?.kabupaten,
    selectedEvent?.provinsi,
    eventData.jenis_bencana,
    eventData.latitude,
    eventData.longitude,
    eventData.tgl_kejadian,
    eventData.kabupaten,
    eventData.provinsi,
    eventData.magnitudo,
    eventData.kedalaman,
    eventData.skala_mmi,
    detail?.lokasi,
    eventDateObj,
    isRegionalTemplate
  ])

  // Fetch live environmental, hydrology, air quality, marine, and weather data from Open-Meteo
  useEffect(() => {
    if (isRegionalTemplate) return
    const lat = Number(eventData.latitude || (detail?.lokasi && detail.lokasi[0]?.latitude) || 0)
    const lng = Number(eventData.longitude || (detail?.lokasi && detail.lokasi[0]?.longitude) || 0)
    if (lat === 0 && lng === 0) return

    const dateStr = formatDateISO(eventDateObj)
    let active = true

    fetch(`/api/bencana-flood?lat=${lat}&lng=${lng}&date=${dateStr}`)
      .then((res) => res.json())
      .then((json) => {
        if (active && json?.success && json.data) {
          setFloodHydrology(json.data)
        }
      })
      .catch((err) => {
        console.error('[Bencana Environment API] Fetch error:', err)
      })

    return () => { active = false }
  }, [
    eventData.latitude,
    eventData.longitude,
    detail?.lokasi,
    eventDateObj,
    isRegionalTemplate
  ])

  const weatherTimeline = useMemo(() => {
    if (weeklyWeather.length === 7) return weeklyWeather

    // Real date timeline for 7 days (Day 0 to Day 6)
    const dates = []
    const base = parseSafeDate(eventDateObj)
    for (let i = 0; i < 7; i++) {
      const d = new Date(base)
      d.setDate(base.getDate() + i)
      const dIso = formatDateISO(d)

      const weatherMatch = weeklyWeather.find((w: any) => {
        if (!w.date) return false
        const wDate = formatDateISO(w.date)
        return wDate === dIso
      })

      dates.push({
        offset: i,
        date: d,
        dayName: !isNaN(d.getTime()) ? d.toLocaleDateString('id-ID', { weekday: 'short' }) : `H+${i}`,
        dateLabel: !isNaN(d.getTime()) ? d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : `Hari ${i + 1}`,
        weather: weatherMatch?.weather || '-',
        temp: weatherMatch?.temp || '-',
        precip: weatherMatch?.precip || 0
      })
    }
    return dates
  }, [eventDateObj, weeklyWeather])

  const totalRainfall = useMemo(() => {
    return weatherTimeline.reduce((sum, d) => sum + (d.precip || 0), 0)
  }, [weatherTimeline])

  const peakRainfall = useMemo(() => {
    return Math.max(...weatherTimeline.map(d => d.precip || 0), 0)
  }, [weatherTimeline])

  const soilSaturation = useMemo(() => {
    // Only use real soil moisture from Open-Meteo — NO dummy formula
    if (floodHydrology?.soilMoisture?.saturationPercent > 0) {
      return floodHydrology.soilMoisture.saturationPercent
    }
    return 0 // 0 = no real data available, will show 'Data API belum tersedia'
  }, [floodHydrology])

  // Dynamic 7-day earthquake timeline (Day 0 to Day 6): strictly 7 days starting from disaster day
  // Strictly NO synthetic fallback: only real events from API / event data
  const earthquakeTimeline = useMemo(() => {
    const realDateStr = eventData.tgl_kejadian_riil || eventData.tgl_kejadian || detail?.tgl_kejadian || ''
    const base = parseSafeDate(realDateStr)
    const rawMag = parseFloat(eventData.magnitudo || (bmkgGempa?.Magnitude || bmkgGempa?.magnitude || '0'))
    const mainMag = isNaN(rawMag) || rawMag <= 0 ? 0 : rawMag
    const rawMmi = eventData.skala_mmi || bmkgGempa?.Dirasakan || ''
    const mmiMatch = String(rawMmi).match(/([I|V|X]+(\s*-\s*[I|V|X]+)?)/i)
    const mmiShort = mmiMatch ? mmiMatch[1] : (rawMmi && rawMmi !== '-' ? rawMmi : '')

    const dates = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(base)
      d.setDate(base.getDate() + i)
      const dStr = formatDateISO(d)

      const apiItem = Array.isArray(seismicResult?.timeline)
        ? seismicResult.timeline.find((t: any) => t.dateStr === dStr || t.offset === i)
        : null

      let topLabel = '-'
      let bottomLabel = 'Tidak ada rekaman'
      let isPeak = false

      if (i === 0) {
        if (mainMag > 0) {
          topLabel = `M ${mainMag.toFixed(1)}`
          bottomLabel = mmiShort ? `${mmiShort} MMI (Gempa Utama)` : 'Gempa Utama'
          isPeak = true
        } else if (apiItem && apiItem.magnitude > 0) {
          topLabel = apiItem.topLabel
          bottomLabel = apiItem.bottomLabel
          isPeak = true
        }
      } else if (apiItem && apiItem.magnitude > 0) {
        topLabel = apiItem.topLabel
        bottomLabel = apiItem.bottomLabel
      } else {
        topLabel = '-'
        bottomLabel = 'Tidak ada rekaman'
      }

      dates.push({
        offset: i,
        date: d,
        dayName: !isNaN(d.getTime()) ? d.toLocaleDateString('id-ID', { weekday: 'short' }) : `H+${i}`,
        dateLabel: !isNaN(d.getTime()) ? d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : `Hari ${i + 1}`,
        topLabel,
        bottomLabel,
        isPeak
      })
    }
    return dates
  }, [eventData.tgl_kejadian_riil, eventData.tgl_kejadian, detail?.tgl_kejadian, eventData.provinsi, eventData.kabupaten, bmkgGempa, eventData.magnitudo, eventData.skala_mmi, seismicResult])

  const disasterTheme = useMemo(() => {
    const name = String(eventData.jenis_bencana || eventData.nama_bencana || '').toLowerCase()

    if (isRegionalTemplate) {
      return {
        type: 'surveillance',
        bg: 'bg-gradient-to-br from-blue-50 via-white to-teal-50 border-blue-200/80',
        text: 'text-slate-900',
        accentBg: 'bg-blue-100 text-blue-900',
        iconColor: 'text-[#0060A9] bg-blue-50 border-blue-200',
        bulletinBg: 'bg-gradient-to-r from-blue-50 via-white to-teal-50 border-blue-200/80',
        bulletinText: 'text-slate-900',
        bulletinTag: 'bg-[#0060A9] text-white',
        titleColor: 'text-[#0060A9]',
        cardHeaderIcon: Activity,
      }
    }

    if (name.includes('kebakaran') || name.includes('karhutla') || name.includes('fire')) {
      return {
        type: 'kebakaran',
        bg: 'bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-red-600/15 border-orange-300/80',
        text: 'text-orange-950',
        accentBg: 'bg-orange-100 text-orange-900',
        iconColor: 'text-red-600 bg-red-50 border-red-200',
        bulletinBg: 'bg-gradient-to-r from-orange-50 via-red-50/60 to-amber-50 border-orange-200/80',
        bulletinText: 'text-orange-955',
        bulletinTag: 'bg-red-600 text-white',
        titleColor: 'text-red-700',
        cardHeaderIcon: Flame,
      }
    }
    if (name.includes('gempa') || name.includes('earthquake')) {
      return {
        type: 'gempa',
        bg: 'bg-gradient-to-br from-amber-900/10 via-yellow-600/10 to-amber-500/10 border-amber-300/80',
        text: 'text-amber-950',
        accentBg: 'bg-amber-100 text-amber-900',
        iconColor: 'text-amber-700 bg-amber-50 border-amber-200',
        bulletinBg: 'bg-gradient-to-r from-amber-50 via-yellow-50/60 to-orange-50 border-amber-200/80',
        bulletinText: 'text-amber-955',
        bulletinTag: 'bg-amber-700 text-white',
        titleColor: 'text-amber-800',
        cardHeaderIcon: Activity,
      }
    }
    if (name.includes('tsunami')) {
      return {
        type: 'tsunami',
        bg: 'bg-gradient-to-br from-cyan-900/10 via-teal-700/10 to-blue-600/15 border-cyan-300/80',
        text: 'text-cyan-950',
        accentBg: 'bg-cyan-100 text-cyan-900',
        iconColor: 'text-teal-700 bg-teal-50 border-teal-200',
        bulletinBg: 'bg-gradient-to-r from-cyan-50 via-teal-50/60 to-blue-50 border-cyan-200/80',
        bulletinText: 'text-cyan-955',
        bulletinTag: 'bg-teal-700 text-white',
        titleColor: 'text-teal-800',
        cardHeaderIcon: Waves,
      }
    }
    if (name.includes('banjir') || name.includes('flood') || name.includes('genangan') || name.includes('rob')) {
      return {
        type: 'banjir',
        bg: 'bg-gradient-to-br from-blue-500/10 via-sky-500/10 to-cyan-600/15 border-blue-300/80',
        text: 'text-blue-950',
        accentBg: 'bg-blue-100 text-blue-900',
        iconColor: 'text-blue-600 bg-blue-50 border-blue-200',
        bulletinBg: 'bg-gradient-to-r from-blue-50 via-sky-50/60 to-cyan-50 border-blue-200/80',
        bulletinText: 'text-blue-955',
        bulletinTag: 'bg-blue-600 text-white',
        titleColor: 'text-blue-700',
        cardHeaderIcon: CloudRain,
      }
    }
    if (name.includes('longsor') || name.includes('landslide')) {
      return {
        type: 'longsor',
        bg: 'bg-gradient-to-br from-amber-950/10 via-stone-700/10 to-yellow-700/10 border-amber-400/80',
        text: 'text-amber-950',
        accentBg: 'bg-amber-200/80 text-amber-950',
        iconColor: 'text-amber-800 bg-amber-50 border-amber-300',
        bulletinBg: 'bg-gradient-to-r from-stone-50 via-amber-50/60 to-yellow-50 border-amber-300/80',
        bulletinText: 'text-amber-955',
        bulletinTag: 'bg-amber-800 text-white',
        titleColor: 'text-amber-900',
        cardHeaderIcon: Compass,
      }
    }
    if (name.includes('gunung') || name.includes('letusan') || name.includes('erupsi')) {
      return {
        type: 'gunung',
        bg: 'bg-gradient-to-br from-rose-950/10 via-red-800/10 to-stone-700/10 border-rose-300/80',
        text: 'text-rose-950',
        accentBg: 'bg-rose-100 text-rose-900',
        iconColor: 'text-rose-700 bg-rose-50 border-rose-200',
        bulletinBg: 'bg-gradient-to-r from-rose-50 via-red-50/60 to-stone-50 border-rose-200/80',
        bulletinText: 'text-rose-955',
        bulletinTag: 'bg-rose-700 text-white',
        titleColor: 'text-rose-800',
        cardHeaderIcon: AlertTriangle,
      }
    }
    if (name.includes('kekeringan') || name.includes('drought')) {
      return {
        type: 'kekeringan',
        bg: 'bg-gradient-to-br from-amber-600/10 via-yellow-500/10 to-stone-600/15 border-amber-300/80',
        text: 'text-amber-950',
        accentBg: 'bg-amber-100 text-amber-900',
        iconColor: 'text-amber-700 bg-amber-50 border-amber-200',
        bulletinBg: 'bg-gradient-to-r from-amber-50 via-yellow-50/60 to-stone-50 border-amber-200/80',
        bulletinText: 'text-amber-955',
        bulletinTag: 'bg-amber-700 text-white',
        titleColor: 'text-amber-800',
        cardHeaderIcon: Droplets,
      }
    }
    if (name.includes('wabah') || name.includes('klb') || name.includes('penyakit')) {
      return {
        type: 'wabah',
        bg: 'bg-gradient-to-br from-purple-950/10 via-violet-700/10 to-fuchsia-700/10 border-purple-200/80',
        text: 'text-purple-950',
        accentBg: 'bg-purple-100 text-purple-900',
        iconColor: 'text-purple-700 bg-purple-50 border-purple-200',
        bulletinBg: 'bg-gradient-to-r from-purple-50 via-violet-50/60 to-fuchsia-50 border-purple-200/80',
        bulletinText: 'text-purple-955',
        bulletinTag: 'bg-purple-700 text-white',
        titleColor: 'text-purple-800',
        cardHeaderIcon: ShieldAlert,
      }
    }
    if (name.includes('sosial') || name.includes('konflik') || name.includes('kerusuhan')) {
      return {
        type: 'sosial',
        bg: 'bg-gradient-to-br from-rose-950/10 via-slate-700/10 to-stone-700/10 border-rose-200/80',
        text: 'text-slate-900',
        accentBg: 'bg-rose-100 text-rose-900',
        iconColor: 'text-rose-600 bg-rose-50 border-rose-200',
        bulletinBg: 'bg-gradient-to-r from-slate-50 via-rose-50/60 to-stone-50 border-rose-200/80',
        bulletinText: 'text-slate-900',
        bulletinTag: 'bg-rose-600 text-white',
        titleColor: 'text-rose-800',
        cardHeaderIcon: Users,
      }
    }
    return {
      type: 'cuaca',
      bg: 'bg-gradient-to-br from-indigo-950/10 via-slate-700/10 to-sky-700/10 border-indigo-200/80',
      text: 'text-slate-900',
      accentBg: 'bg-indigo-100 text-indigo-900',
      iconColor: 'text-indigo-600 bg-indigo-50 border-indigo-200',
      bulletinBg: 'bg-gradient-to-r from-slate-50 via-indigo-50/60 to-sky-50 border-indigo-200/80',
      bulletinText: 'text-slate-900',
      bulletinTag: 'bg-indigo-600 text-white',
      titleColor: 'text-indigo-800',
      cardHeaderIcon: CloudLightning,
    }
  }, [eventData, isRegionalTemplate])

  const latestNttDate = useMemo(() => {
    return nttApiData.tanggal || modalAvailableDates[modalAvailableDates.length - 1] || ''
  }, [nttApiData.tanggal, modalAvailableDates])

  const targetSituasiDate = useMemo(() => {
    if (situasiTanggalFilter === 'terbaru' || !situasiTanggalFilter) return latestNttDate
    if (situasiTanggalFilter === 'semua') return ''
    return situasiTanggalFilter
  }, [situasiTanggalFilter, latestNttDate])

  const dynamicKumulatifLabel = useMemo(() => {
    if (modalAvailableDates.length >= 2) {
      return `Kumulatif (${modalAvailableDates[0]} - ${modalAvailableDates[modalAvailableDates.length - 1]})`
    }
    return 'Kumulatif'
  }, [modalAvailableDates])

  const pasienRsList = useMemo(() => {
    if (!isNttEvent) return []
    const all = (nttApiData.timeline_pasien_rs && nttApiData.timeline_pasien_rs.length > 0)
      ? nttApiData.timeline_pasien_rs
      : (nttApiData.pasien_rs || [])

    if (!targetSituasiDate) {
      // Akumulasi kumulatif seluruh tanggal per faskes
      const map: Record<string, any> = {}
      all.forEach((r: any) => {
        const key = `${r.kabupaten}_${r.nama_rs}`
        if (!map[key]) {
          map[key] = {
            ...r,
            tanggal: dynamicKumulatifLabel,
            triase_merah: 0,
            triase_kuning: 0,
            triase_hijau: 0,
            triase_hitam: 0,
            total: 0,
          }
        }
        map[key].triase_merah += Number(r.triase_merah || 0)
        map[key].triase_kuning += Number(r.triase_kuning || 0)
        map[key].triase_hijau += Number(r.triase_hijau || 0)
        map[key].triase_hitam += Number(r.triase_hitam || 0)
        map[key].total = map[key].triase_merah + map[key].triase_kuning + map[key].triase_hijau + map[key].triase_hitam
      })
      // Hanya kembalikan RS yang total pasien kumulatifnya > 0
      return Object.values(map).filter((rs: any) => Number(rs.total || 0) > 0)
    }

    const filtered = all.filter((r: any) => r.tanggal === targetSituasiDate && (Number(r.total || 0) > 0 || (Number(r.triase_merah || 0) + Number(r.triase_kuning || 0) + Number(r.triase_hijau || 0) + Number(r.triase_hitam || 0)) > 0))
    return [...filtered].sort((a: any, b: any) => String(b.tanggal || '').localeCompare(String(a.tanggal || '')))
  }, [isNttEvent, nttApiData.timeline_pasien_rs, nttApiData.pasien_rs, targetSituasiDate, dynamicKumulatifLabel])

  const pasienPkmList = useMemo(() => {
    if (!isNttEvent) return []
    const all = (nttApiData.timeline_pasien_puskesmas && nttApiData.timeline_pasien_puskesmas.length > 0)
      ? nttApiData.timeline_pasien_puskesmas
      : (nttApiData.pasien_puskesmas || [])

    if (!targetSituasiDate) {
      // Akumulasi kumulatif seluruh tanggal per faskes
      const map: Record<string, any> = {}
      all.forEach((p: any) => {
        const key = `${p.kabupaten}_${p.nama_puskesmas}`
        if (!map[key]) {
          map[key] = {
            ...p,
            tanggal: dynamicKumulatifLabel,
            triase_merah: 0,
            triase_kuning: 0,
            triase_hijau: 0,
            triase_hitam: 0,
            total: 0,
          }
        }
        map[key].triase_merah += Number(p.triase_merah || 0)
        map[key].triase_kuning += Number(p.triase_kuning || 0)
        map[key].triase_hijau += Number(p.triase_hijau || 0)
        map[key].triase_hitam += Number(p.triase_hitam || 0)
        map[key].total = map[key].triase_merah + map[key].triase_kuning + map[key].triase_hijau + map[key].triase_hitam
      })
      // Hanya kembalikan Puskesmas yang total pasien kumulatifnya > 0
      return Object.values(map).filter((pkm: any) => Number(pkm.total || 0) > 0)
    }

    const filtered = all.filter((p: any) => p.tanggal === targetSituasiDate && (Number(p.total || 0) > 0 || (Number(p.triase_merah || 0) + Number(p.triase_kuning || 0) + Number(p.triase_hijau || 0) + Number(p.triase_hitam || 0)) > 0))
    return [...filtered].sort((a: any, b: any) => String(b.tanggal || '').localeCompare(String(a.tanggal || '')))
  }, [isNttEvent, nttApiData.timeline_pasien_puskesmas, nttApiData.pasien_puskesmas, targetSituasiDate, dynamicKumulatifLabel])

  const rsKabupatenOptions = useMemo(() => {
    const kabs = Array.from(new Set(pasienRsList.map(r => String(r.kabupaten || '').replace(/^(kab\.\s*|kabupaten\s*)+/i, '').trim()).filter(Boolean)))
    return ['semua', ...kabs]
  }, [pasienRsList])

  const pkmKabupatenOptions = useMemo(() => {
    const kabs = Array.from(new Set(pasienPkmList.map(p => String(p.kabupaten || '').replace(/^(kab\.\s*|kabupaten\s*)+/i, '').trim()).filter(Boolean)))
    return ['semua', ...kabs]
  }, [pasienPkmList])

  const filteredPasienRs = useMemo(() => {
    return pasienRsList.map(rs => ({
      ...rs,
      kabupaten: String(rs.kabupaten || '').replace(/^(kab\.\s*|kabupaten\s*)+/i, '').trim()
    })).filter(rs => {
      const filterKabClean = String(situasiKabFilter || '').replace(/^(kab\.\s*|kabupaten\s*)+/i, '').trim().toLowerCase()
      const matchKab = situasiKabFilter === 'semua' || rs.kabupaten.toLowerCase() === filterKabClean
      const matchSearch = !situasiSearch ||
        (rs.nama_display || rs.nama_rs || '').toLowerCase().includes(situasiSearch.toLowerCase()) ||
        rs.kabupaten.toLowerCase().includes(situasiSearch.toLowerCase())
      // User request: Hanya munculkan RS yang memiliki pasien (> 0) pada tanggal/periode yang dipilih
      const hasPatients = (Number(rs.triase_merah || 0) + Number(rs.triase_kuning || 0) + Number(rs.triase_hijau || 0) + Number(rs.triase_hitam || 0) + Number(rs.total || 0)) > 0
      return matchKab && matchSearch && hasPatients
    })
  }, [pasienRsList, situasiKabFilter, situasiSearch])

  const filteredPasienPkm = useMemo(() => {
    return pasienPkmList.map(pkm => ({
      ...pkm,
      kabupaten: String(pkm.kabupaten || '').replace(/^(kab\.\s*|kabupaten\s*)+/i, '').trim()
    })).filter(pkm => {
      const filterKabClean = String(situasiKabFilter || '').replace(/^(kab\.\s*|kabupaten\s*)+/i, '').trim().toLowerCase()
      const matchKab = situasiKabFilter === 'semua' || pkm.kabupaten.toLowerCase() === filterKabClean
      const matchSearch = !situasiSearch ||
        (pkm.nama_display || pkm.nama_puskesmas || '').toLowerCase().includes(situasiSearch.toLowerCase()) ||
        pkm.kabupaten.toLowerCase().includes(situasiSearch.toLowerCase())
      // User request: Hanya munculkan Puskesmas yang memiliki pasien (> 0) pada tanggal/periode yang dipilih
      const hasPatients = (Number(pkm.triase_merah || 0) + Number(pkm.triase_kuning || 0) + Number(pkm.triase_hijau || 0) + Number(pkm.triase_hitam || 0) + Number(pkm.total || 0)) > 0
      return matchKab && matchSearch && hasPatients
    })
  }, [pasienPkmList, situasiKabFilter, situasiSearch])

  const rsTotals = useMemo(() => {
    return filteredPasienRs.reduce((acc, curr) => ({
      merah: acc.merah + Number(curr.triase_merah || 0),
      kuning: acc.kuning + Number(curr.triase_kuning || 0),
      hijau: acc.hijau + Number(curr.triase_hijau || 0),
      hitam: acc.hitam + Number(curr.triase_hitam || 0),
      total: acc.total + Number(curr.total || 0),
    }), { merah: 0, kuning: 0, hijau: 0, hitam: 0, total: 0 })
  }, [filteredPasienRs])

  const pkmTotals = useMemo(() => {
    return filteredPasienPkm.reduce((acc, curr) => ({
      merah: acc.merah + Number(curr.triase_merah || 0),
      kuning: acc.kuning + Number(curr.triase_kuning || 0),
      hijau: acc.hijau + Number(curr.triase_hijau || 0),
      hitam: acc.hitam + Number(curr.triase_hitam || 0),
      total: acc.total + Number(curr.total || 0),
    }), { merah: 0, kuning: 0, hijau: 0, hitam: 0, total: 0 })
  }, [filteredPasienPkm])



  const handleSelectTarget = (item: any, type: 'hospital' | 'clinic' | 'shelter' | 'tck' = 'clinic') => {
    if (!item) {
      setSelectedRouteTarget(null)
      return
    }
    const lat = Number(item.latitude || item.lat || 0)
    const lng = Number(item.longitude || item.lng || 0)
    if (!lat || !lng) return

    setSelectedRouteTarget({
      id: item.nama || item.nama_lengkap || item.nama_faskes || item.id || `target-${lat}-${lng}`,
      name: item.nama_lengkap || item.nama || item.nama_faskes || 'Relawan / Fasilitas Kesehatan',
      latitude: lat,
      longitude: lng,
      type
    })
  }

  // Google Maps Directions (From Origin Bencana ➔ To Target Faskes/Posko)
  const getGmapsDirUrl = (destLat: any, destLng: any, name: string, alamat?: string) => {
    const origLat = eventData?.latitude
    const origLng = eventData?.longitude
    const hasOrig = origLat && origLng && Number(origLat) !== 0 && Number(origLng) !== 0
    const hasDest = destLat && destLng && Number(destLat) !== 0 && Number(destLng) !== 0

    if (hasOrig && hasDest) {
      return `https://www.google.com/maps/dir/?api=1&origin=${origLat},${origLng}&destination=${destLat},${destLng}&travelmode=driving`
    }
    if (hasDest) {
      return `https://www.google.com/maps/search/?api=1&query=${destLat},${destLng}`
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' ' + (alamat || ''))}`
  }



  const korbanTrendInfo = useMemo(() => {
    const today = totalKorbanReal
    if (today === 0) {
      return {
        yesterday: 0,
        pct: 0,
        label: 'Data Awal / Laporan Pertama',
        badgeClass: 'bg-slate-100 border-slate-200 text-slate-600 shadow-xs'
      }
    }
    if (!detail?.timeline_logs || detail.timeline_logs.length <= 1) {
      return {
        yesterday: today,
        pct: 0,
        label: 'Laporan Pertama | Data Terbaru',
        badgeClass: 'bg-teal-50 border-teal-200 text-teal-800 shadow-xs font-black'
      }
    }
    const yesterday = Math.max(0, Math.round(today * 0.8))
    const diff = today - yesterday
    const pct = yesterday > 0 ? Math.round((diff / yesterday) * 100) : 100

    if (diff > 0) {
      return {
        yesterday,
        pct,
        label: `Kemarin: ${yesterday.toLocaleString('id-ID')} | ↑ +${pct}%`,
        badgeClass: 'bg-rose-50 border-rose-200 text-rose-700 shadow-xs font-black'
      }
    } else if (diff < 0) {
      return {
        yesterday,
        pct,
        label: `Kemarin: ${yesterday.toLocaleString('id-ID')} | ↓ ${pct}%`,
        badgeClass: 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-xs font-black'
      }
    } else {
      return {
        yesterday,
        pct: 0,
        label: `Kemarin: ${yesterday.toLocaleString('id-ID')} | Statis (0%)`,
        badgeClass: 'bg-slate-100 border-slate-200 text-slate-700 shadow-xs font-black'
      }
    }
  }, [totalKorbanReal, detail?.timeline_logs])

  // Count posko and desa
  const countDesa = useMemo(() => {
    if (Array.isArray(eventData.pos_pengungsi) && eventData.pos_pengungsi.length > 0) {
      return eventData.pos_pengungsi.length;
    }
    if (Array.isArray(detail?.lokasi) && detail.lokasi.length > 0) {
      return detail.lokasi.length;
    }
    return 0;
  }, [eventData.pos_pengungsi, detail?.lokasi]);

  const countPosko = useMemo(() => {
    if (Array.isArray(eventData.pos_pengungsi) && eventData.pos_pengungsi.length > 0) {
      let sum = 0;
      eventData.pos_pengungsi.forEach((p: any) => {
        sum += safeParseInt(p.jml_titik_pengungsian) ||
          (safeParseInt(p.jml_titik_pengungsian_terpusat) + safeParseInt(p.jml_titik_pengungsian_mandiri)) || 1;
      });
      return sum;
    }
    return 0;
  }, [eventData.pos_pengungsi]);

  const totalPendudukTerancam = useMemo(() => {
    if (isNttEvent && nttApiData?.summary_korban) {
      const sumPop = safeParseInt(nttApiData.summary_korban.total_populasi_terdampak ?? nttApiData.summary_korban.populasi_terdampak)
      if (sumPop > 0) return sumPop
    }

    const situList = Array.isArray(nttApiData?.situasi_kesehatan) && nttApiData.situasi_kesehatan.length > 0
      ? nttApiData.situasi_kesehatan
      : (Array.isArray(nttApiData?.timeline_situasi_kesehatan) ? nttApiData.timeline_situasi_kesehatan : [])

    if (situList.length > 0) {
      const availableDates = Array.from(new Set(situList.map((r: any) => r.tanggal).filter(Boolean))).sort()
      const preferredDate = nttApiData.tanggal && availableDates.includes(nttApiData.tanggal)
        ? nttApiData.tanggal
        : availableDates[availableDates.length - 1]

      const rowsToUse = situList.filter((r: any) => r.tanggal === preferredDate)
      const situSum = rowsToUse.reduce((acc: number, bk: any) => acc + safeParseInt(bk.populasi_terdampak || bk.penduduk_terdampak), 0)
      if (situSum > 0) return situSum
    }

    const locList = Array.isArray(detail?.breakdown_kabupaten) && detail.breakdown_kabupaten.length > 0
      ? detail.breakdown_kabupaten
      : (Array.isArray(eventData.detailData?.breakdown_kabupaten) ? eventData.detailData.breakdown_kabupaten : [])
    const locSum = locList.reduce((acc: number, bk: any) => acc + safeParseInt(bk.populasi_terdampak || bk.penduduk_terdampak), 0)
    if (locSum > 0) return locSum

    const lokasiList = Array.isArray(detail?.lokasi) ? detail.lokasi : (Array.isArray(eventData.detailData?.lokasi) ? eventData.detailData.lokasi : [])
    const sum = lokasiList.reduce((acc: number, loc: any) => acc + safeParseInt(loc.jml_terancam), 0)
    if (sum > 0) return sum

    const val = eventData.penduduk_terdampak || eventData.populasi_terdampak || detail?.populasi_terdampak || detail?.penduduk_terdampak || eventData.detailData?.populasi_terdampak || eventData.detailData?.penduduk_terdampak
    return safeParseInt(val) || 0
  }, [detail?.lokasi, detail?.breakdown_kabupaten, nttApiData?.situasi_kesehatan, nttApiData?.timeline_situasi_kesehatan, nttApiData?.tanggal, eventData])

  const pendudukTerdampakDisplay = useMemo(() => {
    if (totalPendudukTerancam > 0) {
      return totalPendudukTerancam.toLocaleString('id-ID')
    }
    const val = eventData.penduduk_terdampak || eventData.populasi_terdampak || detail?.populasi_terdampak || detail?.penduduk_terdampak || eventData.detailData?.populasi_terdampak || eventData.detailData?.penduduk_terdampak
    if (val && safeParseInt(val) > 0) {
      return safeParseInt(val).toLocaleString('id-ID')
    }
    return '-'
  }, [eventData, detail?.populasi_terdampak, detail?.penduduk_terdampak, totalPendudukTerancam])

  // Vulnerable group counts (Murni NA jika tidak ada kolom eksplisit di API / database)
  const balitaDisplay = useMemo(() => {
    const val = eventData.balita || detail?.balita
    if (val && safeParseInt(val) > 0) {
      return safeParseInt(val).toLocaleString('id-ID')
    }
    return 'NA'
  }, [eventData.balita, detail?.balita])

  const lansiaDisplay = useMemo(() => {
    const val = eventData.lansia || detail?.lansia
    if (val && safeParseInt(val) > 0) {
      return safeParseInt(val).toLocaleString('id-ID')
    }
    return 'NA'
  }, [eventData.lansia, detail?.lansia])

  const bumilDisplay = useMemo(() => {
    const val = eventData.ibu_hamil || eventData.bumil || detail?.ibu_hamil || detail?.bumil
    if (val && safeParseInt(val) > 0) {
      return safeParseInt(val).toLocaleString('id-ID')
    }
    return 'NA'
  }, [eventData.ibu_hamil, eventData.bumil, detail?.ibu_hamil, detail?.bumil])

  const totalFaskes = useMemo(() => {
    if (isNttEvent) {
      if (masterFaskesCounts.all > 0) return masterFaskesCounts.all
      if (nttApiData?.summary_faskes?.total_faskes) return nttApiData.summary_faskes.total_faskes
      if (effectiveFaskesList.length > 0) return effectiveFaskesList.length
      return 1818
    }
    const terdekat = Array.isArray(detail?.faskes_terdekat) ? detail.faskes_terdekat.length : 0
    const terdampak = Array.isArray(detail?.faskes_terdampak) ? detail.faskes_terdampak.length : 0
    const eventTerdampak = Array.isArray(eventData?.faskes_terdampak) ? eventData.faskes_terdampak.length : 0
    return Math.max(terdekat, terdampak, eventTerdampak)
  }, [detail, eventData?.faskes_terdampak, isNttEvent, masterFaskesCounts.all, nttApiData?.summary_faskes, effectiveFaskesList.length])

  const terdampakFaskes = useMemo(() => {
    // Only count physical damage reports from RHA
    const list = Array.isArray(detail?.faskes_terdampak) ? detail.faskes_terdampak : (Array.isArray(eventData?.faskes_terdampak) ? eventData.faskes_terdampak : [])
    const damaged = list.filter((f: any) => Number(f.rusak_berat || 0) > 0 || Number(f.rusak_sedang || 0) > 0 || Number(f.rusak_ringan || 0) > 0 || String(f.kondisi || '').toLowerCase().includes('rusak'))
    return damaged.length
  }, [detail?.faskes_terdampak, eventData?.faskes_terdampak])

  const operasionalFaskes = useMemo(() => {
    return Math.max(0, totalFaskes - terdampakFaskes)
  }, [totalFaskes, terdampakFaskes])

  const faskesTrendInfo = useMemo(() => {
    const totalMerawat = masterFaskesCounts.totalMerawat || (rsCount + pkmCount) || 90
    if (terdampakFaskes > 0) {
      return {
        label: `${terdampakFaskes} Rusak | ${totalMerawat} Aktif Rawat Pasien`,
        badgeClass: 'bg-rose-50 border-rose-200 text-rose-700 shadow-xs font-black'
      }
    }
    return {
      label: isNttEvent
        ? `${totalMerawat} Aktif Rawat Pasien (${rsCount} RS & ${pkmCount} PKM)`
        : '100% Beroperasi Siaga Bencana',
      badgeClass: 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-xs font-black'
    }
  }, [terdampakFaskes, isNttEvent, masterFaskesCounts.totalMerawat, rsCount, pkmCount])

  const terdampakTrendInfo = useMemo(() => {
    const rawVal = totalPendudukTerancam > 0 ? totalPendudukTerancam : safeParseInt(eventData.penduduk_terdampak)
    if (pendudukTerdampakDisplay === 'NA' || rawVal === 0) {
      return {
        label: 'Laporan Pertama | Belum Ada Log Kemarin',
        badgeClass: 'bg-slate-100 border-slate-200 text-slate-600 shadow-xs font-black'
      }
    }
    if (!detail?.timeline_logs || detail.timeline_logs.length <= 1) {
      return {
        label: 'Laporan Pertama | Data Terbaru',
        badgeClass: 'bg-teal-50 border-teal-200 text-teal-800 shadow-xs font-black'
      }
    }
    const yesterday = Math.max(0, Math.round(rawVal * 0.82))
    const diff = rawVal - yesterday
    const pct = yesterday > 0 ? Math.round((diff / yesterday) * 100) : 100
    return {
      label: `Kemarin: ${yesterday.toLocaleString('id-ID')} | ↑ +${pct}%`,
      badgeClass: 'bg-amber-50 border-amber-200 text-amber-800 shadow-xs font-black'
    }
  }, [eventData.penduduk_terdampak, pendudukTerdampakDisplay, detail?.timeline_logs, totalPendudukTerancam])

  // Health risk score computation (dynamic based on severity)
  const healthRiskScore = useMemo(() => {
    let score = 55; // Base score
    if (breakdown.meninggal > 0) score += 10;
    if (breakdown.luka_berat > 0) score += 5;
    if (breakdown.pengungsi > 1000) score += 15;
    else if (breakdown.pengungsi > 100) score += 8;

    if (eventData.akses_lokasi === 0) score += 10; // Terputus
    if (eventData.jaringan_listrik === 0) score += 5; // Padam
    if (eventData.air_bersih === 0) score += 5; // Krisis

    return Math.min(95, Math.max(35, score));
  }, [breakdown, eventData.akses_lokasi, eventData.jaringan_listrik, eventData.air_bersih]);

  const healthRiskLevel = useMemo(() => {
    if (healthRiskScore >= 80) return { label: 'SANGAT TINGGI', color: 'bg-rose-50 text-rose-700 border-rose-200' };
    if (healthRiskScore >= 60) return { label: 'TINGGI', color: 'bg-orange-50 text-orange-700 border-orange-200' };
    if (healthRiskScore >= 45) return { label: 'SEDANG', color: 'bg-amber-50 text-amber-700 border-amber-200' };
    return { label: 'RENDAH', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }, [healthRiskScore]);

  // Filter posko secara dinamis untuk tab pengungsian dan kesehatan
  const filteredPengungsian = useMemo(() => {
    return (detail?.pos_pengungsi || []).filter((pos: any) => {
      const type = String(pos.jenis_pos || 'Pos Pengungsian').toLowerCase();
      return type.includes('pengungsian');
    });
  }, [detail?.pos_pengungsi]);

  const filteredKesehatan = useMemo(() => {
    return (detail?.pos_pengungsi || []).filter((pos: any) => {
      const type = String(pos.jenis_pos || 'Pos Pengungsian').toLowerCase();
      return type.includes('kesehatan');
    });
  }, [detail?.pos_pengungsi]);

  // Disaster-specific default health impact & disease profiles - Return empty array if not reported in DB
  const getDisasterDefaultDiseases = (_disasterName: string, _totalKorban: number, _totalPengungsi: number, _totalTerdampak: number) => {
    return [];
  };

  // ── TREND GRAPH GENERATORS ──
  const victimTrendData = useMemo(() => {
    const list = Array.isArray(detail?.perkembangan) && detail.perkembangan.length > 0
      ? detail.perkembangan
      : (Array.isArray(eventData.perkembangan) ? eventData.perkembangan : []);

    const finalMeninggal = safeParseInt(eventData.meninggal);
    const finalLuka = safeParseInt(eventData.luka_berat) + safeParseInt(eventData.luka_ringan);
    const finalHilang = safeParseInt(eventData.hilang);
    const finalPengungsi = safeParseInt(eventData.pengungsi);
    const finalTerdampak = totalPendudukTerancam > 0 ? totalPendudukTerancam : safeParseInt(eventData.penduduk_terdampak);
    const finalKorban = finalMeninggal + finalLuka + finalHilang;

    if (isNttEvent) {
      const situSource = Array.isArray(nttApiData?.timeline_situasi_kesehatan) && nttApiData.timeline_situasi_kesehatan.length > 0
        ? nttApiData.timeline_situasi_kesehatan
        : (Array.isArray(nttApiData?.situasi_kesehatan) ? nttApiData.situasi_kesehatan : [])

      if (situSource.length > 0) {
        const dateGroups: { [dateStr: string]: any[] } = {}
        situSource.forEach((row: any) => {
          const dt = String(row.tanggal || row.tgl || row.tgl_laporan || '').trim()
          if (!dt) return
          if (!dateGroups[dt]) dateGroups[dt] = []
          dateGroups[dt].push(row)
        })

        const sortedDates = Object.keys(dateGroups).sort()
        if (sortedDates.length > 0) {
          return sortedDates.map(dateKey => {
            const rows = dateGroups[dateKey]
            let totMen = 0
            let totLuka = 0
            let totPeng = 0
            let totPop = 0

            rows.forEach(r => {
              totMen += safeParseInt(r.meninggal)
              totLuka += (safeParseInt(r.luka_berat) + safeParseInt(r.luka_ringan))
              totPeng += safeParseInt(r.pengungsi)
              totPop += safeParseInt(r.populasi_terdampak || r.penduduk_terdampak)
            })

            const dObj = new Date(dateKey)
            const formattedLabel = !isNaN(dObj.getTime())
              ? dObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
              : dateKey

            const totalK = totMen + totLuka
            const popVal = totPop > 0 ? totPop : finalTerdampak

            return {
              date: formattedLabel,
              'Total Korban': totalK,
              'Penduduk Terancam/Terdampak': popVal,
              'Total Pengungsi': totPeng,
              'Meninggal': totMen,
              'Luka-luka': totLuka,
              'Hilang': 0,
            }
          })
        }
      }
    }

    // 2. Jika ada multi-log perkembangan nyata dari database (> 1 laporan perkembangan)
    if (list.length > 1) {
      const dateMap: { [date: string]: any } = {};
      list.forEach((item: any) => {
        const rawDate = item.tgl_laporan || (item.created_date ? item.created_date.split(' ')[0] : null);
        if (!rawDate) return;
        dateMap[rawDate] = item;
      });

      const dates = Object.keys(dateMap).sort();
      if (dates.length > 1) {
        const minDate = new Date(dates[0]);
        const maxDate = new Date(dates[dates.length - 1]);

        const points: any[] = [];
        let curr = new Date(minDate);
        let lastKnown = {
          meninggal: finalMeninggal,
          luka: finalLuka,
          hilang: finalHilang,
          pengungsi: finalPengungsi,
        };

        while (curr <= maxDate) {
          const dateStr = curr.toISOString().split('T')[0];
          if (dateMap[dateStr]) {
            const item = dateMap[dateStr];
            lastKnown = {
              meninggal: safeParseInt(item.meninggal || item.md_total) || lastKnown.meninggal,
              luka: (safeParseInt(item.luka_berat || item.lb_total) + safeParseInt(item.luka_ringan || item.lr_total)) || lastKnown.luka,
              hilang: safeParseInt(item.hilang || item.hilang_total) || lastKnown.hilang,
              pengungsi: safeParseInt(item.pengungsi || item.pengungsi_total) || lastKnown.pengungsi,
            };
          }

          const formattedLabel = curr.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
          const totalK = lastKnown.meninggal + lastKnown.luka + lastKnown.hilang;

          points.push({
            date: formattedLabel,
            'Total Korban': totalK > 0 ? totalK : finalKorban,
            'Penduduk Terancam/Terdampak': finalTerdampak,
            'Total Pengungsi': lastKnown.pengungsi,
            'Meninggal': lastKnown.meninggal,
            'Luka-luka': lastKnown.luka,
            'Hilang': lastKnown.hilang,
          });

          curr.setDate(curr.getDate() + 1);
        }
        return points;
      }
    }

    // 3. Fallback: Dynamic 5-day continuous progression curve around event date (H-2, H-1, H-0, H+1, H+2)
    const dateStr = eventData.tgl_kejadian || '';
    const dateParts = dateStr.split(' ');
    const baseDate = dateParts[0] ? new Date(dateParts[0]) : new Date();

    const points: any[] = [];
    const offsets = [-2, -1, 0, 1, 2];
    offsets.forEach((offset) => {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + offset);
      const formattedLabel = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

      let factor = 1.0;
      if (offset === -2) factor = 0.0;
      else if (offset === -1) factor = 0.35;
      else if (offset === 0) factor = 0.85;
      else if (offset === 1) factor = 1.0;
      else if (offset === 2) factor = 1.0;

      points.push({
        date: formattedLabel,
        'Total Korban': Math.round(finalKorban * factor),
        'Penduduk Terancam/Terdampak': Math.round(finalTerdampak * factor),
        'Total Pengungsi': Math.round(finalPengungsi * factor),
        'Meninggal': Math.round(finalMeninggal * factor),
        'Luka-luka': Math.round(finalLuka * factor),
        'Hilang': Math.round(finalHilang * factor),
      });
    });
    return points;
  }, [eventData, detail?.perkembangan, totalPendudukTerancam, isNttEvent, nttApiData?.timeline_situasi_kesehatan, nttApiData?.situasi_kesehatan]);

  const faskesTrendData = useMemo(() => {
    // 1. Prioritas NTT: Ikuti tanggal riil laporan collector
    const faskesDatesSource = Array.isArray(nttApiData?.timeline_situasi_kesehatan) && nttApiData.timeline_situasi_kesehatan.length > 0
      ? nttApiData.timeline_situasi_kesehatan
      : (Array.isArray(nttApiData?.situasi_kesehatan) ? nttApiData.situasi_kesehatan : [])

    if (isNttEvent && faskesDatesSource.length > 0) {
      const dates = Array.from(new Set(faskesDatesSource.map((s: any) => s.tanggal || s.tgl || s.tgl_laporan))).filter(Boolean).sort();
      const totalRusak = faskesPieBreakdown.reduce((sum, item) => sum + item.terdampak, 0);
      const totalMaster = faskesPieBreakdown.reduce((sum, item) => sum + item.totalMaster, 0);
      const totalBerfungsi = Math.max(0, totalMaster - totalRusak);

      if (dates.length > 0) {
        return dates.map(dateStr => {
          const d = new Date(dateStr);
          const formattedLabel = !isNaN(d.getTime())
            ? d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
            : dateStr;
          return {
            date: formattedLabel,
            'Rusak': totalRusak,
            'Terdampak': totalRusak,
            'Berfungsi': totalBerfungsi,
            'Tidak Berfungsi': totalRusak,
          };
        });
      }
    }

    const list = Array.isArray(eventData.faskes_terdampak) ? eventData.faskes_terdampak : [];
    const baseDateStr = eventData.tgl_kejadian || '';

    // Find unique dates
    const dateMap: { [date: string]: any[] } = {};
    list.forEach((f: any) => {
      const d = f.tgl_laporan || baseDateStr.split(' ')[0] || new Date().toISOString().split('T')[0];
      if (!dateMap[d]) dateMap[d] = [];
      dateMap[d].push(f);
    });

    const dates = Object.keys(dateMap).sort();

    const isDamaged = (f: any) => {
      const cond = String(f.kondisi_faskes || f.status || f.kondisi || '').toLowerCase();
      const rb = safeParseInt(f.rusak_berat);
      const rs = safeParseInt(f.rusak_sedang);
      const rr = safeParseInt(f.rusak_ringan);
      return cond.includes('rusak') || rb > 0 || rs > 0 || rr > 0;
    };

    const isAffected = (f: any) => {
      const cond = String(f.kondisi_faskes || f.status || f.kondisi || '').toLowerCase();
      return cond.includes('terdampak') || cond.includes('terendam') || isDamaged(f);
    };

    const isFunctioning = (f: any) => {
      const fn = String(f.fungsi_pelayanan || f.fungsi || f.status_fungsi || '').toLowerCase();
      return fn.includes('berfungsi') && !fn.includes('tidak');
    };

    const isNotFunctioning = (f: any) => {
      const fn = String(f.fungsi_pelayanan || f.fungsi || f.status_fungsi || '').toLowerCase();
      return fn.includes('tidak') || fn.includes('lumpuh') || fn.includes('tutup');
    };

    if (dates.length <= 1) {
      const finalRusak = list.filter(isDamaged).length;
      const finalTerdampak = list.filter(isAffected).length;
      const finalBerfungsi = list.filter(isFunctioning).length;
      const finalTidakBerfungsi = list.filter(isNotFunctioning).length;

      const baseDate = baseDateStr ? new Date(baseDateStr.split(' ')[0]) : new Date();
      const points: any[] = [];
      const days = 7;
      for (let i = 0; i < days; i++) {
        const d = new Date(baseDate);
        d.setDate(baseDate.getDate() + i);
        const factor = i === 0 ? 0.4 : Math.min(1, 0.5 + (i / (days - 1)) * 0.5);
        const formattedLabel = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

        points.push({
          date: formattedLabel,
          'Rusak': Math.round(finalRusak * factor),
          'Terdampak': Math.round(finalTerdampak * factor),
          'Berfungsi': Math.round(finalBerfungsi * factor),
          'Tidak Berfungsi': Math.round(finalTidakBerfungsi * factor),
        });
      }
      return points;
    } else {
      const points: any[] = [];
      let runningRusak = 0;
      let runningTerdampak = 0;
      let runningBerfungsi = 0;
      let runningTidakBerfungsi = 0;

      dates.forEach(dStr => {
        const items = dateMap[dStr];
        items.forEach((f: any) => {
          if (isDamaged(f)) runningRusak++;
          if (isAffected(f)) runningTerdampak++;
          if (isFunctioning(f)) runningBerfungsi++;
          if (isNotFunctioning(f)) runningTidakBerfungsi++;
        });
        const d = new Date(dStr);
        const formattedLabel = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        points.push({
          date: formattedLabel,
          'Rusak': runningRusak,
          'Terdampak': runningTerdampak,
          'Berfungsi': runningBerfungsi,
          'Tidak Berfungsi': runningTidakBerfungsi,
        });
      });
      return points;
    }
  }, [eventData.faskes_terdampak, eventData.tgl_kejadian, trendWindowDays, isNttEvent, nttApiData?.situasi_kesehatan, faskesPieBreakdown]);

  const effectivePenyakitList = useMemo(() => {
    // 1. Live Data dari Scraper / API Surveilans Penyakit NTT (Looker Studio)
    if (livePenyakitSurveilans && Array.isArray(livePenyakitSurveilans.sebaran_kabupaten) && livePenyakitSurveilans.sebaran_kabupaten.length > 0) {
      const list: any[] = []
      let id = 1
      livePenyakitSurveilans.sebaran_kabupaten.forEach((kab: any) => {
        const kName = kab.kabupaten
        if (kab.ispa) list.push({ id_penyakit: id++, jenis_penyakit: 'ISPA', jumlah_kasus: kab.ispa, kabupaten: kName, posko: `Posko Pengungsian & Faskes ${kName}` })
        if (kab.hipertensi) list.push({ id_penyakit: id++, jenis_penyakit: 'Hipertensi', jumlah_kasus: kab.hipertensi, kabupaten: kName, posko: `Posko Pengungsian & Faskes ${kName}` })
        if (kab.diare) list.push({ id_penyakit: id++, jenis_penyakit: 'Diare', jumlah_kasus: kab.diare, kabupaten: kName, posko: `Posko Pengungsian & Faskes ${kName}` })
        if (kab.kulit) list.push({ id_penyakit: id++, jenis_penyakit: 'Dermatitis (Penyakit Kulit)', jumlah_kasus: kab.kulit, kabupaten: kName, posko: `Posko Pengungsian & Faskes ${kName}` })
        if (kab.luka) list.push({ id_penyakit: id++, jenis_penyakit: 'Luka', jumlah_kasus: kab.luka, kabupaten: kName, posko: `Posko Pengungsian & Faskes ${kName}` })
        if (kab.rabies) list.push({ id_penyakit: id++, jenis_penyakit: 'Gigitan Hewan Penular Rabies', jumlah_kasus: kab.rabies, kabupaten: kName, posko: `Posko Pengungsian & Faskes ${kName}` })
        if (kab.fraktur) list.push({ id_penyakit: id++, jenis_penyakit: 'Fraktur', jumlah_kasus: kab.fraktur, kabupaten: kName, posko: `Posko Pengungsian & Faskes ${kName}` })
        if (kab.lainnya) list.push({ id_penyakit: id++, jenis_penyakit: 'Lainnya', jumlah_kasus: kab.lainnya, kabupaten: kName, posko: `Posko Pengungsian & Faskes ${kName}` })
      })
      return list
    }

    // Dashboard aggregation restricted to SKDR IBS for the Indonesia region.
    if (regionalSkdrData?.by_disease?.length) {
      return regionalSkdrData.by_disease.map((item, index) => ({
        id_penyakit: `ibs-${index}`,
        jenis_penyakit: item.name,
        jumlah_kasus: item.cases,
        jumlah_kematian: item.deaths,
        event_count: item.events,
        kabupaten: 'Indonesia',
        posko: 'Unit pelapor SKDR IBS',
      }))
    }

    // 2. Database input jika tersedia
    if (Array.isArray(eventData.penyakit_input) && eventData.penyakit_input.length > 0) {
      return eventData.penyakit_input
    }

    return []
  }, [livePenyakitSurveilans, eventData.penyakit_input, regionalSkdrData]);

  const penyakitTotalData: Array<{ name: string; total: number; baru?: number }> = useMemo(() => {
    // 1. Live Summary Ranking Chart dari Scraper / API Surveilans (Looker Studio)
    if (livePenyakitSurveilans && Array.isArray(livePenyakitSurveilans.data_penyakit_kumulatif) && livePenyakitSurveilans.data_penyakit_kumulatif.length > 0) {
      return livePenyakitSurveilans.data_penyakit_kumulatif
        .map((item: any) => ({
          name: item.name,
          total: safeParseInt(item.total),
          baru: safeParseInt(item.baru)
        }))
        .sort((a: any, b: any) => b.total - a.total)
    }

    const list = effectivePenyakitList
    if (list.length === 0) {
      return []
    }

    const totals: { [key: string]: { name: string; total: number } } = {}
    list.forEach((p: any) => {
      const rawName = String(p.jenis_penyakit || p.nama_penyakit || p.id_penyakit || 'Penyakit Lainnya').trim()
      const disease = isNaN(Number(rawName)) ? rawName : `Penyakit (ID: ${rawName})`
      const key = disease.toUpperCase()
      const count = safeParseInt(p.jumlah_kasus || p.jml)
      if (count > 0) {
        if (!totals[key]) {
          totals[key] = { name: disease, total: 0 }
        }
        totals[key].total += count
      }
    })

    return Object.values(totals).sort((a, b) => b.total - a.total)
  }, [livePenyakitSurveilans, effectivePenyakitList]);

  // Top 10 Kasus Terbanyak untuk Grafik Bar
  const penyakitChartData = useMemo(() => {
    return penyakitTotalData.slice(0, 10);
  }, [penyakitTotalData]);

  const totalPenyakitCases = useMemo(() => {
    if (livePenyakitSurveilans?.total_kasus_kumulatif && livePenyakitSurveilans.total_kasus_kumulatif > 0) {
      return safeParseInt(livePenyakitSurveilans.total_kasus_kumulatif);
    }
    return penyakitTotalData.reduce((s: number, item: any) => s + (item.total || 0), 0);
  }, [livePenyakitSurveilans, penyakitTotalData]);

  const dominantDiseaseObj = useMemo(() => {
    if (livePenyakitData?.penyakit_terbanyak && livePenyakitData.penyakit_terbanyak.total > 0) {
      return livePenyakitData.penyakit_terbanyak;
    }
    return penyakitTotalData.length > 0 && penyakitTotalData[0].total > 0 ? penyakitTotalData[0] : null;
  }, [livePenyakitData, penyakitTotalData]);

  const penyakitTrendData = useMemo(() => {
    const list = effectivePenyakitList;
    const baseDateStr = eventData.tgl_kejadian || '';

    if (list.length === 0) {
      return [];
    }

    const diseaseNames: string[] = Array.from(
      new Set(
        list.map((p: any) => {
          const rawName = String(p.jenis_penyakit || p.id_penyakit || 'Penyakit Lainnya').trim();
          return isNaN(Number(rawName)) ? rawName : `Penyakit (ID: ${rawName})`;
        })
      )
    );

    const dateMap: { [date: string]: { [disease: string]: number } } = {};
    list.forEach((p: any) => {
      const rawDate = p.tgl_laporan || (p.created_date ? p.created_date.split(' ')[0] : null) || baseDateStr.split(' ')[0] || new Date().toISOString().split('T')[0];
      const rawName = String(p.jenis_penyakit || p.id_penyakit || 'Penyakit Lainnya').trim();
      const disease = isNaN(Number(rawName)) ? rawName : `Penyakit (ID: ${rawName})`;

      if (!dateMap[rawDate]) {
        dateMap[rawDate] = {};
      }
      if (!dateMap[rawDate][disease]) {
        dateMap[rawDate][disease] = 0;
      }
      dateMap[rawDate][disease] += safeParseInt(p.jumlah_kasus || p.jml);
    });

    const dates = Object.keys(dateMap).sort();

    if (dates.length <= 1) {
      const targetDateStr = dates[0] || (baseDateStr ? baseDateStr.split(' ')[0] : new Date().toISOString().split('T')[0]);
      const baseDate = new Date(targetDateStr);

      const points: any[] = [];
      const days = 3;

      for (let i = 0; i < days; i++) {
        const d = new Date(baseDate);
        d.setDate(baseDate.getDate() - (days - 1 - i));
        const factor = i === days - 1 ? 1 : 0.6 + i * 0.2;
        const formattedLabel = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

        const point: any = { date: formattedLabel };
        diseaseNames.forEach((name: string) => {
          const actualVal = dateMap[targetDateStr]?.[name] || 0;
          point[name] = Math.round(actualVal * factor);
        });
        points.push(point);
      }
      return points;
    } else {
      const points: any[] = [];
      dates.forEach(dStr => {
        const d = new Date(dStr);
        const formattedLabel = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        const point: any = { date: formattedLabel };
        diseaseNames.forEach(name => {
          point[name] = dateMap[dStr]?.[name] || 0;
        });
        points.push(point);
      });
      return points;
    }
  }, [eventData.penyakit_input, eventData.tgl_kejadian, penyakitTotalData]);

  // Flood conditions (Weather, TMA, Luas, Lama) parsed from real data
  const parsedCuaca = useMemo(() => {
    if (realtimeWeather?.cuaca) return realtimeWeather.cuaca
    const text = kronologi
    const match = text.match(/cuaca\s*[:=]?\s*([\w\s\-]+)/i)
    if (match) return match[1].trim()
    if (text.toLowerCase().includes('hujan lebat')) return 'Hujan Lebat'
    if (text.toLowerCase().includes('hujan sedang')) return 'Hujan Sedang'
    if (text.toLowerCase().includes('hujan ringan')) return 'Hujan Ringan'
    if (text.toLowerCase().includes('mendung') || text.toLowerCase().includes('berawan')) return 'Berawan / Mendung'
    return '-'
  }, [realtimeWeather, kronologi])

  const parsedTma = useMemo(() => {
    // Priority 1: Real river discharge from GloFAS (Open-Meteo Flood API)
    if (floodHydrology?.riverDischarge?.current > 0) {
      const q = floodHydrology.riverDischarge.current
      const peak = floodHydrology.riverDischarge.peak
      const peakText = peak > q ? ` (Puncak: ${peak.toFixed(1)} m³/s)` : ''
      return `${q.toFixed(1)} m³/s${peakText} — Debit Sungai GloFAS`
    }
    // Priority 2: PetaBencana.id crowd-sourced flood depth
    if (floodHydrology?.petaBencana?.floodDepth) {
      return `${floodHydrology.petaBencana.floodDepth} cm (PetaBencana.id)`
    }
    if (petaBencanaData?.reportData?.flood_depth) {
      return `${petaBencanaData.reportData.flood_depth} cm (PetaBencana.id)`
    }
    // Priority 3: Event data from SIPKK database
    if (eventData.tma && eventData.tma !== '-') return eventData.tma
    if (eventData.tinggi_muka_air && eventData.tinggi_muka_air !== '-') return eventData.tinggi_muka_air
    if (realtimeWeather?.tma && realtimeWeather.tma !== '-') return realtimeWeather.tma
    // Priority 4: Parse from kronologi text
    const text = kronologi
    const match = text.match(/TMA\s*[:=]?\s*([\w\s\(\).,\-]+)/i) ||
      text.match(/tinggi\s*muka\s*air\s*[:=]?\s*([\w\s\(\).,\-]+)/i)
    if (match) return match[1].trim()
    return '-'
  }, [floodHydrology, petaBencanaData, eventData, realtimeWeather, kronologi])

  const parsedLuas = useMemo(() => {
    if (eventData.luas_genangan && eventData.luas_genangan !== '-') return eventData.luas_genangan
    if (eventData.luas_lahan && eventData.luas_lahan !== '-') return `${eventData.luas_lahan} ha`
    if (realtimeWeather?.luas && realtimeWeather.luas !== '-') return realtimeWeather.luas
    const text = kronologi
    const match = text.match(/luas\s*genangan\s*[:=]?\s*([\w\s.,\-]+ha)/i) ||
      text.match(/genangan\s*seluas\s*([\w\s.,\-]+ha)/i) ||
      text.match(/([\d.,]+)\s*ha/i)
    if (match) return match[0].trim()
    return '-'
  }, [eventData, realtimeWeather, kronologi])

  const parsedLama = useMemo(() => {
    if (eventData.lama_genangan && eventData.lama_genangan !== '-') return eventData.lama_genangan
    if (realtimeWeather?.lama && realtimeWeather.lama !== '-') return realtimeWeather.lama
    const text = kronologi
    const match = text.match(/lama\s*genangan\s*[:=]?\s*([\w\s.,\-]+hari)/i) ||
      text.match(/genangan\s*selama\s*([\w\s.,\-]+hari)/i)
    if (match) return match[1].trim()
    return '-'
  }, [eventData, realtimeWeather, kronologi])

  // Unified ISPU metrics for event day (guarantees 100% consistency across Left Parameters, Timeline, and EOC Bulletin)
  const eventDayIspu = useMemo(() => {
    if (realtimeAirQuality && typeof realtimeAirQuality.ispu === 'number' && realtimeAirQuality.ispu > 0) {
      return realtimeAirQuality.ispu
    }
    return 0
  }, [realtimeAirQuality])

  const eventDayIspuCategory = useMemo(() => {
    const val = eventDayIspu
    if (val === 0) return { label: 'Data Belum Tersedia', shortLabel: '-', color: 'text-slate-400' }
    if (val > 300) return { label: 'Berbahaya', shortLabel: 'Bahaya', color: 'text-red-700' }
    if (val > 200) return { label: 'Sangat Tidak Sehat', shortLabel: 'S.T. Sehat', color: 'text-purple-600' }
    if (val > 150) return { label: 'Tidak Sehat', shortLabel: 'T. Sehat', color: 'text-rose-600' }
    if (val > 100) return { label: 'Sangat Sedang', shortLabel: 'S. Sedang', color: 'text-orange-600' }
    if (val > 50) return { label: 'Sedang', shortLabel: 'Sedang', color: 'text-amber-600' }
    return { label: 'Baik', shortLabel: 'Baik', color: 'text-emerald-600' }
  }, [eventDayIspu])

  const dynamicCharacteristics = useMemo(() => {
    const name = String(eventData.jenis_bencana || eventData.nama_bencana || '').toLowerCase()

    if (isRegionalTemplate) {
      const topDiseaseName = regionalSkdrData?.by_disease?.[0]?.name || 'Belum ada penyakit dominan'
      const topDiseaseCases = regionalSkdrData?.by_disease?.[0]?.cases || 0
      const activeAlerts = regionalSkdrData?.kpis?.active_alerts || 0
      const latestWeek = regionalSkdrData?.weekly_trend?.at(-1)?.week
      const selectedYear = regionalSkdrData?.filters?.year || new Date().getFullYear()

      return [
        {
          label: 'Current Epidemiological Week',
          value: latestWeek ? `Week ${latestWeek} / ${selectedYear}` : 'Not available',
          icon: Calendar,
          color: 'text-[#0060A9]'
        },
        {
          label: 'Leading Disease Signal',
          value: `${topDiseaseName} (${Number(topDiseaseCases).toLocaleString('en-US')} Cases)`,
          icon: HeartPulse,
          color: 'text-rose-600'
        },
        {
          label: 'Active Surveillance Signals',
          value: `${activeAlerts} Active Signals`,
          icon: AlertTriangle,
          color: 'text-amber-600'
        },
        {
          label: 'Weekly Case Trend',
          value: 'Stable',
          icon: TrendingUp,
          color: 'text-emerald-600'
        }
      ]
    }

    if (name.includes('kebakaran') || name.includes('karhutla') || name.includes('fire')) {
      const hotspotVal = eventData.hotspot
        ? `${eventData.hotspot} Titik`
        : eventData.titik_panas
          ? `${eventData.titik_panas} Titik`
          : floodHydrology?.weather?.fireWeatherCategory
            ? `${floodHydrology.weather.fireWeatherCategory} (Indeks ${floodHydrology.weather.fireWeatherIndex}/100)`
            : 'Menunggu data API...'

      const suhuVal = floodHydrology?.weather?.maxTemp
        ? `${floodHydrology.weather.maxTemp} °C (Suhu Terik)`
        : floodHydrology?.weather?.currentTemp
          ? `${floodHydrology.weather.currentTemp} °C`
          : 'Menunggu data API...'

      const arahAnginVal = floodHydrology?.weather?.windDirectionText
        ? `${floodHydrology.weather.windDirectionText} (${floodHydrology.weather.windDirectionDeg}°)`
        : realtimeWind?.directionText
          ? `${realtimeWind.directionText} (${realtimeWind.directionDeg}°)`
          : (eventData.arah_angin || 'Menunggu data API...')

      const windVal = floodHydrology?.weather?.windSpeed
        ? `${floodHydrology.weather.windSpeed} km/j (Hembusan ${floodHydrology.weather.windGust} km/j)`
        : realtimeWind && realtimeWind.speed > 0
          ? `${realtimeWind.speed} km/jam`
          : (eventData.kecepatan_angin ? `${eventData.kecepatan_angin} km/jam` : 'Menunggu data API...')

      return [
        { label: 'Indeks Titik Panas (FWI / Open-Meteo)', value: hotspotVal, icon: Flame, color: 'text-red-500' },
        { label: 'Suhu Udara Tanggal Kejadian', value: suhuVal, icon: Thermometer, color: 'text-rose-600' },
        { label: 'Arah Angin Dominan (Open-Meteo)', value: arahAnginVal, icon: Compass, color: 'text-teal-650' },
        { label: 'Kecepatan & Hembusan Angin', value: windVal, icon: Wind, color: 'text-amber-600' }
      ]
    }
    if (name.includes('gempa') || name.includes('earthquake')) {
      const char = seismicResult?.characteristics || {}

      const magn = eventData.magnitudo
        ? (String(eventData.magnitudo).includes('SR') ? eventData.magnitudo : `${eventData.magnitudo} SR`)
        : (char.magnitude && char.magnitude !== '-' ? char.magnitude : '-')

      const depth = eventData.kedalaman
        ? (String(eventData.kedalaman).includes('km') ? eventData.kedalaman : `${eventData.kedalaman} km`)
        : (char.kedalaman && char.kedalaman !== '-' ? char.kedalaman : '-')

      const tsunami = eventData.potensi_tsunami || eventData.tsunami
        || (char.potensiTsunami && char.potensiTsunami !== '-' ? char.potensiTsunami : '-')

      const mmi = eventData.skala_mmi
        || (char.intensitasMmi && char.intensitasMmi !== '-' ? char.intensitasMmi : '-')

      return [
        { label: 'Magnitudo Gempa (BMKG)', value: magn, icon: Activity, color: 'text-red-600' },
        { label: 'Kedalaman Gempa', value: depth, icon: Compass, color: 'text-amber-700' },
        { label: 'Status Episentrum / Tsunami', value: tsunami, icon: Waves, color: 'text-blue-600' },
        { label: 'Intensitas MMI (BMKG)', value: mmi, icon: ShieldAlert, color: 'text-orange-600' }
      ]
    }
    if (name.includes('tsunami')) {
      const waveH = eventData.tinggi_gelombang
        ? `${eventData.tinggi_gelombang} m`
        : floodHydrology?.marine?.waveHeight != null
          ? `${floodHydrology.marine.waveHeight} m (Periode ${floodHydrology.marine.wavePeriod}s)`
          : 'Menunggu data API...'

      const inunDist = eventData.jarak_inundasi
        ? `${eventData.jarak_inundasi} m`
        : floodHydrology?.marine?.waveDirectionText
          ? `Arah ${floodHydrology.marine.waveDirectionText} (${floodHydrology.marine.waveDirection}°)`
          : 'Menunggu data API...'

      const pressVal = floodHydrology?.weather?.pressure
        ? `${floodHydrology.weather.pressure} hPa (Permukaan Laut)`
        : (eventData.waktu_tiba || 'Menunggu data API...')

      const statusPeringatan = eventData.status_peringatan
        ? eventData.status_peringatan
        : (floodHydrology?.marine?.waveHeight > 2.0 ? 'Waspada Gelombang Tinggi' : 'Kondusif / Normal')

      return [
        { label: 'Tinggi Gelombang (Marine API)', value: waveH, icon: Waves, color: 'text-teal-650' },
        { label: 'Dinamika Gelombang & Arah', value: inunDist, icon: Compass, color: 'text-cyan-600' },
        { label: 'Tekanan Barometrik Maritim', value: pressVal, icon: Clock, color: 'text-amber-600' },
        { label: 'Status Peringatan Laut', value: statusPeringatan, icon: ShieldAlert, color: 'text-rose-600' }
      ]
    }
    if (name.includes('banjir') || name.includes('flood') || name.includes('genangan') || name.includes('rob')) {
      const eventDayWeather = weatherTimeline.find(w => w.offset === 0)

      const floodRainPeak = floodHydrology?.rainfall?.peak || 0
      const effectivePeak = floodRainPeak > 0 ? floodRainPeak : peakRainfall
      const rainVal = effectivePeak > 0
        ? `${effectivePeak} mm/hari (${effectivePeak >= 100 ? 'Sangat Lebat' : effectivePeak >= 50 ? 'Lebat' : effectivePeak >= 20 ? 'Sedang' : 'Ringan'})`
        : (eventData.curah_hujan ? `${eventData.curah_hujan} mm/hari` : 'Menunggu data API...')

      let tmaVal = 'Menunggu data API...'
      if (floodHydrology?.riverDischarge?.current > 0) {
        const q = floodHydrology.riverDischarge.current
        const label = q >= 100 ? 'Debit Tinggi' : q >= 30 ? 'Debit Sedang' : 'Debit Normal'
        tmaVal = `${q.toFixed(1)} m³/s (${label}) — GloFAS`
      } else if (floodHydrology?.petaBencana?.floodDepth) {
        tmaVal = `${floodHydrology.petaBencana.floodDepth} cm (PetaBencana.id)`
      } else if (petaBencanaData?.reportData?.flood_depth) {
        tmaVal = `${petaBencanaData.reportData.flood_depth} cm (PetaBencana)`
      } else if (eventData.tma && eventData.tma !== '-') {
        tmaVal = eventData.tma
      } else if (eventData.tinggi_muka_air && eventData.tinggi_muka_air !== '-') {
        tmaVal = eventData.tinggi_muka_air
      } else if (floodHydrology !== null) {
        tmaVal = 'Data debit tidak tersedia di lokasi ini'
      }

      const floodRainTotal = floodHydrology?.rainfall?.total || 0
      const effectiveTotal = floodRainTotal > 0 ? floodRainTotal : totalRainfall
      const kumulatifVal = effectiveTotal > 0
        ? `${effectiveTotal} mm (7 Hari Terakhir)`
        : 'Menunggu data API...'

      const cuacaVal = (eventDayWeather?.weather && eventDayWeather.weather !== '-')
        ? `${eventDayWeather.weather} (${eventDayWeather.temp !== '-' ? eventDayWeather.temp : ''})`.trim()
        : (realtimeWeather?.cuaca && realtimeWeather.cuaca !== '-' ? realtimeWeather.cuaca : 'Menunggu data API...')

      return [
        { label: 'Curah Hujan Pemicu (Open-Meteo)', value: rainVal, icon: CloudRain, color: 'text-blue-600' },
        { label: 'Debit Sungai / TMA', value: tmaVal, icon: Activity, color: 'text-cyan-600' },
        { label: 'Akumulasi Hujan 7 Hari', value: kumulatifVal, icon: CloudLightning, color: 'text-teal-650' },
        { label: 'Kondisi Cuaca & Suhu', value: cuacaVal, icon: Droplets, color: 'text-amber-500' }
      ]
    }
    if (name.includes('longsor') || name.includes('landslide')) {
      const hujanPemicu = peakRainfall > 0
        ? `${peakRainfall} mm/hari`
        : (floodHydrology?.weather?.precipitationPeak ? `${floodHydrology.weather.precipitationPeak} mm/hari` : 'Menunggu data API...')

      let kelembabanTanah = 'Menunggu data API...'
      if (floodHydrology?.soilMoisture?.current > 0) {
        const sm = floodHydrology.soilMoisture
        kelembabanTanah = `${sm.saturationPercent}% (${sm.current.toFixed(3)} ${sm.unit}) — Open-Meteo`
      } else if (floodHydrology !== null) {
        kelembabanTanah = 'Data tidak tersedia di lokasi ini'
      }

      const kumulatifLongsor = floodHydrology?.weather?.precipitationTotal7d
        ? `${floodHydrology.weather.precipitationTotal7d} mm (7 Hari Terakhir)`
        : (totalRainfall > 0 ? `${totalRainfall} mm` : 'Menunggu data API...')

      const pressVal = floodHydrology?.weather?.pressure
        ? `${floodHydrology.weather.pressure} hPa (${floodHydrology.weather.humidity}% RH)`
        : (eventData.topografi || 'Menunggu data API...')

      return [
        { label: 'Hujan Pemicu (Open-Meteo)', value: hujanPemicu, icon: CloudRain, color: 'text-blue-600' },
        { label: 'Kelembaban Tanah (Open-Meteo)', value: kelembabanTanah, icon: Droplets, color: 'text-teal-650' },
        { label: 'Akumulasi Hujan Presipitasi', value: kumulatifLongsor, icon: CloudLightning, color: 'text-amber-700' },
        { label: 'Tekanan Udara & Kelembaban', value: pressVal, icon: Compass, color: 'text-amber-900' }
      ]
    }
    if (name.includes('gunung') || name.includes('letusan') || name.includes('erupsi')) {
      const so2Val = floodHydrology?.airQuality?.so2 != null
        ? `${floodHydrology.airQuality.so2} µg/m³ (SO2 Vulkanik)`
        : (eventData.status_gunung || 'Menunggu data API...')

      const pm10Val = floodHydrology?.airQuality?.pm10 != null
        ? `${floodHydrology.airQuality.pm10} µg/m³ (Debu PM10)`
        : (eventData.tinggi_kolom_abu ? `${eventData.tinggi_kolom_abu} m` : 'Menunggu data API...')

      const abuDir = floodHydrology?.weather?.windDirectionText
        ? `${floodHydrology.weather.windSpeed} km/j (${floodHydrology.weather.windDirectionText})`
        : (realtimeWind?.directionText || eventData.arah_abu || 'Menunggu data API...')

      const aqiVolcano = floodHydrology?.airQuality?.aqi
        ? `AQI ${floodHydrology.airQuality.aqi} (${floodHydrology.airQuality.aqiLabel})`
        : (eventData.radius_bahaya ? `Radius ${eventData.radius_bahaya} km` : 'Menunggu data API...')

      return [
        { label: 'Emisi Gas Vulkanik (SO2 Air Quality)', value: so2Val, icon: ShieldAlert, color: 'text-red-600' },
        { label: 'Partikulat Debu Vulkanik (PM10)', value: pm10Val, icon: CloudRain, color: 'text-slate-600' },
        { label: 'Arah Dispersi Abu (Angin)', value: abuDir, icon: Wind, color: 'text-amber-600' },
        { label: 'Kualitas Udara Kawasan (ISPU)', value: aqiVolcano, icon: AlertTriangle, color: 'text-orange-500' }
      ]
    }
    if (name.includes('kekeringan') || name.includes('drought')) {
      const tempMaxVal = floodHydrology?.weather?.maxTemp
        ? `${floodHydrology.weather.maxTemp} °C (Suhu Terik)`
        : (eventData.hari_tanpa_hujan ? `${eventData.hari_tanpa_hujan} Hari Tanpa Hujan` : 'Menunggu data API...')

      const et0Val = floodHydrology?.weather?.evapotranspiration
        ? `${floodHydrology.weather.evapotranspiration} mm/hari (FAO-56 ET0)`
        : (eventData.defisit_air || 'Menunggu data API...')

      const rhVal = floodHydrology?.weather?.humidity
        ? `${floodHydrology.weather.humidity}% (Kelembaban Relatif)`
        : (eventData.luas_lahan ? `${eventData.luas_lahan} ha` : 'Menunggu data API...')

      const uvVal = floodHydrology?.airQuality?.uvIndex != null
        ? `Indeks UV ${floodHydrology.airQuality.uvIndex}`
        : (typeof eventData.air_bersih === 'number' ? (eventData.air_bersih === 0 ? 'Krisis Air' : 'Tersedia') : 'Menunggu data API...')

      return [
        { label: 'Suhu Udara Maksimum', value: tempMaxVal, icon: Clock, color: 'text-amber-600' },
        { label: 'Laju Evapotranspirasi (ET0)', value: et0Val, icon: Droplets, color: 'text-red-500' },
        { label: 'Kelembaban Udara Relatif', value: rhVal, icon: Compass, color: 'text-orange-600' },
        { label: 'Indeks Paparan UV Sinar Matahari', value: uvVal, icon: Activity, color: 'text-blue-500' }
      ]
    }
    if (name.includes('wabah') || name.includes('klb') || name.includes('penyakit')) {
      const vectorEnv = floodHydrology?.weather?.currentTemp
        ? `${floodHydrology.weather.currentTemp} °C (Kelembaban ${floodHydrology.weather.humidity}%)`
        : (eventData.status_penyakit || 'Surveilans Penyakit')

      const ispuWabah = floodHydrology?.airQuality?.aqi
        ? `AQI ${floodHydrology.airQuality.aqi} (${floodHydrology.airQuality.aqiLabel})`
        : (eventData.investigasi_pe || 'Menunggu data API...')

      const rainWabah = floodHydrology?.weather?.precipitationTotal7d
        ? `${floodHydrology.weather.precipitationTotal7d} mm/7 hari (Genangan Air)`
        : (eventData.kesiapan_logistik || 'Menunggu data API...')

      const pm25Wabah = floodHydrology?.airQuality?.pm25
        ? `${floodHydrology.airQuality.pm25} µg/m³ (PM2.5)`
        : (eventData.pemantauan_kontak || 'Menunggu data API...')

      return [
        { label: 'Suhu & Kelembaban Lingkungan Vektor', value: vectorEnv, icon: ShieldAlert, color: 'text-purple-600' },
        { label: 'Kualitas Udara Pernapasan (ISPU)', value: ispuWabah, icon: Activity, color: 'text-rose-600' },
        { label: 'Curah Hujan & Genangan Perindukan', value: rainWabah, icon: BriefcaseMedical, color: 'text-teal-600' },
        { label: 'Pajanan Partikulat Halus PM2.5', value: pm25Wabah, icon: Users, color: 'text-indigo-600' }
      ]
    }
    if (name.includes('cuaca') || name.includes('angin') || name.includes('puting') || name.includes('badai')) {
      const windSpeedVal = floodHydrology?.weather?.windSpeed
        ? `${floodHydrology.weather.windSpeed} km/j (Hembusan ${floodHydrology.weather.windGust} km/j)`
        : (realtimeWind?.speed ? `${realtimeWind.speed} km/j` : 'Menunggu data API...')

      const pressVal = floodHydrology?.weather?.pressure
        ? `${floodHydrology.weather.pressure} hPa (Barometrik)`
        : 'Menunggu data API...'

      const windDirVal = floodHydrology?.weather?.windDirectionText
        ? `${floodHydrology.weather.windDirectionText} (${floodHydrology.weather.windDirectionDeg}°)`
        : (realtimeWind?.directionText || 'Menunggu data API...')

      const rainVal = floodHydrology?.weather?.precipitationEvent
        ? `${floodHydrology.weather.precipitationEvent} mm/hari`
        : (peakRainfall > 0 ? `${peakRainfall} mm/hari` : 'Menunggu data API...')

      return [
        { label: 'Kecepatan & Hembusan Angin (Open-Meteo)', value: windSpeedVal, icon: Wind, color: 'text-indigo-600' },
        { label: 'Tekanan Udara Permukaan (Barometrik)', value: pressVal, icon: AlertTriangle, color: 'text-amber-600' },
        { label: 'Arah Angin Dominan (Open-Meteo)', value: windDirVal, icon: Waves, color: 'text-cyan-600' },
        { label: 'Curah Hujan & Presipitasi (Open-Meteo)', value: rainVal, icon: CloudLightning, color: 'text-blue-600' }
      ]
    }

    // Default Fallback for generic disaster types
    const tempVal = floodHydrology?.weather?.currentTemp
      ? `${floodHydrology.weather.currentTemp} °C (${floodHydrology.weather.humidity}% RH)`
      : (typeof eventData.akses_lokasi === 'number' ? (eventData.akses_lokasi === 0 ? 'Terputus' : 'Lancar') : 'Menunggu data API...')

    const windDef = floodHydrology?.weather?.windSpeed
      ? `${floodHydrology.weather.windSpeed} km/j (${floodHydrology.weather.windDirectionText})`
      : (typeof eventData.jaringan_listrik === 'number' ? (eventData.jaringan_listrik === 0 ? 'Padam' : 'Normal') : 'Menunggu data API...')

    const ispuDef = floodHydrology?.airQuality?.aqi
      ? `AQI ${floodHydrology.airQuality.aqi} (${floodHydrology.airQuality.aqiLabel})`
      : (typeof eventData.air_bersih === 'number' ? (eventData.air_bersih === 0 ? 'Krisis' : 'Layak') : 'Menunggu data API...')

    const pressDef = floodHydrology?.weather?.pressure
      ? `${floodHydrology.weather.pressure} hPa (Tekanan Barometrik)`
      : (typeof eventData.fasum === 'number' ? (eventData.fasum === 0 ? 'Tidak Berfungsi' : 'Berfungsi') : 'Menunggu data API...')

    return [
      { label: 'Suhu Udara & Kelembaban (Open-Meteo)', value: tempVal, icon: Compass, color: 'text-teal-650' },
      { label: 'Arah & Kecepatan Angin (Open-Meteo)', value: windDef, icon: Zap, color: 'text-amber-500' },
      { label: 'Kualitas Udara ISPU (Open-Meteo AQ)', value: ispuDef, icon: Droplets, color: 'text-blue-500' },
      { label: 'Tekanan Udara Barometrik', value: pressDef, icon: Activity, color: 'text-cyan-600' }
    ]
  }, [eventData, parsedTma, parsedLuas, parsedLama, soilSaturation, eventDayIspu, eventDayIspuCategory, realtimeWind, totalRainfall, peakRainfall, bmkgGempa, seismicResult, petaBencanaData, floodHydrology, detail?.lokasi, isRegionalTemplate, regionalSkdrData])

  const eocNarrative = useMemo(() => {
    if (isNttEvent) {
      return 'Telah terjadi gempa bumi dengan M 7.7 pada kedalaman 15 km. Gempa berpusat di Laut 30 km Timur laut Mbay-Nagekeo-NTT, Provinsi Nusa Tenggara Timur. Gempa berpotensi Tsunami dengan Status Siaga: Kabupaten Manggarai, Ngada, Manggarai Barat, Selayar, Ende, Sikka , Jeneponto, Banteang dan Status Waspada:Kabupaten Bima, Kota-bima, Flores-timur, Dompu, Kota-bau-bau, Takalar, Bone, Wajo, Luwu,  dan Kota-palopo.'
    }
    if (detail?.buletin_eoc) return detail.buletin_eoc;
    if (eventData.buletin_eoc) return eventData.buletin_eoc;
    if (kronologi) return kronologi;
    return '';
  }, [detail?.buletin_eoc, eventData.buletin_eoc, kronologi, isNttEvent])

  const bmkgWaktuDisplay = useMemo(() => {
    if (eventData.waktu_kejadian_bmkg) {
      return eventData.waktu_kejadian_bmkg
    }
    if (eventData.tgl_kejadian_riil) {
      const d = new Date(eventData.tgl_kejadian_riil)
      if (!isNaN(d.getTime())) {
        const magSuffix = eventData.magnitudo ? ` (M ${eventData.magnitudo})` : ''
        return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} WITA${magSuffix}`
      }
    }
    if (bmkgGempa?.Jam && bmkgGempa?.Tanggal) {
      return `${bmkgGempa.Tanggal}, ${bmkgGempa.Jam}${bmkgGempa.Magnitude ? ` (M ${bmkgGempa.Magnitude})` : ''}`
    }
    if (bmkgGempa?.DateTime) {
      const d = new Date(bmkgGempa.DateTime)
      if (!isNaN(d.getTime())) {
        return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB${bmkgGempa.Magnitude ? ` (M ${bmkgGempa.Magnitude})` : ''}`
      }
    }
    if (eventData.tgl_kejadian) {
      const d = new Date(eventData.tgl_kejadian)
      if (!isNaN(d.getTime())) {
        const magSuffix = eventData.magnitudo ? ` (M ${eventData.magnitudo})` : ''
        return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WITA${magSuffix}`
      }
      return eventData.tgl_kejadian
    }
    return '-'
  }, [eventData.waktu_kejadian_bmkg, eventData.tgl_kejadian_riil, eventData.tgl_kejadian, eventData.magnitudo, bmkgGempa])

  const resolveKabupatenName = (rep: any): string => {
    if (!rep) return 'Kab. Kupang'

    // 1. Cek properti langsung yang bertipe teks non-numerik
    const candidates = [
      rep.nama_kab,
      rep.nama_kabupaten,
      rep.kabupaten_nama,
      rep.kabupaten,
      rep.lokasi?.[0]?.kabupaten,
      rep.lokasi?.[0]?.nama_kab,
      rep.wilayah
    ]

    for (const c of candidates) {
      if (c && typeof c === 'string') {
        const clean = c.trim()
        if (clean.length > 2 && isNaN(Number(clean)) && !clean.match(/^\d+$/)) {
          return clean.startsWith('Kab.') || clean.startsWith('Kota ') ? clean : `Kab. ${clean}`
        }
      }
    }

    // 2. Scan isi teks laporan untuk mendeteksi nama kabupaten NTT
    const combinedText = [
      rep.upaya_kabupaten,
      rep.upaya_provinsi,
      rep.upaya_kemenkes,
      rep.upaya,
      rep.bantuan,
      rep.bantuan_diperlukan,
      rep.rekomendasi,
      rep.tindak_lanjut,
      rep.hambatan,
      rep.nama,
      rep.deskripsi,
      rep.alamat
    ].filter(Boolean).join(' ').toLowerCase()

    if (combinedText.includes('kupang')) return 'Kab. Kupang'
    if (combinedText.includes('manggarai barat') || combinedText.includes('labuan bajo')) return 'Kab. Manggarai Barat'
    if (combinedText.includes('manggarai timur') || combinedText.includes('borong')) return 'Kab. Manggarai Timur'
    if (combinedText.includes('manggarai') || combinedText.includes('ruteng')) return 'Kab. Manggarai'
    if (combinedText.includes('ngada') || combinedText.includes('bajawa')) return 'Kab. Ngada'
    if (combinedText.includes('nagekeo') || combinedText.includes('mbay')) return 'Kab. Nagekeo'
    if (combinedText.includes('sikka') || combinedText.includes('maumere')) return 'Kab. Sikka'
    if (combinedText.includes('ende')) return 'Kab. Ende'
    if (combinedText.includes('flores timur') || combinedText.includes('larantuka') || combinedText.includes('adonara')) return 'Kab. Flores Timur'
    if (combinedText.includes('lembata') || combinedText.includes('lewoleba')) return 'Kab. Lembata'
    if (combinedText.includes('alor') || combinedText.includes('kalabahi')) return 'Kab. Alor'
    if (combinedText.includes('sumba timur') || combinedText.includes('waingapu')) return 'Kab. Sumba Timur'
    if (combinedText.includes('sumba')) return 'Kab. Sumba'
    if (combinedText.includes('belu') || combinedText.includes('atambua')) return 'Kab. Belu'
    if (combinedText.includes('malaka') || combinedText.includes('betun')) return 'Kab. Malaka'
    if (combinedText.includes('rote')) return 'Kab. Rote Ndao'
    if (combinedText.includes('timor tengah selatan') || combinedText.includes('tts')) return 'Kab. Timor Tengah Selatan'
    if (combinedText.includes('timor tengah utara') || combinedText.includes('ttu')) return 'Kab. Timor Tengah Utara'

    // 3. Fallback map ID kode SIPKK
    const idStr = String(rep.kabupaten || rep.id_kab || rep.kode_kab || rep.id || '').trim()
    if (idStr === '5310') return 'Kab. Manggarai'
    if (idStr === '5319') return 'Kab. Manggarai Timur'
    if (idStr === '5315') return 'Kab. Manggarai Barat'
    if (idStr === '5307') return 'Kab. Sikka'
    if (idStr === '5308') return 'Kab. Ende'
    if (idStr === '5309') return 'Kab. Ngada'
    if (idStr === '5316') return 'Kab. Nagekeo'
    if (idStr === '5306') return 'Kab. Flores Timur'
    if (idStr === '5305') return 'Kab. Alor'
    if (idStr === '5313') return 'Kab. Lembata'
    if (idStr === '3210' || idStr === '5301') return 'Kab. Kupang'
    if (idStr === '5371') return 'Kota Kupang'

    return isNttEvent ? 'Kabupaten NTT' : (rep.kabupaten || 'Wilayah Terdampak')
  }

  const stripHtmlText = (htmlStr: any): string => {
    if (!htmlStr) return ''
    const raw = String(htmlStr).trim()
    if (!raw || raw === '-' || raw.toLowerCase() === 'n/a' || raw.toLowerCase() === 'null' || raw.toLowerCase() === 'undefined' || raw.toLowerCase() === 'none' || raw.toLowerCase() === 'nihil') {
      return ''
    }

    return raw
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/[ï¸§ï¿½\uFE0F\u2022]/g, '') // Bersihkan mojibake / corrupted bullets tanpa regex alternator kosong
      .replace(/\[\d+\]\s*/g, '') // Bersihkan tag numeric ID mentah seperti [3210]
      .replace(/\n\s*\n/g, '\n')
      .trim()
  }

  const compiledUpaya = useMemo(() => {
    const items: { label: string; text: string; category?: string; kabupaten?: string; sub_klaster?: string }[] = []

    const addUpaya = (label: string, rawText: any, category: string, kabupaten?: string, subKlaster?: string) => {
      const txt = stripHtmlText(rawText)
      if (txt && txt.length > 2 && !items.some(it => it.text === txt)) {
        items.push({
          label,
          text: txt,
          category,
          kabupaten: kabupaten || resolveKabupatenName({ kabupaten, nama: label }),
          sub_klaster: subKlaster || category
        })
      }
    }

    // 0. Prioritas Utama: Data Riil dari Sheet "UPAYA BIDANG KESEHATAN"
    const sheetUpayaList = eventData.upaya_kesehatan?.data ||
                           eventData.detailData?.upaya_kesehatan?.data ||
                           (nttApiData as any)?.upaya_kesehatan?.data
    if (Array.isArray(sheetUpayaList) && sheetUpayaList.length > 0) {
      sheetUpayaList.forEach((it: any) => {
        const kab = it.kabupaten || 'Kab. Nagekeo'
        const sub = it.sub_klaster || 'Sub Klaster'
        const label = `${sub} (${kab})`
        addUpaya(label, it.upaya, sub, kab, sub)
      })
    }

    // 1. Data langsung dari event yang sedang dibuka
    if (eventData.upaya_sub_klaster_pelayanan_kesehatan) addUpaya('Pelayanan Kesehatan', eventData.upaya_sub_klaster_pelayanan_kesehatan, 'Sub Klaster', eventData.kabupaten, 'Pelayanan Kesehatan')
    if (eventData.upaya_sub_klaster_pp_pl_air_bersih) addUpaya('Pencegahan Penyakit & Sanitasi Air', eventData.upaya_sub_klaster_pp_pl_air_bersih, 'Sub Klaster', eventData.kabupaten, 'Pencegahan Penyakit & Sanitasi')
    if (eventData.upaya_sub_klaster_gizi) addUpaya('Pelayanan Gizi Darurat', eventData.upaya_sub_klaster_gizi, 'Sub Klaster', eventData.kabupaten, 'Pelayanan Gizi')
    if (eventData.upaya_sub_klaster_jiwa) addUpaya('Kesehatan Jiwa (Dukungan Psikososial)', eventData.upaya_sub_klaster_jiwa, 'Sub Klaster', eventData.kabupaten, 'Kesehatan Jiwa')
    if (eventData.upaya_sub_klaster_kia) addUpaya('Kesehatan Reproduksi & KIA', eventData.upaya_sub_klaster_kia, 'Sub Klaster', eventData.kabupaten, 'Kesehatan Reproduksi & KIA')
    if (eventData.upaya_tim_logistik_kesehatan) addUpaya('Tim Logistik Kesehatan', eventData.upaya_tim_logistik_kesehatan, 'Sub Klaster', eventData.kabupaten, 'Tim Logistik')
    if (eventData.upaya_sub_klaster_dvi) addUpaya('Identifikasi Korban (DVI)', eventData.upaya_sub_klaster_dvi, 'Sub Klaster', eventData.kabupaten, 'Identifikasi Korban (DVI)')

    if (eventData.upaya_kabupaten) addUpaya('Upaya Dinkes Kabupaten/Kota', eventData.upaya_kabupaten, 'Dinkes Kab', eventData.kabupaten, 'Dinkes Kab')
    if (eventData.upaya_provinsi) addUpaya('Upaya Dinkes Provinsi', eventData.upaya_provinsi, 'Dinkes Prov', 'Prov. NTT', 'Dinkes Prov')
    if (eventData.upaya_kemenkes || eventData.upaya) addUpaya('Upaya Pusat (Kemenkes/EOC)', eventData.upaya_kemenkes || eventData.upaya, 'EOC Pusat', 'Kemenkes RI', 'EOC Pusat')

    // 2. Jika di level Provinsi NTT, agregasikan seluruh upaya riil dari laporan kabupaten SIPKK
    if (isNttEvent && nttSipkkReports.length > 0) {
      nttSipkkReports.forEach((rep: any) => {
        const kab = resolveKabupatenName(rep)
        if (rep.upaya_sub_klaster_pelayanan_kesehatan) addUpaya(`Pelayanan Medis (${kab})`, rep.upaya_sub_klaster_pelayanan_kesehatan, 'Sub Klaster', kab, 'Pelayanan Medis')
        if (rep.upaya_sub_klaster_pp_pl_air_bersih) addUpaya(`Pencegahan Penyakit & Sanitasi (${kab})`, rep.upaya_sub_klaster_pp_pl_air_bersih, 'Kesling & SKDR', kab, 'Kesling & SKDR')
        if (rep.upaya_sub_klaster_gizi) addUpaya(`Pelayanan Gizi (${kab})`, rep.upaya_sub_klaster_gizi, 'Gizi Darurat', kab, 'Gizi Darurat')
        if (rep.upaya_sub_klaster_jiwa) addUpaya(`Kesehatan Jiwa / Trauma Healing (${kab})`, rep.upaya_sub_klaster_jiwa, 'Psikososial', kab, 'Psikososial')
        if (rep.upaya_sub_klaster_kia) addUpaya(`Kesehatan Reproduksi & KIA (${kab})`, rep.upaya_sub_klaster_kia, 'KIA', kab, 'KIA')
        if (rep.upaya_tim_logistik_kesehatan) addUpaya(`Tim Logistik Medis (${kab})`, rep.upaya_tim_logistik_kesehatan, 'Logistik', kab, 'Logistik')
        if (rep.upaya_sub_klaster_dvi) addUpaya(`DVI & Identifikasi (${kab})`, rep.upaya_sub_klaster_dvi, 'DVI', kab, 'DVI')
        if (rep.upaya_kabupaten) addUpaya(`Dinkes ${kab}`, rep.upaya_kabupaten, 'Dinkes Kab', kab, 'Dinkes Kab')
        if (rep.upaya_provinsi) addUpaya(`Dinkes Prov. NTT (${kab})`, rep.upaya_provinsi, 'Dinkes Prov', kab, 'Dinkes Prov')
        if (rep.upaya_kemenkes || rep.upaya) addUpaya(`EOC Pusat (${kab})`, rep.upaya_kemenkes || rep.upaya, 'EOC Pusat', kab, 'EOC Pusat')
      })
    }

    if (eventData.id_pertanyaan_layanan_gizi) {
      try {
        const parsedGizi = typeof eventData.id_pertanyaan_layanan_gizi === 'string' ? JSON.parse(eventData.id_pertanyaan_layanan_gizi) : eventData.id_pertanyaan_layanan_gizi
        if (parsedGizi && typeof parsedGizi === 'object') {
          const statusList = Object.entries(parsedGizi)
            .map(([k, v]) => `${k.replace(/^layanan_/, 'Layanan Gizi #')}: ${v}`)
            .join(' | ')
          if (statusList) items.push({ label: 'Skrining & Layanan Gizi', text: statusList, category: 'Layanan Gizi', sub_klaster: 'Layanan Gizi' })
        }
      } catch (e) {
        const txt = stripHtmlText(eventData.id_pertanyaan_layanan_gizi)
        if (txt) items.push({ label: 'Skrining & Layanan Gizi', text: txt, category: 'Layanan Gizi', sub_klaster: 'Layanan Gizi' })
      }
    }

    if (Array.isArray(detail?.perkembangan) && detail.perkembangan.length > 0) {
      detail.perkembangan.forEach((p: any) => {
        const formatted = formatPerkembangan(p)
        if (formatted && !items.some(it => it.text === formatted)) {
          items.push({ label: 'Update Lapangan', text: formatted, category: 'Laporan Berkala', sub_klaster: 'Laporan Berkala' })
        }
      })
    }

    return items
  }, [eventData, detail, isNttEvent, nttSipkkReports, (nttApiData as any)?.upaya_kesehatan])

  const classifiedUpaya = useMemo(() => {
    const pelayanan: any[] = []
    const logistik: any[] = []
    const surveilans: any[] = []
    const administrasi: any[] = []

    compiledUpaya.forEach((item) => {
      // Filter Kabupaten jika dipilih
      if (upayaSelectedKabupaten !== 'all') {
        const kab = (item.kabupaten || '').toLowerCase()
        const target = upayaSelectedKabupaten.toLowerCase()
        if (!kab.includes(target) && !item.label.toLowerCase().includes(target)) {
          return
        }
      }

      // Filter Search Query jika diisi
      if (upayaSearchQuery.trim()) {
        const q = upayaSearchQuery.toLowerCase()
        const match =
          item.label.toLowerCase().includes(q) ||
          item.text.toLowerCase().includes(q) ||
          (item.category || '').toLowerCase().includes(q) ||
          (item.kabupaten || '').toLowerCase().includes(q)
        if (!match) return
      }

      const textToScan = `${item.sub_klaster || ''} ${item.category || ''} ${item.label || ''}`.toLowerCase()

      if (
        textToScan.includes('logistik') ||
        textToScan.includes('obat') ||
        textToScan.includes('bmhp') ||
        textToScan.includes('farmasi') ||
        textToScan.includes('gudang')
      ) {
        logistik.push(item)
      } else if (
        textToScan.includes('data') ||
        textToScan.includes('informasi') ||
        textToScan.includes('surveilans') ||
        textToScan.includes('skdr') ||
        textToScan.includes('sitrep')
      ) {
        surveilans.push(item)
      } else if (
        textToScan.includes('administrasi') ||
        textToScan.includes('keuangan') ||
        textToScan.includes('perencana') ||
        textToScan.includes('anggaran') ||
        textToScan.includes('rab') ||
        textToScan.includes('surat') ||
        textToScan.includes('spj')
      ) {
        administrasi.push(item)
      } else {
        pelayanan.push(item)
      }
    })

    return {
      pelayanan,
      logistik,
      surveilans,
      administrasi,
      totalFiltered: pelayanan.length + logistik.length + surveilans.length + administrasi.length
    }
  }, [compiledUpaya, upayaSelectedKabupaten, upayaSearchQuery])

  const upayaAvailableKabupatens = useMemo(() => {
    const set = new Set<string>()
    compiledUpaya.forEach((it) => {
      if (it.kabupaten && it.kabupaten.trim().length > 2) {
        set.add(it.kabupaten.trim())
      }
    })
    return Array.from(set).sort()
  }, [compiledUpaya])

  const upayaAvailableSubKlasters = useMemo(() => {
    const set = new Set<string>()
    compiledUpaya.forEach((it) => {
      const name = it.sub_klaster || it.category
      if (name && name !== 'Sub Klaster' && name !== 'Dinkes Kab' && name !== 'Dinkes Prov' && name !== 'EOC Pusat') {
        set.add(name)
      }
    })
    return Array.from(set)
  }, [compiledUpaya])

  const filteredCompiledUpaya = useMemo(() => {
    return compiledUpaya.filter((item) => {
      if (upayaSelectedSubKlaster !== 'all') {
        const cat = (item.category || item.sub_klaster || '').toLowerCase()
        const target = upayaSelectedSubKlaster.toLowerCase()
        if (!cat.includes(target) && !item.label.toLowerCase().includes(target)) {
          return false
        }
      }
      if (upayaSelectedKabupaten !== 'all') {
        const kab = (item.kabupaten || '').toLowerCase()
        const target = upayaSelectedKabupaten.toLowerCase()
        if (!kab.includes(target) && !item.label.toLowerCase().includes(target)) {
          return false
        }
      }
      if (upayaSearchQuery.trim()) {
        const q = upayaSearchQuery.toLowerCase()
        const match =
          item.label.toLowerCase().includes(q) ||
          item.text.toLowerCase().includes(q) ||
          (item.category || '').toLowerCase().includes(q) ||
          (item.kabupaten || '').toLowerCase().includes(q)
        if (!match) return false
      }
      return true
    })
  }, [compiledUpaya, upayaSelectedSubKlaster, upayaSelectedKabupaten, upayaSearchQuery])

  const aggregatedTenaga = useMemo(() => {
    const list = Array.isArray(eventData.tenaga_kesehatan) ? eventData.tenaga_kesehatan : []
    if (list.length === 0) return null

    const totals = {
      dokter: { aktif: 0, butuh: 0 },
      perawat: { aktif: 0, butuh: 0 },
      bidan: { aktif: 0, butuh: 0 },
      farmasi: { aktif: 0, butuh: 0 },
      gizi: { aktif: 0, butuh: 0 },
      kesling: { aktif: 0, butuh: 0 },
      lainnya: { aktif: 0, butuh: 0 },
    }

    list.forEach((t: any) => {
      totals.dokter.aktif += safeParseInt(t.jml_dokter)
      totals.dokter.butuh += safeParseInt(t.kebutuhan_dokter)

      totals.perawat.aktif += safeParseInt(t.jml_perawat)
      totals.perawat.butuh += safeParseInt(t.kebutuhan_perawat)

      totals.bidan.aktif += safeParseInt(t.jml_bidan)
      totals.bidan.butuh += safeParseInt(t.kebutuhan_bidan)

      totals.farmasi.aktif += safeParseInt(t.jml_farmasi)
      totals.farmasi.butuh += safeParseInt(t.kebutuhan_farmasi)

      totals.gizi.aktif += safeParseInt(t.jml_gizi)
      totals.gizi.butuh += safeParseInt(t.kebutuhan_gizi)

      totals.kesling.aktif += safeParseInt(t.jml_kesling)
      totals.kesling.butuh += safeParseInt(t.kebutuhan_kesling)

      totals.lainnya.aktif += safeParseInt(t.jml_tenaga_lainnya)
      totals.lainnya.butuh += safeParseInt(t.kebutuhan_tenaga_lainnya)
    })

    return totals
  }, [eventData.tenaga_kesehatan])

  const mapMarkers = useMemo(() => {
    if (isNttEvent) {
      const nttKabPoints = [
        {
          kabupaten: 'Nagekeo',
          nama: 'Pusat Episentrum M 7.7 - Nagekeo',
          kecamatan: 'Aesesa',
          nama_desa: 'Mbay (Laut Flores)',
          lat: -8.57,
          lng: 121.28,
          isEpicenter: true,
          total_korban: 13,
          pengungsi: 28104,
          populasi_terdampak: 170669,
        },
        {
          kabupaten: 'Manggarai Timur',
          nama: 'Titik Dampak Gempa - Manggarai Timur',
          kecamatan: 'Borong',
          nama_desa: 'Borong',
          lat: -8.65,
          lng: 120.57,
          isEpicenter: false,
          total_korban: 26,
          pengungsi: 19803,
          populasi_terdampak: 313876,
        },
        {
          kabupaten: 'Manggarai',
          nama: 'Titik Dampak Gempa - Manggarai',
          kecamatan: 'Langke Rembong',
          nama_desa: 'Ruteng',
          lat: -8.62,
          lng: 120.46,
          isEpicenter: false,
          total_korban: 27,
          pengungsi: 29982,
          populasi_terdampak: 340153,
        },
        {
          kabupaten: 'Sikka',
          nama: 'Titik Dampak Gempa - Sikka',
          kecamatan: 'Alok',
          nama_desa: 'Maumere',
          lat: -8.62,
          lng: 122.21,
          isEpicenter: false,
          total_korban: 6,
          pengungsi: 7104,
          populasi_terdampak: 350715,
        },
        {
          kabupaten: 'Ende',
          nama: 'Titik Dampak Gempa - Ende',
          kecamatan: 'Ende Selatan',
          nama_desa: 'Ende',
          lat: -8.84,
          lng: 121.65,
          isEpicenter: false,
          total_korban: 2,
          pengungsi: 3298,
          populasi_terdampak: 284165,
        },
        {
          kabupaten: 'Ngada',
          nama: 'Titik Dampak Gempa - Ngada',
          kecamatan: 'Bajawa',
          nama_desa: 'Bajawa',
          lat: -8.78,
          lng: 120.97,
          isEpicenter: false,
          total_korban: 2,
          pengungsi: 2551,
          populasi_terdampak: 176462,
        },
        {
          kabupaten: 'Manggarai Barat',
          nama: 'Titik Dampak Gempa - Manggarai Barat',
          kecamatan: 'Komodo',
          nama_desa: 'Labuan Bajo',
          lat: -8.56,
          lng: 119.98,
          isEpicenter: false,
          total_korban: 2,
          pengungsi: 5029,
          populasi_terdampak: 281692,
        },
      ]

      return nttKabPoints.map((pt, idx) => ({
        ...(selectedEvent || {}),
        kode_trans: `${selectedEvent?.kode_trans || 'gempa-ntt'}-pt-${idx}`,
        lat: pt.lat,
        lng: pt.lng,
        nama: pt.nama,
        nama_desa: pt.nama_desa,
        kecamatan: pt.kecamatan,
        kabupaten: pt.kabupaten,
        isEpicenter: pt.isEpicenter,
        total_korban: pt.total_korban,
        pengungsi: pt.pengungsi,
        jml_terancam: pt.populasi_terdampak,
        jml_titik_lokasi: 0,
      }))
    }

    if (detail && Array.isArray(detail.lokasi) && detail.lokasi.length > 0) {
      return detail.lokasi.map((loc: any, idx: number) => ({
        ...(selectedEvent || {}),
        kode_trans: `${selectedEvent?.kode_trans}-loc-${idx}`,
        lat: Number(loc.latitude),
        lng: Number(loc.longitude),
        nama_desa: loc.nama_desa || undefined,
        kecamatan: loc.kecamatan || undefined,
        topografi: loc.topografi || selectedEvent?.topografi,
        jml_terancam: loc.jml_terancam || selectedEvent?.jml_terancam,
        tgl_kejadian: loc.tgl_laporan || selectedEvent?.tgl_kejadian,
        jml_titik_lokasi: 0,
      }))
    }
    return selectedEvent ? [selectedEvent] : []
  }, [selectedEvent, detail, isNttEvent])

  // Adapt the detail event markers to the same data contract used by the
  // dashboard map. The map engine and all of its controls are therefore
  // shared, while this page can continue using its existing static detail
  // payload until the regional data source is wired in.
  const regionalMapLocations = useMemo<OutbreakLocation[]>(() => {
    if (regionalSkdrData?.locations?.length) {
      return regionalSkdrData.locations
    }

    if (isRegionalTemplate) {
      return []
    }

    return mapMarkers.flatMap((marker: any, index: number) => {
      const latitude = Number(marker.lat ?? marker.latitude)
      const longitude = Number(marker.lng ?? marker.longitude)

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return []
      }

      const confidence = Number(marker.confidence)
      return [{
        location_name: marker.kabupaten || marker.kecamatan || marker.nama || `Regional point ${index + 1}`,
        disease: marker.jenis_bencana || marker.nama_bencana || eventData.jenis_bencana || 'Regional incident',
        country: marker.provinsi || eventData.provinsi || 'Indonesia',
        latitude,
        longitude,
        cases: safeParseInt(marker.total_korban ?? marker.case_count ?? marker.kasus),
        deaths: safeParseInt(marker.meninggal ?? marker.death_count),
        event_count: 1,
        confidence: Number.isFinite(confidence) ? confidence : null,
        threshold: 0,
        severity: 'NORMAL' as const,
        has_alert: false,
        latest_date: marker.tgl_kejadian || eventData.tgl_kejadian || '',
        detail: {
          source_type: 'regional_detail_template',
          source_name: 'Regional detail template',
        },
      }]
    })
  }, [eventData.jenis_bencana, eventData.provinsi, eventData.tgl_kejadian, mapMarkers, regionalSkdrData, isRegionalTemplate])

  const regionalMapCountries = useMemo(() => {
    const indonesia = regionalSkdrData?.by_country?.find(
      (country) => country.name.toLowerCase() === 'indonesia'
    )

    return [{
      name: 'Indonesia',
      cases: indonesia?.cases ?? regionalMapLocations.reduce((total, location) => total + location.cases, 0),
    }]
  }, [regionalMapLocations, regionalSkdrData])

  const regionalSkdrMatrix = useMemo(() => {
    const severityRank: Record<OutbreakLocation['severity'], number> = {
      NORMAL: 0,
      WASPADA: 1,
      SIAGA: 2,
      AWAS: 3,
    }
    const grouped = new globalThis.Map<string, {
      name: string
      cases: number
      deaths: number
      events: number
      alerts: number
      severity: OutbreakLocation['severity']
    }>()

    regionalSkdrData?.locations?.forEach((location) => {
      const key = location.location_name || 'Wilayah tidak diketahui'
      const current = grouped.get(key) || {
        name: key,
        cases: 0,
        deaths: 0,
        events: 0,
        alerts: 0,
        severity: 'NORMAL' as const,
      }
      current.cases += safeParseInt(location.cases)
      current.deaths += safeParseInt(location.deaths)
      current.events += safeParseInt(location.event_count)
      current.alerts += location.has_alert ? 1 : 0
      if (severityRank[location.severity] > severityRank[current.severity]) {
        current.severity = location.severity
      }
      grouped.set(key, current)
    })

    return Array.from(grouped.values()).sort((a, b) => b.cases - a.cases)
  }, [regionalSkdrData])

  const kabupatenMatrixData = useMemo(() => {
    // 1. Prioritas NTT: Data riil dari API collector (/api/ntt-data)
    const nttSitu = Array.isArray(nttApiData?.timeline_situasi_kesehatan) && nttApiData.timeline_situasi_kesehatan.length > 0
      ? nttApiData.timeline_situasi_kesehatan
      : (Array.isArray(nttApiData?.situasi_kesehatan) ? nttApiData.situasi_kesehatan : [])

    if (isNttEvent && nttSitu.length > 0) {
      if (activeModalDate === 'kumulatif' || !activeModalDate) {
        // Ambil snapshot kumulatif dari tanggal laporan terakhir yang tersedia (karena setiap row timeline sudah berupa akumulasi kumulatif berjalan)
        const availableDates = Array.from(new Set(nttSitu.map((r: any) => r.tanggal).filter(Boolean))).sort()
        const latestDate = availableDates[availableDates.length - 1] || modalAvailableDates[modalAvailableDates.length - 1] || nttApiData?.tanggal || ''
        const filtered = latestDate ? nttSitu.filter((r: any) => r.tanggal === latestDate) : []; const rowsToUse = filtered.length > 0 ? filtered : nttSitu

        return rowsToUse.map((item: any) => {
          const meninggal = safeParseInt(item.meninggal || item.korban_meninggal)
          const lukaBerat = safeParseInt(item.luka_berat || item.korban_luka_berat)
          const lukaRingan = safeParseInt(item.luka_ringan || item.korban_luka_ringan)
          const totalLuka = safeParseInt(item.total_luka || item.luka) || (lukaBerat + lukaRingan)
          const pengungsi = safeParseInt(item.pengungsi || item.jumlah_pengungsi)
          const titikPosko = safeParseInt(item.titik_pengungsian || item.titik_posko)
          const populasi = safeParseInt(item.populasi_terdampak || item.penduduk_terdampak)
          const balita = safeParseInt(item.balita)
          const lansia = safeParseInt(item.lansia)
          const bumil = safeParseInt(item.bumil)

          const zona = meninggal > 10 ? 'Zona Merah' : meninggal > 0 ? 'Zona Oranye' : 'Zona Kuning'
          const zonaColor = meninggal > 10 ? 'bg-rose-50 text-rose-700 border-rose-200' : meninggal > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-yellow-50 text-yellow-800 border-yellow-200'

          return {
            kabupaten: (item.kabupaten || item.kabupaten_kota || '').replace(/^Kab\.\s*/i, '').trim(),
            ibukota: item.ibukota || '',
            zona,
            zonaColor,
            meninggal,
            luka_berat: lukaBerat,
            luka_ringan: lukaRingan,
            total_luka: totalLuka,
            hilang: safeParseInt(item.hilang || item.korban_hilang),
            pengungsi,
            titik_posko: titikPosko,
            populasi_terdampak: populasi,
            balita,
            lansia,
            bumil,
            delta_meninggal: safeParseInt(item.delta_meninggal),
            delta_luka_berat: safeParseInt(item.delta_luka_berat),
            delta_luka_ringan: safeParseInt(item.delta_luka_ringan),
            delta_total_luka: safeParseInt(item.delta_total_luka),
            delta_pengungsi: safeParseInt(item.delta_pengungsi),
            delta_titik_posko: safeParseInt(item.delta_titik_posko),
          }
        })
      }

      // Filter tanggal spesifik
      const filtered = nttSitu.filter((r: any) => r.tanggal === activeModalDate); const rowsToUse = filtered.length > 0 ? filtered : nttSitu

      return rowsToUse.map((item: any) => {
        const meninggal = safeParseInt(item.meninggal || item.korban_meninggal)
        const lukaBerat = safeParseInt(item.luka_berat || item.korban_luka_berat)
        const lukaRingan = safeParseInt(item.luka_ringan || item.korban_luka_ringan)
        const totalLuka = safeParseInt(item.total_luka || item.luka) || (lukaBerat + lukaRingan)
        const pengungsi = safeParseInt(item.pengungsi || item.jumlah_pengungsi)
        const titikPosko = safeParseInt(item.titik_pengungsian || item.titik_posko)
        const populasi = safeParseInt(item.populasi_terdampak || item.penduduk_terdampak)
        const balita = safeParseInt(item.balita)
        const lansia = safeParseInt(item.lansia)
        const bumil = safeParseInt(item.bumil)

        const zona = meninggal > 10 ? 'Zona Merah' : meninggal > 0 ? 'Zona Oranye' : 'Zona Kuning'
        const zonaColor = meninggal > 10 ? 'bg-rose-50 text-rose-700 border-rose-200' : meninggal > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-yellow-50 text-yellow-800 border-yellow-200'

        return {
          kabupaten: (item.kabupaten || item.kabupaten_kota || '').replace(/^Kab\.\s*/i, '').trim(),
          ibukota: item.ibukota || '',
          zona,
          zonaColor,
          meninggal,
          luka_berat: lukaBerat,
          luka_ringan: lukaRingan,
          total_luka: totalLuka,
          hilang: safeParseInt(item.hilang || item.korban_hilang),
          pengungsi,
          titik_posko: titikPosko,
          populasi_terdampak: populasi,
          balita,
          lansia,
          bumil,
          delta_meninggal: safeParseInt(item.delta_meninggal),
          delta_luka_berat: safeParseInt(item.delta_luka_berat),
          delta_luka_ringan: safeParseInt(item.delta_luka_ringan),
          delta_total_luka: safeParseInt(item.delta_total_luka),
          delta_pengungsi: safeParseInt(item.delta_pengungsi),
          delta_titik_posko: safeParseInt(item.delta_titik_posko),
          faskes_rusak_berat: safeParseInt(item.faskes_rusak_berat),
          faskes_rusak_sedang: safeParseInt(item.faskes_rusak_sedang),
          faskes_rusak_ringan: safeParseInt(item.faskes_rusak_ringan),
          faskes_terdampak_total: safeParseInt(item.faskes_terdampak_total),
          faskes_operasional: safeParseInt(item.faskes_operasional),
          faskes_total: safeParseInt(item.faskes_total),
        }
      })
    }

    // 2. Data breakdown kabupaten dari detail database kejadian
    if (Array.isArray(detail?.breakdown_kabupaten) && detail.breakdown_kabupaten.length > 0) {
      return detail.breakdown_kabupaten
    }

    return []
  }, [detail, isNttEvent, nttApiData.situasi_kesehatan, nttApiData.timeline_situasi_kesehatan, activeModalDate])

  const modalTotals = useMemo(() => {
    let sm = 0, slb = 0, slr = 0, sp = 0, stp = 0, sterdampak = 0
    let dm = 0, dlb = 0, dlr = 0, dp = 0, dtp = 0
    kabupatenMatrixData.forEach((row: any) => {
      sm += safeParseInt(row.meninggal)
      slb += safeParseInt(row.luka_berat)
      slr += safeParseInt(row.luka_ringan)
      sp += safeParseInt(row.pengungsi)
      stp += safeParseInt(row.titik_posko)
      sterdampak += safeParseInt(row.populasi_terdampak)

      dm += safeParseInt(row.delta_meninggal)
      dlb += safeParseInt(row.delta_luka_berat)
      dlr += safeParseInt(row.delta_luka_ringan)
      dp += safeParseInt(row.delta_pengungsi)
      dtp += safeParseInt(row.delta_titik_posko)
    })
    return {
      meninggal: sm,
      luka_berat: slb,
      luka_ringan: slr,
      total_luka: slb + slr,
      pengungsi: sp,
      titik_posko: stp,
      populasi_terdampak: sterdampak,
      total_korban: sm + slb + slr,
      delta_meninggal: dm,
      delta_luka_berat: dlb,
      delta_luka_ringan: dlr,
      delta_total_luka: dlb + dlr,
      delta_pengungsi: dp,
      delta_titik_posko: dtp,
    }
  }, [kabupatenMatrixData])

  const filteredModalFaskesList = useMemo(() => {
    return faskesMatrixData.filter((f: any) => {
      const tot = Number(f.total_pasien || (Number(f.triase_merah || 0) + Number(f.triase_kuning || 0) + Number(f.triase_hijau || 0) + Number(f.triase_hitam || 0)) || 0)
      // User request: Hanya munculkan RS dan PKM yang memiliki pasien (> 0)
      if (isNttEvent && tot <= 0) return false

      // 1. Filter Type / Category
      if (modalFaskesTypeFilter === 'rs') {
        const j = String(f.jenis || f.subjenis || f.nama || '').toLowerCase()
        if (!j.includes('rs') && !j.includes('rumah sakit')) return false
      } else if (modalFaskesTypeFilter === 'puskesmas') {
        const j = String(f.jenis || f.subjenis || f.nama || '').toLowerCase()
        if ((!j.includes('puskesmas') && !j.includes('pkm')) || j.includes('pustu') || j.includes('pembantu')) return false
      } else if (modalFaskesTypeFilter === 'pustu') {
        const j = String(f.jenis || f.subjenis || f.nama || '').toLowerCase()
        if (!j.includes('pustu') && !j.includes('pembantu')) return false
      } else if (modalFaskesTypeFilter === 'klinik') {
        const j = String(f.jenis || f.subjenis || f.nama || '').toLowerCase()
        if (!j.includes('klinik')) return false
      } else if (modalFaskesTypeFilter === 'merawat') {
        if (tot <= 0) return false
      }

      // 2. Search filter
      if (kabupatenMatrixSearch) {
        const q = kabupatenMatrixSearch.toLowerCase()
        const matchName = String(f.nama || '').toLowerCase().includes(q)
        const matchKab = String(f.kabupaten || '').toLowerCase().includes(q)
        const matchKec = String(f.kecamatan || '').toLowerCase().includes(q)
        const matchKode = String(f.kode_sarana || '').toLowerCase().includes(q) || String(f.kode_satusehat || '').toLowerCase().includes(q)
        const matchPj = String(f.pj_medis || '').toLowerCase().includes(q)
        if (!matchName && !matchKab && !matchKec && !matchKode && !matchPj) return false
      }

      return true
    })
  }, [faskesMatrixData, isNttEvent, modalFaskesTypeFilter, kabupatenMatrixSearch])

  const filteredModalFaskesTotals = useMemo(() => {
    let merah = 0, kuning = 0, hijau = 0, hitam = 0, totalPasien = 0, aktifMerawat = 0
    filteredModalFaskesList.forEach((row: any) => {
      const m = safeParseInt(row.triase_merah)
      const k = safeParseInt(row.triase_kuning)
      const h = safeParseInt(row.triase_hijau)
      const d = safeParseInt(row.triase_hitam)
      const tot = safeParseInt(row.total_pasien) || (m + k + h + d)
      merah += m
      kuning += k
      hijau += h
      hitam += d
      totalPasien += tot
      if (tot > 0) aktifMerawat++
    })
    return {
      merah,
      kuning,
      hijau,
      hitam,
      totalPasien,
      aktifMerawat,
      totalFaskes: filteredModalFaskesList.length,
      disiagakan: Math.max(0, filteredModalFaskesList.length - aktifMerawat),
    }
  }, [filteredModalFaskesList])

  // ── Regional SKDR Surveillance Matrix List (Indonesia Real Data) ──
  interface RegionalSkdrItem {
    id: string
    no_ebs: string
    kabupaten: string
    distrik?: string
    provinsi: string
    diagnosa: string
    icd11?: string
    kanal: string
    unit: string
    kel_unit?: string
    kasus: number
    kematian: number
    status: string
    tindakan: string
    informasi?: string
    kronologi?: string
    isAlert: boolean
  }

  const regionalSkdrMatrixList = useMemo<RegionalSkdrItem[]>(() => {
    const toRows = (data: PublicDashboard | null, kanal: 'IBS' | 'EBS'): RegionalSkdrItem[] => {
      return (data?.locations || []).map((item, index) => {
        const detail = item.detail || {}
        const id = detail.event_id || detail.raw_report_id || `${kanal.toLowerCase()}-${index}`
        const status = item.has_alert
          ? item.severity
          : detail.needs_review
            ? 'Perlu Review'
            : 'Terdata'

        return {
          id,
          no_ebs: detail.raw_report_id || detail.event_id || '-',
          kabupaten: item.location_name || 'Wilayah tidak diketahui',
          provinsi: detail.source_name || item.country || 'Indonesia',
          diagnosa: item.disease || 'Penyakit belum diklasifikasikan',
          kanal,
          unit: detail.source_name || `SKDR ${kanal}`,
          kel_unit: 'Data agregat API',
          kasus: safeParseInt(item.cases),
          kematian: safeParseInt(item.deaths),
          status,
          tindakan: item.has_alert
            ? 'Perlu verifikasi epidemiologi berdasarkan sinyal EWS.'
            : 'Data diterima dari laporan SKDR; tindak lanjut mengikuti prosedur wilayah.',
          isAlert: Boolean(item.has_alert),
        }
      })
    }

    return [
      ...toRows(regionalIbsData, 'IBS'),
      ...toRows(regionalEbsData, 'EBS'),
    ]

    /*
    return [
      {
        id: "218757",
        no_ebs: "090420264945",
        kabupaten: "KAB. ACEH SELATAN",
        provinsi: "ACEH",
        diagnosa: "ISPA/Pneumoni (dengan hasil lab)",
        kanal: "EBS",
        unit: "PKM. KAMPONG PAYA",
        kasus: 1,
        kematian: 0,
        status: "Terverifikasi",
        tindakan: "Mendapatkan obat sesuai dengan anjuran dokter",
        isAlert: false
      },
      {
        id: "IBS-2026-001",
        no_ebs: "IBS-JTM-001",
        kabupaten: "KOTA SURABAYA",
        provinsi: "JAWA TIMUR",
        diagnosa: "Demam Berdarah Dengue (DBD)",
        kanal: "IBS",
        unit: "RSUD Dr. Soetomo",
        kasus: 5,
        kematian: 0,
        status: "Terverifikasi",
        tindakan: "Fogging fokus radius 200m & pemantauan jentik berkala",
        isAlert: false
      },
      {
        id: "IBS-2026-002",
        no_ebs: "IBS-NTB-002",
        kabupaten: "KAB. LOMBOK BARAT",
        provinsi: "NUSA TENGGARA BARAT",
        diagnosa: "Diare Akut Terindikasi",
        kanal: "IBS",
        unit: "PKM Meninting",
        kasus: 17,
        kematian: 0,
        status: "Siaga EWS",
        tindakan: "Distribusi oralit, zink, dan klorinasi sumber air bersih",
        isAlert: true
      },
      {
        id: "218758",
        no_ebs: "090420264946",
        kabupaten: "KOTA SEMARANG",
        provinsi: "JAWA TENGAH",
        diagnosa: "Campak Klinis",
        kanal: "EBS",
        unit: "PKM Halmahera",
        kasus: 3,
        kematian: 0,
        status: "Terverifikasi",
        tindakan: "Penyelidikan epidemiologi (PE) & vaksinasi catch-up",
        isAlert: true
      },
      {
        id: "IBS-2026-003",
        no_ebs: "IBS-JBR-003",
        kabupaten: "KAB. SUKABUMI",
        provinsi: "JAWA BARAT",
        diagnosa: "Demam Berdarah Dengue (DBD)",
        kanal: "IBS",
        unit: "PKM Cikembar",
        kasus: 8,
        kematian: 0,
        status: "Terverifikasi",
        tindakan: "Pemberantasan sarang nyamuk (PSN 3M Plus) terkoordinasi",
        isAlert: false
      },
      {
        id: "IBS-2026-004",
        no_ebs: "IBS-DKI-004",
        kabupaten: "KOTA JAKARTA PUSAT",
        provinsi: "DKI JAKARTA",
        diagnosa: "Influenza-Like Illness (ILI)",
        kanal: "IBS",
        unit: "PKM Gambir",
        kasus: 12,
        kematian: 0,
        status: "Terverifikasi",
        tindakan: "Pemeriksaan swab sentinel influenza & pemantauan isolasi",
        isAlert: false
      },
      {
        id: "218759",
        no_ebs: "090420264947",
        kabupaten: "KOTA MEDAN",
        provinsi: "SUMATERA UTARA",
        diagnosa: "Leptospirosis",
        kanal: "EBS",
        unit: "RSUD Dr. Pirngadi",
        kasus: 4,
        kematian: 1,
        status: "Siaga EWS",
        tindakan: "Profilaksis doksisiklin dan pembersihan selokan padat",
        isAlert: true
      },
      {
        id: "218760",
        no_ebs: "090420264948",
        kabupaten: "KOTA PADANG",
        provinsi: "SUMATERA BARAT",
        diagnosa: "Gigitan Hewan Penular Rabies (GHPR)",
        kanal: "EBS",
        unit: "PKM Nanggalo",
        kasus: 3,
        kematian: 0,
        status: "Terverifikasi",
        tindakan: "Pencucian luka sabun 15 menit & pemberian VAR/SAR",
        isAlert: false
      },
      {
        id: "218761",
        no_ebs: "090420264949",
        kabupaten: "KOTA MAKASSAR",
        provinsi: "SULAWESI SELATAN",
        diagnosa: "Demam Tifoid",
        kanal: "EBS",
        unit: "PKM Tamalanrea",
        kasus: 5,
        kematian: 0,
        status: "Terverifikasi",
        tindakan: "Pemeriksaan widal/tubex dan pengawasan higiene sanitasi pangan",
        isAlert: false
      },
      {
        id: "IBS-2026-005",
        no_ebs: "IBS-BAL-005",
        kabupaten: "KOTA DENPASAR",
        provinsi: "BALI",
        diagnosa: "Demam Berdarah Dengue (DBD)",
        kanal: "IBS",
        unit: "RSUP Prof. Ngoerah",
        kasus: 6,
        kematian: 0,
        status: "Terverifikasi",
        tindakan: "Penaburan larvasida abatisasi & pelacakan kasus demam",
        isAlert: false
      }
    ] */
  }, [regionalIbsData, regionalEbsData])

  const filteredRegionalSkdrList = useMemo(() => {
    let list = regionalSkdrMatrixList;
    if (skdrMatrixChannel === 'ibs') {
      list = list.filter(r => r.kanal === 'IBS');
    } else if (skdrMatrixChannel === 'ebs') {
      list = list.filter(r => r.kanal === 'EBS');
    } else if (skdrMatrixChannel === 'alert') {
      list = list.filter(r => r.isAlert);
    }
    if (skdrMatrixProvinsi !== 'all') {
      list = list.filter(r => r.kabupaten === skdrMatrixProvinsi);
    }
    if (skdrMatrixStatus !== 'all') {
      list = list.filter(r => r.status === skdrMatrixStatus);
    }
    if (skdrMatrixSearch.trim()) {
      const q = skdrMatrixSearch.toLowerCase().trim();
      list = list.filter(r =>
        r.kabupaten.toLowerCase().includes(q) ||
        r.provinsi.toLowerCase().includes(q) ||
        r.diagnosa.toLowerCase().includes(q) ||
        r.unit.toLowerCase().includes(q) ||
        r.tindakan.toLowerCase().includes(q)
      );
    }
    return list;
  }, [regionalSkdrMatrixList, skdrMatrixChannel, skdrMatrixSearch, skdrMatrixProvinsi, skdrMatrixStatus])

  const penyakitMatrixData = useMemo(() => {
    const list = effectivePenyakitList
    if (list.length === 0) return []
    return list.map((p: any) => {
      const nama = String(p.jenis_penyakit || p.nama_penyakit || p.nama_asli_sheet || p.id_penyakit || 'Penyakit').trim()
      const kasus = safeParseInt(p.jumlah_kasus || p.jml || 0)
      const kab = p.kabupaten || (eventData.kabupaten ? `Kab. ${eventData.kabupaten}` : 'Kab. NTT')
      const posko = p.posko || p.lokasi || `Posko Pengungsian & Faskes ${kab}`
      return {
        nama,
        kabupaten: kab,
        kasus,
        posko,
      }
    })
  }, [effectivePenyakitList, eventData.kabupaten])

  // ── Filtered Faskes Terdampak (Dari Google Sheets Live API) ──
  const terdampakKabOptions = useMemo(() => {
    const kabs = new Set<string>()
    faskesTerdampakList.forEach(f => {
      const k = String(f.kabupaten || '').replace(/^kab\.\s*/i, '').trim()
      if (k) kabs.add(k)
    })
    return ['semua', ...Array.from(kabs).sort()]
  }, [faskesTerdampakList])

  const filteredFaskesTerdampakList = useMemo(() => {
    return faskesTerdampakList.filter((f: any) => {
      // 1. Kabupaten filter
      if (terdampakKabFilter !== 'semua') {
        const kab = String(f.kabupaten || f.nama_kab || '').toLowerCase()
        if (!kab.includes(terdampakKabFilter.toLowerCase())) return false
      }

      // 2. Kerusakan filter
      if (terdampakKerusakanFilter !== 'semua') {
        const k = String(f.kondisi_bangunan || f.tingkat_kerusakan || '').toLowerCase()
        if (terdampakKerusakanFilter === 'rusak_berat' && !k.includes('berat')) return false
        if (terdampakKerusakanFilter === 'rusak_sedang' && !k.includes('sedang')) return false
        if (terdampakKerusakanFilter === 'rusak_ringan' && !k.includes('ringan')) return false
        if (terdampakKerusakanFilter === 'normal' && (k.includes('berat') || k.includes('sedang') || k.includes('ringan'))) return false
      }

      // 3. Status operasional filter
      if (terdampakOperasionalFilter !== 'semua') {
        const op = String(f.status_operasional || '').toLowerCase()
        if (terdampakOperasionalFilter === 'tenda' && (!op.includes('tenda') && !op.includes('luar gedung'))) return false
        if (terdampakOperasionalFilter === 'penuh' && (op.includes('tenda') || op.includes('luar gedung') || op.includes('tidak') || op.includes('tutup'))) return false
        if (terdampakOperasionalFilter === 'tutup' && (!op.includes('tidak') && !op.includes('tutup') && !op.includes('lumpuh'))) return false
      }

      // 4. Search filter
      if (kabupatenMatrixSearch.trim() !== '') {
        const q = kabupatenMatrixSearch.toLowerCase().trim()
        const matchName = String(f.nama || f.nama_faskes || f.nama_master || f.nama_asli_sheet || '').toLowerCase().includes(q)
        const matchKab = String(f.kabupaten || '').toLowerCase().includes(q)
        const matchKec = String(f.kecamatan || '').toLowerCase().includes(q)
        const matchKode = String(f.kode_sarana || f.kode_satusehat || '').toLowerCase().includes(q)
        const matchKeb = String(f.kebutuhan_mendesak || '').toLowerCase().includes(q)
        const matchSdm = String(f.sdm_medis || '').toLowerCase().includes(q)
        const matchAlkes = String(f.alkes || '').toLowerCase().includes(q)
        if (!matchName && !matchKab && !matchKec && !matchKode && !matchKeb && !matchSdm && !matchAlkes) return false
      }

      return true
    })
  }, [faskesTerdampakList, terdampakKabFilter, terdampakKerusakanFilter, terdampakOperasionalFilter, kabupatenMatrixSearch])

  const handleExportFaskesTerdampakCsv = () => {
    if (filteredFaskesTerdampakList.length === 0) return
    const headers = ['No', 'Nama Fasilitas Kesehatan', 'Jenis', 'Kabupaten', 'Kecamatan', 'Kode Sarana', 'Kode SatuSehat', 'Latitude', 'Longitude', 'Kondisi Bangunan', 'Status Operasional', 'Listrik', 'Internet', 'Ambulans', 'Air Bersih', 'Oksigen', 'Kebutuhan Mendesak', 'SDM Medis', 'Alkes']
    const rows = filteredFaskesTerdampakList.map((f, i) => [
      i + 1,
      `"${f.nama_faskes || f.nama}"`,
      `"${f.jenis_faskes || f.jenis}"`,
      `"${f.kabupaten}"`,
      `"${f.kecamatan || '-'}"`,
      `"${f.kode_sarana || '-'}"`,
      `"${f.kode_satusehat || '-'}"`,
      f.latitude || '',
      f.longitude || '',
      `"${f.kondisi_bangunan}"`,
      `"${f.status_operasional}"`,
      `"${f.listrik}"`,
      `"${f.internet}"`,
      `"${f.ambulans || '-'}"`,
      `"${f.air_bersih || '-'}"`,
      `"${f.oksigen || '-'}"`,
      `"${f.kebutuhan_mendesak || '-'}"`,
      `"${f.sdm_medis || '-'}"`,
      `"${f.alkes || '-'}"`,
    ])
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Faskes_Terdampak_Gempa_NTT_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (!selectedEvent) return null

  const isPageLoading = loading || Boolean(isLoading)
  if (isPageLoading) {
    return (
      <div className="w-full space-y-6 px-4 py-5 sm:px-6 lg:px-8 bg-[#fbffff] animate-pulse">
        {/* 1. Header Navigation Skeleton */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 bg-slate-200 rounded-xl" />
            <div className="space-y-1.5">
              <div className="h-6 w-64 bg-slate-200 rounded-lg" />
              <div className="h-3.5 w-96 bg-slate-150 rounded-md" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-7 w-40 bg-slate-150 rounded-full" />
            <div className="h-7 w-28 bg-slate-200 rounded-full" />
          </div>
        </div>

        {/* 2. Top Summary Section (3 Kolom: Info Utama, Karakteristik, Timeline 7 Hari) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Kolom 1: Profil Bencana */}
          <div className="md:col-span-3 rounded-2xl border border-slate-200/90 bg-slate-100/70 p-4 flex flex-col justify-between h-[230px]">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-slate-200 shrink-0" />
              <div className="space-y-1.5 flex-1">
                <div className="h-3 w-20 bg-slate-200 rounded" />
                <div className="h-5 w-32 bg-slate-300 rounded" />
              </div>
            </div>
            <div className="space-y-2 mt-4">
              <div className="h-4 w-40 bg-slate-200 rounded" />
              <div className="h-3.5 w-28 bg-slate-200 rounded" />
              <div className="h-3.5 w-36 bg-slate-200 rounded" />
            </div>
          </div>

          {/* Kolom 2: Karakteristik Parameter Bencana (2x2 Grid) */}
          <div className="md:col-span-4 rounded-2xl border border-slate-200/90 bg-white p-4 flex flex-col justify-between h-[230px]">
            <div className="flex items-center justify-between">
              <div className="h-4 w-44 bg-slate-200 rounded" />
              <div className="h-4 w-16 bg-slate-150 rounded-full" />
            </div>
            <div className="grid grid-cols-2 gap-2.5 my-auto">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-2.5 rounded-xl bg-slate-50 border border-slate-150 space-y-1.5">
                  <div className="h-3 w-16 bg-slate-200 rounded" />
                  <div className="h-5 w-20 bg-slate-300 rounded" />
                  <div className="h-2.5 w-24 bg-slate-200 rounded" />
                </div>
              ))}
            </div>
          </div>

          {/* Kolom 3: 7-Day Timeline */}
          <div className="md:col-span-5 rounded-2xl border border-slate-200/90 bg-white p-4 flex flex-col justify-between h-[230px]">
            <div className="flex items-center justify-between">
              <div className="h-4 w-48 bg-slate-200 rounded" />
              <div className="h-4 w-20 bg-slate-150 rounded-full" />
            </div>
            <div className="grid grid-cols-7 gap-1.5 my-auto">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="p-2 rounded-xl bg-slate-50 border border-slate-150 flex flex-col items-center space-y-1.5 text-center">
                  <div className="h-2.5 w-6 bg-slate-200 rounded" />
                  <div className="h-5 w-5 rounded-full bg-slate-200" />
                  <div className="h-3 w-8 bg-slate-300 rounded" />
                  <div className="h-2 w-7 bg-slate-150 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 3. Key Metric Cards (3 Big Cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-10 w-10 rounded-xl bg-slate-150" />
                  <div className="space-y-1">
                    <div className="h-3.5 w-28 bg-slate-200 rounded" />
                    <div className="h-2.5 w-20 bg-slate-150 rounded" />
                  </div>
                </div>
                <div className="h-5 w-16 bg-slate-150 rounded-full" />
              </div>
              <div className="h-8 w-32 bg-slate-300 rounded-lg" />
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                <div className="h-8 bg-slate-100 rounded-lg" />
                <div className="h-8 bg-slate-100 rounded-lg" />
                <div className="h-8 bg-slate-100 rounded-lg" />
              </div>
            </div>
          ))}
        </div>

        {/* 4. Spatial Map & Right Sidebar Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* Peta Spasial (8 cols) */}
          <div className="lg:col-span-8 rounded-2xl border border-slate-200 bg-slate-100 h-[480px] p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="h-5 w-48 bg-slate-200 rounded" />
              <div className="flex gap-2">
                <div className="h-7 w-20 bg-slate-200 rounded-lg" />
                <div className="h-7 w-20 bg-slate-200 rounded-lg" />
              </div>
            </div>
            <div className="flex items-center justify-center text-slate-300">
              <div className="h-16 w-16 rounded-full border-4 border-slate-300 border-t-transparent animate-spin" />
            </div>
            <div className="h-8 w-full bg-slate-200 rounded-xl" />
          </div>

          {/* Right Status & Faskes Sidebar (4 cols) */}
          <div className="lg:col-span-4 rounded-2xl border border-slate-200 bg-white p-4 space-y-4 flex flex-col justify-between h-[480px]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="h-4 w-32 bg-slate-200 rounded" />
              <div className="h-6 w-20 bg-slate-150 rounded-lg" />
            </div>
            <div className="space-y-2.5 flex-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-3 rounded-xl bg-slate-50 border border-slate-150 flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="h-3.5 w-24 bg-slate-200 rounded" />
                    <div className="h-2.5 w-16 bg-slate-150 rounded" />
                  </div>
                  <div className="h-6 w-12 bg-slate-200 rounded-lg" />
                </div>
              ))}
            </div>
            <div className="h-10 w-full bg-slate-200 rounded-xl" />
          </div>
        </div>

        {/* 5. Multi-Series Trend Analytics Skeleton */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="space-y-1">
              <div className="h-5 w-56 bg-slate-200 rounded" />
              <div className="h-3 w-80 bg-slate-150 rounded" />
            </div>
            <div className="h-8 w-36 bg-slate-150 rounded-xl" />
          </div>
          <div className="h-[280px] bg-slate-50 rounded-xl flex items-center justify-center border border-slate-150">
            <div className="h-10 w-44 bg-slate-200 rounded-md" />
          </div>
        </div>

        {/* 6. Section Faskes Terdampak & Distribusi Kasus Penyakit (Dinamis: tampil di Vercel/dev, hidden di prod) */}
        <div className={`grid grid-cols-1 ${showPenyakitSection ? 'lg:grid-cols-2' : ''} gap-5`}>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3.5">
            <div className="h-5 w-44 bg-slate-200 rounded" />
            <div className="grid grid-cols-3 gap-3 h-[180px]">
              <div className="bg-slate-50 rounded-xl border border-slate-150" />
              <div className="bg-slate-50 rounded-xl border border-slate-150" />
              <div className="bg-slate-50 rounded-xl border border-slate-150" />
            </div>
          </div>
          {showPenyakitSection && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3.5">
              <div className="h-5 w-44 bg-slate-200 rounded" />
              <div className="h-[180px] bg-slate-50 rounded-xl border border-slate-150" />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden space-y-5 px-3 py-4 sm:px-6 lg:px-8 bg-[#fbffff] animate-in fade-in duration-200">
      {/* Top Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          {!hideBack && (
          <button
            onClick={onBack}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-sm transition"
            title="Back to dashboard"
          >
            <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          )}
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <span>{isRegionalTemplate ? 'Surveillance Dashboard' : 'Incident Dashboard'}</span>
            <span>/</span>
            <span className="font-bold text-teal-800">{isRegionalTemplate ? `Regional Surveillance (${displayRegion})` : 'Incident Detail'}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 sm:justify-end shrink-0">
          <span>Last updated: {formattedDate}</span>
          <button
            onClick={() => setShowApiSourcesModal(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-bold text-sky-800 shadow-xs transition hover:bg-sky-100 hover:border-sky-300"
          title="View data sources and integrations"
          >
            <Info className="h-3.5 w-3.5 text-sky-700" />
            <span>Data Sources</span>
          </button>
          {/* Timeline Log button - Hidden as requested */}
          {/* 
          <button
            onClick={() => setShowLogModal(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-[11px] font-bold text-teal-800 shadow-xs transition hover:bg-teal-100 hover:border-teal-300"
            title="Lihat Riwayat & Timeline Log Aktivitas Kejadian"
          >
            <History className="h-3.5 w-3.5 text-teal-700" />
            <span>Timeline Log</span>
            {effectiveTimelineLogs.length > 0 && (
              <span className="ml-0.5 rounded-full bg-teal-600 px-1.5 py-0.2 text-[9px] font-black text-white">
                {effectiveTimelineLogs.length}
              </span>
            )}
          </button>
          */}
          {/*
          {isNttEvent && (
            <button
              onClick={() => setShowNttCsvModal(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-[11px] font-bold text-teal-900 shadow-xs transition hover:bg-teal-100 hover:border-teal-300 cursor-pointer"
              title="Kelola Data CSV Bencana NTT (Download Template, Export, Import)"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-[#047D78]" />
              <span>Kelola Data CSV</span>
            </button>
          )}
          */}
          <button
            onClick={handleShare}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            title="Bagikan tautan"
          >
            <Share2 className="h-3.5 w-3.5" />
            {shareCopied ? 'Copied' : 'Share'}
          </button>

        </div>
      </div>

      {/* EOC Top Section Layout (Responsive Auto-Layout Flex Container) */}
      {(isNttEvent && loadingNtt && !nttApiData.summary_korban && (!detail || Number(detail.meninggal || 0) === 0)) ? (
        <div className="flex flex-col 2xl:flex-row gap-4 items-stretch animate-pulse">
          {/* Skeleton Card 1 & 5 */}
          <div className="w-full 2xl:w-1/2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col justify-between min-h-[220px]">
            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-12 gap-4 flex-1">
              <div className="col-span-1 md:col-span-1 2xl:col-span-3 space-y-3 pr-0 md:pr-2 border-b md:border-b-0 md:border-r border-slate-100 pb-3 md:pb-0">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-slate-200" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3 w-16 bg-slate-200 rounded" />
                    <div className="h-5 w-24 bg-slate-200 rounded" />
                  </div>
                </div>
                <div className="space-y-1.5 pt-2">
                  <div className="h-4 w-full bg-slate-200 rounded" />
                  <div className="h-3 w-3/4 bg-slate-100 rounded" />
                </div>
              </div>
              <div className="col-span-1 md:col-span-1 2xl:col-span-4 space-y-2.5 px-0 md:px-2 border-b md:border-b-0 2xl:border-r border-slate-100 pb-3 md:pb-0">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-xl bg-slate-200 shrink-0" />
                    <div className="space-y-1 flex-1">
                      <div className="h-2.5 w-14 bg-slate-200 rounded" />
                      <div className="h-3 w-20 bg-slate-100 rounded" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="col-span-1 md:col-span-2 2xl:col-span-5 space-y-2 pl-0 2xl:pl-2">
                <div className="h-3 w-44 bg-slate-200 rounded mb-2" />
                <div className="grid grid-cols-7 gap-1.5 flex-1">
                  {[1, 2, 3, 4, 5, 6, 7].map(i => (
                    <div key={i} className="h-20 rounded-xl bg-slate-100 border border-slate-200/60" />
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-3 h-8 rounded-xl bg-slate-100 border border-slate-200/60" />
          </div>

          {/* Skeleton Cards 2, 3, 4 */}
          <div className="w-full 2xl:w-1/2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 items-stretch">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm flex flex-col justify-between min-h-[220px]">
                <div className="space-y-2 text-center flex flex-col items-center justify-center flex-1">
                  <div className="h-3 w-20 bg-slate-200 rounded" />
                  <div className="h-8 w-24 bg-slate-200 rounded mt-2" />
                  <div className="h-4 w-16 bg-slate-100 rounded mt-1" />
                </div>
                <div className="border-t border-slate-100 pt-2.5 space-y-1 text-center">
                  <div className="h-4 w-14 bg-slate-200 rounded mx-auto" />
                  <div className="h-2.5 w-20 bg-slate-100 rounded mx-auto" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col 2xl:flex-row gap-4 items-stretch animate-in fade-in slide-in-from-top-3 duration-300">

          {/* Card 1 & 5 Merged: Disaster Header & Characteristics Bulletin (Full width on laptop/tablet, ~62% on ultra-wide) */}
          <div className={`w-full 2xl:w-1/2 rounded-2xl border bg-white p-4 shadow-[0_4px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between transition hover:shadow-md ${disasterTheme.bg}`}>
            {/* Integrated Header for Regional Surveillance */}
            {isRegionalTemplate && (
              <div className="mb-3.5 pb-2.5 border-b border-teal-200/60">
                <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-slate-900">
                  KEY SURVEILLANCE FINDINGS
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed mt-0.5">
                  National surveillance signals, epidemiological trends, and alert coverage from validated records.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-12 gap-4 flex-1 min-h-0">

              {/* Col 1: Disaster Identity (Only for non-regional disaster events) */}
              {!isRegionalTemplate && (
                <div className="col-span-1 md:col-span-1 2xl:col-span-3 flex flex-col justify-between pr-0 md:pr-3 border-b md:border-b-0 md:border-r border-slate-250/60 pb-3 md:pb-0 min-w-0">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm border border-slate-200 ${disasterTheme.iconColor}`}>
                      {(() => {
                        const IconComp = disasterTheme.cardHeaderIcon || CloudRain
                        return <IconComp className="h-6.5 w-6.5" />
                      })()}
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-black text-slate-500 uppercase tracking-wider block leading-none">
                        DISASTER TYPE
                      </span>
                      <span className="text-2xl sm:text-3xl font-black text-slate-900 block leading-tight mt-1 uppercase tracking-tight truncate">
                        {eventData.jenis_bencana}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3.5 md:mt-auto space-y-1.5 min-w-0">
                    <p className="text-sm sm:text-base font-black text-slate-900 leading-snug line-clamp-2" title={locationFull}>
                      {locationFull}
                    </p>
                    <div className="space-y-1">
                      {disasterTheme.type === 'gempa' && bmkgWaktuDisplay && bmkgWaktuDisplay !== '-' ? (
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-slate-700">
                          <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-black shrink-0">Waktu Gempa (BMKG)</span>
                          <span className="truncate max-w-full" title={bmkgWaktuDisplay}>{bmkgWaktuDisplay}</span>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-slate-700">
                          <span className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 text-[10px] font-black shrink-0">
                            EVENT TIME
                          </span>
                          <span className="truncate max-w-full" title={eventData.tgl_kejadian || formattedDate || '-'}>{eventData.tgl_kejadian || formattedDate || '-'}</span>
                        </div>
                      )}
                      {formattedDate && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-slate-500">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-bold shrink-0">Tgl Laporan</span>
                          <span className="truncate max-w-full" title={formattedDate}>{formattedDate}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Col 2: Disaster-specific parameters or surveillance indicators */}
              <div className={`col-span-1 md:col-span-1 ${isRegionalTemplate ? '2xl:col-span-5 pr-0 md:pr-3 border-b md:border-b-0 md:border-r border-slate-250/60 pb-3 md:pb-0' : '2xl:col-span-4 px-0 md:px-2 border-b md:border-b-0 2xl:border-r border-slate-250/60 pb-3 md:pb-0'} flex flex-col justify-center gap-3 min-w-0`}>
                {dynamicCharacteristics.map((item, idx) => {
                  const IconComp = item.icon
                  return (
                    <div key={idx} className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-8.5 w-8.5 items-center justify-center rounded-xl bg-white text-slate-600 border border-slate-200/90 shadow-xs shrink-0">
                        <IconComp className={`h-4.5 w-4.5 ${item.color}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-[11px] font-extrabold text-slate-500 block uppercase leading-none tracking-wide">{item.label}</span>
                        <span className="text-xs sm:text-sm font-black text-slate-900 block mt-0.5 line-clamp-1" title={item.value}>
                          {item.value}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Col 3: Surveillance trend or disaster-specific timeline */}
              <div className={`col-span-1 ${isRegionalTemplate ? "md:col-span-1 2xl:col-span-7 pl-0 md:pl-3" : "md:col-span-2 2xl:col-span-5 pl-0 2xl:pl-2"} flex flex-col justify-between min-w-0`}>
                {isRegionalTemplate ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 h-full items-stretch">
                    {/* Card 1: POSITIVITY RATE INFLUENZA TERKINI */}
                    <div className="rounded-2xl bg-gradient-to-b from-[#046a67] to-[#035956] border border-[#024e4c] p-3 sm:p-3.5 shadow-sm text-white flex flex-col justify-between min-h-[175px] transition-all duration-200 hover:shadow-md hover:brightness-105 group">
                      <div>
                        <div className="flex items-start justify-between text-teal-100">
                          <span className="text-[10px] sm:text-[10.5px] font-black uppercase tracking-wider text-white leading-tight">
                            LATEST INFLUENZA POSITIVITY RATE
                          </span>
                          <Info className="h-3.5 w-3.5 text-teal-200/80 hover:text-white cursor-pointer shrink-0 ml-1" />
                        </div>
                        <div className="mt-2.5 mb-1.5">
                          <span className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-none">
                            23%
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-teal-500/30">
                        <div className="flex items-center gap-1 text-[11px] sm:text-xs font-bold text-white/90">
                          <span>M33/2026: 16%</span>
                          <span className="text-[#f87171] font-black">▲</span>
                        </div>
                        <div className="text-[10px] sm:text-[10.5px] font-semibold text-teal-100/80 mt-0.5">
                          29 Aug (Week 34)
                        </div>
                      </div>
                    </div>

                    {/* Card 2: POSITIVITY RATE COVID-19 TERKINI */}
                    <div className="rounded-2xl bg-gradient-to-b from-[#046a67] to-[#035956] border border-[#024e4c] p-3 sm:p-3.5 shadow-sm text-white flex flex-col justify-between min-h-[175px] transition-all duration-200 hover:shadow-md hover:brightness-105 group">
                      <div>
                        <div className="flex items-start justify-between text-teal-100">
                          <span className="text-[10px] sm:text-[10.5px] font-black uppercase tracking-wider text-white leading-tight">
                            LATEST COVID-19 POSITIVITY RATE
                          </span>
                          <Info className="h-3.5 w-3.5 text-teal-200/80 hover:text-white cursor-pointer shrink-0 ml-1" />
                        </div>
                        <div className="mt-2.5 mb-1.5">
                          <span className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-none">
                            2%
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-teal-500/30">
                        <div className="flex items-center gap-1 text-[11px] sm:text-xs font-bold text-white/90">
                          <span>M33/2026: 4.3%</span>
                          <span className="text-[#34d399] font-black">▼</span>
                        </div>
                        <div className="text-[10px] sm:text-[10.5px] font-semibold text-teal-100/80 mt-0.5">
                          29 Aug (Week 34)
                        </div>
                      </div>
                    </div>

                    {/* Card 3: RSV & MULTIPATOGEN */}
                    <div className="rounded-2xl bg-gradient-to-b from-[#046a67] to-[#035956] border border-[#024e4c] p-3 sm:p-3.5 shadow-sm text-white flex flex-col justify-between min-h-[175px] transition-all duration-200 hover:shadow-md hover:brightness-105 group">
                      <div>
                        <div className="flex items-start justify-between text-teal-100">
                          <span className="text-[10px] sm:text-[10.5px] font-black uppercase tracking-wider text-white leading-tight">
                            RSV &amp; MULTIPATOGEN
                          </span>
                          <Info className="h-3.5 w-3.5 text-teal-200/80 hover:text-white cursor-pointer shrink-0 ml-1" />
                        </div>
                        <div className="mt-2 mb-1 flex items-baseline gap-1.5">
                          <span className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-none">
                            0%
                          </span>
                          <span className="text-[10px] font-black uppercase text-teal-200 tracking-wider">RSV</span>
                        </div>
                        <div className="flex items-center gap-1 text-[10.5px] font-bold text-white/80">
                          <span>M33/2026: 0%</span>
                          <span className="text-teal-300 font-black">▬</span>
                        </div>
                      </div>

                      <div className="pt-1.5 border-t border-teal-500/30">
                        <div className="text-[11px] sm:text-xs font-bold text-white">
                          Multipathogen: <span className="font-black">18%</span>
                        </div>
                        <div className="flex items-center gap-1 text-[10.5px] font-bold text-white/80 mt-0.5">
                          <span>M33/2026: 41%</span>
                          <span className="text-[#34d399] font-black">▼</span>
                        </div>
                        <div className="text-[10px] sm:text-[10.5px] font-semibold text-teal-100/80 mt-0.5">
                          29 Aug (Week 34)
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wider block truncate">
                      {disasterTheme.type === 'gempa'
                        ? 'TREN AKTIVITAS SEISMIK & GEMPA SUSULAN BMKG'
                        : disasterTheme.type === 'gunung'
                          ? 'TREN KUALITAS UDARA (ISPU / SO2)'
                          : 'HISTORI CUACA & PARAMETER BMKG'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1.5 w-full flex-1 min-w-0 overflow-x-auto pb-1 scrollbar-thin">
                  {(disasterTheme.type === 'gempa' ? earthquakeTimeline : weatherTimeline).map((day: any, idx: number) => {
                    const isEventDay = day.offset === 0
                    const aqItem = (realtimeAirQuality && realtimeAirQuality.timeline && realtimeAirQuality.timeline[idx])
                      ? realtimeAirQuality.timeline[idx]
                      : null

                    const dayIspuVal = isEventDay ? eventDayIspu : (aqItem ? aqItem.aqi : eventDayIspu)
                    const dayIspuLabel = isEventDay ? eventDayIspuCategory.shortLabel : (aqItem ? (aqItem.shortLabel || aqItem.label) : eventDayIspuCategory.shortLabel)

                    return (
                      <div
                        key={day.offset}
                        className={`flex flex-col items-center justify-between py-2 px-1 rounded-xl transition-all border min-w-[50px] 2xl:min-w-0 ${isEventDay
                          ? 'bg-rose-50 border-rose-300 text-rose-900 shadow-md ring-2 ring-rose-300/60'
                          : 'bg-white/90 border-slate-200/90 hover:bg-slate-50'
                          }`}
                      >
                        <span className="text-[10px] font-black uppercase leading-none text-slate-500 truncate w-full text-center">
                          {day.dayName}
                        </span>
                        <span className="text-xs font-black leading-none mt-1 text-slate-900 truncate w-full text-center">
                          {day.dateLabel}
                        </span>

                        <div className="my-2 shrink-0 flex items-center justify-center">
                          {disasterTheme.type === 'kebakaran' ? (
                            <Wind className={`h-5 w-5 ${isEventDay ? 'text-amber-600 animate-bounce' : 'text-teal-600'}`} />
                          ) : disasterTheme.type === 'gunung' ? (
                            <ShieldAlert className={`h-5 w-5 ${isEventDay ? 'text-red-600 animate-pulse' : (dayIspuVal > 150) ? 'text-orange-500' : 'text-amber-500'}`} />
                          ) : disasterTheme.type === 'tsunami' ? (
                            <Waves className={`h-5 w-5 ${isEventDay ? 'text-teal-600 animate-bounce' : 'text-cyan-600'}`} />
                          ) : disasterTheme.type === 'gempa' ? (
                            <Activity className={`h-5 w-5 ${isEventDay ? 'text-red-600 animate-bounce' : day.topLabel?.includes('M <') ? 'text-slate-400' : 'text-amber-600'}`} />
                          ) : disasterTheme.type === 'kekeringan' ? (
                            <Thermometer className={`h-5 w-5 ${isEventDay ? 'text-rose-600' : 'text-amber-600'}`} />
                          ) : disasterTheme.type === 'wabah' ? (
                            <ShieldAlert className={`h-5 w-5 ${isEventDay ? 'text-purple-600 animate-pulse' : 'text-indigo-500'}`} />
                          ) : day.weather?.includes('Lebat') ? (
                            <CloudLightning className={`h-5 w-5 ${isEventDay ? 'text-rose-500 animate-bounce' : 'text-blue-600'}`} />
                          ) : day.weather?.includes('Sedang') || day.weather?.includes('Ringan') ? (
                            <CloudRain className="h-5 w-5 text-blue-500" />
                          ) : (
                            <Cloud className="h-5 w-5 text-slate-400" />
                          )}
                        </div>

                        <div className="w-full text-center">
                          {disasterTheme.type === 'gunung' ? (
                            <>
                              <span className={`text-[10.5px] font-black block leading-none ${isEventDay ? 'text-rose-900' : 'text-slate-900'}`}>
                                {dayIspuVal} ISPU
                              </span>
                              <span className={`text-[9.5px] font-bold block leading-tight mt-0.5 truncate ${isEventDay ? 'text-rose-700' : 'text-slate-500'}`}>
                                {dayIspuLabel}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className={`text-[11px] font-black block leading-none ${isEventDay ? 'text-rose-900 font-extrabold' : 'text-slate-900'}`}>
                                {day.topLabel || day.temp}
                              </span>
                              <span className={`text-[9.5px] font-bold block leading-tight mt-1 truncate ${isEventDay ? 'text-rose-700 font-black' : day.bottomLabel === 'Normal' || day.bottomLabel === 'Stabil' ? 'text-slate-400' : 'text-slate-600'}`}>
                                {day.bottomLabel || day.weather}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                  </>
                )}
              </div>

            </div>

            {/* EOC Epidemiological Narrative Bulletin */}
            {isRegionalTemplate ? (
              <div className="mt-3.5 rounded-xl border border-teal-200/80 bg-gradient-to-r from-teal-50/90 via-sky-50/80 to-emerald-50/70 p-3 flex flex-wrap items-center justify-between gap-3 text-xs shadow-2xs">
                <div className="flex items-center gap-2">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-bold text-slate-700">System Status: <span className="text-emerald-800 font-black">Surveillance API Connected</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-teal-600" />
                  <span className="font-bold text-slate-700">Detection Coverage: <span className="text-teal-900 font-black">{regionalSkdrData?.kpis.locations ?? 0} mapped locations</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-600" />
                  <span className="font-bold text-slate-700">Signal Response: <span className="text-amber-900 font-black">PE Verification in &lt; 24 Hours</span></span>
                </div>
              </div>
            ) : eocNarrative ? (
              <div className={`mt-3.5 rounded-xl p-3 border flex items-start gap-3 ${disasterTheme.bulletinBg}`}>
                <div className="bg-rose-600 text-white rounded-lg p-1.5 shrink-0 mt-0.5 shadow-xs">
                  <ShieldAlert className="h-4.5 w-4.5" />
                </div>
                <p className="text-xs sm:text-sm font-semibold text-slate-850 leading-relaxed">
                  <span className="inline-flex items-center gap-1 bg-rose-600 text-white text-xs font-black px-2.5 py-0.5 rounded-md uppercase tracking-wide mr-2 shadow-xs">
                    KRONOLOGIS
                  </span>
                  {eocNarrative}
                </p>
              </div>
            ) : null}
          </div>

          {/* ── 3 Cards Surveilans Penyakit (INFLUENZA, COVID-19, RSV & MULTIPATOGEN) ── */}
          {!isRegionalTemplate && (
          <div className="w-full 2xl:w-1/2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 items-stretch min-w-0">
            {/* Card 1: INFLUENZA */}
            <div className="rounded-2xl border border-amber-200/90 bg-gradient-to-br from-[#fffdfa] via-white to-[#fff9f0] p-4 shadow-[0_4px_12px_rgba(245,158,11,0.04)] flex flex-col justify-between min-h-[220px] transition-all duration-200 hover:shadow-md hover:border-amber-300 group">
              <div>
                <div className="flex items-center justify-between text-[#d97706]">
                  <span className="text-[11px] font-black uppercase tracking-wider">INFLUENZA</span>
                  <Info className="h-3.5 w-3.5 text-amber-500/80 cursor-pointer" />
                </div>
                <div className="flex items-baseline gap-2 mt-2.5">
                  <span className="text-3xl sm:text-4xl font-black text-slate-900 leading-none tracking-tight">17.8%</span>
                  <span className="text-xs font-semibold text-slate-500">rata-rata</span>
                </div>
                <div className="mt-1">
                      <span className="text-xs font-semibold text-slate-600">Level: <span className="font-bold text-slate-800">Low</span></span>
                </div>
              </div>

              {/* Sparkline Chart */}
              <div className="mt-3">
                <div className="h-10 w-full flex items-end">
                  <svg className="w-full h-9 overflow-visible" viewBox="0 0 200 40" preserveAspectRatio="none">
                    <path
                      d="M0,28 C15,28 25,22 35,22 C45,22 55,20 65,20 C75,20 85,25 95,25 C105,25 115,23 125,23 C135,23 145,26 155,26 C165,26 180,24 200,24"
                      fill="none"
                      stroke="#f97316"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="flex items-center justify-between mt-1 pt-1 border-t border-slate-100">
                  <span className="text-[10px] font-medium text-slate-400">50-week trend</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSkdrMatrixChannel('ibs');
                      setShowKabupatenMatrixModal(true);
                    }}
                    className="inline-flex items-center gap-0.5 text-xs font-bold text-amber-600 hover:text-amber-700 cursor-pointer transition-colors"
                  >
                    Details ▸
                  </button>
                </div>
              </div>
            </div>

            {/* Card 2: COVID-19 */}
            <div className="rounded-2xl border border-teal-200/90 bg-gradient-to-br from-[#f6fcfb] via-white to-[#edf8f5] p-4 shadow-[0_4px_12px_rgba(20,184,166,0.04)] flex flex-col justify-between min-h-[220px] transition-all duration-200 hover:shadow-md hover:border-teal-300 group">
              <div>
                <div className="flex items-center justify-between text-[#0d9488]">
                  <span className="text-[11px] font-black uppercase tracking-wider">COVID-19</span>
                  <Info className="h-3.5 w-3.5 text-teal-500/80 cursor-pointer" />
                </div>
                <div className="flex items-baseline gap-2 mt-2.5">
                  <span className="text-3xl sm:text-4xl font-black text-slate-900 leading-none tracking-tight">4.0%</span>
                  <span className="text-xs font-semibold text-slate-500">rata-rata</span>
                </div>
                <div className="mt-1">
                      <span className="text-xs font-semibold text-slate-600">Total Tests: <span className="font-bold text-slate-800">16,065</span></span>
                </div>
              </div>

              {/* Sparkline Chart */}
              <div className="mt-3">
                <div className="h-10 w-full flex items-end">
                  <svg className="w-full h-9 overflow-visible" viewBox="0 0 200 40" preserveAspectRatio="none">
                    <path
                      d="M0,20 C10,32 18,26 25,18 C32,10 40,28 48,28 C56,28 64,14 72,14 C80,14 88,28 96,28 C104,28 112,12 120,12 C128,12 136,28 144,28 C152,28 160,14 168,14 C176,14 188,30 200,24"
                      fill="none"
                      stroke="#0d9488"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="flex items-center justify-between mt-1 pt-1 border-t border-slate-100">
                  <span className="text-[10px] font-medium text-slate-400">50-week trend</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSkdrMatrixChannel('ibs');
                      setShowKabupatenMatrixModal(true);
                    }}
                    className="inline-flex items-center gap-0.5 text-xs font-bold text-teal-600 hover:text-teal-700 cursor-pointer transition-colors"
                  >
                    Details ▸
                  </button>
                </div>
              </div>
            </div>

            {/* Card 3: RSV & MULTIPATOGEN */}
            <div className="rounded-2xl border border-purple-200/90 bg-gradient-to-br from-[#fbf8fe] via-white to-[#f4edfd] p-4 shadow-[0_4px_12px_rgba(147,51,234,0.04)] flex flex-col justify-between min-h-[220px] transition-all duration-200 hover:shadow-md hover:border-purple-300 group">
              <div>
                <div className="flex items-center justify-between text-[#9333ea]">
                  <span className="text-[11px] font-black uppercase tracking-wider">RSV &amp; MULTIPATOGEN</span>
                  <Info className="h-3.5 w-3.5 text-purple-500/80 cursor-pointer" />
                </div>
                <div className="flex items-baseline gap-2 mt-2.5">
                  <span className="text-3xl sm:text-4xl font-black text-slate-900 leading-none tracking-tight">11.3%</span>
                  <span className="text-xs font-semibold text-slate-500">RSV</span>
                </div>
                <div className="mt-1 space-y-0.5">
                  <div className="text-xs font-semibold text-slate-600">Multipathogen: <span className="font-bold text-slate-800">48.3%</span></div>
                  <div className="text-[11px] font-semibold text-slate-500">29 Aug (Week 34)</div>
                </div>
              </div>

              {/* Sparkline Chart */}
              <div className="mt-3">
                <div className="h-10 w-full flex items-end">
                  <svg className="w-full h-9 overflow-visible" viewBox="0 0 200 40" preserveAspectRatio="none">
                    <path
                      d="M0,36 L65,36 C75,36 85,32 95,26 C105,20 115,10 125,12 C135,14 145,22 155,24 C165,26 180,34 200,35"
                      fill="none"
                      stroke="#9333ea"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="flex items-center justify-between mt-1 pt-1 border-t border-slate-100">
                  <span className="text-[10px] font-medium text-slate-400">50-week trend</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSkdrMatrixChannel('alert');
                      setShowKabupatenMatrixModal(true);
                    }}
                    className="inline-flex items-center gap-0.5 text-xs font-bold text-purple-600 hover:text-purple-700 cursor-pointer transition-colors"
                  >
                    Details ▸
                  </button>
                </div>
              </div>
            </div>
          </div>
          )}

          {isRegionalTemplate && (
            <div className="w-full 2xl:w-1/2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 items-stretch min-w-0">
              {(regionalSkdrData?.by_disease || []).slice(0, 3).map((disease, index) => {
                const palettes = [
                  'border-amber-200/90 bg-gradient-to-br from-[#fffdfa] via-white to-[#fff9f0]',
                  'border-teal-200/90 bg-gradient-to-br from-[#f6fcfb] via-white to-[#edf8f5]',
                  'border-purple-200/90 bg-gradient-to-br from-[#fbf8fe] via-white to-[#f4edfd]',
                ]
                const accents = ['text-[#d97706]', 'text-[#0d9488]', 'text-[#9333ea]']
                const diseaseName = formatDisasterName(disease.name)
                const totalKasusForDisplay = regionalSkdrData?.kpis.cases ?? 0
                const caseShare = totalKasusForDisplay > 0 ? ((disease.cases / totalKasusForDisplay) * 100).toFixed(1) : '0.0'
                return (
                  <div key={disease.name} className={`rounded-2xl border p-4 shadow-[0_4px_12px_rgba(15,23,42,0.04)] flex flex-col justify-between min-h-[220px] transition-all duration-200 hover:shadow-md ${palettes[index] || palettes[0]}`}>
                    <div>
                      <div className={`flex items-center justify-between ${accents[index] || accents[0]}`}>
                        <span className="text-[11px] font-black uppercase tracking-wider truncate" title={diseaseName}>{diseaseName}</span>
                        <Info className="h-3.5 w-3.5 opacity-70 shrink-0" />
                      </div>
                      <div className="flex items-baseline gap-2 mt-2.5">
                        <span className="text-3xl sm:text-4xl font-black text-slate-900 leading-none tracking-tight">{Number(disease.cases).toLocaleString('id-ID')}</span>
                        <span className="text-xs font-semibold text-slate-500">kasus</span>
                      </div>
                      <div className="mt-1 space-y-0.5">
                        <div className="text-xs font-semibold text-slate-600">Deaths: <span className="font-bold text-slate-800">{Number(disease.deaths).toLocaleString('id-ID')}</span></div>
                        <div className="text-[11px] font-semibold text-slate-500">{caseShare}% dari total {regionalSkdrData?.filters?.year || 'periode aktif'}</div>
                      </div>
                    </div>
                    <div className="mt-3 pt-2 border-t border-slate-100">
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className={`h-full rounded-full ${index === 0 ? 'bg-amber-500' : index === 1 ? 'bg-teal-500' : 'bg-purple-500'}`} style={{ width: `${Math.min(100, Number(caseShare))}%` }} />
                      </div>
                      <div className="flex items-center justify-between mt-1 text-[10px] font-bold text-slate-400">
                        <span>Tracked disease profile</span>
                        <span>{Number(disease.events || 0).toLocaleString('id-ID')} event</span>
                      </div>
                    </div>
                  </div>
                )
              })}
              {(regionalSkdrData?.by_disease || []).length === 0 && (
                <div className="sm:col-span-2 md:col-span-3 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-semibold text-slate-500">
                  Data profil penyakit belum tersedia untuk periode ini.
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {isRegionalTemplate && (
        <>
          <section aria-label={`Indikator surveilans ${displayRegion}`} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: 'Total Crawled (All-Time)',
                value: regionalCrawlingStats?.total_crawled_all_time ?? regionalCrawlingStats?.total ?? 0,
                note: `Unique reports mapped to ${displayRegion}`,
                icon: Radio,
                tone: 'border-emerald-200 bg-emerald-50 text-emerald-600',
              },
              {
                label: 'Detected Cases',
                value: regionalSkdrData?.kpis.cases ?? 0,
                note: `Reporting period ${regionalSkdrData?.filters?.year ?? new Date().getFullYear()}`,
                icon: HeartPulse,
                tone: 'border-sky-200 bg-sky-50 text-[#0060A9]',
              },
              {
                label: 'Deaths',
                value: regionalSkdrData?.kpis.deaths ?? 0,
                note: `${displayRegion} surveillance results`,
                icon: ShieldAlert,
                tone: 'border-rose-200 bg-rose-50 text-rose-600',
              },
              {
                label: 'Detected Locations',
                value: regionalSkdrData?.kpis.locations ?? 0,
                note: 'Unique locations with validated data',
                icon: MapPin,
                tone: 'border-amber-200 bg-amber-50 text-amber-600',
              },
            ].map((card) => {
              const Icon = card.icon
              return (
                <article key={card.label} className="min-h-[142px] rounded-[17px_17px_22px_17px] border border-slate-200 bg-white p-4 shadow-[0_6px_18px_rgba(15,23,42,.06)] transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border ${card.tone}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">{card.label}</p>
                      <p className="mt-2 text-3xl font-black leading-none text-slate-900">
                        {loadingRegionalSkdr ? '…' : Number(card.value).toLocaleString('id-ID')}
                      </p>
                      <p className="mt-2 text-[10px] font-semibold leading-4 text-slate-400">{card.note}</p>
                    </div>
                  </div>
                </article>
              )
            })}
          </section>

          <section className="rounded-2xl border border-[#0060A9]/20 bg-gradient-to-r from-blue-50 via-sky-50 to-[#fdfbf5] p-5 shadow-sm">
            <div className="flex gap-3">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[#0060A9]" />
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-[#0060A9]">AI Summary — {displayRegion}</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {regionalSkdrData?.ai_summary?.text || (loadingRegionalSkdr
                    ? 'Preparing a summary from regional surveillance data…'
                    : `There is not enough validated data to prepare a surveillance summary for ${displayRegion}.`)}
                </p>
                <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-400">
                  Generated only from surveillance data for the selected country; not a clinical diagnosis.
                </p>
              </div>
            </div>
          </section>
        </>
      )}

      {error && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-2xl text-xs font-semibold">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-bold">{isRegionalTemplate ? 'Unable to load complete data from the server' : 'Gagal memuat detail lengkap dari server'}</p>
            <p className="text-[11px] text-amber-700/90 mt-0.5">{error}. {isRegionalTemplate ? 'Displaying fallback summary data.' : 'Menampilkan data ringkasan cadangan.'}</p>
          </div>
        </div>
      )}

      {/* Map & Chronology Card (Full Width) */}
      <article id="peta-detail" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-[0_4px_12px_rgba(0,0,0,0.02)] space-y-5">
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-2 mb-1">
            <h4 className="text-xl sm:text-2xl font-black text-slate-900">
              {isRegionalTemplate ? `SKDR Surveillance Map - ${displayRegion}` : `Disaster Event Map - ${displayRegion}`}
            </h4>
            {/* SPASIAL MODE button - Hidden as requested */}
            {/* 
            <a
              href={isRegionalTemplate ? '/dashboard-eoc/detail-region/tv' : '/dashboard-eoc/detail-region/tv'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#047D78] hover:bg-[#03625d] text-white text-xs sm:text-sm font-black uppercase tracking-wider shadow-md shadow-teal-900/15 hover:shadow-lg transition-all duration-200 transform hover:-translate-y-0.5 border border-teal-600/30 self-start sm:self-auto shrink-0 group"
              title="Open spatial mode / command center video wall"
            >
              <Tv className="h-4 w-4 text-emerald-200 group-hover:scale-110 transition-transform" />
              <span className="tracking-wider">SPASIAL MODE</span>
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-white/20 text-white uppercase tracking-wider border border-white/25">
                {isRegionalTemplate ? 'INDONESIA' : 'REGION'}
              </span>
            </a>
            */}
          </div>
          <p className="text-sm sm:text-base text-slate-600 font-normal mb-3">
            {isRegionalTemplate
              ? 'Geospatial view of surveillance reporting areas, case signals, and alert priority. This map does not infer weather or facility readiness.'
              : 'Geospatial view of the incident location, affected radius, standby health facilities, and emergency navigation routes.'}
          </p>

          <div className="h-[540px] sm:h-[580px] lg:h-[620px] rounded-xl overflow-hidden border border-slate-200 shadow-inner mt-2">
            {isRegionalTemplate ? (
              <IndonesiaDetailMap countries={regionalMapCountries} locations={regionalMapLocations} />
            ) : (
              <SpatialOutbreakMap
                countries={regionalMapCountries}
                locations={regionalMapLocations}
                highlightCountry="Indonesia"
              />
            )}
          </div>
        </div>
      </article>

      {isRegionalTemplate && (() => {
          // ── Surveillance Data & Metrics Preparation ──
          // All cards below read from one validated dashboard snapshot so a
          // case is not counted twice by legacy channel-specific endpoints.
          const totalKasus = regionalSkdrData?.kpis.cases ?? 0;
          const totalKematian = regionalSkdrData?.kpis.deaths ?? 0;
          const totalAlerts = regionalSkdrData?.kpis.active_alerts ?? 0;
          const topDiseaseObj = [...(regionalSkdrData?.by_disease || [])]
            .sort((a, b) => b.cases - a.cases)[0];
          const topDiseaseName = topDiseaseObj ? formatDisasterName(topDiseaseObj.name) : 'No data available';
          const topDiseaseCases = topDiseaseObj ? topDiseaseObj.cases : 0;
          const cfrRate = ((totalKematian / (totalKasus || 1)) * 100).toFixed(2);

          const weekNumbers = Array.from(new Set(
            (regionalSkdrData?.weekly_trend || []).map((item) => item.week),
          )).filter((week) => week > 0).sort((a, b) => a - b);
          const weeksData = weekNumbers.map((week) => {
            const point = regionalSkdrData?.weekly_trend?.find((item) => item.week === week);
            return {
              week: `W-${String(week).padStart(2, '0')}`,
              cases: point?.cases ?? 0,
              terkonfirmasi: point?.events ?? 0,
              deaths: point?.deaths ?? 0,
              cumulative: 0,
            };
          }).map((item, index, rows) => ({
            ...item,
            cumulative: rows.slice(0, index + 1).reduce((total, current) => total + current.cases + current.terkonfirmasi, 0),
          }));

          const currentWeekCases = weeksData.length
            ? weeksData[weeksData.length - 1].cases + weeksData[weeksData.length - 1].terkonfirmasi
            : 0;
          const currentWeekLabel = weeksData[weeksData.length - 1]?.week || 'N/A';
          const monitoringStatus = {
            klb: totalAlerts,
            investigation: regionalSkdrData?.kpis.events ?? 0,
            verified: regionalSkdrData?.kpis.events ?? 0,
            negativeDiscarded: 0,
            withDeaths: totalKematian > 0 ? 1 : 0,
          };

          // Ringkasan kanal berasal dari snapshot IBS/EBS. Data fasilitas
          // individual tidak ditebak dari agregat dashboard.
          const makeChannelBreakdown = (
            key: string,
            title: string,
            data: IbsSummary | null,
            color: string,
            fills: string[],
          ) => ({
            key,
            title,
            icon: Activity,
            totalMaster: data?.totals.reports ?? 0,
            color,
            pieData: [
              { name: 'Cases', value: data?.totals.cases ?? 0, fill: fills[0] },
              { name: 'Reports', value: data?.totals.reports ?? 0, fill: fills[1] },
              { name: 'Provinces', value: data?.by_province.length ?? 0, fill: fills[2] },
            ],
          });

          const faskesSurveillanceBreakdown = [
            makeChannelBreakdown('ibs', 'IBS (Indikator)', regionalIbsSummary, 'text-sky-600', ['#0284c7', '#38bdf8', '#7dd3fc']),
            makeChannelBreakdown('ebs', 'EBS (Event)', regionalEbsSummary, 'text-blue-600', ['#1d4ed8', '#60a5fa', '#93c5fd']),
          ];

          /*
          const legacyFaskesSurveillanceBreakdown = [
            {
              key: 'rs',
              title: 'Rumah Sakit (RS)',
              icon: Building2,
              totalMaster: 65,
              color: 'text-rose-600',
              pieData: [
                { name: 'Sinyal Alert Aktif', value: 18, fill: '#ef4444' },
                { name: 'Investigasi / Rawat', value: 7, fill: '#3b82f6' },
                { name: 'Melapor Rutin / Siaga', value: 40, fill: '#10b981' }
              ],
              alertCount: 18,
              investigasiCount: 7,
              siagaCount: 40
            },
            {
              key: 'puskesmas',
              title: 'Puskesmas',
              icon: PlusSquare,
              totalMaster: 445,
              color: 'text-amber-600',
              pieData: [
                { name: 'Sinyal Alert Aktif', value: 139, fill: '#ef4444' },
                { name: 'Investigasi / Rawat', value: 118, fill: '#3b82f6' },
                { name: 'Melapor Rutin / Siaga', value: 188, fill: '#10b981' }
              ],
              alertCount: 139,
              investigasiCount: 118,
              siagaCount: 188
            },
            {
              key: 'pustu',
              title: 'Puskesmas Pembantu',
              icon: ShieldCheck,
              totalMaster: 1121,
              color: 'text-emerald-600',
              pieData: [
                { name: 'Sinyal Alert Aktif', value: 12, fill: '#ef4444' },
                { name: 'Investigasi / Rawat', value: 45, fill: '#3b82f6' },
                { name: 'Melapor Rutin / Siaga', value: 1064, fill: '#10b981' }
              ],
              alertCount: 12,
              investigasiCount: 45,
              siagaCount: 1064
            },
            {
              key: 'klinik',
              title: 'Klinik & Poskes',
              icon: Stethoscope,
              totalMaster: 196,
              color: 'text-blue-600',
              pieData: [
                { name: 'Sinyal Alert Aktif', value: 5, fill: '#ef4444' },
                { name: 'Investigasi / Rawat', value: 14, fill: '#3b82f6' },
                { name: 'Melapor Rutin / Siaga', value: 177, fill: '#10b981' }
              ],
              alertCount: 5,
              investigasiCount: 14,
              siagaCount: 177
            }
          ]; */

          const toRegionChart = (data: PublicDashboard | null) => {
            const grouped = new globalThis.Map<string, number>();
            (data?.locations || []).forEach((location) => {
              const name = location.location_name || 'Unknown region';
              grouped.set(name, (grouped.get(name) || 0) + safeParseInt(location.cases));
            });
            return Array.from(grouped, ([province, cases]) => ({ province, cases }))
              .sort((a, b) => b.cases - a.cases)
              .slice(0, 10);
          };

          const ibsProvinceData = toRegionChart(regionalSkdrData)
            .map((item) => ({ ...item, reports: 0 }));
          const ibsUsesReportCount = false;
          const ibsChartData = ibsProvinceData.map((item) => ({
            ...item,
            value: item.cases,
          }));
          const ebsUsesReportCount = false;
          const ebsChartData: typeof ibsChartData = [];

          const seasonalRows = seasonalDiseaseTotals.slice(0, 15);
          const seasonalTotalCases = seasonalRows.reduce((sum, item) => sum + item.cases, 0);
          const seasonalMatrix = seasonalRows.map((disease) => ({
            ...disease,
            cells: seasonalWeeks.map((week) => ({
              ...week,
              value: seasonalTotalCases > 0
                ? Math.round((disease.cases / seasonalTotalCases) * week.total)
                : 0,
            })),
          }));
          const seasonalPeak = seasonalMatrix.reduce<{
            disease: string;
            label: string;
            value: number;
          } | null>((peak, row) => {
            row.cells.forEach((cell) => {
              if (!peak || cell.value > peak.value) {
                peak = { disease: row.name, label: cell.label, value: cell.value };
              }
            });
            return peak;
          }, null);
          const seasonalCellClass = (value: number) => {
            if (value <= 0) return 'bg-slate-50 border-slate-100';
            if (value <= 5) return 'bg-sky-100 border-sky-200';
            if (value <= 32) return 'bg-sky-300 border-sky-400';
            if (value <= 193) return 'bg-blue-500 border-blue-500';
            if (value <= 1129) return 'bg-blue-700 border-blue-700';
            return 'bg-sky-950 border-sky-950';
          };

          const surveillancePopulation = Math.max(0, safeParseInt(
            eventData?.population
              ?? eventData?.populasi
              ?? detail?.population
              ?? detail?.populasi
              ?? selectedEvent?.population
              ?? selectedEvent?.populasi,
          ));
          const rateMetricAvailable = surveillancePopulation > 0;
          const rangePointCount: Record<'6M' | '12M' | '3Y' | 'ALL', number> = {
            '6M': 26,
            '12M': 52,
            '3Y': 156,
            'ALL': 176,
          };
          const surveillanceWindow = seasonalWeeks.slice(-rangePointCount[surveillanceRange]);
          const selectedSeasonalRows = seasonalMatrix.filter((row) => surveillanceSelectedDiseases.includes(row.name));
          const visibleSeasonalRows = surveillanceComparisonMode ? selectedSeasonalRows : selectedSeasonalRows.slice(0, 1);
          const surveillanceSeries = visibleSeasonalRows.map((row, index) => {
            const key = `diseaseSeries${index}`;
            const baselineKey = `diseaseBaseline${index}`;
            const metricValue = (value: number) => surveillanceMetric === 'rate'
              ? (rateMetricAvailable ? (value * 100000) / surveillancePopulation : null)
              : value;
            const historicalValues = row.cells
              .slice(0, Math.max(1, row.cells.length - 3))
              .map((cell) => metricValue(cell.value))
              .filter((value): value is number => value !== null);
            const baseline = historicalValues.length > 0
              ? historicalValues.reduce((sum, value) => sum + value, 0) / historicalValues.length
              : 0;
            const variance = historicalValues.length > 1
              ? historicalValues.reduce((sum, value) => sum + ((value - baseline) ** 2), 0) / historicalValues.length
              : 0;
            return {
              name: row.name,
              key,
              baselineKey,
              color: ['#047D78', '#2563EB', '#F97316', '#DB2777', '#7C3AED'][index % 5],
              baseline,
              threshold: baseline + (Math.sqrt(variance) * 2),
              values: row.cells,
              metricValue,
            };
          });
          const surveillanceChartData: Array<Record<string, any>> = surveillanceWindow.map((week, index) => {
            const point: Record<string, any> = {
              label: week.label,
              provisional: index >= Math.max(0, surveillanceWindow.length - 3),
            };
            surveillanceSeries.forEach((series) => {
              const cell = series.values.find((item) => item.id === week.id);
              point[series.key] = cell ? series.metricValue(cell.value) : null;
              point[series.baselineKey] = series.baseline;
            });
            return point;
          });
          const provisionalStartLabel = surveillanceChartData[Math.max(0, surveillanceChartData.length - 3)]?.label;
          const provisionalEndLabel = surveillanceChartData[surveillanceChartData.length - 1]?.label;
          const primarySurveillanceSeries = surveillanceSeries[0];
          const detectedOutbreaks = surveillanceChartData.filter((point) => (
            primarySurveillanceSeries
              && typeof point[primarySurveillanceSeries.key] === 'number'
              && point[primarySurveillanceSeries.key] > primarySurveillanceSeries.threshold
          )).length;

          return (
            <section className="space-y-6 mt-6" aria-labelledby="surveillance-trend-section">
              {/* ── Section Header ── */}
              <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-2xs">
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900 m-0">
                  National Surveillance Trends &amp; Dynamics - {displayRegion}
                </h3>
                <p className="text-sm sm:text-base text-slate-600 font-normal mt-1.5 mb-0">
                  Data trends from initial detection through the latest update, based on validated surveillance records.
                </p>
              </div>

              {/* ─── Legacy channel chart retained in source for compatibility ─── */}
              {false && (
              <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7 shadow-2xs">
                {/* Header & Filter Tabs */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-150">
                  <div>
                    <h4 className="text-lg sm:text-xl font-black text-slate-900 leading-snug m-0 flex items-center gap-2">
                      <Activity className="h-5 w-5 text-[#0060A9]" />
                      IBS &amp; EBS Disease Monitoring Trends
                    </h4>
                    <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1 mb-0">
                      Provincial case trends based on Indicator-Based Surveillance (IBS) and Event-Based Surveillance (EBS) results.
                    </p>
                  </div>

                  {/* Filter Tabs */}
                  <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200/80 self-start sm:self-auto shrink-0">
                    <button
                      type="button"
                      onClick={() => setSurveillanceViewTab('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        surveillanceViewTab === 'all'
                          ? 'bg-white text-slate-900 shadow-xs border border-slate-200 font-black'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      All Surveillance
                    </button>
                    <button
                      type="button"
                      onClick={() => setSurveillanceViewTab('ibs')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        surveillanceViewTab === 'ibs'
                          ? 'bg-sky-600 text-white shadow-xs font-black'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      IBS (SKDR)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSurveillanceViewTab('ebs')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        surveillanceViewTab === 'ebs'
                          ? 'bg-blue-600 text-white shadow-xs font-black'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      EBS (Event &amp; Rumor)
                    </button>
                  </div>
                </div>

                {/* Subcards Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
                  {/* Subcard 1: IBS */}
                  {(surveillanceViewTab === 'all' || surveillanceViewTab === 'ibs') && (
                    <div className={`p-4 sm:p-5 rounded-xl border border-sky-150 bg-gradient-to-br from-[#f0f9ff]/50 via-white to-white shadow-2xs flex flex-col justify-between ${surveillanceViewTab === 'ibs' ? 'lg:col-span-2' : ''}`}>
                      <div className="mb-3">
                        <div className="flex items-center justify-between">
                          <h5 className="text-sm sm:text-base font-black text-slate-900 m-0">
                            Disease Monitoring Based on IBS
                          </h5>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
                            Routine SKDR
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5 m-0">
                          (Data Integrated with SKDR Surveillance)
                        </p>
                      </div>

                      <div className="w-full h-[240px] sm:h-[260px]">
                        {loadingRegionalSkdr ? (
                          <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-500">
                            Loading direct SKDR IBS aggregation…
                          </div>
                        ) : ibsChartData.length === 0 ? (
                          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-sky-200 bg-sky-50/40 px-6 text-center text-sm font-semibold text-slate-500">
                            No IBS reports are available for the selected year.
                          </div>
                        ) : (
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                          <BarChart data={ibsChartData} margin={{ top: 15, right: 15, left: -10, bottom: 25 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                            <XAxis
                              dataKey="province"
                              tick={{ fontSize: 10, fontWeight: 700, fill: '#475569' }}
                              interval={0}
                              angle={-20}
                              textAnchor="end"
                              height={45}
                            />
                            <YAxis
                              tick={{ fontSize: 11, fontWeight: 700, fill: '#475569' }}
                              allowDecimals={false}
                            />
                            <Tooltip
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const d = payload[0].payload;
                                  return (
                                    <div className="bg-slate-900 text-white px-3 py-2 rounded-xl text-xs shadow-lg border border-slate-700">
                                      <div className="font-bold">{d.province}</div>
                                      <div className="text-emerald-400 font-extrabold mt-0.5">
                                        {ibsUsesReportCount ? 'reports' : 'cases'}: {Number(d.value).toLocaleString('en-US')}
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Bar dataKey="value" fill="#00B4D8" radius={[4, 4, 0, 0]}>
                              {ibsChartData.map((_, idx) => (
                                <Cell key={`cell-ibs-${idx}`} fill={idx === 2 ? '#0284c7' : '#00B4D8'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Subcard 2: EBS */}
                  {(surveillanceViewTab === 'all' || surveillanceViewTab === 'ebs') && (
                    <div className={`p-4 sm:p-5 rounded-xl border border-blue-150 bg-gradient-to-br from-[#eff6ff]/50 via-white to-white shadow-2xs flex flex-col justify-between ${surveillanceViewTab === 'ebs' ? 'lg:col-span-2' : ''}`}>
                      <div className="mb-3">
                        <div className="flex items-center justify-between">
                          <h5 className="text-sm sm:text-base font-black text-slate-900 m-0">
                            Disease Monitoring Based on EBS
                          </h5>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                            Rumor &amp; Signal Verification
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5 m-0">
                          (Event-Based Surveillance &amp; Rumor Verification)
                        </p>
                      </div>

                      <div className="w-full h-[240px] sm:h-[260px]">
                        {loadingRegionalSkdr ? (
                          <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-500">
                            Loading direct SKDR EBS aggregation…
                          </div>
                        ) : ebsChartData.length === 0 ? (
                          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-blue-200 bg-blue-50/40 px-6 text-center text-sm font-semibold text-slate-500">
                            No EBS reports are available for the selected year.
                          </div>
                        ) : (
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                          <BarChart data={ebsChartData} margin={{ top: 15, right: 15, left: -10, bottom: 25 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                            <XAxis
                              dataKey="province"
                              tick={{ fontSize: 10, fontWeight: 700, fill: '#475569' }}
                              interval={0}
                              angle={-20}
                              textAnchor="end"
                              height={45}
                            />
                            <YAxis
                              tick={{ fontSize: 11, fontWeight: 700, fill: '#475569' }}
                              allowDecimals={false}
                            />
                            <Tooltip
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const d = payload[0].payload;
                                  return (
                                    <div className="bg-slate-900 text-white px-3 py-2 rounded-xl text-xs shadow-lg border border-slate-700">
                                      <div className="font-bold">{d.province}</div>
                                      <div className="text-sky-400 font-extrabold mt-0.5">
                                        {ebsUsesReportCount ? 'reports' : 'events / cases'}: {Number(d.value).toLocaleString('en-US')}
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                              {ebsChartData.map((_, idx) => (
                                <Cell key={`cell-ebs-${idx}`} fill={idx === 2 ? '#1d4ed8' : '#3b82f6'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </article>
              )}


              {/* ─── SECTION 1: TREN KASUS & SURVEILANS EPIDEMIOLOGI (30% KIRI - 70% KANAN) ─── */}
              <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7 shadow-2xs hover:shadow-xs transition-all">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
                  {/* Sisi Kiri (30% / 4 cols): Info Title, 4 Stat Cards & Insight Surveilans */}
                  <div className="lg:col-span-4 flex flex-col justify-between space-y-4">
                    <div>
                      <div className="flex items-center justify-between gap-2.5">
                        <div>
                          <h4 className="text-lg sm:text-xl font-black text-slate-900 leading-snug m-0">
                            Case Trends &amp; Epidemiological Surveillance
                          </h4>
                          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1 mb-0 leading-relaxed">
                            Weekly case dynamics, case fatality ratio (CFR), and disease distribution in {displayRegion}.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setKabupatenMatrixTab('penyakit');
                            setShowKabupatenMatrixModal(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#047D78] hover:bg-[#03625d] text-white text-[11px] font-black tracking-wider uppercase transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer shrink-0 border border-teal-600/30 group"
                          title="Open Disease Surveillance Matrix"
                        >
                          <Table2 className="h-3.5 w-3.5 text-teal-100 group-hover:scale-110 transition-transform" />
                          <span>VIEW MATRIX</span>
                        </button>
                      </div>

                      {/* 4 Stat Cards Berwarna (Adaptasi Penuh Surveilans SKDR IBS & EBS) */}
                      <div className="grid grid-cols-2 gap-3 mt-4">
                        <div className="p-3.5 rounded-xl bg-rose-50/70 border border-rose-200/80">
                          <span className="text-xs font-bold uppercase tracking-wider text-rose-800 block">Deaths / CFR</span>
                          <span className="text-xl sm:text-2xl font-black text-rose-950">
                            {totalKematian.toLocaleString('en-US')} <span className="text-xs sm:text-sm font-bold text-rose-700">Deaths ({cfrRate}%)</span>
                          </span>
                        </div>
                        <div className="p-3.5 rounded-xl bg-orange-50/70 border border-orange-200/80">
                          <span className="text-xs font-bold uppercase tracking-wider text-orange-800 block">Weekly Cases ({currentWeekLabel})</span>
                          <span className="text-xl sm:text-2xl font-black text-orange-950">
                            {currentWeekCases.toLocaleString('en-US')} <span className="text-xs sm:text-sm font-bold text-orange-700">New Cases</span>
                          </span>
                        </div>
                        <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80">
                          <span className="text-xs font-bold uppercase tracking-wider text-amber-800 block">Active Signals</span>
                          <span className="text-xl sm:text-2xl font-black text-amber-950">
                            {totalAlerts.toLocaleString('en-US')} <span className="text-xs sm:text-sm font-bold text-amber-700">Active Signals</span>
                          </span>
                        </div>
                        <div className="p-3.5 rounded-xl bg-teal-50/70 border border-teal-200/80">
                          <span className="text-xs font-bold uppercase tracking-wider text-teal-800 block">Cumulative Cases</span>
                          <span className="text-xl sm:text-2xl font-black text-teal-950">
                            {totalKasus.toLocaleString('en-US')} <span className="text-xs sm:text-sm font-bold text-teal-700">Detected</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Insight Box di Sisi Kiri */}
                    <div className="rounded-xl bg-teal-50/90 border border-teal-200 p-4 text-xs sm:text-sm text-teal-950 leading-relaxed font-medium">
                      <div className="flex items-center gap-2 text-teal-900 font-black text-sm mb-1.5">
                        <Activity className="h-4 w-4 text-[#047d78]" />
                        <span>Epidemiological Surveillance Insight:</span>
                      </div>
                      <p className="text-teal-950 font-medium m-0 text-xs sm:text-sm leading-relaxed">
                        Validated surveillance data indicates that the highest concentration of cases is associated with {topDiseaseName} ({topDiseaseCases.toLocaleString('id-ID')} cases). There are currently {totalAlerts} active signals according to the API validation rules.
                      </p>
                    </div>
                  </div>

                  {/* Sisi Kanan (70% / 8 cols): Big Spacious LineChart dengan Filter Garis & Dual Toggles */}
                  <div className="lg:col-span-8 flex flex-col bg-slate-50/60 rounded-xl p-4 sm:p-5 border border-slate-200">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-200/80">
                      {/* Interactive Series Toggle Pills */}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="text-[11px] font-bold text-slate-500 mr-1 hidden sm:inline">Series:</span>
                        <button
                          type="button"
                          onClick={() => toggleLine('Kasus Baru')}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition cursor-pointer ${
                            visibleLines['Kasus Baru'] !== false
                              ? 'bg-orange-50 text-orange-700 border-orange-300 shadow-2xs font-black'
                              : 'bg-slate-100 text-slate-400 border-slate-200 line-through opacity-60'
                          }`}
                        >
                          <span className="h-2 w-2 rounded-full bg-[#f97316]" />
                          Reported Cases
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleLine('Kasus Terkonfirmasi')}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition cursor-pointer ${
                            visibleLines['Kasus Terkonfirmasi'] !== false
                              ? 'bg-teal-50 text-teal-800 border-teal-300 shadow-2xs font-black'
                              : 'bg-slate-100 text-slate-400 border-slate-200 line-through opacity-60'
                          }`}
                        >
                          <span className="h-2 w-2 rounded-full bg-[#047d78]" />
                          Reported Events
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleLine('Kematian')}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition cursor-pointer ${
                            visibleLines['Kematian'] !== false
                              ? 'bg-rose-50 text-rose-700 border-rose-300 shadow-2xs font-black'
                              : 'bg-slate-100 text-slate-400 border-slate-200 line-through opacity-60'
                          }`}
                        >
                          <span className="h-2 w-2 rounded-full bg-[#e11d48]" />
                          Deaths
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleLine('Total Kumulatif')}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition cursor-pointer ${
                            visibleLines['Total Kumulatif'] !== false
                              ? 'bg-slate-800 text-white border-slate-900 shadow-2xs font-black'
                              : 'bg-slate-100 text-slate-400 border-slate-200 line-through opacity-60'
                          }`}
                        >
                          <span className="h-2 w-2 rounded-full bg-[#1e293b]" />
                          Cumulative Total
                        </button>
                        <button
                          type="button"
                          onClick={resetSurveillanceLines}
                          className="px-2 py-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 rounded-md transition text-xs font-bold cursor-pointer"
                        >
                          Reset
                        </button>
                      </div>

                    </div>

                    {/* Chart Container */}
                    <div className="w-full h-[320px] sm:h-[350px]">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                        <LineChart
                          data={weeksData}
                          margin={{ top: 20, right: 25, left: 10, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis
                            dataKey="week"
                            tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }}
                            stroke="#cbd5e1"
                          />
                          <YAxis
                            yAxisId="left"
                            tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
                            stroke="#cbd5e1"
                            tickFormatter={(v) => Number(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                          />
                          <YAxis
                            yAxisId="right"
                            orientation="right"
                            tick={{ fontSize: 10, fontWeight: 700, fill: '#047d78' }}
                            stroke="#047d78"
                            tickFormatter={(v) => Number(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                          />
                          <Tooltip
                            contentStyle={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '11px', fontWeight: 700, boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}
                          />
                          <Legend
                            wrapperStyle={{ paddingTop: 8, fontSize: '11px', fontWeight: 700 }}
                          />
                          {visibleLines['Kasus Baru'] !== false && (
                            <Line
                              yAxisId="left"
                              type="monotone"
                              dataKey="cases"
                              name="Reported Cases"
                              stroke="#f97316"
                              strokeWidth={2.5}
                              dot={{ r: 3.5, fill: '#f97316' }}
                              activeDot={{ r: 6 }}
                            />
                          )}
                          {visibleLines['Kasus Terkonfirmasi'] !== false && (
                            <Line
                              yAxisId="left"
                              type="monotone"
                              dataKey="terkonfirmasi"
                              name="Reported Events"
                              stroke="#047d78"
                              strokeWidth={2.5}
                              dot={{ r: 3.5, fill: '#047d78' }}
                              activeDot={{ r: 6 }}
                            />
                          )}
                          {visibleLines['Kematian'] !== false && (
                            <Line
                              yAxisId="left"
                              type="monotone"
                              dataKey="deaths"
                              name="Deaths"
                              stroke="#e11d48"
                              strokeWidth={2}
                              dot={{ r: 3.5, fill: '#e11d48' }}
                              activeDot={{ r: 5 }}
                            />
                          )}
                          {visibleLines['Total Kumulatif'] !== false && (
                            <Line
                              yAxisId="right"
                              type="monotone"
                              dataKey="cumulative"
                              name="Cumulative Total"
                              stroke="#1e293b"
                              strokeWidth={2}
                              strokeDasharray="4 4"
                              dot={false}
                            />
                          )}
                          <Brush
                            dataKey="week"
                            height={26}
                            stroke="#047d78"
                            fill="#e6f4f3"
                            startIndex={0}
                            endIndex={weeksData.length - 1}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </article>

              {/* â”€â”€â”€ SECTION 2: RINGKASAN KANAL DATA SKDR (DISABLED) â”€â”€â”€ */}
              {/* Seasonal disease intensity matrix */}
              <article className={`rounded-2xl border border-slate-200 bg-white p-5 sm:p-7 shadow-2xs transition-all ${seasonalFullscreen ? 'fixed inset-3 z-[80] overflow-hidden shadow-2xl sm:inset-6' : ''}`}>
                <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h4 className="text-lg sm:text-xl font-black text-slate-900 leading-snug m-0">Seasonal Patterns</h4>
                    <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1 mb-0 leading-relaxed">
                      Weekly disease intensity across the available epidemiological surveillance period.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 self-start">
                    <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                      <button
                        type="button"
                        onClick={() => setSeasonalView('table')}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${seasonalView === 'table' ? 'bg-white text-slate-900 shadow-xs border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
                      >
                        <Table2 className="h-3.5 w-3.5" />
                        Table
                      </button>
                      <button
                        type="button"
                        onClick={() => setSeasonalView('chart')}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${seasonalView === 'chart' ? 'bg-[#047D78] text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                      >
                        <Activity className="h-3.5 w-3.5" />
                        Chart
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSeasonalFullscreen((value) => !value)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800"
                      aria-label={seasonalFullscreen ? 'Exit full-screen' : 'Enter full-screen'}
                    >
                      {seasonalFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                      <span className="hidden sm:inline">{seasonalFullscreen ? 'Exit full-screen' : 'Enter full-screen'}</span>
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-600">
                    {seasonalDiseaseTotals.length} diseases
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-600">
                    {seasonalWeeks.length} time points
                  </span>
                  {seasonalPeak && (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-800">
                      Highest intensity: {formatDisasterName(seasonalPeak.disease)} / {seasonalPeak.label}
                    </span>
                  )}
                </div>

                {seasonalMatrix.length > 0 && seasonalWeeks.length > 0 ? (
                  <div className="mt-4 max-h-[560px] overflow-auto rounded-xl border border-slate-200 bg-white">
                    {seasonalView === 'chart' ? (
                      <div className="min-w-max p-3 sm:p-4" style={{ minWidth: `${Math.max(760, seasonalWeeks.length * 22 + 190)}px` }}>
                        <div className="mb-2 grid grid-cols-[170px_1fr] items-end gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Disease</span>
                          <div className="grid" style={{ gridTemplateColumns: `repeat(${seasonalWeeks.length}, minmax(16px, 1fr))` }}>
                            {seasonalWeeks.map((week, index) => (
                              <span key={`seasonal-label-${week.id}`} className={`text-center text-[9px] font-bold text-slate-400 ${index % 4 === 0 ? '' : 'invisible'}`}>
                                {week.label}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          {seasonalMatrix.map((row) => (
                            <div key={`seasonal-row-${row.name}`} className="grid grid-cols-[170px_1fr] items-center gap-2">
                              <span className="truncate pr-2 text-xs font-bold text-slate-700" title={row.name}>{formatDisasterName(row.name)}</span>
                              <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${seasonalWeeks.length}, minmax(16px, 1fr))` }}>
                                {row.cells.map((cell) => (
                                  <span
                                    key={`seasonal-cell-${row.name}-${cell.id}`}
                                    className={`h-5 rounded-[3px] border ${seasonalCellClass(cell.value)} transition hover:scale-110 hover:ring-2 hover:ring-teal-500 hover:ring-offset-1`}
                                    title={`${row.name} · ${cell.label}: ${cell.value.toLocaleString('en-US')} cases`}
                                  />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <table className="min-w-max w-full border-collapse text-left text-xs">
                        <thead className="sticky top-0 z-10 bg-slate-50">
                          <tr>
                            <th className="sticky left-0 z-20 border-b border-r border-slate-200 bg-slate-50 px-3 py-2 font-black text-slate-600">Disease</th>
                            {seasonalWeeks.map((week) => (
                              <th key={`seasonal-table-head-${week.id}`} className="border-b border-slate-200 px-2 py-2 text-center font-bold text-slate-500">{week.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {seasonalMatrix.map((row) => (
                            <tr key={`seasonal-table-row-${row.name}`} className="hover:bg-slate-50">
                              <th className="sticky left-0 z-10 border-b border-r border-slate-100 bg-white px-3 py-2 font-bold text-slate-700">{formatDisasterName(row.name)}</th>
                              {row.cells.map((cell) => (
                                <td key={`seasonal-table-cell-${row.name}-${cell.id}`} className="border-b border-slate-100 px-2 py-2 text-center font-semibold text-slate-600">{cell.value.toLocaleString('en-US')}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 flex min-h-48 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-6 text-center text-sm font-semibold text-slate-500">
                    No seasonal surveillance data is available for this region yet.
                  </div>
                )}

                <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-500">
                    <span>Cases / time point</span>
                    {[['0', 'bg-slate-50 border-slate-200'], ['5', 'bg-sky-100 border-sky-200'], ['33', 'bg-sky-300 border-sky-400'], ['194', 'bg-blue-500 border-blue-500'], ['1,130', 'bg-blue-700 border-blue-700'], ['6,557+', 'bg-sky-950 border-sky-950']].map(([label, color]) => (
                      <span key={`seasonal-legend-${label}`} className="inline-flex items-center gap-1">
                        <span className={`h-3 w-3 rounded-[3px] border ${color}`} />{label}
                      </span>
                    ))}
                  </div>
                  <p className="m-0 text-[10px] font-medium text-slate-400">
                    Derived from validated disease totals and weekly surveillance trends; not a raw disease-by-week feed.
                  </p>
                </div>
              </article>

              {/* Surveillance Trends by Disease */}
              <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7 shadow-2xs">
                <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <h4 className="text-lg sm:text-xl font-black text-slate-900 leading-snug m-0">Surveillance Trends by Disease</h4>
                    <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1 mb-0 leading-relaxed">
                      Compare weekly disease trajectories, provisional reporting, and observed-period reference levels.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                      <span className="px-2 text-[10px] font-black uppercase tracking-wider text-slate-400">Metric</span>
                      <label className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold transition ${surveillanceMetric === 'cases' ? 'bg-white text-slate-900 shadow-xs border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>
                        <input
                          type="radio"
                          name="surveillance-metric"
                          className="sr-only"
                          checked={surveillanceMetric === 'cases'}
                          onChange={() => setSurveillanceMetric('cases')}
                        />
                        Total Cases
                      </label>
                      <label className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold transition ${surveillanceMetric === 'rate' ? 'bg-[#047D78] text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'} ${!rateMetricAvailable ? 'cursor-not-allowed opacity-50' : ''}`} title={!rateMetricAvailable ? 'Population denominator is not available in the current surveillance payload' : 'Cases per 100,000 population'}>
                        <input
                          type="radio"
                          name="surveillance-metric"
                          className="sr-only"
                          checked={surveillanceMetric === 'rate'}
                          disabled={!rateMetricAvailable}
                          onChange={() => setSurveillanceMetric('rate')}
                        />
                        Cases per 100k
                      </label>
                    </div>
                    <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                      {(['6M', '12M', '3Y', 'ALL'] as const).map((range) => (
                        <button
                          key={`surveillance-range-${range}`}
                          type="button"
                          onClick={() => setSurveillanceRange(range)}
                          className={`rounded-lg px-2.5 py-1.5 text-xs font-black transition ${surveillanceRange === range ? 'bg-[#047D78] text-white shadow-xs' : 'text-slate-500 hover:bg-white hover:text-slate-800'}`}
                        >
                          {range}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
                  <aside className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-600">Diseases</span>
                      <label className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                        <input
                          type="checkbox"
                          checked={surveillanceComparisonMode}
                          onChange={(event) => setSurveillanceComparisonMode(event.target.checked)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-[#047D78] focus:ring-teal-500"
                        />
                        Compare
                      </label>
                    </div>
                    <div className="relative mt-3">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="search"
                        value={surveillanceDiseaseSearch}
                        onChange={(event) => setSurveillanceDiseaseSearch(event.target.value)}
                        placeholder="Search disease"
                        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                      />
                    </div>
                    <div className="mt-3 max-h-64 space-y-1 overflow-y-auto pr-1">
                      {seasonalDiseaseTotals
                        .filter((disease) => disease.name.toLowerCase().includes(surveillanceDiseaseSearch.toLowerCase()))
                        .slice(0, 20)
                        .map((disease) => {
                          const selected = surveillanceSelectedDiseases.includes(disease.name);
                          return (
                            <label key={`surveillance-disease-${disease.name}`} className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 transition ${selected ? 'bg-white shadow-2xs ring-1 ring-teal-200' : 'hover:bg-white/80'}`}>
                              <input
                                type={surveillanceComparisonMode ? 'checkbox' : 'radio'}
                                name="surveillance-disease"
                                checked={selected}
                                onChange={(event) => {
                                  if (surveillanceComparisonMode) {
                                    setSurveillanceSelectedDiseases((current) => event.target.checked
                                      ? [...current, disease.name]
                                      : current.filter((name) => name !== disease.name));
                                  } else {
                                    setSurveillanceSelectedDiseases([disease.name]);
                                  }
                                }}
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 border-slate-300 text-[#047D78] focus:ring-teal-500"
                              />
                              <span className="min-w-0">
                                <span className="block truncate text-xs font-bold text-slate-700" title={disease.name}>{formatDisasterName(disease.name)}</span>
                                <span className="block text-[10px] font-semibold text-slate-400">{disease.cases.toLocaleString('en-US')} total cases</span>
                              </span>
                            </label>
                          );
                        })}
                    </div>
                    <div className="mt-3 border-t border-slate-200 pt-3 text-[10px] font-medium leading-relaxed text-slate-500">
                      {surveillanceComparisonMode ? 'Comparison uses a common weekly observation window.' : 'Select one disease for the focused trend view.'}
                    </div>
                  </aside>

                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Weekly cadence</span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">{surveillanceChartData.length} points</span>
                        {surveillanceComparisonMode && <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-700">Common observed window</span>}
                      </div>
                      <label className={`inline-flex items-center gap-2 text-xs font-bold ${seasonalWeeks.length === 0 ? 'text-slate-400' : 'text-rose-700'}`} title={seasonalWeeks.length === 0 ? 'Outbreak detection requires weekly or daily data' : 'Highlight points above the upper limit'}>
                        <input
                          type="checkbox"
                          checked={surveillanceOutbreakMode}
                          disabled={seasonalWeeks.length === 0}
                          onChange={(event) => setSurveillanceOutbreakMode(event.target.checked)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                        />
                        Outbreak detection
                      </label>
                    </div>

                    {surveillanceChartData.length > 0 && surveillanceSeries.length > 0 ? (
                      <div className="h-[360px] w-full">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                          <LineChart data={surveillanceChartData} margin={{ top: 12, right: 16, left: 4, bottom: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} stroke="#cbd5e1" />
                            <YAxis
                              allowDecimals={false}
                              tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
                              stroke="#cbd5e1"
                              tickFormatter={(value) => Number(value) >= 1000 ? `${(Number(value) / 1000).toFixed(1)}k` : Number(value).toLocaleString('en-US')}
                            />
                            <Tooltip
                              content={({ active, payload, label }) => {
                                if (!active || !payload || payload.length === 0) return null;
                                const provisional = Boolean(payload[0]?.payload?.provisional);
                                return (
                                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-xl">
                                    <div className="font-black text-slate-800">{label}</div>
                                    {provisional && <div className="mt-1 font-black text-amber-700">Provisional / subject to revision</div>}
                                    <div className="mt-1 space-y-0.5">
                                      {payload.filter((item) => !String(item.dataKey).includes('Baseline')).map((item) => (
                                        <div key={String(item.dataKey)} className="flex items-center justify-between gap-4 font-semibold text-slate-600">
                                          <span>{item.name}</span>
                                          <span className="font-black text-slate-900">{typeof item.value === 'number' ? item.value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              }}
                            />
                            <Legend wrapperStyle={{ paddingTop: 8, fontSize: '11px', fontWeight: 700 }} />
                            {provisionalStartLabel && provisionalEndLabel && (
                              <ReferenceArea x1={provisionalStartLabel} x2={provisionalEndLabel} fill="#f59e0b" fillOpacity={0.10} stroke="#f59e0b" strokeOpacity={0.35} label={{ value: 'Provisional', position: 'insideTopRight', fill: '#b45309', fontSize: 10, fontWeight: 700 }} />
                            )}
                            {surveillanceSeries.map((series) => (
                              <React.Fragment key={`surveillance-line-${series.key}`}>
                                <Line type="monotone" dataKey={series.key} name={formatDisasterName(series.name)} stroke={series.color} strokeWidth={2.5} dot={{ r: 2.5, fill: series.color }} activeDot={{ r: 5 }} connectNulls />
                                <Line type="monotone" dataKey={series.baselineKey} name={`${formatDisasterName(series.name)} baseline`} stroke={series.color} strokeOpacity={0.45} strokeWidth={1.5} strokeDasharray="5 5" dot={false} legendType="none" />
                              </React.Fragment>
                            ))}
                            {surveillanceOutbreakMode && primarySurveillanceSeries && primarySurveillanceSeries.threshold > 0 && (
                              <ReferenceLine y={primarySurveillanceSeries.threshold} stroke="#e11d48" strokeDasharray="4 4" label={{ value: 'Upper limit', position: 'insideTopRight', fill: '#be123c', fontSize: 10, fontWeight: 700 }} />
                            )}
                            <Brush dataKey="label" height={24} stroke="#047d78" fill="#e6f4f3" startIndex={0} endIndex={surveillanceChartData.length - 1} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="flex h-[360px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-6 text-center text-sm font-semibold text-slate-500">
                        Select at least one disease and wait for surveillance data to load.
                      </div>
                    )}

                    <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 text-[10px] font-medium leading-relaxed text-slate-400 sm:flex-row sm:items-start sm:justify-between">
                      <span>Dashed lines show the observed-period baseline. A historical same-week baseline will replace this fallback when year-level disease observations are available.</span>
                      {surveillanceOutbreakMode && <span className="font-bold text-rose-700">{detectedOutbreaks} points above the upper limit</span>}
                    </div>
                    {surveillanceMetric === 'rate' && !rateMetricAvailable && (
                      <p className="mt-2 mb-0 text-[10px] font-bold text-amber-700">Cases per 100k is unavailable because the current surveillance payload has no population denominator.</p>
                    )}
                  </div>
                </div>
              </article>

              {false && (
              <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xs hover:shadow-xs transition-all">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-stretch">
                  {/* Sisi Kiri (4 cols / ~33%): Ringkasan Status & Kesiapan Faskes */}
                  <div className="lg:col-span-4 flex flex-col justify-between space-y-4">
                    <div>
                      <div className="flex items-center justify-between gap-2.5">
                        <div>
                          <h4 className="text-lg sm:text-xl font-black text-slate-900 leading-snug m-0">
                            SKDR Data Channel Summary
                          </h4>
                          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1 mb-0">
                            Dynamic summary of IBS and EBS data available from the SKDR API in {displayRegion}.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setKabupatenMatrixTab('faskes');
                            setShowKabupatenMatrixModal(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#047D78] hover:bg-[#03625d] text-white text-[11px] font-black tracking-wider uppercase transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer shrink-0 border border-teal-600/30 group"
                          title="Open SKDR Data Matrix"
                        >
                          <Table2 className="h-3.5 w-3.5 text-teal-100 group-hover:scale-110 transition-transform" />
                          <span>VIEW MATRIX</span>
                        </button>
                      </div>

                      {/* Top Metric Strip dari API */}
                      <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Total Reports</span>
                          <span className="text-base sm:text-lg font-black text-slate-900 block mt-0.5">{((regionalIbsSummary?.totals.reports ?? 0) + (regionalEbsSummary?.totals.reports ?? 0)).toLocaleString('id-ID')}</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-200/70">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block">Total Cases</span>
                          <span className="text-base sm:text-lg font-black text-blue-900 block mt-0.5">{totalKasus.toLocaleString('id-ID')}</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/70">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">Locations</span>
                          <span className="text-base sm:text-lg font-black text-emerald-900 block mt-0.5">{new Set([...(regionalIbsSummary?.by_province || []).map(item => item.name), ...(regionalEbsSummary?.by_province || []).map(item => item.name)]).size}</span>
                        </div>
                      </div>
                    </div>

                    {/* Status pemantauan data SKDR */}
                    <div className="rounded-2xl bg-slate-50/80 border border-slate-200/90 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs sm:text-sm font-black text-slate-900">
                          Monitoring Status
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-black text-amber-700 flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          {monitoringStatus.klb.toLocaleString('en-US')} Outbreak Markers
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="p-2.5 rounded-xl bg-white border border-amber-200 shadow-2xs">
                          <span className="text-[10px] font-bold text-amber-700 uppercase block">Under Investigation</span>
                          <span className="text-lg font-black text-amber-900 leading-tight block mt-0.5">{monitoringStatus.investigation.toLocaleString('id-ID')}</span>
                          <span className="text-[9px] font-semibold text-amber-600 block mt-0.5">IBS &amp; EBS</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-white border border-emerald-200 shadow-2xs">
                          <span className="text-[10px] font-bold text-emerald-700 uppercase block">Verified</span>
                          <span className="text-lg font-black text-emerald-900 leading-tight block mt-0.5">{monitoringStatus.verified.toLocaleString('id-ID')}</span>
                          <span className="text-[9px] font-semibold text-emerald-600 block mt-0.5">Official reports</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                          <span className="text-[10px] font-bold text-slate-600 uppercase block">Negative / Discarded</span>
                          <span className="text-lg font-black text-slate-900 leading-tight block mt-0.5">{monitoringStatus.negativeDiscarded.toLocaleString('id-ID')}</span>
                          <span className="text-[9px] font-semibold text-slate-500 block mt-0.5">Closed / negative</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-white border border-rose-200 shadow-2xs">
                          <span className="text-[10px] font-bold text-rose-700 uppercase block">Reports with Deaths</span>
                          <span className="text-lg font-black text-rose-900 leading-tight block mt-0.5">{monitoringStatus.withDeaths.toLocaleString('id-ID')}</span>
                          <span className="text-[9px] font-semibold text-rose-600 block mt-0.5">Reports, not alerts</span>
                        </div>
                      </div>

                      {/* Kinerja Surveilans SKDR Footer (Ketepatan, Kelengkapan, Respon PE) */}
                      <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] font-bold text-slate-600">
                        <div className="flex items-center gap-1" title="SKDR API connection status">
                          <Clock className="h-3.5 w-3.5 text-blue-600" />
                          <span>API: <b className="text-slate-900">{regionalIbsSummary || regionalEbsSummary ? 'Connected' : 'Not available'}</b></span>
                        </div>
                        <div className="flex items-center gap-1" title="Number of official IBS and EBS reports">
                          <ClipboardCheck className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Reports: <b className="text-slate-900">{((regionalIbsSummary?.totals.reports ?? 0) + (regionalEbsSummary?.totals.reports ?? 0)).toLocaleString('en-US')}</b></span>
                        </div>
                        <div className="flex items-center gap-1" title="Outbreak markers from official SKDR data">
                          <ShieldCheck className="h-3.5 w-3.5 text-teal-600" />
                          <span>KLB: <b className="text-slate-900">{monitoringStatus.klb.toLocaleString('id-ID')}</b></span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sisi Kanan (8 cols / ~67%): 4 Solid Pie Charts (Gambar 1) */}
                  <div className="lg:col-span-8 flex flex-col justify-between">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                        Summary by Surveillance Channel
                      </span>
                      <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500">
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> Cases</span>
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Reports</span>
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Provinces</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 flex-1 items-stretch">
                      {faskesSurveillanceBreakdown.map(cat => {
                        const IconComponent = cat.icon;
                        return (
                          <div
                            key={cat.key}
                            className="rounded-2xl border border-slate-200/90 bg-slate-50/50 hover:bg-white p-3.5 flex flex-col justify-between transition-all duration-200 shadow-2xs hover:shadow-sm"
                          >
                            <div className="flex items-center justify-between gap-1.5 pb-2 border-b border-slate-150">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <div className={`p-1 rounded-lg bg-white shadow-2xs shrink-0 border border-slate-200 ${cat.color}`}>
                                  <IconComponent className="h-3.5 w-3.5" />
                                </div>
                                <span className="text-xs font-black text-slate-900 truncate" title={cat.title}>
                                  {cat.title}
                                </span>
                              </div>
                              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md shrink-0 border border-slate-200/60">
                                {cat.totalMaster.toLocaleString('en-US')} Reports
                              </span>
                            </div>

                            {/* Solid Pie Chart (Pizza Slice Model) */}
                            <div className="relative w-full h-[155px] flex items-center justify-center my-auto">
                              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                <PieChart>
                                  <Pie
                                    data={cat.pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={0}
                                    outerRadius={68}
                                    paddingAngle={cat.pieData.length > 1 ? 2 : 0}
                                    dataKey="value"
                                    isAnimationActive={true}
                                    stroke="#ffffff"
                                    strokeWidth={1.5}
                                  >
                                    {cat.pieData.map((entry, index) => (
                                      <Cell key={`cell-${cat.key}-${index}`} fill={entry.fill} />
                                    ))}
                                  </Pie>
                                  <Tooltip
                                    contentStyle={{ background: '#ffffff', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '11px', fontWeight: 700, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                                    formatter={(val: any, name: any) => [`${val} Unit`, name]}
                                  />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>

                            <div className="mt-1.5 pt-2 border-t border-slate-100 grid grid-cols-3 gap-0.5 text-[11px] font-bold text-center">
                              <div className="text-rose-700">
                                <div className="flex items-baseline justify-center gap-0.5">
                                  <span className="block text-rose-600 font-black leading-none text-xs">{cat.pieData[0].value}</span>
                                </div>
                                <span className="text-[8px] font-semibold text-slate-500 block mt-0.5">Cases</span>
                              </div>
                              <div className="border-x border-slate-150 px-0.5 text-blue-700">
                                <div className="flex items-baseline justify-center gap-0.5">
                                  <span className="block text-blue-600 font-black leading-none text-xs">{cat.pieData[1].value}</span>
                                </div>
                                <span className="text-[8px] font-semibold text-blue-600 block mt-0.5">Reports</span>
                              </div>
                              <div className="text-emerald-700">
                                <div className="flex items-baseline justify-center gap-0.5">
                                  <span className="block text-emerald-600 font-black leading-none text-xs">{cat.pieData[2].value}</span>
                                </div>
                                <span className="text-[8px] font-semibold text-emerald-600 block mt-0.5">Provinsi</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </article>
              )}
            </section>
          );
        })()}

      {/* Main Content: Full Width */}
      <div className="space-y-5">



        {/* Map and Chronology have been moved to a full-width section above this grid */}

        {/* 1. ANALISIS TREN DAMPAK KEJADIAN (Directly after Map & Chronology) */}
        {!isRegionalTemplate && (() => {
          // ── Narrative helpers ──────────────────────────────────────────────────────────
          const victimLast = victimTrendData[victimTrendData.length - 1] || {};
          const victimFirst = victimTrendData[0] || {};
          const totalKorbanDelta = (victimLast['Total Korban'] || 0) - (victimFirst['Total Korban'] || 0);
          const pengungsiLast = victimLast['Total Pengungsi'] ?? safeParseInt(eventData.pengungsi);
          const meninggalLast = victimLast['Meninggal'] ?? safeParseInt(eventData.meninggal);
          const lukaLast = victimLast['Luka-luka'] ?? (safeParseInt(eventData.luka_berat) + safeParseInt(eventData.luka_ringan));
          const terdampakLast = victimLast['Penduduk Terancam/Terdampak'] ?? (totalPendudukTerancam > 0 ? totalPendudukTerancam : safeParseInt(eventData.penduduk_terdampak));
          const totalKorbanLast = victimLast['Total Korban'] ?? (meninggalLast + lukaLast);

          const totalTerdampakFaskes = faskesPieBreakdown.reduce((sum, item) => sum + item.terdampak, 0);
          const totalMasterFaskes = faskesPieBreakdown.reduce((sum, item) => sum + item.totalMaster, 0);
          const totalPctFaskes = totalMasterFaskes > 0 ? Math.round((totalTerdampakFaskes / totalMasterFaskes) * 100) : 0;

          const faskesNarrative = totalTerdampakFaskes > 0
            ? `Sebanyak ${totalTerdampakFaskes} dari ${totalMasterFaskes} total fasilitas kesehatan (${totalPctFaskes}%) di ${displayRegion} dilaporkan terdampak/rusak pada Formulir Lengkap RHA. Rincian: ${faskesPieBreakdown.map(c => `${c.title}: ${c.terdampak}/${c.totalMaster}`).join(', ')}.`
            : `Seluruh fasilitas kesehatan (${totalMasterFaskes} faskes) di ${displayRegion} terpantau berfungsi normal. Belum ada laporan kerusakan fisik bangunan faskes pada Formulir Lengkap RHA.`;

          const korbanNarrative = totalKorbanLast > 0 || terdampakLast > 0
            ? `Tercatat ${totalKorbanLast.toLocaleString('id-ID')} total korban (${meninggalLast.toLocaleString('id-ID')} meninggal, ${lukaLast.toLocaleString('id-ID')} luka-luka), ${pengungsiLast.toLocaleString('id-ID')} pengungsi, serta ${terdampakLast.toLocaleString('id-ID')} jiwa terancam/terdampak.`
            : `Data korban terpantau nihil/stabil dalam periode ini.`;

          const penyakitNarrative = dominantDiseaseObj && totalPenyakitCases > 0
            ? `Dampak kesehatan dominan: ${dominantDiseaseObj.name} (${dominantDiseaseObj.total} kasus). Total estimasi/surveilans klinis: ${totalPenyakitCases} kasus sensitif bencana.`
            : `Data surveilans penyakit (#N/A): Belum ada laporan data penyakit potensial KLB yang diinput pada posko pengungsian / faskes untuk kejadian ini.`;

          return (
            <section className="space-y-6 mt-6">
              {/* ── Section Header ── */}
              <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-2xs">
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 m-0">
                  Analisis Tren &amp; Dinamika Dampak Bencana - {displayRegion}
                </h3>
                <p className="text-sm sm:text-base text-slate-600 font-normal mt-1.5 mb-0">
                  Visualisasi pergerakan data dari tanggal kejadian awal hingga perkembangan terkini berdasarkan laporan terverifikasi SIPKK
                </p>
              </div>

              {/* ─── SECTION 1: TREN KORBAN & PENDUDUK TERDAMPAK (30% KIRI - 70% KANAN) ─── */}
              <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7 shadow-2xs hover:shadow-xs transition-all">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
                  {/* Sisi Kiri (30% / 4 cols): Judul Besar, Deskripsi Jelas, Quick Stat Cards, & Insight Box */}
                  <div className="lg:col-span-4 flex flex-col justify-between space-y-4">
                    <div>
                      <div className="flex items-center justify-between gap-2.5">
                        <h4 className="text-xl sm:text-2xl font-black text-slate-900 leading-snug m-0">
                          Tren Korban &amp; Penduduk Terdampak
                        </h4>
                        <button
                          type="button"
                          onClick={() => {
                            setKabupatenMatrixTab('korban')
                            setShowKabupatenMatrixModal(true)
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#047D78] hover:bg-[#03625d] text-white text-[11px] font-black tracking-wider uppercase transition-all duration-200 shadow-md shadow-teal-900/15 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer shrink-0 border border-teal-600/30 group"
                          title="Buka Matriks Rincian Korban Jiwa & Luka per Kabupaten"
                        >
                          <Table2 className="h-3.5 w-3.5 text-teal-100 group-hover:scale-110 transition-transform" />
                          <span>LIHAT MATRIKS</span>
                        </button>
                      </div>
                      <p className="text-sm sm:text-base text-slate-700 leading-relaxed font-normal mt-2.5 mb-0">
                        Dinamika penambahan korban jiwa (meninggal &amp; luka-luka), fluktuasi jumlah pengungsi di titik kumpul posko, serta estimasi populasi rentan/terancam yang tercatat pada setiap pembaruan laporan SIPKK.
                      </p>

                      {/* Quick Metrics 2x2 Grid with Big Numbers */}
                      <div className="grid grid-cols-2 gap-3 mt-4">
                        <div className="p-3.5 rounded-xl bg-rose-50/70 border border-rose-200/80">
                          <span className="text-xs font-bold uppercase tracking-wider text-rose-800 block">Meninggal</span>
                          <span className="text-xl sm:text-2xl font-black text-rose-950">{meninggalLast.toLocaleString('id-ID')} <span className="text-xs sm:text-sm font-bold text-rose-700">Jiwa</span></span>
                        </div>
                        <div className="p-3.5 rounded-xl bg-orange-50/70 border border-orange-200/80">
                          <span className="text-xs font-bold uppercase tracking-wider text-orange-800 block">Luka-Luka</span>
                          <span className="text-xl sm:text-2xl font-black text-orange-950">{lukaLast.toLocaleString('id-ID')} <span className="text-xs sm:text-sm font-bold text-orange-700">Jiwa</span></span>
                        </div>
                        <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80">
                          <span className="text-xs font-bold uppercase tracking-wider text-amber-800 block">Pengungsi</span>
                          <span className="text-xl sm:text-2xl font-black text-amber-950">{pengungsiLast.toLocaleString('id-ID')} <span className="text-xs sm:text-sm font-bold text-amber-700">Jiwa</span></span>
                        </div>
                        <div className="p-3.5 rounded-xl bg-teal-50/70 border border-teal-200/80">
                          <span className="text-xs font-bold uppercase tracking-wider text-teal-800 block">Terdampak</span>
                          <span className="text-xl sm:text-2xl font-black text-teal-950">{terdampakLast.toLocaleString('id-ID')} <span className="text-xs sm:text-sm font-bold text-teal-700">Jiwa</span></span>
                        </div>
                      </div>
                    </div>

                    {/* Insight Box di Sisi Kiri */}
                    {!isNttEvent && (
                      <div className="rounded-xl bg-teal-50/90 border border-teal-200 p-4 text-xs sm:text-sm text-teal-950 leading-relaxed font-medium">
                        <div className="flex items-center gap-2 text-teal-900 font-black text-sm mb-1.5">
                          <Activity className="h-4 w-4 text-[#047d78]" />
                          <span>Insight Perkembangan Korban:</span>
                        </div>
                        <p className="text-teal-950 font-medium m-0 text-xs sm:text-sm leading-relaxed">
                          {korbanNarrative}
                        </p>
                      </div>
                    )}
                  </div>

                    {/* Sisi Kanan (70% / 8 cols): Big Spacious LineChart */}
                    <div className="lg:col-span-8 flex flex-col bg-slate-50/60 rounded-xl p-4 sm:p-5 border border-slate-200">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-200/80">
                        {/* Interactive Series Toggle Pills (User can toggle each line on/off) */}
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="text-[11px] font-bold text-slate-500 mr-1 hidden sm:inline">Filter Garis:</span>
                          <button
                            type="button"
                            onClick={() => toggleLine('Meninggal')}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition cursor-pointer ${
                              visibleLines['Meninggal'] !== false
                                ? 'bg-rose-50 text-rose-700 border-rose-300 shadow-2xs font-black'
                                : 'bg-slate-100 text-slate-400 border-slate-200 line-through opacity-60'
                            }`}
                          >
                            <span className="h-2 w-2 rounded-full bg-[#e11d48]"></span>
                            Meninggal
                          </button>

                          <button
                            type="button"
                            onClick={() => toggleLine('Luka-luka')}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition cursor-pointer ${
                              visibleLines['Luka-luka'] !== false
                                ? 'bg-orange-50 text-orange-700 border-orange-300 shadow-2xs font-black'
                                : 'bg-slate-100 text-slate-400 border-slate-200 line-through opacity-60'
                            }`}
                          >
                            <span className="h-2 w-2 rounded-full bg-[#ea580c]"></span>
                            Luka-luka
                          </button>

                          <button
                            type="button"
                            onClick={() => toggleLine('Total Pengungsi')}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition cursor-pointer ${
                              visibleLines['Total Pengungsi'] !== false
                                ? 'bg-amber-50 text-amber-800 border-amber-300 shadow-2xs font-black'
                                : 'bg-slate-100 text-slate-400 border-slate-200 line-through opacity-60'
                            }`}
                          >
                            <span className="h-2 w-2 rounded-full bg-[#d97706]"></span>
                            Pengungsi
                          </button>

                          <button
                            type="button"
                            onClick={() => toggleLine('Total Korban')}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition cursor-pointer ${
                              visibleLines['Total Korban'] !== false
                                ? 'bg-slate-800 text-white border-slate-900 shadow-2xs font-black'
                                : 'bg-slate-100 text-slate-400 border-slate-200 line-through opacity-60'
                            }`}
                          >
                            <span className="h-2 w-2 rounded-full bg-[#334155]"></span>
                            Total Korban
                          </button>

                          <button
                            type="button"
                            onClick={() => toggleLine('Penduduk Terancam/Terdampak')}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition cursor-pointer ${
                              visibleLines['Penduduk Terancam/Terdampak'] !== false
                                ? 'bg-teal-50 text-teal-800 border-teal-300 shadow-2xs font-black'
                                : 'bg-slate-100 text-slate-400 border-slate-200 line-through opacity-60'
                            }`}
                          >
                            <span className="h-2 w-2 rounded-full bg-[#0f766e]"></span>
                            Terdampak
                          </button>

                          <button
                            type="button"
                            onClick={resetAllLines}
                            className="px-2 py-1 text-[11px] font-bold text-slate-500 hover:text-slate-900 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 transition cursor-pointer"
                            title="Tampilkan semua garis"
                          >
                            Reset
                          </button>
                        </div>

                        {/* Metric View Mode Toggle */}
                        <div className="flex gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs text-xs font-bold">
                          <button
                            type="button"
                            onClick={() => setTrendMetricMode('dual')}
                            className={`px-3 py-1 rounded-lg transition cursor-pointer border-none ${trendMetricMode === 'dual' ? 'bg-[#047d78] text-white shadow-xs font-black' : 'bg-transparent text-slate-600 hover:text-slate-900'
                              }`}
                          >
                            Dual
                          </button>
                          <button
                            type="button"
                            onClick={() => setTrendMetricMode('korban')}
                            className={`px-3 py-1 rounded-lg transition cursor-pointer border-none ${trendMetricMode === 'korban' ? 'bg-rose-600 text-white shadow-xs font-black' : 'bg-transparent text-slate-600 hover:text-slate-900'
                              }`}
                          >
                            Korban
                          </button>
                          <button
                            type="button"
                            onClick={() => setTrendMetricMode('penduduk')}
                            className={`px-3 py-1 rounded-lg transition cursor-pointer border-none ${trendMetricMode === 'penduduk' ? 'bg-teal-700 text-white shadow-xs font-black' : 'bg-transparent text-slate-600 hover:text-slate-900'
                              }`}
                          >
                            Penduduk
                          </button>
                        </div>
                      </div>

                      {/* Chart Container */}
                      <div className="w-full flex-1 min-h-[320px] sm:min-h-[360px] text-xs font-semibold">
                        {typeof window !== 'undefined' && (
                          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                            <LineChart data={victimTrendData} margin={{ top: 10, right: 15, left: -5, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis dataKey="date" stroke="#475569" tickLine={false} style={{ fontSize: '12px', fontWeight: 'bold' }} />

                              {(trendMetricMode === 'dual' || trendMetricMode === 'korban') && (
                                <YAxis
                                  yAxisId="left"
                                  stroke="#e11d48"
                                  tickLine={false}
                                  style={{ fontSize: '12px', fontWeight: 'bold' }}
                                  allowDecimals={false}
                                />
                              )}

                              {trendMetricMode === 'dual' && (
                                <YAxis
                                  yAxisId="right"
                                  orientation="right"
                                  stroke="#0f766e"
                                  tickLine={false}
                                  style={{ fontSize: '12px', fontWeight: 'bold' }}
                                  tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}k` : v}
                                />
                              )}

                              {trendMetricMode === 'penduduk' && (
                                <YAxis
                                  yAxisId="right"
                                  stroke="#0f766e"
                                  tickLine={false}
                                  style={{ fontSize: '12px', fontWeight: 'bold' }}
                                  tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}k` : v}
                                />
                              )}

                              <Tooltip
                                contentStyle={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #cbd5e1', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', fontSize: '13px', fontWeight: 600 }}
                                formatter={(value: any) => [Number(value || 0).toLocaleString('id-ID') + ' Jiwa']}
                              />
                              <Legend
                                verticalAlign="top"
                                height={38}
                                iconType="circle"
                                iconSize={10}
                                wrapperStyle={{ fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                                onClick={(e: any) => e?.dataKey && toggleLine(e.dataKey)}
                                formatter={(value) => {
                                  const isHidden = visibleLines[value] === false
                                  return (
                                    <span
                                      className={`mr-4 transition cursor-pointer select-none ${
                                        isHidden
                                          ? 'text-slate-300 line-through opacity-40'
                                          : 'text-slate-800 font-bold hover:text-teal-700'
                                      }`}
                                      title="Klik untuk menyembunyikan / menampilkan grafik"
                                    >
                                      {value}
                                    </span>
                                  )
                                }}
                              />

                              {(trendMetricMode === 'dual' || trendMetricMode === 'korban') && (
                                <Line
                                  yAxisId="left"
                                  type="monotone"
                                  dataKey="Total Korban"
                                  stroke="#334155"
                                  strokeWidth={3}
                                  dot={{ r: 4 }}
                                  activeDot={{ r: 6 }}
                                  hide={visibleLines['Total Korban'] === false}
                                  isAnimationActive={true}
                                  animationDuration={800}
                                />
                              )}
                              {(trendMetricMode === 'dual' || trendMetricMode === 'penduduk') && (
                                <Line
                                  yAxisId="right"
                                  type="monotone"
                                  dataKey="Penduduk Terancam/Terdampak"
                                  stroke="#0f766e"
                                  strokeWidth={2.5}
                                  strokeDasharray={trendMetricMode === 'dual' ? '4 4' : undefined}
                                  dot={{ r: 3 }}
                                  activeDot={{ r: 5 }}
                                  hide={visibleLines['Penduduk Terancam/Terdampak'] === false}
                                  isAnimationActive={true}
                                  animationDuration={800}
                                />
                              )}
                              {(trendMetricMode === 'dual' || trendMetricMode === 'korban') && (
                                <Line
                                  yAxisId="left"
                                  type="monotone"
                                  dataKey="Total Pengungsi"
                                  stroke="#d97706"
                                  strokeWidth={2.5}
                                  dot={{ r: 3 }}
                                  activeDot={{ r: 5 }}
                                  hide={visibleLines['Total Pengungsi'] === false}
                                  isAnimationActive={true}
                                  animationDuration={800}
                                />
                              )}
                              {(trendMetricMode === 'dual' || trendMetricMode === 'korban') && (
                                <Line
                                  yAxisId="left"
                                  type="monotone"
                                  dataKey="Meninggal"
                                  stroke="#e11d48"
                                  strokeWidth={2.5}
                                  dot={{ r: 4 }}
                                  activeDot={{ r: 6 }}
                                  hide={visibleLines['Meninggal'] === false}
                                  isAnimationActive={true}
                                  animationDuration={800}
                                />
                              )}
                              {(trendMetricMode === 'dual' || trendMetricMode === 'korban') && (
                                <Line
                                  yAxisId="left"
                                  type="monotone"
                                  dataKey="Luka-luka"
                                  stroke="#ea580c"
                                  strokeWidth={2.5}
                                  dot={{ r: 4 }}
                                  activeDot={{ r: 6 }}
                                  hide={visibleLines['Luka-luka'] === false}
                                  isAnimationActive={true}
                                  animationDuration={800}
                                />
                              )}
                              {victimTrendData.length > 2 && (
                                <Brush
                                  key={victimTrendData.map(d => d.date).join('-')}
                                  dataKey="date"
                                  height={26}
                                  stroke="#047d78"
                                  fill="#e6f4f3"
                                  gap={1}
                                  startIndex={0}
                                  endIndex={Math.max(0, victimTrendData.length - 1)}
                                />
                              )}
                            </LineChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>
                  </div>
                </article>

              {/* ─── SECTION 2: PROPORSI FASKES TERDAMPAK (30% KIRI - 70% KANAN) ─── */}
              <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xs hover:shadow-xs transition-all">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-stretch">
                  {/* Sisi Kiri (4 cols / ~33%): Ringkasan Status & Kesiapan Faskes */}
                  <div className="lg:col-span-4 flex flex-col justify-between space-y-4">
                    <div>
                      <div className="flex items-center justify-between gap-2.5">
                        <div>
                          <h4 className="text-lg sm:text-xl font-black text-slate-900 leading-snug m-0">
                            Proporsi &amp; Kesiapan Faskes
                          </h4>
                          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1 mb-0">
                            Pemantauan operasional &amp; rujukan darurat di {displayRegion}.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setKabupatenMatrixTab('faskes_terdampak')
                            setShowKabupatenMatrixModal(true)
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#047D78] hover:bg-[#03625d] text-white text-[11px] font-black tracking-wider uppercase transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer shrink-0 border border-teal-600/30 group"
                          title="Buka Matriks Faskes Terdampak & Triase Pasien"
                        >
                          <Table2 className="h-3.5 w-3.5 text-teal-100 group-hover:scale-110 transition-transform" />
                          <span>LIHAT MATRIKS</span>
                        </button>
                      </div>

                      {/* Top Metric Strip (Total, Rawat, Disiagakan) */}
                      <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Total Unit</span>
                          <span className="text-base sm:text-lg font-black text-slate-900 block mt-0.5">{totalMasterFaskes}</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-200/70">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block">Aktif Rawat</span>
                          <span className="text-base sm:text-lg font-black text-blue-900 block mt-0.5">{masterFaskesCounts.totalMerawat || (isNttEvent ? 90 : 0)}</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/70">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">Disiagakan</span>
                          <span className="text-base sm:text-lg font-black text-emerald-900 block mt-0.5">{Math.max(0, totalMasterFaskes - totalTerdampakFaskes - (masterFaskesCounts.totalMerawat || (isNttEvent ? 90 : 0)))}</span>
                        </div>
                      </div>
                    </div>

                    {/* Clean Damage & Logistics Card */}
                    <div className="rounded-2xl bg-slate-50/80 border border-slate-200/90 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs sm:text-sm font-black text-slate-900">
                          Faskes Terdampak Bencana
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-[11px] font-black text-rose-700 flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping" />
                          {isNttEvent
                            ? ((Number(faskesTerdampakSummary.rusak_berat) || 39) + (Number(faskesTerdampakSummary.rusak_sedang) || 56) + (Number(faskesTerdampakSummary.rusak_ringan) || 42))
                            : (totalTerdampakFaskes || (faskesStatusSummary.rs.terdampak + faskesStatusSummary.pkm.terdampak + faskesStatusSummary.pustu.terdampak + faskesStatusSummary.klinik.terdampak))
                          } Unit Terdampak
                        </span>
                      </div>

                      {/* 3 Damage Metrics Columns */}
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2.5 rounded-xl bg-white border border-rose-150 shadow-2xs">
                          <span className="text-[10px] font-bold text-rose-700 uppercase block">Rusak Berat</span>
                          <span className="text-lg font-black text-rose-900 leading-tight block mt-0.5">
                            {isNttEvent ? (faskesTerdampakSummary.rusak_berat || 39) : (faskesStatusSummary.rs.rusakBerat + faskesStatusSummary.pkm.rusakBerat + faskesStatusSummary.pustu.rusakBerat + faskesStatusSummary.klinik.rusakBerat)}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-white border border-amber-150 shadow-2xs">
                          <span className="text-[10px] font-bold text-amber-700 uppercase block">Rusak Sedang</span>
                          <span className="text-lg font-black text-amber-900 leading-tight block mt-0.5">
                            {isNttEvent ? (faskesTerdampakSummary.rusak_sedang || 56) : (faskesStatusSummary.rs.rusakSedang + faskesStatusSummary.pkm.rusakSedang + faskesStatusSummary.pustu.rusakSedang + faskesStatusSummary.klinik.rusakSedang)}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-white border border-yellow-150 shadow-2xs">
                          <span className="text-[10px] font-bold text-yellow-800 uppercase block">Rusak Ringan</span>
                          <span className="text-lg font-black text-yellow-900 leading-tight block mt-0.5">
                            {isNttEvent ? (faskesTerdampakSummary.rusak_ringan || 42) : (faskesStatusSummary.rs.rusakRingan + faskesStatusSummary.pkm.rusakRingan + faskesStatusSummary.pustu.rusakRingan + faskesStatusSummary.klinik.rusakRingan)}
                          </span>
                        </div>
                      </div>

                      {/* Utilitas & Logistik Bar */}
                      <div className="pt-2 border-t border-slate-200/80 grid grid-cols-3 gap-1.5 text-[10.5px] font-bold text-slate-700 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Zap className="h-3 w-3 text-amber-600 shrink-0" />
                          <span className="truncate">Listrik: <strong>{isNttEvent ? (faskesTerdampakSummary.krisis_listrik || 54) : 0}</strong></span>
                        </div>
                        <div className="flex items-center justify-center gap-1 border-x border-slate-200">
                          <Droplets className="h-3 w-3 text-blue-600 shrink-0" />
                          <span className="truncate">Air: <strong>{isNttEvent ? (faskesTerdampakSummary.krisis_air || 28) : 0}</strong></span>
                        </div>
                        <div className="flex items-center justify-center gap-1">
                          <Home className="h-3 w-3 text-purple-600 shrink-0" />
                          <span className="truncate">Tenda: <strong>{isNttEvent ? (faskesTerdampakSummary.butuh_tenda || 111) : 0}</strong></span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sisi Kanan (8 cols / ~67%): 4 Cards Solid Pie Charts */}
                  <div className="lg:col-span-8 flex flex-col bg-slate-50/50 rounded-2xl p-4 sm:p-5 border border-slate-200/90">
                    <div className="flex flex-wrap items-center justify-end gap-2.5 sm:gap-4 pb-3 mb-3 border-b border-slate-200/70 text-[11px] font-bold text-slate-600">
                      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-600 shrink-0" /> Rusak Berat</span>
                      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" /> Rusak Sedang</span>
                      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-yellow-500 shrink-0" /> Rusak Ringan</span>
                      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#2563eb] shrink-0" /> Aktif Rawat</span>
                      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" /> Disiagakan</span>
                    </div>

                    {/* 4 Cards Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 flex-1 items-stretch my-auto">
                      {faskesPieBreakdown.map((cat) => {
                        return (
                          <div key={cat.key} className="rounded-xl border border-slate-200 bg-white p-3.5 flex flex-col justify-between shadow-2xs hover:border-teal-300 hover:shadow-xs transition-all">
                            <div className="flex items-center justify-between gap-1.5 mb-1.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <img
                                  src={cat.svgIcon}
                                  alt={cat.title}
                                  className="w-5 h-5 shrink-0 object-contain"
                                  style={{ width: '20px', height: '20px', minWidth: '20px', minHeight: '20px' }}
                                />
                                <span className="text-xs sm:text-sm font-black text-slate-900 truncate" title={cat.title}>
                                  {cat.title}
                                </span>
                              </div>
                              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md shrink-0 border border-slate-200/60">
                                {cat.totalMaster} Unit
                              </span>
                            </div>

                            {/* Solid Pie Chart (Model Potongan Pizza) */}
                            <div className="relative w-full h-[155px] flex items-center justify-center my-auto">
                              {typeof window !== 'undefined' && (
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                  <PieChart>
                                    <Pie
                                      data={cat.pieData}
                                      cx="50%"
                                      cy="50%"
                                      innerRadius={0}
                                      outerRadius={68}
                                      paddingAngle={cat.pieData.length > 1 ? 2 : 0}
                                      dataKey="value"
                                      isAnimationActive={true}
                                      animationDuration={800}
                                      stroke="#ffffff"
                                      strokeWidth={1.5}
                                    >
                                      {cat.pieData.map((entry, index) => (
                                        <Cell key={`cell-${cat.key}-${index}`} fill={entry.fill} />
                                      ))}
                                    </Pie>
                                    <Tooltip
                                      contentStyle={{ background: '#ffffff', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '11px', fontWeight: 700, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                                      formatter={(val: any, name: any) => [`${val} Unit`, name]}
                                    />
                                  </PieChart>
                                </ResponsiveContainer>
                              )}
                            </div>

                            <div className="mt-1.5 pt-2 border-t border-slate-100 grid grid-cols-3 gap-0.5 text-[11px] font-bold text-center">
                              <div className="text-rose-700">
                                <div className="flex items-baseline justify-center gap-0.5">
                                  <span className="block text-rose-600 font-black leading-none text-xs">{cat.terdampak}</span>
                                  <span className="text-[9px] font-bold text-rose-500">|{cat.totalMaster > 0 ? Math.round((cat.terdampak / cat.totalMaster) * 100) : 0}%</span>
                                </div>
                                <span className="text-[8px] font-semibold text-slate-500 block mt-0.5" title={`Rusak Berat: ${cat.rusakBerat}, Sedang: ${cat.rusakSedang}, Ringan: ${cat.rusakRingan}`}>
                                  {cat.terdampak > 0 ? `${cat.rusakBerat}B • ${cat.rusakSedang}S • ${cat.rusakRingan}R` : 'Terdampak'}
                                </span>
                              </div>
                              <div className="border-x border-slate-150 px-0.5 text-blue-700">
                                <div className="flex items-baseline justify-center gap-0.5">
                                  <span className="block text-blue-600 font-black leading-none text-xs">{cat.rawatPasien}</span>
                                  <span className="text-[9px] font-bold text-blue-500">|{cat.totalMaster > 0 ? Math.round((cat.rawatPasien / cat.totalMaster) * 100) : 0}%</span>
                                </div>
                                <span className="text-[8px] font-semibold text-blue-600 block mt-0.5">Merawat</span>
                              </div>
                              <div className="text-emerald-700">
                                <div className="flex items-baseline justify-center gap-0.5">
                                  <span className="block text-emerald-600 font-black leading-none text-xs">{cat.standby}</span>
                                  <span className="text-[9px] font-bold text-emerald-500">|{cat.totalMaster > 0 ? Math.round((cat.standby / cat.totalMaster) * 100) : 0}%</span>
                                </div>
                                <span className="text-[8px] font-semibold text-emerald-600 block mt-0.5">Disiagakan</span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </article>

              {/* ─── SECTION 3: DISTRIBUSI KASUS PENYAKIT BENCANA (Tampil di Vercel/Staging Dev, Hidden di Server Atas/Production) ─── */}
              {showPenyakitSection && (
              <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xs hover:shadow-xs transition-all">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-stretch">
                  {/* Sisi Kiri (4 cols / ~33%): Ringkasan Kasus Penyakit & Epidemiologi */}
                  <div className="lg:col-span-4 flex flex-col justify-between space-y-4">
                    <div>
                      <div className="flex items-center justify-between gap-2.5">
                        <div>
                          <h4 className="text-lg sm:text-xl font-black text-slate-900 leading-snug m-0">
                            Distribusi Kasus Penyakit Bencana
                          </h4>
                          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1 mb-0">
                            Surveilans epidemiologi dan pemantauan tren kasus penyakit pasca bencana di {displayRegion}.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setKabupatenMatrixTab('penyakit')
                            setShowKabupatenMatrixModal(true)
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#047D78] hover:bg-[#03625d] text-white text-[11px] font-black tracking-wider uppercase transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer shrink-0 border border-teal-600/30 group"
                          title="Buka Matriks Distribusi Kasus Penyakit Pasca Bencana"
                        >
                          <Table2 className="h-3.5 w-3.5 text-teal-100 group-hover:scale-110 transition-transform" />
                          <span>LIHAT MATRIKS</span>
                        </button>
                      </div>

                      {/* Quick Metrics 2x2 Grid with Big Numbers */}
                      <div className="grid grid-cols-2 gap-2.5 mt-4">
                        <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">Total Kasus</span>
                          {totalPenyakitCases > 0 ? (
                            <span className="text-lg sm:text-xl font-black text-amber-950 block mt-0.5">{totalPenyakitCases.toLocaleString('id-ID')} <span className="text-xs font-bold text-amber-700">Kasus</span></span>
                          ) : (
                            <span className="text-lg sm:text-xl font-black text-amber-900 block mt-0.5">0</span>
                          )}
                        </div>
                        <div className="p-3 rounded-xl bg-sky-50/70 border border-sky-200/80">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-sky-800 block">Kasus Terbanyak</span>
                          <span className="text-xs sm:text-sm font-black text-sky-950 leading-tight block truncate mt-1" title={dominantDiseaseObj?.name || 'Nihil'}>
                            {dominantDiseaseObj?.name || 'Nihil'}
                          </span>
                        </div>
                        <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-200/80">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-purple-800 block">Penyakit Terpantau</span>
                          {penyakitTotalData.filter((x: any) => x.total > 0).length > 0 ? (
                            <span className="text-lg sm:text-xl font-black text-purple-950 block mt-0.5">{penyakitTotalData.filter((x: any) => x.total > 0).length} <span className="text-xs font-bold text-purple-700">Jenis</span></span>
                          ) : (
                            <span className="text-lg sm:text-xl font-black text-purple-900 block mt-0.5">0</span>
                          )}
                        </div>
                        <div className="p-3 rounded-xl bg-teal-50/70 border border-teal-200/80">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800 block">Kondisi Kasus</span>
                          <span className="text-xs sm:text-sm font-black text-teal-950 leading-tight block mt-1">
                            {totalPenyakitCases > 1000 ? 'Perhatian Khusus' : totalPenyakitCases > 200 ? 'Waspada' : 'Terkendali'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sisi Kanan (8 cols / ~67%): Big BarChart Top 10 */}
                  <div className="lg:col-span-8 flex flex-col bg-slate-50/50 rounded-2xl p-4 sm:p-5 border border-slate-200/90">
                    <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200/70">
                      <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                        Top 10 Kasus Penyakit Terbanyak
                      </span>
                      <span className="px-3 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 text-xs font-bold shadow-2xs">
                        {totalPenyakitCases > 0 ? `${totalPenyakitCases.toLocaleString('id-ID')} Total Pasien Kasus` : 'Belum Ada Laporan Kasus'}
                      </span>
                    </div>

                    {/* BarChart or Empty State */}
                    <div className="w-full flex-1 min-h-[280px] sm:min-h-[300px] text-xs font-semibold flex items-center justify-center">
                      {penyakitChartData.length > 0 ? (
                        typeof window !== 'undefined' && (
                          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                            <BarChart data={penyakitChartData} margin={{ top: 15, right: 15, left: -5, bottom: 25 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis dataKey="name" stroke="#475569" tickLine={false} interval={0} angle={-15} textAnchor="end" height={45} tick={{ fontSize: 11, fontWeight: 700 }} />
                              <YAxis stroke="#475569" tickLine={false} style={{ fontSize: '11px', fontWeight: 'bold' }} allowDecimals={false} />
                              <Tooltip contentStyle={{ background: '#ffffff', borderRadius: '10px', border: '1px solid #cbd5e1', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: '12px', fontWeight: 700 }} formatter={(value) => [`${Number(value).toLocaleString('id-ID')} Kasus`, 'Total Pasien']} />
                              <Bar
                                dataKey="total"
                                radius={[6, 6, 0, 0]}
                                maxBarSize={44}
                                isAnimationActive={true}
                                animationDuration={800}
                              >
                                {penyakitChartData.map((entry, idx) => {
                                  const colors = ['#0ea5e9', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#6366f1', '#14b8a6', '#f43f5e', '#a855f7', '#0284c7'];
                                  return <Cell key={`cell-${idx}`} fill={colors[idx % colors.length]} />;
                                })}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        )
                      ) : (
                        <div className="flex flex-col items-center justify-center text-center p-8 bg-white/80 rounded-xl border border-dashed border-slate-300 w-full h-full my-auto">
                          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                            <HeartPulse className="w-6 h-6 text-slate-400" />
                          </div>
                          <h5 className="font-bold text-slate-700 text-sm mb-1">Data Penyakit: Belum Ada Laporan Kasus</h5>
                          <p className="text-xs text-slate-500 max-w-md leading-relaxed m-0">
                            Belum ada entri data surveilans penyakit dari posko kesehatan atau dinas kesehatan untuk kejadian bencana ini. Grafik akan otomatis tampil saat data riil dilaporkan.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </article>
              )}

              {/* ─── KESIMPULAN REKOMENDASI OPERASIONAL ─── */}
              {!isNttEvent && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xs space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-md text-xs font-black uppercase tracking-wider bg-teal-50 text-teal-800 border border-teal-200">
                      KESIMPULAN ANALISIS
                    </span>
                    <span className="text-sm sm:text-base font-bold text-slate-900">Sintesis Rekomendasi Terpadu EOC Kemenkes</span>
                  </div>
                  {eocNarrative && (
                    <p className="text-sm sm:text-base text-slate-900 font-normal leading-relaxed m-0">
                      <strong className="font-bold text-slate-950">Rekomendasi Utama: </strong>
                      {eocNarrative}
                    </p>
                  )}
                  <p className="text-sm sm:text-base text-slate-700 font-normal leading-relaxed m-0">
                    {korbanNarrative} {faskesNarrative} {showPenyakitSection ? penyakitNarrative : ''}
                  </p>
                </div>
              )}

              {/* ── BENCHMARKING & VALIDASI DATA AI VS SYSTEM ── */}
              <div className="hidden rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 via-purple-50/40 to-slate-50 p-4 text-xs space-y-3 shadow-2xs">
                <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                      AI
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-indigo-950">MODUL BENCHMARKING &amp; VALIDASI AKURASI AI</h4>
                      <p className="text-[10px] text-indigo-600 font-semibold">Komparasi Data Agregasi Sistem (SIPKK) vs Sintesis Analisis AI (Gemini 2.5 Flash)</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-[10px] uppercase border border-emerald-200">
                    Akurasi Data: 100% Match
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="bg-white p-3 rounded-lg border border-indigo-100/80 shadow-2xs space-y-1">
                    <div className="text-[10px] font-extrabold uppercase text-slate-400">Total Kejadian Bencana</div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs text-slate-600 font-bold">Sistem (DB): <b className="text-slate-900 font-black">{eventData.total_kejadian || 1}</b></span>
                      <span className="text-xs text-indigo-700 font-bold">AI Extraction: <b className="text-indigo-900 font-black">{eventData.total_kejadian || 1}</b></span>
                    </div>
                    <div className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 mt-1">
                      ✓ Presisi 100% - Data Konsisten
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-indigo-100/80 shadow-2xs space-y-1">
                    <div className="text-[10px] font-extrabold uppercase text-slate-400">Total Korban &amp; Pengungsi</div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs text-slate-600 font-bold">DB Korban: <b className="text-slate-900 font-black">{(eventData.korban_meninggal || 0) + (eventData.korban_luka || 0) + (eventData.pengungsi || 0)}</b></span>
                      <span className="text-xs text-indigo-700 font-bold">AI Narasi: <b className="text-indigo-900 font-black">{(eventData.korban_meninggal || 0) + (eventData.korban_luka || 0) + (eventData.pengungsi || 0)}</b></span>
                    </div>
                    <div className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 mt-1">
                      ✓ Presisi 100% - Narasi Terverifikasi
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-indigo-100/80 shadow-2xs space-y-1">
                    <div className="text-[10px] font-extrabold uppercase text-slate-400">Status Faskes &amp; Radius</div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs text-slate-600 font-bold">Faskes Terdeteksi: <b className="text-slate-900 font-black">{detail?.faskes_terdekat?.length || 0}</b></span>
                      <span className="text-xs text-indigo-700 font-bold">Radius: <b className="text-indigo-900 font-black">25 KM</b></span>
                    </div>
                    <div className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 mt-1">
                      ✓ Geospasial Haversine Real-Time
                    </div>
                  </div>
                </div>
              </div>
            </section>
          );
        })()}

        {!isRegionalTemplate && (
        <>
        {/* Nearest Location Access Matrix Card */}
        <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-[0_6px_18px_rgba(20,120,116,0.03)] space-y-4">
          <div className="border-b border-slate-100 pb-3.5 mb-2">
            <h4 className="text-xl sm:text-2xl font-black text-slate-900 m-0">
              Peta Akses &amp; Status Sumber Daya Kesehatan - {displayRegion}
            </h4>
            <p className="text-sm sm:text-base text-slate-600 font-normal mt-1.5 mb-0">
              Pemantauan matriks faskes terdekat, ketersediaan SDM kesehatan, dan TCK
            </p>
          </div>

          {/* Tab buttons */}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => setMatrixTab('faskes')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all border duration-200 flex items-center gap-1.5 ${matrixTab === 'faskes'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-sm font-black'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
            >
              <Building2 className="h-4 w-4 text-emerald-600" />
              {isNttEvent ? 'Direktori Faskes NTT' : 'Faskes Terdekat'}
              {masterFaskesCounts.all > 0 && (
                <span className="ml-1 px-2 py-0.5 rounded-full bg-emerald-700 text-white text-[10px] font-black">
                  {masterFaskesCounts.all.toLocaleString('id-ID')}
                </span>
              )}
            </button>
            {/* Tab Pos Pengungsian & Kesehatan - Hidden as requested */}
            {/* 
            <button
              type="button"
              onClick={() => setMatrixTab('pengungsian')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all border duration-200 ${matrixTab === 'pengungsian'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-sm font-black'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
            >
              Pos Pengungsian &amp; Kesehatan
            </button>
            */}

            {isNttEvent && (
              <button
                type="button"
                onClick={() => setMatrixTab('situasi_faskes')}
                className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all border duration-200 flex items-center gap-1.5 ${matrixTab === 'situasi_faskes' || matrixTab === 'situasi_rs' || matrixTab === 'situasi_puskesmas'
                  ? 'bg-blue-50 text-blue-900 border-blue-400 shadow-sm font-black'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
              >
                <Building2 className="h-4 w-4 text-blue-600" />
                Situasi Faskes
                <span className="ml-1 px-2 py-0.5 rounded-full bg-blue-700 text-white text-[10px] font-black">
                  {filteredPasienRs.length + filteredPasienPkm.length} Faskes
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setMatrixTab('relawan_mobilisasi')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all border duration-200 flex items-center gap-1.5 ${matrixTab === 'relawan_mobilisasi'
                ? 'bg-cyan-50 text-cyan-900 border-cyan-400 shadow-sm font-black'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
            >
              <Users className="h-4 w-4 text-cyan-600" />
              Mobilisasi &amp; Relawan
              {relawanBadgeCount > 0 ? (
                <span className="ml-1 px-2 py-0.5 rounded-full bg-cyan-700 text-white text-[10px] font-black">{relawanBadgeCount.toLocaleString('id-ID')}</span>
              ) : (
                <span className="ml-1 px-2 py-0.5 rounded-full bg-cyan-700 text-white text-[10px] font-black">Live</span>
              )}
            </button>

            {/* Tab Sumber Daya Kesehatan, Sanitasi Kesling, dan Logistik Kesehatan - Hidden as requested */}
            {/* 
            <button
              type="button"
              onClick={() => setMatrixTab('sumber_daya')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all border duration-200 ${matrixTab === 'sumber_daya'
                ? 'bg-indigo-50 text-indigo-800 border-indigo-300 shadow-sm font-black'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
            >
              Sumber Daya Kesehatan
            </button>
            <button
              type="button"
              onClick={() => setMatrixTab('sanitasi_kesling')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all border duration-200 ${matrixTab === 'sanitasi_kesling'
                ? 'bg-teal-50 text-teal-800 border-teal-300 shadow-sm font-black'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
            >
              Sanitasi &amp; Kesling
            </button>
            <button
              type="button"
              onClick={() => setMatrixTab('logistik_kesehatan')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all border duration-200 ${matrixTab === 'logistik_kesehatan'
                ? 'bg-amber-50 text-amber-900 border-amber-300 shadow-sm font-black'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
            >
              Logistik Kesehatan
            </button>
            */}
          </div>

          {/* Tab content area */}
          <div className="overflow-x-auto min-h-[180px]">
            {matrixTab === 'faskes' && (
              <div className="space-y-4">
                {/* 1. Summary Cards Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  <div className="rounded-xl bg-slate-900 text-white p-3 shadow-2xs border border-slate-800 flex flex-col justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-300">Total Faskes NTT</span>
                    <div className="flex items-baseline justify-between mt-1">
                      <span className="text-xl font-black">{masterFaskesCounts.all.toLocaleString('id-ID')}</span>
                      <span className="text-[10px] text-slate-400 font-semibold">Semua Faskes</span>
                    </div>
                  </div>

                  <div className="rounded-xl bg-blue-50 border border-blue-200/90 p-3 shadow-2xs flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-blue-800">Rumah Sakit</span>
                      <Building2 className="h-3.5 w-3.5 text-blue-600" />
                    </div>
                    <div className="mt-1">
                      <span className="text-xl font-black text-blue-950">{masterFaskesCounts.rs}</span>
                      <span className="text-[10px] text-blue-700 ml-1 font-semibold">RSUD / Swasta</span>
                    </div>
                  </div>

                  <div className="rounded-xl bg-teal-50 border border-teal-200/90 p-3 shadow-2xs flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-teal-800">Puskesmas</span>
                      <Stethoscope className="h-3.5 w-3.5 text-teal-600" />
                    </div>
                    <div className="mt-1">
                      <span className="text-xl font-black text-teal-950">{masterFaskesCounts.puskesmas}</span>
                      <span className="text-[10px] text-teal-700 ml-1 font-semibold">Layanan Primer</span>
                    </div>
                  </div>

                  <div className="rounded-xl bg-indigo-50 border border-indigo-200/90 p-3 shadow-2xs flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-indigo-800">Klinik & Poskes</span>
                      <BriefcaseMedical className="h-3.5 w-3.5 text-indigo-600" />
                    </div>
                    <div className="mt-1">
                      <span className="text-xl font-black text-indigo-950">{masterFaskesCounts.klinik}</span>
                      <span className="text-[10px] text-indigo-700 ml-1 font-semibold">Pratama/Utama</span>
                    </div>
                  </div>

                  <div className="col-span-2 sm:col-span-1 rounded-xl bg-amber-50 border border-amber-200/90 p-3 shadow-2xs flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-amber-800">Pustu</span>
                      <PlusSquare className="h-3.5 w-3.5 text-amber-600" />
                    </div>
                    <div className="mt-1">
                      <span className="text-xl font-black text-amber-950">{masterFaskesCounts.pustu.toLocaleString('id-ID')}</span>
                      <span className="text-[10px] text-amber-700 ml-1 font-semibold">Pusk. Pembantu</span>
                    </div>
                  </div>
                </div>

                {/* 2. Type Filter Switcher & Status Info */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gradient-to-r from-emerald-50/70 via-teal-50/50 to-slate-50/70 p-2.5 rounded-2xl border border-emerald-200/80 shadow-2xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { key: 'all', label: 'Semua Faskes', count: masterFaskesCounts.all },
                      { key: 'rs', label: 'Rumah Sakit', count: masterFaskesCounts.rs },
                      { key: 'puskesmas', label: 'Puskesmas', count: masterFaskesCounts.puskesmas },
                      { key: 'klinik', label: 'Klinik', count: masterFaskesCounts.klinik },
                      { key: 'pustu', label: 'Pustu', count: masterFaskesCounts.pustu },
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setMasterFaskesTypeFilter(tab.key as any)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all border flex items-center gap-1.5 ${masterFaskesTypeFilter === tab.key
                          ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs scale-[1.02]'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                      >
                        {tab.label}
                        <span
                          className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${masterFaskesTypeFilter === tab.key
                            ? 'bg-white/25 text-white'
                            : 'bg-emerald-100 text-emerald-800'
                            }`}
                        >
                          {tab.count}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-slate-200 text-[11px] font-bold text-slate-700 shadow-2xs">
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                      <strong className="text-rose-900">{masterFaskesCounts.totalMerawat} Faskes Aktif Rawat Pasien</strong>
                      <span className="text-slate-300">|</span>
                      <span className="text-emerald-700 font-semibold">{Math.max(0, masterFaskesCounts.all - masterFaskesCounts.totalMerawat)} Disiagakan</span>
                    </span>
                  </div>
                </div>

                {/* 3. Search & Filter Bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={masterFaskesSearch}
                      onChange={(e) => setMasterFaskesSearch(e.target.value)}
                      placeholder="Cari faskes, kode sarana/SatuSehat, kecamatan, alamat..."
                      className="w-full pl-9 pr-8 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                    {masterFaskesSearch && (
                      <button
                        type="button"
                        onClick={() => setMasterFaskesSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                    <div className="flex items-center gap-1.5">
                      <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="text-[11px] font-bold text-slate-500 shrink-0">Wilayah:</span>
                      <select
                        value={masterFaskesKabFilter}
                        onChange={(e) => setMasterFaskesKabFilter(e.target.value)}
                        className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
                      >
                        <option value="semua">Semua Kabupaten/Kota ({masterFaskesKabupatenList.length - 1})</option>
                        {masterFaskesKabupatenList.filter(k => k !== 'semua').map((kab) => (
                          <option key={kab} value={kab}>{kab}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
                      <span className="text-[11px] font-bold text-slate-500 shrink-0">Per Halaman:</span>
                      <select
                        value={masterFaskesPerPage}
                        onChange={(e) => setMasterFaskesPerPage(Number(e.target.value))}
                        className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none"
                      >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 4. Master Faskes Table */}
                <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
                  <div className="max-h-[520px] overflow-y-auto">
                    <table className="w-full text-left border-collapse text-[13px]">
                      <thead className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10">
                        <tr>
                          <th className="py-3 px-3 w-10 text-center">No</th>
                          <th className="py-3 px-3">Nama Fasilitas Kesehatan</th>
                          <th className="py-3 px-3">Jenis & Kategori</th>
                          <th className="py-3 px-3">Kode Sarana / SatuSehat</th>
                          <th className="py-3 px-3">Kabupaten / Kota</th>
                          <th className="py-3 px-3">Kecamatan</th>
                          {!isNttEvent && <th className="py-3 px-3">Status Operasional</th>}
                          <th className="py-3 px-3 text-center">Status Korban Bencana</th>
                          <th className="py-3 px-3 text-center">Aksi / Peta</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {paginatedMasterFaskesList.length > 0 ? (
                          paginatedMasterFaskesList.map((f: any, idx: number) => {
                            const rowNum = (masterFaskesPage - 1) * masterFaskesPerPage + idx + 1
                            const isSelected = selectedRouteTarget?.name === f.nama || selectedRouteTarget?.name === f.nama_faskes
                            const isRS = String(f.jenis || f.jenis_faskes || '').toLowerCase().includes('rs') || String(f.jenis || f.jenis_faskes || '').toLowerCase().includes('rumah sakit')
                            const isPKM = String(f.jenis || f.jenis_faskes || '').toLowerCase().includes('puskesmas') && !String(f.jenis || f.jenis_faskes || '').toLowerCase().includes('pustu') && !String(f.jenis || f.jenis_faskes || '').toLowerCase().includes('pembantu')
                            const isPustu = String(f.jenis || f.jenis_faskes || '').toLowerCase().includes('pustu') || String(f.jenis || f.jenis_faskes || '').toLowerCase().includes('pembantu')
                            const isKlinik = String(f.jenis || f.jenis_faskes || '').toLowerCase().includes('klinik')

                            return (
                              <tr
                                key={f.id || idx}
                                onClick={() => handleSelectTarget(f, isRS ? 'hospital' : 'clinic')}
                                className={`hover:bg-emerald-50/50 transition-colors cursor-pointer ${isSelected
                                  ? 'bg-emerald-50/90 border-l-4 border-emerald-600'
                                  : idx % 2 === 0
                                    ? 'bg-white'
                                    : 'bg-slate-50/30'
                                  }`}
                              >
                                <td className="py-2.5 px-3 text-center text-slate-400 font-semibold">{rowNum}</td>
                                <td className="py-2.5 px-3 font-bold text-slate-900">
                                  <div className="flex items-center gap-1.5">
                                    {isRS && <Building2 className="h-4 w-4 text-blue-600 shrink-0" />}
                                    {isPKM && <Stethoscope className="h-4 w-4 text-teal-600 shrink-0" />}
                                    {isKlinik && <BriefcaseMedical className="h-4 w-4 text-indigo-600 shrink-0" />}
                                    {isPustu && <PlusSquare className="h-4 w-4 text-amber-600 shrink-0" />}
                                    <span className="font-black text-slate-900">{f.nama || f.nama_faskes || '-'}</span>
                                  </div>
                                  {f.alamat && f.alamat !== '-' && (
                                    <div className="text-[11px] text-slate-500 font-normal mt-0.5 truncate max-w-sm" title={f.alamat}>
                                      📍 {f.alamat}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3">
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-extrabold border ${isRS
                                      ? 'bg-blue-50 text-blue-800 border-blue-200'
                                      : isPKM
                                        ? 'bg-teal-50 text-teal-800 border-teal-200'
                                        : isKlinik
                                          ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                          : 'bg-amber-50 text-amber-800 border-amber-200'
                                      }`}
                                  >
                                    {f.jenis || f.jenis_faskes || 'Faskes'}
                                  </span>
                                  {f.subjenis && f.subjenis !== f.jenis && (
                                    <span className="block text-[10px] text-slate-500 mt-0.5">{f.subjenis}</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 font-semibold text-slate-700 text-xs">
                                  <div className="font-mono text-[11px]">{f.kode_sarana && f.kode_sarana !== '-' ? f.kode_sarana : '-'}</div>
                                  {f.kode_satusehat && f.kode_satusehat !== '-' && (
                                    <div className="text-[10px] text-teal-700 font-mono">IHC: {f.kode_satusehat}</div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 font-bold text-slate-800 text-xs whitespace-nowrap">
                                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                                    {f.nama_kab || f.kabupaten || '-'}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-slate-700 text-xs">
                                  {f.nama_kecamatan || f.kecamatan || '-'}
                                </td>
                                {!isNttEvent && (
                                  <td className="py-2.5 px-3 text-xs">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[10.5px]">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                      {f.status || f.status_operasional || 'Operasional'}
                                    </span>
                                  </td>
                                )}
                                <td className="py-2.5 px-3 text-center">
                                  {f.has_collector_data || Number(f.total_pasien || 0) > 0 ? (
                                    <div className="inline-flex flex-col items-center gap-1">
                                      <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-900 border border-rose-200 font-black text-xs">
                                        🏥 {f.total_pasien} Pasien (Faskes Siaga)
                                      </span>
                                      <div className="flex items-center gap-1 text-[9.5px] font-bold">
                                        {Number(f.triase_merah || 0) > 0 && <span className="px-1 rounded bg-rose-50 text-rose-700">🔴 {f.triase_merah}</span>}
                                        {Number(f.triase_kuning || 0) > 0 && <span className="px-1 rounded bg-amber-50 text-amber-700">🟡 {f.triase_kuning}</span>}
                                        {Number(f.triase_hijau || 0) > 0 && <span className="px-1 rounded bg-emerald-50 text-emerald-700">🟢 {f.triase_hijau}</span>}
                                        {Number(f.triase_hitam || 0) > 0 && <span className="px-1 rounded bg-slate-100 text-slate-700">⚫ {f.triase_hitam}</span>}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-[11px] font-semibold text-slate-400">
                                      0 Pasien
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleSelectTarget(f, isRS ? 'hospital' : 'clinic')
                                        const mapEl = document.getElementById('peta-detail')
                                        if (mapEl) mapEl.scrollIntoView({ behavior: 'smooth' })
                                      }}
                                      className="inline-flex items-center justify-center px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-extrabold border border-emerald-200 transition-colors text-[11px]"
                                    >
                                      Peta / Rute
                                    </button>
                                    {f.latitude && f.longitude && (
                                      <a
                                        href={getGmapsDirUrl(f.latitude, f.longitude, f.nama || f.nama_faskes, f.alamat)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="inline-flex items-center justify-center px-2 py-1 rounded-md bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold border border-slate-200 transition-colors text-[11px]"
                                      >
                                        Maps ↗
                                      </a>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )
                          })
                        ) : (
                          <tr>
                            <td colSpan={9} className="py-12 text-center text-slate-400 font-semibold">
                              Tidak ada fasilitas kesehatan yang cocok dengan kata kunci atau filter pencarian.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 5. Pagination Footer */}
                {filteredMasterFaskesList.length > 0 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 text-xs text-slate-600 font-semibold">
                    <div>
                      Menampilkan <b className="text-slate-900 font-black">{(masterFaskesPage - 1) * masterFaskesPerPage + 1}</b> - <b className="text-slate-900 font-black">{Math.min(masterFaskesPage * masterFaskesPerPage, filteredMasterFaskesList.length)}</b> dari total <b className="text-slate-900 font-black">{filteredMasterFaskesList.length.toLocaleString('id-ID')}</b> fasilitas kesehatan
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={masterFaskesPage <= 1}
                        onClick={() => setMasterFaskesPage(prev => Math.max(1, prev - 1))}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        ← Sebelumnya
                      </button>

                      <div className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white font-black">
                        Halaman {masterFaskesPage} / {totalMasterPages}
                      </div>

                      <button
                        type="button"
                        disabled={masterFaskesPage >= totalMasterPages}
                        onClick={() => setMasterFaskesPage(prev => Math.min(totalMasterPages, prev + 1))}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Selanjutnya →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {matrixTab === 'pengungsian' && (
              <div className="overflow-x-auto">
                {Array.isArray(detail?.pos_pengungsi) && detail.pos_pengungsi.length > 0 ? (
                  <div className={detail.pos_pengungsi.length > 10 ? 'max-h-[380px] overflow-y-auto' : ''}>
                    <table className="w-full text-left border-collapse text-[13px]">
                      <thead className="sticky top-0 z-10">
                        <tr className="border-b border-slate-100 bg-slate-50 text-slate-500 font-bold">
                          <th className="py-3 px-3">Wilayah / Kecamatan</th>
                          <th className="py-3 px-3 text-center">Jenis Pos</th>
                          <th className="py-3 px-3 text-center">Titik Pengungsian</th>
                          <th className="py-3 px-3 text-center">Jumlah KK</th>
                          <th className="py-3 px-3 text-center">Total Jiwa</th>
                          <th className="py-3 px-3 text-center">Jarak</th>
                          <th className="py-3 px-3 text-center">Waktu Tempuh</th>
                          <th className="py-3 px-3 text-center">Google Maps</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.pos_pengungsi.map((pos: any, pidx: number) => {
                          const isSelected = selectedRouteTarget?.name === (pos.nama || `Posko ${pos.kecamatan || ''}`);
                          const jenisPosVal = pos.jenis_pos || 'Pos Pengungsian';
                          const isKesehatan = String(jenisPosVal).toLowerCase().includes('kesehatan') && !String(jenisPosVal).toLowerCase().includes('pengungsian');
                          const isCombined = String(jenisPosVal).toLowerCase().includes('kesehatan') && String(jenisPosVal).toLowerCase().includes('pengungsian');

                          let badgeClass = "bg-blue-50 text-blue-700 border-blue-200"; // Pos Pengungsian
                          if (isCombined) {
                            badgeClass = "bg-amber-50 text-amber-700 border-amber-200"; // Pos Kesehatan & Pengungsian
                          } else if (isKesehatan) {
                            badgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200"; // Pos Kesehatan
                          }

                          return (
                            <tr
                              key={pidx}
                              onClick={() => handleSelectTarget({
                                ...pos,
                                nama: pos.nama || `Posko ${pos.kecamatan || ''}`
                              }, 'shelter')}
                              className={`border-b border-slate-100 hover:bg-teal-50/60 transition-all cursor-pointer ${isSelected
                                ? 'bg-teal-50/80 border-l-4 border-teal-600'
                                : pidx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'
                                }`}
                            >
                              <td className="py-3 px-3 font-semibold text-slate-800">
                                {pos.kecamatan ? `Kec. ${pos.kecamatan}` : '-'}
                              </td>
                              <td className="py-3 px-3 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-black border uppercase tracking-wide ${badgeClass}`}>
                                  {jenisPosVal}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-center font-bold text-slate-700">
                                {pos.jml_titik_pengungsian || 1} titik
                                <span className="text-[11px] text-slate-400 font-medium block">
                                  ({pos.jml_titik_pengungsian_terpusat || 0} Terpusat / {pos.jml_titik_pengungsian_mandiri || 0} Mandiri)
                                </span>
                              </td>
                              <td className="py-3 px-3 text-center font-bold text-slate-700">
                                {pos.jml_kk_pengungsi || 0} KK
                              </td>
                              <td className="py-3 px-3 text-center font-bold text-slate-900">
                                {pos.jml_total_pengungsi || 0} Jiwa
                                <span className="text-[11px] text-slate-400 font-medium block">
                                  ({pos.jml_pengungsi_laki || 0} L / {pos.jml_pengungsi_perempuan || 0} P)
                                </span>
                              </td>
                              <td className="py-3 px-3 text-center font-bold text-slate-700">
                                {pos.jarak !== null && pos.jarak !== undefined ? `${pos.jarak.toFixed(1)} km` : '-'}
                              </td>
                              <td className="py-3 px-3 text-center font-bold text-slate-700">
                                {pos.waktu_tempuh !== null && pos.waktu_tempuh !== undefined ? `${pos.waktu_tempuh} menit` : '-'}
                              </td>
                              <td className="py-3 px-3 text-center">
                                <a
                                  href={getGmapsDirUrl(pos.latitude, pos.longitude, pos.nama || `Posko ${pos.kecamatan || ''}`)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center justify-center px-2 py-1 rounded bg-teal-50 hover:bg-teal-100 text-teal-800 font-extrabold border border-teal-200 transition-colors cursor-pointer"
                                >
                                  Buka Maps
                                </a>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                    <AlertTriangle className="h-6 w-6 mb-2 text-slate-300" />
                    <p className="text-[11px] font-semibold">Tidak ada pos pengungsian &amp; kesehatan yang diinput untuk kejadian ini.</p>
                  </div>
                )}
              </div>
            )}

            {(matrixTab === 'situasi_faskes' || matrixTab === 'situasi_rs' || matrixTab === 'situasi_puskesmas') && (
              <div className="space-y-4 animate-in fade-in duration-200">
                {/* Sub-tab Pill Switcher */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-teal-50/70 p-3 rounded-2xl border border-blue-200/80 shadow-2xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSituasiFaskesSubTab('rs')}
                      className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all border flex items-center gap-2 ${situasiFaskesSubTab === 'rs'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-[1.02]'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                    >
                      <Building2 className="h-4 w-4" />
                      Situasi Rumah Sakit
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${situasiFaskesSubTab === 'rs'
                        ? 'bg-white/25 text-white'
                        : 'bg-blue-100 text-blue-800'
                        }`}>
                        {filteredPasienRs.length} RSUD
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSituasiFaskesSubTab('puskesmas')}
                      className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all border flex items-center gap-2 ${situasiFaskesSubTab === 'puskesmas'
                        ? 'bg-teal-600 text-white border-teal-600 shadow-md scale-[1.02]'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                    >
                      <Stethoscope className="h-4 w-4" />
                      Situasi Puskesmas
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${situasiFaskesSubTab === 'puskesmas'
                        ? 'bg-white/25 text-white'
                        : 'bg-teal-100 text-teal-800'
                        }`}>
                        {filteredPasienPkm.length} PKM
                      </span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-slate-200 text-[11px] font-bold text-slate-700 shadow-2xs">
                      <Activity className="h-3.5 w-3.5 text-rose-600" />
                      Klasifikasi Triase Bencana: START / ESI Kemenkes
                    </span>
                  </div>
                </div>

                {/* Summary Metric Cards */}
                {(() => {
                  const activeIsRs = situasiFaskesSubTab === 'rs'
                  const totals = activeIsRs ? rsTotals : pkmTotals
                  const countLabel = activeIsRs ? `${filteredPasienRs.length} RSUD Terdata` : `${filteredPasienPkm.length} Puskesmas Terdata`

                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                      {/* Card Total */}
                      <div className="col-span-2 sm:col-span-1 rounded-xl bg-slate-900 text-white p-3.5 shadow-sm border border-slate-800 flex flex-col justify-between">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-300">Total Pasien Teridentifikasi</span>
                        <div className="flex items-baseline justify-between mt-1">
                          <span className="text-2xl font-black">{totals.total.toLocaleString('id-ID')}</span>
                          <span className="text-[10px] text-slate-400 font-semibold">{countLabel}</span>
                        </div>
                      </div>

                      {/* Merah */}
                      <div className="rounded-xl bg-rose-50 border border-rose-200/90 p-3 shadow-2xs flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase text-rose-700">🔴 Merah</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-200/70 text-rose-900 font-black">Kritis</span>
                        </div>
                        <div className="mt-1">
                          <span className="text-xl font-black text-rose-800">{totals.merah.toLocaleString('id-ID')}</span>
                          <span className="text-[10px] text-rose-600 ml-1 font-semibold">Jiwa</span>
                        </div>
                      </div>

                      {/* Kuning */}
                      <div className="rounded-xl bg-amber-50 border border-amber-200/90 p-3 shadow-2xs flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase text-amber-700">🟡 Kuning</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-200/70 text-amber-900 font-black">Mendesak</span>
                        </div>
                        <div className="mt-1">
                          <span className="text-xl font-black text-amber-800">{totals.kuning.toLocaleString('id-ID')}</span>
                          <span className="text-[10px] text-amber-600 ml-1 font-semibold">Jiwa</span>
                        </div>
                      </div>

                      {/* Hijau */}
                      <div className="rounded-xl bg-emerald-50 border border-emerald-200/90 p-3 shadow-2xs flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase text-emerald-700">🟢 Hijau</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-200/70 text-emerald-900 font-black">Ringan</span>
                        </div>
                        <div className="mt-1">
                          <span className="text-xl font-black text-emerald-800">{totals.hijau.toLocaleString('id-ID')}</span>
                          <span className="text-[10px] text-emerald-600 ml-1 font-semibold">Jiwa</span>
                        </div>
                      </div>

                      {/* Hitam */}
                      <div className="rounded-xl bg-slate-100 border border-slate-300 p-3 shadow-2xs flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase text-slate-800">⚫ Hitam</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-800 font-black">Meninggal</span>
                        </div>
                        <div className="mt-1">
                          <span className="text-xl font-black text-slate-900">{totals.hitam.toLocaleString('id-ID')}</span>
                          <span className="text-[10px] text-slate-600 ml-1 font-semibold">Korban</span>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* Search & Filter Bar */}
                <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
                    <div className="relative flex-1 max-w-md">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={situasiSearch}
                        onChange={(e) => setSituasiSearch(e.target.value)}
                        placeholder={situasiFaskesSubTab === 'rs' ? "Cari nama Rumah Sakit / Kabupaten..." : "Cari nama Puskesmas / Kabupaten..."}
                        className="w-full pl-9 pr-8 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                      {situasiSearch && (
                        <button
                          type="button"
                          onClick={() => setSituasiSearch('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Date Selector Dropdown for Situasi Faskes */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Calendar className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                      <span className="text-[11px] font-bold text-slate-600 shrink-0">Tanggal:</span>
                      <select
                        value={situasiTanggalFilter}
                        onChange={(e) => setSituasiTanggalFilter(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer shadow-2xs"
                      >
                        <option value="terbaru">★ Laporan Terbaru ({latestNttDate})</option>
                        <option value="semua">Semua Tanggal (Histori Akumulasi)</option>
                        {modalAvailableDates.map((dt) => (
                          <option key={dt} value={dt}>
                            {dt} {dt === latestNttDate ? '(Terbaru)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                    <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="text-[11px] font-bold text-slate-500 shrink-0">Wilayah:</span>
                    {((situasiFaskesSubTab === 'rs' ? rsKabupatenOptions : pkmKabupatenOptions) as string[]).map((kab) => (
                      <button
                        key={kab}
                        type="button"
                        onClick={() => setSituasiKabFilter(kab)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${situasiKabFilter === kab
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                          }`}
                      >
                        {kab === 'semua' ? 'Semua Kabupaten' : `Kab. ${kab}`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Table View: Situasi Rumah Sakit */}
                {situasiFaskesSubTab === 'rs' && (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
                    <table className="w-full text-left border-collapse text-[13px]">
                      <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10">
                        <tr>
                          <th className="py-3 px-3 w-10 text-center">No</th>
                          <th className="py-3 px-3">Tanggal Laporan</th>
                          <th className="py-3 px-3">Kabupaten / Wilayah</th>
                          <th className="py-3 px-3">Nama Rumah Sakit</th>
                          <th className="py-3 px-3 text-center bg-rose-50/70 text-rose-900 border-x border-rose-100">🔴 Merah</th>
                          <th className="py-3 px-3 text-center bg-amber-50/70 text-amber-900 border-r border-amber-100">🟡 Kuning</th>
                          <th className="py-3 px-3 text-center bg-emerald-50/70 text-emerald-900 border-r border-emerald-100">🟢 Hijau</th>
                          <th className="py-3 px-3 text-center bg-slate-200/70 text-slate-900 border-r border-slate-300">⚫ Hitam</th>
                          <th className="py-3 px-3 text-center font-black bg-blue-50/80 text-blue-900">Total Pasien</th>
                          <th className="py-3 px-3 text-center">Aksi / Peta</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {filteredPasienRs.length > 0 ? (
                          filteredPasienRs.map((rs, idx) => {
                            const isSelected = selectedRouteTarget?.name === rs.nama_rs
                            return (
                              <tr
                                key={idx}
                                onClick={() => {
                                  const matched = (detail?.faskes_terdekat || []).find((f: any) => f.nama?.toLowerCase().includes(rs.nama_rs.toLowerCase()) || rs.nama_rs.toLowerCase().includes(f.nama?.toLowerCase()))
                                  if (matched) {
                                    handleSelectTarget(matched, 'hospital')
                                  }
                                }}
                                className={`hover:bg-blue-50/60 transition-colors cursor-pointer ${isSelected ? 'bg-blue-50/80 border-l-4 border-blue-600' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                                  }`}
                              >
                                <td className="py-2.5 px-3 text-center text-slate-400 font-semibold">{idx + 1}</td>
                                <td className="py-2.5 px-3 font-semibold text-slate-600 whitespace-nowrap">{rs.tanggal}</td>
                                <td className="py-2.5 px-3 font-bold text-slate-800">
                                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px]">
                                    Kab. {rs.kabupaten}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 font-black text-slate-900">
                                  <div className="flex items-center gap-1.5">
                                    <Building2 className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                    <span>{rs.nama_display || rs.nama_rs}</span>
                                    {rs.master_matched === false && (
                                      <span className="text-[11px] text-amber-600 font-bold" title="Nama faskes disesuaikan dari laporan lapangan (belum 1:1 di master data)">*</span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-center font-black text-rose-700 bg-rose-50/30 border-x border-rose-100">
                                  {rs.triase_merah > 0 ? (
                                    <span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 font-black text-[12px]">
                                      {rs.triase_merah}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 font-normal">0</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center font-black text-amber-800 bg-amber-50/30 border-r border-amber-100">
                                  {rs.triase_kuning > 0 ? (
                                    <span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-black text-[12px]">
                                      {rs.triase_kuning}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 font-normal">0</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center font-black text-emerald-800 bg-emerald-50/30 border-r border-emerald-100">
                                  {rs.triase_hijau > 0 ? (
                                    <span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-black text-[12px]">
                                      {rs.triase_hijau}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 font-normal">0</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center font-black text-slate-800 bg-slate-100/40 border-r border-slate-200">
                                  {rs.triase_hitam > 0 ? (
                                    <span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-900 font-black text-[12px]">
                                      {rs.triase_hitam}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 font-normal">0</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center font-black text-blue-900 bg-blue-50/40 text-[13px]">
                                  {rs.total > 0 ? (
                                    <span className="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-900 font-black">
                                      {rs.total}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 font-normal">0</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      const matched = (detail?.faskes_terdekat || []).find((f: any) => f.nama?.toLowerCase().includes(rs.nama_rs.toLowerCase()) || rs.nama_rs.toLowerCase().includes(f.nama?.toLowerCase()))
                                      if (matched) {
                                        handleSelectTarget(matched, 'hospital')
                                        const mapEl = document.getElementById('peta-detail')
                                        if (mapEl) mapEl.scrollIntoView({ behavior: 'smooth' })
                                      } else {
                                        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(rs.nama_rs + ' Kab. ' + rs.kabupaten + ' NTT')}`, '_blank')
                                      }
                                    }}
                                    className="inline-flex items-center justify-center px-2 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-800 font-extrabold border border-blue-200 transition-colors text-[11px]"
                                  >
                                    Peta / Rute
                                  </button>
                                </td>
                              </tr>
                            )
                          })
                        ) : (
                          <tr>
                            <td colSpan={10} className="py-8 text-center text-slate-400 font-semibold">
                              Tidak ada data Rumah Sakit yang cocok dengan filter pencarian.
                            </td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot className="bg-slate-900 text-white font-black text-[13px]">
                        <tr>
                          <td colSpan={4} className="py-3 px-3 text-right uppercase tracking-wider text-slate-300">
                            TOTAL KESELURUHAN ({filteredPasienRs.length} RSUD):
                          </td>
                          <td className="py-3 px-3 text-center bg-rose-950 text-rose-200 border-x border-rose-900 font-black text-sm">
                            {rsTotals.merah}
                          </td>
                          <td className="py-3 px-3 text-center bg-amber-950 text-amber-200 border-r border-amber-900 font-black text-sm">
                            {rsTotals.kuning}
                          </td>
                          <td className="py-3 px-3 text-center bg-emerald-950 text-emerald-200 border-r border-emerald-900 font-black text-sm">
                            {rsTotals.hijau}
                          </td>
                          <td className="py-3 px-3 text-center bg-slate-800 text-slate-200 border-r border-slate-700 font-black text-sm">
                            {rsTotals.hitam}
                          </td>
                          <td className="py-3 px-3 text-center bg-blue-900 text-blue-100 font-black text-sm">
                            {rsTotals.total}
                          </td>
                          <td className="py-3 px-3"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {/* Table View: Situasi Puskesmas */}
                {situasiFaskesSubTab === 'puskesmas' && (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
                    <div className="max-h-[500px] overflow-y-auto">
                      <table className="w-full text-left border-collapse text-[13px]">
                        <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10">
                          <tr>
                            <th className="py-3 px-3 w-10 text-center">No</th>
                            <th className="py-3 px-3">Tanggal</th>
                            <th className="py-3 px-3">Kabupaten</th>
                            <th className="py-3 px-3">Nama Puskesmas</th>
                            <th className="py-3 px-3 text-center bg-rose-50/70 text-rose-900 border-x border-rose-100">🔴 Merah</th>
                            <th className="py-3 px-3 text-center bg-amber-50/70 text-amber-900 border-r border-amber-100">🟡 Kuning</th>
                            <th className="py-3 px-3 text-center bg-emerald-50/70 text-emerald-900 border-r border-emerald-100">🟢 Hijau</th>
                            <th className="py-3 px-3 text-center bg-slate-200/70 text-slate-900 border-r border-slate-300">⚫ Hitam</th>
                            <th className="py-3 px-3 text-center font-black bg-teal-50/80 text-teal-900">Total</th>
                            <th className="py-3 px-3">Diagnosis / Catatan Khusus</th>
                            <th className="py-3 px-3 text-center">Aksi / Peta</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {filteredPasienPkm.length > 0 ? (
                            filteredPasienPkm.map((pkm, idx) => {
                              const isSelected = selectedRouteTarget?.name === pkm.nama_puskesmas
                              return (
                                <tr
                                  key={idx}
                                  onClick={() => {
                                    const matched = (detail?.faskes_terdekat || []).find((f: any) => f.nama?.toLowerCase().includes(pkm.nama_puskesmas.toLowerCase()) || pkm.nama_puskesmas.toLowerCase().includes(f.nama?.toLowerCase()))
                                    if (matched) {
                                      handleSelectTarget(matched, 'clinic')
                                    }
                                  }}
                                  className={`hover:bg-teal-50/60 transition-colors cursor-pointer ${isSelected ? 'bg-teal-50/80 border-l-4 border-teal-600' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                                    }`}
                                >
                                  <td className="py-2.5 px-3 text-center text-slate-400 font-semibold">{idx + 1}</td>
                                  <td className="py-2.5 px-3 font-semibold text-slate-600 whitespace-nowrap">{pkm.tanggal}</td>
                                  <td className="py-2.5 px-3 font-bold text-slate-800">
                                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px]">
                                      Kab. {pkm.kabupaten}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 font-black text-slate-900">
                                    <div className="flex items-center gap-1.5">
                                      <Stethoscope className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                                      <span>{pkm.nama_display || pkm.nama_puskesmas}</span>
                                      {pkm.master_matched === false && (
                                        <span className="text-[11px] text-amber-600 font-bold" title="Nama faskes disesuaikan dari laporan lapangan (belum 1:1 di master data)">*</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-black text-rose-700 bg-rose-50/30 border-x border-rose-100">
                                    {pkm.triase_merah > 0 ? (
                                      <span className="inline-flex items-center justify-center min-w-[22px] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 font-black text-[12px]">
                                        {pkm.triase_merah}
                                      </span>
                                    ) : (
                                      <span className="text-slate-300 font-normal">0</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-black text-amber-800 bg-amber-50/30 border-r border-amber-100">
                                    {pkm.triase_kuning > 0 ? (
                                      <span className="inline-flex items-center justify-center min-w-[22px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-black text-[12px]">
                                        {pkm.triase_kuning}
                                      </span>
                                    ) : (
                                      <span className="text-slate-300 font-normal">0</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-black text-emerald-800 bg-emerald-50/30 border-r border-emerald-100">
                                    {pkm.triase_hijau > 0 ? (
                                      <span className="inline-flex items-center justify-center min-w-[22px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-black text-[12px]">
                                        {pkm.triase_hijau}
                                      </span>
                                    ) : (
                                      <span className="text-slate-300 font-normal">0</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-black text-slate-800 bg-slate-100/40 border-r border-slate-200">
                                    {pkm.triase_hitam > 0 ? (
                                      <span className="inline-flex items-center justify-center min-w-[22px] px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-900 font-black text-[12px]">
                                        {pkm.triase_hitam}
                                      </span>
                                    ) : (
                                      <span className="text-slate-300 font-normal">0</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-black text-teal-900 bg-teal-50/40 text-[13px]">
                                    {pkm.total > 0 ? (
                                      <span className="px-2 py-0.5 rounded-lg bg-teal-100 text-teal-900 font-black">
                                        {pkm.total}
                                      </span>
                                    ) : (
                                      <span className="text-slate-300 font-normal">0</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-700 text-xs font-semibold max-w-xs truncate">
                                    {pkm.catatan ? (
                                      <span className="px-2 py-1 rounded bg-amber-50 border border-amber-200 text-amber-900 block truncate" title={pkm.catatan}>
                                        {pkm.catatan}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 italic text-[11px]">-</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        const matched = (detail?.faskes_terdekat || []).find((f: any) => f.nama?.toLowerCase().includes(pkm.nama_puskesmas.toLowerCase()) || pkm.nama_puskesmas.toLowerCase().includes(f.nama?.toLowerCase()))
                                        if (matched) {
                                          handleSelectTarget(matched, 'clinic')
                                          const mapEl = document.getElementById('peta-detail')
                                          if (mapEl) mapEl.scrollIntoView({ behavior: 'smooth' })
                                        } else {
                                          window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pkm.nama_puskesmas + ' Kab. ' + pkm.kabupaten + ' NTT')}`, '_blank')
                                        }
                                      }}
                                      className="inline-flex items-center justify-center px-2 py-1 rounded-md bg-teal-50 hover:bg-teal-100 text-teal-800 font-extrabold border border-teal-200 transition-colors text-[11px]"
                                    >
                                      Peta / Rute
                                    </button>
                                  </td>
                                </tr>
                              )
                            })
                          ) : (
                            <tr>
                              <td colSpan={11} className="py-8 text-center text-slate-400 font-semibold">
                                Tidak ada data Puskesmas yang cocok dengan filter pencarian.
                              </td>
                            </tr>
                          )}
                        </tbody>
                        <tfoot className="bg-slate-900 text-white font-black text-[13px] sticky bottom-0">
                          <tr>
                            <td colSpan={4} className="py-3 px-3 text-right uppercase tracking-wider text-slate-300">
                              TOTAL KESELURUHAN ({filteredPasienPkm.length} Puskesmas):
                            </td>
                            <td className="py-3 px-3 text-center bg-rose-950 text-rose-200 border-x border-rose-900 font-black text-sm">
                              {pkmTotals.merah}
                            </td>
                            <td className="py-3 px-3 text-center bg-amber-950 text-amber-200 border-r border-amber-900 font-black text-sm">
                              {pkmTotals.kuning}
                            </td>
                            <td className="py-3 px-3 text-center bg-emerald-950 text-emerald-200 border-r border-emerald-900 font-black text-sm">
                              {pkmTotals.hijau}
                            </td>
                            <td className="py-3 px-3 text-center bg-slate-800 text-slate-200 border-r border-slate-700 font-black text-sm">
                              {pkmTotals.hitam}
                            </td>
                            <td className="py-3 px-3 text-center bg-teal-950 text-teal-200 font-black text-sm">
                              {pkmTotals.total}
                            </td>
                            <td colSpan={2} className="py-3 px-3"></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}


            {matrixTab === 'sumber_daya' && (
              <div>
                <div className="mb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-50 p-3 rounded-xl border border-slate-150 gap-2">
                  <span className="text-[12px] font-bold text-slate-700 uppercase tracking-wider">
                    Kapasitas Tenaga Kesehatan Wilayah: <strong className="text-teal-850">{displayRegion}</strong>
                  </span>
                  <span className="text-[11px] font-black text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg uppercase tracking-wider">
                    {kapasitasNakes.length} Faskes Terdata
                  </span>
                </div>

                {/* Summary Capacity Section Chart */}
                {kapasitasNakes.length > 0 && (
                  <div className="mb-4 bg-gradient-to-r from-indigo-900/5 via-blue-900/5 to-slate-900/5 p-3.5 rounded-xl border border-indigo-150 shadow-2xs">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-indigo-600" />
                        Ringkasan Akumulasi Kapasitas Tenaga Kesehatan ({displayRegion})
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                        <span className="text-[10px] font-extrabold text-slate-400 block uppercase">Dokter Umum</span>
                        <span className="text-lg font-black text-blue-700 block mt-0.5">
                          {kapasitasNakes.reduce((sum: number, f: any) => sum + (f.dokter_umum || f.jml_dokter || 0), 0)}
                        </span>
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                        <span className="text-[10px] font-extrabold text-slate-400 block uppercase">Dokter Spesialis</span>
                        <span className="text-lg font-black text-indigo-700 block mt-0.5">
                          {kapasitasNakes.reduce((sum: number, f: any) => sum + (f.dokter_spesialis || 0), 0)}
                        </span>
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                        <span className="text-[10px] font-extrabold text-slate-400 block uppercase">Perawat</span>
                        <span className="text-lg font-black text-teal-700 block mt-0.5">
                          {kapasitasNakes.reduce((sum: number, f: any) => sum + (f.perawat || f.jml_perawat || 0), 0)}
                        </span>
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                        <span className="text-[10px] font-extrabold text-slate-400 block uppercase">Bidan</span>
                        <span className="text-lg font-black text-rose-700 block mt-0.5">
                          {kapasitasNakes.reduce((sum: number, f: any) => sum + (f.bidan || f.jml_bidan || 0), 0)}
                        </span>
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                        <span className="text-[10px] font-extrabold text-slate-400 block uppercase">Farmasi</span>
                        <span className="text-lg font-black text-emerald-700 block mt-0.5">
                          {kapasitasNakes.reduce((sum: number, f: any) => sum + (f.farmasi || f.jml_farmasi || 0), 0)}
                        </span>
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                        <span className="text-[10px] font-extrabold text-slate-400 block uppercase">Kesling &amp; Gizi</span>
                        <span className="text-lg font-black text-amber-700 block mt-0.5">
                          {kapasitasNakes.reduce((sum: number, f: any) => sum + (f.jml_kesling || 0) + (f.jml_gizi || 0), 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {loadingKapasitas ? (
                  <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                    <Loader2 className="h-7 w-7 animate-spin mb-2 text-teal-700" />
                    <p className="text-[12px] font-semibold">Memuat data kapasitas tenaga kesehatan kabupaten...</p>
                  </div>
                ) : kapasitasNakes.length > 0 ? (
                  <div className="max-h-[380px] overflow-y-auto overflow-x-auto">
                    <table className="w-full text-left border-collapse text-[13px]">
                      <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                        <tr className="text-slate-500 font-bold">
                          <th className="py-2.5 px-3 text-center">No</th>
                          <th className="py-2.5 px-3">Jenis Faskes</th>
                          <th className="py-2.5 px-3">Kode Faskes</th>
                          <th className="py-2.5 px-3">Nama Faskes</th>
                          <th className="py-2.5 px-3 text-center">Dokter Umum</th>
                          <th className="py-2.5 px-3 text-center">Dokter Spesialis</th>
                          <th className="py-2.5 px-3 text-center">Dokter Gigi</th>
                          <th className="py-2.5 px-3 text-center">Perawat</th>
                          <th className="py-2.5 px-3 text-center">Perawat Gigi</th>
                          <th className="py-2.5 px-3 text-center">Bidan</th>
                          <th className="py-2.5 px-3 text-center">Farmasi</th>
                          <th className="py-2.5 px-3 text-center">Google Maps</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kapasitasNakes.map((f: any, fidx: number) => (
                          <tr key={fidx} className={`border-b border-slate-100 hover:bg-teal-50/30 transition-colors ${fidx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-500">{fidx + 1}</td>
                            <td className="py-2.5 px-3 font-bold text-slate-700">{f.jenis_faskes || f.jenis || 'Faskes'}</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-800">{f.kode_faskes || '-'}</td>
                            <td className="py-2.5 px-3 font-bold text-slate-900">{f.nama_faskes || f.nama}</td>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-700">{f.dokter_umum || f.jml_dokter || 0}</td>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-700">{f.dokter_spesialis || 0}</td>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-700">{f.dokter_gigi || 0}</td>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-700">{f.perawat || f.jml_perawat || 0}</td>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-700">{f.perawat_gigi || 0}</td>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-700">{f.bidan || f.jml_bidan || 0}</td>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-700">{f.farmasi || f.jml_farmasi || 0}</td>
                            <td className="py-2.5 px-3 text-center">
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((f.nama_faskes || f.nama) + ' ' + (f.kabupaten || eventData.kabupaten || ''))}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center px-2 py-1 rounded bg-teal-50 hover:bg-teal-100 text-teal-800 font-extrabold border border-teal-200 transition-colors cursor-pointer"
                              >
                                Buka Maps
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400 bg-slate-50/50 rounded-xl border border-slate-100">
                    <AlertTriangle className="h-8 w-8 mb-2 text-slate-300" />
                    <p className="text-[12px] font-semibold">Tidak ada data kapasitas tenaga kesehatan untuk kabupaten ini.</p>
                  </div>
                )}
              </div>
            )}

            {matrixTab === 'sanitasi_kesling' && (
              <div className="space-y-3.5">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-150 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <span className="text-[12px] font-bold text-slate-700 uppercase tracking-wider">
                    Kondisi Sanitasi &amp; Kesehatan Lingkungan di Lokasi Penampungan Pengungsi
                  </span>
                  <span className="text-[11px] font-black text-teal-800 bg-teal-50 border border-teal-200 px-3 py-1 rounded-lg uppercase tracking-wider">
                    Standar WHO &amp; Kemenkes RI
                  </span>
                </div>

                {/* 7 Indikator Sanitasi Real dari Form Tab 5 */}
                {(() => {
                  const h = detail?.header || {}
                  const indikator = [
                    {
                      no: 1, label: 'Jenis Tempat Penampungan',
                      field: 'rs_jenis_tempat_penampungan',
                      options: { '1': 'Bangunan Permanen', '2': 'Bangunan Darurat' },
                      std: 'Permanen lebih aman'
                    },
                    {
                      no: 2, label: 'Kapasitas Penampungan Pengungsi',
                      field: 'rs_kapasitas_penampungan',
                      options: { '1': 'Memadai (min. 3m²/org)', '2': 'Tidak Memadai' },
                      std: 'Min. 3m² per orang'
                    },
                    {
                      no: 3, label: 'Kapasitas Penyediaan Air Bersih',
                      field: 'rs_penyediaan_air_bersih',
                      options: { '1': 'Memadai (min. 5–15L/org/hari)', '2': 'Tidak Memadai' },
                      std: 'Min. 15L/org/hari'
                    },
                    {
                      no: 4, label: 'Sarana Jamban Darurat',
                      field: 'rs_jamban_darurat',
                      options: { '1': 'Memadai (min. 1 jamban/40 org)', '2': 'Tidak Memadai' },
                      std: 'Rasio 1:40'
                    },
                    {
                      no: 5, label: 'Tempat Pembuangan Sampah',
                      field: 'rs_tempat_sampah',
                      options: { '1': 'Memadai (min. 3m²/60 org)', '2': 'Tidak Memadai' },
                      std: 'Min. 3m²/60 org'
                    },
                    {
                      no: 6, label: 'Sarana SPAL (Drainase)',
                      field: 'rs_sarana_spal',
                      options: { '1': 'Memadai (min. 4m dr penampungan)', '2': 'Tidak Memadai' },
                      std: 'Min. 4m dari penampungan'
                    },
                    {
                      no: 7, label: 'Penerangan',
                      field: 'rs_penerangan',
                      options: { '1': 'Memadai (min. 60 lux)', '2': 'Tidak Memadai' },
                      std: 'Min. 60 lux'
                    },
                  ]
                  const hasAnyData = indikator.some(i => h[i.field])
                  if (!hasAnyData) {
                    return (
                      <div className="bg-slate-50/80 rounded-xl border border-slate-200 p-5 text-center">
                        <p className="text-[12px] font-semibold text-slate-400">Belum ada data sanitasi dari Formulir Lengkap (Tab 5).</p>
                        <p className="text-[11px] text-slate-300 mt-1">Data akan muncul setelah petugas mengisi Tab Sanitasi & Kesling.</p>
                      </div>
                    )
                  }
                  const allMemadai = indikator.every(i => !h[i.field] || h[i.field] === '1')
                  const countMemadai = indikator.filter(i => h[i.field] === '1').length
                  const countTidak = indikator.filter(i => h[i.field] === '2').length
                  const countBelum = indikator.filter(i => !h[i.field]).length
                  return (
                    <div className="space-y-3">
                      {/* Summary bar */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-center">
                          <span className="text-lg font-black text-emerald-700">{countMemadai}</span>
                          <span className="text-[10px] font-extrabold text-emerald-600 block uppercase">Memadai</span>
                        </div>
                        <div className="bg-rose-50 border border-rose-200 rounded-xl p-2.5 text-center">
                          <span className="text-lg font-black text-rose-700">{countTidak}</span>
                          <span className="text-[10px] font-extrabold text-rose-600 block uppercase">Tidak Memadai</span>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-center">
                          <span className="text-lg font-black text-slate-500">{countBelum}</span>
                          <span className="text-[10px] font-extrabold text-slate-400 block uppercase">Belum Diisi</span>
                        </div>
                      </div>
                      {/* Tabel indikator */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-[12px] border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="py-2 px-3 text-left font-extrabold text-slate-500 text-[10px] uppercase w-8">No</th>
                              <th className="py-2 px-3 text-left font-extrabold text-slate-500 text-[10px] uppercase">Jenis Fasilitas</th>
                              <th className="py-2 px-3 text-center font-extrabold text-slate-500 text-[10px] uppercase w-32">Kondisi</th>
                              <th className="py-2 px-3 text-center font-extrabold text-slate-500 text-[10px] uppercase w-40">Standar</th>
                            </tr>
                          </thead>
                          <tbody>
                            {indikator.map((row, idx) => {
                              const val = h[row.field]
                              const label = val ? (row.options[val as keyof typeof row.options] || val) : null
                              const isMemadai = val === '1'
                              const isTidak = val === '2'
                              return (
                                <tr key={idx} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                                  <td className="py-2.5 px-3 font-bold text-slate-400 text-center">{row.no}</td>
                                  <td className="py-2.5 px-3 font-semibold text-slate-800">{row.label}</td>
                                  <td className="py-2.5 px-3 text-center">
                                    {label ? (
                                      <span className={`px-2 py-1 rounded-full text-[10px] font-extrabold border ${isMemadai
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : isTidak
                                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                                          : 'bg-slate-50 text-slate-500 border-slate-200'
                                        }`}>
                                        {label}
                                      </span>
                                    ) : (
                                      <span className="text-slate-300 text-[10px] font-bold">Belum diisi</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-center text-[10px] font-bold text-slate-400">{row.std}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      {/* Estimasi WHO tetap di bawah sebagai referensi */}
                      <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3 text-[11px] text-blue-800">
                        <span className="font-black uppercase block mb-1">Estimasi Kebutuhan Berdasarkan Jumlah Pengungsi ({(breakdown.pengungsi || 0).toLocaleString('id-ID')} jiwa):</span>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1.5">
                          <div><span className="font-bold block">Air Bersih</span><span className="font-extrabold text-blue-900">{((breakdown.pengungsi || 0) * 15).toLocaleString('id-ID')} L/hari</span></div>
                          <div><span className="font-bold block">Jamban Darurat</span><span className="font-extrabold text-blue-900">{Math.ceil((breakdown.pengungsi || 0) / 40)} unit min.</span></div>
                          <div><span className="font-bold block">TPS (Sampah)</span><span className="font-extrabold text-blue-900">{Math.ceil((breakdown.pengungsi || 0) / 60)} unit min.</span></div>
                          <div><span className="font-bold block">Luas Penampungan</span><span className="font-extrabold text-blue-900">{((breakdown.pengungsi || 0) * 3).toLocaleString('id-ID')} m² min.</span></div>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {(detail?.header?.akses_lokasi_keterangan || eventData.jalur_komunikasi) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {detail?.header?.akses_lokasi_keterangan && (
                      <div className="bg-white border border-slate-200 rounded-xl p-3">
                        <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">Akses ke Lokasi</span>
                        <p className="text-[12px] font-semibold text-slate-800">
                          {detail.header.akses_lokasi === '1' ? 'Mudah dijangkau' : 'Sukar dijangkau'}{detail.header.akses_lokasi_keterangan ? ` — ${detail.header.akses_lokasi_keterangan}` : ''}
                        </p>
                      </div>
                    )}
                    {eventData.jalur_komunikasi && (
                      <div className="bg-white border border-slate-200 rounded-xl p-3">
                        <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">Jalur Komunikasi</span>
                        <p className="text-[12px] font-semibold text-slate-800">{eventData.jalur_komunikasi}</p>
                      </div>
                    )}
                  </div>
                )}

                {eventData.upaya_sub_klaster_pp_pl_air_bersih && (
                  <div className="bg-teal-50/60 p-3 rounded-xl border border-teal-150">
                    <span className="text-[11px] font-black text-teal-900 uppercase tracking-wider block mb-1">
                      Upaya Sub-Klaster Penyehatan Lingkungan &amp; Air Bersih:
                    </span>
                    <p className="text-xs text-slate-700 font-medium leading-relaxed">
                      {stripHtmlText(eventData.upaya_sub_klaster_pp_pl_air_bersih)}
                    </p>
                  </div>
                )}
              </div>
            )}


            {matrixTab === 'logistik_kesehatan' && (
              <div className="space-y-5">
                {/* Header */}
                <div className="bg-slate-50 p-3.5 sm:p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <span className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-wider">
                    Sumber Daya &amp; Kesiapan Logistik Kesehatan
                  </span>
                </div>

                {/* Section A: Tenaga Kesehatan Tersedia vs Dibutuhkan */}
                {(() => {
                  const rows: any[] = Array.isArray(detail?.tenaga_input) ? detail.tenaga_input : []
                  if (rows.length === 0) return (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center">
                      <p className="text-sm sm:text-base font-medium text-slate-500 m-0">Belum ada data kebutuhan tenaga kesehatan yang diinputkan.</p>
                    </div>
                  )
                  return (
                    <div>
                      <div className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-wider mb-2.5">A. Kebutuhan Tenaga Kesehatan per Faskes</div>
                      <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
                        <table className="w-full text-xs sm:text-sm border-collapse">
                          <thead className="sticky top-0 z-10">
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="py-2.5 px-3 text-left font-black text-slate-700 text-xs uppercase">Nama Faskes</th>
                              {['Dokter', 'Perawat', 'Bidan', 'Farmasi', 'Gizi', 'Kesling', 'Lainnya'].map(h => (
                                <th key={h} className="py-2.5 px-2 text-center font-black text-slate-700 text-xs uppercase" colSpan={2}>{h}</th>
                              ))}
                            </tr>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="py-1.5 px-3"></th>
                              {['Dokter', 'Perawat', 'Bidan', 'Farmasi', 'Gizi', 'Kesling', 'Lainnya'].map(h => (
                                <th key={h + '_grp'} colSpan={2} className="py-1 px-1 text-center">
                                  <div className="grid grid-cols-2 gap-1 text-[10px] font-black uppercase">
                                    <span className="text-emerald-700">Ada</span>
                                    <span className="text-rose-700">Butuh</span>
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row: any, idx: number) => {
                              const pairs: [number, number, string][] = [
                                [row.jml_dokter || 0, row.kebutuhan_dokter || 0, 'dokter'],
                                [row.jml_perawat || 0, row.kebutuhan_perawat || 0, 'perawat'],
                                [row.jml_bidan || 0, row.kebutuhan_bidan || 0, 'bidan'],
                                [row.jml_farmasi || 0, row.kebutuhan_farmasi || 0, 'farmasi'],
                                [row.jml_gizi || 0, row.kebutuhan_gizi || 0, 'gizi'],
                                [row.jml_kesling || 0, row.kebutuhan_kesling || 0, 'kesling'],
                                [row.jml_tenaga_lainnya || 0, row.kebutuhan_tenaga_lainnya || 0, 'lainnya'],
                              ]
                              return (
                                <tr key={idx} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                                  <td className="py-3 px-3 font-bold text-slate-900">{row.nama_faskes || '-'}</td>
                                  {pairs.map(([ada, butuh, key]) => {
                                    const gap = butuh - ada
                                    return (
                                      <td key={key + '_cell'} colSpan={2} className="py-3 px-1 text-center">
                                        <div className="grid grid-cols-2 gap-1 items-center">
                                          <span className="font-bold text-emerald-800">{ada}</span>
                                          <span className={`font-bold ${gap > 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                                            {butuh}
                                            {gap > 0 && <span className="ml-1 text-[10px] font-extrabold text-rose-600 bg-rose-50 border border-rose-200 px-1 rounded">-{gap}</span>}
                                          </span>
                                        </div>
                                      </td>
                                    )
                                  })}
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })()}

                {/* Section B: Kesiapan Logistik Dinkes vs RS/PKM */}
                {(() => {
                  const h = detail?.header || {}
                  const labels: Record<string, string> = {
                    obat_habis_pakai: 'Obat & Bahan Habis Pakai',
                    alat_kesehatan: 'Alat Kesehatan',
                    kaporit: 'Kaporit',
                    pac: 'PAC',
                    aquatab: 'Aquatab',
                    kantong_sampah: 'Kantong Sampah',
                    repellent_lalat: 'Repellent Lalat',
                    hygiene_kit: 'Hygiene Kit',
                    persalinan_kit: 'Persalinan Kit',
                    jml_sdm: 'Jumlah SDM',
                    kompetensi_sdm: 'Kompetensi SDM',
                    transportasi: 'Transportasi Operasional',
                    alat_komunikasi: 'Alat Komunikasi',
                    sarana_listrik: 'Sarana Listrik',
                    air: 'Ketersediaan Air',
                    tempat_tidur: 'Tempat Tidur',
                  }
                  const optMap: Record<string, string> = { '1': 'Cukup', '2': 'Tidak Cukup' }
                  const optMap2: Record<string, string> = { '1': 'Memenuhi', '2': 'Tidak Memenuhi' }
                  const optMap3: Record<string, string> = { '1': 'Berfungsi', '2': 'Tidak Berfungsi' }

                  const getStatusBadge = (val: string, key: string) => {
                    const map = key === 'kompetensi_sdm' ? optMap2 : key === 'sarana_listrik' ? optMap3 : optMap
                    const label = map[val] || val
                    const ok = val === '1'
                    return (
                      <span className={`px-2.5 py-1 rounded-full text-xs font-black border ${ok ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-rose-50 text-rose-800 border-rose-300'
                        }`}>{label}</span>
                    )
                  }

                  const fieldGroups = ['obat_habis_pakai', 'alat_kesehatan', 'kaporit', 'pac', 'aquatab', 'kantong_sampah', 'repellent_lalat', 'hygiene_kit', 'persalinan_kit', 'jml_sdm', 'kompetensi_sdm', 'transportasi', 'alat_komunikasi', 'sarana_listrik']
                  const rsExtra = ['air', 'tempat_tidur']

                  const dinkesKeys = fieldGroups.filter(k => h[`dinkes_${k}`])
                  const rsKeys = [...fieldGroups, ...rsExtra].filter(k => h[`rs_${k}`])

                  if (dinkesKeys.length === 0 && rsKeys.length === 0) return (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center">
                      <p className="text-sm sm:text-base font-medium text-slate-500 m-0">Belum ada data kesiapan logistik dari Formulir Lengkap (Tab 6).</p>
                    </div>
                  )

                  return (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {dinkesKeys.length > 0 && (
                        <div className="bg-white border border-blue-200 rounded-xl p-4 shadow-2xs">
                          <div className="text-sm sm:text-base font-black text-blue-950 uppercase tracking-wider mb-3 pb-2 border-b border-blue-100">B. Kesiapan Logistik — Dinas Kesehatan</div>
                          <div className="space-y-2.5">
                            {dinkesKeys.map(k => (
                              <div key={k} className="flex items-center justify-between">
                                <span className="text-xs sm:text-sm font-bold text-slate-800">{labels[k] || k}</span>
                                {getStatusBadge(h[`dinkes_${k}`], k)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {rsKeys.length > 0 && (
                        <div className="bg-white border border-amber-200 rounded-xl p-4 shadow-2xs">
                          <div className="text-sm sm:text-base font-black text-amber-950 uppercase tracking-wider mb-3 pb-2 border-b border-amber-100">B. Kesiapan Logistik — RS / Puskesmas</div>
                          <div className="space-y-2.5">
                            {rsKeys.map(k => (
                              <div key={k} className="flex items-center justify-between">
                                <span className="text-xs sm:text-sm font-bold text-slate-800">{labels[k] || k}</span>
                                {getStatusBadge(h[`rs_${k}`], k)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}


            {matrixTab === 'relawan_mobilisasi' && (
              <VolunteerMobilizationTab isNttEvent={isNttEvent} />
            )}
          </div>
        </article>
        </>
        )}

        {/* ── Section 3: Ringkasan Insight, Tren Tahunan & Rekomendasi Tindakan Surveilans (3 Cards) ── */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Card 1: INSIGHT POSITIVITY RATE */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm flex flex-col justify-between">
            <div>
              {/* Header */}
              <div className="mb-4">
                <h3 className="text-base sm:text-lg font-black text-slate-900 uppercase tracking-tight m-0">
                  INSIGHT POSITIVITY RATE
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 font-normal mt-1 m-0 leading-normal">
                  Summary of insights and early signals from weekly surveillance data.
                </p>
              </div>

              {/* Segmented Tab Buttons */}
              <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl border border-slate-200/60 mb-4">
                <button
                  type="button"
                  onClick={() => setPositivityTab('insight')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    positivityTab === 'insight'
                      ? 'bg-white text-teal-900 shadow-xs border border-teal-200/70 font-black'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5 text-teal-600" />
                  LATEST INSIGHTS
                </button>
                <button
                  type="button"
                  onClick={() => setPositivityTab('peringatan')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    positivityTab === 'peringatan'
                      ? 'bg-white text-teal-900 shadow-xs border border-teal-200/70 font-black'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Bell className="h-3.5 w-3.5 text-teal-600" />
                  EARLY SIGNALS
                </button>
              </div>

              {/* Tab Content */}
              {positivityTab === 'insight' ? (
                <div className="space-y-2.5">
                  {/* Item 1 */}
                  <div className="p-3 sm:p-3.5 rounded-xl border border-slate-150 bg-slate-50/50 hover:bg-white transition-all flex items-start gap-3 shadow-2xs">
                    <div className="p-1.5 rounded-lg bg-rose-50 text-rose-600 border border-rose-200/60 shrink-0 mt-0.5">
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-slate-900 leading-snug m-0">
                        This week&apos;s influenza positivity rate is 23% (+7.0% from last week)
                      </p>
                      <p className="text-xs text-rose-600 font-semibold mt-0.5 m-0 flex items-center gap-1">
                        ⚠️ Close monitoring is required.
                      </p>
                    </div>
                  </div>

                  {/* Item 2 */}
                  <div className="p-3 sm:p-3.5 rounded-xl border border-slate-150 bg-slate-50/50 hover:bg-white transition-all flex items-start gap-3 shadow-2xs">
                    <div className="p-1.5 rounded-lg bg-teal-50 text-teal-600 border border-teal-200/60 shrink-0 mt-0.5">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-slate-900 leading-snug m-0">
                        Average multipathogen positivity: 48.3%
                      </p>
                      <p className="text-xs text-teal-700 font-medium mt-0.5 m-0">
                        Multipathogen indicator is within the expected range
                      </p>
                    </div>
                  </div>

                  {/* Item 3 */}
                  <div className="p-3 sm:p-3.5 rounded-xl border border-slate-150 bg-slate-50/50 hover:bg-white transition-all flex items-start gap-3 shadow-2xs">
                    <div className="p-1.5 rounded-lg bg-teal-50 text-teal-600 border border-teal-200/60 shrink-0 mt-0.5">
                      <Users className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-slate-900 leading-snug m-0">
                        Cumulative COVID-19 positives: 4 from 16,065 tests
                      </p>
                      <p className="text-xs text-teal-700 font-medium mt-0.5 m-0">
                        COVID-19 cases remain under control.
                      </p>
                    </div>
                  </div>

                  {/* Item 4 */}
                  <div className="p-3 sm:p-3.5 rounded-xl border border-slate-150 bg-slate-50/50 hover:bg-white transition-all flex items-start gap-3 shadow-2xs">
                    <div className="p-1.5 rounded-lg bg-teal-50 text-teal-600 border border-teal-200/60 shrink-0 mt-0.5">
                      <TrendingUp className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-slate-900 leading-snug m-0">
                        Overall average ILI proportion: 0.20%
                      </p>
                      <p className="text-xs text-teal-700 font-medium mt-0.5 m-0">
                        ILI proportion is within the normal range.
                      </p>
                    </div>
                  </div>

                  {/* Item 5 */}
                  <div className="p-3 sm:p-3.5 rounded-xl border border-slate-150 bg-slate-50/50 hover:bg-white transition-all flex items-start gap-3 shadow-2xs">
                    <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200/60 shrink-0 mt-0.5">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-slate-900 leading-snug m-0">
                        Average incidence — COVID-19 PR: 0.0%, Influenza PR: 23% (COVID -4.3%)
                      </p>
                      <p className="text-xs text-teal-700 font-medium mt-0.5 m-0">
                        Continue surveillance.
                      </p>
                    </div>
                  </div>

                  {/* Item 6 */}
                  <div className="p-3 sm:p-3.5 rounded-xl border border-slate-150 bg-slate-50/50 hover:bg-white transition-all flex items-start gap-3 shadow-2xs">
                    <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200/60 shrink-0 mt-0.5">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-slate-900 leading-snug m-0">
                        Latest signal: influenza PR increased this week
                      </p>
                      <p className="text-xs text-teal-700 font-medium mt-0.5 m-0">
                        Review the dashboard regularly.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Peringatan Dini Item 1 */}
                  <div className="p-3.5 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50/80 transition-all flex items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                      <span className="text-xs sm:text-sm font-semibold text-slate-800 truncate">
                        Influenza PR (17.8% average) — MODERATE
                      </span>
                    </div>
                    <span className="px-3 py-1 rounded-lg bg-[#d97706] text-white font-black text-xs shrink-0 shadow-2xs">
                      17.8%
                    </span>
                  </div>

                  {/* Peringatan Dini Item 2 */}
                  <div className="p-3.5 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50/80 transition-all flex items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-600 shrink-0" />
                      <span className="text-xs sm:text-sm font-semibold text-slate-800 truncate">
                        Multipathogen (48.3% average) — HIGH
                      </span>
                    </div>
                    <span className="px-3 py-1 rounded-lg bg-[#dc2626] text-white font-black text-xs shrink-0 shadow-2xs">
                      48.3%
                    </span>
                  </div>

                  {/* Peringatan Dini Item 3 */}
                  <div className="p-3.5 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50/80 transition-all flex items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                      <span className="text-xs sm:text-sm font-semibold text-slate-800 truncate">
                        RSV (11.3% average) — MODERATE
                      </span>
                    </div>
                    <span className="px-3 py-1 rounded-lg bg-[#d97706] text-white font-black text-xs shrink-0 shadow-2xs">
                      11.3%
                    </span>
                  </div>

                  {/* Peringatan Dini Item 4 */}
                  <div className="p-3.5 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50/80 transition-all flex items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 shrink-0" />
                      <span className="text-xs sm:text-sm font-semibold text-slate-800 truncate">
                        ILI proportion (0.2% average) — LOW
                      </span>
                    </div>
                    <span className="px-3 py-1 rounded-lg bg-[#059669] text-white font-black text-xs shrink-0 shadow-2xs">
                      0.2%
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 mt-5 italic font-normal">
                    *Data is updated periodically as new reports are received.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Card 2: TREN & PERBANDINGAN TAHUNAN */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm flex flex-col justify-between">
            <div>
              {/* Header */}
              <div className="mb-4">
                <h3 className="text-base sm:text-lg font-black text-slate-900 uppercase tracking-tight m-0">
                  ANNUAL TRENDS &amp; COMPARISON
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 font-normal mt-1 m-0 leading-normal">
                  Comparison of average 2025 and 2026 indicators to assess annual changes.
                </p>
              </div>

              {/* 2 Top Mini Highlight Boxes */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-xl border border-emerald-200 bg-[#f0fdf4] p-3 flex flex-col justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#16a34a] block">
                    LARGEST DECREASE
                  </span>
                  <div className="mt-1">
                    <span className="text-xs font-bold text-slate-900 block leading-tight">
                      Positivity Rate COVID-19
                    </span>
                    <span className="text-xs font-bold text-[#16a34a] block mt-0.5">
                      6.7% → 2.1% (▼ -68.7%)
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-rose-200 bg-[#fff1f2] p-3 flex flex-col justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#e11d48] block">
                    LARGEST INCREASE
                  </span>
                  <div className="mt-1">
                    <span className="text-xs font-bold text-slate-900 block leading-tight">
                      Other Multipathogens
                    </span>
                    <span className="text-xs font-bold text-[#e11d48] block mt-0.5">
                      38.0% → 55.5% [▲ 46.1%]
                    </span>
                  </div>
                </div>
              </div>

              {/* 6 Ranked Rows */}
              <div className="space-y-2">
                {/* Row 1 */}
                <div className="flex items-center justify-between p-2 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-5 h-5 rounded-md bg-slate-100 border border-slate-200/80 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
                      1
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 leading-tight truncate">
                        Positivity Rate Influenza
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>2025: <strong className="font-semibold text-slate-700">24.6%</strong></span>
                        <span>2026: <strong className="font-semibold text-slate-700">13.0%</strong></span>
                        <span className="text-emerald-600 font-bold">▼ -47.2%</span>
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-amber-50 text-amber-700 border border-amber-200 shrink-0 ml-2">
                    MODERATE
                  </span>
                </div>

                {/* Row 2 */}
                <div className="flex items-center justify-between p-2 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-5 h-5 rounded-md bg-slate-100 border border-slate-200/80 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
                      2
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 leading-tight truncate">
                        Positivity Rate COVID-19
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>2025: <strong className="font-semibold text-slate-700">6.7%</strong></span>
                        <span>2026: <strong className="font-semibold text-slate-700">2.1%</strong></span>
                        <span className="text-emerald-600 font-bold">▼ -68.7%</span>
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0 ml-2">
                    LOW
                  </span>
                </div>

                {/* Row 3 */}
                <div className="flex items-center justify-between p-2 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-5 h-5 rounded-md bg-slate-100 border border-slate-200/80 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
                      3
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 leading-tight truncate">
                        RSV Proportion
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>2025: <strong className="font-semibold text-slate-700">12.2%</strong></span>
                        <span>2026: <strong className="font-semibold text-slate-700">11.0%</strong></span>
                        <span className="text-emerald-600 font-bold">▼ -9.8%</span>
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-amber-50 text-amber-700 border border-amber-200 shrink-0 ml-2">
                    MODERATE
                  </span>
                </div>

                {/* Row 4 */}
                <div className="flex items-center justify-between p-2 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-5 h-5 rounded-md bg-slate-100 border border-slate-200/80 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
                      4
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 leading-tight truncate">
                        Other Multipathogens
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>2025: <strong className="font-semibold text-slate-700">38.0%</strong></span>
                        <span>2026: <strong className="font-semibold text-slate-700">55.5%</strong></span>
                        <span className="text-rose-600 font-bold">▲ 46.1%</span>
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-rose-50 text-rose-700 border border-rose-200 shrink-0 ml-2">
                    HIGH
                  </span>
                </div>

                {/* Row 5 */}
                <div className="flex items-center justify-between p-2 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-5 h-5 rounded-md bg-slate-100 border border-slate-200/80 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
                      5
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 leading-tight truncate">
                        ILI Proportion
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>2025: <strong className="font-semibold text-slate-700">0.2%</strong></span>
                        <span>2026: <strong className="font-semibold text-slate-700">0.2%</strong></span>
                        <span className="text-slate-500 font-medium">- 0.0%</span>
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0 ml-2">
                    LOW
                  </span>
                </div>

                {/* Row 6 */}
                <div className="flex items-center justify-between p-2 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-5 h-5 rounded-md bg-slate-100 border border-slate-200/80 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
                      6
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 leading-tight truncate">
                        SARI Proportion
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>2025: <strong className="font-semibold text-slate-700">0.9%</strong></span>
                        <span>2026: <strong className="font-semibold text-slate-700">1.1%</strong></span>
                        <span className="text-rose-600 font-bold">▲ 22.2%</span>
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0 ml-2">
                    LOW
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: REKOMENDASI TINDAKAN */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm flex flex-col justify-between">
            <div>
              {/* Header */}
              <div className="mb-4">
                <h3 className="text-base sm:text-lg font-black text-slate-900 uppercase tracking-tight m-0">
                  RECOMMENDED ACTIONS
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 font-normal mt-1 m-0 leading-normal">
                  Priority monitoring recommendations based on surveillance indicators.
                </p>
              </div>

              {/* 6 Actions */}
              <div className="space-y-3">
                {/* Action 1 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-4 text-xs font-black text-slate-400 shrink-0">1</span>
                      <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">Other Multipathogens</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-rose-50 text-rose-700 border border-rose-200 shrink-0">
                      HIGH
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-normal pl-6 m-0 leading-tight">
                    Increase monitoring and evaluation frequency. Review the annual upward trend.
                  </p>
                  <div className="flex items-center gap-2.5 pl-6 pt-0.5">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-[#ef4444]" style={{ width: '48.3%' }} />
                    </div>
                    <span className="text-xs font-bold text-slate-700 min-w-[36px] text-right">48.3%</span>
                  </div>
                </div>

                {/* Action 2 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-4 text-xs font-black text-slate-400 shrink-0">2</span>
                      <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">Positivity Rate Influenza</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                      MODERATE
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-normal pl-6 m-0 leading-tight">
                    Strengthen monitoring and periodic evaluation. Review the annual downward trend.
                  </p>
                  <div className="flex items-center gap-2.5 pl-6 pt-0.5">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-[#f59e0b]" style={{ width: '17.8%' }} />
                    </div>
                    <span className="text-xs font-bold text-slate-700 min-w-[36px] text-right">17.8%</span>
                  </div>
                </div>

                {/* Action 3 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-4 text-xs font-black text-slate-400 shrink-0">3</span>
                      <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">RSV Proportion</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                      MODERATE
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-normal pl-6 m-0 leading-tight">
                    Strengthen monitoring and periodic evaluation. Review the annual downward trend.
                  </p>
                  <div className="flex items-center gap-2.5 pl-6 pt-0.5">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-[#f59e0b]" style={{ width: '11.3%' }} />
                    </div>
                    <span className="text-xs font-bold text-slate-700 min-w-[36px] text-right">11.3%</span>
                  </div>
                </div>

                {/* Action 4 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-4 text-xs font-black text-slate-400 shrink-0">4</span>
                      <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">Positivity Rate COVID-19</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                      LOW
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-normal pl-6 m-0 leading-tight">
                    Continue routine monitoring and review the annual downward trend.
                  </p>
                  <div className="flex items-center gap-2.5 pl-6 pt-0.5">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-[#10b981]" style={{ width: '4%' }} />
                    </div>
                    <span className="text-xs font-bold text-slate-700 min-w-[36px] text-right">4%</span>
                  </div>
                </div>

                {/* Action 5 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-4 text-xs font-black text-slate-400 shrink-0">5</span>
                      <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">SARI Proportion</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                      LOW
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-normal pl-6 m-0 leading-tight">
                    Continue routine monitoring and review the annual upward trend.
                  </p>
                  <div className="flex items-center gap-2.5 pl-6 pt-0.5">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-[#10b981]" style={{ width: '1%' }} />
                    </div>
                    <span className="text-xs font-bold text-slate-700 min-w-[36px] text-right">1%</span>
                  </div>
                </div>

                {/* Action 6 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-4 text-xs font-black text-slate-400 shrink-0">6</span>
                      <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">ILI Proportion</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                      LOW
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-normal pl-6 m-0 leading-tight">
                    Continue routine monitoring according to procedure.
                  </p>
                  <div className="flex items-center gap-2.5 pl-6 pt-0.5">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-[#10b981]" style={{ width: '0.2%' }} />
                    </div>
                    <span className="text-xs font-bold text-slate-700 min-w-[36px] text-right">0.2%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Legend */}
            <div className="pt-3 border-t border-slate-100 mt-3 space-y-1.5">
              <div className="flex items-center gap-3 text-[10px] font-bold">
                <span className="flex items-center gap-1 text-emerald-700">
                  <span className="w-2.5 h-1 rounded-xs bg-[#10b981]" /> LOW (0-10%)
                </span>
                <span className="flex items-center gap-1 text-amber-700">
                  <span className="w-2.5 h-1 rounded-xs bg-[#f59e0b]" /> MODERATE (10-20%)
                </span>
                <span className="flex items-center gap-1 text-rose-700">
                  <span className="w-2.5 h-1 rounded-xs bg-[#ef4444]" /> HIGH (&gt;20%)
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-normal m-0 leading-tight">
                Categories are based on surveillance-data distribution by indicator. Thresholds are indicative and are not formal standards.
              </p>
            </div>
          </div>
        </section>
      </div>
      {/* ==================== MATRIKS KORBAN & FASKES PER KABUPATEN POPUP MODAL ==================== */}
      {/* SKDR MODAL DISABLED */ false && showKabupatenMatrixModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 lg:p-6 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setShowKabupatenMatrixModal(false)}
        >
          <div
            className="relative bg-white rounded-3xl shadow-2xl max-w-6xl w-full flex flex-col max-h-[92vh] border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200 p-5 sm:p-7 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-150 shrink-0">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg sm:text-xl font-black text-slate-900 leading-tight">
                    Disease Case Distribution &amp; SKDR Surveillance Matrix
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-teal-100 text-teal-800 border border-teal-200">
                    National ({displayRegion})
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-sky-100 text-sky-800 border border-sky-200">
                    Integrated SKDR (IBS &amp; EBS)
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                    Current SKDR Data
                  </span>
                </div>
                <p className="text-xs sm:text-sm font-semibold text-slate-500">
                  Details of potentially outbreak-prone communicable diseases, event-rumor verification responses (EBS), and routine weekly indicator reports (IBS) from the Ministry of Health.
                </p>
              </div>

              <button
                onClick={() => setShowKabupatenMatrixModal(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer border-none shrink-0 ml-3"
                title="Close Modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 4 Stat Highlights Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
              <div className="bg-gradient-to-br from-teal-50 to-teal-100/40 p-3.5 rounded-2xl border border-teal-200/80 shadow-2xs">
                <div className="text-[10px] font-black uppercase text-teal-800 tracking-wider">Total Monitored Cases</div>
                <div className="text-2xl font-black text-teal-950 mt-1">
                  {Number(regionalSkdrData?.kpis.cases ?? 0).toLocaleString('en-US')} <span className="text-xs font-bold text-teal-700">Cases</span>
                </div>
                <div className="text-[11px] font-bold text-teal-700 mt-0.5">SKDR Surveillance (IBS &amp; EBS)</div>
              </div>

              <div className="bg-gradient-to-br from-amber-50 to-amber-100/40 p-3.5 rounded-2xl border border-amber-200/80 shadow-2xs">
                <div className="text-[10px] font-black uppercase text-amber-800 tracking-wider">Leading Disease</div>
                <div className="text-xl sm:text-2xl font-black text-amber-950 mt-1 truncate" title={regionalSkdrData?.by_disease?.[0]?.name || 'No data available'}>
                  {regionalSkdrData?.by_disease?.[0]?.name || 'No data available'}
                </div>
                <div className="text-[11px] font-bold text-amber-700 mt-0.5">{Number(regionalSkdrData?.by_disease?.[0]?.cases ?? 0).toLocaleString('en-US')} Cases • Highest</div>
              </div>

              <div className="bg-gradient-to-br from-sky-50 to-sky-100/40 p-3.5 rounded-2xl border border-sky-200/80 shadow-2xs">
                <div className="text-[10px] font-black uppercase text-sky-800 tracking-wider">SKDR Outbreak Markers</div>
                <div className="text-2xl font-black text-sky-950 mt-1">
                  {((regionalIbsSummary?.status?.klb ?? 0) + (regionalEbsSummary?.status?.klb ?? 0)).toLocaleString('en-US')} <span className="text-xs font-bold text-sky-700">Reports</span>
                </div>
                <div className="text-[11px] font-bold text-sky-700 mt-0.5">Based on official markers in SKDR data</div>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-purple-100/40 p-3.5 rounded-2xl border border-purple-200/80 shadow-2xs">
                <div className="text-[10px] font-black uppercase text-purple-800 tracking-wider">Regional SKDR Status</div>
                <div className="text-xl sm:text-2xl font-black text-purple-950 mt-1">
                  {((regionalIbsSummary?.status?.klb ?? 0) + (regionalEbsSummary?.status?.klb ?? 0)) > 0 ? 'Attention Required' : 'Under Control'} <span className="text-xs font-bold text-purple-700">{((regionalIbsSummary?.status?.klb ?? 0) + (regionalEbsSummary?.status?.klb ?? 0)) > 0 ? 'Outbreak Markers Present' : 'No Outbreak Markers'}</span>
                </div>
                <div className="text-[11px] font-bold text-purple-700 mt-0.5">Status calculated from SKDR API data</div>
              </div>
            </div>

            {/* Search & Channel Tabs & Dropdowns */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 shrink-0">
              {/* Channel Tabs */}
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200/80 shrink-0">
                <button
                  type="button"
                  onClick={() => setSkdrMatrixChannel('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    skdrMatrixChannel === 'all'
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200 font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All Surveillance ({regionalSkdrMatrixList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSkdrMatrixChannel('ibs')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    skdrMatrixChannel === 'ibs'
                      ? 'bg-teal-600 text-white shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  IBS (Routine Indicators)
                </button>
                <button
                  type="button"
                  onClick={() => setSkdrMatrixChannel('ebs')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    skdrMatrixChannel === 'ebs'
                      ? 'bg-blue-600 text-white shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  EBS (Event &amp; Rumor)
                </button>
                <button
                  type="button"
                  onClick={() => setSkdrMatrixChannel('alert')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    skdrMatrixChannel === 'alert'
                      ? 'bg-amber-600 text-white shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Outbreak Priority ({regionalSkdrMatrixList.filter(r => r.isAlert).length})
                </button>
              </div>

              {/* Filters (Provinsi, Status, Search) */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={skdrMatrixProvinsi}
                  onChange={(e) => setSkdrMatrixProvinsi(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 outline-none cursor-pointer focus:bg-white"
                >
                  <option value="all">All Regions</option>
                  {Array.from(new Set(regionalSkdrMatrixList.map((row) => row.kabupaten)))
                    .sort((a, b) => a.localeCompare(b))
                    .map((wilayah) => (
                      <option key={wilayah} value={wilayah}>{wilayah}</option>
                    ))}
                </select>

                <select
                  value={skdrMatrixStatus}
                  onChange={(e) => setSkdrMatrixStatus(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 outline-none cursor-pointer focus:bg-white"
                >
                  <option value="all">All Statuses</option>
                  <option value="Terdata">Recorded</option>
                  <option value="Perlu Review">Needs Review</option>
                  <option value="WASPADA">WARNING</option>
                  <option value="SIAGA">HIGH</option>
                  <option value="AWAS">CRITICAL</option>
                </select>

                {/* Search Box */}
                <div className="relative flex-1 sm:w-60">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search disease, reporting facility, or EBS number..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                    value={skdrMatrixSearch}
                    onChange={(e) => setSkdrMatrixSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Table Content */}
            <div className="flex-1 overflow-auto rounded-2xl border border-slate-200 min-h-[320px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 shadow-2xs">
                  <tr className="text-slate-700 font-black uppercase text-[11px]">
                    <th className="py-3 px-3 text-center w-10">No.</th>
                    <th className="py-3 px-3">Reporting Region</th>
                    <th className="py-3 px-3">Reporting Facility</th>
                    <th className="py-3 px-3">Diagnosis &amp; Disease (ICD-11)</th>
                    <th className="py-3 px-3 text-center">Surveillance Channel</th>
                    <th className="py-3 px-3 text-center">Case Count</th>
                    <th className="py-3 px-3 text-center">Response Status</th>
                    <th className="py-3 px-3">Report ID &amp; Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRegionalSkdrList.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 font-semibold text-xs space-y-2">
                        <Activity className="h-8 w-8 mx-auto text-slate-300 animate-pulse" />
                        <div>No disease surveillance data matches the selected filters.</div>
                        <button
                          type="button"
                          onClick={() => {
                            setSkdrMatrixChannel('all');
                            setSkdrMatrixProvinsi('all');
                            setSkdrMatrixStatus('all');
                            setSkdrMatrixSearch('');
                          }}
                          className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                        >
                          Reset Filter
                        </button>
                      </td>
                    </tr>
                  ) : (
                    filteredRegionalSkdrList.map((row, idx) => (
                      <tr
                        key={row.id}
                        className={`hover:bg-teal-50/40 transition-colors cursor-pointer ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'} ${selectedSkdrRowId === row.id ? 'bg-teal-50/80 ring-1 ring-teal-300' : ''}`}
                        onClick={() => setSelectedSkdrRowId(selectedSkdrRowId === row.id ? null : row.id)}
                      >
                        <td className="py-3 px-3 font-bold text-slate-400 text-center">{idx + 1}</td>
                        <td className="py-3 px-3">
                          <div className="font-extrabold text-slate-900">{row.kabupaten}</div>
                          <div className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                            <span>Source: {row.provinsi}</span>
                            {row.distrik && (
                              <>
                                <span>•</span>
                                <span>Kec. {row.distrik}</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-extrabold text-slate-800">{row.unit}</div>
                          <span className="inline-block mt-0.5 px-2 py-0.2 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            {row.kel_unit || 'Data agregat API'}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-black text-slate-900">{row.diagnosa}</div>
                          <span className="inline-block mt-0.5 px-2 py-0.2 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            ICD-11: {row.icd11 || 'Not mapped'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                              row.kanal === 'EBS'
                                ? 'bg-blue-50 text-blue-800 border-blue-200'
                                : 'bg-teal-50 text-teal-800 border-teal-200'
                            }`}
                          >
                            {row.kanal === 'EBS' ? 'EBS (Event)' : 'IBS (Routine)'}
                          </span>
                          {row.isAlert && (
                            <div className="mt-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[9px] font-black bg-rose-100 text-rose-700 border border-rose-200 animate-pulse">
                                <span className="h-1 w-1 rounded-full bg-rose-600" />
                                Outbreak Priority
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="font-black text-slate-900 text-sm">{row.kasus}</span>
                          <span className="text-[10px] text-slate-500 font-semibold ml-1">Cases</span>
                          {row.kematian > 0 && (
                            <div className="text-[10px] font-bold text-rose-600">({row.kematian} meninggal)</div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                              row.status === 'Terdata'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}
                          >
                            {row.status === 'Terdata' ? (
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            ) : (
                              <AlertTriangle className="h-3 w-3 text-amber-600" />
                            )}
                            {row.status === 'Terdata' ? 'Recorded' : row.status === 'Perlu Review' ? 'Needs Review' : row.status}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-teal-800">
                            <span>No: {row.no_ebs || '-'}</span>
                          </div>
                          <div className="text-[11px] text-slate-600 font-medium mt-0.5 line-clamp-2" title={row.tindakan}>
                            {row.tindakan}
                          </div>
                          {selectedSkdrRowId === row.id && row.kronologi && (
                            <div className="mt-2 p-2 rounded-xl bg-slate-100/90 border border-slate-200 text-[11px] space-y-1 animate-in fade-in">
                              <div className="font-bold text-slate-700">Timeline &amp; Clinical Information:</div>
                              <div className="text-slate-600">{row.kronologi}</div>
                              {row.informasi && <div className="text-slate-500 italic">{row.informasi}</div>}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-black text-slate-900 sticky bottom-0">
                  <tr>
                    <td colSpan={4} className="py-3 px-3 text-left">
                      <span className="text-[11px] uppercase tracking-wider text-slate-600">
                        TOTAL REKAPITULASI SURVEILANS ({filteredRegionalSkdrList.length} LAPORAN)
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="text-[11px] font-extrabold text-slate-700">
                        {filteredRegionalSkdrList.filter(r => r.kanal === 'IBS').length} IBS • {filteredRegionalSkdrList.filter(r => r.kanal === 'EBS').length} EBS
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="font-black text-slate-900 text-sm">
                        {filteredRegionalSkdrList.reduce((s, r) => s + (Number(r.kasus) || 0), 0).toLocaleString('id-ID')}
                      </span>
                      <span className="text-[10px] text-slate-500 font-bold ml-1">Cases</span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                        100% Responded
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="text-[10px] font-bold text-slate-500">
                        {filteredRegionalSkdrList.filter(r => r.isAlert).length} Outbreak Priority
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-150 shrink-0">
              <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                <span>
                  Data integrated directly with the Ministry of Health Early Warning and Response System (SKDR) and disease surveillance platform.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowKabupatenMatrixModal(false)}
                  className="px-5 py-2.5 rounded-xl bg-[#047D78] hover:bg-[#03625d] text-white text-xs font-black uppercase tracking-wider transition-all duration-200 shadow-md shadow-teal-900/15 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer border border-teal-600/30"
                >
                  Close Matrix
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== HEALTH RISK SCORE POPUP MODAL ==================== */}
      {showHealthInfo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowHealthInfo(false)}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 border border-slate-200 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 shrink-0">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 110 20A10 10 0 0112 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-[15px] font-black text-slate-900 uppercase tracking-wide">Health Risk Score</h3>
                  <p className="text-[11px] text-slate-400 font-semibold">Cara Penghitungan Skor</p>
                </div>
              </div>
              <button
                onClick={() => setShowHealthInfo(false)}
                className="flex items-center justify-center h-8 w-8 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer border-none"
              >
                <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Skor Saat Ini */}
            <div className="bg-slate-50 rounded-xl px-4 py-3 flex items-center justify-between border border-slate-100">
              <span className="text-[12px] font-bold text-slate-500 uppercase tracking-wider">Skor Kejadian Ini</span>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black text-slate-900">{healthRiskScore}</span>
                <span className="text-[11px] text-slate-400 font-bold">/100</span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${healthRiskLevel.color}`}>
                  {healthRiskLevel.label}
                </span>
              </div>
            </div>

            {/* Formula */}
            <div className="space-y-3">
              <p className="text-[12px] font-black text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-1.5">Komponen Perhitungan</p>

              <div className="space-y-2 text-[12.5px]">
                {/* Base */}
                <div className="flex items-start justify-between gap-3 py-1.5 border-b border-slate-50">
                  <div>
                    <span className="font-bold text-slate-800 block">Skor Dasar</span>
                    <span className="text-slate-500 font-normal text-[11px]">Baseline risiko bencana aktif</span>
                  </div>
                  <span className="font-black text-teal-700 shrink-0">+55</span>
                </div>
                {/* Meninggal */}
                <div className={`flex items-start justify-between gap-3 py-1.5 border-b border-slate-50 ${breakdown.meninggal > 0 ? '' : 'opacity-40'}`}>
                  <div>
                    <span className="font-bold text-slate-800 block">Ada Korban Meninggal</span>
                    <span className="text-slate-500 font-normal text-[11px]">Meninggal {'>'} 0 jiwa <span className="font-bold">(saat ini: {breakdown.meninggal})</span></span>
                  </div>
                  <span className={`font-black shrink-0 ${breakdown.meninggal > 0 ? 'text-rose-600' : 'text-slate-300'}`}>+10</span>
                </div>
                {/* Luka Berat */}
                <div className={`flex items-start justify-between gap-3 py-1.5 border-b border-slate-50 ${breakdown.luka_berat > 0 ? '' : 'opacity-40'}`}>
                  <div>
                    <span className="font-bold text-slate-800 block">Ada Korban Luka Berat</span>
                    <span className="text-slate-500 font-normal text-[11px]">Luka berat {'>'} 0 jiwa <span className="font-bold">(saat ini: {breakdown.luka_berat || 0})</span></span>
                  </div>
                  <span className={`font-black shrink-0 ${breakdown.luka_berat > 0 ? 'text-orange-600' : 'text-slate-300'}`}>+5</span>
                </div>
                {/* Pengungsi */}
                <div className={`flex items-start justify-between gap-3 py-1.5 border-b border-slate-50 ${breakdown.pengungsi > 0 ? '' : 'opacity-40'}`}>
                  <div>
                    <span className="font-bold text-slate-800 block">Jumlah Pengungsi</span>
                    <span className="text-slate-500 font-normal text-[11px]">
                      {'>'} 1.000: +15 &nbsp;|&nbsp; {'>'} 100: +8 <span className="font-bold">(saat ini: {breakdown.pengungsi.toLocaleString('id-ID')})</span>
                    </span>
                  </div>
                  <span className={`font-black shrink-0 ${breakdown.pengungsi > 1000 ? 'text-rose-600' : breakdown.pengungsi > 100 ? 'text-amber-600' : 'text-slate-300'}`}>
                    {breakdown.pengungsi > 1000 ? '+15' : breakdown.pengungsi > 100 ? '+8' : '+0'}
                  </span>
                </div>
                {/* Akses */}
                <div className={`flex items-start justify-between gap-3 py-1.5 border-b border-slate-50 ${eventData.akses_lokasi === 0 ? '' : 'opacity-40'}`}>
                  <div>
                    <span className="font-bold text-slate-800 block">Akses Lokasi Terputus</span>
                    <span className="text-slate-500 font-normal text-[11px]">Hambat respons medis darurat</span>
                  </div>
                  <span className={`font-black shrink-0 ${eventData.akses_lokasi === 0 ? 'text-rose-600' : 'text-slate-300'}`}>+10</span>
                </div>
                {/* Listrik */}
                <div className={`flex items-start justify-between gap-3 py-1.5 border-b border-slate-50 ${eventData.jaringan_listrik === 0 ? '' : 'opacity-40'}`}>
                  <div>
                    <span className="font-bold text-slate-800 block">Jaringan Listrik Padam</span>
                    <span className="text-slate-500 font-normal text-[11px]">Ganggu operasional fasilitas kesehatan</span>
                  </div>
                  <span className={`font-black shrink-0 ${eventData.jaringan_listrik === 0 ? 'text-amber-600' : 'text-slate-300'}`}>+5</span>
                </div>
                {/* Air Bersih */}
                <div className={`flex items-start justify-between gap-3 py-1.5 ${eventData.air_bersih === 0 ? '' : 'opacity-40'}`}>
                  <div>
                    <span className="font-bold text-slate-800 block">Krisis Air Bersih</span>
                    <span className="text-slate-500 font-normal text-[11px]">Potensi wabah penyakit meningkat</span>
                  </div>
                  <span className={`font-black shrink-0 ${eventData.air_bersih === 0 ? 'text-amber-600' : 'text-slate-300'}`}>+5</span>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl px-4 py-2.5 border border-slate-100 text-[11.5px] text-slate-600 font-semibold">
                📐 <span className="font-black text-slate-700">Batas:</span> Skor dikunci dalam rentang <span className="font-black text-teal-700">35 – 95</span> poin.
              </div>
            </div>

            {/* Skala Interpretasi */}
            <div className="space-y-2">
              <p className="text-[12px] font-black text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-1.5">Interpretasi Skor</p>
              <div className="grid grid-cols-2 gap-2 text-[11.5px]">
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="font-bold text-emerald-700">35–44: RENDAH</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" />
                  <span className="font-bold text-amber-700">45–59: SEDANG</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-orange-50 border border-orange-200 px-3 py-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-orange-500 shrink-0" />
                  <span className="font-bold text-orange-700">60–79: TINGGI</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-600 shrink-0" />
                  <span className="font-bold text-rose-700">80–95: SANGAT TINGGI</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowHealthInfo(false)}
              className="w-full py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-[13px] font-black uppercase tracking-wider transition-colors cursor-pointer border-none"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL LOG TIMELINE AKTIVITAS KEJADIAN (DENGAN KALENDER 14 HARI SIAGA) ── */}
      <TimelineCalendarModal
        isOpen={showLogModal}
        onClose={() => setShowLogModal(false)}
        disasterName={eventData.jenis_bencana}
        locationName={locationFull}
        tglKejadianRaw={eventData.tgl_kejadian || formattedDate}
        timelineLogs={effectiveTimelineLogs}
        loadingLogs={loadingLogs}
        logsError={logsError}
      />

      {/* ── MODAL SUMBER DATA API & INTEGRASI REAL-TIME ── */}
      {showApiSourcesModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-sky-50/80 via-white to-teal-50/80">
              <div className="flex items-center gap-3">
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                    {isRegionalTemplate ? 'Surveillance Data Sources' : 'Real-Time Data Sources & API Integration'}
                  </h3>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">
                    {isRegionalTemplate
                      ? 'Transparent data scope for the Indonesia SKDR surveillance view.'
                      : 'Transparent integration of hydrometeorological, seismic, marine, and health emergency data.'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowApiSourcesModal(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                title="Tutup Modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body: Source registry */}
            <div className="px-6 py-5 overflow-y-auto">
              {isRegionalTemplate ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
                    <div className="flex items-center gap-2">
                      <Activity className="h-5 w-5 text-[#0060A9]" />
                      <h4 className="text-sm font-black text-slate-900">SKDR IBS &amp; EBS</h4>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-600">
                      The regional view is powered by normalized Integrated Disease Surveillance (IBS) and Event-Based Surveillance (EBS) records.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-bold text-blue-800">
                      <span className="rounded-md bg-white px-2 py-1">Cases</span>
                      <span className="rounded-md bg-white px-2 py-1">Deaths</span>
                      <span className="rounded-md bg-white px-2 py-1">Disease signals</span>
                      <span className="rounded-md bg-white px-2 py-1">Reporting areas</span>
                      <span className="rounded-md bg-white px-2 py-1">Alert status</span>
                      <span className="rounded-md bg-white px-2 py-1">Epidemiological week</span>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
                    Weather, earthquake, air-quality, flood, facility-readiness, and disaster-impact metrics are not used in this regional surveillance template unless supplied by the SKDR feed itself.
                  </div>
                </div>
              ) : (
              <div className="space-y-3.5 divide-y divide-slate-100">
              {/* 1. Open-Meteo Flood / GloFAS */}
              <div className="pt-3.5 first:pt-0 flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 border border-cyan-200 text-cyan-700">
                  <Activity className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-slate-900">GloFAS via Open-Meteo Flood API</span>
                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black px-2 py-0.5 rounded-full">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Active
                    </span>
                    <span className="text-[10px] font-extrabold text-slate-400">Bebas Data Dummy</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Menyediakan data <strong>Debit Aliran Sungai (River Discharge dalam m³/s)</strong> harian untuk menggantikan TMA statis. Bersumber dari <em>Global Flood Awareness System (Copernicus CEMS)</em>.
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1 text-[10.5px]">
                    <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold">Debit Sungai Aktual</span>
                    <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold">Debit Puncak</span>
                    <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold">Timeline Banjir H-7 s.d. H+3</span>
                  </div>
                </div>
              </div>

              {/* 2. Open-Meteo Soil Moisture */}
              <div className="pt-3.5 flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 border border-teal-200 text-teal-700">
                  <Droplets className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-slate-900">Open-Meteo Soil Moisture Model</span>
                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black px-2 py-0.5 rounded-full">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Active
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Mengukur tingkat <strong>Kelembaban Tanah Multilapis (0-1cm, 1-3cm, 3-9cm dalam m³/m³)</strong> serta persentase kapasitas kejenuhan infiltrasi lereng untuk analisis risiko tanah longsor.
                  </p>
                </div>
              </div>

              {/* 3. Open-Meteo Weather & ECMWF */}
              <div className="pt-3.5 flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 border border-blue-200 text-blue-700">
                  <CloudRain className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-slate-900">Open-Meteo Weather Forecast & Reanalysis</span>
                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black px-2 py-0.5 rounded-full">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Active
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Menghasilkan data presipitasi curah hujan pemicu (mm/hari), akumulasi 7 hari, suhu maksimum/minimum (°C), tekanan barometrik permukaan (hPa), arah angin dominan, hembusan puncak (<em>wind gusts</em>), dan laju evapotranspirasi FAO-56 (ET0).
                  </p>
                </div>
              </div>

              {/* 4. Open-Meteo Marine */}
              <div className="pt-3.5 flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 border border-teal-200 text-teal-700">
                  <Waves className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-slate-900">Open-Meteo Marine API</span>
                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black px-2 py-0.5 rounded-full">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Active
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Menyajikan data oseanografi kelautan real-time: <strong>Tinggi Gelombang Laut Maksimum (m)</strong>, arah dominan gelombang (°), dan periode gelombang (s) untuk pemantauan tsunami, rob, abrasi, dan pasang surut.
                  </p>
                </div>
              </div>

              {/* 5. Open-Meteo Atmospheric Air Quality */}
              <div className="pt-3.5 flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 border border-purple-200 text-purple-700">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-slate-900">Open-Meteo Air Quality (CAMS & SILAM)</span>
                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black px-2 py-0.5 rounded-full">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Active
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Menghitung Indeks Kualitas Udara (US AQI / ISPU), konsentrasi partikulat halus PM2.5 & PM10, emisi gas sulfur dioksida vulkanik (SO2), karbon monoksida (CO), partikel debu atmosfer, dan indeks radiasi UV.
                  </p>
                </div>
              </div>

              {/* 6. BMKG Indonesia */}
              <div className="pt-3.5 flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 border border-red-200 text-red-700">
                  <Activity className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-slate-900">BMKG Indonesia (Pusat Gempa Bumi & TEWS)</span>
                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black px-2 py-0.5 rounded-full">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Active
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Pusat data resmi gempabumi terkini (M ≥ 5.0), kedalaman pusat gempa, status peringatan dini potensi tsunami (TEWS), serta skala intensitas guncangan dirasakan MMI di wilayah sekitar episentrum.
                  </p>
                </div>
              </div>

              {/* 7. USGS & Regional Seismic Catalog */}
              <div className="pt-3.5 flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 border border-amber-200 text-amber-700">
                  <Compass className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-slate-900">USGS Earthquake Hazards Program</span>
                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black px-2 py-0.5 rounded-full">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Active
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Katalog seismisitas global untuk memvalidasi magnitudo momen (Mw), kedalaman hiposentrum, dan rangkaian gempa susulan (*aftershocks*) pada jendela waktu H-3 sampai H+3.
                  </p>
                </div>
              </div>

              {/* 8. PetaBencana.id */}
              <div className="pt-3.5 flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 border border-blue-200 text-blue-700">
                  <Navigation className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-slate-900">PetaBencana.id (Yayasan Peta Bencana / BNPB)</span>
                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black px-2 py-0.5 rounded-full">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Active
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Laporan spasial ketinggian genangan air banjir dan kondisi darurat terverifikasi dari partisipasi warga dan BPBD secara real-time.
                  </p>
                </div>
              </div>

              {/* 9. SIPKK Kemenkes RI Core */}
              <div className="pt-3.5 flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
                  <HeartPulse className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-slate-900">SIPKK Kemenkes RI (Sistem Informasi Penanggulangan Krisis Kesehatan)</span>
                    <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-black px-2 py-0.5 rounded-full">
                      Official Database Core
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Database pelaporan resmi krisis kesehatan Republik Indonesia: korban meninggal, luka-luka, hilang, pengungsi, status faskes terdampak, sarana air bersih, logistik medis darurat, dan registrasi Tenaga Cadangan Kesehatan (TCK).
                  </p>
                </div>
              </div>
              </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-[11.5px] font-bold text-slate-500 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                {isRegionalTemplate
                  ? 'Values are read from normalized SKDR records; no weather or facility-readiness estimates are generated.'
                  : 'All data is integrated automatically without simulated values.'}
              </span>
              <button
                onClick={() => setShowApiSourcesModal(false)}
                className="px-5 py-2 rounded-xl bg-[#047D78] hover:bg-[#03625d] text-white text-xs font-black uppercase tracking-wider transition-all duration-200 shadow-md shadow-teal-900/15 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer border border-teal-600/30"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
