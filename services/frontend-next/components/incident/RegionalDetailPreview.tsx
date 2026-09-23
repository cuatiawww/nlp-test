'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Activity,
  AirVent,
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CloudRain,
  MapPin,
  Thermometer,
  Wind,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import {
  fetchKpiEvents,
  fetchKpiSnapshot,
  fetchPublicDashboard,
  fetchRegionContext,
  fetchSpatialHeatmap,
  type HeatmapCountryData,
  type KpiEventRow,
  type RegionContext,
} from '@/lib/api'
import { ASEAN11_DISPLAY, aseanDisplayName, aseanStorageName, isAseanCountryName } from '@/lib/asean-scope'
import CountryFlag from '@/components/CountryFlag'
import type { OutbreakLocation, PublicDashboard } from '@/types'

const SpatialOutbreakMap = dynamic(() => import('@/components/SpatialOutbreakMap'), { ssr: false })

type DiseaseTrend = { name: string; cases: number; deaths: number; events: number; weekly: number[] }
type SeriesKey = 'cases' | 'events' | 'deaths' | 'cumulative'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const SERIES_META: Array<{ key: SeriesKey; label: string; style: string; stroke: string }> = [
  { key: 'cases', label: 'Reported Cases', style: 'bg-orange-50 text-orange-700 border-orange-300', stroke: '#f97316' },
  { key: 'events', label: 'Reported Events', style: 'bg-teal-50 text-teal-800 border-teal-300', stroke: '#047d78' },
  { key: 'deaths', label: 'Deaths', style: 'bg-rose-50 text-rose-700 border-rose-300', stroke: '#e11d48' },
  { key: 'cumulative', label: 'Cumulative Total', style: 'bg-slate-800 text-white border-slate-900', stroke: '#1e293b' },
]

const DISEASE_TONES = [
  'border-rose-200 bg-rose-50/60 text-rose-800',
  'border-orange-200 bg-orange-50/60 text-orange-800',
  'border-amber-200 bg-amber-50/60 text-amber-800',
  'border-teal-200 bg-teal-50/60 text-teal-800',
]

function formatNumber(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return new Intl.NumberFormat('en-US').format(Math.max(0, Number(value)))
}

function formatMaybe(value?: number | null, suffix = '', digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return `${Number(value).toFixed(digits)}${suffix}`
}

function formatCfr(cases: number, deaths: number) {
  if (!cases) return '—'
  return `${((deaths / cases) * 100).toFixed(2)}%`
}

function formatRelative(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const hours = Math.round((Date.now() - date.getTime()) / 3_600_000)
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
}

function hasDashboardData(snapshot: PublicDashboard) {
  return snapshot.kpis.cases > 0 || snapshot.kpis.deaths > 0 || snapshot.kpis.events > 0 || snapshot.by_disease.length > 0
}

function intensityClass(value: number) {
  if (value >= 7) return 'bg-[#063b5b] text-white'
  if (value >= 5) return 'bg-blue-600 text-white'
  if (value >= 3) return 'bg-sky-300 text-sky-950'
  if (value > 0) return 'bg-sky-50 text-sky-800'
  return 'bg-slate-50 text-slate-300'
}

function scaleIntensity(value: number, max: number) {
  if (!value || !max) return 0
  return Math.max(1, Math.round((value / max) * 8))
}

function bucketSeries(weekly: number[], columns: number) {
  if (!columns) return []
  if (!weekly.length) return Array.from({ length: columns }, () => 0)
  if (weekly.length === columns) return weekly
  return Array.from({ length: columns }, (_, index) => {
    const start = Math.floor((index * weekly.length) / columns)
    const end = Math.max(start + 1, Math.floor(((index + 1) * weekly.length) / columns))
    return weekly.slice(start, end).reduce((sum, item) => sum + item, 0)
  })
}

function aqiTone(aqi?: number | null) {
  if (aqi == null) return 'border-slate-200 bg-slate-50 text-slate-700'
  if (aqi <= 50) return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (aqi <= 100) return 'border-amber-200 bg-amber-50 text-amber-800'
  return 'border-rose-200 bg-rose-50 text-rose-800'
}

function diseaseStatus(cases: number, leadCases: number) {
  if (!cases) return 'No signal'
  if (!leadCases) return 'Monitoring'
  const ratio = cases / leadCases
  if (ratio >= 0.5) return 'High activity'
  if (ratio >= 0.15) return 'Elevated'
  return 'Monitoring'
}

function monthLabel(month: { month_num?: number; month_name?: string }) {
  const named = (month.month_name || '').trim()
  if (/[A-Za-z]/.test(named)) return named.slice(0, 3)
  const index = Number(month.month_num || named) - 1
  return MONTH_LABELS[index] || named || '—'
}

function MetricCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return (
    <div className={`rounded-xl border p-3.5 ${tone}`}>
      <span className="block text-xs font-bold uppercase tracking-wider">{label}</span>
      <span className="mt-1 block text-xl font-black sm:text-2xl">{value}</span>
      <span className="text-xs font-bold opacity-80">{detail}</span>
    </div>
  )
}

export interface RegionalDetailPreviewProps {
  initialCountry?: string
  onCountryChange?: (country: string) => void
  onBackToOverview?: () => void
  embedded?: boolean
}

export default function RegionalDetailPreview({
  initialCountry,
  onCountryChange,
  onBackToOverview,
  embedded = false,
}: RegionalDetailPreviewProps = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fallbackCountry = searchParams?.get('country') || 'Indonesia'
  const [currentCountry, setCurrentCountry] = useState<string>(initialCountry || fallbackCountry)

  useEffect(() => {
    if (initialCountry && initialCountry !== currentCountry) {
      setCurrentCountry(initialCountry)
    }
  }, [initialCountry, currentCountry])

  const storageCountry = aseanStorageName(currentCountry)
  const displayCountry = storageCountry ? aseanDisplayName(storageCountry) : currentCountry
  const countryValid = Boolean(storageCountry)

  const [snapshot, setSnapshot] = useState<PublicDashboard | null>(null)
  const [heatmap, setHeatmap] = useState<HeatmapCountryData | null>(null)
  const [diseaseTrends, setDiseaseTrends] = useState<DiseaseTrend[]>([])
  const [news, setNews] = useState<KpiEventRow[]>([])
  const [context, setContext] = useState<RegionContext | null>(null)
  const [year, setYear] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [visibleSeries, setVisibleSeries] = useState<Record<SeriesKey, boolean>>({
    cases: true,
    events: true,
    deaths: true,
    cumulative: true,
  })
  const [seasonalMode, setSeasonalMode] = useState<'table' | 'chart'>('chart')
  const seasonalRef = useRef<HTMLElement | null>(null)

  const loadRegion = useCallback(async (requestedYear?: number) => {
    if (!storageCountry) {
      setSnapshot(null)
      setHeatmap(null)
      setDiseaseTrends([])
      setNews([])
      setContext(null)
      setError('This page covers the 11 ASEAN jurisdictions. Select an ASEAN country.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      let base = await fetchPublicDashboard({ country: storageCountry, ...(requestedYear ? { year: requestedYear } : {}) })
      const availableYears = base.available_years || []
      const selectedYear = requestedYear || Number(base.filters?.year) || availableYears[0]
      if (!requestedYear && selectedYear && Number(base.filters?.year) !== selectedYear && !hasDashboardData(base)) {
        base = await fetchPublicDashboard({ country: storageCountry, year: selectedYear })
      }
      const kpi = await fetchKpiSnapshot({ country: storageCountry, year: Number(base.filters?.year) || selectedYear }).catch(() => null)
      if (kpi?.kpis) base.kpis = { ...base.kpis, ...kpi.kpis }
      const effectiveYear = Number(base.filters?.year) || selectedYear || new Date().getFullYear()
      setSnapshot(base)
      setYear(effectiveYear)
      const diseaseRows = (base.by_disease || []).filter((item) => item.name).slice(0, 7)
      const [heatmapResult, trendsResult, newsResult, contextResult] = await Promise.allSettled([
        fetchSpatialHeatmap({ country: storageCountry, year: effectiveYear }),
        Promise.all(diseaseRows.map(async (item) => {
          const detail = await fetchPublicDashboard({ country: storageCountry, year: effectiveYear, disease: item.name })
          return {
            name: item.name,
            cases: detail.kpis.cases,
            deaths: detail.kpis.deaths,
            events: detail.kpis.events,
            weekly: (detail.weekly_trend || []).map((point) => point.cases),
          } satisfies DiseaseTrend
        })),
        fetchKpiEvents({ country: storageCountry, year: effectiveYear, page: 1, per_page: 8 }),
        fetchRegionContext(storageCountry),
      ])
      if (heatmapResult.status === 'fulfilled') {
        const match = heatmapResult.value.countries.find((item) => item.country.toLowerCase() === storageCountry.toLowerCase())
        setHeatmap(match || heatmapResult.value.countries[0] || null)
      } else {
        setHeatmap(null)
      }
      setDiseaseTrends(trendsResult.status === 'fulfilled' ? trendsResult.value : [])
      setNews(newsResult.status === 'fulfilled' ? newsResult.value.data || [] : [])
      setContext(contextResult.status === 'fulfilled' ? contextResult.value : null)
    } catch (loadError) {
      console.error('[RegionalDetailPreview]', loadError)
      setSnapshot(null)
      setHeatmap(null)
      setDiseaseTrends([])
      setNews([])
      setContext(null)
      setError('Regional surveillance data could not be loaded from the API.')
    } finally {
      setLoading(false)
    }
  }, [storageCountry])

  useEffect(() => {
    void loadRegion()
  }, [loadRegion])

  const switchCountry = (next: string) => {
    if (next === 'ALL') {
      if (onBackToOverview) {
        onBackToOverview()
        return
      }
      router.replace('/asean-countries')
      return
    }
    setCurrentCountry(next)
    if (onCountryChange) {
      onCountryChange(next)
    } else {
      router.replace(`/detail-region?country=${encodeURIComponent(next)}`)
    }
  }

  const diseaseRows = snapshot?.by_disease || []
  const topDisease = diseaseRows[0]
  const leadCases = Math.max(...diseaseRows.map((item) => item.cases), 0)
  const availableYears = snapshot?.available_years || []
  const weatherOk = context?.weather?.status === 'ok'
  const airOk = context?.air_quality?.status === 'ok'
  const climateOk = context?.climate?.status === 'ok'
  const aqiValue = airOk ? context?.air_quality?.current?.european_aqi ?? null : null
  const pm25 = airOk ? context?.air_quality?.current?.pm2_5 ?? null : null
  const liveTemp = weatherOk ? context?.weather?.current?.temperature_c : null
  const livePrecip = weatherOk ? (context?.weather?.precip_today_mm ?? context?.weather?.current?.precipitation_mm) : null
  const temperature = liveTemp != null ? liveTemp : (climateOk ? context?.climate?.averages?.t2m_c ?? null : null)
  const precip = livePrecip != null ? livePrecip : (climateOk ? context?.climate?.averages?.precip_mm ?? null : null)

  const environmentalMetrics: Array<{ label: string; value: string; detail: string; icon: LucideIcon; tone: string }> = [
    {
      label: 'Rainfall / precipitation',
      value: formatMaybe(precip, ' mm'),
      detail: livePrecip != null ? 'Open-Meteo daily sum' : (climateOk ? 'NASA POWER 7-day mean' : (context?.weather?.error || 'Open-Meteo unavailable')),
      icon: CloudRain,
      tone: 'border-cyan-200 bg-cyan-50 text-cyan-800',
    },
    {
      label: 'AQI / air quality',
      value: aqiValue == null ? '—' : String(aqiValue),
      detail: airOk ? (context?.air_quality?.current?.aqi_label || 'Open-Meteo CAMS') : (context?.air_quality?.error || 'Open-Meteo AQ unavailable'),
      icon: AirVent,
      tone: aqiTone(aqiValue),
    },
    {
      label: 'PM2.5',
      value: formatMaybe(pm25, ' µg/m³'),
      detail: airOk ? '24-hour CAMS average' : (context?.air_quality?.error || 'Open-Meteo AQ unavailable'),
      icon: Wind,
      tone: 'border-violet-200 bg-violet-50 text-violet-800',
    },
    {
      label: 'Temperature',
      value: formatMaybe(temperature, ' °C'),
      detail: liveTemp != null ? `${context?.capital?.name || displayCountry} · Open-Meteo` : (climateOk ? 'NASA POWER 7-day mean' : (context?.weather?.error || 'Open-Meteo unavailable')),
      icon: Thermometer,
      tone: 'border-orange-200 bg-orange-50 text-orange-800',
    },
  ]

  const periodLabel = useMemo(() => {
    if (heatmap?.months?.length && year) {
      const first = monthLabel(heatmap.months[0])
      const last = monthLabel(heatmap.months.at(-1) || {})
      if (first && last) return `${first}–${last} ${year}`
    }
    return year ? String(year) : '—'
  }, [heatmap, year])

  const trendData = useMemo(() => {
    if (heatmap?.months?.length) {
      let running = 0
      return heatmap.months.map((month) => {
        running += month.cases
        return {
          month: `${monthLabel(month)}${year ? ` ${year}` : ''}`,
          cases: month.cases,
          events: month.events,
          deaths: month.deaths,
          cumulative: running,
        }
      })
    }
    const weekly = snapshot?.weekly_trend || []
    if (!weekly.length) return []
    let running = 0
    return weekly.map((point) => {
      running += point.cases
      return {
        month: point.period || `W${point.week}`,
        cases: point.cases,
        events: point.events,
        deaths: point.deaths,
        cumulative: running,
      }
    })
  }, [heatmap, snapshot, year])

  const latestTrend = trendData.at(-1)
  const seasonalColumns = trendData.length || 9
  const seasonalGrid = useMemo(() => {
    const maxWeekly = Math.max(
      ...diseaseTrends.flatMap((item) => bucketSeries(item.weekly, seasonalColumns)),
      0,
    )
    return diseaseTrends.map((item) => ({
      name: item.name,
      values: bucketSeries(item.weekly, seasonalColumns).map((value) => scaleIntensity(value, maxWeekly)),
      raw: bucketSeries(item.weekly, seasonalColumns),
    }))
  }, [diseaseTrends, seasonalColumns])

  const highestSeasonal = useMemo(() => {
    let peak = { name: '', column: '', value: 0 }
    seasonalGrid.forEach((row) => {
      row.raw.forEach((value, index) => {
        if (value > peak.value) {
          peak = { name: row.name, column: trendData[index]?.month || String(index + 1), value }
        }
      })
    })
    return peak.value > 0 ? peak : null
  }, [seasonalGrid, trendData])

  const mapLocations = useMemo(
    () => (snapshot?.locations || []).filter((item) => isAseanCountryName(item.country) && item.country?.toLowerCase() === (storageCountry || '').toLowerCase()),
    [snapshot, storageCountry],
  )
  const mapCountries = useMemo(
    () => (snapshot?.by_country || []).filter((row) => row.name.toLowerCase() === (storageCountry || '').toLowerCase()),
    [snapshot, storageCountry],
  )
  const hazards = context?.hazards || []
  const tickerNews = news.length > 0 ? [...news, ...news] : []
  const insightDisease = topDisease?.name || '—'
  const insightCases = topDisease ? formatNumber(topDisease.cases) : '—'
  const seasonalGridStyle = { gridTemplateColumns: `175px repeat(${Math.max(seasonalColumns, 1)}, minmax(55px, 1fr))` }

  const contextCopy = snapshot?.ai_summary?.text
    || (topDisease
      ? `The ${displayCountry} profile uses the ASEAN KPI snapshot for ${year || 'the selected year'}. ${topDisease.name} currently accounts for the largest share of tracked cases. Weather, AQI, and precipitation are live capital reads; a missing provider is shown as — rather than a placeholder.`
      : `No disease observations are in the ASEAN KPI snapshot for ${displayCountry}${year ? ` in ${year}` : ''}. Environmental values still come from Open-Meteo and NASA POWER when those providers respond.`)

  const content = (
    <div className={embedded ? "w-full space-y-6" : "mx-auto w-full max-w-none space-y-6"}>
      <header className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-20 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <CountryFlag
                countryName={storageCountry || displayCountry}
                shape="rounded"
                size={80}
                className="!border-0 !shadow-none !ring-0"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0060A9]">Regional surveillance profile</p>
                {embedded && (
                  <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#0060A9] border border-blue-200">
                    Jurisdiction Filter Active
                  </span>
                )}
              </div>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{displayCountry}</h1>
              <p className="mt-1 text-sm font-medium text-slate-500">Disease indicators, environmental context, and mapped surveillance signals.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
            {onBackToOverview && (
              <button
                type="button"
                onClick={onBackToOverview}
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-bold text-[#0060A9] transition hover:bg-blue-100 shadow-2xs cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back to ASEAN Overview</span>
              </button>
            )}
            <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <MapPin className="h-4 w-4 text-[#0060A9]" />
              <select
                value={storageCountry || ''}
                onChange={(event) => switchCountry(event.target.value)}
                className="bg-transparent font-bold outline-none cursor-pointer"
              >
                {embedded && <option value="ALL">← All 11 ASEAN Countries</option>}
                {!storageCountry && <option value="">Select country</option>}
                {ASEAN11_DISPLAY.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            {availableYears.length > 0 ? (
              <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <CalendarDays className="h-4 w-4 text-[#0060A9]" />
                <select
                  value={year || ''}
                  onChange={(event) => void loadRegion(Number(event.target.value))}
                  className="bg-transparent font-bold outline-none cursor-pointer"
                >
                  {availableYears.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <CalendarDays className="h-4 w-4 text-[#0060A9]" /> {periodLabel}
              </span>
            )}
          </div>
        </div>
      </header>

        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-bold">Data unavailable</p>
              <p className="mt-1 text-xs">{error} This page does not substitute example or static values.</p>
            </div>
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex flex-col gap-2 border-b border-slate-100 pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#0060A9]">Regional context</p>
              <h2 className="mt-1 text-xl font-black">Regional Characteristics</h2>
              <p className="mt-1 max-w-3xl text-sm font-medium leading-relaxed text-slate-500">A contextual view of why particular diseases may be observed in this region, supported by environmental and population indicators.</p>
            </div>
          </div>
          <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-5">
              <div className="flex items-center gap-2 text-sm font-black text-[#0060A9]"><Activity className="h-4 w-4" /> Why these signals may occur</div>
              <p className="mt-3 text-sm font-medium leading-6 text-slate-700">{loading && !snapshot ? 'Loading regional snapshot…' : contextCopy}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <MetricCard label="Top cases" value={topDisease ? formatNumber(topDisease.cases) : '—'} detail={topDisease?.name || 'No leading disease'} tone="border-blue-200 bg-white/85 text-[#0060A9]" />
                <MetricCard label="Deaths" value={snapshot ? formatNumber(snapshot.kpis.deaths) : '—'} detail="Tracked diseases" tone="border-rose-200 bg-white/85 text-rose-800" />
                <MetricCard label="CFR" value={snapshot ? formatCfr(snapshot.kpis.cases, snapshot.kpis.deaths) : '—'} detail="Current profile" tone="border-violet-200 bg-white/85 text-violet-800" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {environmentalMetrics.map(({ label, value, detail, icon: MetricIcon, tone }) => (
                <div key={label} className={`rounded-xl border p-4 ${tone}`}>
                  <MetricIcon className="h-5 w-5" />
                  <p className="mt-3 text-[10px] font-black uppercase tracking-wider">{label}</p>
                  <p className="mt-1 text-2xl font-black text-slate-900">{loading && !context ? '—' : value}</p>
                  <p className="mt-1 text-xs font-semibold opacity-75">{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="border-b border-slate-100 pb-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#0060A9]">Disease intelligence</p>
            <h2 className="mt-1 text-xl font-black">Tracked Disease Profiles</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">Current case, death, and case fatality indicators for diseases observed in this region.</p>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {diseaseRows.slice(0, 4).map((disease, index) => (
              <article key={disease.name} className={`rounded-xl border p-4 ${DISEASE_TONES[index] || DISEASE_TONES[3]}`}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-black leading-5 text-slate-900">{disease.name}</h3>
                  <span className="shrink-0 rounded-full bg-white/80 px-2 py-1 text-[10px] font-black">{diseaseStatus(disease.cases, leadCases)}</span>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">Cases</p>
                    <p className="mt-1 text-lg font-black text-slate-900">{formatNumber(disease.cases)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">Deaths</p>
                    <p className="mt-1 text-lg font-black text-slate-900">{formatNumber(disease.deaths)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">CFR</p>
                    <p className="mt-1 text-lg font-black text-slate-900">{formatCfr(disease.cases, disease.deaths)}</p>
                  </div>
                </div>
              </article>
            ))}
            {countryValid && !loading && diseaseRows.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm font-semibold text-slate-500 md:col-span-2 xl:col-span-4">
                No disease profiles are available for this country and year.
              </div>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 sm:px-7">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#0060A9]">Regional media watch</p>
              <h2 className="mt-0.5 text-lg font-black">Hot News in {displayCountry}</h2>
            </div>
          </div>
          {tickerNews.length > 0 ? (
            <div className="regional-news-track flex w-max gap-3 px-5 py-4 sm:px-7">
              {tickerNews.map((item, index) => (
                <article key={`${item.id}-${index}`} className="w-[280px] rounded-xl border border-slate-200 bg-slate-50 p-4 sm:w-[340px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wide text-[#047D78]">{item.source_name || item.source_type || 'Source'}</span>
                    <span className="text-[10px] font-semibold text-slate-400">{formatRelative(item.published_at)}</span>
                  </div>
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noreferrer" className="mt-2 block text-sm font-black leading-5 text-slate-800 hover:text-[#0060A9]">
                      {item.disease_classification} · {item.location_name}
                    </a>
                  ) : (
                    <h3 className="mt-2 text-sm font-black leading-5 text-slate-800">{item.disease_classification} · {item.location_name}</h3>
                  )}
                  <p className="mt-3 text-[10px] font-bold text-slate-400">
                    {formatNumber(item.case_count)} cases · {formatNumber(item.death_count)} deaths
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="px-5 py-6 text-sm font-semibold text-slate-500 sm:px-7">
              {loading ? 'Loading KPI events…' : 'No KPI events for this country and year.'}
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#0060A9]">Spatial surveillance</p>
              <h2 className="mt-1 text-xl font-black">Integrated Regional Surveillance Map</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">Province choropleth, disease locations, and environmental layers for {displayCountry}.</p>
            </div>
          </div>
          <div className="mt-5">
            <div className="relative min-h-[420px] h-[520px] w-full overflow-hidden rounded-xl border border-slate-200 bg-[#eaf4f7]">
              {countryValid ? (
                <SpatialOutbreakMap
                  countries={mapCountries}
                  locations={mapLocations as OutbreakLocation[]}
                  highlightCountry={storageCountry || displayCountry}
                  regionalMode
                  hazardEvents={hazards}
                />
              ) : (
                <div className="grid h-full place-items-center text-sm font-semibold text-slate-500">Choose an ASEAN country to load the map.</div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12 lg:gap-8">
            <div className="flex flex-col justify-between space-y-4 lg:col-span-4">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-black leading-snug sm:text-xl">Case Trends &amp; Epidemiological Surveillance</h2>
                    <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500 sm:text-sm">Monthly case dynamics, case fatality ratio (CFR), and disease distribution in {displayCountry}.</p>
                  </div>
                  <Link href="/reports/matrix" className="shrink-0 rounded-xl bg-[#047D78] px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-white shadow-sm">
                    View matrix
                  </Link>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <MetricCard label="Deaths / CFR" value={snapshot ? formatNumber(snapshot.kpis.deaths) : '—'} detail={snapshot ? `Deaths (${formatCfr(snapshot.kpis.cases, snapshot.kpis.deaths)})` : 'No snapshot'} tone="border-rose-200/80 bg-rose-50/70 text-rose-900" />
                  <MetricCard label={latestTrend ? `Period cases (${latestTrend.month})` : 'Period cases'} value={latestTrend ? formatNumber(latestTrend.cases) : '—'} detail="New cases" tone="border-orange-200/80 bg-orange-50/70 text-orange-900" />
                  <MetricCard label="Active signals" value={snapshot ? formatNumber(snapshot.kpis.active_alerts) : '—'} detail="Active signals" tone="border-amber-200/80 bg-amber-50/70 text-amber-900" />
                  <MetricCard label="Cumulative cases" value={snapshot ? formatNumber(snapshot.kpis.cases) : '—'} detail="Detected" tone="border-teal-200/80 bg-teal-50/70 text-teal-900" />
                </div>
              </div>
              <div className="rounded-xl border border-teal-200 bg-teal-50/90 p-4 text-xs font-medium leading-relaxed text-teal-950 sm:text-sm">
                <div className="flex items-center gap-2 text-sm font-black text-teal-900"><Activity className="h-4 w-4 text-[#047d78]" /> Epidemiological Surveillance Insight</div>
                <p className="mt-1.5">
                  {topDisease
                    ? `Validated surveillance data indicates that the highest concentration of cases is associated with ${insightDisease} (${insightCases} cases). There are currently ${snapshot ? formatNumber(snapshot.kpis.active_alerts) : '—'} active signals according to the validation rules.`
                    : 'No validated disease concentration is available for this country and year.'}
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5 lg:col-span-8">
              <div className="mb-3 flex flex-wrap items-center gap-1.5 border-b border-slate-200/80 pb-3 text-xs">
                <span className="mr-1 hidden text-[11px] font-bold text-slate-500 sm:inline">Series:</span>
                {SERIES_META.map((series) => (
                  <button
                    type="button"
                    key={series.key}
                    onClick={() => setVisibleSeries((current) => ({ ...current, [series.key]: !current[series.key] }))}
                    className={`rounded-lg border px-2.5 py-1 font-bold ${series.style} ${visibleSeries[series.key] ? '' : 'opacity-40'}`}
                  >
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-current" />
                    {series.label}
                  </button>
                ))}
                <button type="button" onClick={() => setVisibleSeries({ cases: true, events: true, deaths: true, cumulative: true })} className="rounded-md px-2 py-1 font-bold text-slate-500">
                  Reset
                </button>
              </div>
              <div className="h-[320px] w-full sm:h-[350px]">
                {trendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData} margin={{ top: 20, right: 25, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }} />
                      <YAxis tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} tickFormatter={(value) => Number(value) >= 1000 ? `${Math.round(Number(value) / 1000)}k` : String(value)} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #cbd5e1', fontSize: 11, fontWeight: 700 }} />
                      {visibleSeries.cases && <Line type="monotone" dataKey="cases" name="Reported Cases" stroke="#f97316" strokeWidth={2.5} dot={{ r: 3.5, fill: '#f97316' }} />}
                      {visibleSeries.events && <Line type="monotone" dataKey="events" name="Reported Events" stroke="#047d78" strokeWidth={2.5} dot={{ r: 3.5, fill: '#047d78' }} />}
                      {visibleSeries.deaths && <Line type="monotone" dataKey="deaths" name="Deaths" stroke="#e11d48" strokeWidth={2} dot={{ r: 3.5, fill: '#e11d48' }} />}
                      {visibleSeries.cumulative && <Line type="monotone" dataKey="cumulative" name="Cumulative Total" stroke="#1e293b" strokeWidth={2} strokeDasharray="4 4" dot={false} />}
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="grid h-full place-items-center text-sm font-semibold text-slate-400">
                    {loading ? 'Loading trend series…' : 'No monthly or weekly trend points for this country.'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section ref={seasonalRef} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-black sm:text-xl">Seasonal Patterns</h2>
              <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500 sm:text-sm">Monthly disease intensity across the available publication period.</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button type="button" onClick={() => setSeasonalMode('table')} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${seasonalMode === 'table' ? 'border border-slate-200 bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Table</button>
                <button type="button" onClick={() => setSeasonalMode('chart')} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${seasonalMode === 'chart' ? 'bg-[#047D78] text-white' : 'text-slate-500'}`}>Chart</button>
              </div>
              <button
                type="button"
                onClick={() => {
                  const node = seasonalRef.current
                  if (!node) return
                  if (document.fullscreenElement) void document.exitFullscreen()
                  else void node.requestFullscreen()
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600"
              >
                Enter full-screen
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-bold">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-600">{diseaseRows.length} diseases</span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-600">{trendData.length || 0} time points</span>
            {highestSeasonal && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-800">
                Highest intensity: {highestSeasonal.name} / {highestSeasonal.column}
              </span>
            )}
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 p-4">
            {seasonalGrid.length > 0 && trendData.length > 0 ? (
              <div className="min-w-[760px]">
                <div className="grid gap-1 text-[10px] font-black text-slate-400" style={seasonalGridStyle}>
                  <div>DISEASE</div>
                  {trendData.map((point) => <div key={point.month} className="text-center">{point.month.split(' ')[0]}</div>)}
                </div>
                {seasonalGrid.map((disease) => (
                  <div key={disease.name} className="mt-1 grid gap-1" style={seasonalGridStyle}>
                    <div className="truncate py-2 pr-2 text-xs font-black text-slate-700">{disease.name}</div>
                    {disease.values.map((value, index) => (
                      <div
                        key={`${disease.name}-${index}`}
                        className={`grid h-8 place-items-center rounded-sm border border-white text-[10px] font-black ${intensityClass(value)}`}
                        title={`${disease.name}: ${formatNumber(disease.raw[index])}`}
                      >
                        {seasonalMode === 'table' && value > 0 ? formatNumber(disease.raw[index]) : null}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm font-semibold text-slate-400">
                {loading ? 'Loading seasonal intensity…' : 'No seasonal intensity series for this country and year.'}
              </p>
            )}
          </div>
        </section>
      </div>
  )

  if (embedded) {
    return content
  }

  return (
    <main className="min-h-screen bg-[#f8fafc] px-2 py-4 text-slate-900 sm:px-3 md:px-4 md:py-5">
      {content}
    </main>
  )
}
