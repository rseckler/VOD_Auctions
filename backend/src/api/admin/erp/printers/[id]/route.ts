import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

/**
 * GET /admin/erp/printers/:id
 */
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id } = req.params
  try {
    const printer = await pg("printer as p")
      .join("warehouse_location as wl", "p.warehouse_location_id", "wl.id")
      .select("p.*", "wl.code as location_code", "wl.name as location_name")
      .where("p.id", id)
      .first()
    if (!printer) {
      res.status(404).json({ message: "Printer not found" })
      return
    }
    res.json({ printer })
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load printer" })
  }
}

/**
 * PATCH /admin/erp/printers/:id
 * Partial update. Allowed fields: warehouse_location_id, manufacturer, model,
 * ip_address, port, label_type, brother_ql_model, is_active,
 * is_default_for_location, use_for, mac_address, hostname,
 * display_name, notes, sort_order.
 */
export async function PATCH(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id } = req.params
  const body = req.body as Record<string, unknown> | undefined

  if (!body || Object.keys(body).length === 0) {
    res.status(400).json({ message: "No fields to update" })
    return
  }

  const ALLOWED = new Set([
    "warehouse_location_id", "manufacturer", "model", "ip_address", "port",
    "label_type", "brother_ql_model", "is_active", "is_default_for_location",
    "use_for", "mac_address", "hostname", "display_name", "notes", "sort_order",
  ])

  const updates: Record<string, unknown> = { updated_at: new Date() }
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED.has(k)) continue
    if (k === "use_for") {
      updates[k] = JSON.stringify(v)
    } else if (k === "port") {
      const port = Number(v)
      if (port <= 0 || port > 65535) {
        res.status(400).json({ message: "port must be between 1 and 65535" })
        return
      }
      updates[k] = port
    } else {
      updates[k] = v
    }
  }

  try {
    const count = await pg("printer").where("id", id).update(updates)
    if (!count) {
      res.status(404).json({ message: "Printer not found" })
      return
    }
    const printer = await pg("printer as p")
      .join("warehouse_location as wl", "p.warehouse_location_id", "wl.id")
      .select("p.*", "wl.code as location_code", "wl.name as location_name")
      .where("p.id", id)
      .first()
    res.json({ printer })
  } catch (err: any) {
    const isDuplicate = /unique.*printer_ip|duplicate key.*printer/i.test(err?.message || "")
    if (isDuplicate) {
      res.status(409).json({ message: "A printer with this IP already exists at this location" })
      return
    }
    res.status(500).json({ message: err?.message || "Failed to update printer" })
  }
}

/**
 * DELETE /admin/erp/printers/:id
 * Soft-delete (is_active=false). Audit-Trail in Movement-Logs bleibt referentiell intakt.
 */
export async function DELETE(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id } = req.params
  try {
    const count = await pg("printer").where("id", id).update({ is_active: false, updated_at: new Date() })
    if (!count) {
      res.status(404).json({ message: "Printer not found" })
      return
    }
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to deactivate printer" })
  }
}
