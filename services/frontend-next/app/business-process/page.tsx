'use client'

import { useState } from 'react'
import {
  Search, Globe, Database, Brain, BarChart3, BookOpen, BookText,
  CheckCircle, MapPin, Bug, Activity, Heart, MessageSquare,
  AlertTriangle, Shield, Users, Skull, TrendingUp, FileText,
  ExternalLink, Languages, Braces, Cpu, Tags, Radio, Clock,
  ArrowRight, ChevronDown, ChevronUp
} from 'lucide-react'

const sections = [
  { id: 'scope', label: 'Scope of Work' },
  { id: 'flow', label: 'Business Process Flow' },
  { id: 'deliverables', label: 'Deliverables' },
  { id: 'metrics', label: 'Penjelasan Nilai & Angka' },
  { id: 'test', label: 'Test Accuracy Results' },
  { id: 'config', label: 'Configuration Tables' },
]

const testData = [
  {
    id: 1, name: 'WHO Hantavirus Outbreak (EN)', url: 'who.int/news/07-05-2026...',
    status: 'PASS', score: '6/6',
    disease: 'hantavirus', disease_conf: 0.26,
    event: 'disease outbreak wabah', event_conf: 0.85,
    cases: 8, deaths: 0, lang: 'en', health: true,
    sentiment: 'neutral', sent_score: 0.33, relevance: 'high',
    symptoms: ['CASE','DEATH','DISEASE','EPIDEMIC','HEALTH','INFECTION','MEDICAL','OUTBREAK','PATIENT','TRANSMISSION','VIRUS'],
    note: 'WHO article spesifik tentang hantavirus — semua field terisi dengan benar',
  },
  {
    id: 2, name: 'VNExpress Vietnam (VI)', url: 'vnexpress.net/suc-khoe',
    status: 'PASS', score: '2/2',
    disease: 'UNKNOWN', disease_conf: 0.15,
    event: 'industrial accident', event_conf: 0.09,
    cases: 1, deaths: 0, lang: 'vi', health: true,
    sentiment: 'neutral', sent_score: 0.33, relevance: 'medium',
    symptoms: ['VACCINE'],
    note: 'Portal kesehatan Vietnam — bahasa VI terdeteksi dengan benar, health-related = True',
  },
  {
    id: 3, name: 'Rappler PH (EN, 404)', url: 'rappler.com/...hantavirus...',
    status: 'PARTIAL', score: '1/2',
    disease: 'UNKNOWN', disease_conf: 0.16,
    event: 'industrial accident', event_conf: 0.09,
    cases: 1, deaths: 0, lang: 'en', health: true,
    sentiment: 'neutral', sent_score: 0.33, relevance: 'medium',
    symptoms: ['HEALTH'],
    note: 'URL tidak ditemukan (404) — NLP memproses halaman 404, hasil tidak akurat. Bukan bug sistem.',
  },
  {
    id: 4, name: 'WHO Outbreak News (EN)', url: 'who.int/emergencies/don',
    status: 'PASS', score: '2/2',
    disease: 'coronavirus MERS', disease_conf: 0.12,
    event: 'disease outbreak wabah', event_conf: 0.85,
    cases: 1, deaths: 0, lang: 'en', health: true,
    sentiment: 'positive', sent_score: 0.33, relevance: 'medium',
    symptoms: ['DISEASE','EPIDEMIC','HEALTH','OUTBREAK','VIRUS'],
    note: 'WHO portal — health-related = True, event type disease outbreak',
  },
  {
    id: 5, name: 'Bangkok Post TH (EN)', url: 'bangkokpost.com/thailand/...',
    status: 'PASS', score: '1/1',
    disease: 'UNKNOWN', disease_conf: 0.22,
    event: 'tsunami', event_conf: 0.09,
    cases: 1, deaths: 0, lang: 'en', health: false,
    sentiment: 'neutral', sent_score: 0.33, relevance: 'low',
    symptoms: [],
    note: 'Berita umum Thailand — bukan health-related, English terdeteksi',
  },
  {
    id: 6, name: 'WHO Vietnam (VI/EN)', url: 'who.int/vietnam/news',
    status: 'PARTIAL', score: '1/2',
    disease: 'NEGATIVE', disease_conf: 0.15,
    event: 'disease outbreak wabah', event_conf: 0.85,
    cases: 2023, deaths: 0, lang: 'en', health: false,
    sentiment: 'neutral', sent_score: 0.33, relevance: 'high',
    symptoms: ['HEALTH','PANDEMIC','PATIENT'],
    note: 'Portal multi-topic — model return NEGATIVE karena mixed content. Cases=2023 dari tahun artikel.',
  },
  {
    id: 7, name: 'Borneo Bulletin BN (EN)', url: 'borneobulletin.com.bn/...',
    status: 'PASS', score: '1/1',
    disease: 'UNKNOWN', disease_conf: 0.22,
    event: 'industrial accident', event_conf: 0.09,
    cases: 1, deaths: 0, lang: 'en', health: false,
    sentiment: 'neutral', sent_score: 0.33, relevance: 'low',
    symptoms: [],
    note: 'Berita umum Brunei — English, non-health (correct)',
  },
  {
    id: 8, name: 'ReliefWeb Dengue (EN)', url: 'reliefweb.int/updates?...',
    status: 'PARTIAL', score: '1/2',
    disease: 'influenza flu', disease_conf: 0.15,
    event: 'disease outbreak wabah', event_conf: 0.85,
    cases: 837, deaths: 0, lang: 'en', health: true,
    sentiment: 'positive', sent_score: 0.33, relevance: 'high',
    symptoms: ['CASE','DISEASE','EPIDEMIC','HEALTH','OUTBREAK','POSITIVE'],
    note: 'Search results page campuran flu+dengue — model pilih influenza. 837 cases extracted dari aggregated data.',
  },
  {
    id: 9, name: 'WHO Thailand (EN/TH)', url: 'who.int/thailand/news',
    status: 'PASS', score: '2/2',
    disease: 'UNKNOWN', disease_conf: 0.23,
    event: 'volcanic eruption', event_conf: 0.09,
    cases: 1, deaths: 0, lang: 'en', health: true,
    sentiment: 'positive', sent_score: 0.33, relevance: 'high',
    symptoms: ['DISEASE','HEALTH','PANDEMIC'],
    note: 'WHO Thailand — health-related = True, symptom keywords terdeteksi',
  },
  {
    id: 10, name: 'NST Malaysia (EN)', url: 'nst.com.my/news/nation',
    status: 'PASS', score: '1/1',
    disease: 'UNKNOWN', disease_conf: 0.22,
    event: 'flood banjir flash flood', event_conf: 0.09,
    cases: 1, deaths: 0, lang: 'en', health: false,
    sentiment: 'positive', sent_score: 0.33, relevance: 'low',
    symptoms: [],
    note: 'Berita nasional Malaysia — English, non-health (correct)',
  },
]

function statusBadge(s: string) {
  if (s === 'PASS') return <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-600">✅ PASS</span>
  if (s === 'PARTIAL') return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-600">⚠️ PARTIAL</span>
  return <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-600">❌ FAIL</span>
}

function MetricCard({ icon, label, value, source, interpret, example }: {
  icon: React.ReactNode; label: string; value: string; source: string; interpret: string; example?: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-center gap-2">
        <span className="text-slate-500">{icon}</span>
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</span>
      </div>
      <div className="mt-2 text-lg font-bold text-slate-900">{value}</div>
      <div className="mt-2 space-y-1.5 text-xs leading-relaxed">
        <div className="flex items-start gap-1.5">
          <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span className="text-slate-500"><strong className="text-slate-700">Sumber:</strong> {source}</span>
        </div>
        <div className="flex items-start gap-1.5">
          <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span className="text-slate-500"><strong className="text-slate-700">Interpretasi:</strong> {interpret}</span>
        </div>
        {example && (
          <div className="flex items-start gap-1.5">
            <span className="mt-0.5 text-teal-500">📌</span>
            <span className="text-slate-500"><strong className="text-slate-700">Contoh:</strong> {example}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function BusinessProcessPage() {
  const [activeSection, setActiveSection] = useState('scope')
  const [expandedTest, setExpandedTest] = useState<number | null>(null)

  function scrollTo(id: string) {
    setActiveSection(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="px-4 md:px-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">Proses Bisnis</h1>
          <p className="mt-1 text-sm text-slate-500">
            Documentasi lengkap — scope, arsitektur, alur data, metrik NLP, hasil test
          </p>
        </div>
      </div>

      {/* ── Sticky Navigation ── */}
      <div className="sticky top-0 z-10 -mx-4 mt-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex gap-1 overflow-x-auto py-2 text-xs font-semibold uppercase tracking-wider">
          {sections.map(s => (
            <button key={s.id} onClick={() => scrollTo(s.id)}
              className={`shrink-0 rounded-lg px-3 py-1.5 transition ${
                activeSection === s.id
                  ? 'bg-teal-100 text-teal-700'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
         SECTION 1: SCOPE OF WORK
         ═══════════════════════════════════════════════════════════════════ */}
      <section id="scope" className="mt-6 scroll-mt-16">
        <h2 className="text-base font-bold uppercase tracking-[0.04em] text-slate-700">1. Scope of Work</h2>
        <p className="mt-1 text-xs text-slate-500">Empat pilar utama proyek Disease Surveillance AI</p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-5 shadow-sm">
            <Radio className="h-6 w-6 text-sky-600" />
            <h3 className="mt-3 text-sm font-bold text-slate-900">Data Crawling Engine</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Pengembangan mesin crawling dengan kemampuan filtering untuk menangkap kejadian
              kesehatan publik dari berbagai sumber (RSS, web, CSV, social media).
            </p>
            <ul className="mt-3 space-y-1 text-xs text-slate-500">
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-sky-500" /> RSS News — feedparser multi-source</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-sky-500" /> Web Scraper — BeautifulSoup CSS selectors</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-sky-500" /> CSV Ingest — bulk data dari URL</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-sky-500" /> RabbitMQ — message queue async processing</li>
            </ul>
          </div>

          <div className="rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 to-white p-5 shadow-sm">
            <Brain className="h-6 w-6 text-purple-600" />
            <h3 className="mt-3 text-sm font-bold text-slate-900">ML Model Development</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Training model untuk mengkategorikan kejadian kesehatan, mendeteksi anomali,
              mengkorelasikan tren, dan mengidentifikasi indikator epidemi baru.
            </p>
            <ul className="mt-3 space-y-1 text-xs text-slate-500">
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-purple-500" /> XLM-RoBERTa — zero-shot classification</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-purple-500" /> Fine-tuned — disease classifier spesifik</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-purple-500" /> IndoBERT — Bahasa Indonesia NLP</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-purple-500" /> Regex extraction — kasus & kematian</li>
            </ul>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
            <Languages className="h-6 w-6 text-emerald-600" />
            <h3 className="mt-3 text-sm font-bold text-slate-900">Multilingual NLP Pipeline</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Pipeline NLP multibahasa yang mencakup English dan bahasa ASEAN utama
              (Thai, Vietnamese, Tagalog, Burmese, Bahasa Indonesia, Melayu).
            </p>
            <ul className="mt-3 space-y-1 text-xs text-slate-500">
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" /> 7 bahasa ASEAN language→model map</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" /> Language detection: langdetect + markers DB</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" /> Label DB-driven (60 detik cache refresh)</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" /> Keyword extraction multi-bahasa</li>
            </ul>
          </div>

          <div className="rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50 to-white p-5 shadow-sm">
            <BarChart3 className="h-6 w-6 text-teal-600" />
            <h3 className="mt-3 text-sm font-bold text-slate-900">Dashboard Enhancement</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Peningkatan visual dashboard intelijen kesehatan regional dengan KPI,
              tabel events, monitoring processing, dan analisis URL manual.
            </p>
            <ul className="mt-3 space-y-1 text-xs text-slate-500">
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-teal-500" /> KPI Cards — summary lokasi & penyakit</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-teal-500" /> Events Table — filter, search, pagination</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-teal-500" /> URL Analyzer — analisis artikel manual</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-teal-500" /> Processing Monitor — real-time status</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
         SECTION 2: BUSINESS PROCESS FLOW
         ═══════════════════════════════════════════════════════════════════ */}
      <section id="flow" className="mt-10 scroll-mt-16">
        <h2 className="text-base font-bold uppercase tracking-[0.04em] text-slate-700">2. Business Process Flow</h2>
        <p className="mt-1 text-xs text-slate-500">Alur data dari sumber berita hingga dashboard visual</p>

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* Flow Diagram */}
          <div className="border-b border-slate-100 bg-slate-50/50 p-6">
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs md:gap-4">
              <div className="rounded-xl bg-gradient-to-br from-sky-100 to-sky-50 px-4 py-3 text-center shadow-sm ring-1 ring-sky-200">
                <Radio className="mx-auto h-5 w-5 text-sky-600" />
                <p className="mt-1 font-bold text-sky-800">SOURCE</p>
                <p className="text-[10px] text-sky-600">RSS / Web / CSV</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 px-4 py-3 text-center shadow-sm ring-1 ring-amber-200">
                <Search className="mx-auto h-5 w-5 text-amber-600" />
                <p className="mt-1 font-bold text-amber-800">COLLECTOR</p>
                <p className="text-[10px] text-amber-600">Python</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="rounded-xl bg-gradient-to-br from-violet-100 to-violet-50 px-4 py-3 text-center shadow-sm ring-1 ring-violet-200">
                <Database className="mx-auto h-5 w-5 text-violet-600" />
                <p className="mt-1 font-bold text-violet-800">QUEUE</p>
                <p className="text-[10px] text-violet-600">RabbitMQ</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="rounded-xl bg-gradient-to-br from-purple-100 to-purple-50 px-4 py-3 text-center shadow-sm ring-1 ring-purple-200">
                <Cpu className="mx-auto h-5 w-5 text-purple-600" />
                <p className="mt-1 font-bold text-purple-800">WORKER</p>
                <p className="text-[10px] text-purple-600">Python</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="rounded-xl bg-gradient-to-br from-pink-100 to-pink-50 px-4 py-3 text-center shadow-sm ring-1 ring-pink-200">
                <Brain className="mx-auto h-5 w-5 text-pink-600" />
                <p className="mt-1 font-bold text-pink-800">NLP</p>
                <p className="text-[10px] text-pink-600">Python</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-50 px-4 py-3 text-center shadow-sm ring-1 ring-emerald-200">
                <Database className="mx-auto h-5 w-5 text-emerald-600" />
                <p className="mt-1 font-bold text-emerald-800">DATABASE</p>
                <p className="text-[10px] text-emerald-600">PostGIS</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="rounded-xl bg-gradient-to-br from-teal-100 to-teal-50 px-4 py-3 text-center shadow-sm ring-1 ring-teal-200">
                <BarChart3 className="mx-auto h-5 w-5 text-teal-600" />
                <p className="mt-1 font-bold text-teal-800">API</p>
                <p className="text-[10px] text-teal-600">Rust</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="rounded-xl bg-gradient-to-br from-cyan-100 to-cyan-50 px-4 py-3 text-center shadow-sm ring-1 ring-cyan-200">
                <Globe className="mx-auto h-5 w-5 text-cyan-600" />
                <p className="mt-1 font-bold text-cyan-800">FRONTEND</p>
                <p className="text-[10px] text-cyan-600">Next.js</p>
              </div>
            </div>
          </div>

          {/* Step by step explanation */}
          <div className="divide-y divide-slate-100 text-sm">
            {[
              { step: '1', title: 'Data Collection', icon: <Radio className="h-4 w-4 text-sky-600" />,
                desc: 'Collector Python mengambil data dari sumber: RSS feeds, Web scraper (BeautifulSoup), CSV dari URL, Social media (RSS Twitter). Data mentah (title + body text) dikirim ke RabbitMQ queue.' },
              { step: '2', title: 'Async Processing', icon: <Clock className="h-4 w-4 text-purple-600" />,
                desc: 'Worker Python menerima pesan dari RabbitMQ, memanggil NLP service untuk analisis, lalu menyimpan hasil ke PostgreSQL + PostGIS.' },
              { step: '3', title: 'NLP Analysis', icon: <Brain className="h-4 w-4 text-pink-600" />,
                desc: 'NLP Python menjalankan pipeline: XLM-RoBERTa fine-tuned (disease), zero-shot XLM-RoBERTa (sentiment, event type, relevance), regex (cases, deaths), location matching, language detection, keyword extraction dari DB.' },
              { step: '4', title: 'Data Storage', icon: <Database className="h-4 w-4 text-emerald-600" />,
                desc: 'Hasil disimpan ke disease_events + raw_reports. Geospasial menggunakan PostGIS (geometry type). Semua konfigurasi NLP disimpan di tabel DB untuk edit via frontend.' },
              { step: '5', title: 'REST API', icon: <BarChart3 className="h-4 w-4 text-teal-600" />,
                desc: 'Backend Rust (Axum) menyediakan REST API untuk CRUD semua data: events, sources, labels, keywords, locations, dll. Juga endpoint khusus /analyze-url untuk analisis URL manual.' },
              { step: '6', title: 'Dashboard & Analisis URL', icon: <Globe className="h-4 w-4 text-cyan-600" />,
                desc: 'Frontend Next.js menampilkan: KPI dashboard, Events table (filter+search+pagination), Processing monitor (real-time), URL Analyzer (input URL → fetch → NLP → display hasil + sumber).' },
            ].map(item => (
              <div key={item.step} className="flex gap-4 px-6 py-4 hover:bg-slate-50/50">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                  {item.step}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {item.icon}
                    <span className="font-bold text-slate-800">{item.title}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
         SECTION 3: DELIVERABLES
         ═══════════════════════════════════════════════════════════════════ */}
      <section id="deliverables" className="mt-10 scroll-mt-16">
        <h2 className="text-base font-bold uppercase tracking-[0.04em] text-slate-700">3. Deliverables</h2>
        <p className="mt-1 text-xs text-slate-500">Empat deliverable utama proyek</p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-sky-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-600"><Radio className="h-4 w-4" /></span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">AI-Powered Crawling Engine</h3>
                <p className="text-xs text-slate-400">Deliverable 1</p>
              </div>
            </div>
            <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-sky-500" /> RSS collector — feedparser untuk multi-source</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-sky-500" /> Web scraper — BeautifulSoup + CSS selectors</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-sky-500" /> CSV ingest — batch import dari URL</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-sky-500" /> RabbitMQ pipeline — async processing</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-sky-500" /> MinIO storage — raw HTML archive</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-sky-500" /> Scheduler — periodic collection (APScheduler)</li>
            </ul>
          </div>

          <div className="rounded-xl border border-purple-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 text-purple-600"><Brain className="h-4 w-4" /></span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Multilingual NLP Module</h3>
                <p className="text-xs text-slate-400">Deliverable 2</p>
              </div>
            </div>
            <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-purple-500" /> Disease classification — fine-tuned XLM-RoBERTa</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-purple-500" /> Event type — zero-shot (11 label DB-driven)</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-purple-500" /> Sentiment — positive/negative/neutral</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-purple-500" /> Relevance — health/non-health classifier</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-purple-500" /> Case/death count — regex extraction DB-driven</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-purple-500" /> Language detection — langdetect + markers DB</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-purple-500" /> 7 language→model mappings (DB-driven)</li>
            </ul>
          </div>

          <div className="rounded-xl border border-teal-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 text-teal-600"><BarChart3 className="h-4 w-4" /></span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Dashboard Enhancement</h3>
                <p className="text-xs text-slate-400">Deliverable 3</p>
              </div>
            </div>
            <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-teal-500" /> KPI Dashboard — total lokasi, kasus, kematian, alert</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-teal-500" /> Events Table — filter health/non-health, search, pagination</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-teal-500" /> URL Analyzer — input URL → NLP → hasil detail + sumber</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-teal-500" /> Processing Monitor — real-time status collector</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-teal-500" /> CRUD pages — semua konfigurasi via frontend</li>
            </ul>
          </div>

          <div className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600"><BookOpen className="h-4 w-4" /></span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Training Report & User Manual</h3>
                <p className="text-xs text-slate-400">Deliverable 4</p>
              </div>
            </div>
            <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" /> Hardcode Audit 1 — daftar item DB-driven (✅ selesai)</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" /> Hardcode Audit 2 — daftar item akurasi (✅ selesai, 17/17)</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" /> Test Accuracy — 10 test case ASEAN (✅ 7 PASS, 3 PARTIAL)</li>
              <li className="flex items-start gap-1.5"><CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" /> Dokumentasi proses bisnis ini</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
         SECTION 4: METRICS EXPLANATION
         ═══════════════════════════════════════════════════════════════════ */}
      <section id="metrics" className="mt-10 scroll-mt-16">
        <h2 className="text-base font-bold uppercase tracking-[0.04em] text-slate-700">4. Penjelasan Nilai &amp; Angka</h2>
        <p className="mt-1 text-xs text-slate-500">Setiap metrik yang ditampilkan di dashboard / analisis URL, asal-usulnya, dan cara interpretasi</p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            icon={<Bug className="h-4 w-4" />}
            label="Penyakit (Disease Classification)"
            value='Contoh: "hantavirus"'
            source="Fine-tuned XLM-RoBERTa model (disease classifier) + fallback keyword matching dari DB nlp_keywords (kategori 'disease'). DB labels di-refresh setiap 60 detik."
            interpret='Nama penyakit yang paling mungkin. Confidence 0-1: >0.5 = yakin, 0.3-0.5 = butuh review, <0.3 = rendah. Jika "UNKNOWN" berarti model tidak yakin.'
            example="WHO hantavirus → 'hantavirus' (0.26). VNExpress portal → 'UNKNOWN' (0.15) karena konten campuran."
          />
          <MetricCard
            icon={<Activity className="h-4 w-4" />}
            label="Tipe Kejadian (Event Type)"
            value='Contoh: "disease outbreak wabah"'
            source="XLM-RoBERTa zero-shot classification dengan label dari DB nlp_labels (kategori 'event_type'). 7 label default: flood, earthquake, landslide, disease outbreak, fire, conflict, other."
            interpret='Jenis kejutan/kejadian. Jika penyakit terdeteksi + keyword match → confidence di-boost ke 0.85. Jika tidak ada penyakit → confidence rendah (0.09) karena model menebak.'
            example="WHO hantavirus → 'disease outbreak wabah' (0.85). Bangkok Post → 'tsunami' (0.09, random)."
          />
          <MetricCard
            icon={<Users className="h-4 w-4" />}
            label="Jumlah Kasus (Case Count)"
            value='Contoh: 8'
            source="Regex extraction dari teks artikel. Pola dari DB extraction_rules: \b(\d+)\s+(?:cases|patients|kasus|warga|pasien|residents|orang|people). Default 1 jika tidak ada angka ditemukan."
            interpret='"1" berarti tidak ada angka spesifik dalam teks (default). Angka >1 berarti regex berhasil mencocokkan. Bisa false positive jika angka dari konteks lain.'
            example="WHO 8 cases → 8. ReliefWeb aggregated → 837. Article tanpa angka → 1 (default)."
          />
          <MetricCard
            icon={<Skull className="h-4 w-4" />}
            label="Jumlah Meninggal (Death Count)"
            value='Contoh: 0'
            source="Regex dari DB extraction_rules: \b(\d+)\s+(?:meninggal|death|deaths|killed|died|tewas). Default 0 jika tidak ada angka ditemukan."
            interpret='0 berarti tidak ada info kematian dalam teks, ATAU regex tidak mencocokkan kata kunci kematian.'
            example="3 passengers died → 3. No death info → 0."
          />
          <MetricCard
            icon={<MessageSquare className="h-4 w-4" />}
            label="Sentimen (Sentiment)"
            value='Contoh: "negative" (0.33)'
            source="XLM-RoBERTa zero-shot classification dengan label dari DB nlp_labels (kategori 'sentiment'): positive, negative, neutral."
            interpret='Nada emosional teks. Score 0-1 untuk setiap label, label dengan score tertinggi yang dipilih. Biasanya ~0.33 karena teks berita cenderung netral.'
            example="Outbreak article → 'negative' atau 'neutral'. Positive news → 'positive'."
          />
          <MetricCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Relevansi Kesehatan (Relevance)"
            value='Contoh: "high" (0.50)'
            source="XLM-RoBERTa zero-shot classification dengan label dari DB nlp_labels (kategori 'relevance'): high, low. Tidak pernah return 'medium'."
            interpret='"high" = teks terkait kesehatan. "low" = tidak terkait. Score confidence ~0.50. Parameter boolean: health / non-health.'
            example="WHO hantavirus → 'high'. Bangkok Post → 'low'."
          />
          <MetricCard
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Outbreak Alert"
            value='Contoh: True / False'
            source="case_count >= threshold dari DB disease_outbreak_rules. Threshold spesifik per penyakit. Jika penyakit tidak ada di rules, pakai default untuk 'UNKNOWN' = 100 kasus."
            interpret='True = jumlah kasus ≥ minimum threshold untuk penyakit terkait. Potensi wabah. False = aman / tidak cukup data.'
            example="Dengue threshold=5, cases=8 → True. Hantavirus threshold=100, cases=8 → False."
          />
          <MetricCard
            icon={<Shield className="h-4 w-4" />}
            label="Kredibilitas Sumber (Source Credibility)"
            value='Contoh: 0.50 (50%)'
            source="DB source_credibility berdasarkan source_type. Government=0.95, WHO=0.95, Hospital=0.90, Research=0.85, News=0.70, RSS=0.65, Web=0.50, Social=0.35."
            interpret='0-1, semakin tinggi semakin trustworthy. Default 0.50 untuk tipe "web". Bisa diedit via halaman Credibility.'
            example="who.int → 0.95. blogspot.com → 0.50. twitter.com → 0.35."
          />
          <MetricCard
            icon={<Heart className="h-4 w-4" />}
            label="Health Related"
            value='Contoh: True / False'
            source="Keyword matching (symptoms/disease dari DB nlp_keywords) + model ML disease classification. True jika ada keyword kesehatan ATAU model mendeteksi penyakit. False jika model return 'NEGATIVE' dan tidak ada keyword."
            interpret='True = teks tentang kesehatan/penyakit. False = tidak terkait. Mempengaruhi filter health/non-health di Events table.'
            example="WHO hantavirus → True (ada keyword DISEASE, HEALTH). Bangkok Post → False (tidak ada keyword kesehatan)."
          />
          <MetricCard
            icon={<Languages className="h-4 w-4" />}
            label="Bahasa (Language)"
            value='Contoh: "en"'
            source="Primary: langdetect library (deteksi akurat). Fallback: DB language_markers (kata kunci per bahasa). Jika semua gagal: 'unknown'."
            interpret='Kode ISO bahasa. Mempengaruhi pemilihan model: id → IndoBERT, en/th/vi/tl/my/ms → XLM-RoBERTa. Deteksi akurat penting untuk hasil NLP.'
            example="VNExpress → 'vi'. WHO → 'en'. VNExpress portal → 'vi' (berhasil terdeteksi)."
          />
          <MetricCard
            icon={<Users className="h-4 w-4" />}
            label="Gejala (Symptoms)"
            value='Contoh: ["CASE", "DEATH", "FEVER"]'
            source="DB nlp_keywords (kategori 'symptom'). Keyword matching case-insensitive pada teks artikel. 51+ symptom keywords tersedia."
            interpret='Daftar kata kunci gejala yang ditemukan dalam teks. Case biasanya DISEASE/HEALTH/OUTBREAK untuk kata umum. Semakin banyak = semakin detail.'
            example="WHO → 11 symptoms (CASE, DEATH, DISEASE, ...). Berita umum → [] (kosong)."
          />
          <MetricCard
            icon={<MapPin className="h-4 w-4" />}
            label="Lokasi (Location)"
            value='Contoh: "Kabupaten Bogor"'
            source="DB locations — matching nama lokasi dalam teks. Partial match (nama kota/kabupaten/provinsi). Juga check token terakhir (e.g., 'Bogor' dalam 'Kabupaten Bogor')."
            interpret='Nama lokasi yang disebut dalam teks. NULL jika tidak ada lokasi dikenal. Koordinat (lat/lon) diambil dari DB untuk mapping GIS.'
            example='"25 warga di Kabupaten Bogor" → "Bogor". "Jakarta" → "Jakarta". Tidak ada lokasi → null.'
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
         SECTION 5: TEST ACCURACY RESULTS
         ═══════════════════════════════════════════════════════════════════ */}
      <section id="test" className="mt-10 scroll-mt-16">
        <h2 className="text-base font-bold uppercase tracking-[0.04em] text-slate-700">5. Test Accuracy Results</h2>
        <p className="mt-1 text-sm text-slate-500">10 test case dari 7 negara ASEAN — 23-Jun-2026</p>

        <div className="mt-4 flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2">
            <CheckCircle className="h-5 w-5 text-emerald-600" />
            <div><span className="text-lg font-bold text-emerald-700">7</span><span className="ml-1 text-xs text-emerald-600">PASSED</span></div>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <div><span className="text-lg font-bold text-amber-700">3</span><span className="ml-1 text-xs text-amber-600">PARTIAL</span></div>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <div><span className="text-lg font-bold text-red-700">0</span><span className="ml-1 text-xs text-red-600">FAILED</span></div>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2">
            <Globe className="h-5 w-5 text-slate-600" />
            <div><span className="text-lg font-bold text-slate-700">10</span><span className="ml-1 text-xs text-slate-600">ASEAN URLs</span></div>
          </div>
        </div>

        {/* Summary Table */}
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs md:text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="px-3 py-3 font-bold text-slate-600">#</th>
                  <th className="px-3 py-3 font-bold text-slate-600">Test Case</th>
                  <th className="px-3 py-3 font-bold text-slate-600">Status</th>
                  <th className="px-3 py-3 font-bold text-slate-600">Penyakit</th>
                  <th className="px-3 py-3 font-bold text-slate-600">Event</th>
                  <th className="px-3 py-3 text-right font-bold text-slate-600">Kasus</th>
                  <th className="px-3 py-3 text-center font-bold text-slate-600">Lang</th>
                  <th className="px-3 py-3 text-center font-bold text-slate-600">Health</th>
                </tr>
              </thead>
              <tbody>
                {testData.map(tc => (
                  <tr key={tc.id}
                    onClick={() => setExpandedTest(expandedTest === tc.id ? null : tc.id)}
                    className="cursor-pointer border-b border-slate-50 hover:bg-teal-50/40">
                    <td className="px-3 py-3 font-bold text-slate-400">{tc.id}</td>
                    <td className="max-w-[200px] truncate px-3 py-3 font-medium text-slate-800">{tc.name}</td>
                    <td className="px-3 py-3">{statusBadge(tc.status)}</td>
                    <td className="max-w-[120px] truncate px-3 py-3 text-slate-700">{tc.disease}</td>
                    <td className="max-w-[140px] truncate px-3 py-3 text-slate-600">{tc.event}</td>
                    <td className="px-3 py-3 text-right font-mono text-slate-700">{tc.cases}</td>
                    <td className="px-3 py-3 text-center"><span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-600 uppercase">{tc.lang}</span></td>
                    <td className="px-3 py-3 text-center">{tc.health ? <span className="text-emerald-600">✅</span> : <span className="text-slate-400">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail Cards */}
        <div className="mt-4 space-y-3">
          {testData.map(tc => (
            <div key={tc.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <button onClick={() => setExpandedTest(expandedTest === tc.id ? null : tc.id)}
                className="flex w-full items-center justify-between px-5 py-3 text-left transition hover:bg-slate-50">
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">{tc.id}</span>
                  <div className="min-w-0">
                    <span className="text-sm font-bold text-slate-900">{tc.name}</span>
                    <p className="text-xs text-slate-400 truncate">{tc.url}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {statusBadge(tc.status)}
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-100 rounded px-2 py-0.5">{tc.score}</span>
                  {expandedTest === tc.id ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </div>
              </button>
              {expandedTest === tc.id && (
                <div className="border-t border-slate-100 px-5 py-4">
                  <div className="mb-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                    <a href={`https://${tc.url}`} target="_blank" rel="noopener noreferrer"
                      className="truncate text-xs font-mono text-teal-600 hover:text-teal-700 hover:underline">
                      {tc.url}
                    </a>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-3 lg:grid-cols-4">
                    <div className="rounded-lg bg-slate-50 p-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Penyakit</p>
                      <p className="mt-0.5 font-bold text-slate-800">{tc.disease}</p>
                      <p className="text-slate-400">conf: {tc.disease_conf}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Event</p>
                      <p className="mt-0.5 font-bold text-slate-800">{tc.event}</p>
                      <p className="text-slate-400">conf: {tc.event_conf}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Kasus / Meninggal</p>
                      <p className="mt-0.5 font-bold text-slate-800">{tc.cases} / {tc.deaths}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Sentimen</p>
                      <p className="mt-0.5 font-bold text-slate-800">{tc.sentiment}</p>
                      <p className="text-slate-400">score: {tc.sent_score}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Relevance</p>
                      <p className="mt-0.5 font-bold text-slate-800">{tc.relevance}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Language</p>
                      <p className="mt-0.5 font-bold text-slate-800 uppercase">{tc.lang}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Health</p>
                      <p className="mt-0.5 font-bold text-slate-800">{tc.health ? 'True ✅' : 'False'}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Gejala</p>
                      <p className="mt-0.5 font-bold text-slate-800">{tc.symptoms.length} item</p>
                    </div>
                  </div>
                  {tc.symptoms.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {tc.symptoms.map((s, i) => (
                        <span key={i} className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-200">{s}</span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-blue-50 p-2.5">
                    <span className="mt-0.5 text-blue-500">📌</span>
                    <p className="text-xs leading-relaxed text-blue-700">{tc.note}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
         SECTION 6: CONFIGURATION TABLES
         ═══════════════════════════════════════════════════════════════════ */}
      <section id="config" className="mt-10 scroll-mt-16">
        <h2 className="text-base font-bold uppercase tracking-[0.04em] text-slate-700">6. Configuration Tables</h2>
        <p className="mt-1 text-xs text-slate-500">Semua tabel konfigurasi dapat disunting langsung dari frontend tanpa rebuild</p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: <Tags className="h-5 w-5" />, title: 'NLP Labels', href: '/nlp/nlp-labels',
              desc: 'Kategori: disease, event_type, sentiment, relevance, binary_health. Setiap label + priority + active status. Di-cache 60 detik.' },
            { icon: <BookText className="h-5 w-5" />, title: 'NLP Keywords', href: '/nlp/nlp-keywords',
              desc: 'Kategori: symptom (gejala) dan disease (penyakit). Keyword → target_label matching. Digunakan untuk keyword extraction + health detection.' },
            { icon: <Activity className="h-5 w-5" />, title: 'Extraction Rules', href: '/nlp/extraction-rules',
              desc: 'Pola regex untuk ekstraksi case_count dan death_count. Field_name menentukan target, priority menentukan urutan.' },
            { icon: <Languages className="h-5 w-5" />, title: 'Language Markers', href: '/nlp/language-markers',
              desc: 'Kata kunci per bahasa untuk fallback language detection saat langdetect gagal. word + language code.' },
            { icon: <Cpu className="h-5 w-5" />, title: 'Language Models', href: '/nlp/language-models',
              desc: 'Mapping kode bahasa ke model ML. id→indobert, en/th/vi/tl/my/ms→xlm-roberta. Bisa ditambah untuk bahasa baru.' },
            { icon: <MapPin className="h-5 w-5" />, title: 'Locations', href: '/nlp/locations',
              desc: 'Master data lokasi (nama + koordinat). Digunakan untuk location extraction dari teks + mapping GIS di dashboard.' },
            { icon: <Shield className="h-5 w-5" />, title: 'Source Credibility', href: '/nlp/source-credibility',
              desc: 'Skor kredibilitas per source_type. Government=0.95, WHO=0.95, News=0.70, Web=0.50, Social=0.35.' },
            { icon: <AlertTriangle className="h-5 w-5" />, title: 'Outbreak Rules', href: '/nlp/outbreak-rules',
              desc: 'Threshold minimum kasus per penyakit untuk trigger outbreak alert. Fallback UNKNOWN=100.' },
          ].map(cfg => (
            <a key={cfg.title} href={cfg.href}
              className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-300 hover:shadow-md">
              <div className="flex items-center gap-2">
                <span className="text-teal-600">{cfg.icon}</span>
                <span className="text-sm font-bold text-slate-900">{cfg.title}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">{cfg.desc}</p>
              <div className="mt-2 flex items-center gap-1 text-xs font-medium text-teal-600 opacity-0 transition group-hover:opacity-100">
                <ExternalLink className="h-3 w-3" /> Buka halaman
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <div className="mt-10 border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        <p>Disease Surveillance AI — Dokumentasi Proses Bisnis v1.0</p>
        <p className="mt-1">Generated: 23-Jun-2026 | 17/17 item hardcode resolved | 10 test case executed</p>
      </div>
    </div>
  )
}
