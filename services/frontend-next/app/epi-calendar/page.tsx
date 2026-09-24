'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  Edit3,
  Trash2,
  ExternalLink,
  Download,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  X,
  Activity,
  FileText,
  Layers,
  Info,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  EpiWeekDetail,
  EpiWeekConfig,
  fetchEpiWeeks,
  fetchCurrentEpiWeekApi,
  calculateEpiWeekApi,
  saveEpiWeekConfig,
  deleteEpiWeekConfig,
  getWeeksInYear,
  getCurrentEpiWeek,
  FULL_MONTHS_ID,
} from '@/lib/epi-week';

const SUPPORTED_YEARS = [2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030];

const ALERT_CONFIG: Record<string, { label: string; badge: string; border: string; bg: string; dot: string }> = {
  normal: {
    label: 'Normal',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    border: 'border-slate-200 hover:border-emerald-300',
    bg: 'bg-white',
    dot: 'bg-emerald-500',
  },
  watch: {
    label: 'Waspada (Watch)',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    border: 'border-amber-300 bg-amber-50/20',
    bg: 'bg-amber-50/30',
    dot: 'bg-amber-500',
  },
  alert: {
    label: 'Siaga (Alert)',
    badge: 'bg-orange-50 text-orange-700 border-orange-200',
    border: 'border-orange-300 bg-orange-50/20',
    bg: 'bg-orange-50/30',
    dot: 'bg-orange-500',
  },
  epidemic: {
    label: 'KLB / Wabah',
    badge: 'bg-rose-50 text-rose-700 border-rose-200 font-bold',
    border: 'border-rose-400 bg-rose-50/25 ring-1 ring-rose-200',
    bg: 'bg-rose-50/30',
    dot: 'bg-rose-600',
  },
};

export default function EpiCalendarPage() {
  const currentEpi = useMemo(() => getCurrentEpiWeek(), []);
  const [selectedYear, setSelectedYear] = useState<number>(currentEpi.year || 2026);
  const [weeks, setWeeks] = useState<EpiWeekDetail[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [alertFilter, setAlertFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'month_grid' | 'table_list'>('month_grid');

  // Calculator State
  const [calcDate, setCalcDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [calcResult, setCalcResult] = useState<any>(null);
  const [calculating, setCalculating] = useState<boolean>(false);

  // Edit / CRUD Modal State
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingWeek, setEditingWeek] = useState<EpiWeekDetail | null>(null);
  const [formData, setFormData] = useState<EpiWeekConfig>({
    epi_year: selectedYear,
    epi_week: 1,
    title: '',
    alert_level: 'normal',
    primary_disease: '',
    notes: '',
    surveillance_status: 'active',
  });
  const [saving, setSaving] = useState<boolean>(false);

  // Fetch weeks for selected year
  const loadWeeks = useCallback(async (year: number) => {
    setLoading(true);
    try {
      const res = await fetchEpiWeeks(year);
      if (res && res.weeks) {
        setWeeks(res.weeks);
      }
    } catch (err: any) {
      toast.error('Gagal memuat kalender epi week: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWeeks(selectedYear);
  }, [selectedYear, loadWeeks]);

  // Run initial date calculation
  useEffect(() => {
    handleRunCalculation(calcDate);
  }, []);

  const handleRunCalculation = async (dateStr: string) => {
    if (!dateStr) return;
    setCalculating(true);
    try {
      const res = await calculateEpiWeekApi(dateStr);
      setCalcResult(res);
    } catch {
      toast.error('Format tanggal tidak valid');
    } finally {
      setCalculating(false);
    }
  };

  // Open modal for editing
  const handleOpenEdit = (w: EpiWeekDetail) => {
    setEditingWeek(w);
    setFormData({
      id: w.config?.id,
      epi_year: w.year,
      epi_week: w.week,
      title: w.config?.title || '',
      alert_level: w.config?.alert_level || 'normal',
      primary_disease: w.config?.primary_disease || '',
      notes: w.config?.notes || '',
      surveillance_status: w.config?.surveillance_status || 'active',
    });
    setModalOpen(true);
  };

  // Submit save
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWeek) return;
    setSaving(true);
    try {
      const payload: EpiWeekConfig = {
        ...formData,
        epi_year: editingWeek.year,
        epi_week: editingWeek.week,
      };
      await saveEpiWeekConfig(payload);
      toast.success(`Konfigurasi EW ${String(editingWeek.week).padStart(2, '0')} / ${editingWeek.year} berhasil disimpan`);
      setModalOpen(false);
      loadWeeks(selectedYear);
    } catch (err: any) {
      toast.error(err.message || 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  // Delete / Reset config
  const handleDeleteConfig = async () => {
    if (!editingWeek?.config?.id) return;
    if (!confirm(`Hapus catatan dan konfigurasi surveilans untuk EW ${editingWeek.week}?`)) return;
    setSaving(true);
    try {
      await deleteEpiWeekConfig(editingWeek.config.id);
      toast.success('Konfigurasi berhasil dihapus/direset ke standar');
      setModalOpen(false);
      loadWeeks(selectedYear);
    } catch (err: any) {
      toast.error(err.message || 'Gagal menghapus');
    } finally {
      setSaving(false);
    }
  };

  // Filtered weeks
  const filteredWeeks = useMemo(() => {
    return weeks.filter((w) => {
      if (alertFilter !== 'all') {
        const curAlert = w.config?.alert_level || 'normal';
        if (curAlert !== alertFilter) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchWeek = `ew ${w.week}`.includes(q) || `w${w.week}`.includes(q) || String(w.week) === q;
        const matchDate = w.formatted_range.toLowerCase().includes(q);
        const matchTitle = (w.config?.title || '').toLowerCase().includes(q);
        const matchDisease = (w.config?.primary_disease || '').toLowerCase().includes(q);
        const matchNotes = (w.config?.notes || '').toLowerCase().includes(q);
        if (!matchWeek && !matchDate && !matchTitle && !matchDisease && !matchNotes) return false;
      }
      return true;
    });
  }, [weeks, alertFilter, searchQuery]);

  // Group filtered weeks by month
  const weeksByMonth = useMemo(() => {
    const map: Record<number, EpiWeekDetail[]> = {};
    for (let m = 1; m <= 12; m++) map[m] = [];
    filteredWeeks.forEach((w) => {
      if (!map[w.month]) map[w.month] = [];
      map[w.month].push(w);
    });
    return map;
  }, [filteredWeeks]);

  // Export to CSV
  const handleExportCsv = () => {
    const headers = [
      'Epi Year',
      'Epi Week',
      'Start Date (Sunday)',
      'End Date (Saturday)',
      'Range Label',
      'Month',
      'Alert Level',
      'Focus Title',
      'Primary Disease',
      'Surveillance Notes',
      'Reports Published',
    ];
    const rows = weeks.map((w) => [
      w.year,
      w.week,
      w.start_date,
      w.end_date,
      `"${w.formatted_range}"`,
      `"${w.month_name}"`,
      w.config?.alert_level || 'normal',
      `"${(w.config?.title || '').replace(/"/g, '""')}"`,
      `"${(w.config?.primary_disease || '').replace(/"/g, '""')}"`,
      `"${(w.config?.notes || '').replace(/"/g, '""')}"`,
      w.report_count || 0,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `kalender-mmwr-epiweeks-${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Jadwal MMWR ${selectedYear} diekspor ke CSV`);
  };

  const totalYearWeeks = getWeeksInYear(selectedYear);
  const isLeapEpiYear = totalYearWeeks === 53;

  return (
    <div className="min-h-screen bg-slate-50/60 pb-16">
      {/* 1. Header & Surveillance Context */}
      <header className="border-b border-slate-200/80 bg-white shadow-2xs">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-[#0060A9] border border-blue-200/60">
                  <CalendarDays className="h-3.5 w-3.5" />
                  CDC & WHO MMWR Standard
                </span>
                <span className="text-xs font-medium text-slate-400">|</span>
                <span className="text-xs font-medium text-slate-600">Minggu mulai Minggu s.d. Sabtu</span>
              </div>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Kalender Epidemiologi MMWR (Epi Weeks)
              </h1>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                Sistem rujukan baku pekan epidemiologi, kalender surveilans, mitigasi wabah, dan registri operasional tanpa hardcoded dummy.
              </p>
            </div>

            {/* Active Current Week Pill */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/90 px-3.5 py-2">
                <div className="relative flex h-3 w-3">
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-500">Minggu Berjalan Hari Ini</div>
                  <div className="font-mono text-sm font-bold text-slate-900">
                    EW {String(currentEpi.week).padStart(2, '0')} / {currentEpi.year}
                  </div>
                </div>
              </div>

              <button
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition shadow-2xs cursor-pointer"
                title="Ekspor kalender MMWR ke CSV"
              >
                <Download className="h-3.5 w-3.5 text-slate-500" />
                Ekspor CSV
              </button>

              <button
                onClick={() => loadWeeks(selectedYear)}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50 transition shadow-2xs cursor-pointer"
                title="Segarkan data"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-[#0060A9]' : 'text-slate-500'}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Interactive Date-to-Week Calculator Widget */}
      <section className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-2xs">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-blue-50 p-1.5 text-[#0060A9]">
                  <Activity className="h-4 w-4" />
                </div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                  Kalkulator Konversi Tanggal ke Pekan MMWR
                </h2>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Uji dan konversikan sembarang tanggal kalender ke dalam Pekan Epidemiologi MMWR (sesuai spesifikasi{' '}
                <a
                  href="http://epiweek.com/docs/"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-[#0060A9] hover:underline"
                >
                  epiweek.com/docs
                </a>
                ).
              </p>
            </div>

            {/* Input & Live Result */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
                <Calendar className="h-4 w-4 text-slate-400" />
                <input
                  type="date"
                  value={calcDate}
                  onChange={(e) => {
                    setCalcDate(e.target.value);
                    handleRunCalculation(e.target.value);
                  }}
                  className="bg-transparent text-xs font-semibold text-slate-900 outline-none"
                />
              </div>

              {calcResult && (
                <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50/70 px-3.5 py-1.5">
                  <div>
                    <div className="text-[10px] font-semibold text-slate-500 uppercase">{calcResult.day_of_week}</div>
                    <div className="font-mono text-xs font-bold text-[#0060A9]">
                      {calcResult.label} ({calcResult.week_start} s.d. {calcResult.week_end})
                    </div>
                  </div>
                  <Link
                    href={`/main-dashboard?startYear=${calcResult.epi_year}&startWeek=${calcResult.epi_week}&endYear=${calcResult.epi_year}&endWeek=${calcResult.epi_week}`}
                    className="rounded-lg bg-[#0060A9] p-1.5 text-white hover:bg-blue-700 transition"
                    title="Buka Outbreak Dashboard pada minggu ini"
                  >
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 3. Year Selector & Filters Bar */}
      <section className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4">
          {/* Year Buttons Bar */}
          <div className="flex items-center justify-between overflow-x-auto pb-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">Tahun:</span>
              {SUPPORTED_YEARS.map((yr) => {
                const isSelected = yr === selectedYear;
                const weeksCount = getWeeksInYear(yr);
                const has53 = weeksCount === 53;
                return (
                  <button
                    key={yr}
                    onClick={() => setSelectedYear(yr)}
                    className={`relative flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                      isSelected
                        ? 'bg-[#0060A9] text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-200/80 hover:bg-slate-50'
                    }`}
                  >
                    <span>{yr}</span>
                    {has53 && (
                      <span
                        className={`rounded-full px-1 py-0.2 text-[9px] font-black ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
                        }`}
                        title="Tahun Panjang MMWR: Memiliki 53 Pekan Epidemiologi"
                      >
                        53W
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Year Summary Badge */}
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
              <span>Total Pekan:</span>
              <span className="font-mono font-bold text-slate-900">{totalYearWeeks} Minggu</span>
              {isLeapEpiYear ? (
                <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200">
                  Tahun Panjang MMWR (53 Pekan)
                </span>
              ) : (
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                  Tahun Reguler (52 Pekan)
                </span>
              )}
            </div>
          </div>

          {/* Search, Status Filter & View Mode */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs">
            <div className="flex flex-1 items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari nomor minggu (EW 38), tanggal, penyakit, atau catatan..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0060A9] focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-100 transition"
                />
              </div>

              {/* Alert Level Filter */}
              <div className="relative">
                <select
                  value={alertFilter}
                  onChange={(e) => setAlertFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-1.5 text-xs font-semibold text-slate-700 focus:border-[#0060A9] focus:bg-white focus:outline-none cursor-pointer"
                >
                  <option value="all">Semua Status Kewaspadaan</option>
                  <option value="normal">Normal (Hijau)</option>
                  <option value="watch">Waspada / Watch (Kuning)</option>
                  <option value="alert">Siaga / Alert (Oranye)</option>
                  <option value="epidemic">KLB / Wabah (Merah)</option>
                </select>
              </div>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
              <button
                onClick={() => setViewMode('month_grid')}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                  viewMode === 'month_grid' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                Matriks Bulanan
              </button>
              <button
                onClick={() => setViewMode('table_list')}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                  viewMode === 'table_list' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                Daftar Tabel
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Main Calendar Content */}
      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-slate-200 bg-white">
            <RefreshCw className="h-8 w-8 animate-spin text-[#0060A9]" />
            <p className="mt-3 text-xs font-semibold text-slate-500">Memuat data pekan epidemiologi {selectedYear}...</p>
          </div>
        ) : filteredWeeks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-slate-200 bg-white text-center">
            <AlertCircle className="h-8 w-8 text-slate-300" />
            <h3 className="mt-2 text-sm font-bold text-slate-800">Tidak ada minggu yang cocok</h3>
            <p className="mt-1 text-xs text-slate-500">
              Ubah kata kunci pencarian atau reset filter tingkat kewaspadaan.
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setAlertFilter('all');
              }}
              className="mt-3 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 transition cursor-pointer"
            >
              Reset Filter
            </button>
          </div>
        ) : viewMode === 'month_grid' ? (
          /* Monthly Matrix View */
          <div className="space-y-8">
            {FULL_MONTHS_ID.map((monthName, idx) => {
              const monthNum = idx + 1;
              const monthWeeks = weeksByMonth[monthNum] || [];
              if (monthWeeks.length === 0 && (searchQuery || alertFilter !== 'all')) {
                return null;
              }
              return (
                <section key={monthNum} className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                    <h3 className="text-base font-bold text-slate-800">
                      {monthName} {selectedYear}
                    </h3>
                    <span className="text-xs font-semibold text-slate-400 font-mono">
                      ({monthWeeks.length} pekan)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {monthWeeks.map((w) => {
                      const alert = ALERT_CONFIG[w.config?.alert_level || 'normal'];
                      return (
                        <div
                          key={w.week}
                          className={`relative flex flex-col justify-between rounded-2xl border ${alert.border} ${alert.bg} p-4 transition hover:shadow-sm`}
                        >
                          <div>
                            {/* Card Top: EW Badge & Current Indicator */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-base font-black text-slate-900 tracking-tight">
                                  EW {String(w.week).padStart(2, '0')}
                                </span>
                                {w.is_current && (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[9.5px] font-bold text-white tracking-wide">
                                    Aktif
                                  </span>
                                )}
                              </div>
                              <span
                                className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold ${alert.badge}`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${alert.dot}`}></span>
                                {alert.label}
                              </span>
                            </div>

                            {/* Date Range */}
                            <div className="mt-2 text-xs font-medium text-slate-600 flex items-center gap-1.5">
                              <Calendar className="h-3 w-3 text-slate-400 shrink-0" />
                              <span>{w.formatted_range}</span>
                            </div>

                            {/* Custom Surveillance Title / Focus */}
                            {w.config?.title ? (
                              <div className="mt-2.5 rounded-lg bg-white/80 p-2 border border-slate-200/60">
                                <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                                  Fokus Surveilans
                                </div>
                                <div className="text-xs font-bold text-slate-800 line-clamp-1">
                                  {w.config.title}
                                </div>
                                {w.config.primary_disease && (
                                  <div className="mt-0.5 text-[11px] font-semibold text-[#0060A9]">
                                    Penyakit: {w.config.primary_disease}
                                  </div>
                                )}
                              </div>
                            ) : null}

                            {/* Notes excerpt if any */}
                            {w.config?.notes && (
                              <p className="mt-2 text-[11px] text-slate-500 italic line-clamp-2">
                                "{w.config.notes}"
                              </p>
                            )}
                          </div>

                          {/* Card Footer: Reports Count & Action Buttons */}
                          <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between gap-2">
                            <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                              <FileText className="h-3 w-3 text-slate-400" />
                              <span>{w.report_count || 0} Laporan</span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleOpenEdit(w)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-2xs"
                                title="Ubah fokus & status pekan ini"
                              >
                                <Edit3 className="h-3 w-3 text-slate-500" />
                                Edit
                              </button>
                              <Link
                                href={`/main-dashboard?startYear=${w.year}&startWeek=${w.week}&endYear=${w.year}&endWeek=${w.week}`}
                                className="inline-flex items-center gap-1 rounded-lg bg-[#0060A9] px-2 py-1 text-[11px] font-bold text-white hover:bg-blue-700 transition cursor-pointer shadow-2xs"
                                title="Buka data wabah minggu ini di Dashboard"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Data
                              </Link>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          /* Table List View */
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50/80 font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Pekan MMWR</th>
                    <th className="px-4 py-3">Rentang Tanggal (Min — Sab)</th>
                    <th className="px-4 py-3">Bulan</th>
                    <th className="px-4 py-3">Tingkat Kewaspadaan</th>
                    <th className="px-4 py-3">Fokus & Penyakit Prioritas</th>
                    <th className="px-4 py-3">Catatan Surveilans</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredWeeks.map((w) => {
                    const alert = ALERT_CONFIG[w.config?.alert_level || 'normal'];
                    return (
                      <tr
                        key={w.week}
                        className={`transition hover:bg-slate-50/80 ${w.is_current ? 'bg-blue-50/30' : ''}`}
                      >
                        <td className="px-4 py-3 font-mono font-black text-slate-900">
                          <div className="flex items-center gap-1.5">
                            <span>EW {String(w.week).padStart(2, '0')}</span>
                            {w.is_current && (
                              <span className="rounded bg-emerald-600 px-1 py-0.2 text-[9px] font-bold text-white">
                                Aktif
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-700">{w.formatted_range}</td>
                        <td className="px-4 py-3 text-slate-500">{w.month_name}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold ${alert.badge}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${alert.dot}`}></span>
                            {alert.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-800">{w.config?.title || '—'}</div>
                          {w.config?.primary_disease && (
                            <div className="text-[11px] font-semibold text-[#0060A9]">
                              {w.config.primary_disease}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 max-w-xs truncate text-slate-500">
                          {w.config?.notes || '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEdit(w)}
                              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                              title="Edit konfigurasi"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <Link
                              href={`/main-dashboard?startYear=${w.year}&startWeek=${w.week}&endYear=${w.year}&endWeek=${w.week}`}
                              className="rounded-lg bg-[#0060A9] p-1.5 text-white hover:bg-blue-700 transition cursor-pointer"
                              title="Buka di Dashboard"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* 5. CRUD Modal: Configure Epi Week */}
      {modalOpen && editingWeek && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl transition-all">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-black text-[#0060A9]">
                    EW {String(editingWeek.week).padStart(2, '0')} / {editingWeek.year}
                  </span>
                  <span className="text-xs text-slate-400">|</span>
                  <span className="text-xs font-semibold text-slate-600">{editingWeek.formatted_range}</span>
                </div>
                <h3 className="mt-1 text-lg font-bold text-slate-900">Kelola Parameter Surveilans Pekan</h3>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="mt-4 space-y-4">
              {/* Focus Title */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Judul Agenda / Fokus Surveilans
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Pekan Kewaspadaan Dini Demam Berdarah Dengue"
                  value={formData.title || ''}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-[#0060A9] focus:bg-white focus:outline-none"
                />
              </div>

              {/* Alert Level */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Tingkat Kewaspadaan (Surveillance Alert Level)
                </label>
                <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(['normal', 'watch', 'alert', 'epidemic'] as const).map((lvl) => {
                    const isSelected = formData.alert_level === lvl;
                    const conf = ALERT_CONFIG[lvl];
                    return (
                      <button
                        type="button"
                        key={lvl}
                        onClick={() => setFormData({ ...formData, alert_level: lvl })}
                        className={`flex flex-col items-center justify-center rounded-xl border p-2 text-center transition cursor-pointer ${
                          isSelected
                            ? `${conf.border} ${conf.bg} font-bold ring-2 ring-blue-500/20`
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <span className={`h-2 w-2 rounded-full ${conf.dot} mb-1`}></span>
                        <span className="text-[11px] font-bold text-slate-800">{conf.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Primary Disease Focus */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Penyakit Sasaran / Pantauan Utama
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Dengue, Measles, Rabies, COVID-19, Mpox"
                  value={formData.primary_disease || ''}
                  onChange={(e) => setFormData({ ...formData, primary_disease: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-[#0060A9] focus:bg-white focus:outline-none"
                />
              </div>

              {/* Surveillance Notes */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Catatan Operasional & Arahan Tindakan Lapangan
                </label>
                <textarea
                  rows={3}
                  placeholder="Instruksi surveilans puskesmas, pelacakan kontak, atau pengetatan entry point..."
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-[#0060A9] focus:bg-white focus:outline-none"
                ></textarea>
              </div>

              {/* Modal Actions */}
              <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
                {formData.id ? (
                  <button
                    type="button"
                    onClick={handleDeleteConfig}
                    disabled={saving}
                    className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Reset ke Standar
                  </button>
                ) : (
                  <div></div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 transition cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {saving ? 'Menyimpan...' : 'Simpan Parameter'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
