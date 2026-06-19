'use client'

import { useState } from 'react'
import ProvinceMapOl from './ProvinceMapOl'
import type { DashboardData } from './types'

type ExtendedSectionsProps = {
  data: DashboardData
}

export default function ExtendedSections({ data }: ExtendedSectionsProps) {
  const [selectedProvince, setSelectedProvince] = useState(data.provinces[0] ?? 'Semua Provinsi')
  const trendMax = Math.max(...data.trend.map((item) => item.value))

  return (
    <section className="px-4 pb-6 md:px-6">
      <div className="grid gap-4 xl:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Distribusi Level Aktivitas</h3>
          <div className="mt-4 space-y-3">
            {data.starDistribution.map((item) => (
              <div key={item.label}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-600">{item.label}</span>
                  <span className="font-semibold text-slate-800">
                    {item.total} ({item.percent}%)
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className={`h-2 rounded-full ${item.tone}`} style={{ width: `${item.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
          <h3 className="text-base font-semibold text-slate-900">Ringkasan Distribusi Level</h3>
          <p className="mt-1 text-xs text-slate-500">Komposisi level aktivitas pada periode pengawasan.</p>
        </article>
      </div>

      <div className="mt-4">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
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
          <div className="h-[440px] overflow-hidden rounded-xl border border-dashed border-teal-200 bg-[#e6f5f3]">
            <ProvinceMapOl selectedProvince={selectedProvince} />
          </div>
        </article>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
          <h3 className="text-base font-semibold text-slate-900">Tren Skor Rata-rata Nasional</h3>
          <div className="mt-4 flex items-end gap-3">
            {data.trend.map((item) => (
              <div key={item.year} className="flex flex-1 flex-col items-center gap-2">
                <div className="text-xs font-semibold text-slate-700">{item.value}</div>
                <div className="flex h-32 w-full items-end rounded-md bg-slate-100">
                  <div
                    className="w-full rounded-md bg-gradient-to-t from-teal-600 to-cyan-500"
                    style={{ height: `${(item.value / trendMax) * 100}%` }}
                  />
                </div>
                <div className="text-xs text-slate-500">{item.year}</div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Top 5 Skor Tertinggi</h3>
          <div className="mt-3 space-y-2">
            {data.topCampuses.map((campus, idx) => (
              <div key={campus.name} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                <div>
                  <p className="text-xs text-slate-500">{idx + 1}.</p>
                  <p className="text-sm font-medium text-slate-800">{campus.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-emerald-600">★ {campus.stars}</p>
                  <p className="text-sm font-semibold text-slate-800">{campus.score}</p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
          <h3 className="text-base font-semibold text-slate-900">Status Proses Surveilans</h3>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            {data.processStatus.map((item) => (
              <div key={item.stage} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className={`h-2 w-full rounded-full ${item.tone}`} />
                <p className="mt-2 text-xs text-slate-500">{item.stage}</p>
                <p className="text-lg font-bold text-slate-800">{item.total}</p>
                <p className="text-xs text-slate-500">{item.percent}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Pemberitahuan & Tindak Lanjut</h3>
          <div className="mt-3 space-y-2">
            {data.notifications.map((item) => (
              <div key={item.text} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${item.tone}`} />
                  <p className="text-sm text-slate-700">{item.text}</p>
                </div>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">{item.total}</span>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Aspek dengan Capaian Terendah</h3>
        <div className="mt-3 space-y-3">
          {data.lowestAspects.map((item) => (
            <div key={item.name}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700">{item.name}</span>
                <span className="font-semibold text-slate-800">
                  {item.score} / 1000 ({item.percent}%)
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div className={`h-2 rounded-full ${item.tone}`} style={{ width: `${item.percent}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
