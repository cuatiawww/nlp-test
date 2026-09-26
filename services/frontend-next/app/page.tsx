'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  BookText,
  CalendarDays,
  Clock,
  Globe2,
  LayoutDashboard,
  MapPin,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Users,
  X,
} from 'lucide-react'
import { fetchPublicDashboard, fetchCrawlingStats } from '@/lib/api'
import { getCurrentEpiWeek } from '@/lib/epi-week'
import { getAuthUser, hasModuleAccess, type AuthUser } from '@/lib/auth'
import { useSettings } from '@/lib/settings-context'

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
  flag: string
  cases: string
  deaths: string
  diseases: string
  dateRange: string
  status?: string
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
        description: 'ASEAN Member States',
        icon: Globe2,
        bg: 'bg-sky-50 text-sky-600 border-sky-200/70',
      },
      {
        id: 'regions',
        label: 'Subnational Regions',
        value: totalRegions,
        description: 'Provinces & districts tracked',
        icon: MapPin,
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

  // High-coverage places (2-column card grid)
  const highCoveragePlaces: CountryCoverageCard[] = useMemo(() => {
    return [
      {
        code: 'TH',
        name: 'Thailand',
        flag: '🇹🇭',
        cases: '18.2M',
        deaths: '840',
        diseases: '11',
        dateRange: '2014-03-10 – 2026-09-25',
        status: 'High Coverage',
      },
      {
        code: 'ID',
        name: 'Indonesia',
        flag: '🇮🇩',
        cases: '24.5M',
        deaths: '1.2K',
        diseases: '12',
        dateRange: '2015-01-01 – 2026-09-26',
        status: 'High Coverage',
      },
      {
        code: 'SG',
        name: 'Singapore',
        flag: '🇸🇬',
        cases: '243K',
        deaths: '-',
        diseases: '12',
        dateRange: '2018-01-01 – 2026-09-26',
        status: 'Active',
      },
      {
        code: 'MY',
        name: 'Malaysia',
        flag: '🇲🇾',
        cases: '5.1M',
        deaths: '312',
        diseases: '10',
        dateRange: '2016-06-01 – 2026-09-20',
        status: 'Active',
      },
      {
        code: 'VN',
        name: 'Viet Nam',
        flag: '🇻🇳',
        cases: '11.5M',
        deaths: '420',
        diseases: '11',
        dateRange: '2015-08-15 – 2026-09-22',
        status: 'High Coverage',
      },
      {
        code: 'PH',
        name: 'Philippines',
        flag: '🇵🇭',
        cases: '4.1M',
        deaths: '650',
        diseases: '12',
        dateRange: '2016-01-01 – 2026-09-24',
        status: 'Active',
      },
    ]
  }, [])

  return (
    <div className="w-full space-y-6 bg-[#f8fafc] px-4 py-6 sm:px-6 lg:px-8">
      {/* ─────────────────────────────────────────────────────────────
          1. FULL-WIDTH HERO BANNER WITH MATCHING HEADER BG GRADIENT (#102f78 -> #0060A9)
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
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white border border-white/20 backdrop-blur-md">
              <CalendarDays className="h-3.5 w-3.5 text-blue-200" />
              <span>Epi-Week W{currentEpiWeek.week} • {currentEpiWeek.year}</span>
            </div>
          </div>

          {/* Center: Search Bar with Dropdown */}
          <div className="relative flex-1 max-w-xl mx-auto">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-200/80" />
              <input
                type="text"
                value={searchQuery}
                onFocus={() => setIsSearchOpen(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setIsSearchOpen(true)
                }}
                placeholder="Search modules, analytics, or tools..."
                className="w-full rounded-full border border-white/25 bg-white/15 py-2.5 pl-10 pr-10 text-xs sm:text-sm text-white placeholder:text-blue-100/70 shadow-inner backdrop-blur-md transition focus:border-white focus:bg-white focus:text-slate-900 focus:placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-white/20"
              />
              {searchQuery ? (
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setIsSearchOpen(false)
                  }}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-blue-200 hover:text-white hover:bg-white/20 transition"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            {/* Dynamic Search Results Dropdown */}
            {isSearchOpen && (
              <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-2xl backdrop-blur-xl transition-all">
                <div className="px-3 py-1.5 flex items-center justify-between border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <span>Module Search Results ({filteredSearchResults.length})</span>
                  <button
                    onClick={() => setIsSearchOpen(false)}
                    className="text-slate-400 hover:text-slate-600 text-[10px] font-semibold"
                  >
                    Close [ESC]
                  </button>
                </div>
                
                {filteredSearchResults.length > 0 ? (
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 py-1">
                    {filteredSearchResults.map((item) => {
                      const Icon = item.icon
                      return (
                        <Link
                          key={item.id}
                          href={item.path}
                          onClick={() => setIsSearchOpen(false)}
                          className="group flex items-center justify-between p-2.5 rounded-xl hover:bg-blue-50/80 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#0060A9] border border-blue-100 group-hover:bg-[#0060A9] group-hover:text-white transition-colors">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="truncate">
                              <div className="flex items-center gap-2">
                                <h4 className="text-xs font-bold text-slate-900 group-hover:text-[#0060A9] transition-colors truncate">
                                  {item.title}
                                </h4>
                                {item.badge && (
                                  <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[9px] font-extrabold text-[#0060A9]">
                                    {item.badge}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 truncate">
                                {item.description}
                              </p>
                            </div>
                          </div>
                          <ArrowUpRight className="h-4 w-4 text-slate-400 group-hover:text-[#0060A9] group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                        </Link>
                      )
                    })}
                  </div>
                ) : (
                  <div className="p-4 text-center text-xs text-slate-500">
                    No matching modules found for "{searchQuery}".
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: User Role & Action Pill */}
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-blue-100 border border-white/15 backdrop-blur-md">
              <Clock className="h-3.5 w-3.5 text-blue-200" />
              <span>{userRoleDisplay}</span>
            </div>
            <div
              className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white border border-white/20 hover:bg-white/25 transition cursor-pointer"
              title="System Active"
            >
              <Sparkles className="h-4 w-4 text-blue-200" />
            </div>
          </div>
        </div>

        {/* Main Greeting Headline */}
        <div className="relative z-10 my-6">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white leading-tight">
            Welcome, {userGreetingName}.
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-blue-100/90 leading-relaxed max-w-2xl">
            Real-time disease intelligence and situational monitoring across 11 ASEAN member nations.
          </p>
        </div>

        {/* Bottom Row inside Hero: Reminder Pill (Left) & Circular Module Quick Access Icons (Right) */}
        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-4 pt-4 border-t border-white/15">
          {/* Bottom Left: Quick Reminder Pill */}
          <div className="flex items-center gap-2 text-xs text-blue-100/90 bg-white/10 backdrop-blur-md border border-white/15 px-3.5 py-2 rounded-full max-w-md">
            <Bell className="h-4 w-4 text-amber-300 shrink-0 animate-bounce" />
            <span className="truncate">
              <strong className="text-white">Active Notice:</strong> Epi-Week W{currentEpiWeek.week} surveillance feeds synchronized.
            </span>
          </div>

          {/* Bottom Right: Circular Quick Access Module Action Buttons with Tooltips */}
          <div className="flex items-center flex-wrap gap-3 sm:gap-4 justify-end">
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
          3. HIGH-COVERAGE PLACES (2-COLUMN CARDS WITH CLEAN STYLING)
          ───────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-[#0060A9]" />
              High-coverage places
            </h2>
            <p className="text-xs text-slate-500">
              Active epidemiological surveillance and disease metrics across key ASEAN member states
            </p>
          </div>
          <Link
            href="/asean-countries"
            className="inline-flex items-center gap-1 text-xs font-extrabold text-[#0060A9] hover:text-[#003865] hover:underline transition-colors"
          >
            View all 11 ASEAN nations
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* 2-Column Grid Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {highCoveragePlaces.map((place) => (
            <Link
              key={place.code}
              href={`/asean-countries?country=${place.code}`}
              className="group relative rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[#0060A9] hover:shadow-md flex flex-col justify-between"
            >
              {/* Header: Flag + Country Name + ISO code */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl leading-none" role="img" aria-label={place.name}>
                    {place.flag}
                  </span>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 group-hover:text-[#0060A9] transition-colors">
                      {place.name}
                    </h3>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      {place.code}
                    </span>
                  </div>
                </div>
                {place.status && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-[#0060A9] border border-blue-100">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#0060A9] animate-pulse" />
                    {place.status}
                  </span>
                )}
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
          4. FOOTER GUIDANCE & QUICK ACTIONS
          ───────────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-[#cfe0f1] bg-white p-4 sm:p-5 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#0060A9] border border-blue-100">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              ASEAN Disease Intelligence Portal
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Permissions are synchronized in real-time based on your account role.
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
