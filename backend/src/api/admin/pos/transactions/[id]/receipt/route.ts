import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag } from "../../../../../../lib/inventory"
import { generateReceiptPDF } from "../../../../../../lib/pos-receipt"

/**
 * GET /admin/pos/transactions/:id/receipt
 *
 * Generate and stream a POS receipt PDF for a walk-in sale transaction.
 * A6 format (105x148mm), suitable for print or download.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "POS_WALK_IN")

  const transactionId = req.params.id

  // Fetch transaction
  const txResult = await pg.raw(`
    SELECT
      t.id, t.order_number, t.total_amount, t.amount, t.discount_amount,
      t.payment_provider, t.tax_mode, t.tax_rate_percent, t.tax_amount,
      t.tse_signature, t.user_id, t.created_at,
      c.first_name, c.last_name
    FROM transaction t
    LEFT JOIN customer c ON c.id = t.user_id
    WHERE t.id = ? AND t.item_type = 'walk_in_sale'
    LIMIT 1
  `, [transactionId])

  if (!txResult.rows.length) {
    res.status(404).json({ message: "POS transaction not found" })
    return
  }

  const tx = txResult.rows[0]

  // Fetch items via inventory movements
  const itemsResult = await pg.raw(`
    SELECT
      r.title,
      a.name AS artist_name,
      r.format,
      r.legacy_price
    FROM erp_inventory_movement m
    JOIN erp_inventory_item ii ON ii.id = m.inventory_item_id
    JOIN "Release" r ON r.id = ii.release_id
    LEFT JOIN "Artist" a ON a.id = r."artistId"
    WHERE m.transaction_id = ? AND m.type = 'sale'
    ORDER BY m.created_at ASC
  `, [transactionId])

  const items = itemsResult.rows.map((r: any) => ({
    title: r.title,
    artist_name: r.artist_name,
    format: r.format,
    price: r.legacy_price != null ? Number(r.legacy_price) : 0,
  }))

  const total = Number(tx.total_amount)
  const subtotal = Number(tx.amount)
  const discount = tx.discount_amount ? Number(tx.discount_amount) : 0
  const taxRate = tx.tax_rate_percent ? Number(tx.tax_rate_percent) : 19
  const taxAmount = tx.tax_amount ? Number(tx.tax_amount) : Number((total - total / 1.19).toFixed(2))

  const createdAt = new Date(tx.created_at)
  const dateStr = createdAt.toLocaleDateString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
  }) + " " + createdAt.toLocaleTimeString("de-DE", {
    hour: "2-digit", minute: "2-digit",
  })

  const customerName = tx.first_name
    ? [tx.first_name, tx.last_name].filter(Boolean).join(" ")
    : null

  const pdf = generateReceiptPDF({
    orderNumber: tx.order_number,
    date: dateStr,
    items,
    subtotal,
    discount,
    total,
    taxAmount,
    taxRate,
    paymentProvider: tx.payment_provider,
    customerName,
    isDryRun: tx.tse_signature === "DRY_RUN",
  })

  res.setHeader("Content-Type", "application/pdf")
  res.setHeader("Content-Disposition", `inline; filename="${tx.order_number}.pdf"`)
  pdf.pipe(res as any)
}
