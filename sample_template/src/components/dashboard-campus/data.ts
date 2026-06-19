import {
  BarChart3,
  FileCheck2,
  FileSpreadsheet,
  Home,
  MapPinned,
  Medal,
  Settings,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import rawData from './dashboard-data.json'
import type { DashboardData, MetricCard } from './types'

const iconByMetricKey = {
  school: '/rumah sakit.svg',
  submit: '/puskesmas.svg',
  verify: '/puskesmas.svg',
  visit: '/rumah sakit.svg',
  award: '/faskes.svg',
}

export const dashboardData = rawData as DashboardData

export const metricCards: MetricCard[] = dashboardData.metrics.map((item) => ({
  title: item.title,
  value: item.value,
  delta: item.delta,
  icon: iconByMetricKey[item.iconKey as keyof typeof iconByMetricKey] ?? '/faskes.svg',
  iconTone: item.iconTone,
}))

export const sidebarIconByKey = {
  home: Home,
  map: MapPinned,
  chart: BarChart3,
  trend: Sparkles,
  fileCheck: FileCheck2,
  shield: ShieldCheck,
  fileSheet: FileSpreadsheet,
  medal: Medal,
  settings: Settings,
}
