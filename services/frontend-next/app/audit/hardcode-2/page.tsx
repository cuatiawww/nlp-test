'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'

const rawContent = `# HARDCODE AUDIT 2 — Hardcoded Values yang Mempengaruhi Akurasi NLP
# Generated: 2026-06-23 | Completed: 2026-06-23
# Tujuan: Semua hardcoded logic/fallback didinamiskan supaya hasil NLP lebih akurat

====================================================================
 GRUP A: PIPELINE LOGIC OVERRIDES (langsung ubah hasil klasifikasi)
====================================================================

--- A1: KEYWORD MENGESAMPINGKAN MODEL ML ✅ ---
File:    pipeline.py
Kode:    if not extracted: confidence = min(confidence, 0.30); disease = "UNKNOWN"
Sebelum: Model ML 0.75 "COVID-19" → keyword tidak match → dihapus ke UNKNOWN
Sesudah: if not extracted and confidence < LOW_CONFIDENCE_THRESHOLD
Effort:  5 min | Dampak akurasi: TINGGI 🔴

--- A2: FRAGILE SUBSTRING "negative" CHECK ✅ ---
File:    pipeline.py
Kode:    if "negative" in disease.lower() or "not health" in disease.lower()
Sebelum: "seronegative dengue" → ditandai non-health (false negative)
Sesudah: NON_HEALTH_LABELS set-based check + combined A4 logic
Effort:  3 min | Dampak akurasi: SEDANG

--- A3: DISEASE-TO-EVENT OVERRIDE TERLALU AGRESIF ✅ ---
File:    pipeline.py
Kode:    if disease != "UNKNOWN": override event_type + confidence
Sebelum: Artikel banjir + "5 diare" → event_type="disease outbreak" (salah)
Sesudah: if disease != "UNKNOWN" and extracted: (hanya override kalau keyword match)
Effort:  3 min | Dampak akurasi: SEDANG

--- A4: UNKNOWN DISEASE → AUTO NON-HEALTH ✅ ---
File:    pipeline.py
Kode:    if disease == "UNKNOWN": is_health_related = False
Sebelum: Teks vaksinasi/gizi tanpa nama penyakit → non-health (false negative)
Sesudah: if disease == "UNKNOWN" and not has_keywords
Effort:  3 min | Dampak akurasi: SEDANG

====================================================================
 GRUP B: CONFIG HARDCODE FALLBACKS
====================================================================

--- B1: SOURCE_CREDIBILITY_MAP DEAD CODE ✅ ---
File:    config.py
Kode:    Line 32: hardcode fallback; Line 51: overwrite ke empty dict
Sebelum: Jika DB gagal → semua sumber 0.50
Sesudah: Line 51 dihapus. Fallback 0.35-0.95 hidup.
Effort:  1 min | Dampak akurasi: RENDAH

--- B2: OUTBREAK ALERT DEFAULT UNKNOWN=100 ✅ ---
File:    pipeline.py + 017_outbreak_rules_unknown.sql
Kode:    config.OUTBREAK_RULES.get("UNKNOWN", 25)
Sebelum: 25 kasus arbitrary → false alert
Sesudah: SQL seed UNKNOWN=100
Effort:  3 min | Dampak akurasi: SEDANG

--- B3: LOW_CONFIDENCE_THRESHOLD VIA ENV ✅ ---
Status:  Sudah env var. Idealnya via DB (lower priority).
Effort:  - | Dampak akurasi: RENDAH

--- B4: DISEASE MATCHING TOKEN-BASED ✅ ---
File:    pipeline.py
Kode:    (db_name in disease.upper() or disease.upper() in db_name)
Sebelum: "DENGUE" tidak match "DENGUE FEVER DBD"
Sesudah: token-based matching dengan split()
Effort:  5 min | Dampak akurasi: SEDANG

====================================================================
 GRUP C: EXTRACTOR / CLASSIFIER PARAMETERS
====================================================================

--- C1: BAHASA DEFAULT "en" → "unknown" ✅ ---
File:    extractors.py
Kode:    return "en" di fallback langdetect
Sebelum: Thai/Vietnam/Filipina → diasumsikan English
Sesudah: return "unknown" — biarkan NLP model decide
Effort:  2 min | Dampak akurasi: SEDANG-TINGGI

--- C2: MARKER MATCH THRESHOLD VIA ENV ✅ ---
File:    extractors.py
Kode:    max(scores.values()) >= 2 else "id"
Sebelum: 1 marker word → Indonesian
Sesudah: int(os.getenv("LANG_MARKER_MIN_MATCH", "2"))
Effort:  5 min | Dampak akurasi: RENDAH

--- C3: CASE COUNT DEFAULT VIA ENV ✅ ---
File:    extractors.py
Kode:    return _extract_count(text, "case_count", 1)
Sebelum: Teks tanpa angka → 1 kasus → inflasi statistik
Sesudah: int(os.getenv("DEFAULT_CASE_COUNT", "1"))
Effort:  10 min | Dampak akurasi: SEDANG

--- C4: NORMALISASI HAPUS KARAKTER PENTING ✅ ---
File:    extractors.py
Kode:    re.sub(r"[^\\w\\s\\-/:.]", " ", text)
Sebelum: '+' di "COVID-19+", '%' mortality rate dihapus
Sesudah: r"[^\\w\\s\\-/:\.\+%#@]" → +%#@ dipertahankan
Effort:  2 min | Dampak akurasi: RENDAH

--- C5: MODEL TRUNCATION max_length VIA ENV ✅ ---
File:    classifier.py
Kode:    max_length=512
Sebelum: Hardcode 512 tokens
Sesudah: int(os.getenv("NLP_MAX_LENGTH", "512"))
Effort:  3 min | Dampak akurasi: SEDANG

--- C6: BACKEND URL VIA ENV ✅ ---
File:    classifier.py
Kode:    _BACKEND_URL = "http://backend-rust:8080"
Sebelum: URL hardcode
Sesudah: os.getenv("BACKEND_LABELS_URL", "http://backend-rust:8080")
Effort:  2 min | Dampak akurasi: RENDAH

--- C7: ANALYZE URL TRUNCATION VIA ENV ✅ ---
File:    backend-rust/src/main.rs
Kode:    let max_len = 10000;
Sebelum: Web content >10k chars terpotong
Sesudah: env::var("ANALYZE_MAX_CONTENT_LENGTH")
Effort:  5 min | Dampak akurasi: SEDANG

--- C8: LANGUAGE-TO-MODEL MAP DB-DRIVEN ✅ ---
File:    classifier.py, config.py, main.py, main.rs
Kode:    "indobert" if lang=="id" else "xlm-roberta"
Sebelum: Hanya 2 mapping hardcode
Sesudah: DB table + API + frontend CRUD + config loader + auto-download
         7 seed mapping: id→indobert, en/th/vi/tl/my/ms→xlm-roberta
Effort:  45 min | Dampak akurasi: RENDAH-SEDANG

--- C9: LABEL CACHE TTL VIA ENV ✅ ---
File:    classifier.py
Kode:    _LABELS_CACHE_TTL = 60
Sebelum: Hardcode 60 detik cache
Sesudah: int(os.getenv("NLP_LABELS_CACHE_TTL", "60"))
Effort:  2 min | Dampak akurasi: TIDAK

====================================================================
 RINGKASAN FINAL 23-Jun-2026
====================================================================

#   Item                                    Effort   Dampak        Status
─────────────────────────────────────────────────────────────────────────
A1  Keyword override model ML               5 min   TINGGI ✅
A2  Fragile "negative" substring             3 min   SEDANG ✅
A3  Event type override agresif             3 min   SEDANG ✅
A4  UNKNOWN → auto non-health               3 min   SEDANG ✅
B1  SOURCE_CREDIBILITY dead code             1 min   RENDAH ✅
B2  Outbreak threshold UNKNOWN=100           3 min   SEDANG ✅
B3  LOW_CONFIDENCE_THRESHOLD env              -      RENDAH ✅
B4  Disease matching token-based            5 min   SEDANG ✅
C1  Bahasa default "en" → "unknown"         2 min   SEDANG ✅
C2  Marker match threshold                  5 min   RENDAH ✅
C3  Case count default=1                   10 min   SEDANG ✅
C4  Normalisasi +%#@                        2 min   RENDAH ✅
C5  Model truncation env                     3 min   SEDANG ✅
C6  Backend URL env                          2 min   RENDAH ✅
C7  Analyze URL truncation env               5 min   SEDANG ✅
C8  Language→model map                      45 min   RENDAH ✅
C9  Label cache TTL env                      2 min   TIDAK ✅
─────────────────────────────────────────────────────────────────────────
    TOTAL                                   ~2j 10m
    ✅ DIPERBAIKI                           17 items
    [ ] PENDING                              0 items

    ✅ ALL ITEMS COMPLETED 23-Jun-2026

====================================================================
 TEST AKURASI — 10 Test Case pada 23-Jun-2026
====================================================================

| # | Test Case                   | Score   | Status | Catatan                  |
|---|-----------------------------|---------|--------|--------------------------|
| 1 | WHO Hantavirus (EN)          | 6/6     | ✅    | hantavirus + outbreak   |
| 2 | VNExpress Vietnam (VI)       | 2/2     | ✅    | vi language detected    |
| 3 | Rappler PH (EN, 404)         | 1/2     | ⚠️    | URL not found           |
| 4 | WHO Outbreak News (EN)       | 2/2     | ✅    | health related          |
| 5 | Bangkok Post TH (EN)         | 1/1     | ✅    | English detected        |
| 6 | WHO Vietnam (VI/EN)          | 1/2     | ⚠️    | Portal multi-topic      |
| 7 | Borneo Bulletin BN (EN)      | 1/1     | ✅    | English detected        |
| 8 | ReliefWeb Dengue (EN)        | 1/2     | ⚠️    | Mixed flu+dengue        |
| 9 | WHO Thailand (EN/TH)         | 2/2     | ✅    | health related          |
| 10| NST Malaysia (EN)            | 1/1     | ✅    | English detected        |
|    | TOTAL                       | 18/21   | 7✅ 3⚠️ 0 bug NLP ditemukan |`

export default function HardcodeAudit2Page() {
  const [copied, setCopied] = useState(false)
  const [lines] = useState(rawContent.split('\n'))

  function getLineClass(line: string) {
    if (line.startsWith('# ')) return 'text-slate-400 italic'
    if (line.startsWith('HARDCODE AUDIT 2') || line.startsWith(' RINGKASAN') || line.startsWith(' TEST AKURASI') || line.startsWith(' ALL ITEMS') || line.startsWith(' GRUP') || line.startsWith(' DIPERBAIKI'))
      return 'text-teal-700 font-bold mt-4'
    if (line.match(/^--- [A-Z]/)) return 'text-teal-600 font-semibold mt-3'
    if (line.includes('✅')) return 'text-emerald-700'
    if (line.includes('❌')) return 'text-red-600 font-semibold'
    if (line.startsWith('|')) return 'text-slate-700 font-mono text-xs'
    if (line.startsWith('File:') || line.startsWith('Kode:') || line.startsWith('Sebelum:') || line.startsWith('Sesudah:'))
      return 'text-slate-600'
    if (line.startsWith('Effort:')) return 'text-slate-500 text-xs'
    if (line.startsWith('A1') || line.startsWith('A2') || line.startsWith('A3') || line.startsWith('A4') ||
        line.startsWith('B1') || line.startsWith('B2') || line.startsWith('B3') || line.startsWith('B4') ||
        line.startsWith('C1') || line.startsWith('C2') || line.startsWith('C3') || line.startsWith('C4') ||
        line.startsWith('C5') || line.startsWith('C6') || line.startsWith('C7') || line.startsWith('C8') || line.startsWith('C9'))
      return 'text-slate-800 font-mono text-xs'
    if (line.startsWith('TOTAL') && line.includes('~')) return 'text-slate-800 font-mono text-xs font-bold'
    if (line.match(/^[─═]/)) return 'text-slate-300'
    return 'text-slate-600'
  }

  return (
    <div className="px-4 md:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">Hardcode Audit 2</h1>
          <p className="mt-1 text-sm text-slate-500">
            Hardcoded values yang mempengaruhi akurasi NLP — semua 17 item selesai diperbaiki
          </p>
        </div>
        <button onClick={() => { navigator.clipboard.writeText(rawContent); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-3 py-2 text-sm font-bold uppercase text-white hover:bg-teal-700">
          <Download className="h-4 w-4" /> {copied ? 'Copied' : 'Copy'}
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
