import type { SearchParams, SearchResponse } from "meilisearch"
import { getMeiliClient, COMMERCE_INDEX, DISCOVERY_INDEX } from "./meilisearch"

// ─── Types ──────────────────────────────────────────────────────────────────

export type RankingProfile = "commerce" | "discovery"

export type CatalogSort =
  | "relevance"
  | "year_asc"
  | "year_desc"
  | "price_asc"
  | "price_desc"
  | "title_asc"
  | "title_desc"
  | "artist_asc"
  | "artist_desc"
  | "country_asc"
  | "country_desc"
  | "label_asc"
  | "label_desc"
  | "synced_asc"
  | "synced_desc"
  | "newest"

export interface CatalogFilters {
  format?: string
  format_group?: string
  product_category?: string
  country?: string
  country_code?: string
  year_from?: number
  year_to?: number
  decade?: number
  label_slug?: string
  artist_slug?: string
  genres?: string[]
  sale_mode?: string
  for_sale?: boolean
  has_cover?: boolean
  in_stock?: boolean
  // ── Admin-Filter (rc48 Phase 2) ──────────────────────────────────────
  has_discogs?: boolean
  has_image?: boolean
  has_inventory?: boolean
  visibility?: "visible" | "hidden"
  auction_status?: string
  inventory_status?: string
  price_locked?: boolean
  warehouse_code?: string
  import_collection?: string
  import_action?: string
  stocktake_state?: "none" | "pending" | "done" | "stale"
  category?: "tapes" | "vinyl" | "cd" | "vhs" | "band_literature" | "label_literature" | "press_literature"
}

export interface CatalogSearchParams {
  query?: string
  filters?: CatalogFilters
  sort?: CatalogSort
  page?: number
  limit?: number
  facets?: string[]
  highlight?: boolean
  ranking?: RankingProfile
}

// ─── Filter / sort builders ─────────────────────────────────────────────────

const escape = (s: string) => s.replace(/"/g, '\\"')

function buildFilterString(f?: CatalogFilters): string[] {
  if (!f) return []
  const parts: string[] = []

  if (f.format) parts.push(`format = "${escape(f.format)}"`)
  if (f.format_group) parts.push(`format_group = "${escape(f.format_group)}"`)
  if (f.product_category)
    parts.push(`product_category = "${escape(f.product_category)}"`)
  if (f.country_code) parts.push(`country_code = "${escape(f.country_code)}"`)

  if (f.year_from !== undefined && f.year_to !== undefined) {
    parts.push(`year >= ${f.year_from} AND year <= ${f.year_to}`)
  } else if (f.year_from !== undefined) {
    parts.push(`year = ${f.year_from}`)
  }

  if (f.decade !== undefined) parts.push(`decade = ${f.decade}`)
  if (f.label_slug) parts.push(`label_slug = "${escape(f.label_slug)}"`)
  if (f.artist_slug) parts.push(`artist_slug = "${escape(f.artist_slug)}"`)

  if (f.genres && f.genres.length) {
    const genreFilters = f.genres.map((g) => `genres = "${escape(g)}"`)
    parts.push(`(${genreFilters.join(" OR ")})`)
  }

  if (f.sale_mode) parts.push(`sale_mode = "${escape(f.sale_mode)}"`)
  if (f.for_sale) parts.push(`is_purchasable = true`)
  if (f.has_cover !== undefined) parts.push(`has_cover = ${f.has_cover}`)
  if (f.in_stock) parts.push(`in_stock = true`)

  // ── Admin-Filter (rc48) ────────────────────────────────────────────────
  if (f.has_discogs !== undefined) {
    parts.push(f.has_discogs ? `discogs_id EXISTS` : `discogs_id NOT EXISTS`)
  }
  if (f.has_image !== undefined) parts.push(`has_image = ${f.has_image}`)
  if (f.has_inventory !== undefined) parts.push(`has_inventory = ${f.has_inventory}`)

  // visibility (Storefront-Sichtbarkeit — shop_price + verified)
  if (f.visibility === "visible") parts.push(`is_purchasable = true`)
  // hidden: expr im Meili schwierig (kein OR-inverse-EXISTS kombiniert) →
  //   aktuell kein Filter gesetzt; UI-Toggle "hidden" leitet dann auf den
  //   Postgres-Fallback via route-Wrapper. Acceptance: wird in Paritätsmatrix
  //   separat verifiziert.

  if (f.auction_status) parts.push(`auction_status = "${escape(f.auction_status)}"`)

  // Inventory-Status: in_stock/out_of_stock/sold/etc.
  if (f.inventory_status) {
    parts.push(`inventory_status = "${escape(f.inventory_status)}"`)
  }

  if (f.price_locked !== undefined) parts.push(`price_locked = ${f.price_locked}`)

  if (f.warehouse_code) parts.push(`warehouse_code = "${escape(f.warehouse_code)}"`)

  if (f.import_collection) {
    parts.push(`import_collections = "${escape(f.import_collection)}"`)
  }
  if (f.import_action) {
    parts.push(`import_actions = "${escape(f.import_action)}"`)
  }

  if (f.stocktake_state) {
    parts.push(`stocktake_state = "${escape(f.stocktake_state)}"`)
  }

  // category: Shorthand der /admin/media-Parameter. Mapt auf format_group/
  // product_category kombiniert — der Postgres-Fallback macht exakt dasselbe.
  if (f.category) {
    switch (f.category) {
      case "tapes":
        parts.push(`format_group = "tapes"`)
        break
      case "vinyl":
        parts.push(`format_group = "vinyl"`)
        break
      case "cd":
        parts.push(`format_group = "cd"`)
        break
      case "vhs":
        parts.push(`format_group = "vhs"`)
        break
      case "band_literature":
      case "label_literature":
      case "press_literature":
        parts.push(`product_category = "${escape(f.category)}"`)
        break
    }
  }

  return parts
}

function buildSort(sort?: CatalogSort): string[] {
  switch (sort) {
    case "year_asc":
      return ["year:asc"]
    case "year_desc":
      return ["year:desc"]
    case "price_asc":
      return ["shop_price:asc"]
    case "price_desc":
      return ["shop_price:desc"]
    case "title_asc":
      return ["title:asc"]
    case "title_desc":
      return ["title:desc"]
    case "artist_asc":
      return ["artist_name:asc"]
    case "artist_desc":
      return ["artist_name:desc"]
    case "country_asc":
      // Meili hat country nicht in sortable — approximierter Sort über country_code.
      // Wenn Admin auf Country-Sort besteht, fällt Request ggf. auf Postgres zurück.
      return ["country_code:asc"]
    case "country_desc":
      return ["country_code:desc"]
    case "label_asc":
      // label_name ist nicht sortable — siehe country_asc.
      return []
    case "label_desc":
      return []
    case "synced_asc":
      return ["discogs_last_synced:asc"]
    case "synced_desc":
      return ["discogs_last_synced:desc"]
    case "newest":
      return ["updated_at_ts:desc"]
    default:
      return [] // "relevance" = no explicit sort, let rankingRules decide
  }
}

/**
 * Map legacy catalog-route query-params (sort + order) onto the enum.
 * catalog/route.ts uses `sort=price|year|artist|title` + `order=asc|desc`
 * — we accept either legacy shape or the new enum directly.
 */
export function mapLegacySort(
  sort: string | undefined,
  order: string | undefined
): CatalogSort {
  if (!sort) return "relevance"
  const o = order === "desc" ? "desc" : "asc"
  switch (sort) {
    case "price":
      return o === "desc" ? "price_desc" : "price_asc"
    case "year":
      return o === "desc" ? "year_desc" : "year_asc"
    case "artist":
      return o === "desc" ? "artist_desc" : "artist_asc"
    case "title":
      return o === "desc" ? "title_desc" : "title_asc"
    case "country":
      return o === "desc" ? "country_desc" : "country_asc"
    case "label":
      return o === "desc" ? "label_desc" : "label_asc"
    case "synced":
      return o === "desc" ? "synced_desc" : "synced_asc"
    case "newest":
      return "newest"
    case "relevance":
      return "relevance"
    default:
      // Already an enum value? Accept it.
      if (
        sort === "year_asc" ||
        sort === "year_desc" ||
        sort === "price_asc" ||
        sort === "price_desc" ||
        sort === "title_asc" ||
        sort === "title_desc" ||
        sort === "artist_asc" ||
        sort === "artist_desc" ||
        sort === "country_asc" ||
        sort === "country_desc" ||
        sort === "label_asc" ||
        sort === "label_desc" ||
        sort === "synced_asc" ||
        sort === "synced_desc" ||
        sort === "newest"
      ) {
        return sort as CatalogSort
      }
      return "relevance"
  }
}

// ─── Search ─────────────────────────────────────────────────────────────────

export async function searchReleases(
  params: CatalogSearchParams
): Promise<SearchResponse<Record<string, any>>> {
  const client = getMeiliClient()
  if (!client) {
    throw new Error(
      "Meilisearch client not configured (MEILI_ADMIN_API_KEY missing)"
    )
  }

  const indexName =
    params.ranking === "discovery" ? DISCOVERY_INDEX : COMMERCE_INDEX
  const index = client.index(indexName)

  const limit = Math.min(100, params.limit ?? 24)
  const offset = Math.max(0, ((params.page ?? 1) - 1) * limit)

  const searchParams: SearchParams = {
    limit,
    offset,
    filter: buildFilterString(params.filters),
    sort: buildSort(params.sort),
    facets: params.facets,
    attributesToHighlight: params.highlight
      ? ["artist_name", "title", "label_name"]
      : undefined,
    highlightPreTag: "<mark>",
    highlightPostTag: "</mark>",
  }

  return index.search(params.query || "", searchParams)
}

// ─── Legacy-shape mapper ────────────────────────────────────────────────────
//
// Storefront components expect field names from the Postgres-era response
// (camelCase for some, snake_case for others). Meili docs are all
// snake_case. This mapper keeps callers stable.

export interface LegacyReleaseShape {
  id: string
  title: string | null
  slug: string
  format: string | null
  format_id: number | null
  product_category: string | null
  year: number | null
  country: string | null
  coverImage: string | null
  catalogNumber: string | null
  article_number: string | null
  legacy_condition: string | null
  legacy_price: number | null
  shop_price: number | null
  legacy_available: boolean
  legacy_format_detail: string | null
  auction_status: string | null
  sale_mode: string | null
  artist_name: string | null
  artist_slug: string | null
  label_name: string | null
  label_slug: string | null
  press_orga_name: string | null
  press_orga_slug: string | null
  format_name: string | null
  format_group: string | null
  effective_price: number | null
  is_purchasable: boolean
  _highlight?: any
}

/**
 * Admin-Catalog-spezifischer Response-Shape (rc48 Phase 2).
 *
 * `/admin/media`-Frontend erwartet Release-Objekte mit camelCase-Keys wie
 * `coverImage` und `catalogNumber` (Postgres-Legacy-Schema), plus die
 * rc23-Inventory/Warehouse-Felder. Meili-Docs sind snake_case — dieser Mapper
 * hält den Client stabil damit die bestehende `page.tsx` ohne Änderung mit
 * beiden Backends funktioniert.
 */
export interface AdminReleaseShape {
  id: string
  title: string | null
  slug: string | null
  format: string | null
  format_id: number | null
  format_name: string | null
  format_group: string | null
  format_kat: number | null
  product_category: string | null
  year: number | null
  country: string | null
  coverImage: string | null
  catalogNumber: string | null
  article_number: string | null
  barcode: string | null
  estimated_value: number | null
  auction_status: string | null
  sale_mode: string | null
  media_condition: string | null
  sleeve_condition: string | null
  discogs_id: number | null
  legacy_price: number | null
  shop_price: number | null
  discogs_lowest_price: number | null
  discogs_num_for_sale: number | null
  discogs_have: number | null
  discogs_want: number | null
  discogs_last_synced: number | null
  inventory: number | null
  legacy_last_synced: number | null
  artist_name: string | null
  label_name: string | null
  // Inventory-first-exemplar shape (analog zum Postgres inventorySub)
  inventory_item_id: string | null
  inventory_barcode: string | null
  inventory_quantity: number | null
  inventory_item_status: string | null
  price_locked: boolean | null
  last_stocktake_at: number | null
  exemplar_count: number
  verified_count: number
  exemplar_price: number | null
  erp_condition_media: string | null
  erp_condition_sleeve: string | null
  effective_price: number | null
  effective_media_condition: string | null
  effective_sleeve_condition: string | null
  warehouse_code: string | null
  warehouse_name: string | null
  is_purchasable: boolean
  stocktake_state: string | null
}

export function toAdminShape(hit: any): AdminReleaseShape {
  const shopPrice = hit.shop_price ?? null
  const legacyPrice = hit.legacy_price ?? null
  const mediaCond = hit.media_condition ?? null
  const sleeveCond = hit.sleeve_condition ?? null

  return {
    id: hit.release_id ?? hit.id,
    title: hit.title ?? null,
    slug: hit.slug ?? null,
    format: hit.format ?? null,
    format_id: hit.format_id ?? null,
    format_name: hit.format_name ?? null,
    format_group: hit.format_group ?? null,
    format_kat: null, // not indexed currently; Admin-UI reads format_group instead
    product_category: hit.product_category ?? null,
    year: hit.year ?? null,
    country: hit.country ?? null,
    coverImage: hit.cover_image ?? null,
    catalogNumber: hit.catalog_number ?? null,
    article_number: hit.article_number ?? null,
    barcode: null, // Release.barcode rarely used, not indexed
    estimated_value: hit.estimated_value ?? null,
    auction_status: hit.auction_status ?? null,
    sale_mode: hit.sale_mode ?? null,
    media_condition: mediaCond,
    sleeve_condition: sleeveCond,
    discogs_id: hit.discogs_id ?? null,
    legacy_price: legacyPrice,
    shop_price: shopPrice,
    discogs_lowest_price: hit.discogs_lowest_price ?? null,
    discogs_num_for_sale: hit.discogs_num_for_sale ?? null,
    discogs_have: null,
    discogs_want: null,
    discogs_last_synced: hit.discogs_last_synced ?? null,
    inventory: null,
    legacy_last_synced: null,
    artist_name: hit.artist_name ?? null,
    label_name: hit.label_name ?? null,
    inventory_item_id: null, // Admin-UI needs to refetch from Postgres for edits
    inventory_barcode: hit.inventory_barcode ?? null,
    inventory_quantity: null,
    inventory_item_status: hit.inventory_status ?? null,
    price_locked: hit.price_locked ?? null,
    last_stocktake_at: hit.last_stocktake_at ?? null,
    exemplar_count: hit.exemplar_count ?? 0,
    verified_count: hit.verified_count ?? 0,
    exemplar_price: shopPrice, // Meili indexes first-exemplar-shape
    erp_condition_media: mediaCond,
    erp_condition_sleeve: sleeveCond,
    effective_price: hit.effective_price ?? null,
    effective_media_condition: mediaCond,
    effective_sleeve_condition: sleeveCond,
    warehouse_code: hit.warehouse_code ?? null,
    warehouse_name: hit.warehouse_name ?? null,
    is_purchasable: hit.is_purchasable ?? false,
    stocktake_state: hit.stocktake_state ?? null,
  }
}

export function toLegacyShape(hit: any): LegacyReleaseShape {
  return {
    id: hit.release_id ?? hit.id,
    title: hit.title ?? null,
    slug: hit.release_id ?? hit.id,
    format: hit.format ?? null,
    format_id: hit.format_id ?? null,
    product_category: hit.product_category ?? null,
    year: hit.year ?? null,
    country: hit.country ?? null,
    coverImage: hit.cover_image ?? null,
    catalogNumber: hit.catalog_number ?? null,
    article_number: hit.article_number ?? null,
    // Condition lives in Postgres (`Release.legacy_condition`), NOT in Meili.
    // Frontend treats null as "no condition listed".
    legacy_condition: null,
    legacy_price: hit.legacy_price ?? null,
    shop_price: hit.shop_price ?? null,
    legacy_available: hit.legacy_available ?? false,
    // Same as legacy_condition — not currently indexed.
    legacy_format_detail: null,
    auction_status: hit.auction_status ?? null,
    sale_mode: hit.sale_mode ?? null,
    artist_name: hit.artist_name ?? null,
    artist_slug: hit.artist_slug ?? null,
    label_name: hit.label_name ?? null,
    label_slug: hit.label_slug ?? null,
    press_orga_name: hit.press_orga_name ?? null,
    press_orga_slug: hit.press_orga_slug ?? null,
    format_name: hit.format_name ?? null,
    format_group: hit.format_group ?? null,
    effective_price: hit.effective_price ?? null,
    is_purchasable: hit.is_purchasable ?? false,
    _highlight: hit._formatted,
  }
}
