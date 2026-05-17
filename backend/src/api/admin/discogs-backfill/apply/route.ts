import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { revalidateReleaseCatalogPage } from "../../../../lib/storefront-revalidate"

/**
 * POST /admin/discogs-backfill/apply
 *
 * Body: { release_ids: string[] }
 *
 * Schreibt die vorab gefetchten `proposed`-Werte — **rein additiv**: nur Felder,
 * die JETZT noch leer sind, werden gefüllt (Re-Check beim Apply, nicht beim
 * Scan — falls Frank zwischendurch im Katalog editiert hat). Tracklist nur wenn
 * 0 Track-Rows. Marktpreise sind nicht Teil dieses Tools.
 *
 * Jede Release in eigener Transaktion → ein Fehler kippt nicht den ganzen Batch.
 *
 * Konzept: docs/optimizing/DISCOGS_BACKFILL_TOOL_KONZEPT.md
 */
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const body = (req.body || {}) as { release_ids?: unknown }
  const actorId: string = (req as any).auth_context?.actor_id || "admin"

  const releaseIds = Array.isArray(body.release_ids)
    ? body.release_ids.filter((x): x is string => typeof x === "string" && x.length > 0)
    : []
  if (releaseIds.length === 0) {
    res.status(400).json({ message: "release_ids must be a non-empty array" })
    return
  }

  const results: Array<{ release_id: string; applied: boolean; fields: string[]; reason?: string }> = []

  for (const releaseId of releaseIds) {
    try {
      const candidate = await pg("discogs_backfill_candidate")
        .where({ release_id: releaseId, status: "pending" })
        .first()
      if (!candidate) {
        results.push({ release_id: releaseId, applied: false, fields: [], reason: "not_pending" })
        continue
      }
      const proposed = (candidate.proposed || {}) as {
        genres?: string[] | null
        styles?: string[] | null
        credits?: string | null
        description?: string | null
        tracklist?: Array<{ position?: string; title?: string; duration?: string; artist_name?: string | null }>
      }

      const fieldsWritten: string[] = []

      await pg.transaction(async (trx) => {
        const release = await trx("Release")
          .where("id", releaseId)
          .select("id", "genres", "styles", "credits", "description")
          .forUpdate()
          .first()
        if (!release) throw new Error("Release not found")

        const trackRow = await trx("Track")
          .where("releaseId", releaseId)
          .count<{ c: string }[]>("* as c")
          .first()
        const trackCount = Number(trackRow?.c || 0)

        const updates: Record<string, any> = {}

        // Additiv: nur noch leere Felder füllen.
        const genresEmpty = !Array.isArray(release.genres) || release.genres.length === 0
        if (genresEmpty && Array.isArray(proposed.genres) && proposed.genres.length > 0) {
          updates.genres = proposed.genres
          fieldsWritten.push("genres")
        }
        const stylesEmpty = !Array.isArray(release.styles) || release.styles.length === 0
        if (stylesEmpty && Array.isArray(proposed.styles) && proposed.styles.length > 0) {
          updates.styles = proposed.styles
          fieldsWritten.push("styles")
        }
        const creditsEmpty = release.credits == null || release.credits === ""
        if (creditsEmpty && typeof proposed.credits === "string" && proposed.credits.trim() !== "") {
          updates.credits = proposed.credits
          fieldsWritten.push("credits")
        }

        // description (Discogs-Notes): additiv wie die anderen Felder — ABER es
        // ist das EINZIGE Backfill-Feld mit einem permanenten Sync-Writer.
        // `legacy_sync_v2.py` schreibt `description` stündlich aus MySQL, gated
        // nur durch `locked_fields @> '"description"'`. Ohne den Lock-Eintrag
        // wäre der Backfill in <1h wieder vom Cron überschrieben. Daher: bei
        // einem description-Write `"description"` idempotent in `locked_fields`
        // mergen. Siehe DISCOGS_BACKFILL_TOOL_KONZEPT.md — Abschnitt „Erweiterung".
        const descriptionEmpty = release.description == null || release.description === ""
        if (descriptionEmpty && typeof proposed.description === "string" && proposed.description.trim() !== "") {
          updates.description = proposed.description
          updates.locked_fields = trx.raw(
            `CASE WHEN locked_fields @> '"description"'::jsonb THEN locked_fields
                  ELSE COALESCE(locked_fields, '[]'::jsonb) || '"description"'::jsonb END`
          )
          fieldsWritten.push("description")
        }

        // Tracklist nur wenn die Release noch keine Tracks hat.
        const tracks = Array.isArray(proposed.tracklist) ? proposed.tracklist : []
        if (trackCount === 0 && tracks.length > 0) {
          for (let idx = 0; idx < tracks.length; idx++) {
            const t = tracks[idx]
            if (!t?.title) continue
            await trx.raw(
              `INSERT INTO "Track" (id, "releaseId", position, title, duration, artist_name)
               VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
              [
                `tr-${releaseId}-${idx}`,
                releaseId,
                typeof t.position === "string" ? t.position : "",
                t.title,
                typeof t.duration === "string" ? t.duration : "",
                typeof t.artist_name === "string" ? t.artist_name : null,
              ]
            )
          }
          fieldsWritten.push("tracklist")
        }

        if (Object.keys(updates).length > 0 || fieldsWritten.includes("tracklist")) {
          // search_indexed_at = NULL → Meili-Delta-Cron reindexed (Genres/Styles
          // sind Meili-Facetten). Explicit bump, nicht auf den Trigger verlassen.
          updates.discogs_last_synced = new Date()
          updates.updatedAt = new Date()
          updates.search_indexed_at = null
          await trx("Release").where("id", releaseId).update(updates)
        }

        await trx("discogs_backfill_candidate")
          .where("release_id", releaseId)
          .update({
            status: "applied",
            applied_at: new Date(),
            applied_by: actorId,
            updated_at: new Date(),
          })
      })

      // Storefront-Revalidation: die Katalog-Detailseite (`/catalog/[id]`) zeigt
      // Genres, Tracklist und (rc71.x) die Notes-Sektion — ohne Bust erscheint
      // der Backfill erst nach dem 60s-ISR-Fenster. Fire-and-forget, nur wenn
      // wirklich etwas geschrieben wurde.
      if (fieldsWritten.length > 0) {
        revalidateReleaseCatalogPage(releaseId)
      }

      results.push({ release_id: releaseId, applied: true, fields: fieldsWritten })
    } catch (e: any) {
      results.push({
        release_id: releaseId,
        applied: false,
        fields: [],
        reason: String(e?.message || e).slice(0, 300),
      })
    }
  }

  res.json({
    applied: results.filter((r) => r.applied).length,
    failed: results.filter((r) => !r.applied).length,
    results,
  })
}
