'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchReportTemplates } from '@/lib/sitrep-api'

export default function ReportTemplatesPage() {
  const [templates, setTemplates] = useState<
    Array<{ id: string; version: string; title: string; outline: string[]; primary?: boolean; family?: string; narrative_keys?: string[] }>
  >([])
  useEffect(() => {
    fetchReportTemplates().then(setTemplates).catch(() => setTemplates([]))
  }, [])
  return (
    <div className="space-y-4 px-4 md:px-6">
      <Link href="/reports/cms" className="text-xs font-bold text-[#0060A9]">← Queue</Link>
      <h1 className="text-2xl font-black">Templates</h1>
      {templates.map((tpl) => (
        <section key={`${tpl.id}-${tpl.version}`} className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="font-black">
            {tpl.title} {tpl.primary ? <span className="text-[10px] uppercase text-[#0060A9]">Primary</span> : null}
          </h2>
          <p className="text-xs text-slate-500">{tpl.id} · {tpl.family} · {tpl.version}</p>
          {tpl.narrative_keys?.length ? (
            <p className="mt-1 text-[11px] text-slate-500">Narrative slots: {tpl.narrative_keys.join(', ')}</p>
          ) : null}
          <ol className="mt-3 list-decimal px-4 text-sm">
            {tpl.outline.map((item) => <li key={item}>{item}</li>)}
          </ol>
        </section>
      ))}
    </div>
  )
}
