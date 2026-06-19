export type MetricCard = {
  title: string
  value: string
  delta: string
  icon: string
  iconTone: string
}

export type SidebarMenuItem = {
  label: string
  iconKey: string
  active?: boolean
  section?: string
  url?: string
}

export type SidebarMenuGroup = {
  title: string
  items: SidebarMenuItem[]
}

export type AspectScore = {
  label: string
  value: number
  tone: string
}

export type DashboardData = {
  greeting: {
    title: string
    subtitle: string
  }
  metrics: Array<{
    title: string
    value: string
    delta: string
    iconKey: string
    iconTone: string
  }>
  summary: {
    average: string
    category: string
    delta: string
  }
  aspectScores: AspectScore[]
  starDistribution: Array<{
    label: string
    total: number
    percent: number
    tone: string
  }>
  trend: Array<{
    year: string
    value: number
  }>
  topCampuses: Array<{
    name: string
    stars: number
    score: string
  }>
  processStatus: Array<{
    stage: string
    total: string
    percent: string
    tone: string
  }>
  lowestAspects: Array<{
    name: string
    score: number
    percent: number
    tone: string
  }>
  notifications: Array<{
    text: string
    total: number
    tone: string
  }>
  provinces: string[]
  sourceInfo: {
    sourceLabel: string
    sourceValue: string
    dateLabel: string
    dateValue: string
  }
  sidebarMenu: SidebarMenuGroup[]
}
