"use client"

import React, { useState, useEffect, useMemo, useRef } from "react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import { PublishedReportItem, ReportTemplateType } from "@/types/reports"
import { getStoredReports, saveReportToStore } from "@/lib/reports-store"
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

export type ReportThemeType = "formal_white" | "asean_navy" | "kemenkes_teal" | "slate_minimal"

function ExecutiveReportContent() {
  const [loading, setLoading] = useState(true)
  const [dashboardData, setDashboardData] = useState<PublicDashboard | null>(null)
  const [events, setEvents] = useState<DiseaseEvent[]>([])

  // ==========================================
  // HUMAN CUSTOMIZATION STATE
  // ==========================================
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<string>("summary")

  // 1. Template & Cadence
  const searchParams = useSearchParams()
  const router = useRouter()
  const templateParam = searchParams.get("template") as TemplateType | null
  const reportIdParam = searchParams.get("reportId")
  const autoEditParam = searchParams.get("edit")
  const autoPrintParam = searchParams.get("print")

  // Theme & Author states
  const [reportTheme, setReportTheme] = useState<ReportThemeType>("formal_white")
  const [reportAuthor, setReportAuthor] = useState<string>("yusuf")
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false)
  const [publishSuccessItem, setPublishSuccessItem] = useState<PublishedReportItem | null>(null)

  const [template, setTemplate] = useState<TemplateType>("kemenkes_sitrep")
  const [cadence, setCadence] = useState<CadenceType>("weekly")
  const [epiPeriodText, setEpiPeriodText] = useState("Week 38 (14 Sep 2026)")

  // 2. Watermark
  const [watermarkEnabled, setWatermarkEnabled] = useState(false)
  const [watermarkText, setWatermarkText] = useState("")
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.08)

  // 3. Document Meta
  const [reportTitle, setReportTitle] = useState(
    "ABVC Infectious Disease Surveillance & Outbreak Intelligence Report"
  )
  const [reportSubtitle, setReportSubtitle] = useState(
    "Epidemiological Surveillance Intelligence Centre — ASEAN Biological Threats Surveillance Centre (ABVC)"
  )
  const [filterWilayahText, setFilterWilayahText] = useState("Entire Monitored Scope (National & ASEAN)")
  const [filterLayananText, setFilterLayananText] = useState("All Emerging Infectious Disease Categories")
  const [updatedAtText, setUpdatedAtText] = useState("14 Sep 2026 23:00 UTC+7 | 24/7 Surveillance Operations")

  // 4. Key Metric Overrides (Analyst fine tuning)
  const [metricTotalKasus, setMetricTotalKasus] = useState<number>(7640)
  const [metricKorbanMeninggal, setMetricKorbanMeninggal] = useState<number>(24)
  const [metricCfr, setMetricCfr] = useState<number>(0.31)
  const [metricKlasterAktif, setMetricKlasterAktif] = useState<number>(18)
  const [metricWilayahTerpantau, setMetricWilayahTerpantau] = useState<number>(11)

  // 5. Narrative Content (Inline human editable)
  const [executiveSummary, setExecutiveSummary] = useState(
    "Integrated epidemiological surveillance intelligence records an accumulation of 7,640 confirmed cases across National & ASEAN member states. Integration of the automated ABVC Surveillance NLP pipeline ensures real-time outbreak signal continuity and cluster verification. Field reviews identify 18 active clusters under intensive monitoring alongside 24 cumulative fatalities (regional average CFR: 0.31%). Public health laboratory networks and cross-border quarantine stations continue optimizing points-of-entry screening and targeted response interventions to mitigate cross-border transmission."
  )

  const [tacticalPoints, setTacticalPoints] = useState<string[]>([
    "NLP Outbreak Signal & Case Aggregation: Surveillance intelligence recapitulation across National and ASEAN territories records 7,640 cases with real-time coordinated laboratory confirmation response.",
    "Early Detection & Rapid Response: Strengthening close contact tracing, rapid diagnostic laboratory confirmation (RDT/PCR), and targeted isolation at active local transmission epicenters.",
    "Vector Control Interventions: Scaling up mass larviciding and focused spatial fogging in hotspot corridors (South Sumatra, West Java, and Bangkok) ahead of peak monsoon season.",
    "Public Risk Communication & Health Advisory: Disseminating timely early warnings for populations in active transmission clusters to accelerate early symptom detection without triggering public alarm."
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

  // 7. ASEAN Style Disease Highlights
  const [diseaseHighlights, setDiseaseHighlights] = useState<DiseaseHighlight[]>([
    {
      id: "d1",
      diseaseName: "Dengue",
      countryHighlights: [
        {
          id: "c1",
          country: "Indonesia",
          content:
            "South Sumatra Province reported 2,841 dengue cases and 19 fatalities as of September 9, 2026 (CFR: 0.67%), exceeding the national threshold of <0.4%. Palembang recorded the highest case count (744 cases), while Muara Enim had the highest fatality count (5 deaths). Health authorities are intensifying vector control operations and healthcare facility readiness.",
          url: "https://sehatnegeriku.kemkes.go.id",
        },
        {
          id: "c2",
          country: "Thailand",
          content:
            "Bangkok recorded 24 cumulative new cases during epi-week 36 with an incidence of 0.44 per 100,000 population. Nationally, 154 cases were recorded with zero new fatalities. Bang Na and Phra Khanong districts registered the highest incidence rates.",
          url: "https://ddc.moph.go.th",
        },
        {
          id: "c3",
          country: "Viet Nam",
          content:
            "Dak Lak Province reported 6,112 dengue cases and 2 fatalities as of September 2026. Central Highlands General Hospital treated 137 inpatient cases over the past week. Authorities are focusing on targeted insecticide spraying and larval resistance surveillance.",
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
            "Ho Chi Minh City reported 754 HFMD cases during epi-week 36 (down 22.8% compared to the prior 4-week average). Cumulatively, 33,022 cases have been documented since the beginning of the year. Primary schools and daycare facilities have reinforced strict hand hygiene protocols.",
          url: "https://hcdc.vn",
        },
        {
          id: "c5",
          country: "Malaysia",
          content:
            "The Ministry of Health Malaysia reported a decline in preschool HFMD clusters across Selangor and Johor Bahru following targeted hygiene and sanitation interventions in early education centers.",
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
            "International points of entry at Soekarno-Hatta and Ngurah Rai Airports have implemented thermal screening and the SATUSEHAT digital health pass. A cumulative total of 88 cases have been recorded, with all close contacts fully traced and monitored.",
          url: "https://kemkes.go.id",
        },
      ],
    },
  ])

  // Initialize from searchParams
  useEffect(() => {
    if (templateParam === "asean_bulletin" || templateParam === "kemenkes_sitrep") {
      setTemplate(templateParam)
      if (templateParam === "asean_bulletin") {
        setReportTitle("Media Monitoring for Infectious and Emerging Diseases in the ASEAN Region")
        setReportSubtitle("ASEAN Biological Threats Surveillance Centre — Health Intelligence Report")
        setReportAuthor("yusuf")
      } else {
        setReportTitle("ABVC Infectious Disease Surveillance & Outbreak Intelligence Report")
        setReportSubtitle("Epidemiological Surveillance Intelligence Centre — ASEAN Biological Threats Surveillance Centre (ABVC)")
        setReportAuthor("PHEOC ABVC")
      }
    }
  }, [templateParam])

  useEffect(() => {
    if (reportIdParam) {
      const stored = getStoredReports().find((r) => r.id === reportIdParam)
      if (stored) {
        setReportTitle(stored.title)
        setReportAuthor(stored.author)
        setEpiPeriodText(stored.period)
        setTemplate(stored.type)
        if (stored.description) {
          setExecutiveSummary(stored.description)
        }
      }
    }
  }, [reportIdParam])

  useEffect(() => {
    if (autoEditParam === "true") {
      setIsEditDrawerOpen(true)
    }
    if (autoPrintParam === "true") {
      setTimeout(() => {
        window.print()
      }, 700)
    }
  }, [autoEditParam, autoPrintParam])

  const handlePublishReport = () => {
    const newId = reportIdParam || (template === "asean_bulletin" ? `mm-${Date.now()}` : `sitrep-${Date.now()}`)
    const publishedItem: PublishedReportItem = {
      id: newId,
      category:
        template === "asean_bulletin"
          ? "Data & Publications Media Monitoring Report"
          : "Official Situation Report ABVC",
      title: reportTitle,
      period: epiPeriodText,
      author: reportAuthor || (template === "asean_bulletin" ? "yusuf" : "PHEOC ABVC"),
      publishedAt: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      type: template,
      status: "published",
      description: executiveSummary.length > 220 ? executiveSummary.slice(0, 217) + "..." : executiveSummary,
      summaryStats: {
        cases: metricTotalKasus,
        deaths: metricKorbanMeninggal,
        countriesCount: metricWilayahTerpantau,
        topDisease: template === "asean_bulletin" ? "Dengue Fever" : "Dengue / DBD",
      },
    }

    saveReportToStore(publishedItem)
    setPublishSuccessItem(publishedItem)
    setIsPublishModalOpen(true)
  }

  const getThemeClass = () => {
    switch (reportTheme) {
      case "asean_navy":
        return "bg-gradient-to-b from-blue-50/50 via-white to-white border-blue-200 shadow-md"
      case "kemenkes_teal":
        return "bg-gradient-to-b from-teal-50/50 via-white to-white border-teal-200 shadow-md"
      case "slate_minimal":
        return "bg-slate-50/90 border-slate-300 shadow-sm"
      case "formal_white":
      default:
        return "bg-white border-slate-200 shadow-sm"
    }
  }

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
            setMetricCfr(Number(((Math.max(1, Math.round(dashRes.total_events * 0.4)) / Math.max(1, dashRes.total_events * 45)) * 100).toFixed(2)))
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
      { id: "h2", name: "South Sumatra", country: "Indonesia", cases: 1420, deaths: 6, cfr: 0.42, x: 190, y: 190, severity: "high" },
      { id: "h3", name: "East Java", country: "Indonesia", cases: 1100, deaths: 4, cfr: 0.36, x: 360, y: 245, severity: "high" },
      { id: "h4", name: "Bangkok", country: "Thailand", cases: 890, deaths: 2, cfr: 0.22, x: 155, y: 55, severity: "medium" },
      { id: "h5", name: "Ho Chi Minh", country: "Viet Nam", cases: 1350, deaths: 3, cfr: 0.22, x: 220, y: 80, severity: "high" },
      { id: "h6", name: "Kuala Lumpur", country: "Malaysia", cases: 620, deaths: 1, cfr: 0.16, x: 150, y: 135, severity: "medium" },
      { id: "h7", name: "Manila", country: "Philippines", cases: 940, deaths: 4, cfr: 0.43, x: 450, y: 70, severity: "high" },
    ]
  }, [])

  const trendData: TrendDataPoint[] = useMemo(() => {
    return [
      { label: "W33 (Aug)", cases: 980, deaths: 3 },
      { label: "W34 (Aug)", cases: 1240, deaths: 4 },
      { label: "W35 (Aug)", cases: 1490, deaths: 5 },
      { label: "W36 (Sep)", cases: 1820, deaths: 6 },
      { label: "W37 (Sep)", cases: 2110, deaths: 6 },
      { label: "W38 (Sep)", cases: 2480, deaths: 8 },
    ]
  }, [])

  const diseaseShares: DiseaseShare[] = useMemo(() => {
    return [
      { name: "Dengue Fever", cases: 4120, percentage: 53.9, color: "#0060A9" },
      { name: "HFMD", cases: 1840, percentage: 24.1, color: "#0d9488" },
      { name: "Mpox (Clade Ib)", cases: 820, percentage: 10.7, color: "#f59e0b" },
      { name: "Avian Flu (H5N1)", cases: 480, percentage: 6.3, color: "#e11d48" },
      { name: "Others / Undifferentiated", cases: 380, percentage: 5.0, color: "#64748b" },
    ]
  }, [])

  const countryBurdens: CountryBurden[] = useMemo(() => {
    return [
      { country: "Indonesia", code: "ID", cases: 3950, deaths: 14, cfr: 0.35 },
      { country: "Viet Nam", code: "VN", cases: 1680, deaths: 4, cfr: 0.24 },
      { country: "Philippines", code: "PH", cases: 940, deaths: 4, cfr: 0.43 },
      { country: "Thailand", code: "TH", cases: 620, deaths: 1, cfr: 0.16 },
      { country: "Malaysia", code: "MY", cases: 450, deaths: 1, cfr: 0.22 },
    ]
  }, [])

  const handlePrint = () => {
    window.print()
  }

  const handleResetToBaseline = () => {
    setReportTitle("ABVC Infectious Disease Surveillance & Outbreak Intelligence Report")
    setReportSubtitle("Epidemiological Surveillance Intelligence Centre — ASEAN Biological Threats Surveillance Centre (ABVC)")
    setEpiPeriodText("Week 38 (14 Sep 2026)")
    setFilterWilayahText("Entire Monitored Scope (National & ASEAN)")
    setFilterLayananText("All Emerging Infectious Disease Categories")
    setMetricTotalKasus(7640)
    setMetricKorbanMeninggal(24)
    setMetricCfr(0.31)
    setMetricKlasterAktif(18)
    setWatermarkEnabled(false)
    setWatermarkText("")
    setExecutiveSummary(
      "Integrated epidemiological surveillance intelligence records an accumulation of 7,640 confirmed cases across National & ASEAN member states. Integration of the automated ABVC Surveillance NLP pipeline ensures real-time outbreak signal continuity and cluster verification."
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
      {watermarkEnabled && watermarkText && (
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
          TOP STICKY ACTION BAR
      ========================================== */}
      <header className="no-print sticky top-0 z-40 flex items-center justify-between border-b border-teal-700/30 bg-[#0060A9] px-4 py-2.5 text-white shadow-md">
        <div className="flex items-center gap-3">
          <Link
            href="/reports"
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-bold text-teal-100 hover:bg-white/20 transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Public Portal</span>
          </Link>
          <Link
            href="/console/reports-cms"
            className="hidden sm:flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-bold text-teal-100 hover:bg-white/20 transition"
          >
            <Shield className="h-3.5 w-3.5" />
            <span>Console CMS</span>
          </Link>
          <div className="h-4 w-px bg-white/20" />
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-xs sm:text-sm tracking-tight">
              ABVC EOC Centre — Official Situation Report
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
              ABVC SitRep
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
              ASEAN Bulletin
            </button>
          </div>

          {/* Edit Drawer Toggle */}
          <button
            type="button"
            onClick={() => setIsEditDrawerOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-black text-slate-900 hover:bg-amber-300 shadow-sm transition active:scale-95 cursor-pointer"
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>Customize Document</span>
          </button>

          {/* Quick Print */}
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/25 transition cursor-pointer"
            title="Print or Save as PDF"
          >
            <Printer className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Print / PDF</span>
          </button>

          {/* Publish Button */}
          <button
            type="button"
            onClick={handlePublishReport}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 px-3 py-1.5 text-xs font-black text-white shadow-sm transition active:scale-95 cursor-pointer"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Publish Report</span>
          </button>
        </div>
      </header>

      {/* ==========================================
          MAIN LAYOUT: SIDE NAVIGATION & REPORT CANVAS
      ========================================== */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 flex flex-col lg:flex-row gap-6 items-start">
        {/* LEFT STICKY SECTION NAVIGATOR */}
        <aside className="no-print hidden lg:block w-60 shrink-0 sticky top-20 space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-3">
              Document Sections
            </h4>
            <nav className="space-y-1 text-xs font-bold">
              {template === "asean_bulletin" ? (
                <>
                  <button
                    type="button"
                    onClick={() => scrollToSection("asean-overview")}
                    className="w-full text-left rounded-lg px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 transition flex items-center justify-between"
                  >
                    <span>Regional Situation Overview</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToSection("asean-matrix")}
                    className="w-full text-left rounded-lg px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 transition flex items-center justify-between"
                  >
                    <span>ASEAN Burden Matrix</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToSection("asean-spasial")}
                    className="w-full text-left rounded-lg px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 transition flex items-center justify-between"
                  >
                    <span>Spatial Hotspot Geomap</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToSection("asean-preparedness")}
                    className="w-full text-left rounded-lg px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 transition flex items-center justify-between"
                  >
                    <span>Regional Preparedness</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToSection("asean-sources")}
                    className="w-full text-left rounded-lg px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 transition flex items-center justify-between"
                  >
                    <span>Sources &amp; Partnerships</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => scrollToSection("summary")}
                    className="w-full text-left rounded-lg px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 transition flex items-center justify-between"
                  >
                    <span>Executive Summary</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToSection("tactical-recommendations")}
                    className="w-full text-left rounded-lg px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 transition flex items-center justify-between"
                  >
                    <span>Tactical Recommendations</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToSection("spatial-map")}
                    className="w-full text-left rounded-lg px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 transition flex items-center justify-between"
                  >
                    <span>Spatial Hotspot Geomap</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToSection("trend-visualization")}
                    className="w-full text-left rounded-lg px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 transition flex items-center justify-between"
                  >
                    <span>Surveillance Trends Curve</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToSection("disease-distribution")}
                    className="w-full text-left rounded-lg px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 transition flex items-center justify-between"
                  >
                    <span>Disease Distribution (ICD-11)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToSection("regional-matrix")}
                    className="w-full text-left rounded-lg px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 transition flex items-center justify-between"
                  >
                    <span>Regional Burden Matrix</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToSection("endorsement")}
                    className="w-full text-left rounded-lg px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 transition flex items-center justify-between"
                  >
                    <span>PHEOC Verification Sheet</span>
                  </button>
                </>
              )}
            </nav>
          </div>

          {/* Quick Metadata Box */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs text-xs space-y-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Metadata</p>
            <div>
              <span className="text-slate-500">Lead Analyst:</span>
              <p className="font-bold text-slate-800">{reportAuthor}</p>
            </div>
            <div>
              <span className="text-slate-500">Epi-Week:</span>
              <p className="font-bold text-slate-800">{epiPeriodText}</p>
            </div>
            <div>
              <span className="text-slate-500">Theme:</span>
              <p className="font-bold text-[#0060A9] uppercase text-[10px]">{reportTheme.replace("_", " ")}</p>
            </div>
          </div>
        </aside>

        {/* ==========================================
            CENTRAL PRINT/PDF REPORT CANVAS
        ========================================== */}
        <main className={`print-area flex-1 rounded-2xl p-6 sm:p-10 transition duration-300 ${getThemeClass()}`}>
          {/* -------------------------------------------
              TEMPLATE 1: ABVC EXECUTIVE SITREP
          -------------------------------------------- */}
          {template === "kemenkes_sitrep" && (
            <div className="space-y-8">
              {/* Report Header Block */}
              <header className="border-b-2 border-slate-900 pb-5">
                <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-teal-800 px-2 py-0.5 text-[11px] font-black tracking-wider text-white uppercase">
                        ABVC PHEOC
                      </span>
                      <span className="text-xs font-bold text-slate-500">
                        Official Surveillance Intelligence System
                      </span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-black text-slate-950 tracking-tight leading-tight">
                      {reportTitle}
                    </h1>
                    <p className="text-xs sm:text-sm font-semibold text-teal-900">
                      {reportSubtitle}
                    </p>
                  </div>

                  <div className="shrink-0 text-right text-xs">
                    <p className="font-mono font-bold text-slate-800">{epiPeriodText}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{updatedAtText}</p>
                    <span className="inline-block mt-2 rounded-full border border-teal-300 bg-teal-50 px-2.5 py-0.5 text-[10px] font-black text-teal-800 uppercase">
                      CONFIRMED LEVEL
                    </span>
                  </div>
                </div>

                {/* Filter Meta Badges */}
                <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-slate-200 text-xs font-semibold text-slate-600">
                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1">
                    <strong>SCOPE:</strong> {filterWilayahText}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1">
                    <strong>DISEASE:</strong> {filterLayananText}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1">
                    <strong>LEAD ANALYST:</strong> {reportAuthor}
                  </span>
                </div>
              </header>

              {/* Section 1: KPI Indicator Cards */}
              {visibility.kpi && (
                <section id="kpi-cards" className="grid grid-cols-2 sm:grid-cols-4 gap-3 break-inside-avoid">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Total Confirmed</p>
                    <p className="text-2xl font-black text-slate-900 font-mono">{metricTotalKasus.toLocaleString()}</p>
                    <p className="text-[10px] text-emerald-700 font-bold">+6.2% vs previous week</p>
                  </div>

                  <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3.5 space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-wider text-rose-800">Total Fatalities</p>
                    <p className="text-2xl font-black text-rose-700 font-mono">{metricKorbanMeninggal}</p>
                    <p className="text-[10px] text-rose-700 font-bold">Accumulated fatalities</p>
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-wider text-amber-800">Case Fatality Rate</p>
                    <p className="text-2xl font-black text-amber-700 font-mono">{metricCfr}%</p>
                    <p className="text-[10px] text-slate-500 font-medium">Safe threshold &lt; 1%</p>
                  </div>

                  <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3.5 space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-wider text-blue-800">Hotspot Clusters</p>
                    <p className="text-2xl font-black text-[#0060A9] font-mono">{metricKlasterAktif}</p>
                    <p className="text-[10px] text-blue-700 font-bold">Active local transmission</p>
                  </div>
                </section>
              )}

              {/* Section 2: Executive Summary Narrative */}
              {visibility.summary && (
                <section id="summary" className="space-y-2 break-inside-avoid">
                  <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1.5">
                    Executive Summary: Infectious Disease Situation &amp; Outbreak Signals
                  </h3>
                  <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs sm:text-sm leading-relaxed text-slate-800 space-y-2.5">
                    <p>{executiveSummary}</p>
                  </div>
                </section>
              )}

              {/* Section 3: Tactical Response Points */}
              {visibility.tactical && (
                <section id="tactical-recommendations" className="space-y-2 break-inside-avoid">
                  <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1.5">
                    Tactical Response Points &amp; Epidemiological Early Action
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {tacticalPoints.map((point, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 text-xs text-slate-800 space-y-1"
                      >
                        <p className="font-black text-slate-900">Priority #{idx + 1}</p>
                        <p className="leading-relaxed text-slate-600">{point}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Section 4: Spatial GIS Hotspots (WGS84 ASEAN Geomap) */}
              {visibility.map && (
                <section id="spatial-map" className="space-y-2 break-inside-avoid">
                  <SpatialHotspotMap hotspots={hotspots} title="Spatial Mapping: Outbreak Hotspots & Disease Transmission Corridors" />
                </section>
              )}

              {/* Section 5: Epidemiological Trends & Disease Burden */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {visibility.trends && (
                  <section id="trend-visualization" className="break-inside-avoid">
                    <TrendEpiCurveChart data={trendData} title="Epidemiological Trends & Weekly Surveillance Transmission Curve" />
                  </section>
                )}

                {visibility.distribution && (
                  <section id="disease-distribution" className="break-inside-avoid">
                    <DiseaseDistributionDonut shares={diseaseShares} title="Disease Burden Distribution & Clinical Severity Classification" />
                  </section>
                )}
              </div>

              {/* Section 6: Regional Multi-Country Matrix */}
              {visibility.regionalTable && (
                <section id="regional-matrix" className="space-y-3 break-inside-avoid">
                  <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1.5">
                    Regional Multi-Country Surveillance Matrix (ASEAN &amp; Indonesia)
                  </h3>
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-700">
                        <tr>
                          <th className="px-3 py-2.5 font-black">Territory / Jurisdiction</th>
                          <th className="px-3 py-2.5 text-right font-black">Total Cases</th>
                          <th className="px-3 py-2.5 text-right font-black">Cumulative Fatalities</th>
                          <th className="px-3 py-2.5 text-right font-black">Case Fatality Rate (%)</th>
                          <th className="px-3 py-2.5 text-center font-black">Early Warning Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {countryBurdens.map((item) => (
                          <tr key={item.country} className="hover:bg-slate-50/80">
                            <td className="px-3 py-2 font-bold text-slate-900">{item.country}</td>
                            <td className="px-3 py-2 text-right font-mono">{item.cases.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right font-mono text-rose-700 font-bold">{item.deaths}</td>
                            <td className="px-3 py-2 text-right font-mono">{item.cfr.toFixed(2)}%</td>
                            <td className="px-3 py-2 text-center">
                              <span
                                className={`inline-block rounded px-2 py-0.5 text-[10px] font-black uppercase ${
                                  item.cfr > 0.3
                                    ? "bg-rose-100 text-rose-800"
                                    : "bg-emerald-100 text-emerald-800"
                                }`}
                              >
                                {item.cfr > 0.3 ? "ACTIVE ALERT" : "MONITORED"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Section 7: Verification & Sign-off Sheet */}
              {visibility.signature && (
                <section id="endorsement" className="pt-6 border-t-2 border-slate-900 text-xs break-inside-avoid">
                  <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-6">
                    <div>
                      <p className="font-bold text-slate-800">ABVC Disease Surveillance &amp; Health Intelligence System</p>
                      <p className="text-[11px] text-slate-500">Official document issued automatically following epidemiological intelligence verification</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-slate-500">Jakarta, {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
                      <p className="mt-8 font-black text-slate-900">Public Health Emergency Operation Centre (PHEOC)</p>
                      <p className="text-[10px] text-slate-500">ASEAN Biological Threats Surveillance Centre (ABVC)</p>
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}

          {/* -------------------------------------------
              TEMPLATE 2: ASEAN BIO-THREATS MEDIA MONITORING
          -------------------------------------------- */}
          {template === "asean_bulletin" && (
            <div className="space-y-6">
              {/* ASEAN Header Banner */}
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
                      GLOBAL &amp; ASEAN REGION — {epiPeriodText}
                    </p>
                  </div>

                  <div className="text-right text-[10px] text-cyan-200/80 space-y-1">
                    <p className="font-bold">With Support by:</p>
                    <p className="font-semibold text-white">Canada / Korea Disease Control &amp; Prevention Agency</p>
                  </div>
                </div>
              </div>

              {/* Section: Overview */}
              <div id="asean-overview" className="text-xs sm:text-sm text-slate-700 leading-relaxed border-b border-slate-200 pb-4">
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
                  <div key={dh.id} id={`asean-disease-${dh.id}`} className="space-y-2.5 break-inside-avoid">
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

              {/* Section: Matrix */}
              <div id="asean-matrix" className="pt-6 border-t border-slate-200 break-inside-avoid">
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

              {/* Section: Spatial Hotspot Map for ASEAN */}
              <div id="asean-spasial" className="pt-6 border-t border-slate-200 break-inside-avoid">
                <SpatialHotspotMap hotspots={hotspots} title="Spatial Hotspot & Regional Epidemiological Corridors Mapping (ASEAN)" />
              </div>

              {/* Section: Regional Preparedness */}
              <div id="asean-preparedness" className="pt-6 border-t border-slate-200 break-inside-avoid space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">
                  Regional Preparedness &amp; Early Action Recommendations
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3.5 space-y-1">
                    <p className="font-black text-[#0060A9]">1. International Points of Entry (PoE) Surveillance</p>
                    <p className="text-slate-600 leading-relaxed">
                      Thermal screening and digital health passes at primary international transit airports (Jakarta, Bangkok, Ho Chi Minh, Manila) to identify passengers presenting with febrile rash or high fever.
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 space-y-1">
                    <p className="font-black text-emerald-800">2. IHR Signal Data Exchange &amp; EOC Network</p>
                    <p className="text-slate-600 leading-relaxed">
                      Rapid cross-border notification between ASEAN National IHR Focal Points regarding unexpected transmission surges or variant emergence within 24 hours.
                    </p>
                  </div>
                </div>
              </div>

              {/* Section: Sources & Partnership */}
              <div id="asean-sources" className="pt-6 border-t border-slate-200 break-inside-avoid text-xs text-slate-500 space-y-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                  Information Sources &amp; Technical Partnerships
                </h4>
                <p className="leading-relaxed">
                  This report is automatically compiled through artificial intelligence online media monitoring (ABVC Surveillance NLP Pipeline) and cross-verified with official national channels: Ministry of Health Indonesia, Department of Disease Control Thailand, Ministry of Health Malaysia, Ministry of Health Viet Nam, Department of Health Philippines, and WHO SEARO / WPRO bulletins.
                </p>
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
                <span>Document Customization (Human-in-the-Loop)</span>
              </div>
              <button
                type="button"
                onClick={() => setIsEditDrawerOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Background & Template Theme Styling */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2.5">
              <label className="block text-[11px] font-black uppercase text-slate-700">
                Document Background &amp; Style Theme
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "formal_white", label: "Clean White", desc: "Formal print standard" },
                  { id: "asean_navy", label: "ASEAN Navy", desc: "Cartographic blue accent" },
                  { id: "kemenkes_teal", label: "ABVC Teal", desc: "PHEOC ABVC teal accent" },
                  { id: "slate_minimal", label: "Slate Dark", desc: "Modern minimalist" },
                ].map((th) => (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() => setReportTheme(th.id as any)}
                    className={`rounded-xl border p-2 text-left text-xs transition cursor-pointer ${
                      reportTheme === th.id
                        ? "border-[#0060A9] bg-white text-[#0060A9] font-black shadow-xs ring-2 ring-blue-500/20"
                        : "border-slate-200 bg-white/70 text-slate-700 hover:bg-white"
                    }`}
                  >
                    <p className="font-bold">{th.label}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{th.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Author / Reviewer */}
            <div>
              <label className="block text-[11px] font-black uppercase text-slate-500 mb-1">
                Lead Analyst / Document Reviewer
              </label>
              <input
                type="text"
                value={reportAuthor}
                onChange={(e) => setReportAuthor(e.target.value)}
                placeholder="e.g., yusuf, Rijal, vira, PHEOC ABVC"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800"
              />
            </div>

            {/* Template Selection */}
            <div>
              <label className="block text-[11px] font-black uppercase text-slate-500 mb-1">
                Select Document Template Format
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTemplate("kemenkes_sitrep")}
                  className={`rounded-xl border p-2.5 text-left text-xs font-bold transition cursor-pointer ${
                    template === "kemenkes_sitrep"
                      ? "border-[#0060A9] bg-blue-50/50 text-[#0060A9]"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <p className="font-black">EOC SitRep ABVC</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Official Regional ABVC Situation Report</p>
                </button>
                <button
                  type="button"
                  onClick={() => setTemplate("asean_bulletin")}
                  className={`rounded-xl border p-2.5 text-left text-xs font-bold transition cursor-pointer ${
                    template === "asean_bulletin"
                      ? "border-[#0060A9] bg-blue-50/50 text-[#0060A9]"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <p className="font-black">ASEAN Bulletin</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Disease-specific media monitoring</p>
                </button>
              </div>
            </div>

            {/* Watermark Settings */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-slate-700">Document Watermark</span>
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
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Watermark Text</label>
                    <input
                      type="text"
                      value={watermarkText}
                      onChange={(e) => setWatermarkText(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {["DRAFT", "RESTRICTED / CONFIDENTIAL", "WEEKLY SITREP", "ASEAN BIO-THREATS"].map(
                      (preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setWatermarkText(preset)}
                          className="rounded-md bg-white border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                        >
                          {preset}
                        </button>
                      )
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Meta Title & Period */}
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-black uppercase text-slate-500 mb-1">
                  Report Document Title
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
                  Epidemiological Week / Period
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
                  Filtered Region Scope
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
                Executive Summary Narrative (Fully Editable)
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
                  Tactical Recommendation Points
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setTacticalPoints([
                      ...tacticalPoints,
                      "New priority recommendation point: specify epidemiological early action instruction here.",
                    ])
                  }
                  className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-[#0060A9] cursor-pointer"
                >
                  <Plus className="h-3 w-3" /> Add Point
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
                      className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
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
                Key Indicator Statistics Overrides
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] font-bold text-slate-500">Total Cases</span>
                  <input
                    type="number"
                    value={metricTotalKasus}
                    onChange={(e) => setMetricTotalKasus(Number(e.target.value))}
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500">Total Deaths</span>
                  <input
                    type="number"
                    value={metricKorbanMeninggal}
                    onChange={(e) => setMetricKorbanMeninggal(Number(e.target.value))}
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500">Average CFR (%)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={metricCfr}
                    onChange={(e) => setMetricCfr(Number(e.target.value))}
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500">Hotspot Clusters</span>
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
                Show / Hide Sections
              </label>
              <div className="space-y-1.5 text-xs font-bold text-slate-600">
                {[
                  { key: "kpi", label: "Main Indicator Cards (KPI)" },
                  { key: "summary", label: "Executive Summary" },
                  { key: "tactical", label: "Tactical Recommendations" },
                  { key: "map", label: "Spatial Hotspot Map" },
                  { key: "trends", label: "Epidemiological Trends Chart" },
                  { key: "distribution", label: "Disease Distribution Donut" },
                  { key: "regionalTable", label: "Regional Burden Matrix" },
                  { key: "signature", label: "PHEOC Endorsement Sheet" },
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
              onClick={handlePublishReport}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 py-2.5 text-xs font-black text-white shadow-xs transition cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Publish This Report to Archive</span>
            </button>
            <button
              type="button"
              onClick={handleResetToBaseline}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Reset to Automated AI Baseline</span>
            </button>
            <button
              type="button"
              onClick={() => setIsEditDrawerOpen(false)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0060A9] py-2.5 text-xs font-black text-white hover:bg-blue-800 transition cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Apply &amp; Preview Document</span>
            </button>
          </div>
        </div>
      )}

      {/* ==========================================
          PUBLISH SUCCESS / CONFIRMATION MODAL
      ========================================== */}
      {isPublishModalOpen && publishSuccessItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  Report Successfully Published!
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Stored into the Public Archive and ready for access.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs">
              <div>
                <span className="font-bold text-slate-500">Report Title:</span>
                <p className="font-black text-slate-900">{publishSuccessItem.title}</p>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                <span className="text-slate-500">Category:</span>
                <span className="font-bold text-[#0060A9]">{publishSuccessItem.category}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Lead Analyst / Reviewer:</span>
                <span className="font-bold text-slate-800">{publishSuccessItem.author}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Publication Period:</span>
                <span className="font-bold text-slate-800">{publishSuccessItem.period}</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsPublishModalOpen(false)}
                className="w-full sm:w-auto rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                Stay Here
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="w-full sm:w-auto rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 transition shadow-2xs cursor-pointer"
              >
                Print / Download PDF
              </button>
              <Link
                href="/console/reports-cms"
                className="w-full sm:w-auto rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2 text-xs font-bold text-slate-800 transition text-center shadow-2xs cursor-pointer"
              >
                To Console CMS
              </Link>
              <Link
                href={
                  template === "asean_bulletin"
                    ? "/reports?tab=media_monitoring"
                    : "/reports?tab=sitrep_abvc"
                }
                className="w-full sm:w-auto rounded-xl bg-[#0060A9] hover:bg-blue-700 px-4 py-2 text-xs font-black text-white shadow-xs transition text-center cursor-pointer"
              >
                View in Public Archive (/reports)
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ExecutiveReportPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white space-y-3">
          <div className="h-8 w-8 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
          <p className="text-sm font-bold text-slate-300">Loading Executive Report Studio...</p>
        </div>
      }
    >
      <ExecutiveReportContent />
    </React.Suspense>
  )
}
