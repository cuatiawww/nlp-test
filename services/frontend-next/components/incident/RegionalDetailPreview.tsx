'use client'

import {
  Activity,
  AirVent,
  AlertTriangle,
  CalendarDays,
  CloudRain,
  MapPin,
  Newspaper,
  ShieldCheck,
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

const trendData = [
  { month: 'Jan 2026', cases: 42000, events: 18000, deaths: 420, cumulative: 42000 },
  { month: 'Feb 2026', cases: 51000, events: 22000, deaths: 510, cumulative: 93000 },
  { month: 'Mar 2026', cases: 74000, events: 31000, deaths: 690, cumulative: 167000 },
  { month: 'Apr 2026', cases: 62000, events: 28000, deaths: 570, cumulative: 229000 },
  { month: 'May 2026', cases: 88000, events: 36000, deaths: 760, cumulative: 317000 },
  { month: 'Jun 2026', cases: 124000, events: 49000, deaths: 980, cumulative: 441000 },
  { month: 'Jul 2026', cases: 109000, events: 44000, deaths: 870, cumulative: 550000 },
  { month: 'Aug 2026', cases: 128000, events: 52000, deaths: 1020, cumulative: 678000 },
  { month: 'Sep 2026', cases: 842837, events: 68000, deaths: 11558, cumulative: 938267 },
]

const diseases = [
  { name: 'Other specified lung infections', values: [2, 3, 6, 3, 4, 7, 4, 6, 8] },
  { name: 'Dengue', values: [1, 2, 3, 2, 3, 5, 3, 5, 7] },
  { name: 'Measles', values: [0, 0, 3, 0, 1, 4, 1, 2, 5] },
  { name: 'Influenza', values: [0, 0, 2, 0, 2, 4, 1, 2, 4] },
  { name: 'Rabies', values: [0, 0, 1, 0, 1, 2, 1, 2, 3] },
  { name: 'COVID-19', values: [0, 0, 0, 0, 1, 2, 1, 1, 2] },
  { name: 'Malaria', values: [0, 0, 0, 0, 1, 1, 1, 1, 2] },
]

const mapSignals = [
  { name: 'Jakarta', x: '49%', y: '64%', value: 'High', color: '#e11d48' },
  { name: 'West Java', x: '43%', y: '70%', value: 'Moderate', color: '#f97316' },
  { name: 'East Java', x: '64%', y: '78%', value: 'Moderate', color: '#f97316' },
  { name: 'South Sulawesi', x: '78%', y: '53%', value: 'Low', color: '#0f766e' },
  { name: 'North Sumatra', x: '20%', y: '30%', value: 'Low', color: '#0f766e' },
]

const environmentalMetrics: Array<{ label: string; value: string; detail: string; icon: LucideIcon; tone: string }> = [
  { label: 'Rainfall / precipitation', value: '182 mm', detail: 'Monthly regional average', icon: CloudRain, tone: 'border-cyan-200 bg-cyan-50 text-cyan-800' },
  { label: 'AQI / air quality', value: '68', detail: 'Moderate', icon: AirVent, tone: 'border-amber-200 bg-amber-50 text-amber-800' },
  { label: 'PM2.5', value: '21 µg/m³', detail: '24-hour average', icon: Wind, tone: 'border-violet-200 bg-violet-50 text-violet-800' },
  { label: 'Temperature', value: '28.4 °C', detail: 'Monthly average', icon: Thermometer, tone: 'border-orange-200 bg-orange-50 text-orange-800' },
]

const trackedDiseaseProfiles = [
  { name: 'Other specified lung infections', cases: '826,464', deaths: '9,842', cfr: '1.19%', status: 'High activity', tone: 'border-rose-200 bg-rose-50/60 text-rose-800' },
  { name: 'Dengue', cases: '48,320', deaths: '214', cfr: '0.44%', status: 'Elevated', tone: 'border-orange-200 bg-orange-50/60 text-orange-800' },
  { name: 'Measles', cases: '12,506', deaths: '37', cfr: '0.30%', status: 'Monitoring', tone: 'border-amber-200 bg-amber-50/60 text-amber-800' },
  { name: 'Influenza', cases: '8,940', deaths: '61', cfr: '0.68%', status: 'Monitoring', tone: 'border-teal-200 bg-teal-50/60 text-teal-800' },
]

const hotNews = [
  { source: 'Ministry of Health', title: 'Respiratory illness signals remain under enhanced regional monitoring', time: '2 hours ago' },
  { source: 'Jakarta Health Office', title: 'Dengue prevention response expanded across high-risk districts', time: '5 hours ago' },
  { source: 'WHO Indonesia', title: 'Seasonal surveillance partners review community reporting trends', time: 'Yesterday' },
  { source: 'West Java Health Office', title: 'Measles case-finding activities continue in priority areas', time: 'Yesterday' },
]

function intensityClass(value: number) {
  if (value >= 7) return 'bg-[#063b5b] text-white'
  if (value >= 5) return 'bg-blue-600 text-white'
  if (value >= 3) return 'bg-sky-300 text-sky-950'
  if (value > 0) return 'bg-sky-50 text-sky-800'
  return 'bg-slate-50 text-slate-300'
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

export default function RegionalDetailPreview() {
  return (
    <main className="min-h-screen bg-[#f8fafc] px-4 py-5 text-slate-900 md:px-6 md:py-7">
      <div className="mx-auto w-full max-w-[1600px] space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-20 place-items-center rounded-xl border border-slate-200 bg-gradient-to-b from-red-500 via-red-500 to-white text-2xl shadow-sm">🇮🇩</div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0060A9]">Regional surveillance profile</p>
                <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Indonesia</h1>
                <p className="mt-1 text-sm font-medium text-slate-500">Disease indicators, environmental context, and mapped surveillance signals.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
              <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><CalendarDays className="h-4 w-4 text-[#0060A9]" /> January–September 2026</span>
              <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800"><ShieldCheck className="h-4 w-4" /> Static design preview</span>
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex flex-col gap-2 border-b border-slate-100 pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#0060A9]">Regional context</p>
              <h2 className="mt-1 text-xl font-black">Regional Characteristics</h2>
              <p className="mt-1 max-w-3xl text-sm font-medium leading-relaxed text-slate-500">A contextual view of why particular diseases may be observed in this region, supported by environmental and population indicators.</p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800"><AlertTriangle className="h-4 w-4" /> Context indicators are illustrative</span>
          </div>
          <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-5">
              <div className="flex items-center gap-2 text-sm font-black text-[#0060A9]"><Activity className="h-4 w-4" /> Why these signals may occur</div>
              <p className="mt-3 text-sm font-medium leading-6 text-slate-700">The current profile is influenced by population density in urban areas, seasonal rainfall, local mobility, and different levels of access to reporting facilities. Respiratory infections and vector-borne diseases therefore require different surveillance attention across provinces.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <MetricCard label="Top cases" value="826,464" detail="Lung infections" tone="border-blue-200 bg-white/85 text-[#0060A9]" />
                <MetricCard label="Deaths" value="9,842" detail="Tracked diseases" tone="border-rose-200 bg-white/85 text-rose-800" />
                <MetricCard label="CFR" value="1.19%" detail="Current profile" tone="border-violet-200 bg-white/85 text-violet-800" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {environmentalMetrics.map(({ label, value, detail, icon: MetricIcon, tone }) => (
                <div key={label} className={`rounded-xl border p-4 ${tone}`}><MetricIcon className="h-5 w-5" /><p className="mt-3 text-[10px] font-black uppercase tracking-wider">{label}</p><p className="mt-1 text-2xl font-black text-slate-900">{value}</p><p className="mt-1 text-xs font-semibold opacity-75">{detail}</p></div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="border-b border-slate-100 pb-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#0060A9]">Disease intelligence</p><h2 className="mt-1 text-xl font-black">Tracked Disease Profiles</h2><p className="mt-1 text-sm font-medium text-slate-500">Current case, death, and case fatality indicators for diseases observed in this region.</p></div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{trackedDiseaseProfiles.map((disease) => <article key={disease.name} className={`rounded-xl border p-4 ${disease.tone}`}><div className="flex items-start justify-between gap-3"><h3 className="text-sm font-black leading-5 text-slate-900">{disease.name}</h3><span className="shrink-0 rounded-full bg-white/80 px-2 py-1 text-[10px] font-black">{disease.status}</span></div><div className="mt-5 grid grid-cols-3 gap-2"><div><p className="text-[10px] font-bold uppercase tracking-wide opacity-70">Cases</p><p className="mt-1 text-lg font-black text-slate-900">{disease.cases}</p></div><div><p className="text-[10px] font-bold uppercase tracking-wide opacity-70">Deaths</p><p className="mt-1 text-lg font-black text-slate-900">{disease.deaths}</p></div><div><p className="text-[10px] font-bold uppercase tracking-wide opacity-70">CFR</p><p className="mt-1 text-lg font-black text-slate-900">{disease.cfr}</p></div></div></article>)}</div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 sm:px-7"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#047D78] text-white"><Newspaper className="h-4 w-4" /></span><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#0060A9]">Regional media watch</p><h2 className="mt-0.5 text-lg font-black">Hot News in Indonesia</h2></div><span className="ml-auto rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-black text-rose-700">Live preview</span></div>
          <div className="regional-news-track flex w-max gap-3 px-5 py-4 sm:px-7">{[...hotNews, ...hotNews].map((news, index) => <article key={`${news.title}-${index}`} className="w-[280px] rounded-xl border border-slate-200 bg-slate-50 p-4 sm:w-[340px]"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-black uppercase tracking-wide text-[#047D78]">{news.source}</span><span className="text-[10px] font-semibold text-slate-400">{news.time}</span></div><h3 className="mt-2 text-sm font-black leading-5 text-slate-800">{news.title}</h3><p className="mt-3 text-[10px] font-bold text-slate-400">Regional disease monitoring</p></article>)}</div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#0060A9]">Spatial surveillance</p><h2 className="mt-1 text-xl font-black">Integrated Regional Surveillance Map</h2><p className="mt-1 text-sm font-medium text-slate-500">Disease signals and supporting environmental layers for Indonesia.</p></div>
            <div className="flex flex-wrap gap-2"><span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">Disease signals</span><span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">Environment</span><span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">Rainfall</span></div>
          </div>
          <div className="mt-5">
            <div className="relative min-h-[420px] w-full overflow-hidden rounded-xl border border-slate-200 bg-[#eaf4f7]">
              <div className="absolute inset-0 opacity-60" style={{ backgroundImage: 'linear-gradient(#c6dde2 1px, transparent 1px), linear-gradient(90deg, #c6dde2 1px, transparent 1px)', backgroundSize: '42px 42px' }} />
              <div className="absolute left-[16%] top-[17%] h-[68%] w-[70%] rotate-[-8deg] rounded-[48%_52%_45%_55%] border-2 border-[#0060A9]/40 bg-[#bde5eb]/70" />
              <div className="absolute left-[32%] top-[58%] h-12 w-[45%] rotate-[5deg] rounded-[50%] border-2 border-[#0060A9]/50 bg-[#9bd5df]" />
              <div className="absolute left-[69%] top-[30%] h-28 w-16 rotate-[22deg] rounded-[50%] border-2 border-[#0060A9]/40 bg-[#bde5eb]/80" />
              {mapSignals.map((signal) => <div key={signal.name} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: signal.x, top: signal.y }}><span className="block h-4 w-4 animate-pulse rounded-full border-2 border-white shadow-md" style={{ backgroundColor: signal.color }} /><span className="absolute left-5 top-0 whitespace-nowrap rounded-md bg-white px-2 py-1 text-[10px] font-black text-slate-700 shadow-sm">{signal.name}</span></div>)}
              <div className="absolute left-4 top-4 rounded-lg bg-white/90 px-3 py-2 text-xs font-black text-slate-700 shadow-sm"><MapPin className="mr-1 inline h-3.5 w-3.5 text-[#0060A9]" /> Indonesia</div>
              <div className="absolute bottom-4 left-4 flex flex-wrap gap-3 rounded-lg bg-white/90 px-3 py-2 text-[10px] font-bold text-slate-600 shadow-sm"><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-rose-600" />High</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-orange-500" />Moderate</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-teal-700" />Low</span></div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12 lg:gap-8">
            <div className="flex flex-col justify-between space-y-4 lg:col-span-4"><div><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-black leading-snug sm:text-xl">Case Trends &amp; Epidemiological Surveillance</h2><p className="mt-1 text-xs font-medium leading-relaxed text-slate-500 sm:text-sm">Monthly case dynamics, case fatality ratio (CFR), and disease distribution in Indonesia.</p></div><button type="button" className="shrink-0 rounded-xl bg-[#047D78] px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-white shadow-sm">View matrix</button></div><div className="mt-4 grid grid-cols-2 gap-3"><MetricCard label="Deaths / CFR" value="11,558" detail="Deaths (1.23%)" tone="border-rose-200/80 bg-rose-50/70 text-rose-900" /><MetricCard label="Monthly cases (Sep 2026)" value="842,837" detail="New cases" tone="border-orange-200/80 bg-orange-50/70 text-orange-900" /><MetricCard label="Active signals" value="8" detail="Active signals" tone="border-amber-200/80 bg-amber-50/70 text-amber-900" /><MetricCard label="Cumulative cases" value="938,267" detail="Detected" tone="border-teal-200/80 bg-teal-50/70 text-teal-900" /></div></div><div className="rounded-xl border border-teal-200 bg-teal-50/90 p-4 text-xs font-medium leading-relaxed text-teal-950 sm:text-sm"><div className="flex items-center gap-2 text-sm font-black text-teal-900"><Activity className="h-4 w-4 text-[#047d78]" /> Epidemiological Surveillance Insight</div><p className="mt-1.5">Validated surveillance data indicates that the highest concentration of cases is associated with Other specified lung infections (826,464 cases). There are currently 8 active signals according to the validation rules.</p></div></div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5 lg:col-span-8"><div className="mb-3 flex flex-wrap items-center gap-1.5 border-b border-slate-200/80 pb-3 text-xs"><span className="mr-1 hidden text-[11px] font-bold text-slate-500 sm:inline">Series:</span>{[['Reported Cases', 'bg-orange-50 text-orange-700 border-orange-300'], ['Reported Events', 'bg-teal-50 text-teal-800 border-teal-300'], ['Deaths', 'bg-rose-50 text-rose-700 border-rose-300'], ['Cumulative Total', 'bg-slate-800 text-white border-slate-900']].map(([label, style]) => <button type="button" key={label} className={`rounded-lg border px-2.5 py-1 font-bold ${style}`}><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-current" />{label}</button>)}<button type="button" className="rounded-md px-2 py-1 font-bold text-slate-500">Reset</button></div><div className="h-[320px] w-full sm:h-[350px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={trendData} margin={{ top: 20, right: 25, left: 10, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="month" tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }} /><YAxis tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} tickFormatter={(value) => Number(value) >= 1000 ? `${Math.round(Number(value) / 1000)}k` : String(value)} /><Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #cbd5e1', fontSize: 11, fontWeight: 700 }} /><Line type="monotone" dataKey="cases" name="Reported Cases" stroke="#f97316" strokeWidth={2.5} dot={{ r: 3.5, fill: '#f97316' }} /><Line type="monotone" dataKey="events" name="Reported Events" stroke="#047d78" strokeWidth={2.5} dot={{ r: 3.5, fill: '#047d78' }} /><Line type="monotone" dataKey="deaths" name="Deaths" stroke="#e11d48" strokeWidth={2} dot={{ r: 3.5, fill: '#e11d48' }} /><Line type="monotone" dataKey="cumulative" name="Cumulative Total" stroke="#1e293b" strokeWidth={2} strokeDasharray="4 4" dot={false} /></LineChart></ResponsiveContainer></div></div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-start lg:justify-between"><div><h2 className="text-lg font-black sm:text-xl">Seasonal Patterns</h2><p className="mt-1 text-xs font-medium leading-relaxed text-slate-500 sm:text-sm">Monthly disease intensity across the available publication period.</p></div><div className="flex items-center gap-2"><div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1"><button type="button" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-900 shadow-sm">Table</button><button type="button" className="rounded-lg bg-[#047D78] px-3 py-1.5 text-xs font-bold text-white">Chart</button></div><button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">Enter full-screen</button></div></div>
          <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-bold"><span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-600">18 diseases</span><span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-600">9 time points</span><span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-800">Highest intensity: Other specified lung infections / Sep 2026</span></div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 p-4"><div className="min-w-[760px]"><div className="grid grid-cols-[175px_repeat(9,minmax(55px,1fr))] gap-1 text-[10px] font-black text-slate-400"><div>DISEASE</div>{trendData.map((point) => <div key={point.month} className="text-center">{point.month.split(' ')[0]}</div>)}</div>{diseases.map((disease) => <div key={disease.name} className="mt-1 grid grid-cols-[175px_repeat(9,minmax(55px,1fr))] gap-1"><div className="truncate py-2 pr-2 text-xs font-black text-slate-700">{disease.name}</div>{disease.values.map((value, index) => <div key={`${disease.name}-${index}`} className={`h-8 rounded-sm border border-white ${intensityClass(value)}`} title={`${disease.name}: ${value}`} />)}</div>)}</div></div>
        </section>
      </div>
    </main>
  )
}
