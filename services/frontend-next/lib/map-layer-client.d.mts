export const LAYER_TTL_MS: {
  flights: number
  environment: number
  fires: number
  news: number
  hazards: number
  vectors: number
  facilities: number
  population: number
}

export const MAX_CONCURRENT_LAYER_FETCHES: number
export const LAYER_CLIENT_TIMEOUT_MS: number

export type LayerClientState =
  | "idle"
  | "loading"
  | "ok"
  | "cached"
  | "empty"
  | "timeout"
  | "auth"
  | "upstream"
  | "unavailable"
  | "error"

export type LayerClientStatus = {
  state: LayerClientState
  count?: number
  source?: string
  message?: string
  aborted?: boolean
}

export function resetMapLayerClientForTests(): void
export function peekMapLayerCache(cacheKey: string): unknown
export function seedMapLayerCache(cacheKey: string, data: unknown, ttlMs?: number): void
export function classifyLayerError(err: unknown): LayerClientStatus
export function statusFromPayload(
  count: number,
  payload?: {
    status?: string
    source?: string
    error?: string | null
    cached?: boolean
    stale?: boolean
    fromCache?: boolean
  },
): LayerClientStatus

export function fetchMapLayer<T = unknown>(opts: {
  cacheKey: string
  ttlMs?: number
  signal?: AbortSignal
  timeoutMs?: number
  request: (signal?: AbortSignal) => Promise<T>
}): Promise<{ data: T; fromCache: boolean }>
