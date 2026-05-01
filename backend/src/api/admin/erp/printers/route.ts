import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"

interface PrinterRow {
  id: string
  warehouse_location_id: string
  location_code: string
  location_name: string
  manufacturer: string
  model: string
  ip_address: string
  port: number
  label_type: string
  brother_ql_model: string | null
  is_active: boolean
  is_default_for_location: boolean
  use_for: string[]
  mac_address: string | null
  hostname: string | null
  display_name: string | null
  notes: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

/**
 * GET /admin/erp/printers
 * Lists all printers with warehouse_location join (code + name).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  try {
    const printers = await pg("printer as p")
      .join("warehouse_location as wl", "p.warehouse_location_id", "wl.id")
      .select(
        "p.*",
        "wl.code as location_code",
        "wl.name as location_name"
      )
      .orderBy([{ column: "wl.sort_order" }, { column: "p.sort_order" }, { column: "p.display_name" }])
    res.json({ printers, count: printers.length })
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load printers" })
  }
}

/**
 * POST /admin/erp/printers
 * Create a new printer.
 * Body: { warehouse_location_id, manufacturer?, model, ip_address, port?,
 *         label_type?, brother_ql_model?, display_name?, notes?,
 *         is_default_for_location?, use_for?, hostname?, mac_address?, sort_order? }
 */
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const body = req.body as Partial<PrinterRow> | undefined

  if (!body?.warehouse_location_id || !body?.model || !body?.ip_address) {
    res.status(400).json({ message: "warehouse_location_id, model, and ip_address are required" })
    return
  }

  const port = Number(body.port) || 9100
  if (port <= 0 || port > 65535) {
    res.status(400).json({ message: "port must be between 1 and 65535" })
    return
  }

  try {
    const [printer] = await pg("printer")
      .insert({
        id: generateEntityId(),
        warehouse_location_id: body.warehouse_location_id,
        manufacturer: body.manufacturer?.trim() || "Brother",
        model: body.model.trim(),
        ip_address: body.ip_address.trim(),
        port,
        label_type: body.label_type?.trim() || "29",
        brother_ql_model: body.brother_ql_model?.trim() || null,
        is_active: true,
        is_default_for_location: body.is_default_for_location ?? false,
        use_for: JSON.stringify(body.use_for ?? ["labels"]),
        mac_address: body.mac_address?.trim() || null,
        hostname: body.hostname?.trim() || null,
        display_name: body.display_name?.trim() || null,
        notes: body.notes?.trim() || null,
        sort_order: Number(body.sort_order) || 0,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*")

    // Attach location info for immediate UI use
    const loc = await pg("warehouse_location").where("id", printer.warehouse_location_id).first()
    res.json({ printer: { ...printer, location_code: loc?.code, location_name: loc?.name } })
  } catch (err: any) {
    const isDuplicate = /unique.*printer_ip|duplicate key.*printer/i.test(err?.message || "")
    if (isDuplicate) {
      res.status(409).json({ message: `A printer with IP '${body.ip_address}' already exists at this location` })
      return
    }
    res.status(500).json({ message: err?.message || "Failed to create printer" })
  }
}
