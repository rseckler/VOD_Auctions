import type { Knex } from "knex"
import { getMeiliClient, COMMERCE_INDEX, DISCOVERY_INDEX } from "./meilisearch"

/**
 * On-Demand-Reindex eines einzelnen Release-Dokuments (rc48 Phase 2).
 *
 * Spiegelt die SELECT- und Transform-Logik aus `scripts/meilisearch_sync.py`
 * für **genau eine** Release-ID, fire-and-forget aus Write-Handlern.
 *
 * Verwendung in Klasse-B-Mutations (siehe ADMIN_CATALOG_PERFORMANCE_PLAN.md §3.8):
 *
 *   // Am Ende der Mutation, NACH res.json() falls möglich:
 *   pushReleaseNow(pg, releaseId).catch((err) => {
 *     console.warn("meili push-now failed:", err.message)
 *   })
 *
 * Bei Fehler (Meili down, Index nicht da, etc.) wird nichts geworfen — das
 * `search_indexed_at = NULL`-Feld bleibt gesetzt von den Triggern, der Delta-
 * Cron fängt's im nächsten Lauf.
 *
 * **Ownership:** das SQL hier MUSS synchron mit `scripts/meilisearch_sync.py`
 * `BASE_SELECT_SQL` gehalten werden. Bei Änderungen dort hier identisch ändern.
 * Regressionsschutz: die Paritätsmatrix (§4.A) feuert täglich gegen Prod und
 * loggt Drift — aber Drift sollte gar nicht entstehen.
 */

const STOCKTAKE_STALE_DAYS = 90

const SELECT_SINGLE_RELEASE_SQL = `
  SELECT
    r.id,
    r.title,
    r.slug,
    r."catalogNumber"      AS catalog_number,
    r.article_number,
    r.format,
    r.format_id,
    r.product_category,
    r.year,
    r.country,
    r."coverImage"         AS cover_image,
    r.legacy_price,
    r.shop_price,
    r.estimated_value,
    r.legacy_available,
    r.sale_mode,
    r.auction_status,
    r.discogs_id,
    r.discogs_lowest_price,
    r.discogs_median_price,
    r.discogs_highest_price,
    r.discogs_num_for_sale,
    r.discogs_last_synced,
    r.media_condition,
    r.sleeve_condition,
    r."updatedAt"          AS updated_at,
    a.name                 AS artist_name,
    a.slug                 AS artist_slug,
    l.name                 AS label_name,
    l.slug                 AS label_slug,
    p.name                 AS press_orga_name,
    p.slug                 AS press_orga_slug,
    f.name                 AS format_name,
    f.format_group         AS format_group_raw,
    f.kat                  AS format_kat,
    ec.genre_tags          AS genres,
    (SELECT COUNT(*) FROM erp_inventory_item ii WHERE ii.release_id = r.id)::int AS exemplar_count,
    (SELECT COUNT(*) FROM erp_inventory_item ii
      WHERE ii.release_id = r.id AND ii.last_stocktake_at IS NOT NULL)::int AS verified_count,
    (SELECT ii.status FROM erp_inventory_item ii
      WHERE ii.release_id = r.id
      ORDER BY COALESCE(ii.copy_number, 1) ASC LIMIT 1) AS inventory_status_first,
    (SELECT ii.price_locked FROM erp_inventory_item ii
      WHERE ii.release_id = r.id
      ORDER BY COALESCE(ii.copy_number, 1) ASC LIMIT 1) AS price_locked_first,
    (SELECT ii.barcode FROM erp_inventory_item ii
      WHERE ii.release_id = r.id
      ORDER BY COALESCE(ii.copy_number, 1) ASC LIMIT 1) AS inventory_barcode_first,
    (SELECT MAX(ii.last_stocktake_at) FROM erp_inventory_item ii
      WHERE ii.release_id = r.id) AS last_stocktake_at_max,
    (SELECT wl.code FROM erp_inventory_item ii
      LEFT JOIN warehouse_location wl ON wl.id = ii.warehouse_location_id
      WHERE ii.release_id = r.id
      ORDER BY COALESCE(ii.copy_number, 1) ASC LIMIT 1) AS warehouse_code_first,
    (SELECT wl.id FROM erp_inventory_item ii
      LEFT JOIN warehouse_location wl ON wl.id = ii.warehouse_location_id
      WHERE ii.release_id = r.id
      ORDER BY COALESCE(ii.copy_number, 1) ASC LIMIT 1) AS warehouse_id_first,
    (SELECT wl.name FROM erp_inventory_item ii
      LEFT JOIN warehouse_location wl ON wl.id = ii.warehouse_location_id
      WHERE ii.release_id = r.id
      ORDER BY COALESCE(ii.copy_number, 1) ASC LIMIT 1) AS warehouse_name_first,
    (SELECT array_agg(DISTINCT il.collection_name)
      FROM import_log il
      WHERE il.release_id = r.id AND il.import_type = 'discogs_collection'
        AND il.collection_name IS NOT NULL) AS import_collections_arr,
    (SELECT array_agg(DISTINCT il.action)
      FROM import_log il
      WHERE il.release_id = r.id AND il.import_type = 'discogs_collection'
        AND il.action IS NOT NULL) AS import_actions_arr
  FROM "Release" r
  LEFT JOIN "Artist"    a ON a.id = r."artistId"
  LEFT JOIN "Label"     l ON l.id = r."labelId"
  LEFT JOIN "PressOrga" p ON p.id = r."pressOrgaId"
  LEFT JOIN "Format"    f ON f.id = r.format_id
  LEFT JOIN entity_content ec ON ec.entity_id = r."artistId" AND ec.entity_type = 'artist'
  WHERE r.id = ?
  LIMIT 1
`

function toFloat(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function computeFormatGroup(row: any): string {
  const fmt = (row.format || "").toUpperCase()
  const kat = row.format_kat
  const cat = row.product_category
  if (cat === "band_literature" || cat === "label_literature" || cat === "press_literature") {
    return cat
  }
  if (kat === 2 || fmt === "LP") return "vinyl"
  if (fmt === "CD") return "cd"
  if (fmt === "VHS") return "vhs"
  if (kat === 1 && (fmt === "CASSETTE" || fmt === "REEL")) return "tapes"
  if (kat === 1) return "tapes"
  return "other"
}

function computeStocktakeState(
  exemplarCount: number,
  lastStocktake: Date | null
): "none" | "pending" | "done" | "stale" {
  if (exemplarCount === 0) return "none"
  if (!lastStocktake) return "pending"
  const ageDays = (Date.now() - lastStocktake.getTime()) / (1000 * 60 * 60 * 24)
  return ageDays >= STOCKTAKE_STALE_DAYS ? "stale" : "done"
}

function transformToDoc(row: any): Record<string, unknown> {
  const shop = toFloat(row.shop_price)
  const legacy = toFloat(row.legacy_price)
  const estimated = toFloat(row.estimated_value)
  const verifiedCount = Number(row.verified_count) || 0
  const exemplarCount = Number(row.exemplar_count) || 0

  const hasShopPrice = shop !== null && shop > 0
  const hasVerifiedInventory = verifiedCount > 0
  const shopVisible = hasShopPrice && hasVerifiedInventory
  const effective = shopVisible ? shop : null
  const isPurchasable = shopVisible && !!row.legacy_available

  const year = row.year
  const decade = year ? Math.floor(year / 10) * 10 : null

  const lastStocktake = row.last_stocktake_at_max ? new Date(row.last_stocktake_at_max) : null
  const updatedAt = row.updated_at ? new Date(row.updated_at) : null
  const discogsSynced = row.discogs_last_synced ? new Date(row.discogs_last_synced) : null

  const stocktakeState = computeStocktakeState(exemplarCount, lastStocktake)

  return {
    id: row.id,
    release_id: row.id,
    title: row.title ?? null,
    slug: row.slug ?? null,
    artist_name: row.artist_name ?? null,
    artist_slug: row.artist_slug ?? null,
    label_name: row.label_name ?? null,
    label_slug: row.label_slug ?? null,
    press_orga_name: row.press_orga_name ?? null,
    press_orga_slug: row.press_orga_slug ?? null,
    format: row.format ?? null,
    format_name: row.format_name ?? null,
    format_group: computeFormatGroup(row),
    format_id: row.format_id ?? null,
    product_category: row.product_category ?? null,
    year,
    decade,
    country: row.country ?? null,
    country_code: null, // pushReleaseNow skippt ISO-Lookup (nicht kritisch für Sichtbarkeit)
    catalog_number: row.catalog_number ?? null,
    article_number: row.article_number ?? null,
    genres: Array.isArray(row.genres) ? row.genres : [],
    styles: [],
    cover_image: row.cover_image ?? null,
    has_cover: !!row.cover_image,
    has_image: !!row.cover_image,
    legacy_price: legacy,
    shop_price: shop,
    effective_price: effective,
    estimated_value: estimated,
    has_price: shopVisible,
    is_purchasable: isPurchasable,
    legacy_available: !!row.legacy_available,
    sale_mode: row.sale_mode ?? null,
    auction_status: row.auction_status ?? null,
    discogs_id: row.discogs_id ?? null,
    discogs_lowest_price: toFloat(row.discogs_lowest_price),
    discogs_median_price: toFloat(row.discogs_median_price),
    discogs_highest_price: toFloat(row.discogs_highest_price),
    discogs_num_for_sale: row.discogs_num_for_sale ?? null,
    discogs_last_synced: discogsSynced ? Math.floor(discogsSynced.getTime() / 1000) : 0,
    exemplar_count: exemplarCount,
    verified_count: verifiedCount,
    has_inventory: exemplarCount > 0,
    in_stock: exemplarCount > 0,
    cohort_a: shop !== null && shop > 0,
    inventory_status: row.inventory_status_first ?? null,
    price_locked: row.price_locked_first != null ? !!row.price_locked_first : null,
    inventory_barcode: row.inventory_barcode_first ?? null,
    warehouse_code: row.warehouse_code_first ?? null,
    warehouse_id: row.warehouse_id_first ?? null,
    warehouse_name: row.warehouse_name_first ?? null,
    import_collections: Array.isArray(row.import_collections_arr) ? row.import_collections_arr : [],
    import_actions: Array.isArray(row.import_actions_arr) ? row.import_actions_arr : [],
    stocktake_state: stocktakeState,
    last_stocktake_at: lastStocktake ? Math.floor(lastStocktake.getTime() / 1000) : 0,
    media_condition: row.media_condition ?? null,
    sleeve_condition: row.sleeve_condition ?? null,
    popularity_score: 0,
    indexed_at: Math.floor(Date.now() / 1000),
    updated_at: updatedAt ? updatedAt.toISOString() : null,
    updated_at_ts: updatedAt ? Math.floor(updatedAt.getTime() / 1000) : 0,
  }
}

/**
 * Pusht EIN Release-Dokument in beide Meili-Indexes (commerce + discovery).
 *
 * Fire-and-forget: der Caller ist für try/catch verantwortlich. Per Default
 * nicht-blockierend, daher nie in Transaction packen — kann nach dem commit.
 *
 * Löscht das Dokument aus Meili wenn der Release in Postgres nicht (mehr)
 * existiert. Nützlich für zukünftige Soft-Delete-Szenarien; im aktuellen
 * Workflow kommt's nicht vor.
 */
export async function pushReleaseNow(pg: Knex, releaseId: string): Promise<void> {
  const client = getMeiliClient()
  if (!client) {
    // Meili nicht konfiguriert — kein Fehler, Delta-Cron fängt's
    return
  }

  const result = await pg.raw(SELECT_SINGLE_RELEASE_SQL, [releaseId])
  const row = (result.rows || result)[0]

  if (!row) {
    // Release existiert nicht mehr → aus Meili löschen
    try {
      await client.index(COMMERCE_INDEX).deleteDocument(releaseId)
      await client.index(DISCOVERY_INDEX).deleteDocument(releaseId)
    } catch {
      // ignore — nächster Delta-Cleanup räumt's
    }
    return
  }

  const doc = transformToDoc(row)
  await Promise.all([
    client.index(COMMERCE_INDEX).updateDocuments([doc]),
    client.index(DISCOVERY_INDEX).updateDocuments([doc]),
  ])

  // State-Tabelle bumpen damit Delta-Cron das nicht doppelt pusht
  try {
    await pg("meilisearch_index_state")
      .insert({
        release_id: releaseId,
        indexed_at: new Date(),
        doc_hash: "push_now",
      })
      .onConflict("release_id")
      .merge({
        indexed_at: new Date(),
        doc_hash: "push_now",
      })
    // search_indexed_at auf NOW() setzen (statt NULL), damit delta-query
    // es nicht erneut einsammelt
    await pg("Release")
      .where("id", releaseId)
      .update({ search_indexed_at: new Date() })
  } catch {
    // nicht kritisch
  }
}
