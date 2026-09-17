import { jsPDF } from "jspdf"
import html2canvas from "html2canvas"
import {
  canvasHeightMm,
  flattenPdfTree,
  pdfInnerSize,
  placePdfBlocks,
  tableRowChunks,
  PDF_PAGE,
} from "./pdf-layout.mjs"

export interface GeneratePdfOptions {
  filename?: string
  elementId?: string
  onProgress?: (step: string) => void
}

type PdfNode = {
  id?: string
  el: HTMLElement
  split?: boolean
  grid?: boolean
  atom?: boolean
  pageStart?: boolean
  breakBefore?: boolean
  kids?: PdfNode[]
}

function describePdfNode(el: HTMLElement): PdfNode {
  const kids = Array.from(el.children).filter((node): node is HTMLElement => node instanceof HTMLElement)
  return {
    id: el.id || undefined,
    el,
    split: el.hasAttribute("data-pdf-split") || el.classList.contains("sitrep-chapter"),
    grid: el.classList.contains("grid"),
    atom: el.matches("figure, table, .sitrep-keep, .sitrep-choropleth, .sitrep-major, .sitrep-masthead"),
    pageStart: el.classList.contains("sitrep-page-start") || el.getAttribute("data-pdf-break") === "before",
    kids: kids.map(describePdfNode),
  }
}

function collectPdfBlocks(container: HTMLElement): { el: HTMLElement; breakBefore: boolean }[] {
  const marked = Array.from(container.querySelectorAll<HTMLElement>("[data-pdf-page]")).filter(
    (el) => !el.parentElement?.closest("[data-pdf-page]"),
  )
  const roots = marked.length
    ? marked
    : Array.from(container.querySelectorAll<HTMLElement>(".sitrep-print-page"))
  if (!roots.length) return [{ el: container, breakBefore: false }]

  const blocks: { el: HTMLElement; breakBefore: boolean }[] = []
  for (const root of roots) {
    const tree = describePdfNode(root)
    flattenPdfTree(tree, Boolean(tree.pageStart)).forEach((item) => {
      const el = (item as { el?: HTMLElement }).el || root
      blocks.push({ el, breakBefore: item.breakBefore })
    })
  }
  return blocks
}

function prepareClone(doc: Document, cloned?: HTMLElement) {
  // 1. Inject strict CSS into the cloned document to remove all scrollbars and force visible overflow
  const style = doc.createElement("style")
  style.textContent = `
    * {
      overflow: visible !important;
      max-height: none !important;
      scrollbar-width: none !important;
      -ms-overflow-style: none !important;
    }
    *::-webkit-scrollbar {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
    }
    .sticky, [class*="sticky"] {
      position: static !important;
    }
    table {
      width: 100% !important;
      max-width: 100% !important;
      table-layout: auto !important;
    }
    .no-print, [data-sonner-toaster], .toaster {
      display: none !important;
    }
  `
  doc.head.appendChild(style)

  // 2. Recursively reset scroll positions and force overflow visible on every node
  doc.querySelectorAll<HTMLElement>("*").forEach((node) => {
    if (node.scrollLeft) node.scrollLeft = 0
    if (node.scrollTop) node.scrollTop = 0
    node.style.maxHeight = "none"
    if (
      node.classList.contains("overflow-x-auto") ||
      node.classList.contains("overflow-y-auto") ||
      node.classList.contains("overflow-auto") ||
      node.classList.contains("overflow-hidden") ||
      node.classList.contains("custom-scrollbar")
    ) {
      node.style.overflow = "visible"
    }
  })

  if (cloned) {
    cloned.style.boxSizing = "border-box"
    cloned.style.width = "178mm"
    cloned.style.maxWidth = "178mm"
    cloned.style.background = "#ffffff"
    cloned.style.overflow = "visible"
    const alreadyPadded =
      cloned.classList.contains("sitrep-card") ||
      cloned.classList.contains("sitrep-print-page") ||
      cloned.classList.contains("sitrep-choropleth") ||
      cloned.matches("figure")
    if (!alreadyPadded) {
      cloned.style.padding = "22px 24px"
    }

    cloned.querySelectorAll<HTMLElement>("table").forEach((tbl) => {
      tbl.style.width = "100%"
      tbl.style.maxWidth = "100%"
      if (tbl.parentElement) {
        tbl.parentElement.style.overflow = "visible"
        tbl.parentElement.style.maxHeight = "none"
      }
    })
  }
}

function cloneTableChunk(
  table: HTMLTableElement,
  start: number,
  count: number,
  repeatHeader: boolean,
): HTMLTableElement {
  const clone = table.cloneNode(false) as HTMLTableElement
  const thead = table.querySelector("thead")
  if (thead && (repeatHeader || start === 0)) {
    clone.appendChild(thead.cloneNode(true))
  }
  const sourceRows = Array.from(table.querySelectorAll("tbody tr"))
  const tbody = document.createElement("tbody")
  sourceRows.slice(start, start + count).forEach((row) => tbody.appendChild(row.cloneNode(true)))
  clone.appendChild(tbody)
  return clone
}

function expandTableBlocks(
  block: { el: HTMLElement; breakBefore: boolean },
  innerHeightMm: number,
  host: HTMLElement,
): { el: HTMLElement; breakBefore: boolean }[] {
  const table = block.el.matches("table")
    ? (block.el as HTMLTableElement)
    : block.el.querySelector("table")
  if (!table) return [block]
  const rowCount = table.querySelectorAll("tbody tr").length
  const chunks = tableRowChunks(rowCount, innerHeightMm, 22, 12)
  if (chunks.length <= 1) return [block]

  const heading = block.el.querySelector("h1, h2, h3, caption, [data-pdf-caption]")
  const note = block.el.querySelector("[data-pdf-note]")
  return chunks.map((chunk, index) => {
    const wrap = document.createElement("div")
    wrap.className = "sitrep-card sitrep-keep sitrep-table-wrap"
    wrap.style.cssText = "background:#ffffff;padding:22px 24px;width:178mm;box-sizing:border-box"
    if (index === 0 && heading && !table.contains(heading)) {
      wrap.appendChild(heading.cloneNode(true))
    }
    wrap.appendChild(cloneTableChunk(table, chunk.start, chunk.count, chunk.repeatHeader))
    if (index === chunks.length - 1 && note && !table.contains(note)) {
      wrap.appendChild(note.cloneNode(true))
    }
    host.appendChild(wrap)
    return { el: wrap, breakBefore: index === 0 ? block.breakBefore : false }
  })
}

/**
 * Multi-page A4 PDF. Every card/figure/table-row-group is packed whole.
 * Oversized maps/charts scale to one page; long tables break between rows
 * with a repeated header.
 */
export async function exportReportToPdf({
  filename = "ABVC_Weekly_Situation_Report_Week_38_2026.pdf",
  elementId = "printable-executive-report",
  onProgress,
}: GeneratePdfOptions = {}): Promise<void> {
  const container = document.getElementById(elementId)
  if (!container) {
    throw new Error(`Element with id "${elementId}" not found`)
  }

  onProgress?.("Preparing document pages...")
  const inner = pdfInnerSize()
  const host = document.createElement("div")
  host.setAttribute("data-pdf-scratch", "true")
  host.style.cssText = "position:fixed;left:-12000px;top:0;width:178mm;background:#ffffff;z-index:-1"
  document.body.appendChild(host)

  try {
    const sourceBlocks = collectPdfBlocks(container).flatMap((block) =>
      expandTableBlocks(block, inner.height, host),
    )

    const rendered: { img: string; heightMm: number; breakBefore: boolean }[] = []
    for (let i = 0; i < sourceBlocks.length; i++) {
      onProgress?.(`Rendering section ${i + 1} of ${sourceBlocks.length}...`)
      const canvas = await html2canvas(sourceBlocks[i].el, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        windowWidth: 794,
        onclone: (doc, cloned) => prepareClone(doc, cloned),
        ignoreElements: (element) => element.classList.contains("no-print"),
      })
      rendered.push({
        img: canvas.toDataURL("image/jpeg", 0.96),
        heightMm: canvasHeightMm(canvas.width, canvas.height, inner.width),
        breakBefore: sourceBlocks[i].breakBefore,
      })
    }

    const placements = placePdfBlocks(
      rendered.map((block) => ({ height: block.heightMm, breakBefore: block.breakBefore })),
      inner.height,
      PDF_PAGE.gapMm,
    )

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    })

    let currentPage = 0
    placements.forEach((slot, index) => {
      while (currentPage < slot.page) {
        pdf.addPage("a4", "portrait")
        currentPage += 1
      }
      const block = rendered[index]
      const drawWidth = inner.width * slot.scale
      pdf.addImage(
        block.img,
        "JPEG",
        PDF_PAGE.marginXMm + (inner.width - drawWidth) / 2,
        PDF_PAGE.marginYMm + slot.y,
        drawWidth,
        slot.height,
        undefined,
        "FAST",
      )
    })

    onProgress?.("Saving PDF file...")
    pdf.save(filename)
  } finally {
    host.remove()
  }
}
