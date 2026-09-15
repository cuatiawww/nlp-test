'use client'

import { useState } from 'react'
import {
  Activity, AlertTriangle, ArrowRight, BarChart3, Brain, CheckCircle2,
  Database, FileText, Globe2, Languages, MapPin, Network, Radio,
  RefreshCw, Search, ShieldCheck, Sparkles, Table2, Workflow,
} from 'lucide-react'

const sections = [
  ['overview', 'Overview'], ['flow', 'Process Flow'], ['nlp', 'NLP Pipeline'],
  ['surveillance', 'Surveillance Data'], ['dashboard', 'Dashboard & EWS'],
  ['metrics', 'Metrics & Labels'], ['accuracy', 'Test Accuracy'],
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
            [Radio, 'Sources', 'Configured sources and schedules', 'sky'], [Search, 'Collector', 'Clean main content', 'violet'], [Network, 'RabbitMQ', 'Asynchronous queue', 'emerald'], [Brain, 'NLP', 'Classify and extract', 'amber'], [Database, 'PostgreSQL', 'Store normalized data', 'rose'], [Activity, 'Aggregation', 'IBS/EBS and dashboard', 'teal'], [ShieldCheck, 'Action', 'Review and response', 'blue'],
          ].map(([Icon, title, text, tone], index) => {
            const flowStyles: Record<string, string> = {
              sky: 'border-sky-200 bg-sky-50/70 text-sky-700', violet: 'border-violet-200 bg-violet-50/70 text-violet-700', emerald: 'border-emerald-200 bg-emerald-50/70 text-emerald-700', amber: 'border-amber-200 bg-amber-50/70 text-amber-700', rose: 'border-rose-200 bg-rose-50/70 text-rose-700', teal: 'border-teal-200 bg-teal-50/70 text-teal-700', blue: 'border-blue-200 bg-blue-50/70 text-blue-700',
            }
            const style = flowStyles[tone as string] || flowStyles.sky
            return <div key={title as string} className={`relative flex flex-col items-center rounded-2xl border p-4 text-center shadow-sm ${style}`}><div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/80"><Icon className="h-5 w-5" /></div><p className="mt-2 text-xs font-black text-slate-900">{title as string}</p><p className="mt-1 text-[11px] leading-4 text-slate-600">{text as string}</p>{index < 6 && <ArrowRight className="absolute -right-3 top-8 z-10 hidden h-5 w-5 text-slate-300 lg:block" />}</div>
          })}
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
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">SKDR IBS and EBS integrations are <b>detached</b> for now. Backend routes return HTTP 410, collectors do not schedule <code>skdr_api</code>, and the UI no longer calls IBS/EBS summary APIs. Historical <code>skdr_reports</code> rows remain in the database for a later reattach.</p>
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

      <section id="metrics" className="scroll-mt-16 pt-9">
        <h2 className="text-xl font-black text-slate-900">6. Metrics, Values &amp; Labels</h2>
        <p className="mt-1 text-sm text-slate-500">Definitions used consistently by Home, TV, Reports, Dashboard, and detail-region.</p>
        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Metric / label</th><th className="px-4 py-3">Value</th><th className="px-4 py-3">Meaning and display rule</th></tr></thead><tbody className="divide-y divide-slate-100">
            {[
              ['Total Crawled (All-Time)', 'integer ≥ 0', 'All raw reports collected for the selected country; not the same as processed events.'],
              ['Total Processed / Events', 'integer ≥ 0', 'Reports that have a normalized disease event or completed analysis.'],
              ['Total Cases / Deaths', 'integer ≥ 0 or 0', 'Sum of extracted or structured counts. Zero means no count was reported, not necessarily zero incidence.'],
              ['Confidence', '0.00–1.00', 'Model certainty. The UI renders it as a percentage; values below 0.50 are marked for review by the NLP service.'],
              ['Outbreak Alert', 'true / false', 'Boolean signal, not a severity level. It requires health relevance, explicit outbreak wording, a disease, a threshold match, and no negative reference.'],
              ['Critical / Warning / Normal', 'display label', 'Dashboard presentation of validated signals. A label is shown only after location, coordinates, confidence, and published-date period gates pass.'],
              ['published_at', 'ISO date or empty', 'Source publication date used for year/month filters and EWS. Missing dates are excluded from period alerts to avoid false positives.'],
              ['Disease / Location / Source', 'canonical label', 'Normalized ontology and location labels; UNKNOWN or empty values remain visible for data-quality review.'],
              ['IBS / EBS', 'report channel', 'Indicator-Based Surveillance and Event-Based Surveillance. Their charts aggregate skdr_reports directly and do not require disease_events.'],
            ].map(([label, value, meaning]) => <tr key={label}><td className="px-4 py-3 font-bold text-slate-800">{label}</td><td className="px-4 py-3 font-mono text-[#0060A9]">{value}</td><td className="px-4 py-3 leading-5 text-slate-600">{meaning}</td></tr>)}
          </tbody></table>
        </div>
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900"><b>Threshold note:</b> known diseases use the disease-specific rule stored in <code>disease_outbreak_rules</code>; when no rule exists, explicit outbreak wording uses <code>EXPLICIT_KNOWN_DISEASE_MIN_CASES=25</code> unless overridden by environment configuration. Unknown-disease rules are loaded from the database.</p>
      </section>

      <section id="accuracy" className="scroll-mt-16 pt-9">
        <h2 className="text-xl font-black text-slate-900">7. Test Accuracy Results</h2>
        <p className="mt-1 text-sm text-slate-500">Current repository tests validate deterministic behavior and data contracts. They are not a statistical model-accuracy benchmark.</p>
        <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[
            ['Main-content extraction', 'COVERED', 'Navigation, footer, scripts, and feed snippets are removed while article text is retained.', 'sky'],
            ['Cloudflare / fetch fallback', 'COVERED', 'Challenge pages are detected and Scrapling/stealth fallback is selected.', 'violet'],
            ['Published date extraction', 'COVERED', 'Structured and page metadata dates are normalized for period filtering.', 'emerald'],
            ['Case and death extraction', 'COVERED', 'Separators, Indonesian/English phrases, and case/death pairs are covered.', 'amber'],
            ['Outbreak rules', 'COVERED', 'Explicit signals pass; historical, policy-only, and negative references are rejected.', 'rose'],
            ['PDF routing and OCR fallback', 'COVERED', 'URL/content-type/magic-byte routing and extraction failure handling are covered.', 'teal'],
            ['Async analyze-url contract', 'COVERED', 'Completed, partial, failed, timeout, and fetch-failure job states are covered.', 'blue'],
            ['Entity relations', 'COVERED', 'Canonical disease and location relations are persisted from analyzed reports.', 'indigo'],
            ['Local translation startup', 'SMOKE', 'NLLB-200 is preloaded when enabled; translation quality is monitored separately from rule tests.', 'cyan'],
          ].map(([name, status, detail, tone]) => {
            const testStyles: Record<string, string> = {
              sky: 'border-sky-200 bg-sky-50/60', violet: 'border-violet-200 bg-violet-50/60', emerald: 'border-emerald-200 bg-emerald-50/60', amber: 'border-amber-200 bg-amber-50/60', rose: 'border-rose-200 bg-rose-50/60', teal: 'border-teal-200 bg-teal-50/60', blue: 'border-blue-200 bg-blue-50/60', indigo: 'border-indigo-200 bg-indigo-50/60', cyan: 'border-cyan-200 bg-cyan-50/60',
            }
            return <div key={name} className={`rounded-2xl border p-4 shadow-sm ${testStyles[tone as string] || testStyles.sky}`}><div className="flex items-center justify-between gap-2"><h3 className="text-xs font-black text-slate-900">{name}</h3><span className={`rounded-full px-2 py-1 text-[10px] font-black ${status === 'PASS' ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'}`}>{status}</span></div><p className="mt-2 text-xs leading-5 text-slate-600">{detail}</p></div>
          })}
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600"><b>Latest local verification:</b> NLP unit tests <code>37/37 passed</code>; frontend analyze-url contract tests <code>5/5 passed</code>. Collector tests are covered in the repository but require its service dependencies (for example <code>bs4</code> and <code>pdfplumber</code>). No single percentage is claimed because the repository does not contain a labeled benchmark dataset; production quality should be measured with a reviewed sample and confusion matrix.</div>
      </section>

      <footer className="mt-12 border-t border-slate-200 pt-5 text-xs text-slate-400"><p>Business Process Documentation — generated from the current NLP-PENYAKIT implementation.</p><p className="mt-1">Source of truth: service code, Docker Compose, REST routes, and database/init migrations.</p></footer>
    </div>
  )
}
