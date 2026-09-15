'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchReportTaxonomies } from '@/lib/sitrep-api'

export default function ReportTaxonomiesPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchReportTaxonomies>> | null>(null)
  useEffect(() => {
    fetchReportTaxonomies().then(setData).catch(() => setData(null))
  }, [])
  return (
    <div className="space-y-4 px-4 md:px-6">
      <Link href="/reports/cms" className="text-xs font-bold text-[#0060A9]">← Queue</Link>
      <h1 className="text-2xl font-black">Taxonomies</h1>
      <p className="text-sm text-slate-600">Missing-data policy: {data?.missing_policy || 'no_data_not_zero'}</p>
      <table className="min-w-full rounded-2xl border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">AMS</th>
            <th className="px-3 py-2">ISO3</th>
          </tr>
        </thead>
        <tbody>
          {(data?.ams || []).map((row) => (
            <tr key={row.iso3} className="border-t">
              <td className="px-3 py-2">{row.display_name}</td>
              <td className="px-3 py-2 font-mono">{row.iso3}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
