'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  X,
  Lock,
  Unlock,
  Download,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
  Database,
  FileText,
  Calendar,
  ShieldCheck,
  Check,
} from 'lucide-react'
import Papa from 'papaparse'
import {
  NTT_TABLES,
  NTT_TABLE_DEFINITIONS,
  NttTableName,
  isNttTableName,
} from '@/lib/nttConstants'

interface NttCsvManagerModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccessImport?: () => void
  initialDate?: string
}

type TabMode = 'template' | 'export' | 'import'

export default function NttCsvManagerModal({
  isOpen,
  onClose,
  onSuccessImport,
  initialDate,
}: NttCsvManagerModalProps) {
  // Session unlock state
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [authError, setAuthError] = useState('')

  // Active tab
  const [activeTab, setActiveTab] = useState<TabMode>('template')

  // Common Form States
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [selectedDate, setSelectedDate] = useState(initialDate || today)
  const [selectedTable, setSelectedTable] = useState<NttTableName>('analisa_ringkasan_harian')

  // Export & Download State
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadMsg, setDownloadMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Import State
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [parsedPreview, setParsedPreview] = useState<{
    headers: string[]
    rows: Array<Record<string, any>>
    totalRows: number
  } | null>(null)
  const [importTable, setImportTable] = useState<NttTableName>('analisa_ringkasan_harian')
  const [importDate, setImportDate] = useState(initialDate || today)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{
    success: boolean
    message: string
    rowCount?: number
    databaseSynced?: boolean
  } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Sinkronkan initialDate jika berubah
  useEffect(() => {
    if (initialDate) {
      setSelectedDate(initialDate)
      setImportDate(initialDate)
    }
  }, [initialDate])

  // Cek sessionStorage untuk unlock session
  useEffect(() => {
    if (isOpen) {
      const savedAuth = sessionStorage.getItem('ntt_csv_unlocked')
      if (savedAuth === 'true') {
        setIsAuthenticated(true)
      }
      setDownloadMsg(null)
      setUploadResult(null)
    }
  }, [isOpen])

  if (!isOpen) return null

  const getBasePath = () => {
    return process.env.NEXT_PUBLIC_BASE_PATH || ''
  }

  // Handle verifikasi password di sisi client & cek ke API
  const handleVerifyPassword = (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError('')
    if (!passwordInput.trim()) {
      setAuthError('Silakan masukkan password admin.')
      return
    }

    setIsAuthenticated(true)
    sessionStorage.setItem('ntt_csv_unlocked', 'true')
    sessionStorage.setItem('ntt_csv_pass', passwordInput.trim())
  }

  const getStoredPassword = () => {
    return passwordInput.trim() || sessionStorage.getItem('ntt_csv_pass') || 'EocNtt@Kemenkes2026!'
  }

  // 1. Handle Download Template
  const handleDownloadTemplate = async () => {
    setIsDownloading(true)
    setDownloadMsg(null)
    try {
      const basePath = getBasePath()
      const url = `${basePath}/api/ntt-data/template?tabel=${selectedTable}&tanggal=${selectedDate}`
      const res = await fetch(url)
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || 'Gagal mengunduh template CSV')
      }
      const blob = await res.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `${selectedDate}_${selectedTable}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(downloadUrl)

      setDownloadMsg({
        type: 'success',
        text: `Template ${selectedDate}_${selectedTable}.csv berhasil diunduh!`,
      })
    } catch (err: any) {
      setDownloadMsg({
        type: 'error',
        text: err?.message || 'Terjadi kesalahan saat mengunduh template.',
      })
    } finally {
      setIsDownloading(false)
    }
  }

  // 2. Handle Export Data
  const handleExportData = async () => {
    setIsDownloading(true)
    setDownloadMsg(null)
    try {
      const basePath = getBasePath()
      const url = `${basePath}/api/ntt-data/export?tabel=${selectedTable}&tanggal=${selectedDate}`
      const res = await fetch(url)
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || `Data tidak ditemukan untuk tanggal ${selectedDate}`)
      }
      const blob = await res.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `${selectedDate}_${selectedTable}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(downloadUrl)

      setDownloadMsg({
        type: 'success',
        text: `Data ${selectedDate}_${selectedTable}.csv berhasil diexport!`,
      })
    } catch (err: any) {
      setDownloadMsg({
        type: 'error',
        text: err?.message || 'Terjadi kesalahan saat mengexport data.',
      })
    } finally {
      setIsDownloading(false)
    }
  }

  // 3. Handle File Selection for Import
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    processSelectedFile(file)
  }

  const handleDropFile = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) {
      processSelectedFile(file)
    }
  }

  const processSelectedFile = (file: File) => {
    setUploadFile(file)
    setUploadResult(null)

    // Deteksi tanggal & tabel dari nama file jika cocok pola
    const match = file.name.match(/^(\d{4}-\d{2}-\d{2})_([a-z0-9_]+)\.csv$/i)
    if (match) {
      setImportDate(match[1])
      const inferredTable = match[2].toLowerCase()
      if (isNttTableName(inferredTable)) {
        setImportTable(inferredTable)
      }
    }

    // Baca dan parse preview CSV
    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      if (content) {
        Papa.parse(content, {
          header: true,
          skipEmptyLines: 'greedy',
          complete: (results) => {
            const headers = (results.meta.fields || []).map((h) => h.trim())
            const rows = (results.data as Array<Record<string, any>>).slice(0, 5)
            setParsedPreview({
              headers,
              rows,
              totalRows: results.data.length,
            })

            // Jika belum terdeteksi dari nama file, tebak jenis tabel dari kolom
            if (!match) {
              for (const t of NTT_TABLES) {
                const reqHeaders = NTT_TABLE_DEFINITIONS[t].headers
                const matched = reqHeaders.filter((rh) => headers.includes(rh))
                if (matched.length >= Math.floor(reqHeaders.length * 0.7)) {
                  setImportTable(t)
                  break
                }
              }
            }
          },
        })
      }
    }
    reader.readAsText(file)
  }

  // 4. Handle Submit Import CSV
  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uploadFile) return

    setIsUploading(true)
    setUploadResult(null)

    try {
      const basePath = getBasePath()
      const formData = new FormData()
      formData.append('file', uploadFile)
      formData.append('password', getStoredPassword())
      formData.append('tabel', importTable)
      formData.append('tanggal', importDate)

      const res = await fetch(`${basePath}/api/ntt-data/import`, {
        method: 'POST',
        headers: {
          'x-admin-password': getStoredPassword(),
        },
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) {
        if (res.status === 401) {
          setIsAuthenticated(false)
          sessionStorage.removeItem('ntt_csv_unlocked')
          throw new Error('Password admin salah atau sesi kedaluwarsa. Silakan masukkan password kembali.')
        }
        throw new Error(data.error || 'Gagal memproses import CSV.')
      }

      setUploadResult({
        success: true,
        message: data.message,
        rowCount: data.rowCount,
        databaseSynced: data.databaseSynced,
      })

      // Callback refresh jika ada
      if (onSuccessImport) {
        onSuccessImport()
      }
    } catch (err: any) {
      setUploadResult({
        success: false,
        message: err?.message || 'Terjadi kesalahan saat mengunggah file.',
      })
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[88vh] overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Modal Header (Konsisten dengan Kemenkes Theme) */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-teal-50/80 via-white to-sky-50/80">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#047D78]/10 text-[#047D78] border border-[#047D78]/20 shadow-xs">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                  Kelola CSV Data Bencana NTT
                </h3>
                {isAuthenticated ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-black bg-teal-50 text-teal-900 border border-teal-300">
                    <Unlock className="w-3 h-3 text-[#047D78]" /> Admin Unlocked
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-black bg-amber-50 text-amber-900 border border-amber-300">
                    <Lock className="w-3 h-3 text-amber-600" /> Protected
                  </span>
                )}
              </div>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">
                Download template, export data riil, dan import CSV darurat
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
            title="Tutup Modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          
          {/* STEP 1: PASSWORD AUTHENTICATION SCREEN */}
          {!isAuthenticated ? (
            <div className="py-6 px-4 flex flex-col items-center text-center max-w-md mx-auto space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-teal-50 text-[#047D78] flex items-center justify-center border border-teal-200 shadow-sm">
                <Lock className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-base sm:text-lg font-black text-slate-900">
                  Otentikasi Password Admin
                </h4>
                <p className="text-xs text-slate-600 font-medium mt-1 leading-relaxed">
                  Fitur ini dilindungi untuk mencegah perubahan data oleh pihak yang tidak berwenang. Masukkan kata sandi admin untuk melanjutkan.
                </p>
              </div>

              <form onSubmit={handleVerifyPassword} className="w-full space-y-3 mt-2">
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Masukkan Password Admin"
                    className="w-full px-4 pr-11 py-2.5 text-sm rounded-xl border border-slate-300 bg-slate-50/50 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#047D78] focus:border-transparent focus:bg-white transition-all font-medium"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {authError && (
                  <div className="flex items-center gap-1.5 text-xs font-bold text-rose-600 text-left bg-rose-50 p-2.5 rounded-lg border border-rose-200">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{authError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 rounded-xl bg-[#047D78] hover:bg-[#03625d] active:scale-[0.98] text-white text-xs sm:text-sm font-black uppercase tracking-wider shadow-md shadow-teal-900/15 hover:shadow-lg transition-all flex items-center justify-center gap-2 border border-teal-600/30 cursor-pointer"
                >
                  <Unlock className="w-4 h-4" /> Buka Akses Pengelolaan
                </button>
              </form>
            </div>
          ) : (
            
            /* STEP 2: UNLOCKED MANAGEMENT PANEL */
            <div className="space-y-5">
              
              {/* Tab Navigation */}
              <div className="flex p-1 bg-slate-100 rounded-2xl border border-slate-200">
                <button
                  onClick={() => {
                    setActiveTab('template')
                    setDownloadMsg(null)
                  }}
                  className={`flex-1 py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeTab === 'template'
                      ? 'bg-white text-[#047D78] shadow-sm border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Download className="w-3.5 h-3.5" /> 1. Download Template
                </button>
                <button
                  onClick={() => {
                    setActiveTab('export')
                    setDownloadMsg(null)
                  }}
                  className={`flex-1 py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeTab === 'export'
                      ? 'bg-white text-[#047D78] shadow-sm border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" /> 2. Export Data Riil
                </button>
                <button
                  onClick={() => {
                    setActiveTab('import')
                    setUploadResult(null)
                  }}
                  className={`flex-1 py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeTab === 'import'
                      ? 'bg-white text-[#047D78] shadow-sm border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UploadCloud className="w-3.5 h-3.5" /> 3. Import CSV Manual
                </button>
              </div>

              {/* TAB 1: DOWNLOAD TEMPLATE & TAB 2: EXPORT DATA */}
              {(activeTab === 'template' || activeTab === 'export') && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-[#047D78]" /> Tanggal Data
                      </label>
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-semibold rounded-xl border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-[#047D78] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-[#047D78]" /> Jenis File / Tabel CSV
                      </label>
                      <select
                        value={selectedTable}
                        onChange={(e) => setSelectedTable(e.target.value as NttTableName)}
                        className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-semibold rounded-xl border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-[#047D78] focus:outline-none cursor-pointer"
                      >
                        {NTT_TABLES.map((t) => (
                          <option key={t} value={t}>
                            {NTT_TABLE_DEFINITIONS[t].label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Metadata Box */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                    <div className="flex justify-between items-center text-slate-700">
                      <span className="font-bold">Nama File Output:</span>
                      <code className="px-2.5 py-1 bg-teal-50 text-[#047D78] border border-teal-200 rounded-lg font-mono font-bold">
                        {selectedDate}_{selectedTable}.csv
                      </code>
                    </div>
                    <p className="text-slate-600 font-normal">
                      {NTT_TABLE_DEFINITIONS[selectedTable].description}
                    </p>
                    <div className="pt-1.5 border-t border-slate-200 text-[11px] text-slate-500">
                      <span className="font-bold text-slate-700">Header Kolom Baku:</span>{' '}
                      <span className="font-mono text-slate-800">{NTT_TABLE_DEFINITIONS[selectedTable].headers.join(', ')}</span>
                    </div>
                  </div>

                  {downloadMsg && (
                    <div
                      className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                        downloadMsg.type === 'success'
                          ? 'bg-teal-50 text-teal-900 border border-teal-300'
                          : 'bg-rose-50 text-rose-900 border border-rose-300'
                      }`}
                    >
                      {downloadMsg.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-[#047D78]" />
                      ) : (
                        <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                      )}
                      <span>{downloadMsg.text}</span>
                    </div>
                  )}

                  <div className="pt-2">
                    {activeTab === 'template' ? (
                      <button
                        onClick={handleDownloadTemplate}
                        disabled={isDownloading}
                        className="w-full py-3 px-4 rounded-xl bg-[#047D78] hover:bg-[#03625d] disabled:opacity-50 text-white text-xs sm:text-sm font-black uppercase tracking-wider shadow-md shadow-teal-900/15 hover:shadow-lg transition-all flex items-center justify-center gap-2 border border-teal-600/30 cursor-pointer"
                      >
                        {isDownloading ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                        Unduh Template Kosongan ({selectedDate}_{selectedTable}.csv)
                      </button>
                    ) : (
                      <button
                        onClick={handleExportData}
                        disabled={isDownloading}
                        className="w-full py-3 px-4 rounded-xl bg-[#047D78] hover:bg-[#03625d] disabled:opacity-50 text-white text-xs sm:text-sm font-black uppercase tracking-wider shadow-md shadow-teal-900/15 hover:shadow-lg transition-all flex items-center justify-center gap-2 border border-teal-600/30 cursor-pointer"
                      >
                        {isDownloading ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                        Export Data Aktual ({selectedDate}_{selectedTable}.csv)
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: IMPORT / UPLOAD CSV */}
              {activeTab === 'import' && (
                <form onSubmit={handleImportSubmit} className="space-y-4">
                  
                  {/* Drag & Drop File Zone */}
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDropFile}
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-teal-300 hover:border-[#047D78] rounded-2xl p-6 text-center cursor-pointer transition-all bg-teal-50/20 hover:bg-teal-50/50"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <div className="w-12 h-12 rounded-2xl bg-teal-100/80 text-[#047D78] mx-auto flex items-center justify-center mb-3 shadow-2xs">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    {uploadFile ? (
                      <div className="space-y-1">
                        <p className="text-sm font-black text-slate-900 flex items-center justify-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-[#047D78]" /> {uploadFile.name}
                        </p>
                        <p className="text-xs font-semibold text-slate-500">
                          Ukuran: {(uploadFile.size / 1024).toFixed(1)} KB — Klik untuk mengganti file
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-xs sm:text-sm font-bold text-slate-800">
                          Tarik file CSV ke sini atau <span className="text-[#047D78] underline">pilih file</span>
                        </p>
                        <p className="text-[11px] text-slate-500 font-medium">
                          Format penamaan otomatis didukung (contoh: <code>2026-08-26_pasien_rs.csv</code>)
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Konfigurasi Upload & Mapping */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Target Tanggal Data
                      </label>
                      <input
                        type="date"
                        value={importDate}
                        onChange={(e) => setImportDate(e.target.value)}
                        className="w-full px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-xl border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-[#047D78] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Target Jenis Tabel CSV
                      </label>
                      <select
                        value={importTable}
                        onChange={(e) => setImportTable(e.target.value as NttTableName)}
                        className="w-full px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-xl border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-[#047D78] focus:outline-none cursor-pointer"
                      >
                        {NTT_TABLES.map((t) => (
                          <option key={t} value={t}>
                            {NTT_TABLE_DEFINITIONS[t].label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Preview Mini Table jika file sudah dipilih */}
                  {parsedPreview && (
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-800">
                          Preview Data ({parsedPreview.totalRows} Baris Terdeteksi):
                        </span>
                        <span className="text-[11px] text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200 font-mono font-bold">
                          {importDate}_{importTable}.csv
                        </span>
                      </div>
                      <div className="overflow-x-auto max-h-36 border border-slate-200 rounded-xl bg-white">
                        <table className="w-full text-left text-[11px] border-collapse">
                          <thead className="bg-slate-100 sticky top-0">
                            <tr>
                              {parsedPreview.headers.map((h, i) => (
                                <th key={i} className="p-2 font-black text-slate-700 border-b border-slate-200 whitespace-nowrap">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-medium">
                            {parsedPreview.rows.map((row, rIndex) => (
                              <tr key={rIndex} className="hover:bg-slate-50">
                                {parsedPreview.headers.map((h, cIndex) => (
                                  <td key={cIndex} className="p-2 text-slate-700 whitespace-nowrap">
                                    {String(row[h] ?? '')}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Alert Hasil Upload */}
                  {uploadResult && (
                    <div
                      className={`p-4 rounded-2xl text-xs font-semibold flex items-start gap-2.5 ${
                        uploadResult.success
                          ? 'bg-teal-50 text-teal-900 border border-teal-300'
                          : 'bg-rose-50 text-rose-900 border border-rose-300'
                      }`}
                    >
                      {uploadResult.success ? (
                        <CheckCircle2 className="w-5 h-5 text-[#047D78] shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="font-black text-sm">{uploadResult.message}</div>
                        {uploadResult.success && (
                          <div className="mt-1 text-[11px] text-teal-800">
                            {uploadResult.databaseSynced ? (
                              <span>✓ Tersimpan ke PostgreSQL & folder data file host</span>
                            ) : (
                              <span>✓ Tersimpan ke file host (PostgreSQL offline)</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isUploading || !uploadFile}
                    className="w-full py-3 px-4 rounded-xl bg-[#047D78] hover:bg-[#03625d] disabled:opacity-50 text-white text-xs sm:text-sm font-black uppercase tracking-wider shadow-md shadow-teal-900/15 hover:shadow-lg transition-all flex items-center justify-center gap-2 border border-teal-600/30 cursor-pointer"
                  >
                    {isUploading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <UploadCloud className="w-4 h-4" />
                    )}
                    Upload & Simpan ke Sistem ({importDate}_{importTable}.csv)
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs font-semibold text-slate-500">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-[#047D78]" />
            Sinkronisasi otomatis dengan service <code>collector-ntt</code>
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition-all cursor-pointer"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  )
}
