import PDFDocument from "pdfkit"
import bwipjs from "bwip-js"

/**
 * Barcode label generation for ERP inventory items.
 * Uses Code128 barcodes on 29mm × 62mm labels (Brother DK-22210 continuous).
 *
 * Reference: ERP_WARENWIRTSCHAFT_KONZEPT.md §10.7, INVENTUR_COHORT_A_KONZEPT.md §14
 */

// ─── Constants ─────────────────────────────────────────────────────────────

// 1 mm ≈ 2.835 PDF points
const MM = 2.835
const LABEL_WIDTH = 62 * MM   // 175.77pt
const LABEL_HEIGHT = 29 * MM  // 82.215pt
const MARGIN = 2 * MM         // 5.67pt

// ─── Barcode Image Generation ──────────────────────────────────────────────

/**
 * Generate a Code128 barcode as PNG buffer.
 */
export async function generateBarcodePng(barcode: string): Promise<Buffer> {
  const png = await bwipjs.toBuffer({
    bcid: "code128",
    text: barcode,
    scale: 3,
    height: 8,           // mm (barcode bar height)
    includetext: true,
    textxalign: "center",
    textsize: 8,
  })
  return Buffer.from(png)
}

// ─── Label Data ────────────────────────────────────────────────────────────

export interface LabelData {
  barcode: string          // e.g. "VOD-000001"
  artistName: string       // max 30 chars, will be truncated
  title: string            // max 30 chars, will be truncated
  format: string           // e.g. "LP"
  year: number | null
}

// ─── Single Label PDF ──────────────────────────────────────────────────────

/**
 * Generate a single barcode label as a PDF document.
 * Returns a PDFDocument stream — caller must pipe it.
 *
 * Label layout (29mm × 62mm):
 *   ┌──────────────────────────────────────┐
 *   │  |||||||||||||||||||||||||||||||||||  │  Code128 barcode
 *   │          VOD-003241                  │  (included in barcode image)
 *   │  Cabaret Voltaire                    │  Artist
 *   │  Red Mecca · LP · 1981              │  Title · Format · Year
 *   │  vod-auctions.com                   │  Domain
 *   └──────────────────────────────────────┘
 */
export async function generateLabelPdf(data: LabelData): Promise<typeof PDFDocument.prototype> {
  const doc = new PDFDocument({
    size: [LABEL_WIDTH, LABEL_HEIGHT],
    margin: MARGIN,
  })

  const barcodePng = await generateBarcodePng(data.barcode)

  const contentWidth = LABEL_WIDTH - 2 * MARGIN
  const x = MARGIN
  let y = MARGIN

  // Barcode image (centered, top portion)
  const barcodeWidth = contentWidth * 0.9
  const barcodeHeight = 12 * MM
  const barcodeX = x + (contentWidth - barcodeWidth) / 2
  doc.image(barcodePng, barcodeX, y, {
    width: barcodeWidth,
    height: barcodeHeight,
  })
  y += barcodeHeight + 1 * MM

  // Artist name (truncated)
  const artist = truncate(data.artistName || "Unknown", 34)
  doc.fontSize(5.5).font("Helvetica-Bold").fillColor("#000000")
    .text(artist, x, y, { width: contentWidth, align: "center" })
  y += 6

  // Title · Format · Year
  const parts = [truncate(data.title, 20), data.format, data.year].filter(Boolean)
  doc.fontSize(4.5).font("Helvetica").fillColor("#333333")
    .text(parts.join(" · "), x, y, { width: contentWidth, align: "center" })
  y += 5.5

  // Domain
  doc.fontSize(3.5).font("Helvetica").fillColor("#999999")
    .text("vod-auctions.com", x, y, { width: contentWidth, align: "center" })

  doc.end()
  return doc
}

// ─── Batch Labels PDF ──────────────────────────────────────────────────────

/**
 * Generate a multi-page PDF with one label per page.
 * Each page is 29mm × 62mm — the printer cuts between pages.
 */
export async function generateBatchLabelsPdf(
  labels: LabelData[]
): Promise<typeof PDFDocument.prototype> {
  const doc = new PDFDocument({
    size: [LABEL_WIDTH, LABEL_HEIGHT],
    margin: MARGIN,
    autoFirstPage: false,
  })

  for (const data of labels) {
    doc.addPage({ size: [LABEL_WIDTH, LABEL_HEIGHT], margin: MARGIN })

    const barcodePng = await generateBarcodePng(data.barcode)
    const contentWidth = LABEL_WIDTH - 2 * MARGIN
    const x = MARGIN
    let y = MARGIN

    const barcodeWidth = contentWidth * 0.9
    const barcodeHeight = 12 * MM
    const barcodeX = x + (contentWidth - barcodeWidth) / 2
    doc.image(barcodePng, barcodeX, y, { width: barcodeWidth, height: barcodeHeight })
    y += barcodeHeight + 1 * MM

    const artist = truncate(data.artistName || "Unknown", 34)
    doc.fontSize(5.5).font("Helvetica-Bold").fillColor("#000000")
      .text(artist, x, y, { width: contentWidth, align: "center" })
    y += 6

    const parts = [truncate(data.title, 20), data.format, data.year].filter(Boolean)
    doc.fontSize(4.5).font("Helvetica").fillColor("#333333")
      .text(parts.join(" · "), x, y, { width: contentWidth, align: "center" })
    y += 5.5

    doc.fontSize(3.5).font("Helvetica").fillColor("#999999")
      .text("vod-auctions.com", x, y, { width: contentWidth, align: "center" })
  }

  doc.end()
  return doc
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s
}
