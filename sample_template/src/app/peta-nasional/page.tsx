'use client'

import ProvinceMapOlComponent from '@/components/dashboard-campus/ProvinceMapOl'
import rawData from '@/components/dashboard-campus/dashboard-data.json'
import { useState } from 'react'
import InfoButton from '@/components/layout/InfoButton'

type DashboardData = {
  provinces: string[]
  [key: string]: unknown
}

export default function PetaNasionalPage() {
  const [selectedProvince, setSelectedProvince] = useState('Semua Provinsi')
  const data = rawData as DashboardData

  return (
    <section className="space-y-4 px-4 pb-8 md:px-6">
      <article className="rounded-2xl border border-[#d5e6e5] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[22px] font-bold uppercase tracking-[0.04em] text-slate-900">Peta Distribusi Provinsi/Kabupaten</h2>
            <p className="mt-1 text-base leading-relaxed text-slate-500">Distribusi kasus H3N2 Subclade K dan HMPV per provinsi (data kumulatif).</p>
          </div>
          <select value={selectedProvince} onChange={(e) => setSelectedProvince(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
            {data.provinces.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div className="mt-4 h-[600px] overflow-hidden rounded-xl border border-dashed border-teal-200 bg-[#e6f5f3]">
          <ProvinceMapOlComponent selectedProvince={selectedProvince} />
        </div>
      </article>

      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-sm">
        <p className="text-sm font-semibold text-blue-800">📌 Keterbatasan Data</p>
        <p className="text-xs leading-relaxed text-blue-700">
          Data per kabupaten/kota tidak tersedia dari sumber laporan pengawasan. Peta menampilkan provinsi yang disebut dalam laporan (<strong>10 dari 38 provinsi</strong> memiliki data).
          Provinsi tanpa data akan berwarna abu-abu. Klik provinsi untuk memeriksa ketersediaan data.
        </p>
      </div>

      <article className="rounded-2xl border border-[#d5e6e5] bg-white p-5 shadow-sm">
        <h3 className="text-base font-bold uppercase tracking-[0.04em] text-slate-900">Ringkasan Data Provinsi</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">Berikut adalah provinsi yang disebut dalam laporan pengawasan nasional.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase text-slate-400">Kasus HMPV (2025)</p>
            <p className="mt-1 text-2xl font-extrabold text-slate-400">Tidak Tersedia</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase text-slate-400">Distribusi H3N2</p>
            <p className="mt-1 text-lg font-extrabold text-slate-400">Tidak Tersedia</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase text-slate-400">Sentinel Aktif</p>
            <p className="mt-1 text-2xl font-extrabold text-slate-800">88 fasilitas</p>
            <p className="text-xs text-slate-500">39 Puskesmas, 35 RS, 14 BKK</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase text-slate-400">Provinsi Terdeteksi</p>
            <p className="mt-1 text-2xl font-extrabold text-slate-800">10 dari 38</p>
            <p className="text-xs text-slate-500">Provinsi dengan data laporan</p>
          </div>
        </div>
      </article>

      <article className="rounded-2xl border border-[#d5e6e5] bg-white p-5 shadow-sm">
        <h3 className="text-base font-bold uppercase tracking-[0.04em] text-slate-900">Daftar Kabupaten/Kota per Provinsi</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">Pilih provinsi untuk melihat daftar kabupaten/kota di dalamnya (data per kab/kota tidak tersedia).</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="px-3 py-2 text-left">Provinsi</th>
                <th className="px-3 py-2 text-left">Status Data</th>
                <th className="px-3 py-2 text-left">Kabupaten/Kota</th>
                <th className="px-3 py-2 text-left">Data per Kab/Kota</th>
              </tr>
            </thead>
            <tbody>
              {[
                { p: 'Jawa Timur', s: '✅ Ada', c: '38' },
                { p: 'Kalimantan Selatan', s: '✅ Ada', c: '13' },
                { p: 'DKI Jakarta', s: '✅ Ada', c: '6' },
                { p: 'Jawa Barat', s: '✅ Ada', c: '27' },
                { p: 'Banten', s: '✅ Ada', c: '8' },
                { p: 'Sumatera Selatan', s: '✅ Ada', c: '17' },
                { p: 'DI Yogyakarta', s: '✅ Ada', c: '5' },
                { p: 'Jawa Tengah', s: '✅ Ada', c: '35' },
                { p: 'Kepulauan Riau', s: '✅ Ada', c: '7' },
                { p: 'Bali', s: '✅ Ada', c: '9' },
                { p: 'Provinsi lain (28)', s: '❌ Tidak ada', c: '-' },
              ].map(r => (
                <tr key={r.p} className="border-b hover:bg-teal-50/40">
                  <td className="px-3 py-2 font-medium">{r.p}</td>
                  <td className="px-3 py-2">{r.s}</td>
                  <td className="px-3 py-2">{r.c} kab/kota</td>
                  <td className="px-3 py-2 text-slate-400 italic">Tidak tersedia</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-400">Data per kabupaten/kota tidak tersedia dari sumber laporan pengawasan nasional. Hanya provinsi yang disebut dalam laporan yang memiliki data kumulatif.</p>
      </article>
    </section>
  )
}
