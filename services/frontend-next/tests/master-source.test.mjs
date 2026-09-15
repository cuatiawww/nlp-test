import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const catalog = JSON.parse(readFileSync(join(root, 'lib/data/abvc-master-source.json'), 'utf8'))

function hostnameFromUrl(url) {
  const parsed = new URL(url.includes('://') ? url : `https://${url}`)
  return parsed.hostname.toLowerCase().replace(/^www\./, '')
}

function lookup(url) {
  const host = hostnameFromUrl(url)
  const labels = host.split('.').filter(Boolean)
  for (let i = 0; i < labels.length - 1; i++) {
    const candidate = labels.slice(i).join('.')
    const row = catalog.hosts[candidate]
    if (row) return { host: candidate, ...row }
  }
  return null
}

test('catalog counts match Official vs Unofficial split', () => {
  assert.equal(catalog.count, Object.keys(catalog.hosts).length)
  assert.equal(catalog.main + catalog.other, catalog.count)
  assert.ok(catalog.main >= 400)
  assert.ok(catalog.other >= 800)
})

test('Official catalog hosts are Main Source', () => {
  assert.equal(lookup('https://www.who.int/emergencies').class, 'main')
  assert.equal(lookup('https://www.who.int/emergencies').country, 'Global')
  assert.equal(lookup('https://babel.antaranews.com/berita').class, 'main')
  assert.equal(lookup('https://ddc.moph.go.th/').class, 'main')
})

test('Unofficial / Google-discovered hosts are Other Source', () => {
  assert.equal(lookup('https://163.com/').class, 'other')
  assert.equal(lookup('https://health.kompas.com/read/x').class, 'other')
})

test('exact subdomain wins over parent host', () => {
  assert.equal(lookup('https://bandung.kompas.com/').class, 'main')
  assert.equal(lookup('https://kompas.com/').class, 'other')
})

test('unknown domains stay unlisted', () => {
  assert.equal(lookup('https://example.invalid/article'), null)
})
