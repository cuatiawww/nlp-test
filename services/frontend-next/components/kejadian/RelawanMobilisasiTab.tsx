'use client'

import React, { useState, useEffect, useMemo } from 'react'
import {
  Users,
  UserCheck,
  Building2,
  TrendingUp,
  Activity,
  BriefcaseMedical,
  Stethoscope,
  HeartPulse,
  Search,
  Filter,
  RefreshCw,
  Table,
  BarChart3,
  PieChart as PieIcon,
  Layers,
  Calendar,
  FileSpreadsheet,
  Clock,
  Sparkles,
  CheckSquare,
  Square,
  Eye,
  RotateCcw
} from 'lucide-react'
import {
  ResponsiveContainer,
  ComposedChart,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from 'recharts'

interface RelawanMobilisasiTabProps {
  isNttEvent?: boolean
  selectedDate?: string
}

const TIM_COLORS = ['#0284c7', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#64748b']

const SUB_JENIS_PALETTE = [
  '#0284c7', '#0d9488', '#10b981', '#f59e0b', '#ec4899',
  '#8b5cf6', '#06b6d4', '#f97316', '#6366f1', '#84cc16',
  '#14b8a6', '#64748b', '#a855f7', '#e11d48', '#3b82f6',
  '#d97706', '#059669', '#7c3aed', '#db2777', '#475569'
]

const MASTER_JENIS_COLORS: { [key: string]: string } = {
  'Total Aktif On-Duty': '#2563eb',
  'Dokter Spesialis': '#0284c7',
  'Dokter Umum': '#06b6d4',
  'Perawat': '#10b981',
  'Bidan': '#ec4899',
  'Surveilans': '#8b5cf6',
  'Tenaga Farmasi': '#f59e0b',
  'Non Kesehatan': '#64748b',
  'Psikologi Klinis': '#a855f7',
  'Dokter Gigi': '#14b8a6',
  'Teknis Biomedika': '#3b82f6',
  'Tenaga Gizi': '#84cc16',
  'Kesmas': '#f97316',
  'Keteknisian Medis': '#6366f1',
  'Keterapian Fisik': '#d97706',
  'Kesehatan Tradisional': '#059669',
  'Kesling': '#0d9488'
}

// Helper format date now string YYYY-MM-DD
const getTodayDateString = () => {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function RelawanMobilisasiTab({ isNttEvent = true, selectedDate }: RelawanMobilisasiTabProps) {
  const [loading, setLoading] = useState<boolean>(true)
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  // Cutoff date: Default ke Date Now hari ini untuk mencegah data masa depan
  const todayDateStr = useMemo(() => {
    return selectedDate || getTodayDateString()
  }, [selectedDate])

  // Filter global berdasarkan Jenis Tenaga
  const [selectedJenisTenaga, setSelectedJenisTenaga] = useState<string>('all')

  // Sub-view toggles (Chart vs Matrix table) for each card
  const [viewModeTrendRegistrasi, setViewModeTrendRegistrasi] = useState<'chart' | 'matrix'>('chart')
  const [viewModeTrendAktif, setViewModeTrendAktif] = useState<'chart' | 'matrix'>('chart')
  const [viewModeTim, setViewModeTim] = useState<'chart' | 'matrix'>('chart')
  const [viewModeProfesi, setViewModeProfesi] = useState<'chart' | 'matrix'>('chart')

  // Interactive dynamic series toggle for Chart 2 (Multi-select)
  const [visibleLines, setVisibleLines] = useState<{ [key: string]: boolean }>({
    'Total Aktif On-Duty': true,
    'Dokter Spesialis': true,
    'Dokter Umum': true,
    'Perawat': true,
    'Bidan': true,
    'Surveilans': true,
    'Psikologi Klinis': true,
    'Tenaga Farmasi': true,
    'Non Kesehatan': true,
    'Dokter Gigi': true
  })

  // Table filtering & search
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [tableDataSource, setTableDataSource] = useState<'registrasi' | 'aktif'>('registrasi')

  const fetchData = async (forceRefresh = false) => {
    setLoading(true)
    setError(null)
    try {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
      const res = await fetch(`${basePath}/api/relawan-data?type=relawan${forceRefresh ? '&refresh=true' : ''}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP error ${res.status}`)
      const json = await res.json()
      setData(json)
    } catch (err: any) {
      console.error('[RelawanMobilisasiTab] Fetch error:', err)
      setError('Gagal memuat data relawan secara live dari spreadsheet.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData(false)
  }, [])

  const registrasiData = data?.registrasi_relawan || {}
  const timData = data?.relawan_berdasarkan_tim || {}
  const aktifData = data?.relawan_aktif_harian || {}

  // 1. FILTER TANGGAL: Batasi hanya tanggal <= Date Now (todayDateStr)
  const validDaftarTanggal = useMemo(() => {
    const rawDates: string[] = registrasiData?.daftar_tanggal || aktifData?.daftar_tanggal || []
    const capped = rawDates.filter(d => d <= todayDateStr)
    return capped
  }, [registrasiData, aktifData, todayDateStr])

  const latestValidDate = validDaftarTanggal.length > 0 ? validDaftarTanggal[validDaftarTanggal.length - 1] : todayDateStr

  // 2. Daftar Jenis Tenaga yang HANYA ADA DATANYA (> 0) s/d hari ini
  const distinctJenisTenaga = useMemo(() => {
    const countsMap: { [jt: string]: number } = {}
    const regRows = registrasiData?.data_detail || []
    const aktifRows = aktifData?.data_detail || []

    regRows.forEach((r: any) => {
      const jt = r.jenis_tenaga?.trim()
      if (!jt) return
      let rowSum = 0
      validDaftarTanggal.forEach(dt => {
        rowSum += Number(r.harian?.[dt] || 0)
      })
      countsMap[jt] = (countsMap[jt] || 0) + rowSum
    })

    aktifRows.forEach((r: any) => {
      const jt = r.jenis_tenaga?.trim()
      if (!jt) return
      const val = Number(r.harian?.[latestValidDate] || 0)
      countsMap[jt] = (countsMap[jt] || 0) + val
    })

    // Hanya ambil jenis tenaga yang total akumulasi / aktifnya > 0
    const activeList = Object.keys(countsMap).filter(jt => countsMap[jt] > 0)

    return activeList.sort((a, b) => (countsMap[b] || 0) - (countsMap[a] || 0))
  }, [registrasiData, aktifData, validDaftarTanggal, latestValidDate])

  // 3. Dataset Tren Registrasi Harian & Kurva Kumulatif (per Jenis Tenaga / Total)
  const chartTrendRegistrasi = useMemo(() => {
    const allRows = registrasiData?.data_detail || []
    
    if (allRows.length > 0 && validDaftarTanggal.length > 0) {
      const filteredRows = selectedJenisTenaga === 'all'
        ? allRows
        : allRows.filter((r: any) => r.jenis_tenaga === selectedJenisTenaga)

      let runningTotal = 0
      return validDaftarTanggal.map((tgl: string) => {
        let dailySum = 0
        filteredRows.forEach((r: any) => {
          dailySum += Number(r.harian?.[tgl] || 0)
        })
        runningTotal += dailySum
        return {
          tanggal: tgl.length > 5 ? tgl.slice(5) : tgl,
          tanggalFull: tgl,
          'Penambahan Harian': dailySum,
          'Total Kumulatif': runningTotal
        }
      })
    }

    const rawTren = (registrasiData?.tren_harian || []).filter((item: any) => item.tanggal <= todayDateStr)
    if (rawTren.length > 0) {
      return rawTren.map((item: any) => ({
        tanggal: item.tanggal ? (item.tanggal.length > 5 ? item.tanggal.slice(5) : item.tanggal) : '',
        tanggalFull: item.tanggal,
        'Penambahan Harian': Number(item.penambahan_baru || 0),
        'Total Kumulatif': Number(item.total_kumulatif || 0)
      }))
    }

    return []
  }, [registrasiData, selectedJenisTenaga, validDaftarTanggal, todayDateStr])

  // 4. Dataset Tren Relawan Aktif On-Duty: Breakdown dinamis untuk Jenis Tenaga yang ada datanya
  const { chartTrendAktif, activeJenisTenagaKeys } = useMemo(() => {
    const allRows = aktifData?.data_detail || []
    const activeKeysSet = new Set<string>()

    if (validDaftarTanggal.length === 0) {
      return { chartTrendAktif: [], activeJenisTenagaKeys: [] }
    }

    const records = validDaftarTanggal.map((tgl: string) => {
      let totalAktif = 0
      const out: any = {
        tanggal: tgl.length > 5 ? tgl.slice(5) : tgl,
        tanggalFull: tgl
      }

      if (selectedJenisTenaga === 'all') {
        const byJenis: { [key: string]: number } = {}
        distinctJenisTenaga.forEach(jt => { byJenis[jt] = 0 })

        allRows.forEach((r: any) => {
          const val = Number(r.harian?.[tgl] || 0)
          totalAktif += val
          const jt = r.jenis_tenaga || 'Lainnya'
          byJenis[jt] = (byJenis[jt] || 0) + val
          if (val > 0) activeKeysSet.add(jt)
        })

        out['Total Aktif On-Duty'] = totalAktif
        distinctJenisTenaga.forEach(jt => {
          out[jt] = byJenis[jt] || 0
        })
      } else {
        let jtSum = 0
        allRows.filter((r: any) => r.jenis_tenaga === selectedJenisTenaga).forEach((r: any) => {
          jtSum += Number(r.harian?.[tgl] || 0)
        })
        out[`Aktif: ${selectedJenisTenaga}`] = jtSum
        activeKeysSet.add(`Aktif: ${selectedJenisTenaga}`)
      }

      return out
    })

    return {
      chartTrendAktif: records,
      activeJenisTenagaKeys: Array.from(activeKeysSet)
    }
  }, [aktifData, selectedJenisTenaga, validDaftarTanggal, distinctJenisTenaga])

  // Helper toggle series line
  const toggleLineVisibility = (key: string) => {
    setVisibleLines(prev => ({
      ...prev,
      [key]: prev[key] === false ? true : false
    }))
  }

  const setOnlySeries = (keys: string[]) => {
    const next: { [key: string]: boolean } = {}
    distinctJenisTenaga.forEach(jt => { next[jt] = false })
    next['Total Aktif On-Duty'] = false
    keys.forEach(k => { next[k] = true })
    setVisibleLines(next)
  }

  const selectAllSeries = () => {
    const next: { [key: string]: boolean } = { 'Total Aktif On-Duty': true }
    distinctJenisTenaga.forEach(jt => { next[jt] = true })
    setVisibleLines(next)
  }

  // 5. Summary Metrics Capped to Date Now & Categorized by Jenis Tenaga
  const dynamicSummary = useMemo(() => {
    const regRows = registrasiData?.data_detail || []
    const aktifRows = aktifData?.data_detail || []

    const sumByJenisReg: { [key: string]: number } = {}
    const sumByJenisAktif: { [key: string]: number } = {}

    distinctJenisTenaga.forEach(jt => {
      sumByJenisReg[jt] = 0
      sumByJenisAktif[jt] = 0
    })

    let totalReg = 0
    let totalAktif = 0

    regRows.forEach((r: any) => {
      const jt = r.jenis_tenaga || 'Lainnya'
      validDaftarTanggal.forEach((dt: string) => {
        const val = Number(r.harian?.[dt] || 0)
        totalReg += val
        sumByJenisReg[jt] = (sumByJenisReg[jt] || 0) + val
      })
    })

    aktifRows.forEach((r: any) => {
      const jt = r.jenis_tenaga || 'Lainnya'
      const val = Number(r.harian?.[latestValidDate] || 0)
      totalAktif += val
      sumByJenisAktif[jt] = (sumByJenisAktif[jt] || 0) + val
    })

    const dokterReg = (sumByJenisReg['Dokter Spesialis'] || 0) + (sumByJenisReg['Dokter Umum'] || 0)
    const perawatBidanReg = (sumByJenisReg['Perawat'] || 0) + (sumByJenisReg['Bidan'] || 0)
    const nonKesehatanReg = sumByJenisReg['Non Kesehatan'] || 0
    const penunjangReg = (sumByJenisReg['Tenaga Farmasi'] || 0) + (sumByJenisReg['Surveilans'] || 0) + (sumByJenisReg['Psikologi Klinis'] || 0) + (sumByJenisReg['Dokter Gigi'] || 0)

    return {
      total_registrasi: totalReg,
      total_aktif: totalAktif,
      dokter_total: dokterReg,
      perawat_bidan_total: perawatBidanReg,
      non_kesehatan_total: nonKesehatanReg,
      penunjang_total: penunjangReg,
      sumByJenisReg,
      sumByJenisAktif,
      cutoff_date: latestValidDate
    }
  }, [registrasiData, aktifData, distinctJenisTenaga, validDaftarTanggal, latestValidDate])

  // 6. Dataset STACKED BAR CHART: 1 Bar per Jenis Tenaga (hanya yang ada data)
  const { stackedBarData, allSubJenisKeys, subJenisColorMap, subJenisBreakdownList } = useMemo(() => {
    const regRows = registrasiData?.data_detail || []
    const distinctSubKeysSet = new Set<string>()
    const grouped: { [jt: string]: { [sub: string]: number; total: number } } = {}
    const breakdownList: any[] = []

    distinctJenisTenaga.forEach(jt => {
      grouped[jt] = { total: 0 }
    })

    regRows.forEach((r: any) => {
      const jt = r.jenis_tenaga || 'Lainnya'
      const sub = r.sub_jenis_tenaga || jt

      let sumCapped = 0
      validDaftarTanggal.forEach(dt => {
        sumCapped += Number(r.harian?.[dt] || 0)
      })

      if (sumCapped > 0) {
        distinctSubKeysSet.add(sub)
        if (!grouped[jt]) {
          grouped[jt] = { total: 0 }
        }
        grouped[jt][sub] = (grouped[jt][sub] || 0) + sumCapped
        grouped[jt].total = (grouped[jt].total || 0) + sumCapped

        breakdownList.push({
          jenis_tenaga: jt,
          sub_jenis_tenaga: sub,
          total_kumulatif: sumCapped,
          aktif_terkini: Number(r.harian?.[latestValidDate] || 0)
        })
      }
    })

    const allKeys = Array.from(distinctSubKeysSet)
    const colorMap: { [key: string]: string } = {}
    allKeys.forEach((key, idx) => {
      colorMap[key] = SUB_JENIS_PALETTE[idx % SUB_JENIS_PALETTE.length]
    })

    const dataList = Object.keys(grouped)
      .filter(jt => grouped[jt].total > 0)
      .map(jt => {
        const item = grouped[jt]
        return {
          jenis_tenaga: jt,
          ...item
        }
      }).sort((a, b) => b.total - a.total)

    return {
      stackedBarData: dataList,
      allSubJenisKeys: allKeys,
      subJenisColorMap: colorMap,
      subJenisBreakdownList: breakdownList.sort((a, b) => b.total_kumulatif - a.total_kumulatif)
    }
  }, [registrasiData, distinctJenisTenaga, validDaftarTanggal, latestValidDate])

  // 7. Dataset Kategori Tim
  const chartTim = useMemo(() => {
    return (timData?.kategori_tim || []).map((item: any) => ({
      name: item.kategori,
      value: item.jumlah,
      persentase: item.persentase_formatted || `${item.persentase}%`
    }))
  }, [timData])

  // 8. Filter detail table rows
  const activeTableRows = tableDataSource === 'registrasi' ? (registrasiData?.data_detail || []) : (aktifData?.data_detail || [])
  
  const filteredTableRows = useMemo(() => {
    return activeTableRows.filter((row: any) => {
      const matchSearch =
        !searchTerm ||
        row.jenis_tenaga?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.sub_jenis_tenaga?.toLowerCase().includes(searchTerm.toLowerCase())

      const matchCategory = selectedJenisTenaga === 'all' || row.jenis_tenaga === selectedJenisTenaga

      return matchSearch && matchCategory
    })
  }, [activeTableRows, searchTerm, selectedJenisTenaga])

  return (
    <div className="space-y-6">
      {/* Top Banner Header (Flat Clean Theme) */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 text-slate-800 shadow-xs border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-50 border border-teal-200 text-teal-700">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-base sm:text-lg font-black tracking-tight text-slate-900 m-0">
                  Mobilisasi &amp; Monitoring Relawan Kesehatan NTT
                </h4>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-black inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Data s/d Hari Ini ({latestValidDate})
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5 mb-0">
                Menampilkan {distinctJenisTenaga.length} kategori jenis tenaga aktif yang terdaftar dan bertugas di posko/faskes
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-center">
          <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-teal-600" />
            <span>Periode: s/d {latestValidDate}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchData(true)}
            disabled={loading}
            className="p-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold transition shadow-xs disabled:opacity-50 flex items-center gap-1 text-xs cursor-pointer"
            title="Muat ulang data dari spreadsheet"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* 1. Interactive Jenis Tenaga Filter Bar (Pills Selector - Hanya yang Ada Data) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 shadow-xs space-y-2.5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-teal-700" />
            <span className="text-xs font-black uppercase tracking-wider text-slate-800">
              Filter Berdasarkan Jenis Tenaga:
            </span>
            {selectedJenisTenaga !== 'all' && (
              <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-900 font-black text-[10px] border border-teal-300">
                Aktif: {selectedJenisTenaga}
              </span>
            )}
          </div>
          <span className="text-[11px] font-semibold text-slate-500">
            Pilih profesi untuk memfilter seluruh chart &amp; tabel matriks
          </span>
        </div>

        {/* Quick Filter Pills per Jenis Tenaga */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => setSelectedJenisTenaga('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 border ${
              selectedJenisTenaga === 'all'
                ? 'bg-teal-700 text-white border-teal-800 shadow-2xs font-black'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Semua Jenis Tenaga ({distinctJenisTenaga.length})</span>
          </button>

          {distinctJenisTenaga.map((jt) => {
            const isSelected = selectedJenisTenaga === jt
            const count = dynamicSummary.sumByJenisReg?.[jt] || 0
            return (
              <button
                key={jt}
                type="button"
                onClick={() => setSelectedJenisTenaga(jt)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 border ${
                  isSelected
                    ? 'bg-teal-700 text-white border-teal-800 shadow-2xs font-black'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                <span>{jt}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                  isSelected ? 'bg-teal-900 text-teal-100' : 'bg-slate-100 text-slate-700'
                }`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 2. Summary Cards (Flat Clean Cards Consistent with SIPKK Theme) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Total Terdaftar */}
        <div className="rounded-2xl bg-white border border-teal-200 p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-teal-800">
              {selectedJenisTenaga === 'all' ? 'Total Terdaftar' : `Terdaftar (${selectedJenisTenaga})`}
            </span>
            <UserCheck className="h-4 w-4 text-teal-600" />
          </div>
          <div className="mt-2">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">
              {selectedJenisTenaga === 'all' ? dynamicSummary.total_registrasi.toLocaleString('id-ID') : (dynamicSummary.sumByJenisReg?.[selectedJenisTenaga] || 0).toLocaleString('id-ID')}
            </span>
            <span className="text-[11px] text-teal-700 font-bold ml-1.5">Personil</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium mt-1">Akumulasi s/d {latestValidDate}</span>
        </div>

        {/* Aktif On-Duty */}
        <div className="rounded-2xl bg-white border border-blue-200 p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-800">
              {selectedJenisTenaga === 'all' ? 'Aktif On-Duty' : `Aktif (${selectedJenisTenaga})`}
            </span>
            <Activity className="h-4 w-4 text-blue-600" />
          </div>
          <div className="mt-2">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">
              {selectedJenisTenaga === 'all' ? dynamicSummary.total_aktif.toLocaleString('id-ID') : (dynamicSummary.sumByJenisAktif?.[selectedJenisTenaga] || 0).toLocaleString('id-ID')}
            </span>
            <span className="text-[11px] text-blue-700 font-bold ml-1.5">Bertugas</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium mt-1">Posisi aktif pada {latestValidDate}</span>
        </div>

        {/* Dokter (Spesialis & Umum) */}
        <div className="rounded-2xl bg-white border border-sky-200 p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-sky-800">Dokter (Spesialis &amp; Umum)</span>
            <Stethoscope className="h-4 w-4 text-sky-600" />
          </div>
          <div className="mt-2">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">{dynamicSummary.dokter_total.toLocaleString('id-ID')}</span>
            <span className="text-[11px] text-sky-700 font-bold ml-1.5">Dokter</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium mt-1">
            Spesialis &amp; Dokter Umum terdaftar
          </span>
        </div>

        {/* Perawat & Bidan */}
        <div className="rounded-2xl bg-white border border-emerald-200 p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">Perawat &amp; Bidan</span>
            <HeartPulse className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">{dynamicSummary.perawat_bidan_total.toLocaleString('id-ID')}</span>
            <span className="text-[11px] text-emerald-700 font-bold ml-1.5">Personil</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium mt-1">
            Tenaga keperawatan &amp; kebidanan
          </span>
        </div>

        {/* Non-Kesehatan & Penunjang */}
        <div className="rounded-2xl bg-white border border-purple-200 p-4 shadow-xs flex flex-col justify-between col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-800">Non-Kesehatan &amp; Penunjang</span>
            <Layers className="h-4 w-4 text-purple-600" />
          </div>
          <div className="mt-2">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">{(dynamicSummary.non_kesehatan_total + dynamicSummary.penunjang_total).toLocaleString('id-ID')}</span>
            <span className="text-[11px] text-purple-700 font-bold ml-1.5">Personil</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium mt-1">
            Farmasi, Surveilans, Psikologi, dll.
          </span>
        </div>
      </div>

      {/* 3. Primary Trend Charts Grid (Fixed Height with Internal Scroll for Matrix) */}
      {/* 3. Primary Trend Charts Grid (Synchronized Equal Height) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        
        {/* Chart Card 1: Tren Registrasi Harian & Kurva Kumulatif */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col justify-between h-full">
          <div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-3 border-b border-slate-100 gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-teal-600" />
                  <h5 className="text-sm font-black text-slate-900 m-0">
                    Tren Registrasi Harian &amp; Kumulatif {selectedJenisTenaga !== 'all' ? `— ${selectedJenisTenaga}` : ''}
                  </h5>
                </div>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5 mb-0">
                  Penambahan personil baru harian (Bar) dan akumulasi berjalan s/d {latestValidDate}
                </p>
              </div>

              {/* Matrix View Toggle Button */}
              <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200/80 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewModeTrendRegistrasi('chart')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    viewModeTrendRegistrasi === 'chart'
                      ? 'bg-white text-teal-900 shadow-2xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  <span>Grafik</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewModeTrendRegistrasi('matrix')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    viewModeTrendRegistrasi === 'matrix'
                      ? 'bg-white text-teal-900 shadow-2xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Table className="h-3.5 w-3.5" />
                  <span>Matriks</span>
                </button>
              </div>
            </div>

            {/* Balancing Sub-bar: Snapshot Registrasi Info */}
            <div className="mt-2.5 p-2 bg-slate-50/90 rounded-xl border border-slate-200/80 flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
              <div className="flex items-center gap-1.5 font-bold text-slate-700">
                <Sparkles className="h-3.5 w-3.5 text-teal-600" />
                <span>Status Registrasi:</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 font-bold text-[10px]">
                  Total Terdaftar: <strong className="text-teal-700 font-black">{dynamicSummary.total_registrasi.toLocaleString('id-ID')} Personil</strong>
                </span>
                <span className="px-2 py-0.5 rounded-md bg-teal-50 border border-teal-200 text-teal-800 font-bold text-[10px]">
                  {chartTrendRegistrasi.length} Titik Tanggal
                </span>
              </div>
            </div>
          </div>

          {/* Content: Flex-grow Container */}
          <div className="mt-3.5 flex-1 min-h-[300px] w-full flex flex-col justify-end">
            {viewModeTrendRegistrasi === 'chart' ? (
              <div className="w-full h-full min-h-[300px]">
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={chartTrendRegistrasi} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="tanggal" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#0d9488' }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                      formatter={(val: any, name: any) => [Number(val).toLocaleString('id-ID') + ' personil', name]}
                      labelFormatter={(label, payload) => `Tanggal: ${payload?.[0]?.payload?.tanggalFull || label}`}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                    <Bar yAxisId="left" dataKey="Penambahan Harian" fill="#38bdf8" radius={[4, 4, 0, 0]} maxBarSize={32} />
                    <Area yAxisId="right" type="monotone" dataKey="Total Kumulatif" stroke="#0d9488" strokeWidth={3} fill="#0d9488" fillOpacity={0.12} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] overflow-y-auto overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 font-bold border-b border-slate-200 shadow-2xs">
                    <tr>
                      <th className="py-2.5 px-3 bg-slate-100">Tanggal</th>
                      <th className="py-2.5 px-3 text-right bg-slate-100">Penambahan Harian</th>
                      <th className="py-2.5 px-3 text-right bg-teal-100/90 text-teal-950">Total Kumulatif Berjalan</th>
                      <th className="py-2.5 px-3 text-center bg-slate-100">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {chartTrendRegistrasi.map((row: any, idx: number) => (
                      <tr key={idx} className={`hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                        <td className="py-2 px-3 font-semibold text-slate-800">{row.tanggalFull || row.tanggal}</td>
                        <td className="py-2 px-3 text-right font-bold text-sky-700">+{row['Penambahan Harian']}</td>
                        <td className="py-2 px-3 text-right font-black text-teal-800 bg-teal-50/30">{row['Total Kumulatif'].toLocaleString('id-ID')}</td>
                        <td className="py-2 px-3 text-center">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Terdata
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Chart Card 2: Tren Relawan Aktif Harian (Dinamis Multi-Select Kategori) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col justify-between h-full">
          <div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-3 border-b border-slate-100 gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-600" />
                  <h5 className="text-sm font-black text-slate-900 m-0">
                    Tren Relawan Aktif di Lapangan (On-Duty)
                  </h5>
                </div>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5 mb-0">
                  Centang/klik kategori di bawah untuk mengatur garis yang ingin ditampilkan
                </p>
              </div>

              {/* Matrix View Toggle Button */}
              <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200/80 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewModeTrendAktif('chart')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    viewModeTrendAktif === 'chart'
                      ? 'bg-white text-blue-900 shadow-2xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  <span>Grafik</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewModeTrendAktif('matrix')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    viewModeTrendAktif === 'matrix'
                      ? 'bg-white text-blue-900 shadow-2xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Table className="h-3.5 w-3.5" />
                  <span>Matriks</span>
                </button>
              </div>
            </div>

            {/* Interactive Multi-Select Series Checkbox Bar */}
            {selectedJenisTenaga === 'all' && (
              <div className="mt-2.5 p-2 bg-slate-50/90 rounded-xl border border-slate-200/80 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-1.5 pb-1 border-b border-slate-200/60 text-[11px]">
                  <div className="flex items-center gap-1.5 font-bold text-slate-700">
                    <Eye className="h-3.5 w-3.5 text-blue-600" />
                    <span>Pilih Garis Kategori yang Ditampilkan:</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={selectAllSeries}
                      className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 text-[10px] cursor-pointer"
                    >
                      Semua
                    </button>
                    <button
                      type="button"
                      onClick={() => setOnlySeries(['Dokter Spesialis', 'Dokter Umum'])}
                      className="px-2 py-0.5 rounded-md bg-sky-50 border border-sky-200 text-sky-800 font-bold hover:bg-sky-100 text-[10px] cursor-pointer"
                    >
                      Hanya Dokter
                    </button>
                    <button
                      type="button"
                      onClick={() => setOnlySeries(['Perawat', 'Bidan'])}
                      className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold hover:bg-emerald-100 text-[10px] cursor-pointer"
                    >
                      Perawat &amp; Bidan
                    </button>
                    <button
                      type="button"
                      onClick={() => setOnlySeries(['Total Aktif On-Duty'])}
                      className="px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-800 font-bold hover:bg-blue-100 text-[10px] cursor-pointer"
                    >
                      Hanya Total
                    </button>
                  </div>
                </div>

                {/* Chips Checkbox Series */}
                <div className="flex flex-wrap items-center gap-1.5 max-h-[70px] overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => toggleLineVisibility('Total Aktif On-Duty')}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 border transition cursor-pointer ${
                      visibleLines['Total Aktif On-Duty'] !== false
                        ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                        : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-white shrink-0" />
                    <span>Total Aktif</span>
                  </button>

                  {distinctJenisTenaga.map(jt => {
                    const isVisible = visibleLines[jt] !== false
                    const color = MASTER_JENIS_COLORS[jt] || '#0d9488'
                    return (
                      <button
                        key={jt}
                        type="button"
                        onClick={() => toggleLineVisibility(jt)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 border transition cursor-pointer ${
                          isVisible
                            ? 'bg-white text-slate-800 border-slate-300 shadow-2xs'
                            : 'bg-slate-100/60 text-slate-400 border-slate-200 line-through opacity-60'
                        }`}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: isVisible ? color : '#94a3b8' }}
                        />
                        <span>{jt}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Content: Flex-grow Container */}
          <div className="mt-2.5 flex-1 min-h-[300px] w-full flex flex-col justify-end">
            {viewModeTrendAktif === 'chart' ? (
              <div className="w-full h-full min-h-[300px]">
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={chartTrendAktif} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="tanggal" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '11px' }}
                      formatter={(val: any, name: any) => [Number(val).toLocaleString('id-ID') + ' orang', name]}
                      labelFormatter={(label, payload) => `Tanggal: ${payload?.[0]?.payload?.tanggalFull || label}`}
                    />
                    <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }} />
                    {selectedJenisTenaga === 'all' ? (
                      <>
                        {visibleLines['Total Aktif On-Duty'] !== false && (
                          <Area type="monotone" dataKey="Total Aktif On-Duty" stroke="#2563eb" strokeWidth={3} fill="#2563eb" fillOpacity={0.12} />
                        )}
                        {distinctJenisTenaga.map((jt) => {
                          if (visibleLines[jt] === false) return null
                          return (
                            <Line
                              key={jt}
                              type="monotone"
                              dataKey={jt}
                              stroke={MASTER_JENIS_COLORS[jt] || '#64748b'}
                              strokeWidth={2}
                              dot={{ r: 2 }}
                            />
                          )
                        })}
                      </>
                    ) : (
                      <Area type="monotone" dataKey={`Aktif: ${selectedJenisTenaga}`} stroke="#2563eb" strokeWidth={3} fill="url(#aktifTotalGradient)" />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] overflow-y-auto overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 font-bold border-b border-slate-200 shadow-2xs">
                    <tr>
                      <th className="py-2.5 px-3 bg-slate-100">Tanggal</th>
                      {selectedJenisTenaga === 'all' ? (
                        <>
                          {visibleLines['Total Aktif On-Duty'] !== false && (
                            <th className="py-2.5 px-3 text-right bg-blue-100/90 text-blue-950 font-black">Total Aktif</th>
                          )}
                          {distinctJenisTenaga.map(jt => {
                            if (visibleLines[jt] === false) return null
                            return (
                              <th key={jt} className="py-2.5 px-2 text-right bg-slate-100 whitespace-nowrap text-slate-700">
                                {jt}
                              </th>
                            )
                          })}
                        </>
                      ) : (
                        <th className="py-2.5 px-3 text-right bg-blue-100/90 text-blue-950 font-black">Aktif ({selectedJenisTenaga})</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {chartTrendAktif.map((row: any, idx: number) => (
                      <tr key={idx} className={`hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                        <td className="py-2 px-3 font-semibold text-slate-800">{row.tanggalFull || row.tanggal}</td>
                        {selectedJenisTenaga === 'all' ? (
                          <>
                            {visibleLines['Total Aktif On-Duty'] !== false && (
                              <td className="py-2 px-3 text-right font-black text-blue-800 bg-blue-50/30">{row['Total Aktif On-Duty']?.toLocaleString('id-ID')}</td>
                            )}
                            {distinctJenisTenaga.map(jt => {
                              if (visibleLines[jt] === false) return null
                              return (
                                <td key={jt} className="py-2 px-2 text-right font-bold text-slate-700">
                                  {row[jt] || 0}
                                </td>
                              )
                            })}
                          </>
                        ) : (
                          <td className="py-2 px-3 text-right font-black text-blue-800 bg-blue-50/30">{row[`Aktif: ${selectedJenisTenaga}`]?.toLocaleString('id-ID')}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 4. Distribution Charts Grid: Kategori Tim & STACKED Bar Chart Komposisi Jenis Tenaga */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        
        {/* Card 3: Distribusi Berdasarkan Kategori Tim / Lembaga */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col justify-between h-full">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-3 border-b border-slate-100 gap-2">
            <div>
              <div className="flex items-center gap-2">
                <PieIcon className="h-4 w-4 text-purple-600" />
                <h5 className="text-sm font-black text-slate-900 m-0">
                  Distribusi Relawan Berdasarkan Kategori Tim
                </h5>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5 mb-0">
                Asal institusi / lembaga pengirim relawan ke wilayah bencana
              </p>
            </div>

            <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200/80 shrink-0">
              <button
                type="button"
                onClick={() => setViewModeTim('chart')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  viewModeTim === 'chart' ? 'bg-white text-purple-900 shadow-2xs font-black' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <PieIcon className="h-3.5 w-3.5" />
                <span>Donut</span>
              </button>
              <button
                type="button"
                onClick={() => setViewModeTim('matrix')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  viewModeTim === 'matrix' ? 'bg-white text-purple-900 shadow-2xs font-black' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Table className="h-3.5 w-3.5" />
                <span>Matriks</span>
              </button>
            </div>
          </div>

          <div className="mt-3.5 h-[280px] w-full">
            {viewModeTim === 'chart' ? (
              <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-4 h-full">
                <div className="sm:col-span-6 h-[230px]">
                  <ResponsiveContainer width="100%" height={230}>
                    <PieChart>
                      <Pie
                        data={chartTim}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {chartTim.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={TIM_COLORS[index % TIM_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                        formatter={(val: any) => [Number(val).toLocaleString('id-ID') + ' relawan', 'Jumlah']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="sm:col-span-6 space-y-1.5 max-h-[230px] overflow-y-auto pr-1">
                  {(timData?.kategori_tim || []).map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between text-xs p-1.5 rounded-lg hover:bg-slate-50 transition">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: TIM_COLORS[idx % TIM_COLORS.length] }} />
                        <span className="font-bold text-slate-700 truncate">{item.kategori}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-black text-slate-900">{item.jumlah}</span>
                        <span className="text-[10px] text-slate-400 font-bold w-12 text-right">{item.persentase_formatted || `${item.persentase}%`}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-[280px] overflow-y-auto overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 font-bold border-b border-slate-200 shadow-2xs">
                    <tr>
                      <th className="py-2.5 px-3 bg-slate-100">Kategori Lembaga / Tim</th>
                      <th className="py-2.5 px-3 text-right bg-slate-100">Jumlah Relawan</th>
                      <th className="py-2.5 px-3 text-right bg-slate-100">Persentase</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {timData?.kategori_tim?.map((row: any, idx: number) => (
                      <tr key={idx} className={`hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                        <td className="py-2.5 px-3 font-bold text-slate-800 flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: TIM_COLORS[idx % TIM_COLORS.length] }} />
                          <span>{row.kategori}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-black text-purple-900">{row.jumlah}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-600">{row.persentase_formatted || `${row.persentase}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Card 4: STACKED Bar Chart Komposisi Jenis Tenaga & Sub-Spesialisasi */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col justify-between h-full">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-3 border-b border-slate-100 gap-2">
            <div>
              <div className="flex items-center gap-2">
                <BriefcaseMedical className="h-4 w-4 text-emerald-600" />
                <h5 className="text-sm font-black text-slate-900 m-0">
                  Komposisi Kelompok Jenis Tenaga (Stacked Sub-Spesialisasi)
                </h5>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5 mb-0">
                1 Bar terbagi multi-warna mewakili sub-spesialisasi relawan s/d {latestValidDate}
              </p>
            </div>

            <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200/80 shrink-0">
              <button
                type="button"
                onClick={() => setViewModeProfesi('chart')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  viewModeProfesi === 'chart' ? 'bg-white text-emerald-900 shadow-2xs font-black' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                <span>Stacked Bar</span>
              </button>
              <button
                type="button"
                onClick={() => setViewModeProfesi('matrix')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  viewModeProfesi === 'matrix' ? 'bg-white text-emerald-900 shadow-2xs font-black' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Table className="h-3.5 w-3.5" />
                <span>Matriks Sub-Jenis</span>
              </button>
            </div>
          </div>

          <div className="mt-3.5 h-[280px] w-full">
            {viewModeProfesi === 'chart' ? (
              <div className="w-full h-full">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={stackedBarData}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 35, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis
                      dataKey="jenis_tenaga"
                      type="category"
                      tick={{ fontSize: 11, fill: '#1e293b', fontWeight: 700 }}
                      axisLine={false}
                      tickLine={false}
                      width={105}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '11px', maxWidth: '320px' }}
                      formatter={(val: any, name: any) => {
                        if (!val || val === 0) return [null, null]
                        return [`${val} orang`, name]
                      }}
                      itemSorter={(item) => (item.value ? -Number(item.value) : 0)}
                    />
                    {allSubJenisKeys.map((subKey) => (
                      <Bar
                        key={subKey}
                        dataKey={subKey}
                        stackId="subTenagaStack"
                        fill={subJenisColorMap[subKey] || '#0d9488'}
                        maxBarSize={22}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[280px] overflow-y-auto overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 font-bold border-b border-slate-200 shadow-2xs">
                    <tr>
                      <th className="py-2.5 px-3 bg-slate-100">Jenis Tenaga</th>
                      <th className="py-2.5 px-3 bg-slate-100">Sub Jenis Tenaga</th>
                      <th className="py-2.5 px-3 text-right bg-teal-100/90 text-teal-950 font-black">Total Terdaftar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {subJenisBreakdownList.map((row, idx) => (
                      <tr key={idx} className={`hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                        <td className="py-2 px-3 font-bold text-slate-800">{row.jenis_tenaga}</td>
                        <td className="py-2 px-3 font-semibold text-slate-900 flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-sm shrink-0"
                            style={{ backgroundColor: subJenisColorMap[row.sub_jenis_tenaga] || '#0d9488' }}
                          />
                          <span>{row.sub_jenis_tenaga}</span>
                        </td>
                        <td className="py-2 px-3 text-right font-black text-teal-900 bg-teal-50/20">{row.total_kumulatif.toLocaleString('id-ID')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 5. Full Interactive Matrix Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-100 pb-3.5 gap-3">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4.5 w-4.5 text-teal-600" />
              <h5 className="text-sm sm:text-base font-black text-slate-900 m-0">
                Matriks Rinci Data Harian per Jenis Tenaga &amp; Sub-Spesialisasi
              </h5>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5 mb-0">
              Eksplorasi angka rincian harian s/d tanggal {latestValidDate}
            </p>
          </div>

          {/* Dataset Switcher (Registrasi vs Aktif) */}
          <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => setTableDataSource('registrasi')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                tableDataSource === 'registrasi'
                  ? 'bg-white text-teal-900 shadow-2xs font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Data Registrasi Harian
            </button>
            <button
              type="button"
              onClick={() => setTableDataSource('aktif')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                tableDataSource === 'aktif'
                  ? 'bg-white text-blue-900 shadow-2xs font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Data Relawan Aktif On-Duty
            </button>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari jenis tenaga / sub-spesialisasi..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Filter className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-[11px] font-bold text-slate-600">Jenis Tenaga:</span>
            <select
              value={selectedJenisTenaga}
              onChange={(e) => setSelectedJenisTenaga(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 cursor-pointer shadow-2xs"
            >
              <option value="all">Semua Jenis Tenaga ({distinctJenisTenaga.length})</option>
              {distinctJenisTenaga.map((jt) => (
                <option key={jt} value={jt}>{jt}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs max-h-[420px] overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10 shadow-xs">
              <tr>
                <th className="py-2.5 px-3 w-10 text-center bg-slate-100">No</th>
                <th className="py-2.5 px-3 bg-slate-100">Jenis Tenaga</th>
                <th className="py-2.5 px-3 bg-slate-100">Sub Jenis Tenaga</th>
                {validDaftarTanggal.map((dt: string) => (
                  <th key={dt} className="py-2.5 px-2 text-center whitespace-nowrap bg-slate-100 border-l border-slate-200/80">
                    {dt.length > 5 ? dt.slice(5) : dt}
                  </th>
                ))}
                <th className="py-2.5 px-3 text-right bg-teal-100/90 text-teal-950 border-l border-teal-200 font-black">
                  {tableDataSource === 'registrasi' ? 'Total Terdaftar' : 'Aktif Terkini'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredTableRows.length > 0 ? (
                filteredTableRows.map((row: any, idx: number) => {
                  let rowTotalCapped = 0
                  validDaftarTanggal.forEach(dt => {
                    rowTotalCapped += Number(row.harian?.[dt] || 0)
                  })
                  const activeLatest = Number(row.harian?.[latestValidDate] || 0)

                  return (
                    <tr key={idx} className={`hover:bg-teal-50/40 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                      <td className="py-2 px-3 text-center text-slate-400 font-bold">{row.no || idx + 1}</td>
                      <td className="py-2 px-3 font-bold text-slate-800">{row.jenis_tenaga}</td>
                      <td className="py-2 px-3 font-semibold text-slate-900">{row.sub_jenis_tenaga}</td>
                      {validDaftarTanggal.map((dt: string) => {
                        const val = row.harian?.[dt] || 0
                        return (
                          <td key={dt} className="py-2 px-2 text-center border-l border-slate-100 font-semibold text-slate-700">
                            {val > 0 ? (
                              <span className="font-bold text-slate-900">{val}</span>
                            ) : (
                              <span className="text-slate-300 font-normal">0</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="py-2 px-3 text-right font-black bg-teal-50/40 text-teal-900 border-l border-teal-100">
                        {tableDataSource === 'registrasi' ? rowTotalCapped : activeLatest}
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={validDaftarTanggal.length + 4} className="py-8 text-center text-slate-400 font-semibold">
                    Tidak ada baris yang sesuai dengan kriteria pencarian.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
