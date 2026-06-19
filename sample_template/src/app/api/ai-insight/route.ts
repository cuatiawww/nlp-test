import { NextResponse } from 'next/server'

type InsightResponse = {
  summary: string
  recommendations: string[]
}

function fallbackRecommendationsFromGaps(
  gaps: Array<{ name: string; pct: number }>
): string[] {
  return gaps.slice(0, 4).map((g, i) => {
    const bulan = i + 2
    return `<strong>Fokus ${g.name}</strong> - Prioritaskan intervensi pada gap ${g.pct}% dengan rencana aksi terukur dalam ${bulan} bulan.`
  })
}

function parseInsightText(
  raw: string,
  gaps: Array<{ name: string; pct: number }>
): InsightResponse {
  const text = raw.replace(/\r\n/g, '\n').trim()
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  let summary = ''
  const recommendations: string[] = []
  let inSummary = false
  let inRecommendations = false

  for (const line of lines) {
    const upper = line.toUpperCase()

    if (upper.startsWith('RINGKASAN:')) {
      inSummary = true
      inRecommendations = false
      const v = line.slice(line.indexOf(':') + 1).trim()
      if (v) summary = v
      continue
    }

    if (upper.startsWith('REKOMENDASI:')) {
      inSummary = false
      inRecommendations = true
      continue
    }

    if (inSummary) {
      summary = summary ? `${summary} ${line}` : line
      continue
    }

    if (inRecommendations) {
      const clean = line.replace(/^\d+[\).\s-]*/, '').trim()
      if (clean) recommendations.push(clean)
    }
  }

  // Fallback summary: ambil 1-2 kalimat awal jika label tidak ada.
  if (!summary) {
    const firstParagraph = text.split('\n\n')[0]?.trim() ?? ''
    const sentenceParts = firstParagraph
      .replace(/^#+\s*/, '')
      .split(/(?<=[.!?])\s+/)
      .filter(Boolean)
    summary = sentenceParts.slice(0, 2).join(' ').trim() || lines.slice(0, 2).join(' ')
  }

  // Fallback recommendations: ambil bullet/nomor dari teks jika label REKOMENDASI tidak terdeteksi.
  if (recommendations.length === 0) {
    const bulletCandidates = lines
      .map((line) => line.replace(/^[-*•]\s*/, '').replace(/^\d+[\).\s-]*/, '').trim())
      .filter((line) => line.length > 24 && !/^RINGKASAN[:\s]/i.test(line) && !/^REKOMENDASI[:\s]/i.test(line))

    for (const candidate of bulletCandidates.slice(0, 6)) {
      recommendations.push(candidate)
    }
  }

  if (recommendations.length === 0) {
    recommendations.push(...fallbackRecommendationsFromGaps(gaps))
  }

  return {
    summary,
    recommendations: recommendations.slice(0, 6),
  }
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GOOGLE_AI_API_KEY belum diatur di environment' },
        { status: 500 }
      )
    }

    const body = await req.json()
    const { gaps, stats, criticalProvinces } = body

    const prompt = `
Kamu adalah analis kesehatan senior Kementerian Kesehatan RI.
Berikan analisis singkat dan rekomendasi tindakan berdasarkan data berikut:

STATISTIK NASIONAL:
${stats.map((s: { num: string; label: string }) => `- ${s.label}: ${s.num}`).join('\n')}

GAP TERBESAR:
${gaps.map((g: { rank: number; name: string; pct: number }) => `${g.rank}. ${g.name}: ${g.pct}% gap`).join('\n')}

PROVINSI KRITIS:
${criticalProvinces.join(', ')}

Berikan output PERSIS dalam format teks berikut (tanpa markdown, tanpa code block):
RINGKASAN: <ringkasan 2-3 kalimat>
REKOMENDASI:
1. <strong>Judul 1</strong> - tindakan konkret + target waktu
2. <strong>Judul 2</strong> - tindakan konkret + target waktu
3. <strong>Judul 3</strong> - tindakan konkret + target waktu
4. <strong>Judul 4</strong> - tindakan konkret + target waktu
`

    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1000,
          },
        }),
      }
    )

    if (!res.ok) {
      const errText = await res.text()
      console.error('[ai-insight] Google AI error:', errText)
      return NextResponse.json(
        { error: 'Gagal memproses permintaan AI', detail: errText },
        { status: 500 }
      )
    }

    const data = await res.json()
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text

    if (!raw || typeof raw !== 'string') {
      console.error('[ai-insight] Empty AI response:', data)
      return NextResponse.json(
        { error: 'Respons AI kosong/tidak valid', detail: JSON.stringify(data) },
        { status: 500 }
      )
    }

    const parsed = parseInsightText(raw, gaps)

    if (!parsed?.summary || !Array.isArray(parsed?.recommendations)) {
      return NextResponse.json({
        summary:
          'Analisis otomatis belum sepenuhnya stabil, namun area prioritas tetap terfokus pada penguatan layanan dasar dan pemerataan kualitas fasilitas.',
        recommendations: fallbackRecommendationsFromGaps(gaps),
      })
    }

    return NextResponse.json(parsed)
  } catch (err) {
    console.error('[ai-insight] Error:', err)
    return NextResponse.json(
      { error: 'Gagal memproses permintaan AI', detail: String(err) },
      { status: 500 }
    )
  }
}
