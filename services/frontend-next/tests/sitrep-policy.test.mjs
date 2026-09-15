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
