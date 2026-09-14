"use client"

import React, { useState, useMemo } from "react"
import Link from "next/link"
import {
  Shield,
  FileText,
  Download,
  Search,
  User,
  Clock,
  Eye,
  CheckCircle2,
} from "lucide-react"
import { PublishedReportItem } from "@/types/reports"
import { getStoredReports } from "@/lib/reports-store"
import { ReportCoverThumbnail } from "./ReportCoverThumbnail"

interface SituationReportArchiveProps {
  onToast?: (msg: string) => void
}

export const SituationReportArchive: React.FC<SituationReportArchiveProps> = () => {
  const [reports] = useState<PublishedReportItem[]>(() => {
    // Only verified published SitReps belong in the public catalog
    return getStoredReports().filter(
      (r) => r.type === "kemenkes_sitrep" && r.status === "published"
    )
  })
  const [searchQuery, setSearchQuery] = useState("")

  const filteredReports = useMemo(() => {
    return reports.filter((item) => {
      const q = searchQuery.toLowerCase()
      return (
        item.title.toLowerCase().includes(q) ||
        item.author.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
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
              Laporan Situasi Resmi (Situation Report / SitRep)
            </h2>
            <p className="text-xs font-medium text-slate-500 mt-1">
              Dokumen pengawasan mingguan dan bulanan kewaspadaan dini outbreak penyakit infeksi menular ABVC Regional
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-teal-50 border border-teal-200 px-3.5 py-1.5 text-xs font-black text-teal-800">
              <CheckCircle2 className="h-3.5 w-3.5 text-teal-600" />
              <span>Dokumen Resmi Terverifikasi</span>
            </span>
          </div>
        </div>

        {/* Filter / Search Bar */}
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-teal-100 pt-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari edisi minggu, judul, atau status SitRep..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2 text-xs font-semibold placeholder:text-slate-400 focus:border-teal-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <span>Menampilkan</span>
            <span className="rounded-lg bg-teal-50 px-2.5 py-1 font-mono font-black text-teal-800 border border-teal-200">
              {filteredReports.length} Edisi Terbit
            </span>
          </div>
        </div>
      </div>

      {/* Main SitRep List */}
      <div className="grid grid-cols-1 gap-4">
        {filteredReports.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-slate-500 space-y-3">
            <Shield className="mx-auto h-12 w-12 text-slate-300" />
            <p className="text-base font-black text-slate-700">Belum ada dokumen SitRep yang sesuai</p>
            <p className="text-xs">Coba sesuaikan kata kunci pencarian Anda.</p>
          </div>
        ) : (
          filteredReports.map((item) => (
            <article
              key={item.id}
              className="group relative rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-teal-300 hover:shadow-md transition duration-200 flex flex-col sm:flex-row items-start gap-5"
            >
              <Link
                href={`/reports/executive?template=kemenkes_sitrep&reportId=${item.id}`}
                className="shrink-0 transition transform group-hover:scale-102 cursor-pointer"
              >
                <ReportCoverThumbnail
                  type="kemenkes_sitrep"
                  period={item.period}
                  title={item.title}
                />
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
                    <span>Buka SitRep ABVC</span>
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
                    title="Cetak atau Unduh PDF"
                  >
                    <Download className="h-3.5 w-3.5 text-slate-500" />
                    <span>Download PDF</span>
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  )
}
