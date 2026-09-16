/** Publication templates modeled on ASEAN PHE PDF section order (not their branding). */

export type TemplateId =
  | "mmwr_bulletin_v1"
  | "situation_report_v1"
  | "weekly_sitrep_v1"
  | "epidemic_intelligence_v1"
  | "focus_report_v1"

export type TemplateFamily = "mmwr" | "sitrep" | "ei" | "focus"

export type ReportTemplate = {
  id: Exclude<TemplateId, "weekly_sitrep_v1">
  family: TemplateFamily
  primary: boolean
  label: string
  short: string
  cadence: string
  version: string
  slugPrefix: string
  narrativeKeys: string[]
  outline: string[]
}

export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: "mmwr_bulletin_v1",
    family: "mmwr",
    primary: true,
    label: "Media monitoring bulletin",
    short: "Bulletin",
    cadence: "Weekly · MMWR-style",
    version: "1.0.0",
    slugPrefix: "mmwr",
    narrativeKeys: ["publisher", "editorial"],
    outline: [
      "Cover (uploadable)",
      "Publisher / editorial board",
      "Table of contents (per selected disease)",
      "Executive summary",
      "Situation at a Glance (cases / deaths / CFR)",
      "Disease × Country matrix",
      "ASEAN polygon choropleth",
      "Per-disease chapters (highlights, tables, epi curves, maps)",
      "Source notes",
      "Page numbers (print)",
    ],
  },
  {
    id: "situation_report_v1",
    family: "sitrep",
    primary: true,
    label: "Situation report",
    short: "SitRep",
    cadence: "Weekly · operational",
    version: "1.0.0",
    slugPrefix: "sitrep",
    narrativeKeys: ["response", "recommendations", "country_updates"],
    outline: [
      "Cover (uploadable)",
      "Table of contents (per selected disease)",
      "Situation at a Glance (cases / deaths / CFR)",
      "ASEAN polygon choropleth",
      "Disease × Country matrix",
      "Weekly cases and deaths",
      "Per-disease chapters (highlights, tables, epi curves, maps)",
      "Country updates",
      "Epidemiology / response / recommendations",
      "References",
    ],
  },
  {
    id: "epidemic_intelligence_v1",
    family: "ei",
    primary: false,
    label: "Epidemic intelligence",
    short: "EI",
    cadence: "Bi-weekly",
    version: "1.0.0",
    slugPrefix: "ei",
    narrativeKeys: ["editorial", "definitions"],
    outline: [
      "Cover + regional map",
      "Editorial",
      "Definitions",
      "Two-week event summary",
      "Executive summary",
      "Disease-signal visual",
      "Summary table",
      "References",
    ],
  },
  {
    id: "focus_report_v1",
    family: "focus",
    primary: false,
    label: "Focus report",
    short: "Focus",
    cadence: "Ad hoc · scientific",
    version: "1.0.0",
    slugPrefix: "focus",
    narrativeKeys: ["abstract", "methods", "discussion"],
    outline: [
      "Abstract",
      "Methods",
      "Results (small multiples + heatmap)",
      "Discussion",
      "Limitations",
      "References",
    ],
  },
]

export function canonicalizeTemplateId(raw?: string | null): ReportTemplate["id"] {
  const id = (raw || "").trim()
  if (id === "weekly_sitrep_v1") return "situation_report_v1"
  if (id === "media_monitoring_v1" || id === "asean_bulletin") return "mmwr_bulletin_v1"
  const found = REPORT_TEMPLATES.find((t) => t.id === id)
  return found ? found.id : "situation_report_v1"
}

export function templateById(raw?: string | null): ReportTemplate {
  const id = canonicalizeTemplateId(raw)
  return REPORT_TEMPLATES.find((t) => t.id === id) || REPORT_TEMPLATES[1]
}

export const NARRATIVE_LABELS: Record<string, string> = {
  publisher: "Publisher / editorial board",
  editorial: "Editorial note",
  definitions: "Definitions",
  response: "Response",
  recommendations: "Recommendations",
  country_updates: "Country updates",
  abstract: "Abstract",
  methods: "Methods",
  discussion: "Discussion",
}

export const AMS_HEATMAP_ROWS = [
  { country: "Brunei", display_name: "Brunei", iso3: "BRN" },
  { country: "Cambodia", display_name: "Cambodia", iso3: "KHM" },
  { country: "Indonesia", display_name: "Indonesia", iso3: "IDN" },
  { country: "Laos", display_name: "Lao PDR", iso3: "LAO" },
  { country: "Malaysia", display_name: "Malaysia", iso3: "MYS" },
  { country: "Myanmar", display_name: "Myanmar", iso3: "MMR" },
  { country: "Philippines", display_name: "Philippines", iso3: "PHL" },
  { country: "Singapore", display_name: "Singapore", iso3: "SGP" },
  { country: "Thailand", display_name: "Thailand", iso3: "THA" },
  { country: "Vietnam", display_name: "Viet Nam", iso3: "VNM" },
  { country: "Timor-Leste", display_name: "Timor-Leste", iso3: "TLS" },
] as const

export type HeatmapCell = { isMissing: boolean; label: string; value: number | null }

export function heatmapCell(value: number | null | undefined, hasData: boolean): HeatmapCell {
  if (!hasData) return { isMissing: true, label: "No data / Not reported", value: null }
  return { isMissing: false, label: String(value ?? 0), value: value ?? 0 }
}

export type AmsWeekPoint = {
  country?: string
  display_name?: string
  iso3?: string | null
  year: number
  week: number
  cases?: number | null
  events?: number | null
  has_data?: boolean
}

export function uniqueEpiWeeks(
  rows: AmsWeekPoint[] | undefined,
  fallback?: { year: number; week: number }[],
) {
  const map = new Map<string, { year: number; week: number; label: string }>()
  for (const row of rows || []) {
    const key = `${row.year}-${row.week}`
    map.set(key, { year: row.year, week: row.week, label: `W${String(row.week).padStart(2, "0")}` })
  }
  if (map.size === 0) {
    for (const row of fallback || []) {
      map.set(`${row.year}-${row.week}`, {
        year: row.year,
        week: row.week,
        label: `W${String(row.week).padStart(2, "0")}`,
      })
    }
  }
  return [...map.values()].sort((a, b) => a.year - b.year || a.week - b.week)
}

export function buildAmsWeekHeatmap(
  rows: AmsWeekPoint[] | undefined,
  weeks: { year: number; week: number; label: string }[],
) {
  const lookup = new Map<string, AmsWeekPoint>()
  for (const row of rows || []) {
    const iso = (row.iso3 || "").toUpperCase()
    lookup.set(`${iso}|${row.year}|${row.week}`, row)
  }
  return AMS_HEATMAP_ROWS.map((ams) => ({
    ...ams,
    cells: weeks.map((week) => {
      const hit = lookup.get(`${ams.iso3}|${week.year}|${week.week}`)
      if (!hit || hit.has_data === false || hit.cases == null) return heatmapCell(null, false)
      return heatmapCell(hit.cases, true)
    }),
  }))
}

export function defaultTitleForTemplate(id: string, year: number, week: number) {
  const tpl = templateById(id)
  const ew = String(week).padStart(2, "0")
  switch (tpl.family) {
    case "mmwr":
      return `ASEAN Media Monitoring Bulletin — EW ${ew}, ${year}`
    case "ei":
      return `ASEAN Epidemic Intelligence — EW ${ew}, ${year}`
    case "focus":
      return `Focus report — EW ${ew}, ${year}`
    default:
      return `ASEAN Situation Report — EW ${ew}, ${year}`
  }
}
