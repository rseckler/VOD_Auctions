import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/media/filter-options
//
// Returns data for the Media Catalog filter dropdowns:
// - import_collections: list of unique Discogs import collection names + counts
// - warehouse_locations: list of active warehouse locations
// - inventory_statuses: distinct values of erp_inventory_item.status currently in use
//
// Defensive: if any table doesn't exist yet (fresh install), the corresponding
// array is empty but the endpoint still returns 200.
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  // ── import_collections ──
  let import_collections: unknown[] = []
  try {
    const result = await pgConnection.raw(`
      SELECT
        collection_name,
        COUNT(DISTINCT run_id)::int as run_count,
        COUNT(DISTINCT release_id)::int as release_count,
        MAX(created_at) as last_import_at
      FROM import_log
      WHERE import_type = 'discogs_collection'
        AND collection_name IS NOT NULL
        AND collection_name <> ''
      GROUP BY collection_name
      ORDER BY MAX(created_at) DESC
    `)
    import_collections = result.rows || []
  } catch {
    import_collections = []
  }

  // ── warehouse_locations ──
  let warehouse_locations: unknown[] = []
  try {
    const result = await pgConnection("warehouse_location")
      .select("id", "code", "name", "is_active")
      .where("is_active", true)
      .orderBy("code", "asc")
    warehouse_locations = result
  } catch {
    warehouse_locations = []
  }

  // ── inventory_statuses (distinct values in use) ──
  let inventory_statuses: string[] = []
  try {
    const result = await pgConnection.raw(`
      SELECT DISTINCT status
      FROM erp_inventory_item
      WHERE status IS NOT NULL
      ORDER BY status ASC
    `)
    inventory_statuses = (result.rows || []).map((r: { status: string }) => r.status)
  } catch {
    inventory_statuses = []
  }

  res.json({
    import_collections,
    warehouse_locations,
    inventory_statuses,
  })
}
