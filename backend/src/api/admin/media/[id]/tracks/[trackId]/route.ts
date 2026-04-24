import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { logTrackChange } from "../../../../../../lib/release-audit"
import { pushReleaseNow } from "../../../../../../lib/meilisearch-push"

// PATCH /admin/media/:id/tracks/:trackId — update a track
export async function PATCH(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id, trackId } = req.params
  const body = (req.body || {}) as Record<string, any>

  const track = await pg("Track")
    .where("id", trackId)
    .andWhere("releaseId", id)
    .first()

  if (!track) {
    res.status(404).json({ message: "Track not found" })
    return
  }

  const updates: Record<string, string | null> = {}
  if (body.position !== undefined) updates.position = body.position ? String(body.position).trim() : null
  if (body.title !== undefined) {
    if (!body.title || !String(body.title).trim()) {
      res.status(400).json({ message: "title cannot be empty" })
      return
    }
    updates.title = String(body.title).trim()
  }
  if (body.duration !== undefined) updates.duration = body.duration ? String(body.duration).trim() : null

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ message: "No valid fields to update" })
    return
  }

  const updatedTrack = { ...track, ...updates }

  await pg.transaction(async (trx) => {
    await trx("Track").where("id", trackId).update(updates)

    const actor = {
      id: (req as any).auth_context?.actor_id || "admin",
      email: (req as any).auth_context?.actor_email || null,
    }
    await logTrackChange(trx, {
      releaseId: id,
      action: "track_edit",
      trackPayload: { before: track, after: updatedTrack },
      actor,
    })
  })

  pushReleaseNow(pg, id).catch((err) =>
    console.warn("meili push-now failed [track edit]:", err?.message)
  )

  res.json({ track: updatedTrack })
}

// DELETE /admin/media/:id/tracks/:trackId — delete a track
export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id, trackId } = req.params

  const track = await pg("Track")
    .where("id", trackId)
    .andWhere("releaseId", id)
    .first()

  if (!track) {
    res.status(404).json({ message: "Track not found" })
    return
  }

  await pg.transaction(async (trx) => {
    await trx("Track").where("id", trackId).delete()

    const actor = {
      id: (req as any).auth_context?.actor_id || "admin",
      email: (req as any).auth_context?.actor_email || null,
    }
    await logTrackChange(trx, {
      releaseId: id,
      action: "track_delete",
      trackPayload: track,
      actor,
    })
  })

  pushReleaseNow(pg, id).catch((err) =>
    console.warn("meili push-now failed [track delete]:", err?.message)
  )

  res.json({ success: true })
}
