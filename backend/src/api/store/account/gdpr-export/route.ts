import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /store/account/gdpr-export — GDPR data export for authenticated customer
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    // Customer profile
    const customer = await pgConnection("customer")
      .where("id", customerId)
      .whereNull("deleted_at")
      .select("id", "email", "first_name", "last_name", "phone", "created_at")
      .first()

    if (!customer) {
      res.status(404).json({ message: "Customer not found" })
      return
    }

    // Orders
    const orders = await pgConnection("transaction")
      .where("user_id", customerId)
      .whereNull("deleted_at")
      .orderBy("created_at", "desc")
      .select(
        "id",
        "order_number",
        "amount",
        "status",
        "fulfillment_status",
        "item_type",
        "payment_provider",
        "shipping_name",
        "shipping_address_line1",
        "shipping_address_line2",
        "shipping_city",
        "shipping_postal_code",
        "shipping_country",
        "created_at",
        "updated_at"
      )

    // Bids
    const bids = await pgConnection("bid")
      .where("user_id", customerId)
      .orderBy("created_at", "desc")
      .select("id", "amount", "max_amount", "is_winning", "is_outbid", "created_at")

    // Saved items (wishlist)
    const savedItems = await pgConnection("saved_item")
      .where("user_id", customerId)
      .whereNull("deleted_at")
      .orderBy("created_at", "desc")
      .select("id", "release_id", "created_at")

    // Build GDPR export payload
    const exportData = {
      exported_at: new Date().toISOString(),
      customer: {
        id: customer.id,
        email: customer.email,
        first_name: customer.first_name,
        last_name: customer.last_name,
        phone: customer.phone,
        registered_at: customer.created_at,
      },
      orders: orders.map((o: any) => ({
        order_number: o.order_number,
        amount: Number(o.amount),
        status: o.status,
        fulfillment_status: o.fulfillment_status,
        type: o.item_type,
        payment_method: o.payment_provider,
        shipping_address: [
          o.shipping_name,
          o.shipping_address_line1,
          o.shipping_address_line2,
          o.shipping_city,
          o.shipping_postal_code,
          o.shipping_country,
        ].filter(Boolean).join(", "),
        date: o.created_at,
      })),
      bids: bids.map((b: any) => ({
        amount: Number(b.amount),
        is_winning: b.is_winning,
        is_outbid: b.is_outbid,
        date: b.created_at,
      })),
      saved_items: savedItems.map((s: any) => ({
        release_id: s.release_id,
        saved_at: s.created_at,
      })),
    }

    // Return as downloadable JSON file
    res.setHeader("Content-Type", "application/json")
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="vod-auctions-data-export-${new Date().toISOString().split("T")[0]}.json"`
    )
    res.json(exportData)
  } catch (err: any) {
    console.error("[gdpr-export] Error:", err.message)
    res.status(500).json({ message: "Failed to generate data export" })
  }
}
