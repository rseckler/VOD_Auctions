import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireFeatureFlag, createMovement } from "../../../../../lib/inventory"

const PERCENTAGE = 15
const CONFIRMATION_STRING = "RAISE PRICES 15 PERCENT"

/**
 * GET /admin/erp/inventory/bulk-price-adjust
 * Preview: shows how many items would be affected and sample prices.
 *
 * NOTE (Exemplar-Modell): This endpoint adjusts Release.legacy_price, which is
 * the shared base price for all exemplars of a release. Individual exemplar
 * prices (exemplar_price on erp_inventory_item) are NOT affected by bulk adjust.
 * This is intentional: bulk +15% was a one-time event before the Inventur started.
 * Future per-exemplar pricing happens during stocktake verify.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "ERP_INVENTORY")

  // Check if already executed
  const existing = await pg("bulk_price_adjustment_log")
    .where("status", "success")
    .first()

  // Count eligible
  const countResult = await pg.raw(`
    SELECT COUNT(*) AS cnt
    FROM erp_inventory_item ii
    JOIN "Release" r ON r.id = ii.release_id
    WHERE ii.source = 'frank_collection'
      AND ii.price_locked = false
      AND ii.status = 'in_stock'
      AND r.legacy_price > 0
  `)
  const eligibleCount = Number(countResult.rows[0].cnt)

  // Sample 20 items with preview prices
  const sample = await pg.raw(`
    SELECT
      r.id AS release_id,
      a.name AS artist,
      r.title,
      r.legacy_price AS old_price,
      ROUND(r.legacy_price * ${1 + PERCENTAGE / 100}, 0) AS new_price
    FROM erp_inventory_item ii
    JOIN "Release" r ON r.id = ii.release_id
    LEFT JOIN "Artist" a ON a.id = r."artistId"
    WHERE ii.source = 'frank_collection'
      AND ii.price_locked = false
      AND ii.status = 'in_stock'
      AND r.legacy_price > 0
    ORDER BY r.legacy_price DESC
    LIMIT 20
  `)

  res.json({
    eligible_count: eligibleCount,
    percentage: PERCENTAGE,
    already_executed: existing
      ? {
          executed_at: existing.executed_at,
          executed_by: existing.executed_by,
          affected_rows: existing.affected_rows,
        }
      : null,
    sample: sample.rows.map((r: any) => ({
      release_id: r.release_id,
      artist: r.artist,
      title: r.title,
      old_price: Number(r.old_price),
      new_price: Number(r.new_price),
    })),
  })
}

/**
 * POST /admin/erp/inventory/bulk-price-adjust
 * Execute the one-time +15% price increase on all eligible Cohort A items.
 *
 * Body: { percentage: 15, confirmation: "RAISE PRICES 15 PERCENT" }
 *
 * Idempotent: returns 409 if a successful execution already exists.
 * All changes wrapped in a single transaction.
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await requireFeatureFlag(pg, "ERP_INVENTORY")

  const adminEmail = (req as any).auth_context?.actor_id || "admin"
  const body = req.body as {
    percentage?: number
    confirmation?: string
  }

  // Validate body
  if (body?.percentage !== PERCENTAGE) {
    res
      .status(400)
      .json({ message: `percentage must be ${PERCENTAGE}` })
    return
  }
  if (body?.confirmation !== CONFIRMATION_STRING) {
    res.status(400).json({
      message: `confirmation must be exactly: "${CONFIRMATION_STRING}"`,
    })
    return
  }

  // Idempotency check
  const existing = await pg("bulk_price_adjustment_log")
    .where("status", "success")
    .first()
  if (existing) {
    res.status(409).json({
      message: "Bulk price adjustment already executed",
      executed_at: existing.executed_at,
      executed_by: existing.executed_by,
      affected_rows: existing.affected_rows,
    })
    return
  }

  const logId = generateEntityId()

  try {
    await pg.transaction(async (trx) => {
      // 1. Create log entry (running)
      await trx("bulk_price_adjustment_log").insert({
        id: logId,
        executed_by: adminEmail,
        percentage: PERCENTAGE,
        status: "running",
      })

      // 2. Get eligible release IDs + their inventory_item IDs
      const eligible = await trx.raw(`
        SELECT ii.id AS inventory_item_id, r.id AS release_id, r.legacy_price AS old_price
        FROM erp_inventory_item ii
        JOIN "Release" r ON r.id = ii.release_id
        WHERE ii.source = 'frank_collection'
          AND ii.price_locked = false
          AND ii.status = 'in_stock'
          AND r.legacy_price > 0
      `)
      const items = eligible.rows as Array<{
        inventory_item_id: string
        release_id: string
        old_price: number
      }>

      if (items.length === 0) {
        await trx("bulk_price_adjustment_log")
          .where("id", logId)
          .update({ affected_rows: 0, status: "success" })
        return
      }

      // 3. Update Release prices: ROUND(price * 1.15, 0) = whole euros
      const releaseIds = items.map((i) => i.release_id)
      await trx.raw(
        `UPDATE "Release"
         SET legacy_price = ROUND(legacy_price * ${1 + PERCENTAGE / 100}, 0),
             "updatedAt" = NOW()
         WHERE id = ANY(?)`,
        [releaseIds]
      )

      // 4. Lock all affected inventory items + record stocktake
      await trx("erp_inventory_item")
        .whereIn(
          "id",
          items.map((i) => i.inventory_item_id)
        )
        .update({
          price_locked: true,
          price_locked_at: new Date(),
          updated_at: new Date(),
        })

      // 5. Create inventory_movement for each item (audit trail)
      for (const item of items) {
        await createMovement(trx, {
          inventoryItemId: item.inventory_item_id,
          type: "adjustment",
          quantityChange: 0,
          reason: `bulk_${PERCENTAGE}pct_2026`,
          performedBy: adminEmail,
          reference: JSON.stringify({
            old_price: Number(item.old_price),
            new_price: Math.round(Number(item.old_price) * (1 + PERCENTAGE / 100)),
            percentage: PERCENTAGE,
          }),
        })
      }

      // 6. Mark log as success
      await trx("bulk_price_adjustment_log")
        .where("id", logId)
        .update({
          affected_rows: items.length,
          status: "success",
        })
    })

    // Read back the result
    const result = await pg("bulk_price_adjustment_log")
      .where("id", logId)
      .first()

    res.json({
      message: `Successfully adjusted ${result.affected_rows} items by +${PERCENTAGE}%`,
      affected_rows: result.affected_rows,
      executed_at: result.executed_at,
    })
  } catch (err: any) {
    // Mark log as failed if it exists
    try {
      await pg("bulk_price_adjustment_log")
        .where("id", logId)
        .update({ status: "failed", notes: err.message })
    } catch {
      // Ignore cleanup error
    }
    res.status(500).json({ message: err.message })
  }
}
