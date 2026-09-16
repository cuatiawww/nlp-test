import { jsPDF } from "jspdf"
import html2canvas from "html2canvas"
import { canvasHeightMm, pdfInnerSize, placePdfBlocks, PDF_PAGE } from "./pdf-layout.mjs"

export interface GeneratePdfOptions {
  filename?: string
  elementId?: string
  onProgress?: (step: string) => void
}

function collectPdfBlocks(container: HTMLElement): { el: HTMLElement; breakBefore: boolean }[] {
  const marked = Array.from(container.querySelectorAll<HTMLElement>("[data-pdf-page]"))
  const roots = marked.length
    ? marked
    : Array.from(container.querySelectorAll<HTMLElement>(".sitrep-print-page"))
  if (!roots.length) return [{ el: container, breakBefore: false }]

  const blocks: { el: HTMLElement; breakBefore: boolean }[] = []
  for (const root of roots) {
    const breakBefore =
      root.classList.contains("sitrep-page-start") ||
      root.getAttribute("data-pdf-break") === "before"
    const split = root.hasAttribute("data-pdf-split")
      ? Array.from(root.children).filter((node): node is HTMLElement => node instanceof HTMLElement)
      : []
    if (split.length >= 2) {
      split.forEach((el, index) => {
        blocks.push({
          el,
          breakBefore:
            index === 0
              ? breakBefore
              : el.classList.contains("sitrep-page-start") || el.getAttribute("data-pdf-break") === "before",
        })
      })
    } else {
      blocks.push({ el: root, breakBefore })
    }
  }
  return blocks
}

function prepareClone(doc: Document) {
  doc.querySelectorAll<HTMLElement>(".sitrep-choropleth ul, .sitrep-keep").forEach((node) => {
    node.style.maxHeight = "none"
    node.style.overflow = "visible"
  })
}

/**
 * Multi-page A4 PDF. Blocks are packed with page margins and never sliced
 * mid-card / mid-map — oversized blocks are scaled to fit one page.
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
  const sourceBlocks = collectPdfBlocks(container)
  const inner = pdfInnerSize()

  const rendered: { img: string; widthMm: number; heightMm: number; breakBefore: boolean }[] = []
  for (let i = 0; i < sourceBlocks.length; i++) {
    onProgress?.(`Rendering section ${i + 1} of ${sourceBlocks.length}...`)
    const canvas = await html2canvas(sourceBlocks[i].el, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      onclone: prepareClone,
    })
    rendered.push({
      img: canvas.toDataURL("image/jpeg", 0.96),
      widthMm: inner.width,
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
    const drawHeight = slot.height
    pdf.addImage(
      block.img,
      "JPEG",
      PDF_PAGE.marginXMm + (inner.width - drawWidth) / 2,
      PDF_PAGE.marginYMm + slot.y,
      drawWidth,
      drawHeight,
      undefined,
      "FAST",
    )
  })

  onProgress?.("Saving PDF file...")
  pdf.save(filename)
}
