type JsonRecord = Record<string, unknown>

const DEFAULT_TIMEOUT_MS = 15000
const envFileCache = new Map<string, string>()

const stripWrappingQuotes = (value: string) => {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

const loadEnvFileCache = () => {
  if (envFileCache.size > 0) return

  const { existsSync, readFileSync } = require('node:fs') as typeof import('node:fs')
  const { join } = require('node:path') as typeof import('node:path')
  const candidates = [join(process.cwd(), '.env.local'), join(process.cwd(), '.env')]

  candidates.forEach((filePath) => {
    if (!existsSync(filePath)) return

    const content = readFileSync(filePath, 'utf8')

    content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return

      const separatorIndex = trimmed.indexOf('=')
      if (separatorIndex <= 0) return

      const key = trimmed.slice(0, separatorIndex).trim()
      const value = stripWrappingQuotes(trimmed.slice(separatorIndex + 1).trim())

      if (key && value && !envFileCache.has(key)) {
        envFileCache.set(key, value)
      }
    })
  })
}

export const getRuntimeEnv = (key: string) => {
  const directValue = process.env[key]?.trim()
  if (directValue) return directValue

  loadEnvFileCache()
  return envFileCache.get(key)?.trim() || ''
}

export const getPsc119DashboardConfig = () => {
  const baseUrl = getRuntimeEnv('PSC119_DASHBOARD_BASE_URL')
  const token = getRuntimeEnv('PSC119_DASHBOARD_TTOKEN')

  if (!baseUrl) {
    throw new Error('Missing PSC119_DASHBOARD_BASE_URL environment variable')
  }

  if (!token) {
    throw new Error('Missing PSC119_DASHBOARD_TTOKEN environment variable')
  }

  return { baseUrl, token }
}

const getTimeoutMs = () => {
  const parsed = Number(getRuntimeEnv('PSC119_DASHBOARD_TIMEOUT_MS') || DEFAULT_TIMEOUT_MS)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS
}

const createTimeoutSignal = () => {
  const timeoutMs = getTimeoutMs()

  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs)
  }

  const controller = new AbortController()
  setTimeout(() => controller.abort(`Request timeout after ${timeoutMs}ms`), timeoutMs)
  return controller.signal
}

export const createJsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

export async function postPsc119Dashboard<TResponse = unknown>(
  path: string,
  payload?: JsonRecord,
) {
  const { baseUrl, token } = getPsc119DashboardConfig()

  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    cache: 'no-store',
    signal: createTimeoutSignal(),
    headers: {
      TTOKEN: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload ?? {}),
  })

  if (!res.ok) {
    throw new Error(`Upstream error: ${res.status}`)
  }

  return (await res.json()) as TResponse
}

export async function postPsc119DashboardForm<TResponse = unknown>(
  path: string,
  payload: Record<string, string>,
) {
  const { baseUrl, token } = getPsc119DashboardConfig()
  const formData = new FormData()

  Object.entries(payload).forEach(([key, value]) => {
    formData.append(key, value)
  })

  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    cache: 'no-store',
    signal: createTimeoutSignal(),
    headers: {
      TTOKEN: token,
    },
    body: formData,
  })

  if (!res.ok) {
    throw new Error(`Upstream error: ${res.status}`)
  }

  return (await res.json()) as TResponse
}
