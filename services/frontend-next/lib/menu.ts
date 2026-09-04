import { Home, Radio, Database, Activity, Search, MapPin, AlertTriangle, Users, Tags, BookText, ShieldCheck, Languages, Braces, Cpu, FileText, Settings } from 'lucide-react'

export type SidebarItem = {
  label: string
  labelKey?: string
  icon: any
  href?: string
  url?: string
  external?: boolean
}

export type SidebarGroup = {
  title: string
  titleKey?: string
  items: SidebarItem[]
}

// Standard Dashboard Menu (Completely hidden from public/regular view)
export const sidebarMenu: SidebarGroup[] = [
  {
    title: 'MONITORING',
    titleKey: 'sidebar.sections.monitoring',
    items: [
      { label: 'Home', labelKey: 'sidebar.items.home', icon: Home, href: '/' },
      { label: 'Data Sources', labelKey: 'sidebar.items.sources', icon: Radio, href: '/sources' },
      { label: 'Events', labelKey: 'sidebar.items.events', icon: Database, href: '/events' },
      { label: 'URL Analysis', labelKey: 'sidebar.items.analyze', icon: Search, href: '/analyze' },
      { label: 'Processing', labelKey: 'sidebar.items.processing', icon: Activity, href: '/processing' },
      { label: 'Reports & Matrix', labelKey: 'sidebar.items.reports', icon: FileText, href: '/reports' },
    ],
  },
  {
    title: 'CONFIGURATION',
    titleKey: 'sidebar.sections.configuration',
    items: [
      { label: 'Locations', labelKey: 'sidebar.items.locations', icon: MapPin, href: '/locations' },
      { label: 'Credibility', labelKey: 'sidebar.items.credibility', icon: ShieldCheck, href: '/source-credibility' },
      { label: 'Outbreak Rules', labelKey: 'sidebar.items.outbreakRules', icon: AlertTriangle, href: '/outbreak-rules' },
      { label: 'NLP Labels', labelKey: 'sidebar.items.nlpLabels', icon: Tags, href: '/nlp-labels' },
      { label: 'NLP Keywords', labelKey: 'sidebar.items.nlpKeywords', icon: BookText, href: '/nlp-keywords' },
      { label: 'Language Markers', labelKey: 'sidebar.items.languageMarkers', icon: Languages, href: '/language-markers' },
      { label: 'Extraction Rules', labelKey: 'sidebar.items.extractionRules', icon: Braces, href: '/extraction-rules' },
      { label: 'Language Models', labelKey: 'sidebar.items.languageModels', icon: Cpu, href: '/language-models' },
    ],
  },
  {
    title: 'DOCUMENTATION',
    titleKey: 'sidebar.sections.documentation',
    items: [
      { label: 'Hardcode Audit 1', labelKey: 'sidebar.items.hardcode1', icon: FileText, href: '/audit/hardcode-1' },
      { label: 'Hardcode Audit 2', labelKey: 'sidebar.items.hardcode2', icon: FileText, href: '/audit/hardcode-2' },
    ],
  },
]

// Dedicated Console Menu in Full English
export const consoleMenu: SidebarGroup[] = [
  {
    title: 'SYSTEM MANAGEMENT',
    items: [
      { label: 'Configuration & Branding', icon: Settings, href: '/console/settings' },
      { label: 'User Management', icon: Users, href: '/console/users' },
      { label: 'Activity Audit Logs', icon: FileText, href: '/console/settings?tab=audit' },
    ],
  },
  {
    title: 'NAVIGATION',
    items: [
      { label: 'Surveillance Dashboard', icon: Home, href: '/' },
      { label: 'TV Command Center', icon: Activity, href: '/tv' },
      { label: 'Reports & Matrix', icon: FileText, href: '/reports' },
    ],
  },
]
