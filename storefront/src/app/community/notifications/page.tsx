"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useAuth } from "@/components/AuthProvider"
import {
  fetchNotifications,
  markNotificationsRead,
} from "@/lib/community-mutations"
import type { CommunityNotification } from "@/lib/community-api"
import { MemberAvatar, timeAgo } from "@/components/community/CommunityUI"

function notifText(n: CommunityNotification): string {
  const who = n.actor?.display_name || "Someone"
  switch (n.kind) {
    case "comment":
      return `${who} commented on your post`
    case "reply":
      return `${who} replied to your comment`
    case "follow":
      return `${who} started following you`
    case "mention":
      return `${who} mentioned you`
    case "editorial":
      return `${who} published a new editorial`
    default:
      return `${who} interacted with you`
  }
}

function notifHref(n: CommunityNotification): string {
  if (n.kind === "follow") {
    return n.target_slug ? `/community/members/${n.target_slug}` : "/community"
  }
  return n.target_slug ? `/community/post/${n.target_slug}` : "/community"
}

export default function CommunityNotificationsPage() {
  const { isAuthenticated, loading } = useAuth()
  const [items, setItems] = useState<CommunityNotification[] | null>(null)

  useEffect(() => {
    if (loading || !isAuthenticated) return
    fetchNotifications()
      .then((d) => {
        setItems(d.notifications)
        if (d.unread > 0) markNotificationsRead().catch(() => {})
      })
      .catch(() => setItems([]))
  }, [loading, isAuthenticated])

  if (loading) {
    return (
      <div className="cm-container-narrow" style={{ padding: "48px 0" }}>
        Loading…
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="cm-container-narrow" style={{ padding: "48px 0" }}>
        <div className="cm-empty">
          <Link href="/account" className="cm-link-gold">
            Sign in
          </Link>{" "}
          to see your notifications.
        </div>
      </div>
    )
  }

  return (
    <div
      className="cm-container-narrow"
      style={{ paddingTop: 32, paddingBottom: 64 }}
    >
      <h1 className="cm-hub-title" style={{ fontSize: 30, marginBottom: 20 }}>
        Notifications
      </h1>
      {items === null ? (
        <div className="cm-empty">Loading…</div>
      ) : items.length === 0 ? (
        <div className="cm-empty">No notifications yet.</div>
      ) : (
        <div className="cm-notif-list">
          {items.map((n) => (
            <Link
              key={n.id}
              href={notifHref(n)}
              prefetch={false}
              className={"cm-notif" + (n.is_read ? "" : " is-unread")}
            >
              {n.actor ? (
                <MemberAvatar
                  name={n.actor.display_name}
                  tier={n.actor.tier}
                  avatarUrl={n.actor.avatar_url}
                  size={40}
                />
              ) : (
                <div style={{ width: 40 }} />
              )}
              <div className="cm-notif-body">
                <div>{notifText(n)}</div>
                <div className="cm-notif-time">{timeAgo(n.created_at)}</div>
              </div>
              {!n.is_read && <span className="cm-notif-dot" />}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
