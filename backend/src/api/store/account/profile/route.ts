import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import crypto from "crypto"

// GET /store/account/profile — Own collector profile (authenticated)
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const profile = await pgConnection("collector_profile")
    .select(
      "display_name",
      "bio",
      "genre_tags",
      "is_public",
      "avatar_type",
      "avatar_preset",
      "avatar_url",
      "created_at",
      "updated_at"
    )
    .where("customer_id", customerId)
    .first()

  const hash = crypto
    .createHash("sha256")
    .update(customerId)
    .digest("hex")
    .substring(0, 6)
    .toUpperCase()

  if (!profile) {
    res.json({
      profile: null,
      slug: hash,
    })
    return
  }

  res.json({
    profile: {
      display_name: profile.display_name || null,
      bio: profile.bio || null,
      genre_tags: profile.genre_tags || [],
      is_public: profile.is_public || false,
      avatar_type: profile.avatar_type || "initial",
      avatar_preset: profile.avatar_preset || null,
      avatar_url: profile.avatar_url || null,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
    },
    slug: hash,
  })
}

// POST /store/account/profile — Create/update collector profile (authenticated)
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { display_name, bio, genre_tags, is_public, avatar_type, avatar_preset } = req.body as {
    display_name?: string
    bio?: string
    genre_tags?: string[]
    is_public?: boolean
    avatar_type?: string
    avatar_preset?: string
  }

  // Validate inputs
  const cleanDisplayName = display_name?.trim().substring(0, 100) || null
  const cleanBio = bio?.trim().substring(0, 1000) || null
  const cleanTags = Array.isArray(genre_tags)
    ? genre_tags
        .map((t) => String(t).trim())
        .filter((t) => t.length > 0)
        .slice(0, 20)
    : []
  const cleanIsPublic = typeof is_public === "boolean" ? is_public : false
  const validAvatarTypes = ["initial", "preset", "custom"]
  const cleanAvatarType = validAvatarTypes.includes(avatar_type || "") ? avatar_type : "initial"
  const cleanAvatarPreset = avatar_preset?.trim().substring(0, 50) || null

  await pgConnection.raw(
    `INSERT INTO collector_profile (customer_id, display_name, bio, genre_tags, is_public, avatar_type, avatar_preset, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
     ON CONFLICT (customer_id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       bio = EXCLUDED.bio,
       genre_tags = EXCLUDED.genre_tags,
       is_public = EXCLUDED.is_public,
       avatar_type = EXCLUDED.avatar_type,
       avatar_preset = EXCLUDED.avatar_preset,
       updated_at = NOW()`,
    [customerId, cleanDisplayName, cleanBio, JSON.stringify(cleanTags), cleanIsPublic, cleanAvatarType, cleanAvatarPreset]
  )

  const hash = crypto
    .createHash("sha256")
    .update(customerId)
    .digest("hex")
    .substring(0, 6)
    .toUpperCase()

  res.json({
    profile: {
      display_name: cleanDisplayName,
      bio: cleanBio,
      genre_tags: cleanTags,
      is_public: cleanIsPublic,
      avatar_type: cleanAvatarType,
      avatar_preset: cleanAvatarPreset,
    },
    slug: hash,
    message: "Profile saved",
  })
}
