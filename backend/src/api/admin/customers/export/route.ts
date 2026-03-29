import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/customers/export — CSV export of all customers
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    const rows = await pgConnection("customer as c")
      .leftJoin("customer_stats as cs", "cs.customer_id", "c.id")
      .whereNull("c.deleted_at")
      .orderBy("c.created_at", "desc")
      .select(
        "c.id",
        "c.email",
        "c.first_name",
        "c.last_name",
        "c.phone",
        "c.created_at",
        pgConnection.raw("COALESCE(cs.total_spent, 0) as total_spent"),
        pgConnection.raw("COALESCE(cs.total_purchases, 0) as total_purchases"),
        pgConnection.raw("COALESCE(cs.total_bids, 0) as total_bids"),
        pgConnection.raw("COALESCE(cs.total_wins, 0) as total_wins"),
        pgConnection.raw("COALESCE(cs.is_vip, false) as is_vip"),
        pgConnection.raw("COALESCE(cs.is_dormant, false) as is_dormant"),
        pgConnection.raw("COALESCE(cs.tags, '{}') as tags"),
        "cs.last_purchase_at"
      )

    // Get country from last transaction for each customer
    const countryMap: Record<string, string> = {}
    const countryRows = await pgConnection("transaction")
      .select("user_id", "shipping_country")
      .whereNotNull("shipping_country")
      .whereNotNull("user_id")
      .orderBy("created_at", "desc")

    for (const row of countryRows) {
      if (!countryMap[row.user_id]) {
        countryMap[row.user_id] = row.shipping_country
      }
    }

    const headers = [
      "Name",
      "Email",
      "Phone",
      "Country",
      "Total Spent (\u20AC)",
      "Purchases",
      "Bids",
      "Wins",
      "VIP",
      "Dormant",
      "Tags",
      "Registered",
      "Last Purchase",
    ]

    const csvRows = rows.map((r: any) => {
      const name = [r.first_name, r.last_name].filter(Boolean).join(" ") || ""
      const registered = r.created_at
        ? new Date(r.created_at).toISOString().split("T")[0]
        : ""
      const lastPurchase = r.last_purchase_at
        ? new Date(r.last_purchase_at).toISOString().split("T")[0]
        : ""
      const tags = Array.isArray(r.tags) ? r.tags.join("; ") : ""

      return [
        csvEscape(name),
        r.email || "",
        r.phone || "",
        countryMap[r.id] || "",
        parseFloat(r.total_spent || 0).toFixed(2),
        Number(r.total_purchases || 0),
        Number(r.total_bids || 0),
        Number(r.total_wins || 0),
        r.is_vip ? "Yes" : "No",
        r.is_dormant ? "Yes" : "No",
        csvEscape(tags),
        registered,
        lastPurchase,
      ].join(",")
    })

    const bom = "\uFEFF"
    const csv = bom + headers.join(",") + "\n" + csvRows.join("\n")

    const dateStr = new Date().toISOString().split("T")[0]
    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="vod-customers-${dateStr}.csv"`
    )
    res.send(csv)
  } catch (err: any) {
    console.error("[admin/customers/export] Error:", err.message)
    res.status(500).json({ message: "Export failed" })
  }
}

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return '"' + val.replace(/"/g, '""') + '"'
  }
  return val
}
