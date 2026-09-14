"use client"

import React, { useState, useMemo } from "react"
import Link from "next/link"
import {
  Shield,
  FileText,
  Download,
  Plus,
  Search,
  Calendar,
  User,
  Upload,
  CheckCircle2,
  Clock,
  Sparkles,
  Edit3,
  Trash2,
  Eye,
  X,
  Activity,
  AlertTriangle,
} from "lucide-react"
import { PublishedReportItem } from "@/types/reports"
import { getStoredReports, saveReportToStore, deleteReportFromStore } from "@/lib/reports-store"
import { ReportCoverThumbnail } from "./ReportCoverThumbnail"

interface SituationReportArchiveProps {
  onToast?: (msg: string) => void
}

export const SituationReportArchive: React.FC<SituationReportArchiveProps> = ({ onToast }) => {
  const [reports, setReports] = useState<PublishedReportItem[]>(() => {
    return getStoredReports().filter((r) => r.type === "kemenkes_sitrep")
  })
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedStatus, setSelectedStatus] = useState<"all" | "published" | "draft">("all")
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)

  // Upload Form State
  const [newTitle, setNewTitle] = useState("")
  const [newPeriod, setNewPeriod] = useState("Minggu ke-38 (14 Sep 2026)")
  const [newAuthor, setNewAuthor] = useState("PHEOC Kemenkes RI")
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
      alert("Mohon masukkan judul laporan situasi.")
      return
    }

    const newItem: PublishedReportItem = {
      id: `sitrep-${Date.now()}`,
      category: "Laporan Situasi Resmi Kemenkes RI",
      title: newTitle.trim(),
      period: newPeriod.trim(),
      author: newAuthor.trim() || "PHEOC Kemenkes RI",
      publishedAt: new Date().toLocaleDateString("id-ID", { dateStyle: "long" }),
      type: "kemenkes_sitrep",
      status: "published",
      description: newDescription.trim() || "Laporan pengawasan surveilans mingguan terpadu PHEOC Kemenkes RI.",
      pdfUrl: uploadedFileName ? `/sample_template/${uploadedFileName}` : undefined,
      summaryStats: {
        cases: 7640,
        deaths: 24,
        countriesCount: 38,
        topDisease: "Dengue / DBD",
      },
    }

    saveReportToStore(newItem)
    setReports((prev) => [newItem, ...prev])
    setIsUploadModalOpen(false)
    setNewTitle("")
    setNewDescription("")
    setUploadedFileName("")
    if (onToast) onToast("Laporan Situasi baru berhasil dipublikasikan!")
  }

  const handleDelete = (id: string, title: string) => {
    if (confirm(`Hapus laporan situasi "${title}" dari arsip?`)) {
      deleteReportFromStore(id)
      setReports((prev) => prev.filter((r) => r.id !== id))
      if (onToast) onToast("Laporan situasi berhasil dihapus.")
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50/70 via-white to-slate-50 p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md bg-teal-100 px-2.5 py-0.5 text-xs font-black text-teal-800 border border-teal-200 mb-2">
              <Shield className="h-3.5 w-3.5" />
              <span>PHEOC KEMENKES RI ? 24 JAM</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Laporan Situasi Resmi (Situation Report / SitRep)
            </h2>
            <p className="text-xs font-medium text-slate-500 mt-1">
              Dokumen pengawasan mingguan dan bulanan kewaspadaan dini outbreak penyakit infeksi menular Kemenkes RI
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => setIsUploadModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs transition cursor-pointer"
            >
              <Upload className="h-4 w-4 text-slate-500" />
              <span>Upload Dokumen SitRep</span>
            </button>

            <Link
              href="/reports/executive?template=kemenkes_sitrep&mode=create"
              className="inline-flex items-center gap-2 rounded-xl bg-teal-700 hover:bg-teal-800 px-4 py-2 text-xs font-black text-white shadow-xs transition cursor-pointer active:scale-95"
            >
              <Sparkles className="h-4 w-4" />
              <span>+ Buat SitRep Baru (AI Draft)</span>
            </Link>
          </div>
        </div>

        {/* Filter Bar */}
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

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Status:</span>
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setSelectedStatus("all")}
                className={`rounded px-2.5 py-1 ${selectedStatus === "all" ? "bg-teal-50 text-teal-800 shadow-2xs font-black" : "text-slate-600"}`}
              >
                Semua ({reports.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatus("published")}
                className={`rounded px-2.5 py-1 ${selectedStatus === "published" ? "bg-teal-50 text-teal-800 shadow-2xs font-black" : "text-slate-600"}`}
              >
                Published
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatus("draft")}
                className={`rounded px-2.5 py-1 ${selectedStatus === "draft" ? "bg-amber-50 text-amber-800 shadow-2xs font-black" : "text-slate-600"}`}
              >
                Draft Review
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main SitRep List */}
      <div className="grid grid-cols-1 gap-4">
        {filteredReports.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-slate-500 space-y-3">
            <Shield className="mx-auto h-12 w-12 text-slate-300" />
            <p className="text-base font-black text-slate-700">Belum ada dokumen SitRep yang sesuai</p>
            <p className="text-xs">Coba buat draft baru atau sesuaikan filter pencarian.</p>
          </div>
        ) : (
          filteredReports.map((item) => (
            <article
              key={item.id}
              className="group relative rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-teal-300 hover:shadow-md transition duration-200 flex flex-col sm:flex-row items-start gap-5"
            >
              <Link
                href={`/reports/executive?template=kemenkes_sitrep&reportId=${item.id}`}
                className="shrink-0 transition transform group-hover:scale-102"
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
                  <span className="text-slate-300">?</span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                      item.status === "published"
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        : "bg-amber-50 text-amber-800 border border-amber-200"
                    }`}
                  >
                    {item.status === "published" ? "Resmi Kemenkes" : "Draft AI"}
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

                <div className="pt-2 flex flex-wrap items-center gap-2">
                  <Link
                    href={`/reports/executive?template=kemenkes_sitrep&reportId=${item.id}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-teal-50 px-3.5 py-1.5 text-xs font-black text-teal-800 hover:bg-teal-100 transition"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>Buka SitRep Resmi</span>
                  </Link>

                  <Link
                    href={`/reports/executive?template=kemenkes_sitrep&reportId=${item.id}&edit=true`}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition"
                  >
                    <Edit3 className="h-3.5 w-3.5 text-slate-500" />
                    <span>Edit / Analisis Draft</span>
                  </Link>

                  <button
                    type="button"
                    onClick={() => window.open(`/reports/executive?template=kemenkes_sitrep&reportId=${item.id}&print=true`, "_blank")}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition"
                  >
                    <Download className="h-3.5 w-3.5 text-slate-500" />
                    <span>Download PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(item.id, item.title)}
                    className="ml-auto p-1.5 text-slate-400 hover:text-rose-600 transition"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 font-black text-slate-900 text-base">
                <Upload className="h-5 w-5 text-teal-700" />
                <span>Upload Dokumen Laporan Situasi (SitRep)</span>
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
                  Judul Dokumen SitRep
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Laporan Pengawasan Surveilans Penyakit Infeksi & Outbreak Kemenkes RI ? Minggu ke-38"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Nama Tim / Unit Analis
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: PHEOC Kemenkes RI"
                    value={newAuthor}
                    onChange={(e) => setNewAuthor(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:border-teal-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Periode Minggu Epidemiologi
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Minggu ke-38 (14 Sep 2026)"
                    value={newPeriod}
                    onChange={(e) => setNewPeriod(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Ringkasan / Sinopsis Eksekutif
                </label>
                <textarea
                  rows={2}
                  placeholder="Keterangan singkat rekapitulasi kasus nasional..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Pilih File Dokumen (PDF)
                </label>
                <input
                  type="file"
                  accept=".pdf"
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
                  className="rounded-xl bg-teal-700 px-4 py-2 text-xs font-black text-white hover:bg-teal-800 transition shadow-xs"
                >
                  Simpan &amp; Publikasikan SitRep
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
