import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { syncReleaseCoverFromImages } from "../../../../../../../lib/release-images"
import { revalidateReleaseCatalogPage } from "../../../../../../../lib/storefront-revalidate"
import { pushReleaseNow } from "../../../../../../../lib/meilisearch-push"

// POST /admin/media/:id/images/:imageId/set-cover
// Setzt das gewählte Image auf rang=0, andere bekommen rang+10. Audit-Log
// als image_reorder mit old/new Order. Re-syncs Release.coverImage.
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id, imageId } = req.params

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

  if (!existing.find((r) => r.id === imageId)) {
    res.status(404).json({ message: "Image not found on this release" })
    return
  }

  const oldOrder = existing.map((r) => r.id)
  if (oldOrder[0] === imageId) {
    res.json({ ok: true, unchanged: true, order: oldOrder })
    return
  }

  const newOrder = [imageId, ...oldOrder.filter((rid) => rid !== imageId)]

  const actor = (req as any).auth_context?.actor_id
    ? { id: (req as any).auth_context.actor_id, email: (req as any).auth_context.user?.email ?? null }
    : { id: "admin", email: null }

  await pg.transaction(async (trx) => {
    for (let i = 0; i < newOrder.length; i++) {
      await trx("Image")
        .where({ id: newOrder[i], releaseId: id })
        .update({ rang: i * 10 })
    }

    await trx("release_audit_log").insert({
      id: generateEntityId(),
      release_id: id,
      field_name: "cover",
      old_value: JSON.stringify(oldOrder),
      new_value: JSON.stringify(newOrder),
      action: "image_reorder",
      actor_id: actor.id,
      actor_email: actor.email,
      created_at: new Date(),
    })

    await syncReleaseCoverFromImages(trx, id)
  })

  pushReleaseNow(pg, id).catch(() => {})
  revalidateReleaseCatalogPage(id)

  res.json({ ok: true, order: newOrder })
}
