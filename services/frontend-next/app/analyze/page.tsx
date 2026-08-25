'use client'

import { useState } from 'react'
import { analyzeUrl } from '@/lib/api'
import AnalyzeResultCard from '@/components/AnalyzeResultCard'
import AseanMap from '@/components/AseanMap'
import type { AnalyzeResponse } from '@/types'
import { toast } from 'sonner'
import {
  Search, Globe, MapPin, Bug, Activity, Heart, MessageSquare,
  AlertTriangle, Shield, Languages, Users, Skull, TrendingUp,
  FileText, ExternalLink, CheckCircle, Loader2
} from 'lucide-react'

function sentimentBadge(s?: string | null) {
  if (!s || s === 'neutral') return <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">Netral</span>
  if (s === 'positive') return <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">Positif</span>
  if (s === 'negative') return <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-600">Negatif</span>
  return <span className="text-xs text-slate-400">{s}</span>
}

function relevanceBadge(s?: string | null) {
  if (!s || s === 'low') return <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">Rendah</span>
  if (s === 'high') return <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">Tinggi</span>
  return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-600">Sedang</span>
}

function alertBadge(alert: boolean) {
  return alert
    ? <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-600">🔴 YA</span>
    : <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">Tidak</span>
}

function healthBadge(h?: boolean | null) {
  if (h === true) return <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">✅ Ya</span>
  if (h === false) return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-600">Tidak</span>
  return <span className="text-xs text-slate-400">-</span>
}

export default function AnalyzePage() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!url.trim()) {
      toast.error('Masukkan URL terlebih dahulu')
      return
    }
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const data = await analyzeUrl(url.trim())
      setResult(data)
      toast.success('Analisis selesai!')
    } catch (e: any) {
      const msg = e?.message || 'Gagal menganalisis URL'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-4 md:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">Analisis URL</h1>
          <p className="mt-1 text-sm text-slate-500">Masukkan URL artikel berita untuk dianalisis NLP secara detail</p>
        </div>
      </div>

      <div className="mt-4 flex gap-3">
        <div className="relative flex-1">
          <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="https://example.com/berita/kasus-penyakit"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {loading ? 'Menganalisis...' : 'Analisis'}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="mt-8 flex flex-col items-center justify-center py-16 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
          <p className="mt-3 text-sm">Mengambil halaman web dan menganalisis dengan NLP...</p>
        </div>
      )}

      {result && (
        <div className="mt-8 space-y-6">
          <h2 className="text-base font-bold uppercase tracking-[0.04em] text-slate-700">Hasil Analisis</h2>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-5 w-5 text-teal-600" />
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-slate-900">{result.title || '(tanpa judul)'}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600 line-clamp-4">{result.content}</p>
                {result.url && (
                  <a href={result.url} target="_blank" rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700 hover:underline">
                    <ExternalLink className="h-3 w-3" /> Buka halaman asli
                  </a>
                )}
              </div>
            </div>
            <div className="mt-3 flex items-start gap-1.5 border-t border-slate-100 pt-3">
              <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-slate-500">{result.sources?.title || '-'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <AnalyzeResultCard
              icon={<Bug className="h-4 w-4" />}
              label="Penyakit (Klasifikasi)"
              value={
                <div className="flex items-center gap-2">
                  {result.disease_classification || '-'}
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-600">
                    {(result.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              }
              source={result.sources?.disease_classification || ''}
            />

            <AnalyzeResultCard
              icon={<MapPin className="h-4 w-4" />}
              label="Lokasi"
              value={result.location_name || '-'}
              source={result.sources?.location_name || ''}
            />

            <AnalyzeResultCard
              icon={<Users className="h-4 w-4" />}
              label="Jumlah Kasus"
              value={
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-extrabold text-slate-900">{result.case_count}</span>
                  <span className="flex items-center gap-1 text-sm font-medium text-red-500">
                    <Skull className="h-3.5 w-3.5" /> {result.death_count}
                  </span>
                </div>
              }
              source={result.sources?.case_count || ''}
            />

            <AnalyzeResultCard
              icon={<MessageSquare className="h-4 w-4" />}
              label="Sentimen"
              value={sentimentBadge(result.sentiment)}
              source={result.sources?.sentiment || ''}
            />

            <AnalyzeResultCard
              icon={<Activity className="h-4 w-4" />}
              label="Tipe Kejadian"
              value={
                <span className="capitalize">{result.event_type?.replace(/_/g, ' ') || '-'}</span>
              }
              source={result.sources?.event_type || ''}
            />

            <AnalyzeResultCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="Relevansi Kesehatan"
              value={relevanceBadge(result.relevance_score)}
              source={result.sources?.relevance_score || ''}
            />

            <AnalyzeResultCard
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Outbreak Alert"
              value={alertBadge(result.outbreak_alert)}
              source={result.sources?.outbreak_alert || ''}
            />

            <AnalyzeResultCard
              icon={<Shield className="h-4 w-4" />}
              label="Kredibilitas Sumber"
              value={
                <span>
                  {result.source_credibility != null ? `${(result.source_credibility * 100).toFixed(0)}%` : '-'}
                </span>
              }
              source={result.sources?.source_credibility || ''}
            />

            <AnalyzeResultCard
              icon={<Heart className="h-4 w-4" />}
              label="Health Related"
              value={healthBadge(result.is_health_related)}
              source={result.sources?.is_health_related || ''}
            />
          </div>

          <AseanMap result={result} hideLegend />

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-slate-500" />
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Konten Analisis</span>
            </div>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <div><span className="text-slate-500">Bahasa asli</span><p className="font-semibold">{result.language || '-'}</p></div>
              <div><span className="text-slate-500">Diterjemahkan</span><p className="font-semibold">{result.translated ? 'Ya' : 'Tidak'}</p></div>
              <div><span className="text-slate-500">Provider</span><p className="font-semibold">{result.translation_provider || 'none'}</p></div>
            </div>
            {result.original_location_name && <p className="mt-3 text-xs text-slate-500">Lokasi asli: <span className="font-semibold">{result.original_location_name}</span> → {result.location_name}</p>}
            <details className="mt-4 rounded-lg border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">Lihat main content asli</summary>
              <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{result.content}</p>
            </details>
            {result.translated_text && <details className="mt-2 rounded-lg border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">Lihat hasil terjemahan lokal</summary>
              <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{result.translated_text}</p>
            </details>}
          </div>

          {result.symptoms && result.symptoms.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-slate-500"><Users className="h-4 w-4" /></span>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gejala Terdeteksi</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {result.symptoms.map((s, i) => (
                  <span key={i} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                    {s}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-start gap-1.5">
                <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs leading-relaxed text-slate-500">{result.sources?.symptoms || ''}</p>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-slate-500" />
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Info Tambahan</span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <span className="text-xs text-slate-500">Bahasa</span>
                <p className="text-sm font-semibold text-slate-900">{result.language || '-'}</p>
                <p className="mt-0.5 text-xs text-slate-400">{result.sources?.language || ''}</p>
              </div>
              {result.disease_extracted && result.disease_extracted.length > 0 && (
                <div>
                  <span className="text-xs text-slate-500">Penyakit (Keyword)</span>
                  <p className="text-sm font-semibold text-slate-900">{result.disease_extracted.join(', ')}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{result.sources?.disease_extracted || ''}</p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              <span className="text-sm font-semibold text-emerald-800">Data Tersimpan</span>
            </div>
            <p className="mt-2 text-xs text-emerald-700 leading-relaxed">
              Hasil analisis telah disimpan ke database dan dapat dilihat di halaman{' '}
              <a href="/nlp/events" className="font-semibold underline hover:text-emerald-800">Events</a>.
            </p>
            <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-emerald-600">
              <span>Event ID: <code className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono">{result.event_id}</code></span>
              <span>Raw Report ID: <code className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono">{result.raw_report_id}</code></span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
