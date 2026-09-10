import type {
  Source,
  Run,
  SummaryRow,
  DashboardStats,
  PublicDashboard,
  DiseaseEvent,
  IbsSummary,
  CrawlJobStatus,
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
  if (res.status === 504) {
    return "Gateway Timeout (504): Server atau website sumber artikel membutuhkan waktu terlalu lama untuk merespons. Silakan periksa apakah tautan dapat diakses dan coba beberapa saat lagi.";
  }
  if (res.status === 502) {
    return "Bad Gateway (502): Layanan backend sedang tidak dapat dihubungi atau sedang restart. Silakan coba kembali.";
  }
  const text = res.statusText ? `: ${res.statusText}` : "";
  return `API ${res.status}${text || " (Terjadi kesalahan pada server)"}`;
}

export async function fetchFrom<T>(path: string): Promise<T> {
  const res = await fetch(`${baseURL()}${path}`, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(formatApiError(res, json));
  return (json?.data ?? json) as T;
}

export async function postTo<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseURL()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(formatApiError(res, json));

  return (json?.data ?? json) as T;
}

export async function delFrom(path: string): Promise<void> {
  const res = await fetch(`${baseURL()}${path}`, { method: "DELETE" });
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
    headers: { "Content-Type": "application/json" },
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
export const createSource = (data: Partial<Source>) =>
  postTo<Source>("/api/v1/sources", data);
export const updateSource = (id: string, data: Partial<Source>) =>
  putTo<Source>(`/api/v1/sources/${id}`, data);
export const deleteSource = (id: string) => delFrom(`/api/v1/sources/${id}`);
export const triggerCollect = (id: string) =>
  postTo(`/api/v1/sources/${id}/collect`);
export const triggerCollectAll = () => postTo("/api/v1/sources/collect-all");
export const fetchRuns = (sourceId?: string) =>
  fetchFrom<Run[]>(`/api/v1/runs${sourceId ? `?source_id=${sourceId}` : ""}`);
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
  year?: number;
  source?: "ibs" | "ebs" | "skdr" | string;
  disease?: string;
  start_year?: number;
  start_week?: number;
  end_year?: number;
  end_week?: number;
}

export const fetchPublicDashboard = (filters?: PublicDashboardApiParams) => {
  const params = new URLSearchParams();
  if (filters?.country && filters.country !== "all")
    params.set("country", filters.country);
  if (filters?.year) params.set("year", String(filters.year));
  if (filters?.source && filters.source !== "all") params.set("source", filters.source);
  if (filters?.disease && filters.disease !== "all") params.set("disease", filters.disease);
  if (filters?.start_year) params.set("start_year", String(filters.start_year));
  if (filters?.start_week) params.set("start_week", String(filters.start_week));
  if (filters?.end_year) params.set("end_year", String(filters.end_year));
  if (filters?.end_week) params.set("end_week", String(filters.end_week));
  const query = params.toString();
  return fetchFrom<PublicDashboard>(
    `/api/v1/public-dashboard${query ? `?${query}` : ""}`,
  );
};

export const fetchIbsSummary = (filters?: { year?: number; province?: string }) => {
  const params = new URLSearchParams();
  if (filters?.year) params.set("year", String(filters.year));
  if (filters?.province && filters.province !== "all")
    params.set("province", filters.province);
  const query = params.toString();
  return fetchFrom<IbsSummary>(
    `/api/v1/skdr/ibs-summary${query ? `?${query}` : ""}`,
  );
};

export const fetchEbsSummary = (filters?: { year?: number; province?: string }) => {
  const params = new URLSearchParams();
  if (filters?.year) params.set("year", String(filters.year));
  if (filters?.province && filters.province !== "all")
    params.set("province", filters.province);
  const query = params.toString();
  return fetchFrom<IbsSummary>(
    `/api/v1/skdr/ebs-summary${query ? `?${query}` : ""}`,
  );
};

// ── URL Analyze ──────────────────────────────────

export const analyzeUrl = async (url: string) => {
  const { waitForAnalysis } = await import("./analysis-job.mjs");
  // Interactive URL analysis must use the dedicated async worker. The old
  // synchronous/force-refresh flags made the browser wait for crawling and
  // NLP in the API request, which caused 504s and defeated URL caching.
  const initial = await postTo<any>("/api/v1/analyze-url", {
    url,
    async: true,
    force_refresh: false,
  });
  return waitForAnalysis(initial, async (id: string) => {
    const res = await fetch(baseURL() + "/api/v1/analysis-jobs/" + encodeURIComponent(id),
      // Status reads must not fail just because a large PDF is still being
      // processed or the backend is briefly waiting on the collector DB.
      { cache: "no-store", signal: AbortSignal.timeout(30000) });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(formatApiError(res, json));
    return json.data;
  });
};

// ── Pagination helper ────────────────────────────

export async function fetchPaginated<T>(
  path: string,
): Promise<{ data: T[]; total: number; totalPages: number }> {
  const res = await fetch(`${baseURL()}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  const json = await res.json();
  return {
    data: json.data as T[],
    total: (json.total as number) || 0,
    totalPages: (json.total_pages as number) || 1,
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
  };
}

export const fetchSpatialHeatmap = (filters?: PublicDashboardApiParams) => {
  const params = new URLSearchParams();
  if (filters?.year) params.set('year', String(filters.year));
  if (filters?.country && filters.country !== 'all') params.set('country', filters.country);
  if (filters?.disease && filters.disease !== 'all') params.set('disease', filters.disease);
  if (filters?.start_year) params.set('start_year', String(filters.start_year));
  if (filters?.start_week) params.set('start_week', String(filters.start_week));
  if (filters?.end_year) params.set('end_year', String(filters.end_year));
  if (filters?.end_week) params.set('end_week', String(filters.end_week));
  const query = params.toString();
  return fetchFrom<SpatialHeatmapResponse>(`/api/v1/spatial-heatmap${query ? `?${query}` : ''}`);
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
    trend_days: number;
  };
  priority_alerts: PriorityDiseaseAlert[];
  daily_trends: DiseaseDailyTrend[];
}

export const fetchDiseaseTrendOverview = (filters?: PublicDashboardApiParams & { days?: number }) => {
  const params = new URLSearchParams();
  if (filters?.days) params.set('days', String(filters.days));
  if (filters?.country && filters.country !== 'all') params.set('country', filters.country);
  if (filters?.disease && filters.disease !== 'all') params.set('disease', filters.disease);
  if (filters?.start_year) params.set('start_year', String(filters.start_year));
  if (filters?.start_week) params.set('start_week', String(filters.start_week));
  if (filters?.end_year) params.set('end_year', String(filters.end_year));
  if (filters?.end_week) params.set('end_week', String(filters.end_week));
  const query = params.toString() ? `?${params.toString()}` : '';
  return fetchFrom<DiseaseTrendOverviewData>(`/api/v1/disease-trend-overview${query}`);
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
  };
  weekly_trends: WeeklyMorbidityMortality[];
  top_diseases: DiseaseMorbidityMortality[];
}

export const fetchMorbidityMortality = (params?: PublicDashboardApiParams & { weeks?: number }) => {
  const q = new URLSearchParams();
  if (params?.disease && params.disease !== 'all') q.set('disease', params.disease);
  if (params?.weeks) q.set('weeks', String(params.weeks));
  if (params?.country && params.country !== 'all') q.set('country', params.country);
  if (params?.start_year) q.set('start_year', String(params.start_year));
  if (params?.start_week) q.set('start_week', String(params.start_week));
  if (params?.end_year) q.set('end_year', String(params.end_year));
  if (params?.end_week) q.set('end_week', String(params.end_week));
  const queryStr = q.toString();
  return fetchFrom<MorbidityMortalityResponse>(`/api/v1/morbidity-mortality${queryStr ? `?${queryStr}` : ''}`);
};
