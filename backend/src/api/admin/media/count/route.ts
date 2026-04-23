import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { buildReleaseSearchSubquery } from "../../../../lib/release-search"

/**
 * GET /admin/media/count — Exakter SQL-Count für gefilterte Catalog-Queries.
 *
 * Ergänzung zu /admin/media (rc48 Phase 2). Meili's Default-Count ist
 * `estimatedTotalHits` — approximativ, reicht für Pagination + Facet-Badges.
 * Wenn das Frontend einen **belastbaren** Count braucht (Export-Bestätigung,
 * Bulk-Action-Dialog: "N Items betroffen, wirklich ausführen?"), ruft es
 * diesen Endpoint.
 *
 * Akzeptiert denselben Filter-Parameter-Satz wie /admin/media, rechnet aber
 * nur den Count — kein Data-Fetch, kein Sort, kein Join auf Inventory-
 * Subquery (nur da wo Filter es erzwingen). Deutlich günstiger als der
 * Count-Query der früher inline in /admin/media lief.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const {
    q,
    format,
    category,
    year_from,
    year_to,
    country,
    label,
    auction_status,
    has_discogs,
    has_price,
    has_image,
    visibility,
    import_collection,
    import_action,
    inventory_state,
    inventory_status,
    stocktake,
    price_locked,
    warehouse_location,
  } = req.query as Record<string, string>

  // Base: minimal JOINs — nur die was filter fordern
  const needsArtistJoin = !!(q && q.trim())
  const needsLabelJoin = !!(label && label.trim())
  const needsFormatJoin = !!(category && (category === "tapes" || category === "vinyl"))
  const needsInventoryJoin = !!(
    inventory_state || inventory_status || stocktake || price_locked || warehouse_location
  )
  const needsImportJoin = !!(import_collection || import_action)

  let query = pgConnection("Release")
  if (needsArtistJoin) query = query.leftJoin("Artist", "Release.artistId", "Artist.id")
  if (needsLabelJoin) query = query.leftJoin("Label", "Release.labelId", "Label.id")
  if (needsFormatJoin) query = query.leftJoin("Format", "Release.format_id", "Format.id")

  if (needsInventoryJoin) {
    // Lightweight aggregation — wir brauchen hier nur das Filter-Prädikat, nicht
    // die array_agg-Fields. Daher einfachere Subquery als im main-Endpoint.
    const invSub = pgConnection("erp_inventory_item")
      .select(
        "release_id",
        pgConnection.raw(
          "(array_agg(status ORDER BY COALESCE(copy_number,1)))[1] as status"
        ),
        pgConnection.raw(
          "(array_agg(price_locked ORDER BY COALESCE(copy_number,1)))[1] as price_locked"
        ),
        pgConnection.raw(
          "(array_agg(warehouse_location_id ORDER BY COALESCE(copy_number,1)))[1] as warehouse_location_id"
        ),
        pgConnection.raw("MAX(last_stocktake_at) as last_stocktake_at"),
        pgConnection.raw("COUNT(*)::int as exemplar_count")
      )
      .groupBy("release_id")
      .as("ii")
    query = query.leftJoin(invSub, "Release.id", "ii.release_id")
    if (warehouse_location) {
      query = query.leftJoin(
        "warehouse_location",
        "ii.warehouse_location_id",
        "warehouse_location.id"
      )
    }
  }

  // ─── Filter anwenden (1:1 identisch zu route-postgres-fallback.ts) ────
  if (q && q.trim()) {
    const sub = buildReleaseSearchSubquery(pgConnection, q.trim())
    if (sub) query = query.whereIn("Release.id", sub)
  }

  if (format) query = query.where("Release.format", format)
  if (year_from) query = query.where("Release.year", ">=", parseInt(year_from))
  if (year_to) query = query.where("Release.year", "<=", parseInt(year_to))
  if (country) query = query.where("Release.country", country)
  if (label && label.trim()) query = query.whereILike("Label.name", `%${label.trim()}%`)
  if (auction_status) query = query.where("Release.auction_status", auction_status)

  if (category) {
    switch (category) {
      case "tapes":
        query = query.where("Release.product_category", "release").where("Format.kat", 1)
        break
      case "vinyl":
        query = query.where("Release.product_category", "release").where("Format.kat", 2)
        break
      case "band_literature":
      case "label_literature":
      case "press_literature":
        query = query.where("Release.product_category", category)
        break
    }
  }

  if (has_discogs === "true") query = query.whereNotNull("Release.discogs_id")
  if (has_discogs === "false") query = query.whereNull("Release.discogs_id")
  if (has_price === "true") query = query.whereNotNull("Release.discogs_lowest_price")
  if (has_price === "false") query = query.whereNull("Release.discogs_lowest_price")
  if (has_image === "true") {
    query = query.whereNotNull("Release.coverImage").where("Release.coverImage", "!=", "")
  }
  if (has_image === "false") {
    query = query.where(function () {
      this.whereNull("Release.coverImage").orWhere("Release.coverImage", "")
    })
  }
  if (visibility === "visible") {
    query = query.whereNotNull("Release.coverImage").whereNotNull("Release.legacy_price")
  }
  if (visibility === "hidden") {
    query = query.where(function () {
      this.whereNull("Release.coverImage").orWhereNull("Release.legacy_price")
    })
  }

  if (import_collection && import_collection.trim()) {
    const coll = import_collection.trim()
    const action = import_action && import_action.trim() ? import_action.trim() : null
    query = query.whereExists(function () {
      this.select("*")
        .from("import_log")
        .whereRaw('"import_log"."release_id" = "Release"."id"')
        .where("import_log.import_type", "discogs_collection")
        .where("import_log.collection_name", coll)
      if (action) this.where("import_log.action", action)
    })
  } else if (import_action && import_action.trim()) {
    const action = import_action.trim()
    query = query.whereExists(function () {
      this.select("*")
        .from("import_log")
        .whereRaw('"import_log"."release_id" = "Release"."id"')
        .where("import_log.import_type", "discogs_collection")
        .where("import_log.action", action)
    })
  }

  if (inventory_state === "any") query = query.whereNotNull("ii.release_id")
  if (inventory_state === "none") query = query.whereNull("ii.release_id")
  if (inventory_status && inventory_status.trim()) {
    query = query.where("ii.status", inventory_status.trim())
  }
  if (stocktake === "done") {
    query = query
      .whereNotNull("ii.last_stocktake_at")
      .where("ii.last_stocktake_at", ">=", pgConnection.raw("NOW() - INTERVAL '90 days'"))
  }
  if (stocktake === "pending") {
    query = query.whereNotNull("ii.release_id").whereNull("ii.last_stocktake_at")
  }
  if (stocktake === "stale") {
    query = query
      .whereNotNull("ii.last_stocktake_at")
      .where("ii.last_stocktake_at", "<", pgConnection.raw("NOW() - INTERVAL '90 days'"))
  }
  if (price_locked === "true") query = query.where("ii.price_locked", true)
  if (price_locked === "false") {
    query = query.where(function () {
      this.where("ii.price_locked", false).orWhereNull("ii.price_locked")
    })
  }
  if (warehouse_location && warehouse_location.trim()) {
    query = query.where("warehouse_location.code", warehouse_location.trim())
  }

  // ─── Count ─────────────────────────────────────────────────────────────
  const [{ count }] = await query.count("Release.id as count")

  res.json({ count: Number(count), backend: "postgres-exact" })
}
