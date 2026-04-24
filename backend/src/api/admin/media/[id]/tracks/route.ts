import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { logTrackChange } from "../../../../../lib/release-audit"
import { pushReleaseNow } from "../../../../../lib/meilisearch-push"

// GET /admin/media/:id/tracks — list all tracks for a release
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id } = req.params

  const tracks = await pg("Track")
    .where("releaseId", id)
    .orderByRaw(`
      CASE WHEN position ~ '^[A-Z]' THEN 1 ELSE 2 END,
      position
    `)
    .select("id", "position", "title", "duration", "releaseId")

  res.json({ tracks })
}

// POST /admin/media/:id/tracks — add a track (all sources allowed per Q8)
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id } = req.params
  const body = (req.body || {}) as Record<string, any>

  const { position, title, duration } = body

  if (!title || typeof title !== "string" || !title.trim()) {
    res.status(400).json({ message: "title is required" })
    return
  }

  const release = await pg("Release").where("id", id).select("id").first()
  if (!release) {
    res.status(404).json({ message: "Release not found" })
    return
  }

  const trackPayload = {
    id: generateEntityId(),
    position: position ? String(position).trim() : null,
    title: String(title).trim(),
    duration: duration ? String(duration).trim() : null,
    releaseId: id,
  }

  await pg.transaction(async (trx) => {
    await trx("Track").insert(trackPayload)

    const actor = {
      id: (req as any).auth_context?.actor_id || "admin",
      email: (req as any).auth_context?.actor_email || null,
    }
    await logTrackChange(trx, {
      releaseId: id,
      action: "track_add",
      trackPayload,
      actor,
    })
  })

  pushReleaseNow(pg, id).catch((err) =>
    console.warn("meili push-now failed [track add]:", err?.message)
  )

  res.json({ track: trackPayload })
}
