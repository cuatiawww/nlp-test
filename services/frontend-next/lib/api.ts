import { getCurrentEpiWeek } from "@/lib/epi-week";
import { ASEAN11_SCOPE, isAseanDefaultScope } from "@/lib/asean-scope";
import { fetchMapLayer, LAYER_TTL_MS } from "@/lib/map-layer-client.mjs";
import type {
  Source,
  Run,
  SummaryRow,
  DashboardStats,
  PublicDashboard,
  DiseaseEvent,
  CrawlJobStatus,
  CrawlHistoryRow,
  CrawlHistoryJob,
  CrawlHistorySummary,
  InteroperabilityIntegration,
  SourceSummary,
  VectorSightingsResponse,
  LiveFlightsResponse,
  FireHotspotsResponse,
  HealthFacilitiesResponse,
  DiseaseNewsResponse,
  WorldPopMeta,
  MapHazardsResponse,
  MapEnvironmentResponse,
} from "@/types";

// Client-side: proxy via Next.js rewrites /nlp/api/* → backend-rust:8081/api/*
// Server-side: use internal Docker DNS
function baseURL(): string {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_BASE_PATH || "/nlp";
  }

  return process.env.API_INTERNAL_URL || "http://backend-rust:8081";
}

function authHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatApiError(res: Response, json?: any): string {
  if (json?.error && typeof json.error === "string") return json.error;
  if (json?.detail && typeof json.detail === "string") return json.detail;
  if (res.status === 401 || res.status === 403) {
    return `Authentication required (${res.status}). Sign in or configure the upstream API key.`;
  }
  if (res.status === 408) {
    return "URL extraction timed out. The source website is slow or blocking crawler access.";
  }
  if (res.status === 429) {
    return "Upstream rate-limited (429). Wait before retrying this layer.";
  }
  if (res.status === 503) {
    return "Service unavailable (503): gateway or upstream overloaded. This is not a generic server crash.";
  }
  if (res.status === 504) {
    return "Gateway Timeout (504): Server atau website sumber artikel membutuhkan waktu terlalu lama untuk merespons. Silakan periksa apakah tautan dapat diakses dan coba beberapa saat lagi.";
  }
  if (res.status === 502) {
    return "Bad Gateway (502): Layanan backend sedang tidak dapat dihubungi atau sedang restart. Silakan coba kembali.";
  }
  if (res.status >= 500) {
    return `Upstream error (${res.status}${res.statusText ? `: ${res.statusText}` : ""}).`;
  }
  const text = res.statusText ? `: ${res.statusText}` : "";
  return `API ${res.status}${text}`;
}

export async function fetchFrom<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseURL()}${path}`, {
    cache: "no-store",
    ...init,
    headers: { ...authHeaders(), ...(init?.headers || {}) },
  });
  if (init?.signal?.aborted) {
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(formatApiError(res, json));
  return (json?.data ?? json) as T;
}

export async function postTo<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseURL()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(formatApiError(res, json));
  }

  return (json?.data ?? json) as T;
}

export async function putTo<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseURL()}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(formatApiError(res, json));

  return (json?.data ?? json) as T;
}

export async function patchTo<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseURL()}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(formatApiError(res, json));
  return (json?.data ?? json) as T;
}

export async function delFrom(path: string): Promise<void> {
  const res = await fetch(`${baseURL()}${path}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error(formatApiError(res, json));
  }
}

// ── Auth-aware internal helpers ────────────────────

async function fetchAuth<T>(path: string): Promise<T> {
  const res = await fetch(`${baseURL()}${path}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  const json = await res.json();
  return json.data as T;
}

async function postAuth<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseURL()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  const json = await res.json();
  return json.data as T;
}

async function putAuth<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseURL()}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error(formatApiError(res, json));
  }
  const json = await res.json().catch(() => null);
  return (json?.data ?? json) as T;
}

async function delAuth(path: string): Promise<void> {
  const res = await fetch(`${baseURL()}${path}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
}

// ── Login (special response shape: { success, data: { token } }) ──

export async function loginUser(
  username: string,
  password: string,
): Promise<any> {
  const res = await fetch(`${baseURL()}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error || `API ${res.status}: ${res.statusText}`);
  if (!data.success) throw new Error(data.error || "Login failed");
  return data.data;
}

// ── Existing named helpers ─────────────────────────

export const fetchSources = () => fetchFrom<Source[]>("/api/v1/sources");
export const fetchSourceSummary = () => fetchFrom<SourceSummary>("/api/v1/sources/summary");
export const createSource = (data: Partial<Source>) =>
  postTo<Source>("/api/v1/sources", data);
export const updateSource = (id: string, data: Partial<Source>) =>
  putTo<Source>(`/api/v1/sources/${id}`, data);
export const deleteSource = (id: string) => delFrom(`/api/v1/sources/${id}`);

// ── Interoperability catalog (admin mutations) ───────────────

export const createInteroperabilityIntegration = (data: Partial<InteroperabilityIntegration>) =>
  postAuth<InteroperabilityIntegration>('/api/v1/interoperability-integrations', data);
export const updateInteroperabilityIntegration = (id: string, data: Partial<InteroperabilityIntegration>) =>
  putAuth<InteroperabilityIntegration>(`/api/v1/interoperability-integrations/${id}`, data);
export const deleteInteroperabilityIntegration = (id: string) =>
  delAuth(`/api/v1/interoperability-integrations/${id}`);
export const triggerCollect = (id: string) =>
  postTo(`/api/v1/sources/${id}/collect`);
export const triggerCollectAll = () => postTo("/api/v1/sources/collect-all");
export const fetchRuns = (sourceId?: string, status?: string) => {
  const params = new URLSearchParams();
  if (sourceId) params.set("source_id", sourceId);
  if (status) params.set("status", status);
  const query = params.toString();
  return fetchFrom<Run[]>(`/api/v1/runs${query ? `?${query}` : ""}`);
};
export const fetchCrawlOps = () => fetchFrom<import("@/types").CrawlOps>("/api/v1/crawl-ops");
export const recomputeSourceCredibility = () =>
  postTo<{ updated: number; threshold: number; meaning: string }>("/api/v1/source-credibility/recompute", {});
export const fetchSummary = () => fetchFrom<SummaryRow[]>("/api/v1/summary");

// ── NLP Keywords ──────────────────────────────────

export const fetchNlpKeywords = (category: string) =>
  fetchFrom<any[]>(`/api/v1/nlp-keywords?category=${category}`);
export const createNlpKeyword = (data: any) =>
  postTo("/api/v1/nlp-keywords", data);
export const updateNlpKeyword = (id: string, data: any) =>
  putTo(`/api/v1/nlp-keywords/${id}`, data);
export const deleteNlpKeyword = (id: string) =>
  delFrom(`/api/v1/nlp-keywords/${id}`);

// ── NLP Labels ────────────────────────────────────

export const fetchNlpLabels = (category: string) =>
  fetchFrom<any[]>(`/api/v1/nlp-labels?category=${category}`);
export const createNlpLabel = (data: any) => postTo("/api/v1/nlp-labels", data);
export const updateNlpLabel = (id: string, data: any) =>
  putTo(`/api/v1/nlp-labels/${id}`, data);
export const deleteNlpLabel = (id: string) =>
  delFrom(`/api/v1/nlp-labels/${id}`);

// ── Outbreak Rules ────────────────────────────────

export const fetchOutbreakRules = () =>
  fetchFrom<any[]>("/api/v1/outbreak-rules");
export const createOutbreakRule = (data: any) =>
  postTo("/api/v1/outbreak-rules", data);
export const updateOutbreakRule = (id: string, data: any) =>
  postTo(`/api/v1/outbreak-rules/${id}/edit`, data);
export const deleteOutbreakRule = (id: string) =>
  delFrom(`/api/v1/outbreak-rules/${id}`);

// ── Users (auth) ──────────────────────────────────

export const fetchUsers = () => fetchAuth<any[]>("/api/v1/users");
export const createUser = (data: any) => postAuth("/api/v1/users", data);
export const updateUser = (id: string, data: any) => postAuth(`/api/v1/users/${id}/edit`, data);
export const deleteUser = (id: string) => delAuth(`/api/v1/users/${id}`);

// ── Roles & Levels (auth) ─────────────────────────

export interface RoleItem {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
  is_system?: boolean;
  created_at?: string;
  user_count?: number;
}

export const fetchRoles = () => fetchAuth<RoleItem[]>("/api/v1/roles");
export const createRole = (data: Partial<RoleItem>) => postAuth("/api/v1/roles", data);
export const updateRole = (id: string, data: Partial<RoleItem>) => putAuth(`/api/v1/roles/${id}`, data);
export const deleteRole = (id: string) => delAuth(`/api/v1/roles/${id}`);

// ── Locations ────────────────────────────────────

export const fetchLocations = () => fetchFrom<any[]>("/api/v1/locations");
export const createLocation = (data: any) => postTo("/api/v1/locations", data);
export const updateLocation = (id: string, data: any) =>
  putTo(`/api/v1/locations/${id}`, data);
export const deleteLocation = (id: string) =>
  delFrom(`/api/v1/locations/${id}`);

// ── Disease Master (WHO ICD-11) ───────────────────

export interface DiseaseConcept {
  id: string;
  canonical_name: string;
  ontology_system?: string | null;
  ontology_code?: string | null;
  ontology_uri?: string | null;
  ontology_release?: string | null;
  source: string;
  confidence: number;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export const fetchDiseaseConcepts = () =>
  fetchFrom<DiseaseConcept[]>('/api/v1/disease-concepts');
export const createDiseaseConcept = (data: Partial<DiseaseConcept>) =>
  postTo<DiseaseConcept>('/api/v1/disease-concepts', data);
export const updateDiseaseConcept = (id: string, data: Partial<DiseaseConcept>) =>
  putTo<DiseaseConcept>(`/api/v1/disease-concepts/${id}`, data);
export const deleteDiseaseConcept = (id: string) =>
  delFrom(`/api/v1/disease-concepts/${id}`);

// ── Manual Crawler ───────────────────────────────

export type CrawlJobRequest = {
  disease_concept_ids: string[];
  url?: string | null;
  region?: string | null;
  country?: string | null;
  province_city?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  max_articles?: number;
};

export const createCrawlJob = (data: CrawlJobRequest) =>
  postTo<{ job_id: string; status: string }>('/api/v1/manual-crawler/jobs', data);
export const fetchCrawlJob = (id: string) =>
  fetchFrom<CrawlJobStatus>(`/api/v1/manual-crawler/jobs/${encodeURIComponent(id)}`);
export const reprocessCrawlJob = (id: string) =>
  postTo<{ job_id: string; status: string }>(`/api/v1/manual-crawler/jobs/${encodeURIComponent(id)}/reprocess`);

export type CrawlHistoryFilters = {
  page?: number;
  per_page?: number;
  q?: string;
  channel?: string;
  country?: string;
  disease?: string;
  date_from?: string;
  date_to?: string;
  status?: string;
  needs_review?: boolean;
  has_geo?: boolean;
  job_id?: string;
  quality?: string;
};

function crawlHistoryParams(filters: CrawlHistoryFilters = {}) {
  const params = new URLSearchParams();
  if (filters.page) params.set('page', String(filters.page));
  if (filters.per_page) params.set('per_page', String(filters.per_page));
  if (filters.q) params.set('q', filters.q);
  if (filters.channel && filters.channel !== 'all') params.set('channel', filters.channel);
  if (filters.country && filters.country !== 'all') params.set('country', filters.country);
  if (filters.disease) params.set('disease', filters.disease);
  if (filters.date_from) params.set('date_from', filters.date_from);
  if (filters.date_to) params.set('date_to', filters.date_to);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (typeof filters.needs_review === 'boolean') params.set('needs_review', String(filters.needs_review));
  if (typeof filters.has_geo === 'boolean') params.set('has_geo', String(filters.has_geo));
  if (filters.job_id) params.set('job_id', filters.job_id);
  if (filters.quality) params.set('quality', filters.quality);
  return params;
}

export const fetchCrawlHistorySummary = () =>
  fetchFrom<CrawlHistorySummary>('/api/v1/crawl-history/summary');

export const fetchCrawlHistoryRows = (filters: CrawlHistoryFilters = {}) => {
  const query = crawlHistoryParams(filters).toString();
  return fetchPaginated<CrawlHistoryRow>(`/api/v1/crawl-history/rows${query ? `?${query}` : ''}`);
};

export const fetchCrawlHistoryRow = (id: string, channel?: string) => {
  const params = new URLSearchParams();
  if (channel && channel !== 'all') params.set('channel', channel);
  const query = params.toString();
  return fetchFrom<CrawlHistoryRow>(
    `/api/v1/crawl-history/rows/${encodeURIComponent(id)}${query ? `?${query}` : ''}`,
  );
};

export const fetchCrawlHistoryJobs = (filters: CrawlHistoryFilters = {}) => {
  const query = crawlHistoryParams(filters).toString();
  return fetchPaginated<CrawlHistoryJob>(`/api/v1/crawl-history/jobs${query ? `?${query}` : ''}`);
};

export const fetchCrawlHistoryJob = (id: string) =>
  fetchFrom<CrawlHistoryJob>(`/api/v1/crawl-history/jobs/${encodeURIComponent(id)}`);

export async function downloadCrawlHistoryExport(
  filters: CrawlHistoryFilters,
  format: 'csv' | 'xlsx',
) {
  const params = crawlHistoryParams({ ...filters, page: undefined, per_page: 5000 });
  params.set('format', format);
  const res = await fetch(`${baseURL()}/api/v1/crawl-history/rows?${params.toString()}`, {
    cache: 'no-store',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error(formatApiError(res, json));
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = format === 'csv' ? 'crawl-history.csv' : 'crawl-history.xls';
  anchor.click();
  URL.revokeObjectURL(url);
}

// ── Source Credibility ──────────────────────────

export const fetchCredibility = () =>
  fetchFrom<any[]>("/api/v1/source-credibility");
export const createCredibility = (data: any) =>
  postTo("/api/v1/source-credibility", data);
export const updateCredibility = (id: string, data: any) =>
  putTo(`/api/v1/source-credibility/${id}`, data);
export const deleteCredibility = (id: string) =>
  delFrom(`/api/v1/source-credibility/${id}`);


// ── Crawling Stats ─────────────────────────────────────
export interface CrawlingStats {
  total: number;
  this_month: number;
  last_month: number;
  total_processed: number;
  stored_in_db?: number;
  nlp_processing?: number;
  current_month: string;
  previous_month: string;
  live_crawled: number;
  current_live_crawl?: number;
  total_crawled_all_time?: number;
  active_run_count: number;
  active_since: string | null;
  collector_status: "RUNNING" | "IDLE" | string;
  last_report_at: string | null;
  last_run_at?: string | null;
  enabled_sources?: number;
  crawler_mode?: string;
  by_source_type: { source_type: string; total: number; processed: number; this_month: number }[];
}

export const fetchCrawlingStats = (filters?: { country?: string }) => {
  const params = new URLSearchParams();
  if (filters?.country && filters.country !== "all" && filters.country !== "ASEAN") {
    params.set("country", filters.country);
  }
  const query = params.toString();
  return fetchFrom<CrawlingStats>(`/api/v1/crawling-stats${query ? `?${query}` : ""}`);
};

// ── Events ────────────────────────────────────────

export const fetchEvents = (params?: {
  page?: number;
  per_page?: number;
  q?: string;
  disease?: string;
  source_type?: string;
  outbreak_alert?: boolean;
  date_from?: string;
  date_to?: string;
  is_health_related?: boolean;
}) => {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.per_page) query.set("per_page", String(params.per_page));
  if (params?.q) query.set("q", params.q);
  if (params?.disease) query.set("disease", params.disease);
  if (params?.source_type) query.set("source_type", params.source_type);
  if (params?.outbreak_alert !== undefined) query.set("outbreak_alert", String(params.outbreak_alert));
  if (params?.date_from) query.set("date_from", params.date_from);
  if (params?.date_to) query.set("date_to", params.date_to);
  if (params?.is_health_related !== undefined) query.set("is_health_related", String(params.is_health_related));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return fetchFrom<DiseaseEvent[]>(`/api/v1/events${suffix}`);
};

// ── Language Markers ──────────────────────────

export const fetchLanguageMarkers = () =>
  fetchFrom<any[]>("/api/v1/language-markers");
export const createLanguageMarker = (data: any) =>
  postTo("/api/v1/language-markers", data);
export const updateLanguageMarker = (id: string, data: any) =>
  putTo(`/api/v1/language-markers/${id}`, data);
export const deleteLanguageMarker = (id: string) =>
  delFrom(`/api/v1/language-markers/${id}`);

// ── Extraction Rules ──────────────────────────

export const fetchExtractionRules = () =>
  fetchFrom<any[]>("/api/v1/extraction-rules");
export const createExtractionRule = (data: any) =>
  postTo("/api/v1/extraction-rules", data);
export const updateExtractionRule = (id: string, data: any) =>
  putTo(`/api/v1/extraction-rules/${id}`, data);
export const deleteExtractionRule = (id: string) =>
  delFrom(`/api/v1/extraction-rules/${id}`);

// ── Language Models ─────────────────────────────

export const fetchLanguageModels = () =>
  fetchFrom<any[]>("/api/v1/language-models");
export const createLanguageModel = (data: any) =>
  postTo("/api/v1/language-models", data);
export const updateLanguageModel = (id: string, data: any) =>
  putTo(`/api/v1/language-models/${id}`, data);
export const deleteLanguageModel = (id: string) =>
  delFrom(`/api/v1/language-models/${id}`);

// ── Dashboard Stats ─────────────────────────────

export const fetchDashboardStats = () =>
  fetchFrom<DashboardStats>("/api/v1/events/stats");
export interface PublicDashboardApiParams {
  country?: string;
  scope?: string;
  year?: number;
  source?: "ibs" | "ebs" | "skdr" | string;
  disease?: string;
  start_year?: number;
  start_week?: number;
  end_year?: number;
  end_week?: number;
}

/** ASEAN week-1→current-epi-week window shared by dashboard, TV, and reports. */
export function withDefaultDashboardParams(
  filters?: PublicDashboardApiParams,
): PublicDashboardApiParams {
  const epi = getCurrentEpiWeek();
  const country = !filters?.country || filters.country === "all" ? "ASEAN" : filters.country;
  const scope =
    filters?.scope ||
    (isAseanDefaultScope(country) ? ASEAN11_SCOPE : country === "global" ? "global" : undefined);
  return {
    country,
    scope,
    disease: filters?.disease && filters.disease !== "" ? filters.disease : "all",
    start_year: filters?.start_year ?? epi.year,
    start_week: filters?.start_week ?? 1,
    end_year: filters?.end_year ?? epi.year,
    end_week: filters?.end_week ?? epi.week,
    year: filters?.year ?? filters?.end_year ?? epi.year,
    source: filters?.source,
  };
}

function applyDashboardParams(filters?: PublicDashboardApiParams) {
  const merged = withDefaultDashboardParams(filters);
  const params = new URLSearchParams();
  params.set("country", merged.country || "ASEAN");
  if (merged.scope) params.set("scope", merged.scope);
  if (merged.year) params.set("year", String(merged.year));
  if (merged.source && merged.source !== "all") params.set("source", merged.source);
  if (merged.disease && merged.disease !== "all") params.set("disease", merged.disease);
  if (merged.start_year) params.set("start_year", String(merged.start_year));
  params.set("start_week", String(merged.start_week ?? 1));
  if (merged.end_year) params.set("end_year", String(merged.end_year));
  if (merged.end_week) params.set("end_week", String(merged.end_week));
  return params;
}

export const fetchPublicDashboard = (filters?: PublicDashboardApiParams) => {
  const query = applyDashboardParams(filters).toString();
  return fetchFrom<PublicDashboard>(`/api/v1/public-dashboard?${query}`);
};

export const fetchKpiSnapshot = (filters?: PublicDashboardApiParams) => {
  const query = applyDashboardParams(filters).toString();
  return fetchFrom<{
    kpis: PublicDashboard["kpis"];
    snapshot?: {
      id?: string;
      computed_at?: string;
      filter_key?: string;
      stale?: boolean;
    };
  }>(`/api/v1/kpi-snapshot?${query}`);
};

export interface KpiEventRow {
  id: string;
  location_name: string;
  country: string;
  disease_classification: string;
  case_count: number;
  death_count: number;
  confidence: number;
  outbreak_alert: boolean;
  needs_review: boolean;
  source_name: string;
  source_type: string;
  url: string;
  published_at: string;
}

export const fetchKpiEvents = (
  filters?: PublicDashboardApiParams & { page?: number; per_page?: number },
) => {
  const params = applyDashboardParams(filters);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.per_page) params.set("per_page", String(filters.per_page));
  return fetchPaginated<KpiEventRow>(`/api/v1/kpi-events?${params.toString()}`);
};

export type RegionHazardEvent = {
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
};

export type RegionContext = {
  country: string;
  display_name: string;
  iso2: string;
  iso3: string;
  capital: { name: string; latitude: number; longitude: number };
  timezone: string;
  updated_at?: string;
  weather?: {
    status?: string;
    source?: string;
    attribution?: string;
    error?: string;
    precip_today_mm?: number | null;
    current?: {
      temperature_c?: number | null;
      relative_humidity_pct?: number | null;
      precipitation_mm?: number | null;
      weather_code?: number | null;
      wind_speed_kmh?: number | null;
      observed_at?: string | null;
    };
  };
  air_quality?: {
    status?: string;
    source?: string;
    attribution?: string;
    error?: string;
    current?: {
      european_aqi?: number | null;
      us_aqi?: number | null;
      aqi_label?: string | null;
      pm2_5?: number | null;
      pm10?: number | null;
      so2?: number | null;
    };
  };
  climate?: {
    status?: string;
    source?: string;
    attribution?: string;
    error?: string;
    averages?: { t2m_c?: number | null; rh2m_pct?: number | null; precip_mm?: number | null };
  };
  usgs?: { status?: string; source?: string; error?: string; events?: RegionHazardEvent[] };
  gdacs?: { status?: string; source?: string; error?: string; events?: RegionHazardEvent[] };
  hazards?: RegionHazardEvent[];
  layers?: { inarisk?: Array<{ key: string; label: string; provider: string; url: string }>; note?: string };
  sources?: Array<{ name: string; provider: string; status: string; source_url?: string }>;
};

export const fetchRegionContext = (country: string) =>
  fetchFrom<RegionContext>(`/api/v1/region-context?country=${encodeURIComponent(country)}`);

export const fetchPipelineHealth = () => fetchFrom<{
  status: string;
  nlp?: { status?: string; service?: string; model?: string };
  last_event_at?: string | null;
  last_collector_run?: Record<string, unknown> | null;
  collector_runs_24h?: number;
  collector_failures_24h?: number;
}>("/api/v1/pipeline-health");

export const fetchIbsSummary = async (_filters?: { year?: number; province?: string }) => {
  throw new Error("SKDR IBS is detached");
};

export const fetchEbsSummary = async (_filters?: { year?: number; province?: string }) => {
  throw new Error("SKDR EBS is detached");
};

// ── URL Analyze ──────────────────────────────────

export const analyzeUrl = async (url: string, options?: {
  forceRefresh?: boolean;
  onProgress?: (job: { status?: string; stage?: string; job_id?: string }) => void;
  signal?: AbortSignal;
}) => {
  const { waitForAnalysis } = await import("./analysis-job.mjs");
  // Interactive URL analysis must use the dedicated async worker. The old
  // synchronous/force-refresh flags made the browser wait for crawling and
  // NLP in the API request, which caused 504s and defeated URL caching.
  const res = await fetch(`${baseURL()}/api/v1/analyze-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      url,
      async: true,
      force_refresh: Boolean(options?.forceRefresh),
    }),
    signal: options?.signal ?? AbortSignal.timeout(20000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(formatApiError(res, json));
  const initial = (json?.data ?? json) as any;
  return waitForAnalysis(initial, async (id: string) => {
    const res = await fetch(baseURL() + "/api/v1/analysis-jobs/" + encodeURIComponent(id),
      { cache: "no-store", headers: authHeaders(), signal: AbortSignal.timeout(30000) });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(formatApiError(res, json));
    return json.data;
  }, {
    timeout: 600000,
    onProgress: options?.onProgress,
    signal: options?.signal,
  } as {
    timeout?: number;
    onProgress?: (job: { status?: string; stage?: string; job_id?: string }) => void;
    signal?: AbortSignal;
  });
};

// ── Pagination helper ────────────────────────────

export async function fetchPaginated<T>(
  path: string,
): Promise<{ data: T[]; total: number; totalPages: number }> {
  const res = await fetch(`${baseURL()}${path}`, { cache: "no-store", headers: authHeaders() });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(formatApiError(res, json));
  return {
    data: (json?.data ?? []) as T[],
    total: (json?.total as number) || 0,
    totalPages: (json?.total_pages as number) || 1,
  };
}

// ── Spatial Heatmap ──────────────────────────────

export interface HeatmapMonthData {
  month_num: number;
  month_name: string;
  cases: number;
  deaths: number;
  events: number;
  alerts: number;
}

export interface HeatmapCountryData {
  country: string;
  iso: string;
  total_cases: number;
  total_deaths: number;
  total_events: number;
  months: HeatmapMonthData[];
}

export interface SpatialHeatmapResponse {
  year: number;
  countries: HeatmapCountryData[];
  summary: {
    total_countries: number;
    total_cases: number;
    total_deaths: number;
    total_events: number;
    snapshot_id?: string;
    snapshot_computed_at?: string;
    snapshot_filter_key?: string;
    snapshot_stale?: boolean;
    kpi_source?: string;
  };
}

export const fetchSpatialHeatmap = (filters?: PublicDashboardApiParams) => {
  const query = applyDashboardParams(filters).toString();
  return fetchFrom<SpatialHeatmapResponse>(`/api/v1/spatial-heatmap?${query}`);
};

// ?? Disease Trend Overview ????????????????????????

export interface DiseaseCountryBreakdown {
  country: string;
  iso: string;
  cases: number;
  deaths: number;
  events: number;
  alerts: number;
}

export interface PriorityDiseaseAlert {
  disease: string;
  top_country: string;
  top_country_iso: string;
  top_country_cases: number;
  total_asean_cases: number;
  total_deaths: number;
  event_count: number;
  alert_count: number;
  latest_published: string;
  latest_published_label: string;
  severity: "TINGGI" | "SEDANG" | "RENDAH";
  country_breakdown: DiseaseCountryBreakdown[];
}

export interface DiseaseDailyTrend {
  date: string;
  date_label: string;
  dbd: number;
  campak: number;
  covid: number;
  rabies: number;
  hfmd: number;
}

export interface DiseaseTrendOverviewData {
  summary: {
    total_diseases: number;
    top_burden_disease: string;
    top_burden_country: string;
    total_cases_tracked: number;
    total_deaths?: number;
    total_events?: number;
    trend_days: number;
    snapshot_id?: string;
    snapshot_computed_at?: string;
    snapshot_filter_key?: string;
    snapshot_stale?: boolean;
    kpi_source?: string;
  };
  priority_alerts: PriorityDiseaseAlert[];
  daily_trends: DiseaseDailyTrend[];
}

export const fetchDiseaseTrendOverview = (filters?: PublicDashboardApiParams & { days?: number }) => {
  const params = applyDashboardParams(filters);
  if (filters?.days) params.set('days', String(filters.days));
  return fetchFrom<DiseaseTrendOverviewData>(`/api/v1/disease-trend-overview?${params.toString()}`);
};

// ?? Morbidity & Mortality ?????????????????????????

export interface WeeklyMorbidityMortality {
  year: number;
  week: number;
  week_label: string;
  morbidity: number;
  mortality: number;
  cfr_pct: number;
}

export interface DiseaseMorbidityMortality {
  disease: string;
  total_cases: number;
  total_deaths: number;
  cfr_pct: number;
  event_count: number;
}

export interface MorbidityMortalityResponse {
  summary: {
    total_morbidity: number;
    total_mortality: number;
    cfr_pct: number;
    selected_disease: string;
    weeks: number;
    snapshot_id?: string;
    snapshot_computed_at?: string;
    snapshot_filter_key?: string;
    snapshot_stale?: boolean;
    kpi_source?: string;
  };
  weekly_trends: WeeklyMorbidityMortality[];
  top_diseases: DiseaseMorbidityMortality[];
}

export const fetchMorbidityMortality = (params?: PublicDashboardApiParams & { weeks?: number }) => {
  const q = applyDashboardParams(params);
  if (params?.weeks) q.set('weeks', String(params.weeks));
  return fetchFrom<MorbidityMortalityResponse>(`/api/v1/morbidity-mortality?${q.toString()}`);
};
// ── External Map Layers API ───────────────────────────────────────────
// Cached + queued. Pass AbortSignal so toggling a layer OFF cancels in-flight work.

type LayerInit = RequestInit & { cacheKey?: string };

async function fetchCachedLayer<T>(
  path: string,
  cacheKey: string,
  ttlMs: number,
  init?: LayerInit,
): Promise<T> {
  const { cacheKey: overrideKey, signal, ...rest } = init || {};
  const { data } = await fetchMapLayer<T>({
    cacheKey: overrideKey || cacheKey,
    ttlMs,
    signal,
    request: (nextSignal) => fetchFrom<T>(path, { ...rest, signal: nextSignal }),
  });
  return data;
}

export const fetchVectorSightings = (init?: LayerInit) =>
  fetchCachedLayer<VectorSightingsResponse>(
    "/api/v1/map-layers/vectors",
    "vectors",
    LAYER_TTL_MS.vectors,
    init,
  );

export const fetchLiveFlights = (init?: LayerInit) =>
  fetchCachedLayer<LiveFlightsResponse>(
    "/api/v1/map-layers/flights",
    "flights",
    LAYER_TTL_MS.flights,
    init,
  );

export const fetchFireHotspots = (init?: LayerInit) =>
  fetchCachedLayer<FireHotspotsResponse>(
    "/api/v1/map-layers/fires",
    "fires",
    LAYER_TTL_MS.fires,
    init,
  );

export const fetchHealthFacilities = (country?: string, init?: LayerInit) => {
  const q = country ? `?country=${encodeURIComponent(country)}` : "";
  const key = `facilities:${(country || "Indonesia").toLowerCase()}`;
  return fetchCachedLayer<HealthFacilitiesResponse>(
    `/api/v1/map-layers/facilities${q}`,
    key,
    LAYER_TTL_MS.facilities,
    init,
  );
};

export const fetchDiseaseNews = (disease?: string, init?: LayerInit) => {
  const q = disease ? `?disease=${encodeURIComponent(disease)}` : "";
  const key = `news:${(disease || "default").toLowerCase()}`;
  return fetchCachedLayer<DiseaseNewsResponse>(
    `/api/v1/map-layers/news${q}`,
    key,
    LAYER_TTL_MS.news,
    init,
  );
};

export const fetchWorldPopMeta = (iso3?: string, init?: LayerInit) => {
  const q = iso3 ? `?iso3=${encodeURIComponent(iso3)}` : "";
  const key = `population:${(iso3 || "IDN").toUpperCase()}`;
  return fetchCachedLayer<WorldPopMeta>(
    `/api/v1/map-layers/population${q}`,
    key,
    LAYER_TTL_MS.population,
    init,
  );
};

export const fetchMapHazards = (init?: LayerInit) =>
  fetchCachedLayer<MapHazardsResponse>(
    "/api/v1/map-layers/hazards",
    "hazards",
    LAYER_TTL_MS.hazards,
    init,
  );

export const fetchMapEnvironment = (init?: LayerInit) =>
  fetchCachedLayer<MapEnvironmentResponse>(
    "/api/v1/map-layers/environment",
    "environment",
    LAYER_TTL_MS.environment,
    init,
  );
