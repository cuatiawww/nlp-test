'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CalendarRange,
  CloudRain,
  Database,
  Droplets,
  Info,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Skull,
  Thermometer,
  TrendingUp,
  Wind,
} from 'lucide-react'

import {
  fetchKpiEvents,
  fetchKpiSnapshot,
  fetchPublicDashboard,
  fetchRegionContext,
  fetchSpatialHeatmap,
  type HeatmapCountryData,
  type KpiEventRow,
  type RegionContext,
  type RegionHazardEvent,
} from '@/lib/api'
import { ASEAN11_DISPLAY, aseanDisplayName, aseanStorageName, isAseanCountryName } from '@/lib/asean-scope'
import AseanScopeBanner from '@/components/AseanScopeBanner'
import CountryFlag from '@/components/CountryFlag'
import type { OutbreakLocation, PublicDashboard } from '@/types'

const SpatialOutbreakMap = dynamic(() => import('@/components/SpatialOutbreakMap'), { ssr: false })

type DiseaseTrend = { name: string; cases: number; deaths: number; events: number; weekly: number[] }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Number(value) || 0))
}
function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
}
function formatMaybe(value?: number | null, suffix = '') {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return `${Number(value).toFixed(1)}${suffix}`
}
function hasDashboardData(snapshot: PublicDashboard) {
  return snapshot.kpis.cases > 0 || snapshot.kpis.deaths > 0 || snapshot.kpis.events > 0 || snapshot.by_disease.length > 0
}
function intensity(value: number, max: number) {
  if (!value || !max) return 'bg-slate-50 text-slate-300'
  const ratio = value / max
  if (ratio >= 0.75) return 'bg-[#0060A9] text-white'
  if (ratio >= 0.45) return 'bg-sky-400 text-white'
  if (ratio >= 0.2) return 'bg-sky-200 text-sky-900'
  return 'bg-sky-50 text-sky-800'
}
function weatherLabel(code?: number | null) {
  if (code == null) return '—'
  if (code === 0) return 'Clear'
  if (code <= 3) return 'Partly cloudy'
  if (code <= 48) return 'Fog'
  if (code <= 57) return 'Drizzle'
  if (code <= 67) return 'Rain'
  if (code <= 77) return 'Snow'
  if (code <= 82) return 'Showers'
  if (code >= 95) return 'Thunderstorm'
  return `Code ${code}`
}

function KpiCard({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: typeof Activity; tone: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-900">{value}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">{detail}</p>
        </div>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </article>
  )
}

function EnvMetric({ label, value, hint, icon: Icon }: { label: string; value: string; hint: string; icon: typeof Activity }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon className="h-4 w-4 text-[#0060A9]" />
        <p className="text-[10px] font-black uppercase tracking-[0.14em]">{label}</p>
      </div>
      <p className="mt-2 text-xl font-black text-slate-900">{value}</p>
      <p className="mt-1 text-[11px] font-medium text-slate-500">{hint}</p>
    </article>
  )
}

export default function RegionalSurveillanceProfile() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedCountry = searchParams.get('country') || 'Indonesia'
  const storageCountry = aseanStorageName(requestedCountry)
  const displayCountry = storageCountry ? aseanDisplayName(storageCountry) : requestedCountry
  const countryValid = Boolean(storageCountry)

  const [snapshot, setSnapshot] = useState<PublicDashboard | null>(null)
  const [heatmap, setHeatmap] = useState<HeatmapCountryData | null>(null)
  const [diseaseTrends, setDiseaseTrends] = useState<DiseaseTrend[]>([])
  const [news, setNews] = useState<KpiEventRow[]>([])
  const [context, setContext] = useState<RegionContext | null>(null)
  const [selectedDisease, setSelectedDisease] = useState('')
  const [year, setYear] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadRegion = useCallback(async (requestedYear?: number) => {
    if (!storageCountry) {
      setSnapshot(null)
      setHeatmap(null)
      setDiseaseTrends([])
      setNews([])
      setContext(null)
      setError('This page only covers ASEAN + Timor-Leste. Choose a member country.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      let base = await fetchPublicDashboard({ country: storageCountry, ...(requestedYear ? { year: requestedYear } : {}) })
      const availableYears = base.available_years || []
      const fallbackYear = availableYears[0]
      const selectedYear = requestedYear || Number(base.filters?.year) || fallbackYear
      if (!requestedYear && selectedYear && Number(base.filters?.year) !== selectedYear && !hasDashboardData(base)) {
        base = await fetchPublicDashboard({ country: storageCountry, year: selectedYear })
      }
      const kpi = await fetchKpiSnapshot({ country: storageCountry, year: Number(base.filters?.year) || selectedYear }).catch(() => null)
      if (kpi?.kpis) base.kpis = { ...base.kpis, ...kpi.kpis }
      const effectiveYear = Number(base.filters?.year) || selectedYear || new Date().getFullYear()
      setSnapshot(base)
      setYear(effectiveYear)
      const diseaseRows = (base.by_disease || []).filter((item) => item.name && item.cases >= 0).slice(0, 6)
      setSelectedDisease((current) => current || diseaseRows[0]?.name || '')
      const [heatmapResult, trendsResult, newsResult, contextResult] = await Promise.allSettled([
        fetchSpatialHeatmap({ country: storageCountry, year: effectiveYear }),
        Promise.all(diseaseRows.map(async (item) => {
          const detail = await fetchPublicDashboard({ country: storageCountry, year: effectiveYear, disease: item.name })
          return { name: item.name, cases: detail.kpis.cases, deaths: detail.kpis.deaths, events: detail.kpis.events, weekly: (detail.weekly_trend || []).map((point) => point.cases) } satisfies DiseaseTrend
        })),
        fetchKpiEvents({ country: storageCountry, year: effectiveYear, page: 1, per_page: 8 }),
        fetchRegionContext(storageCountry),
      ])
      if (heatmapResult.status === 'fulfilled') {
        const match = heatmapResult.value.countries.find((item) => item.country.toLowerCase() === storageCountry.toLowerCase())
        setHeatmap(match || heatmapResult.value.countries[0] || null)
      } else setHeatmap(null)
      if (trendsResult.status === 'fulfilled') setDiseaseTrends(trendsResult.value)
      else setDiseaseTrends([])
      if (newsResult.status === 'fulfilled') setNews(newsResult.value.data || [])
      else setNews([])
      if (contextResult.status === 'fulfilled') setContext(contextResult.value)
      else setContext(null)
    } catch (loadError) {
      console.error('[RegionalSurveillanceProfile]', loadError)
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
    setSelectedDisease('')
    void loadRegion()
  }, [loadRegion])

  const availableYears = snapshot?.available_years || []
  const diseaseRows = snapshot?.by_disease || []
  const selectedTrend = diseaseTrends.find((item) => item.name === selectedDisease) || diseaseTrends[0]
  const selectedSeries = selectedTrend?.weekly?.length ? selectedTrend.weekly : (snapshot?.weekly_trend || []).map((point) => point.cases)
  const maxTrend = Math.max(...selectedSeries, 1)
  const maxMonth = Math.max(...(heatmap?.months || []).map((month) => month.cases), 1)
  const latestSignal = useMemo(() => {
    const values = (snapshot?.locations || []).map((item) => item.latest_date).filter(Boolean).sort()
    return values.at(-1)
  }, [snapshot])
  const sourceTypes = useMemo(() => {
    const values = new Set((snapshot?.locations || []).flatMap((location) => (location.sources || []).map((source) => source.source_name || source.source_type).filter(Boolean)))
    return Array.from(values).slice(0, 3)
  }, [snapshot])
  const mapLocations = useMemo(
    () => (snapshot?.locations || []).filter((item) => isAseanCountryName(item.country) && item.country?.toLowerCase() === (storageCountry || '').toLowerCase()),
    [snapshot, storageCountry],
  )
  const mapCountries = useMemo(
    () => (snapshot?.by_country || []).filter((row) => row.name.toLowerCase() === (storageCountry || '').toLowerCase()),
    [snapshot, storageCountry],
  )
  const hazards: RegionHazardEvent[] = context?.hazards || []
  const kpiSource = snapshot?.kpis.kpi_source
  const isLive = Boolean(snapshot) && !error

  const switchCountry = (next: string) => {
    router.replace(`/detail-region?country=${encodeURIComponent(next)}`)
  }

  return (
    <main className="min-h-screen bg-[#f8fafc] px-3 py-3 md:px-4 md:py-4">
      <div className="mx-auto w-full max-w-none space-y-5">
        <header className="flex flex-col gap-5 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <button type="button" onClick={() => router.push('/countries')} className="mb-4 inline-flex items-center gap-2 text-xs font-bold text-[#0060A9] hover:text-[#004b85]">
              <ArrowLeft className="h-4 w-4" /> Back to countries
            </button>
            <div className="flex items-center gap-4">
              <CountryFlag countryName={storageCountry || displayCountry} shape="rounded" size="xl" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0060A9]">
                  Country surveillance profile · {context?.iso2 || storageCountry || '—'}
                </p>
                <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900">{displayCountry}</h1>
                <p className="mt-1 text-sm text-slate-500">Disease indicators, province map, environmental context, and news for this ASEAN member.</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isLive && (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                Live{kpiSource ? ` · ${kpiSource}` : ''}
              </span>
            )}
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm">
              <MapPin className="h-4 w-4 text-[#0060A9]" />
              <select value={storageCountry || ''} onChange={(event) => switchCountry(event.target.value)} className="bg-transparent outline-none">
                {ASEAN11_DISPLAY.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            {availableYears.length > 0 && (
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm">
                <CalendarRange className="h-4 w-4 text-[#0060A9]" />
                <select value={year || ''} onChange={(event) => void loadRegion(Number(event.target.value))} className="bg-transparent outline-none">
                  <option value="" disabled>Year</option>
                  {availableYears.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            )}
            <button type="button" onClick={() => void loadRegion(year || undefined)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm hover:border-blue-200 hover:text-[#0060A9]">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </header>

        <AseanScopeBanner country={storageCountry || requestedCountry} />

        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-bold">Data unavailable</p>
              <p className="mt-1 text-xs">{error} The page does not use example or static values.</p>
            </div>
          </div>
        )}

        {loading && !snapshot ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}</div>
        ) : snapshot && countryValid ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <EnvMetric
                label="Air temperature"
                value={context?.weather?.status === 'ok' ? formatMaybe(context.weather.current?.temperature_c, ' °C') : '—'}
                hint={context?.weather?.status === 'ok' ? `${weatherLabel(context.weather.current?.weather_code)} · ${context.capital.name}` : (context?.weather?.error || 'Open-Meteo unavailable')}
                icon={Thermometer}
              />
              <EnvMetric
                label="Humidity"
                value={context?.weather?.status === 'ok' ? formatMaybe(context.weather.current?.relative_humidity_pct, '%') : '—'}
                hint={context?.climate?.status === 'ok' ? `NASA POWER 7-day mean ${formatMaybe(context.climate.averages?.rh2m_pct, '%')}` : 'Open-Meteo current RH'}
                icon={Droplets}
              />
              <EnvMetric
                label="Precipitation"
                value={context?.weather?.status === 'ok' ? formatMaybe(context.weather.precip_today_mm ?? context.weather.current?.precipitation_mm, ' mm') : '—'}
                hint={context?.climate?.status === 'ok' ? `NASA POWER mean ${formatMaybe(context.climate.averages?.precip_mm, ' mm/day')}` : 'Open-Meteo daily sum'}
                icon={CloudRain}
              />
              <EnvMetric
                label="Air quality"
                value={context?.air_quality?.status === 'ok' ? `${context.air_quality.current?.european_aqi ?? '—'} AQI` : '—'}
                hint={context?.air_quality?.status === 'ok' ? `${context.air_quality.current?.aqi_label || 'CAMS'} · PM2.5 ${formatMaybe(context.air_quality.current?.pm2_5, ' µg/m³')}` : (context?.air_quality?.error || 'Open-Meteo AQ unavailable')}
                icon={Wind}
              />
              <EnvMetric
                label="Hazard alerts"
                value={formatNumber(hazards.length)}
                hint={`${context?.gdacs?.status === 'ok' ? (context.gdacs.events?.length || 0) : 0} GDACS · ${context?.usgs?.status === 'ok' ? (context.usgs.events?.length || 0) : 0} USGS`}
                icon={AlertTriangle}
              />
            </section>

            <section id="indicators" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Total reported cases" value={formatNumber(snapshot.kpis.cases)} detail={`${year || '—'} · validated events`} icon={Activity} tone="bg-blue-50 text-[#0060A9]" />
              <KpiCard label="Reported deaths" value={formatNumber(snapshot.kpis.deaths)} detail="Recorded deaths" icon={Skull} tone="bg-rose-50 text-rose-600" />
              <KpiCard label="Diseases tracked" value={formatNumber(diseaseRows.length)} detail="Diseases with signals" icon={TrendingUp} tone="bg-emerald-50 text-emerald-600" />
              <KpiCard label="Active alerts" value={formatNumber(snapshot.kpis.active_alerts)} detail="API alert rule matches" icon={AlertTriangle} tone="bg-amber-50 text-amber-600" />
            </section>

            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <div>
                    <h2 className="text-sm font-black text-slate-900">How to interpret this country profile</h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">KPI, events, and news come from the ASEAN-scoped materialized snapshot for {displayCountry}. Weather, AQI, and precipitation are live Open-Meteo reads at the capital. Climate means are NASA POWER. Map hazard pins are GDACS and USGS. Empty cells mean the provider did not return a value — they are not invented.</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
                  <div className="rounded-xl border border-white bg-white/80 p-3"><p className="font-bold text-slate-400">Coverage year</p><p className="mt-1 font-black text-slate-800">{year || '—'}</p></div>
                  <div className="rounded-xl border border-white bg-white/80 p-3"><p className="font-bold text-slate-400">Latest signal</p><p className="mt-1 font-black text-slate-800">{formatDate(latestSignal)}</p></div>
                  <div className="rounded-xl border border-white bg-white/80 p-3"><p className="font-bold text-slate-400">Last API update</p><p className="mt-1 font-black text-slate-800">{formatDate(snapshot.updated_at)}</p></div>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 text-slate-800">
                  <Database className="h-5 w-5 text-[#0060A9]" />
                  <h2 className="text-sm font-black">Data provenance</h2>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-600">Source details follow the metadata attached to locations and events in the API.</p>
                <div className="mt-4 space-y-2">
                  {sourceTypes.length > 0 ? sourceTypes.map((source) => (
                    <div key={source} className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">{source}</div>
                  )) : (
                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">Source metadata is not available.</p>
                  )}
                </div>
              </div>
            </section>

            <section id="diseases" className="grid gap-3 md:grid-cols-3">
              {diseaseRows.slice(0, 3).map((item, index) => {
                const palettes = [
                  'border-amber-200/90 bg-gradient-to-br from-[#fffdfa] via-white to-[#fff9f0]',
                  'border-teal-200/90 bg-gradient-to-br from-[#f6fcfb] via-white to-[#edf8f5]',
                  'border-purple-200/90 bg-gradient-to-br from-[#fbf8fe] via-white to-[#f4edfd]',
                ]
                const totalCases = Math.max(snapshot.kpis.cases, 1)
                const share = Math.min(100, (item.cases / totalCases) * 100)
                return (
                  <article key={item.name} className={`rounded-2xl border p-4 shadow-sm ${palettes[index]}`}>
                    <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">{item.name}</p>
                    <p className="mt-2 text-3xl font-black text-slate-900">{formatNumber(item.cases)}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-600">Deaths {formatNumber(item.deaths)} · {share.toFixed(1)}% of country cases</p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full ${index === 0 ? 'bg-amber-500' : index === 1 ? 'bg-teal-500' : 'bg-purple-500'}`} style={{ width: `${share}%` }} />
                    </div>
                  </article>
                )
              })}
              {diseaseRows.length === 0 && (
                <div className="md:col-span-3 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-semibold text-slate-500">
                  No disease profiles are available for this country and year.
                </div>
              )}
            </section>

            <section id="map" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#0060A9]">Province choropleth</p>
                  <h2 className="mt-1 text-xl font-black text-slate-900">Regional surveillance map — {displayCountry}</h2>
                  <p className="mt-1 text-sm text-slate-500">ADM1 polygons from geoBoundaries (Indonesia: project wilayah data). Use layer settings for InaRISK, wind, USGS, and GDACS.</p>
                </div>
                <span className="text-xs font-bold text-slate-400">{mapLocations.length} mapped locations</span>
              </div>
              <div className="h-[560px] w-full overflow-hidden rounded-xl">
                <SpatialOutbreakMap
                  countries={mapCountries}
                  locations={mapLocations as OutbreakLocation[]}
                  highlightCountry={storageCountry || displayCountry}
                  regionalMode
                  hazardEvents={hazards}
                />
              </div>
            </section>

            <section id="news" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#0060A9]">Country news & events</p>
                  <h2 className="mt-1 text-xl font-black text-slate-900">Latest validated signals</h2>
                  <p className="mt-1 text-sm text-slate-500">KPI event ledger for {displayCountry}, not a static headline list.</p>
                </div>
              </div>
              {news.length > 0 ? (
                <ul className="mt-4 divide-y divide-slate-100">
                  {news.map((item) => (
                    <li key={item.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-800">{item.disease_classification} · {item.location_name || displayCountry}</p>
                        <p className="text-xs text-slate-500">{item.source_name || item.source_type} · {formatDate(item.published_at)} · {formatNumber(item.case_count)} cases</p>
                      </div>
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-[#0060A9] hover:underline">Open source</a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-5 rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">No validated events are available for this country and year.</div>
              )}
            </section>

            <section id="trends" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#0060A9]">Surveillance trends by disease</p>
                  <h2 className="mt-1 text-xl font-black text-slate-900">Disease case trends</h2>
                  <p className="mt-1 text-sm text-slate-500">Select a disease series; the period follows observations available for this country and year.</p>
                </div>
                {(diseaseTrends.length > 0 || snapshot.weekly_trend?.length) && (
                  <select value={selectedTrend?.name || selectedDisease} onChange={(event) => setSelectedDisease(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none">
                    <option value="">All diseases</option>
                    {diseaseTrends.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
                  </select>
                )}
              </div>
              <div className="mt-5 grid min-h-48 grid-cols-12 items-end gap-2 rounded-xl bg-slate-50/70 p-4">
                {selectedSeries.length > 0 ? selectedSeries.map((value, index) => (
                  <div key={`${index}-${value}`} className="group flex h-full flex-col items-center justify-end gap-2">
                    <div className="relative w-full min-w-2 rounded-t-md bg-[#0060A9] transition hover:bg-[#004b85]" style={{ height: `${Math.max(8, (value / maxTrend) * 100)}%` }} title={`Period ${index + 1}: ${formatNumber(value)} cases`} />
                    <span className="text-[9px] font-bold text-slate-400">{index + 1}</span>
                  </div>
                )) : (
                  <div className="col-span-12 flex items-center justify-center text-xs text-slate-400">No trend observations are available for this period.</div>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <span>{selectedTrend?.name || 'All diseases'}</span>
                <span>{selectedSeries.length} periods · peak {formatNumber(Math.max(...selectedSeries, 0))} cases</span>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#0060A9]">Tracked disease profiles</p>
                  <h2 className="mt-1 text-xl font-black text-slate-900">Disease comparison</h2>
                  <p className="mt-1 text-sm text-slate-500">Compare cases, deaths, and mapped events reported for {displayCountry}.</p>
                </div>
                <span className="hidden rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#0060A9] sm:inline-flex">{diseaseRows.length} diseases</span>
              </div>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-y border-slate-100 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                    <tr><th className="px-4 py-3">Disease</th><th className="px-4 py-3">Share of cases</th><th className="px-4 py-3 text-right">Cases</th><th className="px-4 py-3 text-right">Deaths</th><th className="px-4 py-3 text-right">Events</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {diseaseRows.map((item) => {
                      const totalCases = Math.max(snapshot.kpis.cases, 1)
                      const share = Math.min(100, (item.cases / totalCases) * 100)
                      return (
                        <tr key={item.name} className="hover:bg-blue-50/30">
                          <td className="px-4 py-3 font-bold text-slate-800">{item.name}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-2 min-w-24 flex-1 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-[#0060A9]" style={{ width: `${share}%` }} /></div>
                              <span className="w-12 text-right text-xs font-bold text-slate-500">{share.toFixed(1)}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-black text-slate-800">{formatNumber(item.cases)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-rose-600">{formatNumber(item.deaths)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-600">{formatNumber(item.events)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="seasonal" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#0060A9]">Seasonal patterns</p>
                  <h2 className="mt-1 text-xl font-black text-slate-900">Monthly case pattern</h2>
                  <p className="mt-1 text-sm text-slate-500">The heatmap shows case intensity by month for the selected country.</p>
                </div>
                <span className="text-xs font-bold text-slate-400">{heatmap ? `Year ${heatmap.months.length ? year : '—'}` : 'No heatmap data'}</span>
              </div>
              {heatmap?.months?.length ? (
                <div className="mt-5 overflow-x-auto">
                  <div className="grid min-w-[720px] grid-cols-12 gap-2">
                    {heatmap.months.map((month) => (
                      <div key={month.month_num} className={`rounded-xl p-3 ${intensity(month.cases, maxMonth)}`}>
                        <p className="text-[10px] font-black uppercase">{MONTHS[month.month_num - 1] || month.month_name}</p>
                        <p className="mt-3 text-lg font-black">{formatNumber(month.cases)}</p>
                        <p className="mt-1 text-[10px] font-semibold opacity-80">{formatNumber(month.events)} events</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[10px] font-bold text-slate-400">
                    <span>Low</span>
                    <span>Highest intensity: {formatNumber(maxMonth)} cases</span>
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">No monthly pattern data is available for this country and year.</div>
              )}
            </section>

            <section className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#0060A9]" />
              <p>
                <b>Interpretation note:</b> A value of 0 means no cases were reported in the API observation, not proof that the disease is absent. Weather and AQI are capital-point estimates, not national means. InaRISK rasters apply to Indonesia only. Cross-country comparisons should consider case definitions, reporting completeness, and observation period.
                {context?.weather?.attribution ? ` ${context.weather.attribution}.` : ''}
                {context?.climate?.attribution ? ` ${context.climate.attribution}.` : ''}
              </p>
            </section>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm font-semibold text-slate-500">No regional data is available for {displayCountry}.</div>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Scope: {displayCountry}</span>
          <span className="inline-flex items-center gap-1.5"><Database className="h-3.5 w-3.5" /> Live API projection</span>
          <Link href="/interoperability" className="font-bold text-[#0060A9] hover:underline">Interoperability catalog</Link>
          <Link href="/countries" className="font-bold text-[#0060A9] hover:underline">View other countries</Link>
        </footer>
      </div>
    </main>
  )
}
