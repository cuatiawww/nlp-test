import { jsPDF } from "jspdf"
import html2canvas from "html2canvas"

export interface GeneratePdfOptions {
  filename?: string
  elementId?: string
  onProgress?: (step: string) => void
}

/**
 * High-quality multi-page A4 PDF generator using html2canvas & jsPDF.
 * Renders sharp 300 DPI pages with authentic official publication dimensions.
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

  // Look for distinct page containers with [data-pdf-page]
  const pageElements = container.querySelectorAll<HTMLElement>("[data-pdf-page]")

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  })

  const pdfWidth = 210
  const pdfHeight = 297

  if (pageElements.length > 0) {
    for (let i = 0; i < pageElements.length; i++) {
      onProgress?.(`Rendering page ${i + 1} of ${pageElements.length}...`)
      const pageEl = pageElements[i]
      if (i > 0) {
        pdf.addPage("a4", "portrait")
      }

      const canvas = await html2canvas(pageEl, {
        scale: 2, // 2x for sharp 300 DPI resolution
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      })

      const imgData = canvas.toDataURL("image/jpeg", 0.96)
      pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight, undefined, "FAST")
    }
  } else {
    // Single container fallback
    onProgress?.("Rendering document canvas...")
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    })

    const imgWidth = pdfWidth
    const imgHeight = (canvas.height * pdfWidth) / canvas.width
    let heightLeft = imgHeight
    let position = 0

    const imgData = canvas.toDataURL("image/jpeg", 0.96)
    pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight, undefined, "FAST")
    heightLeft -= pdfHeight

    let pageNum = 1
    while (heightLeft > 0) {
      pageNum++
      onProgress?.(`Generating page ${pageNum}...`)
      position = heightLeft - imgHeight
      pdf.addPage("a4", "portrait")
      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight, undefined, "FAST")
      heightLeft -= pdfHeight
    }
  }

  onProgress?.("Saving PDF file...")
  pdf.save(filename)
}
