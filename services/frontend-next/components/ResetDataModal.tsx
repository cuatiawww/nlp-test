'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Loader2, Check, RefreshCw, Database, Trash2 } from 'lucide-react'
import Modal from '@/components/Modal'
import { authHeaders, getAuthUser } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n/LanguageContext'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess?: (result: any) => void
}

interface CleanupStats {
  total_events: number
  total_raw_reports: number
  processed_reports: number
  non_health_reports: number
  failed_reports: number
  new_reports: number
  reanalyzable_reports: number
  cached_nlp: number
}

type ResetScope = 'events_only' | 'analysis_and_events' | 'full_crawl_and_analysis'

export default function ResetDataModal({ open, onClose, onSuccess }: Props) {
  const { t, locale } = useTranslation()
  const [scope, setScope] = useState<ResetScope>('analysis_and_events')
  const [confirmation, setConfirmation] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [fetchingStats, setFetchingStats] = useState(false)
  const [stats, setStats] = useState<CleanupStats | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const isId = locale === 'id'

  useEffect(() => {
    if (open) {
      setConfirmation('')
      setReason('')
      setErrorMsg(null)
      loadStats()
    }
  }, [open])

  const loadStats = async () => {
    setFetchingStats(true)
    try {
      const res = await fetch('/nlp/api/v1/data/cleanup-stats')
      if (res.ok) {
        const json = await res.json()
        if (json.success && json.data) {
          setStats(json.data)
        }
      }
    } catch (err) {
      console.error('Failed to fetch cleanup stats:', err)
    } finally {
      setFetchingStats(false)
    }
  }

  const handleExecute = async () => {
    if (confirmation.trim() !== 'RESET') {
      setErrorMsg(isId ? 'Ketik kata "RESET" dengan tepat untuk konfirmasi.' : 'Please type "RESET" to confirm.')
      return
    }

    const user = getAuthUser()
    if (!user) {
      setErrorMsg(
        isId
          ? 'Sesi admin diperlukan untuk melakukan reset. Silakan login terlebih dahulu sebagai admin.'
          : 'Admin session required to perform reset. Please sign in as admin first.'
      )
      return
    }

    setLoading(true)
    setErrorMsg(null)

    try {
      const res = await fetch('/nlp/api/v1/data/cleanup-events', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          scope,
          confirmation: 'RESET',
          reason: reason.trim() || (isId ? 'Reset data melalui antarmuka konsol' : 'Data reset via console UI'),
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        const err = data.error || (isId ? 'Gagal mengeksekusi reset data.' : 'Failed to execute data reset.')
        setErrorMsg(err)
        toast.error(err)
        return
      }

      toast.success(
        data.data?.message || (isId ? 'Reset data berhasil diselesaikan.' : 'Data reset completed successfully.')
      )
      if (onSuccess) onSuccess(data)
      onClose()
    } catch (err: any) {
      const msg = err.message || (isId ? 'Terjadi kesalahan jaringan.' : 'Network error occurred.')
      setErrorMsg(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const isConfirmed = confirmation.trim() === 'RESET'

  return (
    <Modal
      open={open}
      onClose={() => !loading && onClose()}
      title={isId ? 'Hapus Data Analisa & Reset Event' : 'Reset Analysis & Disease Events'}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5 text-slate-800">
        {/* Warning Alert */}
        <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
            <div className="text-xs leading-relaxed text-red-800">
              <span className="font-semibold block text-red-900 mb-0.5">
                {isId ? 'Tindakan Destruktif dan Permanen' : 'Destructive and Irreversible Action'}
              </span>
              {isId
                ? 'Operasi ini akan menghapus data analisa hasil inferensi NLP dan/atau data kejadian (events). Master data penyakit, negara, koordinat wilayah, dan daftar sumber collector tetap aman.'
                : 'This operation will clear NLP inference analysis results and/or disease events. Disease master ontology, countries, geographic coordinates, and collector sources will be preserved.'}
            </div>
          </div>
        </div>

        {/* Live Data Summary */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-slate-400" />
              {isId ? 'Volume Data Saat Ini (Live)' : 'Current Live Data Volume'}
            </span>
            {fetchingStats && (
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                {isId ? 'Memuat statistik...' : 'Loading stats...'}
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-white p-2.5 border border-slate-200 shadow-2xs">
              <div className="text-lg font-black text-slate-900 tabular-nums">
                {stats ? stats.total_events.toLocaleString() : '...'}
              </div>
              <div className="text-[11px] font-medium text-slate-500">
                {isId ? 'Kejadian (Events)' : 'Disease Events'}
              </div>
            </div>
            <div className="rounded-lg bg-white p-2.5 border border-slate-200 shadow-2xs">
              <div className="text-lg font-black text-slate-900 tabular-nums">
                {stats ? stats.reanalyzable_reports.toLocaleString() : '...'}
              </div>
              <div className="text-[11px] font-medium text-slate-500">
                {isId ? 'Artikel Teranalisa' : 'Analyzed Articles'}
              </div>
            </div>
            <div className="rounded-lg bg-white p-2.5 border border-slate-200 shadow-2xs">
              <div className="text-lg font-black text-slate-900 tabular-nums">
                {stats ? stats.total_raw_reports.toLocaleString() : '...'}
              </div>
              <div className="text-[11px] font-medium text-slate-500">
                {isId ? 'Total Artikel Mentah' : 'Total Raw Articles'}
              </div>
            </div>
          </div>
        </div>

        {/* Scope Selection */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
            {isId ? 'Pilih Cakupan Pembersihan' : 'Select Cleanup Scope'}
          </label>
          <div className="grid grid-cols-1 gap-2.5">
            {/* Scope 1: analysis_and_events (Recommended) */}
            <div
              onClick={() => setScope('analysis_and_events')}
              className={`cursor-pointer rounded-xl border p-3.5 transition ${
                scope === 'analysis_and_events'
                  ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">
                      {isId ? 'Reset Analisa & Siapkan Re-Analisis' : 'Reset Analysis & Prepare Re-Analysis'}
                    </span>
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                      {isId ? 'Disarankan' : 'Recommended'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 leading-normal">
                    {isId
                      ? 'Menghapus tabel kejadian (disease_events), membersihkan cache NLP, dan mengembalikan status artikel mentah ke NEW agar dapat dianalisa ulang secara otomatis oleh worker dengan model/rules terbaru.'
                      : 'Deletes disease events, clears NLP cache, and sets processed articles back to NEW so workers can re-process them with current models and rules.'}
                  </p>
                </div>
                <div
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    scope === 'analysis_and_events'
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-300'
                  }`}
                >
                  {scope === 'analysis_and_events' && <Check className="h-2.5 w-2.5 stroke-3" />}
                </div>
              </div>
            </div>

            {/* Scope 2: events_only */}
            <div
              onClick={() => setScope('events_only')}
              className={`cursor-pointer rounded-xl border p-3.5 transition ${
                scope === 'events_only'
                  ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">
                      {isId ? 'Hanya Hapus Data Kejadian (Events Only)' : 'Delete Events Only'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 leading-normal">
                    {isId
                      ? 'Hanya menghapus riwayat kejadian penyakit dan agregat snapshot. Status artikel mentah tidak diubah dan artikel tidak akan dianalisa ulang secara otomatis.'
                      : 'Deletes disease events and snapshots only. Raw article statuses remain unchanged and will not be re-queued.'}
                  </p>
                </div>
                <div
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    scope === 'events_only'
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-300'
                  }`}
                >
                  {scope === 'events_only' && <Check className="h-2.5 w-2.5 stroke-3" />}
                </div>
              </div>
            </div>

            {/* Scope 3: full_crawl_and_analysis */}
            <div
              onClick={() => setScope('full_crawl_and_analysis')}
              className={`cursor-pointer rounded-xl border p-3.5 transition ${
                scope === 'full_crawl_and_analysis'
                  ? 'border-red-600 bg-red-50/40 ring-1 ring-red-600'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">
                      {isId ? 'Reset Total (Artikel + Analisa)' : 'Full Reset (Articles + Analysis)'}
                    </span>
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                      {isId ? 'Destruktif' : 'Destructive'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 leading-normal">
                    {isId
                      ? 'Menghapus seluruh artikel mentah (raw_reports) dan seluruh kejadian penyakit. Sistem kembali bersih siap melakukan crawling baru.'
                      : 'Deletes all raw articles and disease events. The system is reset clean for fresh collection.'}
                  </p>
                </div>
                <div
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    scope === 'full_crawl_and_analysis'
                      ? 'border-red-600 bg-red-600 text-white'
                      : 'border-slate-300'
                  }`}
                >
                  {scope === 'full_crawl_and_analysis' && <Check className="h-2.5 w-2.5 stroke-3" />}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Audit Reason Input */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
            {isId ? 'Catatan Audit (Opsional)' : 'Audit Note (Optional)'}
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              isId ? 'Contoh: Inisiasi ulang pasca pembaruan master data' : 'E.g., Re-analysis after master ontology update'
            }
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-hidden"
          />
        </div>

        {/* Confirmation Verification Input */}
        <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
          <label className="text-xs font-bold text-slate-900">
            {isId ? (
              <span>
                Ketik <span className="font-mono text-red-600 font-bold">RESET</span> untuk konfirmasi:
              </span>
            ) : (
              <span>
                Type <span className="font-mono text-red-600 font-bold">RESET</span> to confirm:
              </span>
            )}
          </label>
          <input
            type="text"
            value={confirmation}
            onChange={(e) => {
              setConfirmation(e.target.value)
              if (errorMsg) setErrorMsg(null)
            }}
            placeholder="RESET"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-hidden tracking-widest font-bold"
          />
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200 font-medium">
            {errorMsg}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer disabled:opacity-50"
          >
            {isId ? 'Batal' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleExecute}
            disabled={!isConfirmed || loading}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition shadow-sm ${
              !isConfirmed || loading
                ? 'bg-slate-300 cursor-not-allowed opacity-60'
                : 'bg-red-600 hover:bg-red-700 cursor-pointer'
            }`}
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {isId ? 'Memproses Reset...' : 'Processing Reset...'}
              </>
            ) : (
              <>
                <Trash2 className="h-3.5 w-3.5" />
                {isId ? 'Eksekusi Reset Data' : 'Execute Data Reset'}
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  )
}
