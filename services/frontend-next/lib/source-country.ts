import type { Source } from '@/types'

export type SourceCountry = {
  name: string
  code: string | null
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
  'ASEAN / Asia',
  'Outside ASEAN',
]

const COUNTRIES: Record<string, SourceCountry> = {
  id: { name: 'Indonesia', code: 'ID' },
  indonesia: { name: 'Indonesia', code: 'ID' },
  my: { name: 'Malaysia', code: 'MY' },
  malaysia: { name: 'Malaysia', code: 'MY' },
  sg: { name: 'Singapore', code: 'SG' },
  singapore: { name: 'Singapore', code: 'SG' },
  th: { name: 'Thailand', code: 'TH' },
  thailand: { name: 'Thailand', code: 'TH' },
  ph: { name: 'Philippines', code: 'PH' },
  philippines: { name: 'Philippines', code: 'PH' },
  vn: { name: 'Vietnam', code: 'VN' },
  vietnam: { name: 'Vietnam', code: 'VN' },
  'viet nam': { name: 'Vietnam', code: 'VN' },
  bn: { name: 'Brunei', code: 'BN' },
  brunei: { name: 'Brunei', code: 'BN' },
  kh: { name: 'Cambodia', code: 'KH' },
  cambodia: { name: 'Cambodia', code: 'KH' },
  kampuchea: { name: 'Cambodia', code: 'KH' },
  la: { name: 'Laos', code: 'LA' },
  lao: { name: 'Laos', code: 'LA' },
  laos: { name: 'Laos', code: 'LA' },
  mm: { name: 'Myanmar', code: 'MM' },
  myanmar: { name: 'Myanmar', code: 'MM' },
  burma: { name: 'Myanmar', code: 'MM' },
  tl: { name: 'Timor-Leste', code: 'TL' },
  'timor-leste': { name: 'Timor-Leste', code: 'TL' },
  'timor leste': { name: 'Timor-Leste', code: 'TL' },
  timor: { name: 'Timor-Leste', code: 'TL' },
}

const DOMAIN_COUNTRIES: Array<[string, SourceCountry]> = [
  ['cdc.gov', { name: 'United States', code: 'US' }],
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
  if (normalized.includes('outside asean')) {
    return { name: 'Outside ASEAN', code: 'GLOBAL' }
  }
  if (!normalized) return undefined
  if (normalized.includes('global') || normalized.includes('international') || normalized.includes('world')) {
    return { name: 'Outside ASEAN', code: 'GLOBAL' }
  }
  if (normalized.includes('asean') || normalized.includes('regional') || normalized.includes('asia')) {
    return { name: 'ASEAN / Asia', code: 'ASEAN' }
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

function countryFromUrl(url: string, sourceName: string): SourceCountry | undefined {
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

  // Google News uses the edition in `gl`. This is only used when the source
  // name explicitly identifies a country-specific feed; a generic edition is
  // intentionally classified as international/regional.
  if (hostname === 'news.google.com') {
    const namedCountry = countryFromValue(sourceName)
    if (namedCountry) return namedCountry
    const locale = parsed.searchParams.get('gl')?.toLowerCase()
    if (locale && ['id', 'my', 'sg', 'th', 'ph', 'vn', 'bn', 'kh', 'la', 'mm', 'tl'].includes(locale)) {
      return TLD_COUNTRIES[locale]
    }
  }

  return undefined
}

export function resolveSourceCountry(source: Pick<Source, 'name' | 'config' | 'country'>): SourceCountry {
  const persisted = countryFromValue(source.country)
  if (persisted) return persisted

  const config = source.config || {}
  const explicit = countryFromValue(config.country)
  if (explicit) return explicit

  const urls = collectUrls(config)
  for (const url of urls) {
    const fromUrl = countryFromUrl(url, source.name)
    if (fromUrl) return fromUrl
  }

  const byName = countryFromValue(source.name)
  if (byName) return byName

  const name = source.name.toLowerCase()
  if (name.includes('skdr') || name.includes('kemenkes') || name.includes('cdc')) {
    return name.includes('cdc') ? { name: 'United States', code: 'US' } : COUNTRIES.id
  }
  if (name.includes('who') || name.includes('reliefweb') || name.includes('reddit') || name.includes('mastodon')) {
    return { name: 'Outside ASEAN', code: 'GLOBAL' }
  }
  if (name.includes('google news asia')) return { name: 'ASEAN / Asia', code: 'ASEAN' }
  if (name.includes('google news') || name.includes('outbreak news')) {
    return { name: 'Outside ASEAN', code: 'GLOBAL' }
  }

  return { name: 'Unclassified', code: null }
}
