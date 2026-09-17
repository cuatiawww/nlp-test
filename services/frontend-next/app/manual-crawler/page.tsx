'use client'

import Link from 'next/link'
import ManualCrawlerPanel from '@/components/ManualCrawlerPanel'

export default function ManualCrawlerPage() {
  return (
    <div className="px-4 md:px-6">
      <div>
        <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">Manual Crawler</h1>
        <p className="mt-1 text-sm text-slate-500">
          Run an on-demand disease surveillance crawl without waiting for the continuous collection pipeline. Stored rows remain in{' '}
          <Link href="/crawl-history" className="font-medium text-[#0060A9] hover:underline">
            Crawl History / Matriks Hasil Crawl
          </Link>
          .
        </p>
      </div>
      <ManualCrawlerPanel />
    </div>
  )
}
