'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Database, FileText } from 'lucide-react'
import CrawlHistoryPanel from '@/components/CrawlHistoryPanel'
import { useTranslation } from '@/lib/i18n/LanguageContext'

function CrawlHistoryBody() {
  const { t } = useTranslation()
  const params = useSearchParams()
  const jobId = params.get('job_id') || undefined

  return (
    <div className="px-4 md:px-6 py-4 w-full space-y-4">
      {/* Header & Quick Navigation */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">
            {t('pages.crawlHistory.title') || 'CRAWL HISTORY & FEED MATRIX'}
          </h1>
          <p className="mt-1 max-w-3xl text-xs text-slate-500">
            {t('pages.crawlHistory.subtitle') || 'Explore and review monitored articles and disease surveillance events detected across regional feeds.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/manual-crawler"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
          >
            {t('pages.crawlHistory.openManual') || 'Open Manual Crawler'}
          </Link>
          <Link
            href="/crawling-log"
            className="rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100 transition shadow-2xs flex items-center gap-1.5"
          >
            <Database className="h-3.5 w-3.5 text-amber-700" />
            <span>Manage Crawling & Collector Logs →</span>
          </Link>
        </div>
      </div>

      {/* Main Clean Matrix Feed Panel */}
      <CrawlHistoryPanel initialJobId={jobId} />
    </div>
  )
}

export default function CrawlHistoryPage() {
  return (
    <Suspense fallback={<div className="px-4 py-10 text-sm text-slate-400">Loading crawl history...</div>}>
      <CrawlHistoryBody />
    </Suspense>
  )
}
