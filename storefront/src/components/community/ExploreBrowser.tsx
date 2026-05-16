"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"
import type {
  TrendingTag,
  CommunityListCard,
  SuggestedMember,
  CommunitySearchResults,
} from "@/lib/community-api"
import { PostCard, EditorialCard, MemberAvatar, TierLabel, TagLink } from "./CommunityUI"
import { ListCard } from "./ListCard"

function MemberRow({
  m,
}: {
  m: { handle: string; display_name: string; avatar_url: string | null; tier: any; location: string | null }
}) {
  return (
    <Link
      href={`/community/members/${m.handle}`}
      prefetch={false}
      className="cm-suggested-row"
      style={{ textDecoration: "none" }}
    >
      <MemberAvatar
        name={m.display_name}
        tier={m.tier}
        avatarUrl={m.avatar_url}
        size={40}
      />
      <div className="cm-suggested-meta">
        <div className="cm-suggested-name">{m.display_name}</div>
        <div className="cm-suggested-sub">
          <TierLabel tier={m.tier} />
          {m.location && (
            <>
              <span style={{ opacity: 0.5 }}>·</span>
              <span>{m.location}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <div className="cm-page-eyebrow" style={{ margin: "0 0 16px" }}>
        <span className="cm-page-eyebrow-text">{title}</span>
        <span className="cm-page-eyebrow-rule" />
      </div>
      {children}
    </div>
  )
}

// Explore — search across the community, plus a discovery view (trending
// tags, popular lists, suggested members) when there is no query.
export function ExploreBrowser({
  tags,
  lists,
  members,
}: {
  tags: TrendingTag[]
  lists: CommunityListCard[]
  members: SuggestedMember[]
}) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<CommunitySearchResults | null>(null)
  const [busy, setBusy] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    if (q.trim().length < 2) {
      setResults(null)
      return
    }
    debounce.current = setTimeout(async () => {
      setBusy(true)
      try {
        const res = await fetch(
          `${MEDUSA_URL}/store/community/search?q=${encodeURIComponent(q.trim())}`,
          { headers: { "x-publishable-api-key": PUBLISHABLE_KEY } }
        )
        setResults(await res.json())
      } catch {
        setResults(null)
      } finally {
        setBusy(false)
      }
    }, 250)
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [q])

  const searching = q.trim().length >= 2
  const hits =
    results &&
    results.posts.length + results.members.length + results.lists.length

  return (
    <div className="cm-container" style={{ paddingTop: 28, paddingBottom: 80 }}>
      <h1 className="cm-page-head-title">Explore</h1>
      <p className="cm-page-head-sub" style={{ marginBottom: 20 }}>
        Search the community, or browse what collectors are into.
      </p>

      <input
        className="cm-explore-search"
        placeholder="Search posts, members and lists…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />

      {searching ? (
        <div style={{ marginTop: 28 }}>
          {busy && !results ? (
            <div className="cm-empty">Searching…</div>
          ) : hits === 0 ? (
            <div className="cm-empty">No results for “{q.trim()}”.</div>
          ) : (
            <>
              {results!.posts.length > 0 && (
                <Section title={`Posts (${results!.posts.length})`}>
                  <div className="cm-feed">
                    {results!.posts.map((p) =>
                      p.kind === "editorial" ? (
                        <EditorialCard key={p.id} post={p} />
                      ) : (
                        <PostCard key={p.id} post={p} />
                      )
                    )}
                  </div>
                </Section>
              )}
              {results!.members.length > 0 && (
                <Section title={`Members (${results!.members.length})`}>
                  <div className="cm-suggested">
                    {results!.members.map((m) => (
                      <MemberRow key={m.handle} m={m} />
                    ))}
                  </div>
                </Section>
              )}
              {results!.lists.length > 0 && (
                <Section title={`Lists (${results!.lists.length})`}>
                  <div className="cm-list-results">
                    {results!.lists.map((l) => (
                      <Link
                        key={l.id}
                        href={`/community/lists/${l.slug || l.id}`}
                        prefetch={false}
                        className="cm-list-result"
                      >
                        <span className="cm-list-result-title">{l.title}</span>
                        <span className="cm-list-result-meta">
                          {l.item_count} releases · {l.author_name}
                        </span>
                      </Link>
                    ))}
                  </div>
                </Section>
              )}
            </>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 32 }}>
          {tags.length > 0 && (
            <Section title="Trending tags">
              <div className="cm-post-tags" style={{ marginTop: 0 }}>
                {tags.map((t) => (
                  <TagLink key={t.tag} name={t.tag} count={t.count} />
                ))}
              </div>
            </Section>
          )}
          {lists.length > 0 && (
            <Section title="Popular lists">
              <div className="cm-list-grid">
                {lists.map((l) => (
                  <ListCard key={l.id} list={l} />
                ))}
              </div>
            </Section>
          )}
          {members.length > 0 && (
            <Section title="Members to follow">
              <div className="cm-suggested">
                {members.map((m) => (
                  <MemberRow key={m.handle} m={m} />
                ))}
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  )
}
