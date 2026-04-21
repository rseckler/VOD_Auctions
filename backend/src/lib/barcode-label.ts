import PDFDocument from "pdfkit"
import bwipjs from "bwip-js"

/**
 * Barcode label generation for ERP inventory items.
 *
 * Labels are Code128 barcodes on 29mm × 90mm tape, printed on a
 * Brother QL-820NWB with DK-22210 continuous 29mm roll.
 *
 * CRITICAL geometry rules (hardware-validated 2026-04-11, see
 * docs/hardware/BROTHER_QL_820NWB_SETUP.md):
 *
 *   1. PDF page size is 29mm × 90mm PORTRAIT (width = tape width).
 *      NOT 90×29 landscape — the Brother CUPS filter will scale or
 *      clip that to ~29mm squares.
 *   2. Content is drawn in a virtual 90mm × 29mm landscape frame by
 *      applying rotate(-90) + translate(-LABEL_LENGTH, 0) to the
 *      drawing coordinates. Result: when the label exits the printer,
 *      the barcode runs along the long (90mm) edge with the text
 *      legible underneath.
 *   3. The print queue / client must pass
 *      `PageSize=Custom.29x90mm` (with the `Custom.` prefix).
 *      Without the prefix the Brother filter treats it as a DK-11xxx
 *      die-cut preset and falls back to a default cut length.
 *   4. Brother QL-820NWB Command Mode must be set to `Raster` (not
 *      `P-touch Template`). Ship ab Werk is P-touch Template and
 *      ignores CUPS length data — fix via web EWS, see setup doc §3.
 *
 * Layout (hardware-validated v6, 2026-04-11):
 *
 *   ┌────────────────────────────────────────────────┐
 *   │  ||||||||||||||||||||||||| (centered, 70%)    │
 *   │          VOD-000001                            │
 *   │                                                │
 *   │  Artist (12pt bold)               │            │
 *   │  Title · Label (10pt)             │   €45     │
 *   │  LP · UK · VG+ · 1981 (8pt)       │            │
 *   └────────────────────────────────────────────────┘
 *                     90mm × 29mm
 */

// ─── Constants ─────────────────────────────────────────────────────────────

// 1 mm ≈ 2.835 PDF points
const MM = 2.835
const TAPE_WIDTH = 29 * MM    // 82.215pt — PDF portrait width = physical tape width
const LABEL_LENGTH = 90 * MM  // 255.15pt — PDF portrait height = cut length in feed direction
const MARGIN = 2 * MM         // 5.67pt
// Extra right padding for the price column to stay inside the Brother
// hardware margin (~3mm on the long-axis ends of 29mm continuous tape).
const PRICE_RIGHT_PAD = 3 * MM

// ─── Barcode Image Generation ──────────────────────────────────────────────

/**
 * Generate a Code128 barcode as PNG buffer.
 */
export async function generateBarcodePng(barcode: string): Promise<Buffer> {
  const png = await bwipjs.toBuffer({
    bcid: "code128",
    text: barcode,
    scale: 3,
    height: 7,           // bar height in mm pre-scaling
    includetext: true,
    textxalign: "center",
    textsize: 10,
  })
  return Buffer.from(png)
}

// ─── Label Data ────────────────────────────────────────────────────────────

export interface LabelData {
  barcode: string                  // e.g. "VOD-000001"
  artistName: string               // truncated to fit
  title: string                    // truncated to fit
  labelName?: string | null        // record label (e.g. "Mute Records")
  format?: string | null           // e.g. "LP", "7\""
  country?: string | null          // e.g. "UK", "Germany"
  condition?: string | null        // e.g. "VG+", "NM"
  year: number | null
  price?: number | null            // euros, whole numbers (Franks F1 decision)
}

// ─── Shared drawing routine ────────────────────────────────────────────────

/**
 * Draw one label into the currently-active page of `doc`.
 * The page is assumed to be 29mm × 90mm portrait.
 *
 * Rotation trick: we rotate the PDF coordinate system -90° so that
 * everything we draw in a virtual 90×29 landscape frame lands on the
 * portrait page with the barcode running along the long edge.
 */
async function drawLabel(
  doc: typeof PDFDocument.prototype,
  data: LabelData
): Promise<void> {
  const barcodePng = await generateBarcodePng(data.barcode)

  doc.save()
  doc.rotate(-90, { origin: [0, 0] })
  doc.translate(-LABEL_LENGTH, 0)

  const frameW = LABEL_LENGTH   // 90mm
  const frameH = TAPE_WIDTH     // 29mm
  const contentW = frameW - 2 * MARGIN
  const x = MARGIN
  let y = MARGIN

  // ─── Row 1: Barcode, narrower and centered ───────────────────────────
  const barcodeWidth = contentW * 0.70
  const barcodeHeight = 9 * MM
  const barcodeX = x + (contentW - barcodeWidth) / 2
  doc.image(barcodePng, barcodeX, y, {
    width: barcodeWidth,
    height: barcodeHeight,
  })
  y += barcodeHeight + 1 * MM

  // ─── Two-column block: Text (left) + Price (right) ───────────────────
  const priceColW = 22 * MM
  const priceColX = x + contentW - priceColW - PRICE_RIGHT_PAD
  const textColW = priceColX - x - 1 * MM
  const textBlockTop = y
  const textBlockHeight = frameH - y - MARGIN

  // Text column — 3 stacked lines.
  // ellipsis:true + height clip together prevent pdfkit from wrapping
  // long strings into a second visual line (which would overlap the
  // next line's Y position — the bug from Bild 4).
  let ty = y

  // Line 1: Artist (bold)
  doc.fontSize(12).font("Helvetica-Bold").fillColor("#000000")
    .text(truncate(data.artistName || "Unknown", 28), x, ty, {
      width: textColW,
      height: 13,
      align: "left",
      lineBreak: false,
      ellipsis: true,
    })
  ty += 13

  // Line 2: Title · Label
  const titleLine = [
    truncate(data.title || "", 22),
    truncate(data.labelName || "", 22),
  ].filter(Boolean).join(" · ")
  doc.fontSize(10).font("Helvetica").fillColor("#222222")
    .text(titleLine, x, ty, {
      width: textColW,
      height: 11,
      align: "left",
      lineBreak: false,
      ellipsis: true,
    })
  ty += 11

  // Line 3: Format · Country · Condition · Year
  const metaParts = [
    data.format,
    data.country,
    data.condition,
    data.year != null ? String(data.year) : "",
  ].filter(Boolean)
  doc.fontSize(8).font("Helvetica").fillColor("#555555")
    .text(metaParts.join(" · "), x, ty, {
      width: textColW,
      height: 10,
      align: "left",
      lineBreak: false,
      ellipsis: true,
    })

  // Price column — right-aligned, vertically centered in the text block.
  // Omitted entirely if no price is set (price = 0 or null: Franks F2
  // "missing" convention also leaves price = 0 → label still prints but
  // without the price display, useful for stocktake before pricing).
  if (data.price != null && Number(data.price) > 0) {
    const priceText = `€${Math.round(Number(data.price))}`
    const priceFontSize = 22
    doc.fontSize(priceFontSize).font("Helvetica-Bold").fillColor("#000000")
    const priceTextHeight = priceFontSize * 0.85
    const priceY = textBlockTop + (textBlockHeight - priceTextHeight) / 2 - 2
    doc.text(priceText, priceColX, priceY, {
      width: priceColW,
      align: "right",
      lineBreak: false,
    })
  }

  doc.restore()
}

// ─── Single Label PDF ──────────────────────────────────────────────────────

/**
 * Generate a single barcode label as a PDF document.
 * Returns a PDFDocument stream — caller must pipe it.
 *
 * Page size: 29mm × 90mm portrait (matches Brother DK-22210 29mm tape
 * with 90mm cut length when printed via `PageSize=Custom.29x90mm`).
 */
export async function generateLabelPdf(data: LabelData): Promise<typeof PDFDocument.prototype> {
  // autoFirstPage:false + manuelle addPage verhindert, dass pdfkit's
  // internal cursor-tracking nach den text()-Aufrufen eine zweite leere
  // Seite triggert (Preview zeigte sonst "Seite 1 von 2").
  const doc = new PDFDocument({
    size: [TAPE_WIDTH, LABEL_LENGTH],
    margin: 0,
    autoFirstPage: false,
  })
  doc.addPage({ size: [TAPE_WIDTH, LABEL_LENGTH], margin: 0 })

  await drawLabel(doc, data)
  doc.end()
  return doc
}

// ─── Batch Labels PDF ──────────────────────────────────────────────────────

/**
 * Generate a multi-page PDF with one label per page.
 * Each page is 29mm × 90mm portrait — the printer cuts between pages.
 */
export async function generateBatchLabelsPdf(
  labels: LabelData[]
): Promise<typeof PDFDocument.prototype> {
  const doc = new PDFDocument({
    size: [TAPE_WIDTH, LABEL_LENGTH],
    margin: 0,
    autoFirstPage: false,
  })

  for (const data of labels) {
    doc.addPage({ size: [TAPE_WIDTH, LABEL_LENGTH], margin: 0 })
    await drawLabel(doc, data)
  }

  doc.end()
  return doc
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  if (!s) return ""
  return s.length > max ? s.slice(0, max - 1) + "…" : s
}
