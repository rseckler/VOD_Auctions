"use client"

import { useState } from "react"
import Link from "next/link"
import { useAuth } from "@/components/AuthProvider"
import { addComment, CommunityError } from "@/lib/community-mutations"
import type { CommunityComment } from "@/lib/community-api"
import { MemberAvatar, TierLabel, timeAgo } from "./CommunityUI"

// Plain textarea text → safe minimal HTML (backend sanitises again).
function textToHtml(text: string): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
  return text
    .trim()
    .split(/\n{2,}/)
    .map((para) => `<p>${esc(para).replace(/\n/g, "<br>")}</p>`)
    .join("")
}

function CommentRow({
  comment,
  onReply,
  isReply,
}: {
  comment: CommunityComment
  onReply?: (c: CommunityComment) => void
  isReply?: boolean
}) {
  return (
    <div
      className={
        "cm-comment" +
        (isReply ? " is-reply" : "") +
        (comment.author.tier === "curator" ? " is-curator" : "")
      }
    >
      <Link href={`/community/members/${comment.author.handle}`} prefetch={false}>
        <MemberAvatar
          name={comment.author.display_name}
          tier={comment.author.tier}
          avatarUrl={comment.author.avatar_url}
          size={isReply ? 32 : 40}
        />
      </Link>
      <div className="cm-comment-body">
        <div className="cm-comment-head">
          <Link
            href={`/community/members/${comment.author.handle}`}
            className="cm-comment-name"
            prefetch={false}
          >
            {comment.author.display_name}
          </Link>
          <TierLabel tier={comment.author.tier} />
          <span className="cm-comment-time">· {timeAgo(comment.created_at)}</span>
        </div>
        <div
          className="cm-comment-text"
          dangerouslySetInnerHTML={{ __html: comment.body_html }}
        />
        {!isReply && onReply && (
          <div className="cm-comment-actions">
            <button
              type="button"
              className="cm-comment-action"
              onClick={() => onReply(comment)}
            >
              Reply
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function CommentSection({
  postSlug,
  initialComments,
}: {
  postSlug: string
  initialComments: CommunityComment[]
}) {
  const { isAuthenticated } = useAuth()
  const [comments, setComments] = useState<CommunityComment[]>(initialComments)
  const [text, setText] = useState("")
  const [replyTo, setReplyTo] = useState<CommunityComment | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const topLevel = comments.filter((c) => !c.parent_id)
  const repliesOf = (id: string) => comments.filter((c) => c.parent_id === id)

  async function submit() {
    const body = text.trim()
    if (!body || busy) return
    setBusy(true)
    setError(null)
    try {
      const created = await addComment(postSlug, {
        body_html: textToHtml(body),
        parent_id: replyTo?.id,
      })
      setComments((prev) => [...prev, created])
      setText("")
      setReplyTo(null)
    } catch (e) {
      setError(
        e instanceof CommunityError
          ? e.message
          : "Something went wrong — please try again."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <div className="cm-comments-head">
        <div className="cm-comments-head-title">
          {comments.length} {comments.length === 1 ? "Comment" : "Comments"}
        </div>
      </div>

      {isAuthenticated ? (
        <div className="cm-composer">
          <div style={{ flex: 1 }}>
            {replyTo && (
              <div className="cm-composer-replyctx">
                Replying to {replyTo.author.display_name}
                <button type="button" onClick={() => setReplyTo(null)}>
                  ✕
                </button>
              </div>
            )}
            <textarea
              className="cm-composer-input"
              placeholder="Share your thoughts…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="cm-composer-actions">
              {error && <span className="cm-composer-error">{error}</span>}
              <button
                type="button"
                className="cm-btn cm-btn-primary cm-btn-sm"
                onClick={submit}
                disabled={busy || !text.trim()}
                style={{ marginLeft: "auto" }}
              >
                {busy ? "Sending…" : "Post Comment"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="cm-empty" style={{ marginBottom: 24 }}>
          <Link href="/account" className="cm-link-gold">
            Sign in
          </Link>{" "}
          to join the discussion.
        </div>
      )}

      <div className="cm-comment-list">
        {topLevel.map((c) => (
          <div key={c.id}>
            <CommentRow comment={c} onReply={isAuthenticated ? setReplyTo : undefined} />
            {repliesOf(c.id).map((r) => (
              <CommentRow key={r.id} comment={r} isReply />
            ))}
          </div>
        ))}
        {comments.length === 0 && (
          <div className="cm-empty">No comments yet.</div>
        )}
      </div>
    </section>
  )
}
