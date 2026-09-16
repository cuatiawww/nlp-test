import assert from 'node:assert/strict'
import test from 'node:test'
import { canvasHeightMm, pdfInnerSize, placePdfBlocks, PDF_PAGE } from '../lib/pdf-layout.mjs'

test('A4 inner box leaves generous margins', () => {
  const inner = pdfInnerSize()
  assert.equal(PDF_PAGE.marginXMm, 16)
  assert.equal(PDF_PAGE.marginYMm, 18)
  assert.equal(inner.width, 178)
  assert.equal(inner.height, 261)
})

test('blocks that fit stay on the same page', () => {
  const placed = placePdfBlocks([40, 40, 40], 261, 6)
  assert.deepEqual(placed.map((item) => item.page), [0, 0, 0])
  assert.equal(placed[1].y, 46)
})

test('a block that would be bisected moves to the next page intact', () => {
  const placed = placePdfBlocks([200, 80], 261, 6)
  assert.equal(placed[0].page, 0)
  assert.equal(placed[1].page, 1)
  assert.equal(placed[1].y, 0)
  assert.equal(placed[1].scale, 1)
})

test('an oversized map is scaled onto one page instead of sliced', () => {
  const placed = placePdfBlocks([400], 261, 6)
  assert.equal(placed.length, 1)
  assert.equal(placed[0].page, 0)
  assert.equal(placed[0].height, 261)
  assert.ok(placed[0].scale < 1)
  assert.equal(placed[0].scale, 261 / 400)
})

test('breakBefore starts a choropleth or chapter on a clean page', () => {
  const placed = placePdfBlocks(
    [{ height: 80 }, { height: 120, breakBefore: true }, { height: 90, breakBefore: true }],
    261,
    6,
  )
  assert.deepEqual(placed.map((item) => item.page), [0, 1, 2])
})

test('canvas height conversion keeps aspect ratio', () => {
  assert.equal(canvasHeightMm(1780, 2610, 178), 261)
})
