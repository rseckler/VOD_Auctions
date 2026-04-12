import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag, createMovement } from "../../../../../../lib/inventory"

interface CheckoutItem {
  inventory_item_id: string
  release_id: string
  price: number
  title?: string
}

interface CheckoutBody {
  payment_provider: "sumup" | "cash" | "paypal" | "bank_transfer"
  customer_id?: string | null
  discount_eur?: number
  items: CheckoutItem[]
}

/**
 * POST /admin/pos/sessions/:id/checkout
 *
 * Finalize a POS walk-in sale. In one DB transaction:
 * 1. Generate POS order number (VOD-POS-XXXXXX)
 * 2. Insert transaction row (item_type='walk_in_sale')
 * 3. Per item: erp_inventory_movement (outbound) + update status to 'sold'
 * 4. Insert order_event for audit trail
 * 5. Trigger customer_stats recalc if customer set
 *
 * Dry-Run mode: tse_signature = 'DRY_RUN', tax_mode = 'standard'
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "POS_WALK_IN")

  const sessionId = req.params.id
  const body = req.body as CheckoutBody

  // ─── Validation ────────────────────────────────────────────────────
  if (!body.items?.length) {
    res.status(400).json({ message: "Cart is empty — add items before checkout." })
    return
  }

  const validProviders = ["sumup", "cash", "paypal", "bank_transfer"]
  if (!validProviders.includes(body.payment_provider)) {
    res.status(400).json({ message: `Invalid payment_provider. Must be one of: ${validProviders.join(", ")}` })
    return
  }

  const discount = body.discount_eur ? Number(body.discount_eur) : 0
  if (discount < 0) {
    res.status(400).json({ message: "Discount cannot be negative." })
    return
  }

  // ─── DB Transaction ────────────────────────────────────────────────
  const trx = await pg.transaction()

  try {
    // 1. Generate POS order number
    const seqResult = await trx.raw("SELECT nextval('pos_order_number_seq') AS seq")
    const seq = Number(seqResult.rows[0].seq)
    const orderNumber = `VOD-POS-${String(seq).padStart(6, "0")}`

    // 2. Calculate totals
    const itemsTotal = body.items.reduce((sum, it) => sum + Number(it.price), 0)
    const grandTotal = Math.max(0, itemsTotal - discount)

    // Tax calculation (Dry-Run: always standard 19%)
    const taxRate = 19.00
    const taxAmount = Number((grandTotal - grandTotal / 1.19).toFixed(2))

    // 3. Insert transaction
    const transactionId = generateEntityId()
    const orderGroupId = generateEntityId()
    const now = new Date()

    await trx("transaction").insert({
      id: transactionId,
      item_type: "walk_in_sale",
      user_id: body.customer_id || null,
      order_group_id: orderGroupId,
      release_id: body.items.length === 1 ? body.items[0].release_id : null,
      amount: itemsTotal,
      discount_amount: discount,
      total_amount: grandTotal,
      currency: "eur",
      payment_provider: body.payment_provider,
      status: "paid",
      fulfillment_status: "picked_up",
      paid_at: now,
      order_number: orderNumber,
      pos_session_id: sessionId,
      // TSE Dry-Run
      tse_signature: "DRY_RUN",
      // Tax (standard mode for P0)
      tax_mode: "standard",
      tax_rate_percent: taxRate,
      tax_amount: taxAmount,
      created_at: now,
      updated_at: now,
    })

    // 4. Per item: inventory movement + mark as sold
    for (const item of body.items) {
      // Verify item is still available (race condition guard)
      const check = await trx.raw(
        `SELECT status FROM erp_inventory_item WHERE id = ? FOR UPDATE`,
        [item.inventory_item_id]
      )
      if (!check.rows.length) {
        throw new Error(`Inventory item ${item.inventory_item_id} not found`)
      }
      if (check.rows[0].status === "sold") {
        throw new Error(`Item ${item.inventory_item_id} was already sold (race condition)`)
      }

      // Create outbound movement
      await createMovement(trx, {
        inventoryItemId: item.inventory_item_id,
        type: "sale",
        quantityChange: -1,
        reason: "walk_in_sale",
        performedBy: "admin",
        transactionId,
        reference: orderNumber,
      })

      // Mark as sold
      await trx("erp_inventory_item")
        .where({ id: item.inventory_item_id })
        .update({ status: "sold", updated_at: now })
    }

    // 5. Order event (audit trail)
    await trx("order_event").insert({
      id: generateEntityId(),
      order_group_id: orderGroupId,
      transaction_id: transactionId,
      event_type: "fulfillment",
      title: `Walk-in sale completed: ${body.items.length} item(s) for €${grandTotal.toFixed(2)} (${body.payment_provider})`,
      details: JSON.stringify({
        session_id: sessionId,
        payment_provider: body.payment_provider,
        items: body.items.map((it) => ({
          inventory_item_id: it.inventory_item_id,
          release_id: it.release_id,
          price: it.price,
          title: it.title || null,
        })),
        discount_eur: discount,
        tax_mode: "standard",
        tse_signature: "DRY_RUN",
      }),
      actor: "admin",
      created_at: now,
    })

    // 6. Recalc customer stats if customer set
    if (body.customer_id) {
      await trx.raw(`
        UPDATE customer_stats SET
          total_spent = COALESCE(total_spent, 0) + ?,
          total_purchases = COALESCE(total_purchases, 0) + 1,
          last_purchase_at = ?,
          first_purchase_at = COALESCE(first_purchase_at, ?),
          is_vip = CASE WHEN COALESCE(total_spent, 0) + ? >= 500 THEN true ELSE is_vip END,
          is_dormant = false,
          updated_at = ?
        WHERE customer_id = ?
      `, [grandTotal, now, now, grandTotal, now, body.customer_id])
    }

    await trx.commit()

    res.json({
      transaction_id: transactionId,
      order_group_id: orderGroupId,
      order_number: orderNumber,
      total: grandTotal,
      items_count: body.items.length,
      payment_provider: body.payment_provider,
      customer_id: body.customer_id || null,
      receipt_pdf_url: `/admin/pos/transactions/${transactionId}/receipt`,
    })
  } catch (err: any) {
    await trx.rollback()
    console.error("[POS Checkout] Error:", err.message)
    res.status(500).json({ message: err.message || "Checkout failed" })
  }
}
