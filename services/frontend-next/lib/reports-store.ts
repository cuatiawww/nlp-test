import { PublishedReportItem } from "@/types/reports"

export const INITIAL_ASEAN_MEDIA_REPORTS: PublishedReportItem[] = [
  {
    id: "mm-20260914",
    category: "Data & Publications Media Monitoring Report",
    title: "Media Monitoring for Infectious and Emerging Diseases in the ASEAN Region 14 September 2026",
    period: "Week 38 (14 Sep 2026)",
    author: "yusuf",
    publishedAt: "September 14, 2026",
    type: "asean_bulletin",
    status: "published",
    description: "Periodic epidemiological intelligence monitoring of communicable infectious diseases (Dengue, HFMD, Mpox Clade Ib) across ASEAN member states.",
    summaryStats: {
      cases: 7640,
      deaths: 24,
      countriesCount: 11,
      topDisease: "Dengue Fever"
    }
  },
  {
    id: "mm-20260911",
    category: "Data & Publications Media Monitoring Report",
    title: "Media Monitoring for Infectious and Emerging Diseases in the ASEAN Region 10 - 11 September 2026",
    period: "10 - 11 September 2026",
    author: "Rijal",
    publishedAt: "September 11, 2026",
    type: "asean_bulletin",
    status: "published",
    description: "Analysis of HFMD cluster surge trends in preschool facilities across Malaysia and Dengue cases in Dak Lak Highlands, Viet Nam.",
    summaryStats: {
      cases: 5820,
      deaths: 18,
      countriesCount: 9,
      topDisease: "HFMD & Dengue"
    }
  },
  {
    id: "mm-20260909",
    category: "Data & Publications Media Monitoring Report",
    title: "Media Monitoring for Infectious and Emerging Diseases in the ASEAN Region - 09 September 2026",
    period: "09 September 2026",
    author: "vira",
    publishedAt: "September 09, 2026",
    type: "asean_bulletin",
    status: "published",
    description: "Early detection updates on airport thermal screening checkpoints and close-contact surveillance across the region.",
    summaryStats: {
      cases: 4310,
      deaths: 15,
      countriesCount: 8,
      topDisease: "Mpox & Avian Flu"
    }
  },
  {
    id: "mm-20260907",
    category: "Data & Publications Media Monitoring Report",
    title: "Media Monitoring for Infectious and Emerging Diseases in the ASEAN Region - 07 September 2026",
    period: "07 September 2026",
    author: "vira",
    publishedAt: "September 07, 2026",
    type: "asean_bulletin",
    status: "published",
    description: "Weekly regional communicable disease media monitoring report and EOC coordination between health ministries.",
    summaryStats: {
      cases: 3950,
      deaths: 12,
      countriesCount: 7,
      topDisease: "Dengue Fever"
    }
  }
]

export const INITIAL_KEMENKES_SITREPS: PublishedReportItem[] = [
  {
    id: "sitrep-20260914",
    category: "Official Situation Report ABVC",
    title: "Infectious Disease Surveillance & Outbreak Monitoring Report ABVC — Week 38 (14 Sep 2026)",
    period: "Week 38 (08 - 14 Sep 2026)",
    author: "PHEOC ABVC",
    publishedAt: "September 14, 2026",
    type: "kemenkes_sitrep",
    status: "published",
    description: "Integrated weekly surveillance report from PHEOC ABVC for early detection and warning of national and regional outbreak signals.",
    summaryStats: {
      cases: 7640,
      deaths: 24,
      countriesCount: 38,
      topDisease: "Dengue / DBD"
    }
  },
  {
    id: "sitrep-20260907",
    category: "Official Situation Report ABVC",
    title: "Infectious Disease Surveillance & Outbreak Monitoring Report ABVC — Week 37 (07 Sep 2026)",
    period: "Week 37 (01 - 07 Sep 2026)",
    author: "PHEOC ABVC",
    publishedAt: "September 07, 2026",
    type: "kemenkes_sitrep",
    status: "published",
    description: "Weekly epidemiological surveillance recapitulation across ASEAN regional member territories and local transmission trends.",
    summaryStats: {
      cases: 6920,
      deaths: 21,
      countriesCount: 38,
      topDisease: "Dengue / DBD"
    }
  }
]

const STORAGE_KEY_REPORTS = "nlp_surveillance_published_reports"

export function getStoredReports(): PublishedReportItem[] {
  if (typeof window === "undefined") {
    return [...INITIAL_ASEAN_MEDIA_REPORTS, ...INITIAL_KEMENKES_SITREPS]
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REPORTS)
    if (!raw) {
      const initial = [...INITIAL_ASEAN_MEDIA_REPORTS, ...INITIAL_KEMENKES_SITREPS]
      localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(initial))
      return initial
    }
    return JSON.parse(raw)
  } catch (err) {
    console.error("Failed to read reports from localStorage:", err)
    return [...INITIAL_ASEAN_MEDIA_REPORTS, ...INITIAL_KEMENKES_SITREPS]
  }
}

export function saveReportToStore(item: PublishedReportItem): void {
  if (typeof window === "undefined") return
  try {
    const current = getStoredReports()
    const index = current.findIndex((r) => r.id === item.id)
    let updated: PublishedReportItem[]
    if (index >= 0) {
      updated = [...current]
      updated[index] = item
    } else {
      updated = [item, ...current]
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
