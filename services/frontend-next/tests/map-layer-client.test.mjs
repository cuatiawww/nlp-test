import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyLayerError,
  fetchMapLayer,
  LAYER_TTL_MS,
  MAX_CONCURRENT_LAYER_FETCHES,
  resetMapLayerClientForTests,
  seedMapLayerCache,
  statusFromPayload,
} from '../lib/map-layer-client.mjs'

test('cache TTLs match the documented map-layer policy', () => {
  assert.equal(LAYER_TTL_MS.flights, 45_000)
  assert.equal(LAYER_TTL_MS.fires, 180_000)
  assert.equal(LAYER_TTL_MS.news, 180_000)
  assert.equal(LAYER_TTL_MS.environment, 180_000)
  assert.equal(LAYER_TTL_MS.hazards, 180_000)
  assert.equal(LAYER_TTL_MS.facilities, 300_000)
  assert.equal(LAYER_TTL_MS.population, 300_000)
  assert.equal(LAYER_TTL_MS.vectors, 300_000)
  assert.equal(MAX_CONCURRENT_LAYER_FETCHES, 2)
})

test('classifyLayerError maps 503/timeout/auth instead of a generic crash string', () => {
  assert.equal(classifyLayerError({ name: 'AbortError', message: 'aborted' }).aborted, true)
  assert.equal(classifyLayerError(new Error('Service unavailable (503): gateway or upstream overloaded')).state, 'unavailable')
  assert.equal(classifyLayerError(new Error('Layer request timed out')).state, 'timeout')
  assert.equal(classifyLayerError(new Error('Authentication required (401). Sign in or configure the upstream API key.')).state, 'auth')
  assert.equal(classifyLayerError(new Error('GDELT: non-JSON response: Your request was too frequent')).state, 'upstream')
})

test('statusFromPayload distinguishes cached, empty, timeout, and N points', () => {
  assert.equal(statusFromPayload(12, { status: 'ok', source: 'FIRMS' }).state, 'ok')
  assert.match(statusFromPayload(12, { status: 'ok', source: 'FIRMS' }).message, /12 points/)
  assert.equal(statusFromPayload(12, { status: 'ok', cached: true }).state, 'cached')
  assert.equal(statusFromPayload(0, { status: 'ok' }).state, 'empty')
  assert.equal(statusFromPayload(0, { status: 'timeout', error: 'Overpass timed out' }).state, 'timeout')
  assert.equal(statusFromPayload(0, { status: 'auth', error: 'API key required' }).state, 'auth')
})

test('fetchMapLayer reuses a fresh cache and does not call request()', async () => {
  resetMapLayerClientForTests()
  seedMapLayerCache('fires', { status: 'ok', hotspots: [{ id: 1 }] }, 60_000)
  let calls = 0
  const { data, fromCache } = await fetchMapLayer({
    cacheKey: 'fires',
    ttlMs: 60_000,
    request: async () => {
      calls += 1
      return { status: 'ok', hotspots: [] }
    },
  })
  assert.equal(calls, 0)
  assert.equal(fromCache, true)
  assert.equal(data.cached, true)
  assert.equal(data.hotspots.length, 1)
})

test('fetchMapLayer caps concurrent requests at two and honors abort', async () => {
  resetMapLayerClientForTests()
  let started = 0
  let finished = 0
  const blockers = []
  const request = () => new Promise((resolve) => {
    started += 1
    blockers.push(() => {
      finished += 1
      resolve({ status: 'ok', items: [] })
    })
  })

  const p1 = fetchMapLayer({ cacheKey: 'a', ttlMs: 1000, request })
  const p2 = fetchMapLayer({ cacheKey: 'b', ttlMs: 1000, request })
  const ac = new AbortController()
  const p3 = fetchMapLayer({ cacheKey: 'c', ttlMs: 1000, signal: ac.signal, request })
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(started, 2)
  ac.abort()
  await assert.rejects(p3, (err) => err.name === 'AbortError')
  blockers.splice(0).forEach((fn) => fn())
  await Promise.all([p1, p2])
  assert.equal(finished, 2)
})
