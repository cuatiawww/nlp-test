'use client'

import CrawlMatrixPanel from '@/components/CrawlMatrixPanel'

// The persistence/API contract still uses crawl_matrix_* for backward
// compatibility. The user-facing module is intentionally named Manual Crawler.
export default function ManualCrawlerPanel() {
  return <CrawlMatrixPanel />
}
