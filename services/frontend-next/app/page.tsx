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
  Zap,
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
  category:
    | 'Surveillance Dashboards'
    | 'Regional & Cross-Border'
    | 'AI Pipeline & Scraper'
    | 'Reports & Publications'
    | 'Master Data & Configuration'
    | 'System Management'
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
    description: 'Pathogen-specific surveillance breakdown, local disease concepts, and morbidity progression.',
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
    description: 'Local disease concepts, standard display names, clinical categories, and multilingual aliases.',
    path: '/disease-master',
    category: 'Master Data & Configuration',
    icon: Stethoscope,
    badge: 'Disease Master',
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
    Promise.allSettled([fetchPublicDashboard(), fetchCrawlingStats()]).then(
      ([dashRes, crawlRes]) => {
        if (dashRes.status === 'fulfilled') {
          setStats(dashRes.value)
        }
        if (crawlRes.status === 'fulfilled') {
          setCrawlStats(crawlRes.value)
        }
        setLoadingStats(false)
      }
    )
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
    const name =
      user.full_name || user.display_name || user.username || 'Surveillance Officer'
    return name.charAt(0).toUpperCase() + name.slice(1)
  }, [user])

  const userRoleDisplay = useMemo(() => {
    if (!user?.role) return 'Authorized User'
    return user.role.toUpperCase().replace(/_/g, ' ')
  }, [user])

  // Top 4 Primary Shortcut Modules for User Level
  const primaryShortcuts = useMemo(() => {
    if (!permittedItems.length) return []
    const preferredPaths = ['/main-dashboard', '/analyze', '/asean-countries', '/executive-dashboard']
    const matches = permittedItems.filter((item) => preferredPaths.includes(item.path))
    if (matches.length > 0) {
      return matches.slice(0, 4)
    }
    return permittedItems.slice(0, 4)
  }, [permittedItems])

  // Overview metric totals
  const overviewMetrics = useMemo(() => {
    const totalSources =
      crawlStats?.enabled_sources ||
      (crawlStats?.by_source_type
        ? crawlStats.by_source_type.reduce(
            (acc: number, curr: any) => acc + (curr.total || 0),
            0
          )
        : 45) ||
      45
    const totalCrawled =
      crawlStats?.total_crawled_all_time ||
      crawlStats?.total_processed ||
      crawlStats?.total ||
      320
    const totalCountries = stats?.total_countries || 11
    const totalRegions =
      stats?.total_locations || stats?.outbreak_locations?.length || 140
    const totalDiseases = stats?.total_diseases || 12

    return [
      {
        id: 'sources',
        label: 'Ingestion Sources',
        value: totalSources,
        description: 'Official feeds & news streams',
        icon: Radio,
        color: 'text-emerald-600',
        bg: 'bg-emerald-50 text-emerald-600 border-emerald-200/70',
      },
      {
        id: 'crawled',
        label: 'Articles Crawled',
        value: totalCrawled,
        description: 'Ingested health reports',
        icon: Activity,
        color: 'text-[#0060A9]',
        bg: 'bg-blue-50 text-[#0060A9] border-blue-200/70',
      },
      {
        id: 'countries',
        label: 'Monitored Countries',
        value: totalCountries,
        description: 'ASEAN Member States',
        icon: Globe2,
        color: 'text-sky-600',
        bg: 'bg-sky-50 text-sky-600 border-sky-200/70',
      },
      {
        id: 'regions',
        label: 'Subnational Regions',
        value: totalRegions,
        description: 'Provinces & districts tracked',
        icon: MapPin,
        color: 'text-purple-600',
        bg: 'bg-purple-50 text-purple-600 border-purple-200/70',
      },
      {
        id: 'diseases',
        label: 'Tracked Pathogens',
        value: totalDiseases,
        description: 'Cataloged disease concepts',
        icon: Stethoscope,
        color: 'text-rose-600',
        bg: 'bg-rose-50 text-rose-600 border-rose-200/70',
      },
    ]
  }, [stats, crawlStats])

  return (
    <div className=
