import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { generateInvoicePDF, InvoiceData } from "../../../../../lib/invoice-template"

// GET /store/account/orders/:groupId/invoice
// Auth required (covered by /store/account/* middleware)
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  const groupId = (req as any).params.groupId
  if (!groupId) {
    res.status(400).json({ message: "Missing groupId parameter" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    // Fetch all paid transactions for this order group, verify ownership
    const transactions = await pgConnection("transaction")
      .select(
        "transaction.*",
        pgConnection.raw(
          "COALESCE(block_item.release_id, transaction.release_id) as resolved_release_id"
        ),
        "block_item.lot_number"
      )
      .leftJoin("block_item", "block_item.id", "transaction.block_item_id")
      .where(function () {
        // Match by order_group_id OR single transaction id
        this.where("transaction.order_group_id", groupId).orWhere(
          "transaction.id",
          groupId
        )
      })
      .andWhere("transaction.user_id", customerId)
      .andWhere("transaction.status", "paid")
      .orderBy("transaction.created_at", "asc")

    if (transactions.length === 0) {
      res.status(404).json({ message: "Order not found or not paid" })
      return
    }

    // Enrich with Release data
    const releaseIds = [
      ...new Set(
        transactions
          .map((t: any) => t.resolved_release_id)
          .filter(Boolean)
      ),
    ]
    const releaseMap = new Map()

    if (releaseIds.length > 0) {
      const releases = await pgConnection("Release")
        .select(
          "Release.id",
          "Release.title",
          "Release.article_number",
          "Artist.name as artist_name"
        )
        .leftJoin("Artist", "Release.artistId", "Artist.id")
        .whereIn("Release.id", releaseIds)

      for (const r of releases) {
        releaseMap.set(r.id, r)
      }
    }

    // Build invoice data from the first transaction (shared address)
    const firstTx = transactions[0]
    const customerName =
      firstTx.shipping_name || "Customer"
    const addressLine1 = firstTx.shipping_address_line1 || ""
    const addressLine2 = firstTx.shipping_address_line2 || ""
    const fullAddress = [addressLine1, addressLine2]
      .filter(Boolean)
      .join(", ")

    const invoiceDate = firstTx.paid_at
      ? new Date(firstTx.paid_at).toLocaleDateString("en-GB", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : new Date().toLocaleDateString("en-GB", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })

    // Invoice number: VOD-INV-{last 6 chars of groupId}
    const shortId = groupId.slice(-6).toUpperCase()
    const invoiceNumber = `VOD-INV-${shortId}`

    // Build items list
    const items: InvoiceData["items"] = []
    let subtotal = 0
    let shippingTotal = 0

    for (const tx of transactions) {
      const rel = releaseMap.get(tx.resolved_release_id)
      const artistName = rel?.artist_name || ""
      const title = rel?.title || "Unknown Item"
      const description = artistName
        ? `${artistName} \u2014 ${title}`
        : title

      const amount = parseFloat(tx.amount) || 0
      const shipping = parseFloat(tx.shipping_cost) || 0

      items.push({
        articleNumber: rel?.article_number || "",
        description,
        type:
          tx.item_type === "direct_purchase"
            ? "Direct"
            : `Auction${tx.lot_number ? ` #${tx.lot_number}` : ""}`,
        amount,
      })

      subtotal += amount
      shippingTotal += shipping
    }

    const total = transactions.reduce(
      (sum: number, tx: any) => sum + (parseFloat(tx.total_amount) || 0),
      0
    )

    const invoiceData: InvoiceData = {
      invoiceNumber,
      invoiceDate,
      customer: {
        name: customerName,
        address: fullAddress,
        city: firstTx.shipping_city || "",
        postalCode: firstTx.shipping_postal_code || "",
        country: firstTx.shipping_country || "",
      },
      items,
      subtotal: Math.round(subtotal * 100) / 100,
      shippingCost: Math.round(shippingTotal * 100) / 100,
      discountAmount: 0,
      total: Math.round(total * 100) / 100,
    }

    // Generate PDF
    const doc = generateInvoicePDF(invoiceData)

    // Stream PDF response
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=VOD-Invoice-${shortId}.pdf`
    )

    doc.pipe(res as any)
    doc.end()
  } catch (error: any) {
    console.error("[invoice] Error:", error)
    res.status(500).json({ message: "Failed to generate invoice" })
  }
}
