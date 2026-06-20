import type { Source, Run, SummaryRow } from '@/types'

// Client-side: proxy via Next.js rewrites /nlp/api/* → backend-rust:8081/api/*
// Server-side: use internal Docker DNS
function baseURL(): string {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_BASE_PATH || '/nlp'
  }

  return process.env.API_INTERNAL_URL || 'http://backend-rust:8081'
}

function authHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const token = localStorage.getItem('auth_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function fetchFrom<T>(path: string): Promise<T> {
  const res = await fetch(`${baseURL()}${path}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
  const json = await res.json()
  return json.data as T
}

export async function postTo<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseURL()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)

  const json = await res.json()
  return json.data as T
}

export async function putTo<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseURL()}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)

  const json = await res.json()
  return json.data as T
}

export async function delFrom(path: string): Promise<void> {
  const res = await fetch(`${baseURL()}${path}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
}

// ── Auth-aware internal helpers ────────────────────

async function fetchAuth<T>(path: string): Promise<T> {
  const res = await fetch(`${baseURL()}${path}`, {
    cache: 'no-store',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
  const json = await res.json()
  return json.data as T
}

async function postAuth<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseURL()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
  const json = await res.json()
  return json.data as T
}

async function delAuth(path: string): Promise<void> {
  const res = await fetch(`${baseURL()}${path}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
}

// ── Login (special response shape: { success, data: { token } }) ──

export async function loginUser(username: string, password: string): Promise<any> {
  const res = await fetch(`${baseURL()}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
  const data = await res.json()
  if (!data.success) throw new Error(data.error || 'Login failed')
  return data.data
}

// ── Existing named helpers ─────────────────────────

export const fetchSources = () => fetchFrom<Source[]>('/api/v1/sources')
export const createSource = (data: Partial<Source>) => postTo<Source>('/api/v1/sources', data)
export const updateSource = (id: string, data: Partial<Source>) => putTo<Source>(`/api/v1/sources/${id}`, data)
export const deleteSource = (id: string) => delFrom(`/api/v1/sources/${id}`)
export const triggerCollect = (id: string) => postTo(`/api/v1/sources/${id}/collect`)
export const triggerCollectAll = () => postTo('/api/v1/sources/collect-all')
export const fetchRuns = (sourceId?: string) => fetchFrom<Run[]>(`/api/v1/runs${sourceId ? `?source_id=${sourceId}` : ''}`)
export const fetchSummary = () => fetchFrom<SummaryRow[]>('/api/v1/summary')

// ── NLP Keywords ──────────────────────────────────

export const fetchNlpKeywords = (category: string) => fetchFrom<any[]>(`/api/v1/nlp-keywords?category=${category}`)
export const createNlpKeyword = (data: any) => postTo('/api/v1/nlp-keywords', data)
export const updateNlpKeyword = (id: string, data: any) => putTo(`/api/v1/nlp-keywords/${id}`, data)
export const deleteNlpKeyword = (id: string) => delFrom(`/api/v1/nlp-keywords/${id}`)

// ── NLP Labels ────────────────────────────────────

export const fetchNlpLabels = (category: string) => fetchFrom<any[]>(`/api/v1/nlp-labels?category=${category}`)
export const createNlpLabel = (data: any) => postTo('/api/v1/nlp-labels', data)
export const updateNlpLabel = (id: string, data: any) => putTo(`/api/v1/nlp-labels/${id}`, data)
export const deleteNlpLabel = (id: string) => delFrom(`/api/v1/nlp-labels/${id}`)

// ── Outbreak Rules ────────────────────────────────

export const fetchOutbreakRules = () => fetchFrom<any[]>('/api/v1/outbreak-rules')
export const createOutbreakRule = (data: any) => postTo('/api/v1/outbreak-rules', data)
export const updateOutbreakRule = (id: string, data: any) => postTo(`/api/v1/outbreak-rules/${id}/edit`, data)
export const deleteOutbreakRule = (id: string) => delFrom(`/api/v1/outbreak-rules/${id}`)

// ── Users (auth) ──────────────────────────────────

export const fetchUsers = () => fetchAuth<any[]>('/api/v1/users')
export const createUser = (data: any) => postAuth('/api/v1/users', data)
export const deleteUser = (id: string) => delAuth(`/api/v1/users/${id}`)

// ── Locations ────────────────────────────────────

export const fetchLocations = () => fetchFrom<any[]>('/api/v1/locations')
export const createLocation = (data: any) => postTo('/api/v1/locations', data)
export const updateLocation = (id: string, data: any) => putTo(`/api/v1/locations/${id}`, data)
export const deleteLocation = (id: string) => delFrom(`/api/v1/locations/${id}`)

// ── Events ────────────────────────────────────────

export const fetchEvents = () => fetchFrom<any[]>('/api/v1/events')
export const cleanupEvents = () => postTo('/api/v1/data/cleanup-events')

// ── Pagination helper ────────────────────────────

export async function fetchPaginated<T>(path: string): Promise<{ data: T[]; total: number; totalPages: number }> {
  const res = await fetch(`${baseURL()}${path}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
  const json = await res.json()
  return {
    data: json.data as T[],
    total: (json.total as number) || 0,
    totalPages: (json.total_pages as number) || 1,
  }
}
