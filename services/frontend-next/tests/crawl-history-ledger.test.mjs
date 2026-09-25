import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('History ledger GET retries without a bearer token after 401', () => {
  const api = readFileSync(join(root, 'lib/api.ts'), 'utf8')
  assert.match(api, /async function fetchLedger/)
  assert.match(api, /path.includes\("\/api\/v1\/crawl-history"\)/)
  assert.match(api, /res.status === 401 \|\| res.status === 403/)
  assert.match(api, /await attempt\(\{\}\)/)
  assert.match(api, /export function isAuthFailureMessage/)
  assert.match(api, /export function isTimeoutFailureMessage/)
})

test('History case-date formatter keeps a ranged window intact', () => {
  const panel = readFileSync(join(root, 'components/CrawlHistoryPanel.tsx'), 'utf8')
  assert.match(panel, /\\d\{4\}-\\d\{2\}-\\d\{2\} to \\d\{4\}-\\d\{2\}-\\d\{2\}/)
  const rangeCheck = panel.indexOf('YYYY-MM-DD to YYYY-MM-DD')
  const slice = panel.indexOf('text.slice(0, 19)')
  assert.ok(rangeCheck > 0 && slice > rangeCheck)
})

test('History panel does not blame every load failure on an expired session', () => {
  const panel = readFileSync(join(root, 'components/CrawlHistoryPanel.tsx'), 'utf8')
  const en = readFileSync(join(root, 'locales/en.json'), 'utf8')
  assert.match(panel, /isAuthFailureMessage\(loadError\)/)
  assert.match(panel, /isTimeoutFailureMessage\(loadError\)/)
  assert.match(panel, /pages.crawlHistory.signInAgain/)
  assert.match(panel, /\/login\?redirect=/)
  assert.match(en, /loadErrorTimeout/)
  assert.match(en, /loadErrorAuth/)
  assert.match(en, /The ledger query timed out/)
  assert.match(en, /Sign in again — this page requires login/)
  assert.doesNotMatch(
    en,
    /"loadError": "Crawl History could not load stored rows. Sign in again if the session expired/,
  )
})
