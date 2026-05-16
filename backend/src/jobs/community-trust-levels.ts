import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getFeatureFlag } from "../lib/feature-flags"

// Trust-level auto-promotion (Concept §8.2). trust_level otherwise only
// updates lazily when a member creates a post; this job recomputes it for
// every member daily, in bulk, from account age + activity.
//
//   TL0 newcomer · TL1 ≥7d · TL2 ≥30d & ≥10 activity · TL3 ≥180d & ≥50.
//   Curators are always TL3.
function levelFor(ageDays: number, activity: number, isCurator: boolean): number {
  if (isCurator) return 3
  let level = 0
  if (ageDays >= 7) level = 1
  if (ageDays >= 30 && activity >= 10) level = 2
  if (ageDays >= 180 && activity >= 50) level = 3
  return level
}

export default async function communityTrustLevels(
  container: MedusaContainer
): Promise<void> {
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await getFeatureFlag(pg, "COMMUNITY"))) return

  // Per-member activity = published posts + published comments.
  const rows = await pg("community_profile as p")
    .where("p.is_banned", false)
    .leftJoin("community_post as po", function (this: any) {
      this.on("po.author_id", "p.id").andOn(
        "po.status",
        pg.raw("?", ["published"])
      )
    })
    .leftJoin("community_comment as co", function (this: any) {
      this.on("co.author_id", "p.id").andOn(
        "co.status",
        pg.raw("?", ["published"])
      )
    })
    .groupBy("p.id", "p.created_at", "p.trust_level", "p.is_curator")
    .select(
      "p.id",
      "p.created_at",
      "p.trust_level",
      "p.is_curator",
      pg.raw(
        "count(DISTINCT po.id) + count(DISTINCT co.id) AS activity"
      )
    )

  const now = Date.now()
  // Group profile ids by the trust level they should move to.
  const moves: Record<number, string[]> = { 0: [], 1: [], 2: [], 3: [] }
  for (const r of rows as any[]) {
    const ageDays = (now - new Date(r.created_at).getTime()) / 86_400_000
    const target = levelFor(ageDays, Number(r.activity || 0), !!r.is_curator)
    if (target !== (r.trust_level ?? 0)) moves[target].push(r.id)
  }

  let promoted = 0
  for (const [level, ids] of Object.entries(moves)) {
    if (ids.length === 0) continue
    await pg("community_profile")
      .whereIn("id", ids)
      .update({ trust_level: Number(level), updated_at: new Date() })
    promoted += ids.length
  }

  if (promoted > 0) {
    console.log(`[community-trust-levels] adjusted ${promoted} trust levels`)
  }
}

export const config = {
  name: "community-trust-levels",
  schedule: "30 3 * * *", // daily, 03:30 UTC
}
