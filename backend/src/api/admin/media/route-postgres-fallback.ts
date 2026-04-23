import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { buildReleaseSearchSubquery } from "../../../lib/release-search"

/**
 * GET /admin/media — Postgres-basierte Catalog-Liste (Fallback).
 *
 * Seit rc48 Phase 2 ist die Default-Route Meilisearch-backed (siehe
 * `route.ts`). Dieser Handler ist der Fallback für:
 *   - Feature-Flag SEARCH_MEILI_ADMIN OFF
 *   - Meili Health-Probe tripped
 *   - Meili Runtime-Error gecatched
 *
 * Ausserdem wird er über den Query-Param `_backend=postgres` explizit
 * aufrufbar — das nutzt die Paritätsmatrix-Suite (Plan §4.A) um Postgres-
 * und Meili-Ergebnisse gegeneinander zu vergleichen.
 */
export async function adminMediaGetPostgres(
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
    // ── rc23 new filters: Import ──
    import_collection,
    import_action,
    // ── rc23 new filters: Inventory ──
    inventory_state,
    inventory_status,
    stocktake,
    price_locked,
    warehouse_location,
    // ────────────────────────────
    sort = "title_asc",
    limit = "25",
    offset = "0",
  } = req.query

  // ── Inventory subquery: aggregate per release_id so multiple exemplars
  // don't multiply Release rows (Exemplar-Modell, Phase 0 regression fix).
  // Returns exactly 1 row per release_id with first exemplar's fields + counts.
  // Erweitert 2026-04-22: barcode, exemplar_price, condition_media,
  // condition_sleeve mit aufnehmen damit die Catalog-Liste die im Stocktake
  // erfassten Werte zeigen kann (COALESCE im SELECT unten).
  const inventorySub = pgConnection("erp_inventory_item")
    .select(
      "release_id",
      pgConnection.raw("(array_agg(id ORDER BY COALESCE(copy_number,1)))[1] as id"),
      pgConnection.raw("(array_agg(barcode ORDER BY COALESCE(copy_number,1)))[1] as barcode"),
      pgConnection.raw("(array_agg(quantity ORDER BY COALESCE(copy_number,1)))[1] as quantity"),
      pgConnection.raw("(array_agg(status ORDER BY COALESCE(copy_number,1)))[1] as status"),
      pgConnection.raw("(array_agg(price_locked ORDER BY COALESCE(copy_number,1)))[1] as price_locked"),
      pgConnection.raw("(array_agg(last_stocktake_at ORDER BY COALESCE(copy_number,1)))[1] as last_stocktake_at"),
      pgConnection.raw("(array_agg(warehouse_location_id ORDER BY COALESCE(copy_number,1)))[1] as warehouse_location_id"),
      pgConnection.raw("(array_agg(exemplar_price ORDER BY COALESCE(copy_number,1)))[1] as exemplar_price"),
      pgConnection.raw("(array_agg(condition_media ORDER BY COALESCE(copy_number,1)))[1] as condition_media"),
      pgConnection.raw("(array_agg(condition_sleeve ORDER BY COALESCE(copy_number,1)))[1] as condition_sleeve"),
      pgConnection.raw("COUNT(*)::int as exemplar_count"),
      pgConnection.raw("COUNT(*) FILTER (WHERE last_stocktake_at IS NOT NULL)::int as verified_count")
    )
    .groupBy("release_id")
    .as("ii")

  let query = pgConnection("Release")
    .select(
      "Release.id",
      "Release.title",
      "Release.slug",
      "Release.format",
      "Release.format_id",
      "Release.product_category",
      "Release.year",
      "Release.country",
      "Release.coverImage",
      "Release.catalogNumber",
      "Release.article_number",
      "Release.barcode",
      "Release.estimated_value",
      "Release.auction_status",
      "Release.sale_mode",
      "Release.media_condition",
      "Release.sleeve_condition",
      "Release.discogs_id",
      "Release.legacy_price",
      "Release.discogs_lowest_price",
      "Release.discogs_num_for_sale",
      "Release.discogs_have",
      "Release.discogs_want",
      "Release.discogs_last_synced",
      "Release.inventory",
      "Release.legacy_last_synced",
      "Artist.name as artist_name",
      "Label.name as label_name",
      "Format.name as format_name",
      "Format.format_group",
      "Format.kat as format_kat",
      // ── Inventory: aggregated from subquery (1 row per release) ──
      "ii.id as inventory_item_id",
      "ii.barcode as inventory_barcode",
      "ii.quantity as inventory_quantity",
      "ii.status as inventory_item_status",
      "ii.price_locked",
      "ii.last_stocktake_at",
      "ii.exemplar_count",
      "ii.verified_count",
      "ii.exemplar_price",
      "ii.condition_media as erp_condition_media",
      "ii.condition_sleeve as erp_condition_sleeve",
      // ── COALESCE: ERP-Werte gewinnen über Release-Werte. Falls in der
      // Vergangenheit Stocktake-Daten erfasst wurden ohne Mirror auf Release
      // (vor dem Fix 2026-04-22), zeigt die Catalog-Liste trotzdem die
      // korrekten Werte. Effective: bevorzugt exemplar_price, dann legacy_price.
      pgConnection.raw('COALESCE(ii.exemplar_price, "Release".legacy_price) as effective_price'),
      pgConnection.raw('COALESCE(ii.condition_media, "Release".media_condition) as effective_media_condition'),
      pgConnection.raw('COALESCE(ii.condition_sleeve, "Release".sleeve_condition) as effective_sleeve_condition'),
      "warehouse_location.code as warehouse_code",
      "warehouse_location.name as warehouse_name"
    )
    .leftJoin("Artist", "Release.artistId", "Artist.id")
    .leftJoin("Label", "Release.labelId", "Label.id")
    .leftJoin("Format", "Release.format_id", "Format.id")
    // ── Inventory subquery: guarantees 1 row per release (no duplication) ──
    .leftJoin(inventorySub, "Release.id", "ii.release_id")
    .leftJoin("warehouse_location", "ii.warehouse_location_id", "warehouse_location.id")

  // Search: Postgres FTS via Release.search_text (denormalisiert title +
  // catalogNumber + article_number + Artist.name + Label.name). Ersetzt 2026-04-22
  // die alte Multi-Column-OR-ILIKE die Seq Scan ueber 52k Rows machte (~6s).
  // FTS ueber idx_release_search_fts: ~30ms. Plus Inventory-Barcode-Subquery
  // (erp_inventory_item.barcode wie "VOD-000002") als zusaetzliche Treffer-
  // quelle, weil Barcodes Exemplar-Level sind und nicht in Release.search_text
  // landen koennen.
  if (q && typeof q === "string" && q.trim()) {
    const trimmed = q.trim()
    const ftsSubquery = buildReleaseSearchSubquery(pgConnection, trimmed)
    const barcodeSubquery = pgConnection("erp_inventory_item")
      .select("release_id")
      .whereRaw("UPPER(barcode) = UPPER(?)", [trimmed])

    if (ftsSubquery) {
      query = query.where(function () {
        this.whereIn("Release.id", ftsSubquery).orWhereIn("Release.id", barcodeSubquery)
      })
    } else {
      // Fallback: Tokens leer (z.B. nur Sonderzeichen) → nur Barcode-Lookup
      query = query.whereIn("Release.id", barcodeSubquery)
    }
  }

  if (format && typeof format === "string") {
    query = query.where("Release.format", format)
  }

  if (year_from && typeof year_from === "string") {
    query = query.where("Release.year", ">=", parseInt(year_from))
  }
  if (year_to && typeof year_to === "string") {
    query = query.where("Release.year", "<=", parseInt(year_to))
  }

  if (country && typeof country === "string") {
    query = query.where("Release.country", country)
  }

  if (label && typeof label === "string" && label.trim()) {
    query = query.whereILike("Label.name", `%${label.trim()}%`)
  }

  if (auction_status && typeof auction_status === "string") {
    query = query.where("Release.auction_status", auction_status)
  }

  if (category && typeof category === "string") {
    switch (category) {
      case "tapes":
        query = query.where("Release.product_category", "release").where("Format.kat", 1)
        break
      case "vinyl":
        query = query.where("Release.product_category", "release").where("Format.kat", 2)
        break
      case "band_literature":
        query = query.where("Release.product_category", "band_literature")
        break
      case "label_literature":
        query = query.where("Release.product_category", "label_literature")
        break
      case "press_literature":
        query = query.where("Release.product_category", "press_literature")
        break
    }
  }

  // Discogs filters
  if (has_discogs === "true") {
    query = query.whereNotNull("Release.discogs_id")
  }
  if (has_discogs === "false") {
    query = query.whereNull("Release.discogs_id")
  }
  if (has_price === "true") {
    query = query.whereNotNull("Release.discogs_lowest_price")
  }
  if (has_price === "false") {
    query = query.whereNull("Release.discogs_lowest_price")
  }

  // Image filter
  if (has_image === "true") {
    query = query.whereNotNull("Release.coverImage").where("Release.coverImage", "!=", "")
  }
  if (has_image === "false") {
    query = query.where(function () {
      this.whereNull("Release.coverImage").orWhere("Release.coverImage", "")
    })
  }

  // Visibility filter (visible = has coverImage AND legacy_price)
  if (visibility === "visible") {
    query = query
      .whereNotNull("Release.coverImage")
      .whereNotNull("Release.legacy_price")
  }
  if (visibility === "hidden") {
    query = query.where(function () {
      this.whereNull("Release.coverImage")
        .orWhereNull("Release.legacy_price")
    })
  }

  // ── rc23: Import Filter ─────────────────────────────────────────
  // Uses whereExists subquery on import_log — release_id index makes this fast.
  // `whereExists` semantics = "release has been touched by at least one import
  // that matches the filter criteria" (OR-join across multiple imports).
  if (import_collection && typeof import_collection === "string" && import_collection.trim()) {
    const coll = import_collection.trim()
    const action = typeof import_action === "string" && import_action.trim() ? import_action.trim() : null
    query = query.whereExists(function () {
      this.select("*")
        .from("import_log")
        .whereRaw('"import_log"."release_id" = "Release"."id"')
        .where("import_log.import_type", "discogs_collection")
        .where("import_log.collection_name", coll)
      if (action) {
        this.where("import_log.action", action)
      }
    })
  } else if (import_action && typeof import_action === "string" && import_action.trim()) {
    // Action-only filter (any collection)
    const action = import_action.trim()
    query = query.whereExists(function () {
      this.select("*")
        .from("import_log")
        .whereRaw('"import_log"."release_id" = "Release"."id"')
        .where("import_log.import_type", "discogs_collection")
        .where("import_log.action", action)
    })
  }

  // ── rc23: Inventory Filter ──────────────────────────────────────
  // All inventory filters use the aggregated subquery alias "ii" (1 row per release).
  // Filter semantics: filters apply to the FIRST exemplar's fields (copy_number=1).
  // For multi-exemplar releases, this means the filter reflects the primary copy.
  if (inventory_state === "any") {
    query = query.whereNotNull("ii.id")
  }
  if (inventory_state === "none") {
    query = query.whereNull("ii.id")
  }
  if (inventory_state === "in_stock") {
    query = query.where("ii.quantity", ">", 0)
  }
  if (inventory_state === "out_of_stock") {
    query = query
      .whereNotNull("ii.id")
      .where("ii.quantity", "=", 0)
  }

  if (inventory_status && typeof inventory_status === "string" && inventory_status.trim()) {
    query = query.where("ii.status", inventory_status.trim())
  }

  // Stocktake states:
  // - done    = last_stocktake_at IS NOT NULL AND >= NOW() - 90 days (recent)
  // - pending = inventory_item exists but last_stocktake_at IS NULL (never checked)
  // - stale   = last_stocktake_at < NOW() - 90 days (outdated, needs recheck)
  if (stocktake === "done") {
    query = query
      .whereNotNull("ii.last_stocktake_at")
      .where("ii.last_stocktake_at", ">=", pgConnection.raw("NOW() - INTERVAL '90 days'"))
  }
  if (stocktake === "pending") {
    query = query
      .whereNotNull("ii.id")
      .whereNull("ii.last_stocktake_at")
  }
  if (stocktake === "stale") {
    query = query
      .whereNotNull("ii.last_stocktake_at")
      .where("ii.last_stocktake_at", "<", pgConnection.raw("NOW() - INTERVAL '90 days'"))
  }

  if (price_locked === "true") {
    query = query.where("ii.price_locked", true)
  }
  if (price_locked === "false") {
    query = query.where(function () {
      this.where("ii.price_locked", false)
        .orWhereNull("ii.price_locked")
    })
  }

  if (warehouse_location && typeof warehouse_location === "string" && warehouse_location.trim()) {
    query = query.where("warehouse_location.code", warehouse_location.trim())
  }

  // Count before pagination.
  //
  // Performance: wenn keine Filter aktiv sind (Erstaufruf der Catalog-Seite
  // ohne Suche/Filter), war der Clone-Count-Query ein Full-JOIN von Release
  // mit der 13k-Row inventorySub + Artist + Label + Format + warehouse_location,
  // nur um COUNT(*) zurueckzugeben. Fuer den No-Filter-Fall ist das
  // aequivalent zu einem einfachen `SELECT COUNT(*) FROM "Release"` — der
  // ueber Index-Only-Scan auf der PK laeuft (~30-50ms statt 1-2s).
  const hasAnyFilter = !!(
    (q && typeof q === "string" && q.trim()) ||
    format ||
    (year_from && typeof year_from === "string") ||
    (year_to && typeof year_to === "string") ||
    country ||
    (label && typeof label === "string" && label.trim()) ||
    auction_status ||
    category ||
    has_discogs ||
    has_price ||
    has_image ||
    visibility ||
    (import_collection && typeof import_collection === "string" && import_collection.trim()) ||
    (import_action && typeof import_action === "string" && import_action.trim()) ||
    inventory_state ||
    (inventory_status && typeof inventory_status === "string" && inventory_status.trim()) ||
    stocktake ||
    price_locked ||
    (warehouse_location && typeof warehouse_location === "string" && warehouse_location.trim())
  )

  const countQuery = hasAnyFilter
    ? query.clone().clearSelect().clearOrder().count("Release.id as count").first()
    : pgConnection("Release").count("* as count").first()

  // Sorting
  const sortMap: Record<string, [string, string]> = {
    title_asc: ["Release.title", "asc"],
    title_desc: ["Release.title", "desc"],
    artist_asc: ["Artist.name", "asc"],
    artist_desc: ["Artist.name", "desc"],
    year_asc: ["Release.year", "asc"],
    year_desc: ["Release.year", "desc"],
    country_asc: ["Release.country", "asc"],
    country_desc: ["Release.country", "desc"],
    label_asc: ["Label.name", "asc"],
    label_desc: ["Label.name", "desc"],
    price_asc: ["Release.discogs_lowest_price", "asc"],
    price_desc: ["Release.discogs_lowest_price", "desc"],
    synced_asc: ["Release.discogs_last_synced", "asc"],
    synced_desc: ["Release.discogs_last_synced", "desc"],
  }
  // Support both "field_dir" and "field:dir" formats
  const sortKey = (sort as string).replace(":", "_")
  const [sortCol, sortDir] = sortMap[sortKey] || sortMap.title_asc

  const [releases, countResult] = await Promise.all([
    query
      .orderBy(sortCol, sortDir)
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string)),
    countQuery,
  ])

  res.json({
    releases,
    count: Number(countResult?.count || 0),
  })
}
