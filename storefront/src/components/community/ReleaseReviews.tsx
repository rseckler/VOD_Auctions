"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"
import type { ReviewsResponse, CommunityReview } from "@/lib/community-api"
import { MemberAvatar, TierLabel, timeAgo } from "./CommunityUI"
import { RatingStars } from "./RatingStars"

function ReviewCard({ review }: { review: CommunityReview }) {
  return (
    <div className="cm-review-card">
      <div className="cm-review-head">
        <Link
          href={`/community/members/${review.author.handle}`}
          prefetch={false}
        >
          <MemberAvatar
            name={review.author.display_name}
            tier={review.author.tier}
            avatarUrl={review.author.avatar_url}
            size={40}
          />
        </Link>
        <div className="cm-review-meta">
          <div className="cm-review-author">
            <Link
              href={`/community/members/${review.author.handle}`}
              className="cm-comment-name"
              prefetch={false}
            >
              {review.author.display_name}
            </Link>
            <TierLabel tier={review.author.tier} />
            {review.is_verified_acquired && (
              <span className="cm-owned-pill">✓ Owned</span>
            )}
          </div>
          <div className="cm-review-sub">
            {review.rating != null && (
              <RatingStars value={review.rating} size={13} />
            )}
            <span className="cm-comment-time">
              · {timeAgo(review.created_at)}
            </span>
          </div>
        </div>
      </div>
      {review.body_html && (
        <div
          className="cm-review-body"
          dangerouslySetInnerHTML={{ __html: review.body_html }}
        />
      )}
    </div>
  )
}

const SORTS: { key: string; label: string }[] = [
  { key: "recent", label: "Most recent" },
  { key: "top", label: "Highest rated" },
  { key: "verified", label: "Verified owners" },
]

// Sortable review list for a release. Server provides the initial (recent)
// set; changing the sort refetches client-side.
export function ReleaseReviews({
  releaseId,
  initial,
}: {
  releaseId: string
  initial: ReviewsResponse
}) {
  const [sort, setSort] = useState("recent")
  const [reviews, setReviews] = useState<CommunityReview[]>(initial.reviews)
  const [busy, setBusy] = useState(false)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    let cancelled = false
    setBusy(true)
    fetch(
      `${MEDUSA_URL}/store/community/reviews?release_id=${encodeURIComponent(
        releaseId
      )}&sort=${sort}`,
      { headers: { "x-publishable-api-key": PUBLISHABLE_KEY } }
    )
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setReviews(d?.reviews || [])
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [sort, releaseId])

  return (
    <>
      <div className="cm-page-eyebrow">
        <span className="cm-page-eyebrow-text">
          {initial.review_count}{" "}
          {initial.review_count === 1 ? "Review" : "Reviews"}
        </span>
        <span className="cm-page-eyebrow-rule" />
        {reviews.length > 0 && (
          <select
            className="cm-members-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </div>
      {reviews.length === 0 ? (
        <div className="cm-empty">No reviews yet — be the first.</div>
      ) : (
        <div
          className="cm-review-list"
          style={busy ? { opacity: 0.55 } : undefined}
        >
          {reviews.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </div>
      )}
    </>
  )
}
