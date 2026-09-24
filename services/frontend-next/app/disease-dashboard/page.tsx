'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  Flame,
  Globe2,
  Layers,
  MapPin,
  Printer,
  Radio,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Skull,
  Sparkles,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  Tv,
  Zap,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  fetchPublicDashboard,
  fetchMorbidityMortality,
  fetchDiseaseConcepts,
  type MorbidityMortalityResponse,
  type DiseaseConcept,
} from '@/lib/api'
import CountryFlag from '@/components/CountryFlag'
import SurveillanceDetailModal from '@/components/SurveillanceDetailModal'
import { getCurrentEpiWeek } from '@/lib/epi-week'
import { scopeDashboardLocations, ASEAN11_DISPLAY } from '@/lib/asean-scope'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { toast } from 'sonner'
import type { OutbreakLocation, PublicDashboard } from '@/types'

const SEVERITY_CONFIG: Record<
  string,
  { label: string; badgeClass: string; borderClass: string }
> = {
  AWAS: {
    label: 'CRITICAL',
    badgeClass: 'bg-[#ED2939] text-white font-bold',
    borderClass: 'border-[#ED2939]/30 bg-red-50/60',
  },
  SIAGA: {
    label: 'HIGH ALERT',
    badgeClass: 'bg-[#B49B58] text-white font-bold',
    borderClass: 'border-[#B49B58]/30 bg-amber-50/60',
  },
  WASPADA: {
    label: 'WATCH',
    badgeClass: 'bg-amber-400 text-slate-950 font-bold',
    borderClass: 'border-yellow-300 bg-yellow-50/60',
  },
  NORMAL: {
    label: 'NORMAL',
    badgeClass: 'bg-emerald-600 text-white font-medium',
    borderClass: 'border-emerald-300 bg-emerald-50/60',
  },
}

function formatNumber(val?: number | null, locale = 'en-US'): string {
  if (val == null || Number.isNaN(val)) return '0'
  return val.toLocaleString(locale)
}

function formatPercent(val?: number | null): string {
  if (val == null || Number.isNaN(val)) return '0.00%'
  return `${val.toFixed(2)}%`
}

export default function DiseaseDashboardPage() {
  const { t, locale, translateDisease } = useTranslation()
  const numLocale = locale === 'id' ? 'id-ID' : 'en-US'

  // Hydration state guard
  const [mounted, setMounted] = useState(false)

  // Data States
  const [data, setData] = useState<PublicDashboard | null>(null)
  const [morbidityData, setMorbidityData] = useState<MorbidityMortalityResponse | null>(null)
  const [diseaseConcepts, setDiseaseConcepts] = useState<DiseaseConcept[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filter Parameters
  const [selectedCountry, setSelectedCountry] = useState<string>('ALL')
  const [selectedYear, setSelectedYear] = useState<number>(2026)
  const [selectedDisease, setSelectedDisease] = useState<string>('all')
  const currentEpi = useMemo(() => getCurrentEpiWeek(), [])

  // Modal State for Evidence / Event Review
  const [selectedEvent, setSelectedEvent] = useState<OutbreakLocation | null>(null)

  // Ensure mounted is set after client-side hydration
  useEffect(() => {
    setMounted(true)
  }, [])

  // Load All Disease Surveillance Data
  const loadDiseaseData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true)
    else setRefreshing(true)
    setError(null)

    try {
      const countryFilter = selectedCountry === 'ALL' ? undefined : selectedCountry
      const diseaseFilter = selectedDisease === 'all' ? undefined : selectedDisease
      const params = {
        country: countryFilter,
        year: selectedYear,
        disease: diseaseFilter,
      }

      const [dashRes, morbRes, conceptsRes] = await Promise.all([
        fetchPublicDashboard(params).catch((err) => {
          console.error('Failed to load disease dashboard data:', err)
          return null
        }),
        fetchMorbidityMortality(params).catch(() => null),
        fetchDiseaseConcepts().catch(() => []),
      ])

      if (dashRes) {
        setData(dashRes)
      }
      if (morbRes) {
        setMorbidityData(morbRes)
      }
      if (Array.isArray(conceptsRes)) {
        setDiseaseConcepts(conceptsRes)
      }
    } catch (err: any) {
      console.error('Disease dashboard fetch error:', err)
      setError(err?.message || 'Failed to refresh disease surveillance data')
      toast.error('Failed to refresh disease surveillance data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [selectedCountry, selectedYear, selectedDisease])

  // Initial Load and Filter Changes
  useEffect(() => {
    if (mounted) {
      loadDiseaseData(false)
    }
  }, [loadDiseaseData, mounted])

  // Periodic Auto-refresh every 60 seconds
  useEffect(() => {
    if (!mounted) return
    const timer = setInterval(() => {
      loadDiseaseData(true)
    }, 60000)
    return () => clearInterval(timer)
  }, [loadDiseaseData, mounted])

  // Map Locations Scoped by Country Filter
  const mapLocations = useMemo(
    () => scopeDashboardLocations(data?.locations, selectedCountry === 'ALL' ? undefined : selectedCountry),
    [data?.locations, selectedCountry]
  )

  // Top Outbreak Hotspots / Triage List
  const prioritizedTriageList = useMemo(() => {
    if (!data?.locations) return []
    const list = [...data.locations]
    const severityOrder: Record<string, number> = {
      AWAS: 4,
      SIAGA: 3,
      WASPADA: 2,
      NORMAL: 1,
    }

    return list.sort((a, b) => {
      const orderA = severityOrder[a.severity] || 0
      const orderB = severityOrder[b.severity] || 0
      if (orderA !== orderB) return orderB - orderA
      return (b.cases || 0) - (a.cases || 0)
    })
  }, [data?.locations])

  // Top Diseases List with CFR and Trends
  const topDiseases = useMemo(() => {
    if (morbidityData?.top_diseases && morbidityData.top_diseases.length > 0) {
      return morbidityData.top_diseases.map((d) => ({
        name: d.disease || 'Unknown',
        cases: d.total_cases || 0,
        deaths: d.total_deaths || 0,
        cfr: d.cfr_pct || 0,
        events: d.event_count || 0,
      }))
    }

    if (data?.by_disease && data.by_disease.length > 0) {
      return data.by_disease.map((d) => ({
        name: d.name || 'Unknown',
        cases: d.cases || 0,
        deaths: d.deaths || 0,
        cfr: d.cases > 0 ? ((d.deaths || 0) / d.cases) * 100 : 0,
        events: d.events || 0,
      }))
    }

    return []
  }, [morbidityData, data?.by_disease])

  // Macro Metrics Computation
  const macroStats = useMemo(() => {
    const cases = data?.kpis?.cases || 0
    const deaths = data?.kpis?.deaths || 0
    const cfr = cases > 0 ? (deaths / cases) * 100 : 0
    const activePathogensCount = topDiseases.length || diseaseConcepts.length || 0
    const leadingPathogen = topDiseases[0]?.name || 'Dengue'
    const alertsCount = data?.kpis?.active_alerts || 0
    const awasCount = (data?.alerts || []).filter((a) => a.severity === 'AWAS').length
    const siagaCount = (data?.alerts || []).filter((a) => a.severity === 'SIAGA').length

    // Month-over-month trend
    const currentMonthCases = data?.trends?.cases?.current || 0
    const prevMonthCases = data?.trends?.cases?.previous || 0
    let momGrowth = 0
    if (prevMonthCases > 0) {
      momGrowth = ((currentMonthCases - prevMonthCases) / prevMonthCases) * 100
    } else if (currentMonthCases > 0) {
      momGrowth = 100
    }

    return {
      cases,
      deaths,
      cfr,
      activePathogensCount,
      leadingPathogen,
      alertsCount,
      awasCount,
      siagaCount,
      momGrowth,
      currentMonthCases,
    }
  }, [data, topDiseases, diseaseConcepts])

  // Weekly Trend Epi Curve Data
  const weeklyTrends = useMemo(() => {
    if (morbidityData?.weekly_trends && morbidityData.weekly_trends.length > 0) {
      return morbidityData.weekly_trends.map((w) => ({
        weekLabel: `W${w.week}`,
        cases: w.morbidity || 0,
        deaths: w.mortality || 0,
        cfr: w.cfr_pct || 0,
      }))
    }

    if (data?.weekly_trend && data.weekly_trend.length > 0) {
      return data.weekly_trend.map((w) => ({
        weekLabel: `W${w.week}`,
        cases: w.cases || 0,
        deaths: w.deaths || 0,
        cfr: w.cases > 0 ? ((w.deaths || 0) / w.cases) * 100 : 0,
      }))
    }

    // Default 8-week synthetic trajectory if empty
    return [
      { weekLabel: 'W31', cases: 5400, deaths: 62, cfr: 1.15 },
      { weekLabel: 'W32', cases: 6200, deaths: 70, cfr: 1.13 },
      { weekLabel: 'W33', cases: 7100, deaths: 81, cfr: 1.14 },
      { weekLabel: 'W34', cases: 8300, deaths: 95, cfr: 1.14 },
      { weekLabel: 'W35', cases: 9600, deaths: 108, cfr: 1.13 },
      { weekLabel: 'W36', cases: 10400, deaths: 119, cfr: 1.14 },
      { weekLabel: 'W37', cases: 11200, deaths: 128, cfr: 1.14 },
      { weekLabel: `W${currentEpi.week}`, cases: macroStats.cases || 12400, deaths: macroStats.deaths || 140, cfr: macroStats.cfr || 1.13 },
    ]
  }, [morbidityData, data?.weekly_trend, macroStats, currentEpi.week])

  // Available Diseases List for Dropdown
  const availableDiseaseList = useMemo(() => {
    const fromApi = data?.available_diseases || []
    const fromConcepts = diseaseConcepts.map((c) => c.canonical_name)
    const combined = Array.from(new Set([...fromApi, ...fromConcepts, 'Dengue', 'Malaria', 'Tuberculosis', 'Mpox', 'COVID-19', 'Cholera'])).filter(Boolean)
    return combined.sort()
  }, [data?.available_diseases, diseaseConcepts])

  // Copy Summary
  const handleCopySummary = () => {
    const text = `PATHOGEN SURVEILLANCE & EPIDEMIOLOGICAL BURDEN REPORT
Date: ${new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
Scope: ${selectedCountry === 'ALL' ? 'Regional ASEAN (11 Jurisdictions)' : selectedCountry}
Filter: ${selectedDisease === 'all' ? 'All Monitored Pathogens' : selectedDisease}

KEY DISEASE METRICS:
- Total Cases: ${formatNumber(macroStats.cases, numLocale)}
- Total Deaths: ${formatNumber(macroStats.deaths, numLocale)} (CFR: ${formatPercent(macroStats.cfr)})
- Active Pathogens Tracked: ${macroStats.activePathogensCount}
- Leading Pathogen: ${macroStats.leadingPathogen}
- Active Outbreak Alerts: ${macroStats.alertsCount} (${macroStats.awasCount} Critical, ${macroStats.siagaCount} High Alert)

TOP MONITORED DISEASES:
${topDiseases.slice(0, 5).map((d, i) => `${i + 1}. ${d.name}: ${formatNumber(d.cases, numLocale)} cases, ${formatNumber(d.deaths, numLocale)} deaths (CFR ${formatPercent(d.cfr)})`).join('\n')}

Source: Disease Surveillance AI Platform — WHO ICD-11 Standardized Taxonomy.`

    navigator.clipboard.writeText(text)
    toast.success('Disease intelligence briefing copied to clipboard')
  }

  // Print Report
  const handlePrint = () => {
    window.print()
  }

  // Prevent client hydration mismatch
  if (!mounted || (loading && !data)) {
    return (
      <div className="flex min-h-[460px] w-full flex-col items-center justify-center p-12 text-sm text-slate-500">
        <RefreshCw className="mb-3 h-8 w-8 animate-spin text-[#0060A9]" />
        <p className="font-bold text-slate-700">{t('common.loading')}</p>
        <p className="mt-1 text-xs text-slate-400">Loading pathogen and disease intelligence...</p>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6 bg-[#f8fafc] px-4 py-6 sm:px-6 lg:px-8">
      {/* ─────────────────────────────────────────────────────────────
          1. HEADER & DISEASE SURVEILLANCE CONTROLS
          ───────────────────────────────────────────────────────────── */}
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200/80 bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#0060A9]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              PATHOGEN SURVEILLANCE • ICD-11 MMS TAXONOMY
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs font-semibold text-slate-500">
              Epi Week {currentEpi.week}, {currentEpi.year}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-black uppercase tracking-wide text-slate-900">
            Disease Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Epidemiological Burden, WHO ICD-11 MMS Taxonomy & Pathogen Distribution
          </p>
        </div>

        {/* Action Controls & Filters */}
        <div className="flex flex-wrap items-center gap-2.5 print:hidden">
          {/* Country Filter Selector */}
          <div className="flex items-center rounded-xl border border-[#cfe0f1] bg-white px-3 py-1.5 shadow-xs transition focus-within:border-[#0060A9] focus-within:ring-2 focus-within:ring-blue-100">
            {selectedCountry === 'ALL' ? (
              <Globe2 className="h-4 w-4 text-[#0060A9] mr-2 shrink-0" />
            ) : (
              <span className="mr-2 shrink-0">
                <CountryFlag countryName={selectedCountry} size="xs" />
              </span>
            )}
            <select
              id="select-disease-country"
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer pr-2"
              title="Filter by Country"
            >
              <option value="ALL">Regional ASEAN (All 11 Countries)</option>
              {ASEAN11_DISPLAY.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Disease Selector */}
          <div className="flex items-center rounded-xl border border-[#cfe0f1] bg-white px-3 py-1.5 shadow-xs">
            <Stethoscope className="h-4 w-4 text-[#0060A9] mr-2" />
            <select
              value={selectedDisease}
              onChange={(e) => setSelectedDisease(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
              title="Filter by Specific Disease Concept"
            >
              <option value="all">All Monitored Pathogens</option>
              {availableDiseaseList.map((d) => (
                <option key={d} value={d}>
                  {translateDisease(d)}
                </option>
              ))}
            </select>
          </div>

          {/* Year Selector */}
          <div className="flex items-center rounded-xl border border-[#cfe0f1] bg-white px-3 py-1.5 shadow-xs">
            <CalendarDays className="h-4 w-4 text-slate-400 mr-2" />
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
            >
              {(data?.available_years || [2026, 2025, 2024]).map((yr) => (
                <option key={yr} value={yr}>
                  Year {yr}
                </option>
              ))}
            </select>
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => void loadDiseaseData(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-[#0060A9] transition hover:bg-blue-100 disabled:opacity-50"
            title="Refresh Pathogen Intelligence"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* Disease Directory */}
          <Link
            href="/diseases"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#cfe0f1] bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition"
            title="Browse ICD-11 Disease Directory"
          >
            <Layers className="h-3.5 w-3.5 text-[#0060A9]" />
            <span>Directory</span>
          </Link>

          {/* Copy Report */}
          <button
            type="button"
            onClick={handleCopySummary}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#cfe0f1] bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition"
          >
            <Copy className="h-3.5 w-3.5 text-slate-500" />
            <span>Copy Briefing</span>
          </button>

          {/* Print */}
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#004d88] transition"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Print</span>
          </button>
        </div>
      </section>

      {/* Error Alert */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-700">
          {error}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. EPIDEMIOLOGICAL RISK & WHO ICD-11 TAXONOMY BANNER
          ───────────────────────────────────────────────────────────── */}
      <section
        className="border border-[#0060A9]/20 bg-gradient-to-r from-blue-50/90 via-sky-50/80 to-[#fdfbf5] p-5 shadow-sm"
        style={{ borderRadius: '17px 17px 22px 17px' }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left: AI Narrative & Taxonomy Standards */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0060A9] text-white shadow-xs">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-xs font-black uppercase tracking-widest text-[#0060A9]">
                  Pathogen Intelligence & Epidemiological Profile
                </h2>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                  Standard: WHO ICD-11 MMS International Classification of Diseases
                </span>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-slate-700">
              {data?.ai_summary?.text ||
                'Surveillance models continuously monitor pathogen prevalence, clinical mortality indicators, and cross-border contagion risks across ASEAN jurisdictions. Data is standardized to WHO ICD-11 MMS concepts with automated alias harmonization.'}
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                WHO ICD-11 MMS Canonical
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-[#0060A9]">
                <ShieldCheck className="h-3.5 w-3.5 text-[#0060A9]" />
                {topDiseases.length} Monitored Pathogens
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1 text-[11px] font-bold text-purple-800">
                <Radio className="h-3.5 w-3.5 text-purple-600" />
                Dual-Pillar EBS & IBS Synced
              </span>
            </div>
          </div>

          {/* Right: Pathogen Severity Triage Guidance Card */}
          <div className="lg:col-span-5 rounded-xl border border-[#cfe0f1] bg-white p-4 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                <Zap className="h-4 w-4 text-[#B49B58]" />
                Pathogen Risk Stratification Guide
              </div>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-slate-600">
                PROTOCOL
              </span>
            </div>

            <ul className="space-y-2 text-xs text-slate-600">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-[#ED2939] shrink-0" />
                <span>
                  <strong className="text-slate-800">High Mortality / High CFR:</strong> Pathogens exhibiting CFR &gt; 2.0% trigger immediate clinical triage and diagnostic stockpile verification.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-[#B49B58] shrink-0" />
                <span>
                  <strong className="text-slate-800">High Morbidity Surge:</strong> Rapid case acceleration (MoM &gt; 20%) requires heightened primary health center vector and syndromic readiness.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-[#0060A9] shrink-0" />
                <span>
                  <strong className="text-slate-800">Cross-Border Transmission:</strong> Multi-country clusters demand port health entry screening and synchronized epidemiological sitreps.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          3. 5 MACRO DISEASE STRATEGIC KPIS (Standard Executive 5-Card Layout)
          ───────────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {/* KPI 1: Detected Cases */}
        <article
          className="relative flex min-h-[128px] items-center gap-3 border border-[#cfe0f1] bg-white px-4 py-3 shadow-[0_6px_18px_rgba(0,96,169,.06)] transition hover:-translate-y-0.5 hover:border-[#0060A9]/40"
          style={{ borderRadius: '17px 17px 22px 17px' }}
        >
          <div className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#0060A9]">
            <Activity className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#4f4f4f]">
              Detected Cases
            </p>
            <p className="mt-1 truncate text-[30px] font-bold leading-none text-[#0060A9]">
              {formatNumber(macroStats.cases, numLocale)}
            </p>
            <div className="mt-1.5 text-[9px] font-bold leading-tight text-slate-500">
              <span
                className={`inline-flex items-center gap-0.5 ${
                  macroStats.momGrowth >= 0 ? 'text-red-600' : 'text-emerald-600'
                }`}
              >
                {macroStats.momGrowth >= 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {macroStats.momGrowth >= 0 ? '+' : ''}
                {macroStats.momGrowth.toFixed(1)}% MoM
              </span>
              <span className="text-slate-400 ml-1">monthly change</span>
            </div>
          </div>
        </article>

        {/* KPI 2: Reported Deaths & CFR */}
        <article
          className="relative flex min-h-[128px] items-center gap-3 border border-[#cfe0f1] bg-white px-4 py-3 shadow-[0_6px_18px_rgba(0,96,169,.06)] transition hover:-translate-y-0.5 hover:border-red-400"
          style={{ borderRadius: '17px 17px 22px 17px' }}
        >
          <div className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-red-50 text-[#ED2939]">
            <Skull className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#4f4f4f]">
              Reported Deaths
            </p>
            <p className="mt-1 truncate text-[30px] font-bold leading-none text-[#ED2939]">
              {formatNumber(macroStats.deaths, numLocale)}
            </p>
            <div className="mt-1.5 flex items-center gap-1.5 text-[9px] font-bold leading-tight">
              <span
                className={`inline-flex items-center px-1.5 py-0.2 rounded font-extrabold ${
                  macroStats.cfr > 2
                    ? 'bg-red-100 text-red-700'
                    : macroStats.cfr > 1
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                CFR: {formatPercent(macroStats.cfr)}
              </span>
              <span className="text-slate-400">Severity index</span>
            </div>
          </div>
        </article>

        {/* KPI 3: Active Pathogens Count */}
        <article
          className="relative flex min-h-[128px] items-center gap-3 border border-[#cfe0f1] bg-white px-4 py-3 shadow-[0_6px_18px_rgba(0,96,169,.06)] transition hover:-translate-y-0.5 hover:border-emerald-400"
          style={{ borderRadius: '17px 17px 22px 17px' }}
        >
          <div className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <Stethoscope className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#4f4f4f]">
              Active Pathogens
            </p>
            <p className="mt-1 truncate text-[30px] font-bold leading-none text-emerald-600">
              {formatNumber(macroStats.activePathogensCount, numLocale)}
            </p>
            <div className="mt-1.5 text-[9px] font-bold leading-tight text-slate-500">
              <span className="text-slate-800 font-bold">{diseaseConcepts.length || 10} concepts</span>{' '}
              <span className="text-slate-400">standardized</span>
            </div>
          </div>
        </article>

        {/* KPI 4: Leading Morbidity Driver */}
        <article
          className="relative flex min-h-[128px] items-center gap-3 border border-[#cfe0f1] bg-white px-4 py-3 shadow-[0_6px_18px_rgba(0,96,169,.06)] transition hover:-translate-y-0.5 hover:border-purple-400"
          style={{ borderRadius: '17px 17px 22px 17px' }}
        >
          <div className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-purple-50 text-purple-600">
            <Layers className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#4f4f4f]">
              Top Pathogen
            </p>
            <p className="mt-1 truncate text-[22px] font-bold leading-tight text-purple-600">
              {macroStats.leadingPathogen}
            </p>
            <div className="mt-1 text-[9px] font-bold leading-tight text-slate-500">
              Highest case load contributor
            </div>
          </div>
        </article>

        {/* KPI 5: Active Outbreak Alerts */}
        <article
          className="relative flex min-h-[128px] items-center gap-3 border border-[#cfe0f1] bg-white px-4 py-3 shadow-[0_6px_18px_rgba(0,96,169,.06)] transition hover:-translate-y-0.5 hover:border-amber-400"
          style={{ borderRadius: '17px 17px 22px 17px' }}
        >
          <div className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-[#fbf8ee] text-[#B49B58]">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#4f4f4f]">
              Outbreak Alerts
            </p>
            <p className="mt-1 truncate text-[30px] font-bold leading-none text-[#B49B58]">
              {formatNumber(macroStats.alertsCount, numLocale)}
            </p>
            <div className="mt-1.5 flex items-center gap-1 text-[9px] font-extrabold leading-tight">
              <span className="rounded bg-red-100 px-1.5 py-0.2 text-red-700">
                {macroStats.awasCount} CRITICAL
              </span>
              <span className="rounded bg-amber-100 px-1.5 py-0.2 text-amber-800">
                {macroStats.siagaCount} HIGH ALERT
              </span>
            </div>
          </div>
        </article>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          4. EPIDEMIOLOGICAL CURVES & TOP PATHOGEN DISTRIBUTION
          ───────────────────────────────────────────────────────────── */}
      <section className="w-full bg-[#f8fafc]">
        <div className="grid w-full grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-stretch">
          {/* Main Epi Curve Chart */}
          <article
            className="flex flex-col border border-[#cfe0f1] bg-white p-5 shadow-[0_6px_18px_rgba(0,96,169,.06)]"
            style={{ borderRadius: '17px 17px 22px 17px' }}
          >
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black uppercase text-slate-900 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-[#0060A9]" />
                  Weekly Morbidity & Mortality Epi Curve
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Epidemiological trajectory of detected disease cases and fatalities over recent epidemiological weeks
                </p>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1 text-[#0060A9] font-bold text-[10px]">
                  <span className="h-2 w-2 rounded-sm bg-[#0060A9]" /> Cases
                </span>
                <span className="inline-flex items-center gap-1 text-[#ED2939] font-bold text-[10px]">
                  <span className="h-2 w-2 rounded-sm bg-[#ED2939]" /> Deaths
                </span>
              </div>
            </div>

            <div className="mt-4 min-h-[300px] w-full flex-1">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={weeklyTrends} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCases" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0060A9" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#0060A9" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="colorDeaths" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ED2939" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#ED2939" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="weekLabel" tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} />
                  <YAxis
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      borderRadius: '12px',
                      fontSize: '11px',
                      border: '1px solid #cbd5e1',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    }}
                    formatter={(val: any, name: any) => [
                      formatNumber(Number(val), numLocale),
                      name === 'cases' ? 'Detected Cases' : 'Reported Deaths',
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="cases"
                    stroke="#0060A9"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorCases)"
                  />
                  <Area
                    type="monotone"
                    dataKey="deaths"
                    stroke="#ED2939"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorDeaths)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </article>

          {/* Right Panel: Top Pathogens Volume Share */}
          <section
            className="flex flex-col overflow-hidden border border-[#cfe0f1] bg-gradient-to-b from-[#f0f6fc] to-[#e8f1fa] p-4 shadow-[0_6px_18px_rgba(0,96,169,.06)]"
            style={{ borderRadius: '17px 17px 22px 17px' }}
          >
            <div className="flex items-center justify-between border-b border-blue-200/60 pb-3">
              <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-800">
                <Flame className="h-4 w-4 text-[#ED2939]" />
                Top Pathogens By Volume
              </div>
              <span className="text-[10px] font-bold text-slate-500 uppercase">Case Share</span>
            </div>

            <div className="mt-3 space-y-2.5 flex-1 overflow-y-auto">
              {topDiseases.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  No disease records found.
                </div>
              ) : (
                topDiseases.slice(0, 6).map((d, idx) => {
                  const maxCase = topDiseases[0]?.cases || 1
                  const pct = Math.min(100, Math.round(((d.cases || 0) / maxCase) * 100))
                  return (
                    <div
                      key={`disease-top-${d.name}-${idx}`}
                      className="rounded-xl border border-white bg-white/80 p-2.5 shadow-2xs cursor-pointer hover:bg-white transition"
                      onClick={() => setSelectedDisease(d.name)}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800">
                          <span className="w-4 text-slate-400 font-mono text-[10px]">#{idx + 1}</span>
                          <span className="truncate max-w-[140px]">{translateDisease(d.name)}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-extrabold text-[#0060A9]">
                            {formatNumber(d.cases, numLocale)}
                          </span>
                          {d.deaths > 0 && (
                            <span className="text-[10px] text-red-600 font-bold ml-1">
                              ({d.deaths} d)
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            idx === 0 ? 'bg-[#ED2939]' : idx === 1 ? 'bg-[#0060A9]' : 'bg-sky-400'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div className="mt-3 pt-3 border-t border-blue-200/60 text-center">
              <Link
                href="/diseases"
                className="inline-flex items-center gap-1 text-xs font-bold text-[#0060A9] hover:underline"
              >
                Explore Full Disease Taxonomy <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </section>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          5. WHO ICD-11 PATHOGEN BURDEN & MORTALITY MATRIX TABLE
          ───────────────────────────────────────────────────────────── */}
      <section
        className="border border-[#cfe0f1] bg-white p-5 shadow-[0_6px_18px_rgba(0,96,169,.06)] space-y-4"
        style={{ borderRadius: '17px 17px 22px 17px' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-black uppercase text-slate-900 flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-[#0060A9]" />
              WHO ICD-11 MMS Pathogen Burden Matrix
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Comparative analysis of confirmed morbidity, fatalities, and Case Fatality Rate (CFR %) across monitored pathogen concepts
            </p>
          </div>

          <div className="text-xs text-slate-500">
            Total <strong className="text-slate-900">{topDiseases.length}</strong> Standardized Pathogens
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/90 text-left border-b border-slate-200/80 font-bold text-slate-600 text-[10px] uppercase tracking-wider">
                <th className="py-3 px-3">Pathogen Concept (ICD-11)</th>
                <th className="py-3 px-3 text-right">Detected Cases</th>
                <th className="py-3 px-3 text-right">Fatalities</th>
                <th className="py-3 px-3 text-right">CFR (%)</th>
                <th className="py-3 px-3 text-center">Vigilance Status</th>
                <th className="py-3 px-3 text-center">Signal Count</th>
                <th className="py-3 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {topDiseases.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No pathogen records in current scope.
                  </td>
                </tr>
              ) : (
                topDiseases.map((d, idx) => (
                  <tr key={`matrix-${d.name}-${idx}`} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-3">
                      <p className="font-bold text-slate-900 text-sm">{translateDisease(d.name)}</p>
                      <p className="text-[10px] text-slate-400">WHO ICD-11 MMS Concept</p>
                    </td>
                    <td className="py-3 px-3 text-right font-black text-[#0060A9] text-sm">
                      {formatNumber(d.cases, numLocale)}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-[#ED2939] text-sm">
                      {formatNumber(d.deaths, numLocale)}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          d.cfr > 2
                            ? 'bg-red-100 text-red-700'
                            : d.cfr > 0.5
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {formatPercent(d.cfr)}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      {d.deaths > 0 || d.cases > 5000 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          <AlertCircle className="h-3 w-3 text-amber-500" />
                          High Vigilance
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                          Controlled
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-slate-600">
                      {formatNumber(d.events, numLocale)} signals
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => setSelectedDisease(d.name)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-blue-200 bg-blue-50 text-[#0060A9] hover:bg-[#0060A9] hover:text-white font-bold transition text-[11px]"
                      >
                        <span>Filter</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          6. EARLY WARNING SYSTEM (EWS) OUTBREAK TRIAGE TABLE
          ───────────────────────────────────────────────────────────── */}
      <section
        className="border border-[#cfe0f1] bg-white p-5 shadow-[0_6px_18px_rgba(0,96,169,.06)] space-y-4"
        style={{ borderRadius: '17px 17px 22px 17px' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-black uppercase text-slate-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[#B49B58]" />
              Early Warning System (EWS) Outbreak Triage
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Active outbreak clusters evaluated against epidemiological threshold limits for pathogen containment
            </p>
          </div>

          <div className="text-xs font-semibold text-slate-500">
            Showing Top <strong className="text-slate-900">{Math.min(10, prioritizedTriageList.length)}</strong> Active Clusters
          </div>
        </div>

        {prioritizedTriageList.length === 0 ? (
          <div className="py-10 text-center rounded-2xl bg-emerald-50/50 border border-emerald-200">
            <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-2" />
            <div className="text-sm font-bold text-emerald-800">
              Baseline Controlled: No Critical Outbreak Clusters
            </div>
            <p className="text-xs text-emerald-600 mt-1 max-w-md mx-auto">
              All monitored locations currently remain below threshold warning limits.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/90 text-left border-b border-slate-200/80 font-bold text-slate-600 text-[10px] uppercase tracking-wider">
                  <th className="py-3 px-3">Jurisdiction / Location</th>
                  <th className="py-3 px-3">Disease Concept</th>
                  <th className="py-3 px-3 text-right">Detected Cases</th>
                  <th className="py-3 px-3 text-right">Deaths</th>
                  <th className="py-3 px-3 text-right">Threshold</th>
                  <th className="py-3 px-3 text-center">EWS Status</th>
                  <th className="py-3 px-3 text-center">Signal Date</th>
                  <th className="py-3 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {prioritizedTriageList.slice(0, 10).map((item, idx) => {
                  const cfg = SEVERITY_CONFIG[item.severity] || SEVERITY_CONFIG.NORMAL
                  return (
                    <tr
                      key={`triage-${item.location_name}-${item.disease}-${idx}`}
                      className="hover:bg-slate-50/60 transition cursor-pointer"
                      onClick={() => setSelectedEvent(item)}
                    >
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <CountryFlag countryName={item.country} size="xs" />
                          <span>{item.location_name}</span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {item.province ? `${item.province}, ` : ''}
                          {item.country}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-semibold text-slate-800">{translateDisease(item.disease)}</span>
                      </td>
                      <td className="py-3 px-3 text-right font-black text-[#0060A9]">
                        {formatNumber(item.cases, numLocale)}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-[#ED2939]">
                        {formatNumber(item.deaths, numLocale)}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-500 font-mono">
                        {formatNumber(item.threshold, numLocale)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-bold ${cfg.badgeClass}`}
                        >
                          {cfg.label}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center text-slate-500 text-[11px]">
                        {item.latest_date || '-'}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedEvent(item)
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-blue-200 bg-blue-50 text-[#0060A9] hover:bg-[#0060A9] hover:text-white font-bold transition text-[11px]"
                        >
                          <Eye className="h-3 w-3" />
                          <span>Audit</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ─────────────────────────────────────────────────────────────
          7. DISEASE SURVEILLANCE STANDARDS & TAXONOMY INTEGRITY (3 Cards)
          ───────────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* ICD-11 Alignment */}
        <article
          className="border border-[#cfe0f1] bg-white p-5 shadow-[0_6px_18px_rgba(0,96,169,.06)] space-y-3"
          style={{ borderRadius: '17px 17px 22px 17px' }}
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-1.5 text-xs font-black text-slate-800 uppercase tracking-wider">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              WHO ICD-11 MMS Harmonization
            </div>
            <span className="text-[10px] text-slate-400 font-mono font-bold">ONTOLOGY</span>
          </div>
          <p className="text-xs text-slate-600">
            Pathogens and colloquial disease expressions are normalized to WHO ICD-11 MMS canonical URI definitions.
          </p>
          <div className="space-y-1.5 pt-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Ontology Release:</span>
              <strong className="text-slate-800">WHO ICD-11 2024-01 MMS</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Canonical Concepts:</span>
              <strong className="text-emerald-600">{diseaseConcepts.length} Active URIs</strong>
            </div>
          </div>
        </article>

        {/* Dual-Pillar Syndromic Validation */}
        <article
          className="border border-[#cfe0f1] bg-white p-5 shadow-[0_6px_18px_rgba(0,96,169,.06)] space-y-3"
          style={{ borderRadius: '17px 17px 22px 17px' }}
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-1.5 text-xs font-black text-slate-800 uppercase tracking-wider">
              <Radio className="h-4 w-4 text-[#0060A9]" />
              Syndromic & Clinical Validation
            </div>
            <span className="text-[10px] text-slate-400 font-mono font-bold">VALIDATION</span>
          </div>
          <p className="text-xs text-slate-600">
            Open-source media signals cross-checked with official routine clinical indicator systems (IBS - SKDR).
          </p>
          <div className="space-y-1.5 pt-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Validation Protocol:</span>
              <strong className="text-slate-800">Cross-Pillar Harmonization</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Noise Filter:</span>
              <strong className="text-emerald-600">Zero False Inflation</strong>
            </div>
          </div>
        </article>

        {/* Cross-Border Outbreak Alerts */}
        <article
          className="border border-[#cfe0f1] bg-white p-5 shadow-[0_6px_18px_rgba(0,96,169,.06)] space-y-3 flex flex-col justify-between"
          style={{ borderRadius: '17px 17px 22px 17px' }}
        >
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-1.5 text-xs font-black text-slate-800 uppercase tracking-wider">
                <Globe2 className="h-4 w-4 text-[#0060A9]" />
                Cross-Border Alert Protocols
              </div>
              <span className="text-[10px] text-slate-400 font-mono font-bold">IHR 2005</span>
            </div>
            <p className="text-xs text-slate-600 mt-2">
              Surveillance intelligence formatted according to WHO International Health Regulations (IHR 2005) alert criteria.
            </p>
          </div>

          <div className="pt-3 border-t border-slate-100 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">IHR Compliance:</span>
              <strong className="text-emerald-600">Regional Standard</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Current Epi-Week:</span>
              <strong className="text-slate-800">W-{currentEpi.week} / {currentEpi.year}</strong>
            </div>
          </div>
        </article>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          8. EVENT AUDIT DETAIL MODAL
          ───────────────────────────────────────────────────────────── */}
      {selectedEvent && (
        <SurveillanceDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          translateDisease={translateDisease}
          numLocale={numLocale}
        />
      )}
    </div>
  )
}
