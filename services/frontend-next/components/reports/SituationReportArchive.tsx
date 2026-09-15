"use client"

import React, { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import {
  Shield,
  Search,
  User,
  Clock,
  Eye,
  CheckCircle2,
  Download,
} from "lucide-react"
import { PublishedReportItem } from "@/types/reports"
import { getStoredReports, sanitizeReport } from "@/lib/reports-store"
import { ReportCoverThumbnail } from "./ReportCoverThumbnail"

interface SituationReportArchiveProps {
  onToast?: (msg: string) => void
}

export const SituationReportArchive: React.FC<SituationReportArchiveProps> = () => {
  const [reports, setReports] = useState<PublishedReportItem[]>([])
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    const loadReports = () => {
      const all = getStoredReports()
        .filter((r) => r.type === "kemenkes_sitrep" && r.status === "published")
        .map(sanitizeReport)
      setReports(all)
    }

    loadReports()

    const handleStorage = (e: StorageEvent) => {
      if (!e.key || e.key.includes("surveillance") || e.key.includes("reports")) {
        loadReports()
      }
    }

    window.addEventListener("storage", handleStorage)
    return () => window.removeEventListener("storage", handleStorage)
  }, [])

  const filteredReports = useMemo(() => {
    return reports
      .map(sanitizeReport)
      .filter((item) => {
        const q = searchQuery.toLowerCase()
        return (
          item.title.toLowerCase().includes(q) ||
          item.author.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.period.toLowerCase().includes(q)
        )
      })
  }, [reports, searchQuery])

  return (
    <div className="space-y-6">
      {/* Top Banner (Public User View) */}
      <div className="rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50/70 via-white to-slate-50 p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Official Situation Report (Situation Report / SitRep)
            </h2>
            <p className="text-xs font-medium text-slate-500 mt-1">
              Weekly and monthly early warning surveillance and outbreak intelligence document for communicable infectious diseases — ABVC Regional EOC
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-teal-50 border border-teal-200 px-3.5 py-1.5 text-xs font-black text-teal-800">
              <CheckCircle2 className="h-3.5 w-3.5 text-teal-600" />
              <span>Verified Official Document</span>
            </span>
          </div>
        </div>

        {/* Filter / Search Bar */}
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-teal-100 pt-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search epi-week, title, or SitRep status..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2 text-xs font-semibold placeholder:text-slate-400 focus:border-teal-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <span>Showing</span>
            <span className="rounded-lg bg-teal-50 px-2.5 py-1 font-mono font-black text-teal-800 border border-teal-200">
              {filteredReports.length} Published Editions
            </span>
          </div>
        </div>
      </div>

      {/* Main SitRep List */}
      <div className="grid grid-cols-1 gap-4">
        {filteredReports.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-slate-500 space-y-3">
            <Shield className="mx-auto h-12 w-12 text-slate-300" />
            <p className="text-base font-black text-slate-700">No matching SitRep documents found</p>
            <p className="text-xs">Try adjusting your search keywords.</p>
          </div>
        ) : (
          filteredReports.map((rawItem) => {
            const item = sanitizeReport(rawItem)
            return (
              <article
                key={item.id}
                className="group relative rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-teal-300 hover:shadow-md transition duration-200 flex flex-col sm:flex-row items-start gap-5"
              >
                <Link
                  href={`/reports/executive?template=kemenkes_sitrep&reportId=${item.id}`}
                  className="shrink-0 transition transform group-hover:scale-102 cursor-pointer"
                >
                  <div className="w-28 sm:w-32 h-38 sm:h-44 shrink-0 rounded-lg overflow-hidden shadow-sm">
                    <ReportCoverThumbnail
                      type="kemenkes_sitrep"
                      period={item.period}
                      title={item.title}
                      className="w-full h-full"
                    />
                  </div>
                </Link>

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-black text-teal-800 uppercase tracking-wider">
                      {item.category}
                    </span>
                  </div>

                  <h3 className="text-base sm:text-lg font-black text-slate-900 group-hover:text-teal-800 transition leading-snug">
                    <Link href={`/reports/executive?template=kemenkes_sitrep&reportId=${item.id}`}>
                      {item.title}
                    </Link>
                  </h3>

                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <span className="flex items-center gap-1 text-slate-700 font-bold">
                      <User className="h-3.5 w-3.5 text-slate-400" />
                      {item.author}
                    </span>
                    <span>-</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      {item.publishedAt}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                    {item.description}
                  </p>

                  {/* Strictly Read & Download only for regular users */}
                  <div className="pt-2 flex flex-wrap items-center gap-2.5">
                    <Link
                      href={`/reports/executive?template=kemenkes_sitrep&reportId=${item.id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-teal-50 px-3.5 py-2 text-xs font-black text-teal-800 hover:bg-teal-100 transition"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Open ABVC SitRep</span>
                    </Link>

                    <button
                      type="button"
                      onClick={() =>
                        window.open(
                          `/reports/executive?template=kemenkes_sitrep&reportId=${item.id}&print=true`,
                          "_blank"
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 transition shadow-2xs cursor-pointer"
                      title="Print or Download PDF"
                    >
                      <Download className="h-3.5 w-3.5 text-slate-500" />
                      <span>Download PDF</span>
                    </button>
                  </div>
                </div>
              </article>
            )
          })
        )}
      </div>
    </div>
  )
}
