import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { fetchPost, fetchComments, fetchFeed } from "@/lib/community-api"
import {
  MemberAvatar,
  TierLabel,
  TagLink,
  readingTime,
} from "@/components/community/CommunityUI"
import {
  FromCatalogWidget,
  MoreFromAuthorWidget,
  TagsWidget,
} from "@/components/community/CommunityWidgets"
import { ReactionsBar } from "@/components/community/ReactionsBar"
import { CommentSection } from "@/components/community/CommentSection"
import { ReportButton } from "@/components/community/ReportButton"
import { FollowButton } from "@/components/community/FollowButton"
import { SaveButton } from "@/components/community/SaveButton"
import { EditPostLink } from "@/components/community/EditPostLink"

type Params = { slug: string }

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  const post = await fetchPost(slug)
  return {
    title: post?.title
      ? `${post.title} — VOD Community`
      : "Post — VOD Community",
  }
}

export default async function CommunityPostPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug } = await params
  const post = await fetchPost(slug)
  if (!post) notFound()

  const [comments, more] = await Promise.all([
    fetchComments(post.id),
    fetchFeed({ author: post.author.handle, limit: 5 }),
  ])
  const moreFromAuthor = more.posts
    .filter((p) => p.id !== post.id)
    .slice(0, 4)

  const isEditorial = post.kind === "editorial"
  const dateLabel = new Date(
    post.published_at || post.created_at
  ).toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
  const mins = readingTime(post.body_html)

  return (
    <div
      className="cm-container-narrow"
      style={{ paddingTop: 32, paddingBottom: 72 }}
    >
      <div className="cm-post-layout">
        <article className="cm-post-detail">
          <div className="cm-post-detail-eyebrow">
            {isEditorial ? (
              <>
                <span style={{ color: "var(--primary)" }}>Dispatch</span>
                <span>·</span>
                <span>From the Vault</span>
              </>
            ) : (
              <span style={{ color: "var(--primary)" }}>Discussion</span>
            )}
          </div>

          <h1 className="cm-post-detail-title">{post.title || "Untitled"}</h1>

          <div className="cm-author-strip">
            <Link
              href={`/community/members/${post.author.handle}`}
              prefetch={false}
              style={{ display: "flex", alignItems: "center", gap: 12 }}
            >
              <MemberAvatar
                name={post.author.display_name}
                tier={post.author.tier}
                avatarUrl={post.author.avatar_url}
                size={48}
              />
              <div>
                <div className="cm-comment-name">
                  {post.author.display_name}
                </div>
                <TierLabel tier={post.author.tier} />
              </div>
            </Link>
            <span className="cm-author-strip-divider" />
            <span className="cm-author-strip-meta">
              <span>{dateLabel}</span>
              <span>·</span>
              <span>{mins} min read</span>
            </span>
            <div style={{ marginLeft: "auto" }}>
              <FollowButton
                handle={post.author.handle}
                initialFollowing={false}
                small
              />
            </div>
          </div>

          {post.cover_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.cover_image_url}
              alt=""
              className="cm-post-detail-cover"
            />
          ) : (
            <div className="cm-post-detail-cover cm-post-detail-cover-ph">
              <span className="cm-cover-art" aria-hidden="true" />
              <span className="cm-post-detail-cover-cap">
                {isEditorial ? "From the Archive" : "VOD Community"}
              </span>
            </div>
          )}

          <div
            className="cm-prose"
            dangerouslySetInnerHTML={{ __html: post.body_html || "" }}
          />

          {post.tags.length > 0 && (
            <div className="cm-post-tags" style={{ marginTop: 20 }}>
              {post.tags.map((t) => (
                <TagLink key={t} name={t} />
              ))}
            </div>
          )}

          <ReactionsBar
            targetKind="post"
            targetId={post.id}
            initialCount={post.reaction_count}
            initialBreakdown={post.reactions}
          />

          <div className="cm-post-report">
            <SaveButton postId={post.id} />
            <EditPostLink postId={post.id} authorHandle={post.author.handle} />
            <ReportButton targetKind="post" targetId={post.id} />
          </div>

          <CommentSection
            postSlug={post.slug || post.id}
            initialComments={comments}
          />
        </article>

        <aside className="cm-sidebar" style={{ paddingTop: 8 }}>
          {post.release && (
            <FromCatalogWidget title="Linked Release" items={[post.release]} />
          )}
          <MoreFromAuthorWidget
            authorName={post.author.display_name}
            authorHandle={post.author.handle}
            posts={moreFromAuthor}
          />
          <TagsWidget tags={post.tags} />
        </aside>
      </div>
    </div>
  )
}
