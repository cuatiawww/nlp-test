export type Source = {
  id: string;
  name: string;
  source_type: string;
  config: Record<string, any> & { url?: string; urls?: string[] };
  country?: string | null;
  catalog_type?: string | null;
  validity_status?: string | null;
  source_origin?: string | null;
  schedule?: string;
  effective_schedule?: string;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
  last_run?: {
    status: string;
    records_found: number;
    records_ingested: number;
    started_at: string;
    finished_at?: string | null;
  } | null;
  in_flight?: boolean;
  source_credibility?: number;
  coverage_scope?: string | null;
  covers_asean?: boolean;
  credibility_reason?: string | null;
  last_credibility_refresh?: string | null;
  credibility_override?: number | null;
};

export type SourceSummary = {
  total_sources: number;
  web_sources: number;
  credible_sources: number;
  needs_review_sources: number;
  average_credibility: number;
  asean_sources: number;
  asean_outlet_sources?: number;
  outside_sources: number;
  source_country_unfilled?: number;
  global_outlet_sources?: number;
  unclassified_sources?: number;
  covers_asean_sources?: number;
  global_covering_asean?: number;
  credibility_threshold: number;
  last_credibility_refresh?: string | null;
  credibility_meaning?: string;
  source_country_meaning?: string;
  asean_by_country: { country: string; source_count: number }[];
  by_catalog_type?: { catalog_type: string; source_count: number }[];
  last_run_at?: string | null;
  crawler_mode?: string;
  enabled_sources?: number;
  scheduled_sources?: number;
  active_run_count?: number;
};

export type Run = {
  id: string;
  source_id: string;
  source_name?: string | null;
  status: string;
  records_found: number;
  records_ingested: number;
  error_message?: string;
  started_at: string;
  finished_at?: string;
  schedule?: string | null;
};

export type CrawlOps = {
  failed_queue: Array<{
    source_id: string;
    source_name: string;
    schedule?: string | null;
    run_id: string;
    status: string;
    error_message?: string | null;
    started_at?: string | null;
    finished_at?: string | null;
    records_found: number;
    records_ingested: number;
  }>;
  recent_history: Run[];
  backoff_source_count: number;
  dispatcher?: string;
  default_schedule?: string;
};

export type DiseaseEvent = {
  id: string;
  source_type?: string | null;
  source_name?: string | null;
  published_at?: string | null;
  language?: string | null;
  location_name?: string | null;
  country?: string | null;
  province?: string | null;
  city?: string | null;
  disease_classification?: string | null;
  case_count?: number | null;
  death_count?: number | null;
  confidence?: number | null;
  outbreak_alert?: boolean | null;
  created_at?: string | null;
  sentiment?: string | null;
  event_type?: string | null;
  relevance_score?: string | null;
  source_credibility?: number | null;
  source_credibility_label?: string | null;
  needs_review?: boolean | null;
  url?: string | null;
  title?: string | null;
  is_health_related?: boolean | null;
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
  province?: string | null;
  city?: string | null;
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
  sources?: {
    url?: string | null;
    source_name?: string | null;
    source_type?: string | null;
    published_at?: string | null;
  }[];
  recent_cases?: number;
  previous_period_cases?: number;
  recent_event_count?: number;
  recent_source_count?: number;
  is_recent?: boolean;
  is_hot?: boolean;
  detail?: {
    event_id?: string;
    province?: string | null;
    city?: string | null;
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

export type PublicDashboardFilters = {
  country?: string | null;
  year?: number;
  disease?: string | null;
  source?: string | null;
  start_year?: number;
  start_week?: number;
  end_year?: number;
  end_week?: number;
  start_date?: string;
  end_date?: string;
};

export type PublicDashboard = {
  updated_at: string;
  available_years?: number[];
  available_diseases?: string[];
  current_epi_week?: number;
  current_epi_year?: number;
  filters?: PublicDashboardFilters;
  kpis: {
    cases: number;
    deaths: number;
    events: number;
    locations: number;
    active_alerts: number;
    active_locations?: number;
    location_master_count?: number;
    snapshot_id?: string;
    snapshot_computed_at?: string;
    snapshot_filter_key?: string;
    snapshot_stale?: boolean;
    kpi_source?: string;
  };
  alerts: OutbreakLocation[];
  locations: OutbreakLocation[];
  by_disease: { name: string; cases: number; deaths: number; events: number }[];
  by_country: { name: string; cases: number; deaths?: number }[];
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
  weekly_trend?: { period?: string; week: number; cases: number; deaths: number; events: number; alerts?: number }[];
};

export type IbsSummary = {
  source: string;
  year: number;
  available_years: number[];
  totals: { reports: number; cases: number; deaths: number };
  status: {
    klb: number;
    investigation: number;
    verified: number;
    negative_discarded: number;
    with_deaths: number;
  };
  by_disease: { name: string; cases: number; deaths: number; reports: number }[];
  by_province: { name: string; cases: number; deaths: number; reports: number }[];
  weekly_trend: { week: number; cases: number; deaths: number; reports: number }[];
};

export type AnalyzeResponse = {
  title: string;
  content: string;
  summary?: string;
  url: string;
  published_at?: string | null;
  language: string;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  country?: string | null;
  locations?: { name: string; latitude?: number | null; longitude?: number | null; country?: string | null }[];
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
  case_count_unknown?: boolean;
  death_count: number;
  province?: string | null;
  evidence?: string[];
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
  sub_events?: {
    disease: string;
    disease_icd11_code?: string | null;
    location_name: string;
    country?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    case_count: number;
    death_count: number;
    evidence?: string;
  }[];
  disease_mentions?: {
    surface_form?: string;
    canonical_name?: string;
    role?: string;
    icd11_code?: string | null;
    evidence?: string;
  }[];
  sources: Record<string, string>;
};

export type InteroperabilityIntegration = {
  id: string;
  name: string;
  integration_type: string;
  provider?: string | null;
  source_url?: string | null;
  endpoint?: string | null;
  status: 'ACTIVE' | 'IN_PROGRESS' | 'INACTIVE' | 'ERROR' | 'PLANNED' | string;
  integrated_in: string[];
  description?: string | null;
  enabled: boolean;
  last_checked_at?: string | null;
  last_error?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type CrawlMatrixRow = {
  id: string;
  disease_name: string;
  icd11_code?: string | null;
  crawling_date?: string | null;
  region?: string | null;
  country: string;
  province?: string | null;
  city?: string | null;
  province_city_case?: string | null;
  article_date?: string | null;
  date_case?: string | null;
  number_of_cases: number;
  number_of_deaths: number;
  latitude?: number | null;
  longitude?: number | null;
  source_type?: string | null;
  source_name?: string | null;
  source_url?: string | null;
  article_title?: string | null;
  evidence?: string | null;
  confidence?: number | null;
  processing_status?: string | null;
  raw_report_id?: string | null;
  reprocessed_at?: string | null;
};

export type CrawlHistoryChannel = 'manual' | 'continuous' | 'analyze-url' | string;

export type CrawlHistoryRow = {
  id: string;
  crawl_channel: CrawlHistoryChannel;
  job_id?: string | null;
  raw_report_id?: string | null;
  disease_event_id?: string | null;
  title?: string | null;
  url?: string | null;
  published_at?: string | null;
  country?: string | null;
  province?: string | null;
  city?: string | null;
  disease?: string | null;
  icd11_code?: string | null;
  cases: number;
  deaths: number;
  confidence?: number | null;
  source_type?: string | null;
  source_name?: string | null;
  status?: string | null;
  needs_review: boolean;
  has_geo: boolean;
  mapped: boolean;
  quality_class?: string | null;
  is_health_related?: boolean | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at?: string | null;
  evidence?: string | null;
  snippet?: string | null;
  language?: string | null;
  sentiment?: string | null;
  location_name?: string | null;
  symptoms?: unknown;
  disease_extracted?: unknown;
  job?: CrawlHistoryJob;
};

export type CrawlHistoryJob = {
  job_id: string;
  status: string;
  disease_names?: string[] | unknown;
  region?: string | null;
  country?: string | null;
  province_city?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  max_articles?: number;
  query?: { url?: string | null; [key: string]: unknown };
  discovered_count: number;
  processed_count: number;
  row_count: number;
  warnings?: unknown;
  error?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
  rows?: CrawlHistoryRow[];
};

export type CrawlHistorySummary = {
  phase?: string;
  note?: string;
  jobs: number;
  matrix_rows: number;
  raw_reports: number;
  disease_events: number;
  by_channel: {
    manual: number;
    continuous: number;
    analyze_url: number;
  };
  with_geo: number;
  without_geo: number;
  needs_review: number;
  mapped: number;
  default_quality?: string;
  quality?: {
    surveillance: number;
    review: number;
    noise: number;
  };
  noise_excluded?: number;
  fields?: string[];
};

export type CrawlJobStatus = {
  job_id: string;
  status: 'queued' | 'processing' | 'completed' | 'partial' | 'failed' | string;
  disease_names: string[];
  region?: string | null;
  country?: string | null;
  discovered_count: number;
  processed_count: number;
  row_count: number;
  warnings?: string[];
  error?: string | null;
  query?: { url?: string | null; [key: string]: unknown };
  created_at?: string;
  updated_at?: string;
  rows: CrawlMatrixRow[];
};
// ── External Map Layer Types ──────────────────────────────────────────

export type VectorSighting = {
  latitude: number;
  longitude: number;
  species: string;
  observed_on: string;
  photo_url?: string;
  place?: string;
};

export type MapLayerCacheFlags = {
  cached?: boolean;
  stale?: boolean;
  fromCache?: boolean;
};

export type VectorSightingsResponse = {
  status: string;
  source: string;
  total?: number;
  sightings: VectorSighting[];
  error?: string;
} & MapLayerCacheFlags;

export type LiveFlight = {
  icao24?: string | null;
  callsign?: string | null;
  origin_country?: string | null;
  latitude: number;
  longitude: number;
  altitude_m?: number | null;
  on_ground?: boolean | null;
  velocity_ms?: number | null;
  heading?: number | null;
  vertical_rate_ms?: number | null;
  squawk?: string | null;
  last_contact?: number | null;
};

export type LiveFlightsResponse = {
  status: string;
  source: string;
  total: number;
  flights: LiveFlight[];
  error?: string;
} & MapLayerCacheFlags;

export type FireHotspot = {
  latitude: number;
  longitude: number;
  brightness?: number | null;
  confidence?: string | null;
  acq_date?: string | null;
  acq_time?: string | null;
  satellite?: string | null;
  frp?: number | null;
};

export type FireHotspotsResponse = {
  status: string;
  source: string;
  total?: number;
  hotspots: FireHotspot[];
  error?: string;
} & MapLayerCacheFlags;

export type HealthFacility = {
  name: string;
  latitude: number;
  longitude: number;
  amenity_type: string;
  osm_id?: number | string | null;
};

export type HealthFacilitiesResponse = {
  status: string;
  source: string;
  total?: number;
  facilities: HealthFacility[];
  error?: string;
} & MapLayerCacheFlags;

export type DiseaseNewsArticle = {
  title: string;
  url: string;
  domain: string;
  source_country: string;
  language: string;
  seen_date: string;
};

export type DiseaseNewsResponse = {
  status: string;
  source: string;
  total?: number;
  articles: DiseaseNewsArticle[];
  error?: string;
} & MapLayerCacheFlags;

export type WorldPopMeta = {
  status: string;
  source: string;
  iso3: string;
  country?: string;
  year?: string;
  title?: string;
  tif_url?: string;
  summary_url?: string;
  error?: string;
} & MapLayerCacheFlags;

export type NasaGibsLayers = {
  viirsTrueColor?: boolean;
  modisTrueColor?: boolean;
  aerosol?: boolean;
  ndvi?: boolean;
  nightLights?: boolean;
  landSurfaceTemp?: boolean;
};

export type ExternalIntelLayers = {
  vectors?: boolean;
  flights?: boolean;
  fires?: boolean;
  facilities?: boolean;
  news?: boolean;
  population?: boolean;
  weather?: boolean;
  airQuality?: boolean;
};

export type MapLayerStatusState =
  | "idle"
  | "loading"
  | "ok"
  | "cached"
  | "empty"
  | "timeout"
  | "auth"
  | "upstream"
  | "unavailable"
  | "error";

export type MapLayerStatus = {
  state: MapLayerStatusState;
  count?: number;
  message?: string;
  source?: string;
};

export type EnvironmentMarker = {
  country: string;
  display_name: string;
  capital: string;
  latitude: number;
  longitude: number;
  temperature_c?: number | null;
  relative_humidity_pct?: number | null;
  precipitation_mm?: number | null;
  wind_speed_kmh?: number | null;
  weather_observed_at?: string | null;
  european_aqi?: number | null;
  us_aqi?: number | null;
  aqi_label?: string | null;
  pm2_5?: number | null;
  pm10?: number | null;
  so2?: number | null;
  air_observed_at?: string | null;
  weather_status?: string | null;
  air_status?: string | null;
  weather_error?: string | null;
  air_error?: string | null;
  partial?: boolean;
};

export type MapHazardsResponse = {
  status: string;
  source: string;
  total?: number;
  events: Array<{
    id?: string | number | null;
    source?: string | null;
    kind?: string | null;
    title?: string | null;
    latitude: number;
    longitude: number;
    magnitude?: number | null;
    alert_level?: string | null;
    when?: string | number | null;
    url?: string | null;
  }>;
  error?: string | null;
} & MapLayerCacheFlags;

export type MapEnvironmentResponse = {
  status: string;
  source: string;
  total?: number;
  markers: EnvironmentMarker[];
  error?: string | null;
} & MapLayerCacheFlags;
