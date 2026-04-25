import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag } from "../../../../../lib/inventory"
import { getFeatureFlag } from "../../../../../lib/feature-flags"
import { isMeiliEffective, getMeiliClient, COMMERCE_INDEX } from "../../../../../lib/meilisearch"
import { inventorySearchGetPostgres } from "./route-postgres-fallback"

/**
 * GET /admin/erp/inventory/search — Stocktake-Session-Scanner (rc49+).
 *
 * Workflow-Logik unverändert:
 *   Step 1a: VOD-XXXXXX (6-digit) → Barcode-Exact-Match via Postgres
 *            (Scanner-Input, direkt index-gesourced, <10ms — kein Meili)
 *   Step 1b: VOD-<any digits>     → Article-Number-Match via Postgres
 *            (direktes UPPER-Match, index-gesourced)
 *   Step 2:  Text-Search          → Meili (multi-word, Typo, Synonym)
 *
 * Barcode/Article-Lookups bleiben Postgres weil sie schon schnell sind UND
 * gefährlich für Meili wären (ein einziger exakter Match für Scanner-Input
 * muss deterministisch sein, Meili's Ranking würde evtl. andere Items zeigen).
 *
 * Gates für Step 2:
 *   1. Feature-Flag SEARCH_MEILI_ADMIN OFF → komplett Postgres
 *   2. Health-Probe tripped                → komplett Postgres
 *   3. `?_backend=postgres`                → komplett Postgres
 *   4. Meili-Runtime-Error                 → Fallback auf komplett Postgres
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "ERP_INVENTORY")

  const qRaw = ((req.query.q as string) || "").trim()
  const limit = Math.min(parseInt((req.query.limit as string) || "500", 10), 500)

  if (!qRaw) {
    res.json({ results: [], total: 0 })
    return
  }

  // Gate 3: explicit Postgres-Bypass
  if ((req.query._backend as string) === "postgres") {
    return inventorySearchGetPostgres(req, res)
  }

  // Step 1a: Barcode-Scanner-Pattern — beide Formate exact-match, deterministic.
  //   - neues Exemplar-Barcode (seit 2026-04-22):  000001VODe
  //   - altes Exemplar-Barcode (Legacy):            VOD-XXXXXX (6 digits)
  // → Direktes DB-Lookup, schnell. Bleibt Postgres (Scanner-Input darf nicht
  //   durch Meili-Ranking laufen, sonst evtl. anderer Treffer als gescannt).
  if (/^\d+VODe$/i.test(qRaw) || /^VOD-\d{6}$/i.test(qRaw)) {
    return inventorySearchGetPostgres(req, res)
  }

  // Step 1b: Article-Number-Pattern VOD-<any digits> (variable Länge)
  // → UPPER-Match auf article_number, index-backed. Bleibt Postgres.
  if (/^VOD-\d+$/i.test(qRaw)) {
    return inventorySearchGetPostgres(req, res)
  }

  // Step 2: Text-Search (multi-word mit Typo + Synonym)
  // → Meili wenn Flag + Health OK, sonst Fallback

  const flagOn = await getFeatureFlag(pg, "SEARCH_MEILI_ADMIN")
  if (!flagOn) {
    return inventorySearchGetPostgres(req, res)
  }
  if (!isMeiliEffective()) {
    return inventorySearchGetPostgres(req, res)
  }

  try {
    const client = getMeiliClient()
    if (!client) {
      return inventorySearchGetPostgres(req, res)
    }

    const result = await client.index(COMMERCE_INDEX).search(qRaw, {
      limit,
      // Kein harter Filter — Stocktake-Session sucht über alles, auch
      // Items ohne Inventar (Frank kann neue Copies anlegen).
      attributesToRetrieve: [
        "release_id",
        "title",
        "cover_image",
        "shop_price",
        "legacy_price",
        "format",
        "format_v2",
        "catalog_number",
        "article_number",
        "year",
        "country",
        "artist_name",
        "label_name",
        "exemplar_count",
        "verified_count",
        "discogs_median_price",
        "discogs_id",
      ],
    })

    const results = (result.hits as any[]).map((hit) => ({
      release_id: hit.release_id,
      artist_name: hit.artist_name ?? null,
      title: hit.title ?? null,
      format: hit.format ?? null,
      format_v2: hit.format_v2 ?? null,
      catalog_number: hit.catalog_number ?? null,
      article_number: hit.article_number ?? null,
      cover_image: hit.cover_image ?? null,
      legacy_price: hit.shop_price ?? hit.legacy_price ?? null,
      label_name: hit.label_name ?? null,
      year: hit.year ?? null,
      country: hit.country ?? null,
      exemplar_count: hit.exemplar_count ?? 0,
      verified_count: hit.verified_count ?? 0,
      discogs_median: hit.discogs_median_price ?? null,
      discogs_id: hit.discogs_id ?? null,
    }))

    res.json({
      results,
      total: result.estimatedTotalHits ?? results.length,
      match_type: "text",
      backend: "meili",
    })
  } catch (err: any) {
    console.error(
      JSON.stringify({
        event: "inventory_search_meili_fallback",
        error: err?.message,
      })
    )
    return inventorySearchGetPostgres(req, res)
  }
}
