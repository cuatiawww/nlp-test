import { fetchFrom, patchTo, postTo } from "@/lib/api"
import type { ReportIssue, ReportIssueCard, ReportIssueStatus } from "@/types/sitrep"

export function listPublicReportIssues(params?: {
  disease?: string
  country?: string
  q?: string
  epi_year?: number
  epi_week?: number
  template?: string
}) {
  const sp = new URLSearchParams()
  if (params?.disease) sp.set("disease", params.disease)
  if (params?.country) sp.set("country", params.country)
  if (params?.q) sp.set("q", params.q)
  if (params?.epi_year) sp.set("epi_year", String(params.epi_year))
  if (params?.epi_week) sp.set("epi_week", String(params.epi_week))
  if (params?.template) sp.set("template", params.template)
  const q = sp.toString()
  return fetchFrom<ReportIssueCard[]>(`/api/v1/public/report-issues${q ? `?${q}` : ""}`)
}

export function fetchPublicReportIssue(slug: string) {
  return fetchFrom<ReportIssue>(`/api/v1/public/report-issues/${encodeURIComponent(slug)}`)
}

export function fetchLatestPublicReport() {
  return fetchFrom<ReportIssueCard | null>("/api/v1/public/report-issues/latest")
}

export function listCmsIssues(status?: string) {
  const q = status && status !== "all" ? `?status=${encodeURIComponent(status)}` : ""
  return fetchFrom<ReportIssue[]>(`/api/v1/report-issues${q}`)
}

export function fetchCmsIssue(id: number) {
  return fetchFrom<ReportIssue>(`/api/v1/report-issues/${id}`)
}

export function createReportIssue(body: {
  epi_year: number
  epi_week: number
  epi_week_end?: number
  title?: string
  template_id?: string
  scope?: string
  assist_narrative?: boolean
  selected_diseases?: Array<string | { name?: string; disease_code?: string }>
  disease_ids?: string[]
}) {
  return postTo<ReportIssue>("/api/v1/report-issues", body)
}

export function patchReportIssue(id: number, body: Record<string, unknown>) {
  return patchTo<ReportIssue>(`/api/v1/report-issues/${id}`, body)
}

export function pullReportKpis(id: number) {
  return postTo<ReportIssue>(`/api/v1/report-issues/${id}/pull-kpi`, {})
}

export function transitionReportIssue(id: number, to_status: ReportIssueStatus, comment?: string) {
  return postTo<ReportIssue>(`/api/v1/report-issues/${id}/transition`, { to_status, comment })
}

export function publishReportIssue(id: number, body?: { slug?: string; visibility?: string; comment?: string }) {
  return postTo<ReportIssue>(`/api/v1/report-issues/${id}/publish`, body || {})
}

export function suggestReportNotes(id: number, apply = false) {
  return postTo<{
    highlights: string[]
    narrative?: Record<string, string>
    section_notes?: { disease_code: string; note: string }[]
    requires_human_review: boolean
    llm_used: boolean
    cached?: boolean
    model?: string
    disclaimer: string
  }>(`/api/v1/report-issues/${id}/suggest-notes`, { kind: "highlights", apply })
}

export function fetchReportTemplates() {
  return fetchFrom<
    Array<{
      id: string
      family?: string
      primary?: boolean
      title: string
      version: string
      outline: string[]
      narrative_keys?: string[]
      slug_prefix?: string
    }>
  >("/api/v1/report-issues/templates")
}

export function fetchReportTaxonomies() {
  return fetchFrom<{
    ams: { country: string; display_name: string; iso3: string }[]
    diseases?: { name: string; disease_code: string }[]
    statuses: string[]
    map_indicators?: string[]
    chart_policy?: string
    missing_policy: string
  }>("/api/v1/report-issues/taxonomies")
}

export function uploadReportAsset(
  id: number,
  body: { kind: "cover" | "page"; data_url: string; caption?: string; page_id?: string },
) {
  return postTo<ReportIssue>(`/api/v1/report-issues/${id}/assets`, body)
}

export function formatEpiBadge(year: number, week: number) {
  return `EW ${String(week).padStart(2, "0")} / ${year}`
}

export function snapshotOf(issue: ReportIssue | null | undefined) {
  if (!issue) return null
  if (issue.status === "published" || issue.status === "superseded") {
    return issue.published_snapshot || issue.kpi_snapshot || null
  }
  return issue.kpi_snapshot || issue.published_snapshot || null
}
