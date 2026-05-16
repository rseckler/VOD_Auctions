// VOD Community — authenticated client-side mutations.
// Used only by "use client" components. Reads the customer bearer token from
// lib/auth (localStorage) — never call these server-side.

import { MEDUSA_URL, PUBLISHABLE_KEY } from "./api"
import { getToken } from "./auth"
import type {
  CommunityComment,
  CommunityPost,
  CommunityProfile,
  CommunityNotification,
} from "./community-api"

export class CommunityError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "CommunityError"
    this.status = status
  }
}

async function authReq<T>(
  path: string,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown
): Promise<T> {
  const token = getToken()
  if (!token) {
    throw new CommunityError("Please sign in.", 401)
  }
  let res: Response
  try {
    res = await fetch(`${MEDUSA_URL}${path}`, {
      method,
      headers: {
        "x-publishable-api-key": PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new CommunityError("Network error — please try again.", 0)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new CommunityError(
      (data as { message?: string })?.message || "Something went wrong.",
      res.status
    )
  }
  return data as T
}

export interface CreatePostInput {
  title?: string
  body_html: string
  body_json?: unknown
  kind?: "discussion" | "editorial"
  tags?: string[]
  release_id?: string
  artist_id?: string
  label_id?: string
  press_id?: string
  cover_image_url?: string
}

export async function createPost(input: CreatePostInput): Promise<CommunityPost> {
  const data = await authReq<{ post: CommunityPost }>(
    "/store/community/posts",
    "POST",
    input
  )
  return data.post
}

export async function addComment(
  postIdOrSlug: string,
  input: { body_html: string; body_json?: unknown; parent_id?: string }
): Promise<CommunityComment> {
  const data = await authReq<{ comment: CommunityComment }>(
    `/store/community/posts/${encodeURIComponent(postIdOrSlug)}/comments`,
    "POST",
    input
  )
  return data.comment
}

export async function toggleReaction(
  targetKind: "post" | "comment",
  targetId: string,
  emoji: string
): Promise<{ reacted: boolean; emoji: string; count: number }> {
  return authReq("/store/community/reactions", "POST", {
    target_kind: targetKind,
    target_id: targetId,
    emoji,
  })
}

export async function createReview(input: {
  release_id: string
  rating: number
  body_html?: string
}): Promise<unknown> {
  return authReq("/store/community/reviews", "POST", input)
}

/** Report a post or comment for moderation. */
export async function reportContent(
  targetKind: "post" | "comment",
  targetId: string,
  reason: string
): Promise<void> {
  await authReq("/store/community/reports", "POST", {
    target_kind: targetKind,
    target_id: targetId,
    reason,
  })
}

/** Own notifications + unread count. */
export async function fetchNotifications(): Promise<{
  notifications: CommunityNotification[]
  unread: number
}> {
  return authReq("/store/community/notifications", "GET")
}

/** Mark notifications read — omitted ids marks all. */
export async function markNotificationsRead(ids?: string[]): Promise<void> {
  await authReq(
    "/store/community/notifications",
    "POST",
    ids && ids.length ? { ids } : {}
  )
}

/** Toggle a post bookmark. Returns the new saved state. */
export async function toggleSaved(
  postId: string
): Promise<{ saved: boolean }> {
  return authReq("/store/community/saved", "POST", { post_id: postId })
}

/** The viewer's bookmarked posts. */
export async function fetchSavedPosts(): Promise<CommunityPost[]> {
  const data = await authReq<{ posts: CommunityPost[] }>(
    "/store/community/saved",
    "GET"
  )
  return data.posts || []
}

/** Toggle following a member by handle. */
export async function toggleFollow(
  handle: string
): Promise<{ following: boolean; follower_count: number }> {
  return authReq("/store/community/follow", "POST", { handle })
}

/** Resolve a media URL to an embeddable iframe src (server-side). */
export async function resolveEmbed(
  url: string
): Promise<{ provider: string; embed_url: string }> {
  return authReq("/store/community/embed", "POST", { url })
}

/** Upload an image file to R2 via the community upload endpoint. */
export async function uploadCommunityImage(file: File): Promise<string> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () =>
      reject(new CommunityError("Could not read the selected file.", 0))
    reader.readAsDataURL(file)
  })
  const data = await authReq<{ url: string }>(
    "/store/community/upload",
    "POST",
    { image: base64 }
  )
  return data.url
}

// ─── Lists ──────────────────────────────────────────────────────────────────
export interface ListInput {
  title?: string
  description?: string | null
  cover_image_url?: string | null
  is_public?: boolean
}

export async function createList(
  input: ListInput
): Promise<{ id: string; slug: string | null }> {
  const data = await authReq<{ list: { id: string; slug: string | null } }>(
    "/store/community/lists",
    "POST",
    input
  )
  return data.list
}

export async function updateList(id: string, input: ListInput): Promise<void> {
  await authReq(`/store/community/lists/${encodeURIComponent(id)}`, "PATCH", input)
}

export async function deleteList(id: string): Promise<void> {
  await authReq(`/store/community/lists/${encodeURIComponent(id)}`, "DELETE")
}

export async function addListItem(
  listId: string,
  releaseId: string,
  note?: string
): Promise<{ item_count: number }> {
  return authReq(
    `/store/community/lists/${encodeURIComponent(listId)}/items`,
    "POST",
    { release_id: releaseId, note }
  )
}

export async function removeListItem(
  listId: string,
  releaseId: string
): Promise<{ item_count: number }> {
  return authReq(
    `/store/community/lists/${encodeURIComponent(listId)}/items`,
    "DELETE",
    { release_id: releaseId }
  )
}

export interface ProfileInput {
  display_name?: string
  handle?: string
  bio?: string | null
  location?: string | null
  pronouns?: string | null
  collector_since?: number | null
  avatar_url?: string | null
  header_url?: string | null
  links?: Record<string, string>
  show_tier?: boolean
  show_acquired_feed?: boolean
  show_wantlist?: boolean
  email_notifications?: boolean
  featured_releases?: string[]
}

export async function updateProfile(
  input: ProfileInput
): Promise<CommunityProfile> {
  const data = await authReq<{ profile: CommunityProfile }>(
    "/store/community/profile",
    "PUT",
    input
  )
  return data.profile
}
