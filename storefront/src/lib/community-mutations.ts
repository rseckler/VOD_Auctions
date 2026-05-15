// VOD Community — authenticated client-side mutations.
// Used only by "use client" components. Reads the customer bearer token from
// lib/auth (localStorage) — never call these server-side.

import { MEDUSA_URL, PUBLISHABLE_KEY } from "./api"
import { getToken } from "./auth"
import type {
  CommunityComment,
  CommunityPost,
  CommunityProfile,
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
  method: "POST" | "PATCH" | "PUT" | "DELETE",
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
