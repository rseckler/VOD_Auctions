import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// POST /admin/transactions/export — CSV export with current filters
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const {
    status,
    fulfillment_status,
    payment_provider,
    date_from,
    date_to,
    q,
    transaction_ids,
  } = req.body as any

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    let query = pgConnection("transaction")
      .select(
        "transaction.order_number",
        "transaction.created_at",
        "transaction.paid_at",
        "transaction.status",
        "transaction.fulfillment_status",
        "transaction.shipping_status",
        "transaction.amount",
        "transaction.shipping_cost",
        "transaction.total_amount",
        "transaction.payment_provider",
        "transaction.carrier",
        "transaction.tracking_number",
        "transaction.shipping_name",
        "transaction.shipping_country",
        "customer.email as customer_email",
        "customer.first_name",
        "customer.last_name",
        "Release.title as release_title",
        "Release.article_number",
        "Artist.name as artist_name"
      )
      .leftJoin("block_item", "block_item.id", "transaction.block_item_id")
      .leftJoin("customer", "customer.id", "transaction.user_id")
      .leftJoin(
        "Release",
        "Release.id",
        pgConnection.raw(
          "COALESCE(block_item.release_id, transaction.release_id)"
        )
      )
      .leftJoin("Artist", "Artist.id", "Release.artistId")
      .orderBy("transaction.created_at", "desc")

    // Apply filters
    if (transaction_ids?.length) {
      query.whereIn("transaction.id", transaction_ids)
    }
    if (status) query.where("transaction.status", status)
    if (fulfillment_status) {
      query.where("transaction.fulfillment_status", fulfillment_status)
    }
    if (payment_provider) {
      query.where("transaction.payment_provider", payment_provider)
    }
    if (date_from) query.where("transaction.created_at", ">=", date_from)
    if (date_to) {
      query.where("transaction.created_at", "<=", date_to + "T23:59:59Z")
    }

    const rows = await query

    // Build CSV
    const headers = [
      "Order No.",
      "Date",
      "Customer",
      "Email",
      "Item (Artist — Title)",
      "Art. No.",
      "Amount",
      "Shipping",
      "Total",
      "Payment Status",
      "Fulfillment",
      "Provider",
      "Carrier",
      "Tracking",
      "Country",
    ]

    const csvRows = rows.map((r: any) => {
      const customerName =
        [r.first_name, r.last_name].filter(Boolean).join(" ") ||
        r.shipping_name ||
        ""
      const itemLabel =
        [r.artist_name, r.release_title].filter(Boolean).join(" — ") || ""
      const date = r.paid_at
        ? new Date(r.paid_at).toISOString().split("T")[0]
        : new Date(r.created_at).toISOString().split("T")[0]
      return [
        r.order_number || "",
        date,
        csvEscape(customerName),
        r.customer_email || "",
        csvEscape(itemLabel),
        r.article_number || "",
        parseFloat(r.amount || 0).toFixed(2),
        parseFloat(r.shipping_cost || 0).toFixed(2),
        parseFloat(r.total_amount || 0).toFixed(2),
        r.status || "",
        r.fulfillment_status || "",
        r.payment_provider || "",
        r.carrier || "",
        r.tracking_number || "",
        r.shipping_country || "",
      ].join(",")
    })

    // BOM for Excel UTF-8 compatibility + CSV content
    const bom = "\uFEFF"
    const csv = bom + headers.join(",") + "\n" + csvRows.join("\n")

    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="vod-transactions-${new Date().toISOString().split("T")[0]}.csv"`
    )
    res.send(csv)
  } catch (error: any) {
    console.error("[admin/export] Error:", error)
    res.status(500).json({ message: "Export failed" })
  }
}

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return '"' + val.replace(/"/g, '""') + '"'
  }
  return val
}
