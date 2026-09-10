import type { Metadata } from 'next'
import { Suspense } from 'react'
import RegionalIncidentPage from '@/components/incident/RegionalIncidentPage'

export const metadata: Metadata = {
  title: 'Country Disease Surveillance Profile | Dashboard Surveilans Kemenkes',
  description: 'Profil negara dengan indikator kasus, perbandingan penyakit, tren surveilans, dan pola musiman dari API surveilans.',
}

export default function DetailRegionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0060A9] mr-3" />
          <span>Memuat Dashboard Surveilans Wilayah...</span>
        </div>
      }
    >
      <RegionalIncidentPage />
    </Suspense>
  )
}
