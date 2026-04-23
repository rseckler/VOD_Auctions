import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { getFeatureFlag } from "../../../lib/feature-flags"
import { isMeiliEffective } from "../../../lib/meilisearch"
import {
  mapLegacySort,
  searchReleases,
  toLegacyShape,
} from "../../../lib/release-search-meili"
import { getSiteConfig } from "../../../lib/site-config"
import { catalogGetPostgres } from "./route-postgres-fallback"

/**
 * GET /store/catalog — Public catalog browse.
 *
 * Three-gate request path (see SEARCH_MEILISEARCH_PLAN.md §5.4):
 *   1. Feature flag SEARCH_MEILI_CATALOG off → postgres
 *   2. Health-probe tripped                  → postgres (skip trying Meili)
 *   3. Meili query throws at runtime         → log + postgres fallback
 *
 * All three paths return the same response shape so the storefront can't
 * tell which backend answered. The postgres path lives in
 * `route-postgres-fallback.ts` unchanged from the rc39 implementation.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const q = req.query as Record<string, string>

  // Gate 1: feature flag
  const flagOn = await getFeatureFlag(pg, "SEARCH_MEILI_CATALOG")
  if (!flagOn) {
    return catalogGetPostgres(req, res)
  }

  // Gate 2: effective flag (health-probe). If Meili tripped, skip trying.
  if (!isMeiliEffective()) {
    console.log(
      JSON.stringify({
        event: "meili_fallback",
        reason: "health_tripped",
        query: q.search,
      })
    )
    return catalogGetPostgres(req, res)
  }

  // Gate 3: try Meili, fall through to postgres on runtime error
  try {
    const page = q.page ? Math.max(1, parseInt(q.page)) : 1
    const limit = q.limit ? Math.min(100, parseInt(q.limit)) : 24
    const ranking = q.ranking === "relevance" ? "discovery" : "commerce"

    // Shop-Visibility-Gate (rc47.x): wenn site_config.catalog_visibility=
    // 'visible' (Default), zeigt der Shop nur Items mit shop_price + verifizier-
    // tem Inventar — gleichbedeutend mit Meili's `is_purchasable=true` Filter.
    // `for_sale=true` URL-Param forciert das ebenfalls (explizit vom User).
    const siteConfig = await getSiteConfig(pg)
    const effectiveForSale =
      q.for_sale === "true" || siteConfig.catalog_visibility === "visible"

    const result = await searchReleases({
      query: q.search,
      ranking,
      filters: {
        format: q.format,
        format_group: q.category,
        country: q.country,
        country_code: q.country_code,
        year_from: q.year_from ? parseInt(q.year_from) : undefined,
        year_to: q.year_to ? parseInt(q.year_to) : undefined,
        decade: q.decade ? parseInt(q.decade) : undefined,
        label_slug: q.label_slug,
        artist_slug: q.artist_slug,
        genres: q.genre ? [q.genre] : undefined,
        for_sale: effectiveForSale,
      },
      sort: mapLegacySort(q.sort, q.order),
      page,
      limit,
      facets: [
        "format_group",
        "decade",
        "country_code",
        "product_category",
        "genres",
        "styles",
      ],
    })

    const total = result.estimatedTotalHits ?? 0
    res.json({
      releases: result.hits.map(toLegacyShape),
      total,
      facets: result.facetDistribution,
      page,
      limit: result.limit ?? limit,
      pages: Math.ceil(total / (result.limit ?? limit)),
    })
  } catch (err: any) {
    console.error(
      JSON.stringify({
        event: "meili_runtime_fallback",
        error: err?.message,
        query: q.search,
      })
    )
    return catalogGetPostgres(req, res)
  }
}
