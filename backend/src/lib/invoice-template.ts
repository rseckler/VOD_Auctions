import PDFDocument from "pdfkit"

export type InvoiceData = {
  invoiceNumber: string
  invoiceDate: string
  customer: {
    name: string
    address: string
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

export function generateInvoicePDF(data: InvoiceData): typeof PDFDocument.prototype {
  const doc = new PDFDocument({ size: "A4", margin: 50 })

  // Header: VOD Records
  doc.fontSize(20).font("Helvetica-Bold").text("VOD Records", 50, 50)
  doc
    .fontSize(10)
    .font("Helvetica")
    .text("Frank Bull", 50, 75)
    .text("Alpenstrasse 25/1", 50, 87)
    .text("4020 Linz, Austria", 50, 99)
    .text("info@vod-records.com", 50, 111)

  // INVOICE title (right-aligned)
  doc
    .fontSize(24)
    .font("Helvetica-Bold")
    .text("INVOICE", 400, 50, { align: "right" })
  doc
    .fontSize(10)
    .font("Helvetica")
    .text(`Invoice: ${data.invoiceNumber}`, 400, 80, { align: "right" })
    .text(`Date: ${data.invoiceDate}`, 400, 92, { align: "right" })

  // Customer address
  doc.fontSize(10).font("Helvetica-Bold").text("Bill to:", 50, 160)
  doc
    .font("Helvetica")
    .text(data.customer.name, 50, 175)
    .text(data.customer.address, 50, 187)
    .text(
      `${data.customer.postalCode} ${data.customer.city}`.trim(),
      50,
      199
    )
    .text(data.customer.country, 50, 211)

  // Items table header
  let y = 260
  doc.font("Helvetica-Bold").fontSize(9)
  doc.text("Art. No.", 50, y, { width: 80 })
  doc.text("Description", 130, y, { width: 280 })
  doc.text("Type", 410, y, { width: 60 })
  doc.text("Amount", 470, y, { width: 80, align: "right" })
  y += 15
  doc.moveTo(50, y).lineTo(545, y).stroke()
  y += 10

  // Items
  doc.font("Helvetica").fontSize(9)
  for (const item of data.items) {
    doc.text(item.articleNumber || "\u2014", 50, y, { width: 80 })
    doc.text(item.description, 130, y, { width: 280 })
    doc.text(item.type, 410, y, { width: 60 })
    doc.text(`\u20AC${item.amount.toFixed(2)}`, 470, y, {
      width: 80,
      align: "right",
    })
    y += 18
    if (y > 700) {
      doc.addPage()
      y = 50
    }
  }

  // Summary
  y += 10
  doc.moveTo(350, y).lineTo(545, y).stroke()
  y += 10
  doc.text("Subtotal:", 350, y)
  doc.text(`\u20AC${data.subtotal.toFixed(2)}`, 470, y, {
    width: 80,
    align: "right",
  })
  y += 15
  doc.text("Shipping:", 350, y)
  doc.text(`\u20AC${data.shippingCost.toFixed(2)}`, 470, y, {
    width: 80,
    align: "right",
  })
  y += 15
  if (data.discountAmount > 0) {
    doc.text("Discount:", 350, y)
    doc.text(`-\u20AC${data.discountAmount.toFixed(2)}`, 470, y, {
      width: 80,
      align: "right",
    })
    y += 15
  }
  doc.moveTo(350, y).lineTo(545, y).stroke()
  y += 10
  doc.font("Helvetica-Bold").fontSize(11)
  doc.text("Total:", 350, y)
  doc.text(`\u20AC${data.total.toFixed(2)}`, 470, y, {
    width: 80,
    align: "right",
  })

  // Footer
  doc.font("Helvetica").fontSize(8)
  doc.text(
    "Kleinunternehmer gem\u00E4\u00DF \u00A7 19 UStG \u2014 keine Umsatzsteuer ausgewiesen.",
    50,
    750
  )
  doc.text("Payment processed by Stripe.", 50, 762)

  return doc
}
