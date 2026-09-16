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

/**
 * Flatten a section tree into atomic PDF/print blocks.
 * Grids of figures and explicit split sections expand; KPI grids stay whole.
 */
export function flattenPdfTree(node, inheritedBreak = false) {
  if (!node) return []
  const breakBefore = Boolean(inheritedBreak || node.breakBefore || node.pageStart)
  const kids = Array.isArray(node.kids) ? node.kids : []
  const atomKids = kids.filter((kid) => kid.atom)
  const shouldSplit =
    Boolean(node.split) || (Boolean(node.grid) && atomKids.length >= 2)
  if (shouldSplit && kids.length) {
    const out = []
    kids.forEach((kid, index) => {
      const childBreak =
        index === 0 ? breakBefore : Boolean(kid.breakBefore || kid.pageStart)
      out.push(...flattenPdfTree(kid, childBreak))
    })
    return out.length ? out : [{ id: node.id, el: node.el, breakBefore }]
  }
  return [{ id: node.id, el: node.el, breakBefore }]
}

/**
 * Long tables may break between rows, never through a row.
 * Later pages repeat the header (`repeatHeader`).
 */
export function tableRowChunks(
  rowCount,
  innerHeightMm,
  headerMm = 16,
  rowMm = 8,
) {
  const n = Math.max(0, Math.floor(Number(rowCount) || 0))
  const usable = Math.max(rowMm, Number(innerHeightMm) - Number(headerMm) || rowMm)
  const per = Math.max(1, Math.floor(usable / Math.max(1, Number(rowMm) || 8)))
  if (n <= per) {
    return [{ start: 0, count: n, repeatHeader: false }]
  }
  const chunks = []
  for (let start = 0; start < n; start += per) {
    chunks.push({
      start,
      count: Math.min(per, n - start),
      repeatHeader: start > 0,
    })
  }
  return chunks
}
