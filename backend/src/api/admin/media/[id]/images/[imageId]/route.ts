import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { syncReleaseCoverFromImages } from "../../../../../../lib/release-images"
import { revalidateReleaseCatalogPage } from "../../../../../../lib/storefront-revalidate"
import { pushReleaseNow } from "../../../../../../lib/meilisearch-push"

// DELETE /admin/media/:id/images/:imageId
// Entfernt die Image-Row (R2-Datei bleibt für Audit-Sicherheit erhalten — siehe
// CATALOG_EDIT_KONZEPT.md Variante (a)). Re-syncs Release.coverImage falls
// nötig. Audit + Meili + Storefront-Revalidate.
export async function DELETE(
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

  const image = await pg("Image")
    .where({ id: imageId, releaseId: id })
    .select("id", "url", "rang", "alt", "source")
    .first()
  if (!image) {
    res.status(404).json({ message: "Image not found on this release" })
    return
  }

  const actor = (req as any).auth_context?.actor_id
    ? { id: (req as any).auth_context.actor_id, email: (req as any).auth_context.user?.email ?? null }
    : { id: "admin", email: null }

  await pg.transaction(async (trx) => {
    await trx("Image").where({ id: imageId, releaseId: id }).del()

    await trx("release_audit_log").insert({
      id: generateEntityId(),
      release_id: id,
      field_name: "image",
      old_value: JSON.stringify({ id: image.id, url: image.url, rang: image.rang, alt: image.alt, source: image.source }),
      new_value: null,
      action: "image_delete",
      actor_id: actor.id,
      actor_email: actor.email,
      created_at: new Date(),
    })

    await syncReleaseCoverFromImages(trx, id)
  })

  pushReleaseNow(pg, id).catch(() => {})
  revalidateReleaseCatalogPage(id)

  res.json({ ok: true, deleted: imageId })
}

// PATCH /admin/media/:id/images/:imageId
// Body: { alt?: string }
// Updates non-positional metadata (alt-text). Reorder/Cover-Set haben eigene
// Endpoints damit die Audit-Action eindeutig bleibt.
export async function PATCH(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id, imageId } = req.params
  const body = req.body as { alt?: string }

  const image = await pg("Image")
    .where({ id: imageId, releaseId: id })
    .select("id", "alt")
    .first()
  if (!image) {
    res.status(404).json({ message: "Image not found on this release" })
    return
  }

  const newAlt = (body.alt ?? "").trim() || null
  if (newAlt === (image.alt ?? null)) {
    res.json({ ok: true, image })
    return
  }

  await pg("Image").where({ id: imageId, releaseId: id }).update({ alt: newAlt })

  res.json({ ok: true, image: { ...image, alt: newAlt } })
}
