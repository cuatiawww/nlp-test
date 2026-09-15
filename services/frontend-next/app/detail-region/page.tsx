import type { Metadata } from 'next'
import { Suspense } from 'react'
import RegionalDetailPreview from '@/components/incident/RegionalDetailPreview'

export const metadata: Metadata = {
  title: 'Regional Disease Surveillance Profile',
  description: 'Regional disease characteristics, environmental context, mapped signals, case trends, and seasonal patterns.',
}

export default function DetailRegionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0060A9] mr-3" />
          <span>Loading regional surveillance profile...</span>
        </div>
      }
    >
      <RegionalDetailPreview />
    </Suspense>
  )
}
