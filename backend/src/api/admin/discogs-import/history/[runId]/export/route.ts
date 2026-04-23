import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/discogs-import/history/:runId/export — CSV export of one import run
// Joins import_log × Release × Artist to include both the import-time snapshot
// (from data_snapshot JSONB) and the current live state of each release.
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { runId } = req.params as { runId: string }

  if (!runId || typeof runId !== "string") {
    res.status(400).json({ error: "runId required" })
    return
  }

  try {
    // Look up collection_name for the filename
    const runMeta = await pgConnection.raw(
      `SELECT collection_name, import_source
       FROM import_log
       WHERE run_id = ? AND import_type = 'discogs_collection'
       LIMIT 1`,
      [runId]
    )
    if (!runMeta.rows?.[0]) {
      res.status(404).json({ error: "Run not found" })
      return
    }
    const collectionName = runMeta.rows[0].collection_name as string | null

    // Fetch all log entries joined with current Release + Artist state
    const rows = await pgConnection.raw(
      `
      SELECT
        il.action,
        il.discogs_id,
        il.release_id,
        il.data_snapshot,
        il.created_at as logged_at,
        r.slug,
        r.title as current_title,
        r.format,
        r.year,
        r.country,
        r."coverImage",
        r.legacy_price,
        r.legacy_available,
        r.legacy_condition,
        r.shop_price,
        r.sale_mode,
        r.catalogNumber,
        a.name as artist_name,
        l.name as label_name
      FROM import_log il
      LEFT JOIN "Release" r ON r.id = il.release_id
      LEFT JOIN "Artist" a ON a.id = r."artistId"
      LEFT JOIN "Label" l ON l.id = r."labelId"
      WHERE il.run_id = ? AND il.import_type = 'discogs_collection'
      ORDER BY il.created_at, il.id
      `,
      [runId]
    )

    const headers = [
      "Action",
      "Discogs ID",
      "Release ID",
      "Slug",
      "Artist",
      "Title",
      "Original Title",
      "Format",
      "Year",
      "Catalog Number",
      "Label",
      "Country",
      "Genres",
      "Styles",
      "Discogs Lowest Price",
      "Discogs For Sale",
      "Discogs Have",
      "Discogs Want",
      "VOD Price",
      "VOD Direct Price",
      "VOD Condition",
      "Sale Mode",
      "Available",
      "Has Cover",
      "Imported At",
      "Discogs URL",
      "Storefront URL",
    ]

    const csvRows: string[] = (rows.rows || []).map((r: Record<string, unknown>) => {
      const snapshot = (r.data_snapshot || {}) as {
        excel?: Record<string, unknown>
        api?: Record<string, unknown>
      }
      const excel = snapshot.excel || {}
      const api = snapshot.api || {}
      const community = (api.community || {}) as { have?: number; want?: number }

      const genres = Array.isArray(api.genres) ? (api.genres as string[]).join("; ") : ""
      const styles = Array.isArray(api.styles) ? (api.styles as string[]).join("; ") : ""

      const discogsId = Number(r.discogs_id) || 0
      const discogsUrl = discogsId > 0 ? `https://www.discogs.com/release/${discogsId}` : ""
      const slug = (r.slug as string | null) || ""
      const storefrontUrl = slug ? `https://vod-auctions.com/catalog/${slug}` : ""

      const price = r.legacy_price != null ? Number(r.legacy_price).toFixed(2) : ""
      const shopPrice = r.shop_price != null ? Number(r.shop_price).toFixed(2) : ""
      const lowestPrice = api.lowest_price != null ? Number(api.lowest_price).toFixed(2) : ""

      const loggedAt = r.logged_at
        ? new Date(r.logged_at as string).toISOString()
        : ""

      return [
        (r.action as string) || "",
        String(discogsId || ""),
        (r.release_id as string) || "",
        slug,
        csvEscape((r.artist_name as string) || ""),
        csvEscape((r.current_title as string) || (excel.title as string) || ""),
        csvEscape((excel.title as string) || ""),
        (r.format as string) || (excel.format as string) || "",
        String(r.year ?? excel.year ?? ""),
        csvEscape((r.catalogNumber as string) || (excel.catalog_number as string) || ""),
        csvEscape((r.label_name as string) || ""),
        csvEscape((r.country as string) || (api.country as string) || ""),
        csvEscape(genres),
        csvEscape(styles),
        lowestPrice,
        String(api.num_for_sale ?? ""),
        String(community.have ?? ""),
        String(community.want ?? ""),
        price,
        shopPrice,
        csvEscape((r.legacy_condition as string) || ""),
        (r.sale_mode as string) || "",
        r.legacy_available === true ? "yes" : r.legacy_available === false ? "no" : "",
        r.coverImage ? "yes" : "no",
        loggedAt,
        discogsUrl,
        storefrontUrl,
      ].join(",")
    })

    // BOM for Excel UTF-8 compatibility
    const bom = "\uFEFF"
    const csv = bom + headers.join(",") + "\n" + csvRows.join("\n")

    const datePart = new Date().toISOString().split("T")[0]
    const namePart = (collectionName || "discogs-import")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 60)
    const filename = `${namePart}-${runId.substring(0, 8)}-${datePart}.csv`

    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
    res.send(csv)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Export failed"
    console.error("[discogs-import/history/export] Error:", err)
    res.status(500).json({ error: msg })
  }
}

function csvEscape(val: string): string {
  if (val == null) return ""
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return '"' + val.replace(/"/g, '""') + '"'
  }
  return val
}
