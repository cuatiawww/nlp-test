'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Check, Edit3, Loader2, Sparkles } from 'lucide-react'
import Modal from '@/components/Modal'
import { submitNLPCorrection } from '@/lib/api'

export interface CorrectionTarget {
  eventId?: string
  rawReportId?: string
  fieldName: 'case_count' | 'death_count' | 'disease' | 'location' | 'country'
  originalValue: string
  textSnippet?: string
  articleTitle?: string
  language?: string
}

interface Props {
  open: boolean
  target: CorrectionTarget | null
  onClose: () => void
  onSuccess?: (correctedField: string, newValue: string) => void
}

export default function CorrectionModal({ open, target, onClose, onSuccess }: Props) {
  const [newValue, setNewValue] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (target) {
      setNewValue(target.originalValue || '')
      setReason('')
    }
  }, [target])

  if (!target) return null

  const FIELD_LABELS: Record<string, string> = {
    case_count: 'Jumlah Kasus (Cases)',
    death_count: 'Jumlah Kematian (Deaths)',
    disease: 'Klasifikasi Penyakit (Disease / ICD-11)',
    location: 'Nama Wilayah / Kota (Location)',
    country: 'Negara (Country)',
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!target) return
    if (newValue === target.originalValue) {
      toast.info('Nilai koreksi sama dengan nilai awal.')
      onClose()
      return
    }

    setSubmitting(true)
    try {
      const res = await submitNLPCorrection({
        event_id: target.eventId,
        raw_report_id: target.rawReportId,
        field_name: target.fieldName,
        original_value: target.originalValue,
        corrected_value: newValue.trim(),
        text_snippet: target.textSnippet,
        language: target.language,
        corrected_by: 'operator_ui',
      })

      toast.success(
        res.message || 'Koreksi berhasil disimpan sebagai audit human review.'
      )
      onSuccess?.(target.fieldName, newValue.trim())
      onClose()
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menyimpan koreksi NLP.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Koreksi Hasil NLP (Human-in-the-Loop Feedback)"
      onClose={onClose}
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 text-indigo-900">
          <div className="flex items-center gap-1.5 font-semibold text-indigo-700">
            <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
            <span>Continuous Learning Loop</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-indigo-800/80">
            Koreksi disimpan sebagai audit terpisah dari prediksi awal, beserta konteks teksnya. Data ini dapat dipakai untuk kurasi dan fine-tuning berikutnya; tidak ada retraining otomatis dari modal ini.
          </p>
        </div>

        {target.articleTitle && (
          <div>
            <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">
              Judul Artikel
            </span>
            <p className="mt-0.5 font-medium text-slate-800 line-clamp-2">
              {target.articleTitle}
            </p>
          </div>
        )}

        <div>
          <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">
            Bidang yang Dikoreksi
          </span>
          <p className="mt-0.5 font-bold text-slate-900">
            {FIELD_LABELS[target.fieldName] || target.fieldName}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500">
              Nilai Sistem Saat Ini
            </label>
            <input
              type="text"
              readOnly
              value={target.originalValue || '-'}
              className="mt-1 w-full rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-slate-600 cursor-not-allowed font-medium"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-emerald-700">
              Nilai Koreksi yang Benar *
            </label>
            <input
              type="text"
              required
              autoFocus
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="Masukkan nilai benar..."
              className="mt-1 w-full rounded-md border border-emerald-400 bg-white px-2.5 py-1.5 text-slate-900 font-semibold focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
            />
          </div>
        </div>

        {target.textSnippet && (
          <div>
            <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">
              Kutipan Teks / Konteks Terkait
            </span>
            <div className="mt-1 rounded-md border border-slate-200 bg-slate-50 p-2 text-slate-700 italic text-[11px] max-h-24 overflow-y-auto">
              "{target.textSnippet}"
            </div>
          </div>
        )}

        <div>
          <label className="block text-[11px] font-semibold text-slate-600">
            Catatan Tambahan (Opsional)
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Contoh: Balita 3 tahun adalah usia, bukan jumlah kasus"
            className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-slate-800 placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-600 hover:bg-slate-50 font-medium"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={submitting || !newValue.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Menyimpan...</span>
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" />
                <span>Simpan Koreksi</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}
