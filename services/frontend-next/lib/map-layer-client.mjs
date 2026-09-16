/**
 * Client-side map-layer fetch helpers.
 *
 * Cache TTLs (must stay in sync with backend `external_layers.rs`):
 *   flights      45s
 *   environment  3 min
 *   fires        3 min
 *   news         3 min
 *   hazards      3 min
 *   vectors      5 min
 *   facilities   5 min
 *   population   5 min
 *
 * Heavy upstreams are queued (max 2 in flight). Toggling a layer OFF should
 * abort() the AbortController passed into fetchMapLayer so the request is
 * dropped instead of completing in the background.
 */

export const LAYER_TTL_MS = {
  flights: 45_000,
  environment: 180_000,
  fires: 180_000,
  news: 180_000,
  hazards: 180_000,
  vectors: 300_000,
  facilities: 300_000,
  population: 300_000,
}

export const MAX_CONCURRENT_LAYER_FETCHES = 2
export const LAYER_CLIENT_TIMEOUT_MS = 15_000

const cache = new Map()
let active = 0
const waiters = []

function abortError(message = "aborted") {
  const err = new Error(message)
  err.name = "AbortError"
  return err
}

export function resetMapLayerClientForTests() {
  cache.clear()
  active = 0
  waiters.splice(0, waiters.length)
}

export function peekMapLayerCache(cacheKey) {
  const hit = cache.get(cacheKey)
  if (!hit) return null
  if (hit.expiresAt <= Date.now()) {
    cache.delete(cacheKey)
    return null
  }
  return hit.data
}

export function seedMapLayerCache(cacheKey, data, ttlMs = 60_000) {
  cache.set(cacheKey, { data, expiresAt: Date.now() + ttlMs })
}

function mergeSignals(userSignal, timeoutMs) {
  const timeout =
    typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(timeoutMs)
      : null
  if (!userSignal && timeout) return timeout
  if (userSignal && !timeout) return userSignal
  if (!userSignal && !timeout) return undefined
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([userSignal, timeout])
  }
  const ac = new AbortController()
  const abort = () => {
    if (!ac.signal.aborted) ac.abort()
  }
  userSignal.addEventListener("abort", abort, { once: true })
  timeout.addEventListener("abort", abort, { once: true })
  if (userSignal.aborted || timeout.aborted) abort()
  return ac.signal
}

function waitForSlot(signal) {
  return new Promise((resolve, reject) => {
    const entry = { resolve, reject }
    const onAbort = () => {
      const idx = waiters.indexOf(entry)
      if (idx >= 0) waiters.splice(idx, 1)
      reject(abortError())
    }
    if (signal) {
      if (signal.aborted) {
        reject(abortError())
        return
      }
      signal.addEventListener("abort", onAbort, { once: true })
    }
    entry.onAbort = onAbort
    entry.signal = signal
    waiters.push(entry)
  })
}

async function acquire(signal) {
  if (signal?.aborted) throw abortError()
  if (active >= MAX_CONCURRENT_LAYER_FETCHES) {
    await waitForSlot(signal)
  }
  if (signal?.aborted) throw abortError()
  active += 1
}

function release() {
  active = Math.max(0, active - 1)
  const next = waiters.shift()
  if (!next) return
  if (next.signal) {
    next.signal.removeEventListener("abort", next.onAbort)
  }
  next.resolve()
}

function timeoutError(message = "Layer request timed out") {
  const err = new Error(message)
  err.name = "TimeoutError"
  err.layerState = "timeout"
  return err
}

export function classifyLayerError(err) {
  if (!err) {
    return { state: "error", message: "Unknown layer error" }
  }
  if (err.name === "TimeoutError" || err.layerState === "timeout") {
    return { state: "timeout", message: err.message || "Layer request timed out" }
  }
  if (err.name === "AbortError" || err.message === "aborted") {
    return { state: "idle", message: undefined, aborted: true }
  }
  const raw = String(err.message || err)
  const msg = raw.toLowerCase()
  if (msg.includes("timed out") || msg.includes("timeout")) {
    return { state: "timeout", message: raw }
  }
  if (msg.includes("401") || msg.includes("403") || msg.includes("api key") || msg.includes("not configured") || msg.includes("authentication")) {
    return { state: "auth", message: raw }
  }
  if (msg.includes("503") || msg.includes("service unavailable") || msg.includes("overloaded")) {
    return { state: "unavailable", message: raw }
  }
  if (msg.includes("429") || msg.includes("rate-limit") || msg.includes("too frequent")) {
    return { state: "upstream", message: raw }
  }
  return { state: "upstream", message: raw }
}

export function statusFromPayload(count, payload) {
  const source = payload?.source
  const error = payload?.error || undefined
  const status = payload?.status
  const cached = Boolean(payload?.cached || payload?.fromCache)
  const stale = Boolean(payload?.stale)

  if (status === "timeout" && !(count > 0)) {
    return { state: "timeout", count: count || 0, source, message: error || "Upstream timed out" }
  }
  if (status === "auth") {
    return { state: "auth", count: count || 0, source, message: error || "API key or authentication required" }
  }
  if (status === "unavailable") {
    return { state: "unavailable", count: count || 0, source, message: error || "Service unavailable (503)" }
  }
  if (error && !(count > 0) && status !== "ok") {
    return classifyLayerError(new Error(error))
  }
  if (count > 0) {
    const label = `${Number(count).toLocaleString()} point${count === 1 ? "" : "s"}`
    if (cached) {
      return {
        state: "cached",
        count,
        source,
        message: stale ? `${label} (cached, stale)` : `${label} (cached)`,
      }
    }
    return { state: "ok", count, source, message: label }
  }
  return { state: "empty", count: 0, source, message: error || "No data in the ASEAN window" }
}

export async function fetchMapLayer({
  cacheKey,
  ttlMs,
  signal,
  request,
  timeoutMs = LAYER_CLIENT_TIMEOUT_MS,
}) {
  if (!cacheKey || typeof request !== "function") {
    throw new Error("fetchMapLayer requires cacheKey and request()")
  }
  const hit = peekMapLayerCache(cacheKey)
  if (hit) {
    const data =
      hit && typeof hit === "object" && !Array.isArray(hit)
        ? { ...hit, fromCache: true, cached: true }
        : hit
    return { data, fromCache: true }
  }

  const combined = mergeSignals(signal, timeoutMs)
  let acquired = false
  try {
    await acquire(combined)
    acquired = true
    const hitAfterWait = peekMapLayerCache(cacheKey)
    if (hitAfterWait) {
      const data =
        hitAfterWait && typeof hitAfterWait === "object" && !Array.isArray(hitAfterWait)
          ? { ...hitAfterWait, fromCache: true, cached: true }
          : hitAfterWait
      return { data, fromCache: true }
    }
    if (signal?.aborted) throw abortError()
    if (combined?.aborted) throw timeoutError()
    const data = await request(combined)
    cache.set(cacheKey, { data, expiresAt: Date.now() + (ttlMs || LAYER_TTL_MS.fires) })
    return { data, fromCache: false }
  } catch (err) {
    if (signal?.aborted) throw abortError()
    if (err?.name === "AbortError" || err?.name === "TimeoutError" || combined?.aborted) {
      throw timeoutError(err?.message)
    }
    const classified = classifyLayerError(err)
    if (classified.state === "timeout") {
      throw timeoutError(classified.message)
    }
    err.layerState = classified.state
    throw err
  } finally {
    if (acquired) release()
  }
}
