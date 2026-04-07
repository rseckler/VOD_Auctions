import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

/**
 * PATCH /admin/erp/locations/:id
 * Update a warehouse location. Any subset of fields may be provided.
 * Setting is_default: true clears the existing default first (in one transaction).
 */
export async function PATCH(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id } = req.params
  const body = req.body as Record<string, unknown> | undefined

  if (!body || Object.keys(body).length === 0) {
    res.status(400).json({ message: "No fields to update" })
    return
  }

  const allowed = ["code", "name", "description", "address", "contact_name",
                   "contact_email", "is_default", "sort_order", "notes"]
  const updates: Record<string, unknown> = { updated_at: new Date() }
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }
  if (updates["code"] && typeof updates["code"] === "string") {
    updates["code"] = updates["code"].trim().toUpperCase()
  }

  try {
    await pg.transaction(async (trx) => {
      const existing = await trx("warehouse_location").where({ id }).first()
      if (!existing) {
        res.status(404).json({ message: "Warehouse location not found" })
        return
      }

      if (updates["is_default"] === true) {
        await trx("warehouse_location").update({ is_default: false })
      }

      const [location] = await trx("warehouse_location")
        .where({ id })
        .update(updates)
        .returning("*")

      res.json({ location })
    })
  } catch (err: any) {
    const isDuplicate = /unique.*code|duplicate key.*code/i.test(err?.message || "")
    if (isDuplicate) {
      res.status(409).json({ message: `A location with that code already exists` })
      return
    }
    res.status(500).json({ message: err?.message || "Failed to update warehouse location" })
  }
}

/**
 * DELETE /admin/erp/locations/:id
 * Soft-delete (is_active = false). Hard delete is never allowed — future
 * inventory_item rows may reference this location.
 *
 * Blocked if the location is the current default — set another location as
 * default first.
 */
export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id } = req.params

  try {
    const existing = await pg("warehouse_location").where({ id }).first()
    if (!existing) {
      res.status(404).json({ message: "Warehouse location not found" })
      return
    }
    if (existing.is_default) {
      res.status(400).json({
        message: "Cannot deactivate the default location. Set another location as default first.",
      })
      return
    }

    const [location] = await pg("warehouse_location")
      .where({ id })
      .update({ is_active: false, updated_at: new Date() })
      .returning("*")

    res.json({ location })
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to deactivate warehouse location" })
  }
}
