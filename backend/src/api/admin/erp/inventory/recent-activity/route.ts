import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag } from "../../../../../lib/inventory"

/**
 * GET /admin/erp/inventory/recent-activity?limit=10
 *
 * Letzte verifizierte/geänderte Exemplare aus der Inventur — für die
 * "Zuletzt bearbeitet"-Sektion in /app/erp/inventory/session. Der vorige
 * rein-in-memory State (useState im Session-Screen) war nach jedem
 * Page-Reload leer → Frank hatte keinen Kontext wenn er die Session
 * neu startete.
 *
 * Quelle: letzte erp_inventory_movement-Einträge mit Reason "stocktake_*"
 * und den korrespondierenden Release+Artist-Infos. Preis kommt aus der
 * Movement-reference (zur Zeit des Movements geloggt) mit Fallback auf
 * den aktuellen exemplar_price.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "ERP_INVENTORY")

  // Cap auf 1000: Frank's UI hat einen scrollbaren Container, deshalb ist 1000
  // ein praktischer Plafond. Ohne Virtualization rendert React 1000 Rows
  // problemlos (~50ms initial). Default 500 wenn Frontend nichts anders sagt.
  const limit = Math.min(1000, Math.max(1, Number((req.query as any)?.limit) || 500))

  // Nur die neuesten N Movements mit stocktake-Reason. Andere Reasons
  // (bulk_price_adjust, catalog_price_update etc.) blenden wir aus —
  // hier geht's um die Frank-Session-Aktivität.
  // GROUP BY damit bei Mehrfach-Movements pro Item nur das neueste zählt.
  const rows = await pg.raw(
    `
    WITH recent_movements AS (
      SELECT DISTINCT ON (inventory_item_id)
        id, inventory_item_id, reason, reference, performed_by, created_at
      FROM erp_inventory_movement
      WHERE reason LIKE 'stocktake_%'
      ORDER BY inventory_item_id, created_at DESC
    )
    SELECT
      rm.id AS movement_id,
      rm.inventory_item_id,
      rm.reason,
      rm.reference,
      rm.performed_by,
      rm.created_at,
      ii.barcode,
      ii.copy_number,
      ii.condition_media,
      ii.condition_sleeve,
      ii.exemplar_price,
      r.id AS release_id,
      r.title,
      r.article_number,
      r.format,
      a.name AS artist_name
    FROM recent_movements rm
    JOIN erp_inventory_item ii ON ii.id = rm.inventory_item_id
    JOIN "Release" r ON r.id = ii.release_id
    LEFT JOIN "Artist" a ON a.id = r."artistId"
    ORDER BY rm.created_at DESC
    LIMIT ?
    `,
    [limit]
  )

  const items = rows.rows.map((row: any) => {
    // Condition-String (Media/Sleeve kombiniert)
    const condition =
      row.condition_media && row.condition_sleeve && row.condition_media !== row.condition_sleeve
        ? `${row.condition_media}/${row.condition_sleeve}`
        : row.condition_media || row.condition_sleeve || null

    // Preis: aus Movement-reference bevorzugt (zeitpunkt-genau) mit Fallback
    // auf aktuellen exemplar_price
    let price: number | null = null
    try {
      const ref = row.reference
        ? typeof row.reference === "string"
          ? JSON.parse(row.reference)
          : row.reference
        : null
      if (ref) {
        if (ref.new_price != null) price = Number(ref.new_price)
        else if (ref.exemplar_price != null) price = Number(ref.exemplar_price)
        else if (ref.exemplar_price_mirror != null) price = Number(ref.exemplar_price_mirror)
      }
    } catch {
      // ignore parse errors
    }
    if (price == null && row.exemplar_price != null) price = Number(row.exemplar_price)

    return {
      release_id: row.release_id,
      inventory_item_id: row.inventory_item_id,
      artist: row.artist_name || "Unknown",
      title: row.title,
      article_number: row.article_number || null,
      format: row.format || null,
      copy: Number(row.copy_number),
      barcode: row.barcode || null,
      condition,
      price,
      at: row.created_at,
      actor: row.performed_by,
    }
  })

  res.json({ items })
}
