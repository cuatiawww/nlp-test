export const PDF_PAGE: {
  widthMm: number
  heightMm: number
  marginXMm: number
  marginYMm: number
  gapMm: number
}

export function pdfInnerSize(page?: typeof PDF_PAGE): { width: number; height: number }

export function canvasHeightMm(
  canvasWidthPx: number,
  canvasHeightPx: number,
  innerWidthMm: number,
): number

export function placePdfBlocks(
  blocks: Array<number | { height: number; breakBefore?: boolean }>,
  innerHeightMm: number,
  gapMm?: number,
): Array<{ index: number; page: number; y: number; height: number; scale: number }>
