import type { Source, Run, SummaryRow } from '@/types'

// Client-side: proxy via Apache /nlp/api/* → backend-rust:8081/api/*
// Server-side: use internal Docker DNS
function baseURL(): string {
  if (typeof window !== 'undefined') return '/nlp'
  return process.env.API_INTERNAL_URL || 'http://backend-rust:8081'
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

export const fetchSources = () => fetchFrom<Source[]>('/api/v1/sources')
export const createSource = (data: Partial<Source>) => postTo<Source>('/api/v1/sources', data)
export const updateSource = (id: string, data: Partial<Source>) => putTo<Source>(`/api/v1/sources/${id}`, data)
export const deleteSource = (id: string) => delFrom(`/api/v1/sources/${id}`)
export const triggerCollect = (id: string) => postTo(`/api/v1/sources/${id}/collect`)
export const fetchRuns = (sourceId?: string) => fetchFrom<Run[]>(`/api/v1/runs${sourceId ? `?source_id=${sourceId}` : ''}`)
export const fetchSummary = () => fetchFrom<SummaryRow[]>('/api/v1/summary')
