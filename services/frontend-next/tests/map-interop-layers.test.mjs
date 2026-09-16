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
  assert.doesNotMatch(src, /OMPS_Aerosol_Index_NM_Pyramid/)
  assert.doesNotMatch(src, /\.catch\(\(\) => \{\}\)/)
})

test('map settings surface layer status and ASEAN hazard fetch', () => {
  const src = readFileSync(join(root, 'components/SpatialOutbreakMap.tsx'), 'utf8')
  assert.match(src, /fetchMapHazards/)
  assert.match(src, /status=\{layerStatus.flights\}/)
  assert.match(src, /status=\{layerStatus.fires\}/)
  assert.match(src, /intel\.weather/)
  assert.match(src, /intel\.airQuality/)
})

test('CSP allows NASA GIBS tiles', () => {
  const src = readFileSync(join(root, 'next.config.mjs'), 'utf8')
  assert.match(src, /gibs\.earthdata\.nasa\.gov/)
})
