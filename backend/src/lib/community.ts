import { Knex } from "knex"
import { MedusaResponse } from "@medusajs/framework/http"
import { generateEntityId } from "@medusajs/framework/utils"
import sanitizeHtml from "sanitize-html"
import { getFeatureFlag } from "./feature-flags"

// ─── Community shared helpers — Increment 1 ─────────────────────────────────
// Foundation for all /store/community + /admin/community routes.
// See docs/Community/Community Concept.md §17.

// The curated reaction set (Design Brief §6.4). No free-form emoji.
export const REACTION_EMOJI = ["🔥", "❤️", "🤘", "👀", "💯", "🙏", "⚡"] as const
export type ReactionEmoji = (typeof REACTION_EMOJI)[number]

export function isReactionEmoji(v: unknown): v is ReactionEmoji {
  return typeof v === "string" && (REACTION_EMOJI as readonly string[]).includes(v)
}

/**
 * Flag-gate for the whole Community surface. When the COMMUNITY flag is OFF
 * every community route answers 404 — code + tables exist regardless of the
 * flag ("deploy early, activate when ready").
 * Returns true when enabled; sends 404 and returns false when disabled.
 */
export async function requireCommunityEnabled(
  pg: Knex,
  res: MedusaResponse
): Promise<boolean> {
  const enabled = await getFeatureFlag(pg, "COMMUNITY")
  if (!enabled) {
    res.status(404).json({ message: "Not found" })
    return false
  }
  return true
}

// ─── HTML sanitisation ──────────────────────────────────────────────────────
// Posts/comments arrive as Tiptap-rendered body_html from the composer. We
// store a sanitised copy. The allowlist matches the planned Tiptap extension
// set; iframe embeds are restricted to known media hosts.
const EMBED_HOSTS = [
  "www.youtube.com",
  "youtube.com",
  "www.youtube-nocookie.com",
  "player.vimeo.com",
  "bandcamp.com",
  "w.soundcloud.com",
  "open.spotify.com",
]

export function sanitizeBodyHtml(html: string): string {
  return sanitizeHtml(html || "", {
    allowedTags: [
      "p", "br", "strong", "em", "s", "u", "code", "pre", "blockquote",
      "h2", "h3", "ul", "ol", "li", "a", "img", "iframe", "hr", "span", "div",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "title"],
      iframe: [
        "src", "width", "height", "allow", "allowfullscreen", "frameborder",
        "loading",
      ],
      // Embed wrapper — class is restricted to the cm-embed* family below.
      div: ["class", "data-community-embed"],
      span: ["data-mention", "data-id"],
    },
    allowedClasses: {
      div: ["cm-embed", "cm-embed-youtube", "cm-embed-vimeo", "cm-embed-spotify", "cm-embed-soundcloud", "cm-embed-bandcamp", "cm-embed-generic"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedIframeHostnames: EMBED_HOSTS,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          rel: "noopener noreferrer nofollow",
          target: "_blank",
        },
      }),
    },
  })
}

/** Plain-text excerpt from (sanitised) HTML, for feed cards. */
export function excerptFromHtml(html: string, max = 220): string {
  const text = sanitizeHtml(html || "", { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim()
  return text.length > max ? text.slice(0, max).trimEnd() + "…" : text
}

// ─── Slugs ──────────────────────────────────────────────────────────────────
function baseSlug(title: string): string {
  const s = (title || "post")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return s || "post"
}

/** Generate a slug for a post that is unique in community_post. */
export async function uniquePostSlug(pg: Knex, title: string): Promise<string> {
  const base = baseSlug(title)
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`
    const hit = await pg("community_post").where({ slug: candidate }).first("id")
    if (!hit) return candidate
  }
  return `${base}-${generateEntityId("", "p").slice(-8)}`
}

// ─── Handles ────────────────────────────────────────────────────────────────
function baseHandle(seed: string): string {
  const h = (seed || "member")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "")
    .slice(0, 24)
  return h.length >= 3 ? h : `member${h}`
}

/** Generate a public @handle that is unique in community_profile. */
export async function uniqueHandle(pg: Knex, seed: string): Promise<string> {
  const base = baseHandle(seed)
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}${i + 1}`
    const hit = await pg("community_profile").where({ handle: candidate }).first("id")
    if (!hit) return candidate
  }
  return `${base}${generateEntityId("", "h").slice(-6)}`
}

// ─── Profile resolution ─────────────────────────────────────────────────────
/** Fetch a community profile by Medusa customer id, or null. No side-effects. */
export async function getProfileByCustomerId(
  pg: Knex,
  customerId: string
): Promise<any | null> {
  return (
    (await pg("community_profile").where({ customer_id: customerId }).first()) ||
    null
  )
}

/**
 * Resolve the community profile for a logged-in customer, creating one on
 * first interaction. Display-name + handle are seeded from the customer
 * record; the member can change them later via PUT /store/community/profile.
 */
export async function getOrCreateProfile(
  pg: Knex,
  customerId: string
): Promise<any> {
  const existing = await getProfileByCustomerId(pg, customerId)
  if (existing) return existing

  const customer = await pg("customer")
    .where({ id: customerId })
    .first("email", "first_name", "last_name")

  const emailLocal = (customer?.email || "").split("@")[0] || "member"
  const displayName =
    [customer?.first_name, customer?.last_name].filter(Boolean).join(" ").trim() ||
    emailLocal

  const handle = await uniqueHandle(pg, emailLocal)
  const now = new Date()

  const [row] = await pg("community_profile")
    .insert({
      id: generateEntityId("", "cmpro"),
      customer_id: customerId,
      claimed: true,
      handle,
      display_name: displayName,
      links: JSON.stringify({}),
      tier: "standard",
      created_at: now,
      updated_at: now,
    })
    .returning("*")
  return row
}

// ─── Denormalised counter recompute ─────────────────────────────────────────
export async function recomputeReactionCount(
  pg: Knex,
  targetKind: "post" | "comment",
  targetId: string
): Promise<number> {
  const rows = await pg("community_reaction")
    .where({ target_kind: targetKind, target_id: targetId })
    .count("id as count")
  const n = Number(rows[0]?.count || 0)
  const table = targetKind === "post" ? "community_post" : "community_comment"
  await pg(table).where({ id: targetId }).update({ reaction_count: n })
  return n
}

export async function recomputeCommentCount(
  pg: Knex,
  postId: string
): Promise<number> {
  const rows = await pg("community_comment")
    .where({ post_id: postId, status: "published" })
    .count("id as count")
  const n = Number(rows[0]?.count || 0)
  await pg("community_post").where({ id: postId }).update({ comment_count: n })
  return n
}

// ─── Catalog anchoring ──────────────────────────────────────────────────────
/**
 * Fetch lightweight release cards (id → card) for catalog-anchored posts and
 * reviews. Soft reference: missing ids are simply absent from the map.
 */
export async function fetchReleaseCards(
  pg: Knex,
  releaseIds: (string | null | undefined)[]
): Promise<Record<string, any>> {
  const ids = [...new Set(releaseIds.filter((x): x is string => !!x))]
  if (ids.length === 0) return {}
  const rows = await pg("Release")
    .leftJoin("Artist", "Artist.id", "Release.artistId")
    .whereIn("Release.id", ids)
    .select(
      "Release.id as id",
      "Release.title as title",
      "Release.coverImage as cover_image",
      "Artist.name as artist_name"
    )
  const map: Record<string, any> = {}
  for (const r of rows) map[r.id] = r
  return map
}

// ─── API serialisation ──────────────────────────────────────────────────────
/** Public-safe representation of a community profile. */
export function serializeProfile(p: any) {
  return {
    id: p.id,
    handle: p.handle,
    display_name: p.display_name,
    bio: p.bio ?? null,
    location: p.location ?? null,
    pronouns: p.pronouns ?? null,
    collector_since: p.collector_since ?? null,
    avatar_url: p.avatar_url ?? null,
    header_url: p.header_url ?? null,
    links: p.links ?? {},
    tier: p.tier,
    is_curator: !!p.is_curator,
    created_at: p.created_at,
  }
}
