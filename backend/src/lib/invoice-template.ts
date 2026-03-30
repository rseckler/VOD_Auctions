import PDFDocument from "pdfkit"

export type InvoiceData = {
  invoiceNumber: string
  invoiceDate: string
  customer: {
    name: string
    address: string
    address2?: string
    city: string
    postalCode: string
    country: string
  }
  items: Array<{
    articleNumber: string
    description: string
    type: string
    amount: number
  }>
  subtotal: number
  shippingCost: number
  discountAmount: number
  total: number
}

const GOLD = "#b8941f"
const DARK = "#1c1915"
const GRAY = "#666666"
const LIGHT_GRAY = "#f5f0e8"
const LINE_COLOR = "#d4c9b5"

function drawLine(doc: any, x1: number, y: number, x2: number, color = LINE_COLOR) {
  doc.strokeColor(color).lineWidth(0.5).moveTo(x1, y).lineTo(x2, y).stroke()
}

export function generateInvoicePDF(data: InvoiceData): typeof PDFDocument.prototype {
  const doc = new PDFDocument({ size: "A4", margin: 50 })
  const pageWidth = 595.28
  const leftMargin = 50
  const rightEdge = pageWidth - 50

  // ── HEADER BAR ──
  doc.rect(0, 0, pageWidth, 90).fill(DARK)

  // Logo text
  doc.fontSize(22).font("Helvetica-Bold").fillColor("#ffffff").text("VOD", leftMargin, 25)
  doc.fontSize(22).font("Helvetica-Bold").fillColor(GOLD).text(" RECORDS", leftMargin + 42, 25)

  // INVOICE label
  doc.fontSize(28).font("Helvetica-Bold").fillColor("#ffffff")
    .text("INVOICE", 0, 28, { align: "right", width: rightEdge })

  // Invoice meta below header in dark bar
  doc.fontSize(9).font("Helvetica").fillColor("#cccccc")
    .text(`No: ${data.invoiceNumber}`, 0, 62, { align: "right", width: rightEdge })
    .text(`Date: ${data.invoiceDate}`, 0, 74, { align: "right", width: rightEdge })

  // ── SELLER + CUSTOMER (two columns) ──
  let y = 110

  // Seller (left)
  doc.fontSize(8).font("Helvetica-Bold").fillColor(GOLD).text("FROM", leftMargin, y)
  y += 14
  doc.fontSize(10).font("Helvetica-Bold").fillColor(DARK).text("VOD-Records", leftMargin, y)
  y += 14
  doc.fontSize(9).font("Helvetica").fillColor(GRAY)
    .text("Frank Bull", leftMargin, y)
    .text("Eugenstrasse 57/2", leftMargin, y + 12)
    .text("88045 Friedrichshafen", leftMargin, y + 24)
    .text("Germany", leftMargin, y + 36)
  y += 54
  doc.fontSize(8).font("Helvetica").fillColor(GRAY)
    .text("Phone: +49 7541 34412", leftMargin, y)
    .text("Email: frank@vinyl-on-demand.com", leftMargin, y + 11)
    .text("Web: www.vod-auctions.com", leftMargin, y + 22)
    .text("VAT ID: DE232493058", leftMargin, y + 33)

  // Customer (right)
  const custX = 320
  let cy = 110
  doc.fontSize(8).font("Helvetica-Bold").fillColor(GOLD).text("BILL TO", custX, cy)
  cy += 14
  doc.fontSize(10).font("Helvetica-Bold").fillColor(DARK).text(data.customer.name || "Customer", custX, cy)
  cy += 14
  doc.fontSize(9).font("Helvetica").fillColor(GRAY)
  if (data.customer.address) { doc.text(data.customer.address, custX, cy); cy += 12 }
  if (data.customer.address2) { doc.text(data.customer.address2, custX, cy); cy += 12 }
  const cityLine = [data.customer.postalCode, data.customer.city].filter(Boolean).join(" ")
  if (cityLine) { doc.text(cityLine, custX, cy); cy += 12 }
  if (data.customer.country) { doc.text(data.customer.country, custX, cy) }

  // ── ITEMS TABLE ──
  y = 250
  const colArt = leftMargin
  const colDesc = 120
  const colType = 400
  const colAmount = rightEdge

  // Table header background
  doc.rect(leftMargin - 5, y - 4, rightEdge - leftMargin + 10, 20).fill(DARK)
  doc.fontSize(8).font("Helvetica-Bold").fillColor("#ffffff")
    .text("ART. NO.", colArt, y, { width: 65 })
    .text("DESCRIPTION", colDesc, y, { width: 270 })
    .text("TYPE", colType, y, { width: 55 })
    .text("AMOUNT", colAmount - 80, y, { width: 80, align: "right" })
  y += 24

  // Table rows
  let isAlternate = false
  for (const item of data.items) {
    if (isAlternate) {
      doc.rect(leftMargin - 5, y - 3, rightEdge - leftMargin + 10, 20).fill(LIGHT_GRAY)
    }

    doc.fontSize(8).font("Helvetica").fillColor(DARK)
      .text(item.articleNumber || "\u2014", colArt, y, { width: 65 })
    doc.fontSize(8).font("Helvetica").fillColor(DARK)
      .text(item.description, colDesc, y, { width: 275, lineBreak: false })
    doc.fontSize(8).font("Helvetica").fillColor(GRAY)
      .text(item.type === "direct_purchase" ? "Purchase" : item.type === "auction" ? "Auction" : item.type, colType, y, { width: 55 })
    doc.fontSize(9).font("Helvetica-Bold").fillColor(DARK)
      .text(`\u20AC${item.amount.toFixed(2)}`, colAmount - 80, y, { width: 80, align: "right" })

    y += 22
    isAlternate = !isAlternate

    if (y > 680) {
      doc.addPage()
      y = 50
      isAlternate = false
    }
  }

  // ── SUMMARY ──
  y += 15
  drawLine(doc, 320, y, rightEdge, GOLD)
  y += 12

  const summaryLabelX = 340
  const summaryValueX = rightEdge - 80

  // Net amount (Nettobetrag)
  const vatRate = 0.19
  const netAmount = data.subtotal / (1 + vatRate)
  const vatAmount = data.subtotal - netAmount

  doc.fontSize(9).font("Helvetica").fillColor(GRAY)
    .text("Subtotal (incl. VAT)", summaryLabelX, y)
  doc.fontSize(9).font("Helvetica").fillColor(DARK)
    .text(`\u20AC${data.subtotal.toFixed(2)}`, summaryValueX, y, { width: 80, align: "right" })
  y += 16

  doc.fontSize(9).font("Helvetica").fillColor(GRAY)
    .text("Shipping", summaryLabelX, y)
  doc.fontSize(9).font("Helvetica").fillColor(DARK)
    .text(`\u20AC${data.shippingCost.toFixed(2)}`, summaryValueX, y, { width: 80, align: "right" })
  y += 16

  if (data.discountAmount > 0) {
    doc.fontSize(9).font("Helvetica").fillColor(GRAY)
      .text("Discount", summaryLabelX, y)
    doc.fontSize(9).font("Helvetica").fillColor("#16a34a")
      .text(`-\u20AC${data.discountAmount.toFixed(2)}`, summaryValueX, y, { width: 80, align: "right" })
    y += 16
  }

  // VAT breakdown
  doc.fontSize(8).font("Helvetica").fillColor(GRAY)
    .text(`Net amount`, summaryLabelX, y)
  doc.fontSize(8).font("Helvetica").fillColor(GRAY)
    .text(`\u20AC${netAmount.toFixed(2)}`, summaryValueX, y, { width: 80, align: "right" })
  y += 13
  doc.fontSize(8).font("Helvetica").fillColor(GRAY)
    .text(`VAT 19%`, summaryLabelX, y)
  doc.fontSize(8).font("Helvetica").fillColor(GRAY)
    .text(`\u20AC${vatAmount.toFixed(2)}`, summaryValueX, y, { width: 80, align: "right" })
  y += 16

  // Total row with gold background
  y += 4
  doc.rect(320, y - 4, rightEdge - 320 + 5, 26).fill(GOLD)
  doc.fontSize(11).font("Helvetica-Bold").fillColor("#ffffff")
    .text("TOTAL", summaryLabelX, y + 2)
    .text(`\u20AC${data.total.toFixed(2)}`, summaryValueX, y + 2, { width: 80, align: "right" })

  // ── FOOTER ──
  const footerY = 730
  drawLine(doc, leftMargin, footerY, rightEdge, LINE_COLOR)

  doc.fontSize(7.5).font("Helvetica").fillColor(GRAY)
    .text(
      "All prices include 19% VAT (USt-IdNr: DE232493058).",
      leftMargin, footerY + 8
    )
    .text(
      "Payment processed securely by Stripe.",
      leftMargin, footerY + 20
    )
    .text(
      "VOD-Records \u2022 Frank Bull \u2022 Eugenstrasse 57/2 \u2022 88045 Friedrichshafen \u2022 Germany",
      leftMargin, footerY + 32
    )
    .text(
      "Phone: +49 7541 34412 \u2022 frank@vinyl-on-demand.com \u2022 www.vod-auctions.com",
      leftMargin, footerY + 44
    )

  return doc
}
