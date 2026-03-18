import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  generateEntityId,
} from "@medusajs/framework/utils"
import { Knex } from "knex"
import { sendShippingEmail } from "../../../../lib/email-helpers"
import { crmSyncShippingUpdate } from "../../../../lib/crm-sync"

// POST /admin/transactions/bulk-ship — Mark multiple transactions as shipped
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { transaction_ids, carrier, tracking_number } = req.body as {
    transaction_ids: string[]
    carrier?: string
    tracking_number?: string
  }

  if (!transaction_ids?.length) {
    res.status(400).json({ message: "transaction_ids required" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    let updated = 0

    for (const txId of transaction_ids) {
      const tx = await pgConnection("transaction").where("id", txId).first()
      if (!tx || tx.status !== "paid" || tx.shipping_status !== "pending") {
        continue
      }

      await pgConnection("transaction")
        .where("id", txId)
        .update({
          shipping_status: "shipped",
          fulfillment_status: "shipped",
          shipped_at: new Date(),
          carrier: carrier || null,
          tracking_number: tracking_number || null,
          updated_at: new Date(),
        })

      // Audit event
      const orderGroupId = tx.order_group_id || tx.id
      await pgConnection("order_event").insert({
        id: generateEntityId(),
        order_group_id: orderGroupId,
        transaction_id: txId,
        event_type: "shipment",
        title: `Shipped via ${carrier || "carrier"}${tracking_number ? ", tracking: " + tracking_number : ""} (bulk)`,
        details: JSON.stringify({ carrier, tracking_number, bulk: true }),
        actor: "admin",
        created_at: new Date(),
      })

      // Send shipping email (async, non-blocking)
      sendShippingEmail(pgConnection, txId).catch(() => {})
      crmSyncShippingUpdate(pgConnection, txId, "shipped").catch(() => {})

      updated++
    }

    res.json({ success: true, updated })
  } catch (error: any) {
    console.error("[admin/bulk-ship] Error:", error)
    res.status(500).json({ message: "Bulk ship failed" })
  }
}
