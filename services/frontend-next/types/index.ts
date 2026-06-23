export type Source = {
  id: string
  name: string
  source_type: string
  config: { url?: string; urls?: string[] }
  schedule?: string
  enabled: boolean
  created_at?: string
  updated_at?: string
  last_run?: {
    status: string
    records_found: number
    records_ingested: number
    started_at: string
    finished_at?: string
  } | null
  source_credibility?: number
}

export type Run = {
  id: string
  source_id: string
  status: string
  records_found: number
  records_ingested: number
  error_message?: string
  started_at: string
  finished_at?: string
}

export type SummaryRow = {
  location_name?: string
  disease_classification?: string
  total_cases: number
  total_deaths: number
  max_confidence?: number
  has_alert: boolean
  centroid_geojson?: Record<string, unknown>
}

export type AnalyzeResponse = {
  title: string
  content: string
  url: string
  language: string
  location_name: string | null
  latitude: number | null
  longitude: number | null
  symptoms: string[]
  disease_extracted: string[]
  disease_classification: string
  case_count: number
  death_count: number
  confidence: number
  outbreak_alert: boolean
  sentiment: string | null
  sentiment_score: number | null
  event_type: string | null
  event_confidence: number | null
  relevance_score: string | null
  relevance_confidence: number | null
  source_credibility: number | null
  source_credibility_label: string | null
  needs_review: boolean | null
  is_health_related: boolean | null
  raw_report_id: string
  event_id: string
  sources: Record<string, string>
}
