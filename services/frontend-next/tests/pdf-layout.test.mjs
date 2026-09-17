import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canvasHeightMm,
  flattenPdfTree,
  pdfInnerSize,
  placePdfBlocks,
  tableRowChunks,
  PDF_PAGE,
} from '../lib/pdf-layout.mjs'

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

test('a major TOC card that would straddle starts on the next page', () => {
  const placed = placePdfBlocks([200, 90], 261, 6)
  assert.equal(placed[0].page, 0)
  assert.equal(placed[1].page, 1)
  assert.equal(placed[1].scale, 1)
})

test('canvas height conversion keeps aspect ratio', () => {
  assert.equal(canvasHeightMm(1780, 2610, 178), 261)
})

test('glance KPI grids stay one block', () => {
  const blocks = flattenPdfTree({
    id: 'glance',
    kids: [
      { id: 'h2' },
      {
        id: 'kpis',
        grid: true,
        kids: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }],
      },
    ],
  })
  assert.deepEqual(blocks.map((item) => item.id), ['glance'])
  assert.equal(blocks[0].breakBefore, false)
})

test('cover, publisher, and TOC stay whole cards', () => {
  for (const id of ['cover', 'publisher', 'toc']) {
    const blocks = flattenPdfTree({
      id,
      kids: [{ id: `${id}-title` }, { id: `${id}-body` }],
    })
    assert.deepEqual(blocks.map((item) => item.id), [id])
  }
})

test('disease chapters flatten into subsection blocks that never split a chart', () => {
  const blocks = flattenPdfTree({
    id: 'chapter-dengue',
    split: true,
    pageStart: true,
    kids: [
      { id: 'highlights', atom: true },
      { id: 'table', atom: true },
      {
        id: 'charts',
        grid: true,
        kids: [
          { id: 'curve', atom: true },
          { id: 'weekly', atom: true },
        ],
      },
      { id: 'map', atom: true, pageStart: true },
      { id: 'bar', atom: true },
    ],
  })
  assert.deepEqual(
    blocks.map((item) => item.id),
    ['highlights', 'table', 'curve', 'weekly', 'map', 'bar'],
  )
  assert.deepEqual(
    blocks.map((item) => item.breakBefore),
    [true, false, false, false, true, false],
  )
})

test('weekly chart grids expand into whole figures', () => {
  const blocks = flattenPdfTree({
    id: 'weekly-chart',
    split: true,
    grid: true,
    kids: [
      { id: 'epi', atom: true },
      { id: 'trend', atom: true },
    ],
  })
  assert.deepEqual(blocks.map((item) => item.id), ['epi', 'trend'])
})

test('short tables stay one chunk without a repeated header', () => {
  const chunks = tableRowChunks(11, 261, 22, 12)
  assert.equal(chunks.length, 1)
  assert.deepEqual(chunks[0], { start: 0, count: 11, repeatHeader: false })
})

test('long tables break between rows and repeat the header', () => {
  const chunks = tableRowChunks(40, 261, 22, 12)
  assert.ok(chunks.length >= 2)
  const rows = chunks.flatMap((chunk) =>
    Array.from({ length: chunk.count }, (_, i) => chunk.start + i),
  )
  assert.deepEqual(rows, Array.from({ length: 40 }, (_, i) => i))
  assert.equal(chunks[0].repeatHeader, false)
  assert.ok(chunks.slice(1).every((chunk) => chunk.repeatHeader))
  assert.ok(chunks.every((chunk) => chunk.count >= 1))
})

test('disease matrix table chunks cleanly without slicing rows', () => {
  // A matrix with 25 diseases and 11 AMS columns
  const chunks = tableRowChunks(25, 261, 24, 10)
  assert.ok(chunks.length >= 2)
  assert.equal(chunks[0].start, 0)
  assert.equal(chunks[0].repeatHeader, false)
  assert.equal(chunks[1].repeatHeader, true)
  const total = chunks.reduce((acc, c) => acc + c.count, 0)
  assert.equal(total, 25)
})
