import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { getFeatureFlag } from "../lib/feature-flags"
import { excerptFromHtml, uniquePostSlug } from "../lib/community"

// Acquired-feed job — turns a member's completed purchases into community
// posts (kind='acquired'), opt-in via community_profile.show_acquired_feed.
// Decoupled from the payment webhook by design: it scans recent paid
// transactions instead of hooking the money path, so a bug here can never
// affect order processing. Idempotent — one acquired post per member+release.
export default async function communityAcquired(
  container: MedusaContainer
): Promise<void> {
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  if (!(await getFeatureFlag(pg, "COMMUNITY"))) return

  const since = new Date(Date.now() - 3 * 86_400_000)

  // Recent paid purchases with an identifiable buyer + release.
  const txns = await pg("transaction as t")
    .leftJoin("block_item as bi", "bi.id", "t.block_item_id")
    .where("t.status", "paid")
    .where("t.paid_at", ">=", since)
    .whereNull("t.deleted_at")
    .whereNotNull("t.user_id")
    .select(
      "t.id as txn_id",
      "t.user_id",
      pg.raw("COALESCE(t.release_id, bi.release_id) as release_id")
    )

  const withRelease = txns.filter((t: any) => t.release_id)
  if (withRelease.length === 0) return

  // Buyers who have a community profile AND opted into the acquired feed.
  const customerIds = [...new Set(withRelease.map((t: any) => t.user_id))]
  const profiles = await pg("community_profile")
    .whereIn("customer_id", customerIds)
    .where("show_acquired_feed", true)
    .where("is_banned", false)
    .select("id", "customer_id")
  const profileByCustomer: Record<string, string> = {}
  for (const p of profiles) profileByCustomer[p.customer_id] = p.id
  if (Object.keys(profileByCustomer).length === 0) return

  // Candidate (author, release) pairs — dedup against existing acquired posts.
  const pairs = withRelease
    .map((t: any) => ({
      author_id: profileByCustomer[t.user_id],
      release_id: String(t.release_id),
    }))
    .filter((p: any) => p.author_id)

  const authorIds = [...new Set(pairs.map((p: any) => p.author_id))]
  const releaseIds = [...new Set(pairs.map((p: any) => p.release_id))]
  const existing = await pg("community_post")
    .where("kind", "acquired")
    .whereIn("author_id", authorIds)
    .whereIn("release_id", releaseIds)
    .select("author_id", "release_id")
  const seen = new Set(
    existing.map((e: any) => `${e.author_id}::${e.release_id}`)
  )

  const releaseTitles: Record<string, string> = {}
  const titleRows = await pg("Release")
    .whereIn("id", releaseIds)
    .select("id", "title")
  for (const r of titleRows) releaseTitles[r.id] = r.title || "a release"

  let created = 0
  for (const pair of pairs) {
    const key = `${pair.author_id}::${pair.release_id}`
    if (seen.has(key)) continue
    seen.add(key) // guard against duplicate txns in this same run

    const title = releaseTitles[pair.release_id]
    if (!title) continue
    const bodyHtml = `<p>Added <strong>${title}</strong> to the collection.</p>`
    const now = new Date()
    try {
      await pg("community_post").insert({
        id: generateEntityId("", "cmpst"),
        author_id: pair.author_id,
        kind: "acquired",
        title: null,
        slug: await uniquePostSlug(pg, `acquired ${title}`),
        body_html: bodyHtml,
        excerpt: excerptFromHtml(bodyHtml),
        tags: ["acquired"],
        release_id: pair.release_id,
        status: "published",
        created_at: now,
        updated_at: now,
        published_at: now,
      })
      created++
    } catch {
      // best-effort — a single failed insert must not abort the run
    }
  }

  if (created > 0) {
    console.log(`[community-acquired-feed] created ${created} acquired posts`)
  }
}

export const config = {
  name: "community-acquired-feed",
  // Offset off the top of the hour to avoid colliding with hourly jobs.
  schedule: "15,45 * * * *",
}
