'use client'

import { useState } from 'react'
import {
  Activity, AlertTriangle, ArrowRight, BarChart3, Brain, CheckCircle2,
  Database, FileText, Globe2, Languages, MapPin, Network, Radio,
  RefreshCw, Search, Server, ShieldCheck, Sparkles, Table2, Workflow,
} from 'lucide-react'

const sections = [
  ['overview', 'Overview'], ['flow', 'Process Flow'], ['nlp', 'NLP Pipeline'],
  ['surveillance', 'Surveillance Data'], ['dashboard', 'Dashboard & EWS'],
  ['operations', 'Operations'], ['api', 'API Reference'],
]

function Step({ icon: Icon, title, children, tone = 'sky' }: { icon: any; title: string; children: React.ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    sky: 'border-sky-200 from-sky-50 bg-sky-100 text-sky-700',
    violet: 'border-violet-200 from-violet-50 bg-violet-100 text-violet-700',
    emerald: 'border-emerald-200 from-emerald-50 bg-emerald-100 text-emerald-700',
    amber: 'border-amber-200 from-amber-50 bg-amber-100 text-amber-700',
    rose: 'border-rose-200 from-rose-50 bg-rose-100 text-rose-700',
    teal: 'border-teal-200 from-teal-50 bg-teal-100 text-teal-700',
  }
  const toneClass = tones[tone] || tones.sky
  return (
    <div className={`rounded-2xl border bg-gradient-to-br to-white p-5 shadow-sm ${toneClass}`}>
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${toneClass.split(' ').filter((c) => c.startsWith('bg-') || c.startsWith('text-')).join(' ')}`}><Icon className="h-5 w-5" /></div>
      <h3 className="text-sm font-black text-slate-900">{title}</h3>
      <p className="mt-2 text-xs leading-5 text-slate-600">{children}</p>
    </div>
  )
}

export default function BusinessProcessPage() {
  const [active, setActive] = useState('overview')
  const jump = (id: string) => { setActive(id); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }) }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-12 md:px-6">
      <header className="border-b border-slate-200 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#0060A9]">Disease Surveillance AI</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">Business Process &amp; System Architecture</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Current implementation reference for multilingual collection, local NLP, SKDR IBS/EBS, spatial dashboards, URL analysis, and early-warning workflows.</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Production pipeline</div>
        </div>
      </header>

      <nav className="sticky top-0 z-10 -mx-4 mt-4 overflow-x-auto border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex min-w-max gap-1">{sections.map(([id, label]) => <button key={id} onClick={() => jump(id)} className={`rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide transition ${active === id ? 'bg-[#0060A9]/10 text-[#0060A9]' : 'text-slate-500 hover:bg-slate-100'}`}>{label}</button>)}</div>
      </nav>

      <section id="overview" className="scroll-mt-16 pt-7">
        <h2 className="text-xl font-black text-slate-900">1. System Scope</h2>
        <p className="mt-1 text-sm text-slate-500">End-to-end flow from collection to operator decision support.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Step icon={Radio} title="Collection" tone="sky">RSS, web, CSV, social feeds, PDF, and SKDR API data are collected by collector-python. Web extraction prioritizes main content and uses Scrapling as a stealth/fallback fetcher when normal HTTP is blocked.</Step>
          <Step icon={Brain} title="Local NLP" tone="violet">The NLP service detects language, disease, location, cases, deaths, sentiment, relevance, and outbreak signals. Local models are loaded at startup to reduce external API cost.</Step>
          <Step icon={Database} title="Persistence" tone="emerald">The worker stores raw reports and normalized disease events in PostgreSQL/PostGIS through RabbitMQ. Deduplication and idempotent migrations protect data quality.</Step>
          <Step icon={BarChart3} title="Decision Support" tone="amber">The Rust backend provides dashboard aggregation, IBS/EBS charts, maps, AI summaries, EWS validation, matrices, and synchronous/asynchronous URL analysis.</Step>
        </div>
      </section>

      <section id="flow" className="scroll-mt-16 pt-9">
        <h2 className="text-xl font-black text-slate-900">2. Operational Process Flow</h2>
        <div className="mt-5 grid gap-3 lg:grid-cols-7">
          {[
            [Radio, 'Sources', 'Configured sources and schedules'], [Search, 'Collector', 'Clean main content'], [Network, 'RabbitMQ', 'Asynchronous queue'], [Brain, 'NLP', 'Classify and extract'], [Database, 'PostgreSQL', 'Store normalized data'], [Activity, 'Aggregation', 'IBS/EBS and dashboard'], [ShieldCheck, 'Action', 'Review and response'],
          ].map(([Icon, title, text], index) => <div key={title as string} className="relative flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm"><div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0060A9]/10 text-[#0060A9]"><Icon className="h-5 w-5" /></div><p className="mt-2 text-xs font-black text-slate-900">{title as string}</p><p className="mt-1 text-[11px] leading-4 text-slate-500">{text as string}</p>{index < 6 && <ArrowRight className="absolute -right-3 top-8 z-10 hidden h-5 w-5 text-slate-300 lg:block" />}</div>)}
        </div>
        <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/60 p-4 text-xs leading-5 text-blue-900"><b>Failure handling:</b> the collector retries with Scrapling/stealth; the worker retries RabbitMQ/NLP; analyze-url can create an asynchronous analysis job; if RabbitMQ is unavailable, the backend falls back to synchronous processing.</div>
      </section>

      <section id="nlp" className="scroll-mt-16 pt-9">
        <h2 className="text-xl font-black text-slate-900">3. NLP &amp; Content Quality</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Step icon={Globe2} title="Main-content extraction" tone="sky">Headers, navigation, footers, scripts, iframes, and unrelated blocks are removed. The retained article text is used by both the collector and analyze-url.</Step>
          <Step icon={Languages} title="Local translation" tone="emerald">NLLB-200 (configurable with TRANSLATION_LOCAL_MODEL) is initialized during service startup. Non-Latin ASEAN text is translated locally before disease and outbreak detection.</Step>
          <Step icon={Sparkles} title="Controlled AI fallback" tone="violet">DeepSeek/OpenAI is an optional fallback for unresolved locations or disease ontology. It cannot invent coordinates or override reliable local extraction.</Step>
          <Step icon={AlertTriangle} title="Outbreak decision" tone="amber">Health relevance, an explicit outbreak signal, disease classification, threshold comparison, and negative-reference checks are required. A case count alone is not an alert.</Step>
          <Step icon={FileText} title="Published-date policy" tone="rose">Dashboard periods use published_at. Missing publication dates are not silently replaced by created_at for dashboard alerts, preventing false alerts.</Step>
          <Step icon={RefreshCw} title="Re-analysis" tone="teal">Existing events can be reprocessed after label, translation, extraction-rule, or model changes using worker utilities.</Step>
        </div>
      </section>

      <section id="surveillance" className="scroll-mt-16 pt-9">
        <h2 className="text-xl font-black text-slate-900">4. SKDR IBS &amp; EBS Data</h2>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 text-sky-700"><Table2 className="h-5 w-5" /><h3 className="font-black">IBS — Indicator-Based Surveillance</h3></div><p className="mt-3 text-xs leading-5 text-slate-600">Routine indicator reports are read directly from <code>skdr_reports</code>. Province totals, cases, reports, status, and weekly trends are served by <code>/api/v1/skdr/ibs-summary</code>.</p></div>
          <div className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 text-blue-700"><Radio className="h-5 w-5" /><h3 className="font-black">EBS — Event-Based Surveillance</h3></div><p className="mt-3 text-xs leading-5 text-slate-600">Event and rumor reports are aggregated independently from <code>skdr_reports</code> through <code>/api/v1/skdr/ebs-summary</code>. These summaries feed charts without forcing every report through disease_events.</p></div>
        </div>
        <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">Both summary endpoints support year and province filters. Indexes in <code>database/init/041_skdr_summary_indexes.sql</code> accelerate endpoint/year/province queries.</p>
      </section>

      <section id="dashboard" className="scroll-mt-16 pt-9">
        <h2 className="text-xl font-black text-slate-900">5. Dashboard, Maps &amp; EWS</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Step icon={MapPin} title="Country scope" tone="sky">Home and detail-region apply country, year, source, and disease scope. Regional cards and Total Crawled are limited to the selected country.</Step>
          <Step icon={BarChart3} title="Public dashboard" tone="emerald"><code>/api/v1/public-dashboard</code> powers cases, deaths, locations, trends, sources, and AI summary used by home and detail-region.</Step>
          <Step icon={AlertTriangle} title="EWS validation" tone="amber">An alert is shown only when outbreak_alert is true, confidence meets policy, location and coordinates exist, and published_at falls in the selected period.</Step>
          <Step icon={Workflow} title="Operator action" tone="violet">Operators inspect source URL, main content, disease classification, matrix details, map layers, and channel status before response decisions.</Step>
        </div>
      </section>

      <section id="operations" className="scroll-mt-16 pt-9">
        <h2 className="text-xl font-black text-slate-900">6. Deployment &amp; Operations</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Step icon={Server} title="Services" tone="sky">frontend-next, backend-rust, nlp-python, collector-python, worker-python, RabbitMQ, and MinIO run through Docker Compose.</Step>
          <Step icon={Languages} title="Startup initialization" tone="emerald">NLP models are preloaded during startup. The backend runs every SQL file in <code>database/init</code> idempotently before listening.</Step>
          <Step icon={Database} title="Storage" tone="violet">PostgreSQL/PostGIS stores raw reports, normalized events, SKDR reports, locations, labels, rules, translation cache, and analysis jobs.</Step>
          <Step icon={RefreshCw} title="Scheduled jobs" tone="amber">Collector and SKDR sync can run from cron or a scheduler. Keep duplicate-safe dedupe keys and monitor worker/RabbitMQ health.</Step>
        </div>
        <pre className="mt-5 overflow-x-auto rounded-2xl bg-slate-900 p-5 text-xs leading-5 text-slate-100"><code>{`# build and start
docker compose up -d --build

# migrations normally run automatically at backend startup
docker compose up disease-init

# trigger collection from the API
curl -X POST /nlp/api/v1/sources/collect-all`}</code></pre>
      </section>

      <section id="api" className="scroll-mt-16 pt-9">
        <h2 className="text-xl font-black text-slate-900">7. API Reference</h2>
        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm"><table className="w-full min-w-[680px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Endpoint</th><th className="px-4 py-3">Purpose</th><th className="px-4 py-3">Consumer</th></tr></thead><tbody className="divide-y divide-slate-100">{[
          ['/api/v1/analyze-url', 'Analyze a URL; supports asynchronous jobs', 'Analyze URL page'], ['/api/v1/analysis-jobs/:id', 'Poll an asynchronous analysis result', 'Analyze URL page'], ['/api/v1/public-dashboard', 'Country/year/source dashboard aggregation', 'Home and detail-region'], ['/api/v1/crawling-stats?country=...', 'Country-scoped crawling KPI', 'Regional KPI cards'], ['/api/v1/skdr/ibs-summary', 'Direct IBS report aggregation', 'IBS chart and matrix'], ['/api/v1/skdr/ebs-summary', 'Direct EBS report aggregation', 'EBS chart and matrix'], ['/api/v1/spatial-heatmap', 'Spatial country/month aggregation', 'Map and analytics'],
        ].map(([endpoint, purpose, consumer]) => <tr key={endpoint}><td className="px-4 py-3 font-mono font-bold text-[#0060A9]">{endpoint}</td><td className="px-4 py-3 text-slate-600">{purpose}</td><td className="px-4 py-3 text-slate-500">{consumer}</td></tr>)}</tbody></table></div>
      </section>

      <footer className="mt-12 border-t border-slate-200 pt-5 text-xs text-slate-400"><p>Business Process Documentation — generated from the current NLP-PENYAKIT implementation.</p><p className="mt-1">Source of truth: service code, Docker Compose, REST routes, and database/init migrations.</p></footer>
    </div>
  )
}
