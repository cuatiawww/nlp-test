import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('intel click popup is wired for aircraft and other point layers', () => {
  const src = readFileSync(join(root, 'components/AseanMap.tsx'), 'utf8')
  assert.match(src, /selectedIntel &&/)
  assert.match(src, /type === "live_flight"/)
  assert.match(src, /ICAO24 hex/)
  assert.match(src, /Origin \/ destination/)
  assert.match(src, /OpenSky state vectors do not include origin or destination/)
  assert.match(src, /fetchMapEnvironment/)
  assert.match(src, /gibs\.earthdata\.nasa\.gov/)
  assert.match(src, /OMPS_Aerosol_Index\/default/)
  assert.match(src, /AbortController/)
  assert.match(src, /ac\.abort\(\)/)
  assert.match(src, /classifyLayerError/)
  assert.doesNotMatch(src, /OMPS_Aerosol_Index_NM_Pyramid/)
  assert.doesNotMatch(src, /\.catch\(\(\) => \{\}\)/)
})

test('map settings default intel layers off and surface distinct statuses', () => {
  const src = readFileSync(join(root, 'components/SpatialOutbreakMap.tsx'), 'utf8')
  assert.match(src, /fetchMapHazards/)
  assert.match(src, /status=\{layerStatus.flights\}/)
  assert.match(src, /status=\{layerStatus.fires\}/)
  assert.match(src, /intel\.weather/)
  assert.match(src, /intel\.airQuality/)
  assert.match(src, /useState\(false\),\s*\n\s*\[gdacs, setGdacs\] = useState\(false\)/)
  assert.match(src, /vectors: false/)
  assert.match(src, /fires: false/)
  assert.match(src, /state === "timeout"/)
  assert.match(src, /state === "unavailable"/)
  assert.match(src, /ac\.abort\(\)/)
})

test('home and TV routine refresh use kpi-snapshot, not the full public-dashboard blob', () => {
  const home = readFileSync(join(root, 'app/page.tsx'), 'utf8')
  const tv = readFileSync(join(root, 'app/tv/page.tsx'), 'utf8')
  assert.match(home, /refreshKpis/)
  assert.match(home, /setInterval\(\(\) => void refreshKpis\(\), 120_000\)/)
  assert.doesNotMatch(home, /setInterval\(load, 60_000\)/)
  assert.match(tv, /refreshKpis/)
  assert.match(tv, /setInterval\(refreshKpis,120000\)/)
  assert.doesNotMatch(tv, /setInterval\(load,60000\)/)
})

test('API error formatter no longer maps every failure to Terjadi kesalahan pada server', () => {
  const src = readFileSync(join(root, 'lib/api.ts'), 'utf8')
  assert.match(src, /Service unavailable \(503\)/)
  assert.match(src, /Authentication required/)
  assert.doesNotMatch(src, /Terjadi kesalahan pada server/)
  assert.match(src, /fetchMapLayer/)
  assert.match(src, /AbortError/)
})

test('CSP allows NASA GIBS tiles', () => {
  const src = readFileSync(join(root, 'next.config.mjs'), 'utf8')
  assert.match(src, /gibs\.earthdata\.nasa\.gov/)
})
