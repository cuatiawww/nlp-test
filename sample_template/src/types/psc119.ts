// Type definitions untuk PSC 119 Dashboard

export type AmbulanceSummaryCard = {
  title: string
  value: string
  detailLabel: string
  footerType: 'yearly' | 'breakdown' | 'daily'
  change?: string
  yearLabel?: string
  baseline?: string
  gadar?: string
  transport?: string
  gps?: string
  previous?: string
  borderClass: string
  bgClass: string
  iconBgClass: string
  titleClass: string
  valueClass: string
}

export type SpatialStat = {
  value: string
  label: string
  detail: string
  borderClass: string
  bgClass: string
  valueClass: string
  labelClass: string
}

export type ChartData = {
  name: string
  gadar: number
  transport: number
}

export type RegionChartCard = {
  title: string
  borderClass: string
  titleClass: string
  data: ChartData[]
}

export type RealtimeRow = {
  ticketId: string
  status: string
  serviceType: string
  callTime: string
  officer: string
  reporter: string
  patient: string
  address: string
}

export type AmbulancePoint = {
  id: string
  name: string
  province: string
  lat: number
  lng: number
  total: number
}

export type MenuItem = {
  label: string
  href: string
  icon: React.ReactNode
}
