import { PublishedReportItem } from "@/types/reports"

export function sanitizeReport(item: PublishedReportItem): PublishedReportItem {
  if (!item) return item

  const clean = (str?: string): string => {
    if (!str) return ""
    return str
      .replace(/laporan\s+pengawasan\s+surveilans\s+mingguan\s+terpadu.*/gi, "Integrated weekly surveillance report from PHEOC ABVC for early detection and warning of national and regional outbreak signals.")
      .replace(/rekapitulasi\s+surveilans\s+epidemiologi\s+mingguan.*/gi, "Weekly epidemiological surveillance recapitulation across ASEAN regional member territories and local transmission trends.")
      .replace(/laporan\s+situasi\s+resmi\s+kemenkes\s+ri/gi, "Official Situation Report ABVC")
      .replace(/laporan\s+situasi\s+resmi\s+abvc/gi, "Official Situation Report ABVC")
      .replace(/laporan\s+situasi\s+resmi/gi, "Official Situation Report ABVC")
      .replace(/laporan\s+pengawasan\s+surveilans\s+penyakit\s+infeksi\s*(&|dan)\s*outbreak\s+kemenkes\s*ri/gi, "Infectious Disease Surveillance & Outbreak Monitoring Report ABVC")
      .replace(/laporan\s+pengawasan\s+surveilans\s+penyakit\s+infeksi\s*(&|dan)\s*outbreak\s+abvc/gi, "Infectious Disease Surveillance & Outbreak Monitoring Report ABVC")
      .replace(/laporan\s+pengawasan\s+surveilans\s+penyakit\s+infeksi\s*(&|dan)\s*outbreak/gi, "Infectious Disease Surveillance & Outbreak Monitoring Report")
      .replace(/laporan\s+pengawasan\s+surveilans/gi, "Surveillance Monitoring Report")
      .replace(/pheoc\s*kemenkes\s*ri/gi, "PHEOC ABVC")
      .replace(/pheoc\s*kemenkes/gi, "PHEOC ABVC")
      .replace(/kemenkes\s*ri/gi, "ABVC")
      .replace(/kemenkes/gi, "ABVC")
      .replace(/kementerian\s+kesehatan\s+ri/gi, "ABVC Centre")
      .replace(/kementerian\s+kesehatan/gi, "ABVC Centre")
      .replace(/minggu\s+ke-(\d+)/gi, "Week $1")
      .replace(/minggu\s+ke-/gi, "Week ")
  }

  return {
    ...item,
    category: clean(item.category),
    title: clean(item.title),
    author: clean(item.author),
    description: clean(item.description),
    period: clean(item.period),
  }
}

/** Production must not seed dummy SitRep / bulletin rows. CMS drafts live in localStorage only. */
export const INITIAL_ASEAN_MEDIA_REPORTS: PublishedReportItem[] = []
export const INITIAL_KEMENKES_SITREPS: PublishedReportItem[] = []

const STORAGE_KEY_REPORTS = "abvc_surveillance_reports_v8_live_only"

export function getStoredReports(): PublishedReportItem[] {
  if (typeof window === "undefined") {
    return []
  }

  try {
    const legacyKeys = [
      "nlp_surveillance_published_reports",
      "abvc_surveillance_published_reports_v2",
      "abvc_surveillance_published_reports_v3",
      "abvc_surveillance_published_reports_v4",
      "abvc_surveillance_reports_v5",
      "abvc_surveillance_reports_v6",
      "abvc_surveillance_reports_v7_clean",
    ]
    legacyKeys.forEach((k) => {
      try {
        localStorage.removeItem(k)
      } catch {}
    })

    const raw = localStorage.getItem(STORAGE_KEY_REPORTS)
    if (!raw) {
      return []
    }

    const parsed: PublishedReportItem[] = JSON.parse(raw)
    const sanitized = parsed.map(sanitizeReport)
    if (JSON.stringify(parsed) !== JSON.stringify(sanitized)) {
      localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(sanitized))
    }
    return sanitized
  } catch (err) {
    console.error("Failed to read reports from localStorage:", err)
    return []
  }
}

export function saveReportToStore(item: PublishedReportItem): void {
  if (typeof window === "undefined") return
  try {
    const sanitizedItem = sanitizeReport(item)
    const current = getStoredReports()
    const index = current.findIndex((r) => r.id === sanitizedItem.id)
    let updated: PublishedReportItem[]
    if (index >= 0) {
      updated = [...current]
      updated[index] = sanitizedItem
    } else {
      updated = [sanitizedItem, ...current]
    }
    localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(updated))
  } catch (err) {
    console.error("Failed to save report to localStorage:", err)
  }
}

export function deleteReportFromStore(id: string): void {
  if (typeof window === "undefined") return
  try {
    const current = getStoredReports()
    const updated = current.filter((r) => r.id !== id)
    localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(updated))
  } catch (err) {
    console.error("Failed to delete report from localStorage:", err)
  }
}
