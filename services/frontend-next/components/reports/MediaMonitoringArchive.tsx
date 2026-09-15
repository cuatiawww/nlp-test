"use client"

import React, { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import {
  Search,
  User,
  Clock,
  Eye,
  FileText,
  Play,
  ExternalLink,
  Download,
} from "lucide-react"
import { PublishedReportItem } from "@/types/reports"
import { getStoredReports, sanitizeReport } from "@/lib/reports-store"
import { ReportCoverThumbnail } from "./ReportCoverThumbnail"

interface MediaMonitoringArchiveProps {
  onToast?: (msg: string) => void
}

export const MediaMonitoringArchive: React.FC<MediaMonitoringArchiveProps> = () => {
  const [reports, setReports] = useState<PublishedReportItem[]>([])
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    const loadReports = () => {
      const all = getStoredReports()
        .filter((r) => r.type === "asean_bulletin" && r.status === "published")
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
      <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50/60 via-white to-slate-50 p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Media Monitoring for Infectious and Emerging Diseases in ASEAN
            </h2>
            <p className="text-xs font-medium text-slate-500 mt-1">
              Official archive of media surveillance bulletins, outbreak signals, and verified regional health intelligence
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 border border-blue-200 px-3.5 py-1.5 text-xs font-black text-[#0060A9]">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>ASEAN Regional Surveillance Network</span>
            </span>
          </div>
        </div>

        {/* Filter / Search Bar */}
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-blue-100 pt-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search edition, title, or author..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2 text-xs font-semibold placeholder:text-slate-400 focus:border-[#0060A9] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <span>Showing</span>
            <span className="rounded-lg bg-blue-50 px-2.5 py-1 font-mono font-black text-[#0060A9] border border-blue-200">
              {filteredReports.length} Published Editions
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Column Sidebar & Right Column Main Bulletin Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
        {/* ==========================================
            LEFT SIDEBAR (YOUTUBE EMBED & INFO CARDS)
        ========================================== */}
        <aside className="space-y-4">
          {/* Quick Explanation Widget */}
          <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/80 via-white to-blue-50/40 p-4 shadow-xs space-y-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-[#0060A9]">
              About ASEAN Bulletin
            </span>
            <h3 className="text-sm font-black text-slate-900 leading-snug">
              Cross-Border Media Intelligence for Disease Surveillance
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Synthesized from over 5,000 regional media sources and validated against WHO, CDC, and regional EOC advisories.
            </p>
          </div>

          {/* Watch ASEAN Journey Box with Real YouTube Video Embed */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-rose-600 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-600 animate-pulse" />
                Watch ASEAN Briefing
              </h4>
              <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[9px] font-black text-rose-700 border border-rose-200">
                YOUTUBE
              </span>
            </div>

            {/* Embedded Responsive YouTube Player */}
            <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-black aspect-video shadow-xs">
              <iframe
                className="absolute inset-0 w-full h-full"
                src="https://www.youtube-nocookie.com/embed/jfKfPfyJRdk?rel=0&modestbranding=1"
                title="ASEAN Health & Surveillance Briefing"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs font-black text-slate-900 leading-snug">
                ASEAN Health &amp; Surveillance Briefing
              </p>
              <p className="text-[10px] font-semibold text-slate-500">
                Official Stream ASEAN Secretariat Online
              </p>
            </div>

            <a
              href="https://www.youtube.com/@ASEANSecretariatOnline"
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-700 py-2 text-xs font-black text-white shadow-xs transition cursor-pointer"
            >
              <Play className="h-3.5 w-3.5 fill-white" />
              <span>Watch on Official YouTube</span>
              <ExternalLink className="h-3 w-3 opacity-80" />
            </a>
          </div>

          {/* Stats Summary Widget */}
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-4 shadow-xs text-xs space-y-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              Published Bulletin Repository
            </p>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black text-[#0060A9] font-mono">{reports.length}</span>
              <span className="text-[11px] font-bold text-slate-500">Accessible Editions</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed pt-1 border-t border-slate-200/60">
              All editions are officially verified by the ABVC Regional &amp; ASEAN EOC Network epidemiological intelligence team.
            </p>
          </div>
        </aside>

        {/* ==========================================
            RIGHT MAIN LIST (AUTHENTIC BOOK CARDS)
        ========================================== */}
        <main className="space-y-4">
          {filteredReports.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-slate-500 space-y-3">
              <FileText className="mx-auto h-12 w-12 text-slate-300" />
              <p className="text-base font-black text-slate-700">No matching bulletin documents found</p>
              <p className="text-xs">Try adjusting your search keywords.</p>
            </div>
          ) : (
            filteredReports.map((rawItem) => {
              const item = sanitizeReport(rawItem)
              return (
                <article
                  key={item.id}
                  className="group relative rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs hover:border-blue-300 hover:shadow-md transition duration-200 flex flex-col sm:flex-row items-start gap-4 sm:gap-5"
                >
                  {/* Authentic Book Cover Thumbnail */}
                  <Link
                    href={`/reports/executive?template=asean_bulletin&reportId=${item.id}`}
                    className="shrink-0 transition transform group-hover:scale-102 cursor-pointer"
                  >
                    <div className="w-28 sm:w-32 h-38 sm:h-44 shrink-0 rounded-lg overflow-hidden shadow-sm">
                      <ReportCoverThumbnail
                        type="asean_bulletin"
                        period={item.period}
                        title={item.title}
                        className="w-full h-full"
                      />
                    </div>
                  </Link>

                  {/* Content Metadata */}
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-black text-[#0060A9] uppercase tracking-wider">
                        {item.category}
                      </span>
                      <span className="text-slate-400 text-xs">•</span>
                      <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[10px] font-black uppercase">
                        PUBLISHED
                      </span>
                    </div>

                    {/* Title (Clickable) */}
                    <h3 className="text-base sm:text-lg font-black text-slate-900 group-hover:text-[#0060A9] transition leading-snug">
                      <Link href={`/reports/executive?template=asean_bulletin&reportId=${item.id}`}>
                        {item.title}
                      </Link>
                    </h3>

                    {/* Author & Published Date */}
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

                    {/* Short description */}
                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                      {item.description}
                    </p>

                    {/* Action Buttons (Strictly Read & Download only for users) */}
                    <div className="pt-2 flex flex-wrap items-center gap-2.5">
                      <Link
                        href={`/reports/executive?template=asean_bulletin&reportId=${item.id}`}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-3.5 py-2 text-xs font-black text-[#0060A9] hover:bg-blue-100 transition"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Open Full Bulletin</span>
                      </Link>

                      <button
                        type="button"
                        onClick={() =>
                          window.open(
                            `/reports/executive?template=asean_bulletin&reportId=${item.id}&download=true`,
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
        </main>
      </div>
    </div>
  )
}
