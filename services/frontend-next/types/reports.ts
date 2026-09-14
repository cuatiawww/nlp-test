export type ReportTemplateType = "asean_bulletin" | "kemenkes_sitrep"
export type ReportStatus = "published" | "draft"

export interface PublishedReportItem {
  id: string
  category: string
  title: string
  period: string
  author: string
  publishedAt: string
  type: ReportTemplateType
  status: ReportStatus
  coverUrl?: string
  pdfUrl?: string
  description: string
  summaryStats?: {
    cases: number
    deaths: number
    countriesCount: number
    topDisease: string
  }
}
