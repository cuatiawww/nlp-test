import { Home, Radio, Database, AlertTriangle, Users, Tags, BookText } from 'lucide-react'

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
    ],
  },
  {
    title: 'KONFIGURASI',
    items: [
      { label: 'Outbreak Rules', icon: AlertTriangle, href: '/outbreak-rules' },
      { label: 'NLP Labels', icon: Tags, href: '/nlp-labels' },
      { label: 'NLP Keywords', icon: BookText, href: '/nlp-keywords' },
      { label: 'Users', icon: Users, href: '/users' },
    ],
  },
]
