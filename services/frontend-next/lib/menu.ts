import {
  Home,
  Radio,
  Database,
  Activity,
  Search,
  MapPin,
  AlertTriangle,
  Users,
  Tags,
  BookText,
  ShieldCheck,
  Languages,
  Braces,
  Cpu,
  FileText,
  FileSpreadsheet,
  Settings,
  History,
  Stethoscope,
  Globe2,
  Tv,
  LayoutDashboard,
  SlidersHorizontal,
  Layers,
  Folder,
  BarChart3,
  LineChart,
  PieChart,
  Shield,
  CheckCircle2,
  Bookmark,
  Compass,
  Bell,
  Flame,
  CloudSun,
  Eye,
  Circle,
  ExternalLink,
  ChevronRight,
  ChevronDown
} from 'lucide-react'

// Icon registry for serializable navigation configurations
export const MENU_ICON_MAP: Record<string, any> = {
  Home,
  Radio,
  Database,
  Activity,
  Search,
  MapPin,
  AlertTriangle,
  Users,
  Tags,
  BookText,
  ShieldCheck,
  Languages,
  Braces,
  Cpu,
  FileText,
  FileSpreadsheet,
  Settings,
  History,
  Stethoscope,
  Globe2,
  Tv,
  LayoutDashboard,
  SlidersHorizontal,
  Layers,
  Folder,
  BarChart3,
  LineChart,
  PieChart,
  Shield,
  CheckCircle2,
  Bookmark,
  Compass,
  Bell,
  Flame,
  CloudSun,
  Eye,
  ExternalLink,
}

export function resolveMenuIcon(name?: string) {
  if (!name) return Circle
  return MENU_ICON_MAP[name] || Circle
}

export type SidebarSubItemConfig = {
  id: string
  label: string
  labelKey?: string
  href: string
  icon?: string
  order?: number
  enabled: boolean
  targetRoles?: string[]
  badge?: string
}

export type SidebarItemConfig = {
  id: string
  label: string
  labelKey?: string
  href?: string
  icon?: string
  order?: number
  enabled: boolean
  targetRoles?: string[]
  badge?: string
  subItems?: SidebarSubItemConfig[]
}

export type SidebarGroupConfig = {
  id: string
  title: string
  titleKey?: string
  order?: number
  enabled: boolean
  targetRoles?: string[]
  items: SidebarItemConfig[]
}

// Legacy-compatible types
export type SidebarItem = {
  id?: string
  label: string
  labelKey?: string
  icon: any
  iconName?: string
  href?: string
  url?: string
  external?: boolean
  order?: number
  enabled?: boolean
  badge?: string
  subItems?: SidebarItem[]
}

export type SidebarGroup = {
  id?: string
  title: string
  titleKey?: string
  order?: number
  enabled?: boolean
  items: SidebarItem[]
}

// Default Hierarchical Navigation Configuration (Navigasi -> Modul -> Sub-Modul)
export const DEFAULT_NAVIGATION_CONFIG: SidebarGroupConfig[] = [
  {
    id: 'grp_monitoring',
    title: 'MONITORING',
    titleKey: 'sidebar.sections.monitoring',
    order: 1,
    enabled: true,
    items: [
      { id: 'mod_home', label: 'Home', labelKey: 'sidebar.items.home', icon: 'Home', href: '/', order: 1, enabled: true },
      { id: 'mod_main_dashboard', label: 'Main Dashboard', labelKey: 'sidebar.items.mainDashboard', icon: 'LayoutDashboard', href: '/main-dashboard', order: 2, enabled: true },
      { id: 'mod_asean_countries', label: 'ASEAN Countries', icon: 'Globe2', href: '/asean-countries', order: 3, enabled: true },
      { id: 'mod_asean_3', label: 'ASEAN +3', icon: 'Globe2', href: '/asean-3', order: 4, enabled: true },
      { id: 'mod_outside_asean', label: 'Outside ASEAN', icon: 'Globe2', href: '/outside-asean', order: 5, enabled: true },
      { id: 'mod_analysis_dashboard', label: 'Analysis Dashboard', icon: 'Activity', href: '/analysis-dashboard', order: 5, enabled: true },
      { id: 'mod_web_services_dashboard', label: 'Web Services Dashboard', icon: 'Cpu', href: '/web-services-dashboard', order: 6, enabled: true },
      { id: 'mod_regions', label: 'Regions/Country', labelKey: 'sidebar.items.regionsCountry', icon: 'Globe2', href: '/countries', order: 7, enabled: true },
      { id: 'mod_diseases', label: 'Diseases', labelKey: 'sidebar.items.diseases', icon: 'Stethoscope', href: '/diseases', order: 5, enabled: true },
      { id: 'mod_sources', label: 'Data Sources', labelKey: 'sidebar.items.sources', icon: 'Radio', href: '/sources', order: 6, enabled: true },
      { id: 'mod_events', label: 'Events', labelKey: 'sidebar.items.events', icon: 'Database', href: '/events', order: 7, enabled: true },
      {
        id: 'mod_analyze',
        label: 'URL Analysis',
        labelKey: 'sidebar.items.analyze',
        icon: 'Search',
        href: '/analyze',
        order: 6,
        enabled: true,
        subItems: [
          { id: 'sub_analyze_live', label: 'Live Article Analysis', href: '/analyze', icon: 'Search', order: 1, enabled: true },
          { id: 'sub_analyze_manual', label: 'Manual Crawler Job', href: '/manual-crawler', icon: 'FileText', order: 2, enabled: true },
        ]
      },
      { id: 'mod_crawler', label: 'Manual Crawler', labelKey: 'sidebar.items.manualCrawler', icon: 'FileText', href: '/manual-crawler', order: 7, enabled: true },
      { id: 'mod_crawl_history', label: 'Crawl History', icon: 'History', href: '/crawl-history', order: 8, enabled: true },
      { id: 'mod_processing', label: 'Processing', labelKey: 'sidebar.items.processing', icon: 'Activity', href: '/processing', order: 9, enabled: true },
      {
        id: 'mod_reports',
        label: 'Reports',
        labelKey: 'sidebar.items.reports',
        icon: 'FileText',
        href: '/reports',
        order: 10,
        enabled: true,
        subItems: [
          { id: 'sub_reports_list', label: 'Sitrep Bulletins', href: '/reports', icon: 'FileText', order: 1, enabled: true },
          { id: 'sub_reports_matrix', label: 'Matrix & Ledger', href: '/reports/matrix', icon: 'FileSpreadsheet', order: 2, enabled: true },
          { id: 'sub_reports_epi', label: 'Epi Weeks (MMWR)', href: '/epi-calendar', icon: 'CalendarDays', order: 3, enabled: true },
        ]
      },
      { id: 'mod_matrix', label: 'Matrix & ledger', labelKey: 'sidebar.items.eventMatrix', icon: 'FileSpreadsheet', href: '/reports/matrix', order: 11, enabled: true },
      { id: 'mod_epi_calendar', label: 'Epi Weeks (MMWR)', icon: 'CalendarDays', href: '/epi-calendar', order: 12, enabled: true },
    ],
  },
  {
    id: 'grp_configuration',
    title: 'CONFIGURATION',
    titleKey: 'sidebar.sections.configuration',
    order: 2,
    enabled: true,
    items: [
      { id: 'mod_locations', label: 'Locations', labelKey: 'sidebar.items.locations', icon: 'MapPin', href: '/locations', order: 1, enabled: true },
      { id: 'mod_master_countries', label: 'Master Countries & Regions', icon: 'Globe2', href: '/master-countries', order: 1.5, enabled: true },
      { id: 'mod_disease_master', label: 'Disease Master', labelKey: 'sidebar.items.diseaseMaster', icon: 'Stethoscope', href: '/disease-master', order: 2, enabled: true },
      { id: 'mod_credibility', label: 'Credibility', labelKey: 'sidebar.items.credibility', icon: 'ShieldCheck', href: '/source-credibility', order: 3, enabled: true },
      { id: 'mod_outbreak_rules', label: 'Outbreak Rules', labelKey: 'sidebar.items.outbreakRules', icon: 'AlertTriangle', href: '/outbreak-rules', order: 4, enabled: true },
      {
        id: 'mod_nlp',
        label: 'NLP Configuration',
        icon: 'Cpu',
        href: '/nlp-labels',
        order: 5,
        enabled: true,
        subItems: [
          { id: 'sub_nlp_labels', label: 'NLP Labels', labelKey: 'sidebar.items.nlpLabels', icon: 'Tags', href: '/nlp-labels', order: 1, enabled: true },
          { id: 'sub_nlp_keywords', label: 'NLP Keywords', labelKey: 'sidebar.items.nlpKeywords', icon: 'BookText', href: '/nlp-keywords', order: 2, enabled: true },
          { id: 'sub_nlp_markers', label: 'Language Markers', labelKey: 'sidebar.items.languageMarkers', icon: 'Languages', href: '/language-markers', order: 3, enabled: true },
          { id: 'sub_nlp_extraction', label: 'Extraction Rules', labelKey: 'sidebar.items.extractionRules', icon: 'Braces', href: '/extraction-rules', order: 4, enabled: true },
          { id: 'sub_nlp_models', label: 'Language Models', labelKey: 'sidebar.items.languageModels', icon: 'Cpu', href: '/language-models', order: 5, enabled: true },
        ]
      },
      { id: 'mod_nlp_labels', label: 'NLP Labels', labelKey: 'sidebar.items.nlpLabels', icon: 'Tags', href: '/nlp-labels', order: 6, enabled: true },
      { id: 'mod_nlp_keywords', label: 'NLP Keywords', labelKey: 'sidebar.items.nlpKeywords', icon: 'BookText', href: '/nlp-keywords', order: 7, enabled: true },
      { id: 'mod_interoperability', label: 'Interoperability', icon: 'Settings', href: '/interoperability', order: 8, enabled: true },
    ],
  },
  {
    id: 'grp_documentation',
    title: 'DOCUMENTATION',
    titleKey: 'sidebar.sections.documentation',
    order: 3,
    enabled: true,
    items: [
      { id: 'mod_business_process', label: 'Business Process', icon: 'BookText', href: '/business-process', order: 1, enabled: true },
    ],
  },
]

// Convert configuration items to standard SidebarGroup for backward compatibility
export function convertConfigToSidebarGroups(config: SidebarGroupConfig[]): SidebarGroup[] {
  return config
    .filter((grp) => grp.enabled)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((grp) => ({
      id: grp.id,
      title: grp.title,
      titleKey: grp.titleKey,
      items: (grp.items || [])
        .filter((item) => item.enabled)
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((item) => ({
          id: item.id,
          label: item.label,
          labelKey: item.labelKey,
          icon: resolveMenuIcon(item.icon),
          iconName: item.icon,
          href: item.href,
          badge: item.badge,
          subItems: item.subItems
            ?.filter((sub) => sub.enabled)
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map((sub) => ({
              id: sub.id,
              label: sub.label,
              labelKey: sub.labelKey,
              icon: resolveMenuIcon(sub.icon),
              iconName: sub.icon,
              href: sub.href,
              badge: sub.badge,
            })),
        })),
    }))
}

// Standard Dashboard Menu (Fallback)
export const sidebarMenu: SidebarGroup[] = convertConfigToSidebarGroups(DEFAULT_NAVIGATION_CONFIG)

// Dedicated Console Menu in Full English
export const consoleMenu: SidebarGroup[] = []
// export const consoleMenu: SidebarGroup[] = [
//   {
//     title: 'SYSTEM MANAGEMENT',
//     items: [
//       { label: 'Configuration & Branding', icon: Settings, href: '/console/settings' },
//       { label: 'Configuration Modul', icon: SlidersHorizontal, href: '/console/configuration-modul' },
//       { label: 'Publication CMS & Reports', icon: FileText, href: '/reports/cms' },
//       { label: 'User Management', icon: Users, href: '/console/users' },
//       { label: 'Activity Audit Logs', icon: FileText, href: '/console/settings?tab=audit' },
//     ],
//   },
//   {
//     title: 'NAVIGATION',
//     items: [
//       { label: 'Home Portal', icon: Home, href: '/' },
//       { label: 'Main Dashboard', icon: LayoutDashboard, href: '/main-dashboard' },
//       { label: 'TV Command Center', icon: Activity, href: '/tv' },
//       { label: 'Reports', icon: FileText, href: '/reports' },
//       { label: 'Matrix & ledger', icon: FileSpreadsheet, href: '/reports/matrix' },
//     ],
//   },
// ]
