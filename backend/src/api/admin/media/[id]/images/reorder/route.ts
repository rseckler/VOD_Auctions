import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { syncReleaseCoverFromImages } from "../../../../../../lib/release-images"
import { revalidateReleaseCatalogPage } from "../../../../../../lib/storefront-revalidate"
import { pushReleaseNow } from "../../../../../../lib/meilisearch-push"

// POST /admin/media/:id/images/reorder
// Body: { order: string[] }   — image_ids in der gewünschten Reihenfolge,
//                                erstes = Cover (rang 0)
//
// Ein einziger atomarer Bulk-Update für alle übergebenen Images. Images die
// nicht im Order-Array sind, werden ans Ende geschoben (rang ab order.length*10).
// Falls die Reihenfolge unverändert ist, kein Audit-Log + kein Storefront-Revalidate.
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id } = req.params
  const body = req.body as { order?: string[] }

  if (!Array.isArray(body?.order) || body.order.length === 0) {
    res.status(400).json({ message: "order: string[] is required (image_ids in desired order)" })
    return
  }

  const release = await pg("Release").where("id", id).select("id").first()
  if (!release) {
    res.status(404).json({ message: "Release not found" })
    return
  }

  const existing = await pg("Image")
    .where("releaseId", id)
    .select("id", "rang")
    .orderBy("rang", "asc")
    .orderBy("id", "asc")

  const existingIds = new Set(existing.map((r) => r.id))
  for (const oid of body.order) {
    if (!existingIds.has(oid)) {
      res.status(400).json({ message: `Image ${oid} does not belong to this release` })
      return
    }
  }

  // Build the new full order: requested ids first, then the unmentioned ones
  // appended in their existing order — this lets the UI submit only the
  // visually-changed subset if it wants to.
  const orderedSet = new Set(body.order)
  const fullOrder: string[] = [
    ...body.order,
    ...existing.map((r) => r.id).filter((rid) => !orderedSet.has(rid)),
  ]

  const oldOrder = existing.map((r) => r.id)
  const orderUnchanged =
    oldOrder.length === fullOrder.length &&
    oldOrder.every((rid, i) => rid === fullOrder[i])

  if (orderUnchanged) {
    res.json({ ok: true, unchanged: true, order: fullOrder })
    return
  }

  const actor = (req as any).auth_context?.actor_id
    ? { id: (req as any).auth_context.actor_id, email: (req as any).auth_context.user?.email ?? null }
    : { id: "admin", email: null }

  await pg.transaction(async (trx) => {
    // rang in 10er-Schritten — Insert-zwischen-zwei für künftige Reorders billig
    for (let i = 0; i < fullOrder.length; i++) {
      await trx("Image")
        .where({ id: fullOrder[i], releaseId: id })
        .update({ rang: i * 10 })
    }

    await trx("release_audit_log").insert({
      id: generateEntityId(),
      release_id: id,
      field_name: "image_order",
      old_value: JSON.stringify(oldOrder),
      new_value: JSON.stringify(fullOrder),
      action: "image_reorder",
      actor_id: actor.id,
      actor_email: actor.email,
      created_at: new Date(),
    })

    await syncReleaseCoverFromImages(trx, id)
  })

  pushReleaseNow(pg, id).catch(() => {})
  revalidateReleaseCatalogPage(id)

  res.json({ ok: true, order: fullOrder })
}
