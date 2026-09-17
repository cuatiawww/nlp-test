/** Collapse N structured facts into the one-row-per-URL `; ` display contract. */

export const DISPLAY_SEPARATOR = '; '

const SHORT_DISEASE = {
  'respiratory syncytial virus infection': 'RSV',
  'respiratory syncytial virus': 'RSV',
  rsv: 'RSV',
  'nipah virus disease': 'Nipah',
}

export function shortDiseaseLabel(name) {
  const raw = String(name || '').trim()
  if (!raw || raw.toUpperCase() === 'UNKNOWN') return ''
  return SHORT_DISEASE[raw.toLowerCase()] || raw
}

export function joinUniqueLabels(labels) {
  const seen = new Set()
  const ordered = []
  for (const raw of labels || []) {
    const label = String(raw || '').trim()
    if (!label) continue
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    ordered.push(label)
  }
  return ordered.join(DISPLAY_SEPARATOR)
}

export function formatLabelCounts(pairs, omitZero = false) {
  const cleaned = []
  for (const [label, count] of pairs || []) {
    const name = String(label || '').trim()
    if (!name || count == null || count === '') continue
    const value = Number(count)
    if (!Number.isFinite(value)) continue
    if (omitZero && value === 0) continue
    cleaned.push([name, value])
  }
  cleaned.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return cleaned.map(([label, value]) => `${label}(${value})`).join(DISPLAY_SEPARATOR)
}

function factLocation(fact) {
  return String(
    fact?.location_label ||
      fact?.province ||
      fact?.city ||
      fact?.location_name ||
      fact?.country ||
      '',
  ).trim()
}

function toInt(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function collapseFacts(facts) {
  const rows = (facts || []).filter((item) => item && typeof item === 'object')
  const diseases = joinUniqueLabels(
    rows.map((item) => shortDiseaseLabel(item.disease || item.disease_classification)),
  )
  const locationLabels = rows.map(factLocation)
  const locations = joinUniqueLabels(locationLabels)
  const uniqueDiseases = diseases.split(DISPLAY_SEPARATOR).filter(Boolean)
  const uniqueLocations = locations.split(DISPLAY_SEPARATOR).filter(Boolean)
  const locationsVary = uniqueLocations.length > 1
  const diseasesVary = uniqueDiseases.length > 1

  const casesByLocation = new Map()
  const deathsByLocation = new Map()
  const casesByDisease = new Map()
  const deathsByDisease = new Map()
  rows.forEach((item, index) => {
    const loc = locationLabels[index]
    const disease = shortDiseaseLabel(item.disease || item.disease_classification)
    const cases = toInt(item.case_count ?? item.cases)
    const deaths = toInt(item.death_count ?? item.deaths)
    if (loc && cases != null) casesByLocation.set(loc, (casesByLocation.get(loc) || 0) + cases)
    if (loc && deaths != null) deathsByLocation.set(loc, (deathsByLocation.get(loc) || 0) + deaths)
    if (disease && cases != null) casesByDisease.set(disease, (casesByDisease.get(disease) || 0) + cases)
    if (disease && deaths != null) deathsByDisease.set(disease, (deathsByDisease.get(disease) || 0) + deaths)
  })

  let casesDisplay = ''
  let deathsDisplay = ''
  let dimension = 'single'
  if (locationsVary) {
    casesDisplay = formatLabelCounts([...casesByLocation.entries()])
    deathsDisplay = formatLabelCounts([...deathsByLocation.entries()], true)
    dimension = 'location'
  } else if (diseasesVary) {
    casesDisplay = formatLabelCounts([...casesByDisease.entries()], true)
    deathsDisplay = formatLabelCounts([...deathsByDisease.entries()], true)
    dimension = 'disease'
  }

  return {
    diseaseDisplay: diseases,
    locationDisplay: locations,
    casesDisplay: casesDisplay || null,
    deathsDisplay: deathsDisplay || null,
    dimension,
  }
}

export function factsFromAnalyzeResult(result) {
  const subEvents = result?.sub_events || []
  if (Array.isArray(subEvents) && subEvents.length >= 2) {
    return subEvents.map((item) => ({
      disease: item.disease || result.disease_classification,
      location_name: item.location_name || result.location_name,
      country: item.country || result.country,
      province: item.province || result.province,
      city: item.city || result.city,
      case_count: item.case_count,
      death_count: item.death_count,
    }))
  }
  const diseases = [...(result?.disease_extracted || [])]
  if (result?.disease_classification && !diseases.includes(result.disease_classification)) {
    diseases.unshift(result.disease_classification)
  }
  const locations = (result?.locations || [])
    .map((item) => (item && item.name ? String(item.name).trim() : ''))
    .filter(Boolean)
  if (!locations.length && result?.location_name) locations.push(result.location_name)
  if (diseases.filter(Boolean).length >= 2) {
    return diseases.filter(Boolean).map((name, index) => ({
      disease: name,
      location_name: locations[0] || result?.country || '',
      country: result?.country,
      case_count: index === 0 ? result?.case_count : 0,
      death_count: index === 0 ? result?.death_count : 0,
    }))
  }
  return [{
    disease: result?.disease_classification,
    location_name: result?.location_name,
    country: result?.country,
    province: result?.province,
    city: result?.city,
    case_count: result?.case_count,
    death_count: result?.death_count,
  }]
}

export function collapseAnalyzeResult(result) {
  if (!result) {
    return {
      diseaseDisplay: '',
      locationDisplay: '',
      casesDisplay: null,
      deathsDisplay: null,
      dimension: 'single',
    }
  }
  if (result.disease_display || result.location_display || result.cases_display || result.deaths_display) {
    return {
      diseaseDisplay: result.disease_display || '',
      locationDisplay: result.location_display || '',
      casesDisplay: result.cases_display || null,
      deathsDisplay: result.deaths_display || null,
      dimension: result.display_dimension || 'single',
    }
  }
  return collapseFacts(factsFromAnalyzeResult(result))
}
