// Run in Supabase SQL Editor:
// CREATE TABLE IF NOT EXISTS collector_profile (
//   id TEXT PRIMARY KEY DEFAULT 'cp_' || substr(md5(random()::text), 1, 20),
//   customer_id TEXT NOT NULL UNIQUE,
//   display_name TEXT,
//   bio TEXT,
//   genre_tags TEXT[] DEFAULT '{}',
//   is_public BOOLEAN DEFAULT false,
//   created_at TIMESTAMPTZ DEFAULT NOW(),
//   updated_at TIMESTAMPTZ DEFAULT NOW()
// );

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import crypto from "crypto"

// GET /store/collector/:slug — Public collector profile
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const slug = (req.params as any).slug
  if (!slug || typeof slug !== "string" || slug.length !== 6) {
    res.status(404).json({ message: "Profile not found" })
    return
  }

  const upperSlug = slug.toUpperCase()

  // Find the collector profile where the hash of customer_id matches the slug
  // We need to check all public profiles and compute the hash
  const profiles = await pgConnection("collector_profile")
    .select(
      "collector_profile.customer_id",
      "collector_profile.display_name",
      "collector_profile.bio",
      "collector_profile.genre_tags",
      "collector_profile.is_public",
      "collector_profile.created_at"
    )
    .where("collector_profile.is_public", true)

  // Find the profile matching the slug hash
  const matchedProfile = profiles.find((p: any) => {
    const hash = crypto
      .createHash("sha256")
      .update(p.customer_id)
      .digest("hex")
      .substring(0, 6)
      .toUpperCase()
    return hash === upperSlug
  })

  if (!matchedProfile) {
    res.status(404).json({ message: "Profile not found" })
    return
  }

  // Get aggregated stats from customer_stats
  const stats = await pgConnection("customer_stats")
    .select("total_bids", "total_wins")
    .where("customer_id", matchedProfile.customer_id)
    .first()

  // Get member_since from customer table
  const customer = await pgConnection("customer")
    .select("created_at")
    .where("id", matchedProfile.customer_id)
    .first()

  const hash = crypto
    .createHash("sha256")
    .update(matchedProfile.customer_id)
    .digest("hex")
    .substring(0, 6)
    .toUpperCase()

  res.json({
    profile: {
      slug: hash,
      display_name: matchedProfile.display_name || `Collector-${hash}`,
      bio: matchedProfile.bio || null,
      genre_tags: matchedProfile.genre_tags || [],
      member_since: customer?.created_at || matchedProfile.created_at,
      total_bids: stats?.total_bids || 0,
      total_wins: stats?.total_wins || 0,
    },
  })
}
