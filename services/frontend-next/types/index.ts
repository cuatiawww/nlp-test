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
