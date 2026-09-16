/** Pure helpers for multi-disease SitRep / MMWR outlines. Node tests import this file. */

export const MAX_SELECTED_DISEASES = 24
export const MAX_HIGHLIGHTS = 12
export const BURDEN_INDICATORS = ['cases', 'deaths']
export const CHART_POLICY = 'cases_deaths_cfr_burden_only'

export const PRIORITY_DISEASES = [
  { name: 'COVID-19', disease_code: 'covid-19' },
  { name: 'Mpox', disease_code: 'mpox' },
  { name: 'Dengue', disease_code: 'dengue' },
  { name: 'Malaria', disease_code: 'malaria' },
  { name: 'Influenza', disease_code: 'influenza' },
  { name: 'Measles', disease_code: 'measles' },
  { name: 'Rabies', disease_code: 'rabies' },
  { name: 'Avian Influenza (H5N1)', disease_code: 'avian-influenza-h5n1' },
  { name: 'Poliomyelitis', disease_code: 'poliomyelitis' },
  { name: 'Meningococcal Disease', disease_code: 'meningococcal-disease' },
  { name: 'Hantavirus', disease_code: 'hantavirus' },
  { name: 'Legionellosis', disease_code: 'legionellosis' },
]

export function diseaseCode(name) {
  let out = ''
  for (const ch of String(name || '').trim()) {
    if (/[a-zA-Z0-9]/.test(ch)) out += ch.toLowerCase()
    else if (out && !out.endsWith('-')) out += '-'
  }
  return out.replace(/^-+|-+$/g, '') || 'unspecified'
}

export function isBurdenIndicator(indicator) {
  return ['cases', 'deaths', 'cfr'].includes(indicator)
}

export function normalizeSelectedDiseases(raw, ids = []) {
  const out = []
  const push = (name, code) => {
    const label = String(name || '').trim() || String(code || '').trim()
    if (!label) return
    const disease_code = code ? diseaseCode(code) : diseaseCode(label)
    if (out.some((row) => row.disease_code === disease_code)) return
    out.push({ disease_code, name: label })
  }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') push(item, '')
      else if (item && typeof item === 'object') {
        push(item.name || item.label || '', item.disease_code || item.id || '')
      }
    }
  } else if (typeof raw === 'string') {
    for (const part of raw.split(',')) push(part, '')
  }
  for (const id of ids || []) push(id, id)
  return out.slice(0, MAX_SELECTED_DISEASES)
}

export function diseaseMatches(selected, name, code) {
  if (!selected || !selected.length) return true
  const nameCode = diseaseCode(name)
  const rowCode = code ? diseaseCode(code) : nameCode
  const n = String(name || '').toLowerCase()
  return selected.some((sel) => {
    const selName = sel.name || ''
    const selCode = diseaseCode(sel.disease_code || selName)
    const s = selName.toLowerCase()
    if (rowCode === selCode || nameCode === selCode) return true
    if (selName && n === s) return true
    if (s.length >= 4 && (n.includes(s) || s.includes(n))) return true
    if (selCode.includes('covid') && nameCode.includes('covid')) return true
    if (selCode.includes('mpox') && (nameCode.includes('mpox') || nameCode.includes('monkeypox'))) return true
    return false
  })
}

export function chapterTocChildren(family) {
  if (family === 'mmwr') {
    return [
      { id: 'highlights', label: 'Highlights and Situation Overview' },
      { id: 'table', label: 'Cases and Deaths Table' },
      { id: 'curve', label: 'Epidemic Curve' },
      { id: 'weekly', label: 'Weekly New Cases and Deaths' },
      { id: 'map', label: 'ASEAN choropleth' },
    ]
  }
  return [
    { id: 'highlights', label: 'Highlights' },
    { id: 'table', label: 'ASEAN cases / deaths / CFR' },
    { id: 'curve', label: 'Epidemic curve' },
    { id: 'weekly', label: 'Weekly new cases and deaths' },
    { id: 'map', label: 'Distribution map' },
  ]
}

export function templateFamily(templateId) {
  const id = String(templateId || '')
  if (id.includes('mmwr') || id.includes('media_monitoring')) return 'mmwr'
  if (id.includes('epidemic_intelligence') || id === 'ei') return 'ei'
  if (id.includes('focus')) return 'focus'
  return 'sitrep'
}

export function buildSectionOrder(templateId, diseases) {
  const family = templateFamily(templateId)
  const order = []
  const push = (id, label) => order.push({ id, label })
  push('cover', 'Cover')
  if (family === 'mmwr' || family === 'ei') push('publisher', 'Publisher / editorial board')
  push('toc', 'Table of contents')
  if (family === 'mmwr' || family === 'ei') push('exec_summary', 'Executive summary')
  else if (family === 'sitrep') push('exec_summary', 'Key highlights')
  push('glance', 'Situation at a Glance')
  push('matrix', 'Disease × Country matrix')
  push('map', 'ASEAN choropleth')
  if (family === 'sitrep') {
    push('ams_table', 'AMS cases / deaths / CFR')
    push('weekly_chart', 'Weekly cases and deaths')
  }
  for (const d of diseases || []) {
    push(`chapter:${d.disease_code || diseaseCode(d.name)}`, d.name || 'Disease')
  }
  if (family === 'sitrep') {
    push('country_updates', 'Country updates')
    push('response', 'Response')
    push('recommendations', 'Recommendations')
  }
  push('sources', 'References / sources')
  return order
}

export function buildToc(templateId, diseases) {
  const family = templateFamily(templateId)
  const children = chapterTocChildren(family)
  const items = []
  items.push({ href: '#glance', label: 'Situation at a Glance' })
  items.push({ href: '#matrix', label: 'Disease × Country matrix' })
  items.push({ href: '#map', label: 'ASEAN choropleth' })
  for (const d of diseases || []) {
    const code = d.disease_code || diseaseCode(d.name)
    items.push({
      href: `#chapter-${code}`,
      label: d.name || 'Disease',
      children: children.map((c) => ({
        href: `#chapter-${code}-${c.id}`,
        label: c.label,
      })),
    })
  }
  items.push({ href: '#sources', label: 'References' })
  return items
}

export function looksLikeHtml(value) {
  return typeof value === 'string' && /<\/?[a-z][\s\S]*>/i.test(value)
}
