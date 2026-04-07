import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"

// ─── First route under the reserved /admin/erp/* namespace ───────────────────
// See DEPLOYMENT_METHODOLOGY.md §5 for namespace reservation notes.

interface WarehouseLocation {
  id: string
  code: string
  name: string
  description: string | null
  address: string | null
  contact_name: string | null
  contact_email: string | null
  is_active: boolean
  is_default: boolean
  sort_order: number
  notes: string | null
  created_at: string
  updated_at: string
}

/**
 * GET /admin/erp/locations
 * Returns all warehouse locations ordered by sort_order, name.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  try {
    const locations = await pg("warehouse_location")
      .orderBy([{ column: "sort_order" }, { column: "name" }])
    res.json({ locations, count: locations.length })
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load warehouse locations" })
  }
}

/**
 * POST /admin/erp/locations
 * Create a new warehouse location.
 * Body: { code, name, description?, address?, contact_name?, contact_email?,
 *         is_default?, sort_order?, notes? }
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const body = req.body as Partial<WarehouseLocation> | undefined

  if (!body?.code || !body?.name) {
    res.status(400).json({ message: "code and name are required" })
    return
  }

  const makeDefault = body.is_default === true

  try {
    await pg.transaction(async (trx) => {
      if (makeDefault) {
        await trx("warehouse_location").update({ is_default: false })
      }
      const [location] = await trx("warehouse_location")
        .insert({
          id: generateEntityId(),
          code: body.code!.trim().toUpperCase(),
          name: body.name!.trim(),
          description: body.description ?? null,
          address: body.address ?? null,
          contact_name: body.contact_name ?? null,
          contact_email: body.contact_email ?? null,
          is_active: true,
          is_default: makeDefault,
          sort_order: body.sort_order ?? 0,
          notes: body.notes ?? null,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("*")
      res.json({ location })
    })
  } catch (err: any) {
    const isDuplicate = /unique.*code|duplicate key.*code/i.test(err?.message || "")
    if (isDuplicate) {
      res.status(409).json({ message: `A location with code '${body.code}' already exists` })
      return
    }
    res.status(500).json({ message: err?.message || "Failed to create warehouse location" })
  }
}
