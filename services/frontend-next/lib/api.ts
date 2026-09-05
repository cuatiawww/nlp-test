import type {
  Source,
  Run,
  SummaryRow,
  DashboardStats,
  PublicDashboard,
  DiseaseEvent,
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
export const deleteUser = (id: string) => delAuth(`/api/v1/users/${id}`);

// ── Locations ────────────────────────────────────

export const fetchLocations = () => fetchFrom<any[]>("/api/v1/locations");
export const createLocation = (data: any) => postTo("/api/v1/locations", data);
export const updateLocation = (id: string, data: any) =>
  putTo(`/api/v1/locations/${id}`, data);
export const deleteLocation = (id: string) =>
  delFrom(`/api/v1/locations/${id}`);

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
export const fetchCrawlingStats = () =>
  fetchFrom<{
    total: number;
    this_month: number;
    last_month: number;
    total_processed: number;
    current_month: string;
    previous_month: string;
    by_source_type: { source_type: string; total: number; processed: number; this_month: number }[];
  }>("/api/v1/crawling-stats");

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
export const fetchPublicDashboard = (filters?: {
  country?: string;
  year?: number;
  source?: "ibs" | "ebs" | "skdr";
}) => {
  const params = new URLSearchParams();
  if (filters?.country && filters.country !== "all")
    params.set("country", filters.country);
  if (filters?.year) params.set("year", String(filters.year));
  if (filters?.source) params.set("source", filters.source);
  const query = params.toString();
  return fetchFrom<PublicDashboard>(
    `/api/v1/public-dashboard${query ? `?${query}` : ""}`,
  );
};

// ── URL Analyze ──────────────────────────────────

export const analyzeUrl = (url: string) =>
  postTo<any>("/api/v1/analyze-url", { url });

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
