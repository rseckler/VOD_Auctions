import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import PDFDocument from "pdfkit"

const DARK = "#1c1915"
const GOLD = "#d4a54a"
const GRAY = "#666666"
const LINE_COLOR = "#d4c9b5"

function drawLine(doc: any, x1: number, y: number, x2: number, color = LINE_COLOR) {
  doc.strokeColor(color).lineWidth(0.5).moveTo(x1, y).lineTo(x2, y).stroke()
}

// GET /admin/transactions/:id/shipping-label
// Generates a shipping label PDF for a transaction (or all transactions in an order group)
// Also sets label_printed_at = NOW() on the transaction(s)
//
// Required DB column (run once if not exists):
// ALTER TABLE transaction ADD COLUMN IF NOT EXISTS label_printed_at TIMESTAMP;
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { id } = req.params
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    // Fetch the base transaction
    const baseTx = await pgConnection("transaction").where("id", id).first()
    if (!baseTx) {
      res.status(404).json({ message: "Transaction not found" })
      return
    }

    // Fetch all transactions in the same order group (or just this one)
    const orderGroupId = baseTx.order_group_id || baseTx.id
    const transactions = baseTx.order_group_id
      ? await pgConnection("transaction")
          .where("order_group_id", orderGroupId)
          .orderBy("created_at", "asc")
      : [baseTx]

    // Enrich with Release + lot data
    const enrichedItems: Array<{
      lot_number: number | null
      artist_name: string
      release_title: string
    }> = []

    for (const tx of transactions) {
      let lotNumber: number | null = null
      let artistName = ""
      let releaseTitle = "Unknown Item"

      // Resolve release_id (auction item via block_item, or direct purchase)
      let releaseId = tx.release_id
      if (!releaseId && tx.block_item_id) {
        const bi = await pgConnection("block_item")
          .select("release_id", "lot_number")
          .where("id", tx.block_item_id)
          .first()
        if (bi) {
          releaseId = bi.release_id
          lotNumber = bi.lot_number
        }
      }

      if (releaseId) {
        const rel = await pgConnection("Release")
          .select("Release.title", "Artist.name as artist_name")
          .leftJoin("Artist", "Artist.id", "Release.artistId")
          .where("Release.id", releaseId)
          .first()
        if (rel) {
          releaseTitle = rel.title || "Unknown Item"
          artistName = rel.artist_name || ""
        }
      }

      enrichedItems.push({ lot_number: lotNumber, artist_name: artistName, release_title: releaseTitle })
    }

    // Build PDF
    const firstTx = transactions[0]
    const orderNumber = firstTx.order_number || id.slice(-6).toUpperCase()
    const shortId = orderNumber.replace("VOD-ORD-", "")

    const doc = new PDFDocument({ size: "A4", margin: 50 })
    const pageWidth = 595.28
    const leftMargin = 50
    const rightEdge = pageWidth - 50
    const rightColX = 310

    // ── HEADER BAR ──
    doc.rect(0, 0, pageWidth, 70).fill(DARK)
    doc.fontSize(18).font("Helvetica-Bold").fillColor("#ffffff")
      .text("VOD", leftMargin, 20)
    doc.fontSize(18).font("Helvetica-Bold").fillColor(GOLD)
      .text(" AUCTIONS", leftMargin + 35, 20)
    doc.fontSize(9).font("Helvetica").fillColor("#cccccc")
      .text("SHIPPING LABEL", leftMargin, 46)
    doc.fontSize(9).font("Helvetica").fillColor("#cccccc")
      .text(`Order: ${orderNumber}`, 0, 46, { align: "right", width: rightEdge })

    // ── FROM / TO ──
    let y = 90

    // FROM (left)
    doc.fontSize(8).font("Helvetica-Bold").fillColor(GOLD).text("FROM", leftMargin, y)
    y += 14
    doc.fontSize(10).font("Helvetica-Bold").fillColor(DARK)
      .text("VOD-Records", leftMargin, y)
    y += 14
    doc.fontSize(9).font("Helvetica").fillColor(GRAY)
      .text("Frank Bull", leftMargin, y)
      .text("Eugenstrasse 57/2", leftMargin, y + 12)
      .text("88045 Friedrichshafen", leftMargin, y + 24)
      .text("Deutschland", leftMargin, y + 36)

    // TO (right)
    let ry = 90
    doc.fontSize(8).font("Helvetica-Bold").fillColor(GOLD).text("TO", rightColX, ry)
    ry += 14
    doc.fontSize(10).font("Helvetica-Bold").fillColor(DARK)
      .text(firstTx.shipping_name || "Customer", rightColX, ry)
    ry += 14
    doc.fontSize(9).font("Helvetica").fillColor(GRAY)

    const addressLine1 = firstTx.shipping_address_line1 || firstTx.shipping_address || ""
    const addressLine2 = firstTx.shipping_address_line2 || ""
    if (addressLine1) { doc.text(addressLine1, rightColX, ry); ry += 12 }
    if (addressLine2) { doc.text(addressLine2, rightColX, ry); ry += 12 }
    const cityLine = [firstTx.shipping_postal_code, firstTx.shipping_city].filter(Boolean).join(" ")
    if (cityLine) { doc.text(cityLine, rightColX, ry); ry += 12 }
    if (firstTx.shipping_country) { doc.text(firstTx.shipping_country, rightColX, ry) }

    // ── DIVIDER ──
    y = Math.max(y + 50, ry + 26)
    drawLine(doc, leftMargin, y, rightEdge, GOLD)
    y += 14

    // ── CONTENTS ──
    doc.fontSize(8).font("Helvetica-Bold").fillColor(GOLD).text("CONTENTS", leftMargin, y)
    y += 14

    for (const item of enrichedItems) {
      const lotLabel = item.lot_number != null ? `Lot #${String(item.lot_number).padStart(2, "0")} — ` : ""
      const line = item.artist_name
        ? `${lotLabel}${item.artist_name} \u2014 ${item.release_title}`
        : `${lotLabel}${item.release_title}`

      doc.fontSize(9).font("Helvetica").fillColor(DARK).text(line, leftMargin, y, {
        width: rightEdge - leftMargin,
        lineBreak: false,
      })
      y += 16

      if (y > 700) {
        doc.addPage()
        y = 50
      }
    }

    // ── FOOTER ──
    drawLine(doc, leftMargin, y + 10, rightEdge, LINE_COLOR)
    y += 22

    const printDate = new Date().toLocaleDateString("en-GB", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    doc.fontSize(8).font("Helvetica").fillColor(GRAY)
      .text(`Printed: ${printDate}`, leftMargin, y)
      .text("vod-auctions.com \u2022 frank@vinyl-on-demand.com", 0, y, {
        align: "right",
        width: rightEdge,
      })

    // ── Auto-track label_printed_at ──
    await pgConnection("transaction")
      .whereIn("id", transactions.map((t: any) => t.id))
      .update({ label_printed_at: new Date(), updated_at: new Date() })

    // Stream PDF
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="shipping-label-${orderNumber}.pdf"`
    )

    doc.pipe(res as any)
    doc.end()
  } catch (error: any) {
    console.error("[admin/transactions/shipping-label] Error:", error)
    res.status(500).json({ message: "Failed to generate shipping label" })
  }
}
