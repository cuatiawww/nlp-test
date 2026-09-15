import type { Source } from '@/types'

export type SourceCountry = {
  name: string
  code: string | null
  coverageScope?: 'asean_outlet' | 'global_outlet' | 'unclassified'
  coversAsean?: boolean
}

export const SOURCE_COUNTRY_OPTIONS = [
  'Indonesia',
  'Malaysia',
  'Singapore',
  'Thailand',
  'Philippines',
  'Vietnam',
  'Brunei',
  'Cambodia',
  'Laos',
  'Myanmar',
  'Timor-Leste',
  'GLOBAL',
]

const COUNTRIES: Record<string, SourceCountry> = {
  id: { name: 'Indonesia', code: 'ID', coverageScope: 'asean_outlet', coversAsean: true },
  indonesia: { name: 'Indonesia', code: 'ID', coverageScope: 'asean_outlet', coversAsean: true },
  my: { name: 'Malaysia', code: 'MY', coverageScope: 'asean_outlet', coversAsean: true },
  malaysia: { name: 'Malaysia', code: 'MY', coverageScope: 'asean_outlet', coversAsean: true },
  sg: { name: 'Singapore', code: 'SG', coverageScope: 'asean_outlet', coversAsean: true },
  singapore: { name: 'Singapore', code: 'SG', coverageScope: 'asean_outlet', coversAsean: true },
  th: { name: 'Thailand', code: 'TH', coverageScope: 'asean_outlet', coversAsean: true },
  thailand: { name: 'Thailand', code: 'TH', coverageScope: 'asean_outlet', coversAsean: true },
  ph: { name: 'Philippines', code: 'PH', coverageScope: 'asean_outlet', coversAsean: true },
  philippines: { name: 'Philippines', code: 'PH', coverageScope: 'asean_outlet', coversAsean: true },
  vn: { name: 'Vietnam', code: 'VN', coverageScope: 'asean_outlet', coversAsean: true },
  vietnam: { name: 'Vietnam', code: 'VN', coverageScope: 'asean_outlet', coversAsean: true },
  'viet nam': { name: 'Vietnam', code: 'VN', coverageScope: 'asean_outlet', coversAsean: true },
  bn: { name: 'Brunei', code: 'BN', coverageScope: 'asean_outlet', coversAsean: true },
  brunei: { name: 'Brunei', code: 'BN', coverageScope: 'asean_outlet', coversAsean: true },
  kh: { name: 'Cambodia', code: 'KH', coverageScope: 'asean_outlet', coversAsean: true },
  cambodia: { name: 'Cambodia', code: 'KH', coverageScope: 'asean_outlet', coversAsean: true },
  kampuchea: { name: 'Cambodia', code: 'KH', coverageScope: 'asean_outlet', coversAsean: true },
  la: { name: 'Laos', code: 'LA', coverageScope: 'asean_outlet', coversAsean: true },
  lao: { name: 'Laos', code: 'LA', coverageScope: 'asean_outlet', coversAsean: true },
  laos: { name: 'Laos', code: 'LA', coverageScope: 'asean_outlet', coversAsean: true },
  mm: { name: 'Myanmar', code: 'MM', coverageScope: 'asean_outlet', coversAsean: true },
  myanmar: { name: 'Myanmar', code: 'MM', coverageScope: 'asean_outlet', coversAsean: true },
  burma: { name: 'Myanmar', code: 'MM', coverageScope: 'asean_outlet', coversAsean: true },
  tl: { name: 'Timor-Leste', code: 'TL', coverageScope: 'asean_outlet', coversAsean: true },
  'timor-leste': { name: 'Timor-Leste', code: 'TL', coverageScope: 'asean_outlet', coversAsean: true },
  'timor leste': { name: 'Timor-Leste', code: 'TL', coverageScope: 'asean_outlet', coversAsean: true },
  timor: { name: 'Timor-Leste', code: 'TL', coverageScope: 'asean_outlet', coversAsean: true },
}

const GLOBAL_OUTLET: SourceCountry = {
  name: 'GLOBAL',
  code: null,
  coverageScope: 'global_outlet',
  coversAsean: true,
}

const DOMAIN_COUNTRIES: Array<[string, SourceCountry]> = [
  ['cdc.gov', { name: 'United States', code: 'US', coverageScope: 'global_outlet', coversAsean: true }],
  ['phnompenhpost.com', COUNTRIES.kh],
  ['channelnewsasia.com', COUNTRIES.sg],
  ['rappler.com', COUNTRIES.ph],
  ['vnexpress.net', COUNTRIES.vn],
  ['thaipbsworld.com', COUNTRIES.th],
  ['nationthailand.com', COUNTRIES.th],
  ['malaymail.com', COUNTRIES.my],
  ['metrotvnews.com', COUNTRIES.id],
  ['cnnindonesia.com', COUNTRIES.id],
  ['kompas.com', COUNTRIES.id],
  ['antaranews.com', COUNTRIES.id],
]

const TLD_COUNTRIES: Record<string, SourceCountry> = {
  id: COUNTRIES.id,
  my: COUNTRIES.my,
  sg: COUNTRIES.sg,
  th: COUNTRIES.th,
  ph: COUNTRIES.ph,
  vn: COUNTRIES.vn,
  bn: COUNTRIES.bn,
  kh: COUNTRIES.kh,
  la: COUNTRIES.la,
  mm: COUNTRIES.mm,
  tl: COUNTRIES.tl,
}

function countryFromValue(value: unknown): SourceCountry | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  if (!normalized) return undefined
  if (
    normalized === 'global'
    || normalized.includes('outside asean')
    || normalized.includes('international')
    || normalized.includes('worldwide')
    || normalized === 'world'
  ) {
    return GLOBAL_OUTLET
  }
  // Never invent a fake country named "ASEAN". Regional aggregators are GLOBAL.
  if (normalized === 'asean' || normalized.includes('asean / asia') || normalized === 'asia') {
    return GLOBAL_OUTLET
  }
  return COUNTRIES[normalized]
}

function collectUrls(value: unknown, urls: string[] = []): string[] {
  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value)) urls.push(value)
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

function countryFromUrl(url: string): SourceCountry | undefined {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '')
  const knownDomain = DOMAIN_COUNTRIES.find(([domain]) => hostname === domain || hostname.endsWith(`.${domain}`))
  if (knownDomain) return knownDomain[1]

  const tld = hostname.split('.').pop()
  if (tld && TLD_COUNTRIES[tld]) return TLD_COUNTRIES[tld]

  // Google News is a global aggregator. Feed locale (`gl=ID`) is not outlet country.
  if (hostname === 'news.google.com') {
    return GLOBAL_OUTLET
  }

  return undefined
}

export function resolveSourceCountry(source: Pick<Source, 'name' | 'config' | 'country'>): SourceCountry {
  const name = source.name.toLowerCase()
  const urls = collectUrls(source.config || {})
  const hostnameBlob = urls.map((url) => {
    try {
      return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    } catch {
      return ''
    }
  }).join(' ')
  if (
    name.includes('google news')
    || hostnameBlob.includes('news.google.com')
    || hostnameBlob.includes('who.int')
    || hostnameBlob.includes('cidrap.umn.edu')
    || hostnameBlob.includes('reliefweb.int')
    || hostnameBlob.includes('cdc.gov')
    || name.includes('cidrap')
    || name.includes('reliefweb')
  ) {
    return GLOBAL_OUTLET
  }

  const persisted = countryFromValue(source.country)
  if (persisted) return persisted

  const config = source.config || {}
  const explicit = countryFromValue(config.country)
  if (explicit) return explicit

  for (const url of urls) {
    const fromUrl = countryFromUrl(url)
    if (fromUrl) return fromUrl
  }

  const byName = countryFromValue(source.name)
  if (byName) return byName

  if (name.includes('skdr') || name.includes('kemenkes') || name.includes('cdc')) {
    return name.includes('cdc')
      ? { name: 'United States', code: 'US', coverageScope: 'global_outlet', coversAsean: true }
      : COUNTRIES.id
  }
  if (name.includes('who') || name.includes('reddit') || name.includes('mastodon')) {
    return GLOBAL_OUTLET
  }
  if (name.includes('outbreak news')) {
    return GLOBAL_OUTLET
  }

  return { name: 'Unclassified', code: null, coverageScope: 'unclassified', coversAsean: false }
}

export function credibilityReasonLabel(code?: string | null): string {
  switch (code) {
    case 'override':
      return 'Admin override'
    case 'domain_boost':
      return 'Domain reputation'
    case 'type_baseline':
      return 'Source-type baseline'
    default:
      return code || 'Not refreshed'
  }
}
