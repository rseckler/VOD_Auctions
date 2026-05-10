import { Knex } from "knex"

/**
 * Slugifies a label name for use in `Label.slug` (UNIQUE).
 * Matches the convention used by `discogs-import/commit/route.ts::slugify`
 * so the same name produces the same slug across import paths.
 */
export function slugifyLabelName(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[-\s]+/g, "-")
    .substring(0, 200)
}

/**
 * Find an existing `Label` row by case-insensitive name match (via slug),
 * or create a new one with `id = enriched-label-<slug>`.
 *
 * Race-safe via `ON CONFLICT (slug)`: concurrent calls with the same name
 * resolve to the same row, even across transactions.
 *
 * Used by the Discogs-Apply pipeline (rc53.18) so a Pressungs-Korrektur
 * (e.g. Animalized → New Dance) re-points `Release.labelId` to the right
 * Label, creating the row on demand when the label hasn't been seen yet.
 *
 * @returns the resolved `Label.id`, or `null` for empty/unusable input.
 */
export async function findOrCreateLabelByName(
  trx: Knex.Transaction | Knex,
  name: string | null | undefined
): Promise<string | null> {
  if (!name) return null
  const cleaned = name.replace(/\s*\(\d+\)$/, "").trim()
  if (!cleaned) return null

  const slug = slugifyLabelName(cleaned)
  if (!slug) return null

  const newId = `enriched-label-${slug}`

  // ON CONFLICT (slug) returns the existing row's id, so a concurrent insert
  // collapses to the existing row. We update updatedAt as a touch so the
  // row's freshness reflects the resolution.
  const result = await trx.raw(
    `INSERT INTO "Label" (id, name, slug, "createdAt", "updatedAt")
     VALUES (?, ?, ?, NOW(), NOW())
     ON CONFLICT (slug) DO UPDATE SET "updatedAt" = NOW()
     RETURNING id`,
    [newId, cleaned, slug]
  )

  const rows = (result as { rows?: Array<{ id: string }> }).rows
  if (!rows || rows.length === 0) return null
  return rows[0].id
}
