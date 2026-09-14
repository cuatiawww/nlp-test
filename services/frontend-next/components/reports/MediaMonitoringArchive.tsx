"use client"

import React, { useState, useMemo } from "react"
import Link from "next/link"
import {
  FileText,
  Download,
  Plus,
  Search,
  Calendar,
  User,
  Globe,
  Upload,
  CheckCircle2,
  Clock,
  Sparkles,
  ExternalLink,
  Edit3,
  Trash2,
  Filter,
  Play,
  Share2,
  X,
  Eye,
} from "lucide-react"
import { PublishedReportItem } from "@/types/reports"
import { getStoredReports, saveReportToStore, deleteReportFromStore } from "@/lib/reports-store"
import { ReportCoverThumbnail } from "./ReportCoverThumbnail"

interface MediaMonitoringArchiveProps {
  onToast?: (msg: string) => void
}

export const MediaMonitoringArchive: React.FC<MediaMonitoringArchiveProps> = ({ onToast }) => {
  const [reports, setReports] = useState<PublishedReportItem[]>(() => {
    return getStoredReports().filter((r) => r.type === "asean_bulletin")
  })
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedStatus, setSelectedStatus] = useState<"all" | "published" | "draft">("all")
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)

  // Upload Form State
  const [newTitle, setNewTitle] = useState("")
  const [newPeriod, setNewPeriod] = useState("15 September 2026")
  const [newAuthor, setNewAuthor] = useState("yusuf")
  const [newDescription, setNewDescription] = useState("")
  const [uploadedFileName, setUploadedFileName] = useState("")

  const filteredReports = useMemo(() => {
    return reports.filter((item) => {
      const matchSearch =
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase())

      const matchStatus = selectedStatus === "all" || item.status === selectedStatus
      return matchSearch && matchStatus
    })
  }, [reports, searchQuery, selectedStatus])

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) {
      alert("Mohon masukkan judul buletin laporan.")
      return
    }

    const newItem: PublishedReportItem = {
      id: `mm-${Date.now()}`,
      category: "Data & Publications Media Monitoring Report",
      title: newTitle.trim(),
      period: newPeriod.trim(),
      author: newAuthor.trim() || "Analis Kemenkes/ASEAN",
      publishedAt: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      type: "asean_bulletin",
      status: "published",
      description: newDescription.trim() || "Publikasi laporan media monitoring surveilans penyakit infeksi berkala kawasan ASEAN.",
      pdfUrl: uploadedFileName ? `/sample_template/${uploadedFileName}` : undefined,
      summaryStats: {
        cases: 7640,
        deaths: 24,
        countriesCount: 11,
        topDisease: "Dengue & Emerging Threats",
      },
    }

    saveReportToStore(newItem)
    setReports((prev) => [newItem, ...prev])
    setIsUploadModalOpen(false)
    setNewTitle("")
    setNewDescription("")
    setUploadedFileName("")
    if (onToast) onToast("Dokumen publikasi baru berhasil ditambahkan!")
  }

  const handleDelete = (id: string, title: string) => {
    if (confirm(`Hapus publikasi "${title}" dari arsip?`)) {
      deleteReportFromStore(id)
      setReports((prev) => prev.filter((r) => r.id !== id))
      if (onToast) onToast("Publikasi berhasil dihapus.")
    }
  }

  return (
    <div className="space-y-6">
      {/* ==========================================
          TOP BREADCRUMB & HEADER CALLOUT
      ========================================== */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <nav className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 mb-1">
              <span>Home</span>
              <span>&gt;</span>
              <span>Data &amp; Publications</span>
              <span>&gt;</span>
              <span className="font-bold text-slate-800">Media Monitoring Report</span>
            </nav>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Media Monitoring Report
            </h2>
            <p className="text-xs font-medium text-slate-500 mt-1">
              Publikasi berkala intelijen penyakit infeksi emerging dan deteksi dini wabah kawasan ASEAN
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => setIsUploadModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs transition cursor-pointer"
            >
              <Upload className="h-4 w-4 text-slate-500" />
              <span>Upload Dokumen Publikasi</span>
            </button>

            <Link
              href="/reports/executive?template=asean_bulletin&mode=create"
              className="inline-flex items-center gap-2 rounded-xl bg-[#0060A9] hover:bg-blue-700 px-4 py-2 text-xs font-black text-white shadow-xs transition cursor-pointer active:scale-95"
            >
              <Sparkles className="h-4 w-4" />
              <span>+ Buat Buletin Baru (AI Draft)</span>
            </Link>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari judul buletin, tanggal, atau nama analis..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-9 pr-4 py-2 text-xs font-semibold placeholder:text-slate-400 focus:bg-white focus:border-blue-400 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Status:</span>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setSelectedStatus("all")}
                className={`rounded px-2.5 py-1 ${selectedStatus === "all" ? "bg-white text-[#0060A9] shadow-2xs font-black" : "text-slate-600"}`}
              >
                Semua ({reports.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatus("published")}
                className={`rounded px-2.5 py-1 ${selectedStatus === "published" ? "bg-white text-emerald-700 shadow-2xs font-black" : "text-slate-600"}`}
              >
                Published
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatus("draft")}
                className={`rounded px-2.5 py-1 ${selectedStatus === "draft" ? "bg-white text-amber-700 shadow-2xs font-black" : "text-slate-600"}`}
              >
                Draft Sistem
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ==========================================
          MAIN TWO-COLUMN LAYOUT (SESUAI GAMBAR SCREENSHOT)
      ========================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-6 items-start">
        {/* ==========================================
            LEFT SIDEBAR (ABVC / ASEAN EOC / WATCH JOURNEY)
        ========================================== */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
            <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400">
              Navigasi Publikasi
            </h4>
            <ul className="space-y-1 text-xs font-bold">
              <li>
                <div className="flex items-center justify-between rounded-lg bg-blue-50/70 px-3 py-2 text-[#0060A9]">
                  <span className="font-black">ABVC Centre</span>
                  <span className="h-2 w-2 rounded-full bg-[#0060A9]" />
                </div>
              </li>
              <li>
                <div className="flex items-center justify-between rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50 transition cursor-pointer">
                  <span>ASEAN EOC Network</span>
                </div>
              </li>
              <li>
                <div className="flex items-center justify-between rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50 transition cursor-pointer">
                  <span>WHO SEARO / WPRO</span>
                </div>
              </li>
            </ul>
          </div>

          {/* Watch ASEAN Journey Box (Persis Gambar Screenshot) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-red-600 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse" />
              Watch ASEAN Journey
            </h4>

            <div className="relative overflow-hidden rounded-xl bg-slate-900 aspect-video group cursor-pointer shadow-inner">
              <div
                className="absolute inset-0 bg-cover bg-center opacity-70 group-hover:scale-105 transition duration-300"
                style={{
                  backgroundImage: "url('/cover-login.webp')",
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-between p-2.5">
                <div className="flex items-center gap-1.5">
                  <div className="h-5 w-5 rounded-full bg-red-600 flex items-center justify-center text-white text-[8px] font-black">
                    ?
                  </div>
                  <span className="text-[10px] font-extrabold text-white">ASEAN Journey - 196</span>
                </div>
                <div className="text-center my-auto">
                  <div className="inline-flex h-9 w-9 rounded-full bg-red-600/90 items-center justify-center text-white shadow-lg group-hover:scale-110 transition">
                    <Play className="h-4 w-4 ml-0.5" />
                  </div>
                </div>
                <p className="text-[9px] text-slate-300 font-medium truncate">asean secretariat briefing</p>
              </div>
            </div>

            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 hover:bg-slate-200 py-2 text-xs font-black text-slate-700 transition"
            >
              <span className="text-red-600">?</span>
              <span>Subscribe ASEAN Portal</span>
            </button>
          </div>

          {/* Stats Summary Widget */}
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-4 shadow-xs text-xs space-y-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              Koleksi Buletin Terbit
            </p>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black text-[#0060A9] font-mono">{reports.length}</span>
              <span className="text-[11px] font-bold text-slate-500">Edisi Siap Akses</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed pt-1 border-t border-slate-200/60">
              Seluruh edisi telah diverifikasi oleh tim analis epidemiologi Kemenkes RI &amp; ABVC.
            </p>
          </div>
        </aside>

        {/* ==========================================
            RIGHT MAIN LIST (PERSIS GAMBAR SCREENSHOT)
        ========================================== */}
        <main className="space-y-4">
          {filteredReports.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-slate-500 space-y-3">
              <FileText className="mx-auto h-12 w-12 text-slate-300" />
              <p className="text-base font-black text-slate-700">Tidak ada dokumen buletin yang sesuai</p>
              <p className="text-xs">Coba ubah kata kunci pencarian atau buat draft laporan baru.</p>
            </div>
          ) : (
            filteredReports.map((item) => (
              <article
                key={item.id}
                className="group relative rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs hover:border-blue-300 hover:shadow-md transition duration-200 flex flex-col sm:flex-row items-start gap-4 sm:gap-5"
              >
                {/* Authentic Book Cover Thumbnail */}
                <Link
                  href={`/reports/executive?template=asean_bulletin&reportId=${item.id}`}
                  className="shrink-0 transition transform group-hover:scale-102"
                >
                  <ReportCoverThumbnail
                    type="asean_bulletin"
                    period={item.period}
                    title={item.title}
                  />
                </Link>

                {/* Content Metadata */}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-black text-[#0060A9] uppercase tracking-wider">
                      {item.category}
                    </span>
                    <span className="text-slate-300">?</span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                        item.status === "published"
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : "bg-amber-50 text-amber-800 border border-amber-200"
                      }`}
                    >
                      {item.status === "published" ? "Published" : "Draft Review"}
                    </span>
                  </div>

                  {/* Title (Clickable) */}
                  <h3 className="text-base sm:text-lg font-black text-slate-900 group-hover:text-[#0060A9] transition leading-snug">
                    <Link href={`/reports/executive?template=asean_bulletin&reportId=${item.id}`}>
                      {item.title}
                    </Link>
                  </h3>

                  {/* Author & Published Date (Persis Gaya Gambar: yusuf - September 14, 2026) */}
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

                  {/* Action Buttons */}
                  <div className="pt-2 flex flex-wrap items-center gap-2">
                    <Link
                      href={`/reports/executive?template=asean_bulletin&reportId=${item.id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-black text-[#0060A9] hover:bg-blue-100 transition"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Buka Buletin Lengkap</span>
                    </Link>

                    <Link
                      href={`/reports/executive?template=asean_bulletin&reportId=${item.id}&edit=true`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition"
                      title="Edit Narasi dan Data Laporan"
                    >
                      <Edit3 className="h-3.5 w-3.5 text-slate-500" />
                      <span>Edit / Analisis Draft</span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => window.open(`/reports/executive?template=asean_bulletin&reportId=${item.id}&print=true`, "_blank")}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition"
                      title="Cetak atau Unduh PDF"
                    >
                      <Download className="h-3.5 w-3.5 text-slate-500" />
                      <span>Download PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(item.id, item.title)}
                      className="ml-auto p-1.5 text-slate-400 hover:text-rose-600 transition"
                      title="Hapus publikasi ini"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </main>
      </div>

      {/* ==========================================
          UPLOAD MODAL DIALOG
      ========================================== */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 font-black text-slate-900 text-base">
                <Upload className="h-5 w-5 text-[#0060A9]" />
                <span>Upload Dokumen Publikasi Buletin</span>
              </div>
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Judul Dokumen Buletin
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Media Monitoring for Infectious and Emerging Diseases in ASEAN Region 15 September 2026"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Nama Analis / Author
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: yusuf / Rijal / vira"
                    value={newAuthor}
                    onChange={(e) => setNewAuthor(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Periode / Tanggal Laporan
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: 15 September 2026"
                    value={newPeriod}
                    onChange={(e) => setNewPeriod(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Ringkasan / Sinopsis Singkat
                </label>
                <textarea
                  rows={2}
                  placeholder="Keterangan singkat mengenai topik penyakit dan wilayah yang dipantau..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Pilih File Dokumen (PDF / DOCX)
                </label>
                <input
                  type="file"
                  accept=".pdf,.docx,.doc"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      setUploadedFileName(file.name)
                      if (!newTitle) {
                        setNewTitle(file.name.replace(/\.[^/.]+$/, ""))
                      }
                    }
                  }}
                  className="w-full rounded-xl border border-slate-200 p-2 text-xs font-semibold"
                />
                {uploadedFileName && (
                  <p className="mt-1 text-[11px] font-bold text-emerald-700">
                    ? File terpilih: {uploadedFileName}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-black text-white hover:bg-blue-700 transition shadow-xs"
                >
                  Simpan &amp; Publikasikan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
