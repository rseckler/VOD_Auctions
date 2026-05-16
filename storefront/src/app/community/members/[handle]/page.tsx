import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { fetchProfile } from "@/lib/community-api"
import {
  MemberAvatar,
  PostCard,
  EditorialCard,
} from "@/components/community/CommunityUI"
import { FollowButton } from "@/components/community/FollowButton"

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

  const { profile, stats, posts, is_following, is_self } = data
  const links = Object.entries(profile.links || {}).filter(([, v]) => !!v)

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
            tier={profile.tier}
            avatarUrl={profile.avatar_url}
            size={120}
          />
          <div className="cm-profile-id">
            <h1 className="cm-profile-name">{profile.display_name}</h1>
            <div className="cm-profile-handle">@{profile.handle}</div>
            <div className="cm-profile-tier">
              <span className="cm-profile-tier-text">
                {TIER_TEXT[profile.tier] || "Member"}
              </span>
            </div>
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
          {!is_self && (
            <div className="cm-profile-actions">
              <FollowButton
                handle={profile.handle}
                initialFollowing={is_following}
              />
            </div>
          )}
        </div>

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

        <div style={{ padding: "8px 0 64px" }}>
          {posts.length === 0 ? (
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
          )}
        </div>
      </div>
    </div>
  )
}
