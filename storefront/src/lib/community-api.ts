// VOD Community — storefront API client + shared types.
// Backend routes: /store/community/* (see backend/src/api/store/community).

import { medusaFetch } from "./api"

export type CommunityTier =
  | "platinum"
  | "gold"
  | "silver"
  | "bronze"
  | "standard"
  | "curator"

export interface CommunityAuthor {
  id: string
  handle: string
  display_name: string
  avatar_url: string | null
  tier: CommunityTier
  is_curator: boolean
}

export interface ReleaseCard {
  id: string
  title: string | null
  cover_image: string | null
  artist_name: string | null
}

export interface CommunityPost {
  id: string
  kind: "discussion" | "editorial"
  title: string | null
  slug: string | null
  excerpt: string | null
  body_html?: string | null
  cover_image_url: string | null
  tags: string[]
  is_pinned: boolean
  reaction_count: number
  comment_count: number
  published_at: string | null
  created_at: string
  author: CommunityAuthor
  release: ReleaseCard | null
}

export interface CommunityComment {
  id: string
  parent_id: string | null
  body_html: string
  reaction_count: number
  created_at: string
  author: CommunityAuthor
}

export interface CommunityProfile {
  id: string
  handle: string
  display_name: string
  bio: string | null
  location: string | null
  pronouns: string | null
  collector_since: number | null
  avatar_url: string | null
  header_url: string | null
  links: Record<string, string>
  tier: CommunityTier
  is_curator: boolean
  created_at: string
}

export interface CommunityReview {
  id: string
  rating: number | null
  body_html: string | null
  is_verified_acquired: boolean
  reaction_count: number
  created_at: string
  author: CommunityAuthor
}

export interface ReviewsResponse {
  reviews: CommunityReview[]
  average_rating: number | null
  rating_count: number
  review_count: number
}

export interface FeedParams {
  release_id?: string
  kind?: "discussion" | "editorial"
  author?: string
  q?: string
  limit?: number
  offset?: number
}

/** Whether the COMMUNITY flag is on — read from the client-safe flag endpoint. */
export async function isCommunityEnabled(): Promise<boolean> {
  const data = await medusaFetch<{ flags: Record<string, boolean> }>(
    "/store/platform-flags",
    { revalidate: 60 }
  )
  return !!data?.flags?.COMMUNITY
}

/** Hub feed — published posts, newest first (pinned on top). */
export async function fetchFeed(
  params: FeedParams = {}
): Promise<{ posts: CommunityPost[]; count: number }> {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") qs.set(k, String(v))
  }
  const data = await medusaFetch<{ posts: CommunityPost[]; count: number }>(
    `/store/community/posts?${qs.toString()}`,
    { revalidate: 30 }
  )
  return data ?? { posts: [], count: 0 }
}

/** Single post by id or slug. */
export async function fetchPost(idOrSlug: string): Promise<CommunityPost | null> {
  const data = await medusaFetch<{ post: CommunityPost }>(
    `/store/community/posts/${encodeURIComponent(idOrSlug)}`,
    { revalidate: 20 }
  )
  return data?.post ?? null
}

/** Comments for a post. */
export async function fetchComments(
  postIdOrSlug: string
): Promise<CommunityComment[]> {
  const data = await medusaFetch<{ comments: CommunityComment[] }>(
    `/store/community/posts/${encodeURIComponent(postIdOrSlug)}/comments`,
    { revalidate: 20 }
  )
  return data?.comments ?? []
}

/** Reviews for a release, with the aggregate average + counts. */
export async function fetchReviews(releaseId: string): Promise<ReviewsResponse> {
  const data = await medusaFetch<ReviewsResponse>(
    `/store/community/reviews?release_id=${encodeURIComponent(releaseId)}`,
    { revalidate: 20 }
  )
  return (
    data ?? {
      reviews: [],
      average_rating: null,
      rating_count: 0,
      review_count: 0,
    }
  )
}

/** Public member profile by handle, with recent posts + stats. */
export async function fetchProfile(handle: string): Promise<{
  profile: CommunityProfile
  stats: { posts: number; comments: number; reviews: number }
  posts: CommunityPost[]
} | null> {
  return medusaFetch(
    `/store/community/profiles/${encodeURIComponent(handle)}`,
    { revalidate: 30 }
  )
}
