import assert from 'node:assert/strict'
import test from 'node:test'
import {
  allowedTransition,
  amsDisplayValue,
  classIndex,
  quantileBreaks,
  slugForWeek,
  ASEAN11_ISO3,
} from '../lib/sitrep-policy.mjs'
import {
  buildAmsWeekHeatmap,
  canonicalizeTemplateId,
  heatmapCell,
  slugForEdition,
} from '../lib/publication-templates.mjs'

test('workflow does not allow draft to skip review', () => {
  assert.equal(allowedTransition('draft', 'in_review'), true)
  assert.equal(allowedTransition('draft', 'published'), false)
  assert.equal(allowedTransition('approved', 'published'), true)
  assert.equal(allowedTransition('published', 'draft'), false)
})

test('missing AMS is not displayed as zero', () => {
  const missing = amsDisplayValue({ has_data: false, events: 0, cases: 0 })
  assert.equal(missing.isMissing, true)
  assert.equal(missing.value, null)
  assert.match(missing.label, /No data/)

  const zero = amsDisplayValue({ has_data: true, events: 0, cases: 0 })
  assert.equal(zero.isMissing, false)
  assert.equal(zero.value, 0)
})

test('ISO3 covers ASEAN-11 including Timor-Leste', () => {
  assert.equal(Object.keys(ASEAN11_ISO3).length, 11)
  assert.equal(ASEAN11_ISO3.Vietnam, 'VNM')
  assert.equal(ASEAN11_ISO3.Laos, 'LAO')
  assert.equal(ASEAN11_ISO3['Timor-Leste'], 'TLS')
})

test('quantile class index never assigns missing to class 0', () => {
  const breaks = quantileBreaks([1, 2, 3, 4, 5, 6], 6)
  assert.ok(breaks.length >= 1)
  assert.equal(classIndex(null, breaks), -1)
  assert.notEqual(classIndex(1, breaks), -1)
})

test('slug is stable for a week', () => {
  assert.equal(slugForWeek(2026, 7), 'sitrep-2026-w07')
  assert.equal(slugForWeek(2026, 7, 2), 'sitrep-2026-w07-2')
})

test('publication templates prefer MMWR and SitRep prefixes', () => {
  assert.equal(canonicalizeTemplateId('weekly_sitrep_v1'), 'situation_report_v1')
  assert.equal(canonicalizeTemplateId('mmwr_bulletin_v1'), 'mmwr_bulletin_v1')
  assert.equal(canonicalizeTemplateId('media_monitoring_v1'), 'mmwr_bulletin_v1')
  assert.equal(canonicalizeTemplateId('not-a-template'), null)
  assert.equal(slugForEdition('mmwr_bulletin_v1', 2026, 7), 'mmwr-2026-w07')
  assert.equal(slugForEdition('situation_report_v1', 2026, 7, 2), 'sitrep-2026-w07-2')
  assert.equal(slugForEdition('weekly_sitrep_v1', 2026, 7), 'sitrep-2026-w07')
})

test('heatmap missing cells are not zero', () => {
  const missing = heatmapCell(0, false)
  assert.equal(missing.isMissing, true)
  assert.equal(missing.value, null)
  const presentZero = heatmapCell(0, true)
  assert.equal(presentZero.isMissing, false)
  assert.equal(presentZero.value, 0)

  const weeks = [{ year: 2026, week: 6, label: 'W06' }, { year: 2026, week: 7, label: 'W07' }]
  const grid = buildAmsWeekHeatmap(
    [{ iso3: 'IDN', year: 2026, week: 7, events: 4, has_data: true }],
    weeks,
  )
  assert.equal(grid.length, 11)
  const idn = grid.find((row) => row.iso3 === 'IDN')
  assert.equal(idn.cells[0].isMissing, true)
  assert.equal(idn.cells[0].value, null)
  assert.equal(idn.cells[1].isMissing, false)
  assert.equal(idn.cells[1].value, 4)
  const sgp = grid.find((row) => row.iso3 === 'SGP')
  assert.equal(sgp.cells.every((cell) => cell.isMissing), true)
})
