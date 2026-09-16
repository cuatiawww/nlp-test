export type ReportIssueStatus =
  | "draft"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "published"
  | "superseded"
  | "archived"

export type AmsKpiRow = {
  iso3: string | null
  iso2?: string | null
  country: string
  display_name: string
  cases: number | null
  deaths: number | null
  events: number | null
  cfr: number | null
  has_data: boolean
}

export type DiseaseKpiRow = {
  disease_code: string
  name: string
  cases: number | null
  deaths: number | null
  events: number | null
  cfr: number | null
  has_data?: boolean
}

export type WeeklyPoint = {
  period: string
  year: number
  week: number
  cases: number
  deaths: number
  events: number
}

export type DiseaseSeries = {
  disease_code: string
  name: string
  series: WeeklyPoint[]
}

export type AmsWeekPoint = {
  country: string
  display_name: string
  iso3: string | null
  year: number
  week: number
  cases: number | null
  events: number | null
  has_data: boolean
}

export type SitrepKpiPackage = {
  kpi_source: string
  scope: string
  scope_label?: string
  epi_year: number
  epi_week: number
  week_start: string
  week_end: string
  ytd_start: string
  ytd_end: string
  pulled_at: string
  snapshot?: Record<string, unknown>
  kpis: {
    ytd: Record<string, number | string | boolean | null>
    week: Record<string, number | string | boolean | null>
    cfr_ytd: number | null
    cfr_week: number | null
  }
  by_ams: AmsKpiRow[]
  by_disease: DiseaseKpiRow[]
  series_weekly: WeeklyPoint[]
  series_by_disease?: DiseaseSeries[]
  ams_weekly?: AmsWeekPoint[]
  sources: { name: string; source_type: string; events: number }[]
  alerts: {
    disease: string
    country: string
    display_name?: string
    iso3?: string | null
    location_name: string
    events: number
    cases: number
    status?: string
  }[]
  matrix?: {
    disease: string
    disease_code: string
    country: string
    display_name: string
    iso3: string | null
    cases: number | null
    deaths: number | null
    events?: number | null
    cfr: number | null
    has_data: boolean
  }[]
  selected_diseases?: DiseaseRef[]
  chart_policy?: string
  map?: {
    indicator?: string
    classification?: string
    missing_policy?: string
  }
  missing_policy?: string
}

export type DiseaseRef = {
  disease_code: string
  name: string
}

export type ReportAssetPage = {
  id: string
  url: string
  caption?: string
}

export type ReportAssets = {
  cover_url?: string | null
  pages?: ReportAssetPage[]
}

export type ReportSectionOrderItem = {
  id: string
  label: string
}

export type ReportSection = {
  disease_code: string
  name: string
  has_data?: boolean
  kpis: { cases?: number | null; deaths?: number | null; events?: number | null; cfr?: number | null }
  series_weekly?: WeeklyPoint[]
  by_ams?: AmsKpiRow[]
  analyst_note: string
  analyst_note_status?: string
}

export type ReportIssue = {
  id: number
  slug: string
  title: string
  epi_year: number
  epi_week: number
  period_start: string
  period_end: string
  status: ReportIssueStatus
  template_id: string
  template_version: string
  cover_url?: string | null
  highlights: string[]
  sections: ReportSection[]
  selected_diseases?: DiseaseRef[]
  section_order?: ReportSectionOrderItem[]
  assets?: ReportAssets
  narrative?: Record<string, unknown>
  kpi_snapshot?: SitrepKpiPackage | null
  published_snapshot?: SitrepKpiPackage | null
  chart_policy?: string
  map?: {
    indicator?: string
    classification?: string
    geojson_ref?: string
    missing_policy?: string
  }
  sources: { name: string; source_type: string; events: number }[]
  limitations?: string | null
  visibility?: string
  created_by?: string | null
  updated_by?: string | null
  published_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  changelog?: {
    from_status?: string | null
    to_status: string
    actor?: string | null
    comment?: string | null
    created_at?: string | null
  }[]
}

export type ReportIssueCard = {
  id: number
  slug: string
  title: string
  epi_year: number
  epi_week: number
  period_start: string
  period_end: string
  status: ReportIssueStatus
  cover_url?: string | null
  published_at?: string | null
  template_id?: string
  template_version?: string
  diseases?: string[]
  kpis?: { cases?: number; deaths?: number; events?: number }
}

export const REPORT_STATUSES: ReportIssueStatus[] = [
  "draft",
  "in_review",
  "changes_requested",
  "approved",
  "published",
  "superseded",
  "archived",
]
