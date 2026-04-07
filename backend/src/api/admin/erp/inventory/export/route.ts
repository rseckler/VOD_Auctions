import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag } from "../../../../../lib/inventory"

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return '"' + val.replace(/"/g, '""') + '"'
  }
  return val
}

/**
 * GET /admin/erp/inventory/export
 * CSV export of inventory stocktake data.
 *
 * Query: ?status=all|verified|missing|pending
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "ERP_INVENTORY")

  const statusFilter = (req.query.status as string) || "all"

  let query = pg("erp_inventory_item as ii")
    .join("Release as r", "r.id", "ii.release_id")
    .leftJoin("Artist as a", "a.id", "r.artistId")
    .leftJoin("Label as l", "l.id", "r.labelId")
    .select(
      "r.id as release_id",
      "a.name as artist",
      "r.title",
      "r.format",
      "r.catalogNumber",
      "r.legacy_price",
      "r.legacy_condition",
      "r.discogs_id",
      "r.discogs_lowest_price",
      "ii.price_locked",
      "ii.last_stocktake_at",
      "ii.last_stocktake_by",
      "ii.notes",
      "ii.status"
    )
    .where("ii.source", "frank_collection")
    .orderBy("a.name", "asc")
    .orderBy("r.title", "asc")

  if (statusFilter === "verified") {
    query = query
      .whereNotNull("ii.last_stocktake_at")
      .where("ii.price_locked", true)
      .where("r.legacy_price", ">", 0)
  } else if (statusFilter === "missing") {
    query = query
      .whereNotNull("ii.last_stocktake_at")
      .where("ii.price_locked", true)
      .where("r.legacy_price", 0)
  } else if (statusFilter === "pending") {
    query = query.whereNull("ii.last_stocktake_at")
  }

  const rows = await query

  const headers = [
    "Release ID",
    "Artist",
    "Title",
    "Format",
    "Catalog #",
    "Price (EUR)",
    "Condition",
    "Status",
    "Stocktake Date",
    "Stocktake By",
    "Discogs ID",
    "Discogs Lowest",
    "Notes",
  ]

  const csvRows = rows.map((r: any) => {
    const stocktakeStatus =
      r.last_stocktake_at == null
        ? "Pending"
        : Number(r.legacy_price) === 0 && r.price_locked
        ? "Missing"
        : "Verified"

    return [
      r.release_id,
      csvEscape(r.artist || ""),
      csvEscape(r.title || ""),
      r.format || "",
      r.catalogNumber || "",
      r.legacy_price != null ? Number(r.legacy_price).toFixed(2) : "",
      r.legacy_condition || "",
      stocktakeStatus,
      r.last_stocktake_at
        ? new Date(r.last_stocktake_at).toISOString().split("T")[0]
        : "",
      r.last_stocktake_by || "",
      r.discogs_id || "",
      r.discogs_lowest_price != null ? Number(r.discogs_lowest_price).toFixed(2) : "",
      csvEscape(r.notes || ""),
    ].join(",")
  })

  const bom = "\uFEFF"
  const csv = bom + headers.join(",") + "\n" + csvRows.join("\n")

  res.setHeader("Content-Type", "text/csv; charset=utf-8")
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="vod-stocktake-${statusFilter}-${new Date().toISOString().split("T")[0]}.csv"`
  )
  res.send(csv)
}
