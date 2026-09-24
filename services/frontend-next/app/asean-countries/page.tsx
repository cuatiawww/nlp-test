'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Copy,
  Eye,
  Flame,
  Globe2,
  MapPin,
  Printer,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Skull,
  Sparkles,
  Stethoscope,
  TrendingDown,
  TrendingUp,
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
import RegionalDetailPreview from '@/components/incident/RegionalDetailPreview'
import { getCurrentEpiWeek } from '@/lib/epi-week'
import {
  ASEAN11_DISPLAY,
  ASEAN11_COUNTRY_NAMES,
  aseanDisplayName,
  isAseanCountryName,
  scopeDashboardLocations,
} from '@/lib/asean-scope'
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
      <div className="flex h-full min-h-[500px] w-full items-center justify-center rounded-xl bg-slate-50 text-xs text-slate-400">
        Loading ASEAN Spatial GIS Engine...
      </div>
    ),
  }
)

function formatNumber(num?: number | null, locale = 'en-US'): string {
  if (num === undefined || num === null || Number.isNaN(num)) return '0'
  return num.toLocaleString(locale)
}

function formatPercent(num?: number | null): string {
  if (num === undefined || num === null || Number.isNaN(num)) return '0.00%'
  return `${num.toFixed(2)}%`
}

export default function AseanCountriesPage() {
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

  // Filter Parameters (ALL = All 11 ASEAN Member States, or individual country name)
  const [selectedCountry, setSelectedCountry] = useState<string>('ALL')
  const [selectedYear, setSelectedYear] = useState<number>(2026)
  const [searchFilter, setSearchFilter] = useState<string>('')
  const [diseaseFilter, setDiseaseFilter] = useState<string>('ALL')
  const currentEpi = useMemo(() => getCurrentEpiWeek(), [])

  // Modal State for Evidence / Event Review
  const [selectedEvent, setSelectedEvent] = useState<OutbreakLocation | null>(null)

  // Handle country filter change with URL search param sync
  const handleCountryChange = useCallback((nextCountry: string) => {
    setSelectedCountry(nextCountry)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (nextCountry && nextCountry !== 'ALL') {
        url.searchParams.set('country', nextCountry)
      } else {
        url.searchParams.delete('country')
      }
      window.history.replaceState(null, '', url.toString())
    }
  }, [])

  // Ensure mounted is set after client-side hydration & read initial query param
  useEffect(() => {
    setMounted(true)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const qCountry = params.get('country')
      if (qCountry && isAseanCountryName(qCountry)) {
        setSelectedCountry(qCountry)
      }
    }
  }, [])

  // Load ASEAN Surveillance Data
  const loadAseanData = useCallback(async (isSilent = false) => {
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
      console.error('ASEAN dashboard fetch error:', err)
      setError(err?.message || 'Failed to refresh ASEAN surveillance data')
      toast.error('Failed to refresh ASEAN surveillance data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [selectedCountry, selectedYear])

  // Initial Load and Filter Changes
  useEffect(() => {
    loadAseanData(false)
  }, [loadAseanData])

  // Periodic Auto-refresh every 60 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      loadAseanData(true)
    }, 60000)
    return () => clearInterval(timer)
  }, [loadAseanData])

  // Locations strictly scoped to ASEAN
  const scopedLocations = useMemo(() => {
    if (!data?.locations) return []
    return scopeDashboardLocations(data.locations, selectedCountry === 'ALL' ? 'ASEAN' : selectedCountry)
  }, [data?.locations, selectedCountry])

  // Alerts strictly scoped to ASEAN
  const scopedAlerts = useMemo(() => {
    if (!data?.alerts) return []
    return scopeDashboardLocations(data.alerts, selectedCountry === 'ALL' ? 'ASEAN' : selectedCountry)
  }, [data?.alerts, selectedCountry])

  // Macro Statistics calculation
  const macroStats = useMemo(() => {
    const cases = data?.kpis?.cases || 0
    const deaths = data?.kpis?.deaths || 0
    const cfr = cases > 0 ? (deaths / cases) * 100 : 0
    const alertsCount = scopedAlerts.length

    const awasCount = scopedAlerts.filter((a) => a.severity === 'AWAS').length
    const siagaCount = scopedAlerts.filter((a) => a.severity === 'SIAGA').length

    // Active jurisdictions count (ASEAN countries with > 0 cases or events)
    const countriesWithCases = new Set<string>()
    ;(data?.by_country || []).forEach((c) => {
      if (isAseanCountryName(c.name) && c.cases > 0) {
        countriesWithCases.add(c.name.toLowerCase())
      }
    })
    scopedLocations.forEach((loc) => {
      if (loc.country && isAseanCountryName(loc.country)) {
        countriesWithCases.add(loc.country.toLowerCase())
      }
    })

    // Highest burden country among ASEAN
    const aseanCountryList = (data?.by_country || []).filter((c) => isAseanCountryName(c.name))
    const highestCountry = aseanCountryList.length > 0
      ? aseanCountryList.reduce((max, c) => (c.cases > max.cases ? c : max), aseanCountryList[0])
      : null

    const highestCountryShare = (cases > 0 && highestCountry)
      ? (highestCountry.cases / cases) * 100
      : 0

    // Month-over-Month calculation
    const currentMonthCases = data?.trends?.cases?.current || cases
    const prevMonthCases = data?.trends?.cases?.previous || 0
    let momGrowth = 0
    if (prevMonthCases > 0) {
      momGrowth = ((currentMonthCases - prevMonthCases) / prevMonthCases) * 100
    }

    return {
      cases,
      deaths,
      cfr,
      alertsCount,
      awasCount,
      siagaCount,
      activeCountriesCount: countriesWithCases.size,
      highestCountry: highestCountry ? aseanDisplayName(highestCountry.name) : 'None',
      highestCountryCases: highestCountry?.cases || 0,
      highestCountryShare,
      currentMonthCases,
      momGrowth,
    }
  }, [data, scopedAlerts, scopedLocations])

  // Detailed breakdown for each of the 11 ASEAN Member States
  const asean11Cards = useMemo(() => {
    const rawCountryMap = new Map<string, { cases: number; deaths: number }>()
    ;(data?.by_country || []).forEach((item) => {
      if (isAseanCountryName(item.name)) {
        const canonical = item.name.toLowerCase()
        rawCountryMap.set(canonical, {
          cases: item.cases || 0,
          deaths: item.deaths || 0,
        })
      }
    })

    // Helper to find dominant disease in country
    const countryDiseases = new Map<string, Map<string, number>>()
    scopedLocations.forEach((loc) => {
      if (!loc.country) return
      const c = loc.country.toLowerCase()
      if (!countryDiseases.has(c)) {
        countryDiseases.set(c, new Map())
      }
      const dMap = countryDiseases.get(c)!
      const dName = loc.disease || 'General Infectious'
      dMap.set(dName, (dMap.get(dName) || 0) + (loc.cases || 1))
    })

    return ASEAN11_DISPLAY.map((def) => {
      const canonicalKey = def.value.toLowerCase()
      // find from raw map or alternate matches
      let stats = rawCountryMap.get(canonicalKey)
      if (!stats) {
        for (const [k, v] of rawCountryMap.entries()) {
          if (k.includes(canonicalKey) || canonicalKey.includes(k)) {
            stats = v
            break
          }
        }
      }

      const countryCases = stats?.cases || 0
      const countryDeaths = stats?.deaths || 0
      const cfr = countryCases > 0 ? (countryDeaths / countryCases) * 100 : 0

      // Leading disease
      const dMap = countryDiseases.get(canonicalKey)
      let leadingPathogen = 'None Reported'
      if (dMap && dMap.size > 0) {
        let maxCount = -1
        for (const [d, count] of dMap.entries()) {
          if (count > maxCount) {
            maxCount = count
            leadingPathogen = d
          }
        }
      } else if (countryCases > 0 && data?.by_disease?.[0]?.name) {
        leadingPathogen = data.by_disease[0].name
      }

      // Check alerts for this country
      const hasAwas = scopedAlerts.some(
        (a) => a.country?.toLowerCase() === canonicalKey && a.severity === 'AWAS'
      )
      const hasSiaga = scopedAlerts.some(
        (a) => a.country?.toLowerCase() === canonicalKey && a.severity === 'SIAGA'
      )

      let alertStatus: 'AWAS' | 'SIAGA' | 'WASPADA' | 'NORMAL' = 'NORMAL'
      if (hasAwas) alertStatus = 'AWAS'
      else if (hasSiaga) alertStatus = 'SIAGA'
      else if (countryCases > 500) alertStatus = 'WASPADA'

      const totalAseanCases = macroStats.cases || 1
      const sharePercent = countryCases > 0 ? (countryCases / totalAseanCases) * 100 : 0

      return {
        key: def.value,
        displayName: def.label,
        cases: countryCases,
        deaths: countryDeaths,
        cfr,
        leadingPathogen,
        alertStatus,
        sharePercent,
      }
    }).sort((a, b) => b.cases - a.cases)
  }, [data?.by_country, data?.by_disease, scopedLocations, scopedAlerts, macroStats.cases])

  // Ranked ASEAN Case Share for Right Panel
  const rankedAseanCountries = useMemo(() => {
    return asean11Cards
  }, [asean11Cards])

  // Filtered Events for Triage Table
  const filteredEvents = useMemo(() => {
    return scopedLocations.filter((item) => {
      const matchSearch =
        !searchFilter ||
        (item.location_name || '').toLowerCase().includes(searchFilter.toLowerCase()) ||
        (item.country || '').toLowerCase().includes(searchFilter.toLowerCase()) ||
        (item.disease || '').toLowerCase().includes(searchFilter.toLowerCase())

      const matchDisease =
        diseaseFilter === 'ALL' ||
        (item.disease || '').toLowerCase() === diseaseFilter.toLowerCase()

      return matchSearch && matchDisease
    })
  }, [scopedLocations, searchFilter, diseaseFilter])

  // Available diseases for filter
  const availableDiseases = useMemo(() => {
    const list = new Set<string>()
    scopedLocations.forEach((loc) => {
      if (loc.disease) list.add(loc.disease)
    })
    return Array.from(list).sort()
  }, [scopedLocations])

  // Copy Structured Briefing to Clipboard
  const handleCopyBriefing = () => {
    if (!data) return
    const topBurden = rankedAseanCountries.slice(0, 5)
    const text = `ASEAN 11 MEMBER STATES SURVEILLANCE BRIEFING
Generated: ${new Date().toISOString().split('T')[0]} (Epi-Week W${currentEpi.week}, Year ${selectedYear})
Scope: ${selectedCountry === 'ALL' ? 'All 11 ASEAN Member States' : selectedCountry}

MACRO EPIDEMIOLOGICAL TOTALS:
- Cumulative Detected Cases: ${formatNumber(macroStats.cases, numLocale)} (${macroStats.momGrowth >= 0 ? '+' : ''}${macroStats.momGrowth.toFixed(1)}% MoM)
- Reported Deaths: ${formatNumber(macroStats.deaths, numLocale)} (Case Fatality Rate: ${formatPercent(macroStats.cfr)})
- Active Outbreak Jurisdictions: ${macroStats.activeCountriesCount} of 11 Member States
- Leading Burden State: ${macroStats.highestCountry} (${formatNumber(macroStats.highestCountryCases, numLocale)} cases, ${macroStats.highestCountryShare.toFixed(1)}% share)
- Early Warning Outbreak Alerts: ${macroStats.alertsCount} (${macroStats.awasCount} Critical, ${macroStats.siagaCount} High Alert)

TOP 5 BURDEN JURISDICTIONS:
${topBurden.map((c, i) => `${i + 1}. ${c.displayName}: ${formatNumber(c.cases, numLocale)} cases, ${formatNumber(c.deaths, numLocale)} deaths (CFR ${formatPercent(c.cfr)}) — Dominant: ${c.leadingPathogen}`).join('\n')}

AI SITUATIONAL INTELLIGENCE:
${data.ai_summary?.text || 'Aggregated from verified NLP extractions across ASEAN surveillance feeds.'}

Source: ASEAN Regional Health Intelligence System.`

    navigator.clipboard.writeText(text)
    toast.success('ASEAN briefing copied to clipboard')
  }

  // Print Report
  const handlePrint = () => {
    window.print()
  }

  // Prevent client hydration mismatch & render loading spinner until ready
  if (!mounted || (loading && !data)) {
    return (
      <div className="flex min-h-[460px] w-full flex-col items-center justify-center p-12 text-sm text-slate-500">
        <RefreshCw className="mb-3 h-8 w-8 animate-spin text-[#0060A9]" />
        <p className="font-bold text-slate-700">Loading ASEAN Surveillance Intelligence...</p>
        <p className="mt-1 text-xs text-slate-400">Aggregating cross-border disease surveillance for the 11 member states...</p>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6 bg-[#f8fafc] px-4 py-6 sm:px-6 lg:px-8">
      {/* ─────────────────────────────────────────────────────────────
          1. HEADER SECTION (Unified Executive Styling)
          ───────────────────────────────────────────────────────────── */}
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#0060A9] border border-blue-200/70">
              <Globe2 className="h-3 w-3" />
              ASEAN 11 SURVEILLANCE • REGIONAL PLATFORM • EPI-WEEK W{currentEpi.week}
            </span>
          </div>
          <h1 className="text-2xl font-black uppercase tracking-wide text-slate-900">
            ASEAN Countries Dashboard
          </h1>
          <p className="mt-0.5 text-sm text-slate-600">
            Epidemiological Surveillance, Comparative Disease Burden & Cross-Border Threat Monitoring across the 11 ASEAN Jurisdictions
          </p>
        </div>

        {/* Action Controls & Filters */}
        <div className="flex flex-wrap items-center gap-2.5 print:hidden">
          {/* Member State Selector */}
          <div className="flex items-center rounded-xl border border-[#cfe0f1] bg-white px-3 py-1.5 shadow-xs transition focus-within:border-[#0060A9] focus-within:ring-2 focus-within:ring-blue-100">
            {selectedCountry === 'ALL' ? (
              <Globe2 className="h-4 w-4 text-[#0060A9] mr-2 shrink-0" />
            ) : (
              <span className="mr-2 shrink-0">
                <CountryFlag countryName={selectedCountry} size="xs" />
              </span>
            )}
            <select
              id="select-asean-country"
              value={selectedCountry}
              onChange={(e) => handleCountryChange(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer pr-2"
              title="Filter by ASEAN Member State"
            >
              <option value="ALL">All 11 ASEAN Member States</option>
              {ASEAN11_DISPLAY.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Return to All 11 Member States if filter is active */}
          {selectedCountry !== 'ALL' && (
            <button
              type="button"
              onClick={() => handleCountryChange('ALL')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-[#0060A9] transition hover:bg-blue-100 shadow-2xs"
              title="Return to Regional ASEAN Overview"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>All 11 States</span>
            </button>
          )}

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
            onClick={() => void loadAseanData(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-[#0060A9] transition hover:bg-blue-100 disabled:opacity-50"
            title="Refresh ASEAN Surveillance Data"
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

          {/* Print Report */}
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#004d88] transition"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Print Report</span>
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
          2. DYNAMIC CONTENT: REGIONAL DETAIL VIEW (IF COUNTRY FILTER ACTIVE)
             OR FULL ASEAN MACRO OVERVIEW (IF ALL 11 MEMBER STATES)
          ───────────────────────────────────────────────────────────── */}
      {selectedCountry !== 'ALL' ? (
        <section className="space-y-6">
          <RegionalDetailPreview
            initialCountry={selectedCountry}
            onCountryChange={handleCountryChange}
            onBackToOverview={() => handleCountryChange('ALL')}
            embedded
          />
        </section>
      ) : (
        <>
          {/* ─────────────────────────────────────────────────────────────
              2. ASEAN REGIONAL SITUATIONAL BRIEFING BANNER
              ───────────────────────────────────────────────────────────── */}
          <section
            className="border border-[#0060A9]/20 bg-gradient-to-r from-blue-50/90 via-sky-50/80 to-[#fdfbf5] p-5 shadow-sm"
            style={{ borderRadius: '17px 17px 22px 17px' }}
          >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left: AI Narrative Briefing & Badges */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0060A9] text-white shadow-xs">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-xs font-black uppercase tracking-widest text-[#0060A9]">
                  ASEAN Regional Situational Briefing
                </h2>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                  Intelligence Feed: {data?.ai_summary?.provider || 'Verified NLP Surveillance Engine'}
                </span>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-slate-700 bg-white/70 p-3.5 rounded-xl border border-blue-100 shadow-xs">
              {data?.ai_summary?.text ||
                'Epidemiological surveillance active across Brunei, Cambodia, Indonesia, Lao PDR, Malaysia, Myanmar, Philippines, Singapore, Thailand, Timor-Leste, and Viet Nam. Dual-pillar Event-Based (EBS) and Indicator-Based (IBS) pipelines running continuously.'}
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px] font-bold text-slate-600">
              <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 border border-slate-200 shadow-2xs">
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                11 Member States Synchronized
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 border border-slate-200 shadow-2xs">
                <ShieldCheck className="h-3 w-3 text-[#0060A9]" />
                Local Disease Master
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 border border-slate-200 shadow-2xs">
                <Zap className="h-3 w-3 text-amber-600" />
                Dual-Pillar EBS & IBS Synced
              </span>
            </div>
          </div>

          {/* Right: Regional Health Framework Directives */}
          <div className="lg:col-span-5 bg-white/90 p-4 rounded-xl border border-blue-100 shadow-xs space-y-2">
            <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-[#0060A9]" />
              ASEAN Regional Health Protocol & IHR Coordination
            </h3>
            <ul className="space-y-2 text-[11px] text-slate-600">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-[#0060A9] shrink-0" />
                <span>
                  <strong className="text-slate-800">Border Surveillance:</strong> Synchronized port health screening at international air/sea/land points of entry across ASEAN member states.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                <span>
                  <strong className="text-slate-800">EOC Network:</strong> Automated alert dispatch to ASEAN Emergency Operations Centre Network for any cluster exceeding baseline thresholds.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                <span>
                  <strong className="text-slate-800">Mutual Assistance:</strong> Preparedness stockpile activation under the ASEAN Public Health Emergency Coordination System (APHECS).
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          3. 5 MACRO ASEAN STRATEGIC KPI CARDS
          ───────────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {/* KPI 1: Total ASEAN Cases */}
        <article
          className="relative flex min-h-[128px] items-center gap-3 border border-[#cfe0f1] bg-white px-4 py-3 shadow-[0_6px_18px_rgba(0,96,169,.06)] transition hover:-translate-y-0.5 hover:border-[#0060A9]/40"
          style={{ borderRadius: '17px 17px 22px 17px' }}
        >
          <div className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-blue-50/80 text-[#0060A9]">
            <Activity className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#4f4f4f]">
              Total ASEAN Cases
            </p>
            <p className="mt-1 truncate text-[28px] font-bold leading-none text-[#0060A9]">
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
                ({formatNumber(macroStats.currentMonthCases, numLocale)} this mo.)
              </span>
            </div>
          </div>
        </article>

        {/* KPI 2: Reported Deaths & CFR */}
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
            <p className="mt-1 truncate text-[28px] font-bold leading-none text-[#ED2939]">
              {formatNumber(macroStats.deaths, numLocale)}
            </p>
            <div className="mt-1.5 flex items-center gap-1.5 text-[9px] font-bold leading-tight">
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded font-extrabold ${
                  macroStats.cfr > 2
                    ? 'bg-red-100 text-red-700'
                    : macroStats.cfr > 1
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                CFR: {formatPercent(macroStats.cfr)}
              </span>
              <span className="text-slate-400">Regional Severity</span>
            </div>
          </div>
        </article>

        {/* KPI 3: Active Outbreak Jurisdictions */}
        <article
          className="relative flex min-h-[128px] items-center gap-3 border border-[#cfe0f1] bg-white px-4 py-3 shadow-[0_6px_18px_rgba(0,96,169,.06)] transition hover:-translate-y-0.5 hover:border-emerald-400"
          style={{ borderRadius: '17px 17px 22px 17px' }}
        >
          <div className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <Globe2 className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#4f4f4f]">
              Active Jurisdictions
            </p>
            <p className="mt-1 truncate text-[28px] font-bold leading-none text-emerald-700">
              {macroStats.activeCountriesCount} <span className="text-base font-normal text-slate-400">/ 11</span>
            </p>
            <div className="mt-1.5 text-[9px] font-bold text-slate-500">
              <span>Member States with Active Transmission</span>
            </div>
          </div>
        </article>

        {/* KPI 4: Highest Burden Member State */}
        <article
          className="relative flex min-h-[128px] items-center gap-3 border border-[#cfe0f1] bg-white px-4 py-3 shadow-[0_6px_18px_rgba(0,96,169,.06)] transition hover:-translate-y-0.5 hover:border-purple-400"
          style={{ borderRadius: '17px 17px 22px 17px' }}
        >
          <div className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-purple-50 text-purple-600">
            <MapPin className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#4f4f4f]">
              Highest Burden State
            </p>
            <p className="mt-1 truncate text-[20px] font-bold leading-tight text-purple-900">
              {macroStats.highestCountry}
            </p>
            <div className="mt-1 text-[9px] font-bold text-slate-500">
              <span>
                {formatNumber(macroStats.highestCountryCases, numLocale)} cases ({macroStats.highestCountryShare.toFixed(1)}% share)
              </span>
            </div>
          </div>
        </article>

        {/* KPI 5: Active Early Warning Alerts */}
        <article
          className="relative flex min-h-[128px] items-center gap-3 border border-[#cfe0f1] bg-white px-4 py-3 shadow-[0_6px_18px_rgba(0,96,169,.06)] transition hover:-translate-y-0.5 hover:border-amber-400"
          style={{ borderRadius: '17px 17px 22px 17px' }}
        >
          <div className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-[#fbf8ee] text-[#B49B58]">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#4f4f4f]">
              ASEAN EWS Alerts
            </p>
            <p className="mt-1 truncate text-[28px] font-bold leading-none text-[#B49B58]">
              {formatNumber(macroStats.alertsCount, numLocale)}
            </p>
            <div className="mt-1.5 flex items-center gap-1 text-[9px] font-extrabold leading-tight">
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">
                {macroStats.awasCount} CRITICAL
              </span>
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
                {macroStats.siagaCount} HIGH ALERT
              </span>
            </div>
          </div>
        </article>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          4. ASEAN SPATIAL OUTBREAK MAP & CASE SHARE PANEL
             Ranking on the LEFT (4 cols), Maps on the RIGHT (8 cols, DOMINANT WIDTH)
          ───────────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: ASEAN 11 Member States Case Burden Ranking (4 cols) */}
        <div
          className="lg:col-span-4 border border-[#cfe0f1] bg-white p-5 shadow-[0_6px_18px_rgba(0,96,169,.06)] flex flex-col h-[610px]"
          style={{ borderRadius: '17px 17px 22px 17px' }}
        >
          <div className="flex items-center justify-between mb-3 shrink-0">
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <Globe2 className="h-4 w-4 text-[#0060A9]" />
                ASEAN 11 Burden Share Ranking
              </h2>
              <p className="text-xs text-slate-500">
                Comparative ranking of disease volume and fatality rates
              </p>
            </div>
            <span className="text-[10px] font-bold text-slate-500 bg-blue-50 text-[#0060A9] px-2 py-0.5 rounded border border-blue-100">
              11 States
            </span>
          </div>

          <div className="space-y-2.5 overflow-y-auto flex-1 pr-1">
            {rankedAseanCountries.map((c, idx) => (
              <div
                key={c.key}
                onClick={() => handleCountryChange(c.key)}
                className="p-3 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-blue-50/60 hover:border-[#0060A9]/50 transition cursor-pointer group"
                title={`Click to inspect ${c.displayName} surveillance profile`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 group-hover:bg-[#0060A9] group-hover:text-white text-[10px] font-black text-slate-600 transition">
                      {idx + 1}
                    </span>
                    <CountryFlag countryName={c.key} size="xs" />
                    <span className="text-xs font-bold text-slate-900 group-hover:text-[#0060A9] truncate transition">
                      {c.displayName}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-black text-[#0060A9]">
                      {formatNumber(c.cases, numLocale)}
                    </span>
                    <span className="text-[10px] text-slate-400 ml-1">cases</span>
                  </div>
                </div>

                {/* Progress Bar for Case Share */}
                <div className="mt-2 w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-[#0060A9] h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(c.sharePercent, 1))}%` }}
                  />
                </div>

                <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500 font-medium">
                  <span>
                    Share: <strong className="text-slate-700">{c.sharePercent.toFixed(1)}%</strong>
                  </span>
                  <span>
                    Deaths: <strong className="text-red-600">{formatNumber(c.deaths, numLocale)}</strong> (CFR {formatPercent(c.cfr)})
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                    c.alertStatus === 'AWAS'
                      ? 'bg-red-100 text-red-700'
                      : c.alertStatus === 'SIAGA'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {formatSeverityEn(c.alertStatus)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Spatial Outbreak Map (8 cols - Dominant Width) */}
        <div
          className="lg:col-span-8 border border-[#cfe0f1] bg-white p-5 shadow-[0_6px_18px_rgba(0,96,169,.06)] flex flex-col h-[610px]"
          style={{ borderRadius: '17px 17px 22px 17px' }}
        >
          <div className="flex items-center justify-between mb-3 shrink-0">
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-[#0060A9]" />
                ASEAN 11 Spatial Outbreak GIS Distribution
              </h2>
              <p className="text-xs text-slate-500">
                Geospatial visualization of active disease signals and cross-border clusters across ASEAN
              </p>
            </div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
              {scopedLocations.length} Geocoded Points
            </span>
          </div>

          <div className="relative flex-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-[#eaf4f7] min-h-[500px]">
            <SpatialOutbreakMap
              locations={scopedLocations}
              countries={data?.by_country}
              highlightCountry={undefined}
              regionalMode={true}
              onSelectCountry={(country) => handleCountryChange(country)}
            />
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          5. ASEAN 11 MEMBER STATES SURVEILLANCE GRID (11 Dedicated Cards)
          ───────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
              <Globe2 className="h-5 w-5 text-[#0060A9]" />
              ASEAN 11 Member States Surveillance Grid
            </h2>
            <p className="text-xs text-slate-600">
              Interactive surveillance cards covering all 11 ASEAN jurisdictions. Click a card to inspect regional details.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {asean11Cards.map((c) => {
            return (
              <div
                key={c.key}
                onClick={() => handleCountryChange(c.key)}
                className="p-3.5 border bg-white shadow-xs transition hover:-translate-y-0.5 cursor-pointer flex flex-col justify-between border-[#cfe0f1] hover:border-[#0060A9] hover:shadow-md"
                style={{ borderRadius: '17px 17px 22px 17px' }}
                title={`Click to inspect ${c.displayName} regional surveillance`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <CountryFlag countryName={c.key} size="xs" />
                      <span className="text-xs font-black text-slate-900 truncate">
                        {c.displayName}
                      </span>
                    </div>
                    <span
                      className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                        c.alertStatus === 'AWAS'
                          ? 'bg-red-100 text-red-700'
                          : c.alertStatus === 'SIAGA'
                          ? 'bg-amber-100 text-amber-800'
                          : c.alertStatus === 'WASPADA'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {formatSeverityEn(c.alertStatus)}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[10px] text-slate-500 font-bold uppercase">Cases</span>
                      <span className="text-sm font-black text-[#0060A9]">
                        {formatNumber(c.cases, numLocale)}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[10px] text-slate-500 font-bold uppercase">Deaths</span>
                      <span className="text-xs font-bold text-red-600">
                        {formatNumber(c.deaths, numLocale)}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[10px] text-slate-500 font-bold uppercase">CFR</span>
                      <span className="text-[11px] font-extrabold text-slate-800">
                        {formatPercent(c.cfr)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                    Leading Pathogen:
                  </span>
                  <span className="text-[10px] font-bold text-slate-700 truncate block mt-0.5">
                    {c.leadingPathogen}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          6. ASEAN CROSS-BORDER OUTBREAK TRIAGE TABLE
          ───────────────────────────────────────────────────────────── */}
      <section
        className="border border-[#cfe0f1] bg-white p-5 shadow-[0_6px_18px_rgba(0,96,169,.06)]"
        style={{ borderRadius: '17px 17px 22px 17px' }}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#0060A9]" />
              Cross-Border Outbreak Triage Ledger
            </h2>
            <p className="text-xs text-slate-500">
              Active disease signals, hospital admissions, and laboratory-verified alerts across ASEAN member states
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search jurisdiction or disease..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#0060A9] w-56 text-slate-800"
              />
            </div>

            {/* Disease Filter */}
            <select
              value={diseaseFilter}
              onChange={(e) => setDiseaseFilter(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#0060A9] text-slate-700 font-bold bg-white"
            >
              <option value="ALL">All Monitored Pathogens</option>
              {availableDiseases.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table Container */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">Location / Jurisdiction</th>
                <th className="py-2.5 px-3">Country</th>
                <th className="py-2.5 px-3">Disease / Pathogen</th>
                <th className="py-2.5 px-3 text-right">Cases</th>
                <th className="py-2.5 px-3 text-right">Deaths</th>
                <th className="py-2.5 px-3 text-right">CFR (%)</th>
                <th className="py-2.5 px-3">Source & Feed</th>
                <th className="py-2.5 px-3 text-center">Alert Status</th>
                <th className="py-2.5 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-xs text-slate-400">
                    No active outbreak signals match the selected ASEAN filters.
                  </td>
                </tr>
              ) : (
                filteredEvents.slice(0, 15).map((evt, idx) => {
                  const evtCases = evt.cases || 0
                  const evtDeaths = evt.deaths || 0
                  const evtCfr = evtCases > 0 ? (evtDeaths / evtCases) * 100 : 0
                  const isAwas = evt.severity === 'AWAS'

                  return (
                    <tr key={evt.detail?.event_id || `${evt.location_name}-${idx}`} className="hover:bg-slate-50/70 transition">
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[180px]">
                            {evt.location_name || 'Provincial / Regional Hub'}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-700">
                        <div className="flex items-center gap-1.5">
                          <CountryFlag countryName={evt.country} size="xs" />
                          <span>{aseanDisplayName(evt.country)}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-bold text-[#0060A9]">
                        {evt.disease || 'Undifferentiated Infectious'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-slate-800">
                        {formatNumber(evtCases, numLocale)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-red-600">
                        {formatNumber(evtDeaths, numLocale)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-extrabold text-slate-700">
                        {formatPercent(evtCfr)}
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-slate-500">
                        <span className="truncate max-w-[140px] block">
                          {evt.sources?.[0]?.source_name || 'Ministry of Health Bulletin'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                            isAwas
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {formatSeverityEn(evt.severity || (isAwas ? 'AWAS' : 'SIAGA'))}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedEvent(evt)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-700 hover:bg-slate-100 shadow-2xs transition"
                          title="View Surveillance Evidence"
                        >
                          <Eye className="h-3 w-3 text-[#0060A9]" />
                          Inspect
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          7. 3 BOTTOM OPERATIONAL FRAMEWORK CARDS
          ───────────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: APHDA */}
        <article
          className="border border-[#cfe0f1] bg-white p-4 shadow-[0_6px_18px_rgba(0,96,169,.06)] space-y-2"
          style={{ borderRadius: '17px 17px 22px 17px' }}
        >
          <div className="flex items-center gap-2 text-[#0060A9]">
            <ShieldCheck className="h-5 w-5" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
              APHDA Post-2015 Health Agenda
            </h3>
          </div>
          <p className="text-xs leading-relaxed text-slate-600">
            Aligned with ASEAN Health Cluster 2 (Responding to All Hazards and Emerging Threats). Strengthens regional laboratory capacities, early detection, and mutual notification protocols.
          </p>
          <div className="pt-1 text-[10px] font-bold text-[#0060A9] flex items-center gap-1">
            <span>Cluster 2 Framework Active</span>
            <ChevronRight className="h-3 w-3" />
          </div>
        </article>

        {/* Card 2: Port Health & Cross-Border Quarantine */}
        <article
          className="border border-[#cfe0f1] bg-white p-4 shadow-[0_6px_18px_rgba(0,96,169,.06)] space-y-2"
          style={{ borderRadius: '17px 17px 22px 17px' }}
        >
          <div className="flex items-center gap-2 text-emerald-600">
            <Radio className="h-5 w-5" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
              Cross-Border Port Health Protocols
            </h3>
          </div>
          <p className="text-xs leading-relaxed text-slate-600">
            Active surveillance across 142 designated Points of Entry (PoE) in Southeast Asia. Harmonized passenger declaration screening, thermal monitors, and transit quarantine lanes.
          </p>
          <div className="pt-1 text-[10px] font-bold text-emerald-600 flex items-center gap-1">
            <span>PoE Surveillance Synchronized</span>
            <ChevronRight className="h-3 w-3" />
          </div>
        </article>

        {/* Card 3: Multi-Lingual ASEAN NLP Pipeline */}
        <article
          className="border border-[#cfe0f1] bg-white p-4 shadow-[0_6px_18px_rgba(0,96,169,.06)] space-y-2"
          style={{ borderRadius: '17px 17px 22px 17px' }}
        >
          <div className="flex items-center gap-2 text-purple-600">
            <Sparkles className="h-5 w-5" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
              Multi-Lingual ASEAN NLP Engine
            </h3>
          </div>
          <p className="text-xs leading-relaxed text-slate-600">
            Real-time entity extraction from Indonesian, Malay, Vietnamese, Thai, Tagalog, and English public health bulletins, scientific preprints, and hospital surveillance dispatches.
          </p>
          <div className="pt-1 text-[10px] font-bold text-purple-600 flex items-center gap-1">
            <span>6 Languages Continuous Ingestion</span>
            <ChevronRight className="h-3 w-3" />
          </div>
        </article>
      </section>
      </>
    )}

      {/* ─────────────────────────────────────────────────────────────
          8. SURVEILLANCE DETAIL MODAL (Evidence & Raw Source Review)
          ───────────────────────────────────────────────────────────── */}
      {selectedEvent && (
        <SurveillanceDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          translateDisease={translateDisease}
        />
      )}
    </div>
  )
}
