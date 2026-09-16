export const REPORT_TEMPLATES = [
  {
    id: 'mmwr_bulletin_v1',
    family: 'mmwr',
    primary: true,
    slugPrefix: 'mmwr',
    narrativeKeys: ['publisher', 'editorial'],
  },
  {
    id: 'situation_report_v1',
    family: 'sitrep',
    primary: true,
    slugPrefix: 'sitrep',
    narrativeKeys: ['response', 'recommendations', 'country_updates'],
  },
  {
    id: 'epidemic_intelligence_v1',
    family: 'ei',
    primary: false,
    slugPrefix: 'ei',
    narrativeKeys: ['editorial', 'definitions'],
  },
  {
    id: 'focus_report_v1',
    family: 'focus',
    primary: false,
    slugPrefix: 'focus',
    narrativeKeys: ['abstract', 'methods', 'discussion'],
  },
]

export const AMS_HEATMAP_ROWS = [
  { country: 'Brunei', display_name: 'Brunei', iso3: 'BRN' },
  { country: 'Cambodia', display_name: 'Cambodia', iso3: 'KHM' },
  { country: 'Indonesia', display_name: 'Indonesia', iso3: 'IDN' },
  { country: 'Laos', display_name: 'Lao PDR', iso3: 'LAO' },
  { country: 'Malaysia', display_name: 'Malaysia', iso3: 'MYS' },
  { country: 'Myanmar', display_name: 'Myanmar', iso3: 'MMR' },
  { country: 'Philippines', display_name: 'Philippines', iso3: 'PHL' },
  { country: 'Singapore', display_name: 'Singapore', iso3: 'SGP' },
  { country: 'Thailand', display_name: 'Thailand', iso3: 'THA' },
  { country: 'Vietnam', display_name: 'Viet Nam', iso3: 'VNM' },
  { country: 'Timor-Leste', display_name: 'Timor-Leste', iso3: 'TLS' },
]

export function canonicalizeTemplateId(raw) {
  const id = (raw || '').trim()
  if (!id || id === 'weekly_sitrep_v1') return 'situation_report_v1'
  if (id === 'media_monitoring_v1' || id === 'asean_bulletin') return 'mmwr_bulletin_v1'
  if (REPORT_TEMPLATES.some((t) => t.id === id)) return id
  return null
}

export function slugForEdition(templateId, year, week, n = 1) {
  const id = canonicalizeTemplateId(templateId) || 'situation_report_v1'
  const prefix = REPORT_TEMPLATES.find((t) => t.id === id)?.slugPrefix || 'sitrep'
  const base = `${prefix}-${year}-w${String(week).padStart(2, '0')}`
  return n > 1 ? `${base}-${n}` : base
}

export function heatmapCell(value, hasData) {
  if (!hasData) return { isMissing: true, label: 'No data / Not reported', value: null }
  return { isMissing: false, label: String(value ?? 0), value: value ?? 0 }
}

export function uniqueEpiWeeks(rows, fallback) {
  const map = new Map()
  for (const row of rows || []) {
    map.set(`${row.year}-${row.week}`, {
      year: row.year,
      week: row.week,
      label: `W${String(row.week).padStart(2, '0')}`,
    })
  }
  if (map.size === 0) {
    for (const row of fallback || []) {
      map.set(`${row.year}-${row.week}`, {
        year: row.year,
        week: row.week,
        label: `W${String(row.week).padStart(2, '0')}`,
      })
    }
  }
  return [...map.values()].sort((a, b) => a.year - b.year || a.week - b.week)
}

export function buildAmsWeekHeatmap(rows, weeks) {
  const lookup = new Map()
  for (const row of rows || []) {
    const iso = String(row.iso3 || '').toUpperCase()
    lookup.set(`${iso}|${row.year}|${row.week}`, row)
  }
  return AMS_HEATMAP_ROWS.map((ams) => ({
    ...ams,
    cells: weeks.map((week) => {
      const hit = lookup.get(`${ams.iso3}|${week.year}|${week.week}`)
      if (!hit || hit.has_data === false) return heatmapCell(null, false)
      return heatmapCell(hit.cases ?? hit.events ?? 0, true)
    }),
  }))
}
