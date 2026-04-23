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
  | "artist_asc"
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

  return parts
}

function buildSort(sort?: CatalogSort): string[] {
  switch (sort) {
    case "year_asc":
      return ["year:asc"]
    case "year_desc":
      return ["year:desc"]
    case "price_asc":
      return ["effective_price:asc"]
    case "price_desc":
      return ["effective_price:desc"]
    case "title_asc":
      return ["title:asc"]
    case "artist_asc":
      return ["artist_name:asc"]
    case "newest":
      return ["updated_at:desc"]
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
      return "artist_asc"
    case "title":
      return "title_asc"
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
        sort === "artist_asc"
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
