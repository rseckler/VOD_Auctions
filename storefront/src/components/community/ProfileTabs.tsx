"use client"

import { useState } from "react"
import Link from "next/link"
import type {
  CommunityPost,
  ProfileComment,
  ProfileReview,
} from "@/lib/community-api"
import {
  PostCard,
  EditorialCard,
  ReleaseCardInline,
  timeAgo,
} from "./CommunityUI"
import { RatingStars } from "./RatingStars"

type TabKey = "posts" | "comments" | "reviews"

// Tabbed content for the member profile — Posts / Comments / Reviews.
// Lists, Acquired and Wantlist tabs arrive with their rebuild phases.
export function ProfileTabs({
  posts,
  comments,
  reviews,
  counts,
}: {
  posts: CommunityPost[]
  comments: ProfileComment[]
  reviews: ProfileReview[]
  counts: { posts: number; comments: number; reviews: number }
}) {
  const [tab, setTab] = useState<TabKey>("posts")

  const tabs: { key: TabKey; label: string; n: number }[] = [
    { key: "posts", label: "Posts", n: counts.posts },
    { key: "comments", label: "Comments", n: counts.comments },
    { key: "reviews", label: "Reviews", n: counts.reviews },
  ]

  return (
    <>
      <div className="cm-profile-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={"cm-profile-tab" + (tab === t.key ? " is-active" : "")}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <span className="count">{t.n}</span>
          </button>
        ))}
      </div>

      <div style={{ padding: "8px 0 64px" }}>
        {tab === "posts" &&
          (posts.length === 0 ? (
            <div className="cm-empty">No posts yet.</div>
          ) : (
            <div className="cm-feed">
              {posts.map((p) =>
                p.kind === "editorial" ? (
                  <EditorialCard key={p.id} post={p} />
                ) : (
                  <PostCard key={p.id} post={p} />
                )
              )}
            </div>
          ))}

        {tab === "comments" &&
          (comments.length === 0 ? (
            <div className="cm-empty">No comments yet.</div>
          ) : (
            <div className="cm-feed">
              {comments.map((c) => (
                <Link
                  key={c.id}
                  href={`/community/post/${c.post.slug || ""}`}
                  prefetch={false}
                  className="cm-profile-comment"
                >
                  <div className="cm-profile-comment-ctx">
                    on <strong>{c.post.title || "a post"}</strong>
                    <span className="cm-profile-comment-time">
                      {timeAgo(c.created_at)}
                    </span>
                  </div>
                  <div
                    className="cm-comment-text"
                    dangerouslySetInnerHTML={{ __html: c.body_html }}
                  />
                </Link>
              ))}
            </div>
          ))}

        {tab === "reviews" &&
          (reviews.length === 0 ? (
            <div className="cm-empty">No reviews yet.</div>
          ) : (
            <div className="cm-feed">
              {reviews.map((r) => (
                <div key={r.id} className="cm-profile-review">
                  <div className="cm-profile-review-head">
                    {r.rating != null && <RatingStars value={r.rating} />}
                    {r.is_verified_acquired && (
                      <span className="cm-owned-pill">✓ Owned</span>
                    )}
                    <span className="cm-profile-comment-time">
                      {timeAgo(r.created_at)}
                    </span>
                  </div>
                  {r.body_html && (
                    <div
                      className="cm-post-body"
                      dangerouslySetInnerHTML={{ __html: r.body_html }}
                    />
                  )}
                  {r.release && <ReleaseCardInline release={r.release} />}
                </div>
              ))}
            </div>
          ))}
      </div>
    </>
  )
}
