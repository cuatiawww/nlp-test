"use client"

import React, { useState, useEffect, useMemo, useRef } from "react"
import Link from "next/link"
import {
  FileText,
  Upload,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Sparkles,
  Edit3,
  Trash2,
  Download,
  Eye,
  Globe,
  Shield,
  Filter,
  ExternalLink,
  Layers,
  ArrowRight,
  AlertCircle,
  FileUp,
  RotateCcw,
} from "lucide-react"
import { PublishedReportItem, ReportTemplateType } from "@/types/reports"
import {
  getStoredReports,
  saveReportToStore,
  deleteReportFromStore,
} from "@/lib/reports-store"
import { ReportCoverThumbnail } from "@/components/reports/ReportCoverThumbnail"

export default function ConsoleReportsCmsPage() {
  const [reports, setReports] = useState<PublishedReportItem[]>([])
  const [activeTab, setActiveTab] = useState<"catalog" | "upload" | "studio">("catalog")
  const [searchQuery, setSearchQuery] = useState("")
  const [filterType, setFilterType] = useState<"all" | "asean_bulletin" | "kemenkes_sitrep">("all")
  const [filterStatus, setFilterStatus] = useState<"all" | "published" | "draft">("all")
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  // Upload Form State
  const [uploadType, setUploadType] = useState<ReportTemplateType>("asean_bulletin")
  const [uploadTitle, setUploadTitle] = useState("")
  const [uploadPeriod, setUploadPeriod] = useState("")
  const [uploadAuthor, setUploadAuthor] = useState("yusuf")
  const [uploadDesc, setUploadDesc] = useState("")
  const [uploadCases, setUploadCases] = useState<number>(7640)
  const [uploadDeaths, setUploadDeaths] = useState<number>(24)
  const [uploadCountries, setUploadCountries] = useState<number>(11)
  const [uploadTopDisease, setUploadTopDisease] = useState("Dengue Fever")
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setReports(getStoredReports())
  }, [])

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3500)
  }

  const filteredReports = useMemo(() => {
    return reports.filter((item) => {
      const q = searchQuery.toLowerCase()
      const matchSearch =
        item.title.toLowerCase().includes(q) ||
        item.author.toLowerCase().includes(q) ||
        item.period.toLowerCase().includes(q)
      const matchType = filterType === "all" || item.type === filterType
      const matchStatus = filterStatus === "all" || item.status === filterStatus
      return matchSearch && matchType && matchStatus
    })
  }, [reports, searchQuery, filterType, filterStatus])

  const stats = useMemo(() => {
    const total = reports.length
    const asean = reports.filter((r) => r.type === "asean_bulletin").length
    const sitrep = reports.filter((r) => r.type === "kemenkes_sitrep").length
    const published = reports.filter((r) => r.status === "published").length
    const draft = reports.filter((r) => r.status === "draft").length
    return { total, asean, sitrep, published, draft }
  }, [reports])

  const handleDelete = (id: string, title: string) => {
    if (window.confirm(`Hapus publikasi "${title}"? Dokumen ini tidak akan muncul lagi di portal publik.`)) {
      deleteReportFromStore(id)
      setReports((prev) => prev.filter((r) => r.id !== id))
      showToast("Publikasi berhasil dihapus.")
    }
  }

  const handleToggleStatus = (item: PublishedReportItem) => {
    const updatedStatus: "published" | "draft" = item.status === "published" ? "draft" : "published"
    const updated: PublishedReportItem = { ...item, status: updatedStatus }
    saveReportToStore(updated)
    setReports((prev) => prev.map((r) => (r.id === item.id ? updated : r)))
    showToast(`Status diubah menjadi: ${updatedStatus === "published" ? "Published (Aktif di User)" : "Draft (Disembunyikan dari User)"}`)
  }

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!uploadTitle.trim()) {
      alert("Mohon isi judul dokumen publikasi.")
      return
    }

    const newItem: PublishedReportItem = {
      id: uploadType === "asean_bulletin" ? `mm-${Date.now()}` : `sitrep-${Date.now()}`,
      category:
        uploadType === "asean_bulletin"
          ? "Data & Publications Media Monitoring Report"
          : "Laporan Situasi Resmi ABVC",
      title: uploadTitle.trim(),
      period: uploadPeriod.trim() || "September 2026",
      author: uploadAuthor.trim() || (uploadType === "asean_bulletin" ? "yusuf" : "PHEOC ABVC"),
      publishedAt: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      type: uploadType,
      status: "published",
      description: uploadDesc.trim() || "Publikasi intelijen epidemiologi resmi surveilans penyakit infeksi berkala kawasan.",
      summaryStats: {
        cases: uploadCases,
        deaths: uploadDeaths,
        countriesCount: uploadCountries,
        topDisease: uploadTopDisease,
      },
    }

    saveReportToStore(newItem)
    setReports((prev) => [newItem, ...prev])
    setActiveTab("catalog")
    setUploadTitle("")
    setUploadPeriod("")
    setUploadDesc("")
    setUploadedFile(null)
    showToast("Dokumen publikasi baru berhasil diterbitkan ke Portal Publik (/reports)!")
  }

  return (
    <div className="min-h-screen bg-slate-50/70 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-5 right-5 z-50 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs font-black text-emerald-900 shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#0060A9] mb-1">
            <Shield className="h-4 w-4" />
            <span>Console System Management</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Publication CMS &amp; Surveillance Report Studio
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Kelola publikasi buletin surveilans ASEAN &amp; SitRep ABVC, unggah dokumen eksternal, dan sesuaikan draft laporan sebelum tampil ke pengguna umum.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/reports"
            target="_blank"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 shadow-2xs transition cursor-pointer"
          >
            <Eye className="h-4 w-4 text-[#0060A9]" />
            <span>Lihat Tampilan Portal Publik</span>
            <ExternalLink className="h-3 w-3 text-slate-400" />
          </Link>

          <Link
            href="/reports/executive?mode=create"
            className="inline-flex items-center gap-2 rounded-xl bg-[#0060A9] hover:bg-blue-700 px-4 py-2.5 text-xs font-black text-white shadow-xs transition cursor-pointer"
          >
            <Sparkles className="h-4 w-4 text-amber-300" />
            <span>+ Buat Draft Laporan Baru (AI Studio)</span>
          </Link>
        </div>
      </div>

      {/* Top Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1">
          <p className="text-[11px] font-black uppercase text-slate-500">Total Publikasi</p>
          <p className="text-2xl font-black text-slate-900 font-mono">{stats.total}</p>
          <p className="text-[10px] font-semibold text-slate-400">Semua edisi di database</p>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 shadow-2xs space-y-1">
          <p className="text-[11px] font-black uppercase text-[#0060A9]">Buletin ASEAN</p>
          <p className="text-2xl font-black text-[#0060A9] font-mono">{stats.asean}</p>
          <p className="text-[10px] font-semibold text-blue-600/80">Media Monitoring Kawasan</p>
        </div>

        <div className="rounded-2xl border border-teal-100 bg-teal-50/50 p-4 shadow-2xs space-y-1">
          <p className="text-[11px] font-black uppercase text-teal-800">SitRep ABVC</p>
          <p className="text-2xl font-black text-teal-800 font-mono">{stats.sitrep}</p>
          <p className="text-[10px] font-semibold text-teal-600/80">Laporan Situasi Resmi</p>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 shadow-2xs space-y-1">
          <p className="text-[11px] font-black uppercase text-emerald-800">Status Published</p>
          <p className="text-2xl font-black text-emerald-800 font-mono">{stats.published}</p>
          <p className="text-[10px] font-semibold text-emerald-600/80">Aktif tampil di User</p>
        </div>
      </div>

      {/* Navigation Tabs for CMS */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("catalog")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition cursor-pointer ${
            activeTab === "catalog"
              ? "bg-[#0060A9] text-white shadow-xs"
              : "text-slate-600 hover:bg-white"
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>Katalog &amp; Manajemen Publikasi ({reports.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("upload")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition cursor-pointer ${
            activeTab === "upload"
              ? "bg-[#0060A9] text-white shadow-xs"
              : "text-slate-600 hover:bg-white"
          }`}
        >
          <FileUp className="h-4 w-4" />
          <span>Upload Dokumen Publikasi (PDF/Doc)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("studio")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition cursor-pointer ${
            activeTab === "studio"
              ? "bg-[#0060A9] text-white shadow-xs"
              : "text-slate-600 hover:bg-white"
          }`}
        >
          <Sparkles className="h-4 w-4 text-amber-400" />
          <span>AI Surveillance Studio Generator</span>
        </button>
      </div>

      {/* ====================================================
          TAB 1: KATALOG & MANAJEMEN PUBLIKASI
      ==================================================== */}
      {activeTab === "catalog" && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Cari judul, analis, periode laporan..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-9 pr-4 py-2 text-xs font-semibold focus:bg-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="font-bold text-slate-500">Tipe:</span>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 font-bold text-slate-700 text-xs focus:outline-none"
              >
                <option value="all">Semua Tipe</option>
                <option value="asean_bulletin">Buletin ASEAN</option>
                <option value="kemenkes_sitrep">SitRep ABVC</option>
              </select>

              <span className="font-bold text-slate-500 ml-2">Status:</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 font-bold text-slate-700 text-xs focus:outline-none"
              >
                <option value="all">Semua Status</option>
                <option value="published">Published (Tampil di Publik)</option>
                <option value="draft">Draft (Disembunyikan)</option>
              </select>
            </div>
          </div>

          {/* Table of Publications */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700">
                  <tr>
                    <th className="py-3.5 px-4 font-black w-24">Cover</th>
                    <th className="py-3.5 px-4 font-black">Judul Publikasi &amp; Kategori</th>
                    <th className="py-3.5 px-4 font-black">Analis / Penelaah</th>
                    <th className="py-3.5 px-4 font-black">Periode Terbit</th>
                    <th className="py-3.5 px-4 font-black text-center">Status Portal</th>
                    <th className="py-3.5 px-4 font-black text-right">Aksi CMS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredReports.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 font-bold">
                        Tidak ada dokumen publikasi yang sesuai filter pencarian.
                      </td>
                    </tr>
                  ) : (
                    filteredReports.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-4">
                          <ReportCoverThumbnail
                            type={item.type}
                            period={item.period}
                            title={item.title}
                            className="w-16 h-22"
                          />
                        </td>
                        <td className="py-3 px-4 min-w-[280px]">
                          <span
                            className={`inline-block text-[10px] font-black uppercase tracking-wider mb-1 px-2 py-0.5 rounded ${
                              item.type === "asean_bulletin"
                                ? "bg-blue-50 text-[#0060A9]"
                                : "bg-teal-50 text-teal-800"
                            }`}
                          >
                            {item.type === "asean_bulletin"
                              ? "Buletin ASEAN"
                              : "SitRep ABVC"}
                          </span>
                          <p className="font-extrabold text-slate-900 leading-snug hover:text-[#0060A9]">
                            {item.title}
                          </p>
                          <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                            {item.description}
                          </p>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-700 whitespace-nowrap">
                          {item.author}
                        </td>
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          <p className="font-bold text-slate-800">{item.period}</p>
                          <p className="text-[10px] text-slate-400">Terbit: {item.publishedAt}</p>
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(item)}
                            title="Klik untuk ganti status tampil"
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase transition cursor-pointer ${
                              item.status === "published"
                                ? "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                                : "bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100"
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                item.status === "published" ? "bg-emerald-600" : "bg-amber-500"
                              }`}
                            />
                            <span>{item.status === "published" ? "Published" : "Draft"}</span>
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <Link
                              href={`/reports/executive?template=${item.type}&reportId=${item.id}&edit=true`}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition"
                              title="Edit Dokumen &amp; Latar Belakang"
                            >
                              <Edit3 className="h-3.5 w-3.5 text-slate-500" />
                              <span>Edit</span>
                            </Link>

                            <button
                              type="button"
                              onClick={() =>
                                window.open(
                                  `/reports/executive?template=${item.type}&reportId=${item.id}&print=true`,
                                  "_blank"
                                )
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition"
                              title="Cetak / Download PDF"
                            >
                              <Download className="h-3.5 w-3.5 text-slate-500" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDelete(item.id, item.title)}
                              className="rounded-lg border border-rose-200 bg-rose-50/50 hover:bg-rose-100 p-1.5 text-rose-700 transition cursor-pointer"
                              title="Hapus Publikasi"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================
          TAB 2: UPLOAD DOKUMEN PUBLIKASI EKSTERNAL (PDF/DOC)
      ==================================================== */}
      {activeTab === "upload" && (
        <div className="max-w-3xl mx-auto rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase text-[#0060A9] mb-1">
              <FileUp className="h-4 w-4" />
              <span>Formulir Unggah Dokumen Resmi</span>
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Upload &amp; Terbitkan Dokumen Publikasi
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Unggah laporan surveilans berkala yang telah difinalisasi dalam format PDF atau Word untuk langsung diterbitkan ke arsip publik tanpa tercampur tombol edit.
            </p>
          </div>

          <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs">
            {/* Tipe Dokumen */}
            <div>
              <label className="block font-black uppercase text-slate-700 mb-1.5">
                Pilih Tipe Publikasi
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setUploadType("asean_bulletin")
                    setUploadAuthor("yusuf")
                    setUploadTopDisease("Dengue Fever")
                  }}
                  className={`rounded-xl border p-3.5 text-left transition cursor-pointer ${
                    uploadType === "asean_bulletin"
                      ? "border-[#0060A9] bg-blue-50/60 ring-2 ring-blue-500/20"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-2 text-slate-900 font-black">
                    <Globe className="h-4 w-4 text-[#0060A9]" />
                    <span>Buletin Media Monitoring ASEAN</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Publikasi berkala intelijen penyakit menular regional (Image 2 style)
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setUploadType("kemenkes_sitrep")
                    setUploadAuthor("PHEOC ABVC")
                    setUploadTopDisease("Dengue / DBD")
                  }}
                  className={`rounded-xl border p-3.5 text-left transition cursor-pointer ${
                    uploadType === "kemenkes_sitrep"
                      ? "border-teal-600 bg-teal-50/60 ring-2 ring-teal-500/20"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-2 text-slate-900 font-black">
                    <Shield className="h-4 w-4 text-teal-700" />
                    <span>Laporan Situasi Resmi (SitRep ABVC)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Format pengawasan terpadu mingguan Pusat Operasi EOC ABVC
                  </p>
                </button>
              </div>
            </div>

            {/* Judul */}
            <div>
              <label className="block font-black uppercase text-slate-700 mb-1">
                Judul Dokumen Laporan <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="Contoh: Media Monitoring for Infectious and Emerging Diseases in ASEAN Region 15 September 2026"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-black uppercase text-slate-700 mb-1">
                  Nama Analis / Penelaah
                </label>
                <input
                  type="text"
                  required
                  value={uploadAuthor}
                  onChange={(e) => setUploadAuthor(e.target.value)}
                  placeholder="yusuf / Rijal / vira / PHEOC ABVC"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-black uppercase text-slate-700 mb-1">
                  Periode / Epidemiological Week
                </label>
                <input
                  type="text"
                  required
                  value={uploadPeriod}
                  onChange={(e) => setUploadPeriod(e.target.value)}
                  placeholder="Contoh: Minggu ke-38 (15 Sep 2026)"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* File Upload Box */}
            <div>
              <label className="block font-black uppercase text-slate-700 mb-1">
                Berkas Dokumen Publikasi (PDF atau Word)
              </label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="rounded-2xl border-2 border-dashed border-slate-300 hover:border-blue-400 bg-slate-50/50 p-6 text-center cursor-pointer transition"
              >
                <FileUp className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                <p className="font-bold text-slate-700">
                  {uploadedFile ? uploadedFile.name : "Klik untuk memilih berkas PDF atau seret ke sini"}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Format yang didukung: .pdf, .docx, .doc (Maks. 50 MB)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setUploadedFile(e.target.files[0])
                    }
                  }}
                />
              </div>
            </div>

            {/* Ringkasan */}
            <div>
              <label className="block font-black uppercase text-slate-700 mb-1">
                Ringkasan Eksekutif Dokumen
              </label>
              <textarea
                rows={3}
                value={uploadDesc}
                onChange={(e) => setUploadDesc(e.target.value)}
                placeholder="Tulis ringkasan singkat hasil surveilans atau poin penting dokumen ini..."
                className="w-full rounded-xl border border-slate-200 p-3 text-xs leading-relaxed focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Key Metrics Snapshot */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2.5">
              <span className="block text-[11px] font-black uppercase text-slate-700">
                Indikator Surveilans (Metadata Snapshot)
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <span className="text-[10px] font-bold text-slate-500">Total Kasus</span>
                  <input
                    type="number"
                    value={uploadCases}
                    onChange={(e) => setUploadCases(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs font-bold"
                  />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500">Kematian</span>
                  <input
                    type="number"
                    value={uploadDeaths}
                    onChange={(e) => setUploadDeaths(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs font-bold"
                  />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500">Wilayah Terpantau</span>
                  <input
                    type="number"
                    value={uploadCountries}
                    onChange={(e) => setUploadCountries(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs font-bold"
                  />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500">Top Penyakit</span>
                  <input
                    type="text"
                    value={uploadTopDisease}
                    onChange={(e) => setUploadTopDisease(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setActiveTab("catalog")}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
              >
                Batal
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-xs font-black text-white shadow-xs transition cursor-pointer"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Simpan &amp; Publikasikan ke Portal User</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ====================================================
          TAB 3: AI SURVEILLANCE STUDIO GENERATOR
      ==================================================== */}
      {activeTab === "studio" && (
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 via-indigo-50/40 to-white p-6 shadow-xs flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#0060A9] text-white shadow-sm">
              <Sparkles className="h-6 w-6 text-amber-300" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-black text-slate-900">
                Generator Draft Otomatis Sistem (AI Surveillance)
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Sistem secara otomatis merangkum sinyal wabah, klaster terdeteksi, dan tren epidemiologi regional ASEAN dari pipeline NLP secara real-time. Anda dapat meluncurkan studio untuk menganalisis narasi, menyesuaikan angka, memilih tema latar belakang, lalu mempublikasikan ke arsip.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Card 1: Buletin ASEAN */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4 hover:border-blue-300 transition flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-black text-[#0060A9]">
                    <Globe className="h-3 w-3" />
                    Format ASEAN Bulletin
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">Regional Multi-Country</span>
                </div>
                <h4 className="text-base font-black text-slate-900">
                  Media Monitoring for Infectious and Emerging Diseases (ASEAN)
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Sesuai format buletin media monitoring per penyakit (Dengue, HFMD, Mpox), dilengkapi pemetaan spasial WGS84 seluruh 11 negara ASEAN dan matriks epi-week.
                </p>
              </div>

              <Link
                href="/reports/executive?template=asean_bulletin&mode=create"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0060A9] hover:bg-blue-700 py-2.5 text-xs font-black text-white shadow-xs transition"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                <span>Buka Studio Buletin ASEAN &rarr;</span>
              </Link>
            </div>

            {/* Card 2: SitRep ABVC */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4 hover:border-teal-300 transition flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-black text-teal-800">
                    <Shield className="h-3 w-3" />
                    Format SitRep ABVC
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">Pusat Operasi EOC</span>
                </div>
                <h4 className="text-base font-black text-slate-900">
                  Laporan Situasi Resmi Pengawasan Surveilans (SitRep ABVC)
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Laporan pengawasan resmi mingguan kewaspadaan dini outbreak terpadu ABVC, dilengkapi kurva tren transmisi, donut beban penyakit, dan rekomendasi respon taktis.
                </p>
              </div>

              <Link
                href="/reports/executive?template=kemenkes_sitrep&mode=create"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 hover:bg-teal-800 py-2.5 text-xs font-black text-white shadow-xs transition"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                <span>Buka Studio SitRep ABVC &rarr;</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
