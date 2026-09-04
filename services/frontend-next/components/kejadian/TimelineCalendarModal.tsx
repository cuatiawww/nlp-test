'use client'

import React, { useState, useMemo, useEffect } from 'react'
import {
  Clock,
  UserCheck,
  XCircle,
  ChevronLeft,
  ChevronRight,
  History,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Activity,
  Layers,
  Sparkles,
  Info,
  CalendarDays,
  Search
} from 'lucide-react'
import {
  TimelineLogItem,
  CalendarCell,
  MONTH_NAMES_ID,
  DAY_NAMES_ID,
  toIsoDate,
  parseDateFlexible,
  formatIndonesianDate,
  computeSiagaRange,
  normalizeLogs,
  groupLogsByDate,
  generateCalendarGrid,
  filterLogs
} from '@/lib/utils/timelineCalendarUtils'

export interface TimelineCalendarModalProps {
  isOpen: boolean
  onClose: () => void
  disasterName?: string
  locationName?: string
  tglKejadianRaw?: string | null
  timelineLogs: TimelineLogItem[]
  loadingLogs?: boolean
  logsError?: string | null
}

export default function TimelineCalendarModal({
  isOpen,
  onClose,
  disasterName = 'Kejadian Bencana',
  locationName = '-',
  tglKejadianRaw,
  timelineLogs = [],
  loadingLogs = false,
  logsError = null
}: TimelineCalendarModalProps) {
  // 1. Resolve Incident Date T0
  const incidentDate = useMemo(() => {
    let d = parseDateFlexible(tglKejadianRaw)
    if (d) return d

    if (timelineLogs.length > 0) {
      const dates = timelineLogs
        .map(l => parseDateFlexible(l.raw_date || l.date_only || l.tgl))
        .filter((x): x is Date => x !== null)
      if (dates.length > 0) {
        dates.sort((a, b) => a.getTime() - b.getTime())
        return dates[0]
      }
    }

    return new Date()
  }, [tglKejadianRaw, timelineLogs])

  const incidentIso = useMemo(() => toIsoDate(incidentDate), [incidentDate])

  // 2. Compute 14-Day Siaga Period Map (T0 to T0 + 13 days)
  const siagaRange = useMemo(() => {
    return computeSiagaRange(incidentDate, 14)
  }, [incidentDate])

  // 3. Normalize Logs with date_only & time_only
  const normalizedLogs = useMemo(() => {
    return normalizeLogs(timelineLogs, incidentIso)
  }, [timelineLogs, incidentIso])

  // 4. Map logs grouped by date_only
  const logsByDate = useMemo(() => {
    return groupLogsByDate(normalizedLogs)
  }, [normalizedLogs])

  // 5. Active state: Month View & Selected Date Filter
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date(incidentDate.getFullYear(), incidentDate.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState<string>('all')
  const [searchFilter, setSearchFilter] = useState<string>('')

  // Sync state when modal opens or incidentDate changes
  useEffect(() => {
    setCurrentMonth(new Date(incidentDate.getFullYear(), incidentDate.getMonth(), 1))
    setSelectedDate('all')
    setSearchFilter('')
  }, [incidentDate, isOpen])

  // Month navigation
  const prevMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }

  const jumpToIncident = () => {
    setCurrentMonth(new Date(incidentDate.getFullYear(), incidentDate.getMonth(), 1))
    setSelectedDate(incidentIso)
  }

  // Generate calendar grid cells (35 or 42 cells)
  const gridCells = useMemo(() => {
    return generateCalendarGrid(
      currentMonth,
      incidentIso,
      siagaRange,
      logsByDate,
      selectedDate
    )
  }, [currentMonth, incidentIso, siagaRange, logsByDate, selectedDate])

  // Filter logs for the right timeline panel
  const displayedLogs = useMemo(() => {
    return filterLogs(normalizedLogs, selectedDate, searchFilter)
  }, [normalizedLogs, selectedDate, searchFilter])

  // Human readable title for current timeline view
  const selectedDateHeading = useMemo(() => {
    if (selectedDate === 'all') return 'Seluruh Riwayat Log Aktivitas'
    const isSiaga = siagaRange.has(selectedDate)
    const dayIdx = siagaRange.get(selectedDate)
    if (isSiaga && typeof dayIdx === 'number') {
      return `${formatIndonesianDate(selectedDate)} (Hari ke-${dayIdx + 1} / H+${dayIdx} Siaga)`
    }
    if (selectedDate === incidentIso) {
      return `${formatIndonesianDate(selectedDate)} (Hari-H Kejadian)`
    }
    return formatIndonesianDate(selectedDate)
  }, [selectedDate, siagaRange, incidentIso])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl bg-white rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[90vh] max-h-[920px] border border-slate-200 animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* ── TOP HEADER (Brand Deep Teal) ── */}
        <div className="bg-[#047d78] text-white px-5 py-4 sm:px-6 sm:py-4 flex items-start justify-between gap-4 shadow-sm shrink-0">
          <div className="flex items-start sm:items-center gap-3.5 flex-1 min-w-0">
            <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/25 flex items-center justify-center text-white shadow-inner shrink-0 mt-0.5 sm:mt-0">
              <History className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-lg sm:text-xl font-black text-white tracking-wide m-0">
                  Timeline Log &amp; Siklus 14 Hari Siaga
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-white/20 border border-white/30 text-white">
                  EOC LIVE LOG
                </span>
              </div>
              <p className="text-xs sm:text-sm text-teal-100 font-medium mt-1 flex items-center gap-2 flex-wrap mb-0">
                <span className="font-bold text-white text-sm">{disasterName}</span>
                <span className="text-white/60">•</span>
                <span className="text-white font-medium">{locationName}</span>
                <span className="text-white/60">•</span>
                <span>Tgl Kejadian: <strong className="text-white underline decoration-white/50 font-bold">{formatIndonesianDate(incidentIso)}</strong></span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/20 transition-colors cursor-pointer border-none bg-transparent shrink-0"
            title="Tutup Modal"
          >
            <XCircle className="h-7 w-7 sm:h-8 sm:w-8" />
          </button>
        </div>

        {/* ── STATUS SUMMARY BAR ── */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 bg-amber-50 text-amber-950 border border-amber-300 px-3 py-1.5 rounded-xl font-bold text-xs sm:text-sm">
              <CalendarDays className="h-4 w-4 text-amber-700 shrink-0" />
              <span>Siklus Siaga: 14 Hari (H+0 s/d H+13)</span>
            </div>
            <div className="flex items-center gap-1.5 bg-teal-50 text-teal-950 border border-teal-300 px-3 py-1.5 rounded-xl font-bold text-xs sm:text-sm">
              <Activity className="h-4 w-4 text-[#047d78] shrink-0" />
              <span>{timelineLogs.length} Total Riwayat Log</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-slate-600 text-xs sm:text-sm font-medium">
            <Info className="h-4 w-4 text-[#047d78] shrink-0" />
            <span>Klik tanggal berarsir di kalender untuk melihat detail perubahan per hari.</span>
          </div>
        </div>

        {/* ── MODAL BODY: 2-COLUMN SPLIT PANE ── */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden">
          {/* ══════════════════════════════════════════════
              KOLOM KIRI: KALENDER INTERAKTIF 14 HARI ARSIRAN
             ══════════════════════════════════════════════ */}
          <div className="lg:col-span-5 border-r border-slate-200 p-4 sm:p-5 flex flex-col overflow-y-auto bg-slate-50/70 h-full">
            {/* Header Kalender: Bulan & Navigasi */}
            <div className="flex items-center justify-between mb-3 bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs shrink-0">
              <button
                onClick={prevMonth}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-700 transition cursor-pointer border-none bg-transparent"
                title="Bulan Sebelumnya"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <div className="text-center">
                <span className="text-base sm:text-lg font-black text-slate-900">
                  {MONTH_NAMES_ID[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={jumpToIncident}
                  className="px-2.5 py-1.5 rounded-lg bg-teal-50 text-teal-900 border border-teal-300 text-xs font-black hover:bg-teal-100 transition flex items-center gap-1 cursor-pointer"
                  title="Lompat ke Bulan Kejadian Awal"
                >
                  <Sparkles className="h-3.5 w-3.5 text-[#047d78]" />
                  Ke Hari-H
                </button>
                <button
                  onClick={nextMonth}
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-700 transition cursor-pointer border-none bg-transparent"
                  title="Bulan Berikutnya"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Grid Hari Kalender */}
            <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs mb-3">
              {/* Header Nama Hari */}
              <div className="grid grid-cols-7 gap-1 text-center mb-1.5 pb-1.5 border-b border-slate-200">
                {DAY_NAMES_ID.map((name, idx) => (
                  <span
                    key={name}
                    className={`text-xs font-black uppercase ${
                      idx === 0 ? 'text-rose-600' : 'text-slate-700'
                    }`}
                  >
                    {name}
                  </span>
                ))}
              </div>

              {/* Cells Grid */}
              <div className="grid grid-cols-7 gap-1.5">
                {gridCells.map((cell: CalendarCell, idx: number) => {
                  const hasLogs = cell.logCount > 0
                  const isSelected = cell.isSelected
                  const isSiaga = cell.isSiaga
                  const isIncident = cell.isIncident

                  // Base styling for cell
                  let cellBg = 'bg-white border-slate-100 text-slate-700'
                  let textOpacity = cell.isCurrentMonth ? 'opacity-100' : 'opacity-35'
                  let inlineCustomStyle: React.CSSProperties = {}

                  if (isSiaga) {
                    if (hasLogs) {
                      // Siaga day WITH report updates (Warm Amber hatch + glowing count)
                      cellBg = 'border-amber-400 text-amber-950 font-bold'
                      inlineCustomStyle = {
                        background: 'repeating-linear-gradient(45deg, rgba(245, 158, 11, 0.16), rgba(245, 158, 11, 0.16) 4px, rgba(254, 243, 199, 0.7) 4px, rgba(254, 243, 199, 0.7) 8px)'
                      }
                    } else {
                      // Siaga day WITHOUT report updates (Grey / Abu-abu hatching as requested)
                      cellBg = 'border-slate-300 text-slate-700 font-medium'
                      inlineCustomStyle = {
                        background: 'repeating-linear-gradient(45deg, rgba(203, 213, 225, 0.4), rgba(203, 213, 225, 0.4) 4px, rgba(248, 250, 252, 0.95) 4px, rgba(248, 250, 252, 0.95) 8px)'
                      }
                    }
                  }

                  if (isIncident) {
                    // Incident date (H-0)
                    cellBg = 'bg-rose-50 border-2 border-rose-400 text-rose-900 font-bold'
                    inlineCustomStyle = {}
                  }

                  if (isSelected) {
                    // Active selection
                    cellBg = 'bg-[#047d78] text-white border-[#035f5c] shadow-sm ring-2 ring-teal-400/40 font-black'
                    textOpacity = 'opacity-100'
                    inlineCustomStyle = {}
                  }

                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedDate(cell.iso)}
                      style={inlineCustomStyle}
                      className={`relative min-h-[58px] sm:min-h-[62px] p-1.5 rounded-xl border flex flex-col justify-between transition-all duration-150 text-left cursor-pointer group ${cellBg} ${textOpacity} ${
                        !isSelected ? 'hover:border-teal-400 hover:shadow-2xs' : ''
                      }`}
                    >
                      {/* Top row in cell: Day number + Siaga H+ label */}
                      <div className="flex items-center justify-between w-full">
                        <span className={`text-xs sm:text-sm font-black ${isSelected ? 'text-white' : ''}`}>
                          {cell.dayNum}
                        </span>

                        {isIncident ? (
                          <span className={`text-[9px] sm:text-[10px] font-black px-1.5 py-0.2 rounded ${
                            isSelected ? 'bg-white text-[#047d78]' : 'bg-rose-600 text-white'
                          }`}>
                            H-0
                          </span>
                        ) : isSiaga ? (
                          <span className={`text-[8.5px] sm:text-[9.5px] font-black px-1 rounded ${
                            isSelected
                              ? 'bg-white/25 text-white'
                              : hasLogs
                              ? 'bg-amber-200 text-amber-950 font-bold'
                              : 'bg-slate-200 text-slate-700'
                          }`}>
                            H+{cell.siagaDayIndex}
                          </span>
                        ) : null}
                      </div>

                      {/* Bottom row: Log indicator dot / pill */}
                      <div className="flex items-center justify-between w-full mt-1">
                        {hasLogs ? (
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-2xs ${
                              isSelected
                                ? 'bg-white text-[#047d78]'
                                : 'bg-emerald-600 text-white'
                            }`}
                            title={`${cell.logCount} update log aktivitas`}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-white" />
                            {cell.logCount}
                          </span>
                        ) : (
                          <span />
                        )}

                        {isSiaga && !hasLogs && (
                          <span className={`text-[8.5px] font-bold tracking-tight ${
                            isSelected ? 'text-teal-100' : 'text-slate-500'
                          }`}>
                            Siaga
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Quick Filter: Tampilkan Semua Riwayat */}
            <div className="flex items-center gap-2 mb-3 shrink-0">
              <button
                onClick={() => setSelectedDate('all')}
                className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 border cursor-pointer ${
                  selectedDate === 'all'
                    ? 'bg-[#047d78] text-white border-[#035f5c] shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Layers className="h-4 w-4" />
                <span>Tampilkan Seluruh Log ({normalizedLogs.length})</span>
              </button>
            </div>

            {/* Legenda Arsiran & Warna */}
            <div className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2 text-xs text-slate-700 shrink-0">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">
                Keterangan Kalender (Legenda):
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className="h-3.5 w-3.5 rounded border border-slate-300 shrink-0"
                    style={{
                      background: 'repeating-linear-gradient(45deg, rgba(203, 213, 225, 0.5), rgba(203, 213, 225, 0.5) 2px, rgba(248, 250, 252, 0.9) 2px, rgba(248, 250, 252, 0.9) 4px)'
                    }}
                  />
                  <span>Siaga (Belum Ada Laporan)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="h-3.5 w-3.5 rounded border border-amber-400 shrink-0"
                    style={{
                      background: 'repeating-linear-gradient(45deg, rgba(245, 158, 11, 0.3), rgba(245, 158, 11, 0.3) 2px, rgba(254, 243, 199, 0.9) 2px, rgba(254, 243, 199, 0.9) 4px)'
                    }}
                  />
                  <span>Siaga Ada Laporan / Update</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 rounded bg-rose-100 border border-rose-500 shrink-0" />
                  <span>Hari-H Kejadian (H-0)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 rounded bg-[#047d78] border border-[#035f5c] shrink-0" />
                  <span>Tanggal Terpilih</span>
                </div>
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════
              KOLOM KANAN: DETAIL TIMELINE LOG PERUBAHAN
             ══════════════════════════════════════════════ */}
          <div className="lg:col-span-7 p-4 sm:p-6 flex flex-col overflow-y-auto bg-white h-full">
            {/* Header Kolom Kanan */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-4 border-b border-slate-100 shrink-0">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-md text-[10px] sm:text-xs font-black uppercase tracking-wider bg-teal-50 text-teal-800 border border-teal-200">
                    DETAIL RIWAYAT LOG
                  </span>
                  {selectedDate !== 'all' && (
                    <button
                      onClick={() => setSelectedDate('all')}
                      className="text-xs sm:text-sm font-bold text-[#047d78] hover:underline flex items-center gap-0.5 cursor-pointer bg-transparent border-none p-0"
                    >
                      <span>(Lihat Semua Tanggal)</span>
                    </button>
                  )}
                </div>
                <h4 className="text-base sm:text-xl font-black text-slate-900 mt-1 m-0">
                  {selectedDateHeading}
                </h4>
              </div>

              {/* Filter Search inside timeline */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-56">
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={e => setSearchFilter(e.target.value)}
                    placeholder="Cari aktivitas..."
                    className="w-full text-xs sm:text-sm rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-slate-800 focus:outline-none focus:border-teal-500"
                  />
                  {searchFilter && (
                    <button
                      onClick={() => setSearchFilter('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm border-none bg-transparent cursor-pointer"
                    >
                      ×
                    </button>
                  )}
                </div>
                <span className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-xs font-bold text-slate-700 shrink-0">
                  {displayedLogs.length} Log
                </span>
              </div>
            </div>

            {/* Timeline Feed Container */}
            <div className="space-y-4 flex-1">
              {loadingLogs ? (
                <div className="text-center py-12">
                  <div className="inline-block p-3 rounded-2xl bg-teal-50 text-[#047d78] animate-spin mb-3">
                    <History className="h-6 w-6" />
                  </div>
                  <p className="text-xs sm:text-sm text-slate-500 font-bold">
                    Memuat riwayat log perkembangan dari server...
                  </p>
                </div>
              ) : logsError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-center text-xs sm:text-sm font-semibold text-rose-700">
                  <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-rose-600" />
                  {logsError}
                </div>
              ) : displayedLogs.length === 0 ? (
                /* Empty state when selected date has no logs */
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-8 sm:p-10 text-center my-auto">
                  <div className="h-14 w-14 rounded-2xl bg-white border border-slate-200 text-slate-400 flex items-center justify-center mx-auto mb-3.5 shadow-2xs">
                    <CalendarDays className="h-7 w-7 text-slate-400" />
                  </div>
                  <div className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-200/80 text-slate-700 mb-2">
                    Nihil Aktivitas
                  </div>
                  <h5 className="text-base sm:text-lg font-black text-slate-900 mb-1.5">
                    Tidak Ada Aktivitas Laporan yang Terpantau di Hari Ini
                  </h5>
                  <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto mb-4 leading-relaxed">
                    {selectedDate !== 'all' && siagaRange.has(selectedDate) ? (
                      <span>
                        Pada tanggal <strong>{formatIndonesianDate(selectedDate)}</strong> (Masa Siaga Hari ke-{siagaRange.get(selectedDate)! + 1} / H+{siagaRange.get(selectedDate)}), tidak ada riwayat perubahan data atau inputan laporan baru yang terpantau oleh petugas lapangan.
                      </span>
                    ) : (
                      <span>Belum ada catatan aktivitas laporan atau pembaruan data yang terpantau pada tanggal ini.</span>
                    )}
                  </p>
                  <button
                    onClick={() => setSelectedDate('all')}
                    className="px-5 py-2.5 rounded-xl bg-[#047d78] hover:bg-teal-800 text-white text-xs sm:text-sm font-black shadow-sm transition inline-flex items-center gap-2 border-none cursor-pointer"
                  >
                    <Layers className="h-4 w-4" />
                    <span>Tampilkan Seluruh Riwayat Log ({normalizedLogs.length})</span>
                  </button>
                </div>
              ) : (
                /* Timeline Items List */
                <div className="relative pl-6 sm:pl-7 space-y-4 before:absolute before:left-2.5 sm:before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-gradient-to-b before:from-[#047d78] before:via-teal-300 before:to-slate-200">
                  {displayedLogs.map((item, idx) => {
                    const isInitial = item.judul && item.judul.toLowerCase().includes('awal')
                    const isVerif = item.judul && item.judul.toLowerCase().includes('verifikasi')

                    const nodeColor = isInitial
                      ? 'bg-rose-600 ring-rose-200'
                      : isVerif
                      ? 'bg-emerald-600 ring-emerald-200'
                      : 'bg-[#047d78] ring-teal-200'

                    return (
                      <div key={idx} className="relative group">
                        {/* Timeline Node Icon/Dot */}
                        <div
                          className={`absolute -left-[27px] sm:-left-[29px] top-1.5 h-6 w-6 rounded-full ${nodeColor} text-white flex items-center justify-center ring-4 shadow-2xs transition group-hover:scale-110`}
                        >
                          {isInitial ? (
                            <FileText className="h-3 w-3" />
                          ) : isVerif ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : (
                            <Activity className="h-3 w-3" />
                          )}
                        </div>

                        {/* Card Content */}
                        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs hover:shadow-xs transition-all duration-200 space-y-2">
                          {/* Card Top Metadata */}
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1.5 font-black text-xs sm:text-sm bg-teal-50 text-teal-900 border border-teal-200 px-3 py-1 rounded-lg">
                                <Clock className="h-3.5 w-3.5 text-[#047d78]" />
                                {item.tgl}
                              </span>

                              {item.date_only && siagaRange.has(item.date_only) && (
                                <span className="inline-flex items-center gap-1 text-xs font-black bg-amber-50 text-amber-900 border border-amber-300 px-2.5 py-1 rounded-lg">
                                  H+{siagaRange.get(item.date_only)} Siaga
                                </span>
                              )}
                            </div>

                            <span className="text-xs font-black text-slate-400">
                              #{displayedLogs.length - idx}
                            </span>
                          </div>

                          {/* Activity Title */}
                          <h5 className="text-base sm:text-lg font-black text-slate-900 mb-1 leading-snug m-0">
                            {item.judul}
                          </h5>

                          {/* Description / Changes */}
                          {item.deskripsi && (
                            <div className="text-xs sm:text-sm text-slate-800 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-200 mb-2 whitespace-pre-line font-normal">
                              {item.deskripsi}
                            </div>
                          )}

                          {/* Footer: User Info */}
                          <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 text-xs sm:text-sm text-slate-600">
                            <div className="flex items-center gap-2">
                              <UserCheck className="h-4 w-4 text-[#047d78]" />
                              <span className="font-bold text-slate-800">
                                {item.user_name || 'System Administrator'}
                              </span>
                            </div>
                            <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200">
                              {item.user_level || 'Pusat / Admin'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── MODAL FOOTER ── */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex items-center justify-between text-xs sm:text-sm shrink-0">
          <div className="text-slate-600 font-medium hidden sm:block">
            Sistem Informasi Penanggulangan Krisis Kesehatan (SIPKK) • EOC Kemenkes RI
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs sm:text-sm font-bold transition cursor-pointer border-none ml-auto"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  )
}
