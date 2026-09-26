'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Database, FileText, Layers, RefreshCw } from 'lucide-react'
import CrawlerHistoryCleanupPanel from '@/components/CrawlerHistoryCleanupPanel'
import CrawlingLogPanel from '@/components/CrawlingLogPanel'
import { useTranslation } from '@/lib/i18n/LanguageContext'

function CrawlingLogBody() {
  const { t } = useTranslation()
  const [historyVersion, setHistoryVersion] = useState(0)

  return (
    <div className="px-4 md:px-6 py-6 space-y-6 max-w-7xl mx-auto">
      {/* Header & Navigation */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/crawl-history"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0060A9] hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Crawl History & Feed Matrix</span>
            </Link>
          </div>
          <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900 flex items-center gap-2">
            <Database className="h-5 w-5 text-[#0060A9]" />
            Crawling & Collector Run Log
          </h1>
          <p className="mt-1 max-w-3xl text-xs text-slate-500">
            Administrative monitoring for active/completed collector runs, batch task history, raw article metrics, and dataset cleanup controls.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/crawl-history"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
          >
            Feed Matrix
          </Link>
          <Link
            href="/manual-crawler"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
          >
            {t('pages.crawlHistory.openManual') || 'Open Manual Crawler'}
          </Link>
        </div>
      </div>

      {/* 1. Administrative Collector Run Log & Cleanup Controls */}
      <section className="space-y-2">
        <CrawlerHistoryCleanupPanel onCleaned={() => setHistoryVersion((version) => version + 1)} />
      </section>

      {/* 2. Batch Tasks & Collector Execution Jobs Table */}
      <section className="pt-2">
        <CrawlingLogPanel key={historyVersion} />
      </section>
    </div>
  )
}

export default function CrawlingLogPage() {
  return (
    <Suspense fallback={<div className="px-4 py-10 text-sm text-slate-400">Loading crawling log...</div>}>
      <CrawlingLogBody />
    </Suspense>
  )
}
