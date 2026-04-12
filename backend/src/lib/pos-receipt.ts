import PDFDocument from "pdfkit"

export interface ReceiptData {
  orderNumber: string
  date: string
  items: Array<{
    title: string
    artist_name: string | null
    format: string | null
    price: number
  }>
  subtotal: number
  discount: number
  total: number
  taxAmount: number
  taxRate: number
  paymentProvider: string
  customerName: string | null
  isDryRun: boolean
}

const GOLD = "#b8941f"
const DARK = "#1c1915"
const GRAY = "#666666"
const LIGHT_GRAY = "#f5f0e8"

const PAYMENT_LABELS: Record<string, string> = {
  sumup: "SumUp Kartenzahlung",
  cash: "Barzahlung",
  paypal: "PayPal",
  bank_transfer: "Überweisung",
}

/**
 * Generate a POS receipt as A6 PDF (105x148mm).
 * Dry-Run mode: no TSE signature, footer shows "Dry-Run" notice.
 */
export function generateReceiptPDF(data: ReceiptData): typeof PDFDocument.prototype {
  // A6 size in points: 105mm x 148mm = 297.64 x 419.53
  const doc = new PDFDocument({
    size: [297.64, 419.53],
    margin: 20,
  })

  const leftMargin = 20
  const rightEdge = 297.64 - 20
  const contentWidth = rightEdge - leftMargin
  let y = 20

  // ── HEADER ──
  doc.fontSize(14).font("Helvetica-Bold").fillColor(DARK)
    .text("VOD RECORDS", leftMargin, y, { width: contentWidth, align: "center" })
  y += 18

  doc.fontSize(7).font("Helvetica").fillColor(GRAY)
    .text("vod-auctions.com", leftMargin, y, { width: contentWidth, align: "center" })
  y += 10
  doc.text("Frank Oppermann · Osnabrücker Str. 230 · 49205 Hasbergen", leftMargin, y, { width: contentWidth, align: "center" })
  y += 14

  // ── SEPARATOR ──
  drawLine(doc, leftMargin, y, rightEdge)
  y += 8

  // ── BON INFO ──
  doc.fontSize(8).font("Helvetica-Bold").fillColor(DARK)
    .text(`Bon-Nr: ${data.orderNumber}`, leftMargin, y)
  doc.fontSize(8).font("Helvetica").fillColor(GRAY)
    .text(data.date, leftMargin, y, { width: contentWidth, align: "right" })
  y += 16

  drawLine(doc, leftMargin, y, rightEdge)
  y += 8

  // ── ITEMS ──
  for (const item of data.items) {
    // Artist + Title
    const displayName = item.artist_name
      ? `${item.artist_name} — ${item.title}`
      : item.title
    doc.fontSize(8).font("Helvetica-Bold").fillColor(DARK)
      .text(displayName, leftMargin, y, { width: contentWidth - 50 })
    // Price right-aligned
    doc.fontSize(8).font("Helvetica-Bold").fillColor(DARK)
      .text(`€${item.price.toFixed(2)}`, leftMargin, y, { width: contentWidth, align: "right" })
    y += 12

    // Format detail
    if (item.format) {
      doc.fontSize(7).font("Helvetica").fillColor(GRAY)
        .text(item.format, leftMargin + 8, y)
      y += 10
    }

    y += 2
  }

  // ── SEPARATOR ──
  drawLine(doc, leftMargin, y, rightEdge)
  y += 8

  // ── TOTALS ──
  if (data.items.length > 1) {
    doc.fontSize(8).font("Helvetica").fillColor(GRAY)
      .text("Zwischensumme:", leftMargin, y)
      .text(`€${data.subtotal.toFixed(2)}`, leftMargin, y, { width: contentWidth, align: "right" })
    y += 12
  }

  if (data.discount > 0) {
    doc.fontSize(8).font("Helvetica").fillColor(GRAY)
      .text("Rabatt:", leftMargin, y)
      .text(`-€${data.discount.toFixed(2)}`, leftMargin, y, { width: contentWidth, align: "right" })
    y += 12
  }

  doc.fontSize(8).font("Helvetica").fillColor(GRAY)
    .text(`MwSt ${data.taxRate.toFixed(0)}% (enthalten):`, leftMargin, y)
    .text(`€${data.taxAmount.toFixed(2)}`, leftMargin, y, { width: contentWidth, align: "right" })
  y += 14

  drawLine(doc, leftMargin, y, rightEdge)
  y += 6

  doc.fontSize(12).font("Helvetica-Bold").fillColor(DARK)
    .text("GESAMT:", leftMargin, y)
    .text(`€${data.total.toFixed(2)}`, leftMargin, y, { width: contentWidth, align: "right" })
  y += 20

  // ── PAYMENT ──
  doc.fontSize(8).font("Helvetica").fillColor(GRAY)
    .text(`Zahlung: ${PAYMENT_LABELS[data.paymentProvider] || data.paymentProvider}`, leftMargin, y)
  y += 12

  if (data.customerName) {
    doc.text(`Kunde: ${data.customerName}`, leftMargin, y)
    y += 12
  }

  // ── DRY-RUN NOTICE ──
  if (data.isDryRun) {
    y += 6
    drawLine(doc, leftMargin, y, rightEdge)
    y += 8
    doc.fontSize(7).font("Helvetica-Bold").fillColor("#cc6600")
      .text("DRY-RUN — Keine TSE-Signatur", leftMargin, y, { width: contentWidth, align: "center" })
    y += 10
    doc.fontSize(6).font("Helvetica").fillColor(GRAY)
      .text("Dieser Beleg ist nicht KassenSichV-konform.", leftMargin, y, { width: contentWidth, align: "center" })
    y += 14
  }

  // ── FOOTER ──
  drawLine(doc, leftMargin, y, rightEdge)
  y += 8
  doc.fontSize(7).font("Helvetica").fillColor(GRAY)
    .text("Vielen Dank für Ihren Einkauf!", leftMargin, y, { width: contentWidth, align: "center" })

  doc.end()
  return doc
}

function drawLine(doc: any, x1: number, y: number, x2: number) {
  doc.strokeColor("#d4c9b5").lineWidth(0.5).moveTo(x1, y).lineTo(x2, y).stroke()
}
