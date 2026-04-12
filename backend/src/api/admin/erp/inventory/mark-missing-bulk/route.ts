import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag } from "../../../../../lib/inventory"

/**
 * POST /admin/erp/inventory/mark-missing-bulk
 *
 * Marks all unverified inventory items as missing:
 * - Sets Release.legacy_price = 0 (makes item unpurchasable)
 * - Sets price_locked = true (sync won't overwrite)
 * - Records movement for each item
 *
 * Body: { confirmation: "MARK ALL MISSING" }
 *
 * This is a Phase 3 action — run AFTER the stocktake period is over.
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "ERP_INVENTORY")

  const body = req.body as { confirmation?: string } | undefined
  if (body?.confirmation !== "MARK ALL MISSING") {
    res.status(400).json({
      message: 'Confirmation required. Send { "confirmation": "MARK ALL MISSING" }',
    })
    return
  }

  const adminEmail = (req as any).auth_context?.actor_id || "admin"

  // Get count first
  const countResult = await pg.raw(`
    SELECT COUNT(*)::int as total
    FROM erp_inventory_item
    WHERE source = 'frank_collection' AND last_stocktake_at IS NULL
  `)
  const total = Number(countResult.rows[0]?.total || 0)

  if (total === 0) {
    res.json({ message: "No unverified items to mark", affected: 0 })
    return
  }

  await pg.transaction(async (trx) => {
    // Get all unverified items with their release_ids and current prices
    const items = await trx.raw(`
      SELECT ii.id, ii.release_id, r.legacy_price
      FROM erp_inventory_item ii
      JOIN "Release" r ON r.id = ii.release_id
      WHERE ii.source = 'frank_collection' AND ii.last_stocktake_at IS NULL
    `)

    // Set legacy_price = 0 for all affected releases
    const releaseIds = [...new Set(items.rows.map((r: any) => r.release_id))]
    if (releaseIds.length > 0) {
      await trx("Release")
        .whereIn("id", releaseIds)
        .update({ legacy_price: 0, updatedAt: new Date() })
    }

    // Mark all inventory items
    await trx("erp_inventory_item")
      .where("source", "frank_collection")
      .whereNull("last_stocktake_at")
      .update({
        price_locked: true,
        price_locked_at: new Date(),
        last_stocktake_at: new Date(),
        last_stocktake_by: adminEmail,
        updated_at: new Date(),
      })

    // Create movements for each item
    const movements = items.rows.map((item: any) => ({
      id: generateEntityId(),
      inventory_item_id: item.id,
      type: "adjustment",
      quantity_change: 0,
      reason: "stocktake_missing_bulk",
      performed_by: adminEmail,
      reference: JSON.stringify({
        old_price: item.legacy_price != null ? Number(item.legacy_price) : null,
        bulk_action: true,
      }),
    }))

    // Insert movements in batches of 500
    for (let i = 0; i < movements.length; i += 500) {
      await trx("erp_inventory_movement").insert(movements.slice(i, i + 500))
    }
  })

  res.json({
    message: `Marked ${total} items as missing`,
    affected: total,
  })
}
