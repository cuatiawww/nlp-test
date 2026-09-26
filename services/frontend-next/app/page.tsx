'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  BookText,
  Building2,
  CalendarDays,
  Clock,
  Globe2,
  LayoutDashboard,
  MapPin,
  Plane,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  Ship,
  Sparkles,
  Stethoscope,
  Users,
  X,
} from 'lucide-react'
import { fetchPublicDashboard, fetchCrawlingStats } from '@/lib/api'
import { getCurrentEpiWeek } from '@/lib/epi-week'
import { getAuthUser, hasModuleAccess, type AuthUser } from '@/lib/auth'
import { useSettings } from '@/lib/settings-context'
import CountryFlag from '@/components/CountryFlag'

interface LaunchpadItem {
  id: string
  title: string
  shortName?: string
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

interface CountryCoverageCard {
  code: string
  name: string
  cases: string
  deaths: string
  diseases: string
  dateRange: string
}

interface DiseaseEntryPoint {
  id: string
  name: string
  location: string
  countryCode: string
  category: 'Airports' | 'Seaports' | 'Land Borders' | 'Sentinel Hospitals'
  typeLabel: string
  surveillanceMode: string
  riskLevel: 'Elevated' | 'Moderate' | 'Routine'
  riskBadgeBg: string
  riskDotBg: string
  primaryPathogens: string[]
  weeklyVolume: string
  recentSignals: number
  icon: any
}

const ALL_LAUNCHPAD_ITEMS: LaunchpadItem[] = [
  {
    id: 'mod_main_dashboard',
    title: 'Main Surveillance Dashboard',
    shortName: 'Main Dash',
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
    shortName: 'Analytics',
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
    shortName: 'Executive',
    description: 'Macro situational awareness, strategic threat indicators, and cross-border policy briefings.',
    path: '/executive-dashboard',
    category: 'Surveillance Dashboards',
    icon: BarChart3,
    badge: 'Strategic',
    badgeColor: 'purple',
    priority: 3,
  },
  {
    id: 'mod_asean_countries',
    title: 'ASEAN Member States',
    shortName: 'ASEAN States',
    description: 'Surveillance across 11 ASEAN member nations with localized news feeds and outbreak tracking.',
    path: '/asean-countries',
    category: 'Regional & Cross-Border',
    icon: Globe2,
    badge: '11 Nations',
    badgeColor: 'sky',
    priority: 1,
  },
  {
    id: 'mod_analyze',
    title: 'URL & Article Analysis',
    shortName: 'Live Extraction',
    description: 'Real-time on-demand AI NLP extraction for news articles, press releases, and surveillance documents.',
    path: '/analyze',
    category: 'AI Pipeline & Scraper',
    icon: Sparkles,
    badge: 'Live NLP',
    badgeColor: 'emerald',
    priority: 1,
  },
  {
    id: 'mod_reports',
    title: 'Reports & Publications',
    shortName: 'Reports',
    description: 'Automated epidemic bulletins, situational reports, and downloadable PDF/Excel digests.',
    path: '/reports',
    category: 'Reports & Publications',
    icon: BookText,
    badge: 'Reports',
    badgeColor: 'amber',
    priority: 2,
  },
  {
    id: 'mod_users',
    title: 'User Management Console',
    shortName: 'User Admin',
    description: 'Manage user access control, role assignments, and security permission matrices.',
    path: '/console/users',
    category: 'System Management',
    icon: Users,
    badge: 'Security',
    badgeColor: 'indigo',
    priority: 3,
  },
]

export default function HomePage() {
  const { settings } = useSettings()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [mounted, setMounted] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [stats, setStats] = useState<any>(null)
  const [crawlStats, setCrawlStats] = useState<any>(null)
  const [loadingStats, setLoadingStats] = useState(true)
  const [activeEntryCategory, setActiveEntryCategory] = useState<string>('All')

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
    if (!mounted || !user) return ALL_LAUNCHPAD_ITEMS

    return ALL_LAUNCHPAD_ITEMS.filter((item) => {
      return hasModuleAccess(user, item.path, settings.navigation_menu)
    })
  }, [mounted, user, settings.navigation_menu])

  // Filter items for search dropdown
  const filteredSearchResults = useMemo(() => {
    if (!searchQuery.trim()) return permittedItems
    const q = searchQuery.toLowerCase().trim()
    return permittedItems.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
    )
  }, [searchQuery, permittedItems])

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

  // Circular Quick Access Module Action Buttons
  const quickAccessModules = useMemo(() => {
    return permittedItems.slice(0, 7)
  }, [permittedItems])

  // Overview metric totals (Showing all master data monitored countries)
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
    const totalCountries = stats?.total_countries || stats?.countries_count || 195
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
        bg: 'bg-emerald-50 text-emerald-600 border-emerald-200/70',
      },
      {
        id: 'crawled',
        label: 'Articles Crawled',
        value: totalCrawled,
        description: 'Ingested health reports',
        icon: Activity,
        bg: 'bg-blue-50 text-[#0060A9] border-blue-200/70',
      },
      {
        id: 'countries',
        label: 'Monitored Countries',
        value: totalCountries,
        description: 'Global & Master Data Countries',
        icon: Globe2,
        bg: 'bg-sky-50 text-sky-600 border-sky-200/70',
      },
      {
        id: 'regions',
        label: 'Subnational Regions',
        value: totalRegions,
        description: 'Provinces & districts tracked',
        icon: Globe2,
        bg: 'bg-purple-50 text-purple-600 border-purple-200/70',
      },
      {
        id: 'diseases',
        label: 'Tracked Pathogens',
        value: totalDiseases,
        description: 'Cataloged disease concepts',
        icon: Stethoscope,
        bg: 'bg-rose-50 text-rose-600 border-rose-200/70',
      },
    ]
  }, [stats, crawlStats])

  // High-coverage places (2-column card grid using CountryFlag component)
  const highCoveragePlaces: CountryCoverageCard[] = useMemo(() => {
    return [
      {
        code: 'TH',
        name: 'Thailand',
        cases: '18.2M',
        deaths: '840',
        diseases: '11',
        dateRange: '2014-03-10 – 2026-09-25',
      },
      {
        code: 'ID',
        name: 'Indonesia',
        cases: '24.5M',
        deaths: '1.2K',
        diseases: '12',
        dateRange: '2015-01-01 – 2026-09-26',
      },
      {
        code: 'SG',
        name: 'Singapore',
        cases: '243K',
        deaths: '-',
        diseases: '12',
        dateRange: '2018-01-01 – 2026-09-26',
      },
      {
        code: 'MY',
        name: 'Malaysia',
        cases: '5.1M',
        deaths: '312',
        diseases: '10',
        dateRange: '2016-06-01 – 2026-09-20',
      },
      {
        code: 'VN',
        name: 'Viet Nam',
        cases: '11.5M',
        deaths: '420',
        diseases: '11',
        dateRange: '2015-08-15 – 2026-09-22',
      },
      {
        code: 'PH',
        name: 'Philippines',
        cases: '4.1M',
        deaths: '650',
        diseases: '12',
        dateRange: '2016-01-01 – 2026-09-24',
      },
    ]
  }, [])

  // Common Disease Entry Points (Points of Entry Surveillance)
  const commonEntryPoints: DiseaseEntryPoint[] = useMemo(() => {
    return [
      {
        id: 'poe_bkk',
        name: 'Suvarnabhumi International Airport (BKK)',
        location: 'Samut Prakan, Thailand',
        countryCode: 'TH',
        category: 'Airports',
        typeLabel: 'International Aviation Hub',
        surveillanceMode: 'Thermal Screening & Health Declaration',
        riskLevel: 'Elevated',
        riskBadgeBg: 'bg-rose-50 text-rose-700 border-rose-200/80',
        riskDotBg: 'bg-rose-500',
        primaryPathogens: ['Influenza A (H5N1)', 'Dengue', 'Mpox'],
        weeklyVolume: '1.2M pax',
        recentSignals: 14,
        icon: Plane,
      },
      {
        id: 'poe_jkt_port',
        name: 'Port of Tanjung Priok & Batam Maritime Node',
        location: 'Jakarta & Kep. Riau, Indonesia',
        countryCode: 'ID',
        category: 'Seaports',
        typeLabel: 'Maritime Ingress & Freight Corridor',
        surveillanceMode: 'Vessel Port Health & Cargo Sanitation',
        riskLevel: 'Moderate',
        riskBadgeBg: 'bg-amber-50 text-amber-700 border-amber-200/80',
        riskDotBg: 'bg-amber-500',
        primaryPathogens: ['Cholera', 'Malaria', 'Leptospirosis'],
        weeklyVolume: '450K tons',
        recentSignals: 9,
        icon: Ship,
      },
      {
        id: 'poe_sin_changi',
        name: 'Singapore Changi Transit Hub (SIN)',
        location: 'Changi, Singapore',
        countryCode: 'SG',
        category: 'Airports',
        typeLabel: 'Global Intercontinental Transit Node',
        surveillanceMode: 'Genomic Wastewater & Bio-Surveillance',
        riskLevel: 'Routine',
        riskBadgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
        riskDotBg: 'bg-emerald-500',
        primaryPathogens: ['Dengue Serotype 3', 'COVID Variants', 'Measles'],
        weeklyVolume: '1.4M pax',
        recentSignals: 6,
        icon: Plane,
      },
      {
        id: 'poe_sadao_border',
        name: 'Sadao – Bukit Kayu Hitam Border Crossing',
        location: 'Songkhla (TH) / Kedah (MY)',
        countryCode: 'TH',
        category: 'Land Borders',
        typeLabel: 'Commercial Highway Land Post',
        surveillanceMode: 'Cross-Border Vehicle & Traveler Checkpoint',
        riskLevel: 'Elevated',
        riskBadgeBg: 'bg-rose-50 text-rose-700 border-rose-200/80',
        riskDotBg: 'bg-rose-500',
        primaryPathogens: ['Chikungunya', 'Dengue', 'HFMD'],
        weeklyVolume: '180K trips',
        recentSignals: 11,
        icon: MapPin,
      },
      {
        id: 'poe_rsup_persahabatan',
        name: 'RSUP Persahabatan Respiratory Sentinel Node',
        location: 'Jakarta East, Indonesia',
        countryCode: 'ID',
        category: 'Sentinel Hospitals',
        typeLabel: 'Referral & Clinical Specimen Center',
        surveillanceMode: 'SARI / ILI Clinical Lab Specimen Surveillance',
        riskLevel: 'Moderate',
        riskBadgeBg: 'bg-amber-50 text-amber-700 border-amber-200/80',
        riskDotBg: 'bg-amber-500',
        primaryPathogens: ['Avian Influenza', 'MDR Tuberculosis', 'Pneumococcus'],
        weeklyVolume: '3.5K samples',
        recentSignals: 18,
        icon: Building2,
      },
      {
        id: 'poe_sgn_hub',
        name: 'Tan Son Nhat International Hub (SGN)',
        location: 'Ho Chi Minh City, Viet Nam',
        countryCode: 'VN',
        category: 'Airports',
        typeLabel: 'Regional Aviation Gateway',
        surveillanceMode: 'Bio-Screening & Quarantine Isolation Protocol',
        riskLevel: 'Moderate',
        riskBadgeBg: 'bg-amber-50 text-amber-700 border-amber-200/80',
        riskDotBg: 'bg-amber-500',
        primaryPathogens: ['Dengue', 'Rabies', 'HFMD'],
        weeklyVolume: '820K pax',
        recentSignals: 8,
        icon: Plane,
      },
    ]
  }, [])

  const filteredEntryPoints = useMemo(() => {
    if (activeEntryCategory === 'All') return commonEntryPoints
    return commonEntryPoints.filter(
      (entry) => entry.category === activeEntryCategory
    )
  }, [activeEntryCategory, commonEntryPoints])

  return (
    <div className="w-full space-y-6 bg-[#f8fafc] px-4 py-6 sm:px-6 lg:px-8">
      {/* ─────────────────────────────────────────────────────────────
          1. FULL-WIDTH HERO BANNER WITH HEADER BG GRADIENT (#102f78 -> #0060A9)
          ───────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl bg-[#102f78] bg-gradient-to-r from-[#092257] via-[#102f78] to-[#0060A9] p-6 sm:p-8 text-white shadow-xl w-full flex flex-col justify-between min-h-[320px] border border-blue-900/40">
        {/* Decorative background glow & mesh overlay matching DashboardHeader */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#061b50]/40 via-transparent to-black/20" />
        <div className="pointer-events-none absolute -right-16 -top-16 h-80 w-80 rounded-full bg-blue-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-80 w-80 rounded-full bg-indigo-500/10 blur-3xl" />

        {/* Top Header Row inside Hero (Profile, Search + Dropdown, Epi-Week) */}
        <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 pb-4">
          {/* Left: User Avatar & Epi-Week Pill */}
          <div className="flex items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-white/20 text-white font-extrabold text-sm border border-white/30 backdrop-blur-md shadow-inner">
              {userGreetingName.charAt(0)}
            </div>
            <div>
              <div className="text-sm font-black text-white leading-tight">
                Welcome back, {userGreetingName}
              </div>
              <div className="text-[11px] font-medium text-blue-200/90 flex items-center gap-1.5 mt-0.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {userRoleDisplay}
              </div>
            </div>
          </div>

          {/* Right: Search Box + Epi Week Pill */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Epi Week Badge */}
            <div className="hidden sm:flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold text-blue-100 backdrop-blur-md border border-white/15">
              <CalendarDays className="h-3.5 w-3.5 text-blue-300" />
              <span>
                Epi Week <strong className="text-white">{currentEpiWeek.week}</strong> ({currentEpiWeek.year})
              </span>
            </div>

            {/* Quick Search Input */}
            <div className="relative">
              <div className="relative flex items-center">
                <Search className="absolute left-3 h-3.5 w-3.5 text-blue-200 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Quick search modules..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsSearchOpen(true)}
                  className="w-44 sm:w-60 rounded-xl bg-white/15 pl-8 pr-7 py-1.5 text-xs text-white placeholder-blue-200/70 border border-white/20 focus:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white/40 transition-all shadow-inner"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 text-blue-200 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Search Dropdown Popup */}
              {isSearchOpen && searchQuery.trim() && (
                <div
                  className="absolute right-0 top-full mt-2 w-72 sm:w-80 rounded-2xl bg-white p-2 shadow-2xl border border-slate-200 text-slate-800 z-50 animate-in fade-in slide-in-from-top-2 duration-150"
                  onMouseLeave={() => setIsSearchOpen(false)}
                >
                  <div className="px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    Matching System Modules ({filteredSearchResults.length})
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-1 mt-1">
                    {filteredSearchResults.length > 0 ? (
                      filteredSearchResults.map((item) => {
                        const Icon = item.icon
                        return (
                          <Link
                            key={item.id}
                            href={item.path}
                            onClick={() => {
                              setIsSearchOpen(false)
                              setSearchQuery('')
                            }}
                            className="flex items-center gap-2.5 rounded-xl p-2 hover:bg-blue-50 transition-colors group"
                          >
                            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-100 text-[#0060A9]">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold text-slate-900 group-hover:text-[#0060A9] truncate">
                                {item.title}
                              </div>
                              <div className="text-[10px] text-slate-500 truncate">
                                {item.category}
                              </div>
                            </div>
                          </Link>
                        )
                      })
                    ) : (
                      <div className="p-3 text-center text-xs text-slate-500">
                        No modules found matching &quot;{searchQuery}&quot;
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Hero Title & Description */}
        <div className="relative z-10 my-4 max-w-3xl">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight leading-tight text-white drop-shadow-xs">
            ASEAN Disease Intelligence Portal
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-blue-100/90 leading-relaxed font-medium max-w-2xl">
            Real-time epidemiologic surveillance, automated web article NLP crawling,
            and cross-border outbreak monitoring across regional member countries.
          </p>
        </div>

        {/* Bottom Circular Navigation Access Points inside Hero */}
        <div className="relative z-10 pt-4 border-t border-white/15">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-blue-200/80 mb-3">
            Quick Launch Modules
          </div>
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            {quickAccessModules.map((mod) => {
              const Icon = mod.icon
              return (
                <Link
                  key={mod.id}
                  href={mod.path}
                  className="group relative flex flex-col items-center"
                >
                  {/* Circle Icon Button */}
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-white/15 border border-white/25 text-white backdrop-blur-md shadow-md transition-all duration-200 group-hover:scale-110 group-hover:bg-white group-hover:text-[#0060A9] group-hover:shadow-lg">
                    <Icon className="h-5 w-5" />
                  </div>
                  {/* Label Underneath */}
                  <span className="mt-1.5 text-[10px] font-bold tracking-tight text-blue-100/90 group-hover:text-white transition-colors text-center max-w-[75px] truncate">
                    {mod.shortName || mod.title}
                  </span>

                  {/* Hover Tooltip */}
                  <div className="pointer-events-none absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-30">
                    <div className="rounded-xl bg-slate-900/95 px-3 py-1.5 text-center text-[10px] text-white shadow-xl backdrop-blur-md border border-slate-700 whitespace-nowrap">
                      <div className="font-bold text-blue-300">{mod.title}</div>
                      <div className="text-[9px] text-slate-300">{mod.description}</div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          2. OVERVIEW METRIC CARDS (Sources, Crawled, Countries, Regions, Diseases)
          ───────────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
        {overviewMetrics.map((m) => {
          const Icon = m.icon
          return (
            <article
              key={m.id}
              className="relative rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:border-[#0060A9]/50 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {m.label}
                </span>
                <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl border ${m.bg}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>

              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-slate-900">
                  {loadingStats ? (
                    <RefreshCw className="h-5 w-5 animate-spin text-slate-400" />
                  ) : (
                    m.value.toLocaleString()
                  )}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500 truncate">
                {m.description}
              </p>
            </article>
          )
        })}
      </section>

      {/* ─────────────────────────────────────────────────────────────
          3. HIGH-COVERAGE PLACES (2-COLUMN CARDS WITH COUNTRYFLAG COMPONENT)
          ───────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        {/* Section Header: Larger font, no icon beside title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
              High-coverage places
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Active epidemiological surveillance and disease metrics across monitored countries
            </p>
          </div>
          <Link
            href="/asean-countries"
            className="inline-flex items-center gap-1 text-xs font-extrabold text-[#0060A9] hover:text-[#003865] hover:underline transition-colors"
          >
            View all monitored countries
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* 2-Column Grid Cards using CountryFlag component */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {highCoveragePlaces.map((place) => (
            <Link
              key={place.code}
              href={`/asean-countries?country=${place.code}`}
              className="group relative rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[#0060A9] hover:shadow-md flex flex-col justify-between"
            >
              {/* Header: CountryFlag Component + Country Name */}
              <div className="flex items-center gap-3">
                <CountryFlag
                  countryCode={place.code}
                  countryName={place.name}
                  shape="rounded"
                  size="md"
                  className="shadow-2xs border border-slate-200/90"
                />
                <h3 className="text-lg font-extrabold text-slate-900 group-hover:text-[#0060A9] transition-colors">
                  {place.name}
                </h3>
              </div>

              {/* 3-Column Stats Divider Box (Cases | Deaths | Diseases) */}
              <div className="my-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                <div className="grid grid-cols-3 divide-x divide-slate-200/80 text-center">
                  {/* Cases */}
                  <div className="px-2">
                    <div className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                      {place.cases}
                    </div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
                      Cases
                    </div>
                  </div>

                  {/* Deaths */}
                  <div className="px-2">
                    <div className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                      {place.deaths}
                    </div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
                      Deaths
                    </div>
                  </div>

                  {/* Diseases */}
                  <div className="px-2">
                    <div className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                      {place.diseases}
                    </div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
                      Diseases
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer: Date Range */}
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium pt-1">
                <span>{place.dateRange}</span>
                <span className="group-hover:text-[#0060A9] transition-colors font-bold flex items-center gap-1">
                  Details
                  <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          4. COMMON DISEASE ENTRY POINTS (POINTS OF ENTRY SURVEILLANCE)
          ───────────────────────────────────────────────────────────── */}
      <section className="space-y-4 pt-2">
        {/* Section Header: Large font, NO icon beside title */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
              Common disease entry points
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Critical Points of Entry (PoE), maritime corridors, overland border checkpoints, and sentinel surveillance centers
            </p>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {['All', 'Airports', 'Seaports', 'Land Borders', 'Sentinel Hospitals'].map((category) => {
              const isActive = activeEntryCategory === category
              return (
                <button
                  key={category}
                  onClick={() => setActiveEntryCategory(category)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-extrabold transition-all whitespace-nowrap border ${
                    isActive
                      ? 'bg-[#0060A9] text-white border-[#0060A9] shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200/80 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  {category === 'All' ? 'All Entry Points' : category}
                </button>
              )
            })}
          </div>
        </div>

        {/* Entry Point Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEntryPoints.map((entry) => {
            const CategoryIcon = entry.icon
            return (
              <div
                key={entry.id}
                className="group relative rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[#0060A9] hover:shadow-md flex flex-col justify-between"
              >
                <div>
                  {/* Category Header Tag & Country Flag */}
                  <div className="flex items-center justify-between gap-2 pb-3">
                    <div className="flex items-center gap-2">
                      <CountryFlag
                        countryCode={entry.countryCode}
                        countryName={entry.location}
                        shape="rounded"
                        size="sm"
                        className="shadow-2xs border border-slate-200/80"
                      />
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate max-w-[170px]">
                        {entry.location}
                      </span>
                    </div>

                    <span className={`inline-flex items-center gap-1 shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold border ${entry.riskBadgeBg}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${entry.riskDotBg}`} />
                      {entry.riskLevel} Risk
                    </span>
                  </div>

                  {/* Main Entry Point Title */}
                  <h3 className="text-base font-black text-slate-900 group-hover:text-[#0060A9] transition-colors line-clamp-1">
                    {entry.name}
                  </h3>

                  {/* Type & Surveillance Mode Pill */}
                  <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white border border-slate-200/80 text-[#0060A9] shadow-2xs">
                      <CategoryIcon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-extrabold text-slate-800 truncate">
                        {entry.typeLabel}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate font-medium">
                        {entry.surveillanceMode}
                      </div>
                    </div>
                  </div>

                  {/* Tracked Pathogens */}
                  <div className="mt-3.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Monitored Risk Pathogens
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {entry.primaryPathogens.map((pathogen) => (
                        <span
                          key={pathogen}
                          className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700 border border-slate-200/60"
                        >
                          {pathogen}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Footer Metrics & Direct Action Link */}
                <div className="mt-5 border-t border-slate-100 pt-3 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2.5 text-slate-500 font-medium">
                    <span>
                      <strong className="font-extrabold text-slate-900">{entry.weeklyVolume}</strong> volume
                    </span>
                    <span className="h-3 w-px bg-slate-200" />
                    <span className="text-amber-700 font-extrabold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60">
                      {entry.recentSignals} Signals
                    </span>
                  </div>

                  <Link
                    href={`/asean-countries?country=${entry.countryCode}`}
                    className="group/link font-extrabold text-[#0060A9] hover:text-[#003865] flex items-center gap-1 transition-colors"
                  >
                    Inspect
                    <ArrowRight className="h-3 w-3 opacity-0 group-hover/link:opacity-100 -translate-x-1 group-hover/link:translate-x-0 transition-all" />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
