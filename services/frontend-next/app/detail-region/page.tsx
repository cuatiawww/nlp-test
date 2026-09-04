import type { Metadata } from 'next'
import { Suspense } from 'react'
import RegionalIncidentPage from '@/components/incident/RegionalIncidentPage'

export const metadata: Metadata = {
  title: 'Pemantauan Penyakit IBS & EBS | Dashboard Surveilans Kemenkes',
  description: 'Pemantauan tren kasus per provinsi berdasarkan hasil Indikator Based Surveillance (IBS) dan Event Based Surveillance (EBS).',
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
