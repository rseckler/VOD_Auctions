import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag } from "../../../../../lib/inventory"
import { buildReleaseSearchWhereRawAliased, getSearchTokens } from "../../../../../lib/release-search"

/**
 * GET /admin/erp/inventory/search?q=<query>&limit=20
 *
 * Search inventory items by artist, title, catalog number, or barcode.
 * Returns Release-level results with exemplar counts.
 * Barcode exact match is tried first (scanner input).
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "ERP_INVENTORY")

  const q = ((req.query.q as string) || "").trim()
  const limit = Math.min(parseInt((req.query.limit as string) || "20"), 50)

  if (!q) {
    res.json({ results: [], total: 0 })
    return
  }

  // Step 1a: Barcode exact match (scanner input pattern VOD-XXXXXX, 6 digits)
  if (/^VOD-\d{6}$/i.test(q)) {
    const barcodeResult = await pg.raw(`
      SELECT
        r.id as release_id, r.title, r."coverImage", r.legacy_price, r.format,
        r."catalogNumber", r.year, r.country, r.legacy_condition,
        r.discogs_id, r.discogs_lowest_price, r.discogs_median_price,
        r.discogs_highest_price, r.discogs_num_for_sale,
        a.name as artist_name, l.name as label_name,
        ii.id as inventory_item_id, ii.barcode, ii.copy_number,
        ii.condition_media, ii.condition_sleeve, ii.exemplar_price,
        ii.last_stocktake_at, ii.price_locked
      FROM erp_inventory_item ii
      JOIN "Release" r ON r.id = ii.release_id
      LEFT JOIN "Artist" a ON a.id = r."artistId"
      LEFT JOIN "Label" l ON l.id = r."labelId"
      WHERE UPPER(ii.barcode) = UPPER(?)
      LIMIT 1
    `, [q])

    if (barcodeResult.rows.length > 0) {
      const row = barcodeResult.rows[0]
      res.json({
        results: [{
          release_id: row.release_id,
          artist_name: row.artist_name,
          title: row.title,
          format: row.format,
          catalog_number: row.catalogNumber,
          cover_image: row.coverImage,
          legacy_price: row.legacy_price != null ? Number(row.legacy_price) : null,
          exemplar_count: 1,
          verified_count: row.last_stocktake_at ? 1 : 0,
          discogs_median: row.discogs_median_price != null ? Number(row.discogs_median_price) : null,
          // Direct hit: include the specific exemplar
          matched_exemplar: {
            inventory_item_id: row.inventory_item_id,
            barcode: row.barcode,
            copy_number: row.copy_number,
            condition_media: row.condition_media,
            condition_sleeve: row.condition_sleeve,
            exemplar_price: row.exemplar_price != null ? Number(row.exemplar_price) : null,
            is_verified: !!row.last_stocktake_at,
          }
        }],
        total: 1,
        match_type: "barcode"
      })
      return
    }
  }

  // Step 1b: Article-Number exact match — tape-mag-Katalognummer VOD-<Ziffern>,
  // variable Länge (VOD-123, VOD-19586, VOD-100000 ...). Unser Inventar-Barcode
  // (Step 1a, 6-stellig sequentiell VOD-000001..) und Franks article_number sind
  // beide VOD-<Ziffern> — in der Praxis gibt es selten Kollisionen, aber der
  // exakte Barcode-Lookup läuft zuerst. Wenn nichts gefunden → article_number.
  if (/^VOD-\d+$/i.test(q)) {
    const articleResult = await pg.raw(`
      SELECT
        r.id as release_id, r.title, r."coverImage", r.legacy_price, r.format,
        r."catalogNumber", r.article_number, r.year, r.country,
        r.discogs_median_price, r.discogs_id,
        a.name as artist_name, l.name as label_name,
        COUNT(ii.id)::int as exemplar_count,
        COUNT(ii.id) FILTER (WHERE ii.last_stocktake_at IS NOT NULL)::int as verified_count
      FROM "Release" r
      LEFT JOIN erp_inventory_item ii ON ii.release_id = r.id
      LEFT JOIN "Artist" a ON a.id = r."artistId"
      LEFT JOIN "Label" l ON l.id = r."labelId"
      WHERE UPPER(r.article_number) = UPPER(?)
      GROUP BY r.id, a.name, l.name
      LIMIT 5
    `, [q])

    if (articleResult.rows.length > 0) {
      const rows = articleResult.rows.map((r: any) => ({
        release_id: r.release_id,
        artist_name: r.artist_name,
        title: r.title,
        format: r.format,
        catalog_number: r.catalogNumber,
        article_number: r.article_number,
        cover_image: r.coverImage,
        legacy_price: r.legacy_price != null ? Number(r.legacy_price) : null,
        label_name: r.label_name,
        year: r.year,
        country: r.country,
        exemplar_count: r.exemplar_count,
        verified_count: r.verified_count,
        discogs_median: r.discogs_median_price != null ? Number(r.discogs_median_price) : null,
        discogs_id: r.discogs_id,
      }))
      res.json({ results: rows, total: rows.length, match_type: "article_number" })
      return
    }
  }

  // Step 2: Text search — searches ALL releases (not just Cohort A).
  // Performance: Nutzt Postgres FTS mit tsvector-GIN-Index auf denormalisierter
  // `Release.search_text` Spalte (title + catalogNumber + article_number +
  // artist.name + label.name). Multi-Word Search via AND-Semantik: alle
  // Tokens muessen in search_text vorkommen. Siehe
  // `backend/src/lib/release-search.ts` und Migration
  // `2026-04-22_release_search_text_fts.sql`.
  // Ergebnis: ~20ms statt 6s fuer 52k Rows, auch bei Multi-Word-Queries
  // wie "music various" die in der alten ILIKE-Substring-Match keinen Treffer
  // fanden (weil "music various" als exakte Zeichenkette nirgends steht).
  const ftsClause = buildReleaseSearchWhereRawAliased(q, "r")
  if (!ftsClause) {
    res.json({ results: [], total: 0, match_type: "text" })
    return
  }

  // Ranking: bei vorhandenem ersten Token bevorzugen wir artist/title-Matches
  // (feinere Sortierung als FTS ranking). Das ist ein subjektiver Schliff,
  // nicht performance-relevant.
  const tokens = getSearchTokens(q)
  const primaryToken = tokens[0]
  const primaryLike = `%${primaryToken}%`
  const primaryPrefix = `${primaryToken}%`

  const result = await pg.raw(`
    SELECT
      r.id as release_id, r.title, r."coverImage", r.legacy_price, r.format,
      r."catalogNumber", r.article_number, r.year, r.country,
      r.discogs_median_price, r.discogs_id,
      a.name as artist_name, l.name as label_name,
      COUNT(ii.id)::int as exemplar_count,
      COUNT(ii.id) FILTER (WHERE ii.last_stocktake_at IS NOT NULL)::int as verified_count
    FROM "Release" r
    LEFT JOIN erp_inventory_item ii ON ii.release_id = r.id
    LEFT JOIN "Artist" a ON a.id = r."artistId"
    LEFT JOIN "Label" l ON l.id = r."labelId"
    WHERE ${ftsClause.sql}
    GROUP BY r.id, a.name, l.name
    ORDER BY
      CASE
        WHEN lower(r.article_number) = lower(?) THEN 0
        WHEN lower(a.name) LIKE ? THEN 1
        WHEN lower(r.title) LIKE ? THEN 2
        WHEN lower(a.name) LIKE ? THEN 3
        WHEN lower(r.title) LIKE ? THEN 4
        ELSE 5
      END,
      a.name ASC NULLS LAST, r.title ASC
    LIMIT ?
  `, [...ftsClause.bindings, q, primaryLike, primaryLike, primaryPrefix, primaryPrefix, limit])

  const results = result.rows.map((r: any) => ({
    release_id: r.release_id,
    artist_name: r.artist_name,
    title: r.title,
    format: r.format,
    catalog_number: r.catalogNumber,
    article_number: r.article_number,
    cover_image: r.coverImage,
    legacy_price: r.legacy_price != null ? Number(r.legacy_price) : null,
    label_name: r.label_name,
    year: r.year,
    country: r.country,
    exemplar_count: r.exemplar_count,
    verified_count: r.verified_count,
    discogs_median: r.discogs_median_price != null ? Number(r.discogs_median_price) : null,
    discogs_id: r.discogs_id,
  }))

  res.json({ results, total: results.length, match_type: "text" })
}
