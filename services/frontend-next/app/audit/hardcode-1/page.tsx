'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { Download } from 'lucide-react'

const rawContent = `# HARDCORE AUDIT — List Hal yang Perlu DB-Driven
# Generated: 2026-06-19
# Tujuan: Semua nilai statis dipindahkan ke database supaya bisa diedit via frontend tanpa rebuild

============================================================
 SUDAH DB-DRIVEN (✅)
============================================================

| Item                  | Tabel DB                      | Auto-Refresh | Frontend              | Fix Date               |
|-----------------------|-------------------------------|--------------|-----------------------|------------------------|
| Disease labels        | nlp_labels                    | 60 detik     | /nlp-labels           | Sebelum                |
| Event type labels     | nlp_labels                    | 60 detik     | /nlp-labels           | 23-Jun ✅ fixed bypass |
| Sentiment labels      | nlp_labels                    | 60 detik     | /nlp-labels           | 23-Jun ✅ fixed bypass |
| Relevance labels      | nlp_labels                    | 60 detik     | /nlp-labels           | 23-Jun ✅ fixed bypass |

**Catatan:** 23-Jun-2026 — Tiga item di atas sudah ada di DB tapi pipeline.py masih bypass
**Root cause:** pipeline.py panggil classify(text, config.XXX_LABELS) langsung
**Fix:** Ganti jadi classify_sentiment/classify_event_type/classify_relevance + model_key
**File:** pipeline.py:34-36, classifier.py:146-158

| Symptom keywords      | nlp_keywords                  | 60 detik     | /nlp-keywords         |                       |
| Disease keywords      | nlp_keywords                  | 60 detik     | /nlp-keywords         |                       |
| Outbreak rules        | disease_outbreak_rules        | —            | /outbreak-rules       |                       |

============================================================
 MASIH HARDCODE (❌) — PRIORITAS PENGEMBANGAN
============================================================

--- PRIORITAS 1: OUTBREAK ALERT ✅ ---
Status:  ✅ DB-driven — load di startup, fallback 25

--- PRIORITAS 2: LOCATION COORDINATES ✅ ---
Status:  ✅ DB-driven, bisa edit dari /nlp/locations

--- PRIORITAS 3: SOURCE CREDIBILITY ✅ ---
Status:  ✅ DB-driven, bisa edit dari /nlp/source-credibility

--- PRIORITAS 4: EXTRACTION RULES ✅ 23-Jun ---
Status:  ✅ DB-driven, 4 rule via /nlp/extraction-rules

--- PRIORITAS 5: LANGUAGE DETECTION MARKERS ✅ 23-Jun ---
Status:  ✅ DB-driven, 15 markers (en x8, id x7) via /nlp/language-markers

--- PRIORITAS 6: BINARY HEALTH CLASSIFIER LABELS ✅ 23-Jun ---
Status:  ✅ DB-driven via /nlp/nlp-labels?category=binary_health

============================================================
 RINGKASAN
============================================================

Prioritas  Item                     Effort   Status
───────────────────────────────────────────────────────────────
🥇   Outbreak alert dari DB       30 min   ✅ sudah
🥈   Location master data          1 jam    ✅ sudah
🥉   Source credibility           30 min    ✅ sudah
—    Event type labels             5 min    ✅ 23-Jun
—    Sentiment labels              5 min    ✅ 23-Jun
—    Relevance labels              5 min    ✅ 23-Jun
4    Extraction rules              1 jam    ✅ 23-Jun
5    Language markers             30 min    ✅ 23-Jun
6    Binary health labels         15 min    ✅ 23-Jun
───────────────────────────────────────────────────────────────
     ✅ ALL ITEMS COMPLETED — 23-Jun-2026`

export default function HardcodeAudit1Page() {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [lines] = useState(rawContent.split('\n'))

  function getLineClass(line: string) {
    if (line.startsWith('# ')) return 'text-slate-400 italic'
    if (line.includes('HARDCORE AUDIT') || line.includes('RINGKASAN') || line.includes('ALL ITEMS') || line.includes('SUDAH DB-DRIVEN') || line.includes('MASIH HARDCODE'))
      return 'text-teal-700 font-bold mt-4'
    if (line.match(/^---/)) return 'text-teal-600 font-semibold mt-3'
    if (line.includes('✅')) return 'text-emerald-700'
    if (line.includes('❌')) return 'text-red-600 font-semibold'
    if (line.startsWith('|')) return 'text-slate-700 font-mono text-xs'
    if (line.startsWith('**')) return 'text-slate-600'
    if (line.startsWith('Status:') || line.startsWith('Tabel:') || line.startsWith('API:') || line.startsWith('Fix:') || line.startsWith('File:') || line.startsWith('Kode:') || line.startsWith('Effort:') || line.startsWith('Frontend:'))
      return 'text-slate-600'
    if (line.startsWith('Prioritas') || line.startsWith('🥇') || line.startsWith('🥈') || line.startsWith('🥉') || line.startsWith('—') || line.match(/^\d/))
      return 'text-slate-800 font-mono text-xs'
    if (line.match(/^[─═]/)) return 'text-slate-300'
    if (line.match(/^[│├└]/)) return 'text-slate-300 font-mono text-xs'
    return 'text-slate-600'
  }

  return (
    <div className="px-4 md:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">{t('pages.audit.hardcode1Title')}</h1>
          <p className="mt-1 text-sm text-slate-500">Daftar item yang perlu DB-driven — generated 19-Jun-2026, all completed 23-Jun-2026</p>
        </div>
        <button onClick={() => { navigator.clipboard.writeText(rawContent); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-3 py-2 text-sm font-bold uppercase text-white hover:bg-teal-700">
          <Download className="h-4 w-4" /> {copied ? t('common.copied') : t('common.copy')}
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto p-6">
          <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
            {lines.map((line, i) => (
              <div key={i} className={getLineClass(line)}>
                {line || '\u00A0'}
              </div>
            ))}
          </pre>
        </div>
      </div>
    </div>
  )
}
