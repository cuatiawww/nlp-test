/** Pure helpers for ASEAN Admin-0 choropleth popups. Node tests import this file. */

export const AMS_ISO3_ORDER = [
  'BRN',
  'KHM',
  'IDN',
  'LAO',
  'MYS',
  'MMR',
  'PHL',
  'SGP',
  'THA',
  'TLS',
  'VNM',
]

export const AMS_DISPLAY = {
  BRN: 'Brunei',
  KHM: 'Cambodia',
  IDN: 'Indonesia',
  LAO: 'Lao PDR',
  MYS: 'Malaysia',
  MMR: 'Myanmar',
  PHL: 'Philippines',
  SGP: 'Singapore',
  THA: 'Thailand',
  TLS: 'Timor-Leste',
  VNM: 'Viet Nam',
}

export function formatBurdenCount(value) {
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('en-US')
}

export function formatCfr(value) {
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return `${n}%`
}

/** Popup copy for one AMS. Missing is em dash, never a dummy zero. */
export function amsPopup(row, iso3) {
  const code = String(iso3 || row?.iso3 || '').toUpperCase()
  const name = row?.display_name || AMS_DISPLAY[code] || code || 'Unknown'
  const missing = !row || row.has_data === false
  if (missing) {
    return {
      iso3: code,
      name,
      has_data: false,
      status: 'No data / Not reported',
      cases: '—',
      deaths: '—',
      cfr: '—',
    }
  }
  return {
    iso3: code,
    name,
    has_data: true,
    status: null,
    cases: formatBurdenCount(row.cases),
    deaths: formatBurdenCount(row.deaths),
    cfr: formatCfr(row.cfr),
  }
}

export function amsDirectory(rows) {
  const byIso = new Map()
  for (const row of rows || []) {
    if (row?.iso3) byIso.set(String(row.iso3).toUpperCase(), row)
  }
  return AMS_ISO3_ORDER.map((iso3) => amsPopup(byIso.get(iso3), iso3))
}
