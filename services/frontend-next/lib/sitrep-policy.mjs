/** Pure helpers for sitrep CMS — kept as .mjs so Node tests can import them. */

export const ASEAN11_ISO3 = {
  Brunei: 'BRN',
  Cambodia: 'KHM',
  Indonesia: 'IDN',
  Laos: 'LAO',
  Malaysia: 'MYS',
  Myanmar: 'MMR',
  Philippines: 'PHL',
  Singapore: 'SGP',
  Thailand: 'THA',
  'Timor-Leste': 'TLS',
  Vietnam: 'VNM',
}

export const ALLOWED_TRANSITIONS = {
  draft: ['in_review'],
  in_review: ['changes_requested', 'approved'],
  changes_requested: ['draft', 'in_review'],
  approved: ['in_review', 'published'],
  published: ['superseded', 'archived'],
  superseded: ['archived'],
  archived: [],
}

export function allowedTransition(from, to) {
  return (ALLOWED_TRANSITIONS[from] || []).includes(to)
}

/**
 * Missing AMS must not be painted as zero.
 * has_data false → null counts; true with 0 events/cases is a real zero.
 */
export function amsDisplayValue(row) {
  if (!row || row.has_data === false) {
    return { label: 'No data / Not reported', isMissing: true, value: null }
  }
  const value = row.events ?? row.cases ?? 0
  return { label: String(value), isMissing: false, value }
}

export function quantileBreaks(values, classes = 6) {
  const sorted = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b)
  if (!sorted.length) return []
  const breaks = []
  for (let i = 1; i < classes; i += 1) {
    const idx = Math.floor((i * sorted.length) / classes)
    breaks.push(sorted[Math.min(idx, sorted.length - 1)])
  }
  return breaks
}

export function classIndex(value, breaks) {
  if (value == null || !Number.isFinite(value)) return -1
  let i = 0
  while (i < breaks.length && value > breaks[i]) i += 1
  return i
}

export function slugForWeek(year, week, n = 1) {
  const base = `sitrep-${year}-w${String(week).padStart(2, '0')}`
  return n > 1 ? `${base}-${n}` : base
}
