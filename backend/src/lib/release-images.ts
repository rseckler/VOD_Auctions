/**
 * Helper für Image-CRUD an einem Release. Wird von:
 *   POST   /admin/media/:id/images           (upload)
 *   DELETE /admin/media/:id/images/:imageId  (delete)
 *   POST   /admin/media/:id/images/reorder   (bulk rang)
 *   POST   /admin/media/:id/images/:imageId/set-cover
 *
 * verwendet. Stellt sicher dass nach jeder Mutation:
 *   - Release.coverImage = URL der Image-Row mit niedrigstem rang
 *   - Release.search_indexed_at = NULL (Meili-Delta-Reindex)
 *   - Release.updatedAt = NOW()
 *   - coverImage wird gelockt (rc51 Lock-Modell, schützt vor Tape-Mag-Sync)
 */

import type { Knex } from "knex"
import { lockFields } from "./release-locks"

/**
 * Re-syncs Release.coverImage to the URL of the lowest-rang Image-Row.
 * Auto-locks `coverImage` field so the next legacy_sync_v2 run won't
 * overwrite the user's choice. Bumps search_indexed_at for Meili.
 *
 * Call inside a transaction together with the Image-Row mutations.
 */
export async function syncReleaseCoverFromImages(
  trx: Knex.Transaction,
  releaseId: string
): Promise<{ coverImage: string | null }> {
  const cover = await trx("Image")
    .where("releaseId", releaseId)
    .orderBy("rang", "asc")
    .orderBy("id", "asc")
    .select("url")
    .first()

  const newCover = cover?.url ?? null

  await trx("Release")
    .where("id", releaseId)
    .update({
      coverImage: newCover,
      search_indexed_at: null,
      updatedAt: new Date(),
    })

  await lockFields(trx, releaseId, ["coverImage"])
  return { coverImage: newCover }
}

/**
 * Returns next-highest rang for a new image insert (existing max + 10).
 * Spacing of 10 keeps subsequent reorders cheap (insert-between possible).
 */
export async function nextRang(
  trx: Knex | Knex.Transaction,
  releaseId: string
): Promise<number> {
  const row = await trx("Image")
    .where("releaseId", releaseId)
    .max<{ max: number | null }>("rang as max")
    .first()
  const max = row?.max ?? null
  return (max ?? -1) + 10
}
