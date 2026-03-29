import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { BulkActionSchema, validateBody } from "../../../../lib/validation"

// POST /admin/transactions/bulk-action
// Bulk-apply packing or label_printed status to multiple transactions
//
// Body: { ids: string[], action: "packing" | "label_printed" }
// Response: { updated: number, ids: string[] }
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const validation = validateBody(BulkActionSchema, req.body)
  if ("error" in validation) {
    res.status(400).json({
      message: validation.error,
      issues: validation.details.errors.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      })),
    })
    return
  }

  const { ids, action } = validation.data
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    const updatedIds: string[] = []

    if (action === "packing") {
      // Update fulfillment_status to 'packing' for all given IDs
      await pgConnection("transaction")
        .whereIn("id", ids)
        .update({ fulfillment_status: "packing", updated_at: new Date() })

      const existing = await pgConnection("transaction")
        .whereIn("id", ids)
        .select("id")
      for (const row of existing) {
        updatedIds.push(row.id)
      }
    } else if (action === "label_printed") {
      // Update label_printed_at for all given IDs
      await pgConnection("transaction")
        .whereIn("id", ids)
        .update({ label_printed_at: new Date(), updated_at: new Date() })

      const existing = await pgConnection("transaction")
        .whereIn("id", ids)
        .select("id")
      for (const row of existing) {
        updatedIds.push(row.id)
      }
    }

    res.json({ updated: updatedIds.length, ids: updatedIds })
  } catch (error: any) {
    console.error("[admin/transactions/bulk-action] Error:", error)
    res.status(500).json({ message: "Bulk action failed" })
  }
}
