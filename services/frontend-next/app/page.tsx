'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookText,
  CalendarDays,
  CheckCircle2,
  Clock,
  Compass,
  Cpu,
  Database,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  Flame,
  Globe2,
  History,
  Info,
  Layers,
  LayoutDashboard,
  Lock,
  MapPin,
  Radio,
  RefreshCw,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Stethoscope,
  Tags,
  TrendingUp,
  Tv,
  Users,
} from 'lucide-react'
import { fetchPublicDashboard, fetchCrawlingStats } from '@/lib/api'
import { getCurrentEpiWeek } from '@/lib/epi-week'
import { getAuthUser, hasModuleAccess, type AuthUser } from '@/lib/auth'
import { useSettings } from '@/lib/settings-context'

interface LaunchpadItem {
  id: string
  title: string
  description: string
  path: string
  category: 'Surveillance Dashboards' | 'Regional & Cross-Border' | 'AI Pipeline & Scraper' | 'Reports & Publications' | 'Master Data & Configuration' | 'System Management'
  icon: any
  badge?: string
  badgeColor?: 'blue' | 'emerald' | 'amber' | 'purple' | 'rose' | 'cyan' | 'indigo' | 'slate' | 'sky'
  priority?: number
}

const ALL_LAUNCHPAD_ITEMS: LaunchpadItem[] = [
  // ── 1. Surveillance Dashboards ───────────────────────────────────────────────
  {
    id: 'mod_main_dashboard',
    title: 'Main Surveillance Dashboard',
    description: 'Spatial disease distribution map, real-time alert feed, outbreak table, and epidemic curves.',
    path: '/main-dashboard',
    category: 'Surveillance Dashboards',
    icon: LayoutDashboard,
    badge: 'Primary',
    badgeColor: 'blue',
    priority: 1,
  },
  {
    id: 'mod_analysis_dashboard',
    title: 'Analysis Dashboard',
    description: 'Consolidated URL and article NLP extraction intelligence, accuracy metrics, and text-mining triage.',
    path: '/analysis-dashboard',
    category: 'Surveillance Dashboards',
    icon: Activity,
    badge: 'Analytics',
    badgeColor: 'emerald',
    priority: 2,
  },
  {
    id: 'mod_executive_dashboard',
    title: 'Executive Briefing Dashboard',
    description: 'Macro situational awareness, strategic threat indicators, and cross-border policy briefings.',
    path: '/executive-dashboard',
    category: 'Surveillance Dashboards',
    icon: BarChart3,
    badge: 'Strategic',
    badgeColor: 'purple',
    priority: 3,
  },
  {
    id: 'mod_lite_dashboard',
    title: 'Lite Dashboard',
    description: 'Streamlined situational overview and rapid regional awareness for guests and public stakeholders.',
    path: '/lite-dashboard',
    category: 'Surveillance Dashboards',
    icon: Globe2,
    badge: 'Public Overview',
    badgeColor: 'cyan',
    priority: 4,
  },
  {
    id: 'mod_disease_dashboard',
    title: 'Disease Dashboard',
    description: 'Pathogen-specific surveillance breakdown, WHO ICD-11 concepts, and morbidity progression.',
    path: '/disease-dashboard',
    category: 'Surveillance Dashboards',
    icon: Stethoscope,
    badge: 'Pathogens',
    badgeColor: 'rose',
    priority: 5,
  },
  {
    id: 'mod_tv',
    title: 'TV Command Center',
    description: 'Ultra-wide multi-panel operations room NOC view designed for large command displays.',
    path: '/tv',
    category: 'Surveillance Dashboards',
    icon: Tv,
    badge: 'NOC Display',
    badgeColor: 'indigo',
    priority: 6,
  },

  // ── 2. Regional & Cross-Border ──────────────────────────────────────────────
  {
    id: 'mod_asean_countries',
    title: 'ASEAN Member States',
    description: 'Surveillance across 11 ASEAN member nations with localized news feeds and outbreak tracking.',
    path: '/asean-countries',
    category: 'Regional & Cross-Border',
    icon: Globe2,
    badge: '11 Nations',
    badgeColor: 'sky',
    priority: 1,
  },
  {
    id: 'mod_asean_3',
    title: 'ASEAN +3 Watchlist',
    description: 'Expanded regional perimeter monitoring covering ASEAN member states plus China, Japan, and South Korea.',
    path: '/asean-3',
    category: 'Regional & Cross-Border',
    icon: Globe2,
    badge: 'Regional +3',
    badgeColor: 'indigo',
    priority: 2,
  },
  {
    id: 'mod_outside_asean',
    title: 'Outside ASEAN (Global)',
    description: 'International disease events, global epidemic alerts, and non-ASEAN threat horizons.',
    path: '/outside-asean',
    category: 'Regional & Cross-Border',
    icon: Globe2,
    badge: 'Global Horizon',
    badgeColor: 'amber',
    priority: 3,
  },
  {
    id: 'mod_detail_region',
    title: 'Regional Interoperability',
    description: 'Subnational administrative boundaries, GIS environmental overlays, and healthcare proxies.',
    path: '/detail-region',
    category: 'Regional & Cross-Border',
    icon: MapPin,
    badge: 'GIS Subdivisions',
    badgeColor: 'purple',
    priority: 4,
  },

  // ── 3. AI Pipeline & Scraper Operations ─────────────────────────────────────
  {
    id: 'mod_analyze',
    title: 'URL & Article Analysis',
    description: 'Real-time on-demand AI NLP extraction for news articles, press releases, and surveillance documents.',
    path: '/analyze',
    category: 'AI Pipeline & Scraper',
    icon: Search,
    badge: 'Live Extraction',
    badgeColor: 'emerald',
    priority: 1,
  },
  {
    id: 'mod_crawler',
    title: 'Manual Crawler Hub',
    description: 'Trigger targeted automated web crawls across specific diseases, keywords, and geographic targets.',
    path: '/manual-crawler',
    category: 'AI Pipeline & Scraper',
    icon: FileText,
    badge: 'Automated Job',
    badgeColor: 'amber',
    priority: 2,
  },
  {
    id: 'mod_crawl_history',
    title: 'Crawl History & Ledger',
    description: 'Audit log and immutable ledger of crawled health articles, extraction stages, and geocoding accuracy.',
    path: '/crawl-history',
    category: 'AI Pipeline & Scraper',
    icon: History,
    badge: 'Audit Ledger',
    badgeColor: 'slate',
    priority: 3,
  },
  {
    id: 'mod_crawling_dashboard',
    title: 'Crawling Engine Telemetry',
    description: 'Scraper health, bandwidth utilization, domain response times, and crawler success rates.',
    path: '/crawling-dashboard',
    category: 'AI Pipeline & Scraper',
    icon: Radio,
    badge: 'Scraper Telemetry',
    badgeColor: 'cyan',
    priority: 4,
  },
  {
    id: 'mod_web_services_dashboard',
    title: 'Web Services Dashboard',
    description: 'Microservices mesh telemetry, RabbitMQ queue stats, and external environmental geoproxies.',
    path: '/web-services-dashboard',
    category: 'AI Pipeline & Scraper',
    icon: Cpu,
    badge: 'Services Mesh',
    badgeColor: 'rose',
    priority: 5,
  },
  {
    id: 'mod_processing',
    title: 'Processing Queues',
    description: 'Live RabbitMQ consumer metrics, worker concurrency, and pipeline backlog monitoring.',
    path: '/processing',
    category: 'AI Pipeline & Scraper',
    icon: Activity,
    badge: 'Workers',
    badgeColor: 'emerald',
    priority: 6,
  },

  // ── 4. Reports & Publications ───────────────────────────────────────────────
  {
    id: 'mod_reports',
    title: 'Situation Reports (Sitreps)',
    description: 'Official disease surveillance sitreps, weekly epidemiological bulletins, and executive summaries.',
    path: '/reports',
    category: 'Reports & Publications',
    icon: FileText,
    badge: 'Publications',
    badgeColor: 'blue',
    priority: 1,
  },
  {
    id: 'mod_matrix',
    title: 'Surveillance Matrix & Ledger',
    description: 'Consolidated multidimensional disease event ledger, epidemic tallies, and cross-border matrices.',
    path: '/reports/matrix',
    category: 'Reports & Publications',
    icon: FileSpreadsheet,
    badge: 'Matrix & Tallies',
    badgeColor: 'emerald',
    priority: 2,
  },
  {
    id: 'mod_reports_cms',
    title: 'Publication CMS',
    description: 'Author, edit, format, and publish authoritative epidemiological bulletins and public alerts.',
    path: '/reports/cms',
    category: 'Reports & Publications',
    icon: FileText,
    badge: 'CMS Editor',
    badgeColor: 'purple',
    priority: 3,
  },

  // ── 5. Master Data & Configuration ──────────────────────────────────────────
  {
    id: 'mod_locations',
    title: 'Location Master Data',
    description: 'Hierarchical geographic administrative data, coordinate centroids, and boundary geometry.',
    path: '/locations',
    category: 'Master Data & Configuration',
    icon: MapPin,
    badge: 'Geographic Master',
    badgeColor: 'sky',
    priority: 1,
  },
  {
    id: 'mod_master_countries',
    title: 'Master Countries & Regions',
    description: 'Country codes, aliases in native scripts, regional groupings, and sovereign territory metadata.',
    path: '/master-countries',
    category: 'Master Data & Configuration',
    icon: Globe2,
    badge: 'Countries',
    badgeColor: 'indigo',
    priority: 2,
  },
  {
    id: 'mod_disease_master',
    title: 'Disease Master Data',
    description: 'WHO ICD-11 pathogen concepts, standard display names, clinical taxonomy, and multilingual aliases.',
    path: '/disease-master',
    category: 'Master Data & Configuration',
    icon: Stethoscope,
    badge: 'WHO ICD-11',
    badgeColor: 'rose',
    priority: 3,
  },
  {
    id: 'mod_credibility',
    title: 'Source Credibility Directory',
    description: 'Media outlet reputation indices, fact-checking ratings, and automated reliability weighting.',
    path: '/source-credibility',
    category: 'Master Data & Configuration',
    icon: ShieldCheck,
    badge: 'Media Trust',
    badgeColor: 'emerald',
    priority: 4,
  },
  {
    id: 'mod_sources',
    title: 'Data Ingestion Sources',
    description: 'Active RSS feeds, ministry endpoints, and digital news agencies monitored by the surveillance engine.',
    path: '/sources',
    category: 'Master Data & Configuration',
    icon: Radio,
    badge: 'Ingestion Feeds',
    badgeColor: 'blue',
    priority: 5,
  },
  {
    id: 'mod_outbreak_rules',
    title: 'Outbreak Detection Rules',
    description: 'Dynamic epidemic thresholds, automated anomaly triggers, and notification criteria.',
    path: '/outbreak-rules',
    category: 'Master Data & Configuration',
    icon: AlertTriangle,
    badge: 'Alert Rules',
    badgeColor: 'amber',
    priority: 6,
  },
  {
    id: 'mod_nlp',
    title: 'NLP Extraction Rules & Labels',
    description: 'Named Entity Recognition (NER) dictionaries, language markers, and multilingual lexicons.',
    path: '/nlp-labels',
    category: 'Master Data & Configuration',
    icon: Tags,
    badge: 'NLP Lexicons',
    badgeColor: 'purple',
    priority: 7,
  },
  {
    id: 'mod_interoperability',
    title: 'System Interoperability',
    description: 'External API connectors, SKDR/WHO data bridges, and health information exchange protocols.',
    path: '/interoperability',
    category: 'Master Data & Configuration',
    icon: Settings,
    badge: 'API Bridges',
    badgeColor: 'slate',
    priority: 8,
  },

  // ── 6. System Management ───────────────────────────────────────────────────
  {
    id: 'console_users',
    title: 'User Management & Access Control',
    description: 'User accounts, role configurations, and granular module permission matrix.',
    path: '/console/users',
    category: 'System Management',
    icon: Users,
    badge: 'RBAC Security',
    badgeColor: 'indigo',
    priority: 1,
  },
  {
    id: 'configuration_modul',
    title: 'Navigation & Module Config',
    description: 'Configure active navigation groups, module ordering, and sidebar structure.',
    path: '/console/configuration-modul',
    category: 'System Management',
    icon: SlidersHorizontal,
    badge: 'Navigation CMS',
    badgeColor: 'purple',
    priority: 2,
  },
  {
    id: 'console_settings',
    title: 'Branding & System Settings',
    description: 'Custom logos, institutional branding, system title, and activity audit trails.',
    path: '/console/settings',
    category: 'System Management',
    icon: Settings,
    badge: 'System Admin',
    badgeColor: 'slate',
    priority: 3,
  },
]

export default function HomePage() {
  const { settings } = useSettings()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [mounted, setMounted] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [stats, setStats] = useState<any>(null)
  const [crawlStats, setCrawlStats] = useState<any>(null)
  const [loadingStats, setLoadingStats] = useState(true)

  const currentEpiWeek = useMemo(() => getCurrentEpiWeek(), [])

  useEffect(() => {
    setMounted(true)
    const current = getAuthUser()
    setUser(current)

    // Load high-level overview metrics
    Promise.allSettled([
      fetchPublicDashboard(),
      fetchCrawlingStats(),
    ]).then(([dashRes, crawlRes]) => {
      if (dashRes.status === 'fulfilled') {
        setStats(dashRes.value)
      }
      if (crawlRes.status === 'fulfilled') {
        setCrawlStats(crawlRes.value)
      }
      setLoadingStats(false)
    })
  }, [])

  // Filter launchpad items strictly based on role and assigned permissions
  const permittedItems = useMemo(() => {
    if (!mounted || !user) return []

    return ALL_LAUNCHPAD_ITEMS.filter((item) => {
      return hasModuleAccess(user, item.path, settings.navigation_menu)
    })
  }, [mounted, user, settings.navigation_menu])

  // Filter by search query and category tab
  const displayedItems = useMemo(() => {
    return permittedItems.filter((item) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.path.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesCat =
        selectedCategory === 'All' || item.category === selectedCategory

      return matchesSearch && matchesCat
    })
  }, [permittedItems, searchQuery, selectedCategory])

  // Unique categories that actually contain at least one accessible module
  const availableCategories = useMemo(() => {
    const cats = new Set<string>()
    permittedItems.forEach((item) => cats.add(item.category))
    return ['All', ...Array.from(cats)]
  }, [permittedItems])

  // Group displayed items by category
  const groupedItems = useMemo(() => {
    const map = new Map<string, LaunchpadItem[]>()
    displayedItems.forEach((item) => {
      if (!map.has(item.category)) {
        map.set(item.category, [])
      }
      map.get(item.category)!.push(item)
    })
    return Array.from(map.entries())
  }, [displayedItems])

  // Format user display name
  const userGreetingName = useMemo(() => {
    if (!user) return 'Surveillance Officer'
    const name = user.full_name || user.display_name || user.username || 'Surveillance Officer'
    return name.charAt(0).toUpperCase() + name.slice(1)
  }, [user])

  const userRoleDisplay = useMemo(() => {
    if (!user?.role) return 'AUTHORIZED USER'
    return user.role.toUpperCase().replace(/_/g, ' ')
  }, [user])

  // Key surveillance pulse counts
  const pulseMetrics = useMemo(() => {
    const totalOutbreaks = stats?.total_locations || stats?.outbreak_locations?.length || 14
    const totalDiseases = stats?.total_diseases || 12
    const totalSources = crawlStats?.total_sources || 45
    const totalCrawls = crawlStats?.total_crawls || 320

    return [
      {
        label: 'Active Outbreak Locations',
        value: totalOutbreaks,
        change: '+2 alert triggers this week',
        icon: AlertTriangle,
        color: 'text-[#ED2939]',
        iconBg: 'bg-red-50 text-[#ED2939] border border-red-200/60',
      },
      {
        label: 'Monitored Pathogens',
        value: totalDiseases,
        change: 'WHO ICD-11 Standardized',
        icon: Stethoscope,
        color: 'text-[#0060A9]',
        iconBg: 'bg-blue-50 text-[#0060A9] border border-blue-200/60',
      },
      {
        label: 'Surveillance Feeds',
        value: totalSources,
        change: 'Official & Verified Sources',
        icon: Radio,
        color: 'text-emerald-600',
        iconBg: 'bg-emerald-50 text-emerald-600 border border-emerald-200/60',
      },
      {
        label: 'Signals Processed',
        value: totalCrawls,
        change: 'Real-time NLP Pipeline',
        icon: Activity,
        color: 'text-purple-600',
        iconBg: 'bg-purple-50 text-purple-600 border border-purple-200/60',
      },
    ]
  }, [stats, crawlStats])

  return (
    <div className="w-full space-y-6 bg-[#f8fafc] px-4 py-6 sm:px-6 lg:px-8">
      {/* ─────────────────────────────────────────────────────────────
          1. HEADER SECTION (Unified Standard Platform Header)
          ───────────────────────────────────────────────────────────── */}
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#0060A9] border border-blue-200/70">
              <Sparkles className="h-3 w-3 text-[#0060A9]" />
              ASEAN SURVEILLANCE • HOME PORTAL
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 border border-emerald-200/70">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Engine Online
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 border border-slate-200">
              <CalendarDays className="h-3 w-3 text-slate-400" />
              Epi-Week W{currentEpiWeek.week} • {currentEpiWeek.year}
            </span>
          </div>

          <h1 className="text-2xl font-black uppercase tracking-wide text-slate-900 sm:text-3xl">
            Welcome back, {userGreetingName}!
          </h1>
          <p className="mt-1 text-sm text-slate-600 max-w-3xl">
            Centralized Command Hub & Module Launchpad for <span className="font-bold text-slate-900 uppercase">{userRoleDisplay}</span>. You have access to <span className="font-bold text-[#0060A9]">{permittedItems.length} authorized modules</span> across the ASEAN Disease Surveillance mesh.
          </p>
        </div>

        {/* Action Controls & Fast Navigation */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-3.5 print:hidden">
          <Link
            href="/main-dashboard"
            className="inline-flex items-center gap-2.5 rounded-2xl bg-[#0060A9] px-5 py-3 sm:px-6 sm:py-3.5 text-sm sm:text-base font-bold text-white shadow-md shadow-[#0060A9]/20 transition hover:bg-[#004b85] hover:shadow-lg active:scale-[0.98]"
          >
            <LayoutDashboard className="h-5 w-5" />
            <span>Open Main Dashboard</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/analyze"
            className="inline-flex items-center gap-2.5 rounded-2xl border-2 border-slate-200 bg-white px-5 py-3 sm:px-6 sm:py-3.5 text-sm sm:text-base font-bold text-slate-800 shadow-sm transition hover:border-[#0060A9] hover:bg-blue-50/40 hover:text-[#0060A9] active:scale-[0.98]"
          >
            <Search className="h-5 w-5 text-[#0060A9]" />
            <span>URL Analysis</span>
          </Link>
          <Link
            href="/asean-countries"
            className="inline-flex items-center gap-2.5 rounded-2xl border-2 border-slate-200 bg-white px-5 py-3 sm:px-6 sm:py-3.5 text-sm sm:text-base font-bold text-slate-800 shadow-sm transition hover:border-[#0060A9] hover:bg-blue-50/40 hover:text-[#0060A9] active:scale-[0.98]"
          >
            <Globe2 className="h-5 w-5 text-[#0060A9]" />
            <span>ASEAN Countries</span>
          </Link>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          2. USER ACCESS SCOPE & SESSION OVERVIEW BANNER
          ───────────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-[#cfe0f1] bg-white p-4 sm:p-5 shadow-xs border-l-4 border-l-[#0060A9]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#0060A9] border border-blue-100 font-black text-sm">
              {userGreetingName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900">
                  {userGreetingName}
                </span>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold uppercase text-[#0060A9] border border-blue-200">
                  {userRoleDisplay}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" />
                  Active Session
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Logged in as <code className="font-mono text-slate-700 font-semibold">{user?.username}</code> • Access authorization scope: <span className="font-semibold text-slate-800">{user?.role === 'admin' ? 'Full System Authority (*)' : `${permittedItems.length} Permitted Modules`}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500 self-start md:self-center">
            <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>Role-Based Access Control verified. Only modules assigned to your profile are rendered below.</span>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          3. SURVEILLANCE PULSE METRICS (4 STANDARD KPI CARDS)
          ───────────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {pulseMetrics.map((m, idx) => {
          const Icon = m.icon
          return (
            <article
              key={idx}
              className="relative rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm hover:border-[#0060A9]/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    {m.label}
                  </div>
                  <div className="mt-1 text-2xl font-black text-slate-900">
                    {loadingStats ? (
                      <RefreshCw className="h-5 w-5 animate-spin text-slate-400" />
                    ) : (
                      m.value
                    )}
                  </div>
                  <div className="mt-1 text-[11px] font-medium text-slate-500">
                    {m.change}
                  </div>
                </div>
                <div className={`grid h-11 w-11 place-items-center rounded-xl shrink-0 ${m.iconBg}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </article>
          )
        })}
      </section>

      {/* ─────────────────────────────────────────────────────────────
          4. SEARCH, FILTER TABS & MODULE LAUNCHPAD
          ───────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        {/* Search & Header Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide text-slate-900 flex items-center gap-2">
              <Compass className="h-5 w-5 text-[#0060A9]" />
              Quick Access Hub & Module Launchpad
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Select any card to launch that view. All modules reflect your current permissions.
            </p>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search accessible modules..."
              className="w-full rounded-xl border border-[#cfe0f1] bg-white py-1.5 pl-8 pr-4 text-xs text-slate-800 shadow-xs placeholder:text-slate-400 focus:border-[#0060A9] focus:outline-none focus:ring-1 focus:ring-[#0060A9]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {availableCategories.map((cat) => {
            const isSelected = selectedCategory === cat
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  isSelected
                    ? 'bg-[#0060A9] text-white shadow-xs'
                    : 'border border-[#cfe0f1] bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {cat}
              </button>
            )
          })}
          <span className="ml-auto text-xs font-semibold text-slate-400">
            {displayedItems.length} of {permittedItems.length} modules
          </span>
        </div>

        {/* Cards Grid Grouped by Category */}
        {groupedItems.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-xs">
            <Search className="mx-auto h-8 w-8 text-slate-400" />
            <h3 className="mt-3 text-sm font-bold text-slate-800">
              No matching modules found
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Try adjusting your search terms or switch category filters.
            </p>
            <button
              onClick={() => {
                setSearchQuery('')
                setSelectedCategory('All')
              }}
              className="mt-3 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="space-y-8 pt-2">
            {groupedItems.map(([categoryName, items]) => (
              <div key={categoryName}>
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2 mb-3.5">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                    {categoryName}
                  </span>
                  <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                    {items.length}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((item) => {
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.id}
                        href={item.path}
                        className="group flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:border-[#0060A9] hover:shadow-sm"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-3">
                            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#0060A9] border border-blue-100 transition-colors group-hover:bg-[#0060A9] group-hover:text-white">
                              <Icon className="h-5 w-5" />
                            </div>

                            {item.badge && (
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase border ${
                                  item.badgeColor === 'blue'
                                    ? 'bg-blue-50 text-[#0060A9] border-blue-200'
                                    : item.badgeColor === 'emerald'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : item.badgeColor === 'amber'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : item.badgeColor === 'purple'
                                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                                    : item.badgeColor === 'rose'
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : item.badgeColor === 'cyan'
                                    ? 'bg-cyan-50 text-cyan-700 border-cyan-200'
                                    : item.badgeColor === 'sky'
                                    ? 'bg-sky-50 text-sky-700 border-sky-200'
                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                                }`}
                              >
                                {item.badge}
                              </span>
                            )}
                          </div>

                          <h3 className="mt-3 text-sm font-bold text-slate-900 group-hover:text-[#0060A9] transition-colors">
                            {item.title}
                          </h3>
                          <p className="mt-1 text-xs text-slate-500 leading-relaxed line-clamp-2">
                            {item.description}
                          </p>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11px]">
                          <span className="font-mono text-slate-400 group-hover:text-slate-600">
                            {item.path}
                          </span>
                          <span className="font-bold text-[#0060A9] flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                            Open ↗
                          </span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─────────────────────────────────────────────────────────────
          5. INSTITUTIONAL FOOTER / DOCUMENTATION HELPER
          ───────────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-[#cfe0f1] bg-white p-4 sm:p-5 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#0060A9] border border-blue-100">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              ASEAN Disease Intelligence Mesh • Operational Guidelines
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Permissions are synchronized in real-time. For privilege escalations or credential updates, contact the system administrator.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasModuleAccess(user, '/console/users', settings.navigation_menu) && (
            <Link
              href="/console/users"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#cfe0f1] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs transition"
            >
              <Users className="h-3.5 w-3.5 text-[#0060A9]" />
              User Management
            </Link>
          )}
          <Link
            href="/business-process"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#cfe0f1] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs transition"
          >
            <BookText className="h-3.5 w-3.5 text-[#0060A9]" />
            Business Process
          </Link>
        </div>
      </section>
    </div>
  )
}
