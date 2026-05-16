import Link from "next/link"
import { fetchFeed, fetchReviews } from "@/lib/community-api"
import { PostCard } from "./CommunityUI"
import { RatingStars } from "./RatingStars"
import { RatingHistogram } from "./RatingHistogram"
import { ReviewComposer } from "./ReviewComposer"
import { ReleaseReviews } from "./ReleaseReviews"

// Catalog-anchored community block on the release detail page — mockup
// screen 04: a stats strip, the rating histogram, a review composer, the
// sortable review list and the release's discussion thread.
export async function ReleaseCommunitySection({
  releaseId,
}: {
  releaseId: string
}) {
  const [feed, reviews] = await Promise.all([
    fetchFeed({ release_id: releaseId, limit: 20 }),
    fetchReviews(releaseId),
  ])

  const avg = reviews.average_rating
  const histogram =
    reviews.histogram || { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 }

  return (
    <section className="cm-release-community">
      <h2 className="cm-section-title">Community</h2>

      <div className="cm-stats-strip">
        <div className="cm-stats-strip-item">
          <div className="num">{reviews.review_count}</div>
          <div className="label">Reviews</div>
        </div>
        <div className="cm-stats-strip-rule" />
        <div className="cm-stats-strip-item">
          <div className="num">
            <span className="star">★</span> {avg != null ? avg.toFixed(1) : "—"}
          </div>
          <div className="label">Avg Rating</div>
        </div>
        <div className="cm-stats-strip-rule" />
        <div className="cm-stats-strip-item">
          <div className="num">{feed.count}</div>
          <div className="label">Discussions</div>
        </div>
      </div>

      {reviews.rating_count > 0 && (
        <div className="cm-rating-overview">
          <div className="cm-rating-overview-score">
            <div className="cm-rating-overview-num">
              {avg != null ? avg.toFixed(1) : "—"}
            </div>
            {avg != null && <RatingStars value={avg} size={15} />}
            <div className="cm-rating-overview-count">
              {reviews.rating_count}{" "}
              {reviews.rating_count === 1 ? "rating" : "ratings"}
            </div>
          </div>
          <RatingHistogram histogram={histogram} />
        </div>
      )}

      <ReviewComposer releaseId={releaseId} />

      <ReleaseReviews releaseId={releaseId} initial={reviews} />

      <div className="cm-page-eyebrow" style={{ marginTop: 40 }}>
        <span className="cm-page-eyebrow-text">
          {feed.count} {feed.count === 1 ? "Discussion" : "Discussions"}
        </span>
        <span className="cm-page-eyebrow-rule" />
        <Link
          href={`/community/compose?release_id=${encodeURIComponent(releaseId)}`}
          className="cm-page-eyebrow-link"
          prefetch={false}
        >
          Write a post →
        </Link>
      </div>

      {feed.posts.length === 0 ? (
        <div className="cm-empty">
          No discussion about this release yet — start the conversation.
        </div>
      ) : (
        <div className="cm-feed">
          {feed.posts.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      )}
    </section>
  )
}
