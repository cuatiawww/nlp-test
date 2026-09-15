"use client"

import Link from "next/link"

import { useMemo, useRef, useState, type ReactNode, type RefObject } from "react"
import dynamic from "next/dynamic"
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  GripVertical,
  LineChart as LineChartIcon,
  Map as MapIcon,
  Minus,
  Plus,
  Printer,
  RefreshCw,
  Sparkles,
  Table2,
  Trash2,
  Users,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

type CoverageMapProps = {
  countryData: { name: string; cases: number; deaths?: number }[]
  compact?: boolean
  embedded?: boolean
  hideLegend?: boolean
  showAdmin?: boolean
  showMarkers?: boolean
}

const AseanMap = dynamic<CoverageMapProps>(() => import("@/components/AseanMap"), { ssr: false })

export type CustomReportRow = {
  id: string
  date: string
  country: string
  disease: string
  cases: number
  deaths: number
  sourceType?: string
}

type Cadence = "weekly" | "monthly"
type WidgetId = "summary" | "trend" | "disease" | "country" | "coverage" | "table"
type SummaryMode = "executive" | "trend" | "geographic" | "custom"

type WidgetDefinition = {
  id: WidgetId
  label: string
  description: string
  icon: typeof BarChart3
}

const ASEAN_COUNTRIES = ["Brunei", "Cambodia", "Indonesia", "Laos", "Malaysia", "Myanmar", "Philippines", "Singapore", "Thailand", "Timor-Leste", "Vietnam"]

const WIDGETS: WidgetDefinition[] = [
  { id: "summary", label: "Executive Summary", description: "Case, death, reporting, and country totals", icon: Users },
  { id: "trend", label: "Case Trend", description: "Weekly or monthly cases and deaths", icon: LineChartIcon },
  { id: "disease", label: "Disease Distribution", description: "Compare reported cases by disease", icon: BarChart3 },
  { id: "country", label: "Country Distribution", description: "Compare reported cases by country", icon: MapIcon },
  { id: "coverage", label: "ASEAN Case Coverage", description: "Countries with case reports in this period", icon: Sparkles },
  { id: "table", label: "Case Data Table", description: "Show the filtered case records", icon: Table2 },
]

const DEFAULT_WIDGETS: WidgetId[] = ["summary", "trend", "disease", "coverage"]

const SUMMARY_TEMPLATES: Record<SummaryMode, string> = {
  executive: "During {period}, {cases} reported cases and {deaths} deaths were recorded across {countries} countries. {topDisease} accounted for the highest reported case volume, with {topCountry} recording the largest country-level total.",
  trend: "During {period}, reported cases changed by {change} compared with the first observed {cadence} period. The latest observed period recorded {latestCases} cases and {latestDeaths} deaths.",
  geographic: "During {period}, case reports were available from {countries} ASEAN countries. {topCountry} recorded the highest reported case total, while {topDisease} was the leading disease in the selected data.",
  custom: "",
}

function parseDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function isoWeekKey(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`
}

function formatPeriod(key: string, cadence: Cadence) {
  if (cadence === "weekly") return key.replace("-", " / ")
  const [year, month] = key.split("-")
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" })
}

function downloadSvgAsPng(container: HTMLDivElement | null, filename: string) {
  const svg = container?.querySelector("svg")
  if (!svg) return false
  const bounds = svg.getBoundingClientRect()
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  clone.setAttribute("width", String(Math.max(1, Math.round(bounds.width))))
  clone.setAttribute("height", String(Math.max(1, Math.round(bounds.height))))
  const serialized = new XMLSerializer().serializeToString(clone)
  const image = new Image()
  image.onload = () => {
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(bounds.width * 2))
    canvas.height = Math.max(1, Math.round(bounds.height * 2))
    const context = canvas.getContext("2d")
    if (!context) return
    context.scale(2, 2)
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, bounds.width, bounds.height)
    context.drawImage(image, 0, 0, bounds.width, bounds.height)
    const link = document.createElement("a")
    link.download = filename
    link.href = canvas.toDataURL("image/png")
    link.click()
    URL.revokeObjectURL(image.src)
  }
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`
  return true
}

function WidgetCard({ definition, children, chartRef, onRemove, onMove, canMoveUp, canMoveDown }: {
  definition: WidgetDefinition
  children: ReactNode
  chartRef?: RefObject<HTMLDivElement | null>
  onRemove: () => void
  onMove: (direction: "up" | "down") => void
  canMoveUp: boolean
  canMoveDown: boolean
}) {
  const Icon = definition.icon
  return (
    <section className={`custom-report-widget rounded-2xl border border-slate-200 bg-white shadow-sm ${definition.id === "summary" || definition.id === "trend" ? "md:col-span-2" : ""}`}>
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3 print:bg-white">
        <div className="flex min-w-0 items-center gap-2"><GripVertical className="h-4 w-4 shrink-0 text-slate-300 print:hidden" /><Icon className="h-4 w-4 shrink-0 text-[#0060A9]" /><div className="min-w-0"><h3 className="truncate text-sm font-black text-slate-900">{definition.label}</h3><p className="truncate text-[11px] font-medium text-slate-500">{definition.description}</p></div></div>
        <div className="flex shrink-0 items-center gap-1 print:hidden">{chartRef && <button type="button" onClick={() => downloadSvgAsPng(chartRef.current, `${definition.id}-chart.png`)} className="rounded-lg p-1.5 text-slate-500 hover:bg-blue-50 hover:text-[#0060A9]" title="Export chart as PNG"><Download className="h-4 w-4" /></button>}<button type="button" onClick={() => onMove("up")} disabled={!canMoveUp} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" title="Move up"><ChevronUp className="h-4 w-4" /></button><button type="button" onClick={() => onMove("down")} disabled={!canMoveDown} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" title="Move down"><ChevronDown className="h-4 w-4" /></button><button type="button" onClick={onRemove} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600" title="Remove widget"><Trash2 className="h-4 w-4" /></button></div>
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

export default function CustomReportBuilder({ rows, loading, onToast }: { rows: CustomReportRow[]; loading: boolean; onToast?: (message: string) => void }) {
  const [cadence, setCadence] = useState<Cadence>("weekly")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [country, setCountry] = useState("all")
  const [disease, setDisease] = useState("all")
  const [summaryMode, setSummaryMode] = useState<SummaryMode>("executive")
  const [summaryDraft, setSummaryDraft] = useState(SUMMARY_TEMPLATES.executive)
  const [widgets, setWidgets] = useState<WidgetId[]>(DEFAULT_WIDGETS)
  const [draggedWidget, setDraggedWidget] = useState<WidgetId | null>(null)
  const trendRef = useRef<HTMLDivElement>(null)
  const diseaseRef = useRef<HTMLDivElement>(null)
  const countryRef = useRef<HTMLDivElement>(null)

  const caseRows = useMemo(() => rows.filter((row) => !["ibs", "ebs", "skdr", "skdr_api"].includes((row.sourceType || "").toLowerCase())), [rows])
  const countries = useMemo(() => Array.from(new Set(caseRows.map((row) => row.country).filter(Boolean))).sort(), [caseRows])
  const diseases = useMemo(() => Array.from(new Set(caseRows.map((row) => row.disease).filter(Boolean))).sort(), [caseRows])
  const filteredRows = useMemo(() => caseRows.filter((row) => {
    const date = parseDate(row.date)
    if (!date) return false
    if (dateFrom && row.date.slice(0, 10) < dateFrom) return false
    if (dateTo && row.date.slice(0, 10) > dateTo) return false
    if (country !== "all" && row.country !== country) return false
    if (disease !== "all" && row.disease !== disease) return false
    return true
  }), [caseRows, dateFrom, dateTo, country, disease])

  const trendData = useMemo(() => {
    const grouped = new Map<string, { key: string; cases: number; deaths: number; reports: number }>()
    filteredRows.forEach((row) => { const date = parseDate(row.date); if (!date) return; const key = cadence === "weekly" ? isoWeekKey(date) : monthKey(date); const current = grouped.get(key) || { key, cases: 0, deaths: 0, reports: 0 }; current.cases += row.cases || 0; current.deaths += row.deaths || 0; current.reports += 1; grouped.set(key, current) })
    return Array.from(grouped.values()).sort((a, b) => a.key.localeCompare(b.key)).map((item) => ({ ...item, label: formatPeriod(item.key, cadence) }))
  }, [filteredRows, cadence])

  const diseaseData = useMemo(() => {
    const grouped = new Map<string, { name: string; cases: number; deaths: number }>()
    filteredRows.forEach((row) => { const current = grouped.get(row.disease) || { name: row.disease, cases: 0, deaths: 0 }; current.cases += row.cases || 0; current.deaths += row.deaths || 0; grouped.set(row.disease, current) })
    return Array.from(grouped.values()).sort((a, b) => b.cases - a.cases).slice(0, 12)
  }, [filteredRows])

  const countryData = useMemo(() => {
    const grouped = new Map<string, { name: string; reports: number; cases: number; deaths: number }>()
    filteredRows.forEach((row) => { const current = grouped.get(row.country) || { name: row.country, reports: 0, cases: 0, deaths: 0 }; current.reports += 1; current.cases += row.cases || 0; current.deaths += row.deaths || 0; grouped.set(row.country, current) })
    return Array.from(grouped.values()).sort((a, b) => b.cases - a.cases)
  }, [filteredRows])

  const coverageData = useMemo(() => ASEAN_COUNTRIES.map((name) => { const item = countryData.find((countryItem) => countryItem.name.toLowerCase() === name.toLowerCase()); return { name, reports: item?.reports || 0, cases: item?.cases || 0, deaths: item?.deaths || 0, covered: Boolean(item) } }), [countryData])
  const metrics = useMemo(() => { const coveredCountries = coverageData.filter((item) => item.covered).length; return { reports: filteredRows.length, cases: filteredRows.reduce((sum, row) => sum + (row.cases || 0), 0), deaths: filteredRows.reduce((sum, row) => sum + (row.deaths || 0), 0), countries: coveredCountries, coveredCountries } }, [filteredRows, coverageData])
  const summaryValues = useMemo(() => { const first = trendData[0]; const latest = trendData[trendData.length - 1]; const change = first && first.cases > 0 && latest ? ((latest.cases - first.cases) / first.cases) * 100 : 0; const period = dateFrom || dateTo ? `${dateFrom || "start"} to ${dateTo || "latest"}` : `the selected ${cadence} reporting period`; return { period, cases: metrics.cases.toLocaleString(), deaths: metrics.deaths.toLocaleString(), countries: metrics.countries.toLocaleString(), topDisease: diseaseData[0]?.name || "no leading disease", topCountry: countryData[0]?.name || "no leading country", change: `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`, latestCases: (latest?.cases || 0).toLocaleString(), latestDeaths: (latest?.deaths || 0).toLocaleString(), cadence } }, [cadence, countryData, dateFrom, dateTo, diseaseData, metrics, trendData])
  const summaryText = useMemo(() => summaryDraft.replace(/\{(\w+)\}/g, (_, token: string) => summaryValues[token as keyof typeof summaryValues]?.toString() || `{${token}}`), [summaryDraft, summaryValues])

  const moveWidget = (id: WidgetId, direction: "up" | "down") => setWidgets((current) => { const index = current.indexOf(id); const nextIndex = direction === "up" ? index - 1 : index + 1; if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current; const next = [...current]; [next[index], next[nextIndex]] = [next[nextIndex], next[index]]; return next })
  const addWidget = (id: WidgetId) => { if (!widgets.includes(id)) setWidgets((current) => [...current, id]) }
  const resetBuilder = () => { setCadence("weekly"); setDateFrom(""); setDateTo(""); setCountry("all"); setDisease("all"); setSummaryMode("executive"); setSummaryDraft(SUMMARY_TEMPLATES.executive); setWidgets(DEFAULT_WIDGETS); onToast?.("Custom case report layout and filters were reset.") }
  const definitionFor = (id: WidgetId) => WIDGETS.find((widget) => widget.id === id) as WidgetDefinition

  const renderWidget = (id: WidgetId) => {
    if (id === "summary") return <div className="space-y-4"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Reported Cases", metrics.cases, "text-[#0060A9]"], ["Deaths", metrics.deaths, "text-rose-600"], ["Case Records", metrics.reports, "text-slate-900"], ["Countries", metrics.countries, "text-emerald-600"]].map(([label, value, color]) => <div key={String(label)} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p><p className={`mt-1 text-2xl font-black ${color}`}>{Number(value).toLocaleString()}</p></div>)}</div><div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#0060A9]"><Sparkles className="h-4 w-4" /> Automatic case summary</div><span className="text-[10px] font-bold text-slate-500">Based on filtered case data</span></div><p className="text-sm font-semibold leading-6 text-slate-700">{summaryText || "Add your wording template to generate a case summary."}</p></div><div className="custom-report-no-print rounded-xl border border-slate-200 bg-white p-3"><div className="grid gap-3 md:grid-cols-[180px_1fr]"><label><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Summary template</span><select value={summaryMode} onChange={(event) => { const mode = event.target.value as SummaryMode; setSummaryMode(mode); setSummaryDraft(SUMMARY_TEMPLATES[mode]) }} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-bold text-slate-700"><option value="executive">Executive Summary</option><option value="trend">Trend Summary</option><option value="geographic">Geographic Summary</option><option value="custom">Custom Wording</option></select></label><label><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Customize wording</span><textarea value={summaryDraft} onChange={(event) => { setSummaryMode("custom"); setSummaryDraft(event.target.value) }} rows={3} placeholder="Write a summary using {cases}, {deaths}, {topDisease}, and {topCountry}." className="w-full resize-y rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-medium leading-5 text-slate-700 focus:border-[#0060A9] focus:outline-none" /></label></div><p className="mt-2 text-[10px] font-medium text-slate-400">Available variables: <code>{"{period}"}</code> <code>{"{cases}"}</code> <code>{"{deaths}"}</code> <code>{"{countries}"}</code> <code>{"{topDisease}"}</code> <code>{"{topCountry}"}</code> <code>{"{change}"}</code></p></div></div>
    if (id === "trend") return <div ref={trendRef} className="h-72 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={trendData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={24} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Legend /><Line type="monotone" dataKey="cases" name="Reported Cases" stroke="#0060A9" strokeWidth={3} dot={false} /><Line type="monotone" dataKey="deaths" name="Deaths" stroke="#e11d48" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>
    if (id === "disease") return <div ref={diseaseRef} className="h-72 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={diseaseData} margin={{ top: 8, right: 12, left: 0, bottom: 42 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} tick={{ fontSize: 9 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Legend /><Bar dataKey="cases" name="Reported Cases" fill="#0060A9" radius={[5, 5, 0, 0]} /><Bar dataKey="deaths" name="Deaths" fill="#e11d48" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div>
    if (id === "country") return <div ref={countryRef} className="h-72 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={countryData} layout="vertical" margin={{ top: 8, right: 12, left: 35, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis type="number" tick={{ fontSize: 10 }} /><YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 9 }} /><Tooltip /><Bar dataKey="cases" name="Reported Cases" fill="#0060A9" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer></div>
    if (id === "coverage") return <div className="space-y-3"><div className="flex items-end justify-between rounded-xl bg-slate-50 p-3"><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">ASEAN countries reporting cases</p><p className="mt-1 text-3xl font-black text-[#0060A9]">{metrics.coveredCountries}<span className="text-base text-slate-400"> / {ASEAN_COUNTRIES.length}</span></p></div><p className="text-right text-xs font-bold text-slate-500">{Math.round((metrics.coveredCountries / ASEAN_COUNTRIES.length) * 100)}% coverage</p></div><div className="h-[360px] overflow-hidden rounded-xl border border-slate-200"><AseanMap countryData={coverageData.map((item) => ({ name: item.name, cases: item.cases, deaths: item.deaths }))} compact embedded hideLegend showAdmin={false} showMarkers={false} /></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{coverageData.map((item) => <div key={item.name} className={`rounded-xl border p-2.5 ${item.covered ? "border-emerald-200 bg-emerald-50/70" : "border-slate-200 bg-slate-50"}`}><div className="flex items-center justify-between gap-1"><span className="truncate text-xs font-black text-slate-700">{item.name}</span><span className={`h-2 w-2 rounded-full ${item.covered ? "bg-emerald-500" : "bg-slate-300"}`} /></div><p className="mt-1 text-[10px] font-bold text-slate-500">{item.covered ? `${item.cases.toLocaleString()} cases` : "No case report"}</p></div>)}</div><p className="text-[10px] font-medium leading-4 text-slate-400">Coverage indicates the presence of case records in the selected period; it is not a population incidence rate.</p></div>
    if (id === "table") return <div className="max-h-72 overflow-auto rounded-xl border border-slate-200"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-100"><tr><th className="px-3 py-2 font-black">Date</th><th className="px-3 py-2 font-black">Disease</th><th className="px-3 py-2 font-black">Country</th><th className="px-3 py-2 text-right font-black">Cases</th><th className="px-3 py-2 text-right font-black">Deaths</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredRows.slice(0, 100).map((row) => <tr key={row.id}><td className="whitespace-nowrap px-3 py-2">{parseDate(row.date)?.toLocaleDateString("en-US") || "-"}</td><td className="px-3 py-2 font-semibold">{row.disease}</td><td className="px-3 py-2">{row.country}</td><td className="px-3 py-2 text-right font-mono">{row.cases.toLocaleString()}</td><td className="px-3 py-2 text-right font-mono">{row.deaths.toLocaleString()}</td></tr>)}</tbody></table></div>
    return null
  }

  return <div className="custom-report-print-root space-y-4"><style>{`@media print { body * { visibility: hidden !important; } .custom-report-print-root, .custom-report-print-root * { visibility: visible !important; } .custom-report-print-root { position: absolute; left: 0; top: 0; width: 100%; padding: 18px; } .custom-report-no-print { display: none !important; } }`}</style><div className="custom-report-no-print rounded-2xl border border-blue-200 bg-gradient-to-r from-[#0060A9] to-[#0b789d] p-5 text-white shadow-sm"><div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-cyan-100"><FileText className="h-4 w-4" /> Case reporting workspace</div><h2 className="mt-1 text-2xl font-black tracking-tight">Create Your Own Report</h2><p className="mt-1 max-w-2xl text-sm font-medium text-blue-100">Build a clean weekly or monthly case report from disease, location, and reporting-period data.</p></div><div className="flex flex-wrap gap-2">
            <Link
              href="/reports/executive?template=kemenkes_sitrep"
              target="_blank"
              className="inline-flex items-center gap-2 rounded-xl bg-amber-400 hover:bg-amber-300 px-3.5 py-2 text-xs font-black text-slate-900 shadow-md transition cursor-pointer active:scale-95"
              title="Open Official Situation Report ABVC (New Tab)"
            >
              <Sparkles className="h-4 w-4 text-slate-900" />
              <span>Open Executive Studio (AI & Human Edit)</span>
            </Link>
            <Link
              href="/reports/executive?template=asean_bulletin"
              target="_blank"
              className="inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/15 hover:bg-white/25 px-3 py-2 text-xs font-black text-white shadow-xs transition"
              title="Open ASEAN Media Monitoring Bulletin (New Tab)"
            >
              <FileText className="h-4 w-4 text-cyan-200" />
              <span>ASEAN Bulletin</span>
            </Link>
            <button type="button" onClick={resetBuilder} className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-xs font-black hover:bg-white/20"><RefreshCw className="h-4 w-4" /> Reset</button><button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-black text-[#0060A9] hover:bg-blue-50"><Printer className="h-4 w-4" /> Download Full Report</button></div></div></div><div className="custom-report-no-print rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-end gap-3"><div><label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Reporting cadence</label><div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">{(["weekly", "monthly"] as Cadence[]).map((value) => <button key={value} type="button" onClick={() => setCadence(value)} className={`rounded-lg px-4 py-2 text-xs font-black uppercase ${cadence === value ? "bg-[#0060A9] text-white shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>{value}</button>)}</div></div><label className="min-w-40 flex-1"><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">From date</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700" /></label><label className="min-w-40 flex-1"><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">To date</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700" /></label><label className="min-w-44 flex-1"><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Country</span><select value={country} onChange={(event) => setCountry(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"><option value="all">All countries</option>{countries.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="min-w-44 flex-1"><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Disease</span><select value={disease} onChange={(event) => setDisease(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"><option value="all">All diseases</option>{diseases.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div><div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs font-bold text-slate-500"><CalendarDays className="h-4 w-4 text-[#0060A9]" /> Charts are grouped by <span className="font-black text-[#0060A9]">{cadence === "weekly" ? "ISO week" : "calendar month"}</span><span className="ml-auto font-black text-slate-700">{filteredRows.length.toLocaleString()} case records</span></div></div><div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]"><aside className="custom-report-no-print rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-black uppercase tracking-wider text-slate-700">Widget library</h3><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-[#0060A9]">{widgets.length} added</span></div><div className="space-y-2">{WIDGETS.map((widget) => { const added = widgets.includes(widget.id); const Icon = widget.icon; return <div key={widget.id} draggable={!added} onDragStart={() => setDraggedWidget(widget.id)} className={`rounded-xl border p-2.5 ${added ? "border-slate-100 bg-slate-50 opacity-60" : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40"}`}><div className="flex items-start gap-2"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#0060A9]" /><div className="min-w-0 flex-1"><p className="text-xs font-black text-slate-800">{widget.label}</p><p className="mt-0.5 text-[10px] leading-4 text-slate-500">{widget.description}</p></div><button type="button" disabled={added} onClick={() => addWidget(widget.id)} className="rounded-lg p-1 text-[#0060A9] hover:bg-blue-100 disabled:opacity-30" title={added ? "Already added" : "Add widget"}>{added ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}</button></div></div> })}</div><div className="mt-4 rounded-xl bg-slate-50 p-2.5 text-[10px] font-medium leading-4 text-slate-500">Drag a widget into the report canvas. Use the arrows to change its order. Chart widgets can be exported individually as PNG.</div></aside><main onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedWidget) { addWidget(draggedWidget); setDraggedWidget(null) } }} className="min-w-0 rounded-2xl border border-dashed border-blue-200 bg-blue-50/30 p-3 sm:p-4">{loading ? <div className="flex min-h-72 items-center justify-center text-sm font-bold text-slate-500"><RefreshCw className="mr-2 h-5 w-5 animate-spin text-[#0060A9]" />Loading case data...</div> : widgets.length === 0 ? <div className="flex min-h-72 flex-col items-center justify-center text-center text-slate-500"><BarChart3 className="mb-2 h-10 w-10 text-slate-300" /><p className="font-black">Your report canvas is empty</p><p className="mt-1 text-xs">Add widgets from the library to begin.</p></div> : <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{widgets.map((id, index) => <WidgetCard key={id} definition={definitionFor(id)} chartRef={id === "trend" ? trendRef : id === "disease" ? diseaseRef : id === "country" ? countryRef : undefined} onRemove={() => setWidgets((current) => current.filter((value) => value !== id))} onMove={(direction) => moveWidget(id, direction)} canMoveUp={index > 0} canMoveDown={index < widgets.length - 1}>{renderWidget(id)}</WidgetCard>)}</div>}</main></div></div>
}
