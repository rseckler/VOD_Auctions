import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { fetchPost, fetchComments } from "@/lib/community-api"
import {
  MemberAvatar,
  TierLabel,
  Tag,
  ReleaseCardInline,
} from "@/components/community/CommunityUI"
import { ReactionsBar } from "@/components/community/ReactionsBar"
import { CommentSection } from "@/components/community/CommentSection"

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
      : "Beitrag — VOD Community",
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

  const comments = await fetchComments(post.id)
  const isEditorial = post.kind === "editorial"
  const dateLabel = new Date(post.published_at || post.created_at).toLocaleDateString(
    "de-DE",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" }
  )

  return (
    <div
      className="cm-container-narrow"
      style={{ paddingTop: 32, paddingBottom: 64 }}
    >
      <article className="cm-post-detail">
        {isEditorial && (
          <div className="cm-post-detail-eyebrow">
            <span style={{ color: "var(--primary)" }}>From the Vault</span>
          </div>
        )}
        <h1 className="cm-post-detail-title">{post.title || "Ohne Titel"}</h1>

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
              <div className="cm-comment-name">{post.author.display_name}</div>
              <TierLabel tier={post.author.tier} />
            </div>
          </Link>
          <span className="cm-author-strip-divider" />
          <span className="cm-author-strip-meta">
            <span>{dateLabel}</span>
          </span>
        </div>

        {post.cover_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.cover_image_url}
            alt=""
            className="cm-post-detail-cover"
          />
        )}

        <div
          className="cm-prose"
          dangerouslySetInnerHTML={{ __html: post.body_html || "" }}
        />

        {post.release && (
          <div style={{ marginTop: 20 }}>
            <ReleaseCardInline release={post.release} />
          </div>
        )}

        {post.tags.length > 0 && (
          <div className="cm-post-tags" style={{ marginTop: 16 }}>
            {post.tags.map((t) => (
              <Tag key={t} name={t} />
            ))}
          </div>
        )}

        <ReactionsBar
          targetKind="post"
          targetId={post.id}
          initialCount={post.reaction_count}
        />

        <CommentSection
          postSlug={post.slug || post.id}
          initialComments={comments}
        />
      </article>
    </div>
  )
}
