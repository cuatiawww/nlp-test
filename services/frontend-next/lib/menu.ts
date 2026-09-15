import { Home, Radio, Database, Activity, Search, MapPin, AlertTriangle, Users, Tags, BookText, ShieldCheck, Languages, Braces, Cpu, FileText, FileSpreadsheet, Settings } from 'lucide-react'

import { Stethoscope, Globe2 } from 'lucide-react'

export type SidebarItem = {
  // Disease master uses the same icon family as the rest of the configuration menu.
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
      { label: 'Regions/Country', labelKey: 'sidebar.items.regionsCountry', icon: Globe2, href: '/countries' },
      { label: 'Diseases', labelKey: 'sidebar.items.diseases', icon: Stethoscope, href: '/diseases' },
      { label: 'Data Sources', labelKey: 'sidebar.items.sources', icon: Radio, href: '/sources' },
      { label: 'Events', labelKey: 'sidebar.items.events', icon: Database, href: '/events' },
      { label: 'URL Analysis', labelKey: 'sidebar.items.analyze', icon: Search, href: '/analyze' },
      { label: 'Manual Crawler', labelKey: 'sidebar.items.manualCrawler', icon: FileText, href: '/manual-crawler' },
      { label: 'Processing', labelKey: 'sidebar.items.processing', icon: Activity, href: '/processing' },
      { label: 'Reports', labelKey: 'sidebar.items.reports', icon: FileText, href: '/reports' },
      { label: 'Event matrix', labelKey: 'sidebar.items.eventMatrix', icon: FileSpreadsheet, href: '/reports/matrix' },
    ],
  },
  {
    title: 'CONFIGURATION',
    titleKey: 'sidebar.sections.configuration',
    items: [
      { label: 'Locations', labelKey: 'sidebar.items.locations', icon: MapPin, href: '/locations' },
      { label: 'Disease Master', labelKey: 'sidebar.items.diseaseMaster', icon: Stethoscope, href: '/disease-master' },
      { label: 'Credibility', labelKey: 'sidebar.items.credibility', icon: ShieldCheck, href: '/source-credibility' },
      { label: 'Outbreak Rules', labelKey: 'sidebar.items.outbreakRules', icon: AlertTriangle, href: '/outbreak-rules' },
      { label: 'NLP Labels', labelKey: 'sidebar.items.nlpLabels', icon: Tags, href: '/nlp-labels' },
      { label: 'NLP Keywords', labelKey: 'sidebar.items.nlpKeywords', icon: BookText, href: '/nlp-keywords' },
      { label: 'Language Markers', labelKey: 'sidebar.items.languageMarkers', icon: Languages, href: '/language-markers' },
      { label: 'Extraction Rules', labelKey: 'sidebar.items.extractionRules', icon: Braces, href: '/extraction-rules' },
      { label: 'Language Models', labelKey: 'sidebar.items.languageModels', icon: Cpu, href: '/language-models' },
      { label: 'Interoperability', icon: Settings, href: '/interoperability' },
    ],
  },
  {
    title: 'DOCUMENTATION',
    titleKey: 'sidebar.sections.documentation',
    items: [
      { label: 'Business Process', icon: BookText, href: '/business-process' },
    ],
  },
]

// Dedicated Console Menu in Full English
export const consoleMenu: SidebarGroup[] = [
  {
    title: 'SYSTEM MANAGEMENT',
    items: [
      { label: 'Configuration & Branding', icon: Settings, href: '/console/settings' },
      { label: 'Publication CMS & Reports', icon: FileText, href: '/reports/cms' },
      { label: 'User Management', icon: Users, href: '/console/users' },
      { label: 'Activity Audit Logs', icon: FileText, href: '/console/settings?tab=audit' },
    ],
  },
  {
    title: 'NAVIGATION',
    items: [
      { label: 'Surveillance Dashboard', icon: Home, href: '/' },
      { label: 'TV Command Center', icon: Activity, href: '/tv' },
      { label: 'Reports', icon: FileText, href: '/reports' },
      { label: 'Event matrix', icon: FileSpreadsheet, href: '/reports/matrix' },
    ],
  },
]
