import { Knex } from "knex"
import { generateEntityId } from "@medusajs/framework/utils"
import { getFeatureFlag, FeatureFlagKey } from "./feature-flags"

/**
 * ERP Inventory helpers.
 *
 * All functions operate on erp_inventory_item / erp_inventory_movement tables.
 * These tables use the `erp_` prefix to avoid collision with Medusa's native
 * inventory_item table (from @medusajs/inventory module).
 */

// ─── Feature Flag Gate ─────────────────────────────────────────────────────

/**
 * Throws 403 if the given feature flag is not enabled.
 * Use at the top of every /admin/erp/* route handler.
 */
export async function requireFeatureFlag(
  pg: Knex,
  flag: FeatureFlagKey
): Promise<void> {
  const enabled = await getFeatureFlag(pg, flag)
  if (!enabled) {
    const err: any = new Error(`Feature ${flag} is not enabled`)
    err.statusCode = 403
    throw err
  }
}

// ─── Inventory Movement ────────────────────────────────────────────────────

export interface MovementInput {
  inventoryItemId: string
  type:
    | "inbound"
    | "reservation"
    | "reservation_release"
    | "sale"
    | "shipment"
    | "delivery"
    | "return_inbound"
    | "return_processed"
    | "adjustment"
    | "write_off"
  quantityChange: number
  reason: string
  performedBy: string
  reference?: string
  transactionId?: string
  blockItemId?: string
}

/**
 * Insert an erp_inventory_movement row. Every status change on
 * erp_inventory_item MUST be accompanied by a movement (ERP-Konzept §10
 * invariant). Call this within the same transaction as the item update.
 */
export async function createMovement(
  trx: Knex,
  input: MovementInput
): Promise<string> {
  const id = generateEntityId()
  await trx("erp_inventory_movement").insert({
    id,
    inventory_item_id: input.inventoryItemId,
    type: input.type,
    quantity_change: input.quantityChange,
    reason: input.reason,
    performed_by: input.performedBy,
    reference: input.reference || null,
    transaction_id: input.transactionId || null,
    block_item_id: input.blockItemId || null,
  })
  return id
}

// ─── Barcode Assignment ───────────────────────────────────────────────────

/**
 * Assign a barcode to an inventory item if it doesn't have one yet.
 * Uses the erp_barcode_seq sequence for sequential numbering.
 * Format: VOD-000001 through VOD-041500+
 *
 * Returns the barcode string (existing or newly assigned).
 */
export async function assignBarcode(
  trx: Knex,
  inventoryItemId: string
): Promise<string> {
  // Check if already has barcode
  const item = await trx("erp_inventory_item")
    .where("id", inventoryItemId)
    .select("barcode")
    .first()

  if (item?.barcode) return item.barcode

  // Get next sequence value
  const seqResult = await trx.raw("SELECT nextval('erp_barcode_seq') AS seq")
  const seq = seqResult.rows[0].seq
  const barcode = `VOD-${String(seq).padStart(6, "0")}`

  await trx("erp_inventory_item")
    .where("id", inventoryItemId)
    .update({ barcode, updated_at: new Date() })

  return barcode
}

// ─── Price Lock ────────────────────────────────────────────────────────────

/**
 * Lock the price of an inventory item so the hourly legacy sync won't
 * overwrite it. Used by: bulk +15%, stocktake verify, stocktake missing.
 */
export async function lockPrice(
  trx: Knex,
  inventoryItemId: string,
  adminEmail: string
): Promise<void> {
  await trx("erp_inventory_item")
    .where("id", inventoryItemId)
    .update({
      price_locked: true,
      price_locked_at: new Date(),
      updated_at: new Date(),
    })
}

/**
 * Unlock the price so the legacy sync can overwrite it again.
 * Used by: stocktake reset/undo.
 */
export async function unlockPrice(
  trx: Knex,
  inventoryItemId: string
): Promise<void> {
  await trx("erp_inventory_item")
    .where("id", inventoryItemId)
    .update({
      price_locked: false,
      price_locked_at: null,
      updated_at: new Date(),
    })
}
