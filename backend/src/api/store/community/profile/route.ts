import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  requireCommunityEnabled,
  getOrCreateProfile,
  serializeProfile,
} from "../../../../lib/community"

const HANDLE_RE = /^[a-z0-9_-]{3,30}$/

// GET /store/community/profile — own profile (auth required, created on demand)
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await requireCommunityEnabled(pg, res))) return

  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  const profile = await getOrCreateProfile(pg, customerId)
  res.json({ profile: { ...serializeProfile(profile), is_banned: !!profile.is_banned } })
}

// PUT /store/community/profile — update own profile (auth required)
export async function PUT(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await requireCommunityEnabled(pg, res))) return

  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  const profile = await getOrCreateProfile(pg, customerId)
  const body = (req.body || {}) as Record<string, any>
  const patch: Record<string, any> = { updated_at: new Date() }

  if (body.handle !== undefined) {
    const handle = String(body.handle).toLowerCase().trim()
    if (!HANDLE_RE.test(handle)) {
      res.status(422).json({
        message: "Handle must be 3–30 chars: a–z, 0–9, _ or -",
      })
      return
    }
    if (handle !== profile.handle) {
      const taken = await pg("community_profile")
        .where({ handle })
        .whereNot({ id: profile.id })
        .first("id")
      if (taken) {
        res.status(409).json({ message: "Handle is already taken" })
        return
      }
      patch.handle = handle
    }
  }

  if (body.display_name !== undefined) {
    const dn = String(body.display_name).trim().slice(0, 60)
    if (!dn) {
      res.status(422).json({ message: "Display name cannot be empty" })
      return
    }
    patch.display_name = dn
  }
  if (body.bio !== undefined) {
    patch.bio = body.bio ? String(body.bio).slice(0, 1000) : null
  }
  if (body.location !== undefined) {
    patch.location = body.location ? String(body.location).slice(0, 80) : null
  }
  if (body.pronouns !== undefined) {
    patch.pronouns = body.pronouns ? String(body.pronouns).slice(0, 40) : null
  }
  if (body.collector_since !== undefined) {
    const year = Number(body.collector_since)
    patch.collector_since =
      Number.isInteger(year) && year >= 1900 && year <= new Date().getFullYear()
        ? year
        : null
  }
  if (body.avatar_url !== undefined) {
    patch.avatar_url = body.avatar_url ? String(body.avatar_url) : null
  }
  if (body.header_url !== undefined) {
    patch.header_url = body.header_url ? String(body.header_url) : null
  }
  if (body.links !== undefined && body.links && typeof body.links === "object") {
    const allowed = ["bandcamp", "discogs", "soundcloud", "website"]
    const links: Record<string, string> = {}
    for (const k of allowed) {
      if (body.links[k]) links[k] = String(body.links[k]).slice(0, 300)
    }
    patch.links = JSON.stringify(links)
  }

  const [row] = await pg("community_profile")
    .where({ id: profile.id })
    .update(patch)
    .returning("*")
  res.json({ profile: serializeProfile(row) })
}
