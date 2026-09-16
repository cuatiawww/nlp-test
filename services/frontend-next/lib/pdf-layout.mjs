/** A4 portrait geometry used by bulletin print and html2canvas → jsPDF export. */
export const PDF_PAGE = {
  widthMm: 210,
  heightMm: 297,
  marginXMm: 16,
  marginYMm: 18,
  gapMm: 6,
}

export function pdfInnerSize(page = PDF_PAGE) {
  return {
    width: page.widthMm - page.marginXMm * 2,
    height: page.heightMm - page.marginYMm * 2,
  }
}

export function canvasHeightMm(canvasWidthPx, canvasHeightPx, innerWidthMm) {
  if (!canvasWidthPx) return 0
  return (canvasHeightPx * innerWidthMm) / canvasWidthPx
}

/**
 * Pack block heights onto pages without slicing a block across a boundary.
 * A block taller than the printable inner height is scaled to fit one page.
 *
 * @param {Array<number | { height: number, breakBefore?: boolean }>} blocks
 * @param {number} innerHeightMm
 * @param {number} [gapMm]
 */
export function placePdfBlocks(blocks, innerHeightMm, gapMm = PDF_PAGE.gapMm) {
  const inner = Math.max(1, Number(innerHeightMm) || 1)
  const gap = Math.max(0, Number(gapMm) || 0)
  const placements = []
  let page = 0
  let y = 0

  for (let index = 0; index < blocks.length; index += 1) {
    const raw = blocks[index]
    const spec = typeof raw === 'number' ? { height: raw } : raw || {}
    const natural = Math.max(0, Number(spec.height) || 0)
    const height = Math.min(natural, inner)
    const scale = natural > inner && natural > 0 ? inner / natural : 1
    const breakBefore = Boolean(spec.breakBefore)

    if (breakBefore && y > 0) {
      page += 1
      y = 0
    } else if (y > 0 && y + height > inner) {
      page += 1
      y = 0
    }

    placements.push({ index, page, y, height, scale })
    y += height + gap
    if (y >= inner) {
      page += 1
      y = 0
    }
  }

  return placements
}
