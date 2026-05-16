"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"
import type { MembersResponse, MemberListItem } from "@/lib/community-api"
import { MemberAvatar, TierLabel } from "./CommunityUI"
import { FollowButton } from "./FollowButton"

const TIER_PILLS: { key: string; label: string }[] = [
  { key: "", label: "All" },
  { key: "curator", label: "Curator" },
  { key: "platinum", label: "◆ Platinum" },
  { key: "gold", label: "★ Gold" },
  { key: "silver", label: "★ Silver" },
  { key: "bronze", label: "Bronze" },
]

const SORTS: { key: string; label: string }[] = [
  { key: "activity", label: "Most active" },
  { key: "joined", label: "Newest" },
  { key: "tier", label: "By tier" },
]

function MemberCard({ m }: { m: MemberListItem }) {
  return (
    <div className="cm-member-card">
      <div className="cm-member-card-head">
        <Link href={`/community/members/${m.handle}`} prefetch={false}>
          <MemberAvatar
            name={m.display_name}
            tier={m.tier}
            avatarUrl={m.avatar_url}
            size={48}
          />
        </Link>
        <div className="cm-member-card-meta">
          <Link
            href={`/community/members/${m.handle}`}
            className="cm-member-card-name"
            prefetch={false}
          >
            {m.display_name}
          </Link>
          <div className="cm-member-card-handle">
            <TierLabel tier={m.tier} />
            {m.location && <span> · {m.location}</span>}
          </div>
        </div>
        {!m.is_curator && (
          <FollowButton handle={m.handle} initialFollowing={false} small />
        )}
      </div>
      {m.bio && <div className="cm-member-card-bio">{m.bio}</div>}
      <div className="cm-member-card-stats">
        <span>
          <strong>{m.post_count}</strong> posts
        </span>
        <span>
          <strong>{m.follower_count}</strong> followers
        </span>
        {m.collector_since && <span>since {m.collector_since}</span>}
      </div>
    </div>
  )
}

export function MembersBrowser({ initial }: { initial: MembersResponse }) {
  const [tier, setTier] = useState("")
  const [sort, setSort] = useState("activity")
  const [q, setQ] = useState("")
  const [data, setData] = useState<MembersResponse>(initial)
  const [busy, setBusy] = useState(false)
  const firstRender = useRef(true)

  useEffect(() => {
    // Skip the fetch on mount — the server already provided `initial`.
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const t = setTimeout(async () => {
      setBusy(true)
      try {
        const qs = new URLSearchParams({ sort, limit: "48" })
        if (tier) qs.set("tier", tier)
        if (q.trim()) qs.set("q", q.trim())
        const res = await fetch(
          `${MEDUSA_URL}/store/community/members?${qs.toString()}`,
          { headers: { "x-publishable-api-key": PUBLISHABLE_KEY } }
        )
        const d = await res.json()
        setData(d)
      } catch {
        /* keep previous results */
      } finally {
        setBusy(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [tier, sort, q])

  const counts = data.tier_counts || {}

  return (
    <div className="cm-container" style={{ paddingBottom: 80 }}>
      <div className="cm-page-head">
        <h1>Members</h1>
        <p>
          {counts.all ?? data.members.length} collectors of industrial,
          power-electronics and tape-underground music.
        </p>
      </div>

      <div className="cm-members-toolbar">
        {TIER_PILLS.filter(
          (p) => p.key === "" || (counts[p.key] || 0) > 0
        ).map((p) => (
          <button
            key={p.key || "all"}
            type="button"
            className={"cm-members-filter" + (tier === p.key ? " is-active" : "")}
            onClick={() => setTier(p.key)}
          >
            {p.label}
            <span className="count">{counts[p.key || "all"] ?? 0}</span>
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <input
          className="cm-members-search"
          placeholder="Search members…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
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
      </div>

      {data.members.length === 0 ? (
        <div className="cm-empty">
          {busy ? "Searching…" : "No members match this filter."}
        </div>
      ) : (
        <div
          className="cm-members-grid"
          style={busy ? { opacity: 0.55, transition: "opacity .15s" } : undefined}
        >
          {data.members.map((m) => (
            <MemberCard key={m.handle} m={m} />
          ))}
        </div>
      )}
    </div>
  )
}
