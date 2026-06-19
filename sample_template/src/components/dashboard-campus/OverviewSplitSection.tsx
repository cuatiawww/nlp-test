'use client'

import { Star } from 'lucide-react'
import { useState } from 'react'
import ProvinceMapOl from './ProvinceMapOl'
import type { DashboardData } from './types'

type OverviewSplitSectionProps = {
  data: DashboardData
}

export default function OverviewSplitSection({ data }: OverviewSplitSectionProps) {
  const [selectedProvince, setSelectedProvince] = useState(data.provinces[0] ?? 'Semua Provinsi')

  return (
    <section className="px-4 pb-5 md:px-6">
      <div className="grid gap-4 xl:grid-cols-3 xl:items-stretch">
        <div className="space-y-4 xl:col-span-1 xl:flex xl:h-[640px] xl:flex-col xl:space-y-0">
          <article className="rounded-xl bg-gradient-to-br from-teal-700 to-cyan-700 p-5 text-white shadow-md xl:flex-[4]">
            <p className="text-sm font-semibold text-teal-100">PR COVID-19 Terkini</p>
            <p className="mt-3 text-5xl font-bold leading-none">{data.summary.average}%</p>
            <p className="mt-1 text-lg text-teal-100">Minggu 23 Tahun 2026</p>
            <div className="mt-5 h-px bg-white/30" />
            <p className="mt-4 text-sm text-teal-100">Kategori</p>
            <div className="mt-1 flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className={`h-4 w-4 ${i <= 4 ? 'fill-yellow-300 text-yellow-300' : 'text-teal-200'}`} />
              ))}
              <span className="ml-1 text-lg font-semibold">{data.summary.category}</span>
            </div>
            <p className="mt-4 text-sm text-emerald-200">{data.summary.delta}</p>
          </article>

          <article className="rounded-xl border border-slate-300 bg-slate-100 p-4 shadow-sm xl:mt-4 xl:flex-[1]">
            <h3 className="text-2xl font-bold text-slate-800">{data.sourceInfo.sourceLabel}:</h3>
            <p className="mt-1 text-base text-slate-700 md:text-lg">{data.sourceInfo.sourceValue}</p>
            <h3 className="mt-4 text-2xl font-bold text-slate-800">{data.sourceInfo.dateLabel}:</h3>
            <p className="mt-1 text-base text-slate-700 md:text-lg">{data.sourceInfo.dateValue}</p>
          </article>
        </div>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2 xl:flex xl:h-[640px] xl:flex-col">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Sebaran Sentinel per Provinsi</h3>
            <select
              value={selectedProvince}
              onChange={(e) => setSelectedProvince(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600"
            >
              {data.provinces.map((province) => (
                <option key={province}>{province}</option>
              ))}
            </select>
          </div>
          <div className="h-[520px] overflow-hidden rounded-xl border border-dashed border-teal-200 bg-[#e6f5f3] xl:h-full xl:flex-1">
            <ProvinceMapOl selectedProvince={selectedProvince} />
          </div>
        </article>
      </div>
    </section>
  )
}
