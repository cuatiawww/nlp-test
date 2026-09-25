'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import CrawlHistoryPanel from '@/components/CrawlHistoryPanel'
import CrawlerHistoryCleanupPanel from '@/components/CrawlerHistoryCleanupPanel'
import { useTranslation } from '@/lib/i18n/LanguageContext'

function CrawlHistoryBody() {
  const { t } = useTranslation()
  const params = useSearchParams()
  const jobId = params.get('job_id') || undefined
  const [historyVersion, setHistoryVersion] = useState(0)

  return (
    <div className="px-4 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">
            {t('pages.crawlHistory.title')}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            {t('pages.crawlHistory.subtitle')}
          </p>
        </div>
        <Link
          href="/manual-crawler"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          {t('pages.crawlHistory.openManual')}
        </Link>
        <Link
          href="#collector-run-log"
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"
        >
          Manage collector run log
        </Link>
      </div>
      <CrawlerHistoryCleanupPanel onCleaned={() => setHistoryVersion((version) => version + 1)} />
      <CrawlHistoryPanel key={historyVersion} initialJobId={jobId} />
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
