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

// ─── Demo data gate ─────────────────────────────────────────────────────────
// The flag-gated demo dataset (scripts/community_seed.py) lives in the same
// tables as real content. Every demo row is authored by a demo profile whose
// id carries the DEMO_ID_PREFIX. When COMMUNITY_DEMO is OFF, read routes hide
// any content authored by a demo profile. See docs/Community/COMMUNITY_REBUILD_PLAN.md R0.
export const DEMO_ID_PREFIX = "cmpro_demo_"
export const DEMO_AUTHOR_LIKE = `${DEMO_ID_PREFIX}%`

/** True when the COMMUNITY_DEMO flag is on — demo rows should then be visible. */
export async function communityDemoEnabled(pg: Knex): Promise<boolean> {
  try {
    return await getFeatureFlag(pg, "COMMUNITY_DEMO")
  } catch {
    return false
  }
}

/** True when the given id belongs to the demo dataset. */
export function isDemoId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(DEMO_ID_PREFIX)
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

  // Inherit the CRM tier (Increment 3D). Falls back to 'standard'.
  const crm = await pg("crm_master_contact")
    .where({ medusa_customer_id: customerId })
    .first("tier")
  const tier = crm?.tier || "standard"

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
      tier,
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

/**
 * Per-emoji reaction breakdown for a set of targets. Returns a map
 * targetId → { emoji → count }. Used to render the reaction row on feed
 * cards and the reaction bar on post detail.
 */
export async function fetchReactionBreakdown(
  pg: Knex,
  targetKind: "post" | "comment",
  targetIds: (string | null | undefined)[]
): Promise<Record<string, Record<string, number>>> {
  const ids = [...new Set(targetIds.filter((x): x is string => !!x))]
  if (ids.length === 0) return {}
  const rows = await pg("community_reaction")
    .where("target_kind", targetKind)
    .whereIn("target_id", ids)
    .groupBy("target_id", "emoji")
    .select("target_id", "emoji")
    .count("id as count")
  const map: Record<string, Record<string, number>> = {}
  for (const r of rows as any[]) {
    const t = r.target_id as string
    if (!map[t]) map[t] = {}
    map[t][r.emoji] = Number(r.count)
  }
  return map
}

// ─── Trust levels ───────────────────────────────────────────────────────────
// 0 newcomer · 1 member · 2 trusted · 3 veteran. Curators are always 3.
// Computed from account age + activity; refreshed lazily on post creation.
export async function refreshTrustLevel(
  pg: Knex,
  profile: any
): Promise<number> {
  let level = 0
  if (profile.is_curator) {
    level = 3
  } else {
    const ageDays =
      (Date.now() - new Date(profile.created_at).getTime()) / 86_400_000
    const postRows = await pg("community_post")
      .where({ author_id: profile.id })
      .count("id as c")
    const commentRows = await pg("community_comment")
      .where({ author_id: profile.id })
      .count("id as c")
    const activity =
      Number(postRows[0]?.c || 0) + Number(commentRows[0]?.c || 0)
    if (ageDays >= 7) level = 1
    if (ageDays >= 30 && activity >= 10) level = 2
    if (ageDays >= 180 && activity >= 50) level = 3
  }
  if (level !== profile.trust_level) {
    await pg("community_profile")
      .where({ id: profile.id })
      .update({ trust_level: level, updated_at: new Date() })
  }
  return level
}

// Daily post allowance per trust level (spam guard). -1 = effectively unlimited.
export function dailyPostLimit(trustLevel: number): number {
  if (trustLevel <= 0) return 5
  if (trustLevel === 1) return 20
  return -1
}

// ─── Notifications ──────────────────────────────────────────────────────────
/**
 * Insert an in-app notification. No-op when the actor is the recipient
 * (you never get notified about your own action). Best-effort — callers
 * should not let a notification failure break the primary action.
 */
export async function createNotification(
  pg: Knex,
  n: {
    recipient_id: string
    kind: "comment" | "reply" | "follow" | "mention" | "editorial"
    actor_id?: string | null
    target_kind?: string | null
    target_id?: string | null
    target_slug?: string | null
  }
): Promise<void> {
  if (!n.recipient_id) return
  if (n.actor_id && n.actor_id === n.recipient_id) return
  try {
    await pg("community_notification").insert({
      id: generateEntityId("", "cmntf"),
      recipient_id: n.recipient_id,
      kind: n.kind,
      actor_id: n.actor_id ?? null,
      target_kind: n.target_kind ?? null,
      target_id: n.target_id ?? null,
      target_slug: n.target_slug ?? null,
      is_read: false,
      created_at: new Date(),
    })
  } catch {
    // best-effort — never break the primary action over a notification
  }
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
