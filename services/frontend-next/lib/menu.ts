import { Home, Radio, Database, Activity, Search, MapPin, AlertTriangle, Users, Tags, BookText, ShieldCheck, Languages, Braces, Cpu, FileText } from 'lucide-react'

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

export const sidebarMenu: SidebarGroup[] = [
  {
    title: 'PEMANTAUAN',
    titleKey: 'sidebar.sections.monitoring',
    items: [
      { label: 'Beranda', labelKey: 'sidebar.items.home', icon: Home, href: '/' },
      { label: 'Sumber Data', labelKey: 'sidebar.items.sources', icon: Radio, href: '/sources' },
      { label: 'Events', labelKey: 'sidebar.items.events', icon: Database, href: '/events' },
      { label: 'Analisis URL', labelKey: 'sidebar.items.analyze', icon: Search, href: '/analyze' },
      { label: 'Processing', labelKey: 'sidebar.items.processing', icon: Activity, href: '/processing' },
    ],
  },
  {
    title: 'KONFIGURASI',
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
      { label: 'Users', labelKey: 'sidebar.items.users', icon: Users, href: '/users' },
    ],
  },
  {
    title: 'DOKUMENTASI',
    titleKey: 'sidebar.sections.documentation',
    items: [
      { label: 'Hardcode Audit 1', labelKey: 'sidebar.items.hardcode1', icon: FileText, href: '/audit/hardcode-1' },
      { label: 'Hardcode Audit 2', labelKey: 'sidebar.items.hardcode2', icon: FileText, href: '/audit/hardcode-2' },
    ],
  },
]
