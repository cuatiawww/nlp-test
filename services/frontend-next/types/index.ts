export type Source = {
  id: string;
  name: string;
  source_type: string;
  config: { url?: string; urls?: string[] };
  schedule?: string;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
  last_run?: {
    status: string;
    records_found: number;
    records_ingested: number;
    started_at: string;
    finished_at?: string;
  } | null;
  source_credibility?: number;
};

export type Run = {
  id: string;
  source_id: string;
  status: string;
  records_found: number;
  records_ingested: number;
  error_message?: string;
  started_at: string;
  finished_at?: string;
};

export type SummaryRow = {
  location_name?: string;
  disease_classification?: string;
  total_cases: number;
  total_deaths: number;
  max_confidence?: number;
  has_alert: boolean;
  centroid_geojson?: Record<string, unknown>;
};

export type DashboardStats = {
  by_disease: { name: string; cases: number; deaths: number }[];
  by_location: { name: string; cases: number }[];
  by_sentiment: { name: string; count: number }[];
  by_relevance: { name: string; count: number }[];
  by_source: { name: string; cases: number; count: number }[];
};

export type OutbreakLocation = {
  location_name: string;
  disease: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  cases: number;
  deaths: number;
  event_count: number;
  confidence: number | null;
  threshold: number;
  severity: "NORMAL" | "WASPADA" | "SIAGA" | "AWAS";
  has_alert: boolean;
  latest_date: string;
  detail?: {
    event_id?: string;
    raw_report_id?: string;
    url?: string | null;
    content?: string | null;
    language?: string | null;
    source_type?: string | null;
    source_name?: string | null;
    published_at?: string | null;
    symptoms?: string[];
    disease_extracted?: string[];
    sentiment?: string | null;
    event_type?: string | null;
    event_confidence?: number | null;
    relevance_score?: string | null;
    relevance_confidence?: number | null;
    source_credibility?: number | null;
    source_credibility_label?: string | null;
    needs_review?: boolean | null;
    is_health_related?: boolean | null;
    outbreak_alert?: boolean;
  };
};

export type PublicDashboard = {
  updated_at: string;
  available_years?: number[];
  filters?: { country: string | null; year: number };
  kpis: {
    cases: number;
    deaths: number;
    events: number;
    locations: number;
    active_alerts: number;
  };
  alerts: OutbreakLocation[];
  locations: OutbreakLocation[];
  by_disease: { name: string; cases: number; deaths: number; events: number }[];
  by_country: { name: string; cases: number }[];
  ai_summary: { text: string; provider: string; cached: boolean };
  trends: {
    current_month: string;
    previous_month: string;
    cases: { current: number; previous: number };
    deaths: { current: number; previous: number };
    events: { current: number; previous: number };
    locations: { current: number; previous: number };
    alerts: { current: number; previous: number };
  };
};

export type AnalyzeResponse = {
  title: string;
  content: string;
  url: string;
  language: string;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  country?: string | null;
  translated?: boolean;
  translation_provider?: string;
  translated_text?: string;
  original_location_name?: string | null;
  fetch_mode?: "http" | "stealth";
  http_status?: number;
  symptoms: string[];
  disease_extracted: string[];
  disease_classification: string;
  case_count: number;
  death_count: number;
  confidence: number;
  outbreak_alert: boolean;
  sentiment: string | null;
  sentiment_score: number | null;
  event_type: string | null;
  event_confidence: number | null;
  relevance_score: string | null;
  relevance_confidence: number | null;
  source_credibility: number | null;
  source_credibility_label: string | null;
  needs_review: boolean | null;
  is_health_related: boolean | null;
  raw_report_id: string;
  event_id: string;
  sources: Record<string, string>;
};
