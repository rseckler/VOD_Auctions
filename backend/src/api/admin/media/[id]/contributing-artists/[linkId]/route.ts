import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { revalidateReleaseCatalogPage } from "../../../../../../lib/storefront-revalidate"
import { pushReleaseNow } from "../../../../../../lib/meilisearch-push"

// PATCH /admin/media/:id/contributing-artists/:linkId
// Body: { role: string }
// Updates die Rolle eines ReleaseArtist-Eintrags.
export async function PATCH(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id, linkId } = req.params
  const body = req.body as { role?: string }

  const newRole = body?.role?.trim() || "performer"

  const link = await pg("ReleaseArtist")
    .where({ id: linkId, releaseId: id })
    .leftJoin("Artist", "ReleaseArtist.artistId", "Artist.id")
    .select(
      "ReleaseArtist.id",
      "ReleaseArtist.artistId",
      "ReleaseArtist.role",
      "Artist.name as artist_name"
    )
    .first()
  if (!link) {
    res.status(404).json({ message: "Contributing artist link not found" })
    return
  }

  if (link.role === newRole) {
    res.json({ ok: true, unchanged: true })
    return
  }

  const actor = (req as any).auth_context?.actor_id
    ? { id: (req as any).auth_context.actor_id, email: (req as any).auth_context.user?.email ?? null }
    : { id: "admin", email: null }

  await pg.transaction(async (trx) => {
    await trx("ReleaseArtist").where({ id: linkId, releaseId: id }).update({ role: newRole })

    await trx("release_audit_log").insert({
      id: generateEntityId(),
      release_id: id,
      field_name: "contributing_artist",
      old_value: JSON.stringify({ link_id: linkId, artist_id: link.artistId, artist_name: link.artist_name, role: link.role }),
      new_value: JSON.stringify({ link_id: linkId, artist_id: link.artistId, artist_name: link.artist_name, role: newRole }),
      action: "contributing_artist_update",
      actor_id: actor.id,
      actor_email: actor.email,
      created_at: new Date(),
    })

    await trx("Release")
      .where("id", id)
      .update({ search_indexed_at: null, updatedAt: new Date() })
  })

  pushReleaseNow(pg, id).catch(() => {})
  revalidateReleaseCatalogPage(id)

  res.json({ ok: true, role: newRole })
}

// DELETE /admin/media/:id/contributing-artists/:linkId
export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id, linkId } = req.params

  const link = await pg("ReleaseArtist")
    .where({ id: linkId, releaseId: id })
    .leftJoin("Artist", "ReleaseArtist.artistId", "Artist.id")
    .select(
      "ReleaseArtist.id",
      "ReleaseArtist.artistId",
      "ReleaseArtist.role",
      "Artist.name as artist_name"
    )
    .first()
  if (!link) {
    res.status(404).json({ message: "Contributing artist link not found" })
    return
  }

  const actor = (req as any).auth_context?.actor_id
    ? { id: (req as any).auth_context.actor_id, email: (req as any).auth_context.user?.email ?? null }
    : { id: "admin", email: null }

  await pg.transaction(async (trx) => {
    await trx("ReleaseArtist").where({ id: linkId, releaseId: id }).del()

    await trx("release_audit_log").insert({
      id: generateEntityId(),
      release_id: id,
      field_name: "contributing_artist",
      old_value: JSON.stringify({ link_id: linkId, artist_id: link.artistId, artist_name: link.artist_name, role: link.role }),
      new_value: null,
      action: "contributing_artist_delete",
      actor_id: actor.id,
      actor_email: actor.email,
      created_at: new Date(),
    })

    await trx("Release")
      .where("id", id)
      .update({ search_indexed_at: null, updatedAt: new Date() })
  })

  pushReleaseNow(pg, id).catch(() => {})
  revalidateReleaseCatalogPage(id)

  res.json({ ok: true, deleted: linkId })
}
