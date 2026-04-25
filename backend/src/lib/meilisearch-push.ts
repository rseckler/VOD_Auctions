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

// SELECT_SINGLE_RELEASE_SQL (rc49 IO-Fix): Spiegelt meilisearch_sync.py::
// BASE_SELECT_SQL (Single-Source-of-Truth). Nutzt CTEs inv_agg/imp_agg mit
// WHERE-Filter auf die eine release_id — so läuft jede CTE über nur die
// relevanten 1-10 Rows aus erp_inventory_item/import_log statt die ganze
// Tabelle zu aggregieren. Für on-demand-Push ist das sogar schneller als
// die alte korrelierte Subquery-Variante, weil weniger Plan-Overhead.
const SELECT_SINGLE_RELEASE_SQL = `
  WITH inv_agg AS (
    SELECT
      release_id,
      COUNT(*)::int AS exemplar_count,
      COUNT(*) FILTER (WHERE last_stocktake_at IS NOT NULL)::int AS verified_count,
      MAX(last_stocktake_at) AS last_stocktake_at_max,
      (array_agg(status ORDER BY COALESCE(copy_number, 1) ASC))[1] AS inventory_status_first,
      (array_agg(price_locked ORDER BY COALESCE(copy_number, 1) ASC))[1] AS price_locked_first,
      (array_agg(barcode ORDER BY COALESCE(copy_number, 1) ASC))[1] AS inventory_barcode_first,
      (array_agg(warehouse_location_id ORDER BY COALESCE(copy_number, 1) ASC))[1] AS warehouse_id_first
    FROM erp_inventory_item
    WHERE release_id = ?
    GROUP BY release_id
  ),
  imp_agg AS (
    SELECT
      release_id,
      array_agg(DISTINCT collection_name) FILTER (WHERE collection_name IS NOT NULL) AS collections,
      array_agg(DISTINCT action) FILTER (WHERE action IS NOT NULL) AS actions
    FROM import_log
    WHERE release_id = ? AND import_type = 'discogs_collection'
    GROUP BY release_id
  )
  SELECT
    r.id,
    r.title,
    r.slug,
    r."catalogNumber"      AS catalog_number,
    r.article_number,
    r.format,
    r.format_id,
    r.format_v2,
    r.format_descriptors,
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
    COALESCE(inv_agg.exemplar_count, 0) AS exemplar_count,
    COALESCE(inv_agg.verified_count, 0) AS verified_count,
    inv_agg.inventory_status_first,
    inv_agg.price_locked_first,
    inv_agg.inventory_barcode_first,
    inv_agg.last_stocktake_at_max,
    wl.code                AS warehouse_code_first,
    wl.id                  AS warehouse_id_first,
    wl.name                AS warehouse_name_first,
    imp_agg.collections    AS import_collections_arr,
    imp_agg.actions        AS import_actions_arr
  FROM "Release" r
  LEFT JOIN "Artist"    a ON a.id = r."artistId"
  LEFT JOIN "Label"     l ON l.id = r."labelId"
  LEFT JOIN "PressOrga" p ON p.id = r."pressOrgaId"
  LEFT JOIN "Format"    f ON f.id = r.format_id
  LEFT JOIN entity_content ec ON ec.entity_id = r."artistId" AND ec.entity_type = 'artist'
  LEFT JOIN inv_agg ON inv_agg.release_id = r.id
  LEFT JOIN imp_agg ON imp_agg.release_id = r.id
  LEFT JOIN warehouse_location wl ON wl.id = inv_agg.warehouse_id_first
  WHERE r.id = ?
  LIMIT 1
`

function toFloat(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Spiegel zu `meilisearch_sync.py::_compute_format_group` (Single-Source-of-
 * Truth per Doku §4.A.4). Bei Änderung an einer Stelle die andere identisch
 * nachziehen — Paritätsmatrix fängt Drift via category/format_group_*-Cases.
 */
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
  if (kat === 1) return "tapes"
  // Fallback wenn format_id fehlt: format-enum-Match (Postgres-Parität)
  if (kat == null && (fmt === "CASSETTE" || fmt === "REEL")) return "tapes"
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
    format_v2: row.format_v2 ?? null,
    format_descriptors: row.format_descriptors ?? null,
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
    has_discogs: row.discogs_id != null,
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

  // SQL hat 3 `?` Platzhalter (inv_agg.WHERE, imp_agg.WHERE, main WHERE)
  const result = await pg.raw(SELECT_SINGLE_RELEASE_SQL, [releaseId, releaseId, releaseId])
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
