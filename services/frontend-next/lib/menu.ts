import { Home, Radio, Database, Activity, Search, MapPin, AlertTriangle, Users, Tags, BookText, ShieldCheck, Languages, Braces, Cpu, FileText } from 'lucide-react'

export type SidebarItem = {
  label: string
  icon: any
  href?: string
  url?: string
  external?: boolean
}

export type SidebarGroup = {
  title: string
  items: SidebarItem[]
}

export const sidebarMenu: SidebarGroup[] = [
  {
    title: 'PEMANTAUAN',
    items: [
      { label: 'Beranda', icon: Home, href: '/' },
      { label: 'Sumber Data', icon: Radio, href: '/sources' },
      { label: 'Events', icon: Database, href: '/events' },
      { label: 'Analisis URL', icon: Search, href: '/analyze' },
      { label: 'Processing', icon: Activity, href: '/processing' },
    ],
  },
  {
    title: 'KONFIGURASI',
    items: [
      { label: 'Locations', icon: MapPin, href: '/locations' },
      { label: 'Credibility', icon: ShieldCheck, href: '/source-credibility' },
      { label: 'Outbreak Rules', icon: AlertTriangle, href: '/outbreak-rules' },
      { label: 'NLP Labels', icon: Tags, href: '/nlp-labels' },
      { label: 'NLP Keywords', icon: BookText, href: '/nlp-keywords' },
      { label: 'Language Markers', icon: Languages, href: '/language-markers' },
      { label: 'Extraction Rules', icon: Braces, href: '/extraction-rules' },
      { label: 'Language Models', icon: Cpu, href: '/language-models' },
      { label: 'Users', icon: Users, href: '/users' },
    ],
  },
  {
    title: 'DOKUMENTASI',
    items: [
      { label: 'Hardcode Audit 1', icon: FileText, href: '/audit/hardcode-1' },
      { label: 'Hardcode Audit 2', icon: FileText, href: '/audit/hardcode-2' },
    ],
  },
]
