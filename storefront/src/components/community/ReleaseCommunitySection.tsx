import Link from "next/link"
import { fetchFeed, fetchReviews } from "@/lib/community-api"
import type { CommunityReview } from "@/lib/community-api"
import { PostCard, MemberAvatar, TierLabel, timeAgo } from "./CommunityUI"
import { RatingStars } from "./RatingStars"
import { ReviewComposer } from "./ReviewComposer"

function ReviewCard({ review }: { review: CommunityReview }) {
  return (
    <div className="cm-review-card">
      <div className="cm-review-head">
        <MemberAvatar
          name={review.author.display_name}
          tier={review.author.tier}
          avatarUrl={review.author.avatar_url}
          size={40}
        />
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
            <span className="cm-comment-time">· {timeAgo(review.created_at)}</span>
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

// Catalog-anchored community block — rendered on the release detail page.
// Discussion (release-anchored posts) + Reviews (1–5 stars + text).
export async function ReleaseCommunitySection({
  releaseId,
}: {
  releaseId: string
}) {
  const [feed, reviews] = await Promise.all([
    fetchFeed({ release_id: releaseId, limit: 20 }),
    fetchReviews(releaseId),
  ])

  return (
    <section className="cm-release-community">
      <h2 className="cm-section-title">Community</h2>

      <div className="cm-community-block">
        <div className="cm-community-block-head">
          <h3>Reviews</h3>
          {reviews.average_rating != null && (
            <span className="cm-rating-summary">
              <RatingStars value={reviews.average_rating} />
              <strong>{reviews.average_rating.toFixed(1)}</strong>
              <span>
                · {reviews.rating_count}{" "}
                {reviews.rating_count === 1 ? "rating" : "ratings"}
              </span>
            </span>
          )}
        </div>
        <ReviewComposer releaseId={releaseId} />
        <div className="cm-review-list">
          {reviews.reviews.length === 0 ? (
            <div className="cm-empty">No reviews yet — be the first.</div>
          ) : (
            reviews.reviews.map((r) => <ReviewCard key={r.id} review={r} />)
          )}
        </div>
      </div>

      <div className="cm-community-block">
        <div className="cm-community-block-head">
          <h3>Discussion</h3>
          <Link
            href={`/community/compose?release_id=${encodeURIComponent(releaseId)}`}
            className="cm-btn cm-btn-outline cm-btn-sm"
          >
            Write a post
          </Link>
        </div>
        {feed.posts.length === 0 ? (
          <div className="cm-empty">
            No discussion about this release yet.
          </div>
        ) : (
          <div className="cm-feed">
            {feed.posts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
