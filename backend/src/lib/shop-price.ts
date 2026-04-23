import { Knex } from "knex"

/**
 * Shop-Price-Modell (rc47.x):
 * - `Release.shop_price` = einziger Shop-Preis, gesetzt vom Inventory-Process
 * - `Release.legacy_price` = nur Info (MySQL-tape-mag-Historie), NICHT als Shop-Preis verwenden
 * - Ein Item zeigt im Shop Preis + Add-to-Cart nur wenn:
 *     shop_price > 0 UND mindestens ein verifiziertes Exemplar existiert
 *     (erp_inventory_item mit last_stocktake_at IS NOT NULL AND price_locked=true)
 * - Toggle `site_config.catalog_visibility='all'` zeigt Items ohne Preis
 *   (im Frontend mit "" statt Preis-Tag, ohne Add-to-Cart)
 */

export interface ShopPriceFields {
  effective_price: number | null
  is_purchasable: boolean
  is_verified: boolean
  shop_price: number | null
}

/**
 * Enrich a list of Release-Rows (already fetched) mit effective_price +
 * is_purchasable + is_verified. Ein zusätzlicher Query auf
 * erp_inventory_item für die übergebenen IDs.
 *
 * Der Aufrufer MUSS sowohl `shop_price` als auch `legacy_available` in
 * der Row haben.
 */
export async function enrichWithShopPrice<T extends { id: string; shop_price?: number | string | null; legacy_available?: boolean | null }>(
  pg: Knex,
  rows: T[]
): Promise<(T & ShopPriceFields)[]> {
  if (rows.length === 0) return rows as (T & ShopPriceFields)[]

  const ids = rows.map((r) => r.id)
  const verifiedRows = await pg("erp_inventory_item")
    .whereIn("release_id", ids)
    .whereNotNull("last_stocktake_at")
    .where("price_locked", true)
    .select("release_id")

  const verified = new Set<string>()
  for (const v of verifiedRows) verified.add(v.release_id)

  return rows.map((r) => {
    const shop = r.shop_price != null ? Number(r.shop_price) : null
    const isVerified = verified.has(r.id)
    const hasShopPrice = shop != null && shop > 0
    const effective_price = hasShopPrice && isVerified ? shop : null
    return {
      ...r,
      shop_price: shop,
      effective_price,
      is_purchasable: effective_price != null && r.legacy_available !== false,
      is_verified: isVerified,
    }
  })
}
