'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Copy,
  Eye,
  Flame,
  Globe2,
  LogIn,
  MapPin,
  Printer,
  Radio,
  RefreshCw,
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
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  fetchPublicDashboard,
  fetchCrawlingStats,
  fetchMorbidityMortality,
  type CrawlingStats,
  type MorbidityMortalityResponse,
} from '@/lib/api'
import CountryFlag from '@/components/CountryFlag'
import SurveillanceDetailModal from '@/components/SurveillanceDetailModal'
import { getCurrentEpiWeek } from '@/lib/epi-week'
import { scopeDashboardLocations, ASEAN11_DISPLAY } from '@/lib/asean-scope'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { formatSeverityEn } from '@/lib/surveillance-formatters'
import { toast } from 'sonner'
import type { OutbreakLocation, PublicDashboard } from '@/types'

// Dynamic import for Leaflet-based map to avoid SSR hydration issues
const SpatialOutbreakMap = dynamic(
  () => import('@/components/SpatialOutbreakMap'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[460px] w-full items-center justify-center rounded-xl bg-slate-50 text-xs text-slate-400">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin text-[#0060A9]" />
        Loading spatial outbreak map...
      </div>
    ),
  }
)

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

export default function LiteDashboardPage() {
  const { t, locale, translateDisease } = useTranslation()
  const numLocale = locale === 'id' ? 'id-ID' : 'en-US'

  // Hydration state guard
  const [mounted, setMounted] = useState(false)

  // Dashboard Data State
  const [data, setData] = useState<PublicDashboard | null>(null)
  const [crawlingStats, setCrawlingStats] = useState<CrawlingStats | null>(null)
  const [morbidityData, setMorbidityData] = useState<MorbidityMortalityResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filter Parameters (ALL = Regional ASEAN 11, or individual country name)
  const [selectedCountry, setSelectedCountry] = useState<string>('ALL')
  const [selectedYear, setSelectedYear] = useState<number>(2026)
  const currentEpi = useMemo(() => getCurrentEpiWeek(), [])

  // Modal State for Evidence / Event Review
  const [selectedEvent, setSelectedEvent] = useState<OutbreakLocation | null>(null)

  // Ensure mounted is set after client-side hydration
  useEffect(() => {
    setMounted(true)
  }, [])

  // Load All Public Surveillance Data
  const loadLiteData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true)
    else setRefreshing(true)
    setError(null)

    try {
      const countryFilter = selectedCountry === 'ALL' ? undefined : selectedCountry
      const params = {
        country: countryFilter,
        year: selectedYear,
      }

      const [dashRes, crawlRes, morbRes] = await Promise.all([
        fetchPublicDashboard(params).catch((err) => {
          console.error('Failed to load dashboard:', err)
          return null
        }),
        fetchCrawlingStats().catch(() => null),
        fetchMorbidityMortality(params).catch(() => null),
      ])

      if (dashRes) {
        setData(dashRes)
      }
      if (crawlRes) {
        setCrawlingStats(crawlRes)
      }
      if (morbRes) {
        setMorbidityData(morbRes)
      }
    } catch (err: any) {
      console.error('Lite dashboard fetch error:', err)
      setError(err?.message || 'Failed to refresh public surveillance data')
      toast.error('Failed to refresh public surveillance data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [selectedCountry, selectedYear])

  // Initial Load and Filter Changes
  useEffect(() => {
    if (mounted) {
      loadLiteData(false)
    }
  }, [loadLiteData, mounted])

  // Periodic Auto-refresh every 60 seconds
  useEffect(() => {
    if (!mounted) return
    const timer = setInterval(() => {
      loadLiteData(true)
    }, 60000)
    return () => clearInterval(timer)
  }, [loadLiteData, mounted])

  // Macro Metrics
  const macroStats = useMemo(() => {
    const cases = data?.kpis?.cases || 0
    const deaths = data?.kpis?.deaths || 0
    const cfr = cases > 0 ? (deaths / cases) * 100 : 0
    const alertsCount = data?.kpis?.active_alerts || 0
    const awasCount = (data?.alerts || []).filter((a) => a.severity === 'AWAS').length
    const siagaCount = (data?.alerts || []).filter((a) => a.severity === 'SIAGA').length
    const locationsCount = data?.kpis?.locations || data?.locations?.length || 0

    // Month-over-month trend
    const currentMonthCases = data?.trends?.cases?.current || 0
    const prevMonthCases = data?.trends?.cases?.previous || 0
    let momGrowth = 0
    if (prevMonthCases > 0) {
      momGrowth = ((currentMonthCases - prevMonthCases) / prevMonthCases) * 100
    } else if (currentMonthCases > 0) {
      momGrowth = 100
    }

    // Regional vs National distribution
    const indonesiaCases =
      data?.by_country?.find(
        (c) => (c.name || '').toLowerCase() === 'indonesia' || (c.name || '').toLowerCase() === 'id'
      )?.cases || 0
    const outsideAseanCases = Math.max(0, cases - indonesiaCases)
    const crossBorderRatio = cases > 0 ? (outsideAseanCases / cases) * 100 : 0

    return {
      cases,
      deaths,
      cfr,
      alertsCount,
      awasCount,
      siagaCount,
      locationsCount,
      momGrowth,
      currentMonthCases,
      prevMonthCases,
      crossBorderRatio,
      outsideAseanCases,
      indonesiaCases,
    }
  }, [data])

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
      return morbidityData.top_diseases.slice(0, 8).map((d) => ({
        name: d.disease || 'Unknown',
        cases: d.total_cases || 0,
        deaths: d.total_deaths || 0,
        cfr: d.cfr_pct || 0,
        events: d.event_count || 0,
      }))
    }

    if (data?.by_disease && data.by_disease.length > 0) {
      return data.by_disease.slice(0, 8).map((d) => ({
        name: d.name || 'Unknown',
        cases: d.cases || 0,
        deaths: d.deaths || 0,
        cfr: d.cases > 0 ? ((d.deaths || 0) / d.cases) * 100 : 0,
        events: d.events || 0,
      }))
    }

    return []
  }, [morbidityData, data?.by_disease])

  // Top Hotspot Countries
  const topCountries = useMemo(() => {
    if (!data?.by_country) return []
    return [...data.by_country]
      .filter((c) => c && c.name)
      .sort((a, b) => (b.cases || 0) - (a.cases || 0))
      .slice(0, 6)
  }, [data?.by_country])

  // Copy Public Briefing
  const handleCopyBriefing = () => {
    if (!data) return
    const text = `PUBLIC HEALTH SURVEILLANCE BRIEFING (${selectedCountry === 'ALL' ? 'REGIONAL ASEAN' : selectedCountry.toUpperCase()})
Date: ${new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
Epi Week: W-${currentEpi.week} (${currentEpi.year})

KEY MACRO METRICS:
- Total Cases: ${formatNumber(macroStats.cases, numLocale)}
- Total Deaths: ${formatNumber(macroStats.deaths, numLocale)} (CFR: ${formatPercent(macroStats.cfr)})
- Active Outbreak Alerts: ${macroStats.alertsCount} (${macroStats.awasCount} Critical, ${macroStats.siagaCount} High Alert)
- Monitored Locations: ${macroStats.locationsCount}

PUBLIC SITUATIONAL INTELLIGENCE:
${data.ai_summary?.text || 'Aggregated from stored verified NLP surveillance extractions.'}

TOP MONITORED DISEASES:
${topDiseases.slice(0, 4).map((d, i) => `${i + 1}. ${d.name}: ${formatNumber(d.cases, numLocale)} cases, ${formatNumber(d.deaths, numLocale)} deaths (CFR ${formatPercent(d.cfr)})`).join('\n')}

Source: Disease Surveillance AI Platform — ASEAN Public Health Intelligence.`

    navigator.clipboard.writeText(text)
    toast.success('Public briefing copied to clipboard')
  }

  // Print Public Report
  const handlePrint = () => {
    window.print()
  }

  // Prevent client hydration mismatch & render loading spinner until ready
  if (!mounted || (loading && !data)) {
    return (
      <div className="flex min-h-[460px] w-full flex-col items-center justify-center p-12 text-sm text-slate-500">
        <RefreshCw className="mb-3 h-8 w-8 animate-spin text-[#0060A9]" />
        <p className="font-bold text-slate-700">{t('common.loading')}</p>
        <p className="mt-1 text-xs text-slate-400">Loading public surveillance intelligence...</p>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6 bg-[#f8fafc] px-4 py-6 sm:px-6 lg:px-8">
      {/* ─────────────────────────────────────────────────────────────
          1. LITE DASHBOARD HEADER SECTION (Consistent with Executive Dashboard)
          ───────────────────────────────────────────────────────────── */}
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200/80 bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#0060A9]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Public Surveillance • Guest Access
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs font-semibold text-slate-500">
              Epi Week {currentEpi.week}, {currentEpi.year}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-black uppercase tracking-wide text-slate-900">
            Lite Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Public Regional Epidemiological Intelligence & Outbreak Monitoring
          </p>
        </div>

        {/* Action Controls & Filters */}
        <div className="flex flex-wrap items-center gap-2.5 print:hidden">
          {/* Country Filter Selector (Dropdown for each individual ASEAN country + All ASEAN) */}
          <div className="flex items-center rounded-xl border border-[#cfe0f1] bg-white px-3 py-1.5 shadow-xs transition focus-within:border-[#0060A9] focus-within:ring-2 focus-within:ring-blue-100">
            {selectedCountry === 'ALL' ? (
              <Globe2 className="h-4 w-4 text-[#0060A9] mr-2 shrink-0" />
            ) : (
              <span className="mr-2 shrink-0">
                <CountryFlag countryName={selectedCountry} size="xs" />
              </span>
            )}
            <select
              id="select-lite-country"
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
            onClick={() => void loadLiteData(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-[#0060A9] transition hover:bg-blue-100 disabled:opacity-50"
            title="Refresh Intelligence Data"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* Copy Briefing */}
          <button
            type="button"
            onClick={handleCopyBriefing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#cfe0f1] bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition"
            title="Copy structured briefing to clipboard"
          >
            <Copy className="h-3.5 w-3.5 text-slate-500" />
            <span>Copy Briefing</span>
          </button>

          {/* TV Wall Link */}
          <Link
            href="/tv"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#cfe0f1] bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition"
            title="Open Command Center TV View"
          >
            <Tv className="h-3.5 w-3.5 text-[#0060A9]" />
            <span className="hidden md:inline">TV Wall</span>
          </Link>

          {/* Print Report */}
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

      {/* Error Alert Banner */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-700">
          {error}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. PUBLIC SITUATIONAL SUMMARY & GUEST ADVISORY BANNER
          ───────────────────────────────────────────────────────────── */}
      <section
        className="border border-[#0060A9]/20 bg-gradient-to-r from-blue-50/90 via-sky-50/80 to-[#fdfbf5] p-5 shadow-sm"
        style={{ borderRadius: '17px 17px 22px 17px' }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left: AI Narrative Briefing & Standard Badges */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0060A9] text-white shadow-xs">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-xs font-black uppercase tracking-widest text-[#0060A9]">
                  Public Situational Intelligence Summary
                </h2>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                  Provider: {data?.ai_summary?.provider || 'Verified NLP Engine'}
                </span>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-slate-700">
              {data?.ai_summary?.text ||
                'Aggregating verified epidemiological indicators across official Indicator-Based Surveillance (IBS - SKDR) and open-source Event-Based Surveillance (EBS). Data resolved against the local disease master.'}
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Local Disease Master
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-[#0060A9]">
                <ShieldCheck className="h-3.5 w-3.5 text-[#0060A9]" />
                {formatNumber(data?.kpis?.events, numLocale)} Validated Events
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1 text-[11px] font-bold text-purple-800">
                <Radio className="h-3.5 w-3.5 text-purple-600" />
                Dual-Pillar IBS & EBS Surveillance
              </span>
            </div>
          </div>

          {/* Right: Guest Surveillance Guidance Card */}
          <div className="lg:col-span-5 rounded-xl border border-[#cfe0f1] bg-white p-4 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                <Zap className="h-4 w-4 text-[#B49B58]" />
                Public Health Advisory & Scope
              </div>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-slate-600">
                Guest View
              </span>
            </div>

            <ul className="space-y-2 text-xs text-slate-600">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-[#ED2939] shrink-0" />
                <span>
                  <strong className="text-slate-800">Outbreak Signals:</strong> Highlighted clusters represent verified epidemiological signals triggering heightened vigilance across ASEAN jurisdictions.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-[#B49B58] shrink-0" />
                <span>
                  <strong className="text-slate-800">Verified Evidence:</strong> Click any outbreak cluster to inspect clinical indicators, event credibility, and source verification notes.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-[#0060A9] shrink-0" />
                <span>
                  <strong className="text-slate-800">Official Reporting:</strong> For complete epidemiological bulletins and matrix ledgers, explore the public Sitrep Bulletins.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          3. 5 MACRO STRATEGIC KPI CARDS (Standard Executive Dashboard Styling)
          ───────────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {/* KPI 1: Detected Cases */}
        <article
          className="relative flex min-h-[128px] items-center gap-3 border border-[#cfe0f1] bg-white px-4 py-3 shadow-[0_6px_18px_rgba(0,96,169,.06)] transition hover:-translate-y-0.5 hover:border-[#0060A9]/40"
          style={{ borderRadius: '17px 17px 22px 17px' }}
        >
          <div className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-blue-50/80 text-[#0060A9]">
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
              <span className="text-slate-400 ml-1">
                ({formatNumber(macroStats.currentMonthCases, numLocale)} this month)
              </span>
            </div>
          </div>
        </article>

        {/* KPI 2: Reported Fatalities & CFR */}
        <article
          className="relative flex min-h-[128px] items-center gap-3 border border-[#cfe0f1] bg-white px-4 py-3 shadow-[0_6px_18px_rgba(0,96,169,.06)] transition hover:-translate-y-0.5 hover:border-red-400"
          style={{ borderRadius: '17px 17px 22px 17px' }}
        >
          <div className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-red-50/80 text-[#ED2939]">
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

        {/* KPI 3: Early Warning Signals */}
        <article
          className="relative flex min-h-[128px] items-center gap-3 border border-[#cfe0f1] bg-white px-4 py-3 shadow-[0_6px_18px_rgba(0,96,169,.06)] transition hover:-translate-y-0.5 hover:border-amber-400"
          style={{ borderRadius: '17px 17px 22px 17px' }}
        >
          <div className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-[#fbf8ee] text-[#B49B58]">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#4f4f4f]">
              Early Warning Signals
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

        {/* KPI 4: Active Locations */}
        <article
          className="relative flex min-h-[128px] items-center gap-3 border border-[#cfe0f1] bg-white px-4 py-3 shadow-[0_6px_18px_rgba(0,96,169,.06)] transition hover:-translate-y-0.5 hover:border-emerald-400"
          style={{ borderRadius: '17px 17px 22px 17px' }}
        >
          <div className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <MapPin className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#4f4f4f]">
              Monitored Locations
            </p>
            <p className="mt-1 truncate text-[30px] font-bold leading-none text-emerald-600">
              {formatNumber(macroStats.locationsCount, numLocale)}
            </p>
            <div className="mt-1.5 text-[9px] font-bold leading-tight text-slate-500">
              <span className="text-slate-700">{data?.by_country?.length || 0} Jurisdictions</span>{' '}
              <span className="text-slate-400">mapped centroids</span>
            </div>
          </div>
        </article>

        {/* KPI 5: Cross-Border Threat Index */}
        <article
          className="relative flex min-h-[128px] items-center gap-3 border border-[#cfe0f1] bg-white px-4 py-3 shadow-[0_6px_18px_rgba(0,96,169,.06)] transition hover:-translate-y-0.5 hover:border-purple-400"
          style={{ borderRadius: '17px 17px 22px 17px' }}
        >
          <div className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-purple-50 text-purple-600">
            <Globe2 className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#4f4f4f]">
              Cross-Border Threat
            </p>
            <p className="mt-1 truncate text-[30px] font-bold leading-none text-purple-600">
              {formatPercent(macroStats.crossBorderRatio)}
            </p>
            <div className="mt-1.5 text-[9px] font-bold leading-tight text-slate-500">
              <span className="text-purple-700 font-bold">
                {formatNumber(macroStats.outsideAseanCases, numLocale)} cases
              </span>{' '}
              <span className="text-slate-400">regional import risk</span>
            </div>
          </div>
        </article>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          4. STRATEGIC GEO-RISK MAP & HOTSPOT RANKING SECTION
          ───────────────────────────────────────────────────────────── */}
      <section className="w-full bg-[#f8fafc]">
        <div className="grid w-full grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-stretch">
          {/* Main Map Card */}
          <article
            className="flex flex-col border border-[#cfe0f1] bg-white p-4 shadow-[0_6px_18px_rgba(0,96,169,.06)]"
            style={{ borderRadius: '17px 17px 22px 17px' }}
          >
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-xl font-black uppercase leading-tight text-slate-900">
                  Spatial Geo-Risk Surveillance & Priority Hotspots
                </h3>
                <p className="mt-1 text-sm font-normal text-slate-600">
                  Cross-border ASEAN & national outbreak clusters color-coded by Early Warning System
                  (EWS) severity thresholds
                </p>
              </div>

              {/* Severity Legend Badges */}
              <div className="flex flex-wrap items-center gap-1.5 print:hidden">
                <span className="text-[11px] font-bold text-slate-500 mr-1">Severity:</span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-[#ED2939] text-white">
                  CRITICAL
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-[#B49B58] text-white">
                  HIGH ALERT
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-[#0060A9]">
                  BASELINE
                </span>
              </div>
            </div>

            <div className="mt-4 min-h-[460px] w-full flex-1 overflow-hidden rounded-xl border border-slate-100">
              <SpatialOutbreakMap
                countries={data?.by_country || []}
                locations={mapLocations}
                highlightCountry={selectedCountry === 'ALL' ? undefined : selectedCountry}
                regionalMode={selectedCountry === 'ALL'}
              />
            </div>
          </article>

          {/* Right Side Panel: Top Jurisdictions & Key Clusters */}
          <section
            className="flex flex-col overflow-hidden border border-[#cfe0f1] bg-gradient-to-b from-[#f0f6fc] to-[#e8f1fa] p-4 shadow-[0_6px_18px_rgba(0,96,169,.06)]"
            style={{ borderRadius: '17px 17px 22px 17px' }}
          >
            <div className="flex items-center justify-between border-b border-blue-200/60 pb-3">
              <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-800">
                <Flame className="h-4 w-4 text-[#ED2939]" />
                Top Hotspot Jurisdictions
              </div>
              <span className="text-[10px] font-bold text-slate-500 uppercase">Case Volume</span>
            </div>

            {/* Country Ranking Bars */}
            <div className="mt-3 space-y-2.5 flex-1 overflow-y-auto">
              {topCountries.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  No country records found.
                </div>
              ) : (
                topCountries.map((c, idx) => {
                  const maxCase = topCountries[0]?.cases || 1
                  const pct = Math.min(100, Math.round(((c.cases || 0) / maxCase) * 100))
                  return (
                    <div
                      key={`${c.name || 'country'}-${idx}`}
                      className="rounded-xl border border-white bg-white/80 p-2.5 shadow-2xs"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800">
                          <span className="w-4 text-slate-400 font-mono text-[10px]">#{idx + 1}</span>
                          <CountryFlag countryName={c.name} size="xs" />
                          <span className="truncate max-w-[120px]">{c.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-extrabold text-[#0060A9]">
                            {formatNumber(c.cases, numLocale)}
                          </span>
                          {c.deaths != null && c.deaths > 0 && (
                            <span className="text-[10px] text-red-600 font-bold ml-1">
                              ({c.deaths} d)
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

            {/* Key Active Outbreak Clusters */}
            <div className="mt-3 pt-3 border-t border-blue-200/60">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-600 mb-2">
                Active Outbreak Signals
              </p>
              <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1 text-xs">
                {prioritizedTriageList.length === 0 ? (
                  <p className="p-2 text-center text-[11px] text-slate-400">
                    No active clusters detected.
                  </p>
                ) : (
                  prioritizedTriageList.slice(0, 4).map((loc, i) => (
                    <button
                      key={`${loc.location_name || 'loc'}-${loc.disease || 'dis'}-${i}`}
                      type="button"
                      onClick={() => setSelectedEvent(loc)}
                      className="w-full text-left flex items-center justify-between p-2 rounded-xl bg-white border border-slate-100 hover:border-blue-300 hover:bg-blue-50/60 transition shadow-2xs"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="font-bold text-slate-900 truncate">{loc.location_name}</p>
                        <p className="text-[10px] text-slate-500 truncate">
                          {loc.disease} • {loc.country}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className={`inline-block px-1.5 py-0.2 text-[9px] font-bold rounded ${
                            loc.severity === 'AWAS'
                              ? 'bg-[#ED2939] text-white'
                              : loc.severity === 'SIAGA'
                              ? 'bg-[#B49B58] text-white'
                              : 'bg-blue-100 text-[#0060A9]'
                          }`}
                        >
                          {formatSeverityEn(loc.severity)}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          5. PRIORITY DISEASE BURDEN & MORTALITY MATRIX
          ───────────────────────────────────────────────────────────── */}
      <section
        className="border border-[#cfe0f1] bg-white p-5 shadow-[0_6px_18px_rgba(0,96,169,.06)] space-y-4"
        style={{ borderRadius: '17px 17px 22px 17px' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-black uppercase text-slate-900 flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-[#0060A9]" />
              Priority Disease Burden & Mortality Matrix
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Evaluation of detected cases, fatalities, and Case Fatality Rate (CFR %) standardized to
              Local disease concepts
            </p>
          </div>

          <div className="text-xs text-slate-500">
            Total <strong className="text-slate-900">{topDiseases.length}</strong> Monitored Diseases
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Visual Bar Chart (5 Columns) */}
          <div className="lg:col-span-5 h-[270px] bg-slate-50/70 rounded-2xl p-3 border border-slate-200">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              Cases vs Fatalities Comparison (Top 5)
            </div>
            {topDiseases.length > 0 ? (
              <ResponsiveContainer width="100%" height="88%">
                <BarChart
                  data={topDiseases.slice(0, 5)}
                  layout="vertical"
                  margin={{ top: 5, right: 15, left: 30, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fontSize: 10, fill: '#334155', fontWeight: 600 }}
                    width={90}
                    tickFormatter={(val) => {
                      const s = String(val ?? '')
                      return s.length > 12 ? `${s.slice(0, 10)}...` : s
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      color: '#0f172a',
                      borderRadius: '12px',
                      fontSize: '11px',
                      border: '1px solid #cbd5e1',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    }}
                    formatter={(val: any) => [formatNumber(val, numLocale), '']}
                  />
                  <Bar dataKey="cases" fill="#0060A9" radius={[0, 4, 4, 0]} name="Cases" />
                  <Bar dataKey="deaths" fill="#ED2939" radius={[0, 4, 4, 0]} name="Deaths" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[200px] items-center justify-center text-xs text-slate-400">
                No disease records available.
              </div>
            )}
          </div>

          {/* Executive Table (7 Columns) */}
          <div className="lg:col-span-7 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/90 text-left border-b border-slate-200/80 font-bold text-slate-600 text-[10px] uppercase tracking-wider">
                  <th className="py-2.5 px-3">Priority Disease</th>
                  <th className="py-2.5 px-3 text-right">Cases</th>
                  <th className="py-2.5 px-3 text-right">Deaths</th>
                  <th className="py-2.5 px-3 text-right">CFR (%)</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {topDiseases.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      No disease data available.
                    </td>
                  </tr>
                ) : (
                  topDiseases.map((d, i) => (
                    <tr key={`${d.name || 'disease'}-${i}`} className="hover:bg-slate-50/60 transition">
                      <td className="py-2.5 px-3">
                        <p className="font-bold text-slate-900">{d.name}</p>
                        <p className="text-[10px] text-slate-400">{d.events} verified reports</p>
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-[#0060A9]">
                        {formatNumber(d.cases, numLocale)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-red-600">
                        {formatNumber(d.deaths, numLocale)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
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
                      <td className="py-2.5 px-3 text-center">
                        {d.deaths > 0 || d.cases > 5000 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700">
                            <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                            High Vigilance
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            Controlled
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
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
              High-priority outbreak clusters evaluated against epidemiological threshold limits for
              public awareness
            </p>
          </div>

          <div className="text-xs font-semibold text-slate-500">
            Showing Top <strong className="text-slate-900">{Math.min(10, prioritizedTriageList.length)}</strong> Priority Clusters
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
                  <th className="py-3 px-3">Disease</th>
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
                      key={`${item.location_name || 'loc'}-${item.disease || 'dis'}-${idx}`}
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
                        <span className="font-semibold text-slate-800">{item.disease}</span>
                      </td>
                      <td className="py-3 px-3 text-right font-black text-[#0060A9]">
                        {formatNumber(item.cases, numLocale)}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-red-600">
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
          7. SURVEILLANCE RELIABILITY & INTELLIGENCE AUDIT (3 Cards)
          ───────────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Dual-Pillar Balance */}
        <article
          className="border border-[#cfe0f1] bg-white p-5 shadow-[0_6px_18px_rgba(0,96,169,.06)] space-y-3"
          style={{ borderRadius: '17px 17px 22px 17px' }}
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-1.5 text-xs font-black text-slate-800 uppercase tracking-wider">
              <Radio className="h-4 w-4 text-[#0060A9]" />
              Dual-Pillar Surveillance Balance
            </div>
            <span className="text-[10px] text-slate-400 font-mono font-bold">CHANNEL RATIO</span>
          </div>
          <p className="text-xs text-slate-600">
            Synergy between official routine facility reporting (IBS - SKDR) and open-source media
            signal intelligence (EBS).
          </p>
          <div className="space-y-1.5 pt-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Event-Based Surveillance (EBS):</span>
              <strong className="text-slate-800">
                {formatNumber(crawlingStats?.total_processed ?? crawlingStats?.total ?? 0, numLocale)} signals
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Indicator-Based Surveillance (IBS):</span>
              <strong className="text-slate-800">Official SKDR API Synced</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Active Ingestion Feeds:</span>
              <strong className="text-emerald-600">
                {crawlingStats?.enabled_sources ?? 0} Outlets & RSS Feeds
              </strong>
            </div>
          </div>
        </article>

        {/* Verification & Medical Harmonization */}
        <article
          className="border border-[#cfe0f1] bg-white p-5 shadow-[0_6px_18px_rgba(0,96,169,.06)] space-y-3"
          style={{ borderRadius: '17px 17px 22px 17px' }}
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-1.5 text-xs font-black text-slate-800 uppercase tracking-wider">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Medical Taxonomy & Integrity
            </div>
            <span className="text-[10px] text-slate-400 font-mono font-bold">DATA QUALITY</span>
          </div>
          <p className="text-xs text-slate-600">
            Local disease aliases and news reports mapped to canonical concepts without artificial
            inflation of case counts.
          </p>
          <div className="space-y-1.5 pt-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Classification Standard:</span>
              <strong className="text-slate-800">ASEAN Master Catalog</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">NLP Validation:</span>
              <strong className="text-[#0060A9]">Zero-Shot & Rule Guardrails</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Snapshot Status:</span>
              <strong className="text-emerald-600">
                {data?.kpis?.snapshot_stale ? 'Refresh Pending' : 'Synchronized & Verified'}
              </strong>
            </div>
          </div>
        </article>

        {/* Continuous Surveillance Operations */}
        <article
          className="border border-[#cfe0f1] bg-white p-5 shadow-[0_6px_18px_rgba(0,96,169,.06)] space-y-3 flex flex-col justify-between"
          style={{ borderRadius: '17px 17px 22px 17px' }}
        >
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-1.5 text-xs font-black text-slate-800 uppercase tracking-wider">
                <CheckCircle2 className="h-4 w-4 text-[#0060A9]" />
                Surveillance Operations
              </div>
              <span className="text-[10px] text-slate-400 font-mono font-bold">PIPELINE</span>
            </div>
            <p className="text-xs text-slate-600 mt-2">
              Multi-source intelligence engine continuously collecting, validating, and triaging regional epidemiological alerts.
            </p>
          </div>

          <div className="pt-3 border-t border-slate-100 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Pipeline Status:</span>
              <strong className="text-emerald-600">Active & Automated</strong>
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
