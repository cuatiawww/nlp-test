import catalog from '@/lib/data/abvc-master-source.json'

export type MasterSourceClass = 'main' | 'other'

export type MasterSourceMatch = {
  host: string
  class: MasterSourceClass
  country: string
}

type CatalogHost = {
  class: MasterSourceClass
  country: string
}

const hosts = catalog.hosts as Record<string, CatalogHost>

export const masterSourceStats = {
  version: catalog.version,
  count: catalog.count,
  main: catalog.main,
  other: catalog.other,
}

export function hostnameFromUrl(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
    return host || null
  } catch {
    return null
  }
}

export function lookupMasterSource(url?: string | null): MasterSourceMatch | null {
  const host = hostnameFromUrl(url)
  if (!host) return null

  const labels = host.split('.').filter(Boolean)
  for (let i = 0; i < labels.length - 1; i++) {
    const candidate = labels.slice(i).join('.')
    const row = hosts[candidate]
    if (row) {
      return { host: candidate, class: row.class, country: row.country }
    }
  }
  return null
}

export function lookupMasterSourceFromUrls(urls: Array<string | null | undefined>): MasterSourceMatch | null {
  for (const url of urls) {
    const match = lookupMasterSource(url)
    if (match) return match
  }
  return null
}

function collectUrls(value: unknown, urls: string[] = []): string[] {
  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value) || value.includes('.')) urls.push(value)
    return urls
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectUrls(item, urls))
    return urls
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectUrls(item, urls))
  }
  return urls
}

export function lookupMasterSourceForConfig(config?: Record<string, unknown> | null): MasterSourceMatch | null {
  return lookupMasterSourceFromUrls(collectUrls(config))
}
