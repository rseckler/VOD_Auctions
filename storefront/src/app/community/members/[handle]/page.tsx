import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { fetchProfile } from "@/lib/community-api"
import { MemberAvatar, ReleaseCardInline } from "@/components/community/CommunityUI"
import { FollowButton } from "@/components/community/FollowButton"
import { ProfileTabs } from "@/components/community/ProfileTabs"

type Params = { handle: string }

const TIER_TEXT: Record<string, string> = {
  curator: "🎙 VOD Curator",
  platinum: "◆ Platinum Member",
  gold: "★ Gold Member",
  silver: "★ Silver Member",
  bronze: "Bronze Member",
  standard: "Member",
}

const LINK_LABELS: Record<string, string> = {
  bandcamp: "Bandcamp",
  discogs: "Discogs",
  soundcloud: "SoundCloud",
  website: "Website",
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { handle } = await params
  const data = await fetchProfile(handle)
  return {
    title: data
      ? `${data.profile.display_name} — VOD Community`
      : "Member — VOD Community",
  }
}

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<Params>
}) {
  const { handle } = await params
  const data = await fetchProfile(handle)
  if (!data) notFound()

  const { profile, stats, posts, comments, reviews, is_following, is_self } =
    data
  const featured = data.featured || []
  const links = Object.entries(profile.links || {}).filter(([, v]) => !!v)
  // Privacy: the member can hide their collector tier (Concept §6.5).
  const showTier = profile.show_tier !== false
  const shownTier = showTier ? profile.tier : "standard"

  return (
    <div>
      <div
        className={
          "cm-profile-banner" + (profile.is_curator ? " is-curator" : "")
        }
        style={
          profile.header_url
            ? {
                backgroundImage: `url(${profile.header_url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      />
      <div className="cm-container">
        <div className="cm-profile-card">
          <MemberAvatar
            name={profile.display_name}
            tier={shownTier}
            avatarUrl={profile.avatar_url}
            size={120}
          />
          <div className="cm-profile-id">
            <h1 className="cm-profile-name">{profile.display_name}</h1>
            <div className="cm-profile-handle">@{profile.handle}</div>
            {(showTier || profile.is_curator) && (
              <div className="cm-profile-tier">
                <span className="cm-profile-tier-text">
                  {TIER_TEXT[profile.tier] || "Member"}
                </span>
              </div>
            )}
            <div className="cm-profile-meta">
              {profile.location && <span>{profile.location}</span>}
              {profile.location && profile.collector_since && (
                <span className="sep" />
              )}
              {profile.collector_since && (
                <span>Collecting since {profile.collector_since}</span>
              )}
            </div>
            {profile.bio && <div className="cm-profile-bio">{profile.bio}</div>}
            {links.length > 0 && (
              <div className="cm-profile-links">
                {links.map(([k, v]) => (
                  <a
                    key={k}
                    href={v}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="cm-link-gold"
                  >
                    {LINK_LABELS[k] || k}
                  </a>
                ))}
              </div>
            )}
          </div>
          <div className="cm-profile-actions">
            {is_self ? (
              <Link
                href="/community/settings"
                className="cm-btn cm-btn-outline"
                prefetch={false}
              >
                Edit profile
              </Link>
            ) : (
              <FollowButton
                handle={profile.handle}
                initialFollowing={is_following}
              />
            )}
          </div>
        </div>

        {featured.length > 0 && (
          <div className="cm-profile-featured">
            <div className="cm-profile-featured-label">Featured releases</div>
            <div className="cm-profile-featured-grid">
              {featured.map((r) => (
                <ReleaseCardInline key={r.id} release={r} />
              ))}
            </div>
          </div>
        )}

        <div className="cm-stats-bar">
          <div className="cm-stat">
            <div className="cm-stat-num">{stats.posts}</div>
            <div className="cm-stat-label">Posts</div>
          </div>
          <div className="cm-stat">
            <div className="cm-stat-num">{stats.comments}</div>
            <div className="cm-stat-label">Comments</div>
          </div>
          <div className="cm-stat">
            <div className="cm-stat-num">{stats.reviews}</div>
            <div className="cm-stat-label">Reviews</div>
          </div>
          <div className="cm-stat">
            <div className="cm-stat-num">{stats.followers}</div>
            <div className="cm-stat-label">Followers</div>
          </div>
          <div className="cm-stat">
            <div className="cm-stat-num">{stats.following}</div>
            <div className="cm-stat-label">Following</div>
          </div>
        </div>

        <ProfileTabs
          handle={profile.handle}
          showAcquired={profile.show_acquired_feed}
          posts={posts}
          comments={comments}
          reviews={reviews}
          counts={{
            posts: stats.posts,
            comments: stats.comments,
            reviews: stats.reviews,
          }}
        />
      </div>
    </div>
  )
}
