'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchReportTemplates } from '@/lib/sitrep-api'

export default function ReportTemplatesPage() {
  const [templates, setTemplates] = useState<Array<{ id: string; version: string; title: string; outline: string[] }>>([])
  useEffect(() => {
    fetchReportTemplates().then(setTemplates).catch(() => setTemplates([]))
  }, [])
  return (
    <div className="space-y-4 px-4 md:px-6">
      <Link href="/reports/cms" className="text-xs font-bold text-[#0060A9]">← Queue</Link>
      <h1 className="text-2xl font-black">Templates</h1>
      {templates.map((tpl) => (
        <section key={`${tpl.id}-${tpl.version}`} className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="font-black">{tpl.title}</h2>
          <p className="text-xs text-slate-500">{tpl.id} · {tpl.version}</p>
          <ol className="mt-3 list-decimal px-4 text-sm">
            {tpl.outline.map((item) => <li key={item}>{item}</li>)}
          </ol>
        </section>
      ))}
    </div>
  )
}
