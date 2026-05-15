import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireCommunityEnabled, serializeProfile } from "../../../../../lib/community"

const TIERS = ["platinum", "gold", "silver", "bronze", "standard", "curator"]

// PATCH /admin/community/profiles/:id — set tier / curator / ban
//
// Increment 1: tier is set manually here (CRM-tier inheritance is a later
// increment, see Community Concept §17.2).
export async function PATCH(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await requireCommunityEnabled(pg, res))) return

  const profile = await pg("community_profile")
    .where({ id: req.params.id })
    .first("id")
  if (!profile) {
    res.status(404).json({ message: "Profile not found" })
    return
  }

  const body = (req.body || {}) as Record<string, any>
  const patch: Record<string, any> = { updated_at: new Date() }
  if (body.tier !== undefined) {
    if (!TIERS.includes(body.tier)) {
      res.status(422).json({ message: "Invalid tier" })
      return
    }
    patch.tier = body.tier
  }
  if (body.is_curator !== undefined) patch.is_curator = !!body.is_curator
  if (body.is_banned !== undefined) patch.is_banned = !!body.is_banned

  const [row] = await pg("community_profile")
    .where({ id: profile.id })
    .update(patch)
    .returning("*")
  res.json({
    profile: { ...serializeProfile(row), is_banned: !!row.is_banned },
  })
}
