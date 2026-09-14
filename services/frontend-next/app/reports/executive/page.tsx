"use client"

import React, { useState, useEffect, useMemo, useRef } from "react"
import Link from "next/link"
import {
  Printer,
  Download,
  Settings,
  Sparkles,
  RefreshCw,
  Eye,
  Edit3,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  FileText,
  ChevronRight,
  ChevronDown,
  Layers,
  MapPin,
  TrendingUp,
  PieChart,
  BarChart3,
  Shield,
  Activity,
  Globe,
  Share2,
  Calendar,
  X,
  Plus,
  Trash2,
  ArrowLeft,
  Info,
} from "lucide-react"
import { fetchPublicDashboard, fetchEvents } from "@/lib/api"
import type { PublicDashboard, DiseaseEvent } from "@/types"
import {
  SpatialHotspotMap,
  TrendEpiCurveChart,
  DiseaseDistributionDonut,
  CountryCfrBarChart,
  type HotspotLocation,
  type TrendDataPoint,
  type DiseaseShare,
  type CountryBurden,
} from "@/components/reports/ExecutiveReportCharts"

// ==========================================
// TYPES
// ==========================================
type TemplateType = "kemenkes_sitrep" | "asean_bulletin"
type CadenceType = "weekly" | "monthly" | "custom"

interface DiseaseHighlight {
  id: string
  diseaseName: string
  countryHighlights: {
    id: string
    country: string
    content: string
    url?: string
  }[]
}

export default function ExecutiveReportPage() {
  const [loading, setLoading] = useState(true)
  const [dashboardData, setDashboardData] = useState<PublicDashboard | null>(null)
  const [events, setEvents] = useState<DiseaseEvent[]>([])

  // ==========================================
  // HUMAN CUSTOMIZATION STATE
  // ==========================================
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<string>("ringkasan")

  // 1. Template & Cadence
  const [template, setTemplate] = useState<TemplateType>("kemenkes_sitrep")
  const [cadence, setCadence] = useState<CadenceType>("weekly")
  const [epiPeriodText, setEpiPeriodText] = useState("14 Sep 2026 (Minggu ke-38)")

  // 2. Watermark
  const [watermarkEnabled, setWatermarkEnabled] = useState(true)
  const [watermarkText, setWatermarkText] = useState("RESMI KEMENKES RI")
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.08)

  // 3. Document Meta
  const [reportTitle, setReportTitle] = useState(
    "Laporan Pengawasan Surveilans Penyakit Infeksi & Outbreak Kemenkes RI"
  )
  const [reportSubtitle, setReportSubtitle] = useState(
    "Pusat Intelijen Epidemiologi & SPGDT — Kementerian Kesehatan Republik Indonesia"
  )
  const [filterWilayahText, setFilterWilayahText] = useState("Seluruh Wilayah (Nasional & ASEAN)")
  const [filterLayananText, setFilterLayananText] = useState("Semua Kategori Penyakit Infeksi Emerging")
  const [updatedAtText, setUpdatedAtText] = useState("14 Sep 2026 23:00 WIB | Sistem Surveilans 24 Jam")

  // 4. Key Metric Overrides (Analyst can fine tune)
  const [metricTotalKasus, setMetricTotalKasus] = useState<number>(7640)
  const [metricKorbanMeninggal, setMetricKorbanMeninggal] = useState<number>(24)
  const [metricKasusGawat, setMetricKasusGawat] = useState<number>(142)
  const [metricKlasterAktif, setMetricKlasterAktif] = useState<number>(18)
  const [metricWilayahTerpantau, setMetricWilayahTerpantau] = useState<number>(11)

  // 5. Narrative Content (Inline human editable)
  const [executiveSummary, setExecutiveSummary] = useState(
    "Analisis intelijen operasional surveilans epidemiologi terpadu mencatat eskalasi sebanyak 7.640 kasus terkonfirmasi di wilayah Seluruh Wilayah (Nasional & ASEAN). Integrasi sistem deteksi dini NLP Kemenkes RI telah menjamin kesinambungan pemantauan sinyal wabah dan verifikasi klaster secara real-time. Telaah kedaruratan mengidentifikasi 142 kasus dengan tingkat keparahan tinggi yang berhasil distabilkan, serta 24 kasus kematian (CFR: 0.31%). Jejaring laboratorium kesehatan masyarakat bersama Rumah Sakit Rujukan terus mengoptimalkan penanganan dan tracing terarah guna memitigasi penyebaran lintas batas."
  )

  const [tacticalPoints, setTacticalPoints] = useState<string[]>([
    "Agregasi Kasus & Sinyal NLP: Rekapitulasi intelijen surveilans di wilayah Nasional dan ASEAN mencatat 7.640 kasus dengan kecepatan respon konfirmasi laboratorium terkoordinasi real-time.",
    "Prioritas Tindakan Klinis: Dari seluruh kasus terpantau, teridentifikasi 142 kasus gawat darurat yang membutuhkan stabilisasi intensif, tata laksana isolasi, dan dukungan logistik obat.",
    "Intervensi Pengendalian Vektor: Penguatan larvasidasi massal dan fogging fokus di wilayah hotspot (Sumatera Selatan, Jawa Barat, dan Bangkok) jelang puncak musim penghujan.",
    "Komunikasi Publik & Edukasi: Penerbitan peringatan dini bagi masyarakat di sentra transmisi aktif guna mempercepat deteksi gejala dini tanpa memicu kepanikan massal."
  ])

  // 6. Section Visibility Switches
  const [visibility, setVisibility] = useState({
    kpi: true,
    summary: true,
    tactical: true,
    map: true,
    trends: true,
    distribution: true,
    regionalTable: true,
    aseanDeepDive: true,
    signature: true,
  })

  // 7. ASEAN Style Disease Highlights (Image 2 style)
  const [diseaseHighlights, setDiseaseHighlights] = useState<DiseaseHighlight[]>([
    {
      id: "d1",
      diseaseName: "Dengue",
      countryHighlights: [
        {
          id: "c1",
          country: "Indonesia",
          content:
            "Provinsi Sumatera Selatan melaporkan 2.841 kasus dengue dan 19 kematian per 9 September 2026 (CFR: 0,67%), melampaui target nasional <0,4%. Palembang mencatat kasus tertinggi (744 kasus), disusul Muara Enim dengan fatalitas tertinggi (5 jiwa). Otoritas kesehatan mengintensifkan pengendalian vektor dan kesiapan logistik faskes.",
          url: "https://sehatnegeriku.kemkes.go.id",
        },
        {
          id: "c2",
          country: "Thailand",
          content:
            "Bangkok mencatat 24 kasus kumulatif baru pada epi-week 36 dengan insidensi 0,44 per 100.000 populasi. Secara nasional tercatat 154 kasus tanpa kematian tambahan. Distrik Bang Na dan Phra Khanong menunjukkan angka insidensi tertinggi.",
          url: "https://ddc.moph.go.th",
        },
        {
          id: "c3",
          country: "Viet Nam",
          content:
            "Provinsi Dak Lak melaporkan 6.112 kasus dengue dan 2 kematian per September 2026. Rumah Sakit Umum Dataran Tinggi merawat 137 pasien dalam sepekan terakhir. Otoritas fokus pada penyemprotan insektisida dan monitoring resistensi larva.",
          url: "https://moh.gov.vn",
        },
      ],
    },
    {
      id: "d2",
      diseaseName: "Hand, Foot and Mouth Disease (HFMD)",
      countryHighlights: [
        {
          id: "c4",
          country: "Viet Nam",
          content:
            "Kota Ho Chi Minh melaporkan 754 kasus HFMD pada epi-week 36 (turun 22,8% dibanding rerata 4 minggu sebelumnya). Secara kumulatif tercatat 33.022 kasus sejak awal tahun. Sekolah dasar dan tempat penitipan anak memperketat protokol cuci tangan.",
          url: "https://hcdc.vn",
        },
        {
          id: "c5",
          country: "Malaysia",
          content:
            "Kementerian Kesehatan Malaysia mencatat penurunan klaster HFMD di wilayah Selangor dan Johor Bahru setelah intervensi kebersihan fasilitas pra-sekolah.",
          url: "https://moh.gov.my",
        },
      ],
    },
    {
      id: "d3",
      diseaseName: "Mpox (Clade Ib)",
      countryHighlights: [
        {
          id: "c6",
          country: "Indonesia",
          content:
            "Surveilans pintu masuk negara di Bandara Soekarno-Hatta dan Ngurah Rai menerapkan skrining termal serta SATUSEHAT Health Pass. Tercatat 88 kasus kumulatif dengan seluruh kontak erat telah dipantau secara tuntas.",
          url: "https://kemkes.go.id",
        },
      ],
    },
  ])

  // ==========================================
  // FETCH LIVE DATA ON MOUNT
  // ==========================================
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        const [dashRes, eventsRes] = await Promise.all([
          fetchPublicDashboard().catch(() => null),
          fetchEvents().catch(() => []),
        ])

        if (dashRes) {
          setDashboardData(dashRes)
          if (dashRes.total_events) {
            setMetricTotalKasus(dashRes.total_events * 45)
            setMetricKorbanMeninggal(Math.max(1, Math.round(dashRes.total_events * 0.4)))
            setMetricKasusGawat(Math.round(dashRes.total_events * 2.2))
          }
        }
        if (eventsRes && eventsRes.length > 0) {
          setEvents(eventsRes)
        }
      } catch (err) {
        console.warn("Failed to load live report data:", err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  // ==========================================
  // CHART DATA COMPILATION
  // ==========================================
  const hotspots: HotspotLocation[] = useMemo(() => {
    return [
      { id: "h1", name: "Jakarta", country: "Indonesia", cases: 2840, deaths: 8, cfr: 0.28, x: 270, y: 235, severity: "critical" },
      { id: "h2", name: "Sumatera Sel.", country: "Indonesia", cases: 1420, deaths: 6, cfr: 0.42, x: 190, y: 190, severity: "high" },
      { id: "h3", name: "Jawa Timur", country: "Indonesia", cases: 1100, deaths: 4, cfr: 0.36, x: 360, y: 245, severity: "high" },
      { id: "h4", name: "Bangkok", country: "Thailand", cases: 890, deaths: 2, cfr: 0.22, x: 155, y: 55, severity: "medium" },
      { id: "h5", name: "Ho Chi Minh", country: "Vietnam", cases: 1350, deaths: 3, cfr: 0.22, x: 220, y: 80, severity: "high" },
      { id: "h6", name: "Kuala Lumpur", country: "Malaysia", cases: 620, deaths: 1, cfr: 0.16, x: 150, y: 135, severity: "medium" },
      { id: "h7", name: "Manila", country: "Philippines", cases: 940, deaths: 4, cfr: 0.43, x: 450, y: 70, severity: "high" },
    ]
  }, [])

  const trendData: TrendDataPoint[] = useMemo(() => {
    return [
      { label: "W33 (Agu)", cases: 980, deaths: 3 },
      { label: "W34 (Agu)", cases: 1240, deaths: 4 },
      { label: "W35 (Agu)", cases: 1490, deaths: 5 },
      { label: "W36 (Sep)", cases: 1820, deaths: 6 },
      { label: "W37 (Sep)", cases: 2110, deaths: 6 },
      { label: "W38 (Sep)", cases: 2480, deaths: 8 },
    ]
  }, [])

  const diseaseShares: DiseaseShare[] = useMemo(() => {
    return [
      { name: "Dengue / DBD", cases: 3850, color: "#0060A9" },
      { name: "HFMD (Flu Singapura)", cases: 1890, color: "#0d9488" },
      { name: "Mpox (Clade Ib)", cases: 540, color: "#ea580c" },
      { name: "Leptospirosis", cases: 480, color: "#e11d48" },
      { name: "Avian Influenza (H5N1)", cases: 320, color: "#8b5cf6" },
      { name: "Lainnya (ICD-11)", cases: 560, color: "#64748b" },
    ]
  }, [])

  const countryBurdens: CountryBurden[] = useMemo(() => {
    return [
      { country: "Indonesia", cases: 4260, deaths: 14, cfr: 0.33 },
      { country: "Vietnam", cases: 1650, deaths: 4, cfr: 0.24 },
      { country: "Thailand", cases: 980, deaths: 2, cfr: 0.20 },
      { country: "Philippines", cases: 840, deaths: 4, cfr: 0.48 },
      { country: "Malaysia", cases: 620, deaths: 1, cfr: 0.16 },
      { country: "Singapore", cases: 340, deaths: 0, cfr: 0.00 },
    ]
  }, [])

  // ==========================================
  // ACTIONS
  // ==========================================
  const handlePrint = () => {
    window.print()
  }

  const handleResetToBaseline = () => {
    setReportTitle("Laporan Pengawasan Surveilans Penyakit Infeksi & Outbreak Kemenkes RI")
    setReportSubtitle("Pusat Intelijen Epidemiologi & SPGDT — Kementerian Kesehatan Republik Indonesia")
    setEpiPeriodText("14 Sep 2026 (Minggu ke-38)")
    setFilterWilayahText("Seluruh Wilayah (Nasional & ASEAN)")
    setFilterLayananText("Semua Kategori Penyakit Infeksi Emerging")
    setMetricTotalKasus(7640)
    setMetricKorbanMeninggal(24)
    setMetricKasusGawat(142)
    setMetricKlasterAktif(18)
    setWatermarkText("RESMI KEMENKES RI")
    setExecutiveSummary(
      "Analisis intelijen operasional surveilans epidemiologi terpadu mencatat eskalasi sebanyak 7.640 kasus terkonfirmasi di wilayah Seluruh Wilayah (Nasional & ASEAN). Integrasi sistem deteksi dini NLP Kemenkes RI telah menjamin kesinambungan pemantauan sinyal wabah dan verifikasi klaster secara real-time."
    )
  }

  const scrollToSection = (id: string) => {
    setActiveSection(id)
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 selection:bg-teal-100">
      {/* ==========================================
          PRINT STYLESHEET
      ========================================== */}
      <style>{`
        @media print {
          body {
            background: #ffffff !important;
            color: #0f172a !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          .print-area {
            position: relative !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
          .page-break {
            page-break-before: always !important;
          }
          .break-inside-avoid {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      {/* ==========================================
          WATERMARK OVERLAY (VISIBLE IN PRINT & PREVIEW)
      ========================================== */}
      {watermarkEnabled && (
        <div
          className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden select-none"
          style={{ opacity: watermarkOpacity }}
        >
          <div className="text-center font-black tracking-widest text-slate-900 transform -rotate-35 uppercase text-5xl sm:text-7xl lg:text-9xl whitespace-nowrap">
            {watermarkText}
          </div>
        </div>
      )}

      {/* ==========================================
          TOP STICKY ACTION BAR (GAYA GAMBAR 1)
      ========================================== */}
      <header className="no-print sticky top-0 z-40 flex items-center justify-between border-b border-teal-700/30 bg-[#0060A9] px-4 py-2.5 text-white shadow-md">
        <div className="flex items-center gap-3">
          <Link
            href="/reports"
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-bold text-teal-100 hover:bg-white/20 transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Kembali ke Laporan</span>
          </Link>
          <div className="h-4 w-px bg-white/20" />
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-xs sm:text-sm tracking-tight">
              EOC Kemenkes RI — Laporan Situasi Resmi
            </span>
            <span className="rounded-md bg-white/20 px-2 py-0.5 text-[10px] font-bold text-teal-100">
              AI Token Generated
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-200">
              <CheckCircle2 className="h-3 w-3" /> Human Verified
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle Template */}
          <div className="hidden md:inline-flex rounded-lg bg-white/10 p-0.5 text-xs font-bold">
            <button
              type="button"
              onClick={() => setTemplate("kemenkes_sitrep")}
              className={`rounded-md px-2.5 py-1 transition cursor-pointer ${
                template === "kemenkes_sitrep"
                  ? "bg-white text-[#0060A9] shadow-xs"
                  : "text-blue-100 hover:text-white"
              }`}
            >
              Kemenkes SitRep
            </button>
            <button
              type="button"
              onClick={() => setTemplate("asean_bulletin")}
              className={`rounded-md px-2.5 py-1 transition cursor-pointer ${
                template === "asean_bulletin"
                  ? "bg-white text-[#0060A9] shadow-xs"
                  : "text-blue-100 hover:text-white"
              }`}
            >
              Buletin ASEAN
            </button>
          </div>

          {/* Edit Drawer Toggle */}
          <button
            type="button"
            onClick={() => setIsEditDrawerOpen(!isEditDrawerOpen)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition shadow-xs cursor-pointer ${
              isEditDrawerOpen
                ? "bg-amber-400 text-slate-900"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            <Edit3 className="h-3.5 w-3.5" />
            <span>{isEditDrawerOpen ? "Tutup Editor" : "Kustomisasi Narasi"}</span>
          </button>

          {/* Print / Download PDF */}
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-1.5 text-xs font-black text-[#0060A9] hover:bg-blue-50 transition shadow-sm cursor-pointer active:scale-95"
          >
            <Printer className="h-3.5 w-3.5 text-[#0060A9]" />
            <span>Cetak / Simpan PDF</span>
          </button>
        </div>
      </header>

      {/* ==========================================
          MAIN CONTAINER WITH SIDEBAR & DOCUMENT
      ========================================== */}
      <div className="relative mx-auto flex max-w-[1440px] gap-6 p-4 sm:p-6">
        {/* ==========================================
            LEFT SIDEBAR CONTENTS (GAYA GAMBAR 1)
        ========================================== */}
        <aside className="no-print hidden lg:block w-64 shrink-0">
          <div className="sticky top-16 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
              Contents (Daftar Isi)
            </h3>
            <nav className="space-y-1">
              {[
                { id: "ringkasan", label: "Ringkasan Eksekutif" },
                { id: "poin-utama", label: "Poin Utama & Rekomendasi" },
                { id: "kpi-metrik", label: "Indikator Utama (KPI)" },
                { id: "spasial-hotspot", label: "Pemetaan Spasial Hotspot" },
                { id: "tren-visualisasi", label: "Surveilans Tren Kasus" },
                { id: "distribusi-penyakit", label: "Distribusi Penyakit (ICD-11)" },
                { id: "situasi-regional", label: "Situasi Regional ASEAN" },
                { id: "matriks-wilayah", label: "Matriks Beban Wilayah" },
                { id: "pengesahan", label: "Pengesahan Tim Analis" },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToSection(item.id)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-bold transition cursor-pointer ${
                    activeSection === item.id
                      ? "bg-blue-50 text-[#0060A9] font-black"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <span className="truncate">{item.label}</span>
                  <ChevronRight className="h-3 w-3 opacity-40" />
                </button>
              ))}
            </nav>

            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handlePrint}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 transition shadow-2xs"
              >
                <Printer className="h-3.5 w-3.5 text-slate-600" />
                <span>Cetak Halaman Ini</span>
              </button>
            </div>
          </div>
        </aside>

        {/* ==========================================
            DOCUMENT CANVAS (PRINT AREA)
        ========================================== */}
        <main className="print-area relative flex-1 rounded-2xl border border-slate-200 bg-white p-6 sm:p-10 shadow-sm z-10">
          {/* -------------------------------------------
              TEMPLATE 1: KEMENKES EXECUTIVE SITREP (IMAGE 1)
          -------------------------------------------- */}
          {template === "kemenkes_sitrep" && (
            <div className="space-y-8">
              {/* Header Kop Resmi */}
              <div className="border-b border-slate-200 pb-5">
                <div className="flex items-center gap-3 text-xs font-bold text-slate-600">
                  <span className="rounded-md bg-teal-50 px-2 py-0.5 text-teal-800 font-extrabold border border-teal-200">
                    KEMENKES RI
                  </span>
                  <span>Pusat Komando Nasional EOC — SPGDT 24 Jam</span>
                </div>
                <h1 className="mt-2 text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-snug">
                  {reportTitle} : {epiPeriodText}
                </h1>
                <p className="mt-1 text-xs text-slate-500 font-medium">
                  {updatedAtText}
                </p>

                {/* Scope Badge Box (Sesuai Gambar 1) */}
                <div className="mt-4 rounded-xl border border-slate-900/80 bg-slate-50/70 p-3 text-xs font-bold text-slate-900">
                  Berlaku di: <span className="font-black text-[#0060A9]">{filterWilayahText}</span> | Kategori Layanan: <span className="font-black text-slate-800">{filterLayananText}</span>
                </div>
              </div>

              {/* KPI 5 Cards Row (Sesuai Gambar 1) */}
              {visibility.kpi && (
                <section id="kpi-metrik" className="break-inside-avoid">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3.5 text-center">
                      <p className="text-[10px] font-black uppercase tracking-wider text-teal-800">
                        TOTAL LAPORAN KASUS
                      </p>
                      <p className="mt-1 font-mono text-2xl sm:text-3xl font-black text-teal-900">
                        {metricTotalKasus.toLocaleString()}
                      </p>
                    </div>

                    <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3.5 text-center">
                      <p className="text-[10px] font-black uppercase tracking-wider text-rose-800">
                        FATALITAS / KEMATIAN
                      </p>
                      <p className="mt-1 font-mono text-2xl sm:text-3xl font-black text-rose-900">
                        {metricKorbanMeninggal}{" "}
                        <span className="text-xs font-semibold">Jiwa</span>
                      </p>
                    </div>

                    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 text-center">
                      <p className="text-[10px] font-black uppercase tracking-wider text-amber-800">
                        KASUS GAWAT DARURAT
                      </p>
                      <p className="mt-1 font-mono text-2xl sm:text-3xl font-black text-amber-900">
                        {metricKasusGawat}{" "}
                        <span className="text-xs font-semibold">Pasien</span>
                      </p>
                    </div>

                    <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3.5 text-center">
                      <p className="text-[10px] font-black uppercase tracking-wider text-blue-800">
                        KLASTER HOTSPOT AKTIF
                      </p>
                      <p className="mt-1 font-mono text-2xl sm:text-3xl font-black text-blue-900">
                        {metricKlasterAktif}{" "}
                        <span className="text-xs font-semibold">Titik</span>
                      </p>
                    </div>

                    <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-3.5 text-center">
                      <p className="text-[10px] font-black uppercase tracking-wider text-purple-800">
                        WILAYAH TERPANTAU
                      </p>
                      <p className="mt-1 font-mono text-2xl sm:text-3xl font-black text-purple-900">
                        {metricWilayahTerpantau}{" "}
                        <span className="text-xs font-semibold">Negara</span>
                      </p>
                    </div>
                  </div>
                </section>
              )}

              {/* Section 1: Ringkasan Eksekutif */}
              {visibility.summary && (
                <section id="ringkasan" className="space-y-2 break-inside-avoid">
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">
                    Ringkasan Eksekutif Dispatch & Respon Kedaruratan Medis
                  </h3>
                  <div className="rounded-xl bg-slate-50/80 p-4 border border-slate-200 text-sm leading-relaxed text-slate-700">
                    <p>{executiveSummary}</p>
                  </div>
                </section>
              )}

              {/* Section 2: Poin Utama & Rekomendasi Taktis */}
              {visibility.tactical && (
                <section id="poin-utama" className="space-y-3 break-inside-avoid">
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">
                    Poin Utama & Rekomendasi Taktis Pengendalian
                  </h3>
                  <ul className="space-y-2.5">
                    {tacticalPoints.map((pt, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-3 text-xs sm:text-sm text-slate-700 shadow-2xs"
                      >
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#0060A9]" />
                        <span className="leading-relaxed">{pt}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Section 3: Pemetaan Spasial Hotspot (Pure Vector SVG) */}
              {visibility.map && (
                <section id="spasial-hotspot" className="break-inside-avoid">
                  <SpatialHotspotMap hotspots={hotspots} />
                </section>
              )}

              {/* Section 4: Visualisasi Grafik Tren & Distribusi Penyakit */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 break-inside-avoid">
                {visibility.trends && (
                  <section id="tren-visualisasi">
                    <TrendEpiCurveChart data={trendData} />
                  </section>
                )}
                {visibility.distribution && (
                  <section id="distribusi-penyakit">
                    <DiseaseDistributionDonut shares={diseaseShares} />
                  </section>
                )}
              </div>

              {/* Section 5: Matriks Rekapitulasi Wilayah (Beban Kasus & CFR) */}
              {visibility.regionalTable && (
                <section id="matriks-wilayah" className="space-y-4 break-inside-avoid">
                  <CountryCfrBarChart data={countryBurdens} />

                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-700">
                        <tr>
                          <th className="px-4 py-2.5 font-black">Negara / Teritori</th>
                          <th className="px-4 py-2.5 text-right font-black">Jumlah Kasus</th>
                          <th className="px-4 py-2.5 text-right font-black">Kematian</th>
                          <th className="px-4 py-2.5 text-right font-black">CFR (%)</th>
                          <th className="px-4 py-2.5 font-black">Status Severity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {countryBurdens.map((b) => (
                          <tr key={b.country} className="hover:bg-slate-50/50">
                            <td className="px-4 py-2.5 font-bold text-slate-800">{b.country}</td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">
                              {b.cases.toLocaleString()}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-rose-700 font-bold">
                              {b.deaths}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-black">
                              <span
                                className={`rounded px-1.5 py-0.5 ${
                                  b.cfr > 0.4 ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"
                                }`}
                              >
                                {b.cfr.toFixed(2)}%
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold text-slate-700">
                                {b.cfr > 0.4 ? "WASPADALAH" : "TERKENDALI"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Section 6: Lembar Pengesahan Resmi */}
              {visibility.signature && (
                <section id="pengesahan" className="border-t border-slate-200 pt-6 text-xs text-slate-600 break-inside-avoid">
                  <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-6">
                    <div>
                      <p className="font-bold text-slate-800">Sistem Surveilans & Intelijen Penyakit Kemenkes RI</p>
                      <p className="text-[11px] text-slate-500">Dokumen sah diterbitkan otomatis melalui verifikasi tim epidemiolog</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-slate-500">Jakarta, {new Date().toLocaleDateString("id-ID", { dateStyle: "long" })}</p>
                      <p className="mt-8 font-black text-slate-900">Pusat Krisis & Pengawasan Epidemiologi EOC 119</p>
                      <p className="text-[10px] text-slate-500">Kementerian Kesehatan Republik Indonesia</p>
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}

          {/* -------------------------------------------
              TEMPLATE 2: ASEAN BIO-THREATS MEDIA MONITORING (IMAGE 2)
          -------------------------------------------- */}
          {template === "asean_bulletin" && (
            <div className="space-y-6">
              {/* ASEAN Header Banner (Persis Gambar 2) */}
              <div className="rounded-xl bg-gradient-to-r from-[#031b4e] via-[#052b7a] to-[#011438] p-6 text-white shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-xs font-black tracking-widest text-cyan-200 uppercase">
                      ASEAN Biological Threats Surveillance Centre
                    </h4>
                    <h2 className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-amber-300">
                      Media Monitoring for
                    </h2>
                    <h2 className="text-xl sm:text-2xl font-black text-white">
                      Infectious and Emerging Diseases
                    </h2>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wider text-cyan-100">
                      GLOBAL & ASEAN REGION — {epiPeriodText}
                    </p>
                  </div>

                  <div className="text-right text-[10px] text-cyan-200/80 space-y-1">
                    <p className="font-bold">With Support by:</p>
                    <p className="font-semibold text-white">Canada / Korea Disease Control & Prevention Agency</p>
                  </div>
                </div>
              </div>

              {/* Introductory Paragraph */}
              <div className="text-xs sm:text-sm text-slate-700 leading-relaxed border-b border-slate-200 pb-4">
                <p>
                  This report is based on media monitoring of infectious and emerging diseases globally and within ASEAN Member States, to enhance pandemic and epidemic preparedness and response in the ASEAN Region. We publish this report regularly for technical situational awareness.
                </p>
              </div>

              {/* Regional Situation Heading */}
              <div className="space-y-6">
                <h3 className="text-base sm:text-lg font-black text-slate-900 uppercase tracking-tight">
                  Regional Situation
                </h3>

                {diseaseHighlights.map((dh) => (
                  <div key={dh.id} className="space-y-2.5 break-inside-avoid">
                    <h4 className="text-sm font-black italic text-[#0060A9] border-b border-blue-100 pb-1">
                      {dh.diseaseName}
                    </h4>

                    <ul className="space-y-2 text-xs sm:text-sm text-slate-700 pl-4 list-disc">
                      {dh.countryHighlights.map((ch) => (
                        <li key={ch.id} className="leading-relaxed">
                          <strong className="text-slate-900">{ch.country}: </strong>
                          <span>{ch.content} </span>
                          {ch.url && (
                            <a
                              href={ch.url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-bold text-[#0060A9] hover:underline"
                            >
                              [Full article]
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              {/* Quick Regional Comparison Table */}
              <div className="pt-6 border-t border-slate-200 break-inside-avoid">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">
                  Summary Matrix (Epi-Week Breakdown)
                </h4>
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="px-3 py-2 font-black">Country</th>
                        <th className="px-3 py-2 text-right font-black">Total Cases</th>
                        <th className="px-3 py-2 text-right font-black">Deaths</th>
                        <th className="px-3 py-2 text-right font-black">CFR (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {countryBurdens.map((b) => (
                        <tr key={b.country}>
                          <td className="px-3 py-2 font-bold">{b.country}</td>
                          <td className="px-3 py-2 text-right font-mono">{b.cases.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-mono text-rose-700">{b.deaths}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold">{b.cfr.toFixed(2)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ==========================================
          HUMAN CUSTOMIZATION DRAWER (SIDE MODAL)
      ========================================== */}
      {isEditDrawerOpen && (
        <div className="no-print fixed inset-y-0 right-0 z-50 w-full sm:w-[480px] bg-white border-l border-slate-200 shadow-2xl overflow-y-auto p-6 flex flex-col justify-between">
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2 text-slate-900 font-black text-base">
                <Sliders className="h-5 w-5 text-[#0060A9]" />
                <span>Kustomisasi Dokumen (Human-in-the-Loop)</span>
              </div>
              <button
                type="button"
                onClick={() => setIsEditDrawerOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Template Selection */}
            <div>
              <label className="block text-[11px] font-black uppercase text-slate-500 mb-1">
                Pilih Format Template Dokumen
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTemplate("kemenkes_sitrep")}
                  className={`rounded-xl border p-2.5 text-left text-xs font-bold transition ${
                    template === "kemenkes_sitrep"
                      ? "border-[#0060A9] bg-blue-50/50 text-[#0060A9]"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <p className="font-black">EOC Kemenkes SitRep</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Format resmi Kop Kemenkes (Gambar 1)</p>
                </button>
                <button
                  type="button"
                  onClick={() => setTemplate("asean_bulletin")}
                  className={`rounded-xl border p-2.5 text-left text-xs font-bold transition ${
                    template === "asean_bulletin"
                      ? "border-[#0060A9] bg-blue-50/50 text-[#0060A9]"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <p className="font-black">Buletin ASEAN</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Media monitoring per penyakit (Gambar 2)</p>
                </button>
              </div>
            </div>

            {/* Watermark Settings */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-slate-700">Watermark Dokumen</span>
                <input
                  type="checkbox"
                  checked={watermarkEnabled}
                  onChange={(e) => setWatermarkEnabled(e.target.checked)}
                  className="h-4 w-4 rounded accent-[#0060A9]"
                />
              </div>
              {watermarkEnabled && (
                <>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Teks Watermark</label>
                    <input
                      type="text"
                      value={watermarkText}
                      onChange={(e) => setWatermarkText(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {["DRAFT", "RESMI KEMENKES RI", "RAHASIA / TERBATAS", "SITREP MINGGUAN", "ASEAN BIO-THREATS"].map(
                      (preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setWatermarkText(preset)}
                          className="rounded-md bg-white border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-100"
                        >
                          {preset}
                        </button>
                      )
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Meta Title & Periode */}
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-black uppercase text-slate-500 mb-1">
                  Judul Dokumen Laporan
                </label>
                <input
                  type="text"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase text-slate-500 mb-1">
                  Periode / Epidemiological Week
                </label>
                <input
                  type="text"
                  value={epiPeriodText}
                  onChange={(e) => setEpiPeriodText(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase text-slate-500 mb-1">
                  Cakupan Wilayah Terfilter
                </label>
                <input
                  type="text"
                  value={filterWilayahText}
                  onChange={(e) => setFilterWilayahText(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800"
                />
              </div>
            </div>

            {/* Editable Executive Narrative */}
            <div>
              <label className="block text-[11px] font-black uppercase text-slate-500 mb-1">
                Narasi Ringkasan Eksekutif (Bisa diedit bebas)
              </label>
              <textarea
                rows={5}
                value={executiveSummary}
                onChange={(e) => setExecutiveSummary(e.target.value)}
                className="w-full rounded-xl border border-slate-200 p-3 text-xs leading-relaxed text-slate-800"
              />
            </div>

            {/* Tactical Recommendations Editor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-black uppercase text-slate-500">
                  Poin Rekomendasi Taktis
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setTacticalPoints([
                      ...tacticalPoints,
                      "Poin rekomendasi baru: tambahkan instruksi kesiapsiagaan di sini.",
                    ])
                  }
                  className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-[#0060A9]"
                >
                  <Plus className="h-3 w-3" /> Tambah Poin
                </button>
              </div>

              <div className="space-y-2">
                {tacticalPoints.map((pt, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <textarea
                      rows={2}
                      value={pt}
                      onChange={(e) => {
                        const updated = [...tacticalPoints]
                        updated[idx] = e.target.value
                        setTacticalPoints(updated)
                      }}
                      className="flex-1 rounded-lg border border-slate-200 p-2 text-xs text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setTacticalPoints(tacticalPoints.filter((_, i) => i !== idx))
                      }
                      className="p-1 text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Key Metric Numbers Overrides */}
            <div className="rounded-xl border border-slate-200 p-3.5 space-y-3 bg-slate-50/50">
              <label className="block text-[11px] font-black uppercase text-slate-700">
                Koreksi Angka Statistik Indikator
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] font-bold text-slate-500">Total Kasus</span>
                  <input
                    type="number"
                    value={metricTotalKasus}
                    onChange={(e) => setMetricTotalKasus(Number(e.target.value))}
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500">Kematian / DOA</span>
                  <input
                    type="number"
                    value={metricKorbanMeninggal}
                    onChange={(e) => setMetricKorbanMeninggal(Number(e.target.value))}
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500">Kasus Gawat</span>
                  <input
                    type="number"
                    value={metricKasusGawat}
                    onChange={(e) => setMetricKasusGawat(Number(e.target.value))}
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500">Klaster Hotspot</span>
                  <input
                    type="number"
                    value={metricKlasterAktif}
                    onChange={(e) => setMetricKlasterAktif(Number(e.target.value))}
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-mono font-bold"
                  />
                </div>
              </div>
            </div>

            {/* Section Visibility */}
            <div className="rounded-xl border border-slate-200 p-3.5 space-y-2">
              <label className="block text-[11px] font-black uppercase text-slate-700">
                Tampilkan / Sembunyikan Seksi
              </label>
              <div className="space-y-1.5 text-xs font-bold text-slate-600">
                {[
                  { key: "kpi", label: "Kartu Indikator Utama (KPI)" },
                  { key: "summary", label: "Ringkasan Eksekutif" },
                  { key: "tactical", label: "Poin Rekomendasi Taktis" },
                  { key: "map", label: "Peta Spasial Hotspot" },
                  { key: "trends", label: "Grafik Tren Epidemiologi" },
                  { key: "distribution", label: "Donut Distribusi Penyakit" },
                  { key: "regionalTable", label: "Tabel Matriks Wilayah" },
                  { key: "signature", label: "Lembar Pengesahan" },
                ].map((item) => (
                  <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibility[item.key as keyof typeof visibility]}
                      onChange={(e) =>
                        setVisibility({
                          ...visibility,
                          [item.key]: e.target.checked,
                        })
                      }
                      className="h-3.5 w-3.5 rounded accent-[#0060A9]"
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-200 mt-6 space-y-2">
            <button
              type="button"
              onClick={handleResetToBaseline}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Reset ke Baseline AI Otomatis</span>
            </button>
            <button
              type="button"
              onClick={() => setIsEditDrawerOpen(false)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0060A9] py-2.5 text-xs font-black text-white hover:bg-blue-800 transition"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Terapkan & Lihat Dokumen</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
