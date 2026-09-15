import { PublishedReportItem } from "@/types/reports"

export function sanitizeReport(item: PublishedReportItem): PublishedReportItem {
  if (!item) return item

  // Direct override for known seed SitRep IDs so they are 100% clean English and ABVC
  if (item.id === "sitrep-20260914") {
    return {
      ...item,
      category: "Official Situation Report ABVC",
      title: "Infectious Disease Surveillance & Outbreak Monitoring Report ABVC — Week 38 (14 Sep 2026)",
      period: "Week 38 (08 - 14 Sep 2026)",
      author: "PHEOC ABVC",
      publishedAt: "September 14, 2026",
      type: "kemenkes_sitrep",
      status: "published",
      description: "Integrated weekly surveillance report from PHEOC ABVC for early detection and warning of national and regional outbreak signals.",
      summaryStats: item.summaryStats || {
        cases: 7640,
        deaths: 24,
        countriesCount: 38,
        topDisease: "Dengue / DBD",
      },
    }
  }

  if (item.id === "sitrep-20260907") {
    return {
      ...item,
      category: "Official Situation Report ABVC",
      title: "Infectious Disease Surveillance & Outbreak Monitoring Report ABVC — Week 37 (07 Sep 2026)",
      period: "Week 37 (01 - 07 Sep 2026)",
      author: "PHEOC ABVC",
      publishedAt: "September 07, 2026",
      type: "kemenkes_sitrep",
      status: "published",
      description: "Weekly epidemiological surveillance recapitulation across ASEAN regional member territories and local transmission trends.",
      summaryStats: item.summaryStats || {
        cases: 6920,
        deaths: 21,
        countriesCount: 38,
        topDisease: "Dengue / DBD",
      },
    }
  }

  const clean = (str?: string): string => {
    if (!str) return ""
    return str
      // 1. Full descriptions first (most specific)
      .replace(/laporan\s+pengawasan\s+surveilans\s+mingguan\s+terpadu.*/gi, "Integrated weekly surveillance report from PHEOC ABVC for early detection and warning of national and regional outbreak signals.")
      .replace(/rekapitulasi\s+surveilans\s+epidemiologi\s+mingguan.*/gi, "Weekly epidemiological surveillance recapitulation across ASEAN regional member territories and local transmission trends.")
      // 2. Titles & Categories
      .replace(/laporan\s+situasi\s+resmi\s+kemenkes\s+ri/gi, "Official Situation Report ABVC")
      .replace(/laporan\s+situasi\s+resmi\s+abvc/gi, "Official Situation Report ABVC")
      .replace(/laporan\s+situasi\s+resmi/gi, "Official Situation Report ABVC")
      .replace(/laporan\s+pengawasan\s+surveilans\s+penyakit\s+infeksi\s*(&|dan)\s*outbreak\s+kemenkes\s*ri/gi, "Infectious Disease Surveillance & Outbreak Monitoring Report ABVC")
      .replace(/laporan\s+pengawasan\s+surveilans\s+penyakit\s+infeksi\s*(&|dan)\s*outbreak\s+abvc/gi, "Infectious Disease Surveillance & Outbreak Monitoring Report ABVC")
      .replace(/laporan\s+pengawasan\s+surveilans\s+penyakit\s+infeksi\s*(&|dan)\s*outbreak/gi, "Infectious Disease Surveillance & Outbreak Monitoring Report")
      .replace(/laporan\s+pengawasan\s+surveilans/gi, "Surveillance Monitoring Report")
      // Authors & institutions
      .replace(/pheoc\s*kemenkes\s*ri/gi, "PHEOC ABVC")
      .replace(/pheoc\s*kemenkes/gi, "PHEOC ABVC")
      .replace(/kemenkes\s*ri/gi, "ABVC")
      .replace(/kemenkes/gi, "ABVC")
      .replace(/kementerian\s+kesehatan\s+ri/gi, "ABVC Centre")
      .replace(/kementerian\s+kesehatan/gi, "ABVC Centre")
      // Time & periods
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
      topDisease: "Dengue Fever",
    },
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
      topDisease: "HFMD & Dengue",
    },
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
      topDisease: "Mpox & Avian Flu",
    },
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
      topDisease: "Dengue Fever",
    },
  },
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
      topDisease: "Dengue / DBD",
    },
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
      topDisease: "Dengue / DBD",
    },
  },
]

const STORAGE_KEY_REPORTS = "abvc_surveillance_reports_v7_clean"

export function getStoredReports(): PublishedReportItem[] {
  const initial = [...INITIAL_ASEAN_MEDIA_REPORTS, ...INITIAL_KEMENKES_SITREPS].map(sanitizeReport)

  if (typeof window === "undefined") {
    return initial
  }

  try {
    // Aggressively purge all legacy stale keys that could hold cached Indonesian/Kemenkes data
    const legacyKeys = [
      "nlp_surveillance_published_reports",
      "abvc_surveillance_published_reports_v2",
      "abvc_surveillance_published_reports_v3",
      "abvc_surveillance_published_reports_v4",
      "abvc_surveillance_reports_v5",
      "abvc_surveillance_reports_v6",
    ]
    legacyKeys.forEach((k) => {
      try {
        localStorage.removeItem(k)
      } catch {}
    })

    const raw = localStorage.getItem(STORAGE_KEY_REPORTS)
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(initial))
      return initial
    }

    const parsed: PublishedReportItem[] = JSON.parse(raw)
    const sanitized = parsed.map(sanitizeReport)
    // Update storage with sanitized data if changes were made
    if (JSON.stringify(parsed) !== JSON.stringify(sanitized)) {
      localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(sanitized))
    }
    return sanitized
  } catch (err) {
    console.error("Failed to read reports from localStorage:", err)
    return initial
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
