import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { revalidateReleaseCatalogPage } from "../../../../../lib/storefront-revalidate"
import { pushReleaseNow } from "../../../../../lib/meilisearch-push"

// GET /admin/media/:id/contributing-artists
// Liste aller ReleaseArtist-Rows für dieses Release, mit Artist-Daten gejoint.
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id } = req.params

  const rows = await pg("ReleaseArtist")
    .where("ReleaseArtist.releaseId", id)
    .leftJoin("Artist", "ReleaseArtist.artistId", "Artist.id")
    .select(
      "ReleaseArtist.id as link_id",
      "ReleaseArtist.artistId as artist_id",
      "ReleaseArtist.role as role",
      "ReleaseArtist.createdAt as created_at",
      "Artist.name as artist_name",
      "Artist.slug as artist_slug"
    )
    .orderBy("ReleaseArtist.createdAt", "asc")
    .orderBy("ReleaseArtist.id", "asc")

  res.json({ contributing_artists: rows })
}

// POST /admin/media/:id/contributing-artists
// Body: { artist_id: string, role?: string }
// Add ein Mitwirkender. Soft-check auf Duplikat (gleiches Release+Artist+Role).
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { id } = req.params
  const body = req.body as { artist_id?: string; role?: string }

  if (!body?.artist_id) {
    res.status(400).json({ message: "artist_id is required" })
    return
  }

  const release = await pg("Release").where("id", id).select("id").first()
  if (!release) {
    res.status(404).json({ message: "Release not found" })
    return
  }

  const artist = await pg("Artist")
    .where("id", body.artist_id)
    .select("id", "name", "slug")
    .first()
  if (!artist) {
    res.status(404).json({ message: "Artist not found" })
    return
  }

  const role = body.role?.trim() || "performer"

  const dupe = await pg("ReleaseArtist")
    .where({ releaseId: id, artistId: body.artist_id, role })
    .select("id")
    .first()
  if (dupe) {
    res.status(409).json({ message: "Diese Kombination Artist + Rolle existiert bereits", link_id: dupe.id })
    return
  }

  const linkId = generateEntityId()
  const actor = (req as any).auth_context?.actor_id
    ? { id: (req as any).auth_context.actor_id, email: (req as any).auth_context.user?.email ?? null }
    : { id: "admin", email: null }

  await pg.transaction(async (trx) => {
    await trx("ReleaseArtist").insert({
      id: linkId,
      releaseId: id,
      artistId: body.artist_id,
      role,
      createdAt: new Date(),
    })

    await trx("release_audit_log").insert({
      id: generateEntityId(),
      release_id: id,
      field_name: "contributing_artist",
      old_value: null,
      new_value: JSON.stringify({ link_id: linkId, artist_id: body.artist_id, artist_name: artist.name, role }),
      action: "contributing_artist_add",
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

  res.json({
    ok: true,
    contributing_artist: {
      link_id: linkId,
      artist_id: body.artist_id,
      artist_name: artist.name,
      artist_slug: artist.slug,
      role,
      created_at: new Date().toISOString(),
    },
  })
}
